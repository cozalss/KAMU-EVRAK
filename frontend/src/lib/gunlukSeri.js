/* gunlukSeri — Panel akış nabzı için gün-bazlı sayım: epoch ts listesinden son 7 günün
   günlük adetleri + bugün/dün sayıları + kaç FARKLI günde etkinlik olduğu (aktifGun —
   sparkline <2 aktif günde çizilmez, yarım grafik "bozuk" okunur). Gün indeksi Math.round
   ile hesaplanır → DST kaymalarına dayanıklı; geçersiz/eksik ts sessizce elenir. */
export const GUN_MS = 86_400_000;

export const gunBasi = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function gunlukSeri(tsList, simdi = Date.now()) {
  const bugun = gunBasi(simdi);
  const seri = Array.from({ length: 7 }, () => 0);
  let bugunN = 0, dunN = 0, aktifGun = 0;
  const gorulen = new Set();
  for (const ts of tsList) {
    if (!Number.isFinite(ts)) continue;
    const g = gunBasi(ts);
    const idx = 6 - Math.round((bugun - g) / GUN_MS);
    if (idx >= 0 && idx < 7) { seri[idx] += 1; if (!gorulen.has(idx)) { gorulen.add(idx); aktifGun += 1; } }
    if (g === bugun) bugunN += 1;
    else if (g === bugun - GUN_MS) dunN += 1;
  }
  return { seri, bugunN, dunN, aktifGun };
}
