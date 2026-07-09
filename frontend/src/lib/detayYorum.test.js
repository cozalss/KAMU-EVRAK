/* detayYorum motoru testleri — bağımlılıksız `node --test src/lib/detayYorum.test.js`.
   Sözleşme: her fonksiyon SAF (DOM/React yok), null-güvenli, ve ürettiği cümle
   pipeline state'iyle ASLA çelişmez (ör. bütünlük bozukken "değiştirilemez" denmez). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hukumYorum, ozetDipnot, unsurEtiket, eksikYorum,
  mevzuatDipnot, birimDipnot, denetimDipnot, lintGiris, decomposeGiris, slaKonum,
} from "./detayYorum.js";

/* ---- hukumYorum: hüküm şeridi başlığı risk bandını da hesaba katar ---- */
test("hukum: temiz + yeşil bant → sorunsuz", () => {
  const h = hukumYorum({ risk_metadata: { bant: "yesil" } });
  assert.equal(h.baslik, "İşlem sorunsuz tamamlandı");
  assert.equal(h.ton, "yesil");
});

test("hukum: sarı bant + 1 uyarı → kontrol noktası + bant birlikte anılır", () => {
  const h = hukumYorum({ risk_metadata: { bant: "sari" }, tutarlilik_uyari: ["x"] });
  assert.match(h.baslik, /1 kontrol noktası/);
  assert.match(h.baslik, /sarı/);
  assert.equal(h.ton, "sari");
});

test("hukum: uyarı yokken bile sarı bant 'sorunsuz' DEĞİLDİR", () => {
  const h = hukumYorum({ risk_metadata: { bant: "sari" } });
  assert.notEqual(h.baslik, "İşlem sorunsuz tamamlandı");
  assert.equal(h.ton, "sari");
});

test("hukum: kırmızı bant → memur onayı vurgusu", () => {
  const h = hukumYorum({ risk_metadata: { bant: "kirmizi" }, verify_uyari: ["a", "b"] });
  assert.match(h.baslik, /memur onayı/);
  assert.equal(h.ton, "kirmizi");
});

/* ---- ozetDipnot / unsurEtiket: KVKK iddiası yalnız gerçekten maskeleme varsa ---- */
test("ozet: maskeli alan varsa maskelendi denir (alan adlarıyla)", () => {
  const d = ozetDipnot({ bilgi_unsurlari: { tckn_maskeli: "123******01", telefon_maskeli: "05*" } });
  assert.match(d, /maskelendi/);
  assert.match(d, /tckn/);
});

test("ozet: maskeli alan yoksa 'maskelendi' İDDİA EDİLMEZ", () => {
  const d = ozetDipnot({ bilgi_unsurlari: { konu: "park onarımı" } });
  assert.doesNotMatch(d, /maskelendi/);
  assert.match(d, /tespit edilmedi/);
});

test("unsur: 2 maskeli alan → sayılı KVKK etiketi + kilit dipnotu", () => {
  const u = unsurEtiket({ bilgi_unsurlari: { tckn_maskeli: "1", telefon_maskeli: "0", konu: "x" } });
  assert.match(u.tag, /2 alan/);
  assert.match(u.dipnot, /maskelendi/);
});

test("unsur: maskeli alan yoksa etiket null, dipnot dürüst", () => {
  const u = unsurEtiket({ bilgi_unsurlari: { konu: "x" } });
  assert.equal(u.tag, null);
  assert.match(u.dipnot, /tespit edilmedi/);
});

/* ---- eksikYorum: tür-duyarlı dayanak + taslak durumuyla tutarlı ---- */
test("eksik yok + dilekçe + taslak var → 3071 m.4 dayanağı + taslak hazırlandı", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: [], yazi_taslak_md: "# t" });
  assert.equal(e.durum, "tam");
  assert.match(e.metin, /3071/);
  assert.match(e.metin, /taslağı .*hazırlandı/);
});

test("eksik yok + resmî yazı → 2646 dayanağı", () => {
  const e = eksikYorum({ evrak_turu: "ust_yazi", eksik_alanlar: [], yazi_taslak_md: "# t" });
  assert.match(e.metin, /2646/);
});

test("eksik yok ama taslak da yoksa 'hazırlandı' İDDİA EDİLMEZ", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: [] });
  assert.doesNotMatch(e.metin, /hazırlandı/);
});

test("eksik yok + tutarlılık uyarısı → uyarıya işaret edilir", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: [], yazi_taslak_md: "t", tutarlilik_uyari: ["tckn checksum"] });
  assert.match(e.metin, /1 veri-tutarlılık uyarısı/);
});

test("eksik var + dilekçe kritik alan + taslak YOK → 3071 m.4 'incelenemez'", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: ["imza", "iletisim_adres"] });
  assert.equal(e.durum, "eksik");
  assert.match(e.metin, /2 zorunlu alan eksik/);
  assert.match(e.metin, /3071/);
  assert.match(e.metin, /incelenemez/);
});

test("C1a: kritik eksik ama taslak ÜRETİLMİŞSE 'incelenemez' denMEZ (sayfa taslağı gösteriyor)", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: ["gonderen_ad_soyad"], yazi_taslak_md: "t" });
  assert.doesNotMatch(e.metin, /incelenemez|işleme alınamaz/);
  assert.match(e.metin, /3071/);
  assert.match(e.metin, /gönderilmemeli/);
});

test("C1b: kritik-OLMAYAN eksikte (tarih) 3071 m.4 dayanağı UYDURULMAZ", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: ["tarih"], yazi_taslak_md: "t" });
  assert.doesNotMatch(e.metin, /3071/);
  assert.match(e.metin, /kesinleştirilemez/);
});

test("clarify_stop → taslağın bilgiler tamamlanınca hazırlanacağı söylenir", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: ["imza"], clarify_stop: true });
  assert.match(e.metin, /tamamlanınca hazırlanacak/);
});

/* ---- mevzuatDipnot: eşik/NLI/CRAG iddiaları yalnız veri varsa ---- */
test("mevzuat: hepsi eşik üstü + NLI yok → NLI iddiası YOK", () => {
  const d = mevzuatDipnot({ mevzuat_onerileri: [{ baslik: "a", score: 1 }, { baslik: "b", score: 0.8 }] });
  assert.match(d, /2 önerinin tamamı/);
  assert.doesNotMatch(d, /NLI/);
});

test("mevzuat: karışık skor + NLI var → eşik altı sayısı + NLI cümlesi", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [{ baslik: "a", score: 1 }, { baslik: "b", score: 0.4 }],
    mevzuat_nli: [{ baslik: "a" }],
  });
  assert.match(d, /1 tanesi .*eşiğin altında/);
  assert.match(d, /NLI/);
});

test("mevzuat: CRAG düzeltme uygulandıysa güven değişimiyle söylenir", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [{ baslik: "a", score: 1 }],
    crag_corrected: true, crag_guven_oncesi: 0.4, crag_guven_sonrasi: 0.9,
  });
  assert.match(d, /CRAG/);
  assert.match(d, /0\.4.*0\.9/);
});

/* ---- birimDipnot: gerçek gerekçe varsa o gösterilir ---- */
test("birim: reasoning varsa gerekçe olarak yansır", () => {
  const d = birimDipnot({ birim_reasoning: "park/bahçe sinyali fen işleri görev alanında" });
  assert.match(d, /park\/bahçe sinyali/);
  assert.match(d, /memur onayında/);
});

test("birim: reasoning yoksa yöntem cümlesi (fallback)", () => {
  const d = birimDipnot({});
  assert.match(d, /içerik sinyali/);
});

/* ---- denetimDipnot: bütünlük bozuksa 'değiştirilemez' denMEZ ---- */
test("denetim: bütünlük tam → tamper-evident açıklaması halka sayısıyla", () => {
  const d = denetimDipnot(true, 12);
  assert.match(d.metin, /12 halka/);
  assert.match(d.metin, /Değiştirilemez/);
  assert.equal(d.ton, "yesil");
});

test("denetim: bütünlük bozuk → uyarı, 'değiştirilemez' iddiası yok", () => {
  const d = denetimDipnot(false, 12);
  assert.doesNotMatch(d.metin, /Değiştirilemez/);
  assert.match(d.metin, /doğrulanamadı/i);
  assert.equal(d.ton, "sari");
});

/* ---- lintGiris / decomposeGiris: sayılar gerçek sonuçtan ---- */
test("lint: hepsi geçti → 'tamamı geçti'", () => {
  const d = lintGiris({ kurallar: Array.from({ length: 9 }, (_, i) => ({ kural: i, durum: "gecti" })), ozet: { gecti: 9 }, uyari: [] });
  assert.match(d, /9 kuralın tamamı geçti/);
});

test("lint: 1 uyarı → geçen/uyarı kırılımı", () => {
  const d = lintGiris({ kurallar: Array.from({ length: 9 }, (_, i) => ({ kural: i, durum: i ? "gecti" : "uyari" })), ozet: { gecti: 8 }, uyari: ["m.15"] });
  assert.match(d, /8 .*geçti/);
  assert.match(d, /1 uyarı/);
});

test("decompose: alt-talep ve farklı birim sayısı gerçekten sayılır", () => {
  const d = decomposeGiris([{ birim: "fen" }, { birim: "zabita" }, { birim: "fen" }]);
  assert.match(d, /3 ayrı istek/);
  assert.match(d, /2 farklı birime/);
});

test("decompose: tek birim → 'farklı birime' İDDİA EDİLMEZ", () => {
  const d = decomposeGiris([{ birim: "fen" }, { birim: "fen" }]);
  assert.match(d, /aynı birime/);
});

/* ---- adversarial-verifier bulguları (C2–C5) ---- */
test("C2a: risk_metadata hiç yokken 'sorunsuz' İDDİA EDİLMEZ", () => {
  const h = hukumYorum({});
  assert.equal(h.baslik, "İşlem tamamlandı");
  assert.doesNotMatch(h.baslik, /sorunsuz/);
});

test("C2b: lint uyarıları da kontrol noktası sayılır", () => {
  const h = hukumYorum({ risk_metadata: { bant: "yesil" }, lint_2646: { uyari: ["m.11"] } });
  assert.match(h.baslik, /1 kontrol noktası/);
  assert.doesNotMatch(h.baslik, /sorunsuz/);
});

test("C3: kırmızı bant + memur ONAYLADIYSA 'onayı gerekli' denMEZ", () => {
  const h = hukumYorum({ risk_metadata: { bant: "kirmizi" }, onay_durumu: "onaylandı" });
  assert.doesNotMatch(h.baslik, /onayı gerekli/);
  assert.match(h.baslik, /onayıyla sürdürüldü/);
});

test("C3b: kırmızı bant + reddedildi → red yansır", () => {
  const h = hukumYorum({ risk_metadata: { bant: "kirmizi" }, onay_durumu: "reddedildi" });
  assert.match(h.baslik, /reddedildi/);
});

test("C4: uyarı 0 iken 'uyarılı maddeler işaretli' denMEZ (bilgi satırları)", () => {
  const d = lintGiris({ kurallar: [{ durum: "gecti" }, { durum: "gecti" }, { durum: "bilgi" }], ozet: { gecti: 2 }, uyari: [] });
  assert.doesNotMatch(d, /uyarılı maddeler/);
  assert.match(d, /bilgi notu/);
});

test("C5: pii_var=true ama maskeli anahtar yok → kart yine 'maskelendi' dilinde tutarlı", () => {
  const u = unsurEtiket({ bilgi_unsurlari: { pii_var: true, konu: "x" } });
  assert.notEqual(u.tag, null);
  assert.match(u.dipnot, /maskelendi/);
});

/* ---- bozuk-şekil güvenliği: backend yanlış tip gönderse bile yanlış İDDİA üretilmez ---- */
test("hukum: dizi yerine string/obje gelirse sayı UYDURULMAZ", () => {
  const h = hukumYorum({ risk_metadata: { bant: "yesil" }, eksik_alanlar: "not-an-array" });
  assert.equal(h.baslik, "İşlem sorunsuz tamamlandı");
  const h2 = hukumYorum({ risk_metadata: { bant: "yesil" }, verify_uyari: {} });
  assert.equal(h2.baslik, "İşlem sorunsuz tamamlandı");
});

test("hukum: bilinmeyen bant → sarkık ayraç yok, temkinli amber", () => {
  const h = hukumYorum({ risk_metadata: { bant: "mor" } });
  assert.doesNotMatch(h.baslik, /·\s*$/);
  assert.match(h.baslik, /belirlenemedi/);
  assert.equal(h.ton, "sari");
});

test("eksik: bozuk eksik_alanlar şekli 'eksiksiz' İDDİASI üretmez", () => {
  const e = eksikYorum({ evrak_turu: "dilekce", eksik_alanlar: { a: 1 } });
  assert.doesNotMatch(e.metin, /eksiksiz/);
});

test("lint: tutarsız rapor (gecti > kural sayısı / negatif) kelepçelenir", () => {
  const d = lintGiris({ kurallar: [{ durum: "gecti" }, { durum: "gecti" }, { durum: "gecti" }], ozet: {}, uyari: ["a", "b", "c", "d", "e"] });
  assert.doesNotMatch(d, /-\d/);
});

test("decompose: hiç birim verisi yoksa 'aynı birime' İDDİA EDİLMEZ", () => {
  const d = decomposeGiris([{ ozet: "a" }, { ozet: "b" }]);
  assert.match(d, /2 ayrı istek/);
  assert.doesNotMatch(d, /birime/);
});

test("mevzuat: CRAG güven sayıları 2 hane ile gösterilir", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [{ baslik: "a", score: 1 }],
    crag_corrected: true, crag_guven_oncesi: 0.4123456, crag_guven_sonrasi: 0.9123456,
  });
  assert.match(d, /0\.41.*0\.91/);
  assert.doesNotMatch(d, /0\.412/);
});

/* ---- slaKonum: çizelge konumu GERÇEK tarihlerden, sabit yüzde yok ---- */
test("slaKonum: 30 günlük sürenin ortası → oran 0.5", () => {
  const k = slaKonum({ baslangic: "09.06.2026", son_tarih: "09.07.2026", kalan_gun: 15 });
  assert.equal(k.toplam, 30);
  assert.equal(k.gecen, 15);
  assert.ok(Math.abs(k.oran - 0.5) < 0.01);
});

test("slaKonum: kritik son gün (0g) → oran 1", () => {
  const k = slaKonum({ baslangic: "09.06.2026", son_tarih: "09.07.2026", kalan_gun: 0 });
  assert.equal(k.oran, 1);
  assert.equal(k.kalan, 0);
});

test("slaKonum: gecikmiş (kalan -3) → oran 1'de kelepçeli, kalan negatif korunur", () => {
  const k = slaKonum({ baslangic: "09.06.2026", son_tarih: "09.07.2026", kalan_gun: -3 });
  assert.equal(k.oran, 1);
  assert.equal(k.kalan, -3);
});

test("slaKonum: tarih eksik/bozuksa null — sabit konum UYDURULMAZ", () => {
  assert.equal(slaKonum({ son_tarih: "09.07.2026", kalan_gun: 5 }), null);
  assert.equal(slaKonum({ baslangic: "bozuk", son_tarih: "09.07.2026", kalan_gun: 5 }), null);
  assert.equal(slaKonum(), null);
});

/* ---- null-güvenlik: boş state hiçbir fonksiyonu düşürmez ---- */
test("null-güvenlik: boş/eksik state'te tüm fonksiyonlar string/obje döner", () => {
  assert.ok(hukumYorum().baslik);
  assert.ok(ozetDipnot());
  assert.ok(unsurEtiket().dipnot);
  assert.ok(eksikYorum().metin);
  assert.equal(typeof mevzuatDipnot(), "string");
  assert.ok(birimDipnot());
  assert.ok(denetimDipnot().metin);
  assert.equal(typeof lintGiris(), "string");
  assert.equal(typeof decomposeGiris(), "string");
});
