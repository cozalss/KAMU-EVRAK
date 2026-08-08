"""v5 bolumlerini birlestirir, ajanlar arasi kalan celiskiyi kapatir, yapiyi dogrular."""
import sys, os, json, re
sys.stdout.reconfigure(encoding="utf-8")

KAYNAK, V4, CIKTI = sys.argv[1], sys.argv[2], sys.argv[3]
ic = json.load(open(KAYNAK, encoding="utf-8"))


def oku(ad):
    y = os.path.join(V4, ad)
    return open(y, encoding="utf-8").read().strip() if os.path.exists(y) else None


def okuj(ad):
    y = os.path.join(V4, ad)
    return json.load(open(y, encoding="utf-8")) if os.path.exists(y) else None


print("--- BİRLEŞTİRME ---")
for ad, anahtar in (("v5_bolum_2.txt", "bolum_2"), ("v5_bolum_1_1.txt", "bolum_1_1"),
                    ("v5_bolum_1_2.txt", "bolum_1_2"), ("v5_bolum_5.txt", "bolum_5_diger")):
    v = oku(ad)
    if v:
        print(f"  {anahtar:<22} {len(ic[anahtar]):>6} -> {len(v):>6}")
        ic[anahtar] = v
    else:
        print(f"  {anahtar:<22} !! {ad} YOK")

yg = oku("v5_yonetim_girisi.txt")
if yg:
    ic["bolum_3_yonetim_girisi"] = yg
    print(f"  bolum_3_yonetim_girisi YENİ ALAN -> {len(yg)} karakter")

for ad, anahtar in (("v5_takvim.json", "calisma_takvimi"), ("v5_riskler.json", "riskler"),
                    ("v5_yaygin_etki.json", "yaygin_etki"), ("v5_butce.json", "butce"),
                    ("v5_olanaklar.json", "olanaklar")):
    v = okuj(ad)
    if v is not None:
        eski = len(json.dumps(ic[anahtar], ensure_ascii=False))
        ic[anahtar] = v
        print(f"  {anahtar:<22} {eski:>6} -> {len(json.dumps(v, ensure_ascii=False)):>6}")

# --- AJANLAR ARASI KALAN ÇELİŞKİ (2. ajanın bildirdiği):
# E3 ile yalnız BİR degerlendirici ucretli; Yontem hala "ucunun de ... belgeler" diyor.
print("\n--- ÇELİŞKİ KAPATMA ---")
DESEN = re.compile(r"yüklenici,\s*görevlendirdiği\s+üç\s+değerlendiricinin", re.I)
if DESEN.search(ic["bolum_2"]):
    ic["bolum_2"] = DESEN.sub("yüklenici, ücretlendirdiği değerlendiricinin", ic["bolum_2"])
    print("  DÜZELTİLDİ: 'üç değerlendiricinin' -> 'ücretlendirdiği değerlendiricinin'")
else:
    # daha genis arama: "ucunun de" kalibi
    m = re.search(r"[^.]*üçünün de[^.]*\.", ic["bolum_2"])
    print(f"  UYARI: birincil desen eşleşmedi. 'üçünün de' bağlamı: "
          f"{m.group(0)[:180] if m else 'bulunamadı'}")

# =================================================================== DENETİM
print("\n--- YAPISAL DENETİM ---")
hata = 0


def kontrol(ad, gecti, olculen, beklenen):
    global hata
    print(f"  [{'OK  ' if gecti else 'HATA'}] {ad:<44} {olculen}   (beklenen: {beklenen})")
    if not gecti:
        hata += 1


kat = [x.get("katki") for x in ic["calisma_takvimi"]]
kontrol("Katkı toplamı", sum(k or 0 for k in kat) == 100,
        f"{kat} = {sum(k or 0 for k in kat)}", "tam 100")
kontrol("İş paketi sayısı", len(ic["calisma_takvimi"]) == 5, len(ic["calisma_takvimi"]), "5")

aylar = []
for x in ic["calisma_takvimi"]:
    m = re.search(r"(\d+)\s*-\s*(\d+)", x["tarih_araligi"])
    if m:
        aylar.append((int(m.group(1)), int(m.group(2))))
kaps = set()
for a, b in aylar:
    kaps |= set(range(a, b + 1))
kontrol("Ay kapsaması 1–12", kaps == set(range(1, 13)), sorted(kaps), "1..12")

tut = sum(x.get("tutar_tl", 0) or 0 for x in ic["butce"])
kontrol("Bütçe toplamı", tut <= 12000, f"{tut} TL", "≤12.000")

TUM = "\n".join([ic["ozet"], ic["bolum_1_1"], ic["bolum_1_2"], ic["bolum_2"],
                 ic.get("bolum_3_yonetim_girisi", ""), ic["bolum_5_diger"],
                 json.dumps(ic["calisma_takvimi"], ensure_ascii=False),
                 json.dumps(ic["riskler"], ensure_ascii=False),
                 json.dumps(ic["yaygin_etki"], ensure_ascii=False),
                 json.dumps(ic["butce"], ensure_ascii=False),
                 json.dumps(ic["olanaklar"], ensure_ascii=False)])

boru = [s for s in ic["bolum_2"].split("\n") if s.count("|") >= 3]
kontrol("Hipotez tablosu satırı", len(boru) == 9, len(boru), "9")

atif = set(int(x) for x in re.findall(r"\[(\d{1,3})\]", TUM))
kaynak_no = set(int(re.match(r"^\s*\[(\d{1,3})\]", k).group(1)) for k in ic["kaynaklar"])
kontrol("Atıf ⊆ kaynakça", not (atif - kaynak_no), sorted(atif - kaynak_no) or "tam", "boş")
kontrol("Kullanılmayan kaynak", not (kaynak_no - atif), sorted(kaynak_no - atif) or "tam", "boş")

# kilitli degisken sayisi: "dokuz baglimli" kalintisi olmamali
kalinti_dokuz = re.findall(r"dokuz bağımlı", TUM, re.I)
kontrol("'dokuz bağımlı' kalıntısı", not kalinti_dokuz, len(kalinti_dokuz), "0")

OLUMSUZ = ["içermez", "tabi değildir", "işlenmez", "İŞLENMEMEKTEDİR", "girmez",
           "ihtiyacı yoktur", "yapılmaz", "toplanmaz", "kullanılmaz", "kaydedilmez"]
kat_bulgu = []
for m in re.finditer(r"[Kk]atılımcı", TUM):
    a, b = max(0, m.start() - 100), min(len(TUM), m.end() + 100)
    if not any(o in TUM[a:b] for o in OLUMSUZ):
        kat_bulgu.append(TUM[a:b].replace("\n", " "))
kontrol("Olumlanmış 'katılımcı'", not kat_bulgu, len(kat_bulgu), "0")
for k in kat_bulgu[:3]:
    print(f"        …{k}…")

for a, alt in (("bolum_1_1", 350), ("bolum_1_2", 350), ("bolum_2", 350),
               ("bolum_5_diger", 350), ("ozet", 350), ("bolum_3_yonetim_girisi", 350)):
    kontrol(f"{a} uzunluğu", len(ic.get(a, "")) >= alt, len(ic.get(a, "")), f"≥{alt}")

govde = sum(len(ic.get(a, "")) for a in ("ozet", "bolum_1_1", "bolum_1_2", "bolum_2",
                                          "bolum_3_yonetim_girisi", "bolum_5_diger"))
govde += sum(len(v) for v in ic["yaygin_etki"].values())
govde += sum(len(x["faaliyetler"]) + len(x["basari_olcutu"]) for x in ic["calisma_takvimi"])
govde += sum(len(x["risk"]) + len(x["tedbir"]) for x in ic["riskler"])
govde += sum(len(x["kullanim_amaci"]) for x in ic["olanaklar"])
print(f"\n  GÖVDE TOPLAMI: {govde} karakter")

json.dump(ic, open(CIKTI, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {CIKTI} | HATA: {hata}")
sys.exit(1 if hata else 0)
