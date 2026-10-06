/* duzeltmeFarki — öneri farkını "düzeltme kalemi" bloklarına çevirir (saf; DOM yok, test edilir).

   Eski gösterim satır düzeyindeydi: tek kelime değişince bütün paragraf kırmızı üstü çizili +
   yeşil kopya olarak ikileniyordu ve memur neyin değiştiğini aramak zorunda kalıyordu (jüri
   tur 6). Şimdi: önce satır farkı (paragraf iskeleti), sonra ARKA ARKAYA gelen "silinen +
   eklenen" satır grubu kelime düzeyinde yeniden karşılaştırılır — sonuç tek paragraf, içinde
   yalnız değişen kelimeler işaretli. Eşlenmeyen silme/ekleme bütün blok olarak kalır.

   Çıktı: [{ tur: "ayni" | "degisti", parcalar: [{ tur: "ayni" | "sil" | "ekle", t }] }] */
import { diffLines, diffWordsWithSpace } from "diff";

const parcaTuru = (p) => (p.added ? "ekle" : p.removed ? "sil" : "ayni");

/* Kelime farkındaki ardışık aynı türden parçaları birleştirir (gürültüsüz işaretleme). */
function birlestir(parcalar) {
  const out = [];
  for (const p of parcalar) {
    if (!p.t) continue;
    const son = out[out.length - 1];
    if (son && son.tur === p.tur) out[out.length - 1] = { ...son, t: son.t + p.t };
    else out.push(p);
  }
  return out;
}

/* Tek boşluktan ibaret "aynı" köprüyü iki değişikliğin arasında eritir: "a b" → "x y" farkı
   "a"→"x", " ", "b"→"y" diye üç parçaya bölünmesin; okunur tek düzeltme olsun. */
function kopruEri(parcalar) {
  const out = [];
  for (let i = 0; i < parcalar.length; i += 1) {
    const p = parcalar[i];
    const onceki = parcalar[i - 1];
    const sonraki = parcalar[i + 1];
    if (p.tur === "ayni" && /^\s+$/.test(p.t) && onceki && sonraki && onceki.tur !== "ayni" && sonraki.tur !== "ayni") {
      out.push({ tur: "sil", t: p.t }, { tur: "ekle", t: p.t });
      continue;
    }
    out.push(p);
  }
  // sil/ekle sırasını grupla: [sil a][ekle x][sil b][ekle y] → [sil a b][ekle x y]
  const grup = [];
  let sil = ""; let ekle = "";
  const bosalt = () => { if (sil) grup.push({ tur: "sil", t: sil }); if (ekle) grup.push({ tur: "ekle", t: ekle }); sil = ""; ekle = ""; };
  for (const p of out) {
    if (p.tur === "sil") sil += p.t;
    else if (p.tur === "ekle") ekle += p.t;
    else { bosalt(); grup.push(p); }
  }
  bosalt();
  return grup;
}

/**
 * @param {string} eski mevcut metin
 * @param {string} yeni önerilen metin
 * @returns {{tur: "ayni"|"degisti", parcalar: {tur: "ayni"|"sil"|"ekle", t: string}[]}[]}
 */
export function duzeltmeBloklari(eski = "", yeni = "") {
  const satirlar = diffLines(String(eski ?? ""), String(yeni ?? ""));
  const bloklar = [];
  for (let i = 0; i < satirlar.length; i += 1) {
    const p = satirlar[i];
    const tur = parcaTuru(p);
    if (tur === "ayni") { bloklar.push({ tur: "ayni", parcalar: [{ tur: "ayni", t: p.value }] }); continue; }
    const sonraki = satirlar[i + 1];
    if (tur === "sil" && sonraki?.added) {
      const kelime = diffWordsWithSpace(p.value, sonraki.value).map((k) => ({ tur: parcaTuru(k), t: k.value }));
      bloklar.push({ tur: "degisti", parcalar: kopruEri(birlestir(kelime)) });
      i += 1;
      continue;
    }
    bloklar.push({ tur: "degisti", parcalar: [{ tur, t: p.value }] });
  }
  return bloklar;
}

/** Özet sayaç — "silinen→eklenen" çifti TEK düzeltme sayılır ("2 düzeltme"). */
export function duzeltmeSayisi(bloklar = []) {
  return bloklar.reduce((n, b) => n + b.parcalar.filter((p, i) => p.tur !== "ayni" && !(p.tur === "ekle" && b.parcalar[i - 1]?.tur === "sil")).length, 0);
}
