/* KVKK onam kapısı — saf mantık (bileşenden ayrı).

   NEDEN lib/ ALTINDA: `npm test` globu yalnız `src/lib/*.test.js` dosyalarını görür.
   Bileşenlerin testi bu depoda yok; test edilmesi gereken her şey saf modül olmalı.

   NEDEN GEREKLİ: demo Türkçe ve halka açık olunca kullanıcılar GERÇEK evrak yükler —
   içinde gerçek ad, TCKN, adres. O an sistem sahibi veri sorumlusu konumuna girer.
   Onam kapısı bunu hem hukuken hem pratik olarak kesen tek yer: yükleme kontrolü
   onay verilmeden ÇALIŞMAZ (dosya seçici bile açılmaz). */

/** Demo modu bayrağı — build anında gömülür; kapalıyken tüm kapı ölü koda düşer. */
export const DEMO_MODU = import.meta?.env?.VITE_DEMO_MODU === "1";

/* localStorage anahtarı. Depodaki `ke-` + kebab ailesi (ke-tema, ke-filtre-*) ile tutarlı.
   Uyarı metni ESASLI biçimde değişirse anahtarı `-2` ile bumpla — sürüm/migrasyon
   mekanizması KURULMADI, çünkü tek satırlık bir bump bunun tüm faydasını veriyor. */
export const ONAM_ANAHTARI = "ke-kvkk-onam";

/** Onam kayıtlı mı? Depolama erişilemezse (gizli mod, kapalı çerez) FALSE döner —
    yani kullanıcı yeniden onaylar. Güvenli yön: "hatırlayamadım" ≠ "onay verdi". */
export function onamOku(storage) {
  try {
    return storage?.getItem(ONAM_ANAHTARI) === "1";
  } catch {
    return false;
  }
}

/** Onamı kaydet. Yazamamak akışı BOZMAZ — kullanıcı bu oturumda devam eder. */
export function onamYaz(storage) {
  try {
    storage?.setItem(ONAM_ANAHTARI, "1");
    return true;
  } catch {
    return false;
  }
}

/** Kapı gösterilmeli mi? Demo kapalıysa ASLA (bugünkü davranış birebir korunur). */
export function onamGerekli(demoModu, kayitliOnam) {
  return Boolean(demoModu) && !kayitliOnam;
}

/** Onamı sil — "kararımı değiştir" ve test için. */
export function onamSil(storage) {
  try {
    storage?.removeItem(ONAM_ANAHTARI);
    return true;
  } catch {
    return false;
  }
}
