import { test } from "node:test";
import assert from "node:assert/strict";
import { bugunMu, gecikmisSay, sicilOzeti } from "./kabukSicil.js";

const SIMDI = new Date(2026, 9, 6, 14, 30).getTime();
const DUN = new Date(2026, 9, 5, 23, 59).getTime();
const BUGUN_SABAH = new Date(2026, 9, 6, 0, 1).getTime();

test("bugunMu gün sınırında doğru; tarihsiz kayıt bugün sayılmaz", () => {
  assert.equal(bugunMu(BUGUN_SABAH, SIMDI), true);
  assert.equal(bugunMu(DUN, SIMDI), false);
  assert.equal(bugunMu(undefined, SIMDI), false);
  assert.equal(bugunMu(NaN, SIMDI), false);
});

test("gecikmiş yalnız GECIKMIS durumunu sayar (KRITIK değil), büyük-küçük harf duyarsız", () => {
  const k = [{ sla: { durum: "GECIKMIS" } }, { sla: { durum: "gecikmis" } }, { sla: { durum: "KRITIK" } }, { sla: null }, {}];
  assert.equal(gecikmisSay(k), 2);
  assert.equal(gecikmisSay(), 0);
});

test("sicil özeti: bugün işlenen + bugün GÖNDERİLEN (reddedilen giden sayılmaz)", () => {
  const s = sicilOzeti({
    history: [{ ts: BUGUN_SABAH }, { ts: SIMDI }, { ts: DUN }, {}],
    outbox: [{ durum: "gonderildi", gonderim_tarihi: SIMDI }, { durum: "reddedildi", gonderim_tarihi: SIMDI }, { durum: "gonderildi", gonderim_tarihi: DUN }],
    taslak: 6, gecikmis: 9, simdi: SIMDI,
  });
  assert.deepEqual(s, { bugunIslenen: 2, bugunGiden: 1, taslak: 6, gecikmis: 9 });
});

test("kaynakDurumu: veri+hata=bayat, hata+veri yok=yok, yükleniyor=bekliyor", async () => {
  const { kaynakDurumu } = await import("./kabukSicil.js");
  assert.equal(kaynakDurumu({ data: {}, isError: false }), "ok");
  assert.equal(kaynakDurumu({ data: {}, isError: true }), "bayat");
  assert.equal(kaynakDurumu({ data: undefined, isError: true }), "yok");
  assert.equal(kaynakDurumu({ data: undefined, isError: false }), "bekliyor");
});

test("kabukSayaclari: veri hiç gelmediyse sayı 00 değil null; SLA düşükken gecikmiş bilinmez", async () => {
  const { kabukSayaclari } = await import("./kabukSicil.js");
  const r = kabukSayaclari({ gelen: 15, taslak: 0, giden: 0, kuyrukSla: [], history: [], outbox: [], kaynak: { islemler: "yok", giden: "yok", sla: "yok" }, simdi: SIMDI });
  assert.deepEqual(r.sicil, { bugunIslenen: null, bugunGiden: null, taslak: null, gecikmis: null, son: [] });
  assert.equal(r.sayac.gecikmis, null);
  assert.equal(r.sayac.taslak, null);
  assert.equal(r.sayac.bayat.taslak, true);
  assert.equal(r.bayat, true);
});

test("kabukSayaclari: kaynaklar sağlamken sayılar gerçek ve bayat değil", async () => {
  const { kabukSayaclari } = await import("./kabukSicil.js");
  const r = kabukSayaclari({ gelen: 15, taslak: 6, giden: 2, kuyrukSla: [{ sla: { durum: "GECIKMIS" } }], history: [{ ts: SIMDI }], outbox: [], kaynak: {}, simdi: SIMDI });
  assert.deepEqual({ ...r.sicil, son: undefined }, { bugunIslenen: 1, bugunGiden: 0, taslak: 6, gecikmis: 1, son: undefined });
  assert.equal(r.bayat, false);
  assert.equal(r.sayac.gecikmis, 1);
});

test("kabukSayaclari: kaynak yokken canlı oturum kaydı alt sınır olarak gösterilir ama bayat", async () => {
  const { kabukSayaclari } = await import("./kabukSicil.js");
  const r = kabukSayaclari({ gelen: 15, taslak: 2, giden: 0, kuyrukSla: [], history: [], outbox: [], kaynak: { islemler: "yok" }, simdi: SIMDI });
  assert.equal(r.sayac.taslak, 2);
  assert.equal(r.sayac.bayat.taslak, true);
  assert.equal(r.sayac.bayat.giden, false);
});

test("sonKayitlar: en yeni önce, tarihsiz atlanır, aynı belge tek satır, ad konu→özet→name", async () => {
  const { sonKayitlar } = await import("./kabukSicil.js");
  const r = sonKayitlar([
    { id: 1, ts: DUN, name: "a.txt" },
    { id: 2, ts: SIMDI, result: { bilgi_unsurlari: { konu: "Su kesintisi" } } },
    { id: 5, ts: SIMDI - 1, result: { bilgi_unsurlari: { konu: "Su kesintisi" } } },
    { id: 3 },
    { id: 4, ts: BUGUN_SABAH, result: { alt_talepler: [{ ozet: "İzin talebi" }] } },
  ], 2);
  assert.deepEqual(r.map((x) => x.ad), ["Su kesintisi", "İzin talebi"]);
});

test("kabukSayaclari (tur 8): ilk yüklemede 'bekliyor' ile 'yok' ayrışır — UI aynı '—' glifini çizmesin", async () => {
  const { kabukSayaclari } = await import("./kabukSicil.js");
  const r = kabukSayaclari({ gelen: 15, taslak: 0, giden: 0, kuyrukSla: [], history: [], outbox: [], kaynak: { islemler: "bekliyor", giden: "yok", sla: "bekliyor" }, simdi: SIMDI });
  assert.equal(r.sayac.taslak, null);
  assert.equal(r.sayac.bekliyor.taslak, true);
  assert.equal(r.sayac.bekliyor.bugunIslenen, true);
  assert.equal(r.sayac.bekliyor.giden, false);      // yok ≠ bekliyor
  assert.equal(r.sayac.bekliyor.gecikmis, true);
  assert.equal(r.bayat, true);                      // giden yok → sicil başlığı yine uyarır
});

test("slaKaynakDurumu (tur 8): 200 ama sonuclar dizi değilse veri YOK sayılır (GECİKMİŞ 00 uydurulmaz)", async () => {
  const { slaKaynakDurumu } = await import("./kabukSicil.js");
  assert.equal(slaKaynakDurumu({ data: {}, isError: false }), "yok");
  assert.equal(slaKaynakDurumu({ data: { sonuclar: null }, isError: false }), "yok");
  assert.equal(slaKaynakDurumu({ data: { sonuclar: [] }, isError: false }), "ok");
  assert.equal(slaKaynakDurumu({ data: { sonuclar: [] }, isError: true }), "bayat");
  assert.equal(slaKaynakDurumu({ data: undefined, isError: false }), "bekliyor");
});

test("tumKaynaklarYok (tur 8): kabuk düzeyi 'sunucuya ulaşılamıyor' fişi yalnız HEPSİ yokken", async () => {
  const { tumKaynaklarYok } = await import("./kabukSicil.js");
  assert.equal(tumKaynaklarYok({ islemler: "yok", giden: "yok", sla: "yok" }), true);
  assert.equal(tumKaynaklarYok({ islemler: "bayat", giden: "yok", sla: "yok" }), true);
  assert.equal(tumKaynaklarYok({ islemler: "ok", giden: "yok", sla: "yok" }), false);
  assert.equal(tumKaynaklarYok({ islemler: "bekliyor", giden: "yok", sla: "yok" }), false);
});

test("sonKayitlar (tur 8): her satır İşlenen defteriyle AYNI sicil numarasını taşır", async () => {
  const { sonKayitlar } = await import("./kabukSicil.js");
  const yil = new Date(SIMDI).getFullYear();
  const r = sonKayitlar([{ id: "a", ts: DUN, name: "a.txt" }, { id: "b", ts: SIMDI, name: "b.txt" }], 2);
  assert.deepEqual(r.map((x) => x.no), [`İ-${yil}/0002`, `İ-${yil}/0001`]);
});

test("sicil başlığı satır durumundan türer: rakam varken 'Yanıt yok' basılmaz", async () => {
  const { sicilBaslikDurumu } = await import("./kabukSicil.js");
  const tam = { bugunIslenen: 0, bugunGiden: 0, taslak: 32, gecikmis: 1 };
  assert.deepEqual(sicilBaslikDurumu(tam, {}, false, "07.10"), { metin: "07.10", uyari: false });
  assert.deepEqual(sicilBaslikDurumu({ ...tam, gecikmis: null }, {}, true, "07.10"), { metin: "Kısmen · 07.10", uyari: true });
  assert.deepEqual(sicilBaslikDurumu(tam, {}, true, "07.10"), { metin: "Son bilinen", uyari: true });
  const bos = { bugunIslenen: null, bugunGiden: null, taslak: null, gecikmis: null };
  assert.equal(sicilBaslikDurumu(bos, {}, true, "07.10").metin, "Yanıt yok");
  // İlk yükleme: bekleyen satır "yok" sayılmaz.
  assert.equal(sicilBaslikDurumu(bos, { bugunIslenen: 1, bugunGiden: 1, taslak: 1, gecikmis: 1 }, false, "07.10").metin, "07.10");
});
