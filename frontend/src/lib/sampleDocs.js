/* Denenebilir örnek evrak metinleri — backend OCR'sız JSON yolu (/process_doc) için.
   TÜMÜ SAHTE veri (CLAUDE.md §2 / şartname §6.5): isim/TCKN/telefon/IBAN uydurma; gerçek
   kişi veya kurumla eşleşmez. Format 2646 sayılı Yönetmelik'e göre gerçekçi, içerik %100
   kurgudur. "Gerçek dilekçe şablonlarından uyarlanmış" işaretli örnekler (aşağıda ayrı
   bölümde), kamuya açık dilekçe-örneği/hukuk sitelerindeki BOŞ ŞABLON metinlerin (ad/TCKN/
   adres alanları zaten doldurulmamış) gövde diline ve yapısına dayanır — kaynakta gerçek
   kişiye ait doldurulmuş bir dilekçe YOKTU; tüm kimlik alanları buradan itibaren kurgu.

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
    konu: "Çukur onarımı, su faturası itirazı ve iş başvurusu hk.",
    label: "Çok-Konulu Dilekçe",
    icon: "route",
    grup: "Vatandaş",
    aciklama: "İçinde üç ayrı talep var: çukur onarımı, su faturası itirazı ve iş başvurusu takibi",
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
    konu: "Park aydınlatma direği onarım talebi",
    label: "Dilekçe (süre içinde)",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Başvuru eksiksiz görünüyor, cevabi yazı bekleniyor",
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
    konu: "İşyeri açma ve çalışma ruhsatı başvurusu",
    label: "İşyeri Ruhsat Başvurusu",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Yeni işyeri için ruhsat başvurusu, ekleri tam",
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
    konu: "2025 yılı yapı ruhsatı istatistikleri bilgi talebi",
    label: "Bilgi Edinme (süresi geçti)",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "4982 kapsamında yazılı bilgi istiyor",
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
    konu: "Temizlik araçlarının sabah gürültüsü şikâyeti",
    label: "Şikâyet (eksik bilgi)",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "İmza ve iletişim bilgisi eksik görünüyor",
    text: `Belediyeye bağlı temizlik araçları sabahın çok erken saatlerinde yüksek
sesle çalışıp mahalleliyi rahatsız etmektedir. Bu durumdan dolayı şikâyetçiyim.
Gereken işlemin yapılmasını istiyorum.`,
  },
  {
    id: "ihbar",
    konu: "Ruhsatsız yapı ihbarı (Şenlik Mahallesi)",
    label: "Kaçak Yapı İhbarı",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Komşu parselde ruhsatsız kat çıkıldığı bildiriliyor, yerinde bakılmalı",
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
    konu: "Personel yıllık izin talebi",
    label: "İzin Talebi (süresi geçti)",
    icon: "file",
    grup: "Kurum",
    aciklama: "Memur 14 gün yıllık izin istiyor",
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
    konu: "CİMER başvurusu (toplu taşıma sefer sıklığı)",
    label: "CİMER Başvurusu",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "CİMER'den düştü; akşam otobüs seferlerinin artırılması isteniyor",
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

  // ---------- Gerçek dilekçe şablonlarından uyarlanmış (bkz. dosya başı not) ----------
  {
    id: "sikayet_gurultu",
    konu: "Gece çalışan işyeri gürültü şikâyeti",
    label: "Gürültü Şikâyeti",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Gece çalışan işyerinden gürültü şikâyeti, tekrar eden başvuru",
    text: `T.C.
BAĞCILAR BELEDİYE BAŞKANLIĞINA
İSTANBUL

Tarih: 11.07.2026
Konu: Gürültü kirliliği şikâyeti

İkamet ettiğim binanın alt katında faaliyet gösteren eğlence mekânından
kaynaklanan aşırı ve sürekli gürültü nedeniyle özellikle gece saatlerinde
huzursuzluk yaşamaktayım. Mekân işletmecisi defalarca sözlü olarak
uyarılmasına rağmen gürültü seviyesi düşürülmemiştir. 2872 sayılı Çevre
Kanunu ve Gürültü Kontrol Yönetmeliği kapsamında gerekli gürültü ölçümünün
yapılarak yasal işlem başlatılmasını talep ederim.

Adı Soyadı: Hüseyin Arslan
T.C. Kimlik No: 32165498770
Adres: Yıldıztepe Mahallesi, Papatya Sokak No: 14/3, Bağcılar / İSTANBUL
Telefon: 0555 234 56 78
İmza`,
  },
  {
    id: "talep_yol_tamiri",
    konu: "Asfalt ve kaldırım yenileme talebi",
    label: "Yol / Kaldırım Tamiri Talebi",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Mahalle muhtarı asfalt ve kaldırım yenileme istiyor",
    text: `T.C.
ODUNPAZARI BELEDİYE BAŞKANLIĞINA
Fen İşleri Müdürlüğüne
ESKİŞEHİR

Tarih: 08.07.2026
Konu: Yol ve kaldırım yapımı talebi

Belediyenizin hizmet bölgesinde bulunan sokakta ikamet etmekteyim.
Sokağımızın asfalt yüzeyi ve kaldırımları; yapılan altyapı çalışmaları,
iklim şartları ve araç trafiği nedeniyle büyük ölçüde yıpranmış olup
araç ve yaya geçiş güvenliğini tehlikeye sokmaktadır. Belediyenizin
hizmet planlaması dahilinde sokağımızdaki yol ve kaldırım yüzeyinin
yenilenmesi hususunda gereğinin yapılmasını arz ve talep ederim.

Adı Soyadı: Burak Şen
T.C. Kimlik No: 65498712330
Adres: Cumhuriyet Mahallesi, Menekşe Sokak No: 22, Odunpazarı / ESKİŞEHİR
Telefon: 0555 456 78 90
İmza`,
  },
  {
    id: "sikayet_sokak_hayvani",
    konu: "Sahipsiz hayvan bildirimi (Gül Sokak)",
    label: "Başıboş Hayvan Şikâyeti",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Sahipsiz köpekler için 5199 kapsamında önlem isteniyor",
    text: `T.C.
AKDENİZ BELEDİYE BAŞKANLIĞINA
Veteriner İşleri Müdürlüğüne
MERSİN

Tarih: 12.07.2026
Konu: Başıboş sokak köpekleri hakkında şikâyet

Mahallemizdeki park ve sokaklarda dolaşan başıboş köpekler nedeniyle
gerek kendimiz gerekse çocuklarımız dışarıda yürümekten tedirginlik
duymaktayız. Söz konusu köpeklerin zaman zaman geçen kişilere doğru
saldırgan tavırlar sergilediği de gözlenmektedir. 5199 sayılı Hayvanları
Koruma Kanunu'nun 6. maddesi uyarınca sahipsiz hayvanların ilgili
bakımevine götürülerek gerekli sağlık ve güvenlik tedbirlerinin
alınmasını talep ederim.

Adı Soyadı: Emine Koç
T.C. Kimlik No: 74185296302
Adres: Barış Mahallesi, Leylak Sokak No: 6, Akdeniz / MERSİN
Telefon: 0555 345 67 89
İmza`,
  },
  {
    id: "talep_aydinlatma",
    konu: "Arızalı sokak aydınlatması bildirimi",
    label: "Sokak Aydınlatması Arızası",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Üç gündür yanmayan sokak lambası bildirimi",
    text: `T.C.
NİLÜFER BELEDİYE BAŞKANLIĞINA
BURSA

Tarih: 06.07.2026
Konu: Sokak aydınlatması arıza bildirimi ve talebi

İkamet ettiğim sokaktaki aydınlatma direği uzun süredir arızalı olup
akşam saatlerinden itibaren sokağımız tamamen karanlıkta kalmaktadır.
Bu durum hem yaya güvenliği hem de asayiş açısından ciddi endişe
yaratmaktadır. Söz konusu arızanın en kısa sürede giderilmesi, mümkün
değilse bölgeye yeni bir aydınlatma direği yerleştirilmesi hususunda
gereğinin yapılmasını rica ederim.

Adı Soyadı: Derya Aksoy
T.C. Kimlik No: 15975348620
Adres: Konak Mahallesi, Nilüfer Caddesi No: 31/2, Nilüfer / BURSA
Telefon: 0555 567 89 01
İmza`,
  },

  // ---------- Kurum → kurum (SLA: vatandaş süresi yok → tanımsız) ----------
  {
    id: "ust_yazi",
    konu: "Adres kayıt sistemi güncelleme çalışmaları",
    label: "Üst Yazı",
    icon: "landmark",
    grup: "Kurum",
    aciklama: "Bakanlıktan gelen adres kayıt yazısı, kayda alınacak",
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
    konu: "Sigortalılık kayıtlarının celbi müzekkeresi",
    label: "Müzekkere",
    icon: "file",
    grup: "Kurum",
    aciklama: "SGK dava dosyası için kayıt celbi istiyor",
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
    konu: "Doğrudan temin hakkında hukuki görüş istemi",
    label: "Görüş / Mütalaa",
    icon: "scale",
    grup: "Kurum",
    aciklama: "4734 sayılı Kanun kapsamında hukuki mütalaa talebi",
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
    konu: "Kurum içi genelge (makam oluru)",
    label: "Genelge / Olur",
    icon: "landmark",
    grup: "Kurum",
    aciklama: "Kurum içi genelge; makam oluru gerektirir",
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
    konu: "Yıkım kararı tebligatı",
    label: "Tebligat",
    icon: "mail",
    grup: "Hukuk/Mali",
    aciklama: "7201 sayılı Kanun kapsamında yıkım kararı tebligatı",
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
    konu: "Ödeme emri ve haciz ihbarnamesi",
    label: "İcra / Haciz (IBAN)",
    icon: "receipt",
    grup: "Hukuk/Mali",
    aciklama: "2004 sayılı İcra ve İflas Kanunu kapsamında ödeme emri; mali kayıtlar 10 yıl saklanır",
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
    konu: "İdari yargı ara kararı (savunma istemi)",
    label: "Dava Evrakı (mahkeme)",
    icon: "scale",
    grup: "Hukuk/Mali",
    aciklama: "Mahkeme savunma istiyor, süre işliyor",
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
    konu: "Mal ve hizmet bedeli ödeme talebi",
    label: "Fatura / Ödeme (IBAN)",
    icon: "card",
    grup: "Hukuk/Mali",
    aciklama: "Tedarikçi fatura bedelinin ödenmesini talep ediyor",
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
    konu: "Denetim ve inceleme raporu",
    label: "İnceleme Raporu",
    icon: "file",
    grup: "Kurum",
    aciklama: "Teftiş raporu geldi, gereği için dağıtılacak",
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
    konu: "Konusu belirsiz başvuru",
    label: "Belirsiz İçerik",
    icon: "alert",
    grup: "Kurum",
    aciklama: "İçeriği belirsiz başvuru; tür ataması memur onayına bırakılır",
    text: `Merhaba,

Geçen hafta konuştuğumuz konuyla ilgili olarak, sizden bir an önce dönüş
bekliyorum. Gerekli evrağı ilettiğimi düşünüyorum, ancak emin değilim.
Uygun olduğunuzda ilgilenebilirseniz sevinirim.

Teşekkürler.`,
  },
];
