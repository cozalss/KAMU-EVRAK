/* sicilDefter — sicil listelerinin (Gelen · İşlenen · Giden · Denetim) saf yardımcıları.
   · gunBasligi / gunleGrupla: zimmet defteri gün ayracı (takvim günü; saat farkı değil).
   · bosDurumMetni: arama/filtre boş sonucunun memur dilinde açıklaması.
   · sicilDokumCsv: seçili kayıtların CSV dökümü (Türkçe Excel: ";" ayraç, UTF-8 BOM,
     formül enjeksiyonu koruması). */

const GUN_MS = 86_400_000;
const GUN_ADI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const iki = (n) => String(n).padStart(2, "0");

const gunBasi = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** @param {number} ts @param {number} [simdi] @returns {{anahtar:string, etiket:string, tarih:string}} */
export function gunBasligi(ts, simdi = Date.now()) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(Number(ts)) || Number.isNaN(d.getTime())) return { anahtar: "tarihsiz", etiket: "Tarihsiz", tarih: "" };
  const fark = Math.round((gunBasi(new Date(simdi)) - gunBasi(d)) / GUN_MS);
  const tarih = `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
  const etiket = fark === 0 ? "Bugün" : fark === 1 ? "Dün" : GUN_ADI[d.getDay()];
  return { anahtar: `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`, etiket, tarih };
}

/** Sıralı listeyi bitişik gün gruplarına böler (sıra korunur). */
export function gunleGrupla(rows, tsOf, simdi = Date.now()) {
  const out = [];
  for (const row of rows || []) {
    const g = gunBasligi(tsOf(row), simdi);
    const son = out[out.length - 1];
    if (son && son.anahtar === g.anahtar) son.rows.push(row);
    else out.push({ ...g, rows: [row] });
  }
  return out;
}

/** Boş sonuç metni — arama varsa aranan ifadeyi geri söyler; yoksa filtreyi işaret eder. */
export function bosDurumMetni({ ara = "", filtreVar = false, nesne = "kayıt", kalici = "kayıtlar silinmez" } = {}) {
  const q = String(ara || "").trim();
  if (q) {
    const kisa = q.length > 40 ? `${q.slice(0, 39)}…` : q;
    return {
      baslik: `“${kisa}” için ${nesne} bulunamadı`,
      sub: filtreVar ? `Yazımı kontrol edin ya da diğer ölçütleri kaldırın; ${kalici}.` : `Yazımı kontrol edin ya da daha kısa bir ifade deneyin; ${kalici}.`,
    };
  }
  return { baslik: `Bu ölçütlerle ${nesne} yok`, sub: `Filtre ölçütlerinizi gevşetin; ${kalici}.` };
}

/* CSV hücresi: ";" / tırnak / satır sonu içeriyorsa tırnaklanır; =,+,-,@ ile başlayan değer
   tablolama programında formül olarak çalışmasın diye tek tırnakla etkisizleştirilir. */
export function csvHucre(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {object[]} rows @param {{baslik:string, deger:(r:object)=>unknown}[]} sutunlar */
export function sicilDokumCsv(rows, sutunlar) {
  const bas = sutunlar.map((c) => csvHucre(c.baslik)).join(";");
  const govde = (rows || []).map((r) => sutunlar.map((c) => csvHucre(c.deger(r))).join(";"));
  return `\uFEFF${[bas, ...govde].join("\r\n")}\r\n`;
}
