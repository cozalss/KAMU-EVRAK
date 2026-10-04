/* damgaButce — "ekran başına en fazla 2 damga" kuralını BİLEŞEN düzeyinde uygular (tur 4,
   jüri A#9 / C#22: damga her ekranda başlık süsüne dönüşmüştü; mühür hissi kayboluyordu).

   Kural MASTER.md'de bir dikkat bütçesi olarak yazılıydı ama hiçbir şey onu zorlamıyordu:
   her görünüm kendi başına "bir damga" eklediğinde ekranda 3–4 damga birikiyordu. Burada
   ekranda MONTE olan her Damga bir kayda girer; bütçeyi aşan damga silinmez (bilgi kaybı
   yok), sessiz bir künye çipine iner. Kim basılır: önce `oncelik` (yüksek kazanır), eşitse
   ilk monte olan — görünüm başlığının damgası, içerikteki damgalardan önce kaydolur.

   Saf modül (React'siz): neonUi'deki Damga useSyncExternalStore ile abone olur; mantık
   node --test ile sınanır. */

export const DAMGA_BUTCESI = 2;

/**
 * @param {number} [butce]
 */
export function damgaKaydiOlustur(butce = DAMGA_BUTCESI) {
  /** @type {{id: string, oncelik: number, sira: number}[]} */
  let kayit = [];
  let sayac = 0;
  let surum = 0;
  const dinleyiciler = new Set();
  const yay = () => { surum += 1; dinleyiciler.forEach((f) => f()); };

  return {
    /** Damga monte oldu. Aynı id ikinci kez eklenmez. */
    ekle(id, oncelik = 0) {
      if (kayit.some((k) => k.id === id)) return;
      kayit = [...kayit, { id, oncelik: Number(oncelik) || 0, sira: sayac++ }];
      yay();
    },
    /** Damga söküldü — bütçede yer açılır, sıradaki çip yeniden damgaya döner. */
    cikar(id) {
      const yeni = kayit.filter((k) => k.id !== id);
      if (yeni.length === kayit.length) return;
      kayit = yeni;
      yay();
    },
    /** Kayıtta olmayan (henüz monte olmamış ya da bütçe dışı) damga her zaman basılır. */
    basilirMi(id) {
      const sirali = [...kayit].sort((a, b) => b.oncelik - a.oncelik || a.sira - b.sira);
      const i = sirali.findIndex((k) => k.id === id);
      return i === -1 || i < butce;
    },
    abone(fn) { dinleyiciler.add(fn); return () => { dinleyiciler.delete(fn); }; },
    surum() { return surum; },
    sayi() { return kayit.length; },
  };
}

/* Uygulama genelinde tek kayıt — "ekran" = aynı anda monte olan her şey (görünüm + açık
   modal/panel). */
export const damgaKaydi = damgaKaydiOlustur();
