/* akisKatman testleri — eşzamanlılık gruplaması, "gerekmedi" tespiti, paralel-farkında süre.

   Neden: canlı akış ekranı adımları düz 01→N dizisi olarak sunuyor, oysa backend grafı üç
   yerde dallanıyor. Düz liste iki ayrı yalan söylüyordu: (a) paralel adımları seri gösterdi,
   (b) sırayı ters verdi (decompose graf'ta eksik_tespit'ten ÖNCE koşar). Ayrıca faz süresi
   paralel dalları TOPLUYORDU → geçen süre olduğundan uzun görünüyordu. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  katmanGruplari, gerekmediMi, adimDurumu, kostuMu, kapanisDurumlari, grupSuresiMs, akisSuresiMs,
  ortusenAdimlar, kesimSirasi,
  hataDurumlari, hataMesaji,
} from "./akisKatman.js";

const n = (id, ekstra = {}) => ({ id, label: id, status: "done", ...ekstra });

/* ---- katmanGruplari: çalışma sırası + eşzamanlı bloklar ---- */

test("katmanGruplari: aynı katmandaki adımlar tek paralel gruba iner", () => {
  // Arrange
  const nodes = [n("eksik_tespit"), n("mevzuat_oner"), n("ozetle"), n("route_birim")];
  const katmanlar = { eksik_tespit: 4, mevzuat_oner: 4, ozetle: 4, route_birim: 5 };
  // Act
  const g = katmanGruplari(nodes, katmanlar);
  // Assert — üçlü danışma dalı TEK blok, route_birim ayrı
  assert.equal(g.length, 2);
  assert.equal(g[0].paralel, true);
  assert.deepEqual(g[0].items.map((x) => x.id), ["eksik_tespit", "mevzuat_oner", "ozetle"]);
  assert.equal(g[1].paralel, false);
});

test("katmanGruplari: sırayı LİSTEDEN değil GRAFTAN alır (decompose önce koşar)", () => {
  // Arrange — düz liste eksik_tespit'i önce sayıyor; graf tersini söylüyor
  const nodes = [n("eksik_tespit"), n("decompose")];
  const katmanlar = { decompose: 3, eksik_tespit: 4 };
  // Act
  const g = katmanGruplari(nodes, katmanlar);
  // Assert — gerçek çalışma sırası
  assert.deepEqual(g.map((x) => x.items[0].id), ["decompose", "eksik_tespit"]);
});

test("katmanGruplari: grup içi sıra girdi sırasını korur (kararlı gösterim)", () => {
  // Arrange — aynı katman, ters verilmiş
  const nodes = [n("ozetle"), n("eksik_tespit")];
  const katmanlar = { eksik_tespit: 4, ozetle: 4 };
  // Act / Assert — girdi sırası korunur, keyfi yeniden dizilim yok
  assert.deepEqual(katmanGruplari(nodes, katmanlar)[0].items.map((x) => x.id),
    ["ozetle", "eksik_tespit"]);
});

test("katmanGruplari: harita yoksa düz listeye döner (zarif düşüş)", () => {
  // Arrange / Act
  const nodes = [n("a"), n("b")];
  const g = katmanGruplari(nodes, null);
  // Assert — her adım kendi grubunda, sıra bozulmadan; paralellik İDDİA EDİLMEZ
  assert.equal(g.length, 2);
  assert.equal(g.every((x) => x.paralel === false), true);
  assert.deepEqual(g.map((x) => x.items[0].id), ["a", "b"]);
});

test("katmanGruplari: harita EKSİKSE paralellik iddia etmez (yarım bilgiyle uydurmaz)", () => {
  // Arrange — "yeni" node haritada yok (ENV/sürüm uyuşmazlığı)
  const nodes = [n("eksik_tespit"), n("ozetle"), n("yeni")];
  const katmanlar = { eksik_tespit: 4, ozetle: 4 };
  // Act
  const g = katmanGruplari(nodes, katmanlar);
  // Assert — hiçbir node düşmez ve hiçbiri paralel gösterilmez
  assert.equal(g.length, 3);
  assert.equal(g.some((x) => x.paralel), false);
  assert.deepEqual(g.map((x) => x.items[0].id), ["eksik_tespit", "ozetle", "yeni"]);
});

test("katmanGruplari: boş girdi boş çıktı", () => {
  assert.deepEqual(katmanGruplari([], { a: 1 }), []);
  assert.deepEqual(katmanGruplari(null, null), []);
});

test("katmanGruplari: gerçek varsayılan topoloji üç eşzamanlı blok üretir", () => {
  // Arrange — backend'in ölçtüğü varsayılan ENV haritası (test_katman.py::VARSAYILAN).
  // Bu harita canlıda SSE ile gelir; burada gruplama davranışının çapası olarak yazılır.
  const kat = {
    oku: 0, siniflandir: 1, cikar: 1, kanit_baglama: 2, decompose: 3,
    eksik_tespit: 4, mevzuat_oner: 4, ozetle: 4, route_birim: 5, yazi_taslak: 6,
    verify: 7, risk_guard: 8, arsiv: 8, sla_triyaj: 9, finalize: 11,
  };
  // Act — düğümler DÜZ liste sırasında verilir (backend start.nodes sırası)
  const sira = ["oku", "siniflandir", "cikar", "kanit_baglama", "eksik_tespit", "decompose",
    "mevzuat_oner", "ozetle", "route_birim", "yazi_taslak", "verify", "risk_guard",
    "arsiv", "sla_triyaj", "finalize"];
  const g = katmanGruplari(sira.map((id) => n(id)), kat);
  // Assert — üç eşzamanlı blok + düz listedeki ters çift (eksik_tespit/decompose) düzelmiş
  assert.deepEqual(g.filter((x) => x.paralel).map((x) => x.items.map((i) => i.id)), [
    ["siniflandir", "cikar"],
    ["eksik_tespit", "mevzuat_oner", "ozetle"],
    ["risk_guard", "arsiv"],
  ]);
  const duz = g.flatMap((x) => x.items.map((i) => i.id));
  assert.ok(duz.indexOf("decompose") < duz.indexOf("eksik_tespit"));
});

/* ---- adimDurumu: koşmayan adım "tamamlandı" SAYILMAZ ---- */

test("adimDurumu: atlanan adım başarı değildir (koşullu dal seçilmedi)", () => {
  // Arrange — dur-ve-sor dalında hiç çalışmayan adım
  const node = n("yazi_taslak", { status: "atlandi" });
  // Act / Assert — REGRESYON: eskiden toplu "done" işaretiyle yeşil tik alıyordu
  assert.equal(adimDurumu(node), "atlandi");
  assert.equal(kostuMu(node), false);
});

test("adimDurumu: koşan adım iş ürettiyse çalıştı, üretmediyse gerekmedi", () => {
  assert.equal(adimDurumu(n("verify", { data: { verify_uyari: [] } })), "calisti");
  assert.equal(adimDurumu(n("oku", { data: { engine: "text-plain" } })), "gerekmedi");
  assert.equal(adimDurumu(n("oku", { data: { engine: "rapidocr" } })), "calisti");
});

test("adimDurumu: hata · işleniyor · bekliyor ayrı ayrı ayırt edilir", () => {
  assert.equal(adimDurumu(n("x", { status: "error" })), "hata");
  assert.equal(adimDurumu(n("x", { status: "active" })), "isleniyor");
  assert.equal(adimDurumu(n("x", { status: "pending" })), "bekliyor");
  assert.equal(adimDurumu(null), "bekliyor");
});

test("kostuMu: yalnız gerçekten koşan adım true (gerekmedi de koşmuştur)", () => {
  assert.equal(kostuMu(n("oku", { data: { engine: "text-plain" } })), true);
  assert.equal(kostuMu(n("x", { status: "atlandi" })), false);
  assert.equal(kostuMu(n("x", { status: "pending" })), false);
});

/* ---- gerekmediMi: çalışmayan adım dürüstçe işaretlenir ---- */

test("gerekmediMi: metin katmanı olan belgede OCR gerekmedi", () => {
  // Arrange/Act/Assert — dijital metin: hiçbir OCR motoru koşmadı
  assert.equal(gerekmediMi(n("oku", { data: { engine: "text-plain" } })), true);
  assert.equal(gerekmediMi(n("oku", { data: { engine: "pdf-text" } })), true);
  assert.equal(gerekmediMi(n("oku", { data: { engine: "docx-text" } })), true);
});

test("gerekmediMi: taranmış belgede OCR GERÇEKTEN çalıştı", () => {
  // Arrange/Act/Assert — motor koştu → adım hafife alınmaz
  assert.equal(gerekmediMi(n("oku", { data: { engine: "rapidocr" } })), false);
  assert.equal(gerekmediMi(n("oku", { data: { engine: "pdf-scan-tesseract" } })), false);
  assert.equal(gerekmediMi(n("oku", { data: { engine: "openai-vision" } })), false);
});

test("gerekmediMi: ayrıştırma YAPILMADIYSA gerekmedi (tek talep; node LLM çağırmaz)", () => {
  // Arrange/Act/Assert — decompose_node: <2 talepte [] + ayristirma_denendi=false döner
  assert.equal(gerekmediMi(n("decompose", { data: { alt_talepler: [], ayristirma_denendi: false } })), true);
});

test("gerekmediMi: backend 'denendi' dediyse boş liste 'gerekmedi' DEĞİLDİR", () => {
  // Arrange — karar yalnız backend bayrağından okunur; boş listeden çıkarım yapılmaz
  // (CLAUDE.md §10). Bayrak true iken adım "çalıştı" kalır.
  const node = n("decompose", { data: { alt_talepler: [], ayristirma_denendi: true } });
  // Act / Assert
  assert.equal(gerekmediMi(node), false);
});

test("gerekmediMi: alt-talep bulunduysa gerekmedi değildir", () => {
  assert.equal(gerekmediMi(n("decompose", { data: { alt_talepler: [{ ozet: "a" }, { ozet: "b" }], ayristirma_denendi: true } })), false);
});

test("gerekmediMi: bayrak yoksa (eski yük) İDDİA EDİLMEZ", () => {
  // Boş listeden çıkarım yapmak yasak — bayrak tek doğruluk kaynağı.
  assert.equal(gerekmediMi(n("decompose", { data: { alt_talepler: [] } })), false);
});

test("gerekmediMi: veri yokken İDDİA ETMEZ (yokluktan 'gerekmedi' türetilmez)", () => {
  // Arrange/Act/Assert — data gelmemişse adım normal sayılır
  assert.equal(gerekmediMi(n("oku")), false);
  assert.equal(gerekmediMi(n("decompose")), false);
  assert.equal(gerekmediMi(n("decompose", { data: {} })), false);
});

test("gerekmediMi: tamamlanmamış adım gerekmedi sayılmaz", () => {
  // Arrange/Act/Assert — henüz koşmayan adım hakkında hüküm verilmez
  assert.equal(gerekmediMi(n("oku", { status: "active", data: { engine: "text-plain" } })), false);
  assert.equal(gerekmediMi(n("decompose", { status: "pending", data: { ayristirma_denendi: false } })), false);
});

test("gerekmediMi: diğer adımlar asla gerekmedi değildir", () => {
  assert.equal(gerekmediMi(n("verify", { data: { verify_uyari: [] } })), false);
  assert.equal(gerekmediMi(n("ozetle", { data: {} })), false);
});

/* ---- süre: paralel dallar TOPLANMAZ ---- */

test("grupSuresiMs: paralel grup en uzun dalı kadar sürer", () => {
  // Arrange — üç dal aynı anda koştu
  const items = [n("a", { durationMs: 900 }), n("b", { durationMs: 1500 }), n("c", { durationMs: 300 })];
  // Act / Assert — 2700 değil 1500
  assert.equal(grupSuresiMs(items), 1500);
});

test("grupSuresiMs: ölçülmemiş dal grubu düşürmez", () => {
  const items = [n("a", { durationMs: null }), n("b", { durationMs: 400 })];
  assert.equal(grupSuresiMs(items), 400);
});

test("grupSuresiMs: hiç ölçüm yoksa null (sıfır uydurulmaz)", () => {
  assert.equal(grupSuresiMs([n("a"), n("b")]), null);
  assert.equal(grupSuresiMs([]), null);
});

test("akisSuresiMs: gruplar arası toplanır, grup içi en uzun alınır", () => {
  // Arrange — [900 ∥ 1500] → 1500, sonra 600 seri
  const nodes = [n("s", { durationMs: 900 }), n("c", { durationMs: 1500 }), n("k", { durationMs: 600 })];
  const gruplar = katmanGruplari(nodes, { s: 1, c: 1, k: 2 });
  // Act / Assert — 3000 değil 2100
  assert.equal(akisSuresiMs(gruplar), 2100);
});

test("akisSuresiMs: tamamı ölçümsüzse null", () => {
  assert.equal(akisSuresiMs(katmanGruplari([n("a")], null)), null);
});

test("akisSuresiMs: t0/t1 damgası da sayılır (sunucu telemetrisi yoksa)", () => {
  // Arrange — durationMs yok, istemci damgası var
  const gruplar = katmanGruplari([n("a", { t0: 100, t1: 900 })], null);
  // Act / Assert
  assert.equal(akisSuresiMs(gruplar), 800);
});

/* ---- kapanisDurumlari: KOŞMAYAN adım başarı sayılmaz (adversarial regresyon) ----

   Kaynak: 2026-08-12 adversarial denetimi. `VITRIN_MODU=1` altında canlı SSE kaydı
   alındı; backend 18 adım duyurdu, 15'i koştu. Eskiden kapanışta tüm bekleyen adımlar
   "done" işaretleniyordu → hiç koşmamış adımlar yeşil tik alıyor ve ekran-okuyucu
   "18 işlem adımı başarıyla yürütüldü" diyordu. İki ayrı son ayırt edilmeli:
     · koşum BİTTİ  + adım hiç başlamadı → atlandi
     · koşum DURDU (memur onayı)        → sırada (pending) — atlanmadı, henüz koşmadı  */

// Canlı kayıttan (VITRIN_MODU=1): duyurulan sıra ve koşmayan üçlü.
const VITRIN_NODES = ["oku", "siniflandir", "cikar", "kanit_baglama", "eksik_tespit",
  "decompose", "mevzuat_oner", "crag", "ozetle", "route_birim", "yazi_taslak", "verify",
  "risk_guard", "arsiv", "sla_triyaj", "onay_kapisi", "denetim_izi", "finalize"];
const VITRIN_KOSMAYAN = new Set(["onay_kapisi", "denetim_izi", "finalize"]);

const vitrinDurumlari = () => VITRIN_NODES.map((id) => n(id, {
  status: VITRIN_KOSMAYAN.has(id) ? "pending" : "done",
}));

test("kapanış: koşum bitti — hiç başlamayan adım 'atlandi', başarı sayısına GİRMEZ", () => {
  // Arrange — canlı kayıt: 18 duyuruldu, 15 koştu
  const kapanmis = kapanisDurumlari(vitrinDurumlari(), 1000, { duraklatildi: false });
  // Act
  const kosan = kapanmis.filter(kostuMu).length;
  const atlanan = kapanmis.filter((x) => adimDurumu(x) === "atlandi").length;
  // Assert — REGRESYON: eskiden kosan 18 çıkıyordu
  assert.equal(kosan, 15);
  assert.equal(atlanan, 3);
  assert.deepEqual(kapanmis.filter((x) => x.status === "atlandi").map((x) => x.id),
    ["onay_kapisi", "denetim_izi", "finalize"]);
});

test("kapanış: koşum DURAKLADI (memur onayı) — kalan adım 'atlandi' DEĞİL, sırada", () => {
  // Arrange — canlı kayıt: onay_bekliyor=true, bant=sarı
  const kapanmis = kapanisDurumlari(vitrinDurumlari(), 1000, { duraklatildi: true });
  // Act / Assert — memur karar verince koşacaklar; "çalışmadı" demek yanlış olurdu
  assert.equal(kapanmis.filter((x) => x.status === "atlandi").length, 0);
  assert.deepEqual(kapanmis.filter((x) => x.status === "pending").map((x) => x.id),
    ["onay_kapisi", "denetim_izi", "finalize"]);
});

test("kapanış: çalışan adım tamamlanır ve süre damgası alır", () => {
  // Arrange — akış kapandığında hâlâ active olan adım gerçekten başlamıştı
  const kapanmis = kapanisDurumlari([n("verify", { status: "active", t0: 40 })], 900);
  // Act / Assert
  assert.equal(kapanmis[0].status, "done");
  assert.equal(kapanmis[0].t0, 40);
  assert.equal(kapanmis[0].t1, 900);
});

test("kapanış: DURAKLADI — kesintiye giren adım 'tamamlandı' SAYILMAZ, sırada kalır", () => {
  // Arrange — backend her node başlarken `active` yayar; HITL'de onay_kapisi BAŞLAR,
  // interrupt'ta durur ve hiç `done` yaymaz. Kapanışta active→done kuralı onu yeşil tik
  // yapardı: memur henüz karar vermemişken "onay kapısı tamamlandı" yalanı.
  const nodes = vitrinDurumlari().map((x) => (x.id === "onay_kapisi" ? { ...x, status: "active", t0: 700 } : x));
  // Act
  const kapanmis = kapanisDurumlari(nodes, 1000, { duraklatildi: true });
  const kapi = kapanmis.find((x) => x.id === "onay_kapisi");
  // Assert
  assert.equal(kapi.status, "pending");
  assert.equal(adimDurumu(kapi), "bekliyor");
  assert.equal(kapanmis.filter(kostuMu).length, 15);
});

test("kapanış: bozuk girdi düşürmez", () => {
  assert.deepEqual(kapanisDurumlari(null, 0), []);
  assert.deepEqual(kapanisDurumlari(undefined, 0), []);
});

test("REGRESYON: hiç koşmamış eşzamanlı çift 'aynı anda çalıştı' SAYILMAZ", () => {
  // Arrange — dur-ve-sor dalında risk_guard ∥ arsiv katmanı hiç koşmadı; harita TAM
  // olduğu için düz-listeye-düş emniyeti devreye girmez → grup yine paralel işaretlenir.
  const nodes = [n("risk_guard", { status: "atlandi" }), n("arsiv", { status: "atlandi" })];
  const g = katmanGruplari(nodes, { risk_guard: 8, arsiv: 8 });
  // Act — arayüz etiketi "kaç ÜYE gerçekten koştu"ya bakar (ParalelBaslik aynı kuralı kullanır)
  const kosan = g[0].items.filter(kostuMu).length;
  // Assert — yapısal olarak aynı katman, ama bu koşumda eşzamanlılık İDDİASI YOK
  assert.equal(g[0].paralel, true);
  assert.equal(kosan, 0);
});

/* ---- ortusenAdimlar: canlı eşzamanlılık OLGUDAN (başladı/bitti damgaları) ---- */

test("ortusenAdimlar: aynı anda çalışan iki adım kesişir", () => {
  // Arrange — ikisi de başladı, biri bitti, diğeri sürüyor
  const items = [n("siniflandir", { status: "done", t0: 100, t1: 1900 }), n("cikar", { status: "active", t0: 110 })];
  // Act + Assert
  assert.deepEqual(ortusenAdimlar(items).map((x) => x.id), ["siniflandir", "cikar"]);
});

test("ortusenAdimlar: ardışık (kesişmeyen) adımlar eşzamanlı SAYILMAZ", () => {
  const items = [n("a", { t0: 0, t1: 100 }), n("b", { t0: 100, t1: 200 })];
  assert.deepEqual(ortusenAdimlar(items), []);
});

test("ortusenAdimlar: başlamamış/atlanmış/damgasız üye iddiaya katılmaz", () => {
  const items = [n("a", { status: "active", t0: 5 }), n("b", { status: "pending" }), n("c", { status: "atlandi", t0: 6 }), n("d", { status: "done" })];
  assert.deepEqual(ortusenAdimlar(items), []);
});

test("ortusenAdimlar: bozuk girdi düşürmez", () => {
  assert.deepEqual(ortusenAdimlar(null), []);
});

/* ---- kesimSirasi: hata ile duran koşumda akışın kesildiği masa ---- */

test("kesimSirasi: hatadan sonraki ilk bekleyen masa", () => {
  const d = [n("a", { sira: 0 }), n("b", { status: "error", sira: 1 }), n("c", { status: "pending", sira: 2 }), n("d", { status: "pending", sira: 3 })];
  assert.equal(kesimSirasi(d), 2);
});

test("kesimSirasi: hata yoksa null (normal koşumda bekleyen adım 'kesildi' değildir)", () => {
  assert.equal(kesimSirasi([n("a", { sira: 0 }), n("b", { status: "pending", sira: 1 })]), null);
  assert.equal(kesimSirasi(undefined), null);
});

/* ——— hataDurumlari: SSE `error` olayında düğümleri kapat ———
   Backend artık HANGİ adımda durduğunu (`node`) ve yarıda kalan eşzamanlı kardeşleri
   (`kesilen`) söylüyor. Kardeşler HATA DEĞİLDİR — patlayan onlar değil; koşumları kesildi. */

test("hataDurumlari: yalnız patlayan adım hata, kesilen kardeş sırada kalır", () => {
  // Arrange
  const nodes = [n("siniflandir", { status: "done" }), n("verify", { status: "active", t0: 10 }),
    n("ozetle", { status: "active", t0: 12 }), n("finalize", { status: "pending" })];
  // Act
  const k = hataDurumlari(nodes, { node: "verify", kesilen: ["ozetle"] }, 99);
  // Assert
  assert.deepEqual(k.map((x) => x.status), ["done", "error", "pending", "pending"]);
  assert.equal(k[1].t1, 99);
  assert.equal(kostuMu(k[2]), false);
});

test("hataDurumlari: adım bilgisi yoksa eski davranış — koşanlar hata (uydurma atıf yok)", () => {
  const nodes = [n("verify", { status: "active" }), n("ozetle", { status: "active" }), n("finalize", { status: "pending" })];
  const k = hataDurumlari(nodes, {}, 5);
  assert.deepEqual(k.map((x) => x.status), ["error", "error", "pending"]);
});

test("hataDurumlari: duyurulmamış adım adı gelirse kimse sahte hata almaz, koşanlar hata", () => {
  const nodes = [n("verify", { status: "active" })];
  const k = hataDurumlari(nodes, { node: "bilinmeyen", kesilen: [] }, 5);
  assert.equal(k[0].status, "error");
});

test("hataMesaji: adım biliniyorsa etiketiyle söyler", () => {
  const nodes = [n("verify", { label: "Doğrula" })];
  assert.equal(hataMesaji(nodes, { node: "verify", message: "İşleme hatası" }), "Doğrula adımında durdu — İşleme hatası");
  assert.equal(hataMesaji(nodes, { message: "OCR hatası" }), "OCR hatası");
  assert.equal(hataMesaji(nodes, {}), "İşleme hatası");
});
