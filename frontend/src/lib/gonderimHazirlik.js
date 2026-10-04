/* gonderimHazirlik — "Onayla ve gönder" öncesi ONAY FİŞİ'nin saf mantığı (DOM/React yok).

   Ürün sözü: "memur onaylamadan hiçbir yazı çıkmaz". Onay bilinçli olsun diye fiş, memura
   gönderilecek yazının künyesini (muhatap · sayı · tarih · konu · kapanış) KENDİ METNİNDEN
   okuyup gösterir ve gönderimi engelleyen kusurları açıkça söyler.

   Engelleyen (gönderim kilitlenir):
   · bos_govde   — muhatap ile kapanış arasında anlamlı paragraf yok.
   · vaat_bos    — gövde "açıklamalar aşağıda sunulmuştur" diye bitiyor ama ardından hiçbir
                   açıklama gelmiyor (ölçülen gerçek kusur: 4982 başvurusuna bilgi vermeyen cevap).
   · dogrula     — metinde "[DOĞRULA: …]" işareti kalmış; doğrulanmamış ibare yazıyla dışarı çıkamaz.
   Uyarı (gönderim açık, fişte görünür): muhatap / konu satırı bulunamadı.

   Sınıflandırma lib/a4Antet ile AYNI kaynaktan gelir — kâğıtta görünen rol ile fişte okunan
   rol çelişmez. */
import { antetSiniflandir } from "./a4Antet.js";

const SAYI_RE = /^\s*Say[ıi]\s*:\s*/i;
const KONU_RE = /^\s*Konu\s*:\s*/i;
const ILGI_RE = /^\s*[İI]lgi\s*:/i;
const DAYANAK_RE = /^\s*Dayanak\s*:/i;
const KAPANIS_RE = /(sunulur|arz ederim|arz ederiz|rica ederim|rica ederiz|arz olunur|bilgilerinize sunarım)\.?\s*$/i;
const VAAT_RE = /aşağıda\s+(sunulmuştur|belirtilmiştir|açıklanmıştır|yer almaktadır|sıralanmıştır|arz edilmiştir|bilgilerinize sunulmuştur)\.?\s*$/i;
const DOGRULA_RE = /\[\s*DO[ĞG]RULA\b/i;
/* Anlamlı gövde için asgari harf sayısı — tek kısa cümle ("Bilgi verilmiştir.") yetmez. */
const GOVDE_ASGARI_HARF = 40;

const harfSay = (s) => (String(s).match(/\p{L}/gu) || []).length;

/** Taslağın gövde paragrafları (muhatap/İlgi sonrası, kapanış öncesi). */
export function taslakGovdesi(md = "") {
  const satirlar = String(md || "").split(/\r?\n/);
  const roller = antetSiniflandir(satirlar);
  const sayiIdx = satirlar.findIndex((s) => SAYI_RE.test(s));
  const kapanisIdx = satirlar.findIndex((s, i) => i > sayiIdx && s.trim().length <= 80 && KAPANIS_RE.test(s.trim()));
  const son = kapanisIdx >= 0 ? kapanisIdx : satirlar.length;
  const govde = [];
  for (let i = Math.max(0, sayiIdx + 1); i < son; i += 1) {
    const t = satirlar[i].trim();
    const tip = roller[i]?.tip;
    if (!t || tip === "muhatap" || tip === "sayi" || tip === "imza") continue;
    if (KONU_RE.test(t) || ILGI_RE.test(t) || DAYANAK_RE.test(t) || SAYI_RE.test(t)) continue;
    govde.push(t);
  }
  return govde;
}

/** Fişte gösterilecek künye — metnin kendisinden; bulunamayan alan boş kalır (uydurulmaz). */
export function taslakKunyesi(md = "") {
  const satirlar = String(md || "").split(/\r?\n/);
  const roller = antetSiniflandir(satirlar);
  const sayiSatir = roller.find((r) => r.tip === "sayi");
  const hamSayi = satirlar.find((s) => SAYI_RE.test(s)) || "";
  const konu = (satirlar.find((s) => KONU_RE.test(s)) || "").replace(KONU_RE, "").trim();
  const muhatap = roller.filter((r) => r.tip === "muhatap").map((r) => r.metin).join(" ").trim();
  const kapanis = (satirlar.find((s) => s.trim().length <= 80 && KAPANIS_RE.test(s.trim())) || "").trim();
  const imza = roller.filter((r) => r.tip === "imza").map((r) => r.metin);
  const antet = roller.filter((r) => r.tip === "antet" || r.tip === "antetKalin").map((r) => r.metin)
    .filter((s) => s !== "T.C.");
  return {
    antet: antet.join(" · "),
    sayi: (sayiSatir ? sayiSatir.metin : hamSayi).replace(SAYI_RE, "").trim(),
    tarih: sayiSatir?.sag || "",
    konu,
    muhatap,
    kapanis,
    imza: imza.join(" · "),
  };
}

/**
 * Gönderime hazır mı? Saf karar — fiş ve test aynı fonksiyonu okur.
 * @returns {{ hazir: boolean, engel: {kod: string, metin: string}[], uyari: {kod: string, metin: string}[], kunye: object }}
 */
export function gonderimDenetimi(md = "") {
  const metin = String(md || "");
  const kunye = taslakKunyesi(metin);
  const engel = [];
  const uyari = [];
  if (!metin.trim()) {
    engel.push({ kod: "bos_taslak", metin: "Gönderilecek yazı taslağı yok." });
    return { hazir: false, engel, uyari, kunye };
  }
  const govde = taslakGovdesi(metin);
  const govdeHarf = harfSay(govde.join(" "));
  const sonParagraf = govde[govde.length - 1] || "";
  if (govdeHarf < GOVDE_ASGARI_HARF) {
    engel.push({ kod: "bos_govde", metin: "Yazının gövdesi boş: muhatap ile kapanış arasında açıklama yok. Düzenle ile cevabı yazın ya da başvurandan eksik bilgi isteyin." });
  } else if (VAAT_RE.test(sonParagraf)) {
    engel.push({ kod: "vaat_bos", metin: "Yazı \"açıklamalar aşağıda sunulmuştur\" diyor ama ardından hiçbir açıklama gelmiyor. Düzenle ile açıklamayı ekleyin." });
  }
  if (DOGRULA_RE.test(metin)) {
    engel.push({ kod: "dogrula", metin: "Metinde doğrulanmamış bir ibare kaldı (kontrol işareti). Kaynağından doğrulayıp Düzenle ile giderin." });
  }
  if (!kunye.muhatap) uyari.push({ kod: "muhatap_yok", metin: "Muhatap satırı bulunamadı — yazının kime gittiğini kontrol edin." });
  if (!kunye.konu) uyari.push({ kod: "konu_yok", metin: "Konu satırı bulunamadı." });
  return { hazir: engel.length === 0, engel, uyari, kunye };
}
