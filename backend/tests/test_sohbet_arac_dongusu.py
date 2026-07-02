"""Sohbet çok-adımlı araç döngüsü testleri (MADDE 13) — JSON araç-seçim protokolü.

Desen test_sohbet.py'den aynalanır: TestClient + dependency_overrides (auth/DB'siz),
LLM_MODE=mock (conftest) → gerçek LLM yolu kapalı; döngünün LLM'i sahte llm_json ile
sürülür (sohbet_araclar.llm_json monkeypatch). AAA deseni; Türkçe isimler.

Sözleşme:
  - config.SOHBET_ARAC_DONGUSU açık + protokole uyan LLM → en fazla config.SOHBET_MAX_TUR
    turluk araç döngüsü; sonuçlar kompozisyona girer.
  - Bilinmeyen araç adı → o çağrı atlanır, akış devam eder.
  - MAX_TUR aşımı → eldeki veriyle kompoze edilir.
  - Bayrak kapalı ya da mock/protokol-dışı LLM → mevcut tek-tur akış BİREBİR.
  - Kompozisyon mesajlarına sohbet geçmişi (son 6 mesaj) dahil edilir.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from agents import config
from api.routes import sohbet as sohbet_mod
from api.routes import sohbet_araclar
from auth.deps import get_current_user


class _SahteKullanici:
    """CurrentUser yerine geçen minimal nesne (yalnız .id kullanılır)."""

    id = "00000000-0000-0000-0000-000000000001"
    ad_soyad = "Ayşe Yılmaz"
    rol = "memur"
    aktif = True


@pytest.fixture
def auth_client() -> TestClient:
    """Auth bağımlılığı sahte kullanıcıyla değiştirilmiş istemci (DB'siz)."""
    main.app.dependency_overrides[get_current_user] = lambda: _SahteKullanici()
    yield TestClient(main.app)
    main.app.dependency_overrides.pop(get_current_user, None)


_KAYITLAR = [
    {"baslik": "Park aydınlatma dilekçesi", "evrak_no": "E-2026/001",
     "olusturuldu": "2026-07-01T10:00:00"},
]


def _sahte_dongu_llm(monkeypatch, cevaplar: list[dict | None]) -> list[str]:
    """sohbet_araclar.llm_json'u sıralı cevap veren sahteyle değiştir.

    cevaplar tükenince {"arac": None} (dur) döner. Dönen liste, LLM'e giden
    user içeriklerini biriktirir (transcript doğrulaması için).
    """
    kalan = list(cevaplar)
    kullanici_metinleri: list[str] = []

    async def _sahte(system: str, user: str, **kw):
        kullanici_metinleri.append(user)
        return kalan.pop(0) if kalan else {"arac": None}

    monkeypatch.setattr(sohbet_araclar, "llm_json", _sahte)
    return kullanici_metinleri


def _sahte_arac(monkeypatch) -> list[tuple[str, dict]]:
    """sohbet.araci_calistir'ı sahte kayıtlarla değiştir; (intent, parametreler) çağrı izi döner."""
    cagrilar: list[tuple[str, dict]] = []

    async def _arac(session, owner_id, intent, parametreler):
        cagrilar.append((intent, dict(parametreler)))
        return list(_KAYITLAR)

    monkeypatch.setattr(sohbet_mod, "araci_calistir", _arac)
    return cagrilar


# ---------------------------------------------------------------------------
# Araç döngüsü — 2 turlu senaryo / bilinmeyen araç / MAX_TUR aşımı
# ---------------------------------------------------------------------------
class TestAracDongusu:
    def test_iki_turlu_senaryo_araci_calistirir_ve_kompoze_eder(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — 1. tur araç ister, 2. tur "veri yeterli" der.
        _sahte_dongu_llm(monkeypatch, [
            {"arac": "gelen_evrak", "parametreler": {"limit": 3}},
            {"arac": None},
        ])
        cagrilar = _sahte_arac(monkeypatch)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — araç bir kez, temizlenmiş parametrelerle çağrıldı; yanıt kompoze edildi.
        assert resp.status_code == 200
        body = resp.json()
        assert [c[0] for c in cagrilar] == ["gelen_evrak"]
        assert cagrilar[0][1]["limit"] == 3  # LLM parametresi doğrulamadan geçti
        assert body["intent"] == "gelen_evrak"
        assert body["kayitlar"] and body["kayitlar"][0]["evrak_no"] == "E-2026/001"
        assert body["kayit_turu"] == "gelen"
        assert "Park aydınlatma dilekçesi" in body["yanit"]
        assert body["kaynak"] == "llm"  # döngü LLM'le döndü

    def test_arac_sonucu_sonraki_tura_transcript_olarak_girer(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange
        metinler = _sahte_dongu_llm(monkeypatch, [
            {"arac": "gelen_evrak", "parametreler": {}},
            {"arac": None},
        ])
        _sahte_arac(monkeypatch)
        # Act
        auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — 2. tur mesajında 1. turun araç sonucu görünür (tool mesajı eşleniği).
        assert len(metinler) == 2
        assert "gelen_evrak" in metinler[1]
        assert "Park aydınlatma dilekçesi" in metinler[1]

    def test_bilinmeyen_arac_atlanir_akis_devam_eder(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — 1. tur bilinmeyen araç, 2. tur geçerli araç, 3. tur dur.
        _sahte_dongu_llm(monkeypatch, [
            {"arac": "rm_rf", "parametreler": {"yol": "/"}},
            {"arac": "gelen_evrak", "parametreler": {}},
            {"arac": None},
        ])
        cagrilar = _sahte_arac(monkeypatch)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — bilinmeyen araç HİÇ çalıştırılmadı; geçerli araç çalıştı, yanıt geldi.
        assert resp.status_code == 200
        assert [c[0] for c in cagrilar] == ["gelen_evrak"]
        assert resp.json()["kayitlar"]

    def test_max_tur_asiminda_eldeki_veriyle_kompoze(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — LLM hiç durmuyor (her turda araç istiyor) → MAX_TUR sınırı devreye girer.
        async def _doymaz(system: str, user: str, **kw):
            return {"arac": "gelen_evrak", "parametreler": {}}

        monkeypatch.setattr(sohbet_araclar, "llm_json", _doymaz)
        cagrilar = _sahte_arac(monkeypatch)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — tam MAX_TUR kez araç koştu, sonra eldeki veriyle yanıt kompoze edildi.
        assert resp.status_code == 200
        assert len(cagrilar) == config.SOHBET_MAX_TUR
        body = resp.json()
        assert body["kayitlar"]
        assert "Park aydınlatma dilekçesi" in body["yanit"]

    def test_stream_dongu_sse_sozlesmesini_korur(self, auth_client: TestClient, monkeypatch):
        # Arrange — döngü stream ucunda da çalışır; meta/delta/done event şekli değişmez.
        _sahte_dongu_llm(monkeypatch, [
            {"arac": "gelen_evrak", "parametreler": {}},
            {"arac": None},
        ])
        _sahte_arac(monkeypatch)
        # Act
        resp = auth_client.post("/sohbet/stream", json={"mesaj": "son gelen evraklar"})
        # Assert
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        govde = resp.text
        assert '"event": "meta"' in govde
        assert '"event": "delta"' in govde
        assert '"event": "done"' in govde
        assert "E-2026/001" in govde  # kayıtlar meta'da taşınır


# ---------------------------------------------------------------------------
# Geçmiş — kompozisyon mesajlarına son mesajlar dahil edilir
# ---------------------------------------------------------------------------
class TestGecmisKompozisyon:
    def test_gecmis_kompozisyon_kullanici_mesajina_girer(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — kompozisyon LLM'ini yakala (mock'ta normalde None döner).
        yakalanan: dict = {}

        async def _sahte_llm_text(system: str, user: str, **kw):
            yakalanan["user"] = user
            return "Listelediğim 3 evrağın 1'i kırmızı bantta."

        monkeypatch.setattr(sohbet_mod, "llm_text", _sahte_llm_text)
        gecmis = [
            {"rol": "kullanici", "icerik": "son gelen evraklar"},
            {"rol": "asistan", "icerik": "3 evrak listeledim: Park, Bilgi edinme, Su kesintisi"},
        ]
        # Act — takip sorusu tek başına anlamsız; bağlam geçmişten gelmeli.
        resp = auth_client.post("/sohbet", json={
            "mesaj": "peki bunların hangileri kırmızı bantta?", "gecmis": gecmis})
        # Assert — geçmiş satırları LLM'e giden kullanıcı içeriğinde.
        assert resp.status_code == 200
        assert "3 evrak listeledim" in yakalanan["user"]
        assert "son gelen evraklar" in yakalanan["user"]
        assert "peki bunların hangileri" in yakalanan["user"]

    def test_gecmis_kirpma_disiplini_son_6_mesaj(self):
        # Arrange — 8 mesajlık geçmiş; yalnız son 6'sı metne girer, her biri kırpılır.
        from api.routes.sohbet import SohbetMesaj, _gecmis_metni

        gecmis = [SohbetMesaj(rol="kullanici", icerik=f"mesaj-{i} " + "x" * 500)
                  for i in range(8)]
        # Act
        metin = _gecmis_metni(gecmis)
        # Assert
        assert "mesaj-0" not in metin and "mesaj-1" not in metin
        assert "mesaj-2" in metin and "mesaj-7" in metin
        assert all(len(satir) <= 320 for satir in metin.splitlines())

    def test_dongu_llm_ine_gecmis_gider(self, auth_client: TestClient, monkeypatch):
        # Arrange — döngünün ilk tur mesajında da geçmiş bağlamı bulunur.
        metinler = _sahte_dongu_llm(monkeypatch, [{"arac": None}])
        _sahte_arac(monkeypatch)
        gecmis = [{"rol": "asistan", "icerik": "3 evrak listeledim"}]
        # Act
        auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar", "gecmis": gecmis})
        # Assert
        assert metinler and "3 evrak listeledim" in metinler[0]


# ---------------------------------------------------------------------------
# Fallback sözleşmesi — bayrak kapalı / mock LLM → eski tek-tur akış BİREBİR
# ---------------------------------------------------------------------------
class TestFallbackSozlesmesi:
    def test_bayrak_kapaliyken_dongu_hic_cagrilmaz(self, auth_client: TestClient, monkeypatch):
        # Arrange
        monkeypatch.setattr(config, "SOHBET_ARAC_DONGUSU", False)

        async def _patlar(system: str, user: str, **kw):  # çağrılmamalı
            raise AssertionError("bayrak kapalıyken döngü LLM'i çağrılmamalı")

        monkeypatch.setattr(sohbet_araclar, "llm_json", _patlar)
        cagrilar = _sahte_arac(monkeypatch)
        # Act — eski tek-tur akış: niyet (fallback) → araç → şablon yanıt.
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert
        assert resp.status_code == 200
        body = resp.json()
        assert [c[0] for c in cagrilar] == ["gelen_evrak"]
        assert body["intent"] == "gelen_evrak"
        assert body["kaynak"] == "fallback"
        assert body["kayit_turu"] == "gelen"
        assert "Park aydınlatma dilekçesi" in body["yanit"]

    def test_mock_llm_protokole_uymaz_eski_akis_calisir(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — bayrak açık (default) ama LLM mock: llm_json protokol-dışı JSON döndürür
        # ({"domain": ...}) → döngü None → eski tek-tur akış birebir.
        cagrilar = _sahte_arac(monkeypatch)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — test_sohbet.py'deki liste sözleşmesiyle aynı.
        assert resp.status_code == 200
        body = resp.json()
        assert [c[0] for c in cagrilar] == ["gelen_evrak"]
        assert body["intent"] == "gelen_evrak"
        assert body["kaynak"] == "fallback"
        assert body["kayitlar"][0]["evrak_no"] == "E-2026/001"

    def test_selamlama_donguyu_hic_tetiklemez(self, auth_client: TestClient, monkeypatch):
        # Arrange — veri gerektirmeyen intent döngüye girmez (gereksiz LLM turu yok).
        async def _patlar(system: str, user: str, **kw):
            raise AssertionError("selamlama için döngü çağrılmamalı")

        monkeypatch.setattr(sohbet_araclar, "llm_json", _patlar)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "merhaba"})
        # Assert
        assert resp.status_code == 200
        assert resp.json()["intent"] == "selamlama"

    def test_dongu_araci_hata_verirse_akis_dusmez(self, auth_client: TestClient, monkeypatch):
        # Arrange — 1. tur aracı patlıyor; döngü hatayı yutar, 2. tur durur → yanıt yine gelir.
        _sahte_dongu_llm(monkeypatch, [
            {"arac": "gelen_evrak", "parametreler": {}},
            {"arac": None},
        ])

        async def _bozuk_arac(session, owner_id, intent, parametreler):
            raise RuntimeError("DB koptu")

        monkeypatch.setattr(sohbet_mod, "araci_calistir", _bozuk_arac)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — 500 yok; sohbet ayakta.
        assert resp.status_code == 200
        assert resp.json()["yanit"]
