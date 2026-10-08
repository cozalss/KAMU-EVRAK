import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { epostaMaskele, segmentleriMaskele, kelimeSinirinaYasla } from "./sonucMaske.js";

describe("sonucMaske", () => {
  it("e-postanın yerel kısmını baş iki karakter dışında kapatır, alanı korur", () => {
    assert.equal(epostaMaskele("İletişim: mehmet.demir@ornekmail.com"), "İletişim: me**********@ornekmail.com");
  });
  it("kısa yerel kısım en az üç yıldız alır (uzunluk sızmaz)", () => {
    assert.equal(epostaMaskele("ab@x.com.tr"), "ab***@x.com.tr");
  });
  it("e-posta yoksa metin aynen döner", () => {
    assert.equal(epostaMaskele("Tel: 055******12"), "Tel: 055******12");
  });
  it("segmentlerde yalnız değişeni kopyalar; hiçbiri değişmezse aynı dizi döner", () => {
    const segs = [{ t: "Ad: Ayşe" }, { t: "ayse.yilmaz@ornek.org", mark: true }];
    const m = segmentleriMaskele(segs);
    assert.equal(m[0], segs[0]);
    assert.deepEqual(m[1], { t: "ay*********@ornek.org", mark: true });
    const sabit = [{ t: "yok" }];
    assert.equal(segmentleriMaskele(sabit), sabit);
  });
});

describe("kelimeSinirinaYasla", () => {
  it("vurguyu kelimenin ekine kadar genişletir, sonraki kelimeye taşmaz", () => {
    const segs = [{ t: "T.C.\n" }, { t: "BAKANLIĞ", mark: true }, { t: "INA ANKARA" }];
    assert.deepEqual(kelimeSinirinaYasla(segs), [{ t: "T.C.\n" }, { t: "BAKANLIĞINA", mark: true }, { t: " ANKARA" }]);
  });
  it("kelime ortasında başlayan vurguyu başa çeker; sınırdaysa dokunmaz", () => {
    assert.deepEqual(kelimeSinirinaYasla([{ t: "Sayın Meh" }, { t: "met", mark: true }]), [{ t: "Sayın " }, { t: "Mehmet", mark: true }]);
    const sabit = [{ t: "Tarih: " }, { t: "09.07.2026", mark: true }, { t: "\nKonu" }];
    assert.deepEqual(kelimeSinirinaYasla(sabit), sabit);
  });
  it("vurgu yoksa aynı diziyi döndürür", () => {
    const segs = [{ t: "düz" }];
    assert.equal(kelimeSinirinaYasla(segs), segs);
  });
});
