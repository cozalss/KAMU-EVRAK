/* sampleDocs invariant testleri — `node --test src/lib/sampleDocs.test.js`.
   Bug avı bulgusu (2026-07-17): 4 örneğin id'si geçerli evrak türü değildi → /sla/onizleme
   türü "tanimsiz" sayıp SLA rozeti basmıyor, kategori "Diğer"e düşüyordu. Sözleşme:
   her örneğin ETKİN türü (tur ?? id) kanonik EVRAK_TURLERI kümesinde olmalı.
   2026-10: tarihler göreli → tarih tutarlılığı ve kuyruk SLA bandı her gün için sınanır. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_DOCS, ornekEvraklar } from "./sampleDocs.js";
import { gunEkle, gunFarki, isGunuEkle, isGunuMu, tarihOku, tarihYaz } from "./goreliTarih.js";

// backend/agents/config.py EVRAK_TURLERI aynası (19 tür) — backend'den import edilemez
// (ayrı runtime); liste değişirse bilinçli olarak iki yerde güncellenir.
const EVRAK_TURLERI = new Set([
  "dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme", "cimer",
  "ust_yazi", "cevabi_yazi", "tebligat", "dava_evraki", "icra_evraki",
  "muzekkere", "fatura", "tutanak", "rapor", "gorus_mutalaa",
  "genelge_talimat_olur", "belirsiz",
]);

test("her örneğin etkin türü (tur ?? id) kanonik evrak türü", () => {
  for (const s of SAMPLE_DOCS) {
    const etkin = s.tur ?? s.id;
    assert.ok(EVRAK_TURLERI.has(etkin),
      `örnek '${s.id}' → etkin tür '${etkin}' kanonik listede değil — SLA/kategori kırılır`);
  }
});

test("örnek id'leri benzersiz ve metinler boş değil", () => {
  const idler = SAMPLE_DOCS.map((s) => s.id);
  assert.equal(SAMPLE_DOCS.length, 15);
  assert.equal(new Set(idler).size, idler.length, "id çakışması — React key/işaretleme kırılır");
  for (const s of SAMPLE_DOCS) {
    assert.ok(typeof s.text === "string" && s.text.trim().length > 40, `örnek '${s.id}' metni boş/kısa`);
  }
});

// Görünen alanlar (label/konu/aciklama) memura gösterilir: geliştirici/test notu, emoji
// ve iç senaryo dili sızmamalı (tur4 jüri bulgusu: "sistem eksik alan bulamayınca yeşil
// geçer", "⭐", "(abstention)").
test("görünen alanlarda iç not, emoji ve yarışma dili yok", () => {
  const YASAK = [/⭐/u, /abstention/i, /\bsistem\b/i, /Görev [12]/u, /jüri/i, /şartname\s*§/iu, /\(KRİTİK süre\)/u, /süresi GEÇTİ/u, /yetkisizlik/i];
  for (const s of SAMPLE_DOCS) {
    for (const alan of ["label", "konu", "aciklama"]) {
      const v = String(s[alan] || "");
      assert.ok(v.length > 0, `örnek '${s.id}' ${alan} boş`);
      for (const re of YASAK) assert.ok(!re.test(v), `örnek '${s.id}' ${alan} iç ifade içeriyor: ${v}`);
    }
  }
});

// Veritabanındaki eski işlem kayıtları "ornek-<id>.txt" / label / eskiAdlar ile örneklere
// eşlenir (lib/kuyrukDurumu). Eski ad tekrar kullanılırsa yeni evrak "işlendi" görünüp kutudan
// düşer — 2026-10 öncesi tüm id ve görünen adlar burada YASAKLI.
const ESKI_IDLER = ["cok_konulu", "dilekce", "sikayet_gurultu", "ihbar", "talep_ulasim", "sikayet",
  "bilgi_edinme", "cimer", "basvuru", "dilekce_aydinlatma", "talep", "ust_yazi", "muzekkere",
  "icra_evraki", "belirsiz"];
const ESKI_ADLAR = ["Çok konulu dilekçe", "Çok-Konulu Dilekçe", "Ambulans ulaşım süresi dilekçesi",
  "Gürültü şikâyeti", "Kaçak yapı ihbarı", "Toplu taşıma sefer talebi", "Temizlik aracı gürültüsü şikâyeti",
  "Bilgi edinme başvurusu", "CİMER başvurusu", "İşyeri ruhsat başvurusu", "Sokak aydınlatması arızası",
  "Yıllık izin talebi", "Valilik üst yazısı", "Hukuki görüş müzekkeresi", "Maaş haczi müzekkeresi",
  "Konusu belirsiz kısa yazı"];

test("eski id ve görünen adlar yeniden kullanılmıyor; eskiAdlar alanı yok", () => {
  for (const s of SAMPLE_DOCS) {
    assert.ok(!ESKI_IDLER.includes(s.id), `'${s.id}' eski id — DB'deki eski kayıtla eşleşir`);
    assert.ok(!ESKI_ADLAR.includes(s.label), `'${s.label}' eski görünen ad`);
    assert.equal(s.eskiAdlar, undefined, `'${s.id}' eskiAdlar taşıyor`);
  }
});

// TCKN algoritması (10. ve 11. hane kontrolü). CLAUDE.md §2: örneklerdeki numaralar
// checksum-GEÇERLİ SAHTE TCKN olmalı — geçersiz numara her evrakta "checksum geçmiyor"
// uyarısı üretip risk bandını yapay olarak yükseltiyordu (2026-10-06).
const tcknGecerli = (s) => {
  const d = [...s].map(Number);
  if (d[0] === 0) return false;
  const d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  return d10 === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
};

test("metinlerdeki 11 haneli kimlik numaralarının hepsi checksum'ı geçiyor", () => {
  let sayi = 0;
  for (const s of SAMPLE_DOCS) {
    for (const m of s.text.matchAll(/\b[1-9]\d{10}\b/g)) {
      sayi += 1;
      assert.ok(tcknGecerli(m[0]), `örnek '${s.id}' checksum'ı tutmayan TCKN içeriyor: ${m[0]}`);
    }
  }
  assert.ok(sayi >= 4, "PII çeşitliliği: en az dört TCKN örneği bekleniyor");
});

test("PII çeşitliliği: telefon, e-posta ve IBAN örnekleri var", () => {
  const hepsi = SAMPLE_DOCS.map((s) => s.text).join("\n");
  assert.ok((hepsi.match(/0555[ -]\d{3}/g) || []).length >= 8, "telefon");
  assert.ok((hepsi.match(/@ornekmail\.com/g) || []).length >= 4, "e-posta");
  assert.ok((hepsi.match(/\bTR\d{2}(?: \d{4}){5} \d{2}\b/g) || []).length >= 2, "IBAN");
});

// ─── Tarih tutarlılığı ───────────────────────────────────────────────────────────────
const TARIH_RE = /\b\d{2}\.\d{2}\.\d{4}\b/g;
// /sla/onizleme (backend api/routes/sla.py) ile aynı etiketli satır kuralı.
const ETIKETLI_RE = /^\s*Tarih\s*[:-]\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})/m;
// Bu bağlamlarda tarih evrak tarihinden SONRA olabilir (süre, izin aralığı, sözleşme sonu).
const ILERI_BAGLAM = /^(\s+tarihine kadar|\s+tarihinde sona erecek|\s+-\s|\s+tarihleri arasında)/;

const tarihleriAyir = (metin) => [...metin.matchAll(TARIH_RE)].map((m) => ({
  d: tarihOku(m[0]),
  ham: m[0],
  ileri: ILERI_BAGLAM.test(metin.slice(m.index + 10, m.index + 40)) || /\s-\s$/.test(metin.slice(m.index - 3, m.index)),
}));

const GUNLER = Array.from({ length: 400 }, (_, i) => gunEkle(new Date(2026, 0, 1), i));

test("her gün için: evrak tarihi geçmişte, ilgi tarihleri öncesinde, süreler sonrasında", () => {
  for (const bugun of GUNLER) {
    for (const s of ornekEvraklar(bugun)) {
      const tarihler = tarihleriAyir(s.text);
      for (const x of tarihler) assert.ok(x.d, `'${s.id}' geçersiz tarih ${x.ham}`);
      const etiketli = ETIKETLI_RE.exec(s.text);
      if (!etiketli) {
        assert.equal(tarihler.length, 0, `'${s.id}' etiketsiz ama tarih taşıyor`);
        continue;
      }
      const evrak = tarihOku(etiketli[1]);
      const yas = gunFarki(evrak, bugun);
      assert.ok(yas >= 0 && yas <= 45, `'${s.id}' evrak tarihi ${etiketli[1]} bugüne (${tarihYaz(bugun)}) göre ${yas} gün`);
      for (const x of tarihler) {
        if (x.ileri) assert.ok(x.d >= gunEkle(evrak, -1), `'${s.id}' ileri tarih ${x.ham} evraktan önce`);
        else assert.ok(x.d <= evrak, `'${s.id}' ${x.ham} evrak tarihinden (${etiketli[1]}) sonra`);
      }
    }
  }
});

test("yıl ibareleri (sayı, dosya no, başvuru no) evrak yılıyla uyumlu", () => {
  const bugun = new Date(2027, 0, 4); // yıl başı: göreli tarih bir önceki yıla düşebilir
  for (const s of ornekEvraklar(bugun)) {
    const etiketli = ETIKETLI_RE.exec(s.text);
    if (!etiketli) continue;
    const yil = tarihOku(etiketli[1]).getFullYear();
    for (const m of s.text.matchAll(/\b(20\d{2})\/\d+/g)) {
      assert.ok(Math.abs(Number(m[1]) - yil) <= 1, `'${s.id}' ${m[0]} evrak yılından (${yil}) uzak`);
    }
  }
});

// ─── Kuyruk SLA bandı (backend compute_sla aynası, metinsiz önizleme yolu) ─────────────
// Süre tablosu: backend agents/config.EVRAK_TO_SURE. Kamerî bayramlar hariç (goreliTarih notu).
const SURE = { dilekce: [30, false], basvuru: [30, false], sikayet: [30, false], talep: [30, false],
  ihbar: [30, false], cimer: [30, false], bilgi_edinme: [15, true] };

const sonrakiIsGunu = (d) => (isGunuMu(d) ? d : sonrakiIsGunu(gunEkle(d, 1)));

const onizlemeBandi = (tur, metin, bugun) => {
  const sure = SURE[tur];
  if (!sure) return "tanimsiz";
  const m = ETIKETLI_RE.exec(metin);
  if (!m) return "tarih_yok";
  const bas = tarihOku(m[1]);
  const son = sonrakiIsGunu(sure[1] ? isGunuEkle(bas, sure[0]) : gunEkle(bas, sure[0]));
  const kalan = gunFarki(bugun, son);
  if (kalan < 0) return "GECIKMIS";
  return kalan <= 2 ? "KRITIK" : "NORMAL";
};

// Bugün tatilse ve ilk iş günü 2 günden uzaksa (ör. Cuma'ya denk gelen 1 Mayıs) 30 günlük
// hiçbir evrak KRİTİK olamaz: son gün bugün..+2 arasına düşse de ilk iş gününe kayar. O
// günlerde KRİTİK beyanlı örnek NORMAL görünür — tek kabul edilen sapma budur.
const kritikImkansiz = (bugun) => gunFarki(bugun, sonrakiIsGunu(bugun)) > 2;

test("her gün için kuyruk SLA bandı beyan edilen banda eşit", () => {
  let sapma = 0;
  for (const bugun of GUNLER) {
    for (const s of ornekEvraklar(bugun)) {
      const bant = onizlemeBandi(s.tur, s.text, bugun);
      if (s.beklenenSla === "KRITIK" && kritikImkansiz(bugun)) {
        assert.equal(bant, "NORMAL");
        sapma += 1;
        continue;
      }
      assert.equal(bant, s.beklenenSla, `${tarihYaz(bugun)} '${s.id}' bandı beklenenden farklı`);
    }
  }
  assert.ok(sapma <= 20, `KRİTİK sapması yılda birkaç günle sınırlı olmalı: ${sapma}`);
});

test("bant dağılımı gerçekçi: çoğu NORMAL, 2-3 KRİTİK, en fazla 1 GECİKMİŞ, 1 tarihsiz", () => {
  const say = {};
  for (const s of SAMPLE_DOCS) say[s.beklenenSla] = (say[s.beklenenSla] || 0) + 1;
  const sureli = SAMPLE_DOCS.filter((s) => SURE[s.tur] && s.beklenenSla !== "tarih_yok").length;
  assert.ok(say.NORMAL > sureli / 2, `NORMAL çoğunluk değil: ${JSON.stringify(say)}`);
  assert.ok(say.KRITIK >= 2 && say.KRITIK <= 3, `KRİTİK: ${say.KRITIK}`);
  assert.ok((say.GECIKMIS || 0) <= 1, `GECİKMİŞ: ${say.GECIKMIS}`);
  assert.equal(say.tarih_yok, 1);
});
