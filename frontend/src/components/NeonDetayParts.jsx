/* NeonDetayParts — NeonDetay'ın yaprak bileşenleri (Hero Light v2 "Sakin Ürün").
   Ayrı dosya: NeonDetay <800 satır kalsın; parçalar tek başına test edilebilir.
   Desen kaynağı: Langfuse/Braintrust (skor barı + eşik), Stripe (mono kimlik + kopyala),
   Vercel checks (kalite kapısı satırı), Phoenix (atıf satırı + kaynak alt-satırı). */
import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { cleanDemoText } from "./result-cards.jsx";
import { MONO, T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, focusRing, Icon, KV } from "./neonUi.jsx";

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

/* yasal süre durumu → renk + etiket + ray konumu. */
export function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("GEC")) return { label: `Gecikmiş${gun}`, color: BANT.kirmizi.c, marker: 0.92 };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `Kritik${gun}`, color: BANT.sari.c, marker: 0.75 };
  if (d.includes("NORMAL")) return { label: `Normal${gun}`, color: BANT.yesil.c, marker: 0.4 };
  return { label: sla.durum, color: PAL.mut, marker: null };
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

/* Yasal süre paneli — durum çipi + konum rayı + somut tarihler (başlangıç → son tarih) +
   yasal dayanak. Tarih = makine verisi (mono); "son tarih" jüri için en somut kanıt. */
export function SlaPanel({ sla, info }) {
  if (!info) return <KV k="Yasal süre durumu" v="tanımsız" c={PAL.mut2} />;
  const dc = DERIN_OF(info.color);
  return (
    <div style={{ margin: "8px 0 4px", paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Yasal süre durumu</span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: dc, background: ALFA(info.color), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{info.label}</span>
      </div>
      <div style={{ position: "relative", height: 4, background: PAL.press }}>
        {info.marker != null && <span aria-hidden="true" style={{ position: "absolute", top: -3, left: `${info.marker * 100}%`, width: 10, height: 10, borderRadius: RAD.dot, background: info.color, transform: "translateX(-50%)" }} />}
      </div>
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3, display: "flex", justifyContent: "space-between" }}><span>başvuru</span><span>yasal süre</span><span>bugün</span></div>
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

/* SHA-256 zincir adımı özeti — veri dict'inden kısa "k: v" dizisi (mono, makine verisi). */
function veriOzet(veri) {
  if (!veri || typeof veri !== "object") return "";
  return Object.entries(veri).slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ").slice(0, 96);
}

/* Denetim izi zinciri — dikey omurga + halka başına adım adı + kısa hash (kopyalanabilir) +
   mühürlenen veri özeti. "Her halka öncekini mühürler" görünür kanıta dönüşür. */
export function ZincirStepper({ zincir, kokHash, butunluk }) {
  const [tum, setTum] = useState(false);
  // Backend `denetim_izi` düz dict (Pydantic iç doğrulaması yok) → bozuk halka render'ı düşürmesin.
  const halkalar = (zincir || []).filter((h) => h && typeof h === "object");
  const rows = tum ? halkalar : halkalar.slice(0, 6);
  const kalan = halkalar.length - rows.length;
  return (
    <div>
      <div style={{ position: "relative", paddingLeft: 18 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 1, background: PAL.lineHi }} />
        {rows.map((h, i) => {
          const son = i === halkalar.length - 1;
          return (
            <div key={i} style={{ position: "relative", padding: "5px 0" }}>
              <span aria-hidden="true" style={{ position: "absolute", left: -18, top: 10, width: 9, height: 9, borderRadius: RAD.dot, background: son ? BANT.yesil.c : PAL.surf, border: `1.5px solid ${son ? BANT.yesil.c : PAL.lineHi}` }} />
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{cleanDemoText(String(h.adim || `adım ${i + 1}`)).replace(/_/g, " ")}</span>
                {h.hash && <CopyChip deger={h.hash} kisa={`${String(h.hash).slice(0, 10)}…`} label={`${h.adim || "adım"} hash değerini kopyala`} />}
              </div>
              {veriOzet(h.veri) && <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(veriOzet(h.veri))}</div>}
            </div>
          );
        })}
      </div>
      {kalan > 0 && (
        <button type="button" onClick={() => setTum(true)} {...focusRing}
          onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{ cursor: "pointer", marginTop: SP.xs, padding: "4px 8px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 500, color: DERIN.T, transition: "background .12s ease-out" }}>
          +{kalan} halka daha göster
        </button>
      )}
      {kokHash && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kök hash</span>
          <CopyChip deger={kokHash} kisa={`${String(kokHash).slice(0, 16)}…`} label="Kök hash değerini panoya kopyala" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: butunluk ? DERIN.yesil : DERIN.kirmizi }}>
            {butunluk ? <Icon.check width={12} height={12} /> : <Icon.alert width={12} height={12} />}
            {butunluk ? "zincir tutarlı" : "zincir doğrulanamadı"}
          </span>
        </div>
      )}
    </div>
  );
}

/* 2646 düzeltme önerisi — mevcut taslakla satır-diff (jsdiff): memur NEYİN değiştiğini görür.
   Renk tek sinyal değil (+/− önekleri); eski taslak yoksa düz metin fallback'i. */
export function DuzeltmeDiff({ eski, yeni }) {
  const satirStil = { fontFamily: MONO, fontSize: 12, lineHeight: "18px", whiteSpace: "pre-wrap", wordBreak: "break-word" };
  // downloading vb. üst-state değişimlerinde tam metin diff'i yeniden hesaplanmasın.
  const parcalar = useMemo(() => (eski ? diffLines(eski, yeni) : []), [eski, yeni]);
  if (!eski) {
    return <pre style={{ margin: 0, padding: SP.m, ...satirStil, color: PAL.ink2, maxHeight: 240, overflow: "auto", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{yeni}</pre>;
  }
  return (
    <div aria-label="Önerilen düzeltme farkı — eklenen satırlar artı, çıkarılan satırlar eksi işaretli"
      style={{ maxHeight: 240, overflow: "auto", padding: "8px 0", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>
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
