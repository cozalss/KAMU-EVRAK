// Standalone landing içeriği — kamu-evrak.
// Tüm sayılar/iddialar gerçek kaynak dosyalardan doğrulandı (backend/agents,
// data/, retrieval/, eval/, docs/). Uydurma mevzuat maddesi / gerçek PII yok.
// Görseller placeholder; sahip ileride değiştirecek.

// Çalışma alanı (auth → dashboard) entry'si. Landing'deki "Giriş Yap"/CTA'lar
// buraya gider; anon kullanıcı AuthPage (giriş) görür, giriş sonrası Dashboard.
// Kökten sunulur. Alt-path'e (örn. /kamu-evrak/) deploy edilirse vite `base`
// ayarlanmalı ve burası `${base}app.html` yapılmalı.
export const APP_URL = "/app.html";

export const NAV_LINKS = [
  { label: "Ana Sayfa", href: "#home" },
  { label: "Hakkında", href: "#about" },
  { label: "Yetenekler", href: "#projects" },
  { label: "İletişim", href: "#contact" },
];

// Pipeline yetenekleri (Görev 1 → Görev 2) — sticky-stacked kartlar.
// Etiketler doğrulanmış sayılara dayanır. Görseller GERÇEK uygulama ekran
// görüntüleridir (public/portfolio/app-*.png — çalışma alanından çekildi).
export const PROJECTS = [
  {
    title: "Komuta Paneli",
    tags: ["Canlı Metrikler", "Yasal Süre Takibi"],
    image: "/portfolio/app-panel.png",
  },
  {
    title: "Oku & Sınıflandır",
    tags: ["OCR", "19 Evrak Türü"],
    image: "/portfolio/app-gelen-evrak.png",
  },
  {
    title: "Bilgi Çıkar & Eksik Tespit",
    tags: ["Bilgi Çıkarımı", "PII Maskeleme"],
    image: "/portfolio/app-ayrintili-sonuc.png",
  },
  {
    title: "Mevzuat Önerisi",
    tags: ["Akıllı Arama", "304 Mevzuat"],
    image: "/portfolio/app-mevzuat.png",
  },
  {
    title: "Resmî Yazı & Havale",
    tags: ["6 Şablon", "9 Birim"],
    image: "/portfolio/app-taslak.png",
  },
  {
    title: "Giden Evrak & Denetim İzi",
    tags: ["SHA-256 Zincir", "Karar Memurda"],
    image: "/portfolio/app-giden-evrak.png",
  },
];

// SSS — soru + cevap. Cevaplar gerçek koddan/dokümandan doğrulandı.
export const FAQS = [
  {
    q: "Sistem hangi evrak türlerini işleyebiliyor?",
    a: "OCR ile dijital/taranmış PDF, görsel ve Word belgelerini okur; dilekçe, şikâyet, CİMER, tebligat, dava evrakı gibi 19 evrak türünü otomatik sınıflandırır; emin olamadığı durumları da 'belirsiz' olarak işaretleyip insana bırakır.",
  },
  {
    q: "Mevzuat önerileri nasıl üretiliyor?",
    a: "304 mevzuat / 1916 madde içeren veri tabanı üzerinde akıllı arama ile ilgili maddeler getirilir. Uydurma madde verilmez; şüpheli atıf doğrulama için işaretlenir.",
  },
  {
    q: "Resmî yazı taslağını kim hazırlıyor?",
    a: "Resmî Yazışma Yönetmeliği'ne (2646/2020) uygun 6 şablon — üst, cevabi, bilgilendirme, olur, müzekkere, görüş — ile taslak üretir ve 9 birimden doğrusuna yönlendirir.",
  },
  {
    q: "Kişisel veriler (PII) nasıl korunuyor?",
    a: "TCKN, telefon ve IBAN gibi unsurlar buluta gitmeden maskelenir. İstenirse tüm model on-prem (yerel) çalışır; veri kurumdan hiç çıkmaz.",
  },
  {
    q: "Çıktılar güvenilir mi, halüsinasyon riski var mı?",
    a: "Deterministik 'uydurma veto' ve doğrulama düğümü, kaynakta olmayan tarih/sayı/kurumu engeller; ölçülen yanlış-pozitif (false-veto) oranı 0. Her çıktı risk bandıyla (🟢🟡🔴) işaretlenir.",
  },
  {
    q: "Maliyet ve çalışma modu nedir?",
    a: "Aynı sistem üç modda çalışır: anahtarsız/test modu, bulut (DeepSeek, ~$0.001/belge) ve kurum-içi (on-prem) mod. Tüm kararlar değiştirilemez şekilde kaydedilir ve sonradan denetlenebilir.",
  },
];

// Gerçek teknoloji yığını — 12 hücre (2 satır x 6). Tamamı doğrulandı.
export const BRANDS = [
  "FastAPI",
  "LangGraph",
  "DeepSeek",
  "RapidOCR",
  "pypdfium2",
  "BM25",
  "BGE-M3",
  "Jinja2",
  "ReportLab",
  "React",
  "Vite",
  "Tailwind",
];
