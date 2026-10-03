/* Mevzuat metni için saf parçalama yardımcıları (JSX yok, node --test ile sınanır).
   Tüketenler: MevzuatView (derin arama alıntısı) + MevzuatOkuma (paragraf). YALNIZ görüntü:
   parçalar birleştirildiğinde metin bire bir aynıdır — içerik değiştirilmez. */

const trKucuk = (s) => String(s || "").toLocaleLowerCase("tr");
const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Arama sorgusunun ≥3 harfli sözcüklerini metinde (tr büyük/küçük harf duyarsız) işaretler.
   tr küçük harf dönüşümü uzunluğu korumazsa (nadir birleşik glif) güvenli tarafta kalıp
   vurgulamaz — yanlış yere fosfor sürmek, hiç sürmemekten kötüdür. */
export function vurguParcala(metin, sorgu) {
  const s = String(metin || "");
  const kucuk = trKucuk(s);
  const sozcukler = [...new Set(trKucuk(sorgu).split(/\s+/).filter((w) => w.length >= 3))];
  if (!sozcukler.length || kucuk.length !== s.length) return [{ metin: s, vurgu: false }];
  const re = new RegExp(sozcukler.sort((a, b) => b.length - a.length).map(kacis).join("|"), "g");
  const parcalar = [];
  let son = 0;
  for (const m of kucuk.matchAll(re)) {
    if (m.index > son) parcalar.push({ metin: s.slice(son, m.index), vurgu: false });
    parcalar.push({ metin: s.slice(m.index, m.index + m[0].length), vurgu: true });
    son = m.index + m[0].length;
  }
  if (son < s.length) parcalar.push({ metin: s.slice(son), vurgu: false });
  return parcalar.length ? parcalar : [{ metin: s, vurgu: false }];
}

/* Korpusun "[DOĞRULA: …]" işaretleri (CLAUDE.md §1: şüpheli/sonradan değişmiş hüküm) ayrı
   parça olur ki okuma görünümü onları metnin kendisinden ayırt edilebilir göstersin. */
const DOGRULA_RE = /\[DOĞRULA:[^\]]*\]/g;
export function dogrulaParcala(metin) {
  const s = String(metin || "");
  const parcalar = [];
  let son = 0;
  for (const m of s.matchAll(DOGRULA_RE)) {
    if (m.index > son) parcalar.push({ metin: s.slice(son, m.index), dogrula: false });
    parcalar.push({ metin: m[0], dogrula: true });
    son = m.index + m[0].length;
  }
  if (son < s.length || !parcalar.length) parcalar.push({ metin: s.slice(son), dogrula: false });
  return parcalar;
}
