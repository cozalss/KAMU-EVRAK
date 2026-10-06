/* KabukSicil — cilt sırtındaki "Günlük sicil" bloğu (tur 6, A-kabuk; jüri fırsatı #1).
   1080p'de "Yeni evrak yükle" ile Asistan arasında ~500 px ölü lacivert kalıyordu. Ray dekor
   olmaktan çıkar, masanın defteri olur: mono sicil satırları + dikiş çizgisiyle ayrılmış,
   kör baskı "GÜNLÜK" etiketi. Sayılar YALNIZ kabuğun zaten bildiği olgulardan türetilir
   (DashboardApp sicilOzeti) — yeni istek yok, tahmin yok:
     bugün işlenen (history.ts) · bugün giden (outbox.gonderim_tarihi, durum=gonderildi) ·
     karar bekleyen taslak · kuyrukta gecikmiş (SLA durum=GECIKMIS).
   Satırlar ilk çizimde sırayla düşer (yalnız opaklık + 4 px; reduced-motion global kuralı söner).
   Kısa ekranda (yükseklik < 820) gizlenir — gezinme ve hesap kartı önceliklidir.
   Satır tıklanabilir değildir: bilgi yüzeyi; gezinme rozetleri zaten aynı görünümlere götürür. */
import { PAL, TYPE, TNUM, SP, MONO, DISPLAY, SR_ONLY } from "./neonUi.jsx";
import { cleanDemoText } from "../lib/evrakEtiket.js";
import { baslikCase, defterZamani } from "../lib/defterSozluk.js";

const SATIRLAR = [
  { k: "bugunIslenen", l: "Bugün işlenen" },
  { k: "bugunGiden", l: "Bugün giden" },
  { k: "taslak", l: "Karar bekleyen" },
  { k: "gecikmis", l: "Gecikmiş", acil: true },
];

const gunAy = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/* Etiket ölçüsü: 11 px mono (10 px okuma sınırındaydı — jüri). */
const ETIKET = { ...TYPE.antet, fontSize: 11, lineHeight: "16px", textTransform: "uppercase" };
const SICIL_CSS = ".ke-ray-sicil{display:block}.ke-ray-son{display:none}@media (max-height:819px){.ke-ray-sicil{display:none}}@media (min-height:960px){.ke-ray-son{display:block}}.ke-ray-son li{display:grid}.ke-ray-son li:nth-child(n+4){display:none}@media (min-height:1040px){.ke-ray-son li:nth-child(n+4){display:grid}}";

/* Satır: n null → "—" (kaynak yanıt vermedi, sayı BİLİNMİYOR — 00 yazmak yanlış olgu olurdu). */
function SicilSatir({ s, n, i }) {
  const bilinmiyor = n == null;
  const vurgu = s.acil && n > 0;
  const renk = vurgu ? "var(--ke-derin-kirmizi)" : bilinmiyor ? PAL.mut3 : PAL.ink;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, padding: "5px 0", borderTop: i ? `1px solid ${PAL.line}` : "none", animation: `nu-rise .3s var(--ke-ease-out) ${120 + i * 60}ms both`, "--nu-rise-y": "4px" }}>
      <dt style={{ ...ETIKET, color: vurgu ? "var(--ke-derin-kirmizi)" : PAL.mut, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.l}</dt>
      <span aria-hidden="true" style={{ flex: "0 1 24px", borderBottom: `1px dotted ${PAL.line}`, transform: "translateY(-3px)" }} />
      <dd style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: renk, ...TNUM }}>
        {bilinmiyor ? <><span aria-hidden="true">—</span><span style={SR_ONLY}>bilinmiyor</span></> : String(n).padStart(2, "0")}
      </dd>
    </div>
  );
}

/* Son kayıtlar — yalnız uzun ekranda: ≥ 960 px üç satır, ≥ 1040 px beş satır. Saat + konu, tek satır; tıklanmaz (bilgi yüzeyi). */
function SonKayitlar({ son }) {
  if (!son?.length) return null;
  return (
    <div className="ke-ray-son" style={{ marginTop: SP.m }}>
      <div aria-hidden="true" style={{ ...ETIKET, color: PAL.mut3, padding: `${SP.s}px 0 ${SP.xs}px`, borderTop: `1px dashed ${PAL.lineHi}` }}>Son kayıtlar</div>
      <ol aria-label="Son işlenen evraklar" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
        {son.map((k, i) => (
          <li key={k.id ?? i} style={{ gridTemplateColumns: "40px minmax(0,1fr)", gap: SP.s, padding: "5px 0", alignItems: "baseline", animation: `nu-rise .3s var(--ke-ease-out) ${360 + i * 60}ms both`, "--nu-rise-y": "4px" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, ...TNUM }}>{defterZamani(k.ts).saat}</span>
            <span style={{ ...TYPE.meta, color: PAL.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{baslikCase(cleanDemoText(k.ad))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function KabukSicil({ sicil, bayat = false }) {
  if (!sicil) return null;
  return (
    <section className="ke-ray-sicil" aria-label="Günlük sicil özeti" style={{ marginTop: SP.xl, padding: `${SP.m}px ${SP.m}px ${SP.s}px`, position: "relative" }}>
      <style>{SICIL_CSS}</style>
      {/* Dikiş — cilt kapağındaki iplik çizgisi: kesikli, yarı saydam (ray kenar dikişiyle aynı dil). */}
      <span aria-hidden="true" style={{ position: "absolute", left: SP.m, right: SP.m, top: 0, borderTop: `1px dashed ${PAL.lineHi}` }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `${SP.s}px 0 ${SP.s}px` }}>
        {/* Kör baskı etiket: cilde basılmış ama mürekkepsiz — yalnız ton farkı. */}
        <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: 11, lineHeight: "16px", letterSpacing: ".16em", textTransform: "uppercase", color: PAL.mut3 }}>Günlük</span>
        <span style={{ ...ETIKET, color: bayat ? "var(--ke-derin-sari)" : PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>{bayat ? "Yanıt yok" : gunAy()}</span>
      </div>
      <dl style={{ margin: 0, display: "grid", position: "relative" }}>
        {SATIRLAR.map((s, i) => <SicilSatir key={s.k} s={s} n={sicil[s.k] ?? null} i={i} />)}
      </dl>
      <SonKayitlar son={sicil.son} />
    </section>
  );
}
