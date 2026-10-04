/* sampleDocs invariant testleri — `node --test src/lib/sampleDocs.test.js`.
   Bug avı bulgusu (2026-07-17): 4 örneğin id'si geçerli evrak türü değildi → /sla/onizleme
   türü "tanimsiz" sayıp SLA rozeti basmıyor, kategori "Diğer"e düşüyordu. Sözleşme:
   her örneğin ETKİN türü (tur ?? id) kanonik EVRAK_TURLERI kümesinde olmalı. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_DOCS } from "./sampleDocs.js";

// backend/agents/config.py EVRAK_TURLERI aynası (19 tür) — backend'den import edilemez
// (ayrı runtime); liste değişirse bilinçli olarak iki yerde güncellenir.
const EVRAK_TURLERI = new Set([
  "dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme", "cimer",
  "ust_yazi", "cevabi_yazi", "tebligat", "dava_evraki", "icra_evraki",
  "muzekkere", "fatura", "tutanak", "rapor", "gorus_mutalaa",
  "genelge_talimat_olur", "belirsiz",
]);
// Bilinçli istisna: çok-konulu demo evrakı tek türe indirgenmez (decompose yıldızı);
// SLA'sı "tanımsız" kalması kurgu gereğidir.
const ISTISNA = new Set(["cok_konulu"]);

test("her örneğin etkin türü (tur ?? id) kanonik evrak türü", () => {
  for (const s of SAMPLE_DOCS) {
    const etkin = s.tur ?? s.id;
    assert.ok(
      EVRAK_TURLERI.has(etkin) || ISTISNA.has(etkin),
      `örnek '${s.id}' → etkin tür '${etkin}' kanonik listede değil — SLA/kategori kırılır`,
    );
  }
});

test("örnek id'leri benzersiz ve metinler boş değil", () => {
  const idler = SAMPLE_DOCS.map((s) => s.id);
  assert.equal(new Set(idler).size, idler.length, "id çakışması — React key/işaretleme kırılır");
  for (const s of SAMPLE_DOCS) {
    assert.ok(typeof s.text === "string" && s.text.trim().length > 40, `örnek '${s.id}' metni boş/kısa`);
  }
});

// Görünen alanlar (label/konu/aciklama) memura gösterilir: geliştirici/test notu, emoji
// ve iç senaryo dili sızmamalı (tur4 jüri bulgusu: "sistem eksik alan bulamayınca yeşil
// geçer", "⭐", "(abstention)").
test("görünen alanlarda iç not, emoji ve yarışma dili yok", () => {
  const YASAK = [/⭐/u, /abstention/i, /\bsistem\b/i, /Görev [12]/u, /jüri/i, /şartname\s*§/iu, /\(KRİTİK süre\)/u, /süresi GEÇTİ/u, /yetkisizlik/i];
  for (const s of SAMPLE_DOCS) {
    for (const alan of ["label", "konu", "aciklama"]) {
      const v = String(s[alan] || "");
      assert.ok(v.length > 0, `örnek '${s.id}' ${alan} boş`);
      for (const re of YASAK) assert.ok(!re.test(v), `örnek '${s.id}' ${alan} iç ifade içeriyor: ${v}`);
    }
  }
});
