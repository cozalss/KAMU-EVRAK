/* dashboardKabuk — DashboardApp kabuğunun saf, durumsuz parçaları (dosya < 800 satır kuralı):
   görünüm geçişi (View Transitions + yön), tembel görünüm iskeleti, ağ hata çubuğu. */
import { flushSync } from "react-dom";
import { PAL, DERIN, TYPE, RAD, SP, SH, ALFA, BANT, Icon, focusRing, SR_ONLY } from "./components/neonUi.jsx";

// Görünüm geçişini View Transitions API ile sar: destekleyen tarayıcıda yumuşak
// çapraz-erime; destek yoksa ya da kullanıcı hareket azaltmışsa DÜZ geçiş (birebir eski
// davranış). flushSync: React güncellemesi geçiş kare-yakalaması içinde senkron uygulanmalı.
// yon: "ileri" (yeni görünüm) | "geri" (geçmiş gezintisi) → html[data-vt-yon] (styles/gecis.css
// geri yönü aynalar). Bayrak YALNIZ kendi geçişi bitince kalkar: ard arda geçişte önceki
// (atlanan) geçişin temizliği yenisinin yönünü silmesin diye sayaçla eşlenir.
let vtSayac = 0;
export const gecisle = (fn, yon = "ileri") => {
  const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!document.startViewTransition || az) { fn(); return; }
  const kok = document.documentElement;
  const no = ++vtSayac;
  kok.setAttribute("data-vt-yon", yon);
  const t = document.startViewTransition(() => { flushSync(fn); });
  const temizle = () => { if (vtSayac === no) kok.removeAttribute("data-vt-yon"); };
  t?.finished?.then(temizle, temizle);
  // Hızlı ard arda geçişte (sunucu görünümler arası hızlı tıklarsa) önceki geçiş SKIP edilir
  // ve .ready/.finished promise'leri "Transition was skipped" ile REJECT olur — yakalanmazsa
  // unhandled rejection (uncaught exception) olarak konsola düşer. Geçiş görsel; reddi yut.
  t?.ready?.catch(() => {});
  t?.finished?.catch(() => {});
  t?.updateCallbackDone?.catch(() => {});
};


// Tembel görünüm chunk'ı inerken (yalnız ilk geçişte) gösterilen İSKELET — ViewWrap'in
// antetiyle aynı ızgara: künye satırı · başlık · sağda eylem · çift çizgi · içerik blokları.
// Görünüm geldiğinde başlık ve çizgi aynı yerde durur → düzen kayması yok. 160 ms gecikmeyle
// belirir (önbellekten anında gelen chunk'ta hiç görünmez — yanıp sönme yok); yalnız opacity.
const ISKELET_BLOK = { background: PAL.surfHi, borderRadius: RAD.ctl };
export function ViewFallback() {
  return (
    <section aria-busy="true" style={{ padding: "28px clamp(16px, 4vw, 40px) 96px", minHeight: "calc(100vh - 1px)", animation: "nu-sol .2s ease-out .16s both" }}>
      <span role="status" style={SR_ONLY}>Görünüm yükleniyor</span>
      <div aria-hidden="true">
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m, height: 14 }}>
          <span style={{ ...TYPE.antet, color: PAL.mut3, whiteSpace: "nowrap" }}>T.C. · KAMU-EVRAK</span>
          <span style={{ flex: 1, height: 1, background: PAL.line }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
          <div style={{ ...ISKELET_BLOK, width: "min(280px, 60%)", height: 40 }} />
          <div style={{ ...ISKELET_BLOK, width: 132, height: 40 }} />
        </div>
        <div style={{ marginTop: SP.l, height: 5, borderTop: `2px solid ${PAL.line}`, borderBottom: `1px solid ${PAL.line}`, marginBottom: SP.xl + 4 }} />
        <div style={{ display: "grid", gap: SP.m }}>
          <div style={{ ...ISKELET_BLOK, height: 120, borderRadius: RAD.card }} />
          {[0, 1, 2, 3].map((k) => <div key={k} style={{ ...ISKELET_BLOK, height: 52, opacity: 1 - k * .18 }} />)}
        </div>
      </div>
    </section>
  );
}

// Hata çubuğu — SAĞ ALTA demirli (ortada canlı sahnenin havale pusulasının orta satırlarını
// örtüyordu, E ajanı ölçümü). Telefonda üstte, antetin altında: altta sabit Asistan düğmesi ve
// liste son satırının eylemleri var; sol 76 px = 64 px kenar rayı + boşluk (logo örtülmez). Genişlik içeriğe göre, en çok 440 px; uzun mesaj sarar.
const HATA_CSS = `.ke-hata{position:fixed;z-index:400;right:clamp(16px,3vw,32px);bottom:calc(24px + env(safe-area-inset-bottom));width:max-content;max-width:min(440px,calc(100vw - 32px));animation:nu-rise .22s var(--ke-ease-out) both}
@media (max-width:640px){.ke-hata{left:76px;right:12px;bottom:auto;top:calc(12px + env(safe-area-inset-top));width:auto;max-width:none}}
@media (pointer:coarse){.ke-hata button{min-height:44px;min-width:44px}}`;
export function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  return (
    // zIndex 400: uyarı katmanı HER yüzeyin üstünde — modal (300) veya sheet (320) açıkken
    // ağ hatası scrim arkasında görünmez kalıyordu; "Tekrar dene" her durumda erişilir.
    <div role="alert" className="ke-hata" style={{ background: PAL.surfPop, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${DERIN.kirmizi}`, borderRadius: RAD.pop, boxShadow: SH.modal, overflow: "hidden" }}>
      <style>{HATA_CSS}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: SP.m, background: ALFA(BANT.kirmizi.c), color: DERIN.kirmizi, padding: "12px 12px 12px 14px" }}>
        <span aria-hidden="true" style={{ display: "flex", paddingTop: 2 }}><Icon.alert /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPE.antet, marginBottom: 2 }}>İŞLEM DURDU</div>
          <div style={{ ...TYPE.data, color: PAL.ink, overflowWrap: "anywhere" }}>{msg}</div>
        </div>
        <div style={{ display: "flex", gap: SP.s, alignItems: "center", flexShrink: 0 }}>
          {canRetry && <button onClick={onRetry} {...focusRing} data-press="" style={{ cursor: "pointer", padding: "4px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: DERIN.kirmizi, ...TYPE.data, fontWeight: 600, transition: "transform .14s var(--ke-ease-out)" }}>Tekrar dene</button>}
          <button onClick={onDismiss} aria-label="Hata bildirimini kapat" {...focusRing} data-press="" style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 8px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "transparent", color: DERIN.kirmizi, transition: "transform .14s var(--ke-ease-out)" }}><Icon.x /></button>
        </div>
      </div>
    </div>
  );
}
