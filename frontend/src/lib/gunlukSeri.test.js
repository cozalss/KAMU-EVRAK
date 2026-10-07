/* gunlukSeri testleri — gün penceresi/idx/delta kenarları (review bulgusu 8). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUN_MS, gunBasi, gunlukSeri, kiyasMetni, haftalikKiyas } from "./gunlukSeri.js";

// Sabit "şimdi": 2026-07-17 öğlen (yerel) — testler duvar saatinden bağımsız.
const SIMDI = new Date(2026, 6, 17, 12, 0, 0).getTime();
const BUGUN = gunBasi(SIMDI);

test("boş liste: sıfır seri, sıfır sayaçlar", () => {
  const r = gunlukSeri([], SIMDI);
  assert.deepEqual(r.seri, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(r.bugunN, 0);
  assert.equal(r.dunN, 0);
  assert.equal(r.aktifGun, 0);
});

test("bugün ve dün doğru kovaya düşer (seri[6]=bugün, seri[5]=dün)", () => {
  const r = gunlukSeri([SIMDI, SIMDI - 3600_000, SIMDI - GUN_MS], SIMDI);
  assert.equal(r.seri[6], 2);
  assert.equal(r.seri[5], 1);
  assert.equal(r.bugunN, 2);
  assert.equal(r.dunN, 1);
  assert.equal(r.aktifGun, 2);
});

test("7 günden eski kayıt seriye girmez; gün sınırı (6 gün önce) girer", () => {
  const r = gunlukSeri([BUGUN - 6 * GUN_MS + 1000, BUGUN - 7 * GUN_MS], SIMDI);
  assert.equal(r.seri[0], 1);
  assert.deepEqual(r.seri.slice(1), [0, 0, 0, 0, 0, 0]);
  assert.equal(r.aktifGun, 1);
});

test("gelecek tarihli ts seriye girmez, sayaçları bozmaz", () => {
  const r = gunlukSeri([SIMDI + 2 * GUN_MS], SIMDI);
  assert.deepEqual(r.seri, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(r.bugunN, 0);
});

test("geçersiz ts (undefined/null/NaN/string) sessizce elenir", () => {
  const r = gunlukSeri([undefined, null, NaN, "2026-07-17", SIMDI], SIMDI);
  assert.equal(r.seri[6], 1);
  assert.equal(r.aktifGun, 1);
});

test("aktifGun farklı gün sayısıdır, kayıt sayısı değil", () => {
  const r = gunlukSeri([SIMDI, SIMDI - 1000, SIMDI - 2000], SIMDI);
  assert.equal(r.seri[6], 3);
  assert.equal(r.aktifGun, 1);   // 3 kayıt ama tek gün → sparkline çizilmemeli
});

test("kiyasMetni: dün 0 → bugün 1 'dünle aynı' DEĞİL, +1", () => {
  assert.deepEqual(kiyasMetni({ bugunN: 1, dunN: 0 }), { metin: "+1 düne göre", yon: "artis" });
  assert.equal(kiyasMetni({ bugunN: 2, dunN: 2 }).metin, "dünle aynı");
  assert.equal(kiyasMetni({ bugunN: 0, dunN: 0 }).metin, "bugün henüz yok");
  assert.equal(kiyasMetni({ bugunN: 0, dunN: 3 }).metin, "-3 düne göre");
  assert.equal(kiyasMetni(null).metin, "anlık kuyruk");
});

/* Tur 8: akış nabzı tek zaman ölçeği — büyük rakam "son 7 gün", kıyas "önceki 7 gün". */
test("son7N ve onceki7N: iki ardışık 7 günlük pencere", () => {
  const r = gunlukSeri([SIMDI, BUGUN - 6 * GUN_MS + 1, BUGUN - 7 * GUN_MS + 1, BUGUN - 13 * GUN_MS + 1, BUGUN - 14 * GUN_MS + 1], SIMDI);
  assert.equal(r.son7N, 2);
  assert.equal(r.onceki7N, 2);   // 14 gün önceki pencere dışında
});

test("haftalikKiyas: fark önceki 7 güne göre, aynı ölçek", () => {
  assert.deepEqual(haftalikKiyas({ son7N: 26, onceki7N: 0 }), { metin: "ilk hafta · önceki 7 gün: 0", yon: "artis" });
  assert.deepEqual(haftalikKiyas({ son7N: 3, onceki7N: 5 }), { metin: "−2 · önceki 7 gün: 5", yon: "azalis" });
  assert.deepEqual(haftalikKiyas({ son7N: 9, onceki7N: 4 }), { metin: "+5 · önceki 7 gün: 4", yon: "artis" });
  assert.deepEqual(haftalikKiyas({ son7N: 4, onceki7N: 4 }), { metin: "önceki 7 günle aynı", yon: "sabit" });
  assert.deepEqual(haftalikKiyas({ son7N: 0, onceki7N: 0 }), { metin: "son 7 günde kayıt yok", yon: "sabit" });
  assert.equal(haftalikKiyas(null), null);
});
