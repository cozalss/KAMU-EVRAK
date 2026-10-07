/* canliBicim testleri — canlı sahnenin tek saat kuralı + resmî dil biçimleri (tur 8, D-canli). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { duvarMs, fmtSn, grupDuvarMs, akisDuvarMs, slaSatiri, sahneCiktisi, kosumSaati, hataSebebi } from "./canliBicim.js";

test("duvarMs: izleyicinin gördüğü süre (t1-t0) sunucu süresinden önce gelir", () => {
  // Arrange — sunucu 1 ms diyor, ekran 1,9 sn boyunca çalıştığını gösterdi
  const a = { t0: 1000, t1: 2900, durationMs: 1 };
  // Act + Assert
  assert.equal(duvarMs(a), 1900);
});

test("duvarMs: damga yoksa sunucu süresine düşer, ikisi de yoksa null (sıfır beyan edilmez)", () => {
  assert.equal(duvarMs({ durationMs: 420 }), 420);
  assert.equal(duvarMs({}), null);
  assert.equal(duvarMs({ t0: 5, t1: 2 }), null);
});

test("fmtSn: <0,1 sn, tek ondalık, 10 sn üstü tam saniye", () => {
  assert.equal(fmtSn(40), "<0,1 sn");
  assert.equal(fmtSn(1940), "1,9 sn");
  assert.equal(fmtSn(12400), "12 sn");
  assert.equal(fmtSn(null), null);
});

test("grup/akış duvar süresi: grup içi en uzun dal, gruplar arası toplam", () => {
  const g1 = { items: [{ t0: 0, t1: 1000 }, { t0: 0, t1: 1500 }] };
  const g2 = { items: [{ t0: 1500, t1: 2000 }] };
  assert.equal(grupDuvarMs(g1.items), 1500);
  assert.equal(akisDuvarMs([g1, g2]), 2000);
  assert.equal(akisDuvarMs([{ items: [{}] }]), null);
});

test("slaSatiri: eksi işareti ve 'g' kısaltması yerine resmî dil", () => {
  assert.equal(slaSatiri({ durum: "GECIKMIS", kalan_gun: -64 }), "Gecikmiş · 64 gün geçti");
  assert.equal(slaSatiri({ durum: "KRITIK", kalan_gun: 3 }), "Kritik · 3 gün kaldı");
  assert.equal(slaSatiri({ durum: "NORMAL", kalan_gun: 0 }), "Normal · son gün bugün");
  assert.equal(slaSatiri({ durum: "tanimsiz" }), null);
});

test("sahneCiktisi: risk kodu büyük harf, ölçü kısmı aynen kalır", () => {
  const d = { risk_metadata: { bant: "sari" } };
  assert.equal(sahneCiktisi("risk_guard", "sarı · kusur olasılığı %70", d), "SARI · kusur olasılığı %70");
  assert.equal(sahneCiktisi("ozetle", "özet hazır", {}), "özet hazır");
});

test("kosumSaati: göreli damgayı duvar saatine çevirir; geçersiz girdide boş", () => {
  const epoch = new Date(2026, 9, 7, 21, 14, 10).getTime();
  // runBase=1000, olay t=4000 → perf 5000; şimdi perf 10000 → olay 5 sn önce
  assert.equal(kosumSaati(1000, 4000, 10000, epoch), "21:14:05");
  assert.equal(kosumSaati(0, 4000, 10000, epoch), "");
});

test("hataSebebi: başlıkta zaten yazan masa adı öneki sahne kutusundan düşer", () => {
  assert.equal(hataSebebi("Mevzuat Öner adımında durdu — Servis yanıt vermedi.", "Mevzuat Öner"), "Servis yanıt vermedi.");
  assert.equal(hataSebebi("Ağ hatası", "Mevzuat Öner"), "Ağ hatası");
});
