"""Resmi forma tutarli bir gorsel dil giydirir + form-ici yonerge metinlerini kaldirir.

Ilke: FORMUN YAPISI DOKUNULMAZ (kapak, logo, basliklar, tablolar, bolum sirasi).
Degisen yalnizca BICIM: baslik hiyerarsisi, tablo basliklarinin ayni dile getirilmesi,
zebra seritler, hucre nefes payi, sayfa sonlarinda basligin icerikten kopmamasi.

Yonerge metinleri ("Arastirma onerisinde ele alinan konunun kapsami...") basvuru
sahibine YAZIM TALIMATIDIR; teslim edilen metinde islevi yoktur. Kaldirilmasi hem
yaklasik uc sayfa kazandirir hem de panelistin gozunde metni yonergeden ayirir.
"""
import re
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from bicim import (bicimle, golge, hucre_kenarlik, hucre_bosluk, LACIVERT,
                   BASLIK_ZEMIN, SERIT_ZEMIN)

BEYAZ = RGBColor(0xFF, 0xFF, 0xFF)

# Formun kendi yonerge paragraflarinin acilis metinleri (resmi formdan cikarildi).
YONERGE_ONEKLERI = [
    "Araştırma önerisi özetinin",
    "Araştırma önerisinde ele alınan konunun kapsamı",
    "Projenin konusu, 12. Kalkınma Planı",
    "Araştırma önerisinin amacı ve hedefleri açık",
    "Araştırmada uygulanacak yöntem ve araştırma tekniklerinin",
    "Yöntem bölümünün; araştırma tasarımı",
    "Araştırmada yer alacak başlıca faaliyetler",
    "Araştırmanın başarısını olumsuz yönde etkileyebilecek riskler",
    "Bu bölümde projenin yürütüleceği kurum ve kuruluşlarda",
    "Araştırma önerisi kapsamındaki çalışmadan elde edilmesi öngörülen",
    "Sadece araştırma önerisinin değerlendirilmesine katkı",
    "(*) Çizelgedeki satırlar",
    "(**) Literatür taraması",
    "(***) Başarı ölçütü",
    "(*) Tablodaki satırlar",
]

# Ana bolum basliklari (buyuk) ve alt basliklar (kucuk)
ANA_BASLIK = [
    "A. GENEL BİLGİLER", "ÖZET", "ARAŞTIRMA ÖNERİSİNİN BİLİMSEL NİTELİĞİ",
    "YÖNTEM", "PROJE YÖNETİMİ", "ARAŞTIRMA ÖNERİSİNİN YAYGIN ETKİSİ",
    "5. BELİRTMEK İSTEDİĞİNİZ DİĞER KONULAR", "6. EKLER",
]
ALT_BASLIK_DESEN = re.compile(r"^\s*\d\.\d\.?\s*\S|^ÇALIŞMA TAKVİMİ|^RİSK YÖNETİMİ TABLOSU"
                              r"|^ARAŞTIRMA OLANAKLARI TABLOSU|^Çalışma Takvimi"
                              r"|^Risk Yönetimi|^Amaç ve Hedefler|^EK-1")


def yonergeleri_kaldir(doc):
    """Form-ici yazim talimatlarini siler. Kac tanesinin eslestigini dondurur."""
    silinen, kalan_onek = 0, list(YONERGE_ONEKLERI)
    for p in list(doc.paragraphs):
        t = p.text.strip()
        if not t:
            continue
        for onek in YONERGE_ONEKLERI:
            if t.startswith(onek):
                p._element.getparent().remove(p._element)
                silinen += 1
                if onek in kalan_onek:
                    kalan_onek.remove(onek)
                break
    return silinen, kalan_onek


def yer_tutuculari_temizle(doc):
    """Tablolardaki 'En az 350 karakter...' yer tutucularini siler (doldurulmayan kalirsa)."""
    n = 0
    for t in doc.tables:
        for r in t.rows:
            for c in r.cells:
                if c.text.strip().startswith("En az 350 karakter"):
                    c._element.clear_content()
                    bicimle(c.add_paragraph().add_run(""), size=9)
                    n += 1
    return n


def basliklari_bicimle(doc):
    """Baslik hiyerarsisi: ana basliklar lacivert + alt cizgi, alt basliklar lacivert kalin."""
    ana, alt = 0, 0
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t or len(t) > 90:
            continue
        buyuk = any(t.startswith(b) or t == b for b in ANA_BASLIK) or \
            re.match(r"^\d\.\s*[A-ZÇĞİÖŞÜ]", t) is not None
        kucuk = ALT_BASLIK_DESEN.match(t) is not None

        if not (buyuk or kucuk):
            continue
        pf = p.paragraph_format
        # keepNext eskiden BİLİNÇLİ OLARAK KAPALIYDI: formun her bölümü tek satırlık bir
        # tabloyken o satır bir sayfadan uzun oluyor, "başlığı takip edenle birlikte tut"
        # kuralı asla sağlanamıyor ve Word başlığı yalnız bırakıp tabloyu sonraki sayfaya
        # atıyordu (ölçüldü: dört neredeyse boş sayfa).
        #
        # 8 Ağu: o gerekçe artık geçerli değil — akis.py içerik kutularını gövde akışına
        # çevirdi, dolayısıyla başlığı izleyen şey artık normal bir paragraf. Yeniden
        # açıldı ve ÖLÇÜLDÜ: boş sayfa dönmedi, sayfa altında yalnız kalan başlık
        # (ölçülen: "3.2 Risk Yönetimi") düzeldi. Kapatmadan önce sayfa dökümüne bakın.
        pf.keep_with_next = True
        pf.space_before = Pt(11 if buyuk else 8)
        pf.space_after = Pt(4 if buyuk else 3)
        for r in p.runs:
            bicimle(r, size=11 if buyuk else 9.5, bold=True, renk=LACIVERT)
        if buyuk:
            pPr = p._p.get_or_add_pPr()
            for eski in pPr.findall(qn("w:pBdr")):
                pPr.remove(eski)
            bdr = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "8")
            bottom.set(qn("w:space"), "3")
            bottom.set(qn("w:color"), "1F3864")
            bdr.append(bottom)
            pPr.append(bdr)
            ana += 1
        else:
            alt += 1
    yetim = bos_paragrafla_zinciri_koru(doc)
    return ana, alt, yetim


def bos_paragrafla_zinciri_koru(doc):
    """keepNext zincirini BOS paragraflarin kirmasini engeller.

    Olculdu: baslikla icerigi arasinda bos bir ayirac paragrafi var. keepNext
    basligi yalniz BIR SONRAKI paragrafa baglar; o paragraf bos oldugu icin kural
    onemsizce saglaniyor, ikisi birlikte sayfanin dibinde kaliyor ve baslik yine
    YETIM oluyordu ("ARAŞTIRMA ÖNERİSİNİN BİLİMSEL NİTELİĞİ", 2. sayfanin sonu).

    Cozum: keepNext'i bos paragraflar boyunca ILERI TASI, ta ki gercek metin
    tasiyan bir paragrafa ulasana kadar. Boylece baslik + bosluk + ilk gercek
    satir birlikte tasinir.
    """
    p = list(doc.paragraphs)
    duzeltilen = 0
    for i, par in enumerate(p):
        if not par.paragraph_format.keep_with_next:
            continue
        j = i + 1
        while j < len(p) and not p[j].text.strip():
            if not p[j].paragraph_format.keep_with_next:
                p[j].paragraph_format.keep_with_next = True
                duzeltilen += 1
            j += 1
    return duzeltilen


def baslik_satirini_tekrarla(tablo):
    """Sayfa asan tabloda baslik satirini her sayfada yineler."""
    tr = tablo.rows[0]._tr
    trPr = tr.get_or_add_trPr()
    e = OxmlElement("w:tblHeader")
    e.set(qn("w:val"), "true")
    trPr.append(e)


def form_tablosunu_bicimle(tablo, baslikli=True, zebra=True, tekrar=False):
    """Formun kendi tablosunu ic ice tablolarla AYNI gorsel dile getirir."""
    for i, r in enumerate(tablo.rows):
        for c in r.cells:
            hucre_kenarlik(c)
            # Hucre dolgusu 40 -> 28 twip (yaklasik 2 -> 1,4 pt). Bu, ICERIKTEN
            # kesmeden dikey yer kazandiran tek kaldirac: alti form tablosunun
            # onlarca satirinda birikip bir sayfa acar. Okunurlugu bozmayacak
            # kadar kucuk bir fark; olculdu, satirlar hala nefes aliyor.
            hucre_bosluk(c, ust=22, alt=22, sol=80, sag=80)
            if baslikli and i == 0:
                golge(c, BASLIK_ZEMIN)
                for p in c.paragraphs:
                    for run in p.runs:
                        bicimle(run, size=8.5, bold=True, renk=BEYAZ)
            elif zebra and i % 2 == 0:
                golge(c, SERIT_ZEMIN)
    if tekrar and baslikli:
        baslik_satirini_tekrarla(tablo)


def kaynakcayi_bicimle(doc, bas_isaret="EK-1"):
    """Kaynakca satirlarini sikilastirir: 8 punto, asili girinti, dar aralik."""
    n = 0
    for p in doc.paragraphs:
        if re.match(r"^\s*\[\d{1,3}\]", p.text):
            pf = p.paragraph_format
            pf.space_after = Pt(1)
            pf.space_before = Pt(0)
            pf.left_indent = Pt(20)
            pf.first_line_indent = Pt(-20)
            # Kaynakcada yaslama YOK: kunyeler uzun URL ve kisa satirlar icerdigi icin
            # yaslama kelime araliklarini acip "nehir" olusturuyor (olculdu: [20]).
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                # 9 punto TABANINDAN MUAF tutulan tek yer burasi. Gerekce:
                # kaynakca EK-1'dir ve TUBITAK'in kurali "EKLER HARIC 20 sayfa"dir,
                # yani 9 punto zorunlulugu formun GOVDESI icindir. Kaynakcayi da
                # 9 puntoya cikarmak belgeyi 22 sayfaya tasiyor; bilimsel icerikten
                # kesmek yerine ekin puntosu korunur. Govde 9 punto, sapma 0.
                bicimle(r, size=8, taban=False)
            n += 1
    return n


def ekleri_kucult(doc, punto=8):
    """EK-2 (tahmini butce) tablosunu 9 punto tabanindan muaf tutar.

    Ayni kural EK-1 kaynakcaya da uygulaniyor ve gerekcesi ayni: TUBITAK'in
    sinirlamasi "EKLER HARIC 20 sayfa"dir, yani 9 punto zorunlulugu formun
    GOVDESI icindir. Govde 9 puntoda ve sapmasiz kalir; yalniz ekler sikisir.
    Tutarlilik icin ikisi de ayni puntoda olmali — biri 8, digeri 9 olursa
    belge iki farkli ek bicimi tasir.
    """
    hedef = None
    for t in doc.tables:
        if not t.rows:
            continue
        ilk = " ".join(c.text for c in t.rows[0].cells).lower()
        if "gider kalemi" in ilk:
            hedef = t
            break
    if hedef is None:
        return 0
    n = 0
    for r in hedef.rows:
        for c in r.cells:
            for p in c.paragraphs:
                for run in p.runs:
                    if run.text.strip():
                        bicimle(run, size=punto, bold=run.bold, taban=False)
                        n += 1
    return n


def satir_bolunmesine_izin_ver(doc):
    """Resmi formun satirlarindaki <w:cantSplit> kaldirilir.

    Formun her bolumu TEK SATIRLIK bir tablodur ve o satir 'bolunemez' isaretli
    geldiginden, icerik sayfanin kalanina sigmayinca Word tabloyu tumuyle sonraki
    sayfaya atiyor; geriye yalnizca baslik kalan bos sayfalar olusuyor (olculdu:
    dort sayfa). Bolunmeye izin verilince icerik dogal akiyor.
    """
    n = 0
    for t in doc.tables:
        for r in t.rows:
            trPr = r._tr.find(qn("w:trPr"))
            if trPr is None:
                continue
            for e in trPr.findall(qn("w:cantSplit")):
                trPr.remove(e)
                n += 1
    return n


def dul_yetim_denetimi(doc):
    """Tek basina kalan satirlari onler."""
    for p in doc.paragraphs:
        p.paragraph_format.widow_control = True
    for t in doc.tables:
        for r in t.rows:
            for c in r.cells:
                for p in c.paragraphs:
                    p.paragraph_format.widow_control = True


def uygula_form(doc, form_tablolari):
    """1. asama — kutular akisa cevrilmeden ONCE calisir.

    Baslik bicimlemesi bu asamada yapilmali: akisa cevrildikten sonra govdede
    yuzlerce paragraf olusuyor ve BUYUK HARFLI icerik satirlari yanlislikla
    form basligi sanilabiliyor.
    """
    silinen, kalan = yonergeleri_kaldir(doc)
    tutucu = yer_tutuculari_temizle(doc)
    ana, alt, yetim = basliklari_bicimle(doc)
    for tablo, baslikli, zebra, tekrar in form_tablolari:
        form_tablosunu_bicimle(tablo, baslikli, zebra, tekrar)
    return {"silinen_yonerge": silinen, "eslesmeyen_onek": kalan,
            "temizlenen_yer_tutucu": tutucu, "ana_baslik": ana, "alt_baslik": alt,
            "yetim_zinciri": yetim}


def kucuk_satirlari_koru(doc, esik=240):
    """Kisa satirli tablolarda (sekiller, hipotez tablosu) satir bolunmesini YASAKLAR.

    Olculdu: Gantt seklinin son satiri iki sayfaya bolunup 'IP6' bir sayfada,
    aciklamasi digerinde kaliyordu. Buyuk form tablolari (takvim gibi) haric
    tutulur; onlar zaten sayfa asmak zorunda.
    """
    korunan = 0
    for t in doc.tables:
        if len(t.rows) < 2:
            continue
        en_uzun = max((len(c.text) for r in t.rows for c in r.cells), default=0)
        if en_uzun > esik:
            continue                      # buyuk icerik tablosu: bolunebilir kalsin
        for r in t.rows:
            trPr = r._tr.get_or_add_trPr()
            if trPr.find(qn("w:cantSplit")) is None:
                e = OxmlElement("w:cantSplit")
                trPr.append(e)
                korunan += 1
    return korunan


def uygula_son(doc):
    """2. asama — tum icerik yerlestikten SONRA calisir."""
    kaynak = kaynakcayi_bicimle(doc)
    bolunme = satir_bolunmesine_izin_ver(doc)
    korunan = kucuk_satirlari_koru(doc)
    dul_yetim_denetimi(doc)
    # Zincir duzeltmesi burada TEKRAR kosar: 1. asamada kosarken akis.py'nin
    # ekledigi paragraflar henuz yoktu, dolayisiyla govde akisindaki basliklar
    # kapsam disi kaliyordu.
    yetim = bos_paragrafla_zinciri_koru(doc)
    ek_punto = ekleri_kucult(doc)
    return {"kaynakca_satiri": kaynak, "kaldirilan_cantSplit": bolunme,
            "bolunmez_satir": korunan, "yetim_zinciri_son": yetim,
            "ek2_punto_run": ek_punto}
