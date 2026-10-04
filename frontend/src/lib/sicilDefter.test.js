import { test } from "node:test";
import assert from "node:assert/strict";
import { gunBasligi, gunleGrupla, bosDurumMetni, csvHucre, sicilDokumCsv, kayitNoAramaMetni } from "./sicilDefter.js";

const SIMDI = new Date(2026, 9, 3, 9, 0).getTime();   // 03.10.2026 Cuma 09:00

test("gunBasligi takvim gününe bakar: dün 23:50 'Dün', bugün 00:10 'Bugün'", () => {
  assert.equal(gunBasligi(new Date(2026, 9, 2, 23, 50).getTime(), SIMDI).etiket, "Dün");
  assert.equal(gunBasligi(new Date(2026, 9, 3, 0, 10).getTime(), SIMDI).etiket, "Bugün");
});

test("gunBasligi eski günde gün adı + mono tarih verir", () => {
  const g = gunBasligi(new Date(2026, 8, 29, 14, 0).getTime(), SIMDI);
  assert.deepEqual(g, { anahtar: "2026-09-29", etiket: "Salı", tarih: "29.09.2026" });
});

test("gunBasligi geçersiz zamanda 'Tarihsiz'", () => {
  assert.equal(gunBasligi(NaN, SIMDI).etiket, "Tarihsiz");
  assert.equal(gunBasligi(undefined, SIMDI).anahtar, "tarihsiz");
});

test("gunleGrupla bitişik aynı günleri birleştirir, sırayı korur", () => {
  const rows = [
    { id: 1, t: new Date(2026, 9, 3, 8).getTime() },
    { id: 2, t: new Date(2026, 9, 3, 7).getTime() },
    { id: 3, t: new Date(2026, 9, 1, 7).getTime() },
  ];
  const g = gunleGrupla(rows, (r) => r.t, SIMDI);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].rows.map((r) => r.id), [1, 2]);
  assert.equal(g[0].etiket, "Bugün");
  assert.equal(g[1].etiket, "Perşembe");
});

test("gunleGrupla boş/undefined listede boş dizi", () => {
  assert.deepEqual(gunleGrupla(undefined, (r) => r), []);
});

test("bosDurumMetni aranan ifadeyi geri söyler ve uzun ifadeyi kısaltır", () => {
  assert.match(bosDurumMetni({ ara: "  ruhsat " , nesne: "evrak" }).baslik, /“ruhsat” için evrak bulunamadı/);
  const uzun = bosDurumMetni({ ara: "x".repeat(80) }).baslik;
  assert.ok(uzun.includes("…") && uzun.length < 80);
});

test("bosDurumMetni aramasız filtre için gevşetme önerir", () => {
  const m = bosDurumMetni({ filtreVar: true, nesne: "gönderi", kalici: "gönderilen yazılar silinmez" });
  assert.equal(m.baslik, "Bu ölçütlerle gönderi yok");
  assert.match(m.sub, /gönderilen yazılar silinmez/);
});

test("csvHucre ayraç/tırnak içeren değeri tırnaklar, formülü etkisizleştirir", () => {
  assert.equal(csvHucre('a;"b"'), '"a;""b"""');
  assert.equal(csvHucre("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvHucre(null), "");
  assert.equal(csvHucre(0.87), "0.87");
});

test("sicilDokumCsv BOM + başlık + CRLF satırları üretir", () => {
  const csv = sicilDokumCsv([{ a: "İzin", b: 2 }], [{ baslik: "Konu", deger: (r) => r.a }, { baslik: "Sayı", deger: (r) => r.b }]);
  assert.ok(csv.startsWith("\uFEFFKonu;Sayı\r\n"));
  assert.ok(csv.endsWith("İzin;2\r\n"));
});

test("kayitNoAramaMetni: tam, sıfırlı ve sıfırsız sıra aranabilir", () => {
  const m = kayitNoAramaMetni("E-G-2026/0035");
  for (const q of ["E-G-2026/0035", "0035", "35", "2026/35"]) assert.ok(m.includes(q), q);
  assert.equal(kayitNoAramaMetni("geçici"), "geçici");
  assert.equal(kayitNoAramaMetni(null), "");
});
