import { test } from "node:test";
import assert from "node:assert/strict";
import { talepKarari, paketOgeleri, paketGosterilir, paketOzeti } from "./yazismaPaketi.js";

test("DISARIDA talep: karar devir kurumudur; '(devir)' gösterim metni birim sayılmaz", () => {
  const k = talepKarari({ yetki: "DISARIDA", birim_ad: "ASKİ (devir)", yetkili_kurum_ad: "ASKİ Genel Müdürlüğü", birim_tr: "Mali Hizmetler" });
  assert.equal(k.tur, "devir");
  assert.equal(k.etiket, "Devir: ASKİ Genel Müdürlüğü");
});

test("ICERIDE talep: gerçek birim adı; 9'lu kategori karar gibi gösterilmez", () => {
  assert.equal(talepKarari({ yetki: "ICERIDE", birim_ad: "Fen İşleri Müdürlüğü", birim_tr: "İlgili Teknik Daire" }).etiket, "Birim: Fen İşleri Müdürlüğü");
  assert.equal(talepKarari({ birim_tr: "İlgili Teknik Daire" }).etiket, "");
  assert.equal(talepKarari({ yetki: "BELIRSIZ" }).tur, "belirsiz");
  assert.equal(talepKarari(null).etiket, "");
});

test("paket: boş metinli öğe atılır, rol etiketi ve talep kimlikleri korunur", () => {
  const r = { yazi_paketi: [
    { rol: "havale", muhatap: "FEN İŞLERİ MÜDÜRLÜĞÜNE", konu: "Yol", talep_ids: ["t1"], yazi_taslak_md: "T.C. ..." },
    { rol: "devir", muhatap: "ASKİ GENEL MÜDÜRLÜĞÜNE", konu: "Su", talep_ids: ["t2"], yazi_taslak_md: "T.C. ..." },
    { rol: "cevap", muhatap: "Sayın Ayşe Yılmaz", yazi_taslak_md: "T.C. ..." },
    { rol: "havale", yazi_taslak_md: "" },
    null,
  ] };
  const o = paketOgeleri(r);
  assert.equal(o.length, 3);
  assert.deepEqual(o.map((x) => x.rolEtiket), ["Birime havale", "Yetkili makama gönderme", "Başvurana cevap"]);
  assert.deepEqual(o[1].talepIds, ["t2"]);
  assert.equal(paketGosterilir(r), true);
  assert.equal(paketOzeti(o), "3 yazı: 1 havale, 1 devir, 1 başvurana yazı");
});

test("tek yazılık paket (ana taslağın kendisi) ayrıca gösterilmez; eski kayıt güvenli", () => {
  assert.equal(paketGosterilir({ yazi_paketi: [{ rol: "cevap", yazi_taslak_md: "x" }] }), false);
  assert.equal(paketGosterilir({}), false);
  assert.deepEqual(paketOgeleri({ yazi_paketi: "bozuk" }), []);
});
