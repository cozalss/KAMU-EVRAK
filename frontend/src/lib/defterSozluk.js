/* defterSozluk — üç evrak defterinin (Gelen · İşlenen · Giden) ortak SÖZLÜĞÜ ve saf kimlik
   yardımcıları. Neden ayrı dosya: aynı kavram üç ekranda üç sözcükle yazılıyordu (satırda
   "Orta", modalda "SARI", Giden filtresinde "Sarı · Orta" — jüri tur 6). Tek sözlük:
   insan dili satırda ("Orta"), mono risk KODU ("SARI") yalnız künye ve CSV dökümünde.

   · riskAdi(bant)          → "Düşük" | "Orta" | "Yüksek" | ""
   · baslikCase(s)          → ilk harf Türkçe büyük ("park …" → "Park …")
   · ortaElips(s, bas, son) → "c8968145…ae2f" (kimlik ortadan kısalır; tam değer title'da)
   · islenenSicilNolari     → işlem kaydı başına "İ-2026/0007" (yıl içi geliş sırası)
   · yinelemeDerkenari      → aynı kaynağın kaçıncı işlenişi ("↻ 2. işlem") */

export const RISK_AD = Object.freeze({ yesil: "Düşük", sari: "Orta", kirmizi: "Yüksek" });

/** @param {string} bant @returns {string} */
export const riskAdi = (bant) => RISK_AD[bant] || "";

/** @param {string} s @returns {string} */
export const baslikCase = (s) => {
  const t = String(s ?? "").trimStart();
  return t ? t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1) : t;
};

/** Uzun kimliği ORTADAN kısaltır — baş ve son görünür kalır, kesik değer tam değer gibi
    okunmaz (üç noktasız 22 karakter kesimi kopyalanınca yanlış kimlik veriyordu).
    @param {string} s @param {number} [bas] @param {number} [son] @returns {string} */
export function ortaElips(s, bas = 8, son = 4) {
  const t = String(s ?? "");
  if (t.length <= bas + son + 1) return t;
  return `${t.slice(0, bas)}…${t.slice(-son)}`;
}

const yilOf = (ts) => {
  const d = new Date(Number(ts));
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
};

/** İşlenen sicil numarası — kayıtlar yıl içinde GELİŞ (ts) sırasıyla numaralanır:
    "İ-<yıl>/<sıra 4 hane>". Numara kayıt kimliğine (id) bağlanır, liste sırasına değil:
    filtre/sıralama değişse de aynı kayıt aynı numarayı taşır. Eşit zamanda id sırası
    belirleyicidir (kararlı). Tarihsiz kayıt "İ-—" alır.
    @param {{id:string, ts:number}[]} items @returns {Map<string,string>} */
export function islenenSicilNolari(items) {
  const sirali = [...(items || [])].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0) || String(a.id).localeCompare(String(b.id)));
  const sayac = new Map();
  const out = new Map();
  for (const it of sirali) {
    const yil = yilOf(it.ts);
    if (yil == null) { out.set(it.id, "İ-—"); continue; }
    const n = (sayac.get(yil) || 0) + 1;
    sayac.set(yil, n);
    out.set(it.id, `İ-${yil}/${String(n).padStart(4, "0")}`);
  }
  return out;
}

/** Yineleme derkenarı — aynı kaynaktan (anahtar) birden çok işlem varsa her kayda
    kaçıncı işleniş olduğunu verir (geliş sırasıyla, 1'den). Tekil kaynak haritada YOK.
    @param {{id:string, ts:number}[]} items @param {(it:object)=>string} anahtarOf
    @returns {Map<string,{sira:number, toplam:number}>} */
export function yinelemeDerkenari(items, anahtarOf) {
  const gruplar = new Map();
  for (const it of items || []) {
    const k = anahtarOf(it);
    if (!k) continue;
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k).push(it);
  }
  const out = new Map();
  for (const grup of gruplar.values()) {
    if (grup.length < 2) continue;
    const sirali = [...grup].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0) || String(a.id).localeCompare(String(b.id)));
    sirali.forEach((it, i) => out.set(it.id, { sira: i + 1, toplam: sirali.length }));
  }
  return out;
}

const iki = (n) => String(n).padStart(2, "0");
/** Defterin tarih dili — noktalı gg.aa ve ss:dd (ICU tr-TR kısa tarih "01/10" eğik çizgi verir).
    @param {number} ts @returns {{gun:string, saat:string, tam:string}} */
export function defterZamani(ts) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(Number(ts)) || Number.isNaN(d.getTime())) return { gun: "", saat: "", tam: "" };
  const gun = `${iki(d.getDate())}.${iki(d.getMonth() + 1)}`;
  const saat = `${iki(d.getHours())}:${iki(d.getMinutes())}`;
  return { gun, saat, tam: `${gun}.${d.getFullYear()} ${saat}` };
}
