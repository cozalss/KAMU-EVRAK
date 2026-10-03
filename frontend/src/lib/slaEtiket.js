/* SLA durumu → UI etiketi + bant rengi — UI genelinin TEK etiket kaynağı ("Gecikmiş · -1g").
   NeonDetayParts'tan buraya taşındı (2026-10): lib/nodeMeta yalnız bu iki fonksiyon için
   NeonDetayParts'ın tamamını (+ `diff` paketi, ~54 kB) çalışma alanı kabuğuna çekiyordu.
   NeonDetayParts eski içe aktarımlar kırılmasın diye bunları yeniden dışa aktarır. */
import { BANT, PAL } from "../components/neonUi.jsx";

export function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("TANIM")) return null;
  if (d.includes("GEC")) return { label: `Gecikmiş${gun}`, color: BANT.kirmizi.c };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `Kritik${gun}`, color: BANT.sari.c };
  if (d.includes("NORMAL")) return { label: `Normal${gun}`, color: BANT.yesil.c };
  return { label: sla.durum, color: PAL.mut };
}

/* Alt-talep SLA durumu → bant rengi (decompose çıktısındaki sla_durum alanı). */
export function subSlaRenk(durum) {
  const d = String(durum || "").toLocaleUpperCase("tr-TR");
  if (d.includes("GEC")) return BANT.kirmizi.c;
  if (d.includes("KRİT") || d.includes("KRIT")) return BANT.sari.c;
  if (d.includes("NORMAL")) return BANT.yesil.c;
  return null;
}
