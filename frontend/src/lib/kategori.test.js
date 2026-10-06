import { test } from "node:test";
import assert from "node:assert/strict";
import { evrakKategori, etkinTur, KATEGORILER } from "./kategori.js";
import { ornekEvraklar } from "./sampleDocs.js";

const ornekler = ornekEvraklar(new Date("2026-10-06T09:00:00"));
const kat = (id) => {
  const s = ornekler.find((o) => o.id === id);
  assert.ok(s, `örnek yok: ${id}`);
  return evrakKategori({ evrak_turu: etkinTur(s), text: s.text, konu: s.konu });
};

test("CİMER talep başvurusu Bilgi Edinme sayılmaz (kanal ≠ rejim)", () => {
  assert.notEqual(kat("cimer_sokak_hayvanlari"), "bilgi_edinme");
});

test("moloz ihbarı içeriğinden Zabıta'ya düşer", () => {
  assert.equal(kat("ihbar_moloz_dokumu"), "zabita");
});

test("gerçek bilgi edinme ve şikâyet türleri korunur", () => {
  assert.equal(kat("bilgi_edinme_park_harcama"), "bilgi_edinme");
  assert.equal(kat("sikayet_atik_konteyner"), "sikayet");
});

test("CİMER beyan ettiği türü taşır", () => {
  const t = (x) => evrakKategori({ evrak_turu: "cimer", text: `Başvuru Türü: ${x}\nKonu: park` });
  assert.equal(t("Bilgi Edinme"), "bilgi_edinme");
  assert.equal(t("Şikayet"), "sikayet");
});

test("etkin tür örnek kimliğine değil tur alanına bakar", () => {
  assert.equal(etkinTur({ id: "cimer_sokak_hayvanlari", tur: "cimer" }), "cimer");
  assert.equal(etkinTur({ id: "dilekce" }), "dilekce");
});

test("kategori renkleri hex değil tema token'ı", () => {
  for (const k of KATEGORILER) assert.match(k.color, /^var\(--ke-[a-z0-9-]+\)$/);
});

test("her örnek bir kategoriye düşer", () => {
  for (const s of ornekler) assert.ok(kat(s.id));
});
