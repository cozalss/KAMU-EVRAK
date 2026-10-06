/* defterSozluk · defterArama · defterVade — üç evrak defterinin saf sözleşmeleri. */
import test from "node:test";
import assert from "node:assert/strict";
import { riskAdi, baslikCase, ortaElips, islenenSicilNolari, yinelemeDerkenari, defterZamani } from "./defterSozluk.js";
import { katla, jetonlar, eslesir, defterAra, vurguParcalari } from "./defterArama.js";
import { trTarih, vadeOlcusu, gunOlcegi, agirCeyrekEsigi, haftaCentikleri } from "./defterVade.js";

test("risk tek sözlükten — satırda insan dili, kod değil", () => {
  assert.equal(riskAdi("sari"), "Orta");
  assert.equal(riskAdi("kirmizi"), "Yüksek");
  assert.equal(riskAdi("yok"), "");
});

test("baslikCase Türkçe ilk harf (i → İ)", () => {
  assert.equal(baslikCase("park aydınlatma talebi"), "Park aydınlatma talebi");
  assert.equal(baslikCase("işyeri ruhsatı"), "İşyeri ruhsatı");
  assert.equal(baslikCase(""), "");
});

test("ortaElips kimliği ortadan kısaltır, kısa değere dokunmaz", () => {
  assert.equal(ortaElips("c8968145-3712-4026-ae2f-0f1e2d3c4b5a"), "c8968145…4b5a");
  assert.equal(ortaElips("kisa"), "kisa");
});

test("İşlenen sicil no — geliş sırasıyla, liste sırasından bağımsız, yıl başına sıfırlanır", () => {
  const items = [
    { id: "c", ts: new Date(2026, 9, 3, 12).getTime() },
    { id: "a", ts: new Date(2026, 9, 1, 9).getTime() },
    { id: "b", ts: new Date(2026, 9, 2, 9).getTime() },
    { id: "z", ts: new Date(2025, 11, 30).getTime() },
  ];
  const no = islenenSicilNolari(items);
  assert.equal(no.get("a"), "İ-2026/0001");
  assert.equal(no.get("b"), "İ-2026/0002");
  assert.equal(no.get("c"), "İ-2026/0003");
  assert.equal(no.get("z"), "İ-2025/0001");
  // Filtre/sıralama değişse de aynı kayıt aynı numara.
  assert.equal(islenenSicilNolari([...items].reverse()).get("c"), "İ-2026/0003");
});

test("yineleme derkenarı yalnız tekrarlanan kaynakta, geliş sırasıyla", () => {
  const items = [
    { id: "x3", ts: 30, k: "park" }, { id: "x1", ts: 10, k: "park" }, { id: "y", ts: 5, k: "bilgi" }, { id: "x2", ts: 20, k: "park" },
  ];
  const d = yinelemeDerkenari(items, (it) => it.k);
  assert.deepEqual(d.get("x1"), { sira: 1, toplam: 3 });
  assert.deepEqual(d.get("x3"), { sira: 3, toplam: 3 });
  assert.equal(d.has("y"), false);
});

test("defterZamani noktalı gg.aa + ss:dd", () => {
  const z = defterZamani(new Date(2026, 9, 3, 15, 7).getTime());
  assert.equal(z.gun, "03.10");
  assert.equal(z.saat, "15:07");
  assert.equal(defterZamani("x").gun, "");
});

test("katlama uzunluğu korur ve Türkçe harfleri indirger", () => {
  assert.equal(katla("Dilekçe İŞLEM ığüş"), "dilekce islem igus");
  assert.equal(katla("Işık").length, 4);
});

test("anlamsız sözcük tüm sorguyu düşürür (tüm sözcükler kipi)", () => {
  const metin = "Semt pazarı hijyen koşulları Kadıköy Belediyesi";
  assert.equal(eslesir(metin, jetonlar("zzqxy belediye")), false);
  assert.equal(eslesir(metin, jetonlar("belediye")), true);
  assert.equal(eslesir(metin, jetonlar("pazari kadikoy")), true);
});

test("yazım payı yalnız ≥5 harfte ve tek fark", () => {
  assert.equal(eslesir("Genel Dilekçe", jetonlar("dilekse")), true);
  assert.equal(eslesir("Genel Dilekçe", jetonlar("dlkce")), false);
  assert.equal(eslesir("park", jetonlar("perk")), false);
});

test("kayıt no sorgusu tam eşleşeni en üste alır", () => {
  const k = [{ no: "E-2026/0012", t: "7 numaralı kapı" }, { no: "E-2026/0007", t: "su" }];
  const r = defterAra(k, "7", (x) => x.t, (x) => x.no);
  assert.equal(r[0].no, "E-2026/0007");
  assert.equal(r.length, 2);
  assert.deepEqual(defterAra(k, "2026/7", (x) => x.t, (x) => x.no).map((x) => x.no), ["E-2026/0007"]);
});

test("vurgu parçaları özgün metni korur, katlanmış eşleşmeyi işaretler", () => {
  const p = vurguParcalari("Çevre dilekçesi", jetonlar("dilekce"));
  assert.equal(p.map((x) => x.t).join(""), "Çevre dilekçesi");
  assert.deepEqual(p.filter((x) => x.mark).map((x) => x.t), ["dilekçe"]);
});

test("vade ölçüsü süre/geçen/gecikme; eksik tarihte çizilmez", () => {
  assert.deepEqual(vadeOlcusu({ baslangic: "01.07.2026", son_tarih: "16.07.2026", kalan_gun: -10 }), { sure: 15, gecen: 15, gecikme: 10 });
  assert.deepEqual(vadeOlcusu({ baslangic: "01.07.2026", son_tarih: "31.07.2026", kalan_gun: 10 }), { sure: 30, gecen: 20, gecikme: 0 });
  assert.equal(vadeOlcusu({ son_tarih: "31.07.2026", kalan_gun: 3 }), null);
  assert.equal(trTarih("31.02.2026"), null);
});

test("ortak ölçek en uzun cetveli genişliğe sığdırır", () => {
  const k = gunOlcegi([{ sure: 15, gecikme: 67 }, { sure: 30, gecikme: 0 }, null], 164);
  assert.equal(k, 2);
  assert.equal(gunOlcegi([null], 100), 0);
});

test("ağır çeyrek eşiği — tint yalnız en ağır %25'e", () => {
  assert.equal(agirCeyrekEsigi([67, 64, 64, 60, 60, 47, 41, 36]), 64);
  assert.equal(agirCeyrekEsigi([5]), 5);
  assert.equal(agirCeyrekEsigi([]), Infinity);
  assert.deepEqual(haftaCentikleri(15), [7, 14]);
});
