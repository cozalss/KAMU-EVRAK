"""Arastirma olanaklari 'Donanim' satirini SOMUT ozelliklerle gunceller.

Madde 4.1.8: firma / ticari urun / marka adi GECEMEZ. Bu yuzden islemci ve
hizlandirici modeli yazilmaz; olculebilir buyuklukler (cekirdek, GHz, GB) yazilir.
Panel "donanim ayrintisi somut yazilsin" demisti; bu satir o acik maddeyi kapatir.
"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

YENI = (
    "Deneyler ekip üyelerinin mevcut kişisel bilgisayarlarında yürütülür; donanım alımı "
    "talep edilmemektedir. Birincil deney makinesi 6 çekirdekli / 12 iş parçacıklı, yaklaşık "
    "3,8 GHz masaüstü işlemci, 48 GB sistem belleği, 12 GB görüntü belleğine sahip bir "
    "hesaplama hızlandırıcısı ve 1 TB katı hâl sürücü içerir. Yerel açık ağırlıklı model "
    "4-bit nicelemeli çalıştırılacağından yaklaşık 6 GB görüntü belleği yeterlidir; mevcut "
    "12 GB, bu kolu toplu koşumla tam kapasitede yürütmeye elverişlidir ve sağlayıcı "
    "bloğunun yerel seviyesi için ek kaynak gerektirmez. Katılımcı oturumları danışmanın "
    "bölümündeki mevcut derslik ve çalışma odalarında yürütülür."
)

YASAK = ["nvidia", "geforce", "rtx", "amd", "ryzen", "intel", "core i", "gigabyte",
         "windows", "directx"]
dusuk = YENI.lower()
ihlal = [y for y in YASAK if y in dusuk]

for o in ic["olanaklar"]:
    if "onan" in o["altyapi"]:
        print(f"  eski ({len(o['kullanim_amaci'])} karakter): {o['kullanim_amaci'][:90]}…")
        o["kullanim_amaci"] = YENI
        print(f"  yeni ({len(YENI)} karakter): {YENI[:90]}…")
        break

print(f"\n  madde 4.1.8 marka taraması: {ihlal or 'TEMİZ'}")
json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("YAZILDI:", yol)
