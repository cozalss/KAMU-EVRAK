/* nushaAkis — telefonda nüsha kâğıdının satır akışı (saf). */
import test from "node:test";
import assert from "node:assert/strict";
import { satirBasiKirp, paragraflaraAk, telefonNushaMetni } from "./nushaAkis.js";

test("satır başı hizalama boşlukları kırpılır, metin değişmez", () => {
  assert.equal(satirBasiKirp("   T.C.\n\u00a0 ÇANKAYA BELEDİYESİ\n\tGereğini arz ederim."), "T.C.\nÇANKAYA BELEDİYESİ\nGereğini arz ederim.");
});

test("sabit genişlikte sarılmış dilekçe satırları tek paragrafa akar", () => {
  const girdi = [
    "Kaynarca Mahallesi Menekşe Sokak'ın sonundaki boş arsaya, son iki haftadır gece saat",
    "23.00'ten sonra kamyonlarla inşaat molozu dökülmektedir.",
    "",
    "Gereğini arz ederim.",
  ].join("\n");
  assert.equal(paragraflaraAk(girdi), [
    "Kaynarca Mahallesi Menekşe Sokak'ın sonundaki boş arsaya, son iki haftadır gece saat 23.00'ten sonra kamyonlarla inşaat molozu dökülmektedir.",
    "",
    "Gereğini arz ederim.",
  ].join("\n"));
});

test("cümle sonu, kısa satır ve etiketli satır birleştirilmez", () => {
  const girdi = [
    "Konu: Boş arsaya kaçak hafriyat ve moloz dökülmesi hakkında başvuru",
    "Adı Soyadı: Deniz Erdem",
    "Talebimin değerlendirilmesini saygılarımla arz ederim.",
    "Ayşe Yılmaz",
    "Kısa satır",
    "devamı",
  ].join("\n");
  assert.equal(paragraflaraAk(girdi), girdi);
});

test("Sayı satırı (sağda tarih) ve resmî yazı paragrafları korunur", () => {
  const girdi = "Sayı : E-12-807 03.10.2026\nKonu : park aydınlatma talebi\n\nİlgi yazı ile mahalle parkına aydınlatma talebiniz incelenmiş olup gereği yapılacaktır.\nGereğini arz ederim.";
  assert.equal(telefonNushaMetni(girdi), girdi);
});

test("boş / tanımsız girdi güvenli", () => {
  assert.equal(telefonNushaMetni(""), "");
  assert.equal(telefonNushaMetni(null), "");
});
