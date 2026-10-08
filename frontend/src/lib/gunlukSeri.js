/* gunlukSeri — Panel akış nabzı için gün-bazlı sayım: epoch ts listesinden son 7 günün
   günlük adetleri + bugün/dün sayıları + kaç FARKLI günde etkinlik olduğu (aktifGun —
   sparkline <2 aktif günde çizilmez, yarım grafik "bozuk" okunur). Gün indeksi Math.round
   ile hesaplanır → DST kaymalarına dayanıklı; geçersiz/eksik ts sessizce elenir. */
export const GUN_MS = 86_400_000;

export const gunBasi = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function gunlukSeri(tsList, simdi = Date.now()) {
  const bugun = gunBasi(simdi);
  const seri = Array.from({ length: 7 }, () => 0);
  let bugunN = 0, dunN = 0, aktifGun = 0, onceki7N = 0;
  const gorulen = new Set();
  for (const ts of tsList) {
    if (!Number.isFinite(ts)) continue;
    const g = gunBasi(ts);
    const idx = 6 - Math.round((bugun - g) / GUN_MS);
    if (idx >= 0 && idx < 7) { seri[idx] += 1; if (!gorulen.has(idx)) { gorulen.add(idx); aktifGun += 1; } }
    else if (idx >= -7 && idx < 0) onceki7N += 1;
    if (g === bugun) bugunN += 1;
    else if (g === bugun - GUN_MS) dunN += 1;
  }
  return { seri, bugunN, dunN, aktifGun, son7N: seri.reduce((a, x) => a + x, 0), onceki7N };
}

/* Akış hücresinin kıyas satırı — GERÇEK farktan üretilir. Eskiden fark ancak ≥2 aktif günde
   yazılıyor, aksi hâlde "dünle aynı" basılıyordu: dün 0 → bugün 1 iken de (tur4 bulgusu).
   yon: "artis" | "azalis" | "sabit" | null (kıyas yok). */
export function kiyasMetni(g) {
  if (!g) return { metin: "anlık kuyruk", yon: null };
  const fark = g.bugunN - g.dunN;
  if (fark > 0) return { metin: `+${fark} düne göre`, yon: "artis" };
  if (fark < 0) return { metin: `${fark} düne göre`, yon: "azalis" };
  return g.bugunN > 0 ? { metin: "dünle aynı", yon: "sabit" } : { metin: "bugün henüz yok", yon: "sabit" };
}

/* Tur 8 — akış nabzının TEK zaman ölçeği: büyük rakam "son 7 gün", kıyas önceki 7 günle.
   (Eskiden toplam + "−26 düne göre" aynı hücredeydi: "33 mü azaldı?" diye okunuyordu.)
   Eksi işareti tipografik (U+2212). */
export function haftalikKiyas(g) {
  if (!g) return null;
  const fark = g.son7N - g.onceki7N;
  /* Tur 8 jüri: "+33 önceki 7 güne göre" belirsizdi — önceki dönemin değeri açıkça yazılır;
     önceki 7 gün boşsa kıyas yok, "ilk hafta" denir. */
  /* Tur 9 jüri: kıyas yokken "artis" yeşil basılıp olumlu sinyal veriyordu → nötr. */
  if (fark > 0 && g.onceki7N === 0) return { metin: `ilk hafta · önceki 7 gün: 0`, yon: "notr" };
  if (fark > 0) return { metin: `+${fark} · önceki 7 gün: ${g.onceki7N}`, yon: "artis" };
  if (fark < 0) return { metin: `−${-fark} · önceki 7 gün: ${g.onceki7N}`, yon: "azalis" };
  return g.son7N > 0 ? { metin: "önceki 7 günle aynı", yon: "sabit" } : { metin: "son 7 günde kayıt yok", yon: "sabit" };
}
