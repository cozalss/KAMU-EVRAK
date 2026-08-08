"""v6 bolumlerini birlestirir, Yontem'deki etik cumlesini hizalar, dis geri bildirimin
10 maddesini FIILEN dogrular."""
import sys, os, json, re
sys.stdout.reconfigure(encoding="utf-8")

KAYNAK, V4, CIKTI = sys.argv[1], sys.argv[2], sys.argv[3]
ic = json.load(open(KAYNAK, encoding="utf-8"))


def oku(a):
    y = os.path.join(V4, a)
    return open(y, encoding="utf-8").read().strip() if os.path.exists(y) else None


def okuj(a):
    y = os.path.join(V4, a)
    return json.load(open(y, encoding="utf-8")) if os.path.exists(y) else None


print("--- BİRLEŞTİRME ---")
for a, k in (("v6_bolum_2.txt", "bolum_2"), ("v6_ozet.txt", "ozet"),
             ("v6_bolum_1_1.txt", "bolum_1_1"), ("v6_bolum_1_2.txt", "bolum_1_2"),
             ("v6_yonetim_girisi.txt", "bolum_3_yonetim_girisi"),
             ("v6_bolum_5.txt", "bolum_5_diger")):
    v = oku(a)
    if v:
        print(f"  {k:<24} {len(ic[k]):>6} -> {len(v):>6}")
        ic[k] = v
    else:
        print(f"  {k:<24} !! {a} yok")

for a, k in (("v6_takvim.json", "calisma_takvimi"), ("v6_riskler.json", "riskler"),
             ("v6_yaygin_etki.json", "yaygin_etki")):
    v = okuj(a)
    if v is not None:
        e = len(json.dumps(ic[k], ensure_ascii=False))
        ic[k] = v
        print(f"  {k:<24} {e:>6} -> {len(json.dumps(v, ensure_ascii=False)):>6}")

# --- Yontem 2.8'deki etik cumlesini 5. bolumle HIZALA
print("\n--- ETİK CÜMLESİ HİZALAMA (Yöntem 2.8) ---")
DESEN = re.compile(
    r"Değerlendiriciler hakkında veri toplanmadığı için çalışma etik kurul onayına tabi "
    r"değildir; gerekli görülmesi hâlinde muafiyet belgesi alınacaktır\.")
YENI = ("Değerlendiriciler hakkında veri toplanmadığı için çalışmanın insan katılımcılı "
        "araştırma tanımına girmediği değerlendirilmektedir; ancak bu değerlendirme "
        "başvuruya değil kurumun yetkili etik kuruluna aittir. Proje başlamadan ve hiçbir "
        "değerlendirme verisi toplanmadan önce ilgili etik kuruldan resmî görüş alınacak, "
        "kurulun kararına göre onay ya da muafiyet belgesi temin edilerek dosyaya "
        "eklenecektir (5. bölüm).")
if DESEN.search(ic["bolum_2"]):
    ic["bolum_2"] = DESEN.sub(YENI, ic["bolum_2"])
    print("  [OK  ] 2.8 etik cümlesi kurula bırakıldı")
else:
    m = re.search(r"[^.]*etik kurul[^.]*\.", ic["bolum_2"])
    print(f"  [UYARI] desen eşleşmedi. Mevcut: {m.group(0)[:220] if m else 'yok'}")

# ===================================================== 10 MADDE DOĞRULAMASI
ALAN = ["ozet", "bolum_1_1", "bolum_1_2", "bolum_2", "bolum_3_yonetim_girisi",
        "bolum_5_diger"]
TUM = "\n".join([ic[a] for a in ALAN] +
                [json.dumps(ic[k], ensure_ascii=False) for k in
                 ("calisma_takvimi", "riskler", "yaygin_etki", "butce", "olanaklar")])

print("\n--- DIŞ GERİ BİLDİRİM: 10 MADDE ---")
hata = 0


def k(no, ad, gecti, olculen, beklenen):
    global hata
    print(f"  [{'OK  ' if gecti else 'HATA'}] {no}. {ad:<38} {olculen}  (bkl: {beklenen})")
    if not gecti:
        hata += 1


# 1) H2 tek plan
eski_iz = {d: len(re.findall(d, TUM)) for d in ("320", "üçten ikiye", "0,70", "üç dallı")}
k(1, "H2 tek plan (eski kural izi)", sum(eski_iz.values()) == 0, eski_iz, "hepsi 0")

# 2) sentetik/gercek ayrimi
katman = all(x in TUM for x in ("hipotez sınamasında kullanılan evrakın",))
mutlak = len(re.findall(r"kullanılacak evrakın tamamı sentetik", TUM))
k(2, "Sentetik/gerçek ayrımı", katman or mutlak == 0,
  f"katmanlı ifade={katman}, mutlak iddia={mutlak}", "katmanlı")

# 3) etik karari kurula birakilmis mi
tabi_degil = len(re.findall(r"etik kurul onayına tabi değildir", TUM))
kurula = len(re.findall(r"yetkili etik kurul|etik kuruldan resmî görüş", TUM))
k(3, "Etik kararı kurula bırakıldı", tabi_degil == 0 and kurula >= 2,
  f"'tabi değildir'={tabi_degil}, 'kurula ait'={kurula}", "0 ve ≥2")

# 4) kapsam katmanlari
kat = all(x in TUM.lower() for x in ("çekirdek", "tamamlayıcı", "opsiyonel"))
k(4, "Kapsam katmanları", kat, kat, "üçü de var")

# 5) istatistik sunumu katmanli mi
katmanli = "DUYARLILIK VE İKİNCİL" in ic["bolum_2"] or "BİRİNCİL ANALİZLER" in ic["bolum_2"]
k(5, "İstatistik sunumu katmanlı", katmanli, katmanli, "evet")

# 6) ozet
o = ic["ozet"]
c = [x for x in re.split(r"(?<=[.!?])\s+", o) if x.strip()]
ort = len(o.split()) / max(len(c), 1)
enuzun = max(len(x.split()) for x in c)
k(6, "Özet okunabilirlik", ort <= 20 and enuzun <= 32,
  f"{len(o.split())} kelime, ort {ort:.1f}, en uzun {enuzun}", "ort≤20, max≤32")

# 7) yayinlar basari sarti degil
ye = json.dumps(ic["yaygin_etki"], ensure_ascii=False)
k(7, "Yayın başarı şartı değil", "başarı şartı değildir" in ye,
  "ibare var" if "başarı şartı değildir" in ye else "YOK", "var")

# 8) butce dayanikliligi
k(8, "Azaltma sırası + korunan çekirdek",
  "azaltma" in TUM.lower() and "korunan çekirdek" in TUM.lower(),
  f"azaltma={'azaltma' in TUM.lower()}, çekirdek={'korunan çekirdek' in TUM.lower()}", "ikisi de")

# 9) bicim
buyuk = re.findall(r"\b[A-ZÇĞİÖŞÜ]{4,}\b", TUM)
KISALTMA = {"DEFF", "TOST", "MRR", "OCR", "CER", "WER", "KVKK", "ROC", "BCA", "GEE",
            "AC1", "ICC", "TÜBİTAK", "APA"}
vurgu = [b for b in buyuk if b not in KISALTMA and len(b) > 4]
k(9, "Aşırı büyük harf vurgusu", len(vurgu) < 60, f"{len(vurgu)} vurgu", "<60")
print(f"        en sık: {sorted({v: vurgu.count(v) for v in set(vurgu)}.items(), key=lambda x: -x[1])[:8]}")
k(9, "Bozuk karakter / çift boşluk",
  not re.findall(r"[ÃÄÅÂ][\x80-\xbf]", TUM) and not re.findall(r"  +", TUM),
  f"mojibake={len(re.findall(r'[ÃÄÅÂ][ -¿]', TUM))}, çift boşluk={len(re.findall(r'  +', TUM))}",
  "0 / 0")

# 10) kaynaklar
k(10, "Doğrulanmamış atıf etiketi", TUM.count("[DOĞRULA") == 0, TUM.count("[DOĞRULA"), "0")

# --- yapisal korumalar
print("\n--- YAPISAL KORUMALAR ---")
kat_p = [x.get("katki") for x in ic["calisma_takvimi"]]
k("Y", "Katkı toplamı", sum(v or 0 for v in kat_p) == 100, sum(v or 0 for v in kat_p), "100")
kod = sorted({int(x) for x in re.findall(r"\bH(\d{1,2})\b", TUM) if x != "0"})
k("Y", "Hipotez kodları", kod == list(range(1, 9)), kod, "H1-H8")
ipk = sorted({int(x) for x in re.findall(r"İP(\d{1,2})\b", TUM)})
k("Y", "İP kodları", ipk == list(range(1, 6)), ipk, "İP1-İP5")
boru = [s for s in ic["bolum_2"].split("\n") if s.count("|") >= 3]
k("Y", "Hipotez tablosu", len(boru) == 9, len(boru), "9")
atif = set(int(x) for x in re.findall(r"\[(\d{1,3})\]", TUM))
kn = set(int(re.match(r"^\s*\[(\d{1,3})\]", x).group(1)) for x in ic["kaynaklar"])
k("Y", "Atıf bütünlüğü", not (atif - kn) and not (kn - atif),
  f"eksik={sorted(atif-kn)}, kullanılmayan={sorted(kn-atif)}", "boş/boş")
tut = sum(x.get("tutar_tl", 0) or 0 for x in ic["butce"])
k("Y", "Bütçe", tut <= 12000, f"{tut} TL", "≤12.000")

json.dump(ic, open(CIKTI, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {CIKTI} | HATA: {hata}")
sys.exit(1 if hata else 0)
