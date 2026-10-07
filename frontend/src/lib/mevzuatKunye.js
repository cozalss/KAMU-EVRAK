/* Mevzuat künyesi + kaynak notu ayrıştırma — saf fonksiyonlar (JSX yok, node --test ile sınanır).
   Tüketenler: MevzuatView katalog kartı + MevzuatOkuma başlığı. */

/* ——— Künye ayrıştırma (YALNIZ görüntü; katalog kartı + okuma başlığı AYNI kaynağı kullanır) ———
   Künyeler elle derlendi, biçim karışık: "RG 07.04.1969/13168" · "Resmî Gazete: 24/6/1973,
   Sayı 14574" · "Resmî Gazete 25766 — 24.03.2005" · "14/6/2014 tarih ve 29030 sayılı RG" ·
   "RG: 4 Mart 2009, Sayı 27159" · "(e-Yazışma / … Boyutu)" (künye değil alt başlık).
   304 kaydın 300'ünde RG tarihi çözülür (2026-10 ölçümü); kalanlar ham metin yerine
   kabul tarihi / Düstur / alt başlık / hiçbir şey gösterir — ham dağınıklık asla. */
const AYLAR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
const AY_RE = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/gi;
const TARIH_RE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;
const tarihYaz = (m) => `${String(m[1]).padStart(2, "0")}.${String(m[2]).padStart(2, "0")}.${m[3]}`;

function rgSayisi(k, rg, tarih) {
  if (tarih) {
    const son = k.slice(tarih.index + tarih[0].length);
    const s = son.match(/^\s*(?:\/\s*(\d{3,6})|-\s*(\d{4,6})|(?:tarih(?:li)?\s*)?(?:[/,]|ve)?\s*(?:Sayı\s*:?\s*)?(\d{4,6})\b(?![./]\d))/i);
    if (s) return s[1] || s[2] || s[3];
  }
  const sonra = k.slice(rg.index + rg[0].length, rg.index + rg[0].length + 60);
  const s2 = sonra.match(/^\s*:?\s*(\d{4,6})\b(?![./]\d)/) || sonra.match(/Sayı\s*:?\s*(\d{4,6})/i)
    || k.slice(Math.max(0, rg.index - 40), rg.index).match(/(\d{4,6})\s*(?:mükerrer\s*)?sayılı\s*$/i);
  return s2 ? s2[1] : null;
}

/* Yürürlük durumu — yalnız künyenin KENDİ BÜYÜK HARF beyanından okunur (korpus sözleşmesi:
   "— YÜRÜRLÜKTE", "KISMEN YÜRÜRLÜKTE", "— MÜLGA"). Küçük harfli "mülga"/"yürürlükten
   kaldırılmıştır" madde düzeyindeki değişiklik notudur; kanunun kendisini mülga YAPMAZ
   (eski /…/i 13 yürürlükteki kanunu üstü çizili gösteriyordu). Beyan yoksa null — uydurulmaz. */
function yururlukDurumu(k) {
  // İLK büyük harf beyan kazanır: "YÜRÜRLÜKTE (NOT: … maddeleri MÜLGA edilmiş)" yürürlüktedir.
  const beyan = k.match(/KISMEN\s+Y[ÜU]R[ÜU]RL[ÜU]KTE|Y[ÜU]R[ÜU]RL[ÜU]KTE|\bMÜLGA\b/);
  if (beyan) return beyan[0].startsWith("KISMEN") ? "kismen" : beyan[0] === "MÜLGA" ? "mulga" : "yururlukte";
  return /tümüyle yürürlükten kaldırılmıştır/i.test(k) ? "mulga" : null;
}

export function kunyeCoz(kunye = "") {
  const k = String(kunye || "").replace(/\s+/g, " ").trim()
    .replace(AY_RE, (_, g, a, y) => `${g}.${AYLAR.indexOf(a.toLocaleLowerCase("tr")) + 1}.${y}`);
  const durum = yururlukDurumu(k);
  const r = { kabul: null, rgTarih: null, rgSayi: null, kararTarih: null, duz: false, altBaslik: null,
    durum, mulga: durum === "mulga", yururlukte: durum === "yururlukte" };
  if (!k) return r;
  const tarihler = [...k.matchAll(TARIH_RE)];
  const kabul = k.match(/Kabul(?:\s*Tarihi)?\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  if (kabul) r.kabul = tarihYaz(kabul);
  const rg = k.match(/\bRG\b|Resm[iî]\s*Gazete/i);
  if (rg) {
    const yakin = tarihler
      .filter((t) => !(kabul && t.index >= kabul.index && t.index < kabul.index + kabul[0].length))
      .map((t) => ({ t, d: Math.min(Math.abs(t.index - rg.index), Math.abs(t.index - rg.index - rg[0].length)) }))
      .sort((a, b) => a.d - b.d)[0];
    const tarih = yakin && yakin.d < 48 ? yakin.t : null;
    if (tarih) r.rgTarih = tarihYaz(tarih);
    r.rgSayi = rgSayisi(k, rg, tarih);
  }
  if (!r.rgTarih) {
    const karar = k.match(/Karar(?:ının)?\s*Tarihi\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
    if (karar) r.kararTarih = tarihYaz(karar);
    r.duz = /Düstur/i.test(k);
  }
  if (!tarihler.length && /^\(.*\)$/.test(k)) r.altBaslik = k.slice(1, -1).trim();
  return r;
}

/* Künye-öncesi kaynak notu → kaynak bağlantısı + metnin NİTELİĞİ. Korpustaki notlar metnin
   lafzî mi yoksa madde özeti mi olduğunu açıkça söyler; okur bunu ilk satırda görmeli
   (madde özeti hukuki atıf için yeterli değildir). Tanınmazsa nitelik null → çip basılmaz. */
export function kaynakNotuCoz(govde = "") {
  const g = String(govde || "");
  const u = g.match(/Kaynak\s*:\s*(https:\/\/[^\s)]+)/i);
  let host = null;
  try { host = u ? new URL(u[1]).hostname.replace(/^www\./, "") : null; } catch { host = null; }
  const kucuk = g.toLocaleLowerCase("tr");
  const nitelik = /özetlerinden|lafz[iî] tam metin değil/.test(kucuk) ? "ozet"
    : /yakın-lafz/.test(kucuk) ? "yakin" : /lafz[iî]\s*metn/.test(kucuk) ? "lafzi" : null;
  return { url: host ? u[1] : null, host, nitelik };
}
export const NITELIK = {
  lafzi: { ad: "Lafzî metin", aciklama: "Resmî metinden birebir alınmıştır.", renk: "yesil" },
  yakin: { ad: "Yakın-lafzî alıntı", aciklama: "Resmî metne yakın alıntı; atıf öncesi asıl metinle karşılaştırın.", renk: "sari" },
  ozet: { ad: "Madde özeti", aciklama: "Lafzî metin değildir; hukuki atıf için resmî kaynağı açın.", renk: "sari" },
};

/* ——— Katalog araması (saf) ———
   Sistemin KENDİ atıf biçimi ("4982 m.11", "3071 s.K. m.7", "657 sayılı Kanun madde 102",
   "4982/11") katalogda 0 sonuç veriyordu (tur4 bulgusu): sorgu tek dizi olarak içerilme
   aranıyordu. atifCoz bu biçimleri {no, madde}'ye çözer; görünüm o kanunu süzer ve maddeyi
   doğrudan okuma penceresinde açan kısayol sunar. Madde işareti yoksa (yalnız "4982") atıf
   DEĞİLDİR — numara araması olağan yoldan çalışır. */
const SIRA_EKI = "(?:['’]?\\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü|ci|cı|cu|cü))?";
const ATIF_DESEN = [
  new RegExp(`^(\\d{1,5})\\s*(?:s\\.?\\s*k\\.?|sayılı(?:\\s+[^\\d\\s]+){0,8})?\\s*,?\\s*(?:m\\.?|md\\.?|madde(?:si)?)\\s*(\\d{1,3})${SIRA_EKI}\\.?$`, "iu"),
  /^(\d{1,5})\s*\/\s*(\d{1,3})$/u,
  new RegExp(`^(\\d{1,5})\\s+sayılı(?:\\s+[^\\d\\s]+){0,8}?\\s+(\\d{1,3})${SIRA_EKI}\\s+madde(?:si)?$`, "iu"),
];

/** @param {string} q @returns {{no:string, madde:string}|null} */
export function atifCoz(q) {
  const s = String(q || "").replace(/\s+/g, " ").trim();
  for (const re of ATIF_DESEN) {
    const m = s.match(re);
    if (m) return { no: m[1], madde: String(Number(m[2])) };
  }
  return null;
}

const katla = (s) => String(s || "").toLocaleLowerCase("tr");

/** Katalog kaydı sorguya uyuyor mu — önce tam ifade, olmazsa sözcüklerin HEPSİ (sıra
    bağımsız: "bilgi edinme süre" ↔ "Bilgi Edinme Hakkı Kanunu … 15 iş günü süre").
    Atıf sorgusunda yalnız numara eşleşmesi (kayıt no ya da dosya öneki) aranır. */
export function katalogEslesir(m, q) {
  const atif = atifCoz(q);
  if (atif) return String(m?.no || "") === atif.no || String(m?.dosya || "").startsWith(`${atif.no}_`);
  const sorgu = katla(q).trim();
  if (!sorgu) return true;
  const metin = katla(`${m?.no || ""} ${m?.baslik || ""} ${m?.kunye || ""} ${m?.kategori || ""} ${String(m?.dosya || "").replace(/_/g, " ")} ${m?.aciklama || ""}`);
  if (metin.includes(sorgu)) return true;
  const sozcukler = sorgu.split(/\s+/).filter((w) => w.length >= 2);
  return sozcukler.length > 1 && sozcukler.every((w) => metin.includes(w));
}

/** Kaynak notu paragrafını memur diline çevir (YALNIZ görüntü; korpus metni değişmez):
    İngilizce "mirror" → "yansı", derleyicinin iç notu ("NOT: İstekteki …") atılır, sorgu
    dizili ham URL alan adına indirilir (tam bağlantı başlıktaki kaynak çipinde zaten var). */
export function notTemizle(p) {
  return String(p || "")
    .replace(/\s*NOT:\s*İstekteki[^.]*\.?/giu, "")
    // İç geliştirici atfı (korpus satırı 8: "(CLAUDE.md §1)") okura sızmaz; parantezsiz kalırsa
    // cümlesiyle birlikte düşer. Kalıcı çözüm korpus temizliği (backend/data — ayrı iş).
    .replace(/\s*\((?:[^()]*?)CLAUDE\.md[^()]*\)/giu, "")
    .replace(/[^.;\n]*CLAUDE\.md[^.\n]*\.?/giu, "")
    .replace(/\s{2,}/gu, " ")
    .replace(/\bmirror['’]?[ıiuü](?!\p{L})/giu, "yansısı")
    .replace(/\bmirror\b/giu, "yansı")
    .replace(/https?:\/\/(?:www\.)?([^\s/)]+)[^\s)]*/giu, "$1")
    .trim();
}
