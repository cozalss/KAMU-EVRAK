"""Adversarial doğrulama turunda BULUNAN açıkların regresyon testleri (8 Ağu 2026).

Üç bağımsız şüpheci ajan, demo koruma katmanının üç iddiasını da ÇÜRÜTTÜ. Bu dosya
her bulgunun kapatıldığını kanıtlar; testler geri gelirse açık da geri gelmiş demektir.

Bulgular:
  P1 chunked yükleme gövde kapısını tamamen atlıyordu (ölçüldü: 1,2 MiB → 200 + gerçek
     temp dosya; 25 MiB → tepe 22,9 MiB disk) — hem "diske bayt yazılmaz" garantisi hem
     boyut tavanı düşüyordu.
  P2 TTS ve Realtime uçları defterin DIŞINDAYDI (sınırsız harcama; "auth'lu" koruma
     değildi çünkü kayıt açık).
  P3 eşzamanlı istekler birbirinin uçuştaki harcamasını GÖRMÜYORDU → ölçülen en kötü
     hâl tavanın 4,7 katı.
  P4 db_persist_acik tolerant parse'ı `DB_PERSIST=true` kurulumunda kalıcılığı SESSİZCE
     açıyordu (regresyon).
  P5 başlık hash'lenince UI listelerinde "sha256:..." görünüyor ve dosya adıyla arama
     kırılıyordu (regresyon).
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.demo_butce as demo_butce
import core.demo_kota as demo_kota
import core.gun_indeksi as gi
import main
from core.butce_defteri import ButceDefteri, DefterAyari


@pytest.fixture(autouse=True)
def _izole(monkeypatch, tmp_path: Path):
    gi.sifirla_test_icin()
    monkeypatch.setattr(gi, "_simdi", lambda: 9000 * 86_400.0 + 1.0)
    monkeypatch.setattr(demo_butce, "DEFTER", ButceDefteri(DefterAyari(
        ad="adv-test", dosya=tmp_path / "demo.json",
        tavan_env="DEMO_AZAMI_GUNLUK_USD", gunluk=True,
    )))
    demo_kota.kotayi_sifirla()
    demo_butce._ISTEK.set(None)
    with demo_butce._CANLI_KILIT:
        demo_butce._CANLI.clear()
    monkeypatch.setenv("DEMO_KOTA_SECRET", "adv-anahtar")
    monkeypatch.delenv("DEMO_KORUMA", raising=False)
    monkeypatch.delenv("DEMO_AZAMI_GUNLUK_USD", raising=False)
    yield
    demo_butce._ISTEK.set(None)
    with demo_butce._CANLI_KILIT:
        demo_butce._CANLI.clear()
    demo_kota.kotayi_sifirla()
    gi.sifirla_test_icin()


class TestP1ChunkedBypass:
    """Content-Length'siz istek gövde kapısını atlayamaz."""

    def test_chunked_POST_411_alir(self):
        # Arrange — httpx generator gövdesi = Transfer-Encoding: chunked (CL yok)
        c = TestClient(main.app)

        def parcali():
            yield b"x" * 1024
            yield b"y" * 1024

        # Act
        y = c.post("/process_doc/stream", content=parcali())
        # Assert — 411, yani Starlette gövdeyi HİÇ parse etmedi ve diske yazmadı
        assert y.status_code == 411
        assert "Content-Length" in y.json()["detail"]

    def test_GET_411_ALMAZ(self):
        """Gövdesiz metotlar etkilenmemeli (CORS preflight/GET kırılmasın)."""
        c = TestClient(main.app)
        assert c.get("/health").status_code == 200
        assert c.options("/health").status_code in (200, 405)

    def test_normal_POST_etkilenmez(self):
        c = TestClient(main.app)
        # httpx json= gövdesi Content-Length üretir → kapıdan geçer
        assert c.post("/process_doc", json={}).status_code == 422


class TestP3EszamanliTavan:
    """N eşzamanlı istek toplamda tavanı aşamaz."""

    def test_ucustaki_harcama_KURESEL_gorunur(self, monkeypatch):
        # Arrange — iki ayrı istek sayacı, ikisi de canlı
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")
        a = demo_butce.istek_ac(0.01)
        b = demo_butce.istek_ac(0.01)
        assert a is not None and b is not None
        # Act — A çok harcadı, B hiç
        a.ekle(1.00)
        # Assert — B'nin bağlamından bakıldığında da kapı KAPALI olmalı
        token = demo_butce.istek_baglami_kur(b)
        try:
            assert demo_butce.acik_mi_istek() is False
        finally:
            demo_butce.istek_baglami_coz(token)

    def test_kapatilan_istek_kumeden_DUSER(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")
        s = demo_butce.istek_ac(0.01)
        s.ekle(1.00)
        assert demo_butce.acik_mi_istek() is False
        # Act
        demo_butce.istek_kapat(s)
        # Assert — sızan sayaç demoyu süreç ömrü boyunca kapatırdı
        with demo_butce._CANLI_KILIT:
            assert s not in demo_butce._CANLI

    def test_ESZAMANLI_toplam_harcama_tavani_asmaz(self, monkeypatch):
        """Ölçülen açığın birebir senaryosu: N istek, her biri tavanı yemeye çalışıyor."""
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")
        engellenen = []
        kilit = threading.Lock()

        def istek(_i):
            s = demo_butce.istek_ac(0.03)
            if s is None:
                return
            token = demo_butce.istek_baglami_kur(s)
            try:
                # Her istek 0.10 USD'lik çağrılar yapmaya çalışır
                for _ in range(10):
                    try:
                        demo_butce.butce_kapisi("deepseek-v4-flash")
                    except demo_butce.ButceTukendiError:
                        with kilit:
                            engellenen.append(1)
                        break
                    s.ekle(0.10)
            finally:
                demo_butce.istek_baglami_coz(token)
                demo_butce.istek_kapat(s)

        # Act — 9 eşzamanlı istek (ölçülen en kötü N)
        with ThreadPoolExecutor(max_workers=9) as ex:
            list(ex.map(istek, range(9)))

        # Assert — toplam harcama tavan + BİR çağrı payını aşmaz.
        # (Tek çağrının bedeli ancak yapıldıktan sonra bilinir; kapı ondan öncesini korur.)
        toplam = demo_butce.gunluk_harcanan()
        assert toplam <= 0.50 + 0.10, f"tavan aşıldı: {toplam}"
        assert engellenen, "hiçbir istek engellenmedi — kapı çalışmıyor"


class TestP2SesliUclar:
    """TTS ölçülür, Realtime demo'da kapalıdır."""

    def test_ses_mutabakati_deftere_yazar(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")
        # Act — 4000 karakter (tts_kota'nın dakikalık üst sınırı)
        demo_butce.ses_mutabakati("gpt-4o-mini-tts", 4000)
        # Assert — karakter başına ücret deftere düştü
        assert demo_butce.gunluk_harcanan() > 0

    def test_koruma_kapaliyken_ses_yazmaz(self, monkeypatch):
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        demo_butce.ses_mutabakati("gpt-4o-mini-tts", 4000)
        assert demo_butce.gunluk_harcanan() == 0.0

    @pytest.mark.asyncio
    async def test_realtime_demo_modunda_KAPALI(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sahte-anahtar")
        from core import realtime_oturum
        # Act + Assert — ölçülemeyen harcama sınırlanamaz → uç kapalı
        with pytest.raises(RuntimeError, match="bu sürümde kapalı"):
            await realtime_oturum.efemer_anahtar("merhaba")


class TestP4P5Regresyon:
    """Adversarial turda bulunan İKİ regresyon geri gelmemeli."""

    def test_DB_PERSIST_tolerant_parse_YOK(self):
        """`DB_PERSIST=true` kalıcılığı AÇMAMALI — eski davranış `== "1"` idi.

        Kalıcılık artık demo modunda serbest (9 Ağu), ama PARSE katılığı korunuyor:
        veri yazmayı genişleten bir değişiklik yan etki olarak gelmemeli.
        """
        from core.demo_guard import db_persist_acik
        assert db_persist_acik({"DB_PERSIST": "1"}) is True
        for deger in ("true", "True", "yes", "on", "TRUE"):
            assert db_persist_acik({"DB_PERSIST": deger}) is False, deger

    def test_baslik_HASH_degil_MASKE(self):
        """UI başlığı gösterir ve başlıkta arama yapar — hash ikisini de kırardı."""
        from db.repositories.persist_run import _baslik_guvenli
        # Arrange + Act
        cikti = _baslik_guvenli("Ayse_Yilmaz_dilekce_12345678901.pdf")
        # Assert — okunabilir kaldı, TCKN gitti, hash DEĞİL
        assert not cikti.startswith("sha256:")
        assert "12345678901" not in cikti
        assert "dilekce" in cikti

    def test_ornek_dosya_adi_AYNEN_gecer(self):
        """frontend/lib/kuyrukDurumu.js kuyruk eşleşmesi bu ada dayanır."""
        from db.repositories.persist_run import _baslik_guvenli
        assert _baslik_guvenli("ornek-dilekce_001.txt") == "ornek-dilekce_001.txt"
        assert _baslik_guvenli("dilekce_001.txt") == "dilekce_001.txt"

    def test_SQL_ECHO_prod_da_KAPATILMAZ(self, monkeypatch):
        """Prod'daki mevcut hata ayıklama anahtarı demo bayrağıyla ilgisiz kalmalı."""
        from db.session import _sql_echo
        monkeypatch.setenv("SQL_ECHO", "1")
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        assert _sql_echo() is True          # operatörün anahtarı çalışmaya devam eder
        monkeypatch.setenv("DEMO_KORUMA", "1")
        assert _sql_echo() is False         # demoda zorla kapalı
