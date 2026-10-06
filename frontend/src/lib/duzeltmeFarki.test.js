import test from "node:test";
import assert from "node:assert/strict";
import { duzeltmeBloklari, duzeltmeSayisi } from "./duzeltmeFarki.js";

const metinOf = (bloklar, tur) => bloklar.flatMap((b) => b.parcalar).filter((p) => p.tur === tur).map((p) => p.t).join("|");

test("tek kelime değişince paragraf ikilenmez — yalnız kelime işaretlenir", () => {
  const eski = "T.C.\nBilgilerinize sunulur.\nYetkili İmza\n";
  const yeni = "T.C.\nBilgilerinize rica ederim.\nYetkili İmza\n";
  const b = duzeltmeBloklari(eski, yeni);
  const degisen = b.filter((x) => x.tur === "degisti");
  assert.equal(degisen.length, 1, "tek düzeltme bloğu");
  assert.match(metinOf(b, "sil"), /sunulur/);
  assert.match(metinOf(b, "ekle"), /rica ederim/);
  // Değişmeyen kelime bloğun içinde "ayni" kalır, silinmiş gibi işaretlenmez.
  assert.ok(degisen[0].parcalar.some((p) => p.tur === "ayni" && p.t.includes("Bilgilerinize")));
});

test("metin yeniden kurulabilir: ayni+sil = eski, ayni+ekle = yeni", () => {
  const eski = "Konu: Park\n\nİlgi dilekçe incelenmiştir.\nGereğini arz ederim.\n";
  const yeni = "Konu: Park aydınlatma\n\nİlgi dilekçe dikkatle incelenmiştir.\nGereğini arz ederim.\n";
  const b = duzeltmeBloklari(eski, yeni);
  const kur = (atla) => b.flatMap((x) => x.parcalar).filter((p) => p.tur !== atla).map((p) => p.t).join("");
  assert.equal(kur("ekle"), eski);
  assert.equal(kur("sil"), yeni);
});

test("eşlenmeyen ekleme bütün blok olarak kalır", () => {
  const b = duzeltmeBloklari("A\n", "A\nYeni paragraf.\n");
  assert.equal(metinOf(b, "ekle"), "Yeni paragraf.\n");
  assert.equal(metinOf(b, "sil"), "");
});

test("aynı metinde düzeltme yok", () => {
  const b = duzeltmeBloklari("X\nY\n", "X\nY\n");
  assert.equal(duzeltmeSayisi(b), 0);
});

test("ardışık iki kelime değişimi tek okunur düzeltmede birleşir", () => {
  const b = duzeltmeBloklari("bir iki üç\n", "bir dört beş\n");
  const p = b[0].parcalar;
  assert.deepEqual(p.map((x) => x.tur), ["ayni", "sil", "ekle", "ayni"].slice(0, p.length));
});

test("silinen→eklenen çifti tek düzeltme sayılır", () => {
  const b = duzeltmeBloklari("Gereğini arz ederim.\nX\n", "Gereğini rica ederim.\nX\n");
  assert.equal(duzeltmeSayisi(b), 1);
});
