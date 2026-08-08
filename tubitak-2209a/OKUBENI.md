# TÜBİTAK 2209-A — Teslim Paketi

Bu klasördeki üç belge, TÜBİTAK'ın **resmî 2209-A Araştırma Önerisi Formu** (09.10.2025 sürümü) ve **2209-A Çağrı Duyurusu** temel alınarak hazırlanmıştır.

## Dosyalar

| Dosya | Ne işe yarar | Başvuruya yüklenir mi |
|---|---|---|
| `2209A_BASVURU_TESLIM.docx` | Resmî formun doldurulmuş hâli. Gövde 19 sayfa + EK-1 kaynakça = toplam 21. | **EVET — yüklenecek dosya budur** |
| `2209A_REHBERLI_SABLON.docx` | Her bölüm için TÜBİTAK açıklaması + panelistin ne aradığı + doldurulmuş örnek + boş alan. | Hayır, çalışma belgesi |
| `2209A_KONTROL_LISTESI.docx` | Ön inceleme eleme listesi, rubrik öz-puanlama, süreç akışı, ÜYZ yükümlülüğü, sonuç raporu iskeleti. | Hayır, denetim listesi |

## Ölçülen değerler (tahmin değil, sayıldı — 8 Ağustos, düzeltmeler sonrası)

Tümü `uretim/dogrula2.py` ile tek komutta yeniden üretilir:
`python dogrula2.py ../2209A_BASVURU_TESLIM.docx icerik.json`

| Kontrol | Ölçülen | Sınır |
|---|---|---|
| **Gövde sayfa (EK-1 kaynakça hariç)** | **19** | ≤ 20 (TÜBİTAK kuralı) |
| **Toplam sayfa (kaynakça dâhil)** | **21** | ≤ 21 (kullanıcı sınırı) |
| Özet kelime sayısı | 442 | 25–450 |
| Anahtar kelime | 5 | 3–5 |
| Bölüm gövde kapsamı (metin belgeye gerçekten yazıldı mı) | %100 / %100 / %100 / %100 | ≥ %95 |
| Çalışma takvimi katkı toplamı | 100 | tam 100 |
| İş paketi sayısı / süre | 5 İP / 12 ay | ≤ 12 ay |
| Bütçe toplamı | 11.000 TL | ≤ 12.000 TL |
| Kaynak sayısı / atıf bütünlüğü | 21 / tam | ≥ 15 / boş fark |
| Madde 4.1.8 marka taraması (gövde + üstbilgi) | 0 bulgu | 0 |
| Yazı tipi (etkin, stil kalıtımı çözülerek) | Arial, 0 sapma | Arial |
| Punto | 9 pt, 0 sapma | Arial 9 |
| Dış geri bildirim (10 madde) | 10/10 | 10/10 |

> **Punto (8 Ağustos'ta düzeltildi):** belge önceden tabloları 7,5 · kaynakçayı 8 ·
> şekil notlarını 7 puntoda basıyordu ve OKUBENI bunu "Arial 9 (sapma 0)" diye
> yayımlıyordu — o kontrol yalnız yazı tipi ADINI ölçtüğü için. **Resmî formun kendi
> tabloları 9 punto** (ölçüldü: gövdede 112, tablolarda 32 run), dolayısıyla küçültme
> formdan sapmaydı. Artık `bicim.py` içinde tek bir taban (`TABAN_PUNTO = 9`) uygulanır
> ve **formun gövdesinin tamamı 9 puntodur** (sapma 0). İki bilinçli istisna vardır:
>
> 1. Yaygın Etki tablosundaki üç parantezli alt etiket (`(Ulusal/Uluslararası Makale…)`)
>    8 puntodur — bunlar **formun kendi metnidir** ve resmî şablonda da 8 puntodur;
>    üstbilgi kararıyla aynı gerekçeyle değiştirilmemiştir.
> 2. **EK-1 kaynakça 8 puntodur.** TÜBİTAK'ın kuralı "ekler hariç 20 sayfa" olduğundan
>    9 punto zorunluluğu formun gövdesi içindir. Kaynakçayı da 9 puntoya çıkarmak belgeyi
>    22 sayfaya taşıyordu; seçim, panelin istediği bilimsel içerikten kesmek ile ekin
>    puntosunu korumak arasındaydı ve ikincisi seçildi. Gövde 19 sayfa, toplam 21.
>    Geri almak isterseniz: `tasarim.py` → `kaynakcayi_bicimle` → `taban=False` kaldırın
>    (belge 22 sayfaya çıkar).

> **Üstbilgi notu:** belgenin iki bölüm üstbilgisi program adını farklı yazar
> (`2209-A … DESTEKLEME PROGRAMI` ve `2209/A … DESTEĞİ PROGRAMI`). Bu fark
> **TÜBİTAK'ın kendi resmî form şablonundan** gelir (`uretim/2209A_resmi_form.docx`
> ile bire bir aynı) ve **düzeltilmemiştir**: resmî formun antetini değiştirmek
> "istenen formatta olmayan belge" riski yaratır.

## ALAN DURUMU

| Alan | Durum | Değer |
|---|---|---|
| Başvuru sahibinin adı soyadı | DOLDURULDU | Cem ÖZAL |
| Danışmanın adı soyadı | DOLDURULDU | Dr. Öğr. Üyesi Bilgin AVENOĞLU |
| Araştırmanın yürütüleceği kurum | DOLDURULDU | Çankaya Üniversitesi, Mühendislik Fakültesi |
| Araştırma önerisinin başlığı | DOLDURULDU | Türkçe İdari Yazışmada Karar Katmanı Mimarisinin Belge Anlama Başarımına ve Kaynak Dayanaklılığına Etkisi: Kontrollü Faktöriyel Deney |
| Kapak yıl / dönem | DOLDURULDU | 2026 Yılı /  Dönem |
| Ekip büyüklüğü | DOLDURULDU | 3 öğrenci (yürütücü + 2 ortak) + danışman |
| Araştırma olanakları — donanım | DOLDURULDU | somut özellikler yazıldı |
| **Etik kurul: üniversite / karar tarihi / karar sayısı** | DOLDURULDU | — |

## AÇIK RİSKLER — gönderimden önce karara bağlanmalı

Aşağıdaki 9 madde, metni üreten ve denetleyen ajanların **dürüstçe açık bıraktığı** konulardır. Hiçbiri gizlenmemiştir.

1. **ÇAĞRI HENÜZ AÇILMADI** — 2209-A'nın 2026 çağrısı 8 Ağustos itibarıyla yayımlanmamış. Tarihsel örüntü Ekim'i gösteriyor. Çağrı açılınca: (a) destek üst limitini web sayfasından tekrar teyit edin, (b) kapağa çağrının resmî adını yazın, (c) çağrı duyurusunun yeni sürümünü bu paketle karşılaştırın.
2. KAPAK YIL/ÇAĞRI ADI — 'dönem' ibaresi kaldırıldı (2209-A'da artık yok). Yıl şu an 2026 yazıyor; çağrı açıldığında resmî adıyla güncelleyin.
3. +1 PUAN FIRSATI (m.5.2.7) — proje ekibinde özel gereksinimli bir birey varsa, başvuru sırasında 'Engelli Sağlık Raporu Referans Numarası' beyan edilirse değerlendirme toplam puanına 1 PUAN eklenir. Bu, başvuru sisteminde beyan edilir, metinde değil.
4. **ÖN ÇALIŞMA SAYILARI KISMEN TAZELENDİ** — mevzuat erişimi 8 Ağustos 2026'da güncel kod tabanında yeniden ölçüldü (Recall@1 0,750, Recall@3 0,938, MRR 0,812; n=16) ve 2.7'ye işlendi. LLM'li metrikler (sınıflandırma, yönlendirme, özet, taslak) hâlâ bayat çünkü .env dosyasında OPENAI_API_KEY satırı YOK. Anahtar eklenirse bu zayıflık TAMAMEN kapanır.
5. **H2 GÜCÜ SINIRLI** (ölçüldü: 0,314) — gizlenmedi. Saptanabilir en küçük etkileşim 0,19 olasılık puanı (= 2,27 etkileşim odds oranı) olarak ilan edildi. **8 Ağu: koşullu genişletme (n=480) KALDIRILDI** — tetikleyicisi ("eğilim sıfırdan uzak görünürse") ölçülebilir bir karar kuralı değildi; örneklem n=240'ta sabit ve H2 güç sınırlı olarak raporlanıyor. Ayrıca H2, seri kapı zincirinin **son** kapısına alındı; sonuçsuz kalması diğer hipotezlerin sınanmasını engellemiyor. Ana etkiler (H1 0,857, H3 0,99-1,00, H5 0,838-0,996, H8 1,00) sağlam.
6. **ÜYZ BEYANI** — bu metin üretken yapay zekâ araçlarıyla hazırlandı. ÜYZ Rehberi v04 (Ocak 2026) 'önemli ölçüde' kullanımda şeffaf beyan istiyor; nihai sorumluluk akademik danışmanda. Danışmana bildirin.
7. **KATMANLI RAPORLAMA BLOĞU** — sayfa sınırı için 2.5'ten çıkarıldı; Katman A/B ayrımının önceden bağlayıcı kuralı kaybedildi. Yer açılırsa geri konması önerilir.
8. **GÖNÜLLÜ DEĞERLENDİRİCİ** — kör değerlendirmenin ikisi danışmanın bölümünden gönüllü akademik katkı. Bu iki kişi ilk ayda belirlenmeli; bulunamazsa bütçeden aktarımla ücretlendirme yoluna gidilecek (kural metinde yazılı).
9. **İŞ YÜKÜ** — fizibilite hakemi %152 doluluk hesaplamıştı; iş devirleri ve kilometre taşlarıyla düşürüldü ama takvim sıkı. Danışmanla haftalık takip metinde taahhüt edilen yordamın kendisidir, süs değil.

## DOĞRULANMAMIŞ KAYNAK ADAYLARI

Bunlar **metinde KULLANILMAMIŞTIR** ve teslim dosyasının kaynakçasında yer almaz. Var olduklarını teyit ederseniz metne ekleyip bilimsel nitelik puanını yükseltebilirsiniz. **Teyit etmeden eklemeyin** — var olmayan atıf, çağrı metni m.5.2.3/m.8.2 uyarınca etik ihlali işlemine yol açar.

- [DOĞRULA] Kamath, A., Jia, R., & Liang, P. (2020). Selective question answering under domain shift. ACL 2020, 5684-5696. https://aclanthology.org/2020.acl-main.503/ — B4 boşluğunun (seçici tahmin / çekimserlik tek-model kalibrasyonu) atıflandırılması için aday. Künyesi teyit edilmediği için METİNDE KULLANILMAMIŞTIR.
- [DOĞRULA] Huang, L. ve ark. (2023). A survey on hallucination in large language models. arXiv:2311.05232 — uydurma taksonomisi için aday. METİNDE KULLANILMAMIŞTIR.
- [DOĞRULA] Robertson, S., & Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. FnTIR, 3(4), 333-389. https://doi.org/10.1561/1500000019 — seyrek erişimde uzunluk normalizasyonunun kuramsal dayanağı için aday. METİNDE KULLANILMAMIŞTIR.
- [DOĞRULA] Lewis, P. ve ark. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. NeurIPS 33, 9459-9474. https://arxiv.org/abs/2005.11401 — erişim katmanının kurucu referansı için aday. METİNDE KULLANILMAMIŞTIR.
- [DOĞRULA] B4 boşluğu için sinir ağı güven kalibrasyonu / aşırı-güven alanyazınından en az iki hakemli kaynak eklenmelidir (ör. modern sınıflayıcıların kalibrasyonu üzerine çalışmalar). Bu kaynaklar teyit edilene kadar B4'ün ifadesi 'bir çalışmaya rastlanmamıştır' biçiminde zayıflatılmış hâlde bırakılmıştır.

## ÜRETKEN YAPAY ZEKÂ (ÜYZ) BEYANI — çağrı m.8.4 / m.8.5

Bu metin üretken yapay zekâ araçları kullanılarak hazırlanmıştır. Çağrı duyurusu m.8.4 proje yürütücüsünü, m.8.5 ise **akademik danışmanı** ÜYZ ile üretilen tüm içeriğin doğruluğundan, özgünlüğünden ve bilimsel güvenilirliğinden sorumlu tutar.

Bu nedenle gönderimden önce **zorunlu** olarak:

1. TÜBİTAK'ın güncel *Destek Süreçlerinde Üretken Yapay Zekânın Sorumlu ve Güvenilir Kullanımı Rehberi*'ni okuyun ve o dönemki beyan yükümlülüğünü teyit edin.
2. Metnin tamamını satır satır okuyup kendi ifadelerinizle sahiplenin.
3. **21 kaynağın her birini tek tek açıp** künyesinin doğruluğunu teyit edin.
4. Ön çalışmadan gelen tüm sayıların kendi ölçümlerinizle uyuştuğunu doğrulayın.
5. Danışmanınıza ÜYZ kullanıldığını açıkça bildirin — nihai sorumluluk kendisindedir.

## Uygulanan düzeltmeler (adversarial panel çıktısı)

Metin, üç bağımsız hakem lensinden geçirildi (rubrik panelisti · ön inceleme denetçisi · "bu araştırma değil" şüphecisi) ve 28 düzeltme uygulandı:

1. İnsan katılımcılı deney (D4 / İP5 / 32 katılımcı) tamamen çıkarıldı; H7, H8, H11 hipotezleri, AS6 araştırma sorusu ve gerekçe-düzeyi değişkeni kaldırıldı.
2. Etik kurul bağımlılığı ortadan kaldırıldı: araştırma insan katılımcı içermiyor, ölçüm birimi belge ve metindeki iddia; onay gerekmiyor.
3. İP3 yeniden konumlandırıldı: üç bağımsız DEĞERLENDİRİCİ metindeki iddia üzerinde kör uzman yargısı verir; haklarında kişisel veri toplanmaz. Dairesellik kırma iddiası korundu.
4. Bağımlı değişken 13→9→10, bağımsız 6→5, onaylayıcı test ailesi 16→11, kapı 7→5 olarak yeniden hesaplandı ve bölümler arası senkronlandı.
5. Özet baştan yazıldı (407 kelime): 'dört deney', 'on bir hipotez', 'katılımcı sayısı 32' gibi bayat ifadeler temizlendi.
6. Araştırma Olanakları'ndaki iki katılımcı-deneyi kalıntısı silindi — iki hakem bunu 'tek başına ret gerekçesi olabilir' diye işaretlemişti (etik beyanıyla açık çelişki).
7. Numaralandırma dikişleri kapatıldı: H9→H7, H10→H8, İP6→İP5 (sayım korunumu doğrulandı).
8. Kapı zinciri SERİ bağlandı: eski yapıda gerçek ailesel hata ≈0,19 idi; artık on bir testin bütününde 0,05'te tutuluyor. GEE/DeLong/karma Poisson aile dışına çıkarıldı.
9. H3 testi düzeltildi: Jonckheere-Terpstra (bağımsız gruplar) → eşleştirilmiş Page eğilim testi.
10. H6 testi düzeltildi: Cochran Q (ikili) → Friedman + Holm-Wilcoxon; bağımlı değişken sayım olduğu için. Ayrıca değişken kilitli listeye eklendi (10 oldu).
11. H10 yön çelişkisi giderildi: 1.1 üstünlük diyordu, 2.6 TOST kullanıyordu; ikisi eşdeğerlik çerçevesinde birleştirildi.
12. H5 yanlış-veto ve H10 için tek yönlü aşmazlık (non-inferiority) kurgusu ve sınır gerekçeleri eklendi.
13. H2 etkileşim büyüklüğü ilanı, H9 alt grup gücü ve 80 belgelik blok gücü beyanları eklendi.
14. H1 için bağlayıcı güç kuralı eklendi: taban yeniden ölçümünde fark 0,09'un altında kalırsa kilit öncesi TOST eşdeğerliğine geçilir.
15. (b2) taban kolunun aslına uygunluğu bağımsız kabul testine bağlandı — ekip kendi taban kolunu zayıf kurarsa hibrit bedavaya kazanırdı.
16. Kodlama kılavuzu, doğrulayıcının kural listesinden yapısal olarak ayrıldı (yapı daireselliği); sözlük örtüşmesi sayısal raporlanacak.
17. Kör değerlendirme ekonomisi düzeltildi: 4,67 TL/yargı ile uzman bulunamazdı. Yeni kurgu bir ücretli (14 TL/yargı) + iki gönüllü akademik katkı; desen ve güç değişmedi.
18. B4 boşluğunun kapsam dışı olduğu açıkça yazıldı — ameliyattan sonra hiçbir hipotez kalibrasyon ölçmüyordu, boşluk iddiası karşılıksızdı.
19. PROJE YÖNETİMİ bölümüne izleme/koordinasyon yordamı eklendi (%20'lik blok üç tablodan ibaretti): toplantı düzeni, sürüm damgalı depo, sapma günlüğü, parti-teslim takvimi.
20. Risk tablosuna ekip üyesi ayrılması riski eklendi — körlük şartı gereği altın etiketin ikinci kaynağı ekip içinden ikame edilemiyor, yedek kişi ilk ayda belirlenecek.
21. İş yükü dengelendi (%152 doluluk): maliyet pilotu İP2'ye, dış geçerlilik kümesi İP3'e taşındı; İP1'e üç ara kilometre taşı kondu.
22. İP3→İP4 ters bağımlılığı giderildi: İP4'ün 6-7. ayı yalnız koşum, puanlama 8. ayda.
23. Bütçe gerekçesine koşum hacmi kırılımı (6.800 koşum), birim tavan ve makine süresi eklendi.
24. Gizli maliyetler bütçelendi: 50 belgenin baskı-tarama gideri, olanaklara yazıcı-tarayıcı; dış geçerlilik kümesinin altın etiketlenmesi yordama bağlandı.
25. Yaygın etki gerçekçileştirildi: bildiri kabul ölçütü 'yayımlanma'dan 'gönderim'e çevrildi (hakem kararı ekipte değil); uluslararası bildiri 12→11. aya alındı.
26. Hedef 6 aşırı-iddiası düzeltildi: dış geçerlilik kümesinde yalnız H1 ve H5 sınanıyor.
27. Şekil 2 altyazısındaki olmayan '3.1' başlığına atıf kaldırıldı; Risk 4'teki 'bir aylık örtüşme' fiilî iki aya düzeltildi.
28. Anahtar kelime 'insan gözetimli karar destek' → 'denetlenebilir karar destek' (ölçülmeyen bir şeyi başlığa taşıyordu).

## Üretim hattı — hangi betik CANLI, hangisi TARİHSEL

Belgeyi yeniden üretmek ve denetlemek için **yalnız şu dört adım** gerekir
(`uretim/` klasöründe, sırayla):

```
python doldur.py icerik.json ../2209A_BASVURU_TESLIM.docx     # resmî formu doldur
python dogrula2.py ../2209A_BASVURU_TESLIM.docx icerik.json   # ANA KAPI (sayfayı da ölçer)
python dis_geri_bildirim.py icerik.json ../2209A_BASVURU_TESLIM.docx   # 10 madde
```

`icerik.json` teslime hazır hâldedir; **normal akışta `duzeltmeler_uygula.py`'yi
çalıştırmanız gerekmez.** O betik hakem düzeltmelerinin kod, çapa ve gerekçesiyle
birlikte durduğu kayıttır. Girdisi **`icerik.taban.json`** (depoda, betikle aynı
klasörde), çıktısı `icerik.json`:

```
python duzeltmeler_uygula.py icerik.taban.json --cikti icerik.json --kuru-calistir
python duzeltmeler_uygula.py icerik.taban.json --cikti icerik.json
```

> **`icerik.taban.json` SİLİNMEZ.** Bir denetim, tabanın yalnızca geçici bir klasörde
> durduğunu ve `git checkout -- uretim/icerik.json` çalıştırılırsa nihai metnin geri
> döndürülemez biçimde kaybolacağını gösterdi. Taban artık depoda ve betik onun
> üzerine asla yazmıyor.

**Güç sayıları ekten gelir, tersi değil.** `guc_simulasyonu.py` + `guc_h5_h8.py`
(sabit tohum 20260808) koşulur, çıktıları `guc_sonuc.json` / `guc_h5_h8.json`'a
yazılır ve metindeki her güç değeri bu dosyalarla birebir aynıdır (H1 0,833 ·
H4 0,987 · H7 0,779 · H5 0,812-0,994 · H8 1,00). Alfa bölüştürmesi değişirse
**önce betikler koşulur, sonra metin güncellenir.**

Çıkış kodları: `0` uygulandı · `1` gerçek sorun (çapa kaymış — dosyaya dokunulmaz) ·
`2` dosya zaten dönüştürülmüş. Betik yazmadan önce **kendi çıktısı üzerinde yeniden
koşup hiçbir şeyin değişmediğini doğrular**; bu, "biri metin ekler, diğeri sıkıştırır"
tipi zincirlenmiş düzenlemelerin ikinci koşumda metni bozmasını engeller.

Yardımcılar: `guc_simulasyonu.py` + `guc_h5_h8.py` (Monte Carlo güç, sabit tohum
20260808) · `sayfa_say.ps1` (Word COM sayfa) · `sayfa_dokum.ps1` (sayfa sayfa doluluk —
sınırdayken hangi paragrafın taştığını gösterir) · `bicim.py` / `akis.py` / `tasarim.py`
(doldur.py'nin biçim katmanı, tek başına çalıştırılmaz).

> **TARİHSEL — yeniden ÇALIŞTIRMAYIN:** `son_uc.py`, `v5_birlestir.py`,
> `v6_birlestir.py`, `taze_olcum.py`, `numara_kapat.py`, `eski_kod_temizle.py`,
> `meta_taze.py`, `meta_tazele.py`, `meta_guclendirme.py`, `h2_secenek.py`,
> `h2_mdes480.py`, `guc_yaz.py`, `ekip3.py`, `kimlik_yaz.py`, `bosluk_tara.py`.
> Bunlar tek seferlik dönüşümlerdi ve işlerini yaptılar. Bağımsız bir denetimde
> **hepsinin denetim kısmı en az bir noktada yanılıyor** çıktı: bir kısmı çıkış kodu
> döndürmüyor (başarısızlık başarı sanılır), `taze_olcum.py` idempotent değil (her
> koşumda aynı paragrafı yeniden ekler), `v6_birlestir.py` iki kalıcı yanlış-pozitifle
> hep kırmızı. Yaptıkları içerik değişiklikleri artık `duzeltmeler_uygula.py`'de
> bildirimsel ve çapa-denetimli biçimde durur; denetim işi `dogrula2.py` ile
> `dis_geri_bildirim.py`'ye taşındı. Bir düzeltme eklemek gerekirse yeni betik
> yazmayın — `duzeltmeler_uygula.py`'deki `DUZELTMELER` listesine bir kayıt ekleyin.

## Kaynaklar

- 2209-A program sayfası: https://tubitak.gov.tr/tr/burslar/lisans-onlisans/destek-programlari/2209-universite-ogrencileri-arastirma-projeleri-destekleme-programi
- Resmî araştırma önerisi formu (09.10.2025): https://www.tubitak.gov.tr/sites/default/files/2025-10/2209-A_arastirma_onerisi_formu_09102025.docx
- Çağrı duyurusu: https://tubitak.gov.tr/sites/default/files/2026-06/2209-A_2025_Yili_Cagri_Duyurusu_V2_1.pdf
- Sonuç raporu formatı: https://www.tubitak.gov.tr/sites/default/files/2023-09/2209-a_sonuc_raporu_formati.docx
- Başvuru sistemi: https://tybs.tubitak.gov.tr · İzleme: https://e-bideb.tubitak.gov.tr

> **Uyarı:** Çağrı duyurusu ve başvuru tarihleri her yıl güncellenir. Başvurudan önce program sayfasından o dönemin güncel çağrı metnini ve takvimini teyit edin.