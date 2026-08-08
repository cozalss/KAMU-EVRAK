/* Denenebilir örnek evrak metinleri — backend OCR'sız JSON yolu (/process_doc) için.

   TÜMÜ SAHTE veri (CLAUDE.md §2 / şartname §6.5): isim/TCKN/telefon/IBAN/e-posta uydurma,
   gerçek kişiyle eşleşmez. TCKN'ler KASITLI GEÇERSİZ desendedir (checksum tutmaz) — geçersiz
   bir numara hiçbir vatandaşa ait olamaz. Muhatap KURUMLAR gerçektir (kamuya açık teşkilat
   bilgisi); evrakların İÇERİĞİ %100 kurgudur.

   NEDEN BU 15: her örnek boru hattının FARKLI bir davranışını tetikler. Jüri dosya
   aramadan tek tıkla sistemin tüm yeteneklerini canlı görebilmeli (Demo 15p).

   ┌── KAPSAM HARİTASI (hangi örnek neyi kanıtlar) ─────────────────────────────────────┐
   │ Görev 1                                                                            │
   │   sınıflandırma      : 10 farklı tür + belirsiz → abstention (#15)                 │
   │   bilgi çıkarımı+PII : TCKN (#2,#9) · telefon (çoğu) · e-posta (#7,#8) · IBAN (#14)│
   │   eksik bilgi+clarify: #6 (zorunlu alan yok → dur-ve-sor)                          │
   │   mevzuat RAG        : 3071 · 4982 · 3194 · 2872 · 657 · 7201 · 2004 · 4734        │
   │                        (sekizi de data/mevzuat korpusunda DOĞRULANDI)              │
   │ Görev 2                                                                            │
   │   yazı taslağı       : cevabi_yazi · üst yazı · bilgilendirme · müzekkere          │
   │   birim yönlendirme  : üç GÜVEN SEVİYESİ birden — aşağıya bak                      │
   │ Yenilikçilik                                                                       │
   │   decompose          : #1 → tek dilekçe, üç ayrı iş, üç ayrı birim                 │
   │   canlı kaynak keşfi : #2 → korpusta OLMAYAN kurum, sistem sitesini canlı bulur ⭐ │
   │   yetkisizlik/devir  : #10 → muhatap ≠ yetkili (3071 m.5)                          │
   │   SLA bantları       : NORMAL ×4 · KRİTİK ×2 · GECİKMİŞ ×3 · tarih_yok ×1 · tanımsız ×5 │
   └────────────────────────────────────────────────────────────────────────────────────┘

   ÜÇ GÜVEN SEVİYESİ (demo'nun dürüstlük iddiası — ölçülerek seçildi 2026-08-06):
     YEŞİL  "kaynak doğrulandı" → kurumun kendi teşkilat kaydı manifest+SHA-256'lı
            (#3 Seyhan · #4 Pendik · #5 Van BB · #8 Kadıköy · #9 Nilüfer)
     YEŞİL  mevzuat şablonu → tür için kanunen zorunlu birim (#11 valilik · #12 kaymakamlık)
     SARI   canlı kaynak → korpusta yok; kurumun sitesi çalışma anında bulundu (#2)
   Muhataplar bu tabloya göre SEÇİLDİ; değiştirilirse demo iddiası bozulur.

   SLA TARİHLERİ BUGÜNE GÖRE AYARLIDIR (referans: 06.08.2026). Süre tabloları:
   30 takvim günü (3071 m.7) · 15 iş günü (4982 m.11). Aylar geçtikçe bantlar KAYAR —
   demo öncesi `backend/agents/nodes/sla_triyaj.compute_sla` ile yeniden doğrulayın.
     30 gün: 27.07 → NORMAL · 08.07 → KRİTİK · 02.07 → GECİKMİŞ
     15 iş  : 17.07 → KRİTİK · 09.07 → GECİKMİŞ

   SÖZLEŞME: `tur ?? id` kanonik EVRAK_TURLERI değeri olmalı (SLA + kategori bununla
   çalışır) — sampleDocs.test.js bunu kilitler. */

export const SAMPLE_DOCS = [
  // ══════════ VİTRİN 1: çok-konulu dilekçe → decompose (tek evrak, üç iş) ══════════
  {
    id: "cok_konulu",
    konu: "Park aydınlatması, su faturası itirazı ve iş başvurusu takibi hk.",
    label: "Çok-Konulu Dilekçe",
    icon: "route",
    grup: "Vatandaş",
    aciklama: "Tek dilekçede üç ayrı talep — sistem ayrıştırıp üç farklı birime dağıtır",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 27.07.2026
Konu: Çeşitli talepler hk.

Sayın Yetkili,

Birinci olarak, mahallemizdeki Barış Parkı'nın yürüyüş yolundaki aydınlatma
direklerinden dördü yaklaşık iki aydır yanmamaktadır. Akşam saatlerinde park
kullanılamaz hâle gelmiş, özellikle yaşlı komşularımız için güvenlik sorunu
oluşmuştur. Onarımının yapılmasını talep ediyorum.

İkinci olarak, Haziran 2026 dönemine ait su faturam bir önceki dönemin yaklaşık
dört katı tahakkuk etmiştir. Konutta sızıntı veya tesisat arızası bulunmadığı
tesisatçı raporuyla belgelenmiştir. Sayaç okumasının kontrol edilerek hatalı
tahakkuka itirazımın değerlendirilmesini ve faturanın düzeltilmesini istiyorum.

Üçüncü olarak, oğlum Kerem Aydın'ın Başkanlığınıza yaptığı şoför kadrosu iş
başvurusunun hangi aşamada olduğu konusunda tarafıma bilgi verilmesini rica
ediyorum.

Gereğini bilgilerinize arz ederim.

Adı Soyadı: Ayşe Yılmaz
T.C. Kimlik No: 12345678901
Adres: Kırkkonaklar Mahallesi, Barış Sokak No: 14/6, Çankaya / ANKARA
Telefon: 0555 123 45 67
İmza`,
  },

  // ══════════ VİTRİN 2: korpusta OLMAYAN kurum → CANLI KAYNAK KEŞFİ ⭐ ══════════
  {
    id: "dilekce",
    konu: "Ambulans ulaşım sürelerinin iyileştirilmesi talebi",
    label: "Dilekçe — Canlı Kaynak Keşfi ⭐",
    icon: "pencil",
    grup: "Vatandaş",
    aciklama: "Bu kurumun doğrulanmış teşkilat kaydı YOK; sistem kurumun resmî sitesini canlı bulup birim önerir",
    text: `T.C.
KONYA İL SAĞLIK MÜDÜRLÜĞÜNE
KONYA

Tarih: 27.07.2026
Konu: Acil sağlık hizmetlerinde ulaşım süresi hk.

Sayın Yetkili,

Selçuklu ilçesi Sille Mahallesi'nde ikamet etmekteyim. Son üç ay içinde
mahallemizden 112 Acil Çağrı Merkezine yapılan çağrılarda ambulansın olay
yerine ulaşma süresinin otuz dakikayı aştığı üç ayrı olaya bizzat şahit oldum.
Bunlardan biri kalp rahatsızlığı geçiren komşumuz için yapılan çağrıdır.

Mahallemize hizmet veren acil sağlık hizmetleri istasyonunun kapasitesinin ve
görevli ambulans sayısının yeterli olup olmadığının incelenmesini, gecikmelerin
sebebine ilişkin tarafıma yazılı bilgi verilmesini arz ederim.

Adı Soyadı: Hatice Aydın
T.C. Kimlik No: 98765432109
Adres: Sille Mahallesi, Şehit Er Sokak No: 12/4, Selçuklu / KONYA
Telefon: 0555 246 81 03
İmza`,
  },

  // ══════════ Vatandaş → belediye: DOĞRULANMIŞ birim kaydı olan kurumlar ══════════
  {
    id: "sikayet_gurultu",
    tur: "sikayet",   // id benzersiz anahtar; SLA/kategori GEÇERLİ türü ister (test kilitler)
    konu: "Gece çalışan işyeri kaynaklı gürültü şikâyeti",
    label: "Gürültü Şikâyeti",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Çevresel gürültü — 2872 s. Çevre Kanunu; ölçüm yetkisi uzman birimde",
    text: `T.C.
SEYHAN BELEDİYE BAŞKANLIĞINA
ADANA

Tarih: 21.07.2026
Konu: İşyeri kaynaklı gürültü şikâyeti

Sayın Yetkili,

Apartmanımızın zemin katında faaliyet gösteren kafeterya, hafta sonları saat
02.00'ye kadar açık havada canlı müzik yayını yapmaktadır. Ses seviyesi
pencereler kapalıyken dahi konuşmayı güçleştirecek düzeydedir. Binada üç
öğrenci ve iki küçük çocuk bulunmaktadır.

Anılan işyerinin ruhsatında canlı müzik izni bulunup bulunmadığının kontrol
edilmesini, 2872 sayılı Çevre Kanunu kapsamında gürültü ölçümü yapılmasını ve
sonucuna göre gerekli yasal işlemin tesis edilmesini şikâyeten arz ederim.

Adı Soyadı: Emre Şahin
Adres: Reşatbey Mahallesi, Atatürk Caddesi No: 47/3, Seyhan / ADANA
Telefon: 0555 318 24 76
E-posta: emre.sahin@ornekmail.com
İmza`,
  },
  {
    id: "ihbar",
    konu: "Ruhsatsız yapı ihbarı (Kurtköy Mahallesi)",
    label: "Kaçak Yapı İhbarı",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "3194 s. İmar Kanunu — yerinde denetim ve yapı tatil tutanağı gerektirir",
    text: `T.C.
PENDİK BELEDİYE BAŞKANLIĞINA
İSTANBUL

Tarih: 30.07.2026
Konu: Ruhsatsız yapılaşma ihbarı

Sayın Yetkili,

Kurtköy Mahallesi Çınar Sokak üzerinde bulunan komşu parselde, yaklaşık üç
haftadır gece saatlerinde de devam eden bir inşaat faaliyeti bulunmaktadır.
Mevcut iki katlı binanın üzerine ilave kat çıkıldığı, şantiye alanında ruhsat
levhası bulunmadığı gözlenmektedir.

3194 sayılı İmar Kanunu kapsamında söz konusu yapının ruhsat durumunun yerinde
denetlenmesini, ruhsatsız veya ruhsata aykırı olduğunun tespiti hâlinde gerekli
yasal işlemin başlatılmasını ihbar ve talep ederim.

Adı Soyadı: Zeynep Kaya
Adres: Kurtköy Mahallesi, Çınar Sokak No: 9, Pendik / İSTANBUL
Telefon: 0555 444 55 66
İmza`,
  },
  {
    id: "talep_ulasim",
    tur: "talep",
    konu: "Toplu taşıma hattı güzergâh ve sefer talebi",
    label: "Ulaşım Hattı Talebi (KRİTİK süre)",
    icon: "route",
    grup: "Vatandaş",
    aciklama: "Büyükşehir — yasal cevap süresinin son günlerinde",
    text: `T.C.
VAN BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA
VAN

Tarih: 08.07.2026
Konu: Toplu taşıma sefer sıklığı ve güzergâh talebi

Sayın Yetkili,

İpekyolu ilçesi Şerefiye Mahallesi ile şehir merkezi arasında çalışan otobüs
hattının akşam 19.00'dan sonraki sefer aralığı kırk beş dakikaya çıkmaktadır.
Mahallemizde vardiyalı çalışan çok sayıda vatandaş bulunmakta, bu kişiler işten
çıkış saatlerinde uzun süre beklemek zorunda kalmaktadır.

Anılan hattın akşam sefer sıklığının artırılmasını, mümkünse güzergâhın Şerefiye
Mahallesi içindeki iki durağı kapsayacak şekilde düzenlenmesini talep ederim.
Konuya ilişkin değerlendirmenin tarafıma bildirilmesini arz ederim.

Adı Soyadı: Murat Çelik
Adres: Şerefiye Mahallesi, Vali Konağı Caddesi No: 22, İpekyolu / VAN
Telefon: 0555 432 19 87
İmza`,
  },
  {
    id: "sikayet",
    konu: "Temizlik araçlarının erken saat gürültüsü (eksik bilgi)",
    label: "Şikâyet — Eksik Bilgi",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Muhatap, tarih, kimlik ve iletişim YOK — sistem körlemesine yazı üretmeyip soru sorar",
    text: `Belediyeye bağlı çöp toplama araçları sabah saat 05.00 civarında sokağa
girmekte, konteyner boşaltma sırasında çıkan ses tüm apartmanı uyandırmaktadır.
Bu durumdan uzun süredir rahatsızız.

Çalışma saatlerinin makul bir vakte alınmasını istiyorum. Gereğinin yapılmasını
bekliyorum.`,
  },
  {
    id: "bilgi_edinme",
    konu: "2025 yılı yapı ruhsatı istatistikleri bilgi talebi",
    label: "Bilgi Edinme (süresi GEÇTİ)",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "4982 s.K. m.11 — 15 iş günü doldu; sistem gecikmeyi kırmızı işaretler",
    text: `T.C.
ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞINA
ANKARA

Tarih: 09.07.2026
Konu: 4982 sayılı Kanun kapsamında bilgi talebi

Sayın Yetkili,

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, 2025 yılı içinde Ankara ili
genelinde düzenlenen yapı ruhsatı sayısının ilçe bazında dağılımı ile bu
ruhsatlara konu toplam inşaat alanının (m²) tarafıma yazılı olarak verilmesini
talep ederim.

Talebimin akademik bir çalışmada kullanılacağını, kişisel veri içermeyen
toplulaştırılmış verinin yeterli olduğunu belirtirim.

Adı Soyadı: Mehmet Demir
Adres: Bahçelievler Mahallesi, 7. Cadde No: 3/8, Çankaya / ANKARA
E-posta: mehmet.demir@ornekmail.com
Telefon: 0555 907 46 12
İmza`,
  },
  {
    id: "cimer",
    konu: "CİMER — pazar yeri hijyen ve denetim talebi",
    label: "CİMER Başvurusu (KRİTİK süre)",
    icon: "search",
    grup: "Vatandaş",
    aciklama: "CİMER'den düşen başvuru; yasal cevap süresinin son günü",
    text: `CİMER — Cumhurbaşkanlığı İletişim Merkezi
Başvuru Türü: Şikâyet / Talep
Başvuru No: 2026-CMR-4471829

Tarih: 08.07.2026
Konu: Semt pazarı hijyen koşulları ve denetim talebi

İlgili Kurum: Kadıköy Belediye Başkanlığı

Salı günleri kurulan semt pazarında, pazar dağıldıktan sonra atıkların uzun süre
kaldırılmadığı, özellikle yaz aylarında ciddi koku ve sinek sorunu oluştuğu
gözlenmektedir. Ayrıca gıda satışı yapılan bazı tezgâhlarda soğuk zincir
koşullarının sağlanmadığı izlenimi edinilmiştir.

Pazar sonrası temizlik programının gözden geçirilmesini, gıda tezgâhlarının
hijyen yönünden denetlenmesini ve yapılan işlem hakkında tarafıma bilgi
verilmesini talep ederim.

Adı Soyadı: Ali Vural
Telefon: 0555 777 88 99
E-posta: ali.vural@ornekmail.com`,
  },
  {
    id: "basvuru",
    konu: "İşyeri açma ve çalışma ruhsatı başvurusu",
    label: "İşyeri Ruhsat Başvurusu",
    icon: "doc",
    grup: "Vatandaş",
    aciklama: "Ekleri tam görünen başvuru — sistem eksik alan bulamayınca yeşil geçer",
    text: `T.C.
NİLÜFER BELEDİYE BAŞKANLIĞINA
BURSA

Tarih: 27.07.2026
Konu: İşyeri açma ve çalışma ruhsatı başvurusu

Sayın Yetkili,

İlçeniz sınırları içinde, aşağıda adresi belirtilen taşınmazda kırtasiye ve
fotokopi işletmesi açmayı planlamaktayım. İşyeri açma ve çalışma ruhsatının
düzenlenmesi için gereğini arz ederim.

Adı Soyadı: Selin Arslan
T.C. Kimlik No: 45678912303
İşyeri Adresi: Ertuğrul Mahallesi, Nilüfer Caddesi No: 15/A, Nilüfer / BURSA
Vergi Dairesi / No: Nilüfer VD - 4567891230
Telefon: 0555 321 76 54
E-posta: selin.arslan@ornekmail.com

EKLER:
1- Kira sözleşmesi örneği (2 sayfa)
2- Vergi levhası fotokopisi (1 sayfa)
3- Yapı kullanma izin belgesi fotokopisi (1 sayfa)
4- İtfaiye raporu (1 sayfa)

İmza`,
  },

  // ══════════ VİTRİN 3: muhatap ≠ yetkili → YETKİSİZLİK / DEVİR (3071 m.5) ══════════
  {
    id: "dilekce_aydinlatma",
    tur: "dilekce",
    konu: "Sokak aydınlatması arızası (yetkili kurum ayrımı)",
    label: "Aydınlatma Arızası — Yetkisizlik ⭐",
    icon: "alert",
    grup: "Vatandaş",
    aciklama: "Belediyeye yazılmış, ancak genel aydınlatma dağıtım şirketinin görevi — devir yazısı gerekir",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 02.07.2026
Konu: Sokak aydınlatması arızası hk.

Sayın Yetkili,

İkamet ettiğim Aşağı Öveçler Mahallesi 1312. Sokak üzerindeki elektrik
direklerine bağlı sokak aydınlatma armatürlerinden altı tanesi yaklaşık bir
aydır yanmamaktadır. Sokak akşam saatlerinde tamamen karanlık kalmakta, yaya
geçişi güvenli olmaktan çıkmaktadır.

Arızanın giderilmesi için gereğinin yapılmasını, işlem yetkisinin başka bir
kurumda olması hâlinde dilekçemin ilgili kuruma iletilerek tarafıma bilgi
verilmesini arz ederim.

Adı Soyadı: Fatma Öztürk
Adres: Aşağı Öveçler Mahallesi, 1312. Sokak No: 8/5, Çankaya / ANKARA
Telefon: 0555 654 32 10
İmza`,
  },

  // ══════════ Kurum içi / kurum → kurum (SLA: vatandaş süresi yok → tanımsız) ══════════
  {
    id: "talep",
    konu: "Personel yıllık izin talebi",
    label: "Memur İzin Talebi (süresi GEÇTİ)",
    icon: "clock",
    grup: "Kurum",
    aciklama: "657 s.K. kapsamında memur izni — sistem doğru mevzuat rejimini seçmeli (4857 değil)",
    text: `T.C.
KAYSERİ VALİLİĞİNE
(İl Yazı İşleri Müdürlüğü)

Tarih: 02.07.2026
Konu: Yıllık izin talebi

Valiliğiniz bünyesinde Veri Hazırlama ve Kontrol İşletmeni olarak görev
yapmaktayım. 657 sayılı Devlet Memurları Kanununun 102 nci maddesi uyarınca hak
etmiş olduğum yıllık iznimin 17.08.2026 - 31.08.2026 tarihleri arasında (14 gün)
kullandırılması hususunda;

Gereğini arz ederim.

Adı Soyadı: Elif Doğan
Sicil No: 2026/5541
Unvan: Veri Hazırlama ve Kontrol İşletmeni
Birim: İl Yazı İşleri Müdürlüğü
İmza`,
  },
  {
    id: "ust_yazi",
    konu: "Muhtarlık ödeneği ödemelerine ilişkin veri talebi",
    label: "Üst Yazı (Valilik → Kaymakamlık)",
    icon: "send",
    grup: "Kurum",
    aciklama: "Kurumdan kuruma resmî yazı — 2646 formatı, üst makamdan geldiği için 'rica ederim'",
    text: `T.C.
KÜTAHYA VALİLİĞİ
İl Yazı İşleri Müdürlüğü

Sayı : E-15784236-045.03-2026/1187
Konu : Muhtarlık ödeneği ödemeleri

TAVŞANLI KAYMAKAMLIĞINA

İlgi : Bakanlığımız İller İdaresi Genel Müdürlüğünün 24.07.2026 tarihli ve
       E-89451236-045.03-2026/4412 sayılı yazısı.

İlgi yazı ile İlimiz genelinde 2026 yılı ikinci üç aylık döneminde muhtarlara
yapılan ödenek ödemelerine ilişkin bilgilerin derlenmesi istenilmektedir.

Bu kapsamda; İlçeniz sınırları içindeki mahalle ve köy muhtarlıklarına anılan
dönemde yapılan ödeme tutarlarının, ödeme tarihlerinin ve varsa ödenememiş
muhtarlık sayısının ekli çizelgeye işlenerek 20.08.2026 tarihine kadar
Müdürlüğümüze gönderilmesi hususunda;

Gereğini rica ederim.

                                                        Ahmet KILIÇ
                                                        Vali a.
                                                        İl Yazı İşleri Müdürü

EK: Ödeme bilgi çizelgesi (1 sayfa)`,
  },
  {
    id: "muzekkere",
    konu: "Hizmet alımı ihalesi öncesi hukuki değerlendirme",
    label: "Müzekkere (birimler arası)",
    icon: "scale",
    grup: "Kurum",
    aciklama: "Birimden birime iç yazışma — 4734 s. Kamu İhale Kanunu değerlendirmesi isteniyor",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞI
Destek Hizmetleri Müdürlüğü

Sayı : E-77451298-934.02-2026/318
Konu : Personel taşıma hizmeti alımı hk.

HUKUK İŞLERİ MÜDÜRLÜĞÜNE

İlgi : Başkanlık Makamının 28.07.2026 tarihli ve 2026/216 sayılı Olur'u.

Müdürlüğümüzce 2027 yılı personel taşıma hizmeti alımı için ihale hazırlıkları
yürütülmektedir. Hazırlanan teknik şartname taslağında, yüklenicinin araç
filosunun azami yaşına ve sürücülerin mesleki yeterlilik belgesine ilişkin
kriterler öngörülmüştür.

Söz konusu kriterlerin 4734 sayılı Kamu İhale Kanunu ile ikincil mevzuatı
karşısında rekabeti engelleyici nitelik taşıyıp taşımadığı hususunda
Müdürlüğünüz görüşünün bildirilmesini;

Rica ederim.

                                                        Burak TEKİN
                                                        Destek Hizmetleri Müdürü

EK: Teknik şartname taslağı (6 sayfa)`,
  },

  // ══════════ Hukuk / mali — PII: IBAN maskeleme; SLA tanımsız ══════════
  {
    id: "icra_evraki",
    konu: "İcra dairesi maaş haczi müzekkeresi",
    label: "İcra Müzekkeresi (IBAN maskeleme)",
    icon: "scale",
    grup: "Hukuk/Mali",
    aciklama: "2004 s. İcra ve İflas Kanunu — IBAN ve borçlu bilgisi maskelenmeli",
    text: `T.C.
ANKARA 12. İCRA DAİRESİ

Dosya No : 2026/8847 E.
Konu     : Maaş haczi müzekkeresi

ÇANKAYA BELEDİYE BAŞKANLIĞINA

Dairemizin yukarıda numarası yazılı dosyasından, aşağıda kimlik bilgileri
belirtilen borçlu hakkında yürütülen takip kesinleşmiştir.

2004 sayılı İcra ve İflas Kanununun 355 inci maddesi uyarınca; borçlunun
kurumunuzdan almakta olduğu maaş ve diğer ödemelerinin haczi ile kesilecek
tutarın aşağıdaki hesaba yatırılması, borçlunun kurumunuzdaki görevinden
ayrılması hâlinde durumun derhâl Dairemize bildirilmesi hususunda gereği rica
olunur.

Borçlu           : Kemal Yıldırım
T.C. Kimlik No   : 32165498701
Alacaklı         : Örnek Finans A.Ş.
Takip Tutarı     : 47.850,00 TL
Ödeme Hesabı     : TR33 0006 1005 1978 6457 8413 26

Tarih: 31.07.2026

                                                        İcra Müdür Yardımcısı`,
  },

  // ══════════ Abstention — sistem emin değilse EMİN DEĞİLİM demeli ══════════
  {
    id: "belirsiz",
    konu: "Tür tespiti güç, eksik metin",
    label: "Belirsiz Evrak (abstention)",
    icon: "search",
    grup: "Kurum",
    aciklama: "Ne talep ne şikâyet — sistem tahmin yürütmeyip düşük güven bildirmeli",
    text: `Ekte gönderilen listeye ilişkin olarak, daha önce görüşülen hususlar
çerçevesinde gereğinin yapılmasını,

Bilgilerinize.

EK: Liste (2 sayfa)`,
  },
];
