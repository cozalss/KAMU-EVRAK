// Standalone landing içeriği — kamu-evrak (TEKNOFEST 2026, 1. Senaryo).
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
// Etiketler doğrulanmış sayılara dayanır. Görseller placeholder.
export const PROJECTS = [
  {
    title: "Oku & Sınıflandır",
    tags: ["OCR", "18 Evrak Türü"],
    image: "/portfolio/proje-1.webp",
  },
  {
    title: "Bilgi Çıkar & Eksik Tespit",
    tags: ["Bilgi Çıkarımı", "PII Maskeleme"],
    image: "/portfolio/proje-2.webp",
  },
  {
    title: "Mevzuat Önerisi (RAG)",
    tags: ["BM25 Hibrit", "233 Mevzuat"],
    image: "/portfolio/proje-3.webp",
  },
  {
    title: "Resmî Yazı & Havale",
    tags: ["6 Şablon", "9 Birim"],
    image: "/portfolio/proje-4.webp",
  },
];

// SSS — soru + cevap. Cevaplar gerçek koddan/dokümandan doğrulandı.
export const FAQS = [
  {
    q: "Sistem hangi evrak türlerini işleyebiliyor?",
    a: "OCR ile dijital/taranmış PDF, görsel ve Word belgelerini okur; dilekçe, şikâyet, CİMER, tebligat, dava evrakı gibi 18 evrak türünü otomatik sınıflandırır.",
  },
  {
    q: "Mevzuat önerileri nasıl üretiliyor?",
    a: "233 mevzuat / 1506 madde korpusu üzerinde BM25 tabanlı hibrit arama ile ilgili maddeler getirilir. Uydurma madde verilmez; şüpheli atıf doğrulama için işaretlenir.",
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
    a: "Aynı hat üç modda çalışır: mock (anahtarsız/CI), bulut (DeepSeek, ~$0.001/belge) ve on-prem. Tüm kararlar SHA-256 hash-zinciriyle denetlenebilir kaydedilir.",
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
