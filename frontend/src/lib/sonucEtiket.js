/* sonucEtiket — sonuç ekranında HAM backend değerlerini insan diline çeviren saf yardımcılar.

   Bağımsız denetim (TUR 4) memura görünen ham değerleri saydı: `tarih_yok` çipi, slug biçimli
   mevzuat adları ("kvkk aydinlatma yukumlulugu tebligi m.5"), kurum yerine şablon adı
   ("Genel Belediye Şablonu"), talepler listesinde antet artığı ("T.C", "Konu: …"), ondalık
   nokta. Kural: çeviri bilgiyi DEĞİŞTİRMEZ, yalnız biçimler; tanınmayan değer uydurulmaz. */

const SLA_DURUM_AD = {
  tarih_yok: "Tarih okunamadı",
  tabi_degil: "Süreye tabi değil",
  bilinmiyor: "Belirlenemedi",
  belirsiz: "Belirlenemedi",
};

/** snake_case/enum → okunur ifade ("tarih_yok" → "Tarih yok"). Boşsa "". */
export function enumEtiket(kod) {
  const s = String(kod ?? "").trim();
  if (!s) return "";
  const duz = s.replace(/_+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
  return duz.charAt(0).toLocaleUpperCase("tr-TR") + duz.slice(1);
}

/** Yasal süre durum kodu → etiket. Bilinen kodlar sözlükten, gerisi enumEtiket. */
export function slaDurumAdi(durum) {
  const k = String(durum ?? "").trim().toLowerCase();   // kod Latin: tr-TR "I"→"ı" çevirirdi
  return SLA_DURUM_AD[k] || enumEtiket(durum);
}

const ANTET_ARTIGI_RE = /^(t\.?\s*c\.?|türkiye cumhuriyeti|kamu kurumu|sayı|tarih|konu|ilgi|ek)\s*[:.]?$/i;
const ETIKET_ONEK_RE = /^(konu|talep|talebim|istek)\s*:\s*/i;

/** Talepler listesi: antet artığı ("T.C") ve boş öğeler düşer, "Konu: x" → "x", tekrar edilmez. */
export function talepleriSuz(talepler) {
  const liste = Array.isArray(talepler) ? talepler : [];
  const gorulen = new Set();
  const sonuc = [];
  for (const ham of liste) {
    const t = String(ham ?? "").replace(ETIKET_ONEK_RE, "").replace(/\s+/g, " ").trim();
    if (!t || ANTET_ARTIGI_RE.test(t)) continue;
    if ((t.match(/\p{L}/gu) || []).length < 3) continue;
    const anahtar = t.toLocaleLowerCase("tr-TR");
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push(t);
  }
  return sonuc;
}

/** Kurum adı yerine şablon adı ("Genel Belediye Şablonu") gelirse kurum BİLİNMİYOR sayılır → "". */
export function kurumGorunur(ad) {
  const s = String(ad ?? "").trim();
  if (!s || /şablon|sablon|template/i.test(s) || /^kamu kurumu$/i.test(s)) return "";
  return s;
}

/** Katalog listesi → { dosya: görünen ad } haritası. Parantezli durum notu ("(MÜLGA — …)") atılır. */
export function katalogAdHaritasi(katalog) {
  const harita = new Map();
  const liste = Array.isArray(katalog?.mevzuatlar) ? katalog.mevzuatlar : Array.isArray(katalog) ? katalog : [];
  for (const k of liste) {
    if (!k?.dosya || !k?.baslik) continue;
    const ad = String(k.baslik).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (ad) harita.set(k.dosya, ad);
  }
  return harita;
}

const MADDE_EK = { gecici: "geçici m.", ek: "ek m.", madde: "m." };

/** Mevzuat önerisinin görünen adı: katalogdaki resmî ad + madde; katalog yoksa ham başlık. */
export function mevzuatGorunenAd(m, harita) {
  const ad = m?.kaynak_dosya && harita?.get ? harita.get(m.kaynak_dosya) : "";
  if (!ad) return String(m?.baslik ?? "").trim();
  const no = m?.madde_no;
  if (no === undefined || no === null || no === "") return ad;
  return `${ad} · ${MADDE_EK[m?.madde_tur] || "m."}${no}`;
}

/** Türkçe ondalık: 0.45 → "0,5" (basamak=1). Sayı değilse "–". */
export function ondalikTr(deger, basamak = 1) {
  const n = Number(deger);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

/** Kullanıcıya görünmemesi gereken iç işaretler: ⭐ ve "(abstention)" gibi senaryo notları. */
export function icIsaretTemizle(metin) {
  return String(metin ?? "")
    .replace(/\s*\((?:abstention|demo|senaryo|test)\)/gi, "")
    .replace(/\s*[⭐★]️?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
