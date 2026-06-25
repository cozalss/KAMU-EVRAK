/* Denenebilir örnek evrak metinleri — backend OCR'sız JSON yolu (/process_doc) için.
   TÜMÜ SAHTE veri (CLAUDE.md §2): isim/TCKN/telefon uydurma; gerçek kişiyle eşleşmez.
   Demo (15p): jüri dosya bulmadan tek tıkla 9 farklı evrak türünü canlı işletir.

   Her örnek pipeline'ın farklı bir davranışını sergiler (config.EVRAK_TURLERI kapsanır):
     vatandas grubu (vatandaş→kurum):
       - dilekce:      zorunlu alan TAM → temiz cevabi yazı (PII maskeli)
       - bilgi_edinme: 4982 yolu → bilgilendirme yazısı
       - sikayet:      eksik alanlı → clarify (dur-ve-sor) soruları tetiklenir
     kurum grubu (kurum→kurum):
       - ust_yazi:     yeni yazışma, İlgi yok → Yazı İşleri/Genel Evrak
       - muzekkere:    bilgi/kayıt celbi → Hukuk Müşavirliği
       - gorus_mutalaa: hukuki mütalaa → Hukuk Müşavirliği
     hukuk/mali grubu:
       - tebligat:     7201 — yıkım kararı bildirimi → Hukuk Müşavirliği
       - icra_evraki:  haciz/ödeme emri → Hukuk Müşavirliği (10 yıl saklama)
       - fatura:       mal/hizmet bedeli ödemesi → Strateji Geliştirme/Mali İşler

   TCKN'ler kasıtlı geçersiz desen (1-9 başlar ama gerçek algoritma tutmaz).
   Sınıflandırma mock-modda keyword-heuristik ile deterministiktir (anahtarsız demo). */

export const SAMPLE_DOCS = [
  // ---------- Vatandaş → kurum ----------
  {
    id: "dilekce",
    label: "Dilekçe",
    icon: "📝",
    grup: "Vatandaş",
    aciklama: "Vatandaş talebi — zorunlu alanlar tam",
    text: `T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
ANKARA

Tarih: 12.03.2026
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
    id: "bilgi_edinme",
    label: "Bilgi Edinme",
    icon: "🔍",
    grup: "Vatandaş",
    aciklama: "4982 sayılı Kanun kapsamında başvuru",
    text: `T.C.
ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞINA

Tarih: 03.02.2026
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
    label: "Şikâyet (eksik)",
    icon: "⚠️",
    grup: "Vatandaş",
    aciklama: "Eksik alanlı — dur-ve-sor (clarify) tetiklenir",
    text: `Belediyeye bağlı temizlik araçları sabahın çok erken saatlerinde yüksek
sesle çalışıp mahalleliyi rahatsız etmektedir. Bu durumdan dolayı şikâyetçiyim.
Gereken işlemin yapılmasını istiyorum.`,
  },

  // ---------- Kurum → kurum ----------
  {
    id: "ust_yazi",
    label: "Üst Yazı",
    icon: "🏛️",
    grup: "Kurum",
    aciklama: "Kurumlar arası yeni resmî yazışma",
    text: `T.C.
İÇİŞLERİ BAKANLIĞI
Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü

Sayı : E-45678257-622.03-2026/1487
Tarih: 18.01.2026
Konu : Adres kayıt sistemi güncelleme çalışmaları

Adres Kayıt Sistemi'nde tespit edilen mükerrer kayıtların temizlenmesine
yönelik çalışmaların 2026 yılı ilk çeyreğinde tamamlanması planlanmaktadır.
Konuya ilişkin il müdürlüklerinin bilgilendirilmesi hususunda;

Gereğini rica ederim.

Dr. Selim Kaya
Genel Müdür
e-imza`,
  },
  {
    id: "muzekkere",
    label: "Müzekkere",
    icon: "📑",
    grup: "Kurum",
    aciklama: "Kurumlar arası bilgi/kayıt celbi — Hukuk Müşavirliği",
    text: `T.C.
SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI
Hukuk Müşavirliği

Sayı : E-72615498-640-2026/2210
Tarih: 09.05.2026
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
    icon: "⚖️",
    grup: "Kurum",
    aciklama: "Hukuki mütalaa talebi — Hukuk Müşavirliği",
    text: `T.C.
SANAYİ VE TEKNOLOJİ BAKANLIĞI
Strateji Geliştirme Başkanlığı

Sayı : E-31204765-045-2026/0987
Tarih: 27.03.2026
Konu : Doğrudan temin sınırı hakkında hukuki mütalaa talebi

4734 sayılı Kanun'un 22. maddesi kapsamında yıl içinde yapılan doğrudan
temin alımlarında parasal sınırın hesaplanmasına ilişkin tereddüt
oluşmuştur. Konuya dair hukuki görüş ve mütalaanızın bildirilmesini
arz ederim.

Birim Amiri
Mali Hizmetler Uzmanı
e-imza`,
  },

  // ---------- Hukuk / mali ----------
  {
    id: "tebligat",
    label: "Tebligat",
    icon: "📨",
    grup: "Hukuk/Mali",
    aciklama: "7201 sayılı Kanun — karar bildirimi → Hukuk birimi",
    text: `T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞI
İmar ve Şehircilik Müdürlüğü

Sayı : E-88451203-755-2026/0421
Tarih: 22.04.2026
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
    label: "İcra / Haciz",
    icon: "🧾",
    grup: "Hukuk/Mali",
    aciklama: "İcra ödeme emri / haciz — 10 yıl saklama",
    text: `T.C.
ANKARA 14. İCRA DAİRESİ

Sayı : 2026/3344 E.
Tarih: 30.04.2026
Konu : Ödeme emri ve haciz ihbarnamesi

İlamsız icra takibi kapsamında, aşağıda bilgileri yazılı borçluya işbu
ödeme emri tebliğ olunur. Borca ve takibe itiraz süresi tebliğ tarihinden
itibaren 7 gündür. Süresinde ödeme yapılmaması halinde maaş ve banka
hesapları üzerine haciz işlemi başlatılacaktır.

Borçlu: Kemal Öztürk
Dosya No: 2026/3344
Adres: Yenimahalle, Çiçek Sokak No: 11, ANKARA
Telefon: 0555 987 65 43
İcra Müdürü
e-imza`,
  },
  {
    id: "fatura",
    label: "Fatura / Ödeme",
    icon: "💳",
    grup: "Hukuk/Mali",
    aciklama: "Mal/hizmet bedeli ödemesi → Mali İşler",
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
Birim Amiri
e-imza`,
  },
];

export default SAMPLE_DOCS;
