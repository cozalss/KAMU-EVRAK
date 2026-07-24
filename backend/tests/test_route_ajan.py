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

_BAGCILAR_GURULTU = {
    "evrak_turu": "sikayet",
    "evrak_text": (
        "T.C.\nBAĞCILAR BELEDİYE BAŞKANLIĞINA\nİSTANBUL\n\n"
        "Konu: Gürültü kirliliği şikâyeti\n\n"
        "İkamet ettiğim binanın alt katındaki eğlence mekânından kaynaklanan aşırı ve "
        "sürekli gürültü nedeniyle özellikle gece saatlerinde huzursuzluk yaşıyorum. "
        "Gerekli gürültü ölçümünün yapılarak yasal işlem başlatılmasını talep ederim."
    ),
    "bilgi_unsurlari": {
        "kurum": "Bağcılar Belediye Başkanlığı",
        "konu": "Gürültü kirliliği şikâyeti",
        "talepler": ["Eğlence mekânında gürültü ölçümü ve yasal denetim yapılması"],
    },
}


# --------------------------------------------------------------------------- #
# Kaynak-doğrulanmış birim (üçlü grounding geçer)
# --------------------------------------------------------------------------- #

class TestKaynakDogrulanmisBirim:
    async def test_resmi_kaynak_otomatik_havale_uretir(self):
        """Resmi kurum kaynağı eşleşirse hedef birim memur onaysız üretilebilir."""
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
        assert k["url_veya_belge_kimligi"] == (
            "https://www.yenimahalle.bel.tr/Icerik/ruhsat-ve-denetim-islemleri/15"
        )

    async def test_muhatap_ve_yetkili_kurum_alanlari(self):
        out = await route_birim_node(dict(_RUHSAT))
        assert out["muhatap_kurum"]["slug"] == "yenimahalle-belediyesi"
        assert out["yetkili_kurum"]["slug"] == "yenimahalle-belediyesi"

    async def test_bagcilar_gurultu_uzman_cevre_birimine_gider(self):
        """Gürültü şikâyeti Teftiş/Zabıta'ya değil, güncel çevre denetimi birimine gider."""
        out = await route_birim_node(dict(_BAGCILAR_GURULTU))
        assert out["hedef_kurum_adi"] == "Bağcılar Belediyesi"
        assert out["hedef_birim"] == "İklim Değişikliği ve Sıfır Atık Müdürlüğü"
        assert out["durum"] == "kaynak_dogrulandi"
        assert out["insan_onayi_gerekli"] is False
        assert "20260305_iklimdegisikligivesifiratik.pdf" in (
            out["hedef_birim_kaynak"]["url_veya_belge_kimligi"]
        )
        assert "Ruhsat ve Denetim Müdürlüğü" in out["birim_alternatifleri"]

    async def test_bagcilar_personel_yolsuzluk_iddiasi_teftise_gider(self):
        state = {
            "evrak_turu": "sikayet",
            "evrak_text": (
                "T.C.\nBAĞCILAR BELEDİYE BAŞKANLIĞINA\n\n"
                "Belediye personelinin görevi kötüye kullanma, rüşvet ve usulsüz işlem "
                "iddiaları hakkında soruşturma yapılmasını talep ederim."
            ),
            "bilgi_unsurlari": {
                "konu": "Belediye personeli hakkında rüşvet ve usulsüz işlem iddiası",
                "talepler": ["Görevi kötüye kullanma iddiasının soruşturulması"],
            },
        }
        out = await route_birim_node(state)
        assert out["hedef_birim"] == "Rehberlik ve Teftiş Kurulu Müdürlüğü"
        assert out["durum"] == "kaynak_dogrulandi"


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
                "kurum_slug": "yenimahalle-belediyesi", "kaynak_tipi": "kurum_ozel",
                "kaynak_guven": "resmi_dogrulanmis", "kaynak_sha256": "a" * 64}
        # Konu 'icra haciz tebligat' → park görev tanımında yok → grounding reddeder.
        assert uclu_grounding(aday, "icra haciz tebligat mahkeme", "yenimahalle-belediyesi") is False

    def test_gecerli_aday_kabul_edilir(self):
        aday = {"birim_ad": "Ruhsat ve Denetim Müdürlüğü",
                "gorev": "işyeri açma ve çalışma ruhsatı düzenlenmesi ve denetimi",
                "kurum_slug": "yenimahalle-belediyesi", "kaynak_tipi": "kurum_ozel",
                "kaynak_guven": "resmi_dogrulanmis", "kaynak_sha256": "a" * 64}
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

    def test_baskanlik_anteti_korpustaki_kuruma_cozulur(self):
        k = muhatap_kurum_tespit(
            "T.C.\nTÜRKİYE İSTATİSTİK KURUMU BAŞKANLIĞINA\nKonu: Nüfus istatistikleri",
            {},
        )
        assert k["slug"] == "turkiye-istatistik-kurumu-baskanligi"
        assert k["tur"] == "baskanlik"


# --------------------------------------------------------------------------- #
# Mock determinizmi (CI) + arama primitifi
# --------------------------------------------------------------------------- #

class TestMockDeterminizm:
    async def test_ayni_girdi_ayni_cikti(self):
        a = await route_birim_node(dict(_RUHSAT))
        b = await route_birim_node(dict(_RUHSAT))
        assert a["hedef_birim"] == b["hedef_birim"] == "Ruhsat ve Denetim Müdürlüğü"
        assert a["durum"] == b["durum"] == "kaynak_dogrulandi"

    def test_resmi_kaynak_kurum_ozel_dondurur(self):
        adaylar = kaynak_ara("yenimahalle-belediyesi", "işyeri açma çalışma ruhsatı", tur="belediye")
        assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
        assert adaylar[0]["birim_ad"] == "Ruhsat ve Denetim Müdürlüğü"

    async def test_llm_hatasinda_dogrulanmis_retrieval_sirasi_kullanilir(self, monkeypatch):
        import agents.nodes.route_ajan as route_mod

        async def _llm_hatasi(*_args, **_kwargs):
            return None

        monkeypatch.setattr(route_mod, "real_llm", lambda: object())
        monkeypatch.setattr(route_mod, "_llm_sec", _llm_hatasi)

        out = await route_birim_node(dict(_BAGCILAR_GURULTU))

        assert out["hedef_birim"] == "İklim Değişikliği ve Sıfır Atık Müdürlüğü"
        assert out["durum"] == "kaynak_dogrulandi"
        assert out["hedef_birim_kaynak"]["kaynak_guven"] == "resmi_dogrulanmis"
        assert "resmî kaynak sırası" in out["birim_reasoning"]


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

    def test_uedas_aydinlatma_insan_onayi_adayi(self):
        """Yerel kimlikli UEDAŞ kaynağı, doğrulanana kadar insan onayı adayıdır."""
        from agents.nodes.teskilat_ara import teskilat_birim_ara
        adaylar = teskilat_birim_ara("uedas", "sokak aydınlatma direği lambası arızalı")
        assert adaylar and adaylar[0]["kaynak_tipi"] == "aday"
        assert "Aydınlatma" in adaylar[0]["birim_ad"]

    def test_resmi_tuik_kaynagi_otomatik_hedef_uretmek_icin_gecerlidir(self):
        from agents.nodes.teskilat_ara import kurum_korpusta_var, teskilat_birim_ara

        adaylar = teskilat_birim_ara(
            "turkiye-istatistik-kurumu",
            "nüfus göç doğum ölüm istatistikleri",
        )
        assert kurum_korpusta_var("turkiye-istatistik-kurumu") is True
        assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
        assert adaylar[0]["birim_ad"] == "Demografi İstatistikleri Daire Başkanlığı"

    def test_resmi_nvi_kaynagi_otomatik_hedef_uretmek_icin_gecerlidir(self):
        from agents.nodes.teskilat_ara import kurum_korpusta_var, teskilat_birim_ara

        adaylar = teskilat_birim_ara(
            "nufus-ve-vatandaslik-isleri-genel-mudurlugu",
            "vatandaşlıktan çıkma mavi kart yeniden vatandaşlık kazanma",
        )
        assert kurum_korpusta_var("nufus-ve-vatandaslik-isleri-genel-mudurlugu") is True
        assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
        assert adaylar[0]["birim_ad"] == "Vatandaşlık Hizmetleri Daire Başkanlığı"

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


class TestRoutingContext:
    async def test_resmi_tuik_anteti_demografi_birimine_gider(self):
        state = {
            "evrak_turu": "dilekce",
            "evrak_text": (
                "T.C.\nTÜRKİYE İSTATİSTİK KURUMU BAŞKANLIĞINA\n\n"
                "Konu: Nüfus, göç, doğum ve ölüm istatistikleri talebi"
            ),
            "bilgi_unsurlari": {"konu": "nüfus göç doğum ölüm istatistikleri"},
        }
        out = await route_birim_node(state)
        assert out["hedef_kurum_adi"] == "Türkiye İstatistik Kurumu"
        assert out["hedef_birim"] == "Demografi İstatistikleri Daire Başkanlığı"
        assert out["durum"] == "kaynak_dogrulandi"

    async def test_body_context_routes_to_fen_isleri(self):
        state = {
            "evrak_turu": "dilekce",
            "evrak_text": (
                "T.C.\nYEN\u0130MAHALLE BELED\u0130YE BA\u015eKANLI\u011eINA\n\nKonu: Ba\u015fvuru\n\n"
                "Mahallemizdeki bozuk kald\u0131r\u0131mlar\u0131n onar\u0131lmas\u0131 ve yol bak\u0131m\u0131 talep edilmektedir."
            ),
            "bilgi_unsurlari": {"konu": "Ba\u015fvuru"},
        }
        out = await route_birim_node(state)
        assert out["hedef_birim"] is None
        assert out["hedef_birim_oneri"] == "Fen İşleri Müdürlüğü"
        assert out["hedef_kurum_adi"] == "Yenimahalle Belediyesi"

    async def test_inflected_subject_routes_to_park_bahceler(self):
        state = {
            "evrak_turu": "dilekce",
            "evrak_text": "T.C.\nYEN\u0130MAHALLE BELED\u0130YE BA\u015eKANLI\u011eINA\n\nKonu: A\u011fa\u00e7land\u0131rmalar\u0131n ve budamalar\u0131n yap\u0131lmas\u0131",
            "bilgi_unsurlari": {"konu": "A\u011fa\u00e7land\u0131rmalar\u0131n ve budamalar\u0131n yap\u0131lmas\u0131"},
        }
        out = await route_birim_node(state)
        assert out["hedef_birim"] is None
        assert out["hedef_birim_oneri"] == "Park ve Bahçeler Müdürlüğü"
        assert out["hedef_kurum_adi"] == "Yenimahalle Belediyesi"
