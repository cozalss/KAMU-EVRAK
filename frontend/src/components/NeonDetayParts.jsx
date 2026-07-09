/* NeonDetayParts — NeonDetay'ın yaprak bileşenleri (Hero Light v2 "Sakin Ürün").
   Ayrı dosya: NeonDetay <800 satır kalsın; parçalar tek başına test edilebilir.
   Desen kaynağı: Langfuse/Braintrust (skor barı + eşik), Stripe (mono kimlik + kopyala),
   Vercel checks (kalite kapısı satırı), Phoenix (atıf satırı + kaynak alt-satırı). */
import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { cleanDemoText } from "./result-cards.jsx";
import { MONO, T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, Icon, KV } from "./neonUi.jsx";
import { slaKonum } from "../lib/detayYorum.js";

/* Semantik durum çipi — satır başına en fazla 1 (MASTER: çip enflasyonu yasak). */
export const Chip = ({ c = T, title, label, children }) => (
  <span title={title} aria-label={label} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(c), background: ALFA(c), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{children}</span>
);

/* Özet şeridi tek olgu (kutusuz ikon + etiket + değer). */
export const Fact = ({ k, v, c = PAL.ink2, icon }) => (
  <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
    {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(c) }}>{icon}</span>}
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, marginBottom: 2 }}>{k}</span>
      <span style={{ display: "block", ...TYPE.ui, fontWeight: 500, color: DERIN_OF(c), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220, ...TNUM }}>{v}</span>
    </span>
  </span>
);

/* Görev bölüm etiketi — 12/500 sentence case + düz hairline ayraç. */
export const GorevLabel = ({ n, t, color, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: SP.m, margin: "0 0 12px" }}>
    <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(color), flex: "none" }}>Görev {n} — {t}</span>
    <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
    {count && <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>{count}</span>}
  </div>
);

/* yasal süre durumu → renk + etiket (çizelge konumu slaKonum'dan GERÇEK tarihlerle gelir). */
export function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("GEC")) return { label: `Gecikmiş${gun}`, color: BANT.kirmizi.c };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `Kritik${gun}`, color: BANT.sari.c };
  if (d.includes("NORMAL")) return { label: `Normal${gun}`, color: BANT.yesil.c };
  return { label: sla.durum, color: PAL.mut };
}

/* Alt-talep SLA durumu → bant rengi (decompose çıktısındaki sla_durum alanı). */
export function subSlaRenk(durum) {
  const d = String(durum || "").toLocaleUpperCase("tr-TR");
  if (d.includes("GEC")) return BANT.kirmizi.c;
  if (d.includes("KRİT") || d.includes("KRIT")) return BANT.sari.c;
  if (d.includes("NORMAL")) return BANT.yesil.c;
  return null;
}

/* Güven seviyesi → AA metin rengi (renk tek sinyal değil, metin de var). */
const GUVEN_RENK = { yüksek: DERIN.T, orta: DERIN.sari, düşük: DERIN.kirmizi };

/* Mevzuat öneri satırı — skor barı (eşik çentikli) + NLI anlamsal destek + güven + dayanak +
   yürürlük + "insan incelemesi". Satır listesi; kart-içinde-kart yok (hairline ayraç üstte). */
export function MevzuatRow({ rank, m, nli, ilk }) {
  const pct = Math.round((Number(m.score) || 0) * 100);
  const low = pct > 0 && pct < 60;
  const fill = low ? DERIN.sari : DERIN.T;
  const guven = m.guven || "";
  const gc = GUVEN_RENK[guven] || PAL.mut2;
  const title = cleanDemoText(m.baslik);
  const snippet = m.snippet ? cleanDemoText(m.snippet) : null;
  const dayanak = m.dayanak ? cleanDemoText(m.dayanak) : "";
  const nliPct = nli && Number.isFinite(Number(nli.skor)) ? Math.round(Number(nli.skor) * 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.s, padding: "10px 0 12px", borderTop: ilk ? "none" : `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{rank}.</span>
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{title}</span>
        {guven && (
          <span aria-label={`Güven seviyesi: ${guven}`} style={{ ...TYPE.meta, fontWeight: 500, color: gc, background: ALFA(GUVEN_RENK[guven] || PAL.mut2), borderRadius: RAD.chip, padding: "2px 8px" }}>{guven} güven</span>
        )}
        {m.atif_genisletme && (
          <span title="Bu öneri, üstteki maddenin atıf verdiği mevzuattan otomatik genişletmeyle geldi (GraphRAG-lite)" aria-label="Atıf grafiği genişletmesiyle gelen öneri" style={{ ...TYPE.meta, color: PAL.mut }}>atıf grafiğinden</span>
        )}
        {pct > 0 && <span style={{ marginLeft: "auto", ...TYPE.data, fontWeight: 500, color: fill, minWidth: 42, textAlign: "right", ...TNUM }}>%{pct}</span>}
      </div>
      {pct > 0 && (
        <div style={{ position: "relative", height: 4, background: PAL.press }} role="img" aria-label={`İlgililik skoru yüzde ${pct}${low ? " — eşiğin altında" : ""}`}>
          <div style={{ height: "100%", width: `${pct}%`, background: fill }} />
          <div aria-hidden="true" title="%60 ilgililik eşiği" style={{ position: "absolute", top: -2, bottom: -2, left: "60%", width: 1, background: PAL.lineHi }} />
        </div>
      )}
      {snippet && <div style={{ ...TYPE.data, color: PAL.mut2 }}>{snippet}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {nliPct != null && (
          <div style={{ ...TYPE.meta, color: nli.entailment ? DERIN.T : DERIN.sari, ...TNUM }}>
            Anlamsal destek (NLI): %{nliPct} — {nli.entailment ? "madde talebi destekliyor" : "destek zayıf, insan doğrulaması önerilir"}
          </div>
        )}
        {dayanak && <div style={{ ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Dayanak:</span> {dayanak}</div>}
        {m.yururluk && <div style={{ ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Yürürlük:</span> {m.yururluk}</div>}
        {m.inceleme_oner && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: DERIN.sari, marginTop: 1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            İnsan incelemesi önerilir{m.nli_etiket && m.nli_etiket.startsWith("[DOĞRULA") ? " · anlamsal destek zayıf" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

/* Yasal süre paneli — durum çipi + GERÇEK tarihlerden hesaplanan zaman çizelgesi (dolgu =
   geçen süre, işaret = bugün, uçlar = başvuru/son tarih) + somut tarihler + yasal dayanak.
   Tarih = makine verisi (mono); "son tarih" jüri için en somut kanıt. Konum slaKonum'dan —
   sabit yüzde yok; tarih hesaplanamazsa çizelge hiç çizilmez (yanlış görsel iddia olmaz). */
export function SlaPanel({ sla, info }) {
  if (!info) return <KV k="Yasal süre durumu" v="tanımsız" c={PAL.mut2} />;
  const dc = DERIN_OF(info.color);
  const konum = slaKonum(sla);
  const kalanEtiket = konum
    ? (konum.kalan >= 0 ? `bugün · ${konum.kalan} gün kaldı` : `bugün · ${-konum.kalan} gün gecikti`)
    : null;
  // Uçlardaki "bugün" etiketi kart dışına taşmasın — yalnız ETİKET kelepçelenir, nokta gerçek konumda.
  const etiketSol = konum ? Math.min(86, Math.max(14, konum.oran * 100)) : 0;
  return (
    <div style={{ margin: "8px 0 4px", paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Yasal süre durumu</span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: dc, background: ALFA(info.color), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{info.label}</span>
      </div>
      {konum && (
        <div role="img" aria-label={`Yasal süre çizelgesi: başvuru ${sla.baslangic}, cevap son tarihi ${sla.son_tarih}; ${konum.toplam} günlük sürenin ${konum.gecen} günü geçti, ${konum.kalan >= 0 ? `${konum.kalan} gün kaldı` : `${-konum.kalan} gün gecikti`}.`}>
          <div aria-hidden="true" style={{ position: "relative", height: 16, marginBottom: 2 }}>
            <span style={{ position: "absolute", left: `${etiketSol}%`, transform: "translateX(-50%)", ...TYPE.meta, fontWeight: 500, color: dc, whiteSpace: "nowrap", ...TNUM }}>{kalanEtiket}</span>
          </div>
          <div aria-hidden="true" style={{ position: "relative", height: 6, background: PAL.press, borderRadius: RAD.chip }}>
            <span style={{ position: "absolute", inset: 0, width: `${konum.oran * 100}%`, background: info.color, borderRadius: RAD.chip }} />
            <span style={{ position: "absolute", top: -3, left: `${konum.oran * 100}%`, width: 12, height: 12, borderRadius: "50%", background: info.color, border: `2px solid ${PAL.surf}`, transform: "translateX(-50%)", boxShadow: SH.card }} />
          </div>
          <div aria-hidden="true" style={{ marginTop: SP.xs, display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3 }}>
            <span>başvuru <span style={{ fontFamily: MONO, ...TNUM }}>{sla.baslangic}</span></span>
            <span>son tarih <span style={{ fontFamily: MONO, ...TNUM, color: dc }}>{sla.son_tarih}</span></span>
          </div>
        </div>
      )}
      <div style={{ marginTop: SP.m, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: `${SP.s}px ${SP.l}px` }}>
        {sla?.baslangic && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Başlangıç</span><span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.ink2, ...TNUM }}>{sla.baslangic}</span></span>}
        {sla?.sure && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Yasal süre</span><span style={{ ...TYPE.data, color: PAL.ink2, ...TNUM }}>{sla.sure}</span></span>}
        {sla?.son_tarih && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Cevap son tarihi</span><span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", fontWeight: 500, color: dc, ...TNUM }}>{sla.son_tarih}</span></span>}
      </div>
      {sla?.mevzuat && sla.mevzuat !== "—" && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Dayanak:</span> {cleanDemoText(String(sla.mevzuat))}</div>}
    </div>
  );
}

/* Kopyalanabilir mono kimlik çipi (Stripe kimlik deseni) — tık → panoya tam değer,
   1.4sn "kopyalandı" durumu. Renk tek sinyal değil: metin de değişir. */
export function CopyChip({ deger, kisa, label }) {
  const [ok, setOk] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const kopyala = () => {
    navigator.clipboard?.writeText(String(deger)).catch(() => {});
    setOk(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOk(false), 1400);
  };
  return (
    <button type="button" onClick={kopyala} aria-label={label || "Değeri panoya kopyala"} title={ok ? "Kopyalandı" : "Panoya kopyala"} {...focusRing}
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf2; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: ok ? DERIN.yesil : PAL.mut2, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "2px 8px", transition: "background .12s ease-out", ...TNUM }}>
      {ok ? <Icon.check width={11} height={11} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
      {ok ? "kopyalandı" : kisa}
    </button>
  );
}

/* Denetim izi zinciri — BAĞLI BLOKLAR: her halka bir mini blok (adım + kopyalanabilir hash),
   halkalar bağ okuyla zincirlenir, uçta bütünlük kilidi. "Her halka öncekini mühürler"
   blok-zincir diliyle görünür kanıta dönüşür. Uzun zincir kendi rayında yatay kayar. */
export function ZincirStepper({ zincir, kokHash, butunluk }) {
  // Backend `denetim_izi` düz dict (Pydantic iç doğrulaması yok) → bozuk halka render'ı düşürmesin.
  const halkalar = (zincir || []).filter((h) => h && typeof h === "object");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto", paddingBottom: SP.s }}>
        {halkalar.map((h, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ minWidth: 118, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "8px 10px" }}>
              <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.ink2, marginBottom: 4, maxWidth: 132, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cleanDemoText(String(h.adim || `adım ${i + 1}`)).replace(/_/g, " ")}
              </div>
              {h.hash
                ? <CopyChip deger={h.hash} kisa={`${String(h.hash).slice(0, 8)}…`} label={`${h.adim || "adım"} hash değerini kopyala`} />
                : <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3 }}>—</span>}
            </div>
            <span aria-hidden="true" style={{ display: "flex", padding: "0 4px", color: PAL.mut3 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </div>
        ))}
        {/* Zincir ucu — bütünlük kilidi */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: SP.s, background: ALFA(butunluk ? BANT.yesil.c : BANT.kirmizi.c), border: `1px solid ${butunluk ? BANT.yesil.c : BANT.kirmizi.c}`, borderRadius: RAD.card, padding: "8px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={butunluk ? DERIN.yesil : DERIN.kirmizi} strokeWidth="1.7" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={butunluk ? DERIN.yesil : DERIN.kirmizi} strokeWidth="1.7" /></svg>
          <span style={{ ...TYPE.meta, fontWeight: 600, color: butunluk ? DERIN.yesil : DERIN.kirmizi, whiteSpace: "nowrap" }}>
            {butunluk ? "Bütünlük doğrulandı" : "Doğrulanamadı"}
          </span>
        </div>
      </div>
      {kokHash && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kök hash</span>
          <CopyChip deger={kokHash} kisa={`${String(kokHash).slice(0, 16)}…`} label="Kök hash değerini panoya kopyala" />
          <span style={{ ...TYPE.meta, color: PAL.mut3 }}>— her halka bir önceki halkanın hash'ini mühürler; tek karakter değişse zincir kopar.</span>
        </div>
      )}
    </div>
  );
}

/* ——— Kanıt alıntısı ———
   Bilgi unsuru satırının üzerine gelince (veya klavye odağında) kaynak belgedeki kanıt
   pasajı vurgulu mini popover'da açılır — "çıkarım uydurma değil, işte yeri" kanıtı. */
export function KanitAlinti({ span, metin, children }) {
  const [acik, setAcik] = useState(false);
  if (!span || !metin) return children;
  const bas = Math.max(0, (span.start | 0) - 90);
  const son = Math.min(metin.length, (span.end | 0) + 90);
  return (
    <span style={{ position: "relative", display: "block" }} tabIndex={0}
      onMouseEnter={() => setAcik(true)} onMouseLeave={() => setAcik(false)}
      onFocus={() => setAcik(true)} onBlur={() => setAcik(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setAcik(false); }}>
      {children}
      {acik && (
        <span role="tooltip" style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, width: "min(340px, 82vw)", zIndex: 70, display: "block", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.pop, padding: "10px 12px", animation: "nu-rise .14s ease-out both" }}>
          <span style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: 4 }}>Kaynak belgeden kanıt</span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: PAL.mut, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {bas > 0 ? "…" : ""}{metin.slice(bas, span.start | 0)}
            <mark style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, padding: "0 2px" }}>{metin.slice(span.start | 0, span.end | 0)}</mark>
            {metin.slice(span.end | 0, son)}{son < metin.length ? "…" : ""}
          </span>
        </span>
      )}
    </span>
  );
}

/* 2646 düzeltme önerisi — mevcut taslakla satır-diff (jsdiff): memur NEYİN değiştiğini görür.
   Renk tek sinyal değil (+/− önekleri); eski taslak yoksa düz metin fallback'i. */
export function DuzeltmeDiff({ eski, yeni }) {
  const satirStil = { fontFamily: MONO, fontSize: 12, lineHeight: "18px", whiteSpace: "pre-wrap", wordBreak: "break-word" };
  // downloading vb. üst-state değişimlerinde tam metin diff'i yeniden hesaplanmasın.
  const parcalar = useMemo(() => (eski ? diffLines(eski, yeni) : []), [eski, yeni]);
  if (!eski) {
    return <pre style={{ margin: 0, padding: SP.m, ...satirStil, color: PAL.ink2, maxHeight: 480, overflow: "auto", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{yeni}</pre>;
  }
  return (
    <div aria-label="Önerilen düzeltme farkı — eklenen satırlar artı, çıkarılan satırlar eksi işaretli"
      style={{ maxHeight: 480, overflow: "auto", padding: "8px 0", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>
      {parcalar.map((p, i) => {
        const renk = p.added ? DERIN.yesil : p.removed ? DERIN.kirmizi : PAL.ink2;
        const bg = p.added ? ALFA(BANT.yesil.c) : p.removed ? ALFA(BANT.kirmizi.c) : "transparent";
        const onek = p.added ? "+" : p.removed ? "−" : " ";
        return p.value.replace(/\n$/, "").split("\n").map((satir, j) => (
          <div key={`${i}-${j}`} style={{ display: "flex", gap: SP.s, padding: "1px 12px", background: bg }}>
            <span aria-hidden="true" style={{ ...satirStil, color: renk, flexShrink: 0, width: 10, textAlign: "center" }}>{onek}</span>
            <span style={{ ...satirStil, color: renk, minWidth: 0, ...(p.removed ? { textDecoration: "line-through", textDecorationColor: PAL.lineHi } : null) }}>{satir || " "}</span>
          </div>
        ));
      })}
    </div>
  );
}

/* Kalite kapısı satırı (CI-check deseni) — geçti/uyarı ikonu + kapı adı + sonuç değeri. */
export function Vrow({ ok, label, val }) {
  const c = ok ? DERIN.yesil : DERIN.sari;
  const Ic = ok ? Icon.check : Icon.alert;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.ink2 }}>
        <span aria-hidden="true" style={{ display: "flex", flex: "none", color: c }}><Ic /></span>
        {label}
      </span>
      <span style={{ ...TYPE.data, fontWeight: 500, color: c, flex: "none", ...TNUM }}>{val}</span>
    </div>
  );
}

/* Resmî yazı kâğıt önizlemesi — belge, arayüz kartı değil "evrak" gibi durur: dar sayfa,
   bol iç boşluk, üstte dosya şeridi. Uzun metin kapalı başlar (kademeli açılım) — fade/gradyan
   YASAK (MASTER), sert kesim + "tamamını gör" düğmesi. */
export function PaperSheet({ metin, dosyaAdi, formatOk }) {
  const [acik, setAcik] = useState(false);
  const temiz = cleanDemoText(metin);
  const satirSayi = temiz.split("\n").length;
  const uzun = satirSayi > 16;
  return (
    <div style={{ margin: "0 0 16px", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderBottom: `1px solid ${PAL.line}` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h9l5 5v13H5z" stroke={DERIN.V} strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h5" stroke={DERIN.V} strokeWidth="1.6" /></svg>
        <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{dosyaAdi}</span>
        {formatOk && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), borderRadius: RAD.chip, padding: "2px 8px" }}><Icon.check width={12} height={12} /> Yön. 2646 uyumlu</span>}
      </div>
      <div style={{ padding: "24px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "32px 48px" }}>
          <div style={{ ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", ...(acik || !uzun ? null : { maxHeight: 320, overflow: "hidden" }) }}>{temiz}</div>
          {uzun && (
            <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}`, display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={() => setAcik((v) => !v)} {...focusRing}
                onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                style={{ cursor: "pointer", padding: "6px 12px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 500, color: DERIN.T, transition: "background .12s ease-out", ...TNUM }}>
                {acik ? "Daralt" : `Tamamını gör (+${satirSayi - 12} satır)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
