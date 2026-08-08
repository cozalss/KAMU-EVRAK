import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
/* ÇALIŞMA ALANI (app.html) Tailwind yapılandırması — landing'inkinden AYRI.
 *
 * NEDEN AYRI DOSYA: landing (index.html) kendi `tailwind.config.js`'ini kullanır ve içeriği
 * yalnız `src/portfolio/**`. Tek config paylaşılsaydı Tailwind her iki CSS çıktısına da
 * HER İKİ tarafın utility'lerini üretirdi; landing'in 12 kB'lık CSS'i çalışma alanının
 * sınıflarıyla şişerdi. Tailwind 3.2+ `@config` direktifi CSS-dosyası-başına config
 * seçmeyi mümkün kılıyor (kurulu sürüm: 3.4.19) — izolasyon buradan gelir.
 * Bkz. src/styles/app-tailwind.css.
 *
 * TEK PALET SÖZLEŞMESİ — BU DOSYANIN ASIL İŞİ BUDUR:
 * Çalışma alanı bugüne dek satır-içi stille ve `neonUi.jsx` token'larıyla boyandı. Stilli
 * kütüphane (shadcn/Aceternity) sınıfla boyar. İki mekanizma AYRI renk kaynağından
 * beslenirse site yamalı bohçaya döner ve koyu tema ikisinden yalnız birinde çalışır.
 * Bu yüzden buradaki renklerin HİÇBİRİ ham hex DEĞİL, hepsi `var(--ke-*)`:
 * THEME_CSS'in ta kendisi. Açık/koyu geçişi, AA türevleri, tint oranı — hepsi tek yerde
 * kalır. Yeni bir renk gerekiyorsa önce THEME_CSS'e token olarak eklenir, buraya değil.
 *
 * OPAKLIK MODIFIER'I (`text-ink/60`) — `sr()` sarmalıyla ÇALIŞIR.
 * Tailwind, opaklık modifier'ı için normalde rengin KANALLARINA ihtiyaç duyar; `var(--x)`
 * tek parça hex olduğundan bu mümkün değil. Çözüm `color-mix`: `<alpha-value>` yer tutucusu
 * modifier'lı yazımda oranı, modifier'sız yazımda 1'i alır — iki durumda da geçerli CSS çıkar.
 * 57 token'ı kanal üçlüsüne (`22 22 22`) çevirmek de bir seçenekti; REDDEDİLDİ: THEME_CSS'in
 * tamamını yeniden yazmak koyu tema v3'ün ölçülmüş yüzey merdivenini ve `surfPop`/`alfa`/
 * `sh-*` sözleşmelerini riske atardı. Proje zaten `ALFA()` ve `::selection`'da color-mix
 * kullanıyor — yeni bağımlılık gelmiyor.
 *
 * ZATEN ALFALI token'lar (line, hov, press, cam, scrim, inputLine, surfHi, onInk2…)
 * SARILMAZ: içi içe alfa çarpımı olur ve o yüzeyler beklenenden soluk çıkar.
 */

/** Saydamlığa açılabilen (opak) token — Tailwind opaklık modifier'ıyla çalışır. */
const sr = (token) =>
  `color-mix(in srgb, var(${token}) calc(<alpha-value> * 100%), transparent)`;

export default {
  // app.html + çalışma alanı kaynakları. src/portfolio BİLEREK dışarıda: landing'in
  // sınıfları bu çıktıya sızmamalı (ve tersi).
  content: [
    "./app.html",
    "./src/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/lib/**/*.{js,jsx}",
    "./src/hooks/**/*.{js,jsx}",
    "./src/agent-flow/**/*.{js,jsx}",
  ],
  // Koyu tema `document.documentElement`'e data-theme="dark" yazılarak açılıyor.
  // Renkler zaten var() üzerinden moda göre değiştiği için `dark:` çoğu yerde GEREKMEZ;
  // yalnız yapısal farklar (ör. koyu modda ışıkla yükseklik) için tutuluyor.
  darkMode: ["selector", '[data-theme="dark"]'],
  // RESET KAPALI — ama app-tailwind.css'teki `@tailwind base` satırı DURUYOR. İkisi ayrı
  // şeydir: bu bayrak preflight'ı (genel sıfırlama) kapatır, base direktifi ise `--tw-*`
  // varsayılanlarını basar. Direktifi silerek reset'ten kurtulmaya çalışmak, shadow/ring/
  // scale/blur/gradient utility'lerini sessizce öldürüyordu. Ayrıntı: app-tailwind.css.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Zeminler ve yüzeyler (yüzey merdiveni — koyu modda ışıkla yükseklik)
        bg: sr("--ke-bg"),
        bg2: sr("--ke-bg2"),
        surf: sr("--ke-surf"),
        surf2: sr("--ke-surf2"),
        surfPop: sr("--ke-surf-pop"),
        surfHi: "var(--ke-surf-hi)",      // zaten alfalı — sarma
        cam: "var(--ke-cam)",             // zaten alfalı — sarma
        camLine: "var(--ke-cam-line)",    // zaten alfalı — sarma
        // Metin kademeleri
        ink: sr("--ke-ink"),
        ink2: sr("--ke-ink2"),
        inkSurf: sr("--ke-ink-surf"),
        mut: sr("--ke-mut"),
        mut2: sr("--ke-mut2"),
        mut3: sr("--ke-mut3"),
        onAccent: sr("--ke-on-accent"),
        onInk: sr("--ke-on-ink"),
        onInk2: "var(--ke-on-ink-2)",     // zaten alfalı — sarma
        // Çizgiler ve etkileşim
        line: "var(--ke-line)",
        lineHi: "var(--ke-line-hi)",
        inputLine: "var(--ke-input-line)",
        hov: "var(--ke-hov)",
        press: "var(--ke-press)",
        scrim: "var(--ke-scrim)",
        scrimKoyu: "var(--ke-scrim-koyu)",
        // Aksanlar — HAM aksan METİN rengi OLAMAZ (T ≈3.2:1). Metinde `derin-*` kullanılır.
        t: sr("--ke-t"),
        v: sr("--ke-v"),
        r: sr("--ke-r"),
        derin: {
          t: sr("--ke-derin-t"),
          th: sr("--ke-derin-th"),
          v: sr("--ke-derin-v"),
          r: sr("--ke-derin-r"),
          yesil: sr("--ke-derin-yesil"),
          sari: sr("--ke-derin-sari"),
          kirmizi: sr("--ke-derin-kirmizi"),
        },
        // Risk bandı — renk TEK sinyal değildir; ikon/etiketle birlikte kullanılır.
        bant: {
          yesil: sr("--ke-bant-yesil"),
          sari: sr("--ke-bant-sari"),
          kirmizi: sr("--ke-bant-kirmizi"),
        },
        /* ——— shadcn/ui KÖPRÜSÜ ———
           shadcn bileşenleri kendi anlamsal token adlarını kullanır (bg-card,
           text-muted-foreground, border-input…). Bunlar TANIMSIZ kalırsa bileşenler
           renksiz/şeffaf çıkar. Burada hepsi projenin --ke-* token'larına bağlanıyor:
           tek palet sözleşmesi böylece `npx shadcn add` ile gelecek YENİ bileşenler için
           de kendiliğinden geçerli olur — bileşen dosyalarını elle düzeltmek gerekmez.
           Eşleme ANLAMA göre yapıldı, isim benzerliğine değil. */
        background: sr("--ke-bg"),
        foreground: sr("--ke-ink"),
        card: { DEFAULT: sr("--ke-surf"), foreground: sr("--ke-ink") },
        popover: { DEFAULT: sr("--ke-surf-pop"), foreground: sr("--ke-ink") },
        // primary = birincil buton dolgusu. HAM aksan DEĞİL `derin-t`: ham T açık zeminde
        // ~3.2:1 ve üstündeki metin AA'yı geçmez (projenin Btn primary deseni de böyle).
        primary: { DEFAULT: sr("--ke-derin-t"), foreground: sr("--ke-on-accent") },
        secondary: { DEFAULT: sr("--ke-bg2"), foreground: sr("--ke-ink2") },
        muted: { DEFAULT: "var(--ke-hov)", foreground: sr("--ke-mut") },
        accent: { DEFAULT: "var(--ke-hov)", foreground: sr("--ke-ink") },
        // destructive-foreground: on-accent DEĞİL on-ink. on-accent tema-tersine akar ve
        // koyu modda kırmızı dolgu üstünde metin kayboluyordu (2026-07 bulgusu); on-ink
        // her iki temada da açık kalır.
        destructive: { DEFAULT: sr("--ke-bant-kirmizi"), foreground: sr("--ke-on-ink") },
        border: "var(--ke-line)",
        input: "var(--ke-input-line)",
        ring: sr("--ke-derin-t"),
        // Iris: sıralı pastel rampa (süre/hız göstergeleri). *k = kenar (WCAG 1.4.11 için ŞART).
        iris: {
          1: "var(--ke-iris-1)", "1b": "var(--ke-iris-1b)", "1k": "var(--ke-iris-1k)",
          2: "var(--ke-iris-2)", "2b": "var(--ke-iris-2b)", "2k": "var(--ke-iris-2k)",
          3: "var(--ke-iris-3)", "3b": "var(--ke-iris-3b)", "3k": "var(--ke-iris-3k)",
        },
      },
      // neonUi.RAD ile birebir — serbest radius yazılmaz.
      borderRadius: {
        chip: "4px",
        ctl: "6px",
        card: "8px",
        pop: "12px",
      },
      // neonUi.SP ile birebir — serbest boşluk yazılmaz.
      spacing: {
        xs: "4px", s: "8px", m: "12px", l: "16px", xl: "24px", xxl: "32px", xxxl: "48px",
      },
      // neonUi.SH ile birebir; koyu modda kendi zanaatını taşır (var üzerinden).
      boxShadow: {
        // DEFAULT: shadcn bileşenleri çıplak `shadow` yazıyor. Tailwind'in kendi gölgesi
        // yerine projenin yükseklik merdivenine bağlanır — koyu modda ışıkla yükseklik
        // sözleşmesi (v3 "Mürekkep Gecesi") shadcn kartlarında da geçerli olsun.
        DEFAULT: "var(--ke-sh-card)",
        card: "var(--ke-sh-card)",
        pop: "var(--ke-sh-pop)",
        modal: "var(--ke-sh-modal)",
      },
      // app.html'in yüklediği fontlar. DISPLAY ayrı değil: başlıklar sistem fontu.
      fontFamily: {
        sans: ['"Source Sans 3"', "Segoe UI", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      // Yerleşik ease-* zayıf; projenin ölçülmüş eğrileri kullanılır (neonUi.EASE).
      transitionTimingFunction: {
        out: "var(--ke-ease-out)",
        inOut: "var(--ke-ease-in-out)",
        spring: "var(--ke-ease-spring)",
      },
    },
  },
  // tailwindcss-animate ZORUNLU: shadcn'in dialog/dropdown/tooltip/popover açılış-kapanış
  // sınıfları (.animate-in / .fade-in-0 / .zoom-in-95 / .slide-in-from-top-2) YALNIZ bu
  // eklentiyle üretilir. Bağlanmazsa bileşenler çalışır ama "zıplayarak" açılır — sessiz
  // kusur (ölçüldü: eklenti bağlı değilken bu sınıflardan hiçbiri CSS'e düşmüyor).
  // NOT: `tw-animate-css` DEĞİL — o Tailwind v4 içindir; burada v3 kullanılıyor.
  plugins: [animate],
};
