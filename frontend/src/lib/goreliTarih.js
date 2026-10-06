/* Göreli tarih yardımcıları — örnek evrak tarihlerini ÇALIŞMA ANINDA bugüne göre üretir.

   NEDEN: örnekler eskiden sabit tarihle yazılmıştı (referans 06.08.2026); iki ay sonra on
   beş evrağın hepsi "60+ gün gecikmiş" görünüyordu. Artık her tarih "bugünden N gün önce /
   N iş günü sonra" diye tanımlanır → kutu her gün aynı bant dağılımını gösterir.

   Saf fonksiyonlar: `bugun` her zaman parametredir (testte sabitlenir), girdi Date'i
   değiştirilmez — her çağrı yeni Date döner. Saat bileşeni yok sayılır (yerel gece yarısı).

   İŞ GÜNÜ: hafta sonu + 2429 sayılı Kanunun her yıl SABİT tam-gün tatilleri atlanır
   (backend agents/resmi_tatil._SABIT_TATILLER aynası). Kamerî (kayan) dinî bayramlar
   burada YOK — backend'de de [DOĞRULA] işaretli tahmindir; bayram haftasında bir KRİTİK
   örnek bir bant kayabilir (bilinen, kabul edilen sınır). */

// 2429 s.K. sabit tam-gün tatiller (ay 1-12, gün). 28 Ekim yarım gün → backend gibi dışarıda.
const SABIT_TATILLER = new Set(["1-1", "4-23", "5-1", "5-19", "7-15", "8-30", "10-29"]);
const GUN_MS = 86_400_000;

/** Saatsiz yerel tarih kopyası (girdi değişmez). */
export const gunBasi = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** d + n takvim günü (n negatif olabilir). Yaz saati kaymasına karşı takvim alanıyla toplar. */
export const gunEkle = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Hafta içi ve sabit resmî tatil değil mi. */
export const isGunuMu = (d) => {
  const hg = d.getDay();
  if (hg === 0 || hg === 6) return false;
  return !SABIT_TATILLER.has(`${d.getMonth() + 1}-${d.getDate()}`);
};

/** d'den n İŞ GÜNÜ ileri (n>0) ya da geri (n<0); başlangıç günü sayılmaz. */
export const isGunuEkle = (d, n) => {
  const adim = n < 0 ? -1 : 1;
  let cur = gunBasi(d);
  let kalan = Math.abs(n);
  while (kalan > 0) {
    cur = gunEkle(cur, adim);
    if (isGunuMu(cur)) kalan -= 1;
  }
  return cur;
};

/** İki tarih arası tam gün farkı (b - a). */
export const gunFarki = (a, b) => Math.round((gunBasi(b) - gunBasi(a)) / GUN_MS);

/** Date → "gg.aa.yyyy" (resmî yazışma biçimi). */
export const tarihYaz = (d) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/** "gg.aa.yyyy" → Date (geçersiz → null). */
export const tarihOku = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
};

/** Takvim-günü süreli evrakta (3071: 30 gün) son günü bugünden `hedefKalan` gün sonraya
    düşüren BAŞLANGIÇ tarihi. Son gün tatile rastlarsa backend onu ilk iş gününe kaydırır
    (2429 m.3) → kalan büyüyüp bant değişebilir. Bu yüzden hedeften geriye doğru, son günü
    iş gününe denk gelen ilk ofset seçilir; hiçbiri olmazsa 0 (son gün = bugün; bugün tatilse
    ilk iş gününe kayar — Cuma'ya denk gelen bir bayramda bu 3 gün eder ve KRİTİK o gün
    zaten mümkün değildir). */
export const sureSonuIcinBaslangic = (bugun, sureGun, hedefKalan) => {
  const b = gunBasi(bugun);
  let k = hedefKalan;
  while (k > 0 && !isGunuMu(gunEkle(b, k))) k -= 1;
  return gunEkle(b, k - sureGun);
};

/** Örnek metinlerde kullanılan kısa göreli tarih bağlamı — hepsi "gg.aa.yyyy" döner. */
export const tarihBaglami = (bugun) => {
  const b = gunBasi(bugun);
  return {
    bugun: b,
    yil: b.getFullYear(),
    gunOnce: (n) => tarihYaz(gunEkle(b, -n)),
    gunSonra: (n) => tarihYaz(gunEkle(b, n)),
    isGunuOnce: (n) => tarihYaz(isGunuEkle(b, -n)),
    isGunuSonra: (n) => tarihYaz(isGunuEkle(b, n)),
    /** Takvim-günü süreli evrakın son gününe `kalan` gün kalacak evrak tarihi. */
    sureyeKalan: (sureGun, kalan) => tarihYaz(sureSonuIcinBaslangic(b, sureGun, kalan)),
    /** Herhangi bir "gg.aa.yyyy"den n gün sonrası (iç tutarlılık: ilgi + süre). */
    sonra: (s, n) => tarihYaz(gunEkle(tarihOku(s), n)),
  };
};
