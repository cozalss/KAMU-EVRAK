# DETSİS Web Servis Erişimi — Başvuru Rehberi

> **Neden gerekiyor:** Sistem 4.066 kurumu tanıyor ama kurumların **iç birimlerini**
> bilmiyor (ölçüm: kurumların %86'sında yalnız "kurum tipi şablonu" ile öneri
> üretilebiliyor — `scripts/eval_havale_yetenegi.py`). DETSİS, tüm kamu kurumlarının
> birim hiyerarşisini resmî olarak tutar; erişim açılırsa bu boşluk tek seferde kapanır.
>
> **Neden kendimiz indiremiyoruz:** `detsis.gov.tr/robots.txt` otomatik erişimi
> yasaklıyor (`Disallow: /`, yalnız 6 tanıtım sayfası açık). Resmî yol, kurumun
> yazılı talebiyle web servis yetkisi almaktır.

## 1. Kim başvurur

Üniversite (danışman hoca üzerinden **Genel Sekreterlik / Bilgi İşlem Daire Başkanlığı**).
Yükseköğretim kurumlarının DETSİS işlemleri **YÖK Yayın ve Dokümantasyon Dairesi**
tarafından Cumhurbaşkanlığı ile koordine edilir.

- İlk temas: **dokuman@yok.gov.tr**
- Sistem: **https://detsis.gov.tr**

## 2. Sorulacak iki soru (önce e-posta, sonra resmî yazı)

1. DETSİS **web servis** erişimi için başvuru hangi makama, hangi form/dilekçeyle yapılır?
2. Web servisi **tüm kurumların** teşkilat ağacını mı, yoksa yalnız **başvuran kurumun**
   ağacını mı döndürür? *(Bu bizim için belirleyici: bize ülke geneli ağaç lazım.)*

> İkinci soru kritik — cevabı "yalnız kendi kurumu" ise bu yol bizim sorunumuzu çözmez,
> plan değişir. Kod yazmadan önce bunun netleşmesi gerekir.

## 3. Resmî yazı taslağı

> Aşağıdaki metin, üniversitenin kendi antetli yazısına uyarlanmak üzere taslaktır.
> Kurum adı, tarih, sayı ve imza bilgileri kurum tarafından doldurulur.

---

**Konu:** DETSİS Web Servis Erişim Talebi

İlgi: —

Üniversitemiz bünyesinde yürütülen **TEKNOFEST 2026 Türkçe Doğal Dil İşleme Yarışması,
1. Senaryo (Kamu Evrak ve Yazışma Süreçleri için Akıllı Ajan Destek Sistemi)** kapsamında,
kamu kurumlarına yapılan başvuru ve yazışmaların **doğru birime havale edilmesini** sağlayan
bir karar-destek yazılımı geliştirilmektedir.

Sistemin havale önerisi üretebilmesi için kamu kurumlarının **güncel teşkilat (birim)
yapısına** ihtiyaç duyulmaktadır. Bu bilginin resmî ve güncel kaynağı Devlet Teşkilatı
Merkezi Kayıt Sistemi'dir (DETSİS).

Bu çerçevede;

1. DETSİS **web servisi** üzerinden kurum ve birim hiyerarşisi verisine erişim yetkisi
   verilmesi,
2. Erişimin kapsamı (tüm kurumlar / yalnız kurumumuz) ile teknik bağlantı bilgilerinin
   (servis adresi, kimlik doğrulama yöntemi, kullanım koşulları) tarafımıza bildirilmesi

hususlarında gereğini arz ederim.

**Taahhüt:** Elde edilecek veri yalnızca anılan yarışma projesinin **birim yönlendirme**
işlevinde kullanılacak; üçüncü taraflarla paylaşılmayacak, ticari amaçla kullanılmayacak
ve kurumun belirleyeceği kullanım koşullarına uyulacaktır. Proje kapsamında **gerçek kişi
verisi işlenmemekte**, yalnızca sentetik/kurgu evrak kullanılmaktadır.

---

## 4. Erişim geldiğinde yazılıma nasıl bağlanır

Yetki geldiğinde geliştiriciye verilmesi gerekenler:

| Ne | Nereye |
|---|---|
| Servis adresi (URL / WSDL) | `.env` → `DETSIS_SERVIS_URL` |
| Kimlik bilgisi (anahtar/kullanıcı-parola) | `.env` → `DETSIS_ANAHTAR` — **sohbete/kod deposuna yazılmaz** |
| Örnek yanıt (1 kurum, birimleriyle) | `data/teskilat/girdi/detsis_ornek.json` |
| Kullanım koşulları / kota | bu dosyaya not düşülür |

Örnek yanıt **şart**: ayrıştırıcı ona göre yazılır. Tek bir kurumun (ör. bir üniversite
veya bir il müdürlüğü) tam birim ağacını içeren bir yanıt yeterlidir.

## 5. Erişim gelmezse — yedek plan

- **Elle doğrulama:** demo için 5-10 kurum insan gözüyle DETSİS'ten okunup
  `scripts/kaynak_kaydet.py` ile hash-kilitli kaydedilir (otomatik havale bu kurumlarda açılır).
- **Kurum kendi sitesi:** kurumların kendi "teşkilat şeması / hizmet envanteri"
  sayfalarından okuma (her sitenin kendi `robots.txt` kuralına uyularak).
