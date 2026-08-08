"""Resmi form hucrelerine ZENGIN metin basar: gercek tablolar, basliklar, asili girintili listeler.

Sorun: TUBITAK formunun her bolumu TEK dev tablo hucresidir. Duz metin oraya akitilinca
"A | B | C" bicimindeki tablolar boru isaretli metin olarak, basliklar govdeyle ayni
gorunumde, listeler asili girintisiz cikar. Cozum: hucre icine IC ICE GERCEK TABLO ve
paragraf duzeyinde bicim.

Sekiller PNG degil YERLI TABLO olarak cizilir: her yakinlastirmada net, siyah-beyaz
basilabilir, Word'de duzenlenebilir ve dis bagimlilik gerektirmez.
"""
import re
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ARIAL = "Arial"
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

LACIVERT = RGBColor(0x1F, 0x38, 0x64)
GOVDE = RGBColor(0x11, 0x11, 0x11)
BASLIK_ZEMIN = "1F3864"
SERIT_ZEMIN = "EEF2F8"
DOLU_ZEMIN = "2F5496"
BOS_ZEMIN = "F2F2F2"


def bicimle(run, size=9, bold=False, italic=False, renk=None):
    run.font.name = ARIAL
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if renk is not None:
        run.font.color.rgb = renk
    rpr = run._element.get_or_add_rPr()
    rf = rpr.get_or_add_rFonts()
    for a in ("ascii", "hAnsi", "cs", "eastAsia"):
        rf.set(W_NS + a, ARIAL)
    return run


def golge(hucre, hexrenk):
    tcPr = hucre._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hexrenk)
    tcPr.append(shd)


def hucre_kenarlik(hucre, renk="8EA9DB", sz="4"):
    tcPr = hucre._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    for yon in ("top", "left", "bottom", "right"):
        e = OxmlElement(f"w:{yon}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), sz)
        e.set(qn("w:color"), renk)
        b.append(e)
    tcPr.append(b)


def hucre_bosluk(hucre, ust=20, alt=20, sol=60, sag=60):
    """Hucre ic bosluklari (twip). Dar sutunlarda metnin kenara yapismasini onler."""
    tcPr = hucre._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for yon, deger in (("top", ust), ("bottom", alt), ("start", sol), ("end", sag)):
        e = OxmlElement(f"w:{yon}")
        e.set(qn("w:w"), str(deger))
        e.set(qn("w:type"), "dxa")
        mar.append(e)
    tcPr.append(mar)


def tablo_kenarliksiz_disi(tablo):
    """Ic ice tablo icin ince, tutarli kenarlik."""
    for r in tablo.rows:
        for c in r.cells:
            hucre_kenarlik(c)


def hucreye_yaz(hucre, metin, size=8, bold=False, renk=None, hiza=None, bosluk_alt=1):
    hucre._element.clear_content()
    p = hucre.add_paragraph()
    p.paragraph_format.space_after = Pt(bosluk_alt)
    p.paragraph_format.space_before = Pt(1)
    if hiza is not None:
        p.alignment = hiza
    bicimle(p.add_run(str(metin)), size=size, bold=bold, renk=renk or GOVDE)
    return p


# --------------------------------------------------------------- satır türü tanıma
def satir_turu(s):
    t = s.strip()
    if not t:
        return "bos"
    if t.count("|") >= 3:
        return "boru"
    if re.match(r"^\d+\.\d+(\.\d+)?[\s.]", t):
        return "baslik"
    if t.isupper() and 3 < len(t) < 90:
        return "baslik"
    if re.match(r"^[-•]\s", t):
        return "madde"
    if re.match(r"^\(\w{1,3}\)\s", t):
        return "sirali"
    return "paragraf"


def zengin_yaz(hucre, metin, taban=9, ic_genislik=Cm(16.0)):
    """Duz metni bicimli paragraflara ve gercek tablolara donusturur."""
    hucre._element.clear_content()
    satirlar = metin.split("\n")
    i = 0
    while i < len(satirlar):
        ham = satirlar[i]
        tur = satir_turu(ham)

        if tur == "bos":
            i += 1
            continue

        # --- ardışık boru satırlarını gerçek tabloya çevir
        if tur == "boru":
            blok = []
            while i < len(satirlar) and satir_turu(satirlar[i]) == "boru":
                blok.append([h.strip() for h in satirlar[i].split("|")])
                i += 1
            boru_tablosu(hucre, blok, ic_genislik)
            continue

        t = ham.strip()
        p = hucre.add_paragraph()
        pf = p.paragraph_format

        if tur == "baslik":
            pf.space_before = Pt(9)
            pf.space_after = Pt(3)
            pf.keep_with_next = True
            bicimle(p.add_run(t), size=taban, bold=True, renk=LACIVERT)
        elif tur == "madde":
            govde = re.sub(r"^[-•]\s*", "", t)
            pf.space_after = Pt(2)
            pf.left_indent = Pt(14)
            pf.first_line_indent = Pt(-9)
            if len(govde) > 120:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            bicimle(p.add_run("•  "), size=taban)
            bicimle(p.add_run(govde), size=taban)
        elif tur == "sirali":
            m = re.match(r"^(\(\w{1,3}\))\s*(.*)$", t, re.S)
            pf.space_after = Pt(2)
            pf.left_indent = Pt(18)
            pf.first_line_indent = Pt(-18)
            if len(t) > 120:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            bicimle(p.add_run(m.group(1) + " "), size=taban, bold=True)
            bicimle(p.add_run(m.group(2)), size=taban)
        else:
            pf.space_after = Pt(3)
            if len(t) > 120:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            bicimle(p.add_run(t), size=taban)
        i += 1

    if not hucre.paragraphs:
        bicimle(hucre.add_paragraph().add_run(""), size=taban)


def boru_tablosu(hucre, satirlar, toplam_genislik):
    """'A | B | C' bloğunu başlık satırı gölgeli gerçek tabloya çevirir."""
    sutun = max(len(r) for r in satirlar)
    satirlar = [r + [""] * (sutun - len(r)) for r in satirlar]

    t = hucre.add_table(rows=len(satirlar), cols=sutun)
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    t.autofit = False

    # sütun genişlikleri: içerik uzunluğuna göre orantılı, ilk/son sütun dar
    uzunluk = [max(len(r[c]) for r in satirlar) for c in range(sutun)]
    toplam = sum(uzunluk) or 1
    enler = []
    for u in uzunluk:
        oran = u / toplam
        oran = min(max(oran, 0.06), 0.40)   # aşırı dar/geniş sütunu engelle
        enler.append(oran)
    olcek = sum(enler)
    enler = [Cm(toplam_genislik.cm * (e / olcek)) for e in enler]

    for ri, satir in enumerate(satirlar):
        for ci, deger in enumerate(satir):
            c = t.rows[ri].cells[ci]
            c.width = enler[ci]
            hucre_kenarlik(c)
            hucre_bosluk(c, ust=25, alt=25, sol=70, sag=70)
            if ri == 0:
                golge(c, BASLIK_ZEMIN)
                hucreye_yaz(c, deger, size=7.5, bold=True,
                            renk=RGBColor(0xFF, 0xFF, 0xFF))
            else:
                if ri % 2 == 0:
                    golge(c, SERIT_ZEMIN)
                hucreye_yaz(c, deger, size=7.5,
                            bold=(ci == 0), renk=LACIVERT if ci == 0 else GOVDE)
    # Word: hücre bir paragrafla bitmeli
    son = hucre.add_paragraph()
    son.paragraph_format.space_after = Pt(4)
    bicimle(son.add_run(""), size=6)
    return t


# ------------------------------------------------------------------------ ŞEKİLLER
def sekil_basligi(hucre, metin, size=8):
    p = hucre.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    bicimle(p.add_run(metin), size=size, bold=True, renk=LACIVERT)


def sekil_notu(hucre, metin, size=7):
    p = hucre.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(6)
    bicimle(p.add_run(metin), size=size, italic=True, renk=RGBColor(0x44, 0x44, 0x44))


def faktoriyel_semasi(hucre, genislik=Cm(15.6)):
    """Şekil 1 — D1'in 4 (mimari) x 3 (bozulma) gövdesi."""
    sekil_basligi(hucre, "Şekil 1. D1 deneyinin faktöriyel gövdesi "
                         "(4 mimari kolu × 3 girdi bozulma düzeyi, belge-içi tekrarlı ölçüm)")
    kollar = [
        ("(a) Kural katmanı", "deterministik; model çağrısı yok"),
        ("(b) Kısıtsız üretim", "alt sınır referansı"),
        ("(b2) Literatür tabanı", "şemaya bağlı + öz-eleştiri turu"),
        ("(c) Kısıtlı hibrit", "kapalı küme + kanıt alıntısı"),
    ]
    duzeyler = ["Temiz\n(KHO ≈ 0)", "Orta\n(KHO ≈ 0,05)", "Yüksek\n(KHO ≈ 0,12)"]

    t = hucre.add_table(rows=len(kollar) + 1, cols=4)
    t.autofit = False
    enler = [Cm(5.4), Cm(3.4), Cm(3.4), Cm(3.4)]

    hucreye_yaz(t.rows[0].cells[0], "Mimari kolu  ↓   |   Bozulma düzeyi →", size=7.5,
                bold=True, renk=RGBColor(0xFF, 0xFF, 0xFF))
    golge(t.rows[0].cells[0], BASLIK_ZEMIN)
    for j, d in enumerate(duzeyler):
        c = t.rows[0].cells[j + 1]
        golge(c, BASLIK_ZEMIN)
        hucreye_yaz(c, d.replace("\n", " "), size=7.5, bold=True,
                    renk=RGBColor(0xFF, 0xFF, 0xFF), hiza=WD_ALIGN_PARAGRAPH.CENTER)

    for i, (ad, aciklama) in enumerate(kollar, start=1):
        c0 = t.rows[i].cells[0]
        c0._element.clear_content()
        p = c0.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        bicimle(p.add_run(ad), size=7.5, bold=True, renk=LACIVERT)
        p2 = c0.add_paragraph()
        p2.paragraph_format.space_after = Pt(1)
        bicimle(p2.add_run(aciklama), size=6.5, italic=True,
                renk=RGBColor(0x55, 0x55, 0x55))
        for j in range(1, 4):
            hucreye_yaz(t.rows[i].cells[j], "240 belge", size=7.5,
                        hiza=WD_ALIGN_PARAGRAPH.CENTER)
        if i % 2 == 0:
            for j in range(4):
                golge(t.rows[i].cells[j], SERIT_ZEMIN)

    for r in t.rows:
        for j, c in enumerate(r.cells):
            c.width = enler[j]
            hucre_kenarlik(c)
            hucre_bosluk(c, ust=30, alt=30)

    sekil_notu(hucre, "Gövde 240 × 4 × 3 = 2.880 gözlem; sağlayıcı bloğu 80 belgelik alt "
                      "kümede iki ek sağlayıcıda tekrarlanır (+1.440), toplam 4.320. "
                      "(a) kolu model çağrısı içermez: 720 gözlem deterministiktir. "
                      "KHO: karakter hata oranı.")


def gantt_semasi(hucre, takvim, genislik=Cm(15.6)):
    """Şekil 2 — 12 aylık iş paketi zaman çizelgesi (yerli tablo, görsel şerit)."""
    sekil_basligi(hucre, "Şekil 2. On iki aylık iş paketi zaman çizelgesi ve katkı ağırlıkları")

    t = hucre.add_table(rows=len(takvim) + 1, cols=14)
    t.autofit = False
    ad_en, ay_en, katki_en = Cm(4.3), Cm(0.72), Cm(1.3)

    basliklar = ["İş paketi"] + [str(a) for a in range(1, 13)] + ["Katkı"]
    for j, b in enumerate(basliklar):
        c = t.rows[0].cells[j]
        golge(c, BASLIK_ZEMIN)
        hucreye_yaz(c, b, size=7, bold=True, renk=RGBColor(0xFF, 0xFF, 0xFF),
                    hiza=WD_ALIGN_PARAGRAPH.CENTER)

    for i, ip in enumerate(takvim, start=1):
        ad = str(ip.get("ad", ""))
        kisa = ad.split("—")[0].strip() if "—" in ad else ad[:6]
        baslik = ad.split("—", 1)[1].strip() if "—" in ad else ad
        c0 = t.rows[i].cells[0]
        c0._element.clear_content()
        p = c0.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        bicimle(p.add_run(kisa + "  "), size=7.5, bold=True, renk=LACIVERT)
        bicimle(p.add_run(baslik[:64] + ("…" if len(baslik) > 64 else "")), size=6.5)

        m = re.search(r"(\d+)\s*-\s*(\d+)", str(ip.get("tarih_araligi", "")))
        bas, son = (int(m.group(1)), int(m.group(2))) if m else (1, 1)
        for ay in range(1, 13):
            c = t.rows[i].cells[ay]
            dolu = bas <= ay <= son
            golge(c, DOLU_ZEMIN if dolu else BOS_ZEMIN)
            hucreye_yaz(c, "", size=7, hiza=WD_ALIGN_PARAGRAPH.CENTER)
        hucreye_yaz(t.rows[i].cells[13], f"%{ip.get('katki')}", size=7.5, bold=True,
                    hiza=WD_ALIGN_PARAGRAPH.CENTER, renk=LACIVERT)

    for r in t.rows:
        for j, c in enumerate(r.cells):
            c.width = ad_en if j == 0 else (katki_en if j == 13 else ay_en)
            hucre_kenarlik(c)
            hucre_bosluk(c, ust=20, alt=20, sol=30, sag=30)

    toplam = sum(x.get("katki") or 0 for x in takvim)
    sekil_notu(hucre, f"Koyu hücreler iş paketinin etkin olduğu ayları gösterir. "
                      f"Katkı sütununun toplamı %{toplam}'dür. Şekil, formun 3.1 Çalışma "
                      f"Takvimi tablosunun görsel özetidir; ayrıntılı faaliyet, sorumlu ve "
                      f"başarı ölçütü bilgisi o tablodadır.")
