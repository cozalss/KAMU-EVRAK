/* Kâğıt malzemesi — A4 taslak + okunan kaynak belge AYNI kâğıttan kesilir.

   Fikir: gri "masa" (arşiv grisi) üstünde gerçek kâğıt. Kâğıt iki temada da AÇIK kalır —
   gece mesaisinde masa lambası altındaki sayfa gibi; koyu temada saf beyaz göz kamaştırır,
   bu yüzden mürekkep tonuna doğru hafifçe kısılır. Doku: feTurbulence lif gürültüsü, çok
   düşük alfa — yakından bakınca hissedilir, okumayı bozmaz. Yalnız token karışımı (hex yok).

   --kd-tukenmez: ıslak tükenmez kalem mavisi (yeni/değişen satır bununla başlar, mürekkep
   siyahına "kurur" — A4Belge `kd-kuru`). */
const LIF = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2  0 0 0 0 .18  0 0 0 0 .14  0 0 0 .055 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")";

export const KAGIT_CSS = `
:root{
  --kd-kagit: var(--ke-kagit);
  --kd-kagit-murekkep: var(--ke-ink);
  --kd-masa: color-mix(in srgb, var(--ke-bg) 82%, var(--ke-bg2));
  --kd-masa-golge: inset 0 1px 0 color-mix(in srgb, var(--ke-ink) 5%, transparent), inset 0 10px 24px -18px color-mix(in srgb, var(--ke-ink) 30%, transparent);
  --kd-doku: ${LIF};
  --kd-tukenmez: color-mix(in srgb, var(--ke-t) 82%, black);
  --kd-fosfor: color-mix(in srgb, var(--ke-bant-sari) 40%, transparent);
  --kd-fosfor-koyu: color-mix(in srgb, var(--ke-bant-sari) 62%, transparent);
  --kd-ip: var(--ke-r);
}
:root[data-theme="dark"]{
  /* Tur 4: soğuk gri (ink %95) yerine THEME_CSS'in sıcak gece kâğıdı — giriş sahnesindeki
     dilekçe ([data-evrak-kagit]) ile A4 taslak AYNI kâğıttan kesilir (jüri A#26). */
  --kd-kagit: var(--ke-kagit);
  --kd-kagit-murekkep: var(--ke-bg);
  --kd-masa: color-mix(in srgb, var(--ke-bg) 70%, var(--ke-bg2));
  --kd-masa-golge: inset 0 1px 0 color-mix(in srgb, var(--ke-ink) 4%, transparent), inset 0 12px 28px -16px color-mix(in srgb, black 70%, transparent);
  --kd-tukenmez: color-mix(in srgb, var(--ke-t) 60%, black);
  --kd-fosfor: color-mix(in srgb, var(--ke-bant-sari) 48%, transparent);
  --kd-fosfor-koyu: color-mix(in srgb, var(--ke-bant-sari) 70%, transparent);
}
@keyframes kd-kuru{from{color:var(--kd-tukenmez)}}
@media (prefers-reduced-motion: reduce){ .kd-islak{animation:none !important} }
`;

const STIL_ID = "kd-kagit-stil";
/* Bir kez enjekte edilir; A4Belge ve sonuç çalışma alanı ikisi de çağırır (sıra önemsiz). */
export function kagitStilYukle() {
  if (typeof document === "undefined" || document.getElementById(STIL_ID)) return;
  const el = document.createElement("style");
  el.id = STIL_ID;
  el.textContent = KAGIT_CSS;
  document.head.appendChild(el);
}

/* Fosforlu kalem darbesi — satır-içi stil olarak (BelgeModal); sonuç alanındaki CSS eşi
   sonucStil.js'te. Metin kâğıt mürekkebi kalır, renk yalnız şeritte. */
export const FOSFOR_STIL = {
  color: "inherit",
  backgroundColor: "transparent",
  backgroundImage: "linear-gradient(100deg, transparent 0, var(--kd-fosfor) .3em, var(--kd-fosfor) calc(100% - .5em), transparent 100%)",
  backgroundRepeat: "no-repeat", backgroundSize: "100% 74%", backgroundPosition: "0 72%",
  borderRadius: ".5em .25em .45em .2em", padding: "0 .14em", margin: "0 -.14em",
  WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone",
};

/* Kâğıt yüzeyi (BelgeModal'ın düzenleme/kaynak kipleri) — A4Belge sayfasıyla aynı malzeme. */
export const KAGIT_YUZEY = {
  backgroundColor: "var(--kd-kagit)", backgroundImage: "var(--kd-doku)", color: "var(--kd-kagit-murekkep)",
};
