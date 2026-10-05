"""e2e_gercek_eval metrik kuralları — sahte state ile, ağ/LLM ÇAĞRILMADAN.

Her test bir kuralın NEYİ yakalaması gerektiğini sabitler; özellikle canlı koşumda
görülen kusurlar (ham-kopya konu, yanlış ilgi, kesik JSON, kaçan yetki) burada
regresyon örneği olarak durur. AAA deseni.
"""

from __future__ import annotations

import json
from typing import ClassVar

from eval.e2e_gercek_eval import (
    GOLD,
    _belge_kos,
    belge_degerlendir,
    dokum_satiri,
    dokum_yaz,
    en_uzun_ortak_ngram,
    icerir_herhangi,
    ilgi_degerlendir,
    konu_degerlendir,
    mevzuat_degerlendir,
    norm,
    pii_tara,
    talep_degerlendir,
    taslak_alani,
    taslak_anteti,
    taslak_muhatabi,
    topla,
    yetki_degerlendir,
)

KAYNAK = (
    "KEÇİÖREN BELEDİYE BAŞKANLIĞINA\n\nSokağımızda iki aydır büyük bir çukur bulunmakta, "
    "araçlar ve yayalar için tehlike oluşturmaktadır. Çukurun en kısa sürede kapatılmasını "
    "talep ediyorum.\n\nAyrıca Eylül 2026 su faturam 1.850 TL geldi; sayacımın kontrolünü "
    "arz ederim.\n\n02.10.2026\nAyşe Yılmaz"
)

TASLAK_KOTU = """                                   T.C.
                          KEÇİÖREN BELEDİYESİ
                       Yazı İşleri Birimi

Sayı : EBYS-TASLAK                                                    05.10.2026
Konu : Sokağımızda iki aydır büyük bir çukur bulunmakta, araçlar ve yayalar için tehlike oluşturmaktadır. Çukurun en kısa sürede kapatılmasını talep ediyorum

                          İlgili Teknik / Ana Hizmet Dairesi

İlgi : Keçiören Belediye Başkanlığının 02.10.2026 tarihli yazısı.

Gövde.
"""

TASLAK_IYI = """                                   T.C.
                          KEÇİÖREN BELEDİYESİ
                       Fen İşleri Müdürlüğü

Sayı : E-[DETSİS No]-622-[Kayıt No]                                   05.10.2026
Konu : Sokaktaki çukurun kapatılması talebi

                          Fen İşleri Müdürlüğüne

İlgi : Ayşe Yılmaz'ın 02.10.2026 tarihli dilekçesi.

Gövde.
"""


def _gold(**ek):
    b = {
        "evrak_turu": "dilekce", "evrak_turu_kabul": ["talep"],
        "muhatap_kabul": ["Keçiören Belediye"], "yetki": "ICERIDE", "yetkili_kurum_kabul": [],
        "talep_sayisi": 1, "talep_detay": [{"ozet": "çukur", "anahtar": ["çukur"],
                                            "birim_kabul": ["Fen İşleri"], "yetki": "ICERIDE",
                                            "yetkili_kurum_kabul": []}],
        "birim_kabul_edilebilir": ["Fen İşleri"], "konu_anahtar": ["çukur"],
        "ilgi_turu": "dilekce", "ilgi_gonderen": "Ayşe Yılmaz",
        "ilgi_gonderen_kabul": ["Ayşe Yılmaz"], "ilgi_tarih": "02.10.2026",
        "beklenen_mevzuat_herhangi": ["3071"], "mevzuat_kabul": ["5393"],
        "alakasiz_mevzuat_yasak": ["5176"], "eksikler": [], "kurum_tipi": "ilce_belediyesi",
    }
    b.update(ek)
    return b


class TestMetinYardimcilari:
    def test_norm_turkce_buyuk_i_ve_aksan_katlar(self):
        assert norm("İLGİ  Çukur ŞAP") == "ilgi cukur sap"
        assert norm("Işık") == "isik"

    def test_icerir_herhangi_normalize_eder(self):
        assert icerir_herhangi("KEÇİÖREN BELEDİYESİ", ["Keçiören Belediye"])
        assert not icerir_herhangi("", ["x"])

    def test_en_uzun_ortak_ngram(self):
        assert en_uzun_ortak_ngram("a b c d", "x a b c y") == 3
        assert en_uzun_ortak_ngram("a", "b") == 0


class TestTaslakAyristirma:
    def test_konu_ilgi_antet_muhatap_ayrisir(self):
        assert taslak_alani(TASLAK_IYI, "konu") == "Sokaktaki çukurun kapatılması talebi"
        assert taslak_alani(TASLAK_IYI, "ilgi").startswith("Ayşe Yılmaz'ın")
        assert "KEÇİÖREN BELEDİYESİ" in taslak_anteti(TASLAK_IYI)
        assert taslak_muhatabi(TASLAK_IYI) == "Fen İşleri Müdürlüğüne"

    def test_alan_yoksa_none(self):
        assert taslak_alani("Gövde yalnız.", "ilgi") is None


class TestKonuKurali:
    def test_canli_kosumdaki_ham_kopya_konu_reddedilir(self):
        konu = taslak_alani(TASLAK_KOTU, "konu")
        r = konu_degerlendir(konu, KAYNAK, ["çukur"])
        assert not r["gecti"]
        assert any(n.startswith("uzun") for n in r["neden"])
        assert any(n.startswith("ham_kopya") for n in r["neden"])
        assert "birinci_sahis_fiil" in r["neden"]

    def test_kisa_resmi_konu_gecer(self):
        assert konu_degerlendir("Sokaktaki çukurun kapatılması talebi", KAYNAK, ["çukur"])["gecti"]

    def test_anahtar_kavram_yoksa_reddedilir(self):
        r = konu_degerlendir("Talep hakkında", KAYNAK, ["çukur"])
        assert r["neden"] == ["anahtar_yok"]

    def test_kaynagin_kendi_konu_satirini_tasimak_kopya_sayilmaz(self):
        kaynak = "Konu : Okul önü trafik güvenliği ve yaya geçidi yapılması hakkında bilgi\nGövde."
        r = konu_degerlendir("Okul önü trafik güvenliği ve yaya geçidi yapılması hakkında bilgi",
                             kaynak, ["trafik"])
        assert r["gecti"]


class TestIlgiKurali:
    def test_canli_kosumdaki_kurum_yazisi_ilgisi_reddedilir(self):
        r = ilgi_degerlendir(taslak_alani(TASLAK_KOTU, "ilgi"), _gold(),
                             taslak_muhatabi(TASLAK_KOTU))
        assert "gonderen_yanlis" in r["neden"] and "belge_turu_yanlis" in r["neden"]

    def test_dilekce_ilgisi_gecer(self):
        r = ilgi_degerlendir(taslak_alani(TASLAK_IYI, "ilgi"), _gold(), taslak_muhatabi(TASLAK_IYI))
        assert r["gecti"], r

    def test_ikinci_sahis_yalniz_muhatap_gonderense_gecer(self):
        b = _gold()
        assert ilgi_degerlendir("02.10.2026 tarihli dilekçeniz.", b, "Sayın Ayşe Yılmaz")["gecti"]
        r = ilgi_degerlendir("02.10.2026 tarihli dilekçeniz.", b, "Fen İşleri Müdürlüğüne")
        assert r["neden"] == ["gonderen_yanlis"]

    def test_vatandasa_basvurunuz_gecer_yaziniz_gecmez(self):
        b = _gold()
        assert ilgi_degerlendir("02.10.2026 tarihli başvurunuz.", b, "Sayın Ayşe Yılmaz")["gecti"]
        r = ilgi_degerlendir("02.10.2026 tarihli ve 19010245 sayılı yazınız.", b, "Sayın Ayşe Yılmaz")
        assert r["neden"] == ["belge_turu_yanlis"]

    def test_yanlis_tarih_reddedilir(self):
        r = ilgi_degerlendir("Ayşe Yılmaz'ın 15.09.2026 tarihli dilekçesi.", _gold(), "")
        assert r["neden"] == ["tarih_yanlis"]

    def test_tarih_varyanti_kabul_edilir(self):
        assert ilgi_degerlendir("Ayşe Yılmaz'ın 2/10/2026 tarihli dilekçesi.", _gold(), "")["gecti"]

    def test_ilgi_satiri_yoksa_reddedilir(self):
        assert ilgi_degerlendir(None, _gold())["neden"] == ["ilgi_yok"]


class TestYetkiKurali:
    def test_disarida_yapisal_tespit(self):
        b = _gold(yetki="DISARIDA", yetkili_kurum_kabul=["ASKİ"])
        st = {"muhatap_kurum": {"ad": "Keçiören Belediyesi", "slug": "kecioren-belediyesi"},
              "yetkili_kurum": {"ad": "Aski", "slug": "aski"}}
        assert yetki_degerlendir(st, b)["gecti"]

    def test_yalniz_gerekcede_anilan_kurum_yapisal_sayilmaz(self):
        b = _gold(yetki="DISARIDA", yetkili_kurum_kabul=["ASKİ"])
        st = {"muhatap_kurum": {"slug": "kecioren-belediyesi"},
              "yetkili_kurum": {"slug": "kecioren-belediyesi"},
              "birim_reasoning": "su faturası ise ayrıca ASKİ'nin yetkisindedir"}
        r = yetki_degerlendir(st, b)
        assert not r["gecti"] and r["metinsel"]

    def test_alt_talepte_yetkili_kurum_alani_tespit_sayilir(self):
        b = _gold(yetki="DISARIDA", yetkili_kurum_kabul=["ASKİ"])
        st = {"muhatap_kurum": {"slug": "k"}, "yetkili_kurum": {"slug": "k"},
              "alt_talepler": [{"ozet": "su faturası", "yetkili_kurum": {"ad": "ASKİ Genel Müdürlüğü"}}]}
        assert yetki_degerlendir(st, b)["yapisal"]

    def test_iceride_yanlis_alarm(self):
        st = {"muhatap_kurum": {"slug": "a"}, "yetkili_kurum": {"ad": "B", "slug": "b"}}
        r = yetki_degerlendir(st, _gold())
        assert r["yanlis_alarm"] and not r["gecti"]


class TestTalepKurali:
    def test_iki_ajan_tutarsizligi_olculur(self):
        b = _gold(talep_detay=[
            {"ozet": "çukur", "anahtar": ["çukur"], "birim_kabul": ["Fen İşleri"]},
            {"ozet": "fatura", "anahtar": ["fatura", "sayaç"], "birim_kabul": ["ASKİ"]}])
        st = {"alt_talepler": [{"ozet": "Çukurun kapatılması", "birim_tr": "İlgili Teknik Daire"},
                               {"ozet": "Su faturası itirazı", "birim_tr": "Mali İşler"}],
              "bilgi_unsurlari": {"talepler": ["Sayacımın kontrol edilmesi"]}}
        r = talep_degerlendir(st, b)
        assert r["decompose_bulunan"] == 2 and r["cikar_bulunan"] == 1
        assert not r["tutarli"] and r["sayi_dogru"]
        assert r["alt_birim_dogru"] == [False, False]


class TestTalepCikarBasarisizligi:
    def test_tek_talepte_yalniz_bos_liste_basarisizdir(self):
        satir = {"id": "x", "metin": KAYNAK, "beklenen": _gold()}
        dolu = belge_degerlendir({"bilgi_unsurlari": {"talepler": ["İşyerinin denetlenmesi"]}}, satir)
        bos = belge_degerlendir({"bilgi_unsurlari": {"talepler": []}}, satir)
        assert not any(f.startswith("talep_cikar") for f in dolu["basarisizliklar"])
        assert "talep_cikar: bilgi_unsurlari.talepler boş" in bos["basarisizliklar"]


class TestMevzuatVePii:
    def test_mevzuat_hit_ve_yasak(self):
        st = {"mevzuat_onerileri": [{"kaynak_dosya": "3071_dilekce_hakki_kanunu"},
                                    {"kaynak_dosya": "5690_cimer_cb_kararnamesi"},
                                    {"kaynak_dosya": "5176_etik_kurulu_kanunu"},
                                    {"kaynak_dosya": "5393_belediye_kanunu"}]}
        r = mevzuat_degerlendir(st, _gold())
        assert r["hit"] and r["ilgili_sayi"] == 1 and len(r["top"]) == 3
        assert r["yasak"] == ["5176_etik_kurulu_kanunu"]

    def test_crag_duzeltilmis_liste_tercih_edilir(self):
        st = {"mevzuat_onerileri": [{"kaynak_dosya": "5176_etik_kurulu_kanunu"}],
              "mevzuat_onerileri_corrected": [{"kaynak_dosya": "3071_dilekce_hakki_kanunu"}]}
        assert mevzuat_degerlendir(st, _gold())["hit"]

    def test_ham_tckn_ve_telefon_yakalanir_maskeli_yakalanmaz(self):
        assert pii_tara({"ozet": "TCKN 10000000146"}) == ["ozet"]
        assert pii_tara({"bilgilendirme": "Tel 0555-123-4567"}) == ["bilgilendirme"]
        assert pii_tara({"ozet": "100******46 / 055********67"}) == []


class TestBelgeVeToplama:
    def test_iyi_taslak_kurumda_kullanilabilir(self):
        st = {"evrak_turu": "dilekce", "hedef_birim": "Fen İşleri Müdürlüğü",
              "muhatap_kurum": {"ad": "Keçiören Belediyesi", "slug": "k"},
              "yetkili_kurum": {"ad": "Keçiören Belediyesi", "slug": "k"},
              "bilgi_unsurlari": {"talepler": ["Çukurun kapatılması"]},
              "yazi_taslak_md": TASLAK_IYI,
              "mevzuat_onerileri": [{"kaynak_dosya": "3071_dilekce_hakki_kanunu"}]}
        r = belge_degerlendir(st, {"id": "x", "metin": KAYNAK, "beklenen": _gold()})
        assert r["kurumda_kullanilabilir"], r["basarisizliklar"]

    def test_bos_state_hata_olarak_kaydedilir(self):
        r = belge_degerlendir({}, {"id": "x", "metin": KAYNAK, "beklenen": _gold()},
                              {"hata": "timeout>240s", "sure_s": 240.0})
        assert not r["kurumda_kullanilabilir"]
        assert r["basarisizliklar"][0].startswith("hata:")

    def test_topla_wilson_ci_ve_kesilme_sayaci(self):
        satir = {"id": "x", "metin": KAYNAK, "beklenen": _gold()}
        r1 = belge_degerlendir({}, satir, {"llm": {"cagri": 9, "kesik": 1, "kesik_butce": {"960": 1}},
                                           "sure_s": 10.0})
        r2 = belge_degerlendir({}, satir, {"llm": {"cagri": 5, "kesik": 0}, "sure_s": 20.0})
        m = topla([r1, r2])
        assert m["json_kesilme_belge"]["k"] == 1 and m["json_kesilme_cagri"] == 1
        assert m["json_kesilme_butce"] == {"960": 1}
        assert m["llm_cagri_toplam"] == 14
        lo, hi = m["kurumda_kullanilabilir"]["ci95"]
        assert 0.0 <= lo <= hi <= 1.0
        assert m["sure_p50_s"] in (10.0, 20.0)


class TestAltinSet:
    """Altın setin ölçüt sözleşmesi: boyut, yetki-dışı ve çok-talepli alt kümeler."""

    def test_altin_set_boyut_ve_kapsam(self):
        satirlar = [json.loads(s) for s in GOLD.read_text(encoding="utf-8").splitlines() if s.strip()]
        b = [s["beklenen"] for s in satirlar]
        assert len(satirlar) >= 48
        assert len({s["id"] for s in satirlar}) == len(satirlar)
        assert sum(x["yetki"] == "DISARIDA" for x in b) >= 8
        assert sum(x["talep_sayisi"] > 1 for x in b) >= 10
        assert all(x["talep_sayisi"] == len(x["talep_detay"]) for x in b)
        assert all("10000000146" in s["metin"] or "TCKN" not in s["metin"] for s in satirlar)


# ------------------------------------------------------------ --dokum (insan incelemesi)
def _dokum_state():
    return {
        "evrak_turu": "dilekce", "yazi_taslak_md": TASLAK_IYI,
        "bilgi_unsurlari": {"konu": "Çukur", "talep_kumesi": [{"id": "t1", "ozet": "çukur"}],
                            "gelen_evrak": {"tur": "dilekce"}},
        "yonlendirme": {"karar": "havale", "birim": "Fen İşleri Müdürlüğü"},
        "gosterim_birimi": "Fen İşleri Müdürlüğü",
        "yazi_paketi": [{"rol": "havale", "yazi_taslak_md": "x", "format_uyumlu": True}],
        "risk_metadata": {"bant": "SARI", "skor": 0.4, "gerekceler": ["g1"]},
        "llm_izleri": [{"node": "cikar", "kesik": True}, {"node": "cikar"},
                       {"node": "ozetle", "yedege_dustu": True}],
        "mevzuat_bulunamadi": False,
    }


def test_dokum_satiri_memur_ciktilarini_ve_iz_ozetini_tasir():
    # Arrange
    state = _dokum_state()
    satir = {"id": "d1", "metin": KAYNAK, "beklenen": _gold()}
    r = belge_degerlendir(state, satir)
    # Act
    d = dokum_satiri(state, r)
    # Assert
    assert d["id"] == "d1" and d["konu"] == "Çukur"
    assert d["talep_kumesi"][0]["id"] == "t1" and d["gelen_evrak"] == {"tur": "dilekce"}
    assert d["gosterim_birimi"] == "Fen İşleri Müdürlüğü"
    assert d["yazi_paketi"] == [{"rol": "havale", "yazi_turu": None, "muhatap": None,
                                 "birim": None, "konu": None, "talep_ids": None,
                                 "yazi_taslak_md": "x"}]
    assert d["risk"]["bant"] == "SARI" and "skor" not in d["risk"]  # skor yüzde gibi okunmasın
    assert d["llm_izleri"]["toplam"] == 3
    assert d["llm_izleri"]["node"]["cikar"] == {"cagri": 2, "kesik": 1, "yedek": 0}
    assert d["mevzuat_bulunamadi"] is False and "basarisizliklar" in d
    json.dumps(d, ensure_ascii=False)  # serileşebilir


def test_dokum_satiri_bos_state_de_cokmez():
    satir = {"id": "bos", "metin": KAYNAK, "beklenen": _gold()}
    d = dokum_satiri({}, belge_degerlendir({}, satir, {"hata": "timeout>1s"}))
    assert d["hata"] == "timeout>1s" and d["yazi_paketi"] == [] and d["llm_izleri"]["toplam"] == 0


def test_dokum_yaz_id_sirali_jsonl(tmp_path):
    yol = dokum_yaz(tmp_path / "alt" / "d.jsonl", [{"id": "b", "x": "ç"}, {"id": "a"}])
    satirlar = [json.loads(s) for s in yol.read_text(encoding="utf-8").splitlines()]
    assert [s["id"] for s in satirlar] == ["a", "b"] and satirlar[1]["x"] == "ç"


def test_belge_kos_dokum_listesine_ekler():
    import asyncio

    class SahteGraf:
        async def ainvoke(self, _s):
            return _dokum_state()

    dokum: list = []
    satir = {"id": "d2", "metin": KAYNAK, "beklenen": _gold()}
    r = asyncio.run(_belge_kos(SahteGraf(), satir, asyncio.Semaphore(1), 5.0, dokum))
    assert r["id"] == "d2" and len(dokum) == 1 and dokum[0]["evrak_turu"] == "dilekce"


# ------------------------------------------------------------ 2026-10-05 inceleme düzeltmeleri
class TestYanlisNegatifDuzeltmeleri:
    """Ölçüm incelemesi: doğru çıktıyı başarısız sayan eval kuralları (yanlış negatifler)."""

    def test_unlu_dusmesi_ve_turetme_eki_konu_anahtarini_karsilar(self):
        from eval.e2e_eslesme import kok_icerir
        assert kok_icerir("Aile kabri yer tahsisi", ["mezar", "kabir"])
        assert kok_icerir("Yurt dışı çalışma sürelerinin borçlanılması", ["borçlanma"])
        assert kok_icerir("Kitabın iadesi", ["kitap"])  # ünsüz yumuşaması

    def test_cekim_kurali_alakasiz_sozcugu_eslemez(self):
        from eval.e2e_eslesme import kok_icerir, kok_varyantlari
        assert not kok_icerir("Kabul edilen başvuru", ["kabir"])
        assert not kok_icerir("Kablo döşenmesi", ["kabir"])
        assert kok_varyantlari("yol") == ["yol"]  # kısa sözcükte türetme serbestliği yok
        assert kok_varyantlari("kasa") == ["kasa"]  # geniş ünlü düşmez
        assert kok_varyantlari("su kesinti") == ["su kesinti"]  # çok sözcük: aynen

    def test_konu_kurali_cekimli_anahtari_gecirir(self):
        r = konu_degerlendir("Aile kabri yer tahsisi", "", ["kabir"])
        assert r["gecti"], r["neden"]

    def test_kisaltma_ve_tam_ad_ayni_sicil_kaydina_cozulur(self):
        from eval.e2e_eslesme import birim_dogru
        assert birim_dogru("İstanbul Su ve Kanalizasyon İdaresi Genel Müdürlüğü (devir)", ["İSKİ"])
        assert not birim_dogru("Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü (devir)",
                               ["İSKİ"])
        assert not birim_dogru("Fen İşleri Müdürlüğü", ["İSKİ"])

    def test_bilesik_tur_altinin_kabul_ettigi_turu_gecirir(self):
        from eval.e2e_gercek_eval import tur_degerlendir
        b = {"evrak_turu": "sikayet", "evrak_turu_kabul": ["dilekce", "talep"]}
        r = tur_degerlendir({"evrak_turu": "dilekce"}, b)
        assert r["operasyonel"] is False and r["bilesik"] is True
        assert tur_degerlendir({"evrak_turu": "ihbar"}, b)["bilesik"] is False


class TestYargiYolu:
    """3071 m.6/b: yargı merciinin görevi → devir YOK (m.5 yalnız idari makama devreder)."""

    B: ClassVar[dict] = {"yetki": "YARGI", "yetkili_kurum_kabul": []}

    def test_devirsiz_cikti_gecer(self):
        st = {"yonlendirme": {"karar": "ICERIDE", "talepler": [{"karar": "ICERIDE"}]},
              "muhatap_kurum": {"slug": "cankaya-tapu"}}
        assert yetki_degerlendir(st, self.B)["gecti"] is True

    def test_kaymakamliga_devir_basarisiz(self):
        st = {"yonlendirme": {"karar": "DISARIDA"}, "muhatap_kurum": {"slug": "cankaya-tapu"},
              "yetkili_kurum": {"slug": "cankaya-kaymakamligi", "ad": "Çankaya Kaymakamlığı"}}
        r = yetki_degerlendir(st, self.B)
        assert r["gecti"] is False and r["devir"] is True

    def test_talep_duzeyi_devir_de_yakalanir(self):
        st = {"yonlendirme": {"karar": "BELIRSIZ", "talepler": [{"karar": "DISARIDA"}]},
              "muhatap_kurum": {"slug": "t"}}
        assert yetki_degerlendir(st, self.B)["gecti"] is False

    def test_topla_yargi_metrigi_ve_basarisizlik_metni(self):
        satir = {"id": "y", "metin": KAYNAK, "beklenen": {**_gold(), "yetki": "YARGI",
                                                           "yetkili_kurum_kabul": []}}
        st = {"yonlendirme": {"karar": "DISARIDA"}, "muhatap_kurum": {"slug": "t"},
              "yetkili_kurum": {"slug": "k", "ad": "Çankaya Kaymakamlığı"}}
        r = belge_degerlendir(st, satir)
        assert any(n.startswith("yetki: yargı konusu devredildi") for n in r["basarisizliklar"])
        m = topla([r])
        assert m["yetki_yargi_devirsiz"]["k"] == 0 and m["yetki_yargi_devirsiz"]["n"] == 1


class TestPiiVeAntet:
    def test_pii_taramasi_yazi_paketini_kapsar(self):
        st = {"yazi_paketi": [{"yazi_taslak_md": "Havale — T.C. Kimlik No: 10000000146"},
                              {"yazi_taslak_md": "Tel: 0555-123-4567"},
                              {"yazi_taslak_md": "T.C. Kimlik No: 1000000****"}]}
        assert pii_tara(st) == ["yazi_paketi_0", "yazi_paketi_1"]

    def test_antet_birim_yer_tutucusu_ayri_olculur(self):
        from eval.e2e_gercek_eval import _birim_yer_tutucusu, antet_degerlendir
        b = {"muhatap_kabul": ["Çankaya Tapu"]}
        md = f"T.C.\nÇANKAYA TAPU MÜDÜRLÜĞÜ\n{_birim_yer_tutucusu()}\nSayı : E-1\n"
        r = antet_degerlendir(md, b)
        assert r["gecti"] is True and r["birim_yer_tutucu"] is True
        r2 = antet_degerlendir("T.C.\nÇANKAYA TAPU MÜDÜRLÜĞÜ\nSayı : E-1\n", b)
        assert r2["birim_yer_tutucu"] is False and r2["birim_satiri"] == ""


class TestAltinDuzeltmeleri:
    """Altın satırlarının mevzuat lafzına göre düzeltilmiş beklentileri (geri dönmesin)."""

    @staticmethod
    def _gold_map():
        return {json.loads(s)["id"]: json.loads(s)
                for s in GOLD.read_text(encoding="utf-8").splitlines() if s.strip()}

    def test_kat_mulkiyeti_yargi_yolu_devir_beklemez(self):
        g = self._gold_map()["tapu_kat_mulkiyeti"]["beklenen"]
        assert g["yetki"] == "YARGI" and g["yetkili_kurum_kabul"] == []
        assert not icerir_herhangi(" ".join(g["birim_kabul_edilebilir"]), ["Mahkeme"])

    def test_dilekcede_tckn_zorunlu_eksik_sayilmaz(self):
        g = self._gold_map()
        assert all("tckn_veya_kurum" not in s["beklenen"]["eksikler"] for s in g.values()
                   if s["beklenen"]["evrak_turu"] in ("dilekce", "sikayet", "talep"))

    def test_cimer_basvurusunda_islak_imza_beklenmez(self):
        g = self._gold_map()
        assert all("imza" not in s["beklenen"]["eksikler"] for s in g.values()
                   if s["beklenen"]["kanal"] == "cimer")

    def test_icra_senaryosu_baslik_ve_govde_tutarli(self):
        metin = self._gold_map()["sgk_icra_maas_haczi"]["metin"]
        assert "89/1" not in metin and "83. maddesi" in metin

    def test_iski_tam_adi_birim_kabulunde(self):
        g = self._gold_map()["ilce_kadikoy_su_kesintisi"]["beklenen"]
        assert "İstanbul Su ve Kanalizasyon" in g["birim_kabul_edilebilir"]
