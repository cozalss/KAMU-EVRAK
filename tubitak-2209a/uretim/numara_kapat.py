"""Numaralandirma dikislerini kapatir: H9->H7, H10->H8, IP6->IP5.

NEDEN: Insan deneyi cikarilinca H7/H8/H11 ve IP5 silindi; geriye H1..H6,H9,H10 ve
IP1..IP4,IP6 kaldi. Panelist bu bosluklari gorunce "H7-H8 ve IP5 nerede?" diye sorar;
kes-yapistir izlenimi bilimsel guveni zedeler (rubrik panelisti KRITIK bulgusu).

NASIL: ATOMIK tek gecis. Sirali replace YAPILMAZ (H9->H7 sonra H10->H8 sorun degil ama
IP6->IP5 gibi zincirlerde cakisma riski var); tek regex + sozluk kullanilir.

GUVENLIK: Donusum oncesi ve sonrasi kod SAYIMLARI karsilastirilir. H9 sayisi neyse
donusum sonrasi H7 sayisi o olmali; kayip/fazla varsa betik HATA verir.
"""
import sys, json, re
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

# Hipotez: H9->H7, H10->H8.  Is paketi: IP6->IP5.
H_ESLEME = {"9": "7", "10": "8"}
IP_ESLEME = {"6": "5"}

ALANLAR = ["ozet", "bolum_1_1", "bolum_1_2", "bolum_2", "bolum_5_diger"]


def say(metin):
    return {
        "H": sorted(set(re.findall(r"\bH(\d{1,2})\b", metin)), key=int),
        "IP": sorted(set(re.findall(r"İP(\d{1,2})\b", metin)), key=int),
    }


def cevir(metin):
    metin = re.sub(r"\bH(\d{1,2})\b",
                   lambda m: "H" + H_ESLEME.get(m.group(1), m.group(1)), metin)
    metin = re.sub(r"İP(\d{1,2})\b",
                   lambda m: "İP" + IP_ESLEME.get(m.group(1), m.group(1)), metin)
    return metin


print("--- DÖNÜŞÜM ---")
oncesi, sonrasi = {"H": {}, "IP": {}}, {"H": {}, "IP": {}}


def topla(hedef, metin):
    for kod in re.findall(r"\bH(\d{1,2})\b", metin):
        hedef["H"][kod] = hedef["H"].get(kod, 0) + 1
    for kod in re.findall(r"İP(\d{1,2})\b", metin):
        hedef["IP"][kod] = hedef["IP"].get(kod, 0) + 1


# --- duz metin alanlari
for a in ALANLAR:
    topla(oncesi, ic[a])
    ic[a] = cevir(ic[a])
    topla(sonrasi, ic[a])

# --- takvim
for x in ic["calisma_takvimi"]:
    for k in ("ad", "faaliyetler", "kimler", "basari_olcutu", "tarih_araligi"):
        if isinstance(x.get(k), str):
            topla(oncesi, x[k])
            x[k] = cevir(x[k])
            topla(sonrasi, x[k])

# --- riskler
for r in ic["riskler"]:
    for k in ("risk", "tedbir"):
        if isinstance(r.get(k), str):
            topla(oncesi, r[k])
            r[k] = cevir(r[k])
            topla(sonrasi, r[k])

# --- yaygin etki
for k in list(ic["yaygin_etki"]):
    topla(oncesi, ic["yaygin_etki"][k])
    ic["yaygin_etki"][k] = cevir(ic["yaygin_etki"][k])
    topla(sonrasi, ic["yaygin_etki"][k])

# --- butce + olanaklar
for b in ic["butce"]:
    for k in ("aciklama", "gerekce"):
        if isinstance(b.get(k), str):
            topla(oncesi, b[k])
            b[k] = cevir(b[k])
            topla(sonrasi, b[k])
for o in ic["olanaklar"]:
    for k in ("altyapi", "kullanim_amaci"):
        if isinstance(o.get(k), str):
            topla(oncesi, o[k])
            o[k] = cevir(o[k])
            topla(sonrasi, o[k])

print(f"  ÖNCE  H: {dict(sorted(oncesi['H'].items(), key=lambda x: int(x[0])))}")
print(f"  SONRA H: {dict(sorted(sonrasi['H'].items(), key=lambda x: int(x[0])))}")
print(f"  ÖNCE  İP: {dict(sorted(oncesi['IP'].items(), key=lambda x: int(x[0])))}")
print(f"  SONRA İP: {dict(sorted(sonrasi['IP'].items(), key=lambda x: int(x[0])))}")

# --- DENETİM: sayım korunumu
hata = 0
bekleniyor_H = {}
for kod, n in oncesi["H"].items():
    bekleniyor_H[H_ESLEME.get(kod, kod)] = bekleniyor_H.get(H_ESLEME.get(kod, kod), 0) + n
bekleniyor_IP = {}
for kod, n in oncesi["IP"].items():
    bekleniyor_IP[IP_ESLEME.get(kod, kod)] = bekleniyor_IP.get(IP_ESLEME.get(kod, kod), 0) + n

print("\n--- KORUNUM DENETİMİ ---")
for ad, bekle, ger in (("H", bekleniyor_H, sonrasi["H"]), ("İP", bekleniyor_IP, sonrasi["IP"])):
    if bekle == ger:
        print(f"  [OK  ] {ad} kod sayıları korundu")
    else:
        print(f"  [HATA] {ad} beklenen={bekle} gerçek={ger}")
        hata += 1

# H0 bir hipotez NUMARASI degil, sifir hipotezi gosterimidir (H0/Ha) — kesintisizlik
# denetiminden dislanir, yoksa dizinin 0'dan basladigi sanilir.
son_H = sorted((k for k in sonrasi["H"] if k != "0"), key=int)
son_IP = sorted(set(k for k in sonrasi["IP"]), key=int)
kesintisiz_H = son_H == [str(i) for i in range(1, len(son_H) + 1)]
kesintisiz_IP = son_IP == [str(i) for i in range(1, len(son_IP) + 1)]
print(f"  [{'OK  ' if kesintisiz_H else 'HATA'}] H kodları kesintisiz: {son_H}")
print(f"  [{'OK  ' if kesintisiz_IP else 'HATA'}] İP kodları kesintisiz: {son_IP}")
hata += (not kesintisiz_H) + (not kesintisiz_IP)

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {yol}  | HATA: {hata}")
sys.exit(1 if hata else 0)
