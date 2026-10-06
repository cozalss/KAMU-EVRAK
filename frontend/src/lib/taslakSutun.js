/* Taslaklar triyaj düzeninin SÜTUN BÜTÇESİ (saf; DOM'a bağlı değil, birim testli).
   Üç sütun: kuyruk | kâğıt | karar.

   NEDEN AYRI BİR BÜTÇE VAR (ölçülen hata, Playwright 2026-08-12):
   Kâğıt sütununun genişliği YÜKSEKLİKTEN türer (A4 oranı — bkz. kagitSutunGenisligi), diğer
   iki sütunun ise sabit tavanları vardı (kuyruk 420, karar 300). Ekran alçaldıkça kâğıt
   daralıyor, tavanlar ise yerinde kaldığı için artan genişlik hiçbir sütuna gitmiyordu.
   Grid `justifyContent:space-between` kullandığından bu artık, sütunların ARASINA uçurum
   olarak dağılıyordu:

     1920x945  (1080p)      → kuyruk 420 · kâğıt 538 · karar 300, aralarda 2 x 185px uçurum
     2560x1305 (1440p)      → kuyruk 420 · kâğıt 792 · karar 300, aralarda 2 x 378px uçurum
     1536x756  (1080p@125%) → kâğıt 404px'e çöküyor ama kuyruk yine 420 — LİSTE BELGEDEN GENİŞ

   Kusur her çözünürlükte vardı; 1440p'de kâğıt büyük olduğu için göze batmıyor, 1080p'de
   kâğıt küçülünce üç küçük ada + iki delik olarak görünüyordu ("düzensiz" şikâyeti).

   ÇÖZÜM: artık aralara değil SÜTUNLARA dağıtılır; artan yer tek parça sağ kenar boşluğu
   olarak kalır. Böylece sütunlar bitişik durur ve üstteki başlık/araç çubuğuyla aynı sol
   hizada başlar — hizalı bir blok, dağılmış üç ada değil. */
import { kagitSutunGenisligi, KAGIT_ASGARI_GEN } from "./a4Sayfalama.js";

/* Kuyruk: 260 altında konu başlığı okunmaz. Tavan 440 (kullanıcı kararı 2026-08-12:
   "soldaki bar çok geniş, A4 küçük kalmış" — sayfanın ana odağı BELGEDİR, listesi değil).
   Kısa ömürlü 560 tavanı geri getirme: kâğıt yükseklikle sınırlı olduğundan kuyruk 560'a
   çıkınca listeyle belge eşit genişliğe geliyor ve odak dağılıyordu. */
export const KUYRUK_MIN = 260;
export const KUYRUK_AZAMI = 440;
/* Karar paneli sabit içeriktir (başlık + künye + buton bloğu): 360 üstünde başlık satırı
   gereksiz uzar. Taban 236 → 272 (jüri tur 6, 1440x900): 236'da Düzenle/Kurul yan yana
   sığmıyor, alt alta düşüp "Kurulu topla"yı ve Sil'i sütunun dışına itiyordu. Fark kuyruktan
   gelir (1440'ta 362 → 326) — konu başlığı kuyrukta zaten tek satır kırpılır, tam metni
   karar fişinde. Sıralama kuralı (kâğıt önce doyar) değişmedi. */
export const KARAR_MIN = 272;
export const KARAR_AZAMI = 360;
/* Sütun arası boşluk — grid `gap` ile AYNI değer olmalı (TaslaklarView buradan okur). */
export const BOSLUK = 16;
/* Kuyruk+karar artığından karar panelinin payı. Kuyruk ağır basar: değişken uzunlukta
   Türkçe konu başlıkları taşır, karar paneli ise sabit içerikli. */
const KARAR_PAY = 0.34;

const kelepce = (deger, alt, ust) => Math.max(alt, Math.min(ust, deger));

/**
 * Üç sütunun piksel genişliğini hesaplar.
 *
 * Sıra ÖNEMLİ — kâğıt önce doyar (belge kararın nesnesidir), kalanı diğer ikisi paylaşır:
 *   1. kâğıt  = yükseklikten A4 oranıyla türer, diğer sütunların asgarileri düşülerek kelepçelenir
 *   2. karar  = kalanın KARAR_PAY'i, kendi sınırlarında
 *   3. kuyruk = geri kalanı — ama ASLA kâğıttan geniş değil (hiyerarşi: belge > liste)
 *
 * Toplam kabı aşmaz; aşan bir şey kalırsa sağ kenar boşluğu olur (çağıran `justifyContent`
 * ile aralara DAĞITMAMALIDIR — hatanın kaynağı buydu).
 *
 * @param {number} sutunH ölçülen sütun yüksekliği (px)
 * @param {number} gridGen ölçülen grid genişliği (px)
 * @param {number} [bosluk] sütun arası boşluk (px)
 * @returns {{kuyruk: number, kagit: number, karar: number}|null} ölçüm yoksa null
 */
export function sutunButcesi(sutunH, gridGen, bosluk = BOSLUK) {
  const gen = Number(gridGen);
  if (!Number.isFinite(gen) || gen <= 0) return null;

  const kagit = kagitSutunGenisligi(sutunH, gen - KUYRUK_MIN - KARAR_MIN - bosluk * 2);
  if (kagit == null) return null;

  const kalan = Math.max(0, gen - kagit - bosluk * 2);
  const karar = kelepce(Math.round(kalan * KARAR_PAY), KARAR_MIN, KARAR_AZAMI);
  // Kuyruk tavanı kâğıda BAĞLI: liste, hakkında karar verilen belgeden geniş görünmemeli.
  // Kâğıt kendi asgarisine çöktüyse (çok kısa ekran) kuyruk yine de okunur asgaride kalır.
  const kuyrukTavan = Math.max(KUYRUK_MIN, Math.min(KUYRUK_AZAMI, kagit));
  const kuyruk = kelepce(kalan - karar, KUYRUK_MIN, kuyrukTavan);

  return { kuyruk, kagit, karar };
}

export { KAGIT_ASGARI_GEN };
