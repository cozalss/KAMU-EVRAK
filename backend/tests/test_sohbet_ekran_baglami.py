"""Ekran bağlamı + sesli hızlı yol sözleşmeleri.

İki yeni yetenek burada kilitleniyor:
1. EKRAN BAĞLAMI — kullanıcının gördüğü ekran prompt'a girer ("bu evrak ne?" DB turu
   olmadan cevaplanır). İstemciden gelen bir girdi olduğu için şema sınırlı + PII maskeli.
2. SESLİ HIZLI YOL — sesli turda niyet LLM'i ve araç döngüsü ATLANIR (gecikme birincil
   kalite ölçüsü). Testler "atlanıyor" iddiasını sayarak kanıtlar, varsaymaz.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

import api.routes.sohbet as sohbet_mod
from api.routes.sohbet import EkranBaglam, SohbetIstek, _ekran_metni, _hizli_yol_mu, _kompoz_user


# ---------------------------------------------------------------------------
# _ekran_metni — bağlam metni, bütçe ve maskeleme
# ---------------------------------------------------------------------------
class TestEkranMetni:
    def test_baglam_yoksa_bos_dize(self):
        assert _ekran_metni(None) == ""

    def test_bos_baglam_gurultu_uretmez(self):
        assert _ekran_metni(EkranBaglam()) == ""

    def test_gorunum_secili_ve_liste_satirlari(self):
        metin = _ekran_metni(EkranBaglam(
            gorunum="Taslaklar (karar bekleyen yazılar)",
            secili={"ad": "ornek-dilekce.txt", "tur": "Dilekçe", "bant": "sari"},
            liste={"adet": 12, "ilkler": ["a.txt", "b.txt"]},
        ))
        assert "Taslaklar" in metin
        assert "ornek-dilekce.txt" in metin
        assert "Dilekçe" in metin
        assert "12 kayıt" in metin
        assert "a.txt" in metin

    def test_pii_maskelenir_ham_gitmez(self):
        """Ekranda maskesiz numara görünüyor olabilir — dış modele HAM gitmemeli."""
        metin = _ekran_metni(EkranBaglam(
            gorunum="Gelen evrak", secili={"ozet": "Başvuru sahibi 12345678901 numaralı kişi."}))
        assert "12345678901" not in metin
        assert "*" in metin

    def test_toplam_tavan_asilmaz(self):
        metin = _ekran_metni(EkranBaglam(
            gorunum="x" * 60, secili={"ozet": "ç" * 800, "ad": "y" * 200, "birim": "z" * 200}))
        assert len(metin) <= sohbet_mod._EKRAN_MAX

    def test_liste_adedi_sifirsa_satir_yazilmaz(self):
        metin = _ekran_metni(EkranBaglam(gorunum="Panel", liste={"adet": 0, "ilkler": []}))
        assert "kayıt" not in metin


# ---------------------------------------------------------------------------
# Şema sınırları — istemci girdisi; sınırsız büyüyemez (prompt/maliyet DoS'u)
# ---------------------------------------------------------------------------
class TestEkranSemaSinirlari:
    def test_asiri_uzun_ozet_reddedilir(self):
        with pytest.raises(ValidationError):
            EkranBaglam(secili={"ozet": "a" * 801})

    def test_asiri_uzun_liste_reddedilir(self):
        with pytest.raises(ValidationError):
            EkranBaglam(liste={"adet": 9, "ilkler": [f"e{i}.txt" for i in range(9)]})

    def test_ekran_alani_opsiyonel(self):
        assert SohbetIstek(mesaj="merhaba").ekran is None


# ---------------------------------------------------------------------------
# _kompoz_user — ekran bloğu prompt'a işaret-kelimesi açıklamasıyla girer
# ---------------------------------------------------------------------------
class TestKompozUser:
    def test_ekran_blogu_isaret_kelimelerini_baglar(self):
        user = _kompoz_user("bu evrak ne?", None, "", "Açık ekran: Gelen evrak")
        assert "Açık ekran: Gelen evrak" in user
        assert "'bu'" in user            # modele "bu" → ekran eşlemesi açıkça söylenir
        assert "Kullanıcı sorusu: bu evrak ne?" in user

    def test_ekran_yoksa_prompt_eskisiyle_ayni(self):
        assert _kompoz_user("kaç taslak var?", None, "") == (
            "Kullanıcı sorusu: kaç taslak var?\n\nSistem verisi (JSON):\n[]")


# ---------------------------------------------------------------------------
# Sesli hızlı yol — bayrak + LLM turunun GERÇEKTEN atlandığı
# ---------------------------------------------------------------------------
class TestHizliYol:
    def test_metin_sohbetinde_kapali(self):
        assert _hizli_yol_mu(SohbetIstek(mesaj="selam")) is False

    def test_sesli_turda_varsayilan_acik(self, monkeypatch):
        monkeypatch.delenv("SESLI_HIZLI_YOL", raising=False)
        assert _hizli_yol_mu(SohbetIstek(mesaj="selam", sesli=True)) is True

    def test_env_ile_kapatilabilir(self, monkeypatch):
        monkeypatch.setenv("SESLI_HIZLI_YOL", "0")
        assert _hizli_yol_mu(SohbetIstek(mesaj="selam", sesli=True)) is False

    async def test_hizli_niyet_LLM_CAGIRMAZ(self, monkeypatch):
        """Asıl iddia: sesli turun başındaki niyet LLM turu hiç yapılmaz."""
        cagri = 0

        async def _sayan(*a, **k):
            nonlocal cagri
            cagri += 1
            return {"intent": "taslaklar"}

        monkeypatch.setattr(sohbet_mod, "llm_json", _sayan)
        niyet, llm = await sohbet_mod._niyet_tespit("kaç taslak var", [], hizli=True)
        assert cagri == 0            # tek bir LLM çağrısı bile yok
        assert llm is False
        assert niyet["intent"] in sohbet_mod.NIYETLER   # deterministik sınıflandırıcı çalıştı

    async def test_normal_yolda_niyet_LLM_CAGRILIR(self, monkeypatch):
        """Karşı-kanıt: hızlı yol kapalıyken davranış birebir eski hâli."""
        cagri = 0

        async def _sayan(*a, **k):
            nonlocal cagri
            cagri += 1
            return {"intent": "taslaklar"}

        monkeypatch.setattr(sohbet_mod, "llm_json", _sayan)
        _, llm = await sohbet_mod._niyet_tespit("kaç taslak var", [], hizli=False)
        assert cagri == 1
        assert llm is True

    async def test_hizli_arac_dongusunu_atlar(self, monkeypatch):
        """Araç döngüsü tur başına 1-3 EK LLM çağrısı — sesli turda çalışmamalı."""
        dongu_cagri = 0

        async def _dongu(*a, **k):
            nonlocal dongu_cagri
            dongu_cagri += 1
            return ("taslaklar", [{"ad": "x"}])

        async def _klasik(session, owner_id, intent, parametreler):
            return [{"ad": "deterministik"}]

        monkeypatch.setattr(sohbet_mod._cfg, "SOHBET_ARAC_DONGUSU", True)
        monkeypatch.setattr(sohbet_mod, "arac_dongusu", _dongu)
        monkeypatch.setattr(sohbet_mod, "araci_calistir", _klasik)

        intent, veri, dongu_llm = await sohbet_mod._veri_getir(
            SohbetIstek(mesaj="kaç taslak var", sesli=True), _sahte_user(), None,
            "taslaklar", {}, hizli=True)
        assert dongu_cagri == 0
        assert dongu_llm is False
        assert veri == [{"ad": "deterministik"}]
        assert intent == "taslaklar"

    async def test_normal_yolda_arac_dongusu_calisir(self, monkeypatch):
        dongu_cagri = 0

        async def _dongu(*a, **k):
            nonlocal dongu_cagri
            dongu_cagri += 1
            return ("taslaklar", [{"ad": "dongu"}])

        monkeypatch.setattr(sohbet_mod._cfg, "SOHBET_ARAC_DONGUSU", True)
        monkeypatch.setattr(sohbet_mod, "arac_dongusu", _dongu)
        _, veri, dongu_llm = await sohbet_mod._veri_getir(
            SohbetIstek(mesaj="kaç taslak var"), _sahte_user(), None, "taslaklar", {})
        assert dongu_cagri == 1
        assert dongu_llm is True
        assert veri == [{"ad": "dongu"}]


# ---------------------------------------------------------------------------
# Düşünme kapatma — sesli turda ilk token gecikmesinin ana kalemi
# ---------------------------------------------------------------------------
class TestDusunmeKapatma:
    def test_sesli_varsayilan_kapali(self, monkeypatch):
        monkeypatch.delenv("SESLI_DUSUNME_KAPALI", raising=False)
        assert sohbet_mod._sesli_dusunme_kapali() is True

    def test_env_ile_geri_acilir(self, monkeypatch):
        monkeypatch.setenv("SESLI_DUSUNME_KAPALI", "0")
        assert sohbet_mod._sesli_dusunme_kapali() is False

    def test_deepseek_v4_payloadinda_thinking_disabled(self):
        from agents.llm import ChatMessage, OpenAIClient

        istemci = OpenAIClient.__new__(OpenAIClient)
        istemci.model = "deepseek-v4-flash"
        govde = istemci._payload(
            [ChatMessage(role="user", content="selam")], 0.2, 150,
            json_mode=False, json_schema=None, stream=True, dusunme_kapali=True)
        assert govde["thinking"] == {"type": "disabled"}

    def test_baska_saglayicida_alan_HIC_GONDERILMEZ(self):
        """Tanımayan sağlayıcı bu alanda 400 döndürür ve sesli mod tamamen susardı."""
        from agents.llm import ChatMessage, OpenAIClient

        istemci = OpenAIClient.__new__(OpenAIClient)
        istemci.model = "gpt-4o-mini"
        govde = istemci._payload(
            [ChatMessage(role="user", content="selam")], 0.2, 150,
            json_mode=False, json_schema=None, stream=True, dusunme_kapali=True)
        assert "thinking" not in govde

    def test_metin_modunda_dusunme_korunur(self):
        from agents.llm import ChatMessage, OpenAIClient

        istemci = OpenAIClient.__new__(OpenAIClient)
        istemci.model = "deepseek-v4-flash"
        govde = istemci._payload(
            [ChatMessage(role="user", content="selam")], 0.2, 400,
            json_mode=False, json_schema=None, stream=True)
        assert "thinking" not in govde


# ---------------------------------------------------------------------------
# Sesli site_yardim — konserve metin yerine kompozisyon (ekran bağlamı görünür olsun)
# ---------------------------------------------------------------------------
class TestSesliSiteYardim:
    def test_metin_modunda_konserve_bilgi_metni_korunur(self):
        assert sohbet_mod._kompoze_edilir("site_yardim", sesli=False) is False

    def test_sesli_modda_kompoze_edilir(self):
        """Hızlı yolun bedeli: 'panelde durum nedir' deterministik olarak site_yardim'a
        düşebiliyor. Kompozisyon yolunda ekran bağlamı görünür → gerçek sayı söylenir."""
        assert sohbet_mod._kompoze_edilir("site_yardim", sesli=True) is True

    async def test_llm_bossa_konserve_metne_duser(self, monkeypatch):
        """Yetenek kaybı olmamalı: LLM yok/boşsa bilgi tabanı metni yine döner."""
        async def _bos(*a, **k):
            return ""

        monkeypatch.setattr(sohbet_mod, "llm_text", _bos)
        yanit, llm = await sohbet_mod._yanit_kompoze(
            "bu sistem ne yapar", "site_yardim", None, sesli=True)
        assert llm is False
        assert yanit.strip()


def _sahte_user():
    from types import SimpleNamespace
    return SimpleNamespace(id="u1", rol="memur")
