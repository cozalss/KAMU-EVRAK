/* dashboardKabuk — DashboardApp kabuğunun saf, durumsuz parçaları (dosya < 800 satır kuralı):
   görünüm geçişi (View Transitions + yön), tembel görünüm iskeleti, ağ hata çubuğu. */
import { flushSync } from "react-dom";
import { PAL, TYPE, RAD, SP, SH, SR_ONLY, ICERIK_AZAMI } from "./components/neonUi.jsx";
import { HataFisi, DenemeKunye } from "./components/kabukAtomlari.jsx";

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
      <div aria-hidden="true" style={{ maxWidth: ICERIK_AZAMI, marginInline: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m, height: 14 }}>
          <span style={{ ...TYPE.antet, color: PAL.mut3, whiteSpace: "nowrap" }}>KAMU-EVRAK</span>
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
// örtüyordu). Tur 6: kendi lehçesi ("İŞLEM DURDU" kırmızı tint çubuk) yerine ortak HataFisi'nin
// kompakt hâli — sistemde tek hata dili. Telefonda üstte; ray yerine alt şerit olduğundan sol
// boşluk 12 px (eski 76 px = kenar rayı payıydı). Genişlik içeriğe göre, en çok 440 px.
const HATA_CSS = `.ke-hata{position:fixed;z-index:400;right:clamp(16px,3vw,32px);bottom:calc(24px + env(safe-area-inset-bottom));width:min(440px,calc(100vw - 32px))}
@media (max-width:720px){.ke-hata{left:12px;right:12px;bottom:auto;top:calc(12px + env(safe-area-inset-top));width:auto}}
@media (pointer:coarse){.ke-hata button{min-height:44px;min-width:44px}}`;
export function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  // zIndex 400: uyarı katmanı HER yüzeyin üstünde — modal (300) veya sheet (320) açıkken ağ hatası
  // scrim arkasında görünmez kalıyordu; "Tekrar dene" her durumda erişilir.
  return (
    <div className="ke-hata">
      <style>{HATA_CSS}</style>
      <HataFisi kompakt onKapat={onDismiss} onYenidenDene={canRetry ? onRetry : undefined} yenidenDeneEtiket="Tekrar dene">{msg}</HataFisi>
    </div>
  );
}

/* Deneme şeridi — kabuğun veri sorguları (işlemler · giden · SLA) yeniden denenirken üstte mono
   "Sunucuya 2. kez yazıldı" satırı. Hata ekranı gelmeden önceki ~10 sn sessiz iskelet "donmuş"
   okunuyordu (jüri). Yalnız deneme SÜRERKEN görünür; denemeler tükenince görünümün kendi hata
   fişi devralır (aynı anda iki hata dili yok). Yerleşimi kaydırmaz (sabit, üstte, ortalı). */
const DENEME_CSS = `.ke-deneme{position:fixed;z-index:390;top:calc(10px + env(safe-area-inset-top));left:0;right:0;margin-inline:auto;width:max-content;max-width:calc(100vw - 32px);pointer-events:none}`;
export function DenemeSeridi({ sorgular }) {
  const deneyen = sorgular.filter((q) => q && q.isFetching && !q.isError && q.failureCount > 0);
  if (!deneyen.length) return null;
  const deneme = Math.max(...deneyen.map((q) => q.failureCount));
  return (
    <div className="ke-deneme">
      <style>{DENEME_CSS}</style>
      <div style={{ background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, boxShadow: SH.card, padding: `${SP.m}px ${SP.m}px 0` }}>
        <DenemeKunye deneme={deneme} toplam={3} />
      </div>
    </div>
  );
}
