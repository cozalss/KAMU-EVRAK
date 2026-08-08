"""Genel bilgiler alanlarini icerik dosyasina isler."""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

YENI = {
    "ad_soyad": "Cem ÖZAL",
    "danisman": "Dr. Öğr. Üyesi Bilgin AVENOĞLU",
    "kurum": "Çankaya Üniversitesi, Mühendislik Fakültesi",
}

for k, v in YENI.items():
    eski = ic["genel_bilgiler"].get(k, "")
    ic["genel_bilgiler"][k] = v
    print(f"  {k:<10} {eski[:28]!r} -> {v!r}")

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nYAZILDI:", yol)
