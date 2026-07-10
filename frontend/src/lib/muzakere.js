/* muzakere — AI Bürokrasi/Revizyon Kurulu'nun müzakere motoru (saf JS, DOM/React yok).
   KURGU: Kurul, pipeline'da ZATEN bağımsız çalışan ajanların bulgularını müzakere diline
   çevirir — Taslakçı=yazi_taslak, Hukukçu=verify+lint-2646+NLI+tutarlılık, Vatandaş
   Avukatı=2646 üslup. Her tur `kaynak` alanıyla gerçek sinyale izlenebilir; motor r'de
   olmayan mevzuat/sinyal ASLA uydurmaz.
   ÇIKTI = REVİZE TASLAĞI: dayanaksız iddialar (uydurma-veto) satırdan ÇIKARILIR, lint
   düzeltmeleri işlenir → uzlasi_metni. Verdict/mühür/sevk töreni YOK; `risk` yalnız rozet.
   Gerçek sonuç yoksa etiketli ÖRNEK senaryo (ORNEK_KURGU) oynar; taslak üretilmemişse
   kurul toplanamaz (uydurma müzakere yok). */

const dizi = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const strDizi = (x) => dizi(x).filter((u) => typeof u === "string" && u.trim());
// Türkçe harf-katlamalı normalize (uydurma iddia ↔ taslak satırı eşleştirme için).
const trKatla = (s) => String(s).toLocaleLowerCase("tr-TR")
  .replace(/ö/g, "o").replace(/ü/g, "u").replace(/ç/g, "c")
  .replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ı/g, "i")
  .replace(/[^a-z0-9]/g, "");

const YAZI_TR = {
  ust_yazi: "üst yazı", cevabi_yazi: "cevabi yazı", bilgilendirme: "bilgilendirme yazısı",
  olur: "olur yazısı", muzekkere: "müzekkere", gorus_mutalaa: "görüş yazısı",
};
const SABIT_SATIR = /^(T\.C\.|Sayı\s*:|Konu\s*:|İlgi\s*:)/;
const DAYANAK_DESENI = /\b(sayılı|madde|m\.\s?\d)/i;
// verify_uyari karışık listedir: uydurma-veto ("kaynak evrakta yok/geçmiyor") + format eksikleri
// ("Eksik bölüm: …"). Blanket "uydurma" suçlaması YASAK — sinyal türüne göre konuşulur.
const UYDURMA_DESENI = /kaynak evrakta (yok|geçmiyor)/i;
const EKSIK_BOLUM_DESENI = /^Eksik bölüm/i;
const USLUP_DESENI = /uslup|üslup/i;
const MAKS_ITIRAZ = 2;   // tur başına sinyal üst sınırı — müzakere temposu boğulmasın
// [DOĞRULA]/düşük güven/inceleme işaretli öneriye "sağlam" denemez (CLAUDE.md §1).
const mevzuatTemiz = (m) => m && m.baslik && m.guven !== "düşük" && !m.inceleme_oner
  && !m.dogrula && !/\[DOĞRULA/.test(String(m.baslik));

/** yazi_taslak_md → satır listesi ({id, metin, sabit}). */
function taslakSatirlari(md) {
  return String(md).split("\n").map((metin, i) => ({ id: `s${i}`, metin, sabit: SABIT_SATIR.test(metin) }));
}

/** İlk taslak ile lint düzeltme önerisi arasındaki satır farkları (pozisyonel).
    Satır sayıları farklıysa güvenli davranır: edit üretmez (yanlış eşleme riski).
    NOT: lint_duzeltme_md sözleşme gereği FORMAT düzeltmesidir (verify.py: yalnız işaretli
    format ihlalleri) — dil/sadeleştirme İDDİA EDİLMEZ; vurgu dayanak|format olur. */
function duzeltmeEditleri(taslak, duzeltmeMd) {
  const yeni = String(duzeltmeMd).split("\n");
  if (yeni.length !== taslak.length) return [];
  const editler = [];
  for (let i = 0; i < taslak.length && editler.length < MAKS_ITIRAZ; i += 1) {
    const once = taslak[i].metin, sonra = yeni[i];
    if (once.trim() !== sonra.trim() && sonra.trim()) {
      const dayanak = DAYANAK_DESENI.test(sonra) && !DAYANAK_DESENI.test(once);
      editler.push({ satirId: taslak[i].id, once, yeni: sonra, vurgu: dayanak ? "dayanak" : "format" });
    }
  }
  return editler;
}

/** Bir turun edit'ini taslağa uygula (saf — yeni dizi döner). edit.sil → satır çıkarılır
    (dayanaksız iddia), yoksa satır yeniden yazılır. Bileşen animasyonda da kullanır. */
export function editUygula(taslak, edit) {
  if (edit.sil) return taslak.filter((l) => l.id !== edit.satirId);
  return taslak.map((l) => (l.id === edit.satirId ? { ...l, metin: edit.yeni, vurgu: edit.vurgu } : l));
}

// Kurgudaki TÜM uygulanabilir editler (tur editleri + öneri editleri) — tek kaynak.
const _tumEditler = (kurgu) => [
  ...dizi(kurgu.turlar).filter((t) => t.edit).map((t) => t.edit),
  ...dizi(kurgu.oneriler).filter((o) => o.edit).map((o) => o.edit),
];

/** Tüm editler uygulanmış nihai (revize) taslak — çıkarılanlar silinir, düzeltilenler yeniden
    yazılır. Reduced-motion / son kare / "revize taslağını uygula" ve uzlasi_metni ile TUTARLI. */
export function nihaiTaslak(kurgu) {
  return _tumEditler(kurgu).reduce((d, e) => editUygula(d, e), kurgu.taslak.map((l) => ({ ...l })));
}

// Uydurma-veto uyarısından dayanaksız iddiayı ayıkla: "…(LLM grounding): <iddia>" → <iddia>.
const _UYDURMA_IDDIA = /kaynak evrakta yok \(LLM grounding\):\s*(.+?)\s*$/i;
/** Dayanaksız iddiayı içeren taslak satırını bul — YALNIZ TEK KESİN eşleşmede kaldır (yanlış
    satır silme guard'ı, adversarial bulgu): iddia satırı tümüyle alıntılıyor VEYA iddia satırın
    çoğunu (≥%60) kaplıyor; birden çok/hiç eşleşme → null (öneri rehber kalır, otomatik silmez). */
function _cikarSatirId(taslak, uyari) {
  const m = _UYDURMA_IDDIA.exec(String(uyari || ""));
  if (!m) return null;
  const iddia = trKatla(m[1]);
  if (iddia.length < 12) return null;   // çok kısa iddia belirsiz — kaldırma yok
  const eslesme = taslak.filter((l) => {
    if (l.sabit) return false;
    const satir = trKatla(l.metin);
    if (satir.length < 8) return false;
    return iddia.includes(satir) || (satir.includes(iddia) && iddia.length >= 0.6 * satir.length);
  });
  return eslesme.length === 1 ? eslesme[0].id : null;
}

/** Revize taslağının düz metni — "Revize taslağını uygula" ile taslağın üzerine yazılır.
    Motor uzlasi_metni'yi hesaplar (çıkar+düzelt işlenmiş); yoksa turlar editlerinden türetir. */
export function uzlasiMetni(kurgu) {
  if (typeof kurgu?.uzlasi_metni === "string") return kurgu.uzlasi_metni;
  return nihaiTaslak(kurgu).map((l) => l.metin).join("\n");
}

/** ProcessResponse → müzakere kurgusu. r yok → ORNEK_KURGU; taslak yok → toplanamaz. */
export function muzakereKurgusu(r) {
  if (!r) return ORNEK_KURGU;
  if (!r.yazi_taslak_md) return { kaynak: "gercek", toplanamaz: true, taslak: [], turlar: [], karar: null };

  const taslak = taslakSatirlari(r.yazi_taslak_md);
  const verify = strDizi(r.verify_uyari);
  const lint = obj(r.lint_2646);
  const kurallar = dizi(lint.kurallar).filter((k) => k && typeof k === "object");
  const kuralUyari = kurallar.filter((k) => k.durum === "uyari");
  const uslupUyari = kuralUyari.filter((k) => USLUP_DESENI.test(`${k.kural || ""} ${k.madde || ""}`));
  const formatUyari = kuralUyari.filter((k) => !uslupUyari.includes(k));
  // kurallar listesi yoksa düz lint.uyari stringlerine düşülür (eski sözleşme).
  const lintFallback = kurallar.length ? [] : strDizi(lint.uyari);
  const nli = dizi(r.mevzuat_nli).filter((n) => n && typeof n === "object");
  const nliZayif = nli.filter((n) => n.entailment === false);
  const mev = dizi(r.mevzuat_onerileri).filter((m) => m && m.baslik);
  const tutar = strDizi(r.tutarlilik_uyari);
  const editler = r.lint_duzeltme_md ? duzeltmeEditleri(taslak, r.lint_duzeltme_md) : [];

  const turlar = [];
  // Kurul Tutanağı — tartışmanın SONUCU: taslakta ne düzeltilmeli/eklenmeli/çıkarılmalı.
  // Müzakere turları tempo için üst-sınırlı; tutanak sinyallerin TAMAMINI kaydeder.
  const oneriler = [];
  const yazi = YAZI_TR[r.yazi_turu] || "resmî yazı";

  // 1 — Taslakçı açılışı: yalnız r'den bilinenler. Mevzuat, öneri OLARAK anılır — taslağın
  // o maddeye atıf yaptığı iddia edilmez (öneri gelen evrak içindir).
  turlar.push({
    who: "taslakci", kaynak: "yazi_taslak",
    text: `Taslağı ${yazi} olarak Yönetmelik-2646 formatında hazırladım.`
      + (r.format_uyumlu ? " Zorunlu bölümler tam." : "")
      + (mev[0] ? ` Mevzuat ajanının önerdiği dayanak: ${mev[0].baslik}.` : ""),
  });

  // 2 — Hukukçu itirazları: her sinyal KENDİ TÜRÜNÜN diliyle (uydurma ≠ eksik bölüm).
  verify.slice(0, MAKS_ITIRAZ).forEach((u) => {
    const text = UYDURMA_DESENI.test(u)
      ? `Uydurma-veto işareti var: ${u} — bu ifade taslakta kalamaz.`
      : EKSIK_BOLUM_DESENI.test(u)
        ? `Doğrulama uyarısı — ${u}; Yönetmelik-2646 gereği tamamlanmalı.`
        : `Doğrulama uyarısı: ${u}`;
    turlar.push({ who: "hukukcu", kaynak: "verify", text });
  });
  verify.forEach((u) => {
    if (UYDURMA_DESENI.test(u)) {
      // Dayanaksız iddia içeren satırı revize taslaktan ÇIKAR (uygulanabilir edit) — bulunabilirse.
      const satirId = _cikarSatirId(taslak, u);
      const oneri = { tip: "cikar", kaynak: "verify", metin: `${u} — dayanaksız ifade taslaktan çıkarılmalı.` };
      if (satirId) { oneri.uygulanabilir = true; oneri.edit = { satirId, sil: true }; }
      oneriler.push(oneri);
    } else if (EKSIK_BOLUM_DESENI.test(u)) {
      oneriler.push({ tip: "ekle", kaynak: "verify", metin: `${u.replace(EKSIK_BOLUM_DESENI, "").replace(/^[:\s]+/, "")} bölümü eklenmeli (Yön. 2646).` });
    } else {
      oneriler.push({ tip: "duzelt", kaynak: "verify", metin: u });
    }
  });
  formatUyari.slice(0, MAKS_ITIRAZ).forEach((k) =>
    turlar.push({ who: "hukukcu", kaynak: "lint_2646", text: `Yönetmelik-2646 ${k.madde ? `${k.madde} ` : ""}uyarısı: ${k.mesaj || k.kural}` }));
  kuralUyari.forEach((k) =>
    oneriler.push({ tip: "duzelt", kaynak: "lint_2646", metin: `${k.madde ? `${k.madde}: ` : ""}${k.mesaj || k.kural}` }));
  lintFallback.slice(0, MAKS_ITIRAZ).forEach((u) =>
    turlar.push({ who: "hukukcu", kaynak: "lint_2646", text: `Yönetmelik-2646 denetimi uyarı veriyor: ${u}` }));
  lintFallback.forEach((u) => oneriler.push({ tip: "duzelt", kaynak: "lint_2646", metin: u }));
  nliZayif.slice(0, 1).forEach((n) =>
    turlar.push({
      who: "hukukcu", kaynak: "nli",
      text: `${n.baslik} atfının anlamsal desteği zayıf${Number.isFinite(Number(n.skor)) ? ` (NLI %${Math.round(Number(n.skor) * 100)})` : ""} — dayanağı güçlendirin ya da insan doğrulaması isteyin.`,
    }));
  nliZayif.forEach((n) =>
    oneriler.push({ tip: "duzelt", kaynak: "nli", metin: `${n.baslik} atfının anlamsal desteği zayıf — dayanak güçlendirilmeli ya da atıf değiştirilmeli.` }));
  tutar.slice(0, 1).forEach((u) =>
    turlar.push({ who: "hukukcu", kaynak: "tutarlilik", text: `Veri tutarlılığı uyarısı: ${u} — kaynak evrak alanları kontrol edilmeli.` }));
  tutar.forEach((u) => oneriler.push({ tip: "duzelt", kaynak: "tutarlilik", metin: `Veri tutarlılığı: ${u} — kaynak evrak alanları kontrol edilmeli.` }));

  // 3 — Düzeltme editleri: 2646 düzeltmesi Hukukçu'nun işidir (format sözleşmesi);
  // "dil sadeleştirildi" iddiası yalnız gerçek üslup sinyali olsaydı yapılabilirdi — yapılmaz.
  editler.forEach((e) => {
    turlar.push({
      who: "hukukcu", kaynak: "lint_duzeltme",
      text: e.vurgu === "dayanak"
        ? `Dayanak eksik yazılmış — 2646 düzeltme önerisini taslağa uyguluyorum: "${e.yeni.trim().slice(0, 70)}"`
        : `Yönetmelik-2646 format düzeltmesini taslağa uyguluyorum: "${e.yeni.trim().slice(0, 70)}"`,
      edit: e,
    });
    oneriler.push({
      tip: "duzelt", kaynak: "lint_duzeltme", uygulanabilir: true,
      metin: `Satır düzeltmesi hazır: "${e.yeni.trim().slice(0, 90)}" — müzakerede taslağa işlendi.`,
    });
  });

  // 4 — Vatandaş Avukatı: üslup denetiminin GERÇEK sonucunu konuşur (üç durum, uydurma yok).
  if (uslupUyari.length) {
    turlar.push({ who: "vatandas", kaynak: "lint_2646", text: `Üslup denetimi uyarı verdi: ${uslupUyari[0].mesaj || uslupUyari[0].kural} — resmî yazıda gündelik kalıp kalamaz.` });
  } else if (kurallar.some((k) => k.durum === "gecti" && USLUP_DESENI.test(`${k.kural || ""} ${k.madde || ""}`))) {
    turlar.push({ who: "vatandas", kaynak: "lint_2646", text: "Üslup denetimi temiz — dil resmî ama anlaşılır, vatandaş açısından itirazım yok." });
  } else {
    turlar.push({ who: "vatandas", kaynak: "lint_2646", text: "Üslup denetiminden bu evrak için bulgu gelmedi — dil hakkında görüş bildirmiyorum." });
  }

  // Revize taslağı = tüm uygulanabilir editler (çıkar/düzelt) işlenmiş hâl. Kurulun ÇIKTISI budur.
  // nihaiTaslak ile TEK kaynaktan hesaplanır (tur editleri lint_duzeltme + öneri editleri çıkar).
  const kismiKurgu = { taslak, turlar, oneriler };
  const uzlasi_metni = nihaiTaslak(kismiKurgu).map((l) => l.metin).join("\n");
  const orijinal_metni = taslak.map((l) => l.metin).join("\n");
  const uzlasi_uygulanabilir = uzlasi_metni.trim() !== orijinal_metni.trim();
  const degisiklik = _tumEditler(kismiKurgu).length;
  const bant = obj(r.risk_metadata).bant || "";

  // 5 — Kapanış: SEVK/MÜHÜR/OY TÖRENİ YOK. Kurul taslağı yorumlayıp revize önerisini özetler.
  const oneriOzet = oneriler.length
    ? `${oneriler.length} değişiklik önerdik${degisiklik ? ` (${degisiklik} tanesi revize taslağa işlendi)` : ""}.`
    : "Taslakta değişiklik gerektiren bir bulgu görmedik.";
  turlar.push({
    who: "hukukcu", kaynak: "muzakere",
    text: mevzuatTemiz(mev[0]) ? `Dayanak (${mev[0].baslik}) yerinde; itirazlarımı önerilere geçirdim.`
      : mev[0] ? "Dayanak önerisi insan doğrulaması kaydıyla not edildi." : "Dayanak yönünden ek itirazım yok.",
  });
  turlar.push({
    who: "taslakci", kaynak: "yazi_taslak",
    text: uzlasi_uygulanabilir
      ? `Önerileri değerlendirdim — ${oneriOzet} Revize taslağı hazırladım; kararı memur verir.`
      : `${oneriOzet} Taslak bu hâliyle gönderime uygun görünüyor.`,
  });

  return {
    kaynak: "gercek", toplanamaz: false, taslak, turlar, oneriler,
    risk: bant, uzlasi_metni, uzlasi_uygulanabilir, degisiklik,
  };
}

const KARAR_KUME = new Set(["uzlasti", "serhli", "sevk"]);
const UYE_KUME = new Set(["taslakci", "hukukcu", "vatandas"]);

/** Düz metni taslak satırlarına böl (sabit-satır bayrağı dahil) — sunucu/örnek/revize ortak. */
export function metniSatirlara(md, prefix = "s") {
  return String(md || "").split("\n").map((metin, i) => ({ id: `${prefix}${i}`, metin, sabit: SABIT_SATIR.test(metin) }));
}

/** /yazi/kurul LLM yanıtını (kaynak:"llm") kurgu şekline normalize et — savunmacı; geçersiz
    üye/tip düşer, karar kapalı-kümeye çekilir, uzlaşı metni yoksa result taslağına düşer.
    data.kaynak !== "llm" (deterministik fallback) VEYA bozuksa → null (çağıran yerel motora düşer). */
export function sunucuKurgusu(data, result = {}) {
  if (!data || data.kaynak !== "llm") return null;
  const turlar = dizi(data.turlar)
    .filter((t) => t && UYE_KUME.has(t.who) && typeof t.text === "string" && t.text.trim())
    .map((t) => ({ who: t.who, kaynak: t.kaynak || "muzakere", text: t.text }));
  const oneriler = dizi(data.oneriler)
    .filter((o) => o && ["duzelt", "ekle", "cikar"].includes(o.tip) && typeof o.metin === "string" && o.metin.trim())
    .map((o) => ({ tip: o.tip, kaynak: o.kaynak || "muzakere", metin: o.metin, uygulanabilir: !!o.uygulanabilir }));
  if (!turlar.length && !oneriler.length) return null;   // boş → yerel motor daha iyi
  const taslakMd = String(result.yazi_taslak_md || "");
  const uzlasi = typeof data.uzlasi_metni === "string" && data.uzlasi_metni.trim()
    ? data.uzlasi_metni : taslakMd;
  return {
    kaynak: "llm",
    toplanamaz: false,
    taslak: metniSatirlara(taslakMd),
    turlar,
    oneriler,
    // Risk yalnız rozet — SUNUCU bandı otoriter; yoksa LLM karar etiketinden türet.
    risk: (obj(data.sinyaller).risk_metadata || {}).bant || (KARAR_KUME.has(data.karar) ? BANT_RISK[data.karar] : ""),
    degisiklik: oneriler.filter((o) => o.uygulanabilir).length,
    uzlasi_metni: uzlasi,
    uzlasi_uygulanabilir: !!data.uzlasi_uygulanabilir && uzlasi.trim() !== taslakMd.trim(),
  };
}

// LLM karar etiketi → risk bandı (rozet için; sunucu bant döndürmezse karardan türet).
const BANT_RISK = { uzlasti: "yesil", serhli: "sari", sevk: "kirmizi" };

/** Kurgudan uygulanacak revize metni — her iki yol da uzlasi_metni taşır. */
export function kurguUzlasiMetni(kurgu) {
  return uzlasiMetni(kurgu);
}

/* ---- Örnek senaryo (gerçek sonuç yokken oynayan, EKRANDA ETİKETLİ kurgu) ----
   Faz-1 prototipinden (16216be) taşındı; içerik gerçek sinyal adlarına dayanır ama sabittir. */
const derinDondur = (x) => {
  if (Array.isArray(x)) x.forEach(derinDondur);
  else if (x && typeof x === "object") Object.values(x).forEach(derinDondur);
  return Object.freeze(x);
};
const ORNEK_TASLAK = [
  { id: "ust", metin: "T.C.\n… VALİLİĞİ\nİnsan Kaynakları ve Eğitim Müdürlüğü", sabit: true },
  { id: "sayi", metin: "Sayı : E-2026/1502", sabit: true },
  { id: "konu", metin: "Konu : Bilgi Edinme Başvurusu", sabit: true },
  { id: "ilgi", metin: "İlgi : 09.07.2026 tarihli başvurunuz.", sabit: true },
  { id: "govde1", metin: "İşbu talebinize binaen, tarafınızca talep edilen bilgiler 4982 sayılı Kanun kapsamında değerlendirilmiştir." },
  { id: "govde2", metin: "Söz konusu bilgiler 15 iş günü içinde tarafınıza iletilecektir." },
  { id: "kapanis", metin: "Bilgilerinize saygıyla sunulur.", sabit: true },
];
const ORNEK_TURLAR = [
  { who: "taslakci", kaynak: "ornek", text: "Taslağı Yön. 2646 formatında hazırladım. 4982 sayılı Kanun kapsamında 15 iş günü içinde yanıt öngörülüyor." },
  { who: "hukukcu", kaynak: "ornek", text: "Dayanağın zayıf. Başvuru 3071 sayılı Kanun m.4 dilekçe hakkına dayanıyor; ancak süre için madde yok — 4982 m.11 açıkça yazılmalı.",
    edit: { satirId: "govde2", yeni: "Söz konusu bilgiler, 4982 sayılı Kanun'un 11. maddesi uyarınca 15 iş günü içinde tarafınıza iletilecektir.", vurgu: "dayanak" } },
  { who: "vatandas", kaynak: "ornek", text: "Dil çok ağır. 'İşbu talebinize binaen' vatandaşı yıldırır — 'Başvurunuz üzerine' demek yeterli, üstelik daha anlaşılır.",
    edit: { satirId: "govde1", yeni: "Başvurunuz üzerine, talep ettiğiniz bilgiler 4982 sayılı Bilgi Edinme Kanunu kapsamında değerlendirilmiştir.", vurgu: "sade" } },
  { who: "taslakci", kaynak: "ornek", text: "Sadeleştirmeyi kabul ediyorum; resmî üslup kapanışta korunuyor. m.11 dayanağını da ekledim." },
  { who: "hukukcu", kaynak: "ornek", text: "m.11 dayanağı eklendi, dil sadeleşti — itirazlarımı revize taslağa geçirdim." },
  { who: "taslakci", kaynak: "ornek", text: "Revize taslağı hazır — 2 değişiklik işlendi; kararı memur verir." },
];
// Örnek revize metni = turlar editleri ORNEK_TASLAK'a uygulanmış hâl (sözleşme gerçek kurguyla bir).
const _ornekRevize = ORNEK_TURLAR.reduce((d, t) => (t.edit ? editUygula(d, t.edit) : d), ORNEK_TASLAK.map((l) => ({ ...l })));
export const ORNEK_KURGU = derinDondur({
  kaynak: "ornek", toplanamaz: false, taslak: ORNEK_TASLAK, turlar: ORNEK_TURLAR,
  oneriler: [
    { tip: "duzelt", kaynak: "lint_duzeltme", metin: "Süre için 4982 m.11 dayanağı açıkça eklendi.", uygulanabilir: true },
    { tip: "duzelt", kaynak: "lint_2646", metin: "Ağır kalıp sadeleştirildi ('İşbu talebinize binaen' → 'Başvurunuz üzerine').", uygulanabilir: true },
  ],
  risk: "", degisiklik: 2, uzlasi_uygulanabilir: true,
  uzlasi_metni: _ornekRevize.map((l) => l.metin).join("\n"),
});
