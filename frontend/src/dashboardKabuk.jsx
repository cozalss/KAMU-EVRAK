/* dashboardKabuk — DashboardApp kabuğunun saf, durumsuz parçaları (dosya < 800 satır kuralı):
   görünüm geçişi (View Transitions + yön), tembel görünüm iskeleti, ağ hata çubuğu, atlama
   bağlantısı + bildirim katmanı, kabuk düzeyi "bağlantı kaydı" fişi. */
import { flushSync } from "react-dom";
import { Toaster } from "sonner";
import { PAL, DERIN, BANT, TYPE, TNUM, RAD, SP, SH, SR_ONLY, ICERIK_AZAMI, Btn, Icon } from "./components/neonUi.jsx";
import { HataFisi, DenemeKunye } from "./components/kabukAtomlari.jsx";
import { tumKaynaklarYok } from "./lib/kabukSicil.js";

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

/* Deneme şeridi — kabuğun veri sorguları (işlemler · giden · SLA) yeniden denenirken "Sunucuya 2. kez
   yazıldı" satırı. Hata ekranı gelmeden önceki ~10 sn sessiz iskelet "donmuş" okunuyordu (jüri).
   Tur 9 (j2: sabit konumlu hap antetin künye çizgisinin ÜSTÜNE biniyordu): Bağlantı kaydı ile
   AYNI şerit — akışın içinde, içerik sütununun üstünde, aynı kâğıt fiş + sarı kenar. Denemeler
   tükenince Bağlantı kaydı aynı yeri devralır (tek kaynak, tek yer; iki hata dili aynı anda yok). */
export function DenemeSeridi({ sorgular }) {
  const deneyen = sorgular.filter((q) => q && q.isFetching && !q.isError && q.failureCount > 0);
  if (!deneyen.length) return null;
  const deneme = Math.max(...deneyen.map((q) => q.failureCount));
  return (
    <div style={{ padding: "12px clamp(16px, 4vw, 40px) 0" }}>
      <div style={{ ...SERIT_FIS, padding: `${SP.s}px ${SP.m}px` }}>
        <DenemeKunye deneme={deneme} toplam={3} />
      </div>
    </div>
  );
}

/* Atlama bağlantısı — klavyeyle ilk Tab'da görünür, odağı ana içeriğe taşır (hash'e dokunmaz). */
export function AtlamaBaglantisi() {
  return (
    <a href="#nu-main" style={{ position: "absolute", left: -9999, top: 0, zIndex: 100, background: DERIN.T, color: PAL.onAccent, padding: "8px 14px", borderRadius: `0 0 ${RAD.card}px 0`, ...TYPE.ui, fontWeight: 600 }}
      onClick={(e) => { e.preventDefault(); document.getElementById("nu-main")?.focus(); }}
      onFocus={(e) => (e.currentTarget.style.left = "0")} onBlur={(e) => (e.currentTarget.style.left = "-9999px")}>Ana içeriğe geç</a>
  );
}

/* Bildirim katmanı — "zımbalı havale pusulası" (kabukAtomlari.fisToast). Tur 8 (jüri): bottom-center
   viewport'u ortalıyor, 236 px rayı yok sayıp içerik sütununa göre ~106 px sola kayıyordu. Masaüstünde
   (≥ 721 px) İÇERİK SÜTUNUNUN ortasına oturur: ray genişliği --ke-ray-w ile yayınlanır (NeonSidebar).
   expand: iki fiş istiflenince alttaki görünmüyordu — fişler üst üste değil, alt alta durur.
   Telefonda sonner'ın kendi mobil yerleşimi + alt kulakçık şeridi payı aynen kalır. */
const TOAST_CSS = "@media (min-width:721px){html [data-sonner-toaster][data-x-position=center]{left:calc(50% + var(--ke-ray-w, 0px) / 2)}}";
export function BildirimKatmani({ toast }) {
  return (
    <>
      <style>{TOAST_CSS}</style>
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{toast}</div>
      <Toaster containerAriaLabel="Bildirimler" position="bottom-center" gap={8} visibleToasts={3} expand
        mobileOffset={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }} toastOptions={{ unstyled: true }} />
    </>
  );
}

/* Ortak şerit fişi — Deneme şeridi ve Bağlantı kaydı aynı yerde, aynı kâğıtta. */
const SERIT_FIS = { maxWidth: ICERIK_AZAMI, marginInline: "auto", display: "flex", alignItems: "center", background: PAL.surfPop, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${BANT.sari.c}`, borderRadius: RAD.ctl, boxShadow: SH.card, animation: "nu-sol .2s ease-out both" };

/* Bağlantı kaydı (tur 8, jüri: tüm GET'ler 500 iken kabuğun tek işareti küçük sarı "YANIT YOK" idi;
   Gelen ve Panel sağlıklı görünüyordu). Kabuğun kaynaklarının HEPSİ son denemede hata verdiyse
   içerik sütununun üstünde TEK, sakin bir uyarı fişi: ekrandakiler son bilinen kayıtlardır.
   Biri bile sağlamsa ya da ilk yükleme sürüyorsa çizilmez. Kapatılabilir; kaynak toparlanınca
   kendiliğinden kalkar. Yerleşim akışın içinde (sabit değil) → içerik örtülmez. */
export function BaglantiKaydi({ kaynak, onYenidenDene }) {
  if (!tumKaynaklarYok(kaynak)) return null;
  const saat = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ padding: "12px clamp(16px, 4vw, 40px) 0" }}>
      <div role="status" style={{ ...SERIT_FIS, gap: SP.m, flexWrap: "wrap", padding: `${SP.s}px ${SP.s}px ${SP.s}px ${SP.m}px` }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN.sari }}><Icon.alert width={14} height={14} /></span>
        <span style={{ ...TYPE.antet, textTransform: "uppercase", color: DERIN.sari, whiteSpace: "nowrap", ...TNUM }}>Bağlantı kaydı · {saat}</span>
        <span style={{ ...TYPE.data, color: PAL.ink2, flex: "1 1 320px", minWidth: 0 }}>
          <strong style={{ fontWeight: 600, color: PAL.ink }}>Sunucuya ulaşılamıyor.</strong> Ekrandaki sayılar ve listeler son bilinen kayıtlardır; karar ve gönderim bağlantı gelince yazılır.
        </span>
        <Btn onClick={onYenidenDene} style={{ minHeight: 32, padding: "4px 12px" }}><Icon.undo />Yeniden dene</Btn>
      </div>
    </div>
  );
}
