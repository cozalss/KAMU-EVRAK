/* canliBicim — canlı işlem sahnesinin (İşleniyor) SAF biçim yardımcıları (tur 8, D-canli).

   TEK SAAT (tur 8 jüri bulgusu): satırda iki saat vardı — çalışırken istemci duvar saati
   ("1,9 sn"), masa bitince sunucu duration_ms'i ("<0,1 sn"). Sayı izleyicinin gözü önünde
   küçülüyor, yanındaki zaman çubuğu (istemci t0/t1) ise uzun kalıyordu. Sahnede artık tek ölçü
   vardır: izleyicinin GÖRDÜĞÜ süre, yani backend "başladı" olayından "bitti" olayına kadar
   geçen duvar süresi (t1 − t0, usePipeline damgaları). Sunucu telemetrisi (işlem süresi)
   yalnız adım detayında, ayrı etiketle gösterilir. Damga yoksa (eski yük) sunucu süresine
   düşülür — ölçüm yokluğu sıfır diye beyan edilmez. */
import { nodeDurationMs } from "./pipelinePhases.js";

/** İzleyicinin gördüğü süre (ms): t1 − t0; damga yoksa sunucu süresi; ikisi de yoksa null. */
export function duvarMs(a) {
  const t0 = Number(a?.t0), t1 = Number(a?.t1);
  if (a?.t0 != null && a?.t1 != null && Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) return t1 - t0;
  return nodeDurationMs(a);
}

/** Süre etiketi — her biten masada tutarlı: 0,1 sn altı "<0,1 sn", 10 sn üstü tam saniye. */
export function fmtSn(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 100) return "<0,1 sn";
  return ms < 10000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} sn` : `${Math.round(ms / 1000)} sn`;
}

/** Eşzamanlı grubun duvar süresi = en uzun dal. */
export function grupDuvarMs(items) {
  const olc = (items || []).map(duvarMs).filter((ms) => Number.isFinite(ms));
  return olc.length ? Math.max(...olc) : null;
}

/** Hattın duvar süresi: gruplar arası toplam, grup içi en uzun. */
export function akisDuvarMs(gruplar) {
  let toplam = null;
  for (const g of gruplar || []) {
    const ms = grupDuvarMs(g.items);
    if (ms != null) toplam = (toplam || 0) + ms;
  }
  return toplam;
}

const RISK_KOD = { yesil: "YEŞİL", sari: "SARI", kirmizi: "KIRMIZI" };

/** Yasal süre satırı: "-64" → "64 gün gecikmiş", "3" → "3 gün kaldı" (makine çıktısı "-64g" yok). */
export function slaSatiri(sla) {
  const d = String(sla?.durum || "").toLocaleUpperCase("tr-TR");
  if (!d || d.includes("TANIM")) return null;
  const ad = d.includes("GEC") ? "Gecikmiş" : (d.includes("KRİT") || d.includes("KRIT")) ? "Kritik" : d.includes("NORMAL") ? "Normal" : null;
  if (!ad) return null;
  const kg = Number(sla?.kalan_gun);
  if (sla?.kalan_gun == null || !Number.isFinite(kg)) return ad;
  if (kg < 0) return `${ad} · ${Math.abs(kg)} gün geçti`;
  return kg === 0 ? `${ad} · son gün bugün` : `${ad} · ${kg} gün kaldı`;
}

/** Sahne satırının çıktı metni — summarize çıktısını resmî dile çeker:
 *  · risk_guard: bant kodu BÜYÜK harf (MASTER kuralı), ölçü kısmı riskOlcuEtiketi'nden AYNEN;
 *  · sla_triyaj: "Gecikmiş · -64g" yerine "Gecikmiş · 64 gün geçti". */
export function sahneCiktisi(id, out, data) {
  const metin = String(out || "");
  if (id === "risk_guard") {
    const bant = data?.risk_metadata?.bant;
    if (!bant || !RISK_KOD[bant]) return metin;
    const [, ...olcu] = metin.split(" · ");
    return [RISK_KOD[bant], ...olcu].join(" · ");
  }
  if (id === "sla_triyaj") return slaSatiri(data?.sla_metadata) || metin;
  return metin;
}

/** Göreli koşum damgası (ms, runBase'e göre) → duvar saati "ss:dd:sn". Geçersizse "". */
export function kosumSaati(runBase, tRel, simdiPerf, simdiEpoch) {
  if (![runBase, tRel, simdiPerf, simdiEpoch].every(Number.isFinite) || runBase <= 0) return "";
  const d = new Date(simdiEpoch - (simdiPerf - (runBase + tRel)));
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Hata sebebi — sahne kutusu yalnız SUNUCU sebebini yazar; "X adımında durdu — " öneki
 *  (akisKatman.hataMesaji) ekran okuyucu/toast içindir, büyük başlıkta masa adı zaten var. */
export function hataSebebi(mesaj, etiket) {
  const m = String(mesaj || "");
  const onek = etiket ? `${etiket} adımında durdu — ` : "";
  return onek && m.startsWith(onek) ? m.slice(onek.length) : m;
}
