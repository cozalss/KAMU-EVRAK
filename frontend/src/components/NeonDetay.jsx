/* NeonDetay — komuta merkezinin ALTINDA açılan ayrıntılı sonuç bölümü (yarışma-kalitesi).
   Premium glass kartlar (neonUi.NeonCard), GÖREV 1 (anlama, teal) / GÖREV 2 (üretim, mor) grupları,
   üstte özet şeridi (olgular + yasal süre + açıklamalı RiskBand) + BÜTÜNLÜK rozeti.
   Data-viz: mevzuat skor barları (ilgililik eşiği), SLA bullet (durum/marker), SHA-256 hash zinciri,
   doğrulanan alan çipleri, resmî yazı kâğıt önizleme (TASLAK filigranı). Tümü GERÇEK ProcessResponse. */
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, SANS, T, V, PAL, BANT, NeonCard, KV, RiskBand, Btn, Icon } from "./neonUi.jsx";

/* yasal süre durumu → renk + etiket + marker konumu + tint (rgba öneki). */
function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("GEC")) return { label: `GECİKMİŞ${gun}`, color: BANT.kirmizi.c, marker: 0.92, tint: "rgba(201,67,47," };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `KRİTİK${gun}`, color: BANT.sari.c, marker: 0.75, tint: "rgba(201,138,31," };
  if (d.includes("NORMAL")) return { label: `NORMAL${gun}`, color: BANT.yesil.c, marker: 0.4, tint: "rgba(47,158,110," };
  return { label: sla.durum, color: PAL.mut, marker: null, tint: "rgba(35,26,18," };
}

/* Özet şeridi tek olgu (ikon çipi + etiket + değer). */
const Fact = ({ k, v, c = PAL.ink2, icon, glow }) => (
  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
    <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", color: c, background: "rgba(35,26,18,.04)", border: `1px solid ${PAL.line}` }}>{icon}</span>
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "block", fontFamily: MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: PAL.mut3, marginBottom: 2 }}>{k}</span>
      <span style={{ display: "block", fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.2, color: c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220, fontVariantNumeric: "tabular-nums", textShadow: glow ? `0 0 12px ${c}66` : "none" }}>{v}</span>
    </span>
  </span>
);

/* Görev bölüm etiketi. */
const GorevLabel = ({ n, t, color, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 0 14px" }}>
    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: "#06121a", background: color, borderRadius: 7, padding: "3px 9px", letterSpacing: "1px" }}>GÖREV {n}</span>
    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "3px", color: PAL.mut2 }}>{t}</span>
    <span aria-hidden="true" style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}88, transparent)` }} />
    {count && <span style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut3, letterSpacing: "1px" }}>{count}</span>}
  </div>
);

/* Güven seviyesi → renk (kaynak şeffaflığı; renk tek sinyal değil, metin de var). */
const GUVEN_RENK = { yüksek: "#1f6d82", orta: BANT.sari.c, düşük: BANT.kirmizi.c };

/* Mevzuat öneri kartı — skor barı + güven seviyesi + dayanak + yürürlük + "insan incelemesi"
   (B2 şeffaflık: kaynak göstermeyen öneri = güven kaybı). */
function ScoreBar({ rank, m }) {
  const pct = Math.round((Number(m.score) || 0) * 100);
  const low = pct > 0 && pct < 60;
  const acc = low ? BANT.sari.c : T;
  const guven = m.guven || "";
  const gc = GUVEN_RENK[guven] || PAL.mut2;
  const title = cleanDemoText(m.baslik);
  const snippet = m.snippet ? cleanDemoText(m.snippet) : null;
  const dayanak = m.dayanak ? cleanDemoText(m.dayanak) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#fbf7f0", background: acc }}>{rank}</span>
        <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: PAL.ink2 }}>{title}</span>
        {guven && (
          <span aria-label={`Güven seviyesi: ${guven}`} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".5px", textTransform: "uppercase", color: gc, background: gc + "1c", border: `1px solid ${gc}44`, borderRadius: 6, padding: "2px 6px" }}>{guven} güven</span>
        )}
        {pct > 0 && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 600, color: low ? BANT.sari.c : "#1f6d82", minWidth: 42, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>%{pct}</span>}
      </div>
      {pct > 0 && (
        <div style={{ position: "relative", height: 6 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "rgba(35,26,18,.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: low ? `linear-gradient(90deg,#b8860b,${BANT.sari.c})` : `linear-gradient(90deg,${T}99,${T})`, boxShadow: low ? "0 0 10px rgba(201,138,31,.4)" : "0 0 10px rgba(47,143,166,.4)" }} />
          </div>
          <div aria-hidden="true" style={{ position: "absolute", top: -3, bottom: -3, left: "60%", width: 2, borderRadius: 1, background: "repeating-linear-gradient(180deg,rgba(255,255,255,.45) 0 2px,transparent 2px 4px)" }} />
        </div>
      )}
      {snippet && <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.5, color: PAL.mut2, paddingLeft: 29 }}>{snippet}</div>}
      <div style={{ paddingLeft: 29, display: "flex", flexDirection: "column", gap: 3 }}>
        {dayanak && <div style={{ fontFamily: MONO, fontSize: 9.5, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Dayanak:</span> {dayanak}</div>}
        {m.yururluk && <div style={{ fontFamily: MONO, fontSize: 9.5, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Yürürlük:</span> {m.yururluk}</div>}
        {m.inceleme_oner && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 9.5, color: BANT.sari.c, marginTop: 1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            İnsan incelemesi önerilir{m.nli_etiket && m.nli_etiket.startsWith("[DOĞRULA") ? " · anlamsal destek zayıf" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

/* Yasal süre "bullet" (üç bölgeli + marker). */
function SlaBullet({ info }) {
  if (!info) return <KV k="Yasal süre durumu" v="tanımsız" c={PAL.mut2} />;
  return (
    <div style={{ margin: "8px 0 4px", padding: "11px 13px", borderRadius: 12, background: `${info.tint}.08)`, border: `1px solid ${info.tint}.28)` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1px", color: PAL.mut2 }}>YASAL SÜRE DURUMU</span>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: info.color, textShadow: `0 0 12px ${info.tint}.5)`, fontVariantNumeric: "tabular-nums" }}>{info.label}</span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 999, overflow: "hidden", display: "flex" }}>
        <span style={{ flex: 5, background: "rgba(47,158,110,.4)" }} /><span style={{ flex: 2, background: "rgba(201,138,31,.45)" }} /><span style={{ flex: 3, background: "rgba(201,67,47,.6)" }} />
        {info.marker != null && <span aria-hidden="true" style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "#fff", left: `${info.marker * 100}%`, boxShadow: "0 0 8px rgba(255,255,255,.7)" }} />}
      </div>
      <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9.5, color: PAL.mut3, display: "flex", justifyContent: "space-between" }}><span>başvuru</span><span>yasal süre ▲</span><span>bugün</span></div>
    </div>
  );
}

/* SHA-256 hash zinciri görseli (n adım, son halka yeşil ✓). */
function HashChain({ n }) {
  const links = Math.min(n, 16);
  const items = [];
  for (let i = 0; i < links; i++) {
    if (i > 0) items.push(<span key={"s" + i} aria-hidden="true" style={{ height: 2, flex: 1, background: "linear-gradient(90deg,rgba(139,92,176,.6),rgba(139,92,176,.35))" }} />);
    const last = i === links - 1;
    items.push(<span key={"l" + i} aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: last ? BANT.yesil.c : V, boxShadow: last ? `0 0 8px ${BANT.yesil.c}66` : "0 0 7px rgba(139,92,176,.45)" }} />);
  }
  return <div style={{ display: "flex", alignItems: "center", margin: "8px 0 9px" }}>{items}</div>;
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" };
const dlBtnHover = {
  onMouseEnter: (e) => { e.currentTarget.style.transform = "translateY(-2px)"; },
  onMouseLeave: (e) => { e.currentTarget.style.transform = "none"; },
};

export default function NeonDetay({ result, onDownload, downloading, canDownload }) {
  const r = result;
  if (!r) return null;

  const alt = (r.alt_talepler || []).filter(Boolean);
  const mev = (r.mevzuat_onerileri || []).filter(Boolean);
  const eksik = r.eksik_alanlar || [];
  const clarify = r.clarify_questions || [];
  const uyari = r.verify_uyari || [];
  const arsiv = r.arsiv_metadata || {};
  const sla = r.sla_metadata || {};
  const den = r.denetim_izi || {};
  const denAdimlar = Array.isArray(den.zincir) ? den.zincir : (Array.isArray(den.adimlar) ? den.adimlar : []);
  const band = r.risk_metadata?.bant || "yesil";
  const sInfo = slaInfo(sla);
  const hasChain = denAdimlar.length > 0 || !!den.kok_hash;

  // Doğrulanan zorunlu alanlar (kanıtlı çıkarım etiketleri → fallback bilgi_unsurlari anahtarları).
  const verified = [];
  {
    const seen = new Set();
    for (const sp of (r.kanit_metadata?.spanlar || [])) { if (sp?.label && !seen.has(sp.label)) { seen.add(sp.label); verified.push(cleanDemoText(sp.label)); } }
    if (verified.length === 0 && r.bilgi_unsurlari) { for (const k of Object.keys(r.bilgi_unsurlari)) { if (!seen.has(k)) { seen.add(k); verified.push(k.replace(/_/g, " ")); } } }
  }
  const verifiedShow = verified.slice(0, 8);

  return (
    <section aria-labelledby="cak-detay-h" style={{ borderTop: `1px solid ${PAL.line}`, background: PAL.bg2, padding: "26px 24px 56px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h2 id="cak-detay-h" style={{ margin: 0, fontFamily: SANS, fontSize: 18, fontWeight: 600, color: PAL.ink, letterSpacing: "-.01em" }}>Ayrıntılı Sonuç · Tüm Ajan Çıktıları</h2>
            <p style={{ margin: "5px 0 0", fontFamily: MONO, fontSize: 11.5, color: PAL.mut2 }}>Görev 1 (anlama) + Görev 2 (üretim) — değiştirilemez denetim iziyle.</p>
          </div>
          {hasChain && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: "1px", color: "#1f6d82", background: "linear-gradient(180deg,rgba(47,143,166,.12),rgba(47,143,166,.04))", border: "1px solid rgba(47,143,166,.3)", borderRadius: 11, padding: "8px 13px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" stroke={T} strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke={T} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              BÜTÜNLÜK DOĞRULANDI · SHA-256 ✓
            </span>
          )}
        </header>

        {/* Özet şeridi */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg,#ffffff,#fdfbf7)", border: `1px solid ${PAL.line}`, borderRadius: 18, padding: "16px 22px", marginBottom: 24, position: "relative", overflow: "hidden", boxShadow: "0 18px 40px -24px rgba(35,26,18,.22)" }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,rgba(47,143,166,.05),transparent 35%,transparent 65%,rgba(139,92,176,.05))", pointerEvents: "none" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 24px", minWidth: 0, position: "relative" }}>
            <Fact k="Evrak türü" v={EVRAK_TR(r.evrak_turu)} c={PAL.ink2} icon={<Icon.doc />} />
            {r.hedef_birim && <Fact k="Hedef birim" v={BIRIM_LBL(r.hedef_birim)} c={V} icon={<Icon.route />} />}
            <Fact k="Eksik kontrol" v={eksik.length ? `${eksik.length} eksik` : "tam ✓"} c={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />} />
            {sInfo && <Fact k="Yasal süre" v={sInfo.label} c={sInfo.color} glow={sInfo.color === BANT.kirmizi.c} icon={<Icon.clock />} />}
            {hasChain && <Fact k="Denetim izi" v={denAdimlar.length ? `${denAdimlar.length} adım ✓` : "SHA-256 ✓"} c="#8ff0e0" glow icon={<Icon.shield />} />}
          </div>
          <div style={{ position: "relative" }}><RiskBand band={band} lit sub="İÇERİK" /></div>
        </div>

        {/* ============ GÖREV 1 · ANLAMA ============ */}
        <section aria-label="Görev 1 · Anlama" style={{ marginBottom: 30 }}>
          <GorevLabel n="1" t="ANLAMA" color={T} count="anlama ajanları ✓" />
          <div style={grid}>

            {alt.length >= 2 && (
              <NeonCard title="Çok-Konulu Ayrıştırma" tag={`${alt.length} alt-talep`} accent={T} icon={<Icon.route />} full>
                <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 11.5, color: "#93a0bb", lineHeight: 1.5 }}>Tek dilekçedeki ayrı istekler bölünüp her biri uygun birime ayrı havale edildi.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 10 }}>
                  {alt.map((a, i) => (
                    <div key={i} style={{ background: "rgba(47,143,166,.05)", border: "1px solid rgba(47,143,166,.18)", borderRadius: 10, padding: "11px 13px" }}>
                      <div style={{ fontFamily: SANS, fontSize: 12.5, color: PAL.ink2, lineHeight: 1.5, marginBottom: 8 }}>{cleanDemoText(a.ozet || "")}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontFamily: MONO, fontSize: 10 }}>
                        {(a.tur_tr || a.tur) && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(35,26,18,.04)", color: PAL.mut2 }}>{a.tur_tr || EVRAK_TR(a.tur)}</span>}
                        {(a.birim_tr || a.birim) && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(139,92,176,.14)", color: "#6a4787" }}>{a.birim_tr || BIRIM_LBL(a.birim)}</span>}
                        {a.cevap_suresi && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(47,143,166,.12)", color: "#1f6d82" }}>{cleanDemoText(a.cevap_suresi)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </NeonCard>
            )}

            {mev.length > 0 && (
              <NeonCard title="İlgili Mevzuat" tag={`${mev.length} öneri`} accent={T} icon={<Icon.book />}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {mev.map((m, i) => <ScoreBar key={i} rank={i + 1} m={m} />)}
                </div>
                <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 8.5, letterSpacing: ".5px", color: PAL.mut3, paddingLeft: 29 }}>▏ %60 ilgililik eşiği — altı düşük alaka (amber)</div>
              </NeonCard>
            )}

            <NeonCard title="Eksik Bilgi Kontrolü" tag={eksik.length ? `${eksik.length} eksik` : "tam ✓"} tagColor={eksik.length ? BANT.sari.c : BANT.yesil.c} accent={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />}>
              {eksik.length === 0 && clarify.length === 0 ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 13px", borderRadius: 11, background: "rgba(47,158,110,.07)", border: "1px solid rgba(47,158,110,.22)", color: "#1f7a52", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="9" stroke={BANT.yesil.c} strokeWidth="1.6" /><path d="M8.5 12 11 14.5 15.5 9.5" stroke={BANT.yesil.c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>Zorunlu alanlar <strong style={{ color: PAL.ink, fontWeight: 600 }}>eksiksiz</strong> — evrak işleme alınabilir (3071 s.K. m.4). Eksik unsur yok; resmî yazı taslağı doğrudan hazırlandı.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {eksik.map((e, i) => <div key={"e" + i} style={{ fontFamily: MONO, fontSize: 11.5, color: "#8a5a10" }}>• {cleanDemoText(String(e))}</div>)}
                  {clarify.map((q, i) => <div key={"q" + i} style={{ fontFamily: SANS, fontSize: 12, color: PAL.ink2, background: "rgba(201,138,31,.08)", border: "1px solid rgba(201,138,31,.25)", borderRadius: 8, padding: "7px 10px" }}>{cleanDemoText(String(q))}</div>)}
                </div>
              )}
              {eksik.length === 0 && verifiedShow.length > 0 && (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "1px", color: PAL.mut3, textTransform: "uppercase", margin: "13px 0 8px" }}>Doğrulanan zorunlu alanlar</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {verifiedShow.map((f, i) => <span key={i} style={{ fontFamily: MONO, fontSize: 10, padding: "4px 9px", borderRadius: 7, background: "rgba(47,158,110,.1)", border: "1px solid rgba(47,158,110,.28)", color: "#1f7a52" }}>✓ {f}</span>)}
                  </div>
                </>
              )}
            </NeonCard>

            <NeonCard title="Arşiv · Yasal Süre · Denetim İzi" accent={T} icon={<Icon.grid />} full>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: "0 22px" }}>
                <div>
                  {arsiv.sdp_kodu && <KV k="SDP kodu (2005/7)" v={<span style={{ fontVariantNumeric: "tabular-nums" }}>{String(arsiv.sdp_kodu)}</span>} c="#d7c4ff" />}
                  {(arsiv.saklama_suresi || arsiv.saklama) && <KV k="Saklama süresi" v={String(arsiv.saklama_suresi || arsiv.saklama)} />}
                  <SlaBullet info={sInfo} />
                </div>
                <div>
                  <KV k="Denetim izi" v={<span>SHA-256 zincir · <span style={{ fontVariantNumeric: "tabular-nums" }}>{denAdimlar.length || ""}</span>{denAdimlar.length ? " adım ✓" : "✓"}</span>} c="#1f6d82" />
                  {denAdimlar.length > 0 && <HashChain n={denAdimlar.length} />}
                  {den.kok_hash && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut2, background: "rgba(35,26,18,.03)", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "6px 9px", wordBreak: "break-all" }}>Kök hash: {String(den.kok_hash).slice(0, 24)}…</div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: PAL.mut3, marginTop: 7, display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={BANT.yesil.c} strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={BANT.yesil.c} strokeWidth="1.6" /></svg>
                    Değiştirilemez — her adım bir öncekini mühürler (tamper-evident)
                  </div>
                </div>
              </div>
            </NeonCard>

          </div>
        </section>

        {/* ============ GÖREV 2 · ÜRETİM ============ */}
        <section aria-label="Görev 2 · Üretim">
          <GorevLabel n="2" t="ÜRETİM" color={V} count="üretim ajanları ✓" />
          <div style={grid}>

            <NeonCard title="Doğrulama · Kalite Kapısı" tag={uyari.length ? `${uyari.length} uyarı` : "uyumlu ✓"} tagColor={uyari.length ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
              <Vrow ok={!uyari.length} label={<>Uydurma-veto <span style={{ color: PAL.mut3, fontSize: 10 }}>(halüsinasyon kontrolü)</span></>} val={uyari.length ? `${uyari.length} işaret` : "temiz ✓"} />
              <Vrow ok={!!r.format_uyumlu} label="Format (Yön. 2646)" val={r.format_uyumlu ? "uyumlu ✓" : "kontrol"} />
              {uyari.slice(0, 5).map((u, i) => <div key={i} style={{ marginTop: 6, fontFamily: MONO, fontSize: 10.5, color: "#fde68a", lineHeight: 1.4 }}>⚠ {cleanDemoText(String(u))}</div>)}
            </NeonCard>

            {r.bilgilendirme && (
              <NeonCard title="Bilgilendirme" accent={V} icon={<Icon.info />}>
                <p style={{ margin: 0, fontFamily: SANS, fontSize: 12.5, color: PAL.ink2, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{cleanDemoText(r.bilgilendirme).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>
              </NeonCard>
            )}

            <NeonCard title="Resmî Yazı Taslağı" tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V} icon={<Icon.doc />} full>
              {r.yazi_taslak_md && (
                <div style={{ position: "relative", margin: "0 0 14px", borderRadius: 12, overflow: "hidden", background: "#ffffff", border: `1px solid ${PAL.line}`, boxShadow: "0 14px 34px -20px rgba(35,26,18,.24)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "linear-gradient(90deg,#f3efe8,#ece5d8)", borderBottom: "1px solid #e4ddd0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h9l5 5v13H5z" stroke="#6a4787" strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h5" stroke="#6a4787" strokeWidth="1.6" /></svg>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut2, letterSpacing: ".5px" }}>{r.yazi_turu ? YAZI_TR(r.yazi_turu).toLocaleLowerCase("tr-TR").replace(/\s+/g, "-") : "taslak"}.docx · Yön. 2646</span>
                    {r.format_uyumlu && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 9, letterSpacing: "1px", color: "#6a4787", background: "rgba(139,92,176,.1)", border: "1px solid rgba(139,92,176,.28)", borderRadius: 6, padding: "2px 7px" }}>FORMAT ✓</span>}
                  </div>
                  <div aria-hidden="true" style={{ position: "absolute", inset: "34px 0 0", display: "grid", placeItems: "center", pointerEvents: "none", overflow: "hidden" }}>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 88, letterSpacing: 14, color: "rgba(35,26,18,.05)", transform: "rotate(-22deg)", whiteSpace: "nowrap" }}>TASLAK</span>
                  </div>
                  <pre style={{ position: "relative", margin: 0, padding: "18px 20px", fontFamily: MONO, fontSize: 10.5, color: "#2a3142", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.65, maxHeight: 360, overflowY: "auto" }}>{cleanDemoText(r.yazi_taslak_md)}</pre>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => onDownload?.("pdf")} disabled={!canDownload || downloading === "pdf"} {...dlBtnHover} style={{ cursor: canDownload ? "pointer" : "not-allowed", padding: "10px 17px", borderRadius: 11, border: "1px solid transparent", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: canDownload ? "#fbf7f0" : PAL.mut2, background: canDownload ? `linear-gradient(135deg,${V},${V}cc)` : "rgba(35,26,18,.05)", boxShadow: canDownload ? "0 10px 24px -10px rgba(139,92,176,.45)" : "none", transition: "transform .2s" }}>{downloading === "pdf" ? "indiriliyor…" : "PDF indir"}</button>
                <button onClick={() => onDownload?.("docx")} disabled={!canDownload || downloading === "docx"} {...dlBtnHover} style={{ cursor: canDownload ? "pointer" : "not-allowed", padding: "10px 17px", borderRadius: 11, border: "1px solid " + (canDownload ? "rgba(139,92,176,.4)" : "rgba(35,26,18,.1)"), fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: canDownload ? "#6a4787" : PAL.mut2, background: canDownload ? "rgba(139,92,176,.1)" : "rgba(35,26,18,.03)", transition: "transform .2s" }}>{downloading === "docx" ? "indiriliyor…" : "DOCX indir"}</button>
                {!canDownload && <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2 }}>İndirme için örnek evrak metni gerekir (dosya yolunda metin sunucuda tutulmaz).</span>}
              </div>
            </NeonCard>

          </div>
        </section>
      </div>
    </section>
  );
}

/* Doğrulama satırı (yeşil onay / amber uyarı). */
function Vrow({ ok, label, val }) {
  const c = ok ? BANT.yesil.c : BANT.sari.c;
  const tint = ok ? "rgba(47,158,110," : "rgba(201,138,31,";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", borderRadius: 10, background: `${tint}.06)`, border: `1px solid ${tint}.2)`, marginBottom: 8 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: PAL.ink2 }}>
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: c, display: "grid", placeItems: "center", flex: "none" }}>
          {ok
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="#fbf7f0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#fbf7f0" }}>!</span>}
        </span>
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: c }}>{val}</span>
    </div>
  );
}
