/* Denenebilir örnek evrak metinleri — Gelen Evrak kutusu ve /process_doc akışı için.

   TÜMÜ SAHTE veri (CLAUDE.md §2): isim/TCKN/telefon/IBAN/e-posta uydurma, gerçek kişiyle
   eşleşmez. TCKN'ler checksum-GEÇERLİ SAHTE numaralardır (CLAUDE.md §2) — ardışık/desenli
   uydurma rakamlardır; checksum'ı sampleDocs.test.js kilitler. Muhatap KURUMLAR gerçektir
   (kamuya açık teşkilat bilgisi); evrakların İÇERİĞİ %100 kurgudur.

   TARİHLER GÖRELİDİR (2026-10 yenilemesi): hiçbir tarih sabit yazılmaz. Her evrak tarihi,
   ilgi tarihi, izin aralığı ve "… tarihine kadar" süresi çalışma anında BUGÜNE göre
   üretilir (lib/goreliTarih.js) → kutu her gün aynı SLA bant dağılımını gösterir. Eski
   sürüm 06.08.2026'ya sabitlenmişti; iki ay sonra on beş evrağın hepsi "gecikmiş" görünüyordu.

   ┌── KAPSAM HARİTASI (hangi örnek neyi kanıtlar — 2026-10-06 yerel API ile ölçüldü) ───────┐
   │ Görev 1                                                                                 │
   │   sınıflandırma      : 10 farklı tür + belirsiz (#15: yarım sayfa → yönlendirme         │
   │                        BELİRSİZ, birim yok, konu/tarih/imza sorulur)                    │
   │   bilgi çıkarımı+PII : TCKN (#1-#5,#7-#11,#14 — hepsi checksum-geçerli sahte) · telefon ·          │
   │                        e-posta (#3,#7,#8,#9) · IBAN (#1,#14) · vergi no (#9,#14)        │
   │   eksik bilgi+clarify: #6 (ad-soyad, TCKN, adres, imza, tarih yok → dur-ve-sor)         │
   │   mevzuat RAG        : 3071 · 4982 · 2872 · 5199 · 2464 · 2886 · 2004 · 657 · 5258      │
   │                        (hepsi data/mevzuat korpusunda; metinde madde no YALNIZ 657      │
   │                        m.104 — korpusta doğrulandı)                                     │
   │ Görev 2                                                                                 │
   │   yazı taslağı       : havale · cevap · devir + devir bilgisi · üst yazıya cevap ·      │
   │                        görüş (müzekkere)                                                │
   │   birim yönlendirme  : üç GÜVEN SEVİYESİ birden — aşağıya bak                           │
   │ Yenilikçilik                                                                            │
   │   çok talep          : #1 → tek dilekçe, üç ayrı iş, üç ayrı birim (Fen İşleri ·        │
   │                        Kültür-Sosyal İşler · Mali Hizmetler) + tek toplu cevap          │
   │   canlı kaynak keşfi : #2 → korpusta OLMAYAN kurum, kurumun sitesi canlı bulunur        │
   │   yetki/devir        : #10 → muhatap Pendik Belediyesi, yetkili İSKİ (3071 m.5);        │
   │                        metinde devir ipucu YOK, karar talep içeriğinden çıkar           │
   │   süreli yazışma     : #12 · #13 · #14 metinde cevap süresi/tarihi taşır (2646 m.26)    │
   │   SLA bantları (kuyruk önizlemesi, /sla/onizleme):                                      │
   │     NORMAL ×7 · KRİTİK ×2 (#3,#8) · GECİKMİŞ ×1 (#4) · tarih_yok ×1 (#6) · tanımsız ×4  │
   └─────────────────────────────────────────────────────────────────────────────────────────┘

   ÜÇ GÜVEN SEVİYESİ (dürüstlük iddiası — kurumlar ölçülerek seçildi 2026-08-06, korundu):
     YEŞİL  "kaynak doğrulandı" → kurumun kendi teşkilat kaydı (data/teskilat)
            (#1,#13,#14 Çankaya · #3 Seyhan · #4,#10 Pendik · #5 Van BB · #6,#8 Kadıköy ·
             #7,#9 Nilüfer)
     YEŞİL  mevzuat şablonu → tür için kanunen zorunlu birim (#11 valilik · #12 kaymakamlık)
     SARI   canlı kaynak → korpusta yok; kurumun sitesi çalışma anında bulunur (#2 Konya İl
            Sağlık Müdürlüğü — data/canli_kaynak_onbellek.json'da önbellekli)
   Muhataplar bu tabloya göre SEÇİLDİ; değiştirilirse yönlendirme iddiası bozulur.

   SLA BANT KURALI (backend agents/nodes/sla_triyaj.compute_sla): KRİTİK = son güne ≤2 gün,
   GECİKMİŞ = son gün geçti. Süre: 30 takvim günü (3071 m.7) · 15 iş günü (4982 m.11).
   Ofsetler eşik sınırına DEĞİL bant ortasına konur (NORMAL: 1-6 gün önce → ≥24 gün kalır;
   GECİKMİŞ: 37 gün önce → son gün 7 gün geride). KRİTİK örneklerin son günü bir İŞ GÜNÜNE
   denk getirilir (`sureyeKalan`) — son gün tatile düşüp ileri kayarsa bant değişirdi.
   Kuyruk önizlemesi yalnız "Tarih:" etiketli satırı okur ve tür tablosuna bakar; metindeki
   süreyi (#12-#14) yalnız tam işleme (sla_triyaj) görür → onlar önizlemede "tanımsız".

   SÖZLEŞMELER (sampleDocs.test.js kilitler):
     · `tur` kanonik EVRAK_TURLERI değeri (SLA + kategori bununla çalışır).
     · id'ler 2026-10'da YENİLENDİ: veritabanındaki eski işlem kayıtları "ornek-<id>.txt" ve
       label ile örneklere eşlenir (lib/kuyrukDurumu.js) — eski id/label tekrar kullanılırsa
       yeni evrak eski kayıt yüzünden "işlendi" görünüp kutudan düşer. ESKİ ID'LERİ GERİ ALMA.
     · `beklenenSla` = bugün kuyruk önizlemesinde görülmesi gereken bant (test hesaplar). */

import { tarihBaglami } from "./goreliTarih.js";

// ══════════ VİTRİN 1: çok talepli dilekçe → talep kümesi (tek evrak, üç iş) ══════════
const cokTalepliDilekce = (t) => {
  const tarih = t.gunOnce(3);
  return {
    id: "cok_talepli_dilekce",
    tur: "dilekce",
    beklenenSla: "NORMAL",
    konu: "Kaldırım onarımı, kurs kaydı ve mükerrer vergi ödemesinin iadesi",
    label: "Üç talepli vatandaş dilekçesi",
    icon: "route",
    grup: "Vatandaş",
    aciklama: "Vatandaş dilekçesi · Çankaya Belediye Başkanlığı · tek dilekçede üç ayrı birime düşen talep",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: ${tarih}
Konu: Kaldırım onarımı, kurs kaydı ve mükerrer vergi ödemesinin iadesi hk.

Sayın Yetkili,

Birinci olarak, Ayrancı Mahallesi Hoşdere Caddesi üzerindeki yaya kaldırımının yaklaşık
yirmi metrelik bölümünde parke taşları yerinden çıkmış ve zemin çökmüştür. Hemen yanında
bir ilkokul bulunduğundan öğrenciler taşıt yoluna inerek yürümek zorunda kalmaktadır.
Kaldırımın onarılmasını talep ediyorum.

İkinci olarak, Başkanlığınıza bağlı semt kadın kurslarında bu dönem açılacak dikiş-nakış
ve temel bilgisayar kurslarının kayıt tarihleri ile başvuru şartları hakkında tarafıma
bilgi verilmesini rica ediyorum.

Üçüncü olarak, ${t.yil} yılı emlak vergisi taksitimi ${t.gunOnce(19)} tarihinde hem banka şubesinden
hem de e-belediye üzerinden olmak üzere iki kez ödediğim, ekteki ödeme dekontlarıyla
sabittir. Mükerrer ödenen 1.842,60 TL'nin aşağıda bilgileri yazılı hesabıma iade
edilmesini talep ediyorum.

Gereğini bilgilerinize arz ederim.

Adı Soyadı: Ayşe Yılmaz
T.C. Kimlik No: 12345678950
Adres: Ayrancı Mahallesi, Hoşdere Caddesi No: 112/4, Çankaya / ANKARA
Telefon: 0555 123 45 67
IBAN: TR12 0001 0012 3456 7890 1234 56
İmza

EK: Ödeme dekontları (2 sayfa)`,
  };
};

// ══════════ VİTRİN 2: korpusta OLMAYAN kurum → CANLI KAYNAK KEŞFİ ══════════
const aileHekimiDilekcesi = (t) => ({
  id: "dilekce_aile_hekimi",
  tur: "dilekce",
  beklenenSla: "NORMAL",
  konu: "Boş kalan aile hekimliği biriminin doldurulması talebi",
  label: "Aile hekimliği birimi dilekçesi",
  icon: "pencil",
  grup: "Vatandaş",
  aciklama: "Vatandaş dilekçesi · Konya İl Sağlık Müdürlüğü · iki aydır hekimsiz kalan aile hekimliği birimi",
  text: `T.C.
KONYA İL SAĞLIK MÜDÜRLÜĞÜNE
KONYA

Tarih: ${t.gunOnce(2)}
Konu: Aile hekimliği biriminin boş kalması hk.

Sayın Yetkili,

Meram ilçesi Yenice Mahallesi'nde ikamet etmekteyim. Kayıtlı olduğum aile sağlığı
merkezindeki 3 numaralı aile hekimliği birimi, hekimimizin başka bir ile atanmasından bu
yana yaklaşık iki aydır boştur. Bu süre içinde birime kayıtlı kişiler, haftada yalnızca iki
gün gelen geçici görevli hekim tarafından muayene edilebilmekte; kronik rahatsızlığı olan
yaşlı annemin düzenli ilaç raporu yenilemeleri aksamaktadır.

Boş aile hekimliği biriminin en kısa sürede doldurulmasını, bu sağlanana kadar geçici
görevlendirmenin haftanın her iş günü yapılmasını ve konuya ilişkin planlamanın tarafıma
yazılı olarak bildirilmesini arz ederim.

Adı Soyadı: Zehra Aksoy
T.C. Kimlik No: 98765432150
Adres: Yenice Mahallesi, Gül Sokak No: 7/2, Meram / KONYA
Telefon: 0555 246 81 13
İmza`,
});

// ══════════ Vatandaş → belediye: DOĞRULANMIŞ teşkilat kaydı olan kurumlar ══════════
const atikKonteynerSikayeti = (t) => ({
  id: "sikayet_atik_konteyner",
  tur: "sikayet",
  beklenenSla: "KRITIK",
  konu: "Atık konteynerlerinin taşması ve düzensiz toplanması şikâyeti",
  label: "Atık toplama şikâyeti",
  icon: "alert",
  grup: "Vatandaş",
  aciklama: "Vatandaş şikâyeti · Seyhan Belediye Başkanlığı · haftada bir boşaltılan, taşan ve kırık konteynerler",
  text: `T.C.
SEYHAN BELEDİYE BAŞKANLIĞINA
ADANA

Tarih: ${t.sureyeKalan(30, 2)}
Konu: Atık konteynerlerinin taşması ve düzensiz toplanması hk.

Sayın Yetkili,

Sokağımızdaki iki adet atık konteyneri son bir aydır haftada yalnızca bir kez
boşaltılmaktadır. Konteynerler dolup taştığından atıklar kaldırıma ve taşıt yoluna
saçılmakta, sokakta yoğun koku ve haşere sorunu oluşmaktadır. Konteynerlerden birinin
kapağı kırık, tekerlekleri ise kopuktur.

Atık toplama sıklığının mahallenin nüfus yoğunluğuna uygun hâle getirilmesini, kırık
konteynerin yenisiyle değiştirilmesini ve 2872 sayılı Çevre Kanunu kapsamında bölgenin
çevre ve halk sağlığı yönünden incelenmesini şikâyeten arz ederim.

Adı Soyadı: Burak Yıldız
T.C. Kimlik No: 65432198794
Adres: Ziyapaşa Mahallesi, Lale Sokak No: 18/5, Seyhan / ADANA
Telefon: 0555 318 24 86
E-posta: burak.yildiz@ornekmail.com
İmza`,
});

const molozDokumuIhbari = (t) => ({
  id: "ihbar_moloz_dokumu",
  tur: "ihbar",
  beklenenSla: "GECIKMIS",
  konu: "Boş arsaya kaçak hafriyat ve moloz dökülmesi ihbarı",
  label: "Kaçak moloz dökümü ihbarı",
  icon: "alert",
  grup: "Vatandaş",
  aciklama: "Vatandaş ihbarı · Pendik Belediye Başkanlığı · gece saatlerinde boş arsaya kamyonla moloz dökülüyor",
  text: `T.C.
PENDİK BELEDİYE BAŞKANLIĞINA
İSTANBUL

Tarih: ${t.gunOnce(37)}
Konu: Boş arsaya kaçak hafriyat ve moloz dökülmesi ihbarı

Sayın Yetkili,

Kaynarca Mahallesi Menekşe Sokak'ın sonundaki boş arsaya, son iki haftadır gece saat
23.00'ten sonra kamyonlarla inşaat molozu ve hafriyat toprağı dökülmektedir. Döküm
karanlıkta yapıldığından araçların plakaları okunamamıştır. Arsada biriken moloz yağmur
suyu kanalını kapatmış ve yakındaki çocuk oyun alanının kenarına kadar yayılmıştır.

Kaçak dökümün tespit edilerek sorumlular hakkında 2872 sayılı Çevre Kanunu kapsamında
gerekli yasal işlemin yapılmasını, dökülen molozun kaldırılmasını ve arsaya gece döküm
yapılmasını engelleyecek önlem alınmasını ihbar ve talep ederim.

Adı Soyadı: Deniz Erdem
T.C. Kimlik No: 74185296350
Adres: Kaynarca Mahallesi, Menekşe Sokak No: 4/9, Pendik / İSTANBUL
Telefon: 0555 444 55 76
İmza`,
});

const karMucadelesiTalebi = (t) => ({
  id: "talep_kar_mucadelesi",
  tur: "talep",
  beklenenSla: "NORMAL",
  konu: "Kırsal grup yolunun kar mücadelesi programına alınması talebi",
  label: "Kar mücadelesi talebi",
  icon: "route",
  grup: "Vatandaş",
  aciklama: "Vatandaş talebi · Van Büyükşehir Belediye Başkanlığı · kışın günlerce kapanan dokuz kilometrelik grup yolu",
  text: `T.C.
VAN BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA
VAN

Tarih: ${t.gunOnce(6)}
Konu: Grup yolunun kar mücadelesi programına alınması talebi

Sayın Yetkili,

Tuşba ilçesine bağlı Kalecik Mahallesi'ni ilçe merkezine bağlayan yaklaşık dokuz
kilometrelik grup yolu, geçen kış yoğun kar yağışı nedeniyle toplam on bir gün ulaşıma
kapalı kalmıştır. Bu sürede hasta sevkleri ve okul servisleri aksamış, bir doğum vakası
ancak iş makinesi eşliğinde hastaneye ulaştırılabilmiştir.

Önümüzdeki kış mevsiminde anılan yolun Başkanlığınızın kar mücadelesi programına öncelikli
olarak alınmasını, yol kenarına kar direği dikilmesini ve mahalle girişine tuz-kum yığını
bırakılmasını talep ederim. Yapılacak planlamanın tarafıma bildirilmesini arz ederim.

Adı Soyadı: Serkan Özdemir
T.C. Kimlik No: 23456789060
Adres: Kalecik Mahallesi, Okul Sokak No: 3, Tuşba / VAN
Telefon: 0555 432 19 97
İmza`,
});

// Zorunlu unsurları (3071 m.4: ad-soyad, adres, imza), TCKN ve tarihi olmayan metin →
// eksik tespit + dur-ve-sor. Etiketli tarih yok → kuyrukta "tarih_yok".
const imzasizParkSikayeti = () => ({
  id: "sikayet_imzasiz_park",
  tur: "sikayet",
  beklenenSla: "tarih_yok",
  konu: "Çocuk parkındaki kırık oyun aletleri",
  label: "İmzasız park şikâyeti",
  icon: "alert",
  grup: "Vatandaş",
  aciklama: "İmzasız şikâyet metni · Kadıköy Belediye Başkanlığı · tarih, ad-soyad, adres ve imza yazılmamış",
  text: `KADIKÖY BELEDİYE BAŞKANLIĞINA

Mahallemizdeki çocuk parkında bulunan iki salıncağın zinciri kopmuş, kaydırağın
basamakları kırılmıştır. Oyun alanının zeminindeki kauçuk kaplama yer yer sökülmüş,
altından çıkan beton zemine geçen hafta bir çocuk düşerek yaralanmıştır.

Parktaki oyun aletlerinin en kısa sürede onarılmasını, onarım yapılana kadar da tehlikeli
aletlerin kullanıma kapatılmasını istiyorum. Gereğinin yapılmasını bekliyorum.`,
});

const parkHarcamaBilgiEdinme = (t) => ({
  id: "bilgi_edinme_park_harcama",
  tur: "bilgi_edinme",
  beklenenSla: "NORMAL",
  konu: "Ağaçlandırma ve park bakım harcamalarına ilişkin bilgi talebi",
  label: "Park harcamaları bilgi edinme başvurusu",
  icon: "search",
  grup: "Vatandaş",
  aciklama: "4982 sayılı Kanun kapsamında başvuru · Nilüfer Belediye Başkanlığı · dikilen ağaç sayısı ve park bakım harcaması",
  text: `T.C.
NİLÜFER BELEDİYE BAŞKANLIĞINA
BURSA

Tarih: ${t.gunOnce(5)}
Konu: 4982 sayılı Kanun kapsamında bilgi talebi

Sayın Yetkili,

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, ${t.yil - 1} yılı içinde Başkanlığınızca;
1- İlçe genelinde dikilen ağaç ve fidan sayısının mahalle bazında dağılımının,
2- Park ve yeşil alanların bakım ve onarımı için yapılan toplam harcama tutarının,
3- Yeni yapılan veya yenilenen çocuk oyun alanı sayısının
tarafıma elektronik posta yoluyla verilmesini talep ederim.

İstediğim bilgiler kişisel veri içermeyen toplulaştırılmış verilerdir; bir yüksek lisans
tez çalışmasında kaynak olarak kullanılacaktır.

Adı Soyadı: Okan Bayram
T.C. Kimlik No: 34567890170
Adres: Görükle Mahallesi, Kampüs Caddesi No: 21/3, Nilüfer / BURSA
E-posta: okan.bayram@ornekmail.com
Telefon: 0555 907 46 22
İmza`,
});

const sokakHayvanlariCimer = (t) => ({
  id: "cimer_sokak_hayvanlari",
  tur: "cimer",
  beklenenSla: "KRITIK",
  konu: "Yaralı sokak köpeğinin tedavisi ve kısırlaştırma talebi",
  label: "Sokak hayvanları CİMER başvurusu",
  icon: "search",
  grup: "Vatandaş",
  aciklama: "CİMER üzerinden iletilen başvuru · Kadıköy Belediye Başkanlığı · yaralı köpek ve hızla büyüyen hayvan grubu",
  text: `CİMER — Cumhurbaşkanlığı İletişim Merkezi
Başvuru Türü: Talep
Başvuru No: ${t.yil}-CMR-5820417

Tarih: ${t.sureyeKalan(30, 1)}
Konu: Yaralı sokak köpeğinin tedavisi ve kısırlaştırma çalışması talebi

İlgili Kurum: Kadıköy Belediye Başkanlığı

Fikirtepe Mahallesi'ndeki inşaat alanlarının çevresinde yaşayan sekiz-on köpeklik bir grup
bulunmaktadır. Gruptaki bir köpeğin arka bacağının yaralı olduğu ve son günlerde yürümekte
zorlandığı görülmektedir. Grupta yeni doğmuş yavrular da bulunmakta, hayvan sayısı her geçen
ay artmaktadır.

Yaralı köpeğin Başkanlığınızca alınarak tedavi edilmesini, gruptaki hayvanların 5199 sayılı
Hayvanları Koruma Kanunu kapsamında kısırlaştırma ve aşılama programına alınmasını ve yapılan
işlem hakkında tarafıma bilgi verilmesini talep ederim.

Adı Soyadı: Elif Korkmaz
T.C. Kimlik No: 67890123400
Telefon: 0555 777 88 19
E-posta: elif.korkmaz@ornekmail.com`,
});

const acikAlanBasvurusu = (t) => ({
  id: "basvuru_acik_alan",
  tur: "basvuru",
  beklenenSla: "NORMAL",
  konu: "Kaldırım üzeri açık alan kullanım izni başvurusu",
  label: "Açık alan kullanım izni başvurusu",
  icon: "doc",
  grup: "Vatandaş",
  aciklama: "İzin başvurusu · Nilüfer Belediye Başkanlığı · kafeterya önü kaldırıma masa-sandalye, 3 ek belge",
  text: `T.C.
NİLÜFER BELEDİYE BAŞKANLIĞINA
BURSA

Tarih: ${t.gunOnce(4)}
Konu: Kaldırım üzeri açık alan kullanım izni başvurusu

Sayın Yetkili,

Aşağıda adresi yazılı, işyeri açma ve çalışma ruhsatı bulunan kafeterya işletmemin önündeki
kaldırımın, yaya geçişini engellemeyecek şekilde 12 m²'lik bölümünün dört masa ve on altı
sandalye ile açık alan olarak kullanılmasına izin verilmesini ve 2464 sayılı Belediye
Gelirleri Kanunu kapsamında tahakkuk edecek işgal harcının tarafıma bildirilmesini arz ederim.

Adı Soyadı: Leyla Çınar
T.C. Kimlik No: 45678912316
İşyeri Unvanı: Çınar Kafe
İşyeri Adresi: Fethiye Mahallesi, Ilgaz Sokak No: 6/A, Nilüfer / BURSA
Vergi Dairesi / No: Nilüfer VD - 1234567890
Telefon: 0555 321 76 64
E-posta: leyla.cinar@ornekmail.com

EKLER:
1- Kaldırım ölçü krokisi (1 sayfa)
2- İşyeri açma ve çalışma ruhsatı fotokopisi (1 sayfa)
3- Vergi levhası fotokopisi (1 sayfa)

İmza`,
});

// ══════════ VİTRİN 3: muhatap ≠ yetkili → DEVİR (3071 m.5): içme suyu şebekesi İSKİ'nin ══════════
const suArizasiDilekcesi = (t) => ({
  id: "dilekce_su_arizasi",
  tur: "dilekce",
  beklenenSla: "NORMAL",
  konu: "İçme suyu şebekesindeki arıza ve düşük su basıncı",
  label: "İçme suyu arızası dilekçesi",
  icon: "alert",
  grup: "Vatandaş",
  aciklama: "Vatandaş dilekçesi · Pendik Belediye Başkanlığı · dört gündür akan şebeke suyu ve üst katlarda susuzluk",
  text: `T.C.
PENDİK BELEDİYE BAŞKANLIĞINA
İSTANBUL

Tarih: ${t.gunOnce(1)}
Konu: İçme suyu şebekesindeki arıza ve basınç düşüklüğü hk.

Sayın Yetkili,

Yenişehir Mahallesi Gülbahar Sokak'ta, ana içme suyu borusunda meydana geldiği anlaşılan
arıza nedeniyle dört gündür yol kenarından sürekli su akmaktadır. Aynı günden bu yana
sokağımızdaki binaların üst katlarında su basıncı çok düşmüş, akşam saatlerinde
musluklardan su gelmemektedir.

Şebeke arızasının en kısa sürede giderilmesini ve su basıncının normale döndürülmesini
arz ederim.

Adı Soyadı: Hakan Uçar
T.C. Kimlik No: 56789012390
Adres: Yenişehir Mahallesi, Gülbahar Sokak No: 15/8, Pendik / İSTANBUL
Telefon: 0555 654 32 20
İmza`,
});

// ══════════ Kurum içi / kurum → kurum ══════════
const babalikIzniTalebi = (t) => {
  const tarih = t.isGunuOnce(1);
  const dogum = t.sonra(tarih, -1);
  return {
    id: "talep_babalik_izni",
    tur: "talep",
    beklenenSla: "NORMAL",
    konu: "Personel babalık izni talebi",
    label: "Babalık izni dilekçesi",
    icon: "clock",
    grup: "Kurum",
    aciklama: "Personel dilekçesi · Kayseri Valiliği İl Yazı İşleri Müdürlüğü · 657 sayılı Kanun kapsamında on günlük mazeret izni",
    text: `T.C.
KAYSERİ VALİLİĞİNE
(İl Yazı İşleri Müdürlüğü)

Tarih: ${tarih}
Konu: Babalık izni talebi

Valiliğiniz İl Yazı İşleri Müdürlüğünde şef olarak görev yapmaktayım. Eşim
${dogum} tarihinde doğum yapmıştır. 657 sayılı Devlet Memurları Kanununun 104 üncü maddesi
uyarınca on günlük babalık izni hakkımın ${dogum} - ${t.sonra(dogum, 9)} tarihleri arasında
kullandırılması hususunda;

Gereğini arz ederim.

Adı Soyadı: Tolga Şen
T.C. Kimlik No: 78901234510
Sicil No: ${t.yil}/7318
Unvan: Şef
Birim: İl Yazı İşleri Müdürlüğü
Adres: Talas Mahallesi, Kiraz Sokak No: 11/2, Melikgazi / KAYSERİ
Telefon: 0555 210 64 38
İmza

EK: Doğum raporu örneği (1 sayfa)`,
  };
};

const toplanmaAlaniUstYazisi = (t) => ({
  id: "ust_yazi_toplanma_alani",
  tur: "ust_yazi",
  beklenenSla: "tanimsiz",
  konu: "Afet ve acil durum toplanma alanı bilgilerinin güncellenmesi",
  label: "Toplanma alanı üst yazısı",
  icon: "send",
  grup: "Kurum",
  aciklama: "Kütahya Valiliği → Tavşanlı Kaymakamlığı · toplanma alanı çizelgesi süreli olarak isteniyor",
  text: `T.C.
KÜTAHYA VALİLİĞİ
İl Afet ve Acil Durum Müdürlüğü

Sayı  : E-15784236-045.03-${t.yil}/2214
Tarih : ${t.isGunuOnce(2)}
Konu  : Toplanma alanı bilgilerinin güncellenmesi

TAVŞANLI KAYMAKAMLIĞINA

İlgi : Afet ve Acil Durum Yönetimi Başkanlığının ${t.isGunuOnce(6)} tarihli ve
       E-77812345-045.03-${t.yil}/9631 sayılı yazısı.

İlgi yazı ile afet ve acil durumlarda vatandaşların toplanacağı alanlara ilişkin
bilgilerin güncellenmesi istenilmektedir.

Bu kapsamda; İlçeniz sınırları içindeki toplanma alanlarının adı, adresi, yaklaşık kişi
kapasitesi, yönlendirme tabelası bulunup bulunmadığı ve son bir yıl içinde kullanım dışı
kalan alan olup olmadığı bilgilerinin ekli çizelgeye işlenerek ${t.isGunuSonra(8)} tarihine kadar
Müdürlüğümüze gönderilmesi hususunda;

Gereğini rica ederim.

                                                        Orhan DEMİRCİ
                                                        Vali a.
                                                        İl Afet ve Acil Durum Müdürü

EK: Toplanma alanı bilgi çizelgesi (1 sayfa)`,
});

const kiraGorusuMuzekkeresi = (t) => ({
  id: "muzekkere_kira_gorusu",
  tur: "muzekkere",
  beklenenSla: "tanimsiz",
  konu: "Belediye taşınmazının yeniden kiralanmasına ilişkin hukuki görüş",
  label: "Kira hukuki görüş müzekkeresi",
  icon: "scale",
  grup: "Kurum",
  aciklama: "Emlak ve İstimlak Müdürlüğü → Hukuk İşleri Müdürlüğü · kira süresi dolan kafeteryanın ihalesiz kiralanıp kiralanamayacağı",
  text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞI
Emlak ve İstimlak Müdürlüğü

Sayı  : E-77451298-934.02-${t.yil}/427
Tarih : ${t.isGunuOnce(1)}
Konu  : Kiralık taşınmazın yeniden kiralanması hk.

HUKUK İŞLERİ MÜDÜRLÜĞÜNE

İlgi : Başkanlık Makamının ${t.isGunuOnce(5)} tarihli ve ${t.yil}/284 sayılı Olur'u.

Başkanlığımıza ait olup Dikmen Mahallesi'nde kafeterya olarak kiraya verilen taşınmazın
kira sözleşmesi ${t.gunSonra(45)} tarihinde sona erecektir. Mevcut kiracı, sözleşmenin aynı
şartlarla ve güncel rayiç bedel üzerinden uzatılması talebiyle Müdürlüğümüze başvurmuştur.

Söz konusu taşınmazın mevcut kiracıya 2886 sayılı Devlet İhale Kanunu kapsamında ihaleye
çıkılmaksızın yeniden kiralanmasının mümkün olup olmadığı, mümkün değilse uygulanması
gereken ihale usulü hususunda Müdürlüğünüz görüşünün ${t.isGunuSonra(7)} tarihine kadar
bildirilmesini;

Rica ederim.

                                                        Selim AKAR
                                                        Emlak ve İstimlak Müdürü

EK: Kira sözleşmesi örneği (4 sayfa)`,
});

// ══════════ Hukuk / mali — PII: IBAN + vergi no + yetkili TCKN maskeleme ══════════
const hakedisHacizIhbarnamesi = (t) => ({
  id: "icra_hakedis_haczi",
  tur: "icra_evraki",
  beklenenSla: "tanimsiz",
  konu: "Yüklenici firmanın hakediş alacağına haciz ihbarnamesi",
  label: "Hakediş haczi ihbarnamesi",
  icon: "scale",
  grup: "Hukuk/Mali",
  aciklama: "Ankara 7. İcra Dairesi · borçlu yüklenicinin belediyeden alacağı hakedişlerin haczi, yedi günlük bildirim süresi",
  text: `T.C.
ANKARA 7. İCRA DAİRESİ

Dosya No : ${t.yil}/15372 E.
Tarih    : ${t.isGunuOnce(2)}
Konu     : Haciz ihbarnamesi (hakediş alacağı)

ÇANKAYA BELEDİYE BAŞKANLIĞINA

Dairemizin yukarıda numarası yazılı dosyasından, aşağıda bilgileri yazılı borçlu şirket
aleyhine yürütülen takip kesinleşmiştir.

Borçlunun Başkanlığınız nezdinde yürüttüğü yapım işlerinden doğmuş ve doğacak hakediş
alacaklarının takip tutarı kadarının 2004 sayılı İcra ve İflas Kanunu hükümleri uyarınca
haczedildiği; bu tutarın borçluya ödenmeyerek aşağıdaki hesaba yatırılması, borçluya
ödenecek bir alacak bulunmuyorsa bu hususun yedi gün içinde Dairemize bildirilmesi rica
olunur.

Borçlu           : Örnek Yapı İnşaat Taahhüt Ltd. Şti.
Vergi No         : 4567891230
Borçlu Yetkilisi : Nurcan Ateş
T.C. Kimlik No   : 32165498750
Alacaklı         : Kurgu Hazır Beton San. ve Tic. A.Ş.
Takip Tutarı     : 186.420,00 TL
Ödeme Hesabı     : TR33 0006 1005 1978 6457 8413 26

                                                        İcra Müdürü`,
});

// ══════════ Çekimser kalma — muhatabı, konusu ve göndereni olmayan yazı ══════════
const belirsizEkListe = () => ({
  id: "belirsiz_ek_liste",
  tur: "belirsiz",
  beklenenSla: "tanimsiz",
  konu: "Muhatabı ve konusu yazılmamış kısa yazı",
  label: "Konusu belirsiz ek liste yazısı",
  icon: "search",
  grup: "Kurum",
  aciklama: "Yarım kalmış sayfa · muhatabı, konusu, tarihi ve göndereni okunamıyor",
  text: `…ilişkin olarak yapılan görüşmede kararlaştırılan hususlar ile ekteki listede yer
alan kalemlerin, daha önce bildirilen esaslar çerçevesinde

[sayfanın devamı okunamıyor]

EK: Liste (3 sayfa)`,
});

const URETICILER = [
  cokTalepliDilekce, aileHekimiDilekcesi, atikKonteynerSikayeti, molozDokumuIhbari,
  karMucadelesiTalebi, imzasizParkSikayeti, parkHarcamaBilgiEdinme, sokakHayvanlariCimer,
  acikAlanBasvurusu, suArizasiDilekcesi, babalikIzniTalebi, toplanmaAlaniUstYazisi,
  kiraGorusuMuzekkeresi, hakedisHacizIhbarnamesi, belirsizEkListe,
];

/** Verilen güne göre örnek evrak listesi (saf — testte `bugun` sabitlenir). */
export const ornekEvraklar = (bugun = new Date()) => {
  const t = tarihBaglami(bugun);
  return URETICILER.map((uret) => Object.freeze(uret(t)));
};

/** Uygulamanın kullandığı liste — modül yüklendiği güne göre üretilir. */
export const SAMPLE_DOCS = ornekEvraklar();
