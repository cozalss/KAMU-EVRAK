"""Kaynak-doğrulamalı yönlendirme ajanı (route_ajan) sözleşme testleri.

Konu: kaynak-doğrulanmış birim (üçlü grounding) · dürüst fallback (uydurma yok) ·
KVKK maskeleme · muhatap≠yetkili kurum · mock determinizmi. conftest LLM_MODE=mock →
real_llm None → ajan deterministik aday-seçim yolunda çalışır (CI'da ağ/DeepSeek yok).
"""
from __future__ import annotations

from agents.config import BIRIMLER
from agents.kurum_kimlik import ad_to_kurum, muhatap_kurum_tespit
from agents.nodes.route_birim import route_birim_node
from agents.resmi_kaynak import kaynak_ara, uclu_grounding
from api.pii import mask_for_llm

_RUHSAT = {
    "evrak_turu": "dilekce",
    "evrak_text": "T.C.\nYENİMAHALLE BELEDİYE BAŞKANLIĞINA\n\nKonu: İşyeri açma ve çalışma "
                  "ruhsatı\n\nMahallemizde bir işyeri açmak istiyorum. İşyeri açma ve çalışma "
                  "ruhsatı başvurusu için gereğini arz ederim.\nAd-Soyad: Ayşe Yılmaz\n"
                  "TCKN: 12345678901\nTel: 0555 123 45 67",
    "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "kurum": "Yenimahalle Belediye Başkanlığı",
                        "konu": "işyeri açma ve çalışma ruhsatı başvurusu"},
}


# --------------------------------------------------------------------------- #
# Kaynak-doğrulanmış birim (üçlü grounding geçer)
# --------------------------------------------------------------------------- #

class TestKaynakDogrulanmisBirim:
    async def test_ruhsat_dilekcesi_ruhsat_denetime_gider(self):
        """Bildirilen bug: ruhsat dilekçesi İK yerine Ruhsat ve Denetim'e (kaynak-doğrulanmış)."""
        out = await route_birim_node(dict(_RUHSAT))
        assert out["hedef_birim"] == "Ruhsat ve Denetim Müdürlüğü"
        assert out["durum"] == "kaynak_dogrulandi"
        assert out["insan_onayi_gerekli"] is False

    async def test_kaynak_kunyesi_tam(self):
        """hedef_birim_kaynak tam künye taşır (REVİZYON 6: kurum + belge + hash)."""
        out = await route_birim_node(dict(_RUHSAT))
        k = out["hedef_birim_kaynak"]
        assert k["kaynak_kurum"] == "Yenimahalle Belediyesi"
        assert k["belge_basligi"] and k["icerik_hash"] and k["url_veya_belge_kimligi"]
        assert k["kaynak_tipi"] == "kurum_ozel"

    async def test_muhatap_ve_yetkili_kurum_alanlari(self):
        out = await route_birim_node(dict(_RUHSAT))
        assert out["muhatap_kurum"]["slug"] == "yenimahalle-belediyesi"
        assert out["yetkili_kurum"]["slug"] == "yenimahalle-belediyesi"


# --------------------------------------------------------------------------- #
# Dürüst fallback (REVİZYON 2 + 4): korpus-dışı / doğrulanamaz → uydurma YOK
# --------------------------------------------------------------------------- #

class TestDurustFallback:
    async def test_korpus_disi_kurum_insan_onayi_ister(self):
        """Kuruma-özel kaynak yok (jenerik aday) → hedef_birim None + insan_onayi + kategori köprüsü.

        Korpusta OLMAYAN bir belediye (Bozüyük) seçilir — büyüyen korpusta bulunan bir ilçe
        (Çankaya vb.) artık kaynak-doğrulanır; bu test bilinçli olarak korpus-dışı örnek kullanır.
        """
        state = {
            "evrak_turu": "dilekce",
            "evrak_text": "T.C.\nBOZÜYÜK BELEDİYE BAŞKANLIĞINA\n\nKonu: Park bakımı\n"
                          "Parkımızdaki çocuk oyun alanı bakımsız, gereğini arz ederim.",
            "bilgi_unsurlari": {"konu": "park çocuk oyun alanı bakımı"},
        }
        out = await route_birim_node(state)
        assert out["hedef_birim"] is None
        assert out["durum"] == "fallback_onerisi"
        assert out["insan_onayi_gerekli"] is True
        assert out["hedef_kategori"] in BIRIMLER  # eski 9-set köprüsü


# --------------------------------------------------------------------------- #
# Üçlü grounding — uydurma/konu-dışı/jenerik aday REDDEDİLİR
# --------------------------------------------------------------------------- #

class TestUcluGrounding:
    def test_jenerik_aday_reddedilir(self):
        """Jenerik şablon adayı (kaynak_tipi != kurum_ozel) doğrulanmış hedef olamaz."""
        aday = {"birim_ad": "Ruhsat ve Denetim Müdürlüğü", "gorev": "işyeri açma ruhsatı",
                "kurum_slug": "_genel-belediye", "kaynak_tipi": "jenerik"}
        assert uclu_grounding(aday, "işyeri ruhsatı", "_genel-belediye") is False

    def test_konu_gorev_baglantisi_yoksa_reddedilir(self):
        """Kurum-özel aday olsa da görev tanımı evrak konusuyla örtüşmüyorsa reddedilir."""
        aday = {"birim_ad": "Park ve Bahçeler Müdürlüğü", "gorev": "park yeşil alan ağaçlandırma",
                "kurum_slug": "yenimahalle-belediyesi", "kaynak_tipi": "kurum_ozel"}
        # Konu 'icra haciz tebligat' → park görev tanımında yok → grounding reddeder.
        assert uclu_grounding(aday, "icra haciz tebligat mahkeme", "yenimahalle-belediyesi") is False

    def test_gecerli_aday_kabul_edilir(self):
        aday = {"birim_ad": "Ruhsat ve Denetim Müdürlüğü",
                "gorev": "işyeri açma ve çalışma ruhsatı düzenlenmesi ve denetimi",
                "kurum_slug": "yenimahalle-belediyesi", "kaynak_tipi": "kurum_ozel"}
        assert uclu_grounding(aday, "işyeri açma ruhsatı", "yenimahalle-belediyesi") is True

    def test_yanlis_kurum_reddedilir(self):
        """Aday başka kurumun teşkilatındansa (slug uyuşmaz) reddedilir (başka-belediye koruması)."""
        aday = {"birim_ad": "Ruhsat ve Denetim Müdürlüğü", "gorev": "işyeri açma ruhsatı",
                "kurum_slug": "baska-belediyesi", "kaynak_tipi": "kurum_ozel"}
        assert uclu_grounding(aday, "işyeri ruhsatı", "yenimahalle-belediyesi") is False


# --------------------------------------------------------------------------- #
# KVKK maskeleme — DeepSeek'e giden metinde isim + numara maskeli
# --------------------------------------------------------------------------- #

class TestKvkkMaskeleme:
    def test_isim_ve_numaralar_maskelenir(self):
        ham = "Ad-Soyad: Ayşe Yılmaz\nTCKN: 12345678901\nTel: 0555 123 45 67\nIBAN: TR12 3456 7890 1234 5678 9012 34"
        maskeli = mask_for_llm(ham, "Ayşe Yılmaz")
        assert "Ayşe Yılmaz" not in maskeli and "[AD]" in maskeli
        assert "12345678901" not in maskeli
        assert "0555 123 45 67" not in maskeli

    def test_isim_kisa_ise_dokunmaz(self):
        assert mask_for_llm("Konu: ab talebi", "ab") == "Konu: ab talebi"

    def test_bos_metin_guvenli(self):
        assert mask_for_llm("", "Ayşe") == ""


# --------------------------------------------------------------------------- #
# Kurum kimliği tespiti
# --------------------------------------------------------------------------- #

class TestKurumKimlik:
    def test_belediye_baskanligi_tespit(self):
        k = muhatap_kurum_tespit("T.C.\nYENİMAHALLE BELEDİYE BAŞKANLIĞINA\n...", {})
        assert k["slug"] == "yenimahalle-belediyesi" and k["tur"] == "belediye"

    def test_valilik_tespit(self):
        k = muhatap_kurum_tespit("ANKARA VALİLİĞİNE\n...", {})
        assert k["tur"] == "valilik" and k["slug"] == "ankara-valiligi"

    def test_kurum_yoksa_bos(self):
        k = muhatap_kurum_tespit("Sayın yetkili, geçen gün başvurdum.", {})
        assert k["slug"] == ""

    def test_ad_to_kurum_serbest_ad(self):
        k = ad_to_kurum("Uludağ Elektrik Dağıtım A.Ş.")
        assert k["slug"] and k["tur"] == "diger"


# --------------------------------------------------------------------------- #
# Mock determinizmi (CI) + arama primitifi
# --------------------------------------------------------------------------- #

class TestMockDeterminizm:
    async def test_ayni_girdi_ayni_cikti(self):
        a = await route_birim_node(dict(_RUHSAT))
        b = await route_birim_node(dict(_RUHSAT))
        assert a["hedef_birim"] == b["hedef_birim"] == "Ruhsat ve Denetim Müdürlüğü"

    def test_kaynak_ara_kurum_ozel_dondurur(self):
        adaylar = kaynak_ara("yenimahalle-belediyesi", "işyeri açma çalışma ruhsatı", tur="belediye")
        assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
        assert adaylar[0]["birim_ad"] == "Ruhsat ve Denetim Müdürlüğü"


class TestKapsamAliasCozumleme:
    """Genişletilmiş korpus (62 kurum): alias + il-adı-kırpma çözümlemesi sözleşmesi."""

    def test_alias_uedas_cozumlenir(self):
        from agents.nodes.teskilat_ara import _kanonik_slug
        assert _kanonik_slug("uedas") == "uludag-elektrik-dagitim"
        assert _kanonik_slug("uludag-elektrik-dagitim-a-s") == "uludag-elektrik-dagitim"

    def test_il_adi_kirpma_sgk(self):
        """Her ildeki aynı-tip taşra birimi tek ulusal kurum kaydına düşer."""
        from agents.nodes.teskilat_ara import _kanonik_slug
        assert _kanonik_slug("ankara-sosyal-guvenlik-il-mudurlugu") == "sosyal-guvenlik-kurumu"

    def test_uedas_aydinlatma_kurum_ozel_aday(self):
        """Sokak aydınlatması UEDAŞ kaynağından kurum_ozel aday üretir (Nilüfer vakası)."""
        from agents.nodes.teskilat_ara import teskilat_birim_ara
        adaylar = teskilat_birim_ara("uedas", "sokak aydınlatma direği lambası arızalı")
        assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
        assert "Aydınlatma" in adaylar[0]["birim_ad"]

    def test_jenerik_sablonlar_aday_kalir(self):
        """_genel-* şablonları kurum_korpusta_var=False → doğrulanmış hedef üretmez."""
        from agents.nodes.teskilat_ara import kurum_korpusta_var
        assert kurum_korpusta_var("_genel-buyuksehir-belediyesi") is False

    def test_alias_jenerik_sablona_sizamaz(self):
        """GÜVENLİK: alias/il-kırpma zinciri _genel-* şablonuna kurum_ozel KAZANDIRAMAZ.

        Korpusta OLMAYAN 'ornek-buyuksehir-belediyesi' → il-kırp → 'buyuksehir-belediyesi'
        (@ALIAS _genel-buyuksehir-belediyesi şablonuna işaret ediyor) → çözümleme REDDEDİLMELİ
        (jenerik yol ayrı); aksi halde şablon adayı kurum_ozel görünüp üçlü grounding'i yanıltır.
        (Gerçek büyükşehirler artık korpusta kurum_ozel — bu test kurgu bir slug kullanır.)
        """
        from agents.nodes.teskilat_ara import _kanonik_slug, teskilat_birim_ara
        assert _kanonik_slug("ornek-buyuksehir-belediyesi") == ""
        adaylar = teskilat_birim_ara("ornek-buyuksehir-belediyesi",
                                     "otobüs hattı sefer sıklığı", tur="belediye")
        assert all(a["kaynak_tipi"] == "jenerik" for a in adaylar)


class TestWebAdapterGated:
    """Web adapter (Faz 5) varsayılan KAPALI + WEB_ARAMA_URL yoksa etkisiz (offline ilke)."""

    def test_web_yedek_varsayilan_kapali(self):
        from agents.config import ROUTE_WEB_YEDEK
        assert ROUTE_WEB_YEDEK is False

    def test_web_adapter_url_yoksa_bos(self, monkeypatch):
        from agents.web_ara import WebAdapter
        monkeypatch.delenv("WEB_ARAMA_URL", raising=False)
        wa = WebAdapter()
        assert wa.kurum_var("herhangi-kurum") is False
        assert wa.ara("herhangi-kurum", "bir konu") == []
