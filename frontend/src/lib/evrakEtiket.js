/* evrakEtiket — makine kodu → Türkçe etiket ve taslak metni temizleme yardımcıları (saf; JSX yok).
   result-cards.jsx'ten taşındı (tur 6: dosya 1092 satırdı ve 20'den fazla görünüm yalnız bu
   etiketler için 1000 satırlık eski kart dosyasını bağımlılık olarak çekiyordu). result-cards
   bunları geriye uyum için YENİDEN DIŞA AKTARIR — mevcut içe aktarmalar değişmeden çalışır.
   Yeni kod doğrudan buradan içe aktarmalıdır. */
// --- Makine kodu → Türkçe etiket (backend config ile eşleşir; UI okunabilirliği) ---
const EVRAK_TURU_TR = {
  dilekce: "Dilekçe", basvuru: "Başvuru", sikayet: "Şikâyet", ihbar: "İhbar",
  talep: "Talep", bilgi_edinme: "Bilgi Edinme Başvurusu", cimer: "CİMER Başvurusu",
  ust_yazi: "Üst Yazı", cevabi_yazi: "Cevabi Yazı", tebligat: "Tebligat",
  dava_evraki: "Dava Evrakı", icra_evraki: "İcra Evrakı", muzekkere: "Müzekkere",
  fatura: "Fatura / Ödeme Belgesi", tutanak: "Tutanak", rapor: "Rapor",
  gorus_mutalaa: "Görüş / Mütalaa", genelge_talimat_olur: "Genelge / Talimat / Olur",
  belirsiz: "Belirsiz",
};
const BIRIM_TR = {
  yazi_isleri_evrak: "Yazı İşleri / Genel Evrak Müdürlüğü",
  hukuk_musavirligi: "Hukuk Müşavirliği",
  insan_kaynaklari: "İnsan Kaynakları / Personel Dairesi",
  mali_strateji_sgb: "Strateji Geliştirme / Mali İşler",
  bilgi_islem: "Bilgi İşlem Dairesi",
  destek_idari_hizmetler: "Destek / İdari Hizmetler Dairesi",
  // Kova dilekçe + bilgi-edinme + CİMER'i birlikte tutar; varsayılan etiket "CİMER"i KOŞULSUZ
  // İDDİA ETMEZ (düz dilekçe CİMER'den gelmedi) — CİMER/Bilgi-Edinme yükseltmesi BIRIM_GOSTER'de.
  basin_halkla_iliskiler_cimer: "Basın-Halkla İlişkiler / Başvuru-Kayıt",
  teftis_ic_denetim: "Teftiş / İç Denetim",
  ilgili_teknik_daire: "İlgili Teknik / Ana Hizmet Dairesi",
};
const YAZI_TURU_TR = {
  ust_yazi: "Üst Yazı", cevabi_yazi: "Cevabi Yazı",
  bilgilendirme: "Bilgilendirme Yazısı", olur: "Olur / Onay Yazısı",
  muzekkere: "Müzekkere", gorus_mutalaa: "Görüş / Mütalaa",
};

const EVRAK_TR = (k) => EVRAK_TURU_TR[k] || k || "—";
const BIRIM_LBL = (k) => BIRIM_TR[k] || k || "—";
const YAZI_TR = (k) => YAZI_TURU_TR[k] || k || "";

// Hedef birim (deterministik 9-set) İÇERİK-DUYARLI gösterim etiketi. basin_halkla_iliskiler_cimer
// kovası dilekçe + bilgi-edinme + CİMER'i birlikte tutar. Kullanıcı kuralı: "CİMER yalnızca
// dilekçe CİMER'den geldiyse". Varsayılan etiket (BIRIM_LBL) artık hiçbir zaman-yanlış olmayan
// halkla ilişkiler/başvuru-kayıt kanalıdır; evrak GERÇEKTEN cimer/bilgi_edinme türündeyse etiketi
// o kanala YÜKSELTİRİZ. Ölçülen hedef_birim KODU/rotası DEĞİŞMEZ — yalnız insan-okur etiket bağlama göre.
const BIRIM_GOSTER = (kod, evrakTuru) => {
  if (kod === "basin_halkla_iliskiler_cimer") {
    if (evrakTuru === "cimer") return "CİMER / Halkla İlişkiler Birimi";
    if (evrakTuru === "bilgi_edinme") return "Bilgi Edinme / Halkla İlişkiler Birimi";
  }
  return BIRIM_LBL(kod);
};

// XSS guard — mevzuat linki yalnız http/https olsun; javascript:/data: vb. reddedilir.
// Reddedilirse null döner → çağıran link yerine düz metin gösterir.
function safeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const VERIFY_MARK_RE = /\[\s*(?:DOĞRULA|DOGRULA)\s*:?\s*([^\]]*)\]/giu;
const TEMPLATE_SLOT_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function uniqueLabels(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").replace(/\s+/g, " ").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function prettyFieldName(raw) {
  const clean = String(raw || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Alan";
  return clean
    .split(/([/\-\s]+)/)
    .map((part) => {
      if (/^[\s/-]+$/.test(part)) return part;
      const lower = part.toLocaleLowerCase("tr-TR");
      return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
    })
    .join("");
}

function cleanReviewNote(raw) {
  return String(raw || "kontrol gerekli").replace(/\s+/g, " ").trim() || "kontrol gerekli";
}

function cleanDemoText(value) {
  return String(value ?? "")
    .replace(VERIFY_MARK_RE, (_, note) => `Kontrol: ${cleanReviewNote(note)}`)
    .replace(TEMPLATE_SLOT_RE, (_, field) => `Doldurulacak: ${prettyFieldName(field)}`)
    // İç senaryo işaretleri (⭐, "(abstention)") kullanıcı metnine sızmasın.
    .replace(/\s*\(abstention\)/gi, "")
    .replace(/\s*[⭐★]️?/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeDraftForDemo(raw) {
  const fields = [];
  const reviewNotes = [];
  const display = String(raw || "")
    .replace(TEMPLATE_SLOT_RE, (_, field) => {
      const label = prettyFieldName(field);
      fields.push(label);
      return `.................... (${label})`;
    })
    .replace(VERIFY_MARK_RE, (_, note) => {
      const clean = cleanReviewNote(note);
      reviewNotes.push(clean);
      return `(inceleme notu: ${clean})`;
    });
  return {
    display,
    copy: display,
    fields: uniqueLabels(fields),
    reviewNotes: uniqueLabels(reviewNotes),
  };
}

export {
  EVRAK_TURU_TR, BIRIM_TR, YAZI_TURU_TR, EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR,
  safeUrl, uniqueLabels, prettyFieldName, cleanDemoText, normalizeDraftForDemo,
};
