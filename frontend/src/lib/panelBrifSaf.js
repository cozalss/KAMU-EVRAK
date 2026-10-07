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

/* Kaynak durumu sözlüğü — panelKaynak ile AYNI ("bekliyor" · "ok" · "bayat" · "yok"). */
const KAYNAK_AD = { sla: "yasal süreler", islemler: "işlem geçmişi", giden: "giden sayısı" };
const hazirMi = (d) => d === "ok" || d === "bayat";
const birlestir = (adlar) => (adlar.length < 2 ? adlar.join("") : `${adlar.slice(0, -1).join(", ")} ve ${adlar[adlar.length - 1]}`);

/** Hata fişi cümleleri GERÇEK kaynak durumundan (tur 8 jüri: sabit "etkilenmedi" metinleri
 *  aynı ekranda birbirini yalanlıyordu). `saglam` yalnız veri GELMİŞ kaynaklar; yükleniyor olan
 *  "etkilenmedi" sayılmaz. Sağlam kaynak yoksa `saglamCumle` null → cümle hiç basılmaz. */
export function kaynakOzeti(kaynak = {}, kuyrukN = 0) {
  const anahtarlar = Object.keys(KAYNAK_AD).filter((k) => k in kaynak);
  const dusen = anahtarlar.filter((k) => kaynak[k] === "yok");
  const saglam = anahtarlar.filter((k) => hazirMi(kaynak[k]));
  /* Kuyruk yerel veridir (gelen kutusu) — sayısı biliniyorsa "etkilenmedi" listesinin başında. */
  const kuyruk = kuyrukN > 0 ? [`kuyruktaki ${kuyrukN} evrak`] : [];
  const adlar = (l) => l.map((k) => KAYNAK_AD[k]);
  const saglamAd = [...kuyruk, ...adlar(saglam)];
  return {
    dusen, saglam, hazirN: saglam.length, toplam: anahtarlar.length,
    dusenCumle: dusen.length ? `${birlestir(adlar(dusen))} alınamadı` : null,
    saglamCumle: saglamAd.length ? `${birlestir(saglamAd)} etkilenmedi` : null,
  };
}

/** Taslak paraf oranı — backend'in onay_durumu alanından (yerel türetme yok).
    "Bekliyor" süzgeci kabuğun taslak sayacıyla (kabukVeri.draftsFromHistory) BİREBİR aynı:
    onay_durumu BOŞ olan taslak bekler; dolu olan her değer (onaylandı/onaylandi/duzenlendi/
    reddedildi) karar verilmiştir. Tur 8 jüri: "onaylandi" ve "duzenlendi" bekliyor sayılınca
    nabız 33, kenar çubuğu 32 diyordu. */
export function parafOrani(taslaklar = []) {
  const say = { onaylandi: 0, reddedildi: 0, bekliyor: 0 };
  for (const h of taslaklar) {
    const d = h?.result?.onay_durumu;
    if (!d) say.bekliyor++;
    else if (d === "reddedildi") say.reddedildi++;
    else say.onaylandi++;
  }
  return { ...say, toplam: taslaklar.length };
}
