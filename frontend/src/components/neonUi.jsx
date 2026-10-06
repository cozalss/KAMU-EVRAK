/* neonUi — kamu-evrak çalışma alanı paylaşılan tasarım atomları ("Antet & Damga", 2026-10).
   Token'lar (PAL/T/V/R/BANT/DERIN/TYPE/RAD/SP/SH/EASE) + atomlar (ViewWrap antet başlığı,
   Damga, NeonCard, Btn, EmptyState, RiskBand). Hex değerleri temaCss.js'teki THEME_CSS'te.
   Spec: design-system/kamu-evrak/MASTER.md. Satır-içi stil; küresel kurallar NEON_KEYFRAMES.
   a11y: focusRing + SR_ONLY + semantik. */
import React from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { ODAKLANIR_SECICI } from "../lib/odakSecici.js";
import { damgaKaydi } from "../lib/damgaButce.js";
import {
  LayoutGrid, Inbox, FileText, BookOpen, ShieldCheck, Upload, Smartphone, Plus, ArrowRight,
  Pencil, Send, BarChart3, Clock, Scale, Route, Info, Check, X, TriangleAlert, Mic, Sparkles, Undo2, Search,
  AudioLines, MicOff, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Globe,
} from "lucide-react";

export const MONO = "'IBM Plex Mono',ui-monospace,monospace";
// Gövde + UI fontu: Instrument Sans (Antet & Damga, 2026-10) — latin-ext (ç/ş/ğ/İ tam),
// styles/fonts.css'ten yerel iner. İnmezse Segoe UI (Windows sistem) fallback.
export const SANS = "'Instrument Sans','Segoe UI',system-ui,sans-serif";
/* DISPLAY: Archivo — GENİŞLİK ekseni (62–125, fontStretch) olan başlık/rakam/damga/logotype
   fontu. Gövdeye yayılmaz (MASTER "Token'lar"). */
export const DISPLAY = "'Archivo','Segoe UI',system-ui,sans-serif";
/* V (Görev 2 semantiği): lavanta → MÜHÜR moru (2026-07 revizyonu). Pastel "AI moru"ndan
   çıkış; ıstampa/mühür mürekkebi — resmî evrak dünyasının kendi rengi. Radix ruby/plum
   koyuluğunda; ivory zeminde dolgu 6.3:1, DERIN.V metin 8.3:1 (AA). */
/* Renk token'ları CSS custom property üzerinden okunur (bkz. THEME_CSS altta) — açık/koyu
   mod aynı JS sabitleriyle çalışır, yalnız kök elemandaki [data-theme] değeri değişir. */
export const T = "var(--ke-t)", V = "var(--ke-v)", R = "var(--ke-r)";
export const PAL = {
  bg: "var(--ke-bg)", bg2: "var(--ke-bg2)", surf: "var(--ke-surf)", surf2: "var(--ke-surf2)", surfHi: "var(--ke-surf-hi)",
  /* surfPop: HAVADA DURAN katman yüzeyi (dropdown/tooltip/modal/toast). Açık modda surf ile
     bit-aynı (#ffffff) — koyu modda bir basamak AÇIK (#252220): siyah üstünde siyah gölge
     görünmediğinden koyu modda yükseklik ışıkla anlatılır (yüzey merdiveni, bkz. THEME_CSS). */
  surfPop: "var(--ke-surf-pop)",
  line: "var(--ke-line)", lineHi: "var(--ke-line-hi)",
  ink: "var(--ke-ink)", ink2: "var(--ke-ink2)", mut: "var(--ke-mut)", mut2: "var(--ke-mut2)", mut3: "var(--ke-mut3)",
  hov: "var(--ke-hov)", press: "var(--ke-press)",
  inputLine: "var(--ke-input-line)", onAccent: "var(--ke-on-accent)", onInk: "var(--ke-on-ink)", onInkHata: "var(--ke-on-ink-hata)", inkSurf: "var(--ke-ink-surf)",
  scrim: "var(--ke-scrim)",
  /* scrimKoyu: A4/kurul modallarının HER İKİ temada koyu karartısı (onInk ailesiyle çift) —
     elle rgba kopyaları (BelgeModal/MuzakereKurulu) tek kaynağa bağlanır. onInk2: bu karartı
     üstündeki ikincil metin (dosya adı, ipucu satırı). */
  scrimKoyu: "var(--ke-scrim-koyu)", onInk2: "var(--ke-on-ink-2)",
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
/* Tek izinli alfa eki: tint zemin (çip/seçili durum). Oran token'dan gelir (--ke-alfa):
   açık modda %8; koyu modda %14 — %8'lik tint siyaha kompozit olunca gözle seçilemiyordu
   (çipler "yıkanmış" okunuyordu, 2026-08 koyu mod teşhisi). color-mix — hex ve var()
   girdisiyle aynı çalışır (eski hex+"14" eki var() dizgesinde kırılırdı). Başka alfa-yapıştırma yok. */
export const ALFA = (c) => `color-mix(in srgb, ${c} var(--ke-alfa, 8%), transparent)`;

/* Renk token'ları (THEME_CSS) temaCss.js'te — tek hex kaynağı; burada yeniden dışa aktarılır. */
export { THEME_CSS } from "./temaCss.js";


/* Tip ölçeği — bu tablo dışında fontSize yazılmaz. Sayısal kolonlarda TNUM eklenir. */
export const TYPE = {
  meta: { fontFamily: SANS, fontSize: 12, lineHeight: "16px", letterSpacing: ".2px" },
  data: { fontFamily: SANS, fontSize: 13, lineHeight: "18px", letterSpacing: ".1px" },
  ui: { fontFamily: SANS, fontSize: 14, lineHeight: "20px" },
  read: { fontFamily: SANS, fontSize: 16, lineHeight: "24px" },
  /* "Antet & Damga" (2026-10): başlık katmanı Archivo'nun GENİŞLİK ekseninde açılır —
     resmî tabela/antet harfi. Gövde Instrument Sans kalır; display yalnız başlık + rakam. */
  h2: { fontFamily: DISPLAY, fontSize: 20, lineHeight: "26px", fontWeight: 700, fontStretch: "108%", letterSpacing: "-.01em" },
  num: { fontFamily: DISPLAY, fontSize: 26, lineHeight: "30px", fontWeight: 700, fontStretch: "112%", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" },
  h1: { fontFamily: DISPLAY, fontSize: 38, lineHeight: "42px", fontWeight: 800, fontStretch: "118%", letterSpacing: "-.03em" },
  disp: { fontFamily: DISPLAY, fontSize: 44, lineHeight: "48px", fontWeight: 800, fontStretch: "115%", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" },
  /* antet: başlık üstündeki künye satırı (KAMU-EVRAK · künye · tarih) — makine verisi değil
     ama antet dilinin parçası; mono + açık izleme. damga: lastik mühür harfi. */
  antet: { fontFamily: MONO, fontSize: 11, lineHeight: "14px", letterSpacing: ".08em", fontWeight: 500 },
  damga: { fontFamily: DISPLAY, fontSize: 11, lineHeight: "12px", letterSpacing: ".1em", fontWeight: 800, fontStretch: "125%", textTransform: "uppercase" },
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
export const RAD = { chip: 5, ctl: 8, card: 12, pop: 14, dot: "50%" };
/* Boşluk ölçeği — serbest değer yazılmaz. */
export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
/* Gölge yalnız havada duran katman: card=en fazla bu (opsiyonel) · pop=dropdown/tooltip · modal=modal/toast.
   Değerler THEME_CSS'te moda göre ayrışır: açık mod eski dizgelerle bit-aynı; koyu mod
   iç üst-kenar ışığı + gerçek karartı taşır (siyahta gölge görünmez, yükseklik ışıkla anlatılır). */
export const SH = {
  card: "var(--ke-sh-card)",
  pop: "var(--ke-sh-pop)",
  modal: "var(--ke-sh-modal)",
  kagit: "var(--ke-sh-kagit)",
};

/* Odak halkası artık TEK KAYNAKTA, CSS'te (styles/kamu-evrak.css "ODAK: TEK KAYNAK", tur 6):
   :focus-visible → çift çizgi (2px tükenmez + 2px boşluk + 1px ince). Eskiden burası JS ile
   box-shadow yazıyordu ve eski CSS outline'ı ile aynı öğede üst üste biniyordu (jüri ölçümü).
   focusRing nesnesi GERİYE UYUM için kalır (161 çağrı yeri spread eder; TaslaklarView
   onFocus/onBlur'u doğrudan çağırır) — işleyiciler artık no-op, data-odak yalnız işaret.
   FOCUS_HALKA: halkayı elle çizmek zorunda kalan istisnalar için aynı dizge. */
export const FOCUS_HALKA = `0 0 0 1px ${PAL.bg}, 0 0 0 3px ${T}, 0 0 0 5px ${PAL.bg}, 0 0 0 6px ${T}`;
const odakNoop = () => {};
export const focusRing = { "data-odak": "", onFocus: odakNoop, onBlur: odakNoop };
export const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

/* Odak döngüsü — aria-modal diyaloglarda Tab'ı içeride tutar (WCAG 2.4.3; jüri bulgusu:
   odak scrim arkasındaki görünmez içeriğe kaçıyordu). Diyalog KÖK öğesine onKeyDown olarak
   bağlanır; mevcut Escape işleyicileriyle yan yana çalışır. */
export const odakDongusu = (e) => {
  if (e.key !== "Tab") return;
  const odaklanir = e.currentTarget.querySelectorAll(ODAKLANIR_SECICI);   // tabindex=-1 dışlanır (lib/odakSecici)
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
/* --nu-rise-y: yükselme mesafesi (varsayılan 8px; sicil satırları gibi küçük öğeler 4px verir). */
@keyframes nu-rise{from{opacity:0;transform:translateY(var(--nu-rise-y,8px))}to{opacity:1;transform:translateY(0)}}
/* nu-sol: scrim/perde girişi — YALNIZ opacity. Karartma perdesi mekânda hareket ETMEZ
   (Apple: materyal katman solar, içerik hareket eder) — nu-rise scrim'e verilmez. */
@keyframes nu-sol{from{opacity:0}to{opacity:1}}
/* nu-kagit: diyalog/kâğıt katmanının masaya İNİŞİ — tüm modallar için tek hareket sözcüğü
   (tur 4, jüri C#28: önizleme/düzenle 160 ms düz opacity, asistan 400 ms yay, mevzuat rise —
   üç dil). Yalnız transform+opacity; 220 ms var(--ke-ease-out). Perde nu-sol alır, kâğıt bunu. */
@keyframes nu-kagit{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
/* nu-kagit-pop: yerinde açılan küçük katman (menü, ipucu) — kökenden .96 → 1, kayma yok.
   transform-origin'i çağıran verir (Radix --radix-*-content-transform-origin). 160–180 ms. */
@keyframes nu-kagit-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
/* nu-sirt: kenar çubuğu dosya sırtının girişi — soldan sağa açılır; son kare her zaman tam sırt. */
@keyframes nu-sirt{from{clip-path:inset(0 100% 0 0 round 12px 0 0 12px)}to{clip-path:inset(-12px -1px -12px 0)}}
/* nu-damga: lastik mührün kâğıda inişi — büyükten, saydamdan; hafif ezilip yerine oturur. */
@keyframes nu-damga{0%{opacity:0;transform:rotate(var(--egim)) scale(1.9)}55%{opacity:1;transform:rotate(var(--egim)) scale(.94)}100%{opacity:1;transform:rotate(var(--egim)) scale(1)}}
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
/* NOT: biten adımın YUTULMASI burada keyframe DEĞİLDİR. İlk sürümde ke-orb-yut adlı tek
   sürekli bir uçuş vardı ve etiket okunmuyordu; jest üç vuruşa (belir · dur · çekil)
   ayrılınca süreleri sıkışıklığa göre değişken oldu — sabit yüzdeli keyframe bunu taşıyamaz,
   üstelik hızlı tetiklenen bir öğede keyframe kesilince sıfırdan başlar. AjanOrb.jsx artık
   vuruşları transition ile sürüyor; gerekçe orada belgeli. */
/* Yeni adımın SEVKİ — orb aşağıya, akışa doğru kısa bir ışık bırakır ("görevi yönlendirdi").
   Yutmanın tam tersi yön: mekânsal tutarlılık, iş orb'a girer ve orb'dan çıkar.
   ÖLÇÜ NOTU: yol kürenin GÖRÜNÜR KENARINDA başlamalı. Küre clip-path ile r = 0.38·boyut
   çiziliyor (132px kapta ≈50px); ilk sürüm merkezden 2px'te doğuyordu, yani parçacığın
   TÜM yolu çekirdeğin parlak yüzeyinin üstünde kalıyor ve hiç görünmüyordu. 44px = yüzeyin
   hemen içi (doğum), 88px = sönüm. Sönüm noktası yutulan adım etiketinin durduğu yerin
   (96px) HEMEN ÜSTÜNDE bitmeli: 104px'te ikisi çakışıyor ve sevk noktası etiketin üstüne
   iniyordu — aynı anda iki farklı olay aynı piksellerde anlatılamaz. */
@keyframes ke-orb-sevk{
  0%{opacity:0;transform:translate(-50%,44px) scale(.5)}
  25%{opacity:.9}
  100%{opacity:0;transform:translate(-50%,88px) scale(1)}
}
/* Sesli görüşme diski girişi — köken-farkında: transformOrigin'i çağıran taraf (sağ-alt) verir,
   disk kendisini açan yuvarlak butondan büyür. scale(0)'dan DEĞİL .94'ten: hiçlikten belirmez. */
@keyframes ke-disk-gir{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
::view-transition-old(root),::view-transition-new(root){animation-duration:.18s}
/* Antet görünümler arasında YOLCULUK eder (benchmark #5): başlık eski konumundan yenisine
   morflanır (tarayıcının grup animasyonu), içerik eski sayfa hızla solar, yenisi kâğıt gibi
   aşağıdan yerine oturur. Yalnız transform/opacity. Reduced-motion'da geçiş hiç başlamaz
   (DashboardApp.gecisle). */
::view-transition-group(ke-antet-baslik){animation-duration:.34s;animation-timing-function:cubic-bezier(.23,1,.32,1)}
::view-transition-old(ke-antet-baslik),::view-transition-new(ke-antet-baslik){height:100%;object-fit:none;object-position:left center}
::view-transition-old(ke-icerik){animation:ke-vt-cik .14s ease-in both}
::view-transition-new(ke-icerik){animation:ke-vt-gir .38s cubic-bezier(.23,1,.32,1) both}
::view-transition-group(ke-icerik){animation:none}
@keyframes ke-vt-cik{to{opacity:0;transform:translateY(-6px)}}
@keyframes ke-vt-gir{from{opacity:0;transform:translateY(14px)}}
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
/* Kâğıt üstünde beliren büyüteç rozeti — tıklanabilir A4 kâğıdın (TaslaklarView karar
   paneli) görünür ipucu. Rozet SALT GÖRSEL: tıklama/klavye yolunu kabın kendisi taşır
   (aria-hidden + pointer-events:none), yani ikinci bir tab durağı ya da iç içe interaktif
   öğe doğmaz. Yalnız opaklık değişir — hover transform yasağı korunur. */
[data-kagit-buyut]{opacity:0;transition:opacity .14s var(--ke-ease-out)}
[data-kagit]:hover [data-kagit-buyut],[data-kagit]:focus-visible [data-kagit-buyut]{opacity:1}
/* <details> katlama (MevzuatView kategori grupları): summary marker'ını söndür (kendi
   chevron'umuz var), açıkken chevron 90° döner, hover'da başlık zemini. Renk/token'dan
   bağımsız saf mekanik. */
summary::-webkit-details-marker{display:none}
summary:hover{background:var(--ke-hov)}
details[open] > summary .mev-chevron{transform:rotate(90deg)}

/* ——— DOKUNMA TEMELLERİ (2026-08-12 mobil denetimi) ———————————————————————————
   Telefonda "yerli hissetmeme"nin ölçülen üç kaynağı. Hepsi tarayıcı VARSAYILANINI
   düzeltir; yeni görsel dil getirmez, token da tüketmez.

   1) touch-action: çift-dokunma-yakınlaştırma bekleyen tarayıcı, her dokunuşta ~300ms
      bekletip "acaba ikinci dokunuş gelecek mi" diye bakar. manipulation bu beklemeyi
      kaldırır: tıklamalar anında olur. Sayfanın kendisi pinch-zoom'u KAYBETMEZ (erişilebilirlik) —
      kural yalnız tıklanabilir öğelere verilir, gövdeye değil.
   2) tap-highlight: iOS/Android dokununca öğenin üstüne gri bir dikdörtgen basar; bizim
      kendi press geri bildirimimiz (data-press scale .97) zaten var, ikisi üst üste binince
      ucuz görünüyor. Söndürülür — geri bildirim KAYBOLMAZ, yerini ölçek alır.
   3) Yazı tipi boyutu: iOS Safari, 16px'ten KÜÇÜK punto taşıyan bir girdiye odaklanınca
      sayfayı zorla yakınlaştırır ve geri döndürmez — kullanıcının "kayma" dediği şey
      çoğunlukla budur (ölçüldü: 7 görünümde 13–14px girdi). Telefon eşiğinde tüm form
      denetimleri 16px'e çıkar; masaüstünde tipografi ölçeği AYNEN korunur. */
button,[role="button"],a,summary,input,select,textarea,label[for]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
/* !important ŞART: bu depo satır-içi stil kullanır (MASTER.md kararı) ve satır-içi stil,
   seçici ne olursa olsun stil sayfasını yener. TYPE.ui yayılan girdiler 14px'te
   kalmıştı — ölçüldü: kural eklendikten SONRA da 7 görünümde zoom tetikleyicisi duruyordu.
   Bu, satır-içi stilin bilinçli olarak ezildiği İKİ yerden biri; ikincisi dokunma hedefi.

   min-width:0 AYNI kuralın parçası ve isteğe bağlı DEĞİL: punto 13→16 çıkınca girdinin
   içsel (min-content) genişliği de büyür — varsayılan size=20 karakterdir. Esnek bir satırda
   duran arama kutusu bu yüzden kabını itiyordu (ölçüldü: punto düzeltmesinden SONRA Taslaklar
   360px'te 25px kaydı; önce kaymıyordu). min-width:0 girdinin küçülmesine izin verir. */
@media (max-width:640px){
  input,select,textarea{font-size:16px!important;min-width:0}
}
/* Kaydırma zinciri: üstteki katman sonuna gelince ALTTAKİ sayfa kaymaya başlıyordu
   (modal içinde parmağı sürükleyince arka plan kayıyor). Kapsayıcıya overscroll contain verildiğinde
   hareket katmanın kendisinde biter. Kendi kaydırma bağlamı olan HER katmana uygulanır. */
[data-kaydirma-kapsa]{overscroll-behavior:contain}
/* Dokunma hedefi — telefonda 44px (Apple HIG / Material konfor eşiği; WCAG 2.2 SC 2.5.8'in
   24px tabanının üstü). OPT-IN: her butona körlemesine verilirse satır-içi çipler ve metin
   bağlantıları şişer. Yalnız PARMAKLA nişan alınan denetimler işaretlenir — gezinme rayı,
   buton atomu, filtre çipleri, ay okları. Masaüstünde ölçüler AYNEN kalır (telefon eşiği).

   NEDEN GENEL bir button{min-height:44px} DEĞİL: takvim gün hücresi de bir button ve
   aspectRatio 1/1 ile DAİRE. 360px telefonda hücre ~34px'e iner; ona 44px dayatmak
   daireyi elipse çevirirdi. Genel kural görsel sözleşmeyi bozar, opt-in bozmaz.
   !important gerekçesi: satır-içi minHeight 36 (Btn, kenar çubuğu yükle) aksi hâlde kazanır. */
@media (max-width:640px){
  [data-dokunma]{min-height:44px!important;min-width:44px!important}
}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;

/* Görünüm kabuğu — başlık + alt başlık + içerik (kaydırılır sayfa).

   altDolgu: alt dolgu, kaydırılan görünümlerde nefes payıdır (96px varsayılan; yüzen sohbet
   düğmesinin son satırı örtmesini de engeller). PENCEREYE KİLİTLİ düzenlerde ise ölü alandır:
   sütun yüksekliği "pencere − üst boşluk − alt dolgu" olarak ölçüldüğünden o 96px doğrudan
   içerikten kısılır. Bu yüzden opsiyonel; yalnız sayfanın kaydırılmadığı düzenler kısar. */
/* Bugünün resmî tarih biçimi (gg.aa.yyyy) — antet satırı. */
const antetTarih = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

/* Görünüm kabuğu — "Antet" başlığı (2026-10, Antet & Damga teması).
   Resmî yazının üst bloğu gibi kurulur: mono künye satırı (KAMU-EVRAK · künye · tarih) → geniş
   Archivo başlık (+ isteğe bağlı Damga) → alt başlık → ÇİFT ANTET ÇİZGİSİ (kalın + ince;
   resmî form/antet çizgisinin kendisi). Süs değil: görünümün bir "evrak" olduğunu söyler.

   altDolgu: kaydırılan görünümlerde nefes payı (yüzen sohbet düğmesi son satırı örtmesin).
   ustSik: PENCEREYE KİLİTLİ görünümler (Taslaklar) — künye satırı düşer, başlık küçülür;
   kilitli düzende her piksel A4 boyutuna gider. damga: { metin, ton } — başlığın yanında
   basılan lastik mühür (görünümün en önemli tek olgusu: "9 gecikmiş", "15 evrak"). */
/* İçerik azami genişliği (tur 6, jüri: 2560'ta bölüm 2324 px'e yayılıyordu; giriş ekranı 1680'de
   duruyor, kabuk durmuyordu). Antet çizgisi de bu kutuya bağlıdır. genis: pencereye kilitli
   (ustSik) düzenler — A4 + karar paneli her pikseli kullanır; varsayılan olarak istisnadır. */
export const ICERIK_AZAMI = 1600;
export function ViewWrap({ id, title, sub, actions, altDolgu = 96, ustSik = false, genis = ustSik, damga, kunye = "Çalışma alanı", children }) {
  return (
    <section aria-labelledby={id} style={{ position: "relative", padding: `${ustSik ? 16 : 28}px clamp(16px, 4vw, 40px) ${altDolgu}px`, minHeight: "calc(100vh - 1px)" }}>
      <div style={genis ? undefined : { maxWidth: ICERIK_AZAMI, marginInline: "auto" }}>
      <header style={{ position: "relative", zIndex: 1, marginBottom: ustSik ? SP.l : SP.xl + 4, animation: "nu-rise .32s var(--ke-ease-out) both" }}>
        {!ustSik && (
          <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m, minWidth: 0 }}>
            {/* "T.C." YOK (tur 6): bağımsız ürün devlet kimliğini kendi anteti gibi taşıyamaz. Künye
                ürün adından '·' ile ayrılır — "KAMU-EVRAK SABAH BRİFİNGİ" tek ad gibi okunuyordu. */}
            <span style={{ whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>KAMU-EVRAK<span style={{ margin: "0 .6em" }}>·</span>{kunye}</span>
            <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 16 }} />
            <span style={{ whiteSpace: "nowrap", ...TNUM }}>{antetTarih()}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap" }}>
              <h1 id={id} style={{ margin: 0, viewTransitionName: "ke-antet-baslik", ...TYPE.h1, ...(ustSik ? { fontSize: 30, lineHeight: "34px" } : null), color: PAL.ink, overflowWrap: "anywhere" }}>{title}</h1>
              {damga && <Damga ton={damga.ton} egim={damga.egim ?? -4} oncelik={damga.oncelik ?? -1}>{damga.metin}</Damga>}
            </div>
            {sub && <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.read, color: PAL.mut2, maxWidth: 760 }}>{sub}</p>}
          </div>
          {/* minWidth:0 — <select>'li araç çubuğu telefonda kabından taşmasın (2026-08-12 ölçümü). */}
          {actions && <div style={{ display: "flex", gap: SP.m, flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>{actions}</div>}
        </div>
        <div aria-hidden="true" style={{ marginTop: ustSik ? SP.m : SP.l, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: .9 }} />
      </header>
      <div style={{ position: "relative", zIndex: 1, viewTransitionName: "ke-icerik" }}>{children}</div>
      </div>
    </section>
  );
}

/* Damga — lastik mühür (Antet & Damga temasının imzası). Resmî evrak dünyasında durum
   damgayla söylenir: ACELE, GİZLİ, ASLI GİBİDİR, GÖNDERİLDİ. Çift çerçeve (2px kenar +
   ofsetli 1px outline) + Archivo'nun en geniş kesimi + hafif eğim + mürekkep dokusu
   (SVG gürültü maskesi — yer yer açılan mürekkep). Giriş: tek seferlik "basma" vuruşu.
   YALNIZ görünümün en önemli tek olgusunda kullanılır — her çipe değil (dikkat bütçesi). */
const DAMGA_DOKU = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.15'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
/* Dikkat bütçesi (tur 4): ekranda monte olan damgalar lib/damgaButce kaydına girer; bütçeyi
   (2) aşan damga silinmez, sessiz bir KÜNYE ÇİPİNE iner — metin aynen kalır, yalnız mühür
   gösterisi (eğim, çift çerçeve, doku, vuruş) düşer. oncelik: yüksek kazanır; ViewWrap başlık
   damgası -1 taşır → karar anının damgası (hüküm/onay/gönderim, 0) her zaman önce basılır.
   butce=false: kayda girmez (tek başına sahne gösterisi, ör. giriş ekranı). */
function useDamgaBasilir(butce, oncelik) {
  const id = React.useId();
  React.useLayoutEffect(() => {
    if (!butce) return undefined;
    damgaKaydi.ekle(id, oncelik);
    return () => damgaKaydi.cikar(id);
  }, [id, butce, oncelik]);
  React.useSyncExternalStore(damgaKaydi.abone, damgaKaydi.surum, damgaKaydi.surum);
  return !butce || damgaKaydi.basilirMi(id);
}
export function Damga({ children, ton = R, egim = -4, kucuk = false, animasyon = true, style, butce = true, oncelik = 0 }) {
  const renk = DERIN_OF(ton);
  const basilir = useDamgaBasilir(butce, oncelik);
  if (!basilir) {
    return (
      <span data-damga-cip="" style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
        ...style,
        ...TYPE.antet, fontSize: 10, lineHeight: "14px", textTransform: "uppercase", color: renk,
        padding: "2px 7px", border: `1px solid color-mix(in srgb, ${renk} 45%, transparent)`, borderRadius: RAD.chip,
        outline: "none", transform: "none", animation: "none", WebkitMaskImage: "none", maskImage: "none", filter: "none",
      }}>
        {children}
      </span>
    );
  }
  return (
    <span data-damga="" style={{
      "--egim": `${egim}deg`,
      display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
      ...TYPE.damga, fontSize: kucuk ? 10 : 12, lineHeight: kucuk ? "12px" : "14px",
      color: renk, padding: kucuk ? "3px 7px" : "5px 10px",
      border: `2px solid ${renk}`, borderRadius: RAD.chip + 1,
      outline: `1px solid ${renk}`, outlineOffset: 2,
      transform: `rotate(${egim}deg)`,
      WebkitMaskImage: DAMGA_DOKU, maskImage: DAMGA_DOKU, WebkitMaskSize: "160px 60px", maskSize: "160px 60px",
      animation: animasyon ? "nu-damga .5s var(--ke-ease-out) .12s both" : "none",
      ...style,
    }}>
      {children}
    </span>
  );
}

/* Kart — düz beyaz yüzey + 1px hairline (border-first); gölge en fazla SH.card.
   Başlık: satır-içi kutusuz ikon (accent yalnız ikon rengi) + 14/600 sentence-case başlık +
   sağda düz meta metin (tag). Hover'da kalkış YOK. */
export function NeonCard({ title, tag, tagColor, accent = T, icon, children, full, bodyCenter, style }) {
  // İMLEÇ IŞIĞI KALDIRILDI (2026-08-09, kullanıcı kararı): kart yüzeyinde imleci takip eden
  // bir aydınlanma vardı (`useIsik`), artık yok. Yüzey tamamen statik — hover geri bildirimi
  // yalnız tıklanabilir öğelerin kendi zemin tonundan gelir (hareket = bilgi).
  // position:relative + isolation KALIYOR: kartların içinde konumlanan başka katmanlar
  // (ParlaKenar gibi) buna dayanıyor.
  // bodyCenter: ColGrid'in stretchLast'ı son kartı komşu sütunla hizalamak için flex:1 verir
  // (bkz. NeonDetay.jsx) — içerik kısa bir metinse fazla boşluk gövdenin ALTINDA boş kalır.
  // bodyCenter true'ysa gövde o boşluğu üstlenip içeriği dikeyde ortalar; içerik kartı zaten
  // doldurduğunda (stretch yoksa) hiçbir görsel farkı yoktur.
  return (
    <section
      style={{ position: "relative", isolation: "isolate", gridColumn: full ? "1 / -1" : "auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l + 4, boxShadow: SH.card, ...(bodyCenter ? { display: "flex", flexDirection: "column" } : null), ...style }}>
      {/* Başlık ve gövde zIndex 1 taşır: kart içinde konumlanan dekor katmanlarının
          (ParlaKenar) ÜSTÜNDE kalmalılar. */}
      {title && (
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m, flexShrink: 0 }}>
          {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(accent) }}>{icon}</span>}
          <h3 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 15, lineHeight: "20px", fontWeight: 700, fontStretch: "106%", letterSpacing: "-.005em", color: PAL.ink }}>{title}</h3>
          {tag && <span style={{ marginLeft: "auto", ...TYPE.meta, color: tagColor ? DERIN_OF(tagColor) : PAL.mut, ...TNUM }}>{tag}</span>}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, ...(bodyCenter ? { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" } : null) }}>{children}</div>
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
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title} data-press="" data-dokunma=""
      onMouseEnter={onEnter} onMouseLeave={onLeave} {...focusRing} style={{ ...base, ...skin, ...style }}>
      {children}
    </button>
  );
}

/* Boş durum — "boş sicil sayfası": soluk ikon + KAYIT YOK damgası + net yönlendirme + aksiyon.
   damga=false ile damgasız (hata/yükleme gibi "boş" olmayan durumlarda). */
export function EmptyState({ icon, title, sub, actions, damga = "Kayıt yok" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.l, padding: "64px 20px", textAlign: "center", minHeight: 340 }}>
      <div style={{ position: "relative", display: "grid", placeItems: "center", width: 88, height: 104, borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 14, right: 14, top: 18, display: "grid", gap: 7 }}>
          {[1, .7, .85, .5].map((w, i) => <span key={i} style={{ height: 3, width: `${w * 100}%`, borderRadius: 2, background: PAL.press }} />)}
        </span>
        {icon && React.isValidElement(icon) && (
          <span aria-hidden="true" style={{ position: "absolute", bottom: 14, left: 14, display: "flex", color: PAL.mut3 }}>{React.cloneElement(icon, { width: 18, height: 18 })}</span>
        )}
        {damga && <Damga ton={V} egim={-9} kucuk style={{ position: "absolute", right: -26, bottom: 22, background: PAL.surf }}>{damga}</Damga>}
      </div>
      <div>
        <div style={{ ...TYPE.h2, fontSize: 18, color: PAL.ink }}>{title}</div>
        {sub && <p style={{ margin: "8px auto 0", ...TYPE.ui, color: PAL.mut2, maxWidth: 440 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: SP.m, marginTop: SP.xs, flexWrap: "wrap", justifyContent: "center" }}>{actions}</div>}
    </div>
  );
}

/* Büyüt ikonu (dört köşe ok) — belge panellerinin A4 modal tetikleyicisi (kaynak belge /
   ana taslak / birim taslağı — hepsi ortak). */
export const BuyutIkon = (p) => (
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
  // Dış bağlantı: kullanıcıyı bu uygulamadan ÇIKARAN her link bunu taşır (a11y — yeni
  // sekmede açılan bağlantının önceden bilinmesi WCAG 3.2.5 beklentisi).
  dis: (p) => <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" {...p} />,
  // Canlı/çevrimiçi kaynak — korpustan değil, kurumun kendi sitesinden okunmuş veri.
  kure: (p) => <Globe size={14} strokeWidth={1.75} aria-hidden="true" {...p} />,
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
            style={{ width, zIndex: 60, background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: "12px 14px", boxShadow: SH.pop, ...TYPE.data, color: PAL.ink2, textAlign: "left", whiteSpace: "normal", fontWeight: 400, animation: "nu-rise .14s var(--ke-ease-out) both" }}>
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
