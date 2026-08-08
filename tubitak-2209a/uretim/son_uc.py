"""Kalan uc maddeyi kapatir: '320' izi · Yontem 2.8 etik cumlesi · buyuk harf denetimi."""
import sys, json, re
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))
ALAN = ["ozet", "bolum_1_1", "bolum_1_2", "bolum_2", "bolum_3_yonetim_girisi",
        "bolum_5_diger"]
hata = 0

# ---------------------------------------------------------------- 1) "320" izi
print("--- 1) '320' NEREDE? ---")
for a in ALAN:
    for m in re.finditer(r"320", ic[a]):
        s, e = max(0, m.start() - 150), min(len(ic[a]), m.end() + 150)
        print(f"[{a}] …{ic[a][s:e]}…\n")
for k in ("calisma_takvimi", "riskler", "yaygin_etki", "butce", "olanaklar"):
    j = json.dumps(ic[k], ensure_ascii=False)
    for m in re.finditer(r"320", j):
        s, e = max(0, m.start() - 150), min(len(j), m.end() + 150)
        print(f"[{k}] …{j[s:e]}…\n")

# ------------------------------------------------- 3) Yontem 2.8 etik cumlesi
print("--- 3) ETİK CÜMLESİ ---")
ESKI = ("(3) Değerlendiriciler hakkında veri toplanmadığı için çalışma etik kurul onayına "
        "tabi değildir; gerekirse muafiyet belgesi alınacaktır.")
YENI = ("(3) Değerlendiriciler hakkında veri toplanmadığı için çalışmanın insan katılımcılı "
        "araştırma tanımına girmediği değerlendirilmektedir; ancak bu değerlendirme başvuruya "
        "değil kurumun yetkili etik kuruluna aittir. Proje başlamadan ve hiçbir değerlendirme "
        "verisi toplanmadan önce ilgili etik kuruldan resmî görüş alınacak, kurulun kararına "
        "göre onay ya da muafiyet belgesi temin edilerek dosyaya eklenecektir.")
if ESKI in ic["bolum_2"]:
    ic["bolum_2"] = ic["bolum_2"].replace(ESKI, YENI)
    print("  [OK  ] hizalandı")
else:
    m = re.search(r"\(3\)[^.]*etik kurul[^.]*\.[^.]*\.", ic["bolum_2"])
    print(f"  [HATA] eşleşmedi. Gerçek metin: {m.group(0)[:260] if m else 'yok'}")
    hata += 1

# --------------------------------------------- 9) buyuk harf: BASLIKLARI DISLA
print("\n--- 9) BÜYÜK HARF (başlık satırları hariç) ---")
KISALTMA = {"DEFF", "TOST", "MRR", "OCR", "CER", "WER", "KVKK", "ROC", "BCA", "GEE",
            "AC1", "ICC", "TÜBİTAK", "APA", "ARBİS", "BİDEB"}
govde_vurgu = []
for a in ALAN:
    for satir in ic[a].split("\n"):
        s = satir.strip()
        if not s:
            continue
        # Baslik satiri: tamami buyuk harf VEYA "2.x " ile baslayip buyuk harf
        harfli = re.sub(r"[^A-Za-zÇĞİÖŞÜçğıöşü]", "", s)
        baslik = harfli.isupper() and len(s) < 90
        if baslik:
            continue
        for w in re.findall(r"\b[A-ZÇĞİÖŞÜ]{5,}\b", s):
            if w not in KISALTMA:
                govde_vurgu.append((a, w, s[:110]))

print(f"  Gövde içi vurgu-büyük harf: {len(govde_vurgu)}")
for a, w, s in govde_vurgu[:15]:
    print(f"    [{a}] {w}  …{s}…")

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {yol} | HATA: {hata}")
