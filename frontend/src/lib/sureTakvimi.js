/* sureTakvimi — Panel yasal süre takviminin SAF çekirdeği (JSX/renk yok, node --test'te
   koşar; sunum SureTakvimi.jsx'te). Girdi Panel'in `kuyrukSla` dizisidir — takvim YENİ bir
   veri kaynağı kullanmaz, brifle bit-aynı diziyi okur. */

/* Durum → önem ağırlığı. Aynı güne birden çok evrak düşerse gün EN KÖTÜ duruma boyanır:
   normal ile gecikmiş aynı gündeyse memur kırmızıyı görmeli, yeşile boyamak riski gizler. */
export const DURUM_AGIRLIK = { NORMAL: 1, KRITIK: 2, GECIKMIS: 3 };

/* "dd.mm.yyyy" (backend sla_triyaj biçimi) → yerel Date. Biçim bozuksa ya da gün o ayda
   yoksa null: new Date(2026, 1, 31) sessizce 03.03'e KAYAR ve takvimde yanlış güne nokta
   koyardı — sessiz kayma yerine dürüst "işaretleme". */
export function trTarihAyristir(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const gun = Number(m[1]), ay = Number(m[2]), yil = Number(m[3]);
  const d = new Date(yil, ay - 1, gun);
  return d.getFullYear() === yil && d.getMonth() === ay - 1 && d.getDate() === gun ? d : null;
}

/* Gün kimliği — yerel takvim günü (UTC/ISO DEĞİL: ISO'ya çevirmek TR'de gece yarısı
   civarındaki tarihleri bir gün geriye kaydırırdı). */
export const gunAnahtar = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/* Gecikme cümlesi — takvim ve brifteki SLA satırı için TEK kaynak (aynı cümle iki yerde
   ayrı yazılırsa zamanla ayrışır). kalan_gun yoksa sayı basmaz. */
export function kalanMetin(sla) {
  const k = sla?.kalan_gun;
  if (sla?.durum === "GECIKMIS") return Number.isFinite(k) ? `${Math.abs(k)} gün gecikti` : "süresi doldu";
  if (!Number.isFinite(k)) return "süre tanımsız";
  return k === 0 ? "son gün bugün" : `son ${k} gün`;
}

/* kuyrukSla → Map<günAnahtarı, { tarih, ogeler, agirlik }>. Tarihi çözülemeyen evrak
   (durum "tarih_yok" ya da bozuk biçim) takvimde HİÇ görünmez — uydurma güne nokta koymak
   yalan olurdu; o evraklar brifteki "tarih doğrulanmalı" diliminde zaten sayılıyor. */
export function isaretHarita(kuyrukSla) {
  const harita = new Map();
  for (const x of kuyrukSla || []) {
    const d = trTarihAyristir(x?.sla?.son_tarih);
    if (!d) continue;
    const k = gunAnahtar(d);
    const kayit = harita.get(k) || { tarih: d, ogeler: [], agirlik: 0 };
    kayit.ogeler.push(x);
    kayit.agirlik = Math.max(kayit.agirlik, DURUM_AGIRLIK[x?.sla?.durum] || 1);
    harita.set(k, kayit);
  }
  return harita;
}

/* Ay ızgarası — Pazartesi başlangıçlı hücre dizisi; ay dışı hücreler null (komşu ayın
   günlerini soluk basmak yerine boş bırakılır: tıklanamaz gürültü eklemez). Uzunluk her
   zaman 7'nin katı. */
export function ayIzgarasi(ay) {
  const yil = ay.getFullYear(), no = ay.getMonth();
  const ofset = (new Date(yil, no, 1).getDay() + 6) % 7;      // Pazartesi = 0
  const gunSayisi = new Date(yil, no + 1, 0).getDate();
  const satir = Math.ceil((ofset + gunSayisi) / 7);
  return Array.from({ length: satir * 7 }, (_, i) => {
    const g = i - ofset + 1;
    return g >= 1 && g <= gunSayisi ? new Date(yil, no, g) : null;
  });
}
