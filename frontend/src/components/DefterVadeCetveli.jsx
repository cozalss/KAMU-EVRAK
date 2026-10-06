/* DefterVadeCetveli — Gelen defterinin "Yasal süre" hücresi: VADE CETVELİ.

   Ortak ölçekli ince cetvel (lib/defterVade): mavi bölüm yasal süredir — dolan kısım geçen
   gün (tükenmez mavisi), çentikler haftalar; son gün mürekkep çizgisiyle işaretli. Süre
   aşıldıysa KIRMIZI MÜREKKEP cetvelin dışına gecikme kadar uzar. Bütün satırlar aynı
   gün→piksel ölçeğini paylaşır: 67 gün ile 36 gün ilk bakışta ayrılır. Metin rengi kırmızı
   kalır (renk tek sinyal değil: sayı + cetvel boyu), tint zemin + uyarı ikonu YALNIZ en ağır
   çeyrekte — alarm yorgunluğu biter (jüri tur 6: 15 satırın 9'u aynı kırmızı çipti).
   Gecikme uzantısı da iki kademeli: en ağır çeyrekte dolu 4 px ACELE kırmızısı, kalanında
   2 px soluk kırmızı kılcal — boy (gecikme günü) korunur, renk yine ayırt eder.
   Hareket: cetvel soldan çizilir (scaleX, yalnız transform); reduced-motion global kapatır. */
import React from "react";
import { Icon, MONO, T, PAL, BANT, TYPE, TNUM, RAD, DERIN, ALFA } from "./neonUi.jsx";
import { haftaCentikleri } from "../lib/defterVade.js";

const CETVEL_CSS = `
@keyframes vc-ciz{from{transform:scaleX(0)}to{transform:none}}
[data-vc-cetvel]{transform-origin:0 50%;animation:vc-ciz .5s var(--ke-ease-out) calc(min(var(--sd-i,0), 5) * 30ms + 80ms) both}
`;
export const VadeStil = () => <style>{CETVEL_CSS}</style>;

function Cetvel({ olcu, k, agir }) {
  const sureW = Math.max(6, olcu.sure * k);
  const gecenW = Math.min(sureW, olcu.gecen * k);
  const tasmaW = olcu.gecikme * k;
  return (
    <span data-vc-cetvel="" aria-hidden="true" style={{ position: "relative", display: "block", height: 10, width: sureW + tasmaW, maxWidth: "100%" }}>
      <span style={{ position: "absolute", left: 0, top: 3, height: 4, width: sureW, borderRadius: 2, background: PAL.line }} />
      <span style={{ position: "absolute", left: 0, top: 3, height: 4, width: gecenW, borderRadius: 2, background: T, opacity: olcu.gecikme ? 0.55 : 0.9 }} />
      {haftaCentikleri(olcu.sure).map((g) => (
        <span key={g} style={{ position: "absolute", left: g * k, top: 2, width: 1, height: 6, background: PAL.surf, opacity: .9 }} />
      ))}
      <span style={{ position: "absolute", left: sureW - 1, top: 0, width: 1.5, height: 10, background: PAL.ink2 }} />
      {tasmaW > 0 && <span style={{ position: "absolute", left: sureW + 1, top: agir ? 3 : 4, height: agir ? 4 : 2, width: Math.max(2, tasmaW - 1), borderRadius: "0 2px 2px 0",
        background: agir ? BANT.kirmizi.c : `color-mix(in srgb, ${BANT.kirmizi.c} 45%, transparent)` }} />}
    </span>
  );
}

function SureMetni({ sla, agir }) {
  const gec = sla.durum === "GECIKMIS", kri = sla.durum === "KRITIK";
  const metin = gec ? `${Math.abs(sla.kalan_gun)} gün gecikti` : kri ? `son ${sla.kalan_gun} gün` : `${sla.kalan_gun} gün süre`;
  const renk = gec ? DERIN.kirmizi : kri ? DERIN.sari : PAL.mut2;
  if (gec && agir) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start", padding: "1px 7px 1px 6px", margin: "0 -7px 0 -6px", borderRadius: RAD.chip,
        background: ALFA(BANT.kirmizi.c), color: renk, ...TYPE.meta, fontWeight: 600, ...TNUM }}>
        <Icon.alert width={12} height={12} />{metin}
      </span>
    );
  }
  return <span style={{ ...TYPE.meta, fontWeight: gec || kri ? 600 : 500, color: renk, ...TNUM }}>{metin}</span>;
}

/** sla: backend compute_sla · olcu: vadeOlcusu(sla) · k: px/gün (ortak) · agir: en ağır çeyrek */
export default function VadeHucre({ sla, olcu, k, agir }) {
  if (!sla || sla.durum === "tanimsiz") return <span style={{ ...TYPE.meta, color: PAL.mut3 }} aria-label="Yasal süre tanımsız">—</span>;
  if (sla.durum === "tarih_yok") return <span title={sla.etiket} style={{ ...TYPE.meta, color: PAL.mut2, fontStyle: "italic" }}>tarih doğrulanmalı</span>;
  return (
    <span title={`${sla.etiket}; son tarih: ${sla.son_tarih || "?"} (${sla.mevzuat || "mevzuat"})`}
      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", minWidth: 0, width: "100%" }}>
      {olcu && k > 0 && <Cetvel olcu={olcu} k={k} agir={agir} />}
      <SureMetni sla={sla} agir={agir} />
      {sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM }}>son gün {sla.son_tarih}</span>}
    </span>
  );
}
