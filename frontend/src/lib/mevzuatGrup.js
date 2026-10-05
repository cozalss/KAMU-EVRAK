// Mevzuat önerilerini talep başına gruplar + başvuru usulünü ayrı bölüme alır.
//
// Backend içerik odaklı yolu (agents/mevzuat_yargic) öğelere `talep_id` ve `katman`
// ("esas" | "usul") ekler; `mevzuat_talep_durumu` her talep için `bulundu` bildirir.
// Eski yolda bu alanlar yoktur → tek başlıksız bölüm (önceki görünüm birebir).

function talepEtiketleri(r) {
  const etiket = new Map();
  const kume = r?.bilgi_unsurlari?.talep_kumesi;
  const kaynak = Array.isArray(kume) && kume.length ? kume : (Array.isArray(r?.alt_talepler) ? r.alt_talepler : []);
  kaynak.forEach((t, i) => {
    const id = String(t?.id || `t${i + 1}`);
    const ad = String(t?.ozet || t?.konu || "").trim();
    if (ad) etiket.set(id, ad);
  });
  return etiket;
}

/**
 * @returns {{gruplu: boolean, bolumler: Array<{anahtar: string, baslik: string|null,
 *   tur: "esas"|"usul"|"duz", bulunamadi: boolean, ogeler: Array<{m: object, sira: number}>}>}}
 */
export function mevzuatBolumleri(mev, r) {
  const liste = Array.isArray(mev) ? mev : [];
  const gruplu = liste.some((m) => m?.talep_id || m?.katman === "usul")
    || (Array.isArray(r?.mevzuat_talep_durumu) && r.mevzuat_talep_durumu.length > 0);
  if (!gruplu) {
    return { gruplu: false, bolumler: liste.length
      ? [{ anahtar: "duz", baslik: null, tur: "duz", bulunamadi: false, ogeler: liste.map((m, i) => ({ m, sira: i + 1 })) }]
      : [] };
  }
  const etiket = talepEtiketleri(r);
  const durumlar = Array.isArray(r?.mevzuat_talep_durumu) ? r.mevzuat_talep_durumu : [];
  const sirali = durumlar.map((d) => String(d?.talep_id || "")).filter(Boolean);
  liste.forEach((m) => {
    const id = m?.katman === "usul" ? "" : String(m?.talep_id || "");
    if (id && !sirali.includes(id)) sirali.push(id);
  });
  const coklu = sirali.length > 1;
  const bolumler = sirali.map((id, i) => ({
    anahtar: `talep-${id}`,
    baslik: coklu ? `${i + 1}. talep${etiket.get(id) ? ` · ${etiket.get(id)}` : ""}` : "Talebin konusu",
    tur: "esas",
    bulunamadi: false,
    ogeler: [],
  }));
  const usul = { anahtar: "usul", baslik: "Başvuru usulü ve cevap süresi", tur: "usul", bulunamadi: false, ogeler: [] };
  const sahipsiz = { anahtar: "diger", baslik: "Diğer öneriler", tur: "esas", bulunamadi: false, ogeler: [] };
  let sira = 0;
  const ekle = (b, m) => { sira += 1; b.ogeler.push({ m, sira }); };
  bolumler.forEach((b, i) => liste
    .filter((m) => m?.katman !== "usul" && String(m?.talep_id || "") === sirali[i])
    .forEach((m) => ekle(b, m)));
  liste.filter((m) => m?.katman !== "usul" && !m?.talep_id).forEach((m) => ekle(sahipsiz, m));
  liste.filter((m) => m?.katman === "usul").forEach((m) => ekle(usul, m));
  bolumler.forEach((b) => { b.bulunamadi = b.ogeler.length === 0; });
  return { gruplu: true, bolumler: [...bolumler, sahipsiz, usul].filter((b) => b.ogeler.length || b.bulunamadi) };
}
