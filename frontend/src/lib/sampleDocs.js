/* Denenebilir örnek evrak metinleri — backend OCR'sız JSON yolu (/process_doc) için.
   TÜMÜ SAHTE veri (CLAUDE.md §2 / şartname §6.5): isim/TCKN/telefon/IBAN uydurma; gerçek
   kişi veya kurumla eşleşmez. İnternetten gerçek evrak ÇEKİLMEDİ (gerçek-PII riski); format
   2646 sayılı Yönetmelik'e göre gerçekçi, içerik %100 kurgudur.

   Demo (15p): jüri dosya bulmadan tek tıkla sistemin HER özelliğini canlı işletir. Her örnek
   pipeline'ın farklı bir davranışını sergiler; id = geçerli config.EVRAK_TURLERI değeri
   (SLA önizleme + kategori türetimi bununla çalışır).

   ÖZELLİK HARİTASI (hangi örnek neyi denetler):
     Görev 1:
       - sınıflandırma: 17 farklı tür (aşağıda) + belirsiz → abstention
       - bilgi çıkarımı + PII maskeleme: TCKN (dilekce), telefon (çok), IBAN (fatura/icra),
         e-posta (bilgi_edinme)
       - eksik-bilgi tespiti + clarify (dur-ve-sor): sikayet (zorunlu alan eksik)
       - mevzuat öner (BM25 RAG): her örnek ilgili kanuna atıf (3071/4982/7201/3194/2004/4734…)
       - özetleme: tüm örnekler
     Görev 2:
       - resmî yazı taslağı (6 tür) + üslup + birim yönlendirme (9 birim, farklı örneklerde farklı)
       - bilgilendirme + eksik-bilgi isteme
     Yenilikçilik:
       - decompose (çok-konulu): cok_konulu → 3 iş → 3 birim
       - SLA / yasal süre bantları (bugüne göre ayarlı):
           NORMAL   → dilekce, ihbar        (süre içinde)
           KRİTİK   → basvuru, cimer         (son 0-2 gün)
           GECİKMİŞ → bilgi_edinme, talep    (yasal süre doldu)
           tarih_yok→ sikayet                (etiketli tarih yok → [DOĞRULA])
           tanımsız → kurum→kurum + hukuk türleri (vatandaş süresi yok — uydurma yok)

   TCKN'ler kasıtlı geçersiz desen (algoritma tutmaz); IBAN'lar TR + sıfır/örnek blok.
   Sınıflandırma mock-modda keyword-heuristik ile deterministiktir (anahtarsız demo). */

export const SAMPLE_DOCS = [
  // ---------- VİTRİN: çok-konulu dilekçe (decompose → 3 birim) ----------
  {
    id: "cok_konulu",
    label: "Çok-Konulu Dilekçe",
    icon: "route",
    grup: "Vatandaş",
    aciklama: "Tek dilekçe → 3 ayrı iş → otomatik bölünüp ayrı birimlere havale (VİTRİN)",
    text: `T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 02.07.2026
Konu: Çeşitli talepler

Sokağımızın başındaki çukurun bir an önce onarılmasını, ayrıca geçen ay fazla
tahakkuk ettirilen su faturasının yanlış olduğunu ve düzeltilmesini, bir de
oğlumun belediyenizdeki iş başvurusunun sonucunu öğrenmek istiyorum.
Gereğini arz ederim.

Adı Soyadı: Ayşe Yılmaz
T.C. Kimlik No: 12345678901
Adres: Şenlik Mahallesi, Gül Sokak No: 7, Keçiören / ANKARA
Telefon: 0555 123 45 67
İmza`,
  },

  // ---------- Vatandaş → kurum (SLA bantları burada yayılır) ----------
  {
    id: "dilekce",
    label: "Dilekçe (süre içinde)",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Zorunlu alanlar tam + PII maskeli → temiz cevabi yazı · SLA: NORMAL",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 05.07.2026
Konu: Park ve bahçe düzenleme talebi

Mahallemizde bulunan çocuk parkının aydınlatma direkleri uzun süredir
arızalıdır. Akşam saatlerinde park kullanılamaz hale gelmektedir.
Gerekli onarımın yapılması hususunda gereğini arz ederim.

Adı Soyadı: Ayşe Yılmaz
T.C. Kimlik No: 12345678901
Adres: Kızılay Mahallesi, Atatürk Caddesi No: 42/5, Çankaya / ANKARA
Telefon: 0555 123 45 67
İmza`,
  },
  {
    id: "basvuru",
    label: "İşyeri Ruhsat Başvurusu",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "İşyeri açma ve çalışma ruhsatı başvurusu → İmar/Ruhsat · SLA: KRİTİK",
    text: `T.C.
YENİMAHALLE BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 10.06.2026
Konu: İşyeri açma ve çalışma ruhsatı başvurusu

İlçeniz sınırları içinde açmayı planladığım kırtasiye ve fotokopi işletmesi
için işyeri açma ve çalışma ruhsatı düzenlenmesini talep ediyorum. Kira
sözleşmesi ve vergi levhası dilekçe ekindedir. Gereğini arz ederim.

Adı Soyadı: Murat Çelik
T.C. Kimlik No: 45678912303
İş yeri Adresi: Batıkent Mahallesi, Meydan Caddesi No: 15, Yenimahalle / ANKARA
Telefon: 0555 321 76 54
İmza`,
  },
  {
    id: "bilgi_edinme",
    label: "Bilgi Edinme (süresi geçti)",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "4982 sayılı Kanun → bilgilendirme yazısı · SLA: GECİKMİŞ (15 iş günü)",
    text: `T.C.
ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞINA

Tarih: 01.06.2026
Konu: 4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında bilgi talebi

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, ilçemizde 2025 yılında
verilen yapı ruhsatı sayısı ve toplam inşaat alanına ilişkin mevcut bilgi ve
belgelerin tarafıma yazılı olarak verilmesini talep ederim.

Adı Soyadı: Mehmet Demir
T.C. Kimlik No: 98765432109
E-posta: mehmet.demir@ornekmail.com
Adres: Bahçelievler Mahallesi, 7. Sokak No: 3, Bahçelievler / İSTANBUL
İmza`,
  },
  {
    id: "sikayet",
    label: "Şikâyet (eksik bilgi)",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Zorunlu alan eksik → dur-ve-sor (clarify) tetiklenir · SLA: tarih yok [DOĞRULA]",
    text: `Belediyeye bağlı temizlik araçları sabahın çok erken saatlerinde yüksek
sesle çalışıp mahalleliyi rahatsız etmektedir. Bu durumdan dolayı şikâyetçiyim.
Gereken işlemin yapılmasını istiyorum.`,
  },
  {
    id: "ihbar",
    label: "Kaçak Yapı İhbarı",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "3194 İmar Kanunu — kaçak yapı ihbarı → inceleme/olur · SLA: NORMAL",
    text: `T.C.
PENDİK BELEDİYE BAŞKANLIĞINA
İSTANBUL

Tarih: 07.07.2026
Konu: Ruhsatsız yapı ihbarı

Mahallemizde, komşu parselde gece gündüz devam eden ve ruhsatı bulunmadığını
düşündüğüm bir inşaat yapılmaktadır. 3194 sayılı İmar Kanunu kapsamında gerekli
denetimin yapılıp yasal işlem başlatılmasını ihbar ve talep ederim.

Adı Soyadı: Zeynep Kaya
Telefon: 0555 444 55 66
Adres: Kurtköy Mahallesi, Çınar Sokak No: 9, Pendik / İSTANBUL
İmza`,
  },
  {
    id: "talep",
    label: "İzin Talebi (süresi geçti)",
    icon: "file",
    grup: "Vatandaş",
    aciklama: "657 sayılı Kanun — personel izin talebi → İnsan Kaynakları · SLA: GECİKMİŞ",
    text: `T.C.
İL SAĞLIK MÜDÜRLÜĞÜNE
İZMİR

Tarih: 25.05.2026
Konu: Yıllık izin talebi

Müdürlüğünüz bünyesinde memur olarak görev yapmaktayım. 657 sayılı Devlet
Memurları Kanunu kapsamında hak ettiğim yıllık iznimin 14.07.2026-28.07.2026
tarihleri arasında kullandırılmasını arz ederim.

Adı Soyadı: Elif Doğan
Sicil No: 2026/5541
Görev: Sağlık Memuru
İmza`,
  },
  {
    id: "cimer",
    label: "CİMER Başvurusu",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "CİMER üzerinden başvuru → bilgilendirme · SLA: KRİTİK",
    text: `CİMER — Cumhurbaşkanlığı İletişim Merkezi
Başvuru Türü: Talep/İstek

Tarih: 09.06.2026
Konu: Toplu taşıma sefer sıklığı

İlçemizde akşam saatlerinden sonra belediye otobüslerinin sefer sıklığı çok
azalmaktadır. Çalışan vatandaşların mağdur olmaması için sefer sayısının
artırılması yönünde gereğinin yapılmasını ve tarafıma bilgi verilmesini talep
ederim.

Adı Soyadı: Ali Vural
Telefon: 0555 777 88 99
E-posta: ali.vural@ornekmail.com`,
  },

  // ---------- Kurum → kurum (SLA: vatandaş süresi yok → tanımsız) ----------
  {
    id: "ust_yazi",
    label: "Üst Yazı",
    icon: "landmark",
    grup: "Kurum",
    aciklama: "Kurumlar arası yeni resmî yazışma → Yazı İşleri / Genel Evrak",
    text: `T.C.
İÇİŞLERİ BAKANLIĞI
Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü

Sayı : E-45678257-622.03-2026/1487
Tarih: 18.06.2026
Konu : Adres kayıt sistemi güncelleme çalışmaları

Adres Kayıt Sistemi'nde tespit edilen mükerrer kayıtların temizlenmesine
yönelik çalışmaların 2026 yılı üçüncü çeyreğinde tamamlanması planlanmaktadır.
Konuya ilişkin il müdürlüklerinin bilgilendirilmesi hususunda;

Gereğini rica ederim.

Dr. Selim Kaya
Genel Müdür
e-imza`,
  },
  {
    id: "muzekkere",
    label: "Müzekkere",
    icon: "file",
    grup: "Kurum",
    aciklama: "Kurumlar arası bilgi/kayıt celbi → Hukuk Müşavirliği",
    text: `T.C.
SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI
Hukuk Müşavirliği

Sayı : E-72615498-640-2026/2210
Tarih: 09.06.2026
Konu : Müzekkere — sigortalılık kayıtlarının celbi

İdaremiz aleyhine açılan tam yargı davasında kullanılmak üzere, aşağıda
kimlik bilgileri yazılı kişinin 2018-2024 dönemine ait hizmet ve prim
ödeme kayıtlarının bir örneğinin acilen Müşavirliğimize gönderilmesi
hususunu rica ederim.

İlgili Kişi: Hasan Aydın
Kurum Sicil No: 2026/2210
1. Hukuk Müşaviri
e-imza`,
  },
  {
    id: "gorus_mutalaa",
    label: "Görüş / Mütalaa",
    icon: "scale",
    grup: "Kurum",
    aciklama: "Hukuki mütalaa talebi (4734 doğrudan temin) → Hukuk Müşavirliği",
    text: `T.C.
SANAYİ VE TEKNOLOJİ BAKANLIĞI
Strateji Geliştirme Başkanlığı

Sayı : E-31204765-045-2026/0987
Tarih: 27.05.2026
Konu : Doğrudan temin sınırı hakkında hukuki mütalaa talebi

4734 sayılı Kanun'un 22. maddesi kapsamında yıl içinde yapılan doğrudan
temin alımlarında parasal sınırın hesaplanmasına ilişkin tereddüt
oluşmuştur. Konuya dair hukuki görüş ve mütalaanızın bildirilmesini
arz ederim.

Birim Amiri
Mali Hizmetler Uzmanı
e-imza`,
  },
  {
    id: "genelge_talimat_olur",
    label: "Genelge / Olur",
    icon: "landmark",
    grup: "Kurum",
    aciklama: "Kurum içi genelge / makam oluru → Yazı İşleri / üst yönetim",
    text: `T.C.
GENÇLİK VE SPOR BAKANLIĞI
Personel Genel Müdürlüğü

Sayı : E-55012398-010.06-2026/0033
Tarih: 12.06.2026
Konu : Mesai saatleri düzenlemesi (Genelge)

Yaz dönemi çalışma saatlerine ilişkin olarak, taşra teşkilatında mesai
başlangıç ve bitiş saatlerinin aşağıdaki şekilde uygulanması ve konunun
tüm birimlere duyurulması hususunda;

Olur'larınıza arz ederim.

Genel Müdür
e-imza`,
  },

  // ---------- Hukuk / mali (PII: IBAN maskeleme; SLA tanımsız) ----------
  {
    id: "tebligat",
    label: "Tebligat",
    icon: "mail",
    grup: "Hukuk/Mali",
    aciklama: "7201 sayılı Kanun — yıkım kararı bildirimi → Hukuk Müşavirliği",
    text: `T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞI
İmar ve Şehircilik Müdürlüğü

Sayı : E-88451203-755-2026/0421
Tarih: 22.06.2026
Konu : Ruhsatsız yapı hakkında yıkım kararının tebliği

7201 sayılı Tebligat Kanunu hükümleri uyarınca, aşağıda kimlik bilgileri
yazılı ilgiliye, ruhsatsız yapının 3194 sayılı İmar Kanunu m.32 gereği
yıkımına ilişkin Encümen kararı işbu yazı ile tebliğ edilir. Karara karşı
idari yargıda dava açma süresi tebliğ tarihinden itibaren başlar.

İlgili: Fatma Şahin
Karar No: 2026/0421
Belediye Başkanı a.
Müdür
e-imza`,
  },
  {
    id: "icra_evraki",
    label: "İcra / Haciz (IBAN)",
    icon: "receipt",
    grup: "Hukuk/Mali",
    aciklama: "2004 İcra ve İflas Kanunu — ödeme emri + IBAN maskeleme · 10 yıl saklama",
    text: `T.C.
ANKARA 14. İCRA DAİRESİ

Sayı : 2026/3344 E.
Tarih: 30.05.2026
Konu : Ödeme emri ve haciz ihbarnamesi

İlamsız icra takibi kapsamında, aşağıda bilgileri yazılı borçluya işbu
ödeme emri tebliğ olunur. Borca ve takibe itiraz süresi tebliğ tarihinden
itibaren 7 gündür. Süresinde ödeme yapılmaması halinde belirtilen banka
hesabı üzerine haciz işlemi başlatılacaktır.

Borçlu: Kemal Öztürk
Dosya No: 2026/3344
IBAN: TR00 0000 0000 0000 0000 0000 00
Telefon: 0555 987 65 43
İcra Müdürü
e-imza`,
  },
  {
    id: "dava_evraki",
    label: "Dava Evrakı (mahkeme)",
    icon: "scale",
    grup: "Hukuk/Mali",
    aciklama: "İdari yargı — mahkeme ara kararı / savunma istemi → Hukuk Müşavirliği",
    text: `T.C.
ANKARA 5. İDARE MAHKEMESİ

Esas No : 2026/1789
Tarih: 04.06.2026
Konu : Savunma ve işlem dosyası istemi

Mahkememizde görülmekte olan iptal davasında, dava konusu idari işleme
ilişkin tüm bilgi ve belgeler ile idarenin savunmasının, tebliğ tarihinden
itibaren 30 gün içinde Mahkememize gönderilmesi hususu 2577 sayılı Kanun
uyarınca rica olunur.

Davacı: Örnek Yapı A.Ş. vekili
Yazı İşleri Müdürü
e-imza`,
  },
  {
    id: "fatura",
    label: "Fatura / Ödeme (IBAN)",
    icon: "card",
    grup: "Hukuk/Mali",
    aciklama: "Mal/hizmet bedeli ödemesi + IBAN maskeleme → Mali İşler",
    text: `T.C.
GAZİ ÜNİVERSİTESİ REKTÖRLÜĞÜ
Strateji Geliştirme Daire Başkanlığına

Sayı : E-15903742-841-2026/1156
Tarih: 14.06.2026
Konu : Kırtasiye malzemesi alımı fatura bedelinin ödenmesi

İdaremiz birimlerinin ihtiyacı için piyasadan temin edilen kırtasiye
malzemelerine ilişkin ekte sunulan faturaya istinaden, 24.750,00 TL
tutarındaki bedelin firmanın hesabına ödenmesi (tahakkuk ettirilmesi)
hususunda gereğini arz ederim.

Firma: Örnek Kırtasiye Ltd. Şti.
Fatura No: ORN2026000158
IBAN: TR12 3456 7890 1234 5678 9012 34
Birim Amiri
e-imza`,
  },

  // ---------- Diğer / abstention (belirsiz → düşük güven / soru) ----------
  {
    id: "rapor",
    label: "İnceleme Raporu",
    icon: "file",
    grup: "Kurum",
    aciklama: "Denetim/inceleme raporu → ilgili birim (SLA tanımsız)",
    text: `T.C.
TARIM VE ORMAN BAKANLIĞI
İl Müdürlüğü — İnceleme Heyeti

Sayı : E-40317295-260-2026/0512
Tarih: 20.06.2026
Konu : Yerinde inceleme raporu

İlçemizde faaliyet gösteren tesise ilişkin şikâyet üzerine yapılan yerinde
incelemede, atık yönetimi kayıtlarının eksik tutulduğu tespit edilmiştir.
Tespit edilen eksikliklerin giderilmesi için ilgili birime bildirim yapılması
uygun görülmüştür. İş bu rapor üç nüsha düzenlenmiştir.

Heyet Başkanı
Ziraat Mühendisi
e-imza`,
  },
  {
    id: "belirsiz",
    label: "Belirsiz İçerik",
    icon: "alert",
    grup: "Kurum",
    aciklama: "Muğlak/eksik içerik → sistem 'belirsiz' der (abstention testi)",
    text: `Merhaba,

Geçen hafta konuştuğumuz konuyla ilgili olarak, sizden bir an önce dönüş
bekliyorum. Gerekli evrağı ilettiğimi düşünüyorum, ancak emin değilim.
Uygun olduğunuzda ilgilenebilirseniz sevinirim.

Teşekkürler.`,
  },
];
