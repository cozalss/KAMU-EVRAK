/* panelBrifSaf — Panel (sabah brifi) görünümünün SAF yardımcıları (JSX/renk yok; node --test).
   Tur 6 jüri raporundan doğan kurallar tek yerde ve testli durur:
   · Tarih biçimi resmî yazışmadaki gibi NOKTALI ("03.10 15:57") — feed, rapor ve defter aynı
     ayırıcıyı kullanır (toLocaleString tr-TR "03/10 15:57" basıyordu).
   · Kronometre şeridi ölçeği: her ölçüm, ortalama ve eşik AYNI sabit eksende yüzde konum alır.
   · Takvim gün satırı: günün EN ACİL evrakı + ek sayısı (haftanın günü adı bilgi taşımıyordu).
   · Kıyaslama çöküşü: iki pencere aynı ölçüm kümesini kapsıyorsa tek satır.
   · Paraf: kullanıcının ad-soyadından baş harfler (Türkçe büyük harf). */

const iki = (n) => String(n).padStart(2, "0");

/** "gg.aa ss:dd" — geçersiz/eksik ts'de boş dizge (1970 basılmaz). */
export function noktaliGunSaat(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts);
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** "ss:dd" — geçersizse boş. */
export function noktaliSaat(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts);
  return `${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** "gg.aa.yyyy ss:dd" — paraf kapanışındaki hazırlanma damgası. */
export function noktaliTamTarih(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts);
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/* Kronometre ekseni — 0'dan tavana. Tavan en uzun ölçümün VE eşiğin üstüne yuvarlanır ki
   eşik çizgisi hiçbir zaman eksenin dışına düşmesin. Adım ölçeğe göre (küçük sürede 0,5 sn). */
export function kronometreEksen(msList, esik) {
  const enUzun = Math.max(0, ...(msList || []).filter(Number.isFinite), Number.isFinite(esik) ? esik : 0);
  const sn = enUzun / 1000;
  if (sn <= 0) return { tavanSn: 1, adimSn: 0.5 };
  const adimSn = sn <= 2 ? 0.5 : sn <= 10 ? 2 : sn <= 40 ? 5 : 10;
  return { tavanSn: Math.ceil((sn * 1.04) / adimSn) * adimSn, adimSn };
}

/** ms → eksende yüzde konum [0, 100]. */
export function eksenYuzde(ms, tavanSn) {
  if (!Number.isFinite(ms) || !Number.isFinite(tavanSn) || tavanSn <= 0) return 0;
  return Math.max(0, Math.min(100, (ms / 1000 / tavanSn) * 100));
}

/** Eksen işaretleri (sn): 0, adım, 2×adım … tavan. En çok 6 işaret — sıkışırsa adım ikiye katlanır. */
export function eksenIsaretleri(tavanSn, adimSn) {
  if (!(tavanSn > 0) || !(adimSn > 0)) return [0];
  let adim = adimSn;
  while (tavanSn / adim > 5) adim *= 2;
  const out = [];
  for (let v = 0; v <= tavanSn + 1e-9; v += adim) out.push(Number(v.toFixed(2)));
  return out;
}

/** Takvim gün satırı: en acil evrak (kalan_gun artan; tanımsız sona) + kaç evrak daha. */
export function gunEnAcil(ogeler) {
  const liste = [...(ogeler || [])].sort((a, b) => {
    const ka = Number.isFinite(a?.sla?.kalan_gun) ? a.sla.kalan_gun : Infinity;
    const kb = Number.isFinite(b?.sla?.kalan_gun) ? b.sla.kalan_gun : Infinity;
    return ka - kb;
  });
  return { enAcil: liste[0] || null, ek: Math.max(0, liste.length - 1) };
}

/** İki dönem penceresi aynı ölçüm kümesini mi kapsıyor? (tek satıra çökme koşulu) */
export function kiyasCoker(hafta, ay) {
  if (!hafta || !ay) return false;
  return hafta.n === ay.n && !ay.trend;
}

/** Paraf baş harfleri — "ayşe yılmaz" → "AY" (Türkçe büyük harf, en çok 3 harf). */
export function parafHarf(adSoyad) {
  const parcalar = String(adSoyad || "").trim().split(/\s+/).filter(Boolean);
  if (!parcalar.length) return "—";
  return parcalar.slice(0, 3).map((p) => p.charAt(0).toLocaleUpperCase("tr")).join("");
}
