"""Yazı kalitesi sertleştirmesi — kurum kimliği · konu kısaltma · çok-talep · çift kapanış.

Kullanıcı bulguları (2026-07-17):
  1. Antet "KAMU KURUMU" yer tutucusu → gerçek kurum yazılabilmeli (KURUM_ADI env).
  2. Konu tam cümle/paragraf değil KISA öz olmalı (Yön. 2646 m.13).
  3. Çok-talepli evrakta ("onarım olmazsa yeni direk") ikinci talep düşmemeli.
  4. "gereğinin yapılması arz edilir" + "Gereğini arz ederim" çift kapanış olmamalı.

Hepsi deterministik → mock modda (conftest LLM_MODE=mock) da geçer.
"""
from __future__ import annotations

import pytest

# ---------- #2 Konu kısaltma ----------

def test_uzun_konu_kisaltilir():
    from agents.nodes.cikar import _konu_kisa

    uzun = ("İkamet ettiğim sokaktaki aydınlatma direği uzun süredir arızalı olup "
            "akşam saatlerinden itibaren sokağımız tamamen karanlıkta kalmaktadır")
    kisa = _konu_kisa(uzun)
    assert len(kisa) < len(uzun)
    assert len(kisa.split()) <= 8


def test_kisa_konu_dokunulmaz():
    from agents.nodes.cikar import _konu_kisa

    assert _konu_kisa("Sokak Aydınlatması Arızası") == "Sokak Aydınlatması Arızası"


def test_konu_bos():
    from agents.nodes.cikar import _konu_kisa

    assert _konu_kisa("") == ""
    assert _konu_kisa("   ") == ""


# ---------- #3 Çok-talep çıkarımı ----------

def test_kosullu_ikinci_talep_yakalanir():
    """'onarım olmazsa yeni direk' — koşullu ikinci talep ayrı çıkmalı (decompose boşluğu)."""
    from agents.nodes.cikar import _talepleri_cikar

    metin = ("Sokağımızdaki aydınlatma direğinin onarılmasını, onarım mümkün değilse "
             "bölgeye yeni bir aydınlatma direği yerleştirilmesini talep ederim.")
    talepler = _talepleri_cikar(metin)
    assert len(talepler) >= 2, talepler
    birlesik = " ".join(talepler).lower()
    assert "onar" in birlesik and ("yeni" in birlesik or "direk" in birlesik)


def test_tek_talep_liste_uretmeyebilir():
    from agents.nodes.cikar import _talepleri_cikar

    talepler = _talepleri_cikar("Sokak lambasının onarılmasını arz ederim.")
    assert len(talepler) <= 1


def test_coklu_talep_govdeye_girer():
    """_fallback_body birden çok talep alınca hepsini özet cümlede yansıtmalı."""
    from yazi.yazi_render import _fallback_body

    govde = _fallback_body("cevabi_yazi", "Sokak Aydınlatması", has_ilgi=True,
                           talepler=["direğin onarılması", "yeni direk yerleştirilmesi"])
    assert "onar" in govde.lower() and "yeni direk" in govde.lower()


def test_fallback_karar_grounding_temiz():
    """Yeni fallback gövdeleri karar/inceleme uydurması içermemeli (verify KIRMIZI yapmasın)."""
    from agents.karar_grounding import karar_grounding_veto
    from yazi.yazi_render import _fallback_body

    for tur in ("cevabi_yazi", "gorus_mutalaa", "ust_yazi", "bilgilendirme"):
        g = _fallback_body(tur, "test konusu", has_ilgi=True, talepler=["onarılması", "yenilenmesi"])
        assert karar_grounding_veto(g, "test konusu talebi") == [], f"{tur}: {g}"


# ---------- #4 Çift kapanış kırpma ----------

@pytest.mark.parametrize("govde,kalan_var", [
    ("Söz konusu husus değerlendirilmiştir. Gereğinin yapılması arz edilir.", True),
    ("Konu ilgili birime iletilmiştir. Gereğinin yapılması arz olunur.", True),
    ("Başvuru kayda alınmıştır. Bilgilerinize arz edilir.", True),
])
def test_govde_ici_kapanis_kirpilir(govde, kalan_var):
    """Gövde sonundaki bağımsız kapanış cümlesi kırpılır (şablon kapanışı ayrıca basar)."""
    from yazi.yazi_render import _kapanis_kuyrugu_kirp

    kirpik = _kapanis_kuyrugu_kirp(govde)
    assert "arz edilir" not in kirpik.lower()
    assert "arz olunur" not in kirpik.lower()
    if kalan_var:
        assert kirpik.strip()  # gövdenin ilk cümlesi kalır


def test_cumle_ortasi_arz_korunur():
    """Cümle ORTASINDAKİ 'arz ederim' kırpılmaz — yalnız son bağımsız kapanış."""
    from yazi.yazi_render import _kapanis_kuyrugu_kirp

    g = "Talebin arz edilen gerekçelerle değerlendirilmesi uygun görülmektedir."
    assert _kapanis_kuyrugu_kirp(g) == g


# ---------- #1 Kurum kimliği ----------
# NOT: env→_DEMO_DEFAULTS bağı import-time okunur (models.py). importlib.reload İLE test etmek
# global state'i kirletir (diğer modüller eski referansı tutar → başka testler flaky) — bu yüzden
# reload YOK. _DEMO_DEFAULTS→antet bağı monkeypatch.setitem ile (reload'suz, otomatik geri alınır)
# test edilir; env→_DEMO_DEFAULTS bağı ayrıca canlı smoke ile kanıtlandı ("NİLÜFER BELEDİYE").

def test_kurum_kimligi_antete_yazilir(monkeypatch):
    """_DEMO_DEFAULTS'taki kurum kimliği antet çıktısına (jinja_vars) yansımalı + grounding muaf."""
    import yazi.models as m
    from yazi.yazi_render import build_context
    monkeypatch.setitem(m._DEMO_DEFAULTS, "idare_adi", "NİLÜFER BELEDİYE BAŞKANLIĞI")
    # jinja_vars fallback _DEMO_DEFAULTS'tan besleniyor → antet gerçek kurumu taşır (idare_adi).
    ctx = build_context("cevabi_yazi", {"konu": "test"}, "gövde")
    assert ctx.jinja_vars()["idare_adi"] == "NİLÜFER BELEDİYE BAŞKANLIĞI"
    # Grounding muafiyeti otomatik hizalanır (gerçek kurum adı uydurma sayılmaz).
    assert "NİLÜFER BELEDİYE BAŞKANLIĞI" in m.sablon_iskelet_degerleri()


def test_kurum_adi_bos_ise_jenerik_korunur():
    """ENV yokken (test ortamı) baseline jenerik değer korunur (baseline riski sıfır)."""
    import yazi.models as m
    assert m._DEMO_DEFAULTS["idare_adi"] == "KAMU KURUMU"


# ---------- antet birimi evrağa göre değişir (her evrakta aynı değil) ----------

def test_antet_birimi_hazirlayan_birimle_degisir():
    """Hazırlayan birim (servis_birimi) verilince antet o müdürlüğü yazar; boşsa jenerik/env."""
    from yazi.yazi_render import build_context

    unsur = {"konu": "Aydınlatma arızası", "gonderen": "Derya Aksoy", "tarih": "06.07.2026"}
    ctx_fen = build_context("cevabi_yazi", unsur, "gövde", hazirlayan_birim="Fen İşleri Müdürlüğü")
    assert ctx_fen.jinja_vars()["birim_adi"] == "Fen İşleri Müdürlüğü"
    ctx_ruhsat = build_context("cevabi_yazi", unsur, "gövde", hazirlayan_birim="Ruhsat Denetim Müdürlüğü")
    assert ctx_ruhsat.jinja_vars()["birim_adi"] == "Ruhsat Denetim Müdürlüğü"
    # Boş → jinja_vars _DEMO_DEFAULTS'a düşer (env/jenerik) — her evrakta sabit değil ama fallback var.
    ctx_bos = build_context("cevabi_yazi", unsur, "gövde")
    assert ctx_bos.jinja_vars()["birim_adi"]  # boş değil (fallback dolu)


def test_servis_birimi_grounding_muaf():
    """Antete giren servis birimi ('Fen İşleri Müdürlüğü') grounding'de uydurma sayılmamalı."""
    from agents.servis_birim import SERVIS_BIRIM_TR
    from yazi.models import sablon_iskelet_degerleri
    # verify iskelet_kaynak SERVIS_BIRIM_TR'yi de içerir (kod okunmuş; burada değer var mı bak).
    assert "Fen İşleri Müdürlüğü" in SERVIS_BIRIM_TR.values()
    # sablon_iskelet_degerleri kurum kimliğini taşır (kurum adı da muaf).
    assert sablon_iskelet_degerleri()  # non-empty


# ---------- dinamik antet: kurum kimliği evraktan (2026-07-17 kullanıcı bulgusu) ----------
# Antet her evrakta sabit env kurumu ("NİLÜFER ...") yazıyordu; gelen evrakın kurumuna
# göre değişmeli. Ayrıca servis_birimi dict'e dönünce zengin render yolu TypeError ile
# fakir iskelete düşüyordu (ekran görüntüsündeki taslak birebir _fallback_taslak çıktısıydı).

_BAKANLIK_EVRAK = """T.C.
SANAYİ VE TEKNOLOJİ BAKANLIĞI
Strateji Geliştirme Başkanlığı

Sayı : E-31204765-045-2026/0987
Tarih: 27.05.2026
Konu : Doğrudan temin sınırı hakkında hukuki mütalaa talebi

4734 sayılı Kanun'un 22. maddesi kapsamında yıl içinde yapılan doğrudan temin
alımlarında parasal sınırın hesaplanmasına ilişkin tereddüt oluşmuştur. Konuya
dair hukuki görüş ve mütalaanızın bildirilmesini arz ederim.

Birim Amiri
Mali Hizmetler Uzmanı
e-imza
"""

_FALLBACK_IMZASI = "EBYS onayı öncesinde oluşturulmuştur"  # yalnız iskelet gövdesinde geçer


async def test_servis_birimi_dict_zengin_yolu_dusurmez():
    """REGRESYON: servis_birimi dict'i ({kod,ad,sinyal}) unhashable-TypeError ile
    taslağı _fallback_taslak iskeletine düşürüyordu — zengin yol ayakta kalmalı."""
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "dilekce",
        "evrak_text": "Sokağımızdaki aydınlatma direğinin onarılmasını arz ederim.",
        "bilgi_unsurlari": {"konu": "Aydınlatma Direği Onarımı", "tarih": "06.07.2026"},
        "servis_birimi": {"kod": "fen_isleri", "ad": "Fen İşleri Müdürlüğü",
                          "sinyal": ["aydınlatma"]},
    })
    assert _FALLBACK_IMZASI not in out["yazi_taslak_md"]
    assert "Fen İşleri Müdürlüğü" in out["yazi_taslak_md"]  # antet birimi konudan


async def test_antet_idare_tek_kurum():
    """TEK-KURUM (19 Tem): bakanlıktan gelen görüş evrağının taslağı bile AKTİF kurum
    antedi taşır — gelen kurum (bakanlık) antede SIZMAZ (env'e düşer)."""
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "gorus_mutalaa",
        "evrak_text": _BAKANLIK_EVRAK,
        "bilgi_unsurlari": {"konu": "Doğrudan Temin Sınırı Hakkında Hukuki Mütalaa",
                            "sayi": "E-31204765-045-2026/0987", "tarih": "27.05.2026"},
    })
    md = out["yazi_taslak_md"]
    assert _FALLBACK_IMZASI not in md
    assert "KAMU KURUMU" in md                            # antet = aktif kurum (test env boş)
    assert out["antet_meta"]["idare"] == "KAMU KURUMU"
    assert "SANAYİ VE TEKNOLOJİ BAKANLIĞI" not in md      # gelen kurum antede sızmaz
    # Görüş türünün tür-özgü varsayılanı: hazırlayan birim Hukuk Müşavirliği (m.10 title case).
    assert "Hukuk Müşavirliği" in md
    # İlgi gelen belgenin gerçek tarih+sayısını taşır ("Başvurunuz." iskeleti değil — m.15/7).
    assert "27.05.2026 tarihli ve E-31204765-045-2026/0987 sayılı yazınız." in md


async def test_antet_aktif_kurum_istek_bazli_override():
    """19 Tem revizyon: state['aktif_kurum'] doluysa antet ENV'İ EZER — sabit tek-tenant
    zorunlu değil, her demo senaryosu kendi aktif kurumunu geçirebilir."""
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "dilekce",
        "evrak_text": "Merhaba, sokağımızda çöpler toplanmıyor. Gereğini arz ederim.",
        "bilgi_unsurlari": {"konu": "Çöp Toplama"},
        "aktif_kurum": "Odunpazarı Belediye Başkanlığı",
    })
    md = out["yazi_taslak_md"]
    assert "ODUNPAZARI BELEDİYE BAŞKANLIĞI" in md
    assert "KAMU KURUMU" not in md
    assert out["antet_meta"]["idare"] == "ODUNPAZARI BELEDİYE BAŞKANLIĞI"


async def test_gorus_muhatabi_talep_eden_birim():
    """Görüş yazısının muhatabı görüşü TALEP EDEN birimdir (m.14; Diyanet örneği deseni)."""
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "gorus_mutalaa",
        "evrak_text": _BAKANLIK_EVRAK,
        "bilgi_unsurlari": {"konu": "Doğrudan Temin Sınırı"},
    })
    assert "STRATEJİ GELİŞTİRME BAŞKANLIĞINA" in out["yazi_taslak_md"]
    assert out["antet_meta"]["muhatap"] == "STRATEJİ GELİŞTİRME BAŞKANLIĞINA"


async def test_antet_kurum_tespit_yoksa_env_fallback():
    """Evrakta kurum kalıbı yoksa antet env/jenerik varsayılanı korur (baseline riski sıfır)."""
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "dilekce",
        "evrak_text": "Merhaba, sokağımızda çöpler toplanmıyor. Gereğini arz ederim.",
        "bilgi_unsurlari": {"konu": "Çöp Toplama"},
    })
    assert "KAMU KURUMU" in out["yazi_taslak_md"]  # test ortamında KURUM_ADI env yok


async def test_kaynak_dogrulanmis_hedef_birim_antete_yazilir():
    """Route ajanının kaynak-doğrulanmış birimi antet hazırlayan BİRİMİ olur (İDARE değil).

    TEK-KURUM (19 Tem): antet İDARE = aktif kurum (env); gelen 'YENİMAHALLE BELEDİYESİ'
    antede sızmaz. BİRİM satırı ise kaynak-doğrulanmış hedef birimden gelir (değişmedi).
    """
    from agents.nodes.yazi_taslak import yazi_taslak_node

    out = await yazi_taslak_node({
        "evrak_turu": "dilekce",
        "evrak_text": "T.C.\nYENİMAHALLE BELEDİYE BAŞKANLIĞINA\n\nSokak aydınlatması arızalıdır.",
        "bilgi_unsurlari": {"konu": "Sokak Aydınlatması"},
        "hedef_birim": "Fen İşleri Müdürlüğü",
        "durum": "kaynak_dogrulandi",
    })
    md = out["yazi_taslak_md"]
    assert "KAMU KURUMU" in md                     # antet İDARE = aktif kurum (tek-kurum)
    assert "YENİMAHALLE BELEDİYESİ" not in md       # gelen kurum antede sızmaz
    assert "Fen İşleri Müdürlüğü" in md            # kaynak-doğrulanmış hazırlayan birim


def test_hitap_eki_unlu_uyumu():
    """m.14/2 yönelme eki: arka ünlü → -NA, ön ünlü → -NE; ünsüzle biten ad aynen kalır."""
    from agents.kurum_kimlik import hitap_eki

    assert hitap_eki("Strateji Geliştirme Başkanlığı") == "STRATEJİ GELİŞTİRME BAŞKANLIĞINA"
    assert hitap_eki("İnsan Kaynakları Genel Müdürlüğü") == "İNSAN KAYNAKLARI GENEL MÜDÜRLÜĞÜNE"
    assert hitap_eki("Yenimahalle Belediyesi") == "YENİMAHALLE BELEDİYESİNE"
    assert hitap_eki("") == ""


def test_gonderen_birim_tespit_antetten():
    """Gelen antette idare satırını izleyen birim satırı tespit edilir; meta satırlar atlanır."""
    from agents.kurum_kimlik import gonderen_birim_tespit

    assert gonderen_birim_tespit(_BAKANLIK_EVRAK) == "Strateji Geliştirme Başkanlığı"
    assert gonderen_birim_tespit("T.C.\nANKARA VALİLİĞİ\n\nSayı : 123\nKonu : Test") == ""
    assert gonderen_birim_tespit("") == ""


def test_llm_halusinasyon_kurum_antete_giremez():
    """Adversarial V1: kaynakta hiç geçmeyen LLM 'kurum' çıkarımı antete/muafiyete SOKULMAZ."""
    from agents.kurum_kimlik import muhatap_kurum_tespit

    kaynak = "Sokağımızdaki aydınlatma direği arızalıdır. Onarılmasını arz ederim."
    # Halüsinasyon: 'Yenimahalle' kaynakta yok → boş künye (env fallback devralır).
    assert muhatap_kurum_tespit(kaynak, {"kurum": "Yenimahalle Belediyesi"})["ad"] == ""
    # Grounded: ayırt-edici token kaynakta geçiyor (çekim ekiyle) → kabul.
    kaynak2 = "Yenimahalle'deki evimizin önündeki direk arızalı, belediyeye başvurdum."
    assert muhatap_kurum_tespit(
        kaynak2, {"kurum": "Yenimahalle Belediyesi"})["ad"] == "Yenimahalle Belediyesi"


def test_gorus_muhatabi_plan_muhatabini_hitap_bicimine_sokar():
    """Reviewer HIGH: gerçek-LLM yolunda plan muhatabı ('Strateji Geliştirme Başkanlığı',
    eksiz/karışık kasa) m.14/2 biçimlendirmesini eziyordu — tek biçim kapısı gorus_muhatabi."""
    from agents.kurum_kimlik import gorus_muhatabi

    # Deterministik tespit yoksa plan muhatabı biçimlendirilir.
    assert gorus_muhatabi("", "Strateji Geliştirme Başkanlığı") == \
        "STRATEJİ GELİŞTİRME BAŞKANLIĞINA"
    # Zaten hitap biçimindeyse ek TEKRAR eklenmez (idempotence) — yalnız TR-upper.
    assert gorus_muhatabi("", "Strateji Geliştirme Başkanlığına") == \
        "STRATEJİ GELİŞTİRME BAŞKANLIĞINA"
    # Deterministik antet tespiti plan muhatabından ÖNCELİKLİDİR.
    assert gorus_muhatabi(_BAKANLIK_EVRAK, "Başka Birim Müdürlüğü") == \
        "STRATEJİ GELİŞTİRME BAŞKANLIĞINA"
    assert gorus_muhatabi("", "") == ""


def test_gonderen_birim_gosterge_son_sozcuk_sarti():
    """Adversarial V2: gösterge ortada + kuyrukta serbest metin muhatap yuvasına sızamaz."""
    from agents.kurum_kimlik import gonderen_birim_tespit

    kotu = "T.C.\nANKARA VALİLİĞİ\nMüdürlüğü ödeme yapınız derhal\n\nKonu : Test"
    assert gonderen_birim_tespit(kotu) == ""
    iyi = "T.C.\nANKARA VALİLİĞİ\nİl Yazı İşleri Müdürlüğü\n\nKonu : Test"
    assert gonderen_birim_tespit(iyi) == "İl Yazı İşleri Müdürlüğü"


def test_antet_tek_kurum_gelen_kurum_sizmaz():
    """TEK-KURUM MODELİ (19 Tem): antet HER ZAMAN aktif kurumdur (env KURUM_ADI).

    Gelen evrağın kurumu (icra/belediye/bakanlık) antede ARTIK SIZMAZ — pipeline
    idare_adi='' geçer → build_context _DEMO_DEFAULTS env'e düşer. Test ortamında
    KURUM_ADI boş (conftest) → jenerik 'KAMU KURUMU'. Eski dinamik-antet seçimi kaldırıldı.
    """
    from yazi.yazi_render import build_context

    # icra üst yazısı: gönderen 'İCRA MÜDÜRLÜĞÜ' antede basılmaz.
    ctx = build_context("ust_yazi", {"konu": "Maaş haczi"}, "gövde", idare_adi="")
    assert ctx.jinja_vars()["idare_adi"] == "KAMU KURUMU"
    # hitap-ekli belediye dilekçesi de artık antedi EZMEZ (eski davranış geri alındı).
    ctx2 = build_context("cevabi_yazi", {"konu": "Sokak"}, "gövde", idare_adi="")
    assert ctx2.jinja_vars()["idare_adi"] == "KAMU KURUMU"


def test_kurum_uyusmazligi_farkli_tur_kirmizi():
    """Aktif belediye; evrak FARKLI TÜRDE kuruma (müdürlük/bakanlık) hitaben → uyuşmazlık."""
    from agents.kurum_kimlik import kurum_uyusmazligi

    aktif = "ÖRNEKŞEHİR BELEDİYE BAŞKANLIĞI"
    saglik = "İL SAĞLIK MÜDÜRLÜĞÜNE\n\nRandevu sistemi şikayeti."
    u = kurum_uyusmazligi(saglik, {}, aktif)
    assert u is not None and u["tur"] == "mudurluk"
    bakanlik = "ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞINA\n\nİmar planı görüşü."
    assert kurum_uyusmazligi(bakanlik, {}, aktif) is not None


def test_kurum_uyusmazligi_ayni_tur_stand_in():
    """Aktif belediye; evrak BAŞKA bir belediyeye hitaben → aynı tür = stand-in, uyuşmazlık YOK."""
    from agents.kurum_kimlik import kurum_uyusmazligi

    aktif = "ÖRNEKŞEHİR BELEDİYE BAŞKANLIĞI"
    dilekce = "ODUNPAZARI BELEDİYE BAŞKANLIĞINA\n\nSokağımızdaki yol bozuk."
    assert kurum_uyusmazligi(dilekce, {}, aktif) is None


def test_kurum_uyusmazligi_yargi_ve_bos_aktif_muaf():
    """Yargı kurumu DIŞ kaynak → muaf; aktif kurum tanımsızsa (baseline) kontrol yapılmaz."""
    from agents.kurum_kimlik import kurum_uyusmazligi

    aktif = "ÖRNEKŞEHİR BELEDİYE BAŞKANLIĞI"
    icra = "ANKARA 5. İCRA MÜDÜRLÜĞÜNE\n\nSayı : 2026/4587 E."  # hitap-ekli ama yargı
    assert kurum_uyusmazligi(icra, {}, aktif) is None      # yargı muaf
    saglik = "İL SAĞLIK MÜDÜRLÜĞÜNE\n\nşikayet."
    assert kurum_uyusmazligi(saglik, {}, "") is None       # aktif boş → kontrol yok


def test_muzekkere_muhatabi_gonderen_mahkeme_hitapli():
    """Müzekkere cevabının muhatabı gönderen mahkeme/icra — m.14/2 hitap-ekli."""
    from yazi.yazi_render import build_context

    ctx = build_context("muzekkere", {"gonderen": "Ankara 12. Asliye Hukuk Mahkemesi",
                                       "konu": "Bilgi istemi"}, "gövde")
    assert ctx.muhatap == "ANKARA 12. ASLİYE HUKUK MAHKEMESİNE"


# --- SGK bulgusu (2026-07-18): idari kurum müzekkeresi → antet DİNAMİK, "KAMU KURUMU" değil ---
_SGK_MUZEKKERE = """T.C.
SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI
Hukuk Müşavirliği

Sayı : E-72615498-640-2026/2210
Konu : Müzekkere — sigortalılık kayıtlarının celbi

İdaremiz aleyhine açılan davada kullanılmak üzere kişinin kayıtlarının
Müşavirliğimize gönderilmesi rica ederim.
"""


def test_idari_kurum_muzekkere_antedi_tek_kurum():
    """TEK-KURUM (19 Tem): idari kurum (SGK) müzekkeresinde bile antet aktif kurumdur.

    Eski davranış (SGK başlığı antede geçer) KALDIRILDI — antet env'e düşer; SGK adı
    yalnız muhatap/gönderen alanlarında kullanılır, antet kaynağı DEĞİLDİR.
    """
    from yazi.yazi_render import build_context

    ctx = build_context("muzekkere", {"konu": "Kayıt celbi"}, "gövde", idare_adi="")
    assert ctx.jinja_vars()["idare_adi"] == "KAMU KURUMU"


def test_yargi_kurumu_tespiti():
    """is_yargi_kurumu — mahkeme/icra/savcılık YARGI, idari kurum değil (mismatch muafiyeti)."""
    from agents.kurum_kimlik import is_yargi_kurumu

    assert is_yargi_kurumu({"ad": "Ankara 12. Asliye Hukuk Mahkemesi"}) is True
    assert is_yargi_kurumu({"ad": "Ankara 5. İcra Müdürlüğü"}) is True
    assert is_yargi_kurumu({"ad": "Sosyal Güvenlik Kurumu Başkanlığı"}) is False


def test_muzekkere_idari_ic_muhatap_talep_eden_birim():
    """İdari iç müzekkere (SGK) muhatabı = talep eden birim (antet 3. satır), hitap-ekli."""
    from agents.kurum_kimlik import muzekkere_muhatabi

    assert muzekkere_muhatabi(_SGK_MUZEKKERE, "Sosyal Güvenlik Kurumu Başkanlığı") == \
        "HUKUK MÜŞAVİRLİĞİNE"


def test_muzekkere_yargi_muhatap_gonderen_makam():
    """Yargı müzekkeresi muhatabı = gönderen makam (mahkeme/icra), hitap-ekli."""
    from agents.kurum_kimlik import muzekkere_muhatabi

    mah = "T.C.\nANKARA 12. ASLİYE HUKUK MAHKEMESİ\n\nSayı : 2026/456 Esas"
    assert muzekkere_muhatabi(mah, "Ankara 12. Asliye Hukuk Mahkemesi") == \
        "ANKARA 12. ASLİYE HUKUK MAHKEMESİNE"


def test_muzekkere_muhatap_vatandas_adi_sizdirmaz():
    """GÜVENLİK: gerçek-kişi gönderen adı müzekkere muhatap yuvasına sızmaz."""
    from agents.kurum_kimlik import muzekkere_muhatabi

    assert muzekkere_muhatabi("", "Ayşe Yılmaz") == ""


def test_gonderen_birim_yapisal_sgk_tespiti():
    """Yapısal tespit: T.C. sonrası idare + birim — SGK gibi kalıp-dışı kurumda da çalışır."""
    from agents.kurum_kimlik import gonderen_birim_tespit

    assert gonderen_birim_tespit(_SGK_MUZEKKERE) == "Hukuk Müşavirliği"
    # Bakanlık (görüş regresyonu) hâlâ çalışır.
    san = "T.C.\nSANAYİ VE TEKNOLOJİ BAKANLIĞI\nStrateji Geliştirme Başkanlığı\n\nSayı : 1"
    assert gonderen_birim_tespit(san) == "Strateji Geliştirme Başkanlığı"


def test_ilgi_ust_yazi_m15_6_iyelik_ekli():
    """İletim (ust_yazi) İlgi satırı m.15/6: gönderen idare adı + iyelik eki + 'yazısı'."""
    from yazi.yazi_render import _ilgi_satirlari

    ilgi = _ilgi_satirlari({"gonderen": "Ankara 5. İcra Müdürlüğü",
                            "tarih": "10.07.2026", "sayi": "2026/4587 E."}, "ust_yazi")
    assert ilgi == ("Ankara 5. İcra Müdürlüğünün 10.07.2026 tarihli ve 2026/4587 E. sayılı yazısı.",)


def test_bilinmeyen_servis_kodu_antete_sizmaz():
    """birim_tr 9-set dışı servis kodunu ('park_bahce') Türkçe ada çözer (ham kod sızmaz)."""
    from agents.config import birim_tr

    assert birim_tr("park_bahce") == "Park ve Bahçeler Müdürlüğü"
    assert birim_tr("fen_isleri") == "Fen İşleri Müdürlüğü"


def test_cevap_konusu_talep_kuyrugu_duser():
    """Görüş/müzekkere cevabının konusundan SON talep kelimesi düşer; öncesi korunur."""
    from yazi.yazi_render import _cevap_konusu

    assert _cevap_konusu("Doğrudan Temin Sınırı Hakkında Hukuki Mütalaa Talebi",
                         "gorus_mutalaa") == "Doğrudan Temin Sınırı Hakkında Hukuki Mütalaa"
    assert _cevap_konusu("Emlak Vergisi Kayıtları İstemi", "muzekkere") == \
        "Emlak Vergisi Kayıtları"
    # olur/cevabi türlerinde dokunulmaz.
    assert _cevap_konusu("Personel Görevlendirme Talebi", "olur") == \
        "Personel Görevlendirme Talebi"
    # Kırpınca <2 sözcük kalırsa dokunma (boş/anlamsız konu üretme).
    assert _cevap_konusu("Görüş talebi", "gorus_mutalaa") == "Görüş talebi"


def test_gorus_fallback_havada_kalmaz():
    """Görüş fallback gövdesi kapalı-uçlu cevap çerçevesiyle biter (havada kalmaz)."""
    from yazi.yazi_render import _fallback_body

    g = _fallback_body("gorus_mutalaa", "doğrudan temin sınırı", has_ilgi=True)
    assert "ayrıca bildirilecektir" in g


def test_gorus_mutalaa_tur_varsayilanlari_muaf():
    """Tür-özgü antet/imza varsayılanları grounding muafiyetinde (KIRMIZI yanlış-pozitif yok)."""
    from yazi.models import sablon_iskelet_degerleri

    degerler = sablon_iskelet_degerleri()
    assert "Hukuk Müşavirliği" in degerler
    assert "Hukuk Müşaviri" in degerler
