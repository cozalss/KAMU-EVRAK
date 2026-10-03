/* TaslakImza — "hüküm anı": Gönder onaylanınca kâğıda ıslak imza çizilir, gönderim BAŞARIYLA
   dönünce "GÖNDERİLDİ" damgası iner ve kâğıt kenar çubuğundaki Giden sekmesine doğru rafa
   kalkar (BENCHMARK #1 + #11).

   Sözleşmeler:
   · Gönderim çağrısını GECİKTİRMEZ — çağıran önce bu katmanı başlatır, gönderimi AYNI anda
     yapar; katman yalnız sonucu (ok) dinler.
   · Damga YALNIZ ok===true ile iner (koşmayan/başarısız iş "tamamlandı" gösterilmez — CLAUDE.md
     §9 ruhu). Başarısızlıkta imza solar, kâğıt yerinde kalır.
   · Karar başına bir kez; toplam ≤ ~900 ms (imza 420 + damga 300 + kalkış 280, örtüşmeli).
   · Kâğıdın KOPYASI çizilir (hayalet): gerçek panel gönderim sonrası sıradaki taslağa geçer;
     damga yanlış belgenin üstüne inmesin diye animasyon kendi kâğıdını taşır.
   · prefers-reduced-motion → hareket yok: damga anında görünür, kısa süre sonra kaybolur.
   · Salt görsel: aria-hidden, pointer-events:none. Ekran okuyucu bildirimi toast'ta. */
import { useEffect, useState } from "react";
import { Damga, V, T, SP } from "./neonUi.jsx";
import A4Belge from "./A4Belge.jsx";

const IMZA_MS = 340;     // paraf çizimi
const DAMGA_AN = 300;    // damga imza bitmeden hemen önce iner (örtüşme: toplam ≤ 900 ms)
const KALKIS_AN = 660;   // damga oturduktan sonra kâğıt rafa kalkar
const KALKIS_MS = 240;
const AZAMI_BEKLEME_MS = 12000;   // ağ cevabı gelmezse katman sonsuza kadar asılı kalmasın

/* Paraf — tek kalem darbesi (el yazısı "A. Y." benzeri ilmek + alt çizgi). Uzunluk sabit
   tahmin: dasharray/offset yolu tam kapsasın diye pathLength=1 kullanılır. */
const PARAF = "M6 46 C 18 10, 30 8, 28 34 C 26 52, 14 50, 22 36 C 30 22, 44 18, 48 38 C 51 50, 58 30, 66 26 C 74 22, 70 46, 80 40 C 90 34, 96 22, 104 30 C 110 36, 108 44, 118 40 M 14 56 C 50 52, 90 54, 128 50";

const STIL = `
@keyframes ke-imza-ciz{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes ke-imza-kalk{to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.18) rotate(-4deg)}}
@keyframes ke-imza-sol{to{opacity:0}}
@keyframes ke-imza-bas{0%{box-shadow:0 0 0 0 transparent}40%{box-shadow:0 0 0 6px color-mix(in srgb, ${V} 12%, transparent)}100%{box-shadow:0 0 0 0 transparent}}
`;

/* Giden sekmesinin ekrandaki yeri — kalkış hedefi. Bulunamazsa (dar ray, mobil) kâğıt yerinde
   solar; hedef uydurulmaz. */
function gidenHedefi() {
  if (typeof document === "undefined") return null;
  const btn = Array.from(document.querySelectorAll("[data-ray] button")).find((b) => /Giden/i.test(b.textContent || "") || /giden/i.test(b.getAttribute("aria-label") || ""));
  const r = btn?.getBoundingClientRect();
  return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** @param {{ kare: {rect: DOMRect, metin: string, ok: boolean|null, az: boolean}, onBitti: () => void }} p */
export default function TaslakImza({ kare, onBitti }) {
  const { rect, metin, ok, az } = kare;
  const [evre, setEvre] = useState("imza");   // imza → damga → kalkis | sol

  useEffect(() => {
    if (ok === false) { setEvre("sol"); const t = setTimeout(onBitti, 260); return () => clearTimeout(t); }
    if (ok !== true) { const t = setTimeout(onBitti, AZAMI_BEKLEME_MS); return () => clearTimeout(t); }
    // ok: önce imza, sonra mühür (gerçek sıra); damga imzanın son ilmeğiyle örtüşür.
    const t1 = setTimeout(() => setEvre("damga"), az ? 0 : DAMGA_AN);
    const t2 = setTimeout(() => setEvre("kalkis"), az ? 700 : KALKIS_AN);
    const t3 = setTimeout(onBitti, az ? 760 : KALKIS_AN + KALKIS_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [ok, az, onBitti]);

  const hedef = evre === "kalkis" && !az ? gidenHedefi() : null;
  const dx = hedef ? hedef.x - (rect.left + rect.width / 2) : 0;
  const dy = hedef ? hedef.y - (rect.top + rect.height / 2) : 0;
  const cikis = evre === "kalkis"
    ? (hedef ? `ke-imza-kalk ${KALKIS_MS}ms cubic-bezier(.55,0,.75,.4) forwards` : `ke-imza-sol ${KALKIS_MS}ms ease-out forwards`)
    : evre === "sol" ? "ke-imza-sol .24s ease-out forwards"
      : evre === "damga" ? "ke-imza-bas 360ms ease-out" : "none";
  const imzaGen = Math.min(170, rect.width * 0.34);

  return (
    <div aria-hidden="true" style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 70, pointerEvents: "none",
      overflow: "hidden", borderRadius: 4, "--dx": `${dx}px`, "--dy": `${dy}px`, transformOrigin: "center", animation: cikis }}>
      <style>{STIL}</style>
      <A4Belge metin={metin} />
      {/* Islak imza — kâğıdın sağ alt imza bölgesinde, tükenmez kalem mavisi. */}
      <svg viewBox="0 0 136 64" width={imzaGen} height={imzaGen * 64 / 136}
        style={{ position: "absolute", right: "12%", bottom: "16%", overflow: "visible" }}>
        <path d={PARAF} pathLength="1" fill="none" stroke={T} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 1, strokeDashoffset: az ? 0 : 1, animation: az ? "none" : `ke-imza-ciz ${IMZA_MS}ms cubic-bezier(.45,.05,.35,1) forwards` }} />
      </svg>
      {(evre === "damga" || evre === "kalkis") && (
        <span style={{ position: "absolute", right: "44%", bottom: `calc(16% + ${SP.s}px)` }}>
          <Damga ton={V} egim={-8} animasyon={!az}
            style={az ? null : { animation: "nu-damga .34s var(--ke-ease-spring) both" }}>Gönderildi</Damga>
        </span>
      )}
    </div>
  );
}
