/* detayYorum — NeonDetay kartlarının duruma-uygun anlatı motoru (saf JS, DOM/React yok).
   Her fonksiyon ProcessResponse (r) alanlarından TÜRETİLMİŞ cümle üretir; sabit iddia yok:
   maskeleme/KVKK yalnız gerçekten maskeli alan varsa, "değiştirilemez" yalnız zincir
   bütünlüğü doğrulandıysa, eşik/NLI/CRAG cümleleri yalnız o veri mevcutsa söylenir.
   Ton anahtarları ("yesil"|"sari"|"kirmizi") — bileşen bunları DERIN/BANT token'ına çevirir. */

/* Backend eksik_tespit._RESMI_YAZI_TURLER ile hizalı — dayanak cümlesi tür-duyarlı. */
const RESMI_TURLER = new Set([
  "ust_yazi", "cevabi_yazi", "muzekkere", "tebligat", "genelge_talimat_olur", "gorus_mutalaa",
]);
const ILGILILIK_ESIK = 0.6; // MevzuatRow amber eşiğiyle aynı

/* Backend alanı dizi olmalı ama sözleşme dışı şekil (string/obje) sayı uydurmasın. */
const dizi = (x) => (Array.isArray(x) ? x : []);

const maskeliAlanlar = (r = {}) =>
  Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k.endsWith("_maskeli") && v)
    .map(([k]) => k.replace(/_maskeli$/, "").replace(/_/g, " "));

/** Hüküm şeridi başlığı — kontrol noktaları (verify+tutarlılık+eksik+lint) ve risk bandı
    birlikte; "sorunsuz" yalnız bant AÇIKÇA yeşil VE sıfır kontrol noktasıyla söylenir. */
export function hukumYorum(r = {}) {
  const kontrol = dizi(r.verify_uyari).length + dizi(r.tutarlilik_uyari).length
    + dizi(r.eksik_alanlar).length + dizi(r.lint_2646?.uyari).length;
  const band = r.risk_metadata?.bant;   // yokluk ≠ yeşil — bant kapalıysa hüküm nötr kalır
  if (kontrol === 0 && band === "yesil") {
    return { baslik: "İşlem sorunsuz tamamlandı", ton: "yesil" };
  }
  if (band === "kirmizi") {
    const on = kontrol ? `${kontrol} kontrol noktası · ` : "";
    const onay = r.onay_durumu === "onaylandı" ? "kırmızı risk — memur onayıyla sürdürüldü"
      : r.onay_durumu === "reddedildi" ? "kırmızı risk — memur tarafından reddedildi"
      : "kırmızı risk — memur onayı gerekli";
    return { baslik: `İşlem tamamlandı · ${on}${onay}`, ton: "kirmizi" };
  }
  if (kontrol === 0 && band == null) return { baslik: "İşlem tamamlandı", ton: "yesil" };
  // Buraya düşen her durum dikkat ister: bant sarı/bilinmiyor VEYA kontrol noktası var → amber.
  const parca = [];
  if (kontrol) parca.push(`${kontrol} kontrol noktası`);
  if (band === "sari") parca.push("sarı risk bandı");
  else if (band != null && band !== "yesil") parca.push("risk bandı belirlenemedi");
  return { baslik: `İşlem tamamlandı · ${parca.join(" · ")}`, ton: "sari" };
}

/** Özet kartı dipnotu — KVKK maskeleme iddiası yalnız gerçekten maskeleme olduysa. */
export function ozetDipnot(r = {}) {
  const maskeli = maskeliAlanlar(r);
  if (maskeli.length) {
    return `Kısa öz — kişisel veriler (${maskeli.join(", ")}) özetten önce maskelendi (KVKK).`;
  }
  if ((r.bilgi_unsurlari || {}).pii_var) {
    return "Kısa öz — tespit edilen kişisel veriler özetten önce maskelendi (KVKK).";
  }
  return "Kısa öz — bu evrakta maskelenmesi gereken kişisel veri (TCKN/telefon) tespit edilmedi.";
}

/** Bilgi unsurları kartı: {tag, dipnot} — etiket ve kilit dipnotu maskeleme durumuna bağlı. */
export function unsurEtiket(r = {}) {
  const maskeli = maskeliAlanlar(r);
  if (maskeli.length) {
    return {
      tag: `KVKK · ${maskeli.length} alan maskeli`,
      dipnot: `Ham ${maskeli.join("/")} sistemde tutulmaz — çıkarım anında maskelendi (KVKK).`,
    };
  }
  // pii_var işaretli ama maskeli anahtar yok → PII çipiyle çelişmemek için yine maskelendi dili.
  if ((r.bilgi_unsurlari || {}).pii_var) {
    return { tag: "KVKK · maskeli", dipnot: "Tespit edilen kişisel veriler çıkarım anında maskelendi (KVKK)." };
  }
  return {
    tag: null,
    dipnot: "Bu evrakta kişisel veri (TCKN/telefon) tespit edilmedi — maskeleme gerekmedi.",
  };
}

/** Eksik bilgi kontrolü: {durum, metin} — dayanak tür-duyarlı, taslak durumuyla tutarlı. */
export function eksikYorum(r = {}) {
  // Bozuk şekil (dizi değil) → "eksiksiz" iddiası YASAK; temkinli kontrol mesajı döner.
  if (r.eksik_alanlar != null && !Array.isArray(r.eksik_alanlar)) {
    return { durum: "eksik", metin: "Eksik-alan kontrolü doğrulanamadı — evrak kaydını inceleyin." };
  }
  const eksik = dizi(r.eksik_alanlar);
  const dilekce = r.evrak_turu === "dilekce";
  const dayanak = dilekce
    ? "3071 sayılı Kanun m.4 zorunlu unsurları (ad-soyad, imza, adres)"
    : RESMI_TURLER.has(r.evrak_turu)
      ? "Resmî Yazışma Yönetmeliği (2646) zorunlu bölümleri"
      : "Zorunlu alanlar";
  if (eksik.length) {
    // 3071 m.4'ün "incelenmez" hükmü YALNIZ kritik unsurlar (ad-soyad/imza/adres) için geçerli;
    // taslak üretilmişse sayfa zaten işlendiğini gösterir → "incelenemez" iddiası yasak.
    const KRITIK_3071 = ["gonderen_ad_soyad", "imza", "iletisim_adres"];
    const kritik = dilekce ? eksik.filter((a) => KRITIK_3071.includes(a)) : [];
    const taslakVar = !!r.yazi_taslak_md && !r.clarify_stop;
    let sonuc;
    if (kritik.length && !taslakVar) {
      sonuc = "3071 sayılı Kanun m.4 gereği bu unsurlar tamamlanmadan dilekçe incelenemez; "
        + "yazı taslağı bilgiler tamamlanınca hazırlanacak.";
    } else if (kritik.length) {
      sonuc = "taslak hazırlandı ancak 3071 sayılı Kanun m.4 kapsamındaki eksikler "
        + "tamamlanmadan yazı gönderilmemeli.";
    } else if (taslakVar) {
      sonuc = "taslak hazırlandı ancak eksikler tamamlanmadan işlem kesinleştirilemez.";
    } else {
      sonuc = "tamamlanmadan işlem kesinleştirilemez.";
    }
    return { durum: "eksik", metin: `${eksik.length} zorunlu alan eksik — ${sonuc}` };
  }
  let metin = `${dayanak} eksiksiz — evrak işleme alınabilir.`;
  if (r.clarify_stop) metin += " Yazı taslağı, istenen bilgiler tamamlanınca hazırlanacak.";
  else if (r.yazi_taslak_md) metin += " Resmî yazı taslağı doğrudan hazırlandı.";
  const tutarN = dizi(r.tutarlilik_uyari).length;
  if (tutarN) metin += ` Dikkat: ${tutarN} veri-tutarlılık uyarısı var — Doğrulama kartını inceleyin.`;
  return { durum: "tam", metin };
}

/** Mevzuat kartı dipnotu — eşik sayımı gerçek skorlardan; NLI/CRAG yalnız veri varsa anılır. */
export function mevzuatDipnot(r = {}) {
  const mev = dizi(r.mevzuat_onerileri).filter(Boolean);
  const skorlu = mev.filter((m) => Number.isFinite(Number(m.score)));
  const alti = skorlu.filter((m) => Number(m.score) < ILGILILIK_ESIK).length;
  const parca = [];
  if (!skorlu.length) parca.push("Öneriler BM25 sözcüksel eşleşmeyle sıralanır.");
  else if (!alti) parca.push(`${mev.length} önerinin tamamı %${ILGILILIK_ESIK * 100} ilgililik eşiğinin üzerinde.`);
  else parca.push(`${mev.length} öneriden ${alti} tanesi %${ILGILILIK_ESIK * 100} eşiğin altında — düşük alaka (amber).`);
  if (dizi(r.mevzuat_nli).length) parca.push("Anlamsal destek NLI (entailment) ile ölçüldü.");
  if (r.crag_corrected) {
    const o = Number(r.crag_guven_oncesi), s = Number(r.crag_guven_sonrasi);
    const guven = Number.isFinite(o) && Number.isFinite(s)
      ? ` (güven ${Math.round(o * 100) / 100}→${Math.round(s * 100) / 100})` : "";
    parca.push(`CRAG öz-düzeltme uygulandı${guven}.`);
  }
  return parca.join(" ");
}

/** Birim yönlendirme dipnotu — gerçek routing gerekçesi varsa onu gösterir. */
export function birimDipnot(r = {}) {
  const gerekce = String(r.birim_reasoning || "").trim();
  if (gerekce) return `Gerekçe: ${gerekce} · Nihai havale memur onayındadır.`;
  return "Sıralama içerik sinyali + birim görev alanı eşleşmesiyle yapılır; nihai havale memur onayındadır.";
}

/** Denetim izi dipnotu: {metin, ton} — bütünlük bozuksa 'değiştirilemez' İDDİA EDİLMEZ. */
export function denetimDipnot(butunluk = true, halkaSay = 0) {
  if (!butunluk) {
    return {
      ton: "sari",
      metin: "Zincir bütünlüğü doğrulanamadı — hash'ler tutarsız; kayıt üzerinde oynama olabilir, denetime esas almayın.",
    };
  }
  const n = halkaSay ? `${halkaSay} halkanın her biri` : "Her halka";
  return { ton: "yesil", metin: `Değiştirilemez — ${n} bir öncekinin hash'ini mühürler (tamper-evident).` };
}

/** Lint kartı giriş cümlesi — kural sayıları gerçek rapordan. */
export function lintGiris(lint = {}) {
  const kurallar = (Array.isArray(lint.kurallar) ? lint.kurallar : []).filter((k) => k && typeof k === "object");
  if (!kurallar.length) return "Taslak, Resmî Yazışma Yönetmeliği (CB 2646/2020) kurallarından madde madde geçirilir.";
  const uyariN = dizi(lint.uyari).length;
  // ozet.gecti backend'de doğrulanmıyor → [0, kural sayısı] aralığına kelepçelenir.
  const ham = Number.isFinite(Number(lint.ozet?.gecti)) ? Number(lint.ozet.gecti) : kurallar.length - uyariN;
  const gecti = Math.max(0, Math.min(kurallar.length, ham));
  if (!uyariN) {
    // Geçmeyen satırlar uyarı değil "bilgi" olabilir (ör. sayı yer tutucusu) — uyarı iddiası yok.
    return gecti >= kurallar.length
      ? `Resmî Yazışma Yönetmeliği (CB 2646/2020) denetimi: ${kurallar.length} kuralın tamamı geçti.`
      : `Resmî Yazışma Yönetmeliği (CB 2646/2020) denetimi: ${kurallar.length} kuraldan ${gecti} geçti; kalanı bilgi notu (uyarı yok).`;
  }
  return `Resmî Yazışma Yönetmeliği (CB 2646/2020) denetimi: ${kurallar.length} kuraldan ${gecti} geçti, ${uyariN} uyarı — uyarılı maddeler aşağıda işaretli.`;
}

const parseTrTarih = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || "").trim());
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};

/** SLA zaman çizelgesi konumu — başlangıç/son tarih/kalan günden GERÇEK oran hesaplar.
    Dönen: {oran 0..1 (bugünün süre içindeki yeri), gecen, toplam, kalan} | null (hesaplanamaz). */
export function slaKonum(sla = {}) {
  const bas = parseTrTarih(sla.baslangic), son = parseTrTarih(sla.son_tarih);
  const kalan = Number(sla.kalan_gun);
  if (!bas || !son || !Number.isFinite(kalan)) return null;
  const toplam = Math.round((son - bas) / 86400000);
  if (toplam <= 0) return null;
  const gecen = toplam - kalan;   // bugün = son_tarih − kalan_gun
  return { oran: Math.min(1, Math.max(0, gecen / toplam)), gecen: Math.max(0, gecen), toplam, kalan };
}

/** Çok-konulu ayrıştırma girişi — alt-talep ve birim sayısı gerçekten sayılır. */
export function decomposeGiris(alt = []) {
  const talepler = dizi(alt).filter(Boolean);
  if (!talepler.length) return "";
  const birimler = new Set(talepler.map((a) => a.birim || a.birim_tr).filter(Boolean));
  // Birim verisi hiç yoksa havale iddiası YAPILMAZ (yokluktan olumlu iddia türetilmez).
  if (!birimler.size) return `Tek evraktaki ${talepler.length} ayrı istek bölündü.`;
  const hedef = birimler.size > 1 ? `${birimler.size} farklı birime` : "aynı birime";
  return `Tek evraktaki ${talepler.length} ayrı istek bölündü; her biri ${hedef} ayrı havale edildi.`;
}
