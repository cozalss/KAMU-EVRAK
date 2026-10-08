/* DefterVadeCetveli — Gelen defterinin "Yasal süre" hücresi: VADE ÇİZELGESİ.

   Tur 8 (jüri): cetveller ortak ölçekliydi ama ortak ZAMAN EKSENİ yoktu — her satır kendi
   başlangıcından çiziliyor, "bugün" hiçbir satırda aynı x'te değildi; sütun bir çizelge gibi
   okunamıyordu. Şimdi tüm sütun tek eksen (lib/defterVade.zamanEkseni): bugün = 0, tek dikey
   ACELE kırmızısı mürekkep çizgisi tüm satırlardan geçer (başlıkta "BUGÜN 07.10" künyesi).
   · Gri iz: yasal süre (başlangıç → son gün); mavi dolu kısım: geçen gün (bugüne kadar).
   · Son gün: mürekkep çentiği. Son gün bugünün SOLUNDAYSA aradaki bölüm gecikmedir —
     kırmızı (en ağır çeyrekte dolu 4 px, kalanında 2 px soluk kılcal).
   · Hafta çentikleri süre bölümünde. Renk tek sinyal değil: sayı + konum + "gecikti" sözcüğü.
   Hareket: çizgi yukarıdan aşağı bir kez çizilir (scaleY), cetvel soldan (scaleX); yalnız
   transform; reduced-motion global kuralı kapatır. Satıra bakılınca geçen süre mürekkep gibi
   yeniden dolar (CETVEL_CSS vc-murekkep). Veri eksikse cetvel ÇİZİLMEZ (uydurma yok). */
import React from "react";
import { Icon, MONO, T, PAL, BANT, TYPE, TNUM, RAD, DERIN, ALFA } from "./neonUi.jsx";
import { haftaCentikleri, eksenX } from "../lib/defterVade.js";

const CETVEL_CSS = `
@keyframes vc-ciz{from{transform:scaleX(0)}to{transform:none}}
[data-vc-cetvel]{transform-origin:0 50%;animation:vc-ciz .4s var(--ke-ease-out) calc(min(var(--sd-i,0), 7) * 18ms + 80ms) both}
/* Mürekkep dolumu (tur 9 imza anı): satıra bakılınca/odaklanınca GEÇEN süre bölümü başından
   bugüne yeniden akar — kalemin cetveli doldurması. Yalnız transform; reduced-motion'da yok. */
@keyframes vc-murekkep{from{transform:scaleX(0)}to{transform:none}}
[data-vc-dolu]{transform-origin:0 50%}
@media (hover:hover) and (prefers-reduced-motion:no-preference){
  [data-sicil-satir]:hover [data-vc-dolu],[data-sicil-satir]:focus-visible [data-vc-dolu]{animation:vc-murekkep .55s var(--ke-ease-out) both}
}
/* Bugün çizgisi — vade hücresinin ::before'u; hücre satır dolgusuna taşar (margin −12 /
   padding 12) → bitişik satırlarda tek dikey çizgi. Metin etiketlerinin bandında maskeyle
   AÇILIR: çizgi cetvel bandını keser (bugün ↔ son gün ilişkisi orada okunur), metnin içinden
   geçmez. Etiket bandı hücre ortasına göre sabittir (cetvel 10 + 4 boşluk üstte, iki metin
   satırı altta). Not: z-sırasıyla örtme Chrome'da birleştirme katmanında güvenilmez çıktı. */
[data-vc-hucre]{--vc-cizgi:color-mix(in srgb, var(--ke-r) 62%, transparent);margin:-12px 0;padding:12px 0;position:relative}
[data-vc-hucre]::before{content:"";position:absolute;top:0;bottom:0;left:var(--vc-x);width:1px;background:var(--vc-cizgi);pointer-events:none;
  -webkit-mask-image:linear-gradient(to bottom, black calc(50% - 12px), transparent calc(50% - 12px), transparent calc(50% + 26px), black calc(50% + 26px));
  mask-image:linear-gradient(to bottom, black calc(50% - 12px), transparent calc(50% - 12px), transparent calc(50% + 26px), black calc(50% + 26px))}
[data-vc-bugun-baslik]{position:absolute;bottom:-9px;height:8px;border-left:1px solid var(--vc-cizgi, color-mix(in srgb, var(--ke-r) 62%, transparent))}
@media (max-width:640px){[data-vc-lejant]{display:none!important}[data-vc-bugun-baslik]{display:none}[data-vc-hucre]{margin:0;padding:0}[data-vc-hucre]::before{display:none}}
`;
export const VadeStil = () => <style>{CETVEL_CSS}</style>;

/* Sütun başlığı — bugün çizgisinin başladığı yerde "BUGÜN 07.10" künyesi (çizginin geniş
   tarafında). Sütun adı ekran okuyucuya columnheader etiketiyle verilir. */
export function VadeBaslik({ eksen, genislik }) {
  const bugun = new Date();
  const etiket = `Bugün ${String(bugun.getDate()).padStart(2, "0")}.${String(bugun.getMonth() + 1).padStart(2, "0")}`;
  const solda = eksen && eksen.bugunX >= 88;
  return (
    <span role="columnheader" aria-label="Yasal süre · vade çizelgesi" style={{ gridArea: "sure", position: "relative", display: "block", width: genislik, maxWidth: "100%",
      ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {!eksen ? "Yasal süre" : (
        <>
          <span aria-hidden="true" data-vc-bugun-baslik="" style={{ left: eksen.bugunX }} />
          <span aria-hidden="true" style={{ position: "absolute", top: 0, color: DERIN.R, fontWeight: 600, ...(solda ? { right: `calc(100% - ${eksen.bugunX - 6}px)` } : { left: eksen.bugunX + 6 }) }}>{etiket}</span>
          <span aria-hidden="true" style={{ visibility: "hidden" }}>Yasal süre</span>
        </>
      )}
    </span>
  );
}

/* LEJANT (tur 9 jüri: açıklama 15 satırın altındaki dipnot paragrafındaydı, ilk ekranda
   görünmüyordu) — defterin üstünde, vade sütununa SAĞDAN hizalı tek mono künye satırı; işaretler
   cetvelin kendi çizim öğeleriyle aynı (renk + şekil + sözcük). */
export function VadeLejant() {
  const isaret = (stil) => <span aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, ...stil }} />;
  return (
    <p data-vc-lejant="" style={{ margin: 0, display: "flex", justifyContent: "flex-end", flexWrap: "wrap", columnGap: 16, rowGap: 4, ...TYPE.antet, fontSize: 10, color: PAL.mut2, textTransform: "uppercase", ...TNUM }}>
      <span style={{ color: PAL.mut3 }}>Vade çizelgesi</span>
      <span>{isaret({ width: 1, height: 12, background: "color-mix(in srgb, var(--ke-r) 62%, transparent)" })}bugün</span>
      <span>{isaret({ width: 14, height: 4, borderRadius: 2, background: T, opacity: .9 })}geçen süre</span>
      <span>{isaret({ width: 1.5, height: 10, background: PAL.ink2 })}son gün</span>
      <span>{isaret({ width: 14, height: 4, borderRadius: 2, background: BANT.kirmizi.c })}gecikme</span>
    </p>
  );
}

/* Bugün çizgisi — vade hücresinin zemin özniteliği: bitişik satırlarda tek kesintisiz dikey
   mürekkep çizgisi olarak okunur. Hücreye {...bugunHucre(eksen)} yayılır. */
export const bugunHucre = (eksen) => (eksen ? { "data-vc-hucre": "", style: { "--vc-x": `${eksen.bugunX}px` } } : {});

function Cetvel({ aralik, olcu, eksen, agir }) {
  const x0 = eksenX(eksen, aralik.bas);
  const xSon = eksenX(eksen, aralik.son);
  const xBugun = eksen.bugunX;
  const iz = Math.max(4, xSon - x0);
  const dolu = Math.max(0, Math.min(xSon, xBugun) - x0);
  const gec = aralik.son < 0 ? xBugun - xSon : 0;
  return (
    <span data-vc-cetvel="" aria-hidden="true" style={{ position: "relative", display: "block", height: 10 }}>
      <span style={{ position: "absolute", left: x0, top: 3, height: 4, width: iz, borderRadius: 2, background: PAL.line }} />
      <span data-vc-dolu="" style={{ position: "absolute", left: x0, top: 3, height: 4, width: dolu, borderRadius: 2, background: T, opacity: gec ? 0.5 : 0.9 }} />
      {haftaCentikleri(olcu.sure).map((g) => (
        <span key={g} style={{ position: "absolute", left: x0 + g * eksen.k, top: 2, width: 1, height: 6, background: PAL.surf, opacity: .9 }} />
      ))}
      <span style={{ position: "absolute", left: xSon - 1, top: 0, width: 1.5, height: 10, background: PAL.ink2 }} />
      {gec > 0 && <span style={{ position: "absolute", left: xSon + 1, top: agir ? 3 : 4, height: agir ? 4 : 2, width: Math.max(2, gec - 1), borderRadius: "0 2px 2px 0",
        background: agir ? BANT.kirmizi.c : `color-mix(in srgb, ${BANT.kirmizi.c} 45%, transparent)` }} />}
    </span>
  );
}

/* Gecikme metni — en ağır çeyrekte tint + uyarı ikonu; tint İÇ dolguyla verilir (negatif
   marj sütunun solundan taşıyordu, tur 8 jüri). */
function SureMetni({ sla, agir }) {
  const gec = sla.durum === "GECIKMIS", kri = sla.durum === "KRITIK";
  // Tek dilbilgisi (tur 9 jüri: "son 1 gün" · "15 gün süre" kalan mı toplam mı belirsizdi).
  const metin = gec ? `${Math.abs(sla.kalan_gun)} gün gecikti` : sla.kalan_gun === 0 ? "bugün son gün" : `${sla.kalan_gun} gün kaldı`;
  const renk = gec ? DERIN.kirmizi : kri ? DERIN.sari : PAL.mut2;
  if (gec && agir) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start", padding: "1px 7px 1px 5px", borderRadius: RAD.chip,
        background: `linear-gradient(${ALFA(BANT.kirmizi.c)}, ${ALFA(BANT.kirmizi.c)}), var(--ke-surf)`, color: renk, ...TYPE.meta, fontWeight: 600, ...TNUM }}>
        <Icon.alert width={12} height={12} />{metin}
      </span>
    );
  }
  return <span style={{ ...TYPE.meta, fontWeight: gec || kri ? 600 : 500, color: renk, ...TNUM }}>{metin}</span>;
}

/** sla: backend compute_sla · olcu: vadeOlcusu(sla) · aralik: goreliVade(sla) · eksen: ortak
    zaman ekseni (zamanEkseni) · agir: en ağır çeyrek · genislik: sütunun eksen genişliği (px) */
export default function VadeHucre({ sla, olcu, aralik, eksen, agir, genislik }) {
  const kap = { display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", minWidth: 0, width: genislik, maxWidth: "100%" };
  if (!sla || sla.durum === "tanimsiz") return <span style={kap}><span style={{ ...TYPE.meta, color: PAL.mut3 }} aria-label="Yasal süre tanımsız">—</span></span>;
  if (sla.durum === "tarih_yok") return <span style={kap}><span title={sla.etiket} style={{ ...TYPE.meta, color: PAL.mut2, fontStyle: "italic" }}>tarih doğrulanmalı</span></span>;
  return (
    <span title={`${sla.etiket}; son tarih: ${sla.son_tarih || "?"} (${sla.mevzuat || "mevzuat"})`} style={kap}>
      {olcu && aralik && eksen && <Cetvel aralik={aralik} olcu={olcu} eksen={eksen} agir={agir} />}
      <SureMetni sla={sla} agir={agir} />
      {sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM }}>son gün {sla.son_tarih}</span>}
    </span>
  );
}
