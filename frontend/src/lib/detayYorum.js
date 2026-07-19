/* detayYorum — NeonDetay kartlarının duruma-uygun anlatı motoru (saf JS, DOM/React yok).
   Her fonksiyon ProcessResponse (r) alanlarından TÜRETİLMİŞ cümle üretir; sabit iddia yok:
   maskeleme/KVKK yalnız gerçekten maskeli alan varsa, "değiştirilemez" yalnız zincir
   bütünlüğü doğrulandıysa, eşik/NLI/CRAG cümleleri yalnız o veri mevcutsa söylenir.
   Ton anahtarları ("yesil"|"sari"|"kirmizi") — bileşen bunları DERIN/BANT token'ına çevirir. */

/* Backend eksik_tespit._RESMI_YAZI_TURLER ile hizalı — dayanak cümlesi tür-duyarlı. */
const RESMI_TURLER = new Set([
  "ust_yazi", "cevabi_yazi", "muzekkere", "tebligat", "genelge_talimat_olur", "gorus_mutalaa",
]);
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

/* Korpus etiketi kanun numarasıyla BAŞLAR ("2004 icra iflas kanunu m.60" → "2004").
   Sondaki "m.168" bir kanun no değildir → başlangıç çıpası (^) şart. Numarasız statik
   başlıklar ("Resmî Yazışma Yönetmeliği (CB 2646/2020)") "" döner, sayıma girmez. */
const KANUN_NO_RE = /^\s*(\d{1,4}(?:[-/]\d+)?)\b/;
export const kanunNo = (baslik) =>
  (String(baslik ?? "").match(KANUN_NO_RE)?.[1] || "").replace("/", "-");

/** Mevzuat kartı dipnotu — skorun GÖRELİ olduğunu söyler; NLI/CRAG yalnız veri varsa anılır.
    Eski hâli "N önerinin tamamı %60 eşiğinin üzerinde" diyordu: `score` max-normalize
    olduğundan (lider daima 1.0) bu neredeyse totolojiydi ve kalite ölçüyormuş gibi okunuyordu.
    Güven artık kalibre `norm_score` bandından gelir (bkz. api/mevzuat_zenginlestir.py). */
export function mevzuatDipnot(r = {}) {
  const mev = dizi(r.mevzuat_onerileri).filter(Boolean);
  if (!mev.length) return "";
  const parca = ["Sıralama BM25 sözcüksel eşleşmeyle yapılır; yüzde ilk öneriye görelidir, mutlak alaka ölçüsü değildir."];

  const incele = mev.filter((m) => m.inceleme_oner).length;
  if (incele) parca.push(`${mev.length} öneriden ${incele} tanesi için insan incelemesi önerilir.`);

  // Farklı kanunlardan gelen öneriler birlikte değil ALTERNATİF olabilir. Hangisinin
  // uygulanacağı hukuki karardır — sistem bunu bilemez; iddia etmez, doğrulamaya yönlendirir.
  const kanunlar = new Set(mev.map((m) => kanunNo(m.baslik)).filter(Boolean));
  if (kanunlar.size > 1) {
    parca.push(`Öneriler ${kanunlar.size} ayrı mevzuattan geliyor; hangisinin uygulanacağına sistem karar vermez — maddeyi açıp doğrulayın.`);
  }

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

/** 2646 lint kurallarını durum gruplarına ayır (Lint2646Karti'nın saf mantığı).
 *  Bilinmeyen/eksik `durum` sessizce DÜŞMEZ → `diger` kovasına girer (kart etiketi ile
 *  satır sayısı tutarlı kalır). `varsayilanAcik`: bulgu yoksa geçti listesi açık başlar. */
export function lintGrupla(kurallar) {
  const temiz = (Array.isArray(kurallar) ? kurallar : []).filter((k) => k && typeof k === "object");
  const grup = { uyari: [], bilgi: [], gecti: [], diger: [] };
  for (const k of temiz) (grup[k.durum] || grup.diger).push(k);
  const bulgu = grup.uyari.length + grup.bilgi.length + grup.diger.length;
  return { ...grup, varsayilanAcik: bulgu === 0 };
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

/* ---- Risk bandı sunum katmanı ------------------------------------------------------------
   Backend gerekçeleri MAKİNE SÖZLEŞMESİDİR: risk_guard._UYDURMA_IMZA, muzakere.js regex'i ve
   eval/draft_eval.py aynı stringlere göre eşleşir → burada yalnız GÖRÜNÜM çevrilir, ham metin
   `teknik` alanında birebir korunur (bilgi kaybı yok). Tanınmayan şekil aynen gösterilir —
   uydurma çeviri yapılmaz. Girdi, risk_guard'da zaten PII-maskelenmiş gelir. */

const tirnak = (s) => `“${String(s).trim()}”`;

/* Sıra önemli: uydurma kuralları 'Uydurma şüphesi — ' önekiyle daha spesifik olduğu için üstte. */
const GEREKCE_KURAL = [
  [/^Uydurma şüphesi — Taslaktaki iddia kaynak evrakta yok \(LLM grounding\):\s*(.+)$/i,
    (m) => `Taslakta geçen ${tirnak(m[1])} ifadesi, yüklediğiniz evrakta bulunamadı — yapay zekâ bu bilgiyi kendiliğinden eklemiş olabilir.`],
  [/^Uydurma şüphesi — Taslaktaki '(.+?)' (tarihi|sayısı) kaynak evrakta yok/i,
    (m) => `Taslakta geçen ${tirnak(m[1])} ${m[2]}, yüklediğiniz evrakta bulunamadı — göndermeden önce doğrulayın.`],
  [/^Demo kurumu uyuşmazlığı: bu belge '(.+?)' kurumuna hitaben düzenlenmiş; aktif kurumunuz '(.+?)'\./i,
    (m) => `Bu belge ${tirnak(m[1])} kurumuna hitaben yazılmış, aktif kurumunuz ise ${tirnak(m[2])} — antet aktif kurumla oluşturuldu, göndermek engellenmedi. Dilerseniz belgedeki kurumu aktif kurum olarak kullanabilirsiniz.`],
  [/^Eksik bölüm:\s*(.+)$/i,
    (m) => `Resmî yazıda bulunması gereken ${tirnak(m[1])} bölümü taslakta yok.`],
  [/^Resmî yazı zorunlu format bölümleri eksik$/i,
    () => "Taslak, resmî yazının zorunlu bölümlerini eksiksiz taşımıyor."],
  [/^(\d+) alan doğrulanmalı \(\[DOĞRULA\] işareti\)$/i,
    (m) => `Taslakta ${m[1]} alan “DOĞRULA” işaretiyle bırakıldı; bu bilgileri sizin doğrulamanız gerekiyor.`],
  [/^Eksik zorunlu bilgi:\s*(.+)$/i,
    (m) => `Evrakta bulunması zorunlu şu bilgiler eksik: ${m[1]}.`],
  [/^Evrak türü belirsiz \(sınıflandırma abstention\)$/i,
    () => "Sistem evrakın türünü belirleyemedi; emin olmadığı için tahmin yürütmedi."],
  [/^Düşük sınıflandırma güveni \(([\d.]+)\)$/i,
    (m) => `Sistem evrak türünü tahmin etti ama emin değil (güven: %${Math.round(Number(m[1]) * 100)}).`],
  [/^Format \(2646 lint\):\s*(.+)$/i,
    (m) => `Resmî yazışma biçim kuralına uymayan nokta: ${m[1]}`],
  [/^Tutarlılık:\s*(.+)$/i,
    (m) => `Evraktaki bilgiler birbiriyle uyuşmuyor: ${m[1]}`],
  [/^Tüm doğrulamalar temiz/i,
    () => "Tüm kontroller temiz — bilgiler evraktan geldi, biçim tam, uydurma bilgi yok."],
];

/** Tek risk gerekçesi → {sade, teknik, cevrildi}. Tanınmayan şekilde sade = teknik = ham. */
export function riskGerekceYorum(gerekce) {
  const ham = String(gerekce ?? "").trim();
  if (!ham) return null;
  for (const [desen, cevir] of GEREKCE_KURAL) {
    const m = desen.exec(ham);
    if (m) return { sade: cevir(m), teknik: ham, cevrildi: true };
  }
  return { sade: ham, teknik: ham, cevrildi: false };
}

const BANT_SEVIYE = { yesil: "en düşük seviye", sari: "orta seviye", kirmizi: "en yüksek seviye" };

/* Skorun ne kadarının ölçüme dayandığı memurdan GİZLENMEZ (backend risk_metadata.kalibrasyon). */
const KALIBRASYON_NOT = {
  olculdu: "Ağırlıklar, sistemin geçmiş belgelerdeki isabet oranı ölçülerek belirlendi.",
  kismi: "Ağırlıkların bir kısmı ölçüldü; kalanı henüz ölçülmemiş öngörü değeridir.",
  onsel: "Ağırlıklar henüz ölçülmedi; bunlar öngörü değerleridir.",
  temiz: null,
};

/** Ham 0..1 risk skoru → memurun bildiği yüzde + seviye adı. Skor yoksa/0 ise null (yüzde uydurulmaz).

    `katkilar`: backend'in gerekçe-başına ağırlığı (ciddiyet × ölçülen isabet). Çubuk = o
    nedenin KENDİ ağırlığı; gerekçe sayısına BÖLÜNMEZ. (Eski davranış eşit bölüyordu → kanıt
    arttıkça çubuklar küçülüyor, hafif sarı belge ağır kırmızıdan büyük görünüyordu.)
    Toplamları skora eşit değildir: skor noisy-OR birleşimidir, toplamsal değil. */
export function riskSkorYorum(skor, katkilar, bant, kalibrasyon) {
  const s = Number(skor);
  if (!Number.isFinite(s) || s <= 0) return null;
  const paylar = Array.isArray(katkilar)
    ? katkilar.map((k) => (Number.isFinite(Number(k)) ? Math.round(Number(k) * 100) : null))
    : [];
  const seviye = BANT_SEVIYE[bant] || null;
  const coklu = paylar.filter((p) => p != null).length > 1;
  return {
    yuzde: Math.round(s * 100),
    paylar,
    seviye,
    baslik: `Risk puanı: %${Math.round(s * 100)}${seviye ? ` (${seviye})` : ""}`,
    not: coklu
      ? "Her çubuk, o nedenin kendi ağırlığıdır (ne kadar ciddi olduğu × sistemin o konudaki isabet oranı). "
        + "Toplam puan bu nedenlerin birleşimidir; bir neden bile doğruysa belge riskli sayıldığı için çubukların toplamı puana eşit değildir."
      : "Çubuk, bu nedenin ağırlığıdır: ne kadar ciddi olduğu × sistemin bu konudaki isabet oranı.",
    kalibrasyonNot: KALIBRASYON_NOT[kalibrasyon] ?? null,
    teknik: `ham risk skoru: ${s} · noisy-OR birleşimi`
      + (paylar.length ? ` · gerekçe ağırlıkları: ${katkilar.join(", ")}` : "")
      + (kalibrasyon ? ` · kalibrasyon: ${kalibrasyon}` : ""),
  };
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
