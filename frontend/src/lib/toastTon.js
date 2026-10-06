/* toastTon — bildirim metninden TON çıkarımı (tur 6, A-kabuk).

   NEDEN: 40+ çağrı yeri showToast(metin) ile yalnız düz metin veriyor; "DB'ye kaydedilemedi,
   göndermeden önce tekrar deneyin" (veri kaybı uyarısı) ile "Evrak gönderildi" aynı tek tonlu
   hapta çiziliyordu — jüri bunu güvenlik açığı saydı. Çağıranlar açıkça ton verebilir
   (showToast(m, { ton })); vermeyenler için metnin kendisi sınıflanır. Sıra ÖNEMLİ:
   "gönderildi ancak kalıcı kayda yazılamadı" bir UYARIDIR — başarı kelimesi geçse de.
   Türkçe küçük harf tr-TR ile alınır (İ/ı tuzağı). Saf işlev → node --test ile sınanır. */

const HATA = /(alınamadı|başarısız|üretilemedi|işlenemedi|doğrulanamadı|kopyalanamadı|tamamlanamadı|gönderilemedi|bulunamadı|hata oluştu|backend çalışıyor mu)/;
const UYARI = /(yazılamadı|kaydedilemedi|silinemedi|kalıcı kayda|geri gelebilir|tekrar deneyin|gönderilmedi|gerekli|önce |yineleyin|işleniyor —)/;
const BASARI = /(gönderildi|eklendi|kaydedildi|kaydedilecek|indirildi|kopyalandı|güncellendi|uygulandı|işlendi|reddedildi|alındı|onaylandı)/;

export const TONLAR = ["basari", "bilgi", "uyari", "hata"];

/** @param {unknown} metin @returns {"basari"|"bilgi"|"uyari"|"hata"} */
export function toastTonu(metin) {
  const m = String(metin ?? "").toLocaleLowerCase("tr-TR");
  if (!m.trim()) return "bilgi";
  if (HATA.test(m)) return "hata";
  if (UYARI.test(m)) return "uyari";
  if (BASARI.test(m)) return "basari";
  return "bilgi";
}

/* Ton → künye etiketi + süre. Uyarı/hata ≥ 6 sn ekranda kalır (okunmadan kaybolmasın). */
export const TON_META = {
  basari: { kunye: "İşlendi", sure: 3600 },
  bilgi: { kunye: "Bilgi", sure: 3600 },
  uyari: { kunye: "Uyarı", sure: 7000 },
  hata: { kunye: "Hata", sure: 8000 },
};
