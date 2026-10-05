/* Yazışma paketi + talep başına yönlendirme kararı — saf yardımcılar (UI'dan bağımsız, test edilir).

   Backend sözleşmesi (yazi/paket.py, agents/yonlendirme.py):
   * `yazi_paketi`: [{rol, yazi_turu, muhatap, birim, kurum?, konu, talep_ids, yazi_taslak_md}]
     rol ∈ havale | cevap | devir | devir_bilgi | olur | dagitim.
   * `alt_talepler[i]`: {id, ozet, yetki: ICERIDE|DISARIDA|BELIRSIZ, birim_ad, yetkili_kurum_ad}.
     DISARIDA'da `birim_ad` bir GÖSTERİM metnidir ("<Kurum> (devir)") — birim adı değildir.
   Karar YALNIZ bu alanlardan okunur; 9'lu kaba kategori (birim_tr) karar gibi gösterilmez. */

export const ROL_ETIKET = {
  havale: "Birime havale",
  cevap: "Başvurana cevap",
  devir: "Yetkili makama gönderme",
  devir_bilgi: "Başvurana devir bilgisi",
  olur: "Olur yazısı",
  dagitim: "Dağıtım",
};

const metin = (v) => (typeof v === "string" ? v.trim() : "");

/** Talebin yönlendirme kararı → {tur: "devir"|"birim"|"belirsiz", etiket, ayrinti}. */
export function talepKarari(a = {}) {
  if (!a || typeof a !== "object") return { tur: "belirsiz", etiket: "", ayrinti: "" };
  const kurum = metin(a.yetkili_kurum_ad);
  if (a.yetki === "DISARIDA" && kurum) {
    return { tur: "devir", etiket: `Devir: ${kurum}`, ayrinti: "Kurumumuzun görev alanı dışında — yetkili makama gönderilir." };
  }
  const birim = a.yetki === "DISARIDA" ? "" : metin(a.birim_ad);
  if (birim) return { tur: "birim", etiket: `Birim: ${birim}`, ayrinti: "Kurum içinde bu birime havale edilir." };
  if (a.yetki === "BELIRSIZ") return { tur: "belirsiz", etiket: "Karar memurda", ayrinti: "Yetki/birim belirlenemedi; memur seçecek." };
  return { tur: "belirsiz", etiket: "", ayrinti: "" };
}

/** Paket öğelerini UI için normalize et (geçersiz öğe atılır, sıra korunur). */
export function paketOgeleri(r = {}) {
  const ham = Array.isArray(r?.yazi_paketi) ? r.yazi_paketi : [];
  return ham
    .filter((p) => p && typeof p === "object" && metin(p.yazi_taslak_md))
    .map((p, i) => ({
      anahtar: `${p.rol || "yazi"}-${i}`,
      rol: p.rol || "",
      rolEtiket: ROL_ETIKET[p.rol] || "Resmî yazı",
      muhatap: metin(p.muhatap),
      konu: metin(p.konu),
      talepIds: Array.isArray(p.talep_ids) ? p.talep_ids.filter(Boolean).map(String) : [],
      metin: p.yazi_taslak_md,
    }));
}

/** Paket kartı ancak ana taslağın ötesinde yazı varsa anlamlıdır (≥2 yazı). */
export function paketGosterilir(r = {}) {
  return paketOgeleri(r).length >= 2;
}

/** Paketin bir cümlelik özeti — ekran okuyucu ve kart alt başlığı için. */
export function paketOzeti(ogeler = []) {
  const say = (rol) => ogeler.filter((o) => o.rol === rol).length;
  const parca = [
    say("havale") && `${say("havale")} havale`,
    say("devir") && `${say("devir")} devir`,
    (say("cevap") + say("devir_bilgi")) && `${say("cevap") + say("devir_bilgi")} başvurana yazı`,
  ].filter(Boolean);
  return parca.length ? `${ogeler.length} yazı: ${parca.join(", ")}` : `${ogeler.length} yazı`;
}
