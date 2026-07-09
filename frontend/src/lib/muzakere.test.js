/* muzakere motoru testleri — `node --test src/lib/muzakere.test.js` (bağımlılıksız, saf).
   Sözleşme: her müzakere turu GERÇEK bir pipeline sinyaline izlenebilir (kaynak alanı);
   motor r'de olmayan mevzuat/sinyal uydurmaz; kendi seslendirdiği itirazla çelişen hüküm
   veremez (çözülmemiş itiraz → şerh); karar risk bandı + itiraz durumuna bağlıdır.
   A1-A6: adversarial doğrulama bulgularının regresyon kilitleri. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { muzakereKurgusu, uzlasiMetni, ORNEK_KURGU } from "./muzakere.js";

const TASLAK = "T.C.\nANKARA VALİLİĞİ\n\nSayı : E-2026/1502\nKonu : Bilgi Edinme Başvurusu\n\nİşbu talebinize binaen bilgiler değerlendirilmiştir.\n\nBilgilerinize saygıyla sunulur.";

const R_TEMIZ = {
  yazi_taslak_md: TASLAK,
  yazi_turu: "cevabi_yazi",
  format_uyumlu: true,
  verify_uyari: [],
  lint_2646: { kurallar: [{ kural: "L-USLUP-yasak", madde: "üslup", durum: "gecti", mesaj: "Resmî üsluba aykırı kalıp yok." }], uyari: [], ozet: { gecti: 1 } },
  mevzuat_onerileri: [{ baslik: "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11", score: 1 }],
  mevzuat_nli: [{ baslik: "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11", skor: 0.9, entailment: true }],
  risk_metadata: { bant: "yesil" },
};

/* ---- sinyaller müzakere diline TÜRÜNE UYGUN çevrilir, izlenebilir ---- */
test("A1: uydurma-veto yalnız gerçek imzasında; 'Eksik bölüm' uydurma SUÇLAMASI olamaz", () => {
  const k = muzakereKurgusu({
    ...R_TEMIZ,
    verify_uyari: ["'5018' kaynak evrakta geçmiyor", "Eksik bölüm: İmza bloğu (ad-soyad/unvan)"],
  });
  const hukuk = k.turlar.filter((t) => t.who === "hukukcu");
  assert.ok(hukuk.some((t) => t.text.startsWith("Uydurma-veto") && t.text.includes("kaynak evrakta geçmiyor")));
  const eksikTur = hukuk.find((t) => t.text.includes("Eksik bölüm"));
  assert.ok(eksikTur);
  assert.doesNotMatch(eksikTur.text, /Uydurma/);
  assert.ok(hukuk.every((t) => t.kaynak));
});

test("lint kural uyarıları Hukukçu itirazı olur (madde ile)", () => {
  const k = muzakereKurgusu({
    ...R_TEMIZ,
    lint_2646: { kurallar: [{ kural: "L-M15", madde: "m.15", durum: "uyari", mesaj: "İlgi atfı eksik." }], uyari: ["İlgi atfı eksik."], ozet: { gecti: 0 } },
  });
  assert.ok(k.turlar.some((t) => t.who === "hukukcu" && t.kaynak === "lint_2646" && t.text.includes("İlgi atfı eksik")));
});

test("A2: zayıf NLI seslendirilince oybirliği YOK — şerhe düşer, 'Dayanak sağlam' denmez", () => {
  const zayif = muzakereKurgusu({
    ...R_TEMIZ,
    mevzuat_nli: [{ baslik: "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11", skor: 0.3, entailment: false }],
  });
  assert.ok(zayif.turlar.some((t) => t.who === "hukukcu" && /anlamsal desteği zayıf/i.test(t.text)));
  assert.equal(zayif.karar, "serhli");
  assert.ok(zayif.turlar.every((t) => !/Dayanak sağlam|doğrulaması geçti/.test(t.text)));
  const nlisiz = muzakereKurgusu({ ...R_TEMIZ, mevzuat_nli: [] });
  assert.ok(nlisiz.turlar.every((t) => !/NLI/i.test(t.text)));
});

test("A2b: yeşil bant + verify uyarısı → yine şerhli (çözülmemiş itirazla mühür yok)", () => {
  const k = muzakereKurgusu({ ...R_TEMIZ, verify_uyari: ["'5018' kaynak evrakta geçmiyor"] });
  assert.equal(k.karar, "serhli");
});

test("A3: üslup kuralı UYARI verdiyse Vatandaş Avukatı 'itirazım yok' DİYEMEZ", () => {
  const k = muzakereKurgusu({
    ...R_TEMIZ,
    lint_2646: { kurallar: [{ kural: "L-USLUP-yasak", madde: "üslup", durum: "uyari", mesaj: "'kolay gelsin' resmî üsluba aykırı." }], uyari: ["'kolay gelsin' resmî üsluba aykırı."], ozet: { gecti: 0 } },
  });
  const vat = k.turlar.filter((t) => t.who === "vatandas");
  assert.ok(vat.some((t) => /Üslup denetimi uyarı verdi/.test(t.text)));
  assert.ok(vat.every((t) => !/itirazım yok|görmedim/.test(t.text)));
});

test("A3b: üslup verisi hiç yoksa 'inceledim, temiz' İDDİA EDİLMEZ", () => {
  const k = muzakereKurgusu({ ...R_TEMIZ, lint_2646: {} });
  const vat = k.turlar.find((t) => t.who === "vatandas");
  assert.match(vat.text, /bulgu gelmedi|görüş bildirmiyorum/);
});

test("mevzuat uydurulamaz: konuşmalarda yalnız r'deki başlıklar", () => {
  const k = muzakereKurgusu(R_TEMIZ);
  const konusmalar = k.turlar.map((t) => t.text).join(" ");
  assert.ok(konusmalar.includes("4982"));
  assert.doesNotMatch(konusmalar, /5018|3071/); // r'de olmayan kanunlar geçemez
});

/* ---- lint düzeltme önerisi → taslağa uygulanan edit turu ---- */
test("A4: format düzeltmesi 'sadeleştirme' olarak PAZARLANAMAZ — vurgu format, konuşan Hukukçu", () => {
  const duzeltme = TASLAK.replace("İşbu talebinize binaen bilgiler değerlendirilmiştir.",
    "Başvurunuz üzerine bilgiler değerlendirilmiştir.");
  const k = muzakereKurgusu({ ...R_TEMIZ, lint_duzeltme_md: duzeltme });
  const editTur = k.turlar.find((t) => t.edit);
  assert.ok(editTur, "edit turu üretilmedi");
  assert.equal(editTur.who, "hukukcu");
  assert.equal(editTur.edit.vurgu, "format");
  assert.doesNotMatch(editTur.text, /sadeleş|dil .*ağır/i);
  assert.match(editTur.edit.yeni, /Başvurunuz üzerine/);
  const satir = k.taslak.find((s) => s.id === editTur.edit.satirId);
  assert.match(satir.metin, /İşbu talebinize/); // ilk taslakta eski hali durur, edit oynatınca değişir
});

test("dayanak (kanun/madde) ekleyen düzeltme 'dayanak' vurgusu alır", () => {
  const duzeltme = TASLAK.replace(
    "İşbu talebinize binaen bilgiler değerlendirilmiştir.",
    "Talebiniz 4982 sayılı Kanun'un 11. maddesi uyarınca değerlendirilmiştir.");
  const k = muzakereKurgusu({ ...R_TEMIZ, lint_duzeltme_md: duzeltme });
  const editTur = k.turlar.find((t) => t.edit);
  assert.equal(editTur.edit.vurgu, "dayanak");
});

/* ---- A5: şüpheli mevzuat önerisine 'sağlam' denemez ---- */
test("A5: düşük güven / [DOĞRULA] işaretli öneriye 'Dayanak sağlam' denmez", () => {
  const k = muzakereKurgusu({
    ...R_TEMIZ,
    mevzuat_onerileri: [{ baslik: "657 sayılı Kanun m.125 [DOĞRULA: yürürlük]", guven: "düşük", inceleme_oner: true }],
    mevzuat_nli: [],
  });
  assert.equal(k.karar, "uzlasti"); // itiraz yok — ama sağlamlık iddiası da yok
  assert.ok(k.turlar.every((t) => !/Dayanak sağlam/.test(t.text)));
  assert.ok(k.turlar.some((t) => /insan doğrulaması kaydıyla/.test(t.text)));
});

/* ---- A6: sayılan her uyarı müzakereye yansır ---- */
test("A6: tutarlılık uyarısı seslendirilir (kaynak: tutarlilik) ve şerhe sayılır", () => {
  const k = muzakereKurgusu({ ...R_TEMIZ, tutarlilik_uyari: ["TCKN checksum geçmiyor"] });
  assert.ok(k.turlar.some((t) => t.kaynak === "tutarlilik" && t.text.includes("TCKN checksum")));
  assert.equal(k.karar, "serhli");
});

/* ---- karar: bant + çözülmemiş itiraz ---- */
test("yeşil bant + sıfır uyarı → oybirliği (3 oy) ve temiz dayanak anılır", () => {
  const k = muzakereKurgusu(R_TEMIZ);
  assert.equal(k.karar, "uzlasti");
  assert.equal(k.turlar.filter((t) => t.oy).length, 3);
  assert.ok(k.turlar.some((t) => /Dayanak sağlam: 4982/.test(t.text)));
});

test("sarı bant → şerhli uzlaşı", () => {
  const k = muzakereKurgusu({ ...R_TEMIZ, risk_metadata: { bant: "sari" } });
  assert.equal(k.karar, "serhli");
});

test("kırmızı bant → uzlaşı YOK, memur onayına sevk (mühür basılmaz)", () => {
  const k = muzakereKurgusu({ ...R_TEMIZ, risk_metadata: { bant: "kirmizi" } });
  assert.equal(k.karar, "sevk");
  assert.ok(k.turlar.some((t) => /memur onayına/.test(t.text)));
  assert.equal(k.turlar.filter((t) => t.oy).length, 0);
});

/* ---- fallback'ler dürüst ---- */
test("result yok → etiketli örnek senaryo", () => {
  const k = muzakereKurgusu(null);
  assert.equal(k.kaynak, "ornek");
  assert.ok(k.turlar.length >= 6);
  assert.equal(k, ORNEK_KURGU);
});

test("result var ama taslak yok → kurul toplanamaz (uydurma müzakere yok)", () => {
  const k = muzakereKurgusu({ evrak_turu: "dilekce" });
  assert.equal(k.kaynak, "gercek");
  assert.equal(k.toplanamaz, true);
  assert.equal(k.turlar.length, 0);
});

/* ---- Kurul Tutanağı: her öneri gerçek sinyale izlenebilir, tip'ler doğru eşlenir ---- */
test("tutanak: uydurma→ÇIKAR, eksik bölüm→EKLE, lint uyarı→DÜZELT (kaynaklı)", () => {
  const k = muzakereKurgusu({
    ...R_TEMIZ,
    verify_uyari: ["Taslaktaki iddia kaynak evrakta yok (LLM grounding): fazla tahakkuk", "Eksik bölüm: İmza bloğu (ad-soyad/unvan)"],
    lint_2646: { kurallar: [{ kural: "L-M15", madde: "m.15", durum: "uyari", mesaj: "İlgi atfı eksik." }], uyari: ["İlgi atfı eksik."], ozet: { gecti: 0 } },
  });
  const tip = (t) => k.oneriler.filter((o) => o.tip === t);
  assert.ok(tip("cikar").some((o) => o.metin.includes("fazla tahakkuk") && o.kaynak === "verify"));
  assert.ok(tip("ekle").some((o) => o.metin.includes("İmza bloğu") && o.kaynak === "verify"));
  assert.ok(tip("duzelt").some((o) => o.metin.includes("İlgi atfı eksik") && o.kaynak === "lint_2646"));
  assert.ok(k.oneriler.every((o) => o.kaynak && o.metin));
});

test("tutanak: edit-destekli düzeltme 'uygulanabilir' işaretlenir", () => {
  const duzeltme = TASLAK.replace("İşbu talebinize binaen bilgiler değerlendirilmiştir.",
    "Başvurunuz üzerine bilgiler değerlendirilmiştir.");
  const k = muzakereKurgusu({ ...R_TEMIZ, lint_duzeltme_md: duzeltme });
  const uyg = k.oneriler.filter((o) => o.uygulanabilir);
  assert.equal(uyg.length, 1);
  assert.equal(uyg[0].tip, "duzelt");
  assert.match(uyg[0].metin, /Başvurunuz üzerine/);
});

test("tutanak: NLI zayıf → dayanak güçlendirme önerisi; temiz evrakta liste BOŞ", () => {
  const zayif = muzakereKurgusu({
    ...R_TEMIZ,
    mevzuat_nli: [{ baslik: "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11", skor: 0.3, entailment: false }],
  });
  assert.ok(zayif.oneriler.some((o) => o.tip === "duzelt" && o.kaynak === "nli" && /dayanak/i.test(o.metin)));
  assert.equal(muzakereKurgusu(R_TEMIZ).oneriler.length, 0);
});

/* ---- uzlasiMetni: kurul editleri uygulanmış nihai taslak metni ---- */
test("uzlasiMetni: editler uygulanmış tam metin döner (taslağa yazılabilir)", () => {
  const duzeltme = TASLAK.replace("İşbu talebinize binaen bilgiler değerlendirilmiştir.",
    "Başvurunuz üzerine bilgiler değerlendirilmiştir.");
  const k = muzakereKurgusu({ ...R_TEMIZ, lint_duzeltme_md: duzeltme });
  const metin = uzlasiMetni(k);
  assert.match(metin, /Başvurunuz üzerine/);
  assert.doesNotMatch(metin, /İşbu talebinize/);
  assert.equal(metin.split("\n").length, TASLAK.split("\n").length); // satır yapısı korunur
});

test("uzlasiMetni: edit yoksa metin taslağın aynısıdır", () => {
  const k = muzakereKurgusu(R_TEMIZ);
  assert.equal(uzlasiMetni(k), TASLAK);
});

test("null-güvenlik: bozuk şekiller motoru düşürmez", () => {
  const k = muzakereKurgusu({ yazi_taslak_md: TASLAK, verify_uyari: "bozuk", lint_2646: 7, mevzuat_nli: {} });
  assert.ok(Array.isArray(k.turlar) && k.turlar.length > 0);
});
