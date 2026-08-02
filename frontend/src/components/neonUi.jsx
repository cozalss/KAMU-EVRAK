/* neonUi — kamu-evrak çalışma alanı paylaşılan tasarım atomları ("Hero Light v2 · Sakin Ürün").
   Palet herodan (frontend/public/portfolio/hero.webp) türetilmiş sıcak fildişi + gök mavisi /
   lavanta / mercan — hex'ler v1 ile bit-aynı. v2 (2026-07-02) dekorasyon dilini söker:
   border-first yüzey (gölge yalnız havada duran katman), düz dolgular (gradyan/glow yok),
   sentence case, mono yalnız makine verisi, 7 kademeli tip ölçeği (TYPE), 4+nokta radius (RAD),
   7 adımlı boşluk (SP). Spec: design-system/kamu-evrak/MASTER.md. Satır-içi stil; tek <style>
   yalnız @keyframes. a11y: focusRing + SR_ONLY + semantik. */
import React from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import {
  LayoutGrid, Inbox, FileText, BookOpen, ShieldCheck, Upload, Smartphone, Plus, ArrowRight,
  Pencil, Send, BarChart3, Clock, Scale, Route, Info, Check, X, TriangleAlert, Mic, Sparkles, Undo2, Search,
  AudioLines, MicOff, CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react";

export const MONO = "'IBM Plex Mono',ui-monospace,monospace";
// Gövde + UI fontu: Source Sans 3 (kullanıcı tercihi, 2026-07-17) — latin-ext (ç/ş/ğ/İ tam),
// app.html'de variable font olarak tek dosya iner. İnmezse Segoe UI (Windows sistem) fallback.
export const SANS = "'Source Sans 3','Segoe UI',system-ui,sans-serif";
/* DISPLAY: başlık katmanı da Segoe UI (kullanıcı tercihi, 2026-07-17) — tüm arayüz tek
   ailede. Token korunur (TYPE.h1/disp fontFamily: DISPLAY) ki ileride ayrı bir başlık
   fontu istenirse tek yerden değişsin; şu an değeri SANS ile birebir aynıdır. */
export const DISPLAY = "'Segoe UI',system-ui,sans-serif";
/* V (Görev 2 semantiği): lavanta → MÜHÜR moru (2026-07 revizyonu). Pastel "AI moru"ndan
   çıkış; ıstampa/mühür mürekkebi — resmî evrak dünyasının kendi rengi. Radix ruby/plum
   koyuluğunda; ivory zeminde dolgu 6.3:1, DERIN.V metin 8.3:1 (AA). */
/* Renk token'ları CSS custom property üzerinden okunur (bkz. THEME_CSS altta) — açık/koyu
   mod aynı JS sabitleriyle çalışır, yalnız kök elemandaki [data-theme] değeri değişir. */
export const T = "var(--ke-t)", V = "var(--ke-v)", R = "var(--ke-r)";
export const PAL = {
  bg: "var(--ke-bg)", bg2: "var(--ke-bg2)", surf: "var(--ke-surf)", surf2: "var(--ke-surf2)", surfHi: "var(--ke-surf-hi)",
  line: "var(--ke-line)", lineHi: "var(--ke-line-hi)",
  ink: "var(--ke-ink)", ink2: "var(--ke-ink2)", mut: "var(--ke-mut)", mut2: "var(--ke-mut2)", mut3: "var(--ke-mut3)",
  hov: "var(--ke-hov)", press: "var(--ke-press)",
  inputLine: "var(--ke-input-line)", onAccent: "var(--ke-on-accent)", onInk: "var(--ke-on-ink)", inkSurf: "var(--ke-ink-surf)",
  scrim: "var(--ke-scrim)",
};
export const BANT = {
  yesil: { c: "var(--ke-bant-yesil)", l: "YEŞİL", t: "Düşük risk" },
  sari: { c: "var(--ke-bant-sari)", l: "SARI", t: "Orta risk" },
  kirmizi: { c: "var(--ke-bant-kirmizi)", l: "KIRMIZI", t: "Yüksek risk" },
};

/* CAM — yarı saydam "buzlu cam" yüzey (2026-07-25, kullanıcı isteği: takvim kartı).
   Hero Light'ın VARSAYILANI hâlâ opak PAL.surf'tür; CAM istisna bir ikincil yüzeydir,
   yeni varsayılan değil — genel kartlara yayma. İki parçası var:
   · bg  — beyazı kırıp zemin sıcaklığını (PAL.bg) yüzeye taşır. Asıl görsel kazanç budur.
   · blur — arkasında DESEN olan yerde iş görür; düz zemin üstünde ölçülebilir etkisi yoktur
            (düz rengin bulanığı yine aynı düz renktir). Kartın kaydırılan içeriğin üstüne
            geldiği hâller için bırakıldı, bedeli yok.
   Kenarlık ayrı token (cam-line): opak çizgi saydam yüzeyde sert bir çerçeve gibi okunuyordu. */
export const CAM = { bg: "var(--ke-cam)", line: "var(--ke-cam-line)", blur: "blur(14px)" };

/* IRIS — SIRALI (sequential) pastel "hologram" rampası (2026-07-25, kullanıcı isteği).
   NEDEN VAR: süre bar grafiği yeşil→sarı→kırmızı kullanıyordu. Kırmızı-yeşil en yaygın
   renk körlüğü çiftidir (deuteran/protan; erkeklerin ~%8'i) ve orada hue TEK ayırt edici
   sinyaldi — erişilebilirlik açığı.
   ÇÖZÜM: kategorik değil SIRALI rampa. Süre zaten ordinal bir büyüklük; sıralı paletin
   kuralı bilgiyi hue'ya değil AÇIKLIĞA yüklemektir. Üç adımın açıklığı monoton azalır
   (gök mavisi → lavanta → pudra gülü), böylece sıralama gri tonlamada, her CVD tipinde ve
   düşük parlaklıkta da okunur. Hue yalnız ikinci katman.
   Hue seçimi landing hero'sunun pastel gökyüzünden (CLAUDE.md: hero.webp) türer.
   BANT (yeşil/sarı/kırmızı) DEĞİŞMEDİ — o, risk bandının hukuki sözlüğü ve her yerde
   metin etiketiyle birlikte anılıyor (renk tek sinyal değil). IRIS yalnız süre ölçeğidir. */
export const IRIS = {
  hizli: { c: "var(--ke-iris-1)", ust: "var(--ke-iris-1b)", kenar: "var(--ke-iris-1k)", l: "hızlı" },
  orta: { c: "var(--ke-iris-2)", ust: "var(--ke-iris-2b)", kenar: "var(--ke-iris-2k)", l: "orta" },
  yavas: { c: "var(--ke-iris-3)", ust: "var(--ke-iris-3b)", kenar: "var(--ke-iris-3k)", l: "yavaş" },
};
/* Hologram dolgusu — adımın açık ucundan koyu ucuna eğik geçiş. MASTER.md'nin "gradyan yok"
   kuralına SINIRLI istisna (kullanıcı isteği): yalnız süre barları; metin/yüzey/buton
   gradyanı hâlâ yasak. Geçiş TEK hue içinde kalır — yanardöner parlama verir ama ikinci bir
   renk sokmadığı için adımlar arası okuma bozulmaz.
   Kenarla birlikte kullanılmalı (bkz. IRIS_BAR): pastel dolgu tek başına 1.4.11'i geçmez. */
export const IRIS_DOLGU = (k) => {
  const a = IRIS[k] || IRIS.orta;
  return `linear-gradient(170deg, ${a.ust} 0%, ${a.c} 78%)`;
};
/* Bar stili — dolgu + kenar birlikte. Çağıran yerlerde ikisini ayrı yazmak, birinin
   unutulmasına ve kontrast açığına yol açıyordu; tek çağrıda veriliyor. */
export const IRIS_BAR = (k) => ({
  background: IRIS_DOLGU(k),
  border: `1px solid ${(IRIS[k] || IRIS.orta).kenar}`,
});

/* Açık zemin üstünde AA kontrastlı metin/dolgu türevleri — ham T/V/R/BANT.c açık zeminde
   metin rengi OLAMAZ (T ≈3.2:1). Th = primary buton hover'ı. Koyu modda THEME_CSS ayrı
   AA-güvenli değer taşır (T/PAL ile aynı var() deseni). */
export const DERIN = {
  T: "var(--ke-derin-t)", Th: "var(--ke-derin-th)", V: "var(--ke-derin-v)", R: "var(--ke-derin-r)",
  yesil: "var(--ke-derin-yesil)", sari: "var(--ke-derin-sari)", kirmizi: "var(--ke-derin-kirmizi)",
};
/* Ham aksan → AA metin türevi eşlemesi (bilinmeyen renk aynen döner). */
export const DERIN_OF = (c) => ({
  [T]: DERIN.T, [V]: DERIN.V, [R]: DERIN.R,
  [BANT.yesil.c]: DERIN.yesil, [BANT.sari.c]: DERIN.sari, [BANT.kirmizi.c]: DERIN.kirmizi,
}[c] || c);
/* Tek izinli alfa eki: %8 tint zemin (çip/seçili durum). color-mix — hex ve var() girdisiyle
   aynı çalışır (eski hex+"14" eki var() dizgesinde kırılırdı). Başka alfa-yapıştırma yok. */
export const ALFA = (c) => `color-mix(in srgb, ${c} 8%, transparent)`;

/* Açık/koyu mod değerleri — kök [data-theme] ile seçilir (main.jsx Root ayarlar; kalıcı
   tercih localStorage "ke-tema", yoksa OS prefers-color-scheme). Hex YALNIZ burada yazılır;
   PAL/T/V/R/BANT/DERIN hep var() üzerinden okur — görünüm dosyaları hiç değişmeden iki modda
   da çalışır. */
export const THEME_CSS = `
:root{
  color-scheme:light;
  --ke-t:#2f8fa6; --ke-v:#8e3d66; --ke-r:#e0563c;
  --ke-bg:#f7f3ee; --ke-bg2:#efe6da; --ke-surf:#ffffff; --ke-surf2:#fdfbf7; --ke-surf-hi:rgba(35,26,18,.05);
  --ke-line:rgba(35,26,18,.12); --ke-line-hi:rgba(35,26,18,.22);
  --ke-ink:#161616; --ke-ink2:#3a3229; --ke-mut:#6b6255; --ke-mut2:#57503f; --ke-mut3:#7a7060;
  --ke-hov:rgba(35,26,18,.04); --ke-press:rgba(35,26,18,.07);
  --ke-input-line:rgba(35,26,18,.35); --ke-on-accent:#fbf7f0; --ke-ink-surf:#2a251e; --ke-scrim:rgba(35,26,18,.35);
  /* cam: yarı saydam yüzey — opak beyaz yerine zeminin sıcaklığını içeri alan kart (bkz. CAM). */
  --ke-cam:rgba(255,255,255,.55); --ke-cam-line:rgba(35,26,18,.09);
  /* iris: sıralı pastel rampa (bkz. IRIS). Landing hero'sunun gökyüzünden türer:
     gök mavisi → lavanta → pudra gülü. ÖLÇÜLDÜ — bağıl parlaklık 0.560 / 0.323 / 0.178,
     komşu adım kontrastı 1.64 ve 1.64 (eşit adım): sıralama gri tonlamada da okunur.
     *b = adımın açık ucu (hologram parlaması) · *k = kenar çizgisi.
     Kenar ŞART: pastel dolgunun kremle kontrastı 1.56:1 (WCAG 1.4.11 bilgi taşıyan grafik
     için 3:1 ister); kenarlar 3.5–6.2:1 ile eşiği tek başına karşılar, dolgu pastel kalır. */
  --ke-iris-1:#93cfdd; --ke-iris-1b:#cdeef4; --ke-iris-1k:#3d8ba1;
  --ke-iris-2:#a68fd0; --ke-iris-2b:#d5c9ec; --ke-iris-2k:#6b52a0;
  --ke-iris-3:#b25878; --ke-iris-3b:#e0a0b4; --ke-iris-3k:#8f3f60;
  /* --ke-on-ink: dark modda YENİDEN TANIMLANMAZ — kasıtlı. inkSurf (toast) ve modal karartı
     (BelgeModal scrim'i) HER İKİ modda da hep koyu kalır; üstündeki metin de hep açık kalmalı.
     --ke-on-accent bunun için YANLIŞ token'dı: DERIN.*-dolgulu buton metni için tema-tersine
     akar (koyu modda karartı+onAccent ikisi de koyulaşıp metin kayboluyordu — 2026-07 bulgusu). */
  --ke-on-ink:#fbf7f0;
  --ke-shadow-rgb:35,26,18;
  /* Güçlü özel easing eğrileri (emil-design-eng) — yerleşik ease-* zayıf; mod-bağımsız (dark'ta ezilmez).
     spring: geri tepmeli (back-out) — yalnız SAHNE tamamlanma/ateşleme vuruşları. */
  --ke-ease-out:cubic-bezier(0.23,1,0.32,1); --ke-ease-in-out:cubic-bezier(0.77,0,0.175,1);
  --ke-ease-spring:cubic-bezier(0.34,1.56,0.64,1);
  --ke-bant-yesil:#2f9e6e; --ke-bant-sari:#c98a1f; --ke-bant-kirmizi:#c9432f;
  --ke-derin-t:#1f6d82; --ke-derin-th:#1a5e71; --ke-derin-v:#74304f; --ke-derin-r:#a23425;
  --ke-derin-yesil:#1f7a52; --ke-derin-sari:#8a5a10; --ke-derin-kirmizi:#a23425;
}
:root[data-theme="dark"]{
  color-scheme:dark;
  /* 2026-07 revizyonu #2: ilk düzeltme hâlâ "gri/kahverengi" okundu (kullanıcı geri
     bildirimi) — bg/bg2 neredeyse SAF SİYAHA çekildi (sıcaklık payı minimuma indi),
     surf/surf2 okunabilirlik için net bir adım yukarıda tutuldu. */
  --ke-t:#4db6cf; --ke-v:#c97fa3; --ke-r:#ff7a5c;
  --ke-bg:#050403; --ke-bg2:#000000; --ke-surf:#161310; --ke-surf2:#0b0906; --ke-surf-hi:rgba(255,255,255,.06);
  --ke-line:rgba(255,255,255,.14); --ke-line-hi:rgba(255,255,255,.24);
  --ke-ink:#f2ece0; --ke-ink2:#d6cdbc; --ke-mut:#a89d8a; --ke-mut2:#c1b7a1; --ke-mut3:#8d8370;
  --ke-hov:rgba(255,255,255,.06); --ke-press:rgba(255,255,255,.09);
  --ke-input-line:rgba(255,255,255,.32); --ke-on-accent:#050403; --ke-ink-surf:#1c1811; --ke-scrim:rgba(0,0,0,.65);
  --ke-cam:rgba(34,29,24,.55); --ke-cam-line:rgba(255,255,255,.10);
  /* Koyu modda açıklık SIRASI aynı (0.520 / 0.323 / 0.161; adım 1.53 ve 1.77) ama tüm rampa
     bir tık yukarı: en koyu adım bile zeminden 3.7:1 ayrışır. Kenarlar burada AÇIK uçtur —
     koyu zeminde koyu kenar görünmez. */
  --ke-iris-1:#7fcadd; --ke-iris-1b:#a5dcea; --ke-iris-1k:#a8e0ee;
  --ke-iris-2:#a68fd0; --ke-iris-2b:#b8a6e0; --ke-iris-2k:#c3b0e8;
  --ke-iris-3:#a85575; --ke-iris-3b:#d894ac; --ke-iris-3k:#e0a0b8;
  --ke-shadow-rgb:0,0,0;
  --ke-bant-yesil:#4cbf8a; --ke-bant-sari:#e0a83f; --ke-bant-kirmizi:#e2604a;
  --ke-derin-t:#7ecbdd; --ke-derin-th:#92d6e6; --ke-derin-v:#e2a8c4; --ke-derin-r:#ffa088;
  --ke-derin-yesil:#7ad9ae; --ke-derin-sari:#f0c168; --ke-derin-kirmizi:#f0917e;
}
`;

/* Tip ölçeği — bu tablo dışında fontSize yazılmaz. Sayısal kolonlarda TNUM eklenir. */
export const TYPE = {
  meta: { fontFamily: SANS, fontSize: 12, lineHeight: "16px", letterSpacing: ".32px" },
  data: { fontFamily: SANS, fontSize: 13, lineHeight: "18px", letterSpacing: ".16px" },
  ui: { fontFamily: SANS, fontSize: 14, lineHeight: "20px" },
  read: { fontFamily: SANS, fontSize: 16, lineHeight: "24px" },
  h2: { fontFamily: SANS, fontSize: 20, lineHeight: "26px", fontWeight: 600, letterSpacing: "-.01em" },
  num: { fontFamily: SANS, fontSize: 24, lineHeight: "28px", fontWeight: 600, letterSpacing: "-.015em", fontVariantNumeric: "tabular-nums" },
  /* h1/disp DISPLAY ailesinde (Bricolage Grotesque): görünüm başlıkları + hüküm liderleri
     karakter kazanır; UI/gövde Plex kalır. Bricolage geniş oturur → tracking hafif sıkı. */
  h1: { fontFamily: DISPLAY, fontSize: 28, lineHeight: "34px", fontWeight: 600, letterSpacing: "-.02em" },
  /* disp: tam-boy hüküm kartının lider olguları (ilk görülen ekran, 2026-07-15) — h1'in
     üstü; YALNIZ hüküm + 2 karar-kritik değer (tür, birim). Başlık/metin için kullanılmaz. */
  disp: { fontFamily: DISPLAY, fontSize: 36, lineHeight: "42px", fontWeight: 600, letterSpacing: "-.025em", fontVariantNumeric: "tabular-nums" },
};
export const TNUM = { fontVariantNumeric: "tabular-nums" };
/* Güçlü easing token'ları (emil-design-eng) — yerleşik ease-* zayıftır, "kasıtlı" hissi vermez.
   out: giriş/çıkış + press feedback (hızlı başlar, tepkisel) · inOut: ekran-içi hareket/morph.
   Hover/renk geçişleri "ease" kalır (Emil kararı). Değerler THEME_CSS'te (mod-bağımsız). */
export const EASE = { out: "var(--ke-ease-out)", inOut: "var(--ke-ease-in-out)", spring: "var(--ke-ease-spring)" };
/* EASE'in motion (framer-motion) sayısal eşleniği — CSS var() JS animasyon motoruna
   okunamaz, kübik-bezier dizisi ister. Değerler THEME_CSS'teki --ke-ease-* ile BİT-AYNI
   (tek kaynak orada); yalnız motion'ın transition.ease'i için sayısala çevrilir. */
export const EASE_BEZIER = { out: [0.23, 1, 0.32, 1], inOut: [0.77, 0, 0.175, 1], spring: [0.34, 1.56, 0.64, 1] };
/* Radius: chip=durum çipi · ctl=buton/input · card=kart/panel · pop=dropdown/modal/toast. */
export const RAD = { chip: 4, ctl: 6, card: 8, pop: 12, dot: "50%" };
/* Boşluk ölçeği — serbest değer yazılmaz. */
export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
/* Gölge yalnız havada duran katman: card=en fazla bu (opsiyonel) · pop=dropdown/tooltip · modal=modal/toast. */
export const SH = {
  card: "0 1px 2px rgba(var(--ke-shadow-rgb),.05)",
  pop: "0 4px 12px -2px rgba(var(--ke-shadow-rgb),.10), 0 1px 3px rgba(var(--ke-shadow-rgb),.05)",
  modal: "0 16px 40px -12px rgba(var(--ke-shadow-rgb),.18), 0 2px 8px rgba(var(--ke-shadow-rgb),.06)",
};

/* Yalnız KLAVYE odağında halka göster (:focus-visible) — fare tıklaması da native focus
   bıraktığı için onFocus her zaman tetiklenirdi; tık sonrası mavi halka "yapışık" kalırdı. */
export const focusRing = {
  onFocus: (e) => {
    if (e.currentTarget.matches(":focus-visible")) {
      e.currentTarget.style.boxShadow = `0 0 0 2px ${PAL.bg}, 0 0 0 4px ${T}`;
    }
  },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};
export const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

/* Odak döngüsü — aria-modal diyaloglarda Tab'ı içeride tutar (WCAG 2.4.3; jüri bulgusu:
   odak scrim arkasındaki görünmez içeriğe kaçıyordu). Diyalog KÖK öğesine onKeyDown olarak
   bağlanır; mevcut Escape işleyicileriyle yan yana çalışır. */
export const odakDongusu = (e) => {
  if (e.key !== "Tab") return;
  const odaklanir = e.currentTarget.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!odaklanir.length) return;
  const ilk = odaklanir[0], son = odaklanir[odaklanir.length - 1];
  if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
  else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
};

/* Hareket = bilgi: spin (gerçek yükleme) · think (canlılık, yalnız opacity) · rise (görünüm girişi, tek sefer).
   SAHNE istisnası (canlı ajan izi — CanliAjanAkisi): iz (aktif istasyona giren rayda süzülen
   tek ışık; Aceternity "tracing beam" uyarlaması) · pop (istasyon tamamlanma vuruşu) ·
   halka (tamamlanmada tek seferlik dışa yayılan halka). Yalnız canlı koşum sahnesinde;
   reduced-motion hepsini söndürür.
   ::view-transition — görünüm geçişi çapraz-erimesi kısa tutulur (DashboardApp.gecisle;
   reduced-motion'da geçiş zaten hiç başlatılmaz). */
export const NEON_KEYFRAMES = `
@keyframes nu-spin{to{transform:rotate(360deg)}}
@keyframes nu-think{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes nu-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes nu-iz{from{transform:translateY(-22px)}to{transform:translateY(100%)}}
@keyframes nu-halka{from{transform:scale(.55);opacity:.65}to{transform:scale(2.2);opacity:0}}
/* nu-alarm — çalan çalar saat: hızlı sağa-sola çalkalanma salvosu + duraklama.
   İlk sürüm (3.2sn'de %12'lik salvo, ease-in-out) fark edilmiyordu: salvo hem çok kısaydı
   hem de her mikro-adım yumuşatıldığı için "titreme" değil "salınım" gibi okunuyordu.
   Şimdi: 2sn döngünün %40'ı hareket, açı 18°'ye kadar, geçiş LINEAR — komşu duraklar
   arasında yumuşatma olmayınca gerçek bir zil titreşimi gibi keskin çıkıyor.
   Yalnız GERÇEK acil (gecikmiş/kritik) varken bağlanır — hareket=bilgi, süs değil. */
@keyframes nu-alarm{
  0%,58%,100%{transform:rotate(0deg)}
  61%{transform:rotate(-18deg)}64%{transform:rotate(18deg)}
  67%{transform:rotate(-16deg)}70%{transform:rotate(16deg)}
  73%{transform:rotate(-12deg)}76%{transform:rotate(12deg)}
  79%{transform:rotate(-8deg)}82%{transform:rotate(8deg)}
  85%{transform:rotate(-4deg)}88%{transform:rotate(0deg)}
}
@keyframes nu-gezin{from{transform:translate3d(0,0,0)}to{transform:translate3d(64px,44px,0)}}
@keyframes nu-pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.18);opacity:1}100%{transform:scale(1);opacity:1}}
/* Sesli görüşme orb'u — SAHNE istisnası (CanliAjanAkisi gibi): iç sıvı-metaball katmanları
   farklı hız/yönde döner + hafif ötelenir; üst üste blur'lu radial blob'lar kayan bir gradyan
   olarak okunur. Yalnız transform (compositor); reduced-motion global kural (aşağıda) söndürür.
   Genlik-tepkili scale/halo AYRI (rAF, JS) sürülür — bu katmanlar core-scale'e dokunmaz. */
@keyframes ke-orb-a{from{transform:rotate(0) translate(7%,4%)}to{transform:rotate(360deg) translate(7%,4%)}}
@keyframes ke-orb-b{from{transform:rotate(0) translate(-6%,6%)}to{transform:rotate(-360deg) translate(-6%,6%)}}
@keyframes ke-orb-c{from{transform:rotate(0) translate(5%,-7%)}to{transform:rotate(360deg) translate(5%,-7%)}}
/* Düşünme dalgası. 0%'ta opaklık 0 OLMALI: eskiden .5'ten başlıyordu ve döngü sarmasında
   opaklık 0'dan .5'e SIÇRIYORDU — saniyede bir "flaş" gibi okunan bir pop. Şimdi kürenin
   kenarında görünmez doğar, hızla belirir, yayılırken söner; sarma dikişsiz. */
@keyframes ke-orb-halka{0%{transform:scale(1);opacity:0}14%{opacity:.5}100%{transform:scale(1.7);opacity:0}}
/* Sesli görüşme diski girişi — köken-farkında: transformOrigin'i çağıran taraf (sağ-alt) verir,
   disk kendisini açan yuvarlak butondan büyür. scale(0)'dan DEĞİL .94'ten: hiçlikten belirmez. */
@keyframes ke-disk-gir{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
::view-transition-old(root),::view-transition-new(root){animation-duration:.18s}
/* Press feedback (emil-design-eng): tıklanabilir öğe basılınca hafif scale(.97) — arayüz
   kullanıcıyı "duyuyor" hissi. Opt-in (yalnız data-press taşıyanlar); :active durum stili
   olduğundan reduced-motion'da anında (animasyonsuz) uygulanır — hareket değil geri bildirimdir. */
[data-press]:active:not(:disabled){transform:scale(.97)}
/* Hover'da içerik büyümesi — OPT-IN İSTİSNA (kullanıcı isteği 2026-07-25, Panel ölçü
   hücreleri). MASTER.md'nin genel kuralı hâlâ "hover transform yok"; bu yüzden kural
   data-hover-buyut taşıyan kabın İÇİNDEKİ data-buyut'a bağlı, gövdeye yayılmıyor.
   Kalkış (translateY) DEĞİL ölçek: kutu yerinde kalır, yalnız içerik yakınlaşır.
   Kenarlık/zemin ölçeklenmez (yalnız iç sarmalayıcı) → ızgara hairline'ları kıpırdamaz.
   reduced-motion'da alttaki genel kural transition'ı zaten kapatır. */
[data-buyut]{transition:transform .18s var(--ke-ease-out)}
[data-hover-buyut]:hover [data-buyut]{transform:scale(1.06)}
/* <details> katlama (MevzuatView kategori grupları): summary marker'ını söndür (kendi
   chevron'umuz var), açıkken chevron 90° döner, hover'da başlık zemini. Renk/token'dan
   bağımsız saf mekanik. */
summary::-webkit-details-marker{display:none}
summary:hover{background:var(--ke-hov)}
details[open] > summary .mev-chevron{transform:rotate(90deg)}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;

/* Görünüm kabuğu — başlık + alt başlık + içerik (kaydırılır sayfa).

   altDolgu: alt dolgu, kaydırılan görünümlerde nefes payıdır (96px varsayılan; yüzen sohbet
   düğmesinin son satırı örtmesini de engeller). PENCEREYE KİLİTLİ düzenlerde ise ölü alandır:
   sütun yüksekliği "pencere − üst boşluk − alt dolgu" olarak ölçüldüğünden o 96px doğrudan
   içerikten kısılır. Bu yüzden opsiyonel; yalnız sayfanın kaydırılmadığı düzenler kısar. */
export function ViewWrap({ id, title, sub, actions, altDolgu = 96, children }) {
  return (
    // Yatay padding responsive: 390px telefonda sabit 32+32=64px, içeriğe kalan genişliğin
    // %16'sını yiyip satırları sıfır genişliğe eziyordu (ölçüm: Panel 441px/390px taşma).
    // clamp ile dar ekranda 16px'e iner; ≥800px'te eski 32px değeri BİT-AYNI kalır.
    <section aria-labelledby={id} style={{ padding: `24px clamp(16px, 4vw, 32px) ${altDolgu}px`, minHeight: "calc(100vh - 1px)" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap", marginBottom: SP.xl }}>
        <div>
          {/* 2026-07-25: h2(20) → h1(28). TYPE.h1 zaten "görünüm başlıkları" için tanımlıydı
              ama ViewWrap h2 kullanıyordu — token'ın kendi tarifine dönüldü. TÜM görünümleri
              etkiler (tek başlık bileşeni); sayfadan sayfaya farklı başlık boyu daha kötü. */}
          <h2 id={id} style={{ margin: 0, ...TYPE.h1, color: PAL.ink }}>{title}</h2>
          {sub && <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.read, color: PAL.mut2 }}>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: SP.m, flexWrap: "wrap" }}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/* Kart — düz beyaz yüzey + 1px hairline (border-first); gölge en fazla SH.card.
   Başlık: satır-içi kutusuz ikon (accent yalnız ikon rengi) + 14/600 sentence-case başlık +
   sağda düz meta metin (tag). Hover'da kalkış YOK. */
export function NeonCard({ title, tag, tagColor, accent = T, icon, children, full, bodyCenter, style }) {
  // bodyCenter: ColGrid'in stretchLast'ı son kartı komşu sütunla hizalamak için flex:1 verir
  // (bkz. NeonDetay.jsx) — içerik kısa bir metinse fazla boşluk gövdenin ALTINDA boş kalır.
  // bodyCenter true'ysa gövde o boşluğu üstlenip içeriği dikeyde ortalar; içerik kartı zaten
  // doldurduğunda (stretch yoksa) hiçbir görsel farkı yoktur.
  return (
    <section style={{ position: "relative", gridColumn: full ? "1 / -1" : "auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, boxShadow: SH.card, ...(bodyCenter ? { display: "flex", flexDirection: "column" } : null), ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m, flexShrink: 0 }}>
          {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(accent) }}>{icon}</span>}
          <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{title}</h3>
          {tag && <span style={{ marginLeft: "auto", ...TYPE.meta, color: tagColor ? DERIN_OF(tagColor) : PAL.mut, ...TNUM }}>{tag}</span>}
        </div>
      )}
      <div style={{ position: "relative", ...(bodyCenter ? { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" } : null) }}>{children}</div>
    </section>
  );
}

export const KV = ({ k, v, c = PAL.ink2 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
    <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{k}</span>
    <span style={{ ...TYPE.data, color: c, textAlign: "right", fontWeight: 500, ...TNUM }}>{v}</span>
  </div>
);

/* Buton — primary: düz DERIN dolgu (ekran başına 1) · varsayılan (secondary): beyaz zemin +
   koyu ink kenar · disabled: baskı zemin. Gradyan/glow yok; hover yalnız zemin tonu (120ms). */
export function Btn({ children, onClick, accent = T, primary, disabled, ariaLabel, title, style, type = "button" }) {
  const fill = DERIN_OF(accent);
  const base = {
    cursor: disabled ? "not-allowed" : "pointer", padding: "8px 14px", minHeight: 36,
    borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500,
    // Emil: hover/renk = "ease"; press feedback (scale) = güçlü ease-out, 100–160ms.
    transition: `background .12s ease, filter .12s ease, transform .14s ${EASE.out}`,
    display: "inline-flex", alignItems: "center", gap: SP.s, border: "1px solid transparent",
  };
  const skin = disabled
    ? { background: PAL.press, color: PAL.mut2 }
    : primary
      ? { background: fill, color: PAL.onAccent }
      : { background: PAL.surf, color: PAL.ink, border: `1px solid ${PAL.inputLine}` };
  const onEnter = (e) => {
    if (disabled) return;
    if (primary) { if (fill === DERIN.T) e.currentTarget.style.background = DERIN.Th; else e.currentTarget.style.filter = "brightness(.94)"; }
    else e.currentTarget.style.background = PAL.hov;
  };
  const onLeave = (e) => {
    if (disabled) return;
    if (primary) { e.currentTarget.style.background = fill; e.currentTarget.style.filter = "none"; }
    else e.currentTarget.style.background = PAL.surf;
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title} data-press=""
      onMouseEnter={onEnter} onMouseLeave={onLeave} {...focusRing} style={{ ...base, ...skin, ...style }}>
      {children}
    </button>
  );
}

/* Boş durum — kutusuz soluk ikon + net yönlendirme metni + aksiyon. */
export function EmptyState({ icon, title, sub, actions }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.m, padding: "56px 20px", textAlign: "center", minHeight: 320 }}>
      {icon && React.isValidElement(icon) && (
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut }}>{React.cloneElement(icon, { width: 24, height: 24 })}</span>
      )}
      <div>
        <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{title}</div>
        {sub && <p style={{ margin: "6px 0 0", ...TYPE.data, color: PAL.mut2, maxWidth: 420 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: SP.m, marginTop: SP.xs, flexWrap: "wrap", justifyContent: "center" }}>{actions}</div>}
    </div>
  );
}

/* Büyüt ikonu (dört köşe ok) — belge panellerinin A4 modal tetikleyicisi (kaynak belge /
   ana taslak / birim taslağı — hepsi ortak). */
const BuyutIkon = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Panel başlığındaki küçük "büyüt" düğmesi — Kaynak belge / taslak kartlarında ortak. */
export function BuyutDugme({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Büyüt (A4 görünüm)" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, flexShrink: 0, transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <BuyutIkon />
    </button>
  );
}

/* İkonlar — lucide-react (ISC lisans, AGPL yasağını çiğnemez). Tek strokeWidth (1.75) BİLİNÇLİ:
   eski elle-çizim setinde ikon başına değişen kalınlık (1.4–2.0) görsel tutarsızlığın
   kaynağıydı — kütüphaneye geçişin asıl kazancı "aynı aile" hissi, o yüzden hepsi TEK
   kalınlıkta. Boyutlar eski width/height değerleriyle BİT-AYNI (çağıran tarafta layout
   kaymasın — `Icon.doc width={14}` gibi override'lar rest-spread ile hâlâ kazanır).
   `spin` İSTİSNA: T renkli çift-ton yay + `donuk` prop'u (gerçek yükleme sinyali,
   "hareket=bilgi" kuralı) — hazır kütüphane ikonunun karşılığı yok, elle çizim korunur. */
export const Icon = {
  grid: (p) => <LayoutGrid size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  inbox: (p) => <Inbox size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  /* spin: animasyon OPT-IN (donuk prop'u false + gerçek yükleme) — "hareket = bilgi" kuralı:
     boşta dönen spinner sahte etkinlik sinyaliydi (jüri bulgusu). donuk=true → statik halka. */
  spin: ({ donuk, ...p } = {}) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: donuk ? "none" : "nu-spin 2.4s linear infinite" }} {...p}><circle cx="12" cy="12" r="8" stroke={`color-mix(in srgb, ${T} 25%, transparent)`} strokeWidth="2" /><path d="M12 4 A8 8 0 0 1 20 12" stroke={T} strokeWidth="2" strokeLinecap="round" /></svg>,
  doc: (p) => <FileText size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  book: (p) => <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  shield: (p) => <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  upload: (p) => <Upload size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  phone: (p) => <Smartphone size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  plus: (p) => <Plus size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
  arrow: (p) => <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
  takvim: (p) => <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  okSol: (p) => <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  okSag: (p) => <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  edit: (p) => <Pencil size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
  send: (p) => <Send size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
  chart: (p) => <BarChart3 size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  clock: (p) => <Clock size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  scale: (p) => <Scale size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  route: (p) => <Route size={16} strokeWidth={1.75} aria-hidden="true" {...p} />,
  info: (p) => <Info size={13} strokeWidth={1.75} aria-hidden="true" {...p} />,
  check: (p) => <Check size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
  x: (p) => <X size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
  alert: (p) => <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
  mic: (p) => <Mic size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
  micOff: (p) => <MicOff size={18} strokeWidth={1.75} aria-hidden="true" {...p} />,
  audio: (p) => <AudioLines size={22} strokeWidth={1.75} aria-hidden="true" {...p} />,
  sparkle: (p) => <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
  undo: (p) => <Undo2 size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
  search: (p) => <Search size={15} strokeWidth={1.75} aria-hidden="true" {...p} />,
};

/* MarkaKaro — çalışma alanı marka işareti: "Havale" amblemi (2026-07-17 logo seçimi,
   Konsept 1) — gelen belge üç birime yönleniyor; uç noktalar T/V/R (risk bandı çağrışımı).
   Border-first karo korunur (PAL.surf zemin + hairline). Önceki belge+onay-mührü stroke
   ikonunun yerine geçti; bağımsız dosya eşi public/logo-kamu-evrak.svg (app.html favicon).
   logo.png landing'de yaşamaya devam eder; çalışma alanı bu karoyu kullanır. */
export function MarkaKaro({ size = 36, nokta = true }) {
  const ic = Math.round(size * 0.72);
  return (
    <span aria-hidden="true" style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.card }}>
      <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="9" height="14" rx="2" fill={T} />
        <rect x="5" y="8" width="5" height="1.3" rx=".65" fill={PAL.surf} opacity=".92" />
        <rect x="5" y="10.6" width="3.6" height="1.3" rx=".65" fill={PAL.surf} opacity=".92" />
        <path d="M12 12 C15 12 15 7.5 17.5 7.5" stroke={T} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12 12 H17.5" stroke={T} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12 12 C15 12 15 16.5 17.5 16.5" stroke={T} strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="19.6" cy="7.5" r="1.45" fill={T} />
        <circle cx="19.6" cy="12" r="1.45" fill={V} />
        <circle cx="19.6" cy="16.5" r="1.45" fill={R} />
      </svg>
      {nokta && <span style={{ position: "absolute", right: -2, top: -2, width: Math.max(6, Math.round(size * 0.17)), height: Math.max(6, Math.round(size * 0.17)), borderRadius: RAD.dot, background: R, border: `1.5px solid ${PAL.bg}` }} />}
    </span>
  );
}

/* InfoTip — erişilebilir "ⓘ" ipucu. @radix-ui/react-tooltip: hover + klavye odağıyla açma,
   Esc'te kapatma, role=tooltip/aria-describedby bağlama kütüphaneden gelir (elle state/id
   yönetimi kalktı). Popper tabanlı konumlandırma viewport kenarında OTOMATİK kaçınır — eski
   sabit align="left|right" kenarda taşabiliyordu. Content varsayılan HOVERABLE (WCAG 1.4.13,
   eski "köprü" paddingTop hack'inin yerini alır). Görünüm birebir eski (PAL/RAD/SH/TYPE). */
function InfoTip({ label = "Bilgi", children, width = 256, align = "right" }) {
  return (
    <RTooltip.Provider delayDuration={200}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>
          <button type="button" aria-label={label} {...focusRing}
            style={{ cursor: "pointer", width: 24, height: 24, borderRadius: RAD.dot, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${PAL.lineHi}`, background: PAL.hov, color: PAL.mut, padding: 0, flexShrink: 0 }}>
            <Icon.info />
          </button>
        </RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content side="bottom" align={align === "right" ? "end" : "start"} sideOffset={8} collisionPadding={12}
            style={{ width, zIndex: 60, background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: "12px 14px", boxShadow: SH.pop, ...TYPE.data, color: PAL.ink2, textAlign: "left", whiteSpace: "normal", fontWeight: 400, animation: "nu-rise .14s var(--ke-ease-out) both" }}>
            {children}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

const RISK_ORDER = ["yesil", "sari", "kirmizi"];
const RISK_DESC = {
  yesil: "Düşük risk: taslak yayına hazır; rutin memur onayı yeterli.",
  sari: "Orta risk: yayından önce memur incelemesi önerilir.",
  kirmizi: "Yüksek risk: dikkatli memur kararı gerekir; otomatik gönderim durur.",
};

/* RiskBand — açıklamalı (tooltip'li) risk göstergesi. CanliAjanAkisi + NeonDetay ortak kullanır.
   band: "yesil|sari|kirmizi" · lit: risk_guard tamamlandı mı (yanmadan "—").
   Uppercase istisnası: YEŞİL/SARI/KIRMIZI durum kodu (BANT.l — semantik token, mono 12). */
export function RiskBand({ band = "yesil", lit = true, sub }) {
  const cur = BANT[band] || BANT.yesil;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, minWidth: 230 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Risk bandı{sub ? ` · ${sub}` : ""}</span>
          <InfoTip label="Risk bandı nedir? Açıklamayı göster" width={266}>
            <strong style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink, marginBottom: 6 }}>Risk bandı nedir?</strong>
            <span style={{ display: "block", color: PAL.mut, marginBottom: 4 }}>
              Yapay zekânın ürettiği taslağın <strong style={{ color: PAL.ink2, fontWeight: 600 }}>yayın güvenliği</strong> risk seviyesi — memurun ne kadar dikkatle incelemesi gerektiğini gösterir (trafik ışığı mantığı).
            </span>
            {RISK_ORDER.map((key) => (
              <span key={key} style={{ display: "flex", gap: SP.s, alignItems: "flex-start", marginTop: 7 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: RAD.dot, background: BANT[key].c, marginTop: 4, flexShrink: 0 }} />
                <span style={{ color: PAL.mut }}><strong style={{ color: DERIN_OF(BANT[key].c), fontWeight: 600 }}>{BANT[key].l}</strong> — {RISK_DESC[key]}</span>
              </span>
            ))}
          </InfoTip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 10px", borderRadius: RAD.card, background: PAL.surfHi, border: `1px solid ${PAL.line}`, width: "fit-content" }}>
          {RISK_ORDER.map((key) => {
            const on = lit && band === key;
            return <span key={key} aria-hidden="true" title={`${BANT[key].l}: ${BANT[key].t}`} style={{ width: 12, height: 12, borderRadius: RAD.dot, background: on ? BANT[key].c : PAL.press, border: "1px solid " + (on ? BANT[key].c : PAL.lineHi), transition: "background .15s ease-out", animation: on ? "nu-pop .3s var(--ke-ease-out) both" : "none" }} />;
          })}
        </div>
      </div>
      <div role="status" aria-label={lit ? `Risk bandı: ${cur.l}, ${cur.t}` : "Risk bandı henüz belirlenmedi"}
        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "6px 10px", borderRadius: RAD.ctl, color: lit ? DERIN_OF(cur.c) : PAL.mut2, background: lit ? ALFA(cur.c) : PAL.hov }}>
        {lit ? cur.l : "—"}
      </div>
    </div>
  );
}
