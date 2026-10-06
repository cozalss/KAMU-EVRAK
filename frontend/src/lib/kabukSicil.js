/* kabukSicil — kenar çubuğu "Günlük sicil" bloğunun ve gezinme rozetlerinin saf türetimi
   (tur 6, A-kabuk). Yalnız kabuğun zaten tuttuğu durumdan: history (ts), outbox
   (gonderim_tarihi + durum), taslak sayısı, kuyruk SLA'sı. Tahmin yok; tarihsiz kayıt bugüne
   sayılmaz. Saf → node --test. */

const gunBasi = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** @param {number|undefined} ts @param {number} simdi */
export const bugunMu = (ts, simdi = Date.now()) => Number.isFinite(ts) && gunBasi(ts) === gunBasi(simdi);

/** Kuyrukta SLA durumu GECIKMIS olan evrak sayısı (KRITIK ayrı olgudur, sayılmaz).
    Durum bir ASCII KODDUR: tr-TR büyütme "gecikmis"i "GECİKMİS" yapıp eşleşmeyi kaçırırdı. */
export function gecikmisSay(kuyrukSla = []) {
  return kuyrukSla.filter((x) => String(x?.sla?.durum || "").toUpperCase() === "GECIKMIS").length;
}

export function sicilOzeti({ history = [], outbox = [], taslak = 0, gecikmis = 0, simdi = Date.now() }) {
  return {
    bugunIslenen: history.filter((h) => bugunMu(h?.ts, simdi)).length,
    bugunGiden: outbox.filter((o) => o?.durum === "gonderildi" && bugunMu(o?.gonderim_tarihi, simdi)).length,
    taslak,
    gecikmis,
  };
}

/** Defterin son kayıtları — ts'ye göre en yeni `adet` belge: { id, ts, ad }. Tarihsiz kayıt atlanır;
    ad = çıkarılan konu → ilk talep özeti → dosya adı (İşlenen defteriyle aynı sıra).
    Kenar çubuğu uzun ekranda (≥ 960 px) sicil altında "Son kayıtlar" olarak basar (1080p'de
    sicil ile Asistan arası ~280 px boş cilt kalıyordu — dolgu değil, defterin kendi verisi). */
const kayitAdi = (h) => String(h.result?.bilgi_unsurlari?.konu || h.result?.alt_talepler?.[0]?.ozet || h.konu || h.name || "Evrak").trim();
export function sonKayitlar(history = [], adet = 3) {
  const goruldu = new Set();
  return history
    .filter((h) => Number.isFinite(h?.ts))
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((h) => ({ id: h.id, ts: h.ts, ad: kayitAdi(h) }))
    .filter((k) => (goruldu.has(k.ad) ? false : goruldu.add(k.ad)))   // aynı belge yeniden işlendiyse tek satır
    .slice(0, adet);
}

/** Sorgu → kaynak durumu (tur 6 düzeltme). "ok": güncel veri · "bayat": son denemede hata,
    önbellekte SON BİLİNEN veri var · "yok": hata, veri HİÇ gelmedi · "bekliyor": ilk yükleme.
    Önceden yalnız isError'a bakılıyordu: veri hiç gelmediğinde sicil "SON BİLİNEN · 00" basıyordu
    (yanlış olgu — 00 son bilinen değil, bilinmeyendi). */
export function kaynakDurumu(q) {
  if (q?.data !== undefined) return q.isError ? "bayat" : "ok";
  return q?.isError ? "yok" : "bekliyor";
}

/* Bilinmeyen sayı null'dır (UI "—" çizer). Kaynak yokken canlı oturumda üretilmiş kayıt varsa
   sayı gösterilir ama bayat işaretlenir (alt sınır — kesin değil). */
const bilinen = (n, durum) => ((durum === "yok" || durum === "bekliyor") && !(n > 0) ? null : n);
const bayatMi = (durum) => durum === "bayat" || durum === "yok";

/** Kabuk sayaçları + sicil — her sayı KENDİ kaynağının durumunu taşır.
    kaynak: { islemler, giden, sla } (kaynakDurumu çıktıları). */
export function kabukSayaclari({ gelen, taslak, giden, kuyrukSla, history, outbox, kaynak, simdi = Date.now() }) {
  const k = { islemler: "ok", giden: "ok", sla: "ok", ...kaynak };
  const gecikmis = k.sla === "ok" || k.sla === "bayat" ? gecikmisSay(kuyrukSla) : null;
  const ham = sicilOzeti({ history, outbox, taslak, gecikmis: gecikmis ?? 0, simdi });
  const bayat = { taslak: bayatMi(k.islemler), giden: bayatMi(k.giden), gecikmis: bayatMi(k.sla) };
  return {
    sayac: { gelen, taslak: bilinen(taslak, k.islemler), giden: bilinen(giden, k.giden), gecikmis, bayat },
    sicil: {
      bugunIslenen: bilinen(ham.bugunIslenen, k.islemler),
      bugunGiden: bilinen(ham.bugunGiden, k.giden),
      taslak: bilinen(ham.taslak, k.islemler),
      gecikmis,
      son: sonKayitlar(history, 5),
    },
    bayat: bayat.taslak || bayat.giden || bayat.gecikmis,
  };
}
