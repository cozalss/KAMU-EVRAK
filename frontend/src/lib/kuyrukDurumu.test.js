/* kuyrukDurumu — DB işlem geçmişinden Gelen Evrak kuyruk durumu türetimi.
   Sözleşme: örnek evrak DB'de baslik=`${id}.txt` (usePipeline runSample) ya da
   oturum geçmişinde name=label ile görünür; onay_durumu dolu = karar verilmiş
   (onaylandi/reddedildi/duzenlendi) → kuyruğa bir daha düşmez. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleAdIndex, kuyrukDurumuTuret } from "./kuyrukDurumu.js";

const DOCS = [
  { id: "basvuru", label: "İşyeri Açma Başvurusu" },
  { id: "talep", label: "Yıllık İzin Talebi" },
  { id: "ihbar", label: "Ruhsatsız Yapı İhbarı" },
];

test("sampleAdIndex güncel öneki, eski adı ve etiketi id'ye eşler", () => {
  const idx = sampleAdIndex(DOCS);
  assert.equal(idx.get("ornek-basvuru.txt"), "basvuru");   // güncel ad (runSample)
  assert.equal(idx.get("basvuru.txt"), "basvuru");          // eski kayıtlar (legacy)
  assert.equal(idx.get("İşyeri Açma Başvurusu"), "basvuru");
  assert.equal(idx.get("bilinmeyen.txt"), undefined);
});

test("işlenen örnek processed'a, karar verilmiş örnek sent'e düşer", () => {
  const idx = sampleAdIndex(DOCS);
  const items = [
    { name: "basvuru.txt", result: { onay_durumu: "onaylandi" } },
    { name: "talep.txt", result: { onay_durumu: "" } },
    { name: "İşyeri Açma Başvurusu", result: { onay_durumu: "reddedildi" } }, // oturum kaydı (label)
    { name: "serbest-dosya.pdf", result: { onay_durumu: "onaylandi" } },      // örnek değil → yok sayılır
  ];
  const { processed, sent } = kuyrukDurumuTuret(items, idx);
  assert.deepEqual([...processed].sort(), ["basvuru", "talep"]);
  assert.deepEqual([...sent], ["basvuru"]);
});

test("duzenlendi kararı da gönderilmiş sayılır", () => {
  const idx = sampleAdIndex(DOCS);
  const { sent } = kuyrukDurumuTuret(
    [{ name: "ihbar.txt", result: { onay_durumu: "duzenlendi" } }], idx);
  assert.deepEqual([...sent], ["ihbar"]);
});

test("boş/bozuk girdilerde çökmez", () => {
  const idx = sampleAdIndex(DOCS);
  assert.deepEqual(kuyrukDurumuTuret(null, idx).processed.size, 0);
  assert.deepEqual(kuyrukDurumuTuret([{}, { name: null }, { name: "talep.txt" }], idx).processed.size, 1);
});
