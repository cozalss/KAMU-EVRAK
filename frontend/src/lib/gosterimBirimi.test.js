import { test } from "node:test";
import assert from "node:assert/strict";
import { BIRIM_SECILMEDI, gosterimBirimi, yonlendirmeBirimi } from "./gosterimBirimi.js";

test("backend gosterim_birimi varsa tek kaynak odur (devir metni dahil)", () => {
  const r = {
    gosterim_birimi: "Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü (devir)",
    hedef_kategori: "basin_halkla_iliskiler_cimer",
    servis_birimi: { ad: "Su ve Kanalizasyon Müdürlüğü" },
    yonlendirme: { karar: "DISARIDA", birim: null },
  };
  assert.equal(gosterimBirimi(r), r.gosterim_birimi);
  assert.equal(yonlendirmeBirimi(r), ""); // devirde kurum içi birim yok, kategori SIZMAZ
});

test("KARMA kararda kurum içi birim yonlendirme.birim'den gelir", () => {
  const r = {
    gosterim_birimi: "Fen İşleri Müdürlüğü",
    yonlendirme: { karar: "KARMA", birim: { ad: "Fen İşleri Müdürlüğü" } },
    servis_birimi: { ad: "Temizlik İşleri Müdürlüğü" },
  };
  assert.equal(yonlendirmeBirimi(r), "Fen İşleri Müdürlüğü");
});

test("yonlendirme alanı olmayan eski kayıtlar eski zincire düşer", () => {
  assert.equal(gosterimBirimi({ hedef_birim_oneri: "Mali Hizmetler" }), "Mali Hizmetler");
  assert.equal(gosterimBirimi({ hedef_kategori: "x" }), "x");
  assert.equal(gosterimBirimi(null), "");
});

test("yönlendirme var ama birim yoksa kaba kategori havale birimi gibi gösterilmez", () => {
  const r = { yonlendirme: { karar: "ICERIDE", birim: null }, hedef_kategori: "Basın-Halkla İlişkiler / Başvuru-Kayıt" };
  assert.equal(gosterimBirimi(r), BIRIM_SECILMEDI);
  assert.equal(yonlendirmeBirimi(r), "");
});
