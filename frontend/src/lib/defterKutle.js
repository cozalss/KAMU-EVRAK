/* defterKutle — sicil defterinde bir kovanın (gün grubu) KÜTLE DURUMU (saf).

   Tur 8 jüri: İşlenen'de 32/33 satır aynı "Karar bekliyor · Orta" taşıyordu; iki sütun
   neredeyse sıfır bilgi veriyor, istisnayı (Onaylandı, süresi geçmiş) gömüyordu. Defterci
   çözümü: kova başlığı kütleyi bir kez söyler, aynı değeri taşıyan satır "aynen" (〃) işareti
   basar, satırda yalnız SAPAN yazılı kalır.

   Kural (temkinli): kova en az KUTLE_ASGARI_SATIR kayıt taşımalı ve en sık değer kovanın en
   az KUTLE_ASGARI_PAY'ını kapsamalı; yoksa o alan için kütle YOK (her satır kendi değerini
   yazar — azınlığı "aynen"e boğmayız). Boş değer kütle olamaz. */

export const AYNEN = "〃";
export const KUTLE_ASGARI_SATIR = 3;
export const KUTLE_ASGARI_PAY = 0.6;

function enSik(rows, al) {
  const say = new Map();
  for (const r of rows) { const v = al(r); if (v) say.set(v, (say.get(v) || 0) + 1); }
  let deger = null, n = 0;
  for (const [v, c] of say) if (c > n) { deger = v; n = c; }
  return { deger, n };
}

/** @param {{_durum?:string, bant?:string}[]} rows
    @returns {{durum:string|null, durumSay:number, risk:string|null, riskSay:number}} */
export function kovaKutlesi(rows) {
  const bos = { durum: null, durumSay: 0, risk: null, riskSay: 0 };
  if (!Array.isArray(rows) || rows.length < KUTLE_ASGARI_SATIR) return bos;
  const esik = Math.ceil(rows.length * KUTLE_ASGARI_PAY);
  const d = enSik(rows, (r) => r._durum);
  const k = enSik(rows, (r) => r.bant);
  return {
    durum: d.n >= esik ? d.deger : null, durumSay: d.n >= esik ? d.n : 0,
    risk: k.n >= esik ? k.deger : null, riskSay: k.n >= esik ? k.n : 0,
  };
}
