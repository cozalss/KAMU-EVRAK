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
// T.C./Konu ASLA dokunulmaz; Sayı/İlgi (+ diğer etiketli alanlar) SİLİNMEZ, doldurulacak yer
// tutucuya çevrilir — kurul.py _KORUNAN_SATIR / _ETIKET_SATIR ikizi (taslak gönderime-hazır kalır).
const KORUNAN_SATIR = /^(T\.C\.|Konu\s*:)/;
const ETIKET_SATIR = /^(Sayı|İlgi|Koordinasyon|Belge Doğrulama Kodu)\s*:\s*/i;
const DOGRULA_YER_TUTUCU = "[DOĞRULA: kaynak evrakta doğrulanamadı]";
const DAYANAK_DESENI = /\b(sayılı|madde|m\.\s?\d)/i;
// verify_uyari karışık listedir: uydurma-veto ("kaynak evrakta yok/geçmiyor") + format eksikleri
// ("Eksik bölüm: …"). Blanket "uydurma" suçlaması YASAK — sinyal türüne göre konuşulur.
const UYDURMA_DESENI = /kaynak evrakta (yok|geçmiyor)/i;
const EKSIK_BOLUM_DESENI = /^Eksik bölüm/i;
const USLUP_DESENI = /uslup|üslup/i;
const MAKS_ITIRAZ = 2;   // tur başına sinyal üst sınırı — müzakere temposu boğulmasın

/* Talep eşleştirmede AYIRT EDİCİ olmayan bürokratik dolgu — "talep/rica/gereği" her dilekçede
   geçer, eşleşme sayılırsa her talep "karşılanmış" görünür. */
const DOLGU_TOKEN = new Set([
  "talep", "talebi", "talebim", "rica", "gerek", "geregi", "geregini", "husus", "hususunda",
  "konu", "konusunda", "ilgili", "yapilmasini", "yapilmasi", "edilmesi", "edilmesini",
  "ederim", "arz", "basvuru", "basvurum", "dilekce", "tarafinizca", "tarafimiza",
]);

/** Taslakta HİÇ izi olmayan talepler — muhatabın sorusunun cevapsız kalması (yüksek KESİNLİK).
    YALNIZ sıfır örtüşmede işaretlenir: talebin ayırt edici sözcüklerinden HİÇBİRİ taslakta
    geçmiyorsa o talep hiç ele alınmamıştır. Kısmî/dolaylı cevap (kelime örtüşmesi var ama
    içerik farklı) BİLEREK işaretlenmez — yanlış-pozitif, memurun kurula güvenini bitirir;
    eksik yakalamak, yanlış suçlamaktan iyidir (projenin guard felsefesi). */
export function cevapsizTalepler(taslakMd, talepler) {
  const govde = trKatla(taslakMd);
  return strDizi(talepler).filter((t) => {
    const tokenlar = String(t).split(/\s+/)
      .map((w) => trKatla(w))
      .filter((w) => w.length >= 5 && !DOLGU_TOKEN.has(w));
    return tokenlar.length > 0 && !tokenlar.some((w) => govde.includes(w));
  });
}
// [DOĞRULA]/düşük güven/inceleme işaretli öneriye "sağlam" denemez (CLAUDE.md §1).
const mevzuatTemiz = (m) => m && m.baslik && m.guven !== "düşük" && !m.inceleme_oner
  && !m.dogrula && !/\[DOĞRULA/.test(String(m.baslik));

// Birim Amiri (4. üye) sözü DETERMİNİSTİK — gerçek risk bandından türer (LLM üretmez). Backend
// yazi/kurul.py::_RISK_SOZ ile birebir; risk sesi LLM/istemci yolunda asla halüsinasyon olmaz.
const RISK_SOZ = {
  kirmizi: "Risk bandı kırmızı — doğrulanamayan/uydurma bilgi şüphesi var. Bu yazı memur teyidi olmadan gönderilmemeli; kuruldaki revize düzeltmelerini destekliyorum.",
  sari: "Risk bandı sarı — çekinceler giderilmeden gönderime çıkmamalı; revize sonrası tekrar değerlendirilmeli.",
  yesil: "Risk bandı yeşil — biçim ve dayanak yönünden gönderime engel görmüyorum; revize önerileri son hâli güçlendirir.",
};
const birimAmiriTuru = (bant) => ({
  who: "birim_amiri", kaynak: "risk_guard",
  text: RISK_SOZ[bant] || "Risk değerlendirmesi için yeterli sinyal yok; gönderim öncesi memur kontrolü önerilir.",
});

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
/** Dayanaksız iddiayı içeren taslak satırı için edit üret — YALNIZ TEK KESİN eşleşmede (yanlış
    satır silme guard'ı, adversarial bulgu): iddia satırı tümüyle alıntılıyor VEYA iddia satırın
    çoğunu (≥%60) kaplıyor; birden çok/hiç eşleşme → null (öneri rehber kalır, otomatik uygulanmaz).
    Etiketli alan satırı (Sayı/İlgi/…) SİLİNMEZ — alan adı korunarak '[DOĞRULA: …]' yer tutucusuyla
    değiştirilir (taslak gönderime-hazır KALIR — boş alan değil, görünür TODO); T.C./Konu hiç dokunulmaz. */
function _cikarEdit(taslak, uyari) {
  const m = _UYDURMA_IDDIA.exec(String(uyari || ""));
  if (!m) return null;
  const iddia = trKatla(m[1]);
  if (iddia.length < 12) return null;   // çok kısa iddia belirsiz — kaldırma yok
  const eslesme = taslak.filter((l) => {
    if (KORUNAN_SATIR.test(l.metin)) return false;
    const satir = trKatla(l.metin);
    if (satir.length < 8) return false;
    return iddia.includes(satir) || (satir.includes(iddia) && iddia.length >= 0.6 * satir.length);
  });
  if (eslesme.length !== 1) return null;
  const hedef = eslesme[0];
  const etiket = ETIKET_SATIR.exec(hedef.metin);
  return etiket ? { satirId: hedef.id, yeni: `${etiket[0]}${DOGRULA_YER_TUTUCU}` } : { satirId: hedef.id, sil: true };
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
  // Muhatap Temsilcisi'nin ÇAPASI: evraktaki talepler ↔ taslak. Bu şerit 6 Ağu 2026'da
  // eklendi; öncesinde üye yalnız üslup konuşuyordu ve "vatandaşın talebi cevapsız kalmış"
  // hatası — sistemin en pahalı hata sınıflarından biri (vatandaş tekrar başvurur) — hiçbir
  // üyenin görev alanında DEĞİLDİ.
  const cevapsiz = cevapsizTalepler(r.yazi_taslak_md, obj(r.bilgi_unsurlari).talepler);
  const editler = r.lint_duzeltme_md ? duzeltmeEditleri(taslak, r.lint_duzeltme_md) : [];

  const turlar = [];
  // Kurul Tutanağı — tartışmanın SONUCU: taslakta ne düzeltilmeli/eklenmeli/çıkarılmalı.
  // Müzakere turları tempo için üst-sınırlı; tutanak sinyallerin TAMAMINI kaydeder.
  const oneriler = [];
  const yazi = YAZI_TR[r.yazi_turu] || "resmî yazı";
  // Çok-turlu DEBATE (mock/fallback yol da gerçek tartışma hissetsin — araştırma-hizalı):
  // T0=açılış (bağımsız pozisyon) · T1=çapraz-eleştiri (yanit+tutum) · moderatör=tur 2.
  const T0 = (who, kaynak, text) => turlar.push({ who, kaynak, text, tur: 0 });
  const T1 = (who, kaynak, text, yanit, tutum, extra) =>
    turlar.push({ who, kaynak, text, tur: 1, ...(yanit ? { yanit } : {}), ...(tutum ? { tutum } : {}), ...(extra || {}) });
  const itirazN = verify.length + kuralUyari.length + lintFallback.length + nliZayif.length + tutar.length;

  // ---- TUR 0 — AÇILIŞLAR (üç üye bağımsız ilk pozisyon; çeşitlilik en yüksek burada) ----
  T0("taslakci", "yazi_taslak",
    `Taslağı ${yazi} olarak Yönetmelik-2646 formatında hazırladım.`
      + (r.format_uyumlu ? " Zorunlu bölümler tam." : "")
      + (mev[0] ? ` Mevzuat ajanının önerdiği dayanak: ${mev[0].baslik}.` : ""));
  T0("hukukcu", "muzakere", itirazN
    ? `İlk incelemede ${itirazN} doğrulama/biçim çekincem var; kanıtla zorlanmadıkça bunları geçmem.`
    : "Doğrulama sinyalleri temiz görünüyor; yine de dayanağı ve biçimi tek tek sınayacağım.");
  // Muhatap Temsilcisi açılışı — ÖNCELİK cevapsız talepte: bir talebin hiç ele alınmaması,
  // ağır üsluptan çok daha pahalı bir hatadır (vatandaş yeniden başvurur, süre yeniden işler).
  if (cevapsiz.length) {
    T0("vatandas", "muzakere",
      `Muhatabın "${cevapsiz[0].slice(0, 70)}" talebinin taslakta hiçbir karşılığı yok; bu hâliyle yazı başvuruyu cevapsız bırakıyor.`);
    cevapsiz.slice(0, MAKS_ITIRAZ).forEach((t) => oneriler.push({
      tip: "ekle", kaynak: "muzakere",
      metin: `Cevapsız talep: "${t.slice(0, 90)}" — taslakta karşılığı yok, yanıtlanmalı ya da neden karşılanamadığı belirtilmeli.`,
    }));
  } else if (uslupUyari.length) {
    T0("vatandas", "lint_2646", `Üslup denetimi uyarı verdi: ${uslupUyari[0].mesaj || uslupUyari[0].kural} — resmî yazıda gündelik kalıp kalamaz.`);
  } else if (kurallar.some((k) => k.durum === "gecti" && USLUP_DESENI.test(`${k.kural || ""} ${k.madde || ""}`))) {
    T0("vatandas", "lint_2646", "Üslup denetimi temiz — dil resmî ama anlaşılır, vatandaş açısından itirazım yok.");
  } else {
    T0("vatandas", "lint_2646", "Üslup denetiminden bu evrak için bulgu gelmedi — dil hakkında görüş bildirmiyorum.");
  }

  // ---- TUR 1 — ÇAPRAZ-ELEŞTİRİ (Hukukçu, Taslakçı'nın savunmasına AD'la karşı çıkar) ----
  // 2 — Hukukçu itirazları: her sinyal KENDİ TÜRÜNÜN diliyle (uydurma ≠ eksik bölüm).
  verify.slice(0, MAKS_ITIRAZ).forEach((u) => {
    const text = UYDURMA_DESENI.test(u)
      ? `Uydurma-veto işareti var: ${u} — bu ifade taslakta kalamaz.`
      : EKSIK_BOLUM_DESENI.test(u)
        ? `Doğrulama uyarısı — ${u}; Yönetmelik-2646 gereği tamamlanmalı.`
        : `Doğrulama uyarısı: ${u}`;
    T1("hukukcu", "verify", text, "taslakci", "karsi");
  });
  verify.forEach((u) => {
    if (UYDURMA_DESENI.test(u)) {
      // Dayanaksız iddia içeren satır: etiketli alansa (Sayı/İlgi/…) SİLİNMEZ, '[DOĞRULA]' yer
      // tutucusuyla değiştirilir (taslak gönderime-hazır kalır); değilse revize taslaktan çıkarılır.
      const edit = _cikarEdit(taslak, u);
      const oneri = edit && edit.yeni
        ? { tip: "duzelt", kaynak: "verify", metin: `${u} — alan doğrulanamadığından '[DOĞRULA]' ile işaretlendi.` }
        : { tip: "cikar", kaynak: "verify", metin: `${u} — dayanaksız ifade taslaktan çıkarılmalı.` };
      if (edit) { oneri.uygulanabilir = true; oneri.edit = edit; }
      oneriler.push(oneri);
    } else if (EKSIK_BOLUM_DESENI.test(u)) {
      oneriler.push({ tip: "ekle", kaynak: "verify", metin: `${u.replace(EKSIK_BOLUM_DESENI, "").replace(/^[:\s]+/, "")} bölümü eklenmeli (Yön. 2646).` });
    } else {
      oneriler.push({ tip: "duzelt", kaynak: "verify", metin: u });
    }
  });
  formatUyari.slice(0, MAKS_ITIRAZ).forEach((k) =>
    T1("hukukcu", "lint_2646", `Yönetmelik-2646 ${k.madde ? `${k.madde} ` : ""}uyarısı: ${k.mesaj || k.kural}`, "taslakci", "karsi"));
  kuralUyari.forEach((k) =>
    oneriler.push({ tip: "duzelt", kaynak: "lint_2646", metin: `${k.madde ? `${k.madde}: ` : ""}${k.mesaj || k.kural}` }));
  lintFallback.slice(0, MAKS_ITIRAZ).forEach((u) =>
    T1("hukukcu", "lint_2646", `Yönetmelik-2646 denetimi uyarı veriyor: ${u}`, "taslakci", "karsi"));
  lintFallback.forEach((u) => oneriler.push({ tip: "duzelt", kaynak: "lint_2646", metin: u }));
  nliZayif.slice(0, 1).forEach((n) =>
    T1("hukukcu", "nli",
      `${n.baslik} atfının anlamsal desteği zayıf${Number.isFinite(Number(n.skor)) ? ` (NLI %${Math.round(Number(n.skor) * 100)})` : ""} — dayanağı güçlendirin ya da insan doğrulaması isteyin.`,
      "taslakci", "karsi"));
  nliZayif.forEach((n) =>
    oneriler.push({ tip: "duzelt", kaynak: "nli", metin: `${n.baslik} atfının anlamsal desteği zayıf — dayanak güçlendirilmeli ya da atıf değiştirilmeli.` }));
  tutar.slice(0, 1).forEach((u) =>
    T1("hukukcu", "tutarlilik", `Veri tutarlılığı uyarısı: ${u} — kaynak evrak alanları kontrol edilmeli.`, "taslakci", "karsi"));
  tutar.forEach((u) => oneriler.push({ tip: "duzelt", kaynak: "tutarlilik", metin: `Veri tutarlılığı: ${u} — kaynak evrak alanları kontrol edilmeli.` }));

  // 3 — Düzeltme editleri: 2646 düzeltmesi Hukukçu'nun işidir (format sözleşmesi);
  // "dil sadeleştirildi" iddiası yalnız gerçek üslup sinyali olsaydı yapılabilirdi — yapılmaz.
  editler.forEach((e) => {
    T1("hukukcu", "lint_duzeltme",
      e.vurgu === "dayanak"
        ? `Dayanak eksik yazılmış — 2646 düzeltme önerisini taslağa uyguluyorum: "${e.yeni.trim().slice(0, 70)}"`
        : `Yönetmelik-2646 format düzeltmesini taslağa uyguluyorum: "${e.yeni.trim().slice(0, 70)}"`,
      "taslakci", "karsi", { edit: e });
    oneriler.push({
      tip: "duzelt", kaynak: "lint_duzeltme", uygulanabilir: true,
      metin: `Satır düzeltmesi hazır: "${e.yeni.trim().slice(0, 90)}" — müzakerede taslağa işlendi.`,
    });
  });

  // 4 — Vatandaş Avukatı çapraz-katkısı (yalnız GERÇEK itiraz varsa): üslup SİNYALİ varsa dili
  // gündeme getirerek GELİŞTİRİR; sinyal yoksa TEMELSİZ üslup iddiası yapmaz — Hukukçu'nun
  // doğrulama çekincesine vatandaş gözüyle KATILIR (grounded; A3b sözleşmesiyle uyumlu).
  if (itirazN) {
    T1("vatandas", uslupUyari.length ? "uslup" : "muzakere",
      uslupUyari.length
        ? "Hukukçu'nun çekincelerine ek olarak dil de ağır; sadeleştirme vatandaş açısından şart."
        : "Hukukçu'nun çekincelerine katılıyorum; vatandaş olarak doğrulanmamış bilgi güven vermez.",
      "hukukcu", uslupUyari.length ? "gelistir" : "katil");
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
  // Yakınsama (tur 1 kapanışı): Hukukçu itirazlarını özetler, Taslakçı AD'la yanıt verir (kabul/savunma).
  T1("hukukcu", "muzakere",
    mevzuatTemiz(mev[0]) ? `Dayanak (${mev[0].baslik}) yerinde; itirazlarımı önerilere geçirdim.`
      : mev[0] ? "Dayanak önerisi insan doğrulaması kaydıyla not edildi." : "Dayanak yönünden ek itirazım yok.");
  T1("taslakci", "yazi_taslak",
    uzlasi_uygulanabilir
      ? `Önerileri değerlendirdim — ${oneriOzet} Revize taslağı hazırladım; kararı memur verir.`
      : `${oneriOzet} Taslak bu hâliyle gönderime uygun görünüyor.`,
    "hukukcu", uzlasi_uygulanabilir ? "katil" : "karsi");
  // Moderatör/Birim Amiri (tur 2): risk bandını sahiplenen deterministik kapanış sesi.
  turlar.push({ ...birimAmiriTuru(bant), tur: 2 });

  return {
    kaynak: "gercek", toplanamaz: false, taslak, turlar, oneriler,
    risk: bant, uzlasi_metni, uzlasi_uygulanabilir, degisiklik,
  };
}

const KARAR_KUME = new Set(["uzlasti", "serhli", "sevk"]);
const UYE_KUME = new Set(["taslakci", "hukukcu", "vatandas", "birim_amiri"]);
const TUTUM_KUME = new Set(["katil", "karsi", "gelistir"]);   // çapraz-tur duruşu (backend _TUTUM ikizi)

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
    .map((t) => ({
      who: t.who, kaynak: t.kaynak || "muzakere", text: t.text,
      // debate turu: 0=açılış · 1=çapraz eleştiri · 2+=DENETİM turları (yakınsama döngüsü,
      // backend yazi/kurul.py) · 9=karar. Yoksa moderatör→karar, diğerleri→açılış.
      tur: Number.isInteger(t.tur) && t.tur >= 0 && t.tur <= 9
        ? t.tur : (t.who === "birim_amiri" ? 9 : 0),
      ...(UYE_KUME.has(t.yanit) && t.yanit !== t.who ? { yanit: t.yanit } : {}),
      ...(TUTUM_KUME.has(t.tutum) ? { tutum: t.tutum } : {}),
    }));
  const oneriler = dizi(data.oneriler)
    .filter((o) => o && ["duzelt", "ekle", "cikar"].includes(o.tip) && typeof o.metin === "string" && o.metin.trim())
    .map((o) => ({ tip: o.tip, kaynak: o.kaynak || "muzakere", metin: o.metin, uygulanabilir: !!o.uygulanabilir }));
  if (!turlar.length && !oneriler.length) return null;   // boş → yerel motor daha iyi
  // trim() — sunucu (/yazi/kurul route) taslak_md'yi .strip() ile alır; kurul burada HESAPLAR
  // ve uzlasi_metni'yi o kırpılmış tabandan üretir. İstemci burada kırpmazsa, taslakMd'nin
  // sondaki "\n"si (result.yazi_taslak_md ham hâlinde kalır) uzlasi_metni'de YOKTUR → tek satır
  // (imza/unvan) hiç düzenlenmediği hâlde jsdiff'te sahte "kaldırıldı+eklendi" çifti olarak
  // görünür (adversarial bulgu: sondaki-satır asimetrisi, gerçek edit değil).
  const taslakMd = String(result.yazi_taslak_md || "").trim();
  const uzlasi = typeof data.uzlasi_metni === "string" && data.uzlasi_metni.trim()
    ? data.uzlasi_metni.trim() : taslakMd;
  const revizeVar = uzlasi.trim() !== taslakMd.trim();
  const uzlasiUyg = !!data.uzlasi_uygulanabilir && revizeVar;
  // KOHERANS guard (sınır savunması). Öneri-BAŞINA doğruluk (hangi öneri gerçekten uygulandı)
  // sunucunun GÜVEN SINIRIdır: yazi/kurul.py attribution ile uygulanabilir'i UYGULANAN edit'ten
  // türetir (metin-içermeden değil). Burada yalnız TÜMÜNE karşı savunma: revize taslağı YOKSA
  // hiçbir öneri "işlendi" olamaz — sunucu regrese olsa/eski istemci bağlansa bile UI revizesiz
  // "revize taslağa işlendi" rozeti göstermez (bildirilen bug sınıfının UI-tarafı kilidi).
  const oneriKoherans = revizeVar ? oneriler : oneriler.map((o) => ({ ...o, uygulanabilir: false }));
  return {
    kaynak: "llm",
    toplanamaz: false,
    taslak: metniSatirlara(taslakMd),
    turlar,
    oneriler: oneriKoherans,
    // Risk yalnız rozet — SUNUCU bandı otoriter; yoksa LLM karar etiketinden türet.
    risk: (obj(data.sinyaller).risk_metadata || {}).bant || (KARAR_KUME.has(data.karar) ? BANT_RISK[data.karar] : ""),
    degisiklik: oneriKoherans.filter((o) => o.uygulanabilir).length,
    uzlasi_metni: uzlasi,
    uzlasi_uygulanabilir: uzlasiUyg,
    // Yakınsama raporu — kurulun ÖLÇÜLEN sonucu (kaç tur koştu, kaç itiraz düştü, kaç duruyor).
    // Sayılar sunucuda revize metin YENİDEN ÖLÇÜLEREK üretilir; `olculdu` false ise ölçüm yok
    // demektir ve UI kazanım göstermez (kanıtsız iyileşme iddia edilmez). Revize DÜŞTÜYSE
    // (koherans guard) rapor da anlamsızdır → burada birlikte söndürülür.
    yakinsama: uzlasiUyg ? yakinsamaOku(data.yakinsama) : null,
  };
}

/* Yakınsama raporunu güvenli oku — sunucu alanı yoksa/bozuksa null (UI sessizce gizler).
   ÜÇ sayı ayrı taşınır: düşen (gerçekten giderilen) · duran (giderilemeyen) · yeni
   (revizyonun KENDİ ürettiği uyarı). Net fark tek başına yanıltıcıdır: 2 uyarı düşüp 2 yeni
   uyarı çıktığında net 0 olur ve "hiçbir şey olmadı" gibi okunur — oysa memurun bilmesi
   gereken şey tam olarak revizyonun yeni sorun ürettiğidir (canlı koşumda görüldü). */
function yakinsamaOku(y) {
  if (!y || typeof y !== "object" || !y.olculdu) return null;
  const say = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const rapor = {
    tur: say(y.tur),
    dusen: say(y.dusen ?? y.cozulen),   // eski sunucu alanı → düşen
    duran: say(y.duran),
    yeni: say(y.yeni),
    itirazIlk: say(y.itiraz_ilk),
  };
  return rapor.tur ? rapor : null;
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
  // Tur 0 — açılışlar (üç üye bağımsız ilk pozisyon)
  { who: "taslakci", kaynak: "ornek", tur: 0, text: "Taslağı Yön. 2646 formatında hazırladım. 4982 sayılı Kanun kapsamında 15 iş günü içinde yanıt öngörülüyor." },
  { who: "hukukcu", kaynak: "ornek", tur: 0, text: "İlk bakışta süre için açık bir madde göremiyorum; dayanağı yakından sınayacağım." },
  { who: "vatandas", kaynak: "ornek", tur: 0, text: "Dil ilk okumada ağır geldi; vatandaş gözüyle sadeleştirme gerekebilir." },
  // Tur 1 — çapraz-eleştiri (ajanlar birbirine AD'la yanıt verir: karşı-çık / geliştir / kabul)
  { who: "hukukcu", kaynak: "ornek", tur: 1, yanit: "taslakci", tutum: "karsi",
    text: "Dayanağın zayıf. Başvuru 3071 sayılı Kanun m.4 dilekçe hakkına dayanıyor; ancak süre için madde yok — 4982 m.11 açıkça yazılmalı.",
    edit: { satirId: "govde2", yeni: "Söz konusu bilgiler, 4982 sayılı Kanun'un 11. maddesi uyarınca 15 iş günü içinde tarafınıza iletilecektir.", vurgu: "dayanak" } },
  { who: "vatandas", kaynak: "ornek", tur: 1, yanit: "taslakci", tutum: "karsi",
    text: "Dil çok ağır. 'İşbu talebinize binaen' vatandaşı yıldırır — 'Başvurunuz üzerine' demek yeterli, üstelik daha anlaşılır.",
    edit: { satirId: "govde1", yeni: "Başvurunuz üzerine, talep ettiğiniz bilgiler 4982 sayılı Bilgi Edinme Kanunu kapsamında değerlendirilmiştir.", vurgu: "sade" } },
  { who: "taslakci", kaynak: "ornek", tur: 1, yanit: "vatandas", tutum: "katil",
    text: "Sadeleştirmeyi kabul ediyorum; resmî üslup kapanışta korunuyor. Hukukçu'nun m.11 dayanağını da ekledim." },
  { who: "hukukcu", kaynak: "ornek", tur: 1, yanit: "taslakci", tutum: "katil",
    text: "m.11 dayanağı eklendi, dil sadeleşti — itirazlarımı revize taslağa geçirdim." },
  { who: "taslakci", kaynak: "ornek", tur: 1, text: "Revize taslağı hazır — 2 değişiklik işlendi; kararı memur verir." },
  // Tur 2 — moderatör
  { who: "birim_amiri", kaynak: "risk_guard", tur: 2, text: "Risk bandı düşük — dayanak eklendi, dil sadeleşti; bu revize hâliyle gönderime engel görmüyorum." },
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

/* Tutanak/öneri satırındaki `kaynak` alanı — pipeline sinyalinin İÇ adıdır (verify, lint_2646…).
   Ekrana ham yazılmaz: memur diline çevrilir; anlam taşımayan iç kaynaklar (muzakere, llm,
   ornek, gercek) hiç basılmaz. Bilinmeyen anahtar da basılmaz — ham ad sızmasın. */
const KAYNAK_ETIKET = Object.freeze({
  verify: "Doğrulama",
  lint_2646: "Yön. 2646",
  lint_duzeltme: "Yön. 2646 düzeltmesi",
  nli: "Mevzuat uyumu",
  tutarlilik: "Veri tutarlılığı",
  uslup: "Üslup",
  dayanak: "Dayanak",
  risk_guard: "Risk bandı",
  yazi_taslak: "Taslak",
});

export function kaynakEtiketi(kaynak) {
  return KAYNAK_ETIKET[String(kaynak || "")] || null;
}

/* Risk bandı — belgenin işlem anındaki bandı ile kurulun taslağı YENİDEN ölçerek bulduğu
   bant ayrı olgulardır. İkisi farklıysa ekran bunu söyler (tur-4: karar fişi "SARI",
   kurul "yüksek risk" diyordu ve memur hangisine güveneceğini bilemiyordu). */
const BANT_SIRA = { yesil: 0, sari: 1, kirmizi: 2 };
export function kurulRiskOzeti(belgeBant, kurulBant) {
  const b = BANT_SIRA[belgeBant] != null ? belgeBant : null;
  const k = BANT_SIRA[kurulBant] != null ? kurulBant : null;
  const gosterilen = k || b;
  if (!gosterilen) return null;
  const fark = b && k && b !== k ? (BANT_SIRA[k] > BANT_SIRA[b] ? "yukseldi" : "dustu") : null;
  return { bant: gosterilen, belge: b, kurul: k, fark };
}
