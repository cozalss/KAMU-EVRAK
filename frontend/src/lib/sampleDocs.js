/* Denenebilir örnek evrak metinleri — backend OCR'sız JSON yolu (/process_doc) için.
   TÜMÜ SAHTE veri (CLAUDE.md §2): isim/TCKN/telefon uydurma; gerçek kişiyle eşleşmez.
   Demo (15p): jüri dosya bulmadan tek tıkla 5 farklı evrak türünü canlı işletir.

   Her örnek pipeline'ın farklı bir davranışını sergiler:
     - dilekce:      zorunlu alan TAM → temiz cevabi yazı
     - bilgi_edinme: 4982 yolu → bilgilendirme yazısı
     - ust_yazi:     kurum→kurum resmî yazı (vatandaş PII'siz)
     - tebligat:     hukuk müşavirliğine havale
     - sikayet:      eksik alanlı → clarify soruları tetiklenir
   TCKN'ler kasıtlı geçersiz desen (1-9 başlar ama gerçek algoritma tutmaz). */

export const SAMPLE_DOCS = [
  {
    id: "dilekce",
    label: "Dilekçe",
    icon: "📝",
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
    aciklama: "4982 sayılı Kanun kapsamında başvuru",
    text: `T.C.
ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞINA

Tarih: 03.02.2026
Konu: 4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında bilgi talebi

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, ilçemizde 2025 yılında
verilen yapı ruhsatı sayısı ve toplam inşaat alanına ilişkin bilgilerin
tarafıma yazılı olarak verilmesini talep ederim.

Adı Soyadı: Mehmet Demir
T.C. Kimlik No: 98765432109
E-posta: mehmet.demir@ornekmail.com
Adres: Bahçelievler Mahallesi, 7. Sokak No: 3, Bahçelievler / İSTANBUL
İmza`,
  },
  {
    id: "ust_yazi",
    label: "Üst Yazı",
    icon: "🏛️",
    aciklama: "Kurumlar arası resmî yazışma",
    text: `T.C.
İÇİŞLERİ BAKANLIĞI
Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü

Sayı : E-45678257-622.03-2026/1487
Tarih: 18.01.2026
Konu : Adres kayıt sistemi güncelleme çalışmaları

İlgi : a) 05.01.2026 tarihli ve 1102 sayılı yazı.

Adres Kayıt Sistemi'nde tespit edilen mükerrer kayıtların temizlenmesine
yönelik çalışmaların 2026 yılı ilk çeyreğinde tamamlanması planlanmaktadır.
Konuya ilişkin il müdürlüklerinin bilgilendirilmesi hususunda;

Gereğini rica ederim.

Dr. Selim Kaya
Genel Müdür
e-imza`,
  },
  {
    id: "tebligat",
    label: "Tebligat",
    icon: "📨",
    aciklama: "7201 sayılı Kanun — hukuk birimine havale",
    text: `T.C.
ANKARA 14. İCRA DAİRESİ

Sayı : 2026/3344 E.
Tarih: 22.04.2026
Konu : Ödeme emri tebligatı

7201 sayılı Tebligat Kanunu hükümleri uyarınca, aşağıda kimlik bilgileri
yazılı borçluya işbu ödeme emrinin tebliği rica olunur. Borca itiraz süresi
tebliğ tarihinden itibaren 7 gündür.

Borçlu: Fatma Şahin
Dosya No: 2026/3344
Adres: Yenimahalle, Çiçek Sokak No: 11, ANKARA
İcra Müdürü
e-imza`,
  },
  {
    id: "sikayet",
    label: "Şikâyet (eksik)",
    icon: "⚠️",
    aciklama: "Eksik alanlı — takip soruları tetiklenir",
    text: `Belediyeye bağlı temizlik araçları sabahın çok erken saatlerinde yüksek
sesle çalışıp mahalleliyi rahatsız etmektedir. Bu durumdan dolayı şikâyetçiyim.
Gereken işlemin yapılmasını istiyorum.`,
  },
];

export default SAMPLE_DOCS;
