/* Dayanak kutucuk kurgusu — seçim matematiği + yarış (race) sekans guard'ı (SAF, test edilebilir).
   DashboardApp'ten ayrıldı: async yarış mantığı node --test ile birim test edilebilsin
   (bkz. dayanakSecim.test.js). Bileşen yalnız bu yardımcıları bağlar. */

/* Seçili mevzuatın kimliği başlıktır (NeonDetay seciliSet + nliMap ile aynı anahtar);
   başlık yoksa kaynak dosyaya düşülür. */
export const mevzuatAnahtar = (m) => (m && (m.baslik || m.kaynak_dosya)) || "";

/* State'te yalnız uca + gösterime gereken slim kopya tutulur (tüm öneri nesnesi gereksiz). */
export const mevzuatOzet = (m) => ({
  baslik: m.baslik, madde_no: m.madde_no, madde_tur: m.madde_tur, kaynak_dosya: m.kaynak_dosya,
});

/* Kutucuk toggle → sonraki seçim listesi. Değişiklik yoksa AYNI referans döner (çağıran
   `next === prev` ile no-op'u ayırır). Ekleme sona, çıkarma anahtar eşleşmesiyle. */
export function sonrakiSecim(prev, m, checked) {
  const key = mevzuatAnahtar(m);
  if (!key) return prev;
  const varMi = prev.some((x) => mevzuatAnahtar(x) === key);
  if (checked === varMi) return prev;   // istenen durum zaten sağlanmış → no-op (aynı referans)
  return checked ? [...prev, mevzuatOzet(m)] : prev.filter((x) => mevzuatAnahtar(x) !== key);
}

/* Yarış sekansı: HER istek (boş seçim / undo dâhil) bir sıra numarası alır; yalnız EN SON
   alınan numara geçerlidir. Böylece uçuştaki eski /yazi/dayanak yanıtı, arada seçim
   boşaltılsa/değişse bile GEÇERSİZ olur (kaldırılan atfı geri getirmesin — CRITICAL fix).
   Kritik nokta: undo yolu da `al()` çağırmalı; aksi halde eski istek "güncel" görünür. */
export function createSekans() {
  let n = 0;
  return {
    al: () => ++n,             // yeni istek → sıra numarası (monotonik)
    guncelMi: (token) => token === n,   // bu token hâlâ en son mu?
  };
}
