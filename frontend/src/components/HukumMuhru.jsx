/* HukumMuhru — "hüküm anı" (BENCHMARK Hamle 1): karar verilince kâğıdın İMZA BLOĞUNA ıslak
   paraf çizilir, ardından lastik mühür iner, mürekkep kâğıda yayılır, kâğıt bir kez çöker.

   Kâğıdın İÇİNDE (A4Belge `imzaKatmani` yuvası, ilk imza satırına göre konumlu) çizilir —
   böylece A4 ölçeğiyle birlikte ölçeklenir ve imza gerçekten "Yetkili İmza" satırının
   üstüne düşer. Konum mutlak: ölçüm katmanına ve sayfalamaya hiç dokunmaz.

   Sözleşmeler:
   · Yalnız GERÇEKLEŞMİŞ karar için basılır (çağıran `karar`ı ancak onay/ret kabul
     edildikten sonra verir — koşmayan iş "tamamlandı" gösterilmez, CLAUDE.md §9 ruhu).
   · Ret imzalanmaz: memur reddettiği yazıyı paraflamaz; yalnız REDDEDİLDİ mührü iner.
   · Zamanlama: paraf 450 ms → mühür 420 ms (80 ms "basınç" bekler) → yayılım 600 ms.
     Oturumdaki 2. ve sonraki kararlarda toplam ~250 ms'ye iner (zevk anı yalnız ilk kez).
   · prefers-reduced-motion → hiçbir hareket yok; paraf ve mühür son hâlleriyle görünür.
   · Salt görsel: aria-hidden; karar metni kart başlığında ve canlı bölgede yazıyla durur. */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { Damga, BANT, V } from "./neonUi.jsx";

/* Paraf — tek kalem darbesi (ilmekli ad + alt çizgi); pathLength=1 ile ölçüden bağımsız. */
const PARAF = "M6 46 C 18 10, 30 8, 28 34 C 26 52, 14 50, 22 36 C 30 22, 44 18, 48 38 C 51 50, 58 30, 66 26 C 74 22, 70 46, 80 40 C 90 34, 96 22, 104 30 C 110 36, 108 44, 118 40 M 14 56 C 50 52, 90 54, 128 50";

const STIL = `
@keyframes kd-paraf{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes kd-muhur-in{
  0%{opacity:0;transform:rotate(var(--egim)) scale(1.35)}
  55%{opacity:1;transform:rotate(var(--egim)) scale(.97)}
  72%{opacity:1;transform:rotate(var(--egim)) scale(.97)}
  100%{opacity:1;transform:rotate(var(--egim)) scale(1)}
}
@keyframes kd-murekkep-yayil{from{filter:none}to{filter:drop-shadow(0 0 .6px currentColor)}}
@keyframes kd-kagit-cok{0%{transform:none}35%{transform:scale(.994)}100%{transform:none}}
.ke-a4-sayfa.kd-basildi{ animation: kd-kagit-cok .26s var(--ke-ease-out); }
@media (prefers-reduced-motion: reduce){
  .kd-muhur-paraf, .ke-a4-sayfa.kd-basildi{ animation: none !important; }
  .kd-muhur-paraf{ stroke-dashoffset: 0 !important; }
}`;

const STIL_ID = "kd-muhur-stil";
function stilYukle() {
  if (typeof document === "undefined" || document.getElementById(STIL_ID)) return;
  const el = document.createElement("style");
  el.id = STIL_ID;
  el.textContent = STIL;
  document.head.appendChild(el);
}

/* Oturumdaki karar sayısı — ilk hüküm tam koreografi, sonrakiler kısaltılmış (Emil sıklık yasası). */
let kararSayisi = 0;

const bugun = () => new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** @param {{ karar: "onay" | "ret" }} p */
export default function HukumMuhru({ karar }) {
  const azHareket = useReducedMotion();
  const kokRef = useRef(null);
  const zamanRef = useRef(null);
  if (zamanRef.current === null) {
    const ilk = kararSayisi === 0;
    kararSayisi += 1;
    const onay = karar === "onay";
    zamanRef.current = {
      paraf: ilk ? 450 : 140,
      muhurGecikme: onay ? (ilk ? 400 : 110) : 0,
      muhur: ilk ? 420 : 160,
      tarih: bugun(),
    };
  }
  const z = zamanRef.current;

  useEffect(() => {
    stilYukle();
    if (azHareket) return undefined;
    // Kâğıt çökmesi: mühür kâğıda değdiği an (gecikme + sürenin ~%55'i), tek sefer.
    const sayfa = kokRef.current?.closest(".ke-a4-sayfa");
    if (!sayfa) return undefined;
    const t = setTimeout(() => {
      sayfa.classList.remove("kd-basildi");
      void sayfa.offsetWidth;            // aynı sınıfı yeniden tetiklemek için reflow
      sayfa.classList.add("kd-basildi");
    }, z.muhurGecikme + z.muhur * 0.55);
    return () => { clearTimeout(t); sayfa.classList.remove("kd-basildi"); };
  }, [azHareket, z]);

  const onay = karar === "onay";
  const ton = onay ? V : BANT.kirmizi.c;
  return (
    <span ref={kokRef} aria-hidden="true" className="kd-muhur"
      style={{ position: "absolute", left: 0, right: 0, bottom: "100%", height: 0, pointerEvents: "none", textIndent: 0 }}>
      {onay && (
        <svg viewBox="0 0 136 64" width="150" height="71"
          style={{ position: "absolute", left: "50%", bottom: -6, transform: "translateX(-50%)", overflow: "visible" }}>
          <path className="kd-muhur-paraf" d={PARAF} pathLength="1" fill="none"
            stroke="var(--kd-tukenmez)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 1, strokeDashoffset: azHareket ? 0 : 1,
              animation: azHareket ? "none" : `kd-paraf ${z.paraf}ms cubic-bezier(.45,.05,.35,1) forwards` }} />
        </svg>
      )}
      <span style={{ position: "absolute", right: "calc(100% + 18px)", bottom: -40 }}>
        <Damga ton={ton} egim={onay ? -8 : -6} animasyon={false}
          style={{ padding: "7px 14px 6px", outlineOffset: 3,
            filter: azHareket ? "drop-shadow(0 0 .6px currentColor)" : undefined,
            animation: azHareket ? "none"
              : `kd-muhur-in ${z.muhur}ms var(--ke-ease-out) ${z.muhurGecikme}ms both, kd-murekkep-yayil .6s ease-out ${z.muhurGecikme + z.muhur}ms both` }}>
          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 9, lineHeight: "10px", letterSpacing: ".22em" }}>{onay ? "Onaylandı" : "Karar"}</span>
            <span style={{ fontSize: 19, lineHeight: "20px", letterSpacing: ".06em", fontWeight: 900 }}>{onay ? "Gönderildi" : "Reddedildi"}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, lineHeight: "10px", letterSpacing: ".08em", fontWeight: 600, textTransform: "none" }}>{z.tarih}</span>
          </span>
        </Damga>
      </span>
    </span>
  );
}
