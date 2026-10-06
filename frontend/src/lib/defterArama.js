/* defterArama — evrak defterlerinin (Gelen · İşlenen · Giden) arama çekirdeği.

   Neden useFilter'ın fuse.js yolu yerine: tüm sorguyu TEK bulanık desen sayan fuse,
   anlamsız bir sorguya ("zzqxy belediye") bile sonuç döndürüyordu — "belediye" yetiyordu
   (jüri tur 6). Bir sicil defterinde anlamsız sorguya sonuç gelmesi aramaya güveni bitirir.
   Burada kural açık ve açıklanabilir:
   · Sorgu sözcüklere bölünür; HER sözcük kayıtta geçmelidir ("tüm sözcükler" kipi).
   · Türkçe katlama: büyük/küçük ve ç/ğ/ı/İ/ö/ş/ü farkı yok ("dilekce" → "Dilekçe").
     Katlama karakter başına 1:1'dir → eşleşme konumları özgün metinde aynen vurgulanır.
   · Yazım hatası payı yalnız ≥5 harfli sözcükte ve tek harf (ekle/sil/değiştir) kadar.
   · Kayıt numarası sorgusu ("7", "0007", "2026/7") numarası eşleşen kaydı EN ÜSTE alır. */

const KATLA = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Türkçe katlama — uzunluk korunur (her karakter tek karaktere iner).
    @param {string} s @returns {string} */
export function katla(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    const k = ch.toLocaleLowerCase("tr-TR");
    const tek = k.length === ch.length ? k : ch;   // uzunluğu değiştiren dönüşüm (nadir) yapılmaz
    out += KATLA[tek] || tek;
  }
  return out;
}

/** @param {string} q @returns {string[]} katlanmış, boş olmayan sözcükler */
export function jetonlar(q) {
  return katla(q).split(/[\s,;·]+/).map((t) => t.trim()).filter((t) => t.length > 0);
}

/* En çok bir düzenleme (ekle/sil/değiştir) uzaklıkta mı — Levenshtein ≤ 1, erken çıkışlı. */
function birFark(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, fark = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    fark += 1;
    if (fark > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else { i += 1; j += 1; }
  }
  return fark + (a.length - i) + (b.length - j) <= 1;
}

const YAZIM_PAYI_MIN = 5;

/* Sözcük katlanmış metinde geçiyor mu — önce birebir alt dizi, yoksa (≥5 harf) metnin
   sözcük başlarından aynı uzunlukta parçalarla tek-fark karşılaştırması. */
function sozcukGecer(t, metin, sozcukler) {
  if (metin.includes(t)) return true;
  if (t.length < YAZIM_PAYI_MIN) return false;
  return sozcukler.some((w) => birFark(t, w.slice(0, t.length)) || birFark(t, w.slice(0, t.length + 1)) || birFark(t, w));
}

/** Kayıt sorgunun tüm sözcüklerini taşıyor mu.
    @param {string} metin kayıt arama metni (alanlar birleşik) @param {string[]} js jetonlar */
export function eslesir(metin, js) {
  if (!js.length) return true;
  const k = katla(metin);
  const sozcukler = k.split(/[^a-z0-9]+/).filter(Boolean);
  return js.every((t) => sozcukGecer(t, k, sozcukler));
}

/* Kayıt no sorgusu: yalnız rakam / "yıl/sıra" / tam no biçimi. */
const NO_SORGU = /^(?:[a-zçğıöşüi-]*-?)?(?:\d{4}\/)?\d{1,4}$/i;
const noSira = (no) => { const m = String(no || "").match(/(\d+)$/); return m ? Number(m[1]) : null; };

/** Defter araması — sırayı korur; kayıt no tam eşleşmesi en üste.
    @template T @param {T[]} kayitlar @param {string} q
    @param {(it:T)=>string} metinOf @param {(it:T)=>string} [noOf] @returns {T[]} */
export function defterAra(kayitlar, q, metinOf, noOf) {
  const sorgu = String(q ?? "").trim();
  if (!sorgu) return kayitlar;
  const js = jetonlar(sorgu);
  const noIstek = noOf && NO_SORGU.test(sorgu) ? noSira(sorgu) : null;
  const tam = [];
  const diger = [];
  for (const it of kayitlar) {
    const noEs = noIstek != null && noSira(noOf(it)) === noIstek;
    if (noEs) tam.push(it);
    else if (eslesir(metinOf(it), js)) diger.push(it);
  }
  return [...tam, ...diger];
}

/** Vurgu aralıkları — sözcüklerin metindeki birebir (katlanmış) geçişleri, birleştirilmiş.
    Yazım payıyla bulunan eşleşme vurgulanmaz (yanlış parçayı boyamamak için).
    @param {string} metin @param {string[]} js @returns {{t:string, mark:boolean}[]} */
export function vurguParcalari(metin, js) {
  const s = String(metin ?? "");
  if (!s || !js.length) return [{ t: s, mark: false }];
  const k = katla(s);
  const araliklar = [];
  for (const t of js) {
    let i = k.indexOf(t);
    while (t && i >= 0) { araliklar.push([i, i + t.length]); i = k.indexOf(t, i + t.length); }
  }
  if (!araliklar.length) return [{ t: s, mark: false }];
  araliklar.sort((a, b) => a[0] - b[0]);
  const birlesik = [];
  for (const [a, b] of araliklar) {
    const son = birlesik[birlesik.length - 1];
    if (son && a <= son[1]) son[1] = Math.max(son[1], b);
    else birlesik.push([a, b]);
  }
  const out = [];
  let imlec = 0;
  for (const [a, b] of birlesik) {
    if (a > imlec) out.push({ t: s.slice(imlec, a), mark: false });
    out.push({ t: s.slice(a, b), mark: true });
    imlec = b;
  }
  if (imlec < s.length) out.push({ t: s.slice(imlec), mark: false });
  return out;
}
