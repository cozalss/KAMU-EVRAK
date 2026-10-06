import { test } from "node:test";
import assert from "node:assert/strict";
import { toastTonu, TON_META, TONLAR } from "./toastTon.js";

test("veri kaybı uyarısı başarıdan ayrılır — başarı kelimesi geçse bile", () => {
  assert.equal(toastTonu("Taslak oturumda gönderildi ancak kalıcı kayda yazılamadı — kararı İşlenen evrak'tan yineleyin."), "uyari");
  assert.equal(toastTonu("Değişiklik oturumda kaldı — DB'ye kaydedilemedi, göndermeden önce tekrar deneyin."), "uyari");
  assert.equal(toastTonu("Taslak kalıcı silinemedi — sayfa yenilenince geri gelebilir."), "uyari");
});

test("başarı bildirimleri", () => {
  assert.equal(toastTonu("Evrak gönderildi — Giden evraka eklendi."), "basari");
  assert.equal(toastTonu("Reddedildi — Giden evraka kaydedildi."), "basari");
  assert.equal(toastTonu("Taslak panoya kopyalandı."), "basari");
});

test("hata bildirimleri", () => {
  assert.equal(toastTonu("Taslak doğrulanamadı — bağlantıyı kontrol edip tekrar deneyin."), "hata");
  assert.equal(toastTonu("Dayanak işlenemedi — backend çalışıyor mu?"), "hata");
  assert.equal(toastTonu("Kopyalanamadı — tarayıcı izni gerekebilir."), "hata");
});

test("nötr metin bilgi; boş/tanımsız güvenli", () => {
  assert.equal(toastTonu("Tekrar gönderme üretim entegrasyonunda etkinleşir."), "bilgi");
  assert.equal(toastTonu(""), "bilgi");
  assert.equal(toastTonu(undefined), "bilgi");
});

test("Türkçe büyük harf (İ) doğru küçülür", () => {
  assert.equal(toastTonu("İŞLENEMEDİ"), "hata");
});

test("uyarı ve hata en az 6 sn kalır; her tonun künyesi var", () => {
  for (const t of TONLAR) assert.ok(TON_META[t].kunye);
  assert.ok(TON_META.uyari.sure >= 6000 && TON_META.hata.sure >= 6000);
});
