import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enumEtiket, slaDurumAdi, talepleriSuz, kurumGorunur, katalogAdHaritasi, mevzuatGorunenAd, ondalikTr, icIsaretTemizle,
} from "./sonucEtiket.js";

test("ham durum kodu kullanıcıya görünmez", () => {
  assert.equal(slaDurumAdi("tarih_yok"), "Tarih okunamadı");
  assert.equal(slaDurumAdi("TARIH_YOK"), "Tarih okunamadı");
  assert.equal(slaDurumAdi("baska_durum"), "Baska durum");
  assert.equal(enumEtiket(""), "");
});

test("talepler: antet artığı ve etiket öneki süzülür", () => {
  assert.deepEqual(talepleriSuz(["T.C", "Konu: park aydınlatma talebi", "park aydınlatma talebi", "", null]), ["park aydınlatma talebi"]);
  assert.deepEqual(talepleriSuz(["T.C."]), []);
  assert.deepEqual(talepleriSuz("x"), []);
});

test("şablon adı kurum yerine geçmez", () => {
  assert.equal(kurumGorunur("Genel Belediye Şablonu"), "");
  assert.equal(kurumGorunur("KAMU KURUMU"), "");
  assert.equal(kurumGorunur("Örnekkent Belediyesi"), "Örnekkent Belediyesi");
});

test("mevzuat adı katalogdan; yoksa ham başlık", () => {
  const h = katalogAdHaritasi({ mevzuatlar: [{ dosya: "kvkk_x", baslik: "Aydınlatma Yükümlülüğü Tebliği" }, { dosya: "m_y", baslik: "Askerlik Kanunu (MÜLGA — kaldırıldı)" }] });
  assert.equal(mevzuatGorunenAd({ kaynak_dosya: "kvkk_x", madde_no: 5, baslik: "kvkk x m.5" }, h), "Aydınlatma Yükümlülüğü Tebliği · m.5");
  assert.equal(mevzuatGorunenAd({ kaynak_dosya: "m_y", madde_no: 2, madde_tur: "gecici" }, h), "Askerlik Kanunu · geçici m.2");
  assert.equal(mevzuatGorunenAd({ kaynak_dosya: "yok", baslik: "ham m.1" }, h), "ham m.1");
  assert.equal(mevzuatGorunenAd({ baslik: "ham" }, null), "ham");
});

test("ondalık virgülle", () => {
  assert.equal(ondalikTr(13.2), "13,2");
  assert.equal(ondalikTr("x"), "–");
});

test("iç işaretler temizlenir", () => {
  assert.equal(icIsaretTemizle("Aydınlatma Arızası — Yetkisizlik ⭐"), "Aydınlatma Arızası — Yetkisizlik");
  assert.equal(icIsaretTemizle("Belirsiz Evrak (abstention)"), "Belirsiz Evrak");
});
