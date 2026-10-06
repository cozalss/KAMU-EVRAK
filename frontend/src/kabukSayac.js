/* kabukSayac — kabuğun SLA önizlemesi + rozet/sicil sayaçları (tur 6, A-kabuk düzeltme).
   DashboardApp'tan ayrıldı (dosya 800 satır sınırının üstündeydi). İki iş:
     · useSlaOnizleme: statik örnek kuyruğun SLA'sı — BİR kez hesaplanır (react-query: geçici ağ
       hatasında kendini toparlar). Backend yoksa rozetler görünmez, kuyruk aynen çalışır.
     · useKabukSayac: her sayı KENDİ kaynağının durumunu taşır (lib/kabukSicil.kabukSayaclari).
       Veri hiç gelmediyse sayı null → UI "—" çizer; eskiden "SON BİLİNEN · 00" basılıyordu.
   Nesneler memo'lu — NeonSidebar React.memo'su her SSE tick'inde bozulmasın. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { kabukSayaclari, kaynakDurumu } from "./lib/kabukSicil.js";

async function slaGetir() {
  const r = await fetch("/sla/onizleme", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ogeler: SAMPLE_DOCS.map((s) => ({ id: s.id, tur: s.tur || s.id, metin: s.text })) }),
  });
  if (!r.ok) throw new Error(`İstek başarısız (${r.status})`);
  return r.json();
}

/** Kuyruk SLA önizlemesi: slaMap (id → sla_metadata, backend compute_sla tek kaynak) +
    Panel "süresi yaklaşan" kartı için gönderilmemiş örneklerin kuyrukSla listesi. */
export function useSlaOnizleme(sentSampleIds) {
  const slaQ = useQuery({ queryKey: ["sla-onizleme"], queryFn: slaGetir });
  const slaMap = useMemo(
    () => (slaQ.data ? Object.fromEntries((slaQ.data.sonuclar || []).map((x) => [x.id, x.sla_metadata])) : null),
    [slaQ.data]);
  const kuyrukSla = useMemo(() => (slaMap
    ? SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))
      .map((s) => ({ id: s.id, label: s.konu || s.label, sla: slaMap[s.id] }))
      .filter((x) => x.sla)
    : []), [slaMap, sentSampleIds]);
  return { slaQ, slaMap, kuyrukSla };
}

/** Rozet + sicil sayaçları; kaynak sorguları (islemlerQ/gidenQ/slaQ) durumlarıyla birlikte. */
export function useKabukSayac({ inboxCount, draftCount, gidenCount, kuyrukSla, history, outbox, islemlerQ, gidenQ, slaQ }) {
  const ki = kaynakDurumu(islemlerQ), kg = kaynakDurumu(gidenQ), ks = kaynakDurumu(slaQ);
  return useMemo(() => kabukSayaclari({
    gelen: inboxCount, taslak: draftCount, giden: gidenCount, kuyrukSla, history, outbox,
    kaynak: { islemler: ki, giden: kg, sla: ks },
  }), [inboxCount, draftCount, gidenCount, kuyrukSla, history, outbox, ki, kg, ks]);
}
