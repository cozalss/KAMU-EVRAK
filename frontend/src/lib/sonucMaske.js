/* sonucMaske — Sonuç ekranındaki "Okunan belge" görünümünün GÖRÜNTÜ maskesi (saf, DOM yok).

   Jüri tur 8 (yüksek): kart "KVKK · 1 alan maskeli" derken kâğıtta telefon maskeli
   ("055******12"), e-posta ise açık duruyordu — aynı ekranda iki ayrı KVKK dili. Backend'in
   maskesi telefon/TCKN'yi kapsar; e-posta için aynı biçimde (baş 2 karakter + yıldız) burada
   kapatılır. Yalnız SUNUM: kaynak metne, kanıt aralıklarına ve LLM yoluna dokunulmaz.
   Ad/adres düzenli ifadeyle güvenilir bulunamaz — uydurma maske üretilmez. */

const EPOSTA_RE = /([\p{L}\p{N}._%+-]{1,64})@([\p{L}\p{N}.-]+\.[\p{L}]{2,})/gu;

/** Tek metinde e-posta adreslerini maskeler: "mehmet.demir@ornek.com" → "me**********@ornek.com". */
export function epostaMaskele(metin) {
  return String(metin ?? "").replace(EPOSTA_RE, (_, yerel, alan) =>
    `${yerel.slice(0, 2)}${"*".repeat(Math.max(3, yerel.length - 2))}@${alan}`);
}

/** Segment dizisini (buildSegments çıktısı: {t, mark?}) maskeler; değişmeyen segment aynı nesnedir. */
export function segmentleriMaskele(segs) {
  if (!Array.isArray(segs)) return segs;
  let degisti = false;
  const yeni = segs.map((sg) => {
    const t = epostaMaskele(sg?.t);
    if (t === sg?.t) return sg;
    degisti = true;
    return { ...sg, t };
  });
  return degisti ? yeni : segs;
}

/* Fosfor vurgusu kelime ortasında bitmesin (2. jüri: "BAKANLIĞ" vurgulu, "INA" değil).
   Kanıt aralığı ekten önce biter (kök eşleşir, Türkçe ek dışarıda kalır); SUNUMDA vurgu
   bitişik harflere kadar genişletilir — kelime bütün okunur. Yalnız aynı kelimenin
   devamı taşınır (boşluk/noktalama sınırı aşılmaz); kaynak metin ve aralıklar değişmez. */
const HARF_BAS_RE = /^[\p{L}\p{N}]+/u;
const HARF_SON_RE = /[\p{L}\p{N}]+$/u;
const harfleBiter = (t) => HARF_SON_RE.test(t || "");
const harfleBaslar = (t) => HARF_BAS_RE.test(t || "");

/** {t, mark?} segmentlerinde vurguyu komşu düz segmentteki kelime parçasına genişletir. */
export function kelimeSinirinaYasla(segs) {
  if (!Array.isArray(segs) || !segs.some((s) => s?.mark)) return segs;
  const out = segs.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; i++) {
    const sg = out[i];
    if (!sg.mark) continue;
    const sonra = out[i + 1];
    if (sonra && !sonra.mark && harfleBiter(sg.t) && harfleBaslar(sonra.t)) {
      const ek = sonra.t.match(HARF_BAS_RE)[0];
      sg.t += ek; sonra.t = sonra.t.slice(ek.length);
    }
    const once = out[i - 1];
    if (once && !once.mark && harfleBaslar(sg.t) && harfleBiter(once.t)) {
      const kok = once.t.match(HARF_SON_RE)[0];
      sg.t = kok + sg.t; once.t = once.t.slice(0, -kok.length);
    }
  }
  return out.filter((s) => s.t);
}
