"""Ekibi 4 ogrenciden 3 ogrenciye indirir (yurutucu + AO1 + AO2).

Korunan sozlesme: altin etiketin IKINCI BAGIMSIZ KAYNAGI, belge uretecini ve uretim
sozlugunu YAZAN kisi olamaz. Belge uretimi AO2'de oldugu icin ikinci bagimsiz kaynak
AO1'e verilir; boylece dairesellik denetimi ucuncu kisi olmadan da ayakta kalir.
"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

Y = "Proje yürütücüsü öğrenci"
A1 = "Araştırmacı öğrenci 1"
A2 = "Araştırmacı öğrenci 2"

YENI = {
    "İP1": (f"{Y} (ön-kayıt, güç simülasyonu, bayat taban metriklerin yeniden koşulması); "
            f"{A1} (maliyet pilotu, bozma işleci kalibrasyonu; ayrıca altın etiketin ikinci "
            f"bağımsız kaynağı — belge üretecini ve üretim sözlüğünü görmez, uyuşmazlıklar "
            f"danışman hakemliğinde çözülür); {A2} (belge üretimi, altın etiketleme); "
            f"danışman (ön-kayıt onayı)"),
    "İP2": (f"{Y} (deney tasarımının yürütülmesi, analiz); {A1} (koşum orkestrasyonu ve "
            f"sağlayıcı blok koşumları); {A2} (artefakt sürüm damgalama ve bütünlük denetimi); "
            f"danışman (istatistiksel model denetimi)"),
    "İP3": (f"{A2} (etiketleme kılavuzu, etiketleyici koordinasyonu); {Y} (çapa çıkarımı, "
            f"uyum analizi); {A1} (kör atama ve veri işleme altyapısı); "
            f"danışman (kodlama kılavuzu hakemliği)"),
    "İP4": (f"{Y} (eşik süpürmesi ve ödünleşim eğrisi); {A2} (müzakere tur ve rol "
            f"ablasyonu); {A1} (gecikme ve maliyet telemetrisi); danışman (karar ölçütü)"),
    "İP5": (f"{Y} (deney yürütme, analiz); {A2} (arayüz koşullarının hazırlanması, körleme, "
            f"hata tohumlama); {A1} (katılımcı planı, oturum lojistiği, kimliksizleştirme); "
            f"danışman (etik protokol ve uygulama denetimi)"),
    "İP6": (f"{Y} (bütünleşik karma model); {A1} (yeniden üretim paketi, bağımsız koşum "
            f"koordinasyonu); {A2} (dış geçerlilik kümesi); danışman (model denetimi)"),
}

print("--- GÖREV DAĞILIMI: 4 ÖĞRENCİ -> 3 ÖĞRENCİ ---")
degisen = 0
for ip in ic["calisma_takvimi"]:
    kod = ip["ad"].split("—")[0].strip()
    if kod in YENI:
        print(f"\n{kod}")
        print(f"  eski: {ip['kimler'][:110]}…")
        ip["kimler"] = YENI[kod]
        print(f"  yeni: {YENI[kod][:110]}…")
        degisen += 1

# denetim: 'ogrenci 3' hicbir yerde kalmamali
kalinti = [ip["ad"].split("—")[0].strip() for ip in ic["calisma_takvimi"]
           if "öğrenci 3" in ip["kimler"].lower()]
print(f"\n--- DENETİM ---")
print(f"  değiştirilen İP: {degisen}/6")
print(f"  'öğrenci 3' kalıntısı: {kalinti or 'yok'}")

# her IP'de en az iki ogrenci + danisman var mi
for ip in ic["calisma_takvimi"]:
    k = ip["kimler"].lower()
    n = sum(1 for x in ("yürütücü", "öğrenci 1", "öğrenci 2") if x in k)
    if n < 2 or "danışman" not in k:
        print(f"  UYARI: {ip['ad'].split('—')[0]} rol dağılımı zayıf (öğrenci={n})")

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nYAZILDI:", yol)
