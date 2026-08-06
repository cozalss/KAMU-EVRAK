# İl müdürlüğü şablonları — kaynak avı durumu

Sicildeki 4066 kurumun **1377'si il müdürlüğüdür** ve bunlar **17 türün 81 ilde tekrarıdır**
(17 × 81 = 1377). Birim listesi her tür için ilgili bakanlığın **taşra yönetmeliği/yönergesinde
tür geneli** olarak belirlenir; tek doğrulanmış kaynak 81 kurumu birden açar. Mekanizma
belediye/üniversite/il özel idaresi şablonlarıyla aynıdır — bkz. `11-mevzuat-teskilat.md`.

Bu dosya **kaynak avının durumunu** tutar. Amacı, aynı duvara tekrar tekrar toslamamaktır:
bir tür "kaynak yok" diye işaretlendiyse gerekçesi burada yazılıdır ve yeniden denemeden önce
o gerekçenin değişip değişmediğine bakılır.

## Değişmezler

- Kaynak **resmî `.gov.tr`** ve **TLS doğrulamalı** olmalı; doğrulama kapatılarak alınan
  kaynak kaydedilmez.
- **Arama motoru özeti kaynak değildir.** Özet birim adı verse bile belgenin kendisi
  görülmeden şablon yazılmaz — şablon 81 kurumu birden etkiler, bir hata da o ölçekte yayılır.
- Kaynak birim listesini vermiyorsa **uydurulmaz**; tür atlanır ve nedeni buraya yazılır.
- **Güncellik** kritiktir: taşra yönetmelikleri birim adlarını değiştirebiliyor. Bayat metinden
  yazmak, 81 kurumda birden var olmayan birime evrak yönlendirmek demektir.

## Durum tablosu

| # | Tür (slug kuyruğu) | Durum | Kaynak / engel |
|---|---|---|---|
| 1 | `il-milli-egitim-mudurlugu` | **TAMAM** — 23 birim | MEB Millî Eğitim Müdürlükleri Yönetmeliği (RG 26/4/2025), `ttkb.meb.gov.tr`. 2025 sürümü birim adlarını değiştirmişti; eski sürüm kullanılmadı. Ölçüm 10/10. |
| 2 | `il-saglik-mudurlugu` | ARANACAK | `yhgm.saglik.gov.tr/TR-92141/...` denendi: sayfa **merkez** teşkilatını (Yönetim Hizmetleri GM daireleri) veriyor, il müdürlüğünü değil. Doğru belge muhtemelen "Sağlık Bakanlığı Taşra Teşkilatı Kadro Standartları ile Çalışma Usul ve Esaslarına Dair Yönerge". |
| 3 | `il-tarim-orman-mudurlugu` | ENGELLİ | Taşra görev yönergesi `tarimorman.gov.tr/Belgeler/...` altında; sunucu bu yolda bağlantıyı zorla kapatıyor (WinError 10054). Ana site erişilebilir. İl sitelerinde (ör. `istanbul.tarimorman.gov.tr`) şube menüleri var ama bunlar **kuruma özel** kaynaktır, tür geneli şablon dayanağı değildir. |
| 4 | `il-muftulugu` | **KAYNAK SUSUYOR** | Diyanet Görev ve Çalışma Yönergesi (`hukukmusavirligi.diyanet.gov.tr`) alındı ve okundu: m.115 taşra **şube müdürünün ortak görevlerini** tanımlıyor, ama il müftülüğünde **hangi şubelerin bulunduğunu saymıyor**. Yönergede atıf yapılan "Diyanet İşleri Başkanlığı Görev ve Çalışma Yönetmeliği m.30" denenmedi — sıradaki aday. |
| 5 | `sosyal-guvenlik-il-mudurlugu` | KAYNAK YETERSİZ | 4 s. CBK m.427 il müdürlüğünün **varlığını** düzenliyor ("her ilde kurulan SGİM ile SGİM'lere bağlı SGM'ler"), **iç birimlerini** değil. SGK'nın kendi taşra yönergesi aranmalı. |
| 6 | `vergi-dairesi-baskanligi` | **ÖNCE SİCİL DÜZELTİLMELİ** | Kaynak avı ikinci bir soruna çarptı — aşağıya bak. Yönetmelik metnine erişilemedi: GİB portalı JS ile çiziliyor (102 karakter), `.htm` kopyalar 404, `resmigazete.gov.tr` sertifika zinciri kırık (mevzuat.gov.tr ile aynı durum). |
| 7 | `il-nufus-vatandaslik-mudurlugu` | ARANACAK | Aday: NVİ taşra teşkilatı yönetmeliği. |
| 8 | `il-emniyet-mudurlugu` | ARANACAK | Aday: 3201 s. Emniyet Teşkilat Kanunu + EGM taşra düzenlemesi. Merkez teşkilatı zaten doğrulandı (`emniyet-genel-mudurlugu`). |
| 9 | `il-jandarma-komutanligi` | ARANACAK | Aday: 2803 s. Kanun. |
| 10 | `cevre-sehircilik-iklim-degisikligi-il-mudurlugu` | **KAYNAK BAYAT + TEK TİP DEĞİL** | `webdosya.csb.gov.tr/db/kys/editordosya/Tasra-Teskilat-Yapisi.pdf` indirildi ve okundu. İki ayrı sebeple kullanılmadı: (1) belge **Nisan 2014** tarihli, en geç atıf 2013 ve içinde **Millî Emlak** şube müdürlükleri sayılıyor — oysa Millî Emlak 2018'de Çevre-Şehircilik'ten **Hazine ve Maliye'ye** geçti; bu liste bugün yanlış bakanlığın birimlerini CSB il müdürlüğüne yazdırırdı. (2) Bakanlık Makamının 28/2/2013 tarihli Olur'u ile **dört ayrı tipte** (A/B/C/D) il teşkilatı kurulmuş ve şube listesi tipe göre değişiyor — tek-tip şablon zaten kurulamaz; dört ayrı şablon + tip-il eşlemesi gerekir. Güncel bir taşra düzenlemesi bulunursa bu iki koşul birlikte çözülmeli. |
| 11 | `aile-sosyal-hizmetler-il-mudurlugu` | ARANACAK | — |
| 12 | `il-kultur-turizm-mudurlugu` | ARANACAK | — |
| 13 | `genclik-spor-il-mudurlugu` | ARANACAK | — |
| 14 | `ticaret-il-mudurlugu` | ARANACAK | — |
| 15 | `il-afet-acil-durum-mudurlugu` | ARANACAK | AFAD merkez teşkilatı 4 s. CBK m.35'ten doğrulandı; taşra ayrı düzenlemede. |
| 16 | `il-goc-idaresi-mudurlugu` | ARANACAK | Göç İdaresi merkez teşkilatı 4 s. CBK m.161'den doğrulandı; taşra ayrı. |
| 17 | `il-calisma-is-kurumu-il-mudurlugu` | ARANACAK | İŞKUR merkez teşkilatı 4 s. CBK m.622'den doğrulandı; taşra ayrı. |

## AÇIK BULGU — sicilde 52 il için var olmayan kurum kayıtlı

Vergi dairesi başkanlığı türünün kaynağı aranırken çıktı ve **şablon yazılmadan önce
çözülmesi gerekiyor.**

`sicil.json` her il için bir `<il>-vergi-dairesi-baskanligi` kaydı tutuyor — toplam **81**.
Oysa bu depoda **doğrulanmış** olan GİB 2023 Yılı Faaliyet Raporu şunu söylüyor:

> "Başkanlığın taşra teşkilatı ise **29 ilde örgütlenmiş 30 vergi dairesi başkanlığı** ile
> **52 il defterdarlığı** bünyesinde yer alan gelir birimlerinden oluşmaktadır."

Yani 52 ilde vergi dairesi başkanlığı **YOKTUR**; gelir işleri o illerde defterdarlık
bünyesindeki gelir birimlerince yürütülür. Sicildeki 52 kayıt gerçekte var olmayan kurumu
gösteriyor.

**Neden şablon yazmadan önce düzeltilmeli:** 81 illik kapsamla şablon kurulsaydı, "Ağrı Vergi
Dairesi Başkanlığı"na yazılmış bir evrağa sistem kendinden emin bir birim önerecekti. Var
olmayan bir kuruma güvenle yönlendirmek, hiç öneri vermemekten kötüdür — memur öneriyi
doğrulanmış gördüğü için sorgulamaz. Kapsam sınırı daima kaynaktan gelir (INV-6); burada
kaynak 29 il diyor.

**Yapılacak sıra:**
1. Hangi 29 ilde başkanlık bulunduğu GİB'in resmî listesinden tespit edilir.
2. `sicil.json`daki fazla 52 kayıt kaldırılır ya da tür/ad düzeltilir (o illerde muhatap
   `<il>-defterdarligi` gelir birimidir).
3. Kapsam dosyası bu 29 ille sınırlı yazılır, ancak ondan sonra şablon kurulur.
4. Aynı kontrol **defterdarlık** türü için de yapılır: 1/9/2024'te Millî Emlak ve Personel
   birimleri defterdarlıktan ayrıldı; plan adımı E zaten bunu öngörüyor.

Bu bulgu, "kapsam sayısı sicilden alınır" varsayımının test edilmesi gerektiğini gösteriyor:
**sicil bir envanterdir, doğrulanmış kaynak değildir.**

## Kaynak avında tekrar eden üç engel

Beş tür denendikten sonra engellerin rastgele olmadığı görülüyor:

1. **TLS zinciri kırık merkezî kaynaklar.** `mevzuat.gov.tr` ve `resmigazete.gov.tr` sertifika
   zincirini eksik sunuyor; hem Node hem Python istemcilerinde doğrulama düşüyor. Türkiye'nin
   iki kanonik mevzuat kaynağı bu yüzden kullanılamıyor ve her tür için kurumun KENDİ
   yayınını aramak gerekiyor. Doğrulamayı kapatmak yasak.
2. **Bayat taşra belgeleri.** Kurumlar merkez teşkilatını güncel tutuyor ama taşra
   düzenlemelerini yıllarca yenilemiyor (CSB'de 2014, Tarım'da 2018). Bayat listeyi yazmak
   81 kurumda birden var olmayan birime yönlendirme demektir — MEB'de aynı tuzak yakalandı,
   orada 2025 sürümü bulunabildiği için kurtarıldı.
3. **Taşra tek tip olmayabilir.** CSB'de dört ayrı il teşkilatı tipi var ve şube listesi tipe
   göre değişiyor. Şablon mekanizması tek listeyi tüm kapsama uyguladığı için böyle türlerde
   ya tip başına ayrı şablon + kapsam listesi gerekir, ya da tür şablonlanamaz.

Bu üç engel, il müdürlüğü şablonlarının merkez teşkilatı kadar kolay olmayacağını gösteriyor:
merkez teşkilatı kararnamede tek elden ve güncel sayılıyor, taşra ise dağınık ve eski.

## Plan adımı B — Kalkınma ajansları: birimler HAZIR, kapsam eksik

4 sayılı CBK **m.190**: *"Ajansın teşkilat yapısı aşağıdaki gibidir: a) Kalkınma kurulu.
b) Yönetim kurulu. c) Genel sekreterlik. ç) Yatırım destek ofisleri."* Dördünün de kendi
maddesi var (m.191 kalkınma kurulu, m.197 yatırım destek ofisleri, …), yani görev metinleri
lafzî olarak alınabilir.

**Ayrıştırıcı bu maddede 0 birim buldu** çünkü bent adları KÜÇÜK harfle yazılmış
("a) Kalkınma kurulu.") ve unvan listesi büyük harfe göre. Regex'i gevşetmek yerine bu dört
birim doğrudan `kurum_teskilat_yaz.py` ile yazılmalı — dört birim için desen genişletmek,
başka yerlerde aşırı eşleşme riski getirir.

**KAPSAM SORUNU (çözülmeden şablon kurulmamalı):** Kararnamenin **EK LİSTE**'si Düzey 2
İstatistikî Bölge Birimlerini sayıyor ve bunlar **26 bölge**dir (TR10, TR21, TR22, TR31,
TR32, TR33, TR41, TR42, TR51, TR52, TR61, TR62, TR63, TR71, TR72, TR81, TR82, TR83, TR90,
TRA1, TRA2, TRB1, TRB2, TRC1, TRC2, TRC3). m.186: ajanslar bölgeler esas alınarak kurulur.
Sicilde ise yalnız **24** kalkınma ajansı var — **iki tanesi eksik**.

Ajans ADLARI kararnamede yok; Cumhurbaşkanı kararıyla belirleniyor. Eksik ikisinin adı
Sanayi ve Teknoloji Bakanlığının ajans listesinden tamamlanmalı.

**Eksik kapsam ile fazla kapsam arasındaki fark burada nettir ve genel kuraldır:**
- *Fazla* kapsam (vergi dairesi başkanlığı: sicil 81, kaynak 29) **tehlikelidir** — var
  olmayan kuruma güvenle birim önerilir, memur doğrulanmış gördüğü için sorgulamaz.
- *Eksik* kapsam (kalkınma ajansı: sicil 24, kaynak 26) **güvenlidir** — iki ajans öneri
  alamaz, yanlış öneri almaz. Şablon 24 ile kurulabilir, eksik ikisi sonra eklenir.

## Şablon nasıl eklenir

1. Kaynağı bul, `scripts/mevzuat_pdf_cek.py` ile indir (TLS doğrulamalı).
2. Birim + görev metnini **madde sınırlarından deterministik** çıkar. İleri-bakışlı desen
   kullanma: görev metninin içindeki madde atıfları ("… Yönetmeliğinin 5 inci maddesi")
   sınırı şaşırtıyor ve metin cümle ortasından kesiliyor (MEB'de ölçüldü).
3. `scripts/il_mudurlugu_sablon_uret.py` ile şablonu yaz (birim/görev çiftleri JSON ile
   AÇIKÇA verilir; araç sayfadan körlemesine yazmaz).
4. `scripts/kaynak_kaydet.py` ile manifeste kaydet → `scripts/seed_teskilat.py`.
5. En az 5 sorguyla, **farklı illerde** ölç. Şablonun il-bağımsız olduğu doğrulanmalı.
6. Regresyon testi: kapsam sınırı (ilçe/başka tür dışarıda) · kaldırılan eski adlar geri
   gelmiyor · konu→birim ayrımı. Örnek: `tests/test_mevzuat_il_mudurlukleri.py`.
7. Kalite kapısı + tam test + ruff + commit.

## Sonraki plan adımları (il müdürlükleri bitince)

- **B** — Kalkınma ajansları (24): 4 s. CBK'da "Kalkınma Ajansları" bölümü var.
- **C** — Büyükşehir belediyeleri (31): 5216 s. Kanun m.21.
- **D** — Kaymakamlık kapsam boşluğu (54): `_kapsam/ilceler.txt` sicildeki 973 kaymakamlıkla
  karşılaştırılıp tamamlanmalı.
- **E** — Defterdarlıklar (81): **önce** 1/9/2024 tarihli GİB devrinin ne değiştirdiği
  doğrulanmalı — Millî Emlak ve Personel birimleri artık defterdarlık birimi değil.

## Kapsanamayacaklar (dürüst sınır)

- **79 vakıf üniversitesi** — 124 s. KHK kapsamında değil, her birinin kendi yönetmeliği var;
  tür geneli şablon mümkün değil.
- **10 özelleştirilmiş dağıtım şirketi** — birimleri mevzuatla belirlenmiyor. Bu kurumlar için
  "birim üretilemez" DOĞRU cevaptır; sistem onları `aday` etiketiyle memur onayına gönderir.
