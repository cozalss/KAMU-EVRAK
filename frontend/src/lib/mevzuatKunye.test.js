import { test } from "node:test";
import assert from "node:assert/strict";
import { kunyeCoz, kaynakNotuCoz, NITELIK, atifCoz, katalogEslesir, notTemizle } from "./mevzuatKunye.js";

test("kunyeCoz: 'RG gg.aa.yyyy/sayı' biçiminden kabul + RG tarih/sayı + yürürlük çözer", () => {
  const r = kunyeCoz("Kanun No 1136, Kabul 19.03.1969, RG 07.04.1969/13168 — YÜRÜRLÜKTE");
  assert.equal(r.kabul, "19.03.1969");
  assert.equal(r.rgTarih, "07.04.1969");
  assert.equal(r.rgSayi, "13168");
  assert.equal(r.yururlukte, true);
  assert.equal(r.mulga, false);
});

test("kunyeCoz: kabul tarihi RG tarihi sanılmaz", () => {
  const r = kunyeCoz("Kanun No: 3071 (Kabul: 01.11.1984, RG 10.11.1984/18571 — YÜRÜRLÜKTE)");
  assert.equal(r.kabul, "01.11.1984");
  assert.equal(r.rgTarih, "10.11.1984");
  assert.equal(r.rgSayi, "18571");
});

test("kunyeCoz: yazıyla ay + 'Sayı' biçimi", () => {
  const r = kunyeCoz("RG: 4 Mart 2009, Sayı 27159");
  assert.equal(r.rgTarih, "04.03.2009");
  assert.equal(r.rgSayi, "27159");
});

test("kunyeCoz: 'tarih ve N sayılı RG' biçimi", () => {
  const r = kunyeCoz("14/6/2014 tarih ve 29030 sayılı RG");
  assert.equal(r.rgTarih, "14.06.2014");
  assert.equal(r.rgSayi, "29030");
});

test("kunyeCoz: mülga künye yürürlükte sayılmaz", () => {
  const r = kunyeCoz("Kanun No 1111, RG 12.07.1927/631 — MÜLGA");
  assert.equal(r.mulga, true);
  assert.equal(r.yururlukte, false);
});

test("kunyeCoz: parantezli tarihsiz künye alt başlıktır", () => {
  assert.equal(kunyeCoz("(e-Yazışma Teknik Rehberi)").altBaslik, "e-Yazışma Teknik Rehberi");
});

test("kunyeCoz: boş girdi çökmez, hiçbir alan uydurmaz", () => {
  const r = kunyeCoz(null);
  assert.equal(r.rgTarih, null);
  assert.equal(r.kabul, null);
  assert.equal(r.yururlukte, false);
});

test("kaynakNotuCoz: madde özeti notu 'ozet' niteliği + https kaynak", () => {
  const r = kaynakNotuCoz("Kaynak: https://www.mevzuat.gov.tr/mevzuatmetin/1.5.1136.pdf\n\nBu metin kamuya açık mevzuatın madde ÖZETLERİNDEN derlenmiştir (lafzî tam metin değildir).");
  assert.equal(r.nitelik, "ozet");
  assert.equal(r.host, "mevzuat.gov.tr");
  assert.equal(r.url, "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.1136.pdf");
});

test("kaynakNotuCoz: lafzî metin notu 'lafzi' niteliği", () => {
  assert.equal(kaynakNotuCoz("Bu metin kamuya açık kanunun LAFZÎ metnidir.").nitelik, "lafzi");
});

test("kaynakNotuCoz: http (TLS'siz) bağlantı kabul edilmez, tanınmayan not nitelik üretmez", () => {
  const r = kaynakNotuCoz("Kaynak: http://ornek.gov.tr/x.pdf\nSerbest açıklama.");
  assert.equal(r.url, null);
  assert.equal(r.nitelik, null);
});

test("NITELIK: yalnız lafzî metin yeşil; özet ve yakın-lafzî uyarı tonunda", () => {
  assert.equal(NITELIK.lafzi.renk, "yesil");
  assert.equal(NITELIK.ozet.renk, "sari");
  assert.equal(NITELIK.yakin.renk, "sari");
});

/* 2026-10 TUR 3 ölçümü: eski /MÜLGA|…/i büyük-küçük harf duyarsızdı → künyesinde
   "YÜRÜRLÜKTE (bazı maddeleri … mülga)" yazan 13 yürürlükteki kanun (SGK 5502, Siyasi
   Partiler 2820, TÜİK 5429 …) katalogda ÜSTÜ ÇİZİLİ "Mülga" gösteriliyordu. Gerçek mülga 1. */
test("kunyeCoz: yürürlükteki kanunun künyesinde kısmi 'mülga' geçmesi onu mülga yapmaz", () => {
  const r = kunyeCoz("Kanun No: 2820 · RG: 24.4.1983 / Sayı 18027 · YÜRÜRLÜKTE (bazı maddeleri sonraki kanunlarla değiştirilmiş/mülga; eski madde 9 mülga)");
  assert.equal(r.mulga, false);
  assert.equal(r.yururlukte, true);
  assert.equal(r.durum, "yururlukte");
});

test("kunyeCoz: madde düzeyinde 'yürürlükten kaldırılmıştır' kanunun kendisini mülga yapmaz", () => {
  const r = kunyeCoz("Kabul 16.05.2006, RG 20.05.2006/26173 — YÜRÜRLÜKTE (m.12 7/2018 tarihli KHK ile yürürlükten kaldırılmıştır)");
  assert.equal(r.mulga, false);
  assert.equal(r.durum, "yururlukte");
});

test("kunyeCoz: KISMEN YÜRÜRLÜKTE ayrı durumdur — ne tam yürürlükte ne mülga", () => {
  const r = kunyeCoz("Kanun No: 132 · RG: 22.11.1960 / Sayı 10661 · KISMEN YÜRÜRLÜKTE (yürürlükteki maddeler: 9/A, 11)");
  assert.equal(r.durum, "kismen");
  assert.equal(r.mulga, false);
  assert.equal(r.yururlukte, false);
});

test("kunyeCoz: büyük harf MÜLGA beyanı mülgadır; durum bilinmiyorsa null", () => {
  const r = kunyeCoz("Kanun No 1111, Kabul 21.06.1927, RG 12-17.07.1927/631-635 — MÜLGA. 7179 sayılı Kanunla tümüyle yürürlükten kaldırılmıştır.");
  assert.equal(r.durum, "mulga");
  assert.equal(r.mulga, true);
  assert.equal(kunyeCoz("RG 07.04.1969/13168").durum, null);
});

test("kunyeCoz: ilk büyük harf beyan kazanır — YÜRÜRLÜKTE notundaki 'MÜLGA edilmiş' maddeye aittir", () => {
  const r = kunyeCoz("Kanun No 5544, RG 07.10.2006/26312 — YÜRÜRLÜKTE (NOT: teşkilat maddeleri 703 sayılı KHK ile MÜLGA edilmiş)");
  assert.equal(r.durum, "yururlukte");
});

test("atifCoz: sistemin kendi atıf biçimleri çözülür, çıplak numara atıf değildir", () => {
  for (const q of ["4982 m.11", "4982 m. 11", "4982 s.K. m.11", "4982 sayılı Kanun m.11", "4982 madde 11", "4982/11", "4982 sayılı Kanunun 11 inci maddesi"]) {
    assert.deepEqual(atifCoz(q), { no: "4982", madde: "11" }, q);
  }
  assert.equal(atifCoz("4982"), null);
  assert.equal(atifCoz("bilgi edinme"), null);
});

test("katalogEslesir: atıf numaraya, serbest sorgu sözcüklere bakar", () => {
  const m = { no: "4982", baslik: "Bilgi Edinme Hakkı Kanunu", kunye: "RG 24.10.2003", kategori: "Bilgi", dosya: "4982_bilgi_edinme_kanunu" };
  assert.ok(katalogEslesir(m, "4982 m.11"));
  assert.ok(!katalogEslesir({ ...m, no: "3071", dosya: "3071_dilekce" }, "4982 m.11"));
  assert.ok(katalogEslesir(m, "edinme bilgi"));   // sıra bağımsız
  assert.ok(katalogEslesir(m, "Bilgi Edinme"));
  assert.ok(!katalogEslesir(m, "dilekçe"));
});

test("notTemizle: İngilizce jargon, iç not ve ham URL ekrana düşmez", () => {
  const t = notTemizle("Metin TBMM kanun mirror'ı ile doğrulandı. NOT: İstekteki '1 No.lu CBK' yerine 11 kullanıldı. Kaynak: https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4982&MevzuatTur=1");
  assert.ok(!/mirror|İstekteki|\?Mevzuat/u.test(t), t);
  assert.ok(t.includes("yansısı") && t.includes("mevzuat.gov.tr"));
});
