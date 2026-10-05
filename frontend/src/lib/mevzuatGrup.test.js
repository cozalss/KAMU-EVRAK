import { test } from "node:test";
import assert from "node:assert/strict";
import { mevzuatBolumleri } from "./mevzuatGrup.js";

test("mevzuatBolumleri: eski yolda tek başlıksız bölüm (önceki görünüm)", () => {
  const { gruplu, bolumler } = mevzuatBolumleri([{ baslik: "a" }, { baslik: "b" }], {});
  assert.equal(gruplu, false);
  assert.equal(bolumler.length, 1);
  assert.deepEqual(bolumler[0].ogeler.map((o) => o.sira), [1, 2]);
});

test("mevzuatBolumleri: talep başına gruplar, usulü ayırır, bulunamayan talebi işaretler", () => {
  const mev = [
    { baslik: "5393 m.14", talep_id: "t1", katman: "esas" },
    { baslik: "3071 m.4", katman: "usul" },
  ];
  const r = {
    bilgi_unsurlari: { talep_kumesi: [{ id: "t1", ozet: "Çukurun kapatılması" }, { id: "t2", ozet: "Su faturası itirazı" }] },
    mevzuat_talep_durumu: [{ talep_id: "t1", bulundu: true }, { talep_id: "t2", bulundu: false }],
  };
  const { gruplu, bolumler } = mevzuatBolumleri(mev, r);
  assert.equal(gruplu, true);
  assert.deepEqual(bolumler.map((b) => [b.tur, b.baslik, b.bulunamadi]), [
    ["esas", "1. talep · Çukurun kapatılması", false],
    ["esas", "2. talep · Su faturası itirazı", true],
    ["usul", "Başvuru usulü ve cevap süresi", false],
  ]);
  assert.equal(bolumler[2].ogeler[0].sira, 2);
});

test("mevzuatBolumleri: öneri yok ama durum var → yalnız bulunamadı bölümü", () => {
  const { bolumler } = mevzuatBolumleri([], { mevzuat_talep_durumu: [{ talep_id: "t1", bulundu: false }] });
  assert.equal(bolumler.length, 1);
  assert.equal(bolumler[0].baslik, "Talebin konusu");
  assert.equal(bolumler[0].bulunamadi, true);
});
