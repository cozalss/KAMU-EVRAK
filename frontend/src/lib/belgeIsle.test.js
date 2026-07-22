/* belgeIsle regresyon testleri — `node --test src/lib/belgeIsle.test.js`.
   Sohbette belge işleme (FAZ 3): /process_doc yanıtını Görev-1 özetine çevirme +
   girdinin belge mi sorgu mu olduğunu ayırma. Saf mantık, bileşenden ayrık. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { belgeMetniMi, belgeOzetiMd, pipelineOlay } from "./belgeIsle.js";

test("belgeMetniMi: kısa sorgu belge değildir", () => {
  assert.equal(belgeMetniMi("son gelen evraklar"), false);
});

test("belgeMetniMi: uzun evrak gövdesi belgedir", () => {
  assert.equal(belgeMetniMi("A".repeat(200)), true);
});

test("belgeOzetiMd: tür/özet/birim/eksik/mevzuat/taslak satırlarını üretir", () => {
  const md = belgeOzetiMd({
    evrak_turu: "dilekce",
    ozet: "Park aydınlatma talebi.",
    hedef_birim: "Fen İşleri Müdürlüğü",
    eksik_alanlar: ["tarih"],
    mevzuat_onerileri: [{ baslik: "Dilekçe Hakkı Kanunu" }, { kanun_no: "4982" }],
    yazi_taslak_md: "T.C. ...",
  });
  assert.match(md, /Belge işlendi/);
  assert.match(md, /dilekce/);
  assert.match(md, /Park aydınlatma talebi/);
  assert.match(md, /Fen İşleri Müdürlüğü/);
  assert.match(md, /tarih/);
  assert.match(md, /Dilekçe Hakkı Kanunu/);
  assert.match(md, /taslağı üretildi/);
});

test("belgeOzetiMd: boş yanıt dürüst hata döndürür (uydurmaz)", () => {
  assert.match(belgeOzetiMd(null), /işlenemedi/);
});

test("belgeOzetiMd: eksik alanlar atlanır (satır uydurulmaz)", () => {
  const md = belgeOzetiMd({ evrak_turu: "belirsiz" });
  assert.match(md, /belirsiz/);
  assert.doesNotMatch(md, /Özet:/);
  assert.doesNotMatch(md, /mevzuat/);
});

test("pipelineOlay: node done → {tip:node}", () => {
  assert.deepEqual(pipelineOlay({ event: "node", node: "siniflandir", status: "done" }),
    { tip: "node", node: "siniflandir" });
});

test("pipelineOlay: node active yoksayılır (yalnız done ilerleme satırı)", () => {
  assert.equal(pipelineOlay({ event: "node", node: "oku", status: "active" }).tip, "yoksay");
});

test("pipelineOlay: done → sonuç, error → hata", () => {
  assert.deepEqual(pipelineOlay({ event: "done", result: { evrak_turu: "dilekce" } }),
    { tip: "sonuc", sonuc: { evrak_turu: "dilekce" } });
  assert.equal(pipelineOlay({ event: "error", message: "OCR hatası" }).tip, "hata");
});
