/* muzakere — AI Bürokrasi Kurulu'nun müzakere motoru (saf JS, DOM/React yok).
   KURGU: Kurul, pipeline'da ZATEN bağımsız çalışan ajanların bulgularını müzakere diline
   çevirir — Taslakçı=yazi_taslak, Hukukçu=verify+lint-2646+NLI+tutarlılık, Vatandaş
   Avukatı=2646 üslup. Her tur `kaynak` alanıyla gerçek sinyale izlenebilir; motor r'de
   olmayan mevzuat/sinyal ASLA uydurmaz ve kendi seslendirdiği itirazla çelişen hüküm veremez:
   ÇÖZÜLMEMİŞ itiraz varken oybirliği mührü yok — karar şerhe düşer.
   Karar: kırmızı bant → mühürsüz, memur onayına sevk · sarı bant VEYA çözülmemiş uyarı →
   ŞERHLİ uzlaşı · yeşil bant + sıfır uyarı → oybirliği mührü.
   Gerçek sonuç yoksa etiketli ÖRNEK senaryo (ORNEK_KURGU) oynar; taslak üretilmemişse
   kurul toplanamaz (uydurma müzakere yok). */

const dizi = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const strDizi = (x) => dizi(x).filter((u) => typeof u === "string" && u.trim());

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

/** Bir turun edit'ini taslağa uygula (saf — yeni dizi döner). Bileşen animasyonda kullanır. */
export function editUygula(taslak, edit) {
  return taslak.map((l) => (l.id === edit.satirId ? { ...l, metin: edit.yeni, vurgu: edit.vurgu } : l));
}

/** Tüm turların editleri uygulanmış nihai taslak (reduced-motion / mühürlü kare için). */
export function nihaiTaslak(kurgu) {
  return kurgu.turlar.reduce((d, t) => (t.edit ? editUygula(d, t.edit) : d), kurgu.taslak.map((l) => ({ ...l })));
}

/** Uzlaşı taslağının düz metni — "Uzlaşı taslağını uygula" ile taslağın üzerine yazılır. */
export function uzlasiMetni(kurgu) {
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
    if (UYDURMA_DESENI.test(u)) oneriler.push({ tip: "cikar", kaynak: "verify", metin: `${u} — dayanaksız ifade taslaktan çıkarılmalı.` });
    else if (EKSIK_BOLUM_DESENI.test(u)) oneriler.push({ tip: "ekle", kaynak: "verify", metin: `${u.replace(EKSIK_BOLUM_DESENI, "").replace(/^[:\s]+/, "")} bölümü eklenmeli (Yön. 2646).` });
    else oneriler.push({ tip: "duzelt", kaynak: "verify", metin: u });
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

  // Çözülmemiş itirazlar (editler ÇÖZÜLDÜĞÜ için sayılmaz) — şerh/uzlaşı ayrımının kaynağı.
  const itirazSayisi = verify.length + (kurallar.length ? kuralUyari.length : lintFallback.length)
    + nliZayif.length + tutar.length;
  const bant = obj(r.risk_metadata).bant;
  const karar = bant === "kirmizi" ? "sevk" : (bant === "sari" || itirazSayisi) ? "serhli" : bant === "yesil" ? "uzlasti" : "uzlasti";

  // 5 — Kapanış + oylar: kurul kendi seslendirdiği itirazla çelişemez.
  if (karar === "sevk") {
    turlar.push({ who: "hukukcu", kaynak: "risk_guard", text: "Risk bandı KIRMIZI — kurul olarak uzlaşı veremeyiz. Dosyayı memur onayına sevk ediyorum; mühür basılmayacak." });
    turlar.push({ who: "taslakci", kaynak: "risk_guard", text: "Kabul — taslak, kurul şerhleriyle birlikte memur onayına sunuluyor." });
  } else if (karar === "serhli") {
    turlar.push({ who: "hukukcu", kaynak: "risk_guard", text: `Doğrulama kayıtlarında ${itirazSayisi || "bekleyen"} uyarı var — memur incelemesinde giderilmeli; şerhimle uzlaşıyorum.`, oy: true });
    turlar.push({ who: "vatandas", kaynak: "lint_2646", text: "Şerh notuyla ben de katılıyorum.", oy: true });
    turlar.push({ who: "taslakci", kaynak: "yazi_taslak", text: "Şerhli uzlaşı taslağı hazır — memur incelemesi notuyla mühürlenebilir.", oy: true });
  } else {
    turlar.push({
      who: "hukukcu", kaynak: "mevzuat",
      text: (mevzuatTemiz(mev[0]) ? `Dayanak sağlam: ${mev[0].baslik}.`
        : mev[0] ? "Dayanak önerisi insan doğrulaması kaydıyla not edildi."
        : "Dayanak yönünden engel görmüyorum.")
        + (nli.length && !nliZayif.length ? " NLI atıf doğrulaması geçti." : "") + " Onayımı veriyorum.",
      oy: true,
    });
    turlar.push({ who: "vatandas", kaynak: "lint_2646", text: "Vatandaş adına onaylıyorum.", oy: true });
    turlar.push({ who: "taslakci", kaynak: "yazi_taslak", text: "Kurul oybirliğiyle uzlaştı — taslak mühürlenebilir.", oy: true });
  }

  return { kaynak: "gercek", toplanamaz: false, taslak, turlar, karar, oneriler };
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
  { who: "hukukcu", kaynak: "ornek", text: "m.11 eklendi, NLI atıf doğrulaması geçti — dayanak artık sağlam. Onayımı veriyorum.", oy: true },
  { who: "vatandas", kaynak: "ornek", text: "Dil sadeleşti, okunabilirlik puanı yükseldi. Vatandaş adına onaylıyorum.", oy: true },
  { who: "taslakci", kaynak: "ornek", text: "Uzlaşı taslağı hazır. Mühürlenebilir.", oy: true },
];
export const ORNEK_KURGU = derinDondur({
  kaynak: "ornek", toplanamaz: false, taslak: ORNEK_TASLAK, turlar: ORNEK_TURLAR, karar: "uzlasti",
  oneriler: [],
});
