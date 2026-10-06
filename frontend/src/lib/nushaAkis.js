/* nushaAkis — telefonda nüsha kâğıdının satır akışı (saf; BelgeModal'ın dar kipi kullanır).

   Neden: telefonda kâğıt A4 ölçeğinde küçültülmez, A4Belge'nin OKUMA DÜZENİ'ne akar (satır
   rolleri — ortalı antet, Sayı hizasında tarih, ortalı muhatap, imza — korunur). İki artık
   bu düzeni bozuyordu (tur 6 doğrulaması):
   · Hizalama boşlukları ("   T.C.") orantılı yazıda satır başında görünür kalıyordu.
   · Gelen dilekçeler sabit genişlikte SARILMIŞ metindir (her ~80 karakterde satır sonu).
     Okuma düzeni her uzun satıra paragraf girintisi verdiği için telefonda merdiven gibi
     kırık bir metin çıkıyordu. Sarılmış satırlar burada tek paragrafa akıtılır.

   Kural: yalnız BİÇİM değişir — hiçbir sözcük eklenmez/çıkarılmaz; satır sonu yerine tek
   boşluk konur. Birleştirme temkinlidir: önceki satır kısa (< SARMA_ASGARI), cümle sonuyla
   biten ya da sonraki satır "Etiket:" biçimindeyse (Konu:, Adı Soyadı:, Sayı :) satırlar
   AYRI kalır — resmî yazının bir-satır-bir-paragraf düzeni olduğu gibi geçer. */

/** Sarılmış sayılması için önceki satırın asgari uzunluğu (karakter). */
export const SARMA_ASGARI = 40;
const CUMLE_SONU = /[.:;!?]$/;
const ETIKETLI = /^[^:]{1,30}:\s/;

/** Her satırın başındaki hizalama boşluğunu kırpar (boşluk, sekme, bölünmez boşluk). */
export function satirBasiKirp(metin) {
  return String(metin ?? "").split("\n").map((s) => s.replace(/^[ \t\u00a0]+/, "")).join("\n");
}

function sarilmisDevamMi(onceki, simdiki) {
  const o = onceki.trim();
  const s = simdiki.trim();
  if (!o || !s) return false;
  if (o.length < SARMA_ASGARI || CUMLE_SONU.test(o)) return false;
  return !ETIKETLI.test(s);
}

/** Sabit genişlikte sarılmış satırları paragrafa akıtır (biçim, metin değil). */
export function paragraflaraAk(metin) {
  const satirlar = String(metin ?? "").split("\n");
  const cikti = [];
  let sonKaynak = null;   // birleştirme kararı akmış paragrafa değil, son KAYNAK satıra bakar
  for (const satir of satirlar) {
    if (sonKaynak !== null && sarilmisDevamMi(sonKaynak, satir)) {
      cikti[cikti.length - 1] = `${cikti[cikti.length - 1].trimEnd()} ${satir.trim()}`;
    } else {
      cikti.push(satir);
    }
    sonKaynak = satir;
  }
  return cikti.join("\n");
}

/** Telefon nüshası: önce hizalama kırpılır, sonra sarılmış satırlar akıtılır. */
export function telefonNushaMetni(metin) {
  return paragraflaraAk(satirBasiKirp(metin));
}
