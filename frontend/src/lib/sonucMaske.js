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
