/* kabukAntetKunye — antet sağ künye bloğunun saf türetimi (tur 8, A-kabuk; brif #1 / jüri imza fırsatı).
   1920'de antet bandının ~%75'i boştu. Resmî yazının üst-sağ künyesi (Sayı · Tarih · Ek) gibi,
   görünümün CANLI özetini mono, tab-stop hizalı satırlarla verir. Yalnız kabuğun zaten bildiği
   olgulardan (kabukSayaclari çıktısı) — yeni istek yok, tahmin yok. Bilinmeyen sayı: bekliyor →
   "··", yanıt yok → "—" (KabukSicil ile aynı üç hâl). Görünüm kendi künyesini (actions) taşıyorsa
   (Panel) ViewWrap bunu çizmez. Saf → node --test. */

const iki = (n) => String(n).padStart(2, "0");

/** Bir sayaç değerini künye hücresine çevirir: sayı → "07", bekliyor → "··", bilinmiyor → "—". */
export function kunyeDeger(n, bekliyor = false) {
  if (Number.isFinite(n)) return iki(n);
  return bekliyor ? "··" : "—";
}

/** Görünüm başlık id'si → künye satırları [{ e: etiket, d: değer, acil? }]. Eşleşme yoksa []. */
export function antetKunyeSatirlari(id, { sayac, sicil } = {}) {
  if (!sayac || !sicil) return [];
  const bk = sayac.bekliyor || {};
  const satir = (e, n, b, acil = false) => ({ e, d: kunyeDeger(n, b), acil: acil && n > 0 });
  const gecikmis = satir("Gecikmiş", sayac.gecikmis, bk.gecikmis, true);
  const sonNo = sicil.son?.[0]?.no;
  switch (id) {
    case "gelen-h":
      return [satir("Kuyruk", sayac.gelen, false), gecikmis, satir("Karar bekleyen", sayac.taslak, bk.taslak)];
    case "isleniyor-h":
      return [satir("Kuyruk", sayac.gelen, false), satir("Bugün işlenen", sicil.bugunIslenen, bk.bugunIslenen), gecikmis];
    case "islenen-h":
      return [satir("Bugün işlenen", sicil.bugunIslenen, bk.bugunIslenen), satir("Karar bekleyen", sicil.taslak, bk.taslak),
        { e: "Son kayıt", d: sonNo || (bk.bugunIslenen ? "··" : "—") }];
    case "taslak-h":
      return [satir("Karar bekleyen", sayac.taslak, bk.taslak), satir("Bugün giden", sicil.bugunGiden, bk.bugunGiden), gecikmis];
    case "giden-h":
      return [satir("Bugün giden", sicil.bugunGiden, bk.bugunGiden), satir("Toplam gönderi", sayac.giden, bk.giden), satir("Karar bekleyen", sayac.taslak, bk.taslak)];
    case "denetim-h":
      return [satir("Bugün işlenen", sicil.bugunIslenen, bk.bugunIslenen), satir("Bugün giden", sicil.bugunGiden, bk.bugunGiden),
        { e: "Son kayıt", d: sonNo || (bk.bugunIslenen ? "··" : "—") }];
    default:
      return [];
  }
}
