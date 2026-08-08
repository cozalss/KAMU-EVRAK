"""Numaralandirma sonrasi EKLENEN metinlerdeki eski kod kalintilarini temizler.

Guc analizi metni simulasyon ciktisindan yazildigi icin ESKI kodlari (H9, H10, IP6)
tasiyordu; numaralandirma o metinden ONCE kosulmustu. Bu betik yalniz kalintiyi
duzeltir ve sonucu dogrular.
"""
import sys, json, re
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

ESLEME_H = {"9": "7", "10": "8"}
ESLEME_IP = {"6": "5"}

ALANLAR = ["ozet", "bolum_1_1", "bolum_1_2", "bolum_2", "bolum_3_yonetim_girisi",
           "bolum_5_diger"]

print("--- KALINTI KONUMLARI ---")
for a in ALANLAR:
    for m in re.finditer(r"\bH(9|10)\b|İP6\b", ic[a]):
        s, e = max(0, m.start() - 90), min(len(ic[a]), m.end() + 90)
        print(f"[{a}] …{ic[a][s:e]}…\n")


def cevir(t):
    t = re.sub(r"\bH(\d{1,2})\b", lambda m: "H" + ESLEME_H.get(m.group(1), m.group(1)), t)
    return re.sub(r"İP(\d{1,2})\b", lambda m: "İP" + ESLEME_IP.get(m.group(1), m.group(1)), t)


for a in ALANLAR:
    ic[a] = cevir(ic[a])
for x in ic["calisma_takvimi"]:
    for k in ("ad", "faaliyetler", "kimler", "basari_olcutu"):
        if isinstance(x.get(k), str):
            x[k] = cevir(x[k])
for r in ic["riskler"]:
    for k in ("risk", "tedbir"):
        if isinstance(r.get(k), str):
            r[k] = cevir(r[k])
for k in list(ic["yaygin_etki"]):
    ic["yaygin_etki"][k] = cevir(ic["yaygin_etki"][k])
for b in ic["butce"]:
    for k in ("kalem", "aciklama"):
        if isinstance(b.get(k), str):
            b[k] = cevir(b[k])
for o in ic["olanaklar"]:
    for k in ("altyapi", "kullanim_amaci"):
        if isinstance(o.get(k), str):
            o[k] = cevir(o[k])

# --- DENETIM
tum = "\n".join([ic[a] for a in ALANLAR] +
                [json.dumps(ic[k], ensure_ascii=False)
                 for k in ("calisma_takvimi", "riskler", "yaygin_etki", "butce", "olanaklar")])
kod = sorted({int(x) for x in re.findall(r"\bH(\d{1,2})\b", tum) if x != "0"})
ip = sorted({int(x) for x in re.findall(r"İP(\d{1,2})\b", tum)})
print("--- SONUÇ ---")
print(f"  Hipotez kodları: {kod}")
print(f"  İP kodları:      {ip}")
hata = (kod != list(range(1, 9))) + (ip != list(range(1, 6)))
print(f"  {'OK — kesintisiz' if not hata else 'HATA — hâlâ boşluk var'}")

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {yol} | HATA: {hata}")
sys.exit(1 if hata else 0)
