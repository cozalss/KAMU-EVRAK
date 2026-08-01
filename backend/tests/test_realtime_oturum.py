"""Realtime sesli mod sözleşmeleri.

En kritik iki iddia:
1. GERÇEK API anahtarı tarayıcıya ASLA gitmez — yalnız kısa ömürlü istemci anahtarı döner.
2. Model, mevzuat/kayıt sorularını kendi bilgisinden cevaplamaz; araç tanımı bunu emreder.
   (Ölçümde `realtime-mini` bilgi edinme süresini yanlış söylemişti — grounding bu yüzden
   modele değil, bizim pipeline'a bağlı.)
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import core.realtime_oturum as rt
import main
from api.middleware import ratelimit
from auth.deps import get_current_user


class _SahteKullanici:
    """Auth bağımlılığının yerine geçen minimum kullanıcı (DB'siz) — test_sohbet deseni."""

    id = "11111111-1111-1111-1111-111111111111"
    eposta = "test@kurum.gov.tr"
    ad_soyad = "Test Memur"
    rol = "memur"
    aktif = True


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def auth_client() -> TestClient:
    main.app.dependency_overrides[get_current_user] = lambda: _SahteKullanici()
    _eski = getattr(ratelimit._limiter, "enabled", None)
    if ratelimit._limiter is not None:
        ratelimit._limiter.enabled = False
    yield TestClient(main.app)
    if ratelimit._limiter is not None and _eski is not None:
        ratelimit._limiter.enabled = _eski
    main.app.dependency_overrides.pop(get_current_user, None)


class TestBayrak:
    def test_varsayilan_acik(self, monkeypatch):
        monkeypatch.delenv("SESLI_REALTIME", raising=False)
        assert rt.realtime_acik() is True

    def test_env_ile_kapatilabilir(self, monkeypatch):
        """WebRTC kurum güvenlik duvarına takılırsa tek ENV ile eski zincire dönülür."""
        monkeypatch.setenv("SESLI_REALTIME", "0")
        assert rt.realtime_acik() is False


class TestOturumYapilandirmasi:
    def test_araç_tanimi_kendi_bilgisinden_cevaplamayi_YASAKLAR(self):
        arac = rt.ARACLAR[0]
        assert arac["name"] == "kamu_evrak_sor"
        tarif = arac["description"].lower()
        assert "verme" in tarif          # "yasal süre ... VERME"
        assert "yasal süre" in tarif

    def test_yapilandirma_persona_ses_ve_araci_TASIR(self):
        cfg = rt.oturum_yapilandirmasi("PERSONA METNİ")
        assert cfg["type"] == "realtime"
        assert cfg["instructions"] == "PERSONA METNİ"
        assert cfg["tools"][0]["name"] == "kamu_evrak_sor"
        assert cfg["audio"]["output"]["voice"]
        # Konuşma bitişini model sezsin: tarayıcının sabit sessizlik eşiği hem yavaş hem
        # cümle ortasında kesiyordu.
        assert cfg["audio"]["input"]["turn_detection"]["type"] == "semantic_vad"

    def test_model_env_ile_degistirilebilir(self, monkeypatch):
        monkeypatch.setenv("SESLI_REALTIME_MODEL", "gpt-realtime-mini")
        assert rt.oturum_yapilandirmasi("x")["model"] == "gpt-realtime-mini"


class TestEfemerAnahtar:
    async def test_gercek_anahtar_YANITTA_DONMEZ(self, monkeypatch):
        """Sızıntı testi: dönen sözlükte gerçek anahtarın izi bile olmamalı."""
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-GERCEK-ANAHTAR-123")
        gonderilen = {}

        class _SahteYanit:
            status_code = 200
            text = ""

            @staticmethod
            def json():
                return {"value": "ek_kisa_omurlu", "session": {"gizli": "yapılandırma"}}

        class _SahteClient:
            def __init__(self, **kw):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, headers=None, json=None):
                gonderilen["url"] = url
                gonderilen["headers"] = headers
                gonderilen["json"] = json
                return _SahteYanit()

        monkeypatch.setattr(rt.httpx, "AsyncClient", _SahteClient)
        sonuc = await rt.efemer_anahtar("PERSONA")

        assert sonuc["anahtar"] == "ek_kisa_omurlu"
        assert "sk-GERCEK-ANAHTAR-123" not in str(sonuc)
        # Oturum yapılandırması da istemciye açılmaz (persona/araç sözleşmesi sunucuda kalır).
        assert "session" not in sonuc
        assert "gizli" not in str(sonuc)
        # Gerçek anahtar YALNIZ OpenAI'a giden başlıkta olmalı.
        assert gonderilen["headers"]["Authorization"] == "Bearer sk-GERCEK-ANAHTAR-123"
        assert gonderilen["json"]["session"]["instructions"] == "PERSONA"

    async def test_anahtar_yoksa_hata(self, monkeypatch):
        monkeypatch.delenv("OPENAI_TTS_API_KEY", raising=False)
        with pytest.raises(RuntimeError, match="OPENAI_TTS_API_KEY"):
            await rt.efemer_anahtar("x")


class TestUc:
    def test_kapaliyken_503(self, auth_client: TestClient, monkeypatch):
        monkeypatch.setenv("SESLI_REALTIME", "0")
        resp = auth_client.post("/sohbet/realtime/anahtar")
        assert resp.status_code == 503

    def test_kimliksiz_erisim_reddedilir(self, client: TestClient):
        """Anahtar üretimi para harcatır — auth zorunlu."""
        resp = client.post("/sohbet/realtime/anahtar")
        assert resp.status_code in (401, 403)

    def test_acikken_anahtar_doner(self, auth_client: TestClient, monkeypatch):
        from api.routes import sohbet as sohbet_mod

        async def _sahte(talimat, **kw):
            assert "Kamu Evrak" in talimat or talimat            # persona geçiliyor
            return {"anahtar": "ek_test", "model": "gpt-realtime-2.1", "omur_sn": 600}

        monkeypatch.setenv("SESLI_REALTIME", "1")
        monkeypatch.setattr(sohbet_mod, "efemer_anahtar", _sahte)
        resp = auth_client.post("/sohbet/realtime/anahtar")
        assert resp.status_code == 200
        assert resp.json()["anahtar"] == "ek_test"

class TestVeriUcu:
    """Realtime aracının çağırdığı uç — KOMPOZİSYON YOK, yalnız grounded veri."""

    def test_kayit_sorusunda_ham_veri_ve_uydurma_yasagi_doner(
        self, auth_client: TestClient, monkeypatch,
    ):
        from api.routes import sohbet as sohbet_mod

        async def _sahte_arac(session, owner_id, intent, parametreler):
            return [{"baslik": "Park dilekçesi", "evrak_no": "E-2026/001"}]

        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sahte_arac)
        resp = auth_client.post("/sohbet/veri", json={"soru": "gelen evrakları göster"})
        assert resp.status_code == 200
        veri = resp.json()
        assert veri["tur"] == "veri"
        assert veri["veri"][0]["evrak_no"] == "E-2026/001"
        # Uydurma yasağı VERİYLE BİRLİKTE gider (talimatın uzağında kalmasın).
        assert "UYDURMA" in veri["not"]

    def test_KAC_kelimesi_hukuki_soruyu_panele_dusurmez(self, auth_client: TestClient, monkeypatch):
        """Paylaşılan sınıflandırıcıda "kaç" panel desenindedir; "bilgi edinme başvurusu KAÇ
        günde cevaplanır" hukuki bir sorudur ama panel_ozet'e düşüp boşuna DB sorgulatıyordu
        (ölçüldü: ~2 sn israf + modele alakasız veri)."""
        from api.routes import sohbet as sohbet_mod

        cagri = 0

        async def _sayan(session, owner_id, intent, parametreler):
            nonlocal cagri
            cagri += 1
            return {"olmamali": True}

        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sayan)
        resp = auth_client.post(
            "/sohbet/veri", json={"soru": "Bilgi edinme başvurusu kaç günde cevaplanır?"})
        assert resp.status_code == 200
        assert cagri == 0                      # DB'ye HİÇ gidilmedi
        assert resp.json()["veri"] is None
        assert "GÜVENLE" in resp.json()["not"]  # uzmanlık talimatı verildi

    def test_gercek_panel_sorusu_HALA_DB_sorgular(self, auth_client: TestClient, monkeypatch):
        """Karşı-kanıt: düzeltme panel sorgusunu bozmamalı."""
        from api.routes import sohbet as sohbet_mod

        cagri = 0

        async def _sayan(session, owner_id, intent, parametreler):
            nonlocal cagri
            cagri += 1
            return {"toplam": 38}

        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sayan)
        resp = auth_client.post("/sohbet/veri", json={"soru": "Kaç evrak işledik?"})
        assert resp.status_code == 200
        assert cagri == 1
        assert resp.json()["veri"] == {"toplam": 38}

    def test_UZMANLIK_sorusunda_model_veri_yok_DEMEZ(self, auth_client: TestClient):
        """Canlı bulgu: 'bilgi edinme kaç gün?' veri döndürmez → model 'bilgi bulunamadı'
        diyordu. Oysa doğrulanmış cevap zaten oturum talimatında; talimat bunu söylemeli."""
        resp = auth_client.post("/sohbet/veri", json={"soru": "resmî yazıda kapanış nasıl yazılır"})
        assert resp.status_code == 200
        veri = resp.json()
        assert veri["veri"] is None                    # kayıt sorgusu değil
        assert "GÜVENLE" in veri["not"]
        assert "DEME" in veri["not"]                   # "veri yok deme" emri

    def test_KOMPOZISYON_YAPMAZ(self, auth_client: TestClient, monkeypatch):
        """Asıl iddia: bu uç LLM çağırmaz. İkinci kompozisyon ölçülen 4 saniyeydi."""
        from api.routes import sohbet as sohbet_mod

        cagri = 0

        async def _sayan(*a, **k):
            nonlocal cagri
            cagri += 1
            return "olmamalı"

        async def _sahte_arac(session, owner_id, intent, parametreler):
            return []

        monkeypatch.setattr(sohbet_mod, "llm_text", _sayan)
        monkeypatch.setattr(sohbet_mod, "llm_json", _sayan)
        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sahte_arac)
        resp = auth_client.post("/sohbet/veri", json={"soru": "kaç taslak var"})
        assert resp.status_code == 200
        assert cagri == 0

    def test_ekran_baglami_maskelenerek_tasinir(self, auth_client: TestClient):
        resp = auth_client.post("/sohbet/veri", json={
            "soru": "bu evrak ne", "ekran": {"gorunum": "Gelen evrak",
                                             "secili": {"ozet": "Başvuran 12345678901"}}})
        assert resp.status_code == 200
        veri = resp.json()
        ekran = veri["ekranda_gorunen"] or ""
        assert "12345678901" not in ekran      # KVKK: ham PII modele gitmez
        # Alan adı "ekranda_gorunen": kayıt verisiyle AYNI isimsiz torbaya girince model
        # ekrandaki sayaçla sorgu sonucunu çelişki sanıp cevap vermiyordu (canlı bulgu).
        assert "ekran" not in veri

    def test_aksiyon_niyeti_TAM_YOLA_devredilir(self, auth_client: TestClient, monkeypatch):
        """Geri alınamaz iş hız uğruna kısa devre edilmez — teyit akışı korunur."""
        from api.routes import sohbet as sohbet_mod

        async def _hedef(session, owner_id, q=""):
            return {"name": "İcra yazısı", "islem_id": "T1", "bant": "sari"}

        monkeypatch.setattr(sohbet_mod, "onay_hedefi_bul", _hedef)
        resp = auth_client.post("/sohbet/veri", json={"soru": "taslağı onayla"})
        assert resp.status_code == 200
        assert resp.json()["tur"] == "aksiyon"

    def test_kimliksiz_erisim_reddedilir(self, client: TestClient):
        assert client.post("/sohbet/veri", json={"soru": "x"}).status_code in (401, 403)

    def test_uretim_patlarsa_503(self, auth_client: TestClient, monkeypatch):
        """Frontend eski STT+TTS zincirine düşebilsin diye 500 değil 503."""
        from api.routes import sohbet as sohbet_mod

        async def _patlar(talimat, **kw):
            raise RuntimeError("ağ")

        monkeypatch.setenv("SESLI_REALTIME", "1")
        monkeypatch.setattr(sohbet_mod, "efemer_anahtar", _patlar)
        resp = auth_client.post("/sohbet/realtime/anahtar")
        assert resp.status_code == 503
