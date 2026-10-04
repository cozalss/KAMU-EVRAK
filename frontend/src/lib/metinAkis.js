/* Kaynak metnin satır kırılımlarını AKAN paragrafa çevirir — dar sütunda testere dişi kenar
   oluşmasın (tur-4 bulgusu: "içinde Ankara ili / genelinde düzenlenen yapı").
   Kural: tek "\n" yalnız paragraf İÇİNDEYSE boşluğa döner — sonraki satır küçük harfle
   başlıyor ve önceki satır cümle/başlık sonu değilse. "T.C.\nÇEVRE…", "Tarih: …\nKonu: …" ve
   çift "\n" (paragraf) olduğu gibi kalır.
   UZUNLUK KORUNUR (bir karakter → bir karakter): kanıt spanlarının start/end ofsetleri
   aynı metne işaret etmeye devam eder. */
const KUCUK = /^[a-zçğıöşüâîû0-9(“"'«]/;
const SATIR_SONU = /[.:;!?]\s*$/;

export function akanMetin(metin) {
  const s = String(metin ?? "");
  if (!s.includes("\n")) return s;
  const satirlar = s.split("\n");
  let out = "";
  for (let i = 0; i < satirlar.length; i += 1) {
    out += satirlar[i];
    if (i === satirlar.length - 1) break;
    const simdi = satirlar[i];
    const sonraki = satirlar[i + 1];
    const birlestir = simdi.trim() && sonraki.trim() && !SATIR_SONU.test(simdi) && KUCUK.test(sonraki.trimStart());
    out += birlestir ? " " : "\n";
  }
  return out;
}
