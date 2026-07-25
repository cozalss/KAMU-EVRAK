# Mevzuat-Teşkilat Kaynak Sınıfı — sözleşme ve güven politikası

> Spec + ADR. Uygulama: `backend/agents/nodes/teskilat_mevzuat.py`,
> `backend/scripts/seed_teskilat.py`, `backend/agents/resmi_kaynak.py`.
> İlgili: [10-kurum-sicili.md](10-kurum-sicili.md) (INV-1..INV-5), `data/teskilat/DOGRULAMA.md`.

## 1. Problem

Teşkilat korpusu kuruma-özel kaynak taşıyan ~190 kurumu kapsıyor; sicilde 4018 kurum var.
Kapsam dışı kuruma bugün yalnız **jenerik şablon adayı** üretilebiliyor ve `uclu_grounding`
tanım gereği reddediyor → otomatik havale yok, her evrak memura düşüyor.

Bazı kurum türlerinde bu boşluk **kuruma-özel veri toplayarak değil, mevzuat okuyarak**
kapatılabilir: birim listesini kurumun kendisi değil, **mevzuat tür geneli için** belirler.
Örnek: her ilçede İlçe Yazı İşleri Müdürlüğü bulunur — bu Kaymakamlığın tercihi değil,
Valilik ve Kaymakamlık Birimleri Teşkilat, Görev ve Çalışma Yönetmeliği m.10/1-a hükmüdür.

## 2. ADR — neden bu tasarım

**Karar:** Yeni kaynak sınıfı `mevzuat_teskilat`: tür-kapsamlı, hash-kilitli, doğrulanmış
şablon; sorgu anında somut kuruma genişletilir. Şablonun kapsamı **kanonik slug kalıbı +
ayrı hash-kilitli kapsam listesi** ile belirlenir.

**Karar 2 (adversarial denetim sonrası, 2026-07-25):** Bu sınıf **otomatik havale yetkisi
VERMEZ.** Ürettiği şey, gerçek birim adı + mevzuat künyesi taşıyan yüksek kaliteli bir
ÖNERİdir; onayı memur verir. Gerekçe §7'de.

**Reddedilen A — 2512 kurum dizinini materyalize et.** "Sözleşme değişmiyor" görünür ama
`kurum_ozel` etiketinin anlamını ("bu kurumun KENDİ doğrulanmış kaynağı") kod değiştirmeden
sessizce "tür-genel mevzuattan çoğaltılmış"a genişletir — güvenin veri katmanında aklanması,
denetim izinde görünmez. Ayrıca ~25k chunk / ~27 MB indeks ve her şablon düzeltmesinde 2512
dosya + 2512 manifest kaydı yeniden üretimi.

**Reddedilen B1 — türü `sicil.json`'dan oku.** Sicil ikincil/türetilmiş veridir
([10](10-kurum-sicili.md) §5). Tür alanı havale zincirinde nedensel halka olursa tek bir tür
hatası yanlış tür şablonunu otomatik havaleye sokar → INV-1/INV-2 ihlali.

**Reddedilen B2-naif — türü `kurum_kimlik.tur`'dan oku.** `kurum_kimlik`'te `il_mudurlugu`
türü yok; `mudurluk` deseni belediye iç müdürlüklerini de yakalar
("Ankara Büyükşehir Belediyesi Fen İşleri Müdürlüğü" → `mudurluk`). Tür tek başına yetmez.

**Seçilen B2-kalıp:** otorite `kurum_kimlik.tur` değil, **şablonun kendi hash-kilitli kapsam
deklarasyonuna karşı slug-kalıp eşleşmesi**. Her belirsizlik "genişleme yok → jenerik aday +
memur onayı" güvenli tarafına düşer.

## 3. Değişmezler

Mevcut INV-1..INV-5 ([10](10-kurum-sicili.md) §2) **aynen yürürlüktedir** — sicil bu zincire
hiç girmez. Bu sınıf iki yeni değişmez ekler:

| INV | Değişmez kural | Neden |
|---|---|---|
| **INV-6** | Mevzuat şablonu yalnız **kendi hash-kilitli kapsam listesindeki** kuruma genişler. Kapsam listesi evrak, istemci, LLM veya sicil kaynaklı hiçbir veriyle büyütülemez; tek büyütme yolu manifest'e insan-doğrulamalı yeni kayıttır. | "NARNİA KAYMAKAMLIĞI" kalıba uysa da genişleme üretmesin. |
| **INV-7** | `_genel-*` havuzundaki hiçbir kayıt hiçbir koşulda `mevzuat_teskilat` tipi kazanamaz. Bir `_genel-*` dosyası mevzuat-teşkilat kaynak türü ilan ederse **seed hata verir** (sessiz düşme değil). | Jenerik şablonun otomatik havaleye terfi ettirilmesi en olası saldırı yüzeyi. |

**INV-8 (yeniden-hesap):** Kalıp, ad kalıbı ve kapsam listesi **indeksten değil**, manifest +
SHA-256 doğrulamasından geçmiş DOSYANIN kendisinden okunur. İndeksin `sablonlar` bölümü yalnız
keşif listesidir, yetki taşımaz. Hash her çağrıda diskten hesaplanır; önbellek
**içerik-adreslidir** (anahtar = SHA-256). `mtime`/`size` ile anahtarlama YASAKTIR —
`os.utime` + dolgu ile taklit edilebilir.

**INV-9 (dosya-bağı):** Genişletme, şablon DİZİNİNE değil, kapsam deklarasyonunu taşıyan
DOSYAYA bağlanır. Aday chunk'ları `kaynak_dosya == Genisleme.kaynak_dosya` **ve**
`kaynak_guven == resmi_dogrulanmis` süzgecinden geçer. Aksi hâlde şablon dizinine bırakılan
manifest-dışı bir `.txt`, doğrulanmış şablonun yetkisini ödünç alırdı.

*(INV-8 ve INV-9'un ihlali ilk uygulamada gerçekti; bkz. §8.)*

## 4. Kapsam ölçütü — bir tür ne zaman mevzuat şablonuna uygun?

Üçü birden gerekir; biri eksikse tür **kapsam dışıdır**:

1. **Tür-geneli zorunluluk.** Mevzuat birimi "bulunur/kurulur" diye emreder; "kurulabilir",
   "Bakanlıkça uygun görülen", "iş hacmine göre" gibi ihtiyari kayıt taşımaz.
2. **Sabit birim adı.** Birim adı mevzuat metninde geçer; "hangi adla kurulacağı ... Başkanlıkça
   belirlenir" türü devir hükmü yoktur.
3. **Deterministik slug kalıbı.** Kurumun kanonik slug'ı `{alan}-{sabit-kuyruk}` kalıbına birebir
   oturur ve `{alan}` kapalı bir resmî listenin üyesidir.

### Uygulanan kapsam (2026-07-25)

| Tür | Kurum | Durum | Dayanak |
|---|---|---|---|
| valilik | 81 | ✅ kapsamda | Yönetmelik m.9/1 *"İllerde aşağıdaki birimler **bulunur**"* |
| kaymakamlik | **922** | ✅ kapsamda, **yalnız m.10/1-a** | İlçe Yazı İşleri Müdürlüğü koşulsuz; diğer şeflikler "nüfusu ellibin ve üzeri" / "Bakanlıkça uygun görülen" → ölçüt 1 düşer. 973 ilçenin 51'i büyükşehir OLMAYAN illerin merkez ilçesidir; merkez ilçede kaymakamlık kurulmaz, görevi vali yürütür (5442) → kapsam listesinden ÇIKARILDI |
| defterdarlik | 81 | ❌ kapsam dışı | Defterdarlıklar 1/9/2024'te kapatılıp GİB'e bağlandı (161 s. CBK, RG 3/7/2024-32591). Alt birim adları sabit değil: 4 s. CBK m.153/3 "yönetmelikle", yönetmelik ise *"hangi adla kurulacakları Gelir İdaresi Başkanlığınca belirlenir"* → ölçüt 2 düşer |
| il_mudurlugu | 1377 | ❌ **17/17 kapsam dışı** | Ön-eleme yapıldı (2026-07-25), bkz. §9 |

**Kapsam dışı bırakılan bilinen boşluk.** Yönetmelik m.2/2, İl Planlama ve Koordinasyon, İl
Dernekler, İl Nüfus ve Vatandaşlık, İlçe Nüfus Müdürlükleri, büyükşehirlerde YİKOB ve 112 Acil
Çağrı Merkezi Müdürlüklerini "bu Yönetmelik kapsamında tanımlanan birimlerden" sayar ama
görevlerini *"özel mevzuatında gösterilir"* der. Bunlar sık havale hedefidir; görev metinleri
başka mevzuattadır ve bu şablonlara ALINMAMIŞTIR.

**Kapsam listesindeki bilinen 3 ad varyantı.** Kaynak PDF 2018 tarihlidir; `eyupsultan`
(PDF'te Eyüp), `19-mayis` (PDF'te Ondokuzmayıs) ve `karadeniz-eregli` (PDF'te Ereğli)
slug'ları listede yoktur → bu üç ilçe için genişleme olmaz, jenerik adaya düşer (güvenli
başarısızlık).

**Bilinen ve kabul edilen sınır — norm ≠ saha.** Yönetmelik GEÇİCİ MADDE 1/1: yeni birimlerin
kurulması tamamlanıncaya kadar işleri *"diğer bir şube müdürlüğüne veya şefliğe
gördürülebilir"*. Yani birim normatif olarak vardır, fiilen henüz kurulmamış olabilir.
Bu kabul edilebilir çünkü (a) evrak girişi her hâlükârda yazı işleri müdürlüğüdür,
(b) m.25/1-f müstakil şefliği olmayan ilçelerde işleri ilçe yazı işleri müdürlüğüne verir,
(c) `uclu_grounding` (c) koşulu konu-görev bağı kurulamayan her evrakı zaten memura düşürür.

## 5. Dosya formatı

Şablon dizini `_mevzuat-<tur>/`, mevcut teşkilat başlık formatına iki satır ekler:

```
@KURUM: Valilik İç Birimleri (mevzuat-teşkilat şablonu)
@BELGE: Valilik ve Kaymakamlık Birimleri Teşkilat, Görev ve Çalışma Yönetmeliği
@KAYNAK_KIMLIK: https://www.mevzuat.gov.tr/mevzuatmetin/yonetmelik/7.5.15030.htm
@ERISIM: 2026-07-25
@KAYNAK_TURU: resmi_mevzuat_teskilat
@DOGRULAMA: resmi
@KAPSAM_KALIP: {alan}-valiligi          ← kanonik slug kalıbı; {alan} tam olarak bir kez
@KAPSAM_ALAN_DOSYA: _kapsam/iller.txt   ← hash-kilitli kapalı liste (slug/satır)
```

Kapsam dosyası (`_kapsam/*.txt`) yorum satırlarıyla künyesini taşır ve manifest'te ayrı bir
kayıt olarak SHA-256 ile kilitlenir. Şablon **veya** kapsam dosyası bozulursa genişleme durur.

## 6. Çözümleme sırası (`teskilat_birim_ara`)

```
1.  kuruma-özel doğrulanmış kaynak  (kaynak_tipi=kurum_ozel, kaynak_guven=resmi_dogrulanmis)
1.5 kuruma-özel doğrulanmamış kayıt (kaynak_tipi=aday)  +  MEVZUAT ŞABLONU genişletmesi
    (kaynak_tipi=mevzuat_teskilat) — İKİSİ BİRLİKTE döner, kuruma-özel olan önce sıralanır
3.  kurum tipi jenerik şablonu      (kaynak_tipi=jenerik)
```

Kuruma-özel doğrulanmış kaynak **her zaman** mevzuat şablonunu gölgeler.

Kuruma-özel **doğrulanmamış** kayıt ise gölgelenMEZ: adım 1.5 ikisini birlikte döndürür ve
kurumun kendi kaydını öne alır. Erken dönüşle şablonu tek başına döndürmek, kurumun kendi
beyan ettiği birimi memurdan gizliyordu — üstelik şablon `belge_basligi` "Yönetmelik" olduğu
için daha otoriter görünüyordu (§8, F8). Tür-genel bir şablon, o idarede fiilen kurulu
olmayabilir (GEÇİCİ MADDE 1); kurumun kendi beyanı kuruma özgüdür.

`kurum_korpusta_var()` **değişmez** — INV-1'in harfi. Mevzuat kapsamı için ayrı predicate:
`mevzuat_kapsaminda()`.

Mevzuat adayı, kuruma-özel **doğrulanmamış** kaydı (kaynak_tipi `aday`) gölgeler. Gerekçe:
mevzuat adayı hash-kilitli ve mevzuat künyeli, `aday` ise doğrulanmamış; ikisi de memur onayına
gittiği için sıralama zarar üretmez, künye kalitesi belirleyicidir.

## 7. Neden otomatik havale YOK — `uclu_grounding` mevzuat adayını kabul etmez

İlk tasarımda `uclu_grounding`'e ikinci bir kabul yolu (YOL-2) eklenmişti. Bağımsız adversarial
hukuki doğrulama bunu **çürüttü** ve yol kaldırıldı. Üç ayrı gerekçe:

1. **m.26/2 — havale devredilmiş imza yetkisidir.** *"Gelen evrakın niteliğine göre hangi
   görevli veya görevliler tarafından ilgili birim veya mercilere havale edileceği, valilik
   tarafından çıkarılacak İmza Yetkileri Yönergesi ile belirlenir."* Bu Yönerge her ilde
   ayrıdır, bu Yönetmelikte yer almaz, sistemde yüklü değildir. Memur onayını atlamak tanımı
   gereği yetkisiz havale olur.
2. **GEÇİCİ MADDE 1/1 — norm, fiili varlığı garanti etmez.** *"...bu şube müdürlükleri veya
   şefliklerin işleri diğer bir şube müdürlüğüne veya şefliğe gördürülebilir."* Süre sınırı
   yoktur ve düzenlemeyi vali/kaymakam yapar.
3. **m.25/1-f "tüm hizmetler" değildir.** Devredilen hizmetler yalnız m.25/1'de sayılan
   valilik genel idare birimlerinin hizmetleridir; ilçe millî eğitim, sağlık, tarım, nüfus,
   tapu, malmüdürlüğü gibi birimler bu Yönetmeliğin havale hedefi değildir. Teşkilatı
   bulunmayan kurumlarda m.11/1 hedefi *"bir birim ile ilişkilendirerek"* belirler, m.11/3 bu
   düzenlemeyi yine vali/kaymakama bırakır.

**Yürürlükteki sözleşme.** `uclu_grounding` (a) koşulu YALNIZ `kurum_ozel` +
`resmi_dogrulanmis` + `kaynak_sha256` + slug ≡ yetkili kabul eder. `mevzuat_teskilat` adayı bu
kapıdan geçmez; `route_ajan` onu doğrulanmamış öneri olarak sunar, `insan_onayi_gerekli` `True`
kalır. Kazanım kapsamdadır, otomasyonda değil: memur jenerik şablon tahmini yerine **gerçek
birim adını ve mevzuat künyesini** görür.

**Otomatik havale ne zaman tartışılabilir?** Üçü birden sağlanırsa: (1) ilgili idarenin güncel
İmza Yetkileri Yönergesi makine-okunur biçimde yüklü, (2) hedef birimin o idarede fiilen kurulu
olduğu yerel teşkilat verisiyle doğrulanmış, (3) konu m.25/1'deki genel idare birimlerinin
kapsamında. Bu üçü yoksa insan onayı hukuki zorunluluktur.

## 8. Adversarial denetim kaydı (2026-07-25)

İlk uygulama bağımsız bir güvenlik denetiminde **kırıldı**; bulgular ve karşılıkları:

| # | Bulgu | Karşılık |
|---|---|---|
| F1 (CRITICAL) | Doğrulama dizin düzeyinde, adaylar chunk düzeyinde toplanıyordu → şablon dizinine bırakılan manifest-dışı bir `.txt` uydurma birimi 1054 kurumda otomatik hedefe sokuyordu | INV-9 (dosya-bağı süzgeci) |
| F2 (HIGH) | Kalıp/ad kalıbı/kapsam listesi **indeksten** okunuyordu; `teskilat_index.json` manifest-kilitli değil → indeks düzenleyerek kapsam genişletilebiliyordu | INV-8 (hepsi doğrulanmış dosyadan okunur) |
| F3 (MEDIUM) | `lru_cache` anahtarı `(mtime, size)` → ısıtılmış önbellekte kurcalama fark edilmiyordu | Önbellek içerik-adresli (anahtar = SHA-256) |
| F4 (MEDIUM) | Hedef kurumu evrak metni / LLM serbest alanı seçiyordu; (a) koşulu totolojikti | §7 — otomatik havale yolu tamamen kaldırıldı |
| F5 (MEDIUM) | `_kapsam/*.txt` künyesizdi, veri kalite kapısı KIRMIZI'ydı | Künye eklendi, kapı GEÇTİ |
| F6 (LOW) | INV-7 guard'ı ilk 16 satırı okuyordu, geç-satır ilanı kaçıyordu | `_dosya_meta` dosyanın tamamını tarar |

İkinci turda (aynı denetçi, kendi exploit'lerini yeniden koşarak) F1-F6'nın kapandığı teyit
edildi ve üç bulgu daha çıktı; üçü de kapatıldı:

| # | Bulgu | Karşılık |
|---|---|---|
| F7 (HIGH, **önceden de vardı**) | `uclu_grounding` YOL-1, `kaynak_guven`/`kaynak_sha256`'yı doğrudan indeks chunk'ından okuyordu. `teskilat_index.json` manifest-kilitli değil; mevcut bir chunk'ı YERİNDE düzenlemek `chunk_sayisi`'nı ve `korpus_sha256`'yı bozmadığı için veri kalite kapısından geçiyor ve uydurma birim otomatik havaleye giriyordu | YOL-1 artık `dosya_gecerli(aday["kaynak_dosya"])` ile diske karşı doğruluyor; regresyon testi `test_dogrulanmamis_kaynak_dosyasi_reddedilir` |
| F8 (MEDIUM, **bu değişiklikle geldi**) | Adım 1.5'in erken dönüşü, kurumun kendi doğrulanmamış kaydına hiç ulaşmıyordu; konu kurumun kendi birimiyle birebir eşleşse bile o birim ne öneride ne alternatiflerde görünüyordu | §6 — iki adım birleştirildi, kuruma-özel kayıt öne alınır; `_yerel_oncelikli_secim` sırası düzeltildi |
| F9 (LOW) | `_dogrulanmis_icerik` önce hash'leyip sonra ayrıca okuyordu (TOCTOU); arada değiştirilen içerik geçerli hash anahtarıyla önbelleğe yazılabilirdi | Baytlar bir kez okunur, hash bellekteki baytlardan hesaplanır |

## 9. İl müdürlükleri ön-elemesi — 17/17 kapsam dışı (2026-07-25)

`il_mudurlugu` türündeki 1377 kurum, 17 ayrı bakanlık/kuruluşun taşra mevzuatına tabidir.
Her biri §4'teki üç ölçütten ayrı ayrı geçirildi. **Hiçbirinde iç birim listesi kapsama
alınamadı.** Bu bölüm, aynı işin tekrar denenmemesi için tutulur.

| Kuruluş | İç birim listesi | Elenme sebebi (mevzuattan) |
|---|---|---|
| Millî Eğitim | ❌ (en yakın) | Ö2 GEÇTİ — 18 şube adı Yönetmelikte (RG 26/4/2025-32882) birebir. Ö3 düştü: m.5/1 *"norm kadro sayısına göre **birleştirilerek veya ayrılarak** teşkilatlandırılabilir"*; birleşik şubenin adı düzenlenmemiş |
| Sağlık | ❌ | Kadro Standartları Yönetmeliği Ek-1: *"birim adları ve görev tanımları **yönerge ile** belirlenir"* |
| Tarım ve Orman | ❌ | CBK m.434 iki cümle: *"Bakanlık taşra teşkilatı kurmaya yetkilidir."* CBK'da "il müdürlüğü" ibaresi bile geçmiyor. Ampirik: Ardahan 8 şube, İzmir 9 şube, adlar farklı |
| Aile ve Sosyal Hizmetler | ❌ | CBK bölümünde "Taşra teşkilatı" başlıklı **madde yok**; "il müdürlüğü" 0 kez geçiyor |
| Çevre, Şehircilik ve İklim D. | ❌ | CBK m.120 tek cümle: *"Bakanlık taşra teşkilatı kurmaya **yetkilidir**"* |
| Gençlik ve Spor | ❌ | Üç müdürlük adı CBK m.202/3'te birebir var ama fiil **"kurulabilir"** |
| Kültür ve Turizm | ❌ | Yönetmelik m.6: *"ihtiyaca göre artırılabilir, azaltılabilir veya **birleştirilebilir**"* |
| Emniyet GM | ❌ | 3201 Ek m.14: *"**gruplandırılmış** standart kuruluş modellerine göre"*; ad "şube müdürlüğü **veya** grup amirliği" olarak çatallı. Ampirik: Bursa'da Trafik Tescil ve Trafik Denetleme ayrı, Hakkâri/Ağrı'da birleşik |
| Jandarma GK | ❌ | 2803 m.5 kuruluşu tümüyle Bakanlık iç düzenlemesine bırakıyor; iç birim adı kamuya açık mevzuatta **yok** — üretilemez |
| Diyanet (Müftülük) | ❌ | 633 m.8/2: *"**ihtiyaca göre** şube müdürlükleri **kurulabilir**"*, hiçbir şube adı sayılmıyor |
| AFAD | ❌ | 4 s. CBK m.54: norm kadro *"**her bir il müdürlüğü için ayrı ayrı** belirlenir"* |
| Göç İdaresi | ❌ | İç birim düzenlemesi yok |
| NVİ | ❌ | 1 s. CBK m.271/4 **"kurabilir"** (aynı maddenin sonraki fıkraları "kurulmuştur"/"kurulur" diyor — kip ayrımı bilinçli) |
| İŞKUR | ❌ | Yönetmelik m.6/6: servisler *"**Genel Müdürün onayı** ile belirlenir"* |
| SGK | ❌ (belirsiz alt küme) | m.7/1 onbeş servisi **"kurulur"** diye sayıyor ve adlar birleşmede kapalı kümede kalıyor; ama m.7/6 sekiz servisi büyük illerde **kurdurmuyor**, m.7/2 birleştirmeye izin veriyor → koşulsuz 8'li alt küme BELİRSİZ, ölçülmeden alınmamalı |
| Ticaret | ❌ | Yönetmelik m.30/2: *"**Bakan onayıyla yeterli sayıda** şube müdürlüğü **kurulabilir**"*. UYARI: aynı yönetmelik m.5/2'de 14 şube adı birebir sayılır ama bunlar il müdürlüklerine değil **Gümrük ve Dış Ticaret BÖLGE müdürlüklerine** aittir — karıştırmak yanlış-EVET üretir |
| GİB / Defterdarlık | ❌ | §4'teki gerekçe; ayrıca çürütme testinden geçti — 1/9/2024 sonrası birim adlarını sabitleyen yeni yönetmelik yok |

**Tekrar eden kalıp:** mevzuat **fonksiyonu** zorunlu kılıyor, **birim adını** idareye bırakıyor.
Valilik/kaymakamlığın istisna olmasının sebebi, birimlerini tek bir yönetmeliğin açıkça
sayması ("İllerde aşağıdaki birimler bulunur"). İl müdürlüklerinde böyle bir metin yok.

**Ertelenen iki iş (bilinçli, kapsam dışı):**
- **MEB hizmet taksonomisi:** Yönetmelik m.7'deki 18 hizmet alanı kapalı ve emredici. Birim
  ADRESİ olarak değil, **konu/hizmet etiketi** olarak kullanılabilir — farklı bir özellik.
- **SGK 8 koşulsuz servis:** m.7/2 birleştirme riski ölçülmeden kapsama alınmamalı.

**Kurumun kendisi havale hedefi olarak:** 10 kuruluşta il müdürlüğünün ADI mevzuatla sabit ve
81 ilde zorunludur. Bu bir mevzuat-teşkilat şablonu gerektirmez — muhatap tespiti zaten kurumu
adıyla buluyor; tek-birimlik şablon aynı adı geri döndürür, bilgi eklemez.
