/* a4Antet — resmî yazı taslağının satırlarını Yönetmelik düzenine göre SINIFLANDIRIR (saf).

   Neden gerekli: taslak metni boşluklarla hizalanmış düz metindir ("   T.C." gibi), ama
   ekranda gösterilmeden önce `cleanDemoText` ardışık boşlukları teke indirir ve kâğıt
   orantılı yazı tipiyle (Arial, m.7/1) dizilir — boşlukla ortalama hiçbir zaman tutmaz.
   Sonuç: antet sola yaslı, tarih "Sayı" satırının içinde kaybolmuş, imza bloğu sol kenarda.
   Bu modül satırın METİNDEKİ rolünü (antet / sayı-tarih / muhatap / paragraf / imza) çıkarır;
   A4Belge her rolü gerçek bir resmî yazıdaki yerine dizer.

   Kural: sınıflandırma YALNIZ biçimi etkiler, metni asla değiştirmez (her satırın metni
   aynen basılır; yalnız baştaki hizalama boşluğu kırpılır). Tanımadığı satır `duz` kalır,
   yani bu modül yanılırsa en kötü hâl eski görünümdür. */

const SAYI_RE = /^\s*Say[ıi]\s*:/i;
const KONU_RE = /^\s*Konu\s*:/i;
const TARIH_SON_RE = /^(.*?\S)\s+(\d{1,2}[./]\d{1,2}[./]\d{4})\s*$/;
const KAPANIS_RE = /(sunulur|arz ederim|arz ederiz|rica ederim|rica ederiz|arz olunur|bilgilerinize sunarım)\.?\s*$/i;
const EK_RE = /^\s*(Ek|EK|Ekler|EKLER|Dağıtım|DAĞITIM|Gereği|GEREĞİ|Bilgi|BİLGİ)\s*[:-]?\s*/;
const HITAP_RE = /^\s*Sayın\b/;

const harfVar = (s) => /\p{L}/u.test(s);
const buyukHarf = (s) => harfVar(s) && s === s.toLocaleUpperCase("tr-TR");

/** @returns {{tip: string, metin: string, sag?: string}[]} satır başına bir kayıt */
export function antetSiniflandir(satirlar) {
  const liste = Array.isArray(satirlar) ? satirlar : [];
  const sonuc = liste.map((s) => ({ tip: "duz", metin: s }));
  const sayiIdx = liste.findIndex((s) => SAYI_RE.test(s));

  // Antet: "Sayı" satırından önceki dolu satırlar (en fazla 8 — daha uzunsa antet değildir).
  if (sayiIdx > 0 && sayiIdx <= 8) {
    for (let i = 0; i < sayiIdx; i += 1) {
      const t = liste[i].trim();
      if (!t) continue;
      sonuc[i] = { tip: t === "T.C." || buyukHarf(t) ? "antetKalin" : "antet", metin: t };
    }
  }

  // Sayı satırı: sondaki tarih sağ kenara gider (resmî yazıda tarih Sayı hizasında, sağda).
  if (sayiIdx >= 0) {
    const m = liste[sayiIdx].trim().match(TARIH_SON_RE);
    if (m) sonuc[sayiIdx] = { tip: "sayi", metin: m[1], sag: m[2] };
  }

  // Muhatap: Konu'dan sonraki ilk dolu blok — "Sayın …" ya da büyük harfli kurum adı (+ alt
  // satırı). Paragraf başlamadan (uzun satır) durur.
  const konuIdx = liste.findIndex((s, i) => i > sayiIdx && KONU_RE.test(s));
  const muhatapBas = konuIdx >= 0 ? konuIdx : sayiIdx;
  if (muhatapBas >= 0) {
    let i = muhatapBas + 1;
    while (i < liste.length && !liste[i].trim()) i += 1;
    const ilk = (liste[i] || "").trim();
    if (ilk && ilk.length <= 90 && (HITAP_RE.test(ilk) || buyukHarf(ilk))) {
      for (; i < liste.length && liste[i].trim(); i += 1) {
        const t = liste[i].trim();
        if (t.length > 90) break;
        sonuc[i] = { tip: "muhatap", metin: t };
      }
    }
  }

  // Kapanış + imza bloğu: kapanış cümlesi paragraf girintisiyle; ardından gelen kısa satırlar
  // (ad-soyad, unvan) sağdaki imza sütununa — "Ek/Dağıtım" listesi başlayınca biter.
  const kapanisIdx = liste.findIndex((s, i) => i > sayiIdx && s.trim().length <= 80 && KAPANIS_RE.test(s.trim()));
  if (kapanisIdx >= 0) {
    sonuc[kapanisIdx] = { tip: "paragraf", metin: liste[kapanisIdx].trim() };
    for (let i = kapanisIdx + 1; i < liste.length; i += 1) {
      const t = liste[i].trim();
      if (!t) continue;
      if (EK_RE.test(t) || t.length > 60) break;
      sonuc[i] = { tip: "imza", metin: t };
    }
  }

  // Gövde paragrafları: muhatap ile kapanış arasındaki uzun satırlar 1,25 cm girintiyle başlar.
  const govdeSon = kapanisIdx >= 0 ? kapanisIdx : liste.length;
  for (let i = Math.max(0, sayiIdx + 1); i < govdeSon; i += 1) {
    if (sonuc[i].tip !== "duz") continue;
    const t = liste[i].trim();
    if (t.length > 60 && !KONU_RE.test(t) && !/^\s*İlgi\s*:/i.test(t)) sonuc[i] = { tip: "paragraf", metin: t };
  }
  return sonuc;
}
