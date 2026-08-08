"""Dis geri bildirimin 10 maddesini belgede FIILEN dogrular ve KARAR verir.

Amac: hangisinin gercekten var oldugunu olcmek. Korlemesine duzeltmek, var olmayan
bir kusuru "duzeltip" metni bozmak demektir.

8 Agu — PROB DURUSTLUGU. Bagimsiz bir denetim, bu betigin dort yerde olcuyor
gorunup olcmedigini gosterdi. Hepsi burada kapatildi:
  * Cıplak "320" deseni metindeki "4.320" (artefakt sayisi) ile eslesiyor ve
    "eski kural izi" diye kalici yanlis-pozitif uretiyordu. Artik sayi siniri var.
  * "hipotez sinamasinda kullanilan evrakin" capasi kucuk harfle, buyuk/kucuk
    harfe DUYARLI `in` ile araniyordu; metinde cumle basi oldugu icin hicbir
    zaman eslesmiyordu -> madde 2 hep kor.
  * Madde 10 bir OLCUM degil sabit metindi ("21/21 DOGRULANDI"); artik gercekten
    sayiyor ve kaynakca da havuza dahil (eskiden hic taranmiyordu).
  * "2209-A / 2209/A" yazim probu yanlis korpusa bakiyordu: bu kaliplar JSON
    govdesinde hic gecmez, gercek fark DOCX USTBILGISINDE. Prob docx'e tasindi.
    (Olculdu: ustbilgilerdeki fark TUBITAK'in KENDI resmi formundan geliyor,
    duzeltilmemeli — bu yuzden madde bilgi amaclidir, karar vermez.)
  * sys.exit yoktu: cagiran taraf `if ($?)` ile basarisizligi basari sayiyordu.

Kullanim:
    python dis_geri_bildirim.py icerik.json [teslim.docx]
Cikis kodu: 0 = tum karar maddeleri gecti, 1 = en az biri kaldi.
"""
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ALAN = ["ozet", "bolum_1_1", "bolum_1_2", "bolum_2", "bolum_3_yonetim_girisi",
        "bolum_5_diger"]
BLOK = ["calisma_takvimi", "riskler", "yaygin_etki", "butce", "olanaklar",
        "kaynaklar", "anahtar_kelimeler"]


def havuz(ic):
    """Tum metin. kaynaklar/anahtar_kelimeler eskiden DISARIDAYDI: [DOĞRULA]
    etiketi tam da kaynakcada bulunur, yani kontrol korunde duruyordu."""
    return "\n".join([ic[a] for a in ALAN if a in ic] +
                     [json.dumps(ic[k], ensure_ascii=False) for k in BLOK if k in ic])


def kes(metin, m, pencere=120):
    a, b = max(0, m.start() - pencere), min(len(metin), m.end() + pencere)
    return metin[a:b].replace("\n", " ")


def main():
    ic = json.load(open(sys.argv[1], encoding="utf-8"))
    docx_yolu = sys.argv[2] if len(sys.argv) > 2 else None
    tum = havuz(ic)
    sonuc = []

    def kontrol(no, ad, gecti, olculen, beklenen):
        sonuc.append((no, ad, bool(gecti), olculen, beklenen))

    # 1) H2 icin TEK plan mi? Eski uc-dalli kuralin izi kalmis mi?
    # "320" cıplak arandiginda "4.320" ile eslesiyordu; sayi siniri sart.
    eski = {d: len(re.findall(k, tum)) for d, k in
            (("240'tan 320'ye", r"(?<!\d[.,])\b320\b"),
             ("bozulma üçten ikiye", r"üçten ikiye"),
             ("0,70 eşiği", r"\b0,70\b"))}
    kontrol(1, "H2 tek plan (eski kural izi yok)", sum(eski.values()) == 0, eski, "hepsi 0")

    # 2) Sentetik/gercek ayrimi katmanli mi, yoksa mutlak iddia mi var?
    # 8 Agu 2. tur: metin "hipotez sinamasinda kullanilan evrak" ifadesinden
    # DAHA KESIN bir sozlesmeye gecti — ana deneyler sentetik, genellenebilirlik
    # gercek belgede. Prob eski kalibi aradigi icin dogru metni "kaldi" sayiyordu.
    # Artik sozlesmenin IKI YANI da aranir.
    sentetik_yani = bool(re.search(r"ana deney\w*.{0,80}sentetik", tum, re.I))
    gercek_yani = bool(re.search(r"genellenebilirliğ\w*.{0,160}gerçek belge", tum, re.I))
    # Niteliksiz mutlak iddia: "evrakin tamami sentetik" derken ana deney / hipotez
    # sinirlamasi TASIMAYAN cumle. Boyle bir cumle 2.2'nin uc katmanini yalanlar.
    mutlak = [m.group(0) for m in
              re.finditer(r"[^.]*evrakın tamamı sentetik[^.]*\.", tum, re.I)
              if not re.search(r"ana deney|hipotez sınama|D1-D3", m.group(0), re.I)]
    kontrol(2, "Sentetik/gerçek ayrımı katmanlı",
            sentetik_yani and gercek_yani and not mutlak,
            f"sentetik yanı={sentetik_yani}, gerçek yanı={gercek_yani}, "
            f"niteliksiz iddia={len(mutlak)}", "ikisi de var, niteliksiz iddia 0")

    # 3) Etik karari kurula birakilmis mi?
    tabi_degil = len(re.findall(r"etik kurul onayına tabi değildir", tum))
    kurula = len(re.findall(r"yetkili etik kurul|etik kuruldan resmî görüş", tum))
    kontrol(3, "Etik kararı kurula bırakıldı", tabi_degil == 0 and kurula >= 2,
            f"'tabi değildir'={tabi_degil}, 'kurula ait'={kurula}", "0 ve ≥2")

    # 4) Kapsam katmanlari
    k = {a: len(re.findall(a, tum, re.I)) for a in ("çekirdek", "tamamlayıcı", "opsiyonel")}
    kontrol(4, "Kapsam katmanları tanımlı", all(v >= 1 for v in k.values()), k, "üçü de ≥1")

    # 5) Istatistik sunumu katmanli mi (birincil / duyarlilik ayrimi)?
    b2 = ic.get("bolum_2", "")
    katmanli = "DUYARLILIK VE İKİNCİL" in b2 and "BİRİNCİL ANALİZLER" in b2
    kontrol(5, "İstatistik sunumu katmanlı", katmanli, katmanli, "iki başlık da var")

    # 6) Ozet okunabilirligi
    o = ic["ozet"]
    c = [x for x in re.split(r"(?<=[.!?])\s+", o) if x.strip()]
    ort = len(o.split()) / max(len(c), 1)
    enuzun = max(len(x.split()) for x in c)
    kontrol(6, "Özet okunabilirlik", ort <= 20 and enuzun <= 32,
            f"{len(o.split())} kelime, ort {ort:.1f}, en uzun {enuzun}", "ort≤20, max≤32")

    # 7) Yayin basari sarti degil
    ye = json.dumps(ic["yaygin_etki"], ensure_ascii=False)
    kontrol(7, "Yayın başarı şartı değil", "başarı şartı değildir" in ye,
            "ibare var" if "başarı şartı değildir" in ye else "YOK", "var")

    # 8) Butce dayanikliligi
    dus = tum.lower()
    kontrol(8, "Azaltma sırası + korunan çekirdek",
            "azaltma" in dus and "korunan çekirdek" in dus,
            f"azaltma={'azaltma' in dus}, çekirdek={'korunan çekirdek' in dus}", "ikisi de")

    # 9) Asiri BUYUK HARF vurgusu — BASLIK SATIRLARI HARIC.
    # Basliklar bilincli ALL-CAPS ve madde 5 onlarin VARLIGINI sart kosuyor;
    # onlari vurgu saymak kalici yanlis-pozitif uretiyordu.
    KISALTMA = {"DEFF", "TOST", "MRR", "OCR", "CER", "WER", "KVKK", "ROC", "BCA",
                "GEE", "AC1", "ICC", "TÜBİTAK", "APA", "ARBİS", "BİDEB"}
    vurgu = []
    for a in ALAN:
        for satir in ic.get(a, "").split("\n"):
            s = satir.strip()
            # Baslik satiri parantezli bir aciklama tasiyabilir
            # ("ÖZGÜL HEDEFLER (iş paketi eşlemesiyle)"); parantez ici atilmadan
            # isupper() False donuyor ve baslik govde vurgusu sanilyordu.
            harfli = re.sub(r"[^A-Za-zÇĞİÖŞÜçğıöşü]", "", re.sub(r"\([^)]*\)", "", s))
            if not s or (harfli.isupper() and len(s) < 90):   # başlık satırı
                continue
            vurgu += [w for w in re.findall(r"\b[A-ZÇĞİÖŞÜ]{5,}\b", s)
                      if w not in KISALTMA]
    kontrol(9, "Gövde içi büyük harf vurgusu", len(vurgu) == 0,
            f"{len(vurgu)} adet {sorted(set(vurgu))[:6]}", "0")

    # 10) Dogrulanmamis atif etiketi — artik kaynakca da havuzda.
    kontrol(10, "Doğrulanmamış atıf etiketi", tum.count("[DOĞRULA") == 0,
            tum.count("[DOĞRULA"), "0")

    # --- rapor
    print("=" * 80)
    print("DIŞ GERİ BİLDİRİM — 10 MADDE DOĞRULAMASI")
    print("=" * 80)
    kalan = 0
    for no, ad, gecti, olculen, beklenen in sonuc:
        print(f"  [{'OK  ' if gecti else 'KALDI'}] {no:>2}. {ad:<36} "
              f"{olculen}  (bkl: {beklenen})")
        if not gecti:
            kalan += 1

    # --- bilgi: program adi yazimi. KARAR VERMEZ.
    if docx_yolu:
        try:
            from docx import Document
            d = Document(docx_yolu)
            kenar = "\n".join(p.text for s in d.sections
                              for p in list(s.header.paragraphs) + list(s.footer.paragraphs))
            print(f"\n  [bilgi] Üstbilgide '2209-A'={len(re.findall('2209-A', kenar))} · "
                  f"'2209/A'={len(re.findall('2209/A', kenar))} — fark TÜBİTAK'ın "
                  f"kendi resmî formundan gelir, DÜZELTİLMEZ.")
        except Exception as e:
            print(f"\n  [bilgi] Üstbilgi okunamadı: {e}")

    print("-" * 80)
    print(f"KALAN: {kalan}/{len(sonuc)}")
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())
