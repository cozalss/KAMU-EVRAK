/* Birim gösterimi — TEK kaynak backend'in yönlendirme nesnesidir.
   Teşhis (2026-10-05): altı ayrı `r.hedef_birim || ...` zinciri farklı sıralarla yazılmıştı;
   aynı belgede karar şeridi, kart ve sohbet özeti farklı birim söylüyordu. Backend artık
   `gosterim_birimi` (memurun göreceği tek metin; devirde "<Kurum> (devir)") ve
   `yonlendirme.birim` (kurum içindeki birim) üretir. Eski zincir YALNIZ bu alanları
   taşımayan eski kayıtlar (geçmiş işlemler, önbellek) için kalır. */

const yonlendirmeVar = (r) =>
  !!r && !!r.yonlendirme && typeof r.yonlendirme === "object" && Object.keys(r.yonlendirme).length > 0;

const eskiZincir = (r) =>
  r.hedef_birim || r.hedef_birim_oneri || r.servis_birimi?.ad || r.hedef_kategori || "";

/** Memurun göreceği tek birim metni (arşiv/bildirim ile aynı). */
export function gosterimBirimi(r = {}) {
  if (!r) return "";
  if (r.gosterim_birimi) return String(r.gosterim_birimi);
  if (yonlendirmeVar(r)) return r.yonlendirme.karar === "DISARIDA" ? "" : (r.hedef_kategori || "");
  return eskiZincir(r);
}

/** Kurum İÇİNDEKİ birim adı (devir eki olmadan) — "yetkili kurumdaki birim" satırı için. */
export function yonlendirmeBirimi(r = {}) {
  if (!r) return "";
  if (yonlendirmeVar(r)) {
    const ad = r.yonlendirme.birim?.ad;
    if (ad) return String(ad);
    return r.yonlendirme.karar === "DISARIDA" ? "" : (r.hedef_kategori || "");
  }
  return eskiZincir(r);
}
