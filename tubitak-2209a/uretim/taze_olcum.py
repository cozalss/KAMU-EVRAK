"""Bugun fiilen kosulan deterministik olcumu 2.7'ye isler.

Kosum: PYTHONPATH=backend python -m eval.retrieval_eval  (8 Agustos 2026)
  n = 16 altin belge · Recall@1 0,750 [0,505-0,898] · Recall@3 0,938 [0,717-0,989] · MRR 0,812

Neden onemli: onerideki TUM diger on calisma sayilari bayat (hizmet disi model surumu,
200+ surum once). Bu, GUNCEL kod tabaninda bugun uretilmis TEK olcumdur ve deterministik
bilesenin calisir durumda oldugunu gosterir. Kucuk orneklem durustce beyan edilir.
"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))
hata = 0

CAPA = ("Ölçülmemiş kalemler beyan edilir:")
EKLENECEK = (
"GÜNCEL KOD TABANINDA BUGÜN KOŞULAN ÖLÇÜM: Yukarıdaki bayat değerlerden farklı olarak, "
"model çağrısı içermeyen deterministik erişim yolu güncel kod tabanında yeniden koşulmuştur. "
"Madde bazında parçalanmış mevzuat korpusunda, altın belge kümesinde (n = 16) olasılıksal "
"seyrek erişim Recall@1 = 0,750 [Wilson %95 güven aralığı 0,505-0,898], Recall@3 = 0,938 "
"[0,717-0,989] ve karşılıklı sıra ortalaması 0,812 vermiştir. Bu, önerideki tek güncel "
"ölçümdür; ölçüm altyapısının çalışır ve tekrarlanabilir olduğunu gösterir. Örneklem küçük "
"olduğu için güven aralıkları geniştir ve İP1'de altın küme büyütülerek daraltılacaktır.\n\n")

if CAPA in ic["bolum_2"]:
    ic["bolum_2"] = ic["bolum_2"].replace(CAPA, EKLENECEK + CAPA, 1)
    print(f"  [OK  ] 2.7'ye taze ölçüm eklendi (+{len(EKLENECEK)} karakter)")
else:
    print("  [HATA] çapa bulunamadı")
    hata += 1

# --- yer acmak icin: "Olculmemis kalemler" paragrafini sikistir
ESKI_T = ("Ölçülmemiş kalemler beyan edilir: p95 gecikme; belge başına maliyet (tahmindir); "
          "özet ve üslup için hakem değerlendirmesi; müzakerenin yakınsaması; ölçüm defterine "
          "bağlanmamış düğümler. Ölçülmemiş bu beş kalemden üçü (gecikme, maliyet, yakınsama) "
          "D1-D3'ün bağımlı değişkenlerine dönüştürülmüş, kalan ikisi kapsam dışı bırakılmıştır.")
YENI_T = ("Ölçülmemiş kalemler beyan edilir: p95 gecikme, belge başına maliyet (tahmindir), "
          "özet ve üslup hakem değerlendirmesi, müzakerenin yakınsaması ve ölçüm defterine "
          "bağlanmamış düğümler. Bunlardan üçü (gecikme, maliyet, yakınsama) D1-D3'ün bağımlı "
          "değişkenlerine dönüştürülmüş, kalan ikisi kapsam dışı bırakılmıştır.")
if ESKI_T in ic["bolum_2"]:
    ic["bolum_2"] = ic["bolum_2"].replace(ESKI_T, YENI_T)
    print(f"  [OK  ] son paragraf sıkıştırıldı (-{len(ESKI_T) - len(YENI_T)} karakter)")

print(f"\n  bolum_2 = {len(ic['bolum_2'])} karakter")
json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("YAZILDI:", yol)
sys.exit(1 if hata else 0)
