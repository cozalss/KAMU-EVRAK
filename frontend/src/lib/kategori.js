/* kategori — dilekçe/evrak operasyonel kategorisi (sunum katmanı; mimari değişmez).
   Evrak türü (config.EVRAK_TURLERI) + hedef birim + konu/metin anahtar sözcüklerinden
   TÜRETİLİR. Liste filtresi + satır rozeti için. Heuristik gruplama — yetki iddiası yok.
   Kategoriler kullanıcı isteğiyle: Genel Dilekçe / Şikâyet / Bilgi Edinme / İmar-Ruhsat /
   Mali-Vergi / Zabıta / Hukuk-İtiraz / İnsan Kaynakları / Diğer / Sınıflandırılmamış. */

export const KATEGORILER = [
  { id: "genel_dilekce", label: "Genel Dilekçe", color: "#2f8fa6" },
  { id: "sikayet", label: "Şikâyet", color: "#d99a1f" },
  { id: "bilgi_edinme", label: "Bilgi Edinme Başvurusu", color: "#4f7cc9" },
  { id: "imar_ruhsat", label: "İmar / Ruhsat", color: "#c97c12" },
  { id: "mali_vergi", label: "Mali İşler / Vergi", color: "#2f9e6e" },
  { id: "zabita", label: "Zabıta", color: "#d9566a" },
  { id: "hukuk_itiraz", label: "Hukuk / İtiraz", color: "#8e3d66" },
  { id: "insan_kaynaklari", label: "İnsan Kaynakları", color: "#5fa8c9" },
  { id: "diger", label: "Diğer", color: "#8a8172" },
  { id: "siniflanmamis", label: "Sınıflandırılmamış", color: "#6b6255" },
];

const _META = Object.fromEntries(KATEGORILER.map((k) => [k.id, k]));
export const kategoriMeta = (id) => _META[id] || _META.siniflanmamis;

/* Kategori → önerilen ilgili birim (config.EVRAK_TO_BIRIM ile uyumlu kaba eşleme). */
export const KATEGORI_BIRIM = {
  genel_dilekce: "ilgili_teknik_daire",
  sikayet: "teftis_ic_denetim",
  bilgi_edinme: "basin_halkla_iliskiler_cimer",
  imar_ruhsat: "ilgili_teknik_daire",
  mali_vergi: "mali_strateji_sgb",
  zabita: "destek_idari_hizmetler",
  hukuk_itiraz: "hukuk_musavirligi",
  insan_kaynaklari: "insan_kaynaklari",
  diger: "yazi_isleri_evrak",
  siniflanmamis: "yazi_isleri_evrak",
};

const trLow = (s) => String(s ?? "").toLocaleLowerCase("tr-TR");

/* Evrak → kategori. Öncelik: prosedürel intake türü (4982/şikâyet ayrı rejim) → içerik
   anahtar sözcüğü (imar/zabıta/İK) → kalan tür/birim. Prosedürel tür içeriğe ÖNCELİKLİ:
   konusu imar olan bir "bilgi edinme başvurusu" yine Bilgi Edinme'dir (4982 süreci). */
export function evrakKategori({ evrak_turu = "", birim = "", konu = "", text = "" } = {}) {
  const t = trLow(evrak_turu);
  const blob = trLow(`${konu} ${text}`);

  // 1) Prosedürel intake türü (ayrı rejim → içerikten önce)
  if (["bilgi_edinme", "cimer"].includes(t)) return "bilgi_edinme";
  if (["sikayet", "ihbar"].includes(t)) return "sikayet";

  // 2) İçerik-spesifik (tür-üstü): imar/zabıta/İK belge türüne bağlı değil
  if (/imar|ruhsat|yapı ruhsat|iskan|kaçak yapı|yıkım|tadilat|parsel|kat irtifak|imar planı/.test(blob))
    return "imar_ruhsat";
  if (/zabıta|işgal|seyyar|gürültü|ruhsatsız işyer|işyeri açma|pazar yeri|umuma açık/.test(blob))
    return "zabita";
  if (/personel|kadro|naklen|terfi|özlük|memur alım|atama|disiplin soruşturma|izin talebi/.test(blob)
      || birim === "insan_kaynaklari")
    return "insan_kaynaklari";

  // 3) Kalan tür/birim-bazlı
  if (["dilekce", "basvuru", "talep", "cok_konulu"].includes(t)) return "genel_dilekce";
  if (t === "fatura" || birim === "mali_strateji_sgb" || /vergi|tahakkuk|harç|emlak vergisi|tahsilat|fatura bedel/.test(blob))
    return "mali_vergi";
  if (["dava_evraki", "icra_evraki", "tebligat", "muzekkere", "gorus_mutalaa"].includes(t)
      || birim === "hukuk_musavirligi" || /dava|icra|haciz|itiraz|temyiz|istinaf|müzekkere/.test(blob))
    return "hukuk_itiraz";

  // 4) Belirsiz / sınıflanmamış
  if (t === "belirsiz" || !t) return "siniflanmamis";
  return "diger"; // ust_yazi, rapor, tutanak, genelge_talimat_olur vb.
}
