/* kategori — dilekçe/evrak operasyonel kategorisi (sunum katmanı; mimari değişmez).
   Evrak türü (config.EVRAK_TURLERI) + hedef birim + konu/metin anahtar sözcüklerinden
   TÜRETİLİR. Liste filtresi + satır rozeti için. Heuristik gruplama — yetki iddiası yok.
   Kategoriler kullanıcı isteğiyle: Genel Dilekçe / Şikâyet / Bilgi Edinme / İmar-Ruhsat /
   Mali-Vergi / Zabıta / Hukuk-İtiraz / İnsan Kaynakları / Diğer / Sınıflandırılmamış. */

export const KATEGORILER = [
  { id: "genel_dilekce", label: "Genel Dilekçe", color: "var(--ke-t)" },
  { id: "sikayet", label: "Şikâyet", color: "var(--ke-bant-sari)" },
  { id: "bilgi_edinme", label: "Bilgi Edinme Başvurusu", color: "var(--ke-v)" },
  { id: "imar_ruhsat", label: "İmar / Ruhsat", color: "var(--ke-derin-sari)" },
  { id: "mali_vergi", label: "Mali İşler / Vergi", color: "var(--ke-bant-yesil)" },
  { id: "zabita", label: "Zabıta", color: "var(--ke-r)" },
  { id: "hukuk_itiraz", label: "Hukuk / İtiraz", color: "var(--ke-iris-3k)" },
  { id: "insan_kaynaklari", label: "İnsan Kaynakları", color: "var(--ke-iris-1k)" },
  { id: "diger", label: "Diğer", color: "var(--ke-mut)" },
  { id: "siniflanmamis", label: "Sınıflandırılmamış", color: "var(--ke-mut3)" },
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
/* Etkin tür: sampleDocs `tur` (kanonik EVRAK_TURLERI) taşır; `id` yalnız tür bilinmiyorsa
   yedektir — örnek kimlikleri ("cimer_sokak_hayvanlari") tür DEĞİLDİR. */
export const etkinTur = (s = {}) => s.tur ?? s.evrak_turu ?? s.id ?? "";

/* CİMER bir KANALDIR, rejim değil: başvurunun kendi beyan ettiği tür ("Başvuru Türü: Bilgi
   Edinme") belirleyicidir. İhbar da kendi içeriğine göre (moloz → Zabıta) gruplanır. */
const CIMER_TURU = /başvuru türü\s*:\s*(bilgi edinme|şikayet|şikâyet)/;

export function evrakKategori({ evrak_turu = "", birim = "", konu = "", text = "" } = {}) {
  const t = trLow(evrak_turu);
  const blob = trLow(`${konu} ${text}`);
  const cimerTuru = t === "cimer" ? (blob.match(CIMER_TURU) || [])[1] : null;

  // 1) Prosedürel intake türü (ayrı rejim → içerikten önce)
  if (t === "bilgi_edinme" || cimerTuru === "bilgi edinme") return "bilgi_edinme";
  if (t === "sikayet" || (cimerTuru && cimerTuru !== "bilgi edinme")) return "sikayet";

  // 2) İçerik-spesifik (tür-üstü): imar/zabıta/İK belge türüne bağlı değil
  if (/imar|ruhsat|yapı ruhsat|iskan|kaçak yapı|yıkım|tadilat|parsel|kat irtifak|imar planı/.test(blob))
    return "imar_ruhsat";
  if (/zabıta|işgal|seyyar|moloz|hafriyat|kaçak döküm|gürültü|ruhsatsız işyer|işyeri açma|pazar yeri|umuma açık/.test(blob))
    return "zabita";
  if (/personel|kadro|naklen|terfi|özlük|memur alım|atama|disiplin soruşturma|izin talebi/.test(blob)
      || birim === "insan_kaynaklari")
    return "insan_kaynaklari";

  // 3) Kalan tür/birim-bazlı
  if (t === "ihbar") return "sikayet";
  if (["dilekce", "basvuru", "talep", "cok_konulu", "cimer"].includes(t)) return "genel_dilekce";
  if (t === "fatura" || birim === "mali_strateji_sgb" || /vergi|tahakkuk|harç|emlak vergisi|tahsilat|fatura bedel/.test(blob))
    return "mali_vergi";
  if (["dava_evraki", "icra_evraki", "tebligat", "muzekkere", "gorus_mutalaa"].includes(t)
      || birim === "hukuk_musavirligi" || /dava|icra|haciz|itiraz|temyiz|istinaf|müzekkere/.test(blob))
    return "hukuk_itiraz";

  // 4) Belirsiz / sınıflanmamış
  if (t === "belirsiz" || !t) return "siniflanmamis";
  return "diger"; // ust_yazi, rapor, tutanak, genelge_talimat_olur vb.
}
