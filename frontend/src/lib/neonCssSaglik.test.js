/* neonUi.jsx içindeki KÜRESEL CSS metninin (NEON_KEYFRAMES) sağlık sınavı.

   NEDEN VAR — 2026-08-12'de gerçekten olan hata: bloğa yorum eklerken açılış `/*` unutuldu,
   geriye dangling bir kapanış kaldı ve düz metin CSS'in içine düştü. JS tarafı KUSURSUZ
   derlendi (blok bir şablon-literal, içi JS için sadece karakter), vite 200 döndü, testler
   yeşil kaldı — ama tarayıcı o noktadan SONRAKİ tüm kuralları sessizce attı: dokunma
   temelleri, iOS zoom düzeltmesi ve 44px hedef kuralı topluca devre dışı kaldı. Kusur
   yalnızca canlı ölçümle görüldü (zoom tetikleyicisi 0 → 110'a geri döndü).

   Bu yüzden sınav METİN üzerinde koşar: neonUi.jsx JSX içerdiğinden node --test onu import
   EDEMEZ; blok dosyadan okunup ayrıştırılır. Ucuz ve tam da o hata sınıfını yakalar.

   Şablon-literal tuzağı: blok bir backtick dizgisi olduğu için İÇİNDE backtick kullanılamaz
   (aynı gün iki kez kırdı) — o da burada sınanır. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KOK = dirname(fileURLToPath(import.meta.url));
const KAYNAK = readFileSync(join(KOK, "..", "components", "neonUi.jsx"), "utf8");

/** NEON_KEYFRAMES'in şablon-literal gövdesini döndürür (backtick'ler hariç). */
function cssBloku() {
  const bas = KAYNAK.indexOf("export const NEON_KEYFRAMES = `");
  assert.notEqual(bas, -1, "NEON_KEYFRAMES bulunamadı — dışa aktarım adı mı değişti?");
  const govdeBas = KAYNAK.indexOf("`", bas) + 1;
  const govdeSon = KAYNAK.indexOf("\n`;", govdeBas);
  assert.notEqual(govdeSon, -1, "NEON_KEYFRAMES kapanışı bulunamadı");
  return KAYNAK.slice(govdeBas, govdeSon);
}

test("CSS bloğunda yorumlar dengeli — sarkan kapanış tüm alt kuralları düşürür", () => {
  const css = cssBloku();
  const acilis = (css.match(/\/\*/g) || []).length;
  const kapanis = (css.match(/\*\//g) || []).length;
  assert.equal(acilis, kapanis, `Yorum dengesi bozuk: ${acilis} açılış, ${kapanis} kapanış`);

  // Sıra da doğru olmalı: her kapanıştan önce açık bir yorum bulunmalı.
  let acik = false;
  for (let i = 0; i < css.length - 1; i++) {
    const iki = css.slice(i, i + 2);
    if (iki === "/*") { assert.ok(!acik, `İç içe yorum açılışı (offset ${i})`); acik = true; i++; }
    else if (iki === "*/") { assert.ok(acik, `Açılışı olmayan yorum kapanışı (offset ${i})`); acik = false; i++; }
  }
  assert.equal(acik, false, "Kapanmamış yorum — dosyanın kalanı yutulur");
});

test("CSS bloğunda backtick yok — şablon-literali erkenden bitirir", () => {
  assert.equal(cssBloku().includes("`"), false, "Blok içinde backtick var: literal erken kapanır");
});

test("Mobil dokunma sözleşmesi CSS'te duruyor", () => {
  const css = cssBloku();
  // Bu dört kural 2026-08-12 mobil denetiminin ölçülmüş çıktısıdır; sessizce düşerlerse
  // telefonda iOS odak-zoom'u, 300ms tıklama gecikmesi ve 36px hedefler geri gelir.
  assert.match(css, /touch-action:\s*manipulation/, "touch-action kuralı yok");
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent/, "tap-highlight kuralı yok");
  assert.match(css, /font-size:16px!important/, "telefonda 16px girdi kuralı yok (iOS zoom)");
  assert.match(css, /\[data-dokunma\]\{[^}]*min-height:44px!important/, "44px dokunma hedefi kuralı yok");
  assert.match(css, /\[data-kaydirma-kapsa\]\{overscroll-behavior:contain\}/, "kaydırma zinciri kuralı yok");
});

test("Telefon eşiği tek değer — iki ayrı kırılım sessizce ayrışır", () => {
  const esikler = [...cssBloku().matchAll(/@media \(max-width:(\d+)px\)/g)].map((m) => m[1]);
  assert.ok(esikler.length >= 2, "Beklenen telefon medya sorguları yok");
  assert.equal(new Set(esikler).size, 1, `Farklı eşikler: ${[...new Set(esikler)].join(", ")}`);
  // hooks/useMedya.js'teki DAR_ESIK ile AYNI olmalı: biri 640, diğeri 720 olursa dokunma
  // hedefi büyüyen ekranla satır sarması yapan ekran farklı yerde kırılır.
  const medya = readFileSync(join(KOK, "..", "hooks", "useMedya.js"), "utf8");
  const darEsik = /max-width:\s*(\d+)px/.exec(medya)?.[1];
  assert.equal(esikler[0], darEsik, `CSS eşiği ${esikler[0]}, useMedya eşiği ${darEsik} — ayrışmış`);
});
