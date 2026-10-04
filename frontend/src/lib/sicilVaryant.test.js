/* sicilVaryant — aynı koşum tespiti + yazı türü varyant birikimi.
   Regresyon: persist gecikirken (islem_id yokken) tür değiştiren memur her seçimde
   İşlenen evrak'a YENİ satır açıyordu — aynı koşum islem_id'siz de tanınmalı. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ayniKosumMu, varyantOf, varyantBirlestir, sicilGrupla } from "./sicilVaryant.js";

const iz = { son_hash: "abc" };
const bilgi = { konu: "sefer sıklığı" };

test("aynı koşum: iç nesne referansları eşse islem_id OLMADAN da tanınır", () => {
  const onceki = { denetim_izi: iz, bilgi_unsurlari: bilgi, yazi_turu: "ust_yazi" };
  const yeni = { ...onceki, yazi_turu: "olur", yazi_taslak_md: "…" };   // applyTaslak shallow-merge
  assert.equal(ayniKosumMu(onceki, yeni), true);
});

test("farklı koşum: içerik aynı ama referanslar taze (JSON.parse) → tanınmaz", () => {
  const onceki = { denetim_izi: { son_hash: "abc" }, bilgi_unsurlari: { konu: "sefer sıklığı" } };
  const yeni = { denetim_izi: { son_hash: "abc" }, bilgi_unsurlari: { konu: "sefer sıklığı" } };
  assert.equal(ayniKosumMu(onceki, yeni), false);
});

test("iki tarafta da iç nesne yoksa undefined===undefined YANLIŞ birleşme yapmaz", () => {
  assert.equal(ayniKosumMu({ ozet: "a" }, { ozet: "b" }), false);
  assert.equal(ayniKosumMu(null, { denetim_izi: iz }), false);
});

test("varyantOf: taslaksız sonuç varyant üretmez", () => {
  assert.equal(varyantOf({ yazi_turu: "olur" }), null);
  assert.deepEqual(varyantOf({ yazi_turu: "olur", yazi_taslak_md: "m", format_uyumlu: true }),
    { yazi_turu: "olur", yazi_taslak_md: "m", format_uyumlu: true });
});

test("varyantBirlestir: ilk birleşmede satırın özgün taslağı tohumlanır, yeni tür eklenir", () => {
  const satir = { result: { yazi_turu: "ust_yazi", yazi_taslak_md: "üst", format_uyumlu: true } };
  const out = varyantBirlestir(satir, { yazi_turu: "olur", yazi_taslak_md: "olur-md", format_uyumlu: false });
  assert.deepEqual(out.map((v) => v.yazi_turu), ["ust_yazi", "olur"]);
});

test("varyantBirlestir: aynı tür yerinde güncellenir (dayanak eklemesi yeni seçenek değildir)", () => {
  const satir = {
    result: { yazi_turu: "olur", yazi_taslak_md: "v2" },
    varyantlar: [{ yazi_turu: "ust_yazi", yazi_taslak_md: "üst" }, { yazi_turu: "olur", yazi_taslak_md: "v1" }],
  };
  const out = varyantBirlestir(satir, { yazi_turu: "olur", yazi_taslak_md: "v2-dayanaklı" });
  assert.equal(out.length, 2);
  assert.equal(out[1].yazi_taslak_md, "v2-dayanaklı");
});

test("varyantBirlestir: taslaksız sonuç (persist zenginleşmesi) listeyi değiştirmez", () => {
  const satir = { result: { yazi_turu: "ust_yazi", yazi_taslak_md: "üst" } };
  const out = varyantBirlestir(satir, { islem_id: "X" });
  assert.deepEqual(out.map((v) => v.yazi_turu), ["ust_yazi"]);
});

test("sicilGrupla: aynı hash'in yinelenen satırları temsilcide birleşir, türler varyant olur", () => {
  const history = [   // en-yeni-önce (setHistory prepend sözleşmesi)
    { id: "3", result: { islem_id: "İ1", denetim_izi: { son_hash: "h1" }, yazi_turu: "olur", yazi_taslak_md: "olur-md", onay_durumu: "" } },
    { id: "2", result: { denetim_izi: { son_hash: "h1" }, yazi_turu: "cevabi_yazi", yazi_taslak_md: "cevap-md" } },   // islem_id'siz eski yinelenen
    { id: "1", result: { denetim_izi: { son_hash: "h1" }, yazi_turu: "ust_yazi", yazi_taslak_md: "üst-md" } },
    { id: "0", result: { islem_id: "İ2", denetim_izi: { son_hash: "h2" }, yazi_turu: "ust_yazi", yazi_taslak_md: "diğer" } },
  ];
  const out = sicilGrupla(history);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "3");   // temsilci = en yeni satır
  assert.deepEqual(out[0].varyantlar.map((v) => v.yazi_turu), ["olur", "cevabi_yazi", "ust_yazi"]);
  assert.deepEqual(out[1].varyantlar.map((v) => v.yazi_turu), ["ust_yazi"]);
});

test("sicilGrupla: anahtarsız satırlar (islem_id + hash yok) asla birleşmez", () => {
  const history = [
    { id: "b", result: { yazi_turu: "ust_yazi", yazi_taslak_md: "b-md" } },
    { id: "a", result: { yazi_turu: "ust_yazi", yazi_taslak_md: "a-md" } },
  ];
  assert.equal(sicilGrupla(history).length, 2);
});

test("sicilGrupla: temsilcinin birikmiş varyantları korunur, aynı türün en yenisi kalır", () => {
  const history = [
    { id: "2", varyantlar: [{ yazi_turu: "olur", yazi_taslak_md: "v2" }],
      result: { islem_id: "İ1", denetim_izi: { son_hash: "h1" }, yazi_turu: "olur", yazi_taslak_md: "v2" } },
    { id: "1", result: { denetim_izi: { son_hash: "h1" }, yazi_turu: "olur", yazi_taslak_md: "v1-eski" } },
  ];
  const out = sicilGrupla(history);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].varyantlar, [{ yazi_turu: "olur", yazi_taslak_md: "v2" }]);
});

test("sicilGrupla: aynı içerik hash'li FARKLI işlemler ayrı sicil satırıdır", () => {
  const history = [
    { id: "a", result: { islem_id: "İ1", denetim_izi: { son_hash: "h" }, yazi_taslak_md: "x" } },
    { id: "b", result: { islem_id: "İ2", denetim_izi: { son_hash: "h" }, yazi_taslak_md: "y" } },
    { id: "c", result: { denetim_izi: { son_hash: "h" }, yazi_taslak_md: "z" } },   // persist öncesi kopya
  ];
  const out = sicilGrupla(history);
  assert.equal(out.length, 2);
});
