"""2209-A on-inceleme kapisi — YAPIDAN BAGIMSIZ surum.

Onceki surum tablolari INDEKSLE buluyordu. Icerik kutulari govde akisina cevrilince
indeksler kaydi ve kapi yanlis yeri olcmeye baslardi. Bu surum tablolari BASLIK
METNIYLE bulur; bolum uzunluklarini ise kaynak icerik dosyasindan alir (yazilan sey
odur). Boylece belge yapisi degisse de kapi dogru olcer.

8 Agu — KAPI SERTLESTIRME. Bagimsiz bir denetim, kapinin yesil yanarken belgeyi
gormedigi sekiz yol olctu. Hepsi burada kapatildi; her biri "neden" notuyla isaretli:

  1. Bolum kontrolu yalniz ILK SATIRI ariyordu: teslim dosyasindan 14.201 karakter
     (52 paragraf) silindiginde kapi 0 bulgu + exit 0 verdi. Artik GOVDE KAPSAMI olculur.
  2. Sayfa kontrolu 5 argumansiz cagrida SESSIZCE atlaniyor, rapor yine "ELEME: 0"
     diyordu. Artik olculmediginde ACIK KRITIK satiri basilir.
  3. Arial kontrolu `font.name is None` olani temiz sayiyordu; oysa belgenin Normal
     stili Times New Roman. Kalitimla gelen sapma gorunmuyordu. Artik ETKIN font cozulur.
  4. Punto hic okunmuyordu; OKUBENI "Arial 9 (sapma 0)" diye yayimliyordu. Artik govde
     paragraflarinin puntosu ayrica olculur.
  5. Yasak is adimi kontrolu TAUTOLOJIKTI: her satir "IPn — " ile basladigi icin
     startswith daima False. Artik hucrenin tamaminda, Turkce-guvenli aranir.
  6. Marka taramasi "meta-analiz", "sunucuda", "yollama" gibi masum kelimelerde
     patliyordu (tire ve alt-dize). Artik tum terimlere Turkce-duyarli kelime siniri.
  7. Mojibake deseni cp1252 kuyrugu U+00BF ustune tasan harfleri (s, S, g, G ...)
     kaciriyordu — yani en olasi Turkce bozulmayi. Desen genisletildi.
  8. Ustbilgi/altbilgi hicbir havuzda yoktu: marka, dil ve font kontrolleri oralari
     hic gormuyordu. Artik havuza katilir.
"""
import sys, os, re, json
sys.stdout.reconfigure(encoding="utf-8")
from docx import Document
from docx.shared import Pt

# cp1252 kuyruk baytlari yalniz U+0080-U+00BF degildir: 0x80-0x9F araligi Unicode'da
# dagilmis noktalara esler (ornek: s = C5 9F -> "AY" degil "Å" + U+0178). Turkce'ye
# ozgu s/S/g/G tam da bu araliga dustugu icin eski desen onlari kaciriyordu.
MOJIBAKE = re.compile(
    r"[ÃÄÅÂ][\x80-\xbfŒœŠšŸŽžƒˆ˜"
    r"–—‘-„†-•…‰‹›€™]")

# Turkce'de "I".lower() -> "i" DEGIL; "İ".lower() birlesik noktali i uretir. Kalip
# eslesmesi bu yuzden sessizce basarisiz olur (olculdu: "LİTERATÜR TARAMASI" kacti).
def tr_kucuk(s):
    return s.replace("İ", "i").replace("I", "ı").lower()


def etkin_font(run, paragraf, doc):
    """Run'in GERCEKTEN render edilecek yazi tipi adi (stil kalitimi cozulur)."""
    if run.font.name:
        return run.font.name
    try:
        if paragraf.style is not None and paragraf.style.font.name:
            return paragraf.style.font.name
    except (KeyError, AttributeError):
        pass
    try:
        return doc.styles["Normal"].font.name
    except (KeyError, AttributeError):
        return None


def etkin_punto(run, paragraf):
    if run.font.size:
        return run.font.size
    try:
        return paragraf.style.font.size if paragraf.style is not None else None
    except (KeyError, AttributeError):
        return None

YASAK = [
    "teknofest", "t3 vakfı", "deepseek", "openai", "gpt-4", "chatgpt", "claude",
    "anthropic", "gemini", "llama", "mistral", "cohere", "ollama", "huggingface",
    "hugging face", "azure", "aws", "google cloud", "nvidia", "cuda",
    "fastapi", "langgraph", "langchain", "react", "vite", "supabase", "postgresql",
    "postgres", "pydantic", "uvicorn", "playwright", "pypdfium", "tesseract",
    "python", "javascript", "typescript", "node.js", "npm", "docker", "github",
    "sqlite", "redis", "elasticsearch", "microsoft", "google", "meta", "amazon",
    "apple", "ibm", "2224-a", "2224-b", "2209-b",
]
KELIME_SINIRI = {"react", "meta", "apple", "python", "claude", "postgres", "google"}
INGILIZCE = [" the ", " and ", " with ", " for the ", " we propose", " in this study",
             " results show", " state-of-the-art"]


def tablo_bul(doc, *basliklar):
    """Ilk satirinda verilen basliklari GECEN tabloyu dondurur (indeksten bagimsiz)."""
    for t in doc.tables:
        if not t.rows:
            continue
        ilk = " ".join(c.text for c in t.rows[0].cells).lower()
        if all(b.lower() in ilk for b in basliklar):
            return t
    return None


def kelime_say(s):
    return len([w for w in re.split(r"\s+", s.strip()) if w])


def kontrol(docx_yolu, icerik_yolu, sayfa_bilgisi=None):
    doc = Document(docx_yolu)
    ic = json.load(open(icerik_yolu, encoding="utf-8"))
    sonuc = []

    def ekle(ad, gecti, olculen, beklenen, siddet="ELEME"):
        sonuc.append({"kontrol": ad, "gecti": bool(gecti), "olculen": olculen,
                      "beklenen": beklenen, "siddet": siddet})

    # --- metin havuzlari
    kaynakca_p = [p.text for p in doc.paragraphs if re.match(r"^\s*\[\d{1,3}\]", p.text)]
    kaynakca = "\n".join(kaynakca_p)
    govde_p = [p.text for p in doc.paragraphs if not re.match(r"^\s*\[\d{1,3}\]", p.text)]
    tablo_metni = "\n".join(c.text for t in doc.tables for r in t.rows for c in r.cells)
    # Ustbilgi/altbilgi eskiden hicbir havuzda yoktu: marka, dil ve karakter
    # kontrolleri belgenin her sayfasinda tekrarlanan metni hic gormuyordu.
    kenar = "\n".join(p.text for s in doc.sections
                      for p in list(s.header.paragraphs) + list(s.footer.paragraphs))
    govde = ("\n".join(govde_p) + "\n" + tablo_metni + "\n" + kenar)
    govde_k = tr_kucuk(govde)
    tam = govde + "\n" + kaynakca

    # --- 1) ozet + anahtar kelime (hala tablo icinde)
    ozet_t = tablo_bul(doc, "özet")
    if ozet_t:
        ozet = re.sub(r"^\s*Özet\s*", "", ozet_t.rows[0].cells[0].text).strip()
        n = kelime_say(ozet)
        ekle("Özet kelime sayısı", 25 <= n <= 450, n, "25–450")
        ak = re.sub(r"^\s*Anahtar Kelimeler\s*:", "", ozet_t.rows[1].cells[0].text).strip()
        kelimeler = [k.strip() for k in ak.split(",") if k.strip()]
        ekle("Anahtar kelime sayısı", 3 <= len(kelimeler) <= 5, len(kelimeler), "3–5")
    else:
        ekle("Özet tablosu bulundu", False, "yok", "bulunmalı")

    # --- 2) bolum uzunluklari (kaynak icerikten; yazilan sey odur)
    for anahtar, ad in (("bolum_1_1", "1.1 Bilimsel nitelik"),
                        ("bolum_1_2", "1.2 Amaç ve hedefler"),
                        ("bolum_2", "2. Yöntem"),
                        ("bolum_5_diger", "5. Diğer konular")):
        k = len(ic.get(anahtar, "").strip())
        ekle(f"{ad} — karakter", k >= 350, k, "≥350")
    for k2, ad in (("bilimsel_akademik", "Bilimsel/Akademik"),
                   ("ekonomik_ticari_sosyal", "Ekonomik/Ticari/Sosyal"),
                   ("yeni_projeler", "Yeni projeler")):
        n = len(ic["yaygin_etki"].get(k2, ""))
        ekle(f"4. Yaygın etki — {ad}", n > 0, n, ">0", "KRİTİK")

    # --- 3) bolum metinleri belgede GERCEKTEN var mi
    # Eskiden yalniz ILK SATIR araniyordu (bolumun %0,13-0,67'si). Olculdu: govdeden
    # 52 paragraf / 14.201 karakter silindiginde kapi "var" deyip exit 0 verdi.
    # Artik bolumun BUTUN anlamli satirlari aranir ve kapsam oranı raporlanir.
    for anahtar, ad in (("bolum_1_1", "1.1"), ("bolum_1_2", "1.2"), ("bolum_2", "2. Yöntem"),
                        ("bolum_5_diger", "5.")):
        satirlar = [s.strip() for s in ic.get(anahtar, "").split("\n")
                    if len(s.strip()) > 80]
        # Tablo satirlari docx'te hucrelere bolundugu icin birebir aranmaz; disla.
        satirlar = [s for s in satirlar if s.count("|") < 3]
        if not satirlar:
            ekle(f"{ad} metni belgede", False, "kaynak boş", "gövde satırı bulunmalı",
                 "KRİTİK")
            continue
        # akis.py madde satirlarinin basindaki "- " isaretini "•  " ile degistirir;
        # ham metinle karsilastirinca satir "belgede yok" gorunuyordu (sahte alarm).
        bulunan = sum(1 for s in satirlar if re.sub(r"^[-•]\s*", "", s)[:70] in govde)
        oran = bulunan / len(satirlar)
        ekle(f"{ad} gövde kapsamı", oran >= 0.95, f"{bulunan}/{len(satirlar)} (%{oran:.0%})",
             "≥%95 satır belgede", "KRİTİK")

    # --- 4) calisma takvimi
    tak = tablo_bul(doc, "tarih aralığı", "faaliyetler")
    if tak:
        katkilar = []
        for r in tak.rows[1:]:
            m = re.findall(r"Katkı:\s*%\s*(\d+(?:[.,]\d+)?)", r.cells[3].text)
            if m:
                katkilar.append(float(m[0].replace(",", ".")))
        toplam = round(sum(katkilar), 2)
        ekle("Çalışma takvimi katkı toplamı", abs(toplam - 100) < 0.01, toplam, "tam 100")
        ekle("İş paketi sayısı", len(katkilar) >= 4, len(katkilar), "≥4", "ÖNEMLİ")
        yasak_adim = ["literatür taraması", "sonuç raporu hazırlama", "malzeme alımı",
                      "araştırma sonuçlarının paylaşımı"]
        # Eski surum `ilk.startswith(y)` kullaniyordu; her satir "İPn — " ile basladigi
        # icin kontrol HICBIR KOSULDA kalamiyordu (olculdu: enjekte edilen
        # "İP1 — Literatür taraması" yakalanmadi). Artik hucrenin tamaminda aranir.
        ihlal = []
        for r in tak.rows[1:]:
            hucre = tr_kucuk(r.cells[1].text)
            ihlal += [y for y in yasak_adim if tr_kucuk(y) in hucre]
        ekle("Yasak iş adımı ayrı İP değil", not ihlal, sorted(set(ihlal)) or "yok", "boş")
    else:
        ekle("Çalışma takvimi tablosu bulundu", False, "yok", "bulunmalı")

    # --- 5) madde 4.1.8 + dil (govde; kaynakca ayri)
    # Eski surum terimlerin cogunu ALT-DIZE ariyordu: "sunucuda" -> cuda,
    # "yollama" -> llama/ollama, "meta-analiz" -> meta (\b tireyi sinir sayar).
    # Hicbiri marka degil; ucu de ELEME uretirdi. Artik TUM terimlere tireyi de
    # kapsayan Turkce-duyarli kelime siniri uygulanir (\w Unicode'da ç/ğ/ı/ö/ş/ü'yu icerir).
    def tara(kaynak):
        return [y for y in YASAK
                if re.search(r"(?<![-\w])" + re.escape(y) + r"(?![-\w])", kaynak)]
    b = tara(govde_k)
    ekle("Madde 4.1.8 marka/kurum taraması (gövde)", not b, b or "temiz", "0 bulgu")
    kb = tara(kaynakca.lower())
    ekle("Kaynakça marka geçişi (bilgi)", not kb, kb or "temiz", "atıf künyesinde kabul edilebilir",
         "ÖNEMLİ")
    ing = [i.strip() for i in INGILIZCE if i in govde_k]
    ekle("Gövde metni Türkçe", not ing, ing or "temiz", "0 İngilizce kalıntı", "KRİTİK")
    mojibake = MOJIBAKE.findall(tam)
    ekle("Türkçe karakter bütünlüğü", not mojibake, len(mojibake), "0 bozuk", "KRİTİK")

    # --- 6) atif butunlugu
    atif = set(int(x) for x in re.findall(r"\[(\d{1,3})\]", govde))
    kaynak_no = set(int(re.match(r"^\s*\[(\d{1,3})\]", s).group(1)) for s in kaynakca_p)
    ekle("Metindeki her atıf kaynakçada var", not (atif - kaynak_no),
         sorted(atif - kaynak_no) or "tam", "boş", "KRİTİK")
    ekle("Kaynakçadaki her kayıt kullanılmış", not (kaynak_no - atif),
         sorted(kaynak_no - atif) or "tam", "boş", "ÖNEMLİ")
    ekle("Kaynak sayısı", len(kaynak_no) >= 15, len(kaynak_no), "≥15", "ÖNEMLİ")
    ekle("Doğrulanmamış atıf etiketi", tam.count("[DOĞRULA") == 0,
         tam.count("[DOĞRULA"), "0", "ÖNEMLİ")

    # --- 7) butce
    butce = ic.get("butce", [])
    tut = sum(x.get("tutar_tl", 0) or 0 for x in butce)
    ekle("Bütçe toplamı", tut <= 12000, tut, "≤12.000 TL", "KRİTİK")
    yasak_gider = [x["kalem"] for x in butce
                   if any(y in (str(x.get("kalem", "")) + str(x.get("aciklama", ""))).lower()
                          for y in ("konferans", "yayın ücret", "patent başvuru", "makale ücret"))]
    ekle("Yasak gider kalemi yok", not yasak_gider, yasak_gider or "temiz", "boş", "KRİTİK")

    # --- 7b) METIN ICI ARITMETIK
    # Bu sinif hatayi kapi hic gormuyordu ve ad-hoc bir denetimle yakalandi:
    # adam-ay dagilimi 2,1+3,2+2,9+2,7+1,8 = 12,7 yazilmisti ama ilan edilen
    # kapasite 12,6 idi. Panelist toplayip bulur. Artik metinde yazan sayilarin
    # kendi toplamlarini tutturmasi OTOMATIK sinaniyor.
    metin_tum = "\n".join(str(ic.get(a, "")) for a in
                          ("ozet", "bolum_1_1", "bolum_1_2", "bolum_2",
                           "bolum_3_yonetim_girisi", "bolum_5_diger"))

    m = re.search(r"İP1 ([\d,]+).{0,80}?İP5 ([\d,]+) adam-ay; toplam ([\d,]+)",
                  metin_tum, re.S)
    if m:
        parcalar = [float(x.replace(",", ".")) for x in
                    re.findall(r"İP\d ([\d,]+)", m.group(0))]
        ilan = float(m.group(3).replace(",", "."))
        toplam = round(sum(parcalar), 1)
        ekle("Adam-ay dağılımı toplamı", abs(toplam - ilan) < 0.05,
             f"{toplam} (ilan: {ilan})", "eşit olmalı", "ÖNEMLİ")

    # Onaylayici aile buyuklugu: kapilardaki test sayilari + olcum kolu.
    # NOT: "Kapı N = ... (K test)" seklinde tek bir regex denendi ve Kapı 1'i
    # KACIRDI (hucre metni ic parantez tasiyor). Sahte alarm veren bir kapi,
    # olmayan bir kapidan kotudur. Bu yuzden once kapi CUMLESI izole edilir,
    # sonra icindeki "(K test)" gecisleri sayilir — parantez yapisindan bagimsiz.
    kapi_cumlesi = re.search(r"Mekanizma kolu.*?Ölçüm geçerliliği kolu[^.]*\.",
                             metin_tum, re.S)
    # "(3 test)" degil "(... kontrast, 3 test)" de olabiliyor: acilis parantezi
    # aranmaz, yalniz "<sayi> test)" aranir.
    kapi_testleri = ([int(x) for x in re.findall(r"(\d)\s*test\)", kapi_cumlesi.group(0))]
                     if kapi_cumlesi else [])
    ilan_aile = re.search(r"Aile on bir testtir", metin_tum)
    if kapi_testleri and ilan_aile:
        # Olcum gecerliligi kolu tek testtir (H4); metinden dogrula.
        olcum_kolu = 1 if re.search(r"[Öö]lçüm geçerliliği kolu[^.]{0,60}tek test",
                                    metin_tum) else 0
        ekle("Onaylayıcı aile büyüklüğü", sum(kapi_testleri) + olcum_kolu == 11,
             f"{sum(kapi_testleri)} kapı testi + {olcum_kolu} ölçüm kolu = "
             f"{sum(kapi_testleri) + olcum_kolu}", "11 (metinde ilan edilen)", "ÖNEMLİ")

    # Butce: kalem toplami metinde anilan toplamla ayni mi?
    ilan_butce = re.search(r"[Tt]oplam ([\d.]+) TL", str(ic.get("bolum_5_diger", "")))
    if ilan_butce:
        beyan = int(ilan_butce.group(1).replace(".", ""))
        ekle("Bütçe metni tabloyla uyumlu", beyan == tut, f"metin {beyan} / tablo {tut}",
             "eşit olmalı", "KRİTİK")

    # --- 8) bicim
    # Eski surum `font.name is None` olan run'i TEMIZ sayiyordu. Oysa bu belgenin
    # Normal stili Times New Roman: acik Arial'i dusen 40 run "0 sapma" raporlandi
    # (olculdu). Artik etkin font stil zincirinden cozulur.
    def _paragraflar():
        for p in doc.paragraphs:
            yield p, False
        for t in doc.tables:
            for row in t.rows:
                for c in row.cells:
                    for p in c.paragraphs:
                        yield p, True

    kotu, punto_dagilim, govde_kotu_punto = 0, {}, 0
    for p, tablo_mu in _paragraflar():
        for r in p.runs:
            if not r.text.strip():
                continue
            if etkin_font(r, p, doc) != "Arial":
                kotu += 1
            punto = etkin_punto(r, p)
            anahtar = round(punto.pt, 1) if punto is not None else None
            punto_dagilim[anahtar] = punto_dagilim.get(anahtar, 0) + 1
            # Govde metni = tablo disi, uzun, kaynakca olmayan, italik olmayan paragraf.
            # Sekil altyazisi (italik 7 pt) ve kaynakca (8 pt) bilincli tasarimdir;
            # olcut yalniz duz govde paragraflarina uygulanir.
            kaynakca_mi = re.match(r"^\s*\[\d{1,3}\]", p.text) is not None
            if (not tablo_mu and not kaynakca_mi and not r.italic
                    and len(p.text.strip()) > 120):
                if punto is None or punto != Pt(9):
                    govde_kotu_punto += 1
    ekle("Yazı tipi Arial (etkin)", kotu == 0, kotu, "0 sapma", "ÖNEMLİ")
    ekle("Gövde metni 9 punto", govde_kotu_punto == 0, govde_kotu_punto,
         "0 sapma (tablo/şekil hariç)", "ÖNEMLİ")
    print(f"  [       bilgi] Punto dağılımı (tüm run'lar): "
          f"{dict(sorted((k, v) for k, v in punto_dagilim.items() if k))}")

    # --- 9) sayfa
    # EN SIK ELEME SEBEBI (m.5.1.2) ve eskiden EN SESSIZ kontrol: sayfa bilgisi
    # verilmeden cagrildiginda bu blok tumuyle atlaniyor, rapor yine "ELEME: 0"
    # diyordu. Artik once Word COM ile KENDI olcer; olcemezse ACIK KRITIK basar.
    if sayfa_bilgisi is None:
        sayfa_bilgisi = _sayfa_olc(docx_yolu)
    if sayfa_bilgisi:
        # Sinir gecmisi: once "her sey dahil 20" idi (8 Agu); kullanici ayni gun
        # 21'e yukseltti. TUBITAK'in kendi kurali zaten "EKLER HARIC 20" ve
        # kaynakca EK-1'dir — yani asil olcut govde sayfasidir. Ikisi de raporlanir.
        toplam_s = sayfa_bilgisi.get("toplam")
        ekle("Toplam sayfa (kaynakça dâhil)", toplam_s <= 21, toplam_s, "≤21", "KRİTİK")
        govde_s = sayfa_bilgisi.get("govde")
        if govde_s is not None:
            ekle("Gövde sayfa (EK-1 kaynakça hariç)", govde_s <= 20, govde_s,
                 "≤20 (TÜBİTAK kuralı)", "KRİTİK")
    else:
        ekle("Toplam sayfa (ekler dâhil)", False, "ÖLÇÜLMEDİ",
             "sayfa_say.ps1 çıktısı ya da Word gerekli", "KRİTİK")

    return sonuc


def _sayfa_olc(docx_yolu):
    """Word COM ile gercek sayfa sayisi + EK-1 oncesi govde sayfasi.

    sayfa_govde.ps1 tercih edilir: TUBITAK'in kurali "EKLER HARIC 20" oldugu icin
    asil olculmesi gereken govdedir. O betik yoksa sayfa_say.ps1'e dusulur ve
    yalniz toplam raporlanir.
    """
    try:
        import subprocess
        klasor = os.path.dirname(os.path.abspath(__file__))
        govde_betik = os.path.join(klasor, "sayfa_govde.ps1")
        if os.path.exists(govde_betik):
            cikti = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                 govde_betik, "-Docx", os.path.abspath(docx_yolu)],
                capture_output=True, text=True, timeout=180).stdout
            mt = re.search(r"TOPLAM=(\d+)", cikti)
            mg = re.search(r"GOVDE_SAYFA=(\d+)", cikti)
            if mt:
                return {"toplam": int(mt.group(1)),
                        "govde": int(mg.group(1)) if mg else None}
        betik = os.path.join(klasor, "sayfa_say.ps1")
        if not os.path.exists(betik):
            return None
        # -ExecutionPolicy Bypass sart: betik yerel ve imzasiz, varsayilan politika
        # (AllSigned/RemoteSigned) onu calistirmayi reddediyor ve sayfa olcumu
        # sessizce dusuyordu. Bypass yalniz bu alt surece uygulanir, sistemi degistirmez.
        cikti = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", betik,
             "-Docx", os.path.abspath(docx_yolu)],
            capture_output=True, text=True, timeout=180).stdout
        m = re.search(r"SAYFA=(\d+)", cikti)
        return {"toplam": int(m.group(1)), "govde": None} if m else None
    except Exception:
        return None


def rapor(sonuc):
    gen = max(len(s["kontrol"]) for s in sonuc) + 2
    print("=" * 82)
    print("2209-A ÖN İNCELEME KAPISI")
    print("=" * 82)
    for s in sonuc:
        isaret = "GEÇTİ" if s["gecti"] else f"KALDI({s['siddet']})"
        print(f"  [{isaret:>13}] {s['kontrol']:<{gen}} ölçülen={s['olculen']}  beklenen={s['beklenen']}")
    e = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "ELEME")
    k = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "KRİTİK")
    o = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "ÖNEMLİ")
    print("-" * 82)
    print(f"ELEME: {e}   KRİTİK: {k}   ÖNEMLİ: {o}")
    print("=" * 82)
    return e + k


if __name__ == "__main__":
    sayfa = None
    if len(sys.argv) > 4:
        sayfa = {"toplam": int(sys.argv[3]), "govde": int(sys.argv[4])}
    s = kontrol(sys.argv[1], sys.argv[2], sayfa)
    sys.exit(1 if rapor(s) else 0)
