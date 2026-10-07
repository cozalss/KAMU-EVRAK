/* KabukSicil — cilt sırtındaki "Günlük sicil" bloğu (tur 6, A-kabuk; jüri fırsatı #1).
   1080p'de "Yeni evrak yükle" ile Asistan arasında ~500 px ölü lacivert kalıyordu. Ray dekor
   olmaktan çıkar, masanın defteri olur: mono sicil satırları + dikiş çizgisiyle ayrılmış,
   kör baskı "GÜNLÜK" etiketi. Sayılar YALNIZ kabuğun zaten bildiği olgulardan türetilir
   (lib/kabukSicil) — yeni istek yok, tahmin yok:
     bugün işlenen (history.ts) · bugün giden (outbox.gonderim_tarihi, durum=gonderildi) ·
     karar bekleyen taslak · kuyrukta gecikmiş (SLA durum=GECIKMIS).
   Tur 8 (jüri):
     · Üç hâl ayrı çizilir: sayı · BEKLİYOR (ilk yükleme — sakin "··" nabzı) · YOK ("—", sunucu
       yanıtsız). Önceden ikisi de "—" idi; soğuk açılışta sicil "bilinmiyor" okunuyordu.
     · Son kayıtlar iki satır (konu + mono sicil no · saat) ve İşlenen defterine götürür; liste
       boşsa başlık tek başına kalmaz → "Henüz kayıt yok".
     · Satırlar yalnız İLK çizimde düşer: veri tazelenince (önbellek → DB) yeniden doğup 2,5 sn
       boyunca opaklık 0'da kalıyordu (çekimlerde "başlık var, altı boş").
     · Sayı gelince "··" → değer @number-flow ile döner (brif #13/#15); reduced-motion'da
       NumberFlow kendi kapısıyla anında yazar.
     · Sicil ile Asistan arasında kalan cilt, kör baskı ile biter (CiltKorBaski) — dolgu değil,
       cildin kendi malzemesi; yer yoksa kendiliğinden çöker.
   Kısa ekranda (yükseklik < 820) gizlenir — gezinme ve hesap kartı önceliklidir. */
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { PAL, TYPE, TNUM, SP, MONO, DISPLAY, SR_ONLY, RAD, EASE, focusRing } from "./neonUi.jsx";
import { cleanDemoText } from "../lib/evrakEtiket.js";
import { baslikCase, defterZamani } from "../lib/defterSozluk.js";
import { sicilBaslikDurumu } from "../lib/kabukSicil.js";

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
const SICIL_CSS = ".ke-ray-sicil{display:block}.ke-ray-son{display:none}@media (max-height:819px){.ke-ray-sicil{display:none}}@media (min-height:960px){.ke-ray-son{display:block}}.ke-ray-son li{display:block}.ke-ray-son li:nth-child(n+3){display:none}@media (min-height:1040px){.ke-ray-son li:nth-child(n+3){display:block}}.ke-ray-son li:nth-child(n+5){display:none}@media (min-height:1120px){.ke-ray-son li:nth-child(n+5){display:block}}"
  + ".ke-son-btn:hover{background:var(--ke-hov)}.ke-son-btn:hover .ke-son-ok{opacity:1;transform:none}";

/* Bekliyor işareti — iki nokta, 1,2 sn'lik sakin opaklık nabzı (nu-think; reduced-motion global kuralı söndürür). */
const Bekliyor = () => (
  <><span aria-hidden="true" style={{ animation: "nu-think 1.2s ease-in-out infinite", letterSpacing: ".08em" }}>··</span><span style={SR_ONLY}>yükleniyor</span></>
);

/* Satır: n sayı → 00 biçim · bekliyor → nabız · n null → "—" (kaynak yanıt vermedi, sayı BİLİNMİYOR). */
function SicilSatir({ s, n, bekliyor, i, ilk }) {
  const bilinmiyor = n == null;
  const vurgu = s.acil && n > 0;
  const renk = vurgu ? "var(--ke-derin-kirmizi)" : bilinmiyor ? PAL.mut3 : PAL.ink;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, padding: "5px 0", borderTop: i ? `1px solid ${PAL.line}` : "none", animation: ilk ? `nu-rise .3s var(--ke-ease-out) ${120 + i * 60}ms both` : "none", "--nu-rise-y": "4px" }}>
      <dt style={{ ...ETIKET, color: vurgu ? "var(--ke-derin-kirmizi)" : PAL.mut, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.l}</dt>
      <span aria-hidden="true" style={{ flex: "0 1 24px", borderBottom: `1px dotted ${PAL.line}`, transform: "translateY(-3px)" }} />
      <dd style={{ margin: 0, minWidth: 20, textAlign: "right", fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: renk, ...TNUM }}>
        {bilinmiyor && bekliyor ? <Bekliyor />
          : bilinmiyor ? <><span aria-hidden="true">—</span><span style={SR_ONLY}>bilinmiyor</span></>
            : <NumberFlow value={n} format={{ minimumIntegerDigits: 2 }} spinTiming={{ duration: 280, easing: "cubic-bezier(.23,1,.32,1)" }} />}
      </dd>
    </div>
  );
}

/* Son kayıtlar — yalnız uzun ekranda: ≥ 960 px iki kayıt, ≥ 1040 px dört kayıt. İki satır:
   konu (tek satır, title'da tamamı) + mono sicil no · saat. Tıklanınca İşlenen defteri açılır. */
function SonKayitlar({ son, bekliyor, onAc, ilk }) {
  if (bekliyor && !son?.length) return null;
  return (
    <div className="ke-ray-son" style={{ marginTop: SP.m }}>
      <div aria-hidden="true" style={{ ...ETIKET, color: PAL.mut3, padding: `${SP.s}px 0 ${SP.xs}px`, borderTop: `1px dashed ${PAL.lineHi}` }}>Son kayıtlar</div>
      {!son?.length ? (
        <p style={{ ...ETIKET, margin: 0, padding: "5px 0", color: PAL.mut3 }}>Henüz kayıt yok</p>
      ) : (
        <ol aria-label="Son işlenen evraklar" style={{ listStyle: "none", margin: "0 -6px", padding: 0, display: "grid" }}>
          {son.map((k, i) => {
            const ad = baslikCase(cleanDemoText(k.ad));
            const z = defterZamani(k.ts);
            return (
              <li key={i} style={{ animation: ilk ? `nu-rise .3s var(--ke-ease-out) ${360 + i * 60}ms both` : "none", "--nu-rise-y": "4px" }}>
                <button type="button" className="ke-son-btn" onClick={onAc} title={ad} aria-label={`${ad} — ${k.no}, ${z.saat}. İşlenen evrakta aç`} {...focusRing} data-press=""
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 12px", columnGap: SP.xs, width: "100%", padding: "5px 6px", border: "none", borderRadius: RAD.ctl, background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit", transition: `background .14s ${EASE.out}` }}>
                  <span style={{ ...TYPE.meta, color: PAL.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</span>
                  <span aria-hidden="true" className="ke-son-ok" style={{ gridRow: "1 / span 2", gridColumn: 2, alignSelf: "center", ...TYPE.meta, color: PAL.mut2, opacity: 0, transform: "translateX(-3px)", transition: `opacity .14s ${EASE.out}, transform .14s ${EASE.out}` }}>→</span>
                  <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>{k.no || "İ-—"} · {z.saat}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function KabukSicil({ sicil, bekliyor = {}, bayat = false, onSonAc }) {
  // İlk çizim penceresi: düşüş hareketi yalnız bileşen ilk doğduğunda (veri tazelenmesinde değil).
  // Kademeli düşüş ~0,9 sn'de biter; sonrası "none" — son kare ile bit-aynı, görünür sıçrama yok.
  const [ilk, setIlk] = useState(true);
  useEffect(() => { const t = setTimeout(() => setIlk(false), 1200); return () => clearTimeout(t); }, []);
  if (!sicil) return null;
  const durum = sicilBaslikDurumu(sicil, bekliyor, bayat, gunAy());
  return (
    <section className="ke-ray-sicil" aria-label="Günlük sicil özeti" style={{ marginTop: SP.xl, padding: `${SP.m}px ${SP.m}px ${SP.s}px`, position: "relative" }}>
      <style>{SICIL_CSS}</style>
      {/* Dikiş — cilt kapağındaki iplik çizgisi: kesikli, yarı saydam (ray kenar dikişiyle aynı dil). */}
      <span aria-hidden="true" style={{ position: "absolute", left: SP.m, right: SP.m, top: 0, borderTop: `1px dashed ${PAL.lineHi}` }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `${SP.s}px 0 ${SP.s}px` }}>
        {/* Kör baskı etiket: cilde basılmış ama mürekkepsiz — yalnız ton farkı. */}
        <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: 11, lineHeight: "16px", letterSpacing: ".16em", textTransform: "uppercase", color: PAL.mut3 }}>Günlük</span>
        <span style={{ ...ETIKET, color: durum.uyari ? "var(--ke-derin-sari)" : PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>{durum.metin}</span>
      </div>
      <dl style={{ margin: 0, display: "grid", position: "relative" }}>
        {SATIRLAR.map((s, i) => <SicilSatir key={s.k} s={s} n={sicil[s.k] ?? null} bekliyor={!!bekliyor[s.k]} i={i} ilk={ilk} />)}
      </dl>
      <SonKayitlar son={sicil.son} bekliyor={!!bekliyor.bugunIslenen} onAc={onSonAc} ilk={ilk} />
    </section>
  );
}

/* Cilt kör baskısı — sicil ile Asistan arasında kalan lacivert bez, cildin sırt baskısıyla biter:
   mürekkepsiz, yalnız ışık/gölge (temaCss --ke-kor-*). Bilgi taşımaz (aria-hidden). flex:1 +
   min-height 0 + overflow hidden: yer yoksa tamamen çöker; kısa ekranda hiçbir öğeyi itmez. */
export function CiltKorBaski() {
  return (
    <div aria-hidden="true" className="ke-kor-baski" style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: `${SP.xl}px 0 ${SP.l}px`, containerType: "size" }}>
      {/* Kabın kendisi ölçülür (tur 8): Denetim sırtı açılınca kalan yer baskıdan kısa kalıyor, baskı
          yarısı kesik "artık" gibi okunuyordu. Sığmıyorsa HİÇ basılmaz — yarım baskı yok. */}
      <style>{"@media (max-height:899px){.ke-kor-baski{visibility:hidden}}@container (max-height:46px){.ke-kor-ic{visibility:hidden}}"}</style>
      <div className="ke-kor-ic" style={{ display: "grid", justifyItems: "center", gap: SP.xs, color: "var(--ke-kor-zemin)", textShadow: "0 1px 0 var(--ke-kor-isik), 0 -1px 0 var(--ke-kor-golge)" }}>
        <span style={{ width: 56, borderTop: "1px solid var(--ke-kor-golge)", boxShadow: "0 1px 0 var(--ke-kor-isik)", marginBottom: SP.s }} />
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: 12, lineHeight: "16px", letterSpacing: ".22em", whiteSpace: "nowrap" }}>KAMU-EVRAK</span>
        <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "14px", letterSpacing: ".14em", whiteSpace: "nowrap", ...TNUM }}>SİCİL DEFTERİ · {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}
