"""core/demo_guard.py — demo modu boot doğrulaması.

`dogrula` SAF fonksiyondur (düz sözlük alır) → ortam değişkeni kurcalamadan test edilir;
desen `agents/config._bayrak` ile aynı.

Asıl sözleşme: DEMO_KORUMA=1 + DB_PERSIST=1 birlikte verilirse süreç BAŞLAMAZ. Böylece
"yabancının belgesi veri tabanına yazılmaz" garantisi ters çevrilebilir bir varsayılana
değil, yapısal bir imkânsızlığa dayanır.
"""

from __future__ import annotations

from core import demo_guard as dg

# Demo modunda TÜM kapıları geçen taban konfigürasyon.
SAGLAM = {
    "DEMO_KORUMA": "1",
    "APP_ENV": "production",
    "CORS_ORIGINS": "https://demo.ornek.gov.tr",
    "AUTH_JWT_SECRET": "a" * 64,
    "DEMO_AZAMI_GUNLUK_USD": "0.50",
    "RATE_LIMIT_ENABLED": "true",
}


class TestDemoKapaliyken:
    def test_demo_kapaliyken_hicbir_ihlal_yok(self):
        # Arrange — demo bayrağı yokken en berbat konfigürasyon bile serbest
        env = {"DB_PERSIST": "1", "SQL_ECHO": "1", "CORS_ORIGINS": "http://localhost:5173"}
        # Assert — bugünkü davranış birebir korunur
        assert dg.dogrula(env) == ()
        assert dg.uyarilar(env) == ()

    def test_demo_kapaliyken_db_persist_normal_okunur(self):
        assert dg.db_persist_acik({"DB_PERSIST": "1"}) is True
        assert dg.db_persist_acik({"DB_PERSIST": "0"}) is False
        assert dg.db_persist_acik({}) is False


class TestSaglamKonfigurasyon:
    def test_saglam_konfigurasyon_gecer(self):
        assert dg.dogrula(SAGLAM) == ()

    def test_dogrula_veya_dur_saglamda_raise_etmez(self):
        dg.dogrula_veya_dur(SAGLAM)


class TestKalicilik:
    """9 Ağu 2026: kalıcılık kısıtı KALDIRILDI — ürün anonim demo değil, hesaplı uygulama.

    Eski sözleşme "DEMO_KORUMA=1 + DB_PERSIST=1 → boot reddi" idi ve gerekçesi
    "yabancının belgesi DB'ye yazılmaz"dı. Artık herkes kendi hesabını açıyor; kişinin
    kendi belgesini kendi hesabında saklaması ürünün işlevi. Metin ve dosya adı yine
    MASKELİ yazılır (persist_run), o güvence testlerle korunuyor.
    """

    def test_DB_PERSIST_ile_birlikte_BOOT_REDDEDILMEZ(self):
        # Arrange
        env = {**SAGLAM, "DB_PERSIST": "1"}
        # Assert — artık meşru bir konfigürasyon
        assert dg.dogrula(env) == ()
        dg.dogrula_veya_dur(env)          # raise etmemeli

    def test_demo_modunda_da_kalicilik_ACILABILIR(self):
        assert dg.db_persist_acik({**SAGLAM, "DB_PERSIST": "1"}) is True

    def test_kalicilik_acikken_IMHA_uyarisi_verilir(self):
        """Saklama süresi imhası otomatik değil — operatör bunu boot'ta görmeli."""
        uyari = dg.uyarilar({**SAGLAM, "DB_PERSIST": "1"})
        assert any("imha_job" in u for u in uyari)

    def test_SQL_ECHO_reddedilir(self):
        # structlog processor'ü SQLAlchemy echo'suna ULAŞMAZ → kaynağında kapatılmalı
        assert any("SQL_ECHO" in i for i in dg.dogrula({**SAGLAM, "SQL_ECHO": "1"}))


class TestKonfigurasyonKapilari:
    def test_APP_ENV_production_degilse_reddedilir(self):
        ihlal = dg.dogrula({**SAGLAM, "APP_ENV": "dev"})
        assert any("APP_ENV" in i for i in ihlal)

    def test_CORS_bos_reddedilir(self):
        ihlal = dg.dogrula({**SAGLAM, "CORS_ORIGINS": ""})
        assert any("CORS_ORIGINS" in i for i in ihlal)

    def test_CORS_localhost_reddedilir(self):
        ihlal = dg.dogrula({**SAGLAM, "CORS_ORIGINS": "http://localhost:5173"})
        assert any("localhost" in i for i in ihlal)

    def test_rate_limit_kapaliysa_reddedilir(self):
        ihlal = dg.dogrula({**SAGLAM, "RATE_LIMIT_ENABLED": "0"})
        assert any("RATE_LIMIT" in i for i in ihlal)

    def test_jwt_secret_yoksa_reddedilir(self):
        env = {**SAGLAM}
        del env["AUTH_JWT_SECRET"]
        assert any("AUTH_JWT_SECRET" in i for i in dg.dogrula(env))

    def test_tavan_tanimsizsa_reddedilir(self):
        env = {**SAGLAM}
        del env["DEMO_AZAMI_GUNLUK_USD"]
        assert any("DEMO_AZAMI_GUNLUK_USD" in i for i in dg.dogrula(env))

    def test_tavan_TURKCE_VIRGUL_reddedilir(self):
        """En olası operatör hatası — sessizce 0'a düşüp demoyu kapatmasın, boot'ta söylensin."""
        ihlal = dg.dogrula({**SAGLAM, "DEMO_AZAMI_GUNLUK_USD": "0,50"})
        assert any("ondalık virgül" in i for i in ihlal)

    def test_tavan_sifir_veya_negatif_reddedilir(self):
        assert dg.dogrula({**SAGLAM, "DEMO_AZAMI_GUNLUK_USD": "0"})
        assert dg.dogrula({**SAGLAM, "DEMO_AZAMI_GUNLUK_USD": "-1"})

    def test_coklu_ihlal_hepsi_listelenir(self):
        env = {"DEMO_KORUMA": "1"}
        ihlal = dg.dogrula(env)
        assert len(ihlal) >= 4


class TestUyarilar:
    def test_coklu_worker_uyarir_ama_DURDURMAZ(self):
        env = {**SAGLAM, "WEB_CONCURRENCY": "4"}
        assert dg.dogrula(env) == ()
        assert any("WEB_CONCURRENCY" in u for u in dg.uyarilar(env))

    def test_guvenilen_proxy_uyarir(self):
        env = {**SAGLAM, "DEMO_GUVENILEN_PROXY_SAYISI": "1"}
        assert any("X-Forwarded-For" in u for u in dg.uyarilar(env))

    def test_kota_secret_yoksa_uyarir(self):
        assert any("DEMO_KOTA_SECRET" in u for u in dg.uyarilar(SAGLAM))


class TestBootOzeti:
    def test_ozet_cozumlenmis_degerleri_verir(self):
        ozet = dg.boot_ozeti(SAGLAM)
        assert ozet["demo_koruma"] is True
        assert ozet["tavan_usd"] == "0.50"
        assert ozet["db_persist"] is False

    def test_yanlis_yazilmis_bayrak_ozette_gorunur(self):
        # Arrange — "DEMO_KORUMA=evet" geçersiz
        ozet = dg.boot_ozeti({"DEMO_KORUMA": "evet"})
        # Assert — operatör açılış banner'ında kapalı olduğunu görür
        assert ozet["demo_koruma"] is False


class TestTolerantParse:
    def test_demo_modu_tolerant(self):
        for deger in ("1", "true", "TRUE", "yes", "on"):
            assert dg.demo_modu({"DEMO_KORUMA": deger}) is True
        for deger in ("0", "false", "hayir", ""):
            assert dg.demo_modu({"DEMO_KORUMA": deger}) is False
