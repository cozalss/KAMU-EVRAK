/* detayYorum motoru testleri — bağımlılıksız `node --test src/lib/detayYorum.test.js`.
   Sözleşme: her fonksiyon SAF (DOM/React yok), null-güvenli, ve ürettiği cümle
   pipeline state'iyle ASLA çelişmez (ör. bütünlük bozukken "değiştirilemez" denmez). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hukumYorum, ozetDipnot, unsurEtiket, eksikYorum,
  mevzuatDipnot, birimDipnot, denetimDipnot, lintGiris, lintGrupla, decomposeGiris, slaKonum,
  riskGerekceYorum, riskSkorYorum, kanunNo,
} from "./detayYorum.js";

/* ---- lintGrupla: durum gruplama + bilinmeyen durum düşmez + varsayılan açılım ---- */
test("lintGrupla: durumlara ayırır, bilinmeyen durum diger kovasına gider", () => {
  const g = lintGrupla([
    { kural: "a", durum: "uyari" }, { kural: "b", durum: "gecti" },
    { kural: "c", durum: "bilgi" }, { kural: "d", durum: "tuhaf" }, { kural: "e" },
  ]);
  assert.equal(g.uyari.length, 1);
  assert.equal(g.gecti.length, 1);
  assert.equal(g.bilgi.length, 1);
  assert.equal(g.diger.length, 2); // bilinmeyen + durumsuz — sessiz düşme YOK
  assert.equal(g.varsayilanAcik, false);
});

test("lintGrupla: bulgu yoksa geçti listesi varsayılan açık", () => {
  const g = lintGrupla([{ kural: "a", durum: "gecti" }, { kural: "b", durum: "gecti" }]);
  assert.equal(g.varsayilanAcik, true);
});

test("lintGrupla: bozuk girdi (dizi değil / null öğe) güvenle süzülür", () => {
  assert.equal(lintGrupla(undefined).gecti.length, 0);
  assert.equal(lintGrupla([null, "x", 7, { kural: "a", durum: "gecti" }]).gecti.length, 1);
});

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

/* ---- mevzuatDipnot: skor GÖRELİ olduğu söylenir; NLI/CRAG iddiaları yalnız veri varsa ---- */
test("mevzuat: yüzdenin göreli olduğu söylenir, eski eşik totolojisi kalkar", () => {
  const d = mevzuatDipnot({ mevzuat_onerileri: [{ baslik: "3071 a", score: 1 }, { baslik: "3071 b", score: 0.8 }] });
  assert.match(d, /görelidir/);
  assert.doesNotMatch(d, /eşiğin/);        // "tamamı %60 eşiğinin üzerinde" iddiası artık YOK
  assert.doesNotMatch(d, /NLI/);
});

test("mevzuat: inceleme sayısı gerçek bayraklardan; NLI verisi varsa anılır", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [
      { baslik: "3071 a", score: 1, inceleme_oner: false },
      { baslik: "3071 b", score: 0.4, inceleme_oner: true },
    ],
    mevzuat_nli: [{ baslik: "3071 a" }],
  });
  assert.match(d, /2 öneriden 1 tanesi için insan incelemesi/);
  assert.match(d, /NLI/);
});

test("mevzuat: hiç inceleme bayrağı yoksa o cümle kurulmaz", () => {
  const d = mevzuatDipnot({ mevzuat_onerileri: [{ baslik: "3071 a", score: 1, inceleme_oner: false }] });
  assert.doesNotMatch(d, /insan incelemesi/);
});

/* Farklı kanunlardan gelen öneriler ALTERNATİF olabilir — sistem hangisinin uygulanacağını
   bilemez; uydurmak yerine memuru doğrulamaya yönlendirir (CLAUDE.md §1). */
test("mevzuat: tek kanundan gelen öneriler → çoklu-mevzuat uyarısı YOK", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [{ baslik: "2004 icra iflas kanunu m.60" }, { baslik: "2004 icra iflas kanunu m.168" }],
  });
  assert.doesNotMatch(d, /ayrı mevzuattan/);
});

test("mevzuat: farklı kanunlar → seçim uyarısı, ama hangisi diye İDDİA etmez", () => {
  const d = mevzuatDipnot({
    mevzuat_onerileri: [
      { baslik: "7155 abonelik sozlesmesi para alacaklari takip kanunu m.3" },
      { baslik: "2004 icra iflas kanunu m.168" },
      { baslik: "2004 icra iflas kanunu m.60" },
    ],
  });
  assert.match(d, /2 ayrı mevzuattan/);      // 7155 + 2004 — sondaki "m.168" kanun no DEĞİL
  assert.match(d, /sistem karar vermez/);
});

test("mevzuat: sondaki madde no kanun no sanılmaz", () => {
  assert.equal(kanunNo("2004 icra iflas kanunu m.168"), "2004");
  assert.equal(kanunNo("2005-7 standart dosya plani m.1"), "2005-7");
  assert.equal(kanunNo("Resmî Yazışma Yönetmeliği (CB 2646/2020)"), ""); // numarasız → sayıma girmez
});

test("mevzuat: öneri yoksa boş dipnot (uydurma cümle yok)", () => {
  assert.equal(mevzuatDipnot({ mevzuat_onerileri: [] }), "");
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

/* ---- riskGerekceYorum: makine gerekçesi → memur dili; ham metin ASLA kaybolmaz ---- */
const GROUNDING = "Uydurma şüphesi — Taslaktaki iddia kaynak evrakta yok (LLM grounding): T.C. KAMU KURUMU";

test("gerekce: LLM grounding iddiası sade dile çevrilir, iddia metni korunur", () => {
  const y = riskGerekceYorum(GROUNDING);
  assert.equal(y.cevrildi, true);
  assert.match(y.sade, /T\.C\. KAMU KURUMU/);      // iddianın kendisi kaybolmaz
  assert.match(y.sade, /evrakta bulunamadı/);
  assert.doesNotMatch(y.sade, /grounding|LLM/i);    // jargon memura gösterilmez
  assert.equal(y.teknik, GROUNDING);                // ham metin birebir saklanır
});

test("gerekce: uydurma tarih/sayı 'doğrulayın' sinyalini korur", () => {
  const t = riskGerekceYorum("Uydurma şüphesi — Taslaktaki '99.99.9999' tarihi kaynak evrakta yok (doğrulayın).");
  assert.match(t.sade, /99\.99\.9999/);
  assert.match(t.sade, /tarihi/);
  assert.match(t.sade, /doğrulayın/i);
  const s = riskGerekceYorum("Uydurma şüphesi — Taslaktaki '5000' sayısı kaynak evrakta yok (doğrulayın).");
  assert.match(s.sade, /5000/);
  assert.match(s.sade, /sayısı/);
});

test("gerekce: [DOĞRULA] işareti — köşeli parantez üretilmez (cleanDemoText tuzağı)", () => {
  const y = riskGerekceYorum("3 alan doğrulanmalı ([DOĞRULA] işareti)");
  assert.match(y.sade, /3 alan/);
  assert.doesNotMatch(y.sade, /\[/);   // cleanDemoText bunu "Kontrol:" diye yeniden yazardı
});

test("gerekce: düşük güven 0..1 skoru yüzdeye çevrilir", () => {
  const y = riskGerekceYorum("Düşük sınıflandırma güveni (0.42)");
  assert.match(y.sade, /%42/);
  assert.doesNotMatch(y.sade, /0\.42/);
});

test("gerekce: sarı sinyallerin her biri bilgi kaybetmeden çevrilir", () => {
  assert.match(riskGerekceYorum("Eksik bölüm: İmza bloğu (ad-soyad/unvan)").sade, /İmza bloğu/);
  assert.match(riskGerekceYorum("Eksik zorunlu bilgi: tarih, konu").sade, /tarih, konu/);
  assert.match(riskGerekceYorum("Format (2646 lint): Konu satırı yok").sade, /Konu satırı yok/);
  assert.match(riskGerekceYorum("Tutarlılık: tarih sırası bozuk").sade, /tarih sırası bozuk/);
  assert.match(riskGerekceYorum("Evrak türü belirsiz (sınıflandırma abstention)").sade, /türünü belirleyemedi/);
  assert.doesNotMatch(riskGerekceYorum("Evrak türü belirsiz (sınıflandırma abstention)").sade, /abstention/i);
});

test("gerekce: tanınmayan şekil aynen gösterilir (uydurma çeviri yok)", () => {
  const ham = "Beklenmedik yeni backend sinyali xyz";
  const y = riskGerekceYorum(ham);
  assert.equal(y.sade, ham);
  assert.equal(y.cevrildi, false);
});

test("gerekce: boş/null girdi null döner", () => {
  assert.equal(riskGerekceYorum(""), null);
  assert.equal(riskGerekceYorum(), null);
});

/* ---- riskSkorYorum: 0..1 ölçülmüş skor → yüzde + seviye; çubuk = gerekçenin KENDİ ağırlığı ---- */
test("skor: çubuklar backend katkılarından gelir, gerekçe sayısına BÖLÜNMEZ", () => {
  const y = riskSkorYorum(0.87, [0.82, 0.29], "kirmizi", "olculdu");
  assert.match(y.baslik, /%87/);
  assert.match(y.baslik, /en yüksek/);
  assert.deepEqual(y.paylar, [82, 29]);   // ağır neden büyük çubuk
  assert.match(y.teknik, /0\.87/);
});

test("skor: REGRESYON — eşit bölüşüm iddiası artık yok", () => {
  const y = riskSkorYorum(0.9, [0.82, 0.82, 0.82, 0.82], "kirmizi", "olculdu");
  assert.doesNotMatch(y.not, /eşit olarak paylaştır/);
  // 4 gerekçe var ama çubuk 0.9/4=%23'e düşmüyor
  assert.deepEqual(y.paylar, [82, 82, 82, 82]);
});

test("skor: çubukların toplamı puana eşit değildir — bu açıkça söylenir", () => {
  const y = riskSkorYorum(0.87, [0.82, 0.29], "kirmizi", "olculdu");
  assert.match(y.not, /toplamı puana eşit değil/);
});

test("skor: kalibrasyon durumu memura bildirilir (gizlenmez)", () => {
  assert.match(riskSkorYorum(0.5, [0.5], "sari", "olculdu").kalibrasyonNot, /ölçülerek/);
  assert.match(riskSkorYorum(0.5, [0.5], "sari", "onsel").kalibrasyonNot, /ölçülmedi/);
  assert.match(riskSkorYorum(0.5, [0.5], "sari", "kismi").kalibrasyonNot, /bir kısmı ölçüldü/);
});

test("skor: katkı yoksa çubuk uydurulmaz", () => {
  const y = riskSkorYorum(0.5, undefined, "sari", "onsel");
  assert.deepEqual(y.paylar, []);
});

test("skor: geçersiz/sıfır skor null döner (uydurma yüzde yok)", () => {
  assert.equal(riskSkorYorum(NaN, [0.3], "sari"), null);
  assert.equal(riskSkorYorum(0, [], "yesil"), null);
  assert.equal(riskSkorYorum(undefined, [], "yesil"), null);
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
