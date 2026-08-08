# 2209-A — ALTI HAKEM BULGU DEFTERİ (uygulanacak)

Kaynak: rubrik panelisti (80/100 SINIRDA) · bilimsellik şüphecisi (tez ÇÜRÜTÜLDÜ, SINIRDA) ·
tutarlılık denetimi (5 kritik) · istatistik hakemi (21/25, aritmetik hata 0) ·
ön inceleme (PANELE ULAŞIR, eleme 0) · fizibilite (bekleniyor)

**YAKINSAMA NOTU:** Bağımsız hakemlerin AYNI kusura işaret ettiği yerler en güvenilir
bulgulardır ve önce uygulanır:
- Olanaklar katılımcı kalıntısı → panelist + şüpheci  ✅ UYGULANDI
- Kapı zinciri / ailesel hata → tutarlılık (D-5) + istatistik (#3)
- H6 değişkeni kilitli listede yok → tutarlılık (D-4) + istatistik (#2)
- Numara dikişleri (H9/H10, İP6) → panelist + şüpheci + tutarlılık + ön inceleme
- "Kör uzman" doğrulanamaz + 4,7 TL/yargı → panelist + şüpheci

---

## A. ANA OTURUM — DETERMİNİSTİK (ajan gerekmez)

| # | İş | Durum |
|---|---|---|
| A1 | Olanaklar katılımcı kalıntısı (2 cümle) | ✅ uygulandı |
| A2 | Anahtar kelime "insan gözetimli karar destek" → "denetlenebilir karar destek" | ✅ uygulandı |
| A3 | Şekil 2 altyazısı: olmayan "3.1" başlığına atıf kaldırıldı | ✅ uygulandı |
| A4 | `_meta` bayat (eski İP5 tasarımını anlatıyor) → BAYAT bayrağı | ✅ uygulandı |
| A5 | **Numaralandırma:** H9→H7, H10→H8, İP6→İP5 (atomik, korunum denetimli) | ⏳ EN SONA |
| A6 | Şekil 1 altyazısına "(seviyeler İP1'de yeniden ölçülecek ortalamaya çapalanır)" | ⏳ |
| A7 | Sayfa 21→20 (kaynakça sıkıştırma ya da metin kırpma) | ⏳ EN SONA |

**A5 neden en sonda:** hakem raporları eski kodlarla (H9/H10/İP6) konuşuyor; önce içerik
düzeltmeleri o kodlarla uygulanır, numaralandırma en son atomik geçişle yapılır.

---

## B. BÖLÜM 2 (YÖNTEM) — en yoğun bölge

### B1. Kapı zinciri + ailesel hata  [tutarlılık D-5 + istatistik #3] KRİTİK
**Kusur:** "ailesel hata on bir testte iki yönlü 0,05'te tutulur" iddiası prosedürle
sağlanmıyor. Kapı 2 yalnız Kapı 1'e bağlı; Kapı 3, 4, 5 koşulsuz. Küresel sıfır altında
gerçek FWER ≈ 1−0,95⁴ ≈ **0,19**.
**Çözüm (n=240'ı koruyan):** kapıları SERİ bağla —
> "Kapılar SERİ bağlanır: bir kapı ancak önceki kapının tüm birincil testleri karar kuralını
> karşılarsa açılır; açılmayan kapının testleri 'sınanmadı' raporlanır ve hata bütçesi
> harcamaz. Bu seri yapı altında Holm her kapıda kapının test sayısına göre uygulanır ve
> ailesel hata on bir testin bütününde 0,05'te tutulur. Tabloda anılan GEE, eşleştirilmiş
> DeLong ve karma Poisson kontrastları onaylayıcı ailenin üyesi değildir; duyarlılık/keşifsel
> çözümleme olarak düzeltmesiz raporlanır."

### B2. H3 testi yanlış  [istatistik #2] KRİTİK
Jonckheere-Terpstra **bağımsız gruplar** içindir; aynı 240 belge üç düzeyde ölçülüyor.
**Tablo satırı yerine:**
> `H3 | D1 | Bozulma (3, sıralı) | Belge düzeyi doğru/yanlış | Eşleştirilmiş tasarımda Page eğilim testi + duyarlılık olarak karma etkili lojistik regresyonda sıralı eğilim terimi | İP2`
Metindeki "Jonckheere-Terpstra" geçişleri de Page ile değişmeli.

### B3. H6 testi + kilitli değişken  [istatistik #2 + tutarlılık D-4] KRİTİK
Cochran Q ikili değişken içindir, bağımlı değişken sayımdır. Ayrıca "belge başına bulgu
sayısı" 2.3'teki dokuzluk kilitli listede YOK.
**Tablo satırı:** Friedman + Holm düzeltmeli Wilcoxon (birincil); ikilileştirmede Cochran Q
ve karma Poisson duyarlılık.
**2.3'e ekle (kilitli listeyi ONA çıkar):**
> "(10) müzakerede belge başına açık bulgu sayısı — süreç ölçüsüdür, tanımı D3'te verilir ve
> H6'nın birincil sonuç ölçüsü olarak ön-kayıtta kilitlenir."
Beyanı "dokuz" → "on" yap; buna bağlı her yeri (İP1 ölçütü, risk 6, özet) güncelle.

### B4. H10 yön çelişkisi  [istatistik #2] KRİTİK
1.1'de Ha "hibrit anlamlı biçimde daha yavaştır" (üstünlük), 2.6'da TOST (eşdeğerlik).
**Yerine:**
> "H10 — H0: Hibritin belge başına gecikme farkı log ölçekte ±%20 eşdeğerlik sınırının
> dışındadır. Ha: Fark sınır içindedir (TOST). Eşdeğerlik kurulamazsa fark eşleştirilmiş
> Wilcoxon ile betimlenir ve H1–H2 kazancının bedeli olarak raporlanır."
1.1'deki H10 ifadesi de buna göre düzeltilmeli.

### B5. Aşmazlık (non-inferiority)  [istatistik #7] ÖNEMLİ
> "H5'in yanlış-veto bileşeni ve H10, tek yönlü aşmazlık sınamasıyla kurulur; sınırlar 0,05
> (mutlak) ve log ölçekte %20'dir; %20 sınırının gerekçesi, çalışma noktasındaki p95 gecikme
> bütçesinin kullanıcıca fark edilir eşiğidir ve gereken n ön-kayıttan önce bu sınırlarla
> hesaplanıp burada raporlanır."

### B6. Eksik güç beyanları  [istatistik #4, panelist] ÖNEMLİ
- H2: "Simülasyonda saptanması hedeflenen etkileşim büyüklüğü (etkileşim odds oranı ve puan
  cinsinden karşılığı) ön-kayıtta ilan edilir."
- H9: "H9 alt grup etkileşiminin gücü aynı simülasyonla kestirilir; 0,80'in altında kalırsa
  H9 keşifsel etiketlenir." (48 belgelik alt küme)
- Blok alt kümesi: 80 belgede sağlayıcı×mimari etkileşim testinin gücü beyan edilmeli.

### B7. Uyum katsayısı gerekçesi  [istatistik #6] ÖNEMLİ
> "Cohen kappa yalnız ikili karşılaştırmalarda raporlanır; üç değerlendiricili ana çözümleme
> Krippendorff alfa iledir; taban yaygınlık 0,25'te kappa yaygınlık paradoksuna açık
> olduğundan Gwet AC1 duyarlılık ölçüsü olarak verilir."

### B8. Eksik veri kuralı  [istatistik #9] İYİLEŞTİRME
> "Model çağrısı hatası ve zaman aşımı geçersiz çıktı sayılır; değerlendirici eksiği
> çoğunlukla doldurulmaz, eksik veri olarak raporlanır."

### B9. (b2) kolunun aslına uygunluğu  [şüpheci #4] ÖNEMLİ
Ekibin kurduğu taban kol zayıf kurulursa (c) bedavaya kazanır.
> "(b2) kolunun aslına uygunluğu bağımsız bir kabul testine bağlanır: kolun istem şablonları
> [12] ve [13] çalışmalarının kamuya açık referans uygulamalarındaki şablonlara çapalanır,
> uyarlanan her satır ön-kayıt ekinde fark işaretli yayımlanır ve kolun geri getirme kullanım
> oranı ile öz-eleştiri tetiklenme oranı için ön-kayıtta alt sınır ilan edilir; alt sınırın
> altında kalan koşum b2 temsilcisi sayılmaz ve yeniden koşulur."

### B10. Kodlama kılavuzu yapı-daireselliği + uzman niteliği  [şüpheci #5 + panelist] KRİTİK
> "Kodlama kılavuzu, otomatik doğrulayıcının kural listesinden bağımsız olarak yalnız resmî
> yazışma yönetmeliği hükümlerine ve [7]'nin atfedilebilirlik tanımlarına çapalanarak yazılır;
> doğrulayıcının hiçbir eşiği, kural adı veya hata örneği kılavuza girmez ve kılavuz-doğrulayıcı
> sözlük örtüşmesi İP1'deki sözlük denetimine dâhil edilip sayısal raporlanır. Değerlendirici
> niteliği hizmet alımı şartnamesiyle güvence altına alınır: yüklenici, görevlendirdiği üç
> değerlendiricinin kamu yönetimi, hukuk veya belge yönetimi alanlarından en az birinde asgari
> üç yıllık mesleki deneyime sahip olduğunu yazılı taahhütle belgeler; bu taahhüt sözleşme
> dosyasında kalır, araştırma veri kümesine hiçbir kişisel bilgi girmez."

### B11. H1 için bağlayıcı güç kuralı  [şüpheci #9] ÖNEMLİ
> "H1 için de önceden bağlayıcı bir kural ilan edilir: İP1'de güncel sürümle yeniden koşulan
> taban ölçümünde (c)-(b2) farkının nokta tahmini 0,09'un altında kalırsa, ön-kayıt kilidinden
> önce H1'in birincil çerçevesi üstünlük sınamasından TOST eşdeğerlik sınamasına (delta = 0,09)
> çevrilir ve bu durumda araştırmanın birincil bilgi iddiası 'kısıtın kazancı modern üreteçlerde
> eşdeğerlik bandına daralmıştır' bulgusu olur; uygulanan çerçeve ön-kayıt geçmişinde tarih
> damgalıdır."

### B12. "En az 50 taranmış belge" kaynağı  [panelist] ÖNEMLİ
2.2 "gerçek kamu evrakı kullanılmaz" derken bozma işleci gerçek taranmış belgeye çapalanıyor.
> "Karakter hata oranı, kamuya açık ve kişisel veri içermeyen taranmış resmî belge
> görüntülerinde ölçülür; tarama protokolü İP1 ekinde ilan edilir."

### B13. Küçük düzeltmeler  [tutarlılık]
- 2.7 "Bu beş boşluk" → "Ölçülmemiş bu beş kalem"
- 2.7 "…D1-D3'ün bağımlı değişkenlerine dönüştürülmüştür" → "Bu beş kalemden üçü (gecikme,
  maliyet, müzakere yakınsaması) D1-D3'ün bağımlı değişkenlerine dönüştürülmüş, kalan ikisi
  kapsam dışı bırakılmıştır."
- "düğümlerin yaklaşık yarısı" — payda yok; ya sayı ver ya ifadeyi çıkar

---

## C. BÖLÜM 1.1 / 1.2 / 4 / RİSK / TAKVİM

### C1. B4 boşluğu karşılıksız  [tutarlılık D-3 + şüpheci #6] KRİTİK
Hiçbir hipotez/değişken kalibrasyon ölçmüyor ama B4 hâlâ boşluk diye iddia ediliyor.
**1.1'de B4'ten sonra ekle:**
> "Bu öneri B4'ü tümüyle kapatmaz: kapı sıkılığının ödünleşim eğrisi ve ayırt edicilik ölçümü
> (H5, İP4) yalnız gözlem tabanlı sinyal için ilk adımı verir; epistemik tür ayrıştırmasının
> kalibrasyonu, 4. bölümde ilan edilen izleyen projeye bırakılmıştır."
**4. bölümdeki** "göstergelerin ölçülen isabete kalibre edilmesi için yeniden kullanılabilir
yordam" vaadi de buna göre yumuşatılmalı (karşılıksız kalmasın).

### C2. Hedef 6 aşırı-iddia  [tutarlılık] ÖNEMLİ
"ön-kayıtlı birincil hipotezler 60 belgelik dış kümede yeniden sınanır" — oysa İP6 ve risk
tablosu yalnız H1 ve H5'i sınıyor.
> "…120 belgelik kümede yeniden sınanır; dış geçerlilik alt kümesinde ise iki ön-kayıtlı
> hipotez (H1, H5) onaylayıcı olarak sınanır."

### C3. Risk 4 örtüşme hatası  [tutarlılık]
"bir aylık örtüşme payı" → fiilen **iki ay** (6. ve 7. ay). Düzelt.

### C4. Yaygın etki kabul ölçütü kontrol dışı  [panelist] İYİLEŞTİRME
"10. ayda bildiri kitabında yayımlanması" hakem sürecine bağlı, ekibin elinde değil.
→ "10. ayda hakemli ulusal kongreye tam metin GÖNDERİMİ"

### C5. Bütçe birim bedeli dayanaksız  [şüpheci #10 + panelist] ÖNEMLİ
4.200 TL / 900 yargı ≈ 4,7 TL — nitelikli uzman için düşük görünüyor.
> "Birim bedel, iddia başına ortalama 3-4 dakikalık yargı süresi ve üç sağlayıcıdan alınan
> yazılı ön fiyat teklifi ortalamasıyla belirlenmiş, teklifler dosyada saklanmıştır; tutarın
> yetmemesi hâlinde iddia sayısı 300'den aşağı ÇEKİLMEZ, bunun yerine sarf kaleminden
> aktarım yapılır ve aktarım kuralı ön-kayıtta sabittir."

### C6. PROJE YÖNETİMİ giriş anlatısı yok  [panelist] KRİTİK
%20'lik blok üç tablodan ibaret; izleme/koordinasyon yordamı hiçbir yerde yok.
→ ~1.200 karakterlik giriş: haftalık ekip toplantısı + danışmanla iki haftada bir denetim ·
artefaktların sürüm damgalı depoda tutulması · ön-kayıt sapmalarının değişiklik günlüğü ·
kör etiketleme ve bağımsız koşum hizmetlerinin parti-teslim takvimi (100'erlik üç parti).
**NOT:** Bu metin formda 3. bölüm başlığının altına girmeli; `bolum_3_yonetim_girisi` diye
yeni bir alan gerekiyor ya da takvim tablosunun üstüne yazılmalı.

---

## E. FİZİBİLİTE HAKEMİ (14/20) — nicel bulgular

### E1. İş yükü %152  KRİTİK
19,1 adam-ay gerekli, kapasite 12,6 (3 öğrenci × 0,35 FTE × 12 ay). İP1 tek başına %171.
**Çözüm (Gantt'a dokunmadan):**
- İP1'deki "bayat taban metriklerin dokuz bağımlı değişkende yeniden koşumu" → **İP2'ye taşı**
- İP6'daki "60 belgelik dış geçerlilik kümesinin derlenmesi" → **İP3'e taşı**
İP1 4,6'ya, İP6 2,8'e iner.

### E2. İP1 kilometre taşları  KRİTİK
Ön-kayıt 2. ayda kilitlenmek zorunda ama girdileri de İP1'de → 360 belge üretimi + iki
bağımsız etiketleme 3. aya sıkışıyor, İP2 aynı ay başlıyor.
**İP1 başarı ölçütüne ekle:**
> "1. ay sonu: belge üreteci ve etiket uzayı kilitli, 120 belge üretilmiş ve birinci kaynakta
> etiketlenmiş. 2. ay sonu: ön-kayıt kilidi; 240 belgelik ana küme iki bağımsız kaynakta
> etiketlenmiş ve sızıntı denetiminden geçmiş. 3. ay sonu: 120 belgelik replikasyon kümesi
> mühürlenmiş ve açılmamak üzere ayrılmış."

### E3. Kör değerlendirme ücreti  KRİTİK
4.200/900 = 4,67 TL/yargı ≈ 61–88 TL/saat. Bu ücrete uzman bulunamaz.
**Çözüm (A — tercih edilen, güç hesabı ve desen AYNEN korunur):**
> "Kör değerlendirme, biri ekip dışından hizmet alımıyla ücretlendirilen, ikisi danışmanın
> bölümünden gönüllü akademik katkı veren üç bağımsız değerlendiriciyle tam çapraz desende
> yürütülür. Üçü de ekip üyesi değildir ve sistemin kararını görmez."
→ ücretli değerlendirici 4.200/300 = **14 TL/yargı ≈ 265 TL/saat**, savunulabilir.

### E4. Koşum hacmi belgede yok  ÖNEMLİ
En büyük bütçe kaleminin (4.300 TL) arkasındaki eşik süpürmesi ve ablasyon n'i hiçbir yerde
yazmıyor. **Bütçe gerekçesine ekle:**
> "Hacim: 3.600 (D1 gövdesi ve sağlayıcı bloğu) + 1.080 (eşik süpürmesi; dokuz nokta, 240
> belgenin sabit 120'lik alt kümesinde) + 840 (müzakere ablasyonu; yedi koşul, aynı 120
> belgede) + 720 (replikasyon) + 560 (dış geçerlilik, taban yeniden koşumu ve maliyet pilotu)
> = 6.800 model çağrılı koşum. Tavan, koşum başına 0,63 TL üst sınırı varsayar; birincil
> sağlayıcı düşük maliyetli hızlı katmandan seçilir, premium katman yalnız blok değişkeninin
> bir seviyesinde ve yalnız 80 belgelik alt kümede kullanılır. Tek taze koşumda ölçülen uçtan
> uca süre belge başına yaklaşık 84 saniyedir; toplam makine süresi 200-500 saat aralığındadır
> ve gözetimsiz koşar."

### E5. Yerel model parametre bandı  ÖNEMLİ
**Olanaklar/Donanım'a ekle:**
> "Yerel açık ağırlıklı model 7-14 milyar parametre bandından seçilir; 4-bit nicelemede
> ağırlıklar 4-7 GB tutar, kalan görüntü belleği anahtar-değer önbelleği ve toplu koşum için
> yeterlidir."
**İP1 başarı ölçütüne ekle:** "Yerel seviyede kısıtsız kolun geçersiz çıktı oranı %20'yi
aşarsa bu blok seviyesi tasarımdan çıkarılır ve bu karar ön-kayıtta ilan edilir."

### E6. İP3→İP4 ters bağımlılık  ÖNEMLİ
**İP4 faaliyet hücresine ekle:**
> "6. ve 7. ayda yalnız koşumlar ve artefakt üretimi yapılır; altın kümeye karşı puanlama
> İP3'ün teslimini izleyen 8. ayda başlar."

### E7. Ekip üyesi ayrılma riski YOK  KRİTİK
**Risk tablosuna yeni satır:**
> risk: "[İP1-İP6] Ekip üyelerinden birinin ayrılması veya uzun süreli devre dışı kalması."
> tedbir: "Her İP'de birincil ve ikincil sorumlu tanımlıdır; ikincil sorumlu artefaktlara ve
> koşum betiklerine ilk aydan itibaren erişir. Altın etiketin ikinci bağımsız kaynağı, körlük
> şartı nedeniyle ekip içinden ikame edilemez; bu rol için danışmanın bölümünden, belge
> üretecini ve üretim sözlüğünü görmemiş bir yedek kişi ilk ayda belirlenir ve kodlama
> kılavuzuyla eğitilir. İstatistiksel analiz betikleri sürüm damgalı ve tek komutla koşar
> biçimde tutulur, böylece analiz tek kişiye bağlı kalmaz."

### E8. Gizli maliyetler  ÖNEMLİ
- **Sarf açıklamasını değiştir:** "Veri saklama ve yedekleme ortamı (yedekleme diski);
  karakter hata oranı ölçümü için 50 belgenin baskı ve tarama gideri; kör değerlendirme
  materyalinin çoğaltılması, kodlama kılavuzu baskısı ve kırtasiye."
- **Olanaklar/Donanım'a ekle:** "ve bir çok işlevli yazıcı-tarayıcı"
- **İP6 faaliyetine ekle:** "Dış geçerlilik kümesinin altın etiketleri, ana kümedeki ile aynı
  iki bağımsız kaynak yordamıyla kurulur ve uyum katsayısı ayrıca raporlanır."

### E9. 12. ayda iki el yazması  İYİLEŞTİRME
Uluslararası konferans bildirisi **12 → 11. ay**; dergi makalesi satırına "sorumlu yazar
danışman öğretim üyesidir" ekle.

---

## D. KULLANICIYA BİLDİRİLECEK (metne girmez)

- Bütçe üst limiti 12.000 TL **2025 çağrısına** ait; 2026-1 dönemi rakamı programın
  sayfasında ayrıca ilan ediliyor → başvurudan önce teyit.
- `_meta` bloğu bayat; OKUBENI yeniden üretilirken kullanılmamalı.
  → **8 Ağu güncellemesi:** `_meta` tazelendi ve artık yalnız izlenebilirlik kaydı;
  uygulanan düzeltmelerin tek doğru kaynağı `duzeltmeler_uygula.py`.

---

# F. 8 AĞUSTOS ÇAPRAZ TUTARLILIK TURU (üç bağımsız denetim + bir şüpheci)

Yukarıdaki A-E bulgularının **31'i uygulanmış, 3'ü kısmen, 1'i uygulanmamış** olarak
ölçüldü. Ayrıca üç yeni denetim koşuldu ve şunları buldu:

## F1. Belge içi çelişkiler — 8 kesin + 12 olası, 19'u uygulandı

Kaynaktan doğrulanıp düzeltilenler (kodlar `duzeltmeler_uygula.py`'de):

| Kod | Kusur |
|---|---|
| T-ozet-1 · T-19 | Özet ve 5. bölüm "kullanılan evrakın tamamı sentetiktir" diyordu; 2.2 üç katman tanımlıyor ve (3) **gerçek** yayımlanmış yazışma. Etik muafiyet gerekçesi bu beyana dayandığı için 5. bölümdeki daha ağırdı. |
| T-ozet-2 | Özet "örneklem güç simülasyonuyla belirlenmiştir" diyordu; metnin kendisi H2 için n≈860 gerektiğini ve ulaşılamadığını söylüyor. |
| T-1 | Bütçe: 6.800 × 0,63 = 4.284 TL, kalem 4.300 TL. "İçinde 1.440 ek koşumluk pay ayrılmıştır" iddiası karşılıksızdı (907 TL gerekiyor, 16 TL yer var). |
| T-2 | Maliyet pilotu bir yerde İP1'de, beş yerde İP2'nin ilk haftasında. |
| T-3 | H4'ün birincil karar kuralı tabloda Krippendorff alfa, 2.5'te normalize uyum oranı. |
| T-4 | H5 yanlış-veto testi tabloda TOST, hemen altındaki metinde tek yönlü aşmazlık. |
| T-5a/b | 3. ayda mühürlenip açılmayacak denen 120 belgelik replikasyon kümesi, 4. ayda açık arşivde yayımlanacak ilan edilmişti. |
| T-6 · S-5 | "Korunan çekirdek … H1-H5" diyordu ama azaltma sırası H5'in eşik süpürmesini daraltıyor. |
| T-8 | Risk tedbiri, seri kapı yapısının vermediği bir bağımsızlık vaat ediyordu. |
| T-10 | Sayım değişkenli H6'nın duyarlılık analizinde ikili-sonuç testi Cochran Q niteliksiz duruyordu. |
| T-12 | 10. bağımlı değişken (H6'nın birincil ölçüsü) birincil/ikincil sınıflamasının dışındaydı. |
| T-13 | H4'ün gücü, analiz planında kullanılmayan bir istatistik ve eşikle hesaplanmıştı. |
| T-14 | Takvim "H4'ün beş iddia sınıfında sınanması" diyordu; bu beş test demek, aile 11'de kilitli. |
| T-15 | Risk tedbiri tanımsız "Katman B"ye atıf yapıyor ve keşifsel analize birincil bulguyu çürütme yetkisi veriyordu. |
| T-16 | "Değerlendiriciler hakkında kişisel veri saklanmaz" ile "asgari üç yıllık deneyim yazılı taahhütle belgelenir" çelişiyordu. |
| T-18 | Olanaklar "iki kalem dış hizmet" diyor, bütçede üç "Hizmet alımı" kalemi var. |

## F2. KAPI ZİNCİRİ — bu turun en ağır bulgusu (K-1, K-2)

**Kusur:** gücü önceden 0,314 ilan edilmiş ve "sonuçsuz raporlanır" denmiş **H2, seri
kapı zincirinin 2. halkasındaydı.** Kapı ancak önceki kapının *tüm* birincil testleri
karar kuralını karşılarsa açıldığı için H4, H5, H6 ve H8 onaylayıcı olarak hiç
sınanamayabilirdi — çekirdek programın tamamı tek zayıf testin arkasında kilitliydi.

**Bağımsız şüpheci incelemesi (çürütme denemesi):** karar **AYAKTA**. Ölçülenler:
- Seri gatekeeping'de FWER kanıtı **sıralamadan bağımsız**; 0,05 aynen korunur.
- Kapı 3'ün açılma olasılığı ≈0,17 → ≈0,54; beklenen onaylayıcı test sayısı **5,69 → 7,26**.
- Bedeli yalnız H8 öder (alfa 0,05 → 0,025) ve ölçüm bunun gücü kırmadığını gösteriyor.
- Alternatifler (H2'yi aileden çıkarma · Kapı 6 · ağırlıklı Holm · alfa geri kazanımı)
  ya daha kötü ya istatistiksel olarak geçersiz. **Bu, kısıtlar altında tek çözüm.**

**Uygulanan:** Kapı 2 = H3, H7 · Kapı 5 = H6, H8, H2. Aile 11 testte, kapı sayısı 5'te
korundu (böylece "on bir test / beş kapı" diyen sekiz ayrı yer bozulmadı). Şüphecinin
şart koştuğu iki gerekçe cümlesi eklendi — bunlar olmadan değişiklik "güçsüz testi
gizleme" diye okunur ve §2.6 ile risk tablosu çelişir.

## F3. B5 ve B6 kapandı — ölçümle

- **B5:** H5 ve H8 için hiç güç sayısı yoktu. `guc_h5_h8.py` ile aynı tohumda (20260808)
  ölçüldü: **H5** taban 0,03-0,10 süpürmesinde gereken n = 60-240, planlanan 300 iddiada
  güç 0,893-1,00. **H8** log-fark sd 0,15-0,45 süpürmesinde gereken n = 20-60; n=240'ta
  ve Kapı 5'in en katı Holm basamağında güç 1,00.
- **B6:** H2'nin etkileşim büyüklüğü artık iki ölçekte ilan ediliyor: 0,19 olasılık puanı
  = **2,27 etkileşim odds oranı** (genişletmeden sonra 0,13 ve 1,67). Oran uydurulmadı,
  tasarımın ilan edilmiş hücre değerlerinden türetildi.

## F4. DENETLEYİCİLERİN KENDİSİ — 17 bulgu

Bağımsız denetim, kapının yeşil yanarken belgeyi görmediği yolları **deneyle** gösterdi.
En ağırı: teslim `.docx`'inden **52 paragraf / 14.201 karakter silindiğinde ana kapı
0 bulgu + exit 0** veriyordu. Kapatılanlar `dogrula2.py` başlığında tek tek yazılı
(gövde kapsamı · sessiz atlanan sayfa kontrolü · stil kalıtımını görmeyen font kontrolü ·
hiç okunmayan punto · tautolojik yasak-iş-adımı · masum kelimede patlayan marka taraması ·
ş/ğ'yi kaçıran mojibake deseni · hiçbir havuzda olmayan üstbilgi).

Ayrıca **`doldur.py` hiç çalışmıyordu**: resmî form şablonunu bir üst klasörde arıyordu,
oysa şablon `uretim/` içinde. Yani teslim belgesi kaynaktan yeniden üretilemez
durumdaydı. Yol düzeltildi.

## F5b. KULLANICI GERİ BİLDİRİMİ TURU (8 Ağustos, ikinci tur) — hepsi uygulandı

| # | Kusur | Uygulanan |
|---|---|---|
| 1 | Özet, yöntem ve etik beyanı "Araştırma insan katılımcı içermez" diyerek **etik kurulun kararını başvurunun yerine veriyordu**; oysa D2'de üç kişiden araştırma amaçlı yargı alınıyor. | Üç yerde de kapsam ayrıldı: D1/D3 makine deneyleri insan katılımcı içermez, D2'nin etik statüsünü **yetkili etik kurul belirler**; kurul kararı alınmadan veri toplanmaz. 5. bölümün (4) maddesindeki aynı kesin hüküm de kaldırıldı. (E-1a…d) |
| 2 | H5 için iki farklı yöntem: tablo "tek yönlü aşmazlık", Hedef 5 "eşdeğerlik, iki tek yönlü test". | Hedef 5 aşmazlığa çevrildi; takvimde "eşdeğerlik sınaması/kararı" → "aşmazlık". **`bolum_1_1`'deki TOST'a dokunulmadı** — o H8'e (gecikme) ait ve orada eşdeğerlik doğru yöntemdir. (E-2a…d) |
| 3 | "Eğilim sıfırdan uzak görünürse" bir karar kuralı değil; araştırmacıya göre değişir. | En sade seçenek uygulandı: **koşullu genişletme tümüyle kaldırıldı, n = 240 sabit.** Yankıları da temizlendi (Hedef 2, risk tablosu, bütçe, odds oranı parantezi). Belgede artık "480" geçmiyor. (E-3a…e) |
| 4 | H1'in İP1 sonucuna göre üstünlükten eşdeğerliğe çevrilmesi "ön sonuca bakıp hipotez değiştirme" itirazına açıktı. | **H1 baştan sona üstünlük**; eşdeğerlik H1'den bağımsız, ikincil ve keşifsel analiz olarak raporlanır. Kapı 1'in anlamı ve güç hesabı sabit kaldı. (E-4) |
| 5 | 2.2 "hipotez sınamalarının tamamı yalnız bu iki kümede" derken Hedef 6 dış kümede H1/H5'i onaylayıcı sınıyordu; ayrıca H5'in birimi iddia olduğu hâlde dış kümeden kaç iddia geleceği yazmıyordu. | Kapsam ayrıldı ve **sayı verildi**: 300 iddialık kör kümenin 60'ı dış geçerlilik belgelerinden, 240'ı ana kümeden seçilir (takvimdeki örnekleme kuralı da hizalandı). Bütçe 300 iddiaya sabit olduğu için **ek maliyet doğmaz**. H5'in dış alt kümedeki güç sınırı açıkça yazıldı. (E-5, E-5b, E-5c) |
| k1 | "H1-H4 bu iki gövdeye dayanır" — H7 de D1 gövdesinde. | "H1-H4 ve H7". (E-6) |
| k2 | H2'nin İP'si tabloda İP2, metinde "İP4'e düşer". | Sorumluluk ile karar anı ayrıldı: veri İP2'de üretilir, karar Kapı 5'te verilir, **kapı sırası iş paketi sorumluluğunu değiştirmez**. (E-7) |
| k3 | 1.320 serbest koşum ile 1.440 ihtiyaç arasındaki 120 çağrılık fark denetlenebilir değildi. | Madde 3 ile genişletme kalktığı için **fark ortadan kalktı**; bütçe artık aritmetiği birebir gösteriyor (6.800 × 0,63 = 4.284 TL). (E-3d) |
| b1 | Tablolar 7,5 · kaynakça 8 · şekil notları 7 punto — form Arial 9 istiyor. | **Ölçüldü:** resmî formun kendi tabloları da 9 punto. `bicim.py`'ye tek taban kondu (`TABAN_PUNTO = 9`); metnin tamamı 9 punto, sapma 0. Maliyeti 1 sayfa. Tek istisna formun kendi 8 puntoluk üç alt etiketi. |
| b2 | 9. sayfanın büyük kısmı boş; "3.2 Risk Yönetimi" başlığı sayfa dibinde yalnız. | 9. sayfa 122 → 2.751 karakter. Yetim başlık nedeni bulundu: `keepNext` başlığı **boş ayıraç paragrafına** bağlıyordu, ikisi birlikte sayfa dibinde kalıyordu. `bos_paragrafla_zinciri_koru` zinciri boşluklar boyunca ileri taşıyor; artık **hiçbir sayfa çıplak başlıkla bitmiyor** (sayfa_dokum.ps1 BAŞ/SON dökümüyle doğrulandı). |

**Ölçülen son durum:** gövde **19** sayfa (TÜBİTAK sınırı 20) · toplam **21** (kullanıcı
sınırı 21) · özet 431/450 · Arial 0 sapma · punto 0 sapma · kapı 0/0/0 · dış geri
bildirim 10/10 · düzeltme betiği idempotent.

## F5c. AZAMİ TUR (8-10. dalgalar) — üç taze denetim

Üç bağımsız göz YENİ metne bakıp toplam **9 kesin + 6 olası + 15 puan kırımı** buldu.
Uygulanamayan bir tanesi dışında hepsi kapatıldı.

**Eklenenler**
- **Adam-ay kanıtı** (fizibilite hakemi + iki panelist ortak talebi): kapasite 3 × haftada
  14 saat × 12 ay = 12,6 adam-ay; takvimin katkı yüzdeleri bunun dağılımı (2,1 · 3,2 ·
  2,9 · 2,6 · 1,8). Asıl savunma: hacmin çoğu öğrenci emeği değil — 6.800 koşum
  gözetimsiz makine zamanı, kör değerlendirme ve bağımsız koşum satın alınıyor.
- **Kapı zinciri alfa bölüştürmesiyle yeniden kuruldu**: mekanizma kolu (0,04, dört seri
  kapı) + ölçüm geçerliliği kolu (0,01, tek test H4). FWER 0,05 korunur. Gerekçe
  mantıksal: ölçütün geçerliliği mimarinin üstünlüğünden **önce** gelen bir ön koşuldur.
- **İddia seçim kuralı**: sabit tohumlu rastgele örnekleme, betik ön-kayıt ekinde;
  sistemin hiç iddia çıkarmadığı belgeler ayrı sayılıp kapsam sınırı olarak raporlanır.
- **OCR çapası düzeltildi** (hakem, KESİN): 2.2 "kurum sitelerinden indirilmiş taranmış
  görüntü" diyordu — **indirilen taramanın yer-doğrusu metni yoktur, CER hesaplanamaz.**
  Bütçe zaten baskı-tarama giderini, olanaklar tarayıcıyı içeriyordu; ölçülebilir yola
  çevrildi.
- **Gönüllü değerlendirici finansmanı dürüstleştirildi**: önceki hâli "yerine ücretli
  alınır, 300 iddia korunur" diyordu ama **aritmetik tutmuyordu** (4.200 TL tam 300
  yargı; ek 300 yargı 4.200 TL daha, sarf 1.000 TL). Gerçek sonuç yazıldı: desen üçten
  ikiye iner, uyum Cohen kappa ile raporlanır, H4 keşifsel etiketlenir.
- b2-geç eşlemesi tanımlandı ve (b2) kabul testine bağlandı · hedef birim kümesinin
  kaynağı çapalandı · H4'ün kapsam sınırı (çıkarılmamış iddia ölçülemez) beyan edildi ·
  etik kurul gecikme senaryosu takvime girdi.

**Kendi yankılarım (üç denetimin de yakaladığı örüntü)** — her dalga bir öncekinin izini
bıraktı: (b2) kabul testi İP3'e konmuştu ama İP2 b2'yi daha önce tüketiyor · dış
geçerlilik "40'a iner" kuralı 2.2/İP3/İP5'e yansımamıştı · b2-geç'e "onaylayıcı" denmişti
ama 11 testlik ailenin dışında · 0,598 iki farklı ölçüye atfedilmişti · 0,877/0,964 için
"ayrıntı 2.7'de" deniyordu ama o sayılar 2.7'de yoktu · "düşen/kapanan" terim ikiliği ·
"açık bulgu" tanımı D3'e havale ama D3'te yok · adam-ay toplamı 12,7 çıkıyordu (2,7
yerine 2,6 olmalıydı).

**Ek artık metni doğruluyor.** Alfa bölüştürmesi güç sayılarını değiştirdi ve bu
**ölçülerek** yansıtıldı: `guc_simulasyonu.py` ile `guc_h5_h8.py` yeni alfalarla aynı
tohumda yeniden koşuldu. H1 0,857 → **0,833** · H4 0,998 → **0,987** · H7 0,870 →
**0,779** (0,80'in altına indi, sınır açıkça ilan edildi) · H5 gereken n 60 → **100**.
Metindeki her güç değeri artık `guc_sonuc.json` / `guc_h5_h8.json` ile birebir aynı.

**Kapıya aritmetik öz-denetim gömüldü**: adam-ay dağılımı ilan edilen toplamı tutuyor mu ·
kapı test sayıları ilan edilen aile büyüklüğünü veriyor mu · bütçe metni tabloyla uyuşuyor
mu. Bu sınıf hata önceden kapıya görünmüyordu.

**Taban dosya depoya alındı** (`icerik.taban.json`): tutarlılık denetimi, tabanın yalnız
geçici klasörde durduğunu ve `git checkout` hâlinde nihai metnin kaybolacağını gösterdi.
Betik artık tabanın üzerine yazmıyor (`--cikti`).

**KAPATILAMAYAN — kullanıcı kararı gerektirir:** panelist "kısıtlı kod çözme
(constrained/grammar-guided decoding) alanyazınına 2-3 kaynak eklensin, B2 boşluğu ona
göre konumlansın" dedi. **Kaynak uydurulmaz** (CLAUDE.md m.1); künyeleri doğrulanmadan
metne girmez.

## F5. AÇIK KALAN

- **E1 (fizibilite, KISMEN):** hakem "bayat taban metriklerin yeniden koşumu İP2'ye
  taşınsın" demişti; ekip bunun yerine maliyet pilotunu İP2'ye taşımış. Taban yeniden
  koşumu **ön-kayıt kilidinden önce** olmak zorunda (B11'in bağlayıcı H1 kuralı ona
  dayanıyor), bu yüzden İP1'de kalması savunulabilir — ama metinde hiçbir yerde
  adam-ay/FTE hesabı yok, dolayısıyla iş yükünün dengelendiği **doğrulanamıyor**.
  Karar kullanıcıya bırakıldı.
- **A6 (iyileştirme):** Şekil 1 altyazısına "(seviyeler İP1'de yeniden ölçülecek
  ortalamaya çapalanır)" eklenmedi — sayfa bütçesi sıfır ve altyazı `akis.py`'de.
- **Üstbilgi farkı:** `2209-A … DESTEKLEME` / `2209/A … DESTEĞİ`. TÜBİTAK'ın kendi
  resmî formundan geliyor, **bilinçli olarak düzeltilmedi**.
