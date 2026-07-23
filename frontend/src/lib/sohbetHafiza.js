/**
 * Sohbet hafızası — konuşmayı localStorage'da tutar (reload/sekme-değişiminde kalıcı).
 *
 * Denetim bulgusu: sohbet geçmişi yalnız React state'teydi → yenileme = tam amnezi.
 * DB gerektirmeden (tarayıcı-yerel) kalıcılık. Geçici alanlar (akan balon, hata, tekrar
 * fonksiyonu) KAYDEDİLMEZ — yalnız tamamlanmış tur + kart verisi. Saf `hazirlaKayit`
 * node --test ile doğrulanır; localStorage sarmalayıcıları erişilemezse sessiz kalır.
 */

const _ANAHTAR = "kamu-evrak-sohbet";
const _MAX_TUR = 30; // depolama sınırı — son 30 tur yeter

/**
 * Kalıcılaştırılacak mesajları hazırla: akan/hatalı/boş turları at, fonksiyon alanlarını
 * (tekrar) düşür, son _MAX_TUR turu tut. Saf fonksiyon (localStorage'a dokunmaz).
 * @param {Array<Record<string, unknown>>} mesajlar
 * @param {number} max
 * @returns {Array<Record<string, unknown>>}
 */
export function hazirlaKayit(mesajlar, max = _MAX_TUR) {
  const temiz = (mesajlar || [])
    .filter((m) => m && m.icerik && !m.akiyor && !m.hata)
    .map((m) => ({
      rol: m.rol,
      icerik: m.icerik,
      ...(m.karsilama ? { karsilama: true } : {}),  // reload sonrası 'gecmis hariç' filtresi için korunur
      ...(m.kayitlar ? { kayitlar: m.kayitlar, kayit_turu: m.kayit_turu } : {}),
      ...(m.oneri_gorunum ? { oneri_gorunum: m.oneri_gorunum } : {}),
      ...(m.mevzuat_kaynaklari ? { mevzuat_kaynaklari: m.mevzuat_kaynaklari } : {}),
    }));
  return temiz.slice(-max);
}

/** Mesajları localStorage'a yaz (erişilemez/dolu → sessiz yoksay). */
export function hafizaKaydet(mesajlar) {
  try {
    const kayit = hazirlaKayit(mesajlar);
    if (kayit.length) window.localStorage.setItem(_ANAHTAR, JSON.stringify(kayit));
    else window.localStorage.removeItem(_ANAHTAR);
  } catch {
    /* localStorage yok/dolu/kapalı → hafıza olmadan devam */
  }
}

/** localStorage'dan geçmişi oku; yoksa/bozuksa null (çağıran karşılamaya düşer). */
export function hafizaYukle() {
  try {
    const ham = window.localStorage.getItem(_ANAHTAR);
    if (!ham) return null;
    const arr = JSON.parse(ham);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

/** Geçmişi sil (kullanıcı "sohbeti temizle" derse). */
export function hafizaTemizle() {
  try {
    window.localStorage.removeItem(_ANAHTAR);
  } catch {
    /* yoksay */
  }
}
