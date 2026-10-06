/* SesliSahne — sesli görüşme sahnesinin SUNUM parçaları (SesliGorusme.jsx'ten ayrıldı: o dosya
   800 satır sınırına 15 satır kalmıştı). Durum/akış/ses mantığı SesliGorusme'de; burada yalnız
   yerleşim sabitleri, durum künyesi, orb düğmesi ve kontroller.

   YERLEŞİM (tur 7): masaüstünde de sahne artık bir RIHTIM — sohbet panelinin malzemesiyle
   (surfPop · ince çizgi · modal gölge) aynı yüzey, panelin ayak izinde. Eskiden zeminsiz bir orb
   sütunuydu: kap saydam olduğu için "DİNLİYOR…" hapı, küre ve mikrofon Gelen evrak satırlarının
   kayıt no metninin ÜSTÜNE biniyordu (1440/1920 ölçümü) ve hâle kenar çubuğuna taşıyordu.
   Rıhtım tek, öngörülebilir bir dikdörtgen kaplar; arkada metin parlamaz. Küre yine zeminsiz
   (yuvarlak tabak YOK — kullanıcı kararı); ışığı rıhtımın içinde kalır (overflow:hidden). */
import React from "react";
import { DURUM } from "../lib/sesGorusme.js";
import SesliOrb from "./SesliOrb.jsx";
import { PAL, T, V, DERIN, SP, RAD, SH, EASE, TYPE, Icon, focusRing } from "./neonUi.jsx";

export const DURUM_ETIKET = {
  [DURUM.HAZIR]: "Hazır", [DURUM.DINLIYOR]: "Dinliyor",
  [DURUM.DUSUNUYOR]: "Düşünüyor", [DURUM.KONUSUYOR]: "Yanıtlıyor",
};

const RIHTIM = { background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, overflow: "hidden", pointerEvents: "auto", outline: "none" };

/* Masaüstü rıhtımı: künye · küre · kontroller dikey. Genişlik sohbet panelinden dar. */
export const MASA_GENISLIK = "min(264px, calc(100vw - 32px))";
export const MASA_ORB = "min(168px, calc(100vh - 300px))";
export const MASA_SAHNE = { ...RIHTIM, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.l, padding: `${SP.l}px ${SP.l}px ${SP.xl}px` };

/* Telefon: alt sekme şeridinin hemen üstünde YATAY rıhtım — orb solda, durum ve kontroller
   sağda (tur 6: dikey sütun 390 px'te kartın başlığını ve "İşle"yi örtüyordu). */
export const TELEFON_ORB = "88px";
export const TELEFON_DOK = { left: SP.s, right: SP.s, bottom: "calc(72px + env(safe-area-inset-bottom))" };
export const TELEFON_SAHNE = { ...RIHTIM, display: "flex", alignItems: "center", gap: SP.l, padding: `${SP.m}px ${SP.l}px` };

/* Durum künyesi — rıhtımın antet satırı: mono künye + durum noktası (metin her durumda yazılı;
   renk tek sinyal değil). Rıhtım zaten yüzey: künye ikinci bir hap/gölge taşımaz. */
export function DurumKunyesi({ durum, ortala = false }) {
  const konusuyor = durum === DURUM.KONUSUYOR, dinliyor = durum === DURUM.DINLIYOR, dusunuyor = durum === DURUM.DUSUNUYOR;
  return (
    <div aria-hidden="true" style={{ position: "relative", zIndex: 1, alignSelf: ortala ? "stretch" : "auto", display: "flex", alignItems: "center", justifyContent: ortala ? "center" : "flex-start", gap: SP.s, ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: RAD.dot, flexShrink: 0, background: konusuyor ? V : dinliyor ? T : dusunuyor ? DERIN.T : PAL.mut3, animation: dinliyor || dusunuyor ? "nu-think 1.2s ease-in-out infinite" : "none" }} />
      <span>Sesli görüşme</span>
      <span aria-hidden="true">·</span>
      <span style={{ color: PAL.ink2, fontWeight: 600 }}>{DURUM_ETIKET[durum]}{dinliyor ? "…" : ""}</span>
    </div>
  );
}

/* ORB — dokununca konuşmayı keser (barge-in). data-press yalnız gerçekten tıklanabilirken. */
export function SesliOrbDugme({ boyut, konusuyor, kes, dusunuyor, azHareket, orbRef, haloRef, parlaRef }) {
  return (
    <button type="button" onClick={kes} {...(konusuyor ? { "data-press": "" } : {})}
      aria-label={konusuyor ? "Yanıtı durdur" : "Sesli görüşme küresi"} {...focusRing}
      style={{ position: "relative", pointerEvents: "auto", width: boyut, aspectRatio: "1 / 1", flexShrink: 0, borderRadius: RAD.dot, border: "none", background: "none", padding: 0, cursor: konusuyor ? "pointer" : "default" }}>
      <SesliOrb dusunuyor={dusunuyor} azHareket={azHareket} orbRef={orbRef} haloRef={haloRef} parlaRef={parlaRef} />
    </button>
  );
}

/* Kontroller — sustur + bitir (açık zeminde: PAL token'ları, yarı saydam siyah değil). */
export function SesliKontroller({ susturuldu, susturDegistir, kapat }) {
  return (
    <div style={{ position: "relative", zIndex: 1, pointerEvents: "auto", display: "flex", alignItems: "center", gap: SP.l, flexShrink: 0 }}>
      <button type="button" data-press onClick={susturDegistir} aria-pressed={susturuldu} aria-label={susturuldu ? "Susturmayı kaldır" : "Mikrofonu sustur"} {...focusRing}
        style={{ cursor: "pointer", width: 44, height: 44, borderRadius: RAD.dot, border: `1px solid ${susturuldu ? DERIN.R : PAL.lineHi}`, background: susturuldu ? DERIN.R : PAL.surf, color: susturuldu ? PAL.onAccent : PAL.ink2, display: "grid", placeItems: "center", transition: `background .14s ${EASE.out}, color .14s ${EASE.out}` }}>
        {susturuldu ? <Icon.micOff /> : <Icon.mic width={17} height={17} />}
      </button>
      <button type="button" data-press onClick={kapat} aria-label="Sesli görüşmeyi bitir" {...focusRing}
        style={{ cursor: "pointer", width: 48, height: 48, borderRadius: RAD.dot, border: "none", background: DERIN.R, color: PAL.onAccent, display: "grid", placeItems: "center", boxShadow: SH.card }}>
        <Icon.x width={19} height={19} />
      </button>
    </div>
  );
}
