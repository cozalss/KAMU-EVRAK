"""GUC ANALIZI blogunu OLCULMUS sayilarla degistirir + kapak donem ibaresini duzeltir.

Onceki metin "IP1'de kosulacak" diye TAAHHUT ediyordu. Simulasyon fiilen kosuldu
(guc_simulasyonu.py · h2_secenek.py · h2_mdes480.py, tohum 20260808, 1200-2000 tekrar):

  H1  fark 0,10 -> guc 0,857    (MDES 0,10)
  H2  n=240, etkilesim 0,10 -> guc 0,314 ; MDES 0,19
      n=480 -> MDES 0,13 ; guc 0,80 icin n ~ 860
  H3  ana etki (monoton egilim) -> 0,99-1,00
  H4  DEFF 1,80, etkin n 167 -> 0,998
  H6  Friedman, dort kosul -> 1,000
  H9  n_alt=48 -> 0,870 ; n_alt=72 -> 0,939

En onemli bulgu: H2 (amiral hipotez) n=240'ta ZAYIF. Bunu gizlemek yerine MDES olarak
ILAN ediyoruz ve maliyeti hesaplanmis, on-kayitli bir genisletme kosulu tanimliyoruz.
Panelist icin bu, gucu abartan bir metinden daha guclu bir sinyaldir.
"""
import sys, json, re
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))
hata = 0

YENI_GUC = (
"GÜÇ ANALİZİ (SİMÜLASYONLA ÖLÇÜLMÜŞTÜR): Aşağıdaki değerler taahhüt değil, başvuru "
"öncesinde koşulmuş Monte Carlo simülasyonunun (sabit tohum, 1.200-2.000 tekrar; belge "
"düzeyi rastgele kesişim, standart sapma 0,8 lojit) çıktısıdır; simülasyon betiği ön-kayıt "
"ekinde yayımlanır. H1 (eşleştirilmiş ikili sonuç; p01 = 0,15; p10 = 0,05; eşleşmiş odds "
"oranı 3,0; mutlak fark 0,10): Kapı 1'deki üç test için Holm'un en katı basamağında "
"(alfa = 0,0167) n = 240'ta güç 0,857; saptanabilir en küçük fark 0,10'dur. H3 (bozulmanın "
"monoton ana etkisi): seviye başına 0,10 düşüşte güç 0,99, 0,15 düşüşte 1,00. H4 (ölçüm "
"geçerliliği; H0: kappa <= 0,60'a karşı 0,80, taban yaygınlık 0,25): DEFF = 1,80 ile etkin "
"örneklem 167, güç 0,998; planlanan 300 iddia fazlasıyla yeterlidir. H6 (dört eşleşmiş tur, "
"Friedman): güç 1,00. H9 (küme dışı alt grup etkileşimi): 48 belgelik alt kümede güç 0,870, "
"72 belgelik alt kümede 0,939.\n\n"

"H2 GÜCÜ AÇIKÇA SINIRLIDIR VE BU SINIR İLAN EDİLİR: Etkileşim hipotezleri ana etkilerden "
"yaklaşık dört kat büyük örneklem ister. Simülasyon, n = 240'ta 0,10'luk bir etkileşim için "
"gücün yalnız 0,314 olduğunu, 0,80 güce ulaşmak için n'in yaklaşık 860 olması gerektiğini "
"göstermiştir. Bu örneklem on iki aylık süre ve mevcut bütçeyle ulaşılabilir değildir. "
"Dolayısıyla H2 için saptanabilir en küçük etkileşim ÖN-KAYITTA 0,19 olarak ilan edilir: "
"gözlenen etkileşim bu değerin altındaysa çalışma 'anlamlı fark yoktur' DEMEZ, bulguyu güç "
"sınırlı ve sonuçsuz olarak, etki büyüklüğü ve %95 güven aralığıyla birlikte raporlar. "
"Bu raporlama biçiminin kendisi alana katkıdır: bu etkileşimin saptanabilmesi için gereken "
"örneklem büyüklüğü ilk kez sayısal olarak ilan edilmiş olur.\n\n"

"H2 İÇİN ÖN-KAYITLI GENİŞLETME KOŞULU: H2 yalnız iki mimari kolunu (b2 ve c) üç bozulma "
"seviyesiyle, yani altı koşulda kullanır. İP1'de yeniden koşulan tabanda gözlenen etkileşim "
"eğilimi 0,19'un altında fakat sıfırdan uzak görünürse, alt desen 240 ek sentetik belgeyle "
"n = 480'e çıkarılır; bu yalnız altı koşulda koşulduğu için 1.440 ek model çağrısı demektir "
"ve bütçenin beklenmedik durum payından karşılanır. Bu genişletmeyle saptanabilir en küçük "
"etkileşim 0,19'dan 0,13'e iner (simülasyonla ölçülmüştür). Genişletme kararı, veriye "
"bakılarak değil İP1 pilot ölçümüne bakılarak ve ön-kayıt kilidinden ÖNCE verilir; "
"uygulanan dal ön-kayıt geçmişinde tarih damgalıdır.\n\n"

"H1 için de bağlayıcı kural ilan edilir: İP1'de yeniden koşulan tabanda (c)-(b2) farkının "
"nokta tahmini 0,10'un altında kalırsa H1'in çerçevesi, kilit öncesinde üstünlükten TOST "
"eşdeğerliğine (delta = 0,10) çevrilir; bilgi iddiası 'kısıtın kazancı güncel üreteçlerde "
"eşdeğerlik bandına daralmıştır' olur. Sağlayıcı bloğunun 80 belgelik alt kümesinde "
"sağlayıcı x mimari etkileşiminin gücü aynı simülasyonla kestirilmiş olup 0,80'in altındadır; "
"bu etkileşim bu nedenle onaylayıcı ailenin üyesi değil, bloklama varsayımını sınayan "
"keşifsel bir kontroldür."
)

# --- 1) GUC ANALIZI blogunu degistir
m = re.search(r"GÜÇ ANALİZİ.*?(?=\n[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]{6,}:|\n2\.\d|\Z)",
              ic["bolum_2"], re.S)
if m:
    eski = m.group(0)
    ic["bolum_2"] = ic["bolum_2"].replace(eski, YENI_GUC)
    print(f"  [OK  ] GÜÇ ANALİZİ değiştirildi: {len(eski)} -> {len(YENI_GUC)} karakter")
else:
    print("  [HATA] GÜÇ ANALİZİ bloğu bulunamadı")
    hata += 1

# --- 2) Bütçeye beklenmedik durum payı ekle (genisletme kosulunu karsilar)
for b in ic["butce"]:
    if "bulut" in str(b.get("aciklama", "")).lower():
        if "beklenmedik" not in str(b.get("aciklama", "")):
            b["aciklama"] = (str(b["aciklama"]).rstrip(". ") +
                             ". Kalemin içinde, H2 genişletme koşulu devreye girerse "
                             "gereken 1.440 ek koşum için beklenmedik durum payı ayrılmıştır.")
            print("  [OK  ] Bütçe: H2 genişletme payı bulut kalemine işlendi")
        break

# --- 3) Kapak: 2209-A'da DÖNEM numaralandırması kalkmış
ic["donem"] = ""
print("  [OK  ] Kapak: 'dönem' ibaresi kaldırıldı (2209-A'da dönem numaralandırması yok)")

# --- DENETİM
b2 = ic["bolum_2"]
for kalip, olmali in (("0,314", True), ("0,19", True), ("0,13", True), ("860", True),
                      ("0,857", True), ("SİMÜLASYONLA ÖLÇÜLMÜŞTÜR", True),
                      ("H7", False), ("H11", False)):
    var = kalip in b2
    ok = var == olmali
    print(f"  [{'OK  ' if ok else 'HATA'}] '{kalip}' {'var' if var else 'yok'} "
          f"(beklenen: {'var' if olmali else 'yok'})")
    hata += not ok

tut = sum(x.get("tutar_tl", 0) or 0 for x in ic["butce"])
print(f"  [{'OK  ' if tut <= 12000 else 'HATA'}] bütçe toplamı {tut} TL (≤12.000)")

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nYAZILDI: {yol} | HATA: {hata}")
sys.exit(1 if hata else 0)
