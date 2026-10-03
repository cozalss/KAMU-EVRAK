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
