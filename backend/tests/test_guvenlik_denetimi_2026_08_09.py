"""9 Ağu 2026 güvenlik denetimi — kapatılan açıkların regresyon kilitleri.

Her sınıf TEK bir bulguyu sabitler. Ortak nokta: hepsi "sözleşme bir yerde doğru
uygulanmış ama ikinci bir yolda atlanmış" tipindedir — yani ileride kolayca geri
gelebilecek türden. AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import asyncio

import pytest


class TestAracDongusuPIIMaskeler:
    """KVKK sınırı: araç çıktısı dış modele (DeepSeek) MASKELİ gitmeli.

    BULGU: `sohbet.py:543` tek-tur yolunda `mask_yapisal` uyguluyordu; çok-turlu
    `arac_dongusu` AYNI veriyi HAM gönderiyordu. Aynı sınır, aynı sağlayıcı, aynı veri —
    biri maskeli biri ham. Bu test iki yolun ayrışmasını engeller.
    """

    @pytest.mark.asyncio
    async def test_arac_sonucu_llme_maskeli_gider(self, monkeypatch):
        # Arrange — araç, içinde SAHTE TCKN + telefon olan bir kayıt döndürsün.
        from api.routes import sohbet_araclar

        ham_veri = [{
            "ad_soyad": "Ayşe Yılmaz",
            "tckn": "12345678901",
            "telefon": "05551234567",
            "konu": "İzin talebi",
        }]
        gorulen_promptlar: list[str] = []
        tur = {"n": 0}

        async def _sahte_llm_json(system, kullanici, **kw):
            gorulen_promptlar.append(kullanici)
            tur["n"] += 1
            if tur["n"] == 1:
                return {"arac": next(iter(sohbet_araclar.ARAC_ADLARI)), "parametreler": {}}
            return {"arac": None}

        async def _sahte_calistir(arac, parametreler):
            return ham_veri

        monkeypatch.setattr(sohbet_araclar, "llm_json", _sahte_llm_json)

        # Act
        sonuc = await sohbet_araclar.arac_dongusu(
            mesaj="kayıtlarımı göster", gecmis_metni="", calistir=_sahte_calistir, max_tur=3)

        # Assert — LLM'e giden HİÇBİR prompt'ta ham PII olmamalı
        tum_prompt = "\n".join(gorulen_promptlar)
        assert "12345678901" not in tum_prompt, "ham TCKN dış modele gitti"
        assert "05551234567" not in tum_prompt, "ham telefon dış modele gitti"
        # ...ama araç sonucu prompt'a GİRMİŞ olmalı (maskeleme veriyi yok etmemeli)
        assert "ARAÇ SONUCU" in tum_prompt
        assert "İzin talebi" in tum_prompt, "maskeleme PII olmayan alanı da silmiş"

        # Assert — çağırana dönen veri HAM kalmalı: memur KENDİ evrağını okuyabilmeli
        assert sonuc is not None
        _arac, donen = sonuc
        assert donen == ham_veri


class TestSayfaKesifIcerikTuruFailClosed:
    """SSRF yüzeyi: Content-Type başlığı YOKSA gövde indirilmemeli.

    BULGU: koşul `if tip and not any(...)` idi → başlık hiç gelmezse kapı tamamen
    atlanıyordu, oysa modül "HTML olmayan içerik hiç indirilmez" diye taahhüt ediyor.
    Başlığı atlamak sunucunun (yani hedefin) tercihidir; eksik başlık artık reddedilir.
    """

    def _yanit(self, basliklar: dict):
        class _Sahte:
            headers = basliklar

        return _Sahte()

    def test_content_type_yoksa_reddedilir(self):
        # Arrange
        from core.sayfa_kesif import _okunabilir_mi

        # Act + Assert — başlık yok → indirme YOK (fail-closed)
        assert _okunabilir_mi(self._yanit({})) is False

    def test_bos_content_type_reddedilir(self):
        from core.sayfa_kesif import _okunabilir_mi

        assert _okunabilir_mi(self._yanit({"content-type": ""})) is False

    def test_html_kabul_edilir(self):
        # Arrange — meşru kurum sitesi
        from core.sayfa_kesif import _okunabilir_mi

        # Act + Assert — normal yol bozulmamalı
        assert _okunabilir_mi(
            self._yanit({"content-type": "text/html; charset=utf-8"})) is True

    def test_binary_reddedilir(self):
        from core.sayfa_kesif import _okunabilir_mi

        assert _okunabilir_mi(self._yanit({"content-type": "application/zip"})) is False


class TestBaglamsizHarcamaKaliciyaYazilir:
    """Para tavanı: istek bağlamı OLMAYAN harcama da kalıcı katmana boşaltılmalı.

    BULGU: `kalici_senkronize()` yalnız DemoKapisi'nin ÜCRETLİ yol finally bloğunda
    çağrılıyordu. `/sohbet*` SERBEST_YOLLAR'da olduğu için oraya hiç girmez → sohbet
    harcaması yalnız süreç-içi dosya defterine yazılıyordu ve Render'da kalıcı disk
    olmadığı için restart'ta kayboluyordu ("günlük" tavan → "konteyner ömrü" tavanı).
    """

    def test_baglamsiz_mutabakat_senkron_tetikler(self, monkeypatch):
        # Arrange
        from core import demo_butce

        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setattr(demo_butce, "_son_baglamsiz_senkron", 0.0, raising=False)
        cagrildi = {"n": 0}

        async def _sahte_senkron():
            cagrildi["n"] += 1

        monkeypatch.setattr(demo_butce, "kalici_senkronize", _sahte_senkron)
        monkeypatch.setattr(demo_butce.DEFTER, "deftere_ekle", lambda t: None)

        async def _kos():
            # İstek bağlamı YOK (sohbet yolu) → senkron tetiklenmeli
            demo_butce._ISTEK.set(None)
            demo_butce.cagri_mutabakati("deepseek-v4-flash", 1000, 200)
            await asyncio.sleep(0)  # fire-and-forget görevin koşmasına izin ver
            await asyncio.sleep(0)

        # Act
        asyncio.run(_kos())

        # Assert
        assert cagrildi["n"] == 1, "bağlamsız harcama kalıcı katmana boşaltılmadı"

    def test_olay_dongusu_yoksa_cokmez(self, monkeypatch):
        # Arrange — senkron bağlam (eval betiği / test) — burada yazacak kimse yok
        from core import demo_butce

        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setattr(demo_butce, "_son_baglamsiz_senkron", 0.0, raising=False)
        monkeypatch.setattr(demo_butce.DEFTER, "deftere_ekle", lambda t: None)

        # Act + Assert — istisna atmamalı (harcama muhasebesi sohbeti düşürmemeli)
        demo_butce.cagri_mutabakati("deepseek-v4-flash", 100, 50)

    def test_throttle_ard_arda_yazimi_engeller(self, monkeypatch):
        # Arrange — aynı saniyede 5 çağrı; Supabase'e 5 kez yazılmamalı
        from core import demo_butce

        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.setattr(demo_butce, "_son_baglamsiz_senkron", 0.0, raising=False)
        cagrildi = {"n": 0}

        async def _sahte_senkron():
            cagrildi["n"] += 1

        monkeypatch.setattr(demo_butce, "kalici_senkronize", _sahte_senkron)
        monkeypatch.setattr(demo_butce.DEFTER, "deftere_ekle", lambda t: None)

        async def _kos():
            demo_butce._ISTEK.set(None)
            for _ in range(5):
                demo_butce.cagri_mutabakati("deepseek-v4-flash", 100, 50)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        # Act
        asyncio.run(_kos())

        # Assert — throttle penceresi içinde TEK yazım
        assert cagrildi["n"] == 1, f"throttle çalışmadı: {cagrildi['n']} yazım"


class TestDockerignoreSirlariHaricTutar:
    """İmaj hijyeni: .gitignore'un GERÇEK SIR saydığı dosyalar imaja girmemeli.

    BULGU: .gitignore `/env` ve `/backend/env` dosyalarını "GERÇEK DeepSeek anahtarı +
    Supabase şifresi içerir" diyerek korurken, .dockerignore yalnız NOKTALI `**/.env`
    kalıplarını dışlıyordu. `COPY backend/ ./` o dosyaları üretim imajına gömerdi.
    """

    def test_noktasiz_env_ikizleri_dockerignore_da(self):
        # Arrange
        from pathlib import Path

        kok = Path(__file__).resolve().parents[2]
        icerik = (kok / ".dockerignore").read_text(encoding="utf-8")
        satirlar = {s.split("#")[0].strip() for s in icerik.splitlines()}

        # Act + Assert — .gitignore'un koruduğu her noktasız ikiz burada da olmalı
        for beklenen in ("env", "backend/env"):
            assert beklenen in satirlar, (
                f"'{beklenen}' .dockerignore'da yok — gerçek sır üretim imajına girebilir")

    def test_anahtar_dosyalari_haric(self):
        from pathlib import Path

        kok = Path(__file__).resolve().parents[2]
        satirlar = {s.split("#")[0].strip()
                    for s in (kok / ".dockerignore").read_text(encoding="utf-8").splitlines()}
        assert "**/*.key" in satirlar
        assert "**/*.pem" in satirlar


class TestDbYedegiSifreliYuklenir:
    """Yedek hijyeni: DB dump'ı artifact'e ŞİFRESİZ yüklenmemeli.

    Artifact'i deponun okuma yetkisi olan herkes indirir; depo public yapılırsa tam
    üretim veritabanı (kullanıcı hesapları, evrak metni, PII) 30 gün açık kalırdı.
    """

    def test_workflow_gpg_ile_sifreler(self):
        # Arrange
        from pathlib import Path

        kok = Path(__file__).resolve().parents[2]
        wf = (kok / ".github" / "workflows" / "db-backup.yml").read_text(encoding="utf-8")

        # Assert — şifreleme var ve şifresiz dump artifact'e verilmiyor
        assert "--symmetric" in wf and "AES256" in wf, "yedek şifrelenmiyor"
        assert "YEDEK_SIFRELEME_PAROLASI" in wf, "şifreleme parolası secret'ı yok"
        assert ".gpg" in wf, "artifact yolu şifreli dosyayı göstermiyor"

    def test_parola_yoksa_yedek_uretilmez(self):
        from pathlib import Path

        kok = Path(__file__).resolve().parents[2]
        wf = (kok / ".github" / "workflows" / "db-backup.yml").read_text(encoding="utf-8")
        # Parola yokken job DURMALI (şifresiz dump üretip yüklemek yerine)
        assert 'if [ -z "$YEDEK_PAROLA" ]' in wf
        assert "exit 1" in wf, "parola yokken job durmuyor — şifresiz yedek riski"
