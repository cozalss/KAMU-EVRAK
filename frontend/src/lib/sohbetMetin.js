/* sohbetMetin — asistan cevabını insan diline çeviren saf yardımcılar (tur 4, jüri B#17).

   Sorun: LLM/kural tabanlı cevaplar ham anahtar sızdırıyordu — "*bilgi_edinme* türündeki
   evrak", "dilekce", "tarih_yok"; tek yıldızlı italik çıplak "*" olarak görünüyor, ekran
   okuyucu "yıldız" okuyordu. Kayıt kartları üç kez aynı dosya adını ("ornek-bilgi_edinme_park_harcama.txt")
   başlık yapıyordu. Burada: satır-içi biçim ayrıştırma + bilinen kod → etiket + kart adı. */

/* Evrak türü kodları — backend agents/config.py EVRAK_TURU_TR ile aynı sözlük (cümle içi
   küçük harf). Bilinmeyen snake_case kod DOKUNULMADAN kalır: uydurma etiket üretmeyiz. */
export const KOD_ETIKET = {
  dilekce: "dilekçe", basvuru: "başvuru", sikayet: "şikâyet", ihbar: "ihbar", talep: "talep",
  bilgi_edinme: "bilgi edinme başvurusu", cimer: "CİMER başvurusu", ust_yazi: "üst yazı",
  cevabi_yazi: "cevabi yazı", tebligat: "tebligat", dava_evraki: "dava evrakı",
  icra_evraki: "icra evrakı", muzekkere: "müzekkere", fatura: "fatura / ödeme belgesi",
  tutanak: "tutanak", rapor: "rapor", gorus_mutalaa: "görüş / mütalaa",
  genelge_talimat_olur: "genelge / talimat / olur", belirsiz: "belirsiz",
  tarih_yok: "tarih yok", cok_konulu: "çok konulu",
  bilgilendirme_yazisi: "bilgilendirme yazısı", olur_yazisi: "olur yazısı",
  yesil: "YEŞİL", sari: "SARI", kirmizi: "KIRMIZI",
};

/* Yalnız kelime sınırında, küçük harf + alt çizgili ya da sözlükte birebir duran kodlar. */
const KOD_RE = /\b[a-z]+(?:_[a-z]+)+\b|\b(?:dilekce|sikayet|basvuru|muzekkere|cimer)\b/g;

/** Metindeki bilinen kodları etikete çevirir; bilinmeyenleri aynen bırakır. */
export function kodlariCevir(metin) {
  return String(metin ?? "").replace(KOD_RE, (k) => KOD_ETIKET[k] ?? k);
}

/**
 * Satır-içi biçim: **kalın**, *eğik* (ya da _eğik_ DEĞİL — alt çizgi kodlarda kullanılır).
 * Eşleşmeyen yalnız yıldız düz metin kalır. Kod çevirisi düz ve eğik parçalara uygulanır.
 * @returns {{tip: "duz"|"kalin"|"egik", metin: string}[]}
 */
export function satirIciParcala(satir) {
  const parcalar = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*/g;
  const s = String(satir ?? "");
  let son = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > son) parcalar.push({ tip: "duz", metin: kodlariCevir(s.slice(son, m.index)) });
    parcalar.push(m[1] != null ? { tip: "kalin", metin: kodlariCevir(m[1]) } : { tip: "egik", metin: kodlariCevir(m[2]) });
    son = m.index + m[0].length;
  }
  if (son < s.length) parcalar.push({ tip: "duz", metin: kodlariCevir(s.slice(son)) });
  return parcalar;
}

const DOSYA_RE = /\.(txt|pdf|docx?|png|jpe?g|tiff?)$/i;

/** Kayıt kartının görünen adı: dosya adı başlık olmaz; konu/başlık/tür etiketine düşülür. */
export function kayitAdi(k = {}) {
  const adaylar = [k.konu, k.baslik, k.name, k.evrak_no, k.giden_no].filter((x) => x && String(x).trim());
  const anlamli = adaylar.find((x) => !DOSYA_RE.test(String(x).trim()));
  if (anlamli) return kodlariCevir(String(anlamli).trim());
  if (k.evrak_turu) {
    const t = KOD_ETIKET[k.evrak_turu] ?? k.evrak_turu;
    return t.charAt(0).toLocaleUpperCase("tr") + t.slice(1);
  }
  return adaylar[0] ? String(adaylar[0]) : "Kayıt";
}

/** Saat damgası "ss:dd" (mono künye için); geçersizse boş. */
export function notSaati(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ── Atıf ipi (tur 9) ───────────────────────────────────────────────────────────────────
   Cevap metnindeki "3071 sayılı Kanun m.7" / "4982 m.11" atıfları, AYNI cevabın mevzuat
   kaynakları arasında o kanun numarası varsa bağlantıya dönüşür (okuma penceresi ilgili
   maddede açılır). Kaynaklarda olmayan numara düz metin kalır: bağlantı uydurulmaz. */
const ATIF_RE = /(\d{4})(?:\s+sayılı([^.;:\n]{0,60}?))?\s+(?:m\.\s?|md\.\s?|[Mm]adde(?:si|nin|sine)?\s)(\d{1,3})/g;

/**
 * @param {string} metin
 * @param {{dosya?: string, no?: string|number}[]|null} kaynaklar
 * @returns {{tip: "duz"|"atif", metin: string, dosya?: string, maddeNo?: number}[]}
 */
export function atifParcala(metin, kaynaklar) {
  const s = String(metin ?? "");
  const liste = Array.isArray(kaynaklar) ? kaynaklar.filter((k) => k?.dosya && k?.no != null) : [];
  if (!liste.length || !s) return s ? [{ tip: "duz", metin: s }] : [];
  const parcalar = [];
  let son = 0;
  for (const m of s.matchAll(ATIF_RE)) {
    const k = liste.find((x) => String(x.no) === m[1]);
    if (!k) continue;
    if (m.index > son) parcalar.push({ tip: "duz", metin: s.slice(son, m.index) });
    parcalar.push({ tip: "atif", metin: m[0], dosya: k.dosya, maddeNo: Number(m[3]) });
    son = m.index + m[0].length;
  }
  if (son < s.length) parcalar.push({ tip: "duz", metin: s.slice(son) });
  return parcalar;
}

/* ── Masadaki durum soruları (tur 9) ────────────────────────────────────────────────────
   Asistan "X bağlamında" açılıyor ama sık sorular ekrandan bağımsızdı. Ekran bağlamından
   (lib/ekranBaglami — yalnız türetilmiş üst-veri) en çok 3 soru türetilir; veri yoksa soru
   da yok (uydurma sayı basılmaz). */
const sayacOku = (notlar, ad) => {
  const m = String(notlar || "").match(new RegExp(`${ad}\\s+(\\d+)`));
  return m ? Number(m[1]) : 0;
};
const kisalt = (s, n = 38) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function baglamSorulari(ekran) {
  if (!ekran) return [];
  const sorular = [];
  const ad = String(ekran.secili?.ad || "").trim();
  if (ad) sorular.push(`“${kisalt(kayitAdi({ name: ad }))}” evrakını özetle`);
  const taslak = sayacOku(ekran.notlar, "taslak");
  if (taslak > 0) sorular.push(`Karar bekleyen ${taslak} taslağı özetle`);
  const gelen = sayacOku(ekran.notlar, "gelen");
  if (gelen > 0) sorular.push(`Gelen ${gelen} evrakın yasal süreleri ne durumda?`);
  const adet = ekran.liste?.adet;
  if (adet > 0 && sorular.length < 3) sorular.push(`Bu ekrandaki ${adet} kaydı birimlere göre dök`);
  return sorular.slice(0, 3);
}
