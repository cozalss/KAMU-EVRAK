/* NeonDetay — komuta merkezinin ALTINDA (sayfa aşağı kaydıkça) açılan ayrıntılı sonuç
   bölümü. Üst 3-panel kompakt "canlı" görünüm; burada TÜM ajan çıktıları neon-stilde,
   GÖREV 1 (anlama) / GÖREV 2 (üretim) olarak gruplanmış + üstte özet şeridi (risk bandı
   açıklamalı). Tasarım atomları neonUi.jsx'ten gelir (tek kaynak). Tümü GERÇEK ProcessResponse. */
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, SANS, T, V, PAL, BANT, NeonCard, KV, RiskBand, focusRing } from "./neonUi.jsx";

/* Özet şeridi tek olgu (etiket + değer). */
const Fact = ({ k, v, c = PAL.ink2 }) => (
  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "1px", color: PAL.mut3, textTransform: "uppercase" }}>{k}</span>
    <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{v}</span>
  </span>
);

/* Görev bölüm etiketi (numaralı rozet + başlık + ince çizgi). */
const GorevLabel = ({ n, t, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 13px" }}>
    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: "#06121a", background: color, borderRadius: 6, padding: "2px 8px", letterSpacing: "1px" }}>GÖREV {n}</span>
    <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "2.5px", color: PAL.mut2 }}>{t}</span>
    <span aria-hidden="true" style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}55, transparent)` }} />
  </div>
);

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" };

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

  return (
    <section aria-labelledby="cak-detay-h" style={{ borderTop: `1px solid ${PAL.line}`, background: PAL.bg2, padding: "26px 24px 56px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ marginBottom: 18 }}>
          <h2 id="cak-detay-h" style={{ margin: 0, fontFamily: SANS, fontSize: 17, fontWeight: 600, color: PAL.ink }}>Ayrıntılı Sonuç · Tüm Ajan Çıktıları</h2>
          <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 11.5, color: PAL.mut2 }}>Görev 1 (anlama) + Görev 2 (üretim) — değiştirilemez denetim iziyle.</p>
        </header>

        {/* Özet şeridi — bir bakışta sonuç + açıklamalı risk bandı */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: 14, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 26px", minWidth: 0 }}>
            <Fact k="Evrak türü" v={EVRAK_TR(r.evrak_turu)} />
            {r.hedef_birim && <Fact k="Hedef birim" v={BIRIM_LBL(r.hedef_birim)} c={V} />}
            <Fact k="Eksik kontrol" v={eksik.length ? `${eksik.length} eksik` : "tam ✓"} c={eksik.length ? "#fbbf24" : "#34d399"} />
            <Fact k="Doğrulama" v={uyari.length ? `${uyari.length} uyarı` : "uyumlu ✓"} c={uyari.length ? "#fbbf24" : "#34d399"} />
            <Fact k="Denetim izi" v={denAdimlar.length ? `${denAdimlar.length} adım ✓` : "SHA-256 ✓"} c="#8ff0e0" />
          </div>
          <RiskBand band={band} lit />
        </div>

        {/* ============ GÖREV 1 · ANLAMA ============ */}
        <GorevLabel n="1" t="ANLAMA" color={T} />
        <div style={{ ...grid, marginBottom: 30 }}>

          {/* Çok-konulu ayrıştırma (vitrin) */}
          {alt.length >= 2 && (
            <NeonCard title="Çok-Konulu Ayrıştırma" tag={`${alt.length} alt-talep`} accent={T} full>
              <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 11.5, color: "#93a0bb", lineHeight: 1.5 }}>Tek dilekçedeki ayrı istekler bölünüp her biri uygun birime ayrı havale edildi.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 10 }}>
                {alt.map((a, i) => (
                  <div key={i} style={{ background: "rgba(46,230,201,.05)", border: "1px solid rgba(46,230,201,.18)", borderRadius: 10, padding: "11px 13px" }}>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: PAL.ink2, lineHeight: 1.5, marginBottom: 8 }}>{cleanDemoText(a.ozet || "")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontFamily: MONO, fontSize: 10 }}>
                      {(a.tur_tr || a.tur) && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,.05)", color: "#9aa6c0" }}>{a.tur_tr || EVRAK_TR(a.tur)}</span>}
                      {(a.birim_tr || a.birim) && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(183,148,255,.14)", color: "#d7c4ff" }}>{a.birim_tr || BIRIM_LBL(a.birim)}</span>}
                      {a.cevap_suresi && <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(46,230,201,.12)", color: "#8ff0e0" }}>{cleanDemoText(a.cevap_suresi)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </NeonCard>
          )}

          {/* İlgili mevzuat */}
          {mev.length > 0 && (
            <NeonCard title="İlgili Mevzuat" tag={`${mev.length} öneri`} accent={T}>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {mev.map((m, i) => {
                  const sc = Math.round((Number(m.score) || 0) * 100);
                  return (
                    <div key={i} style={{ borderLeft: "2px solid rgba(46,230,201,.4)", paddingLeft: 11 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: PAL.ink2 }}>{cleanDemoText(m.baslik)}</span>
                        {sc > 0 && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "#8ff0e0", background: "rgba(46,230,201,.12)", padding: "1px 7px", borderRadius: 6 }}>%{sc}</span>}
                      </div>
                      {m.snippet && <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, lineHeight: 1.5 }}>{cleanDemoText(m.snippet)}</p>}
                    </div>
                  );
                })}
              </div>
            </NeonCard>
          )}

          {/* Eksik bilgi & sorular */}
          <NeonCard title="Eksik Bilgi Kontrolü" tag={eksik.length ? `${eksik.length} eksik` : "tam ✓"} tagColor={eksik.length ? "#fbbf24" : "#34d399"} accent={eksik.length ? "#fbbf24" : "#34d399"}>
            {eksik.length === 0 && clarify.length === 0 ? (
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, color: "#34d399" }}>Zorunlu alanlar eksiksiz — evrak işleme alınabilir (3071 s.K. m.4).</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {eksik.map((e, i) => <div key={"e" + i} style={{ fontFamily: MONO, fontSize: 11.5, color: "#fde68a" }}>• {cleanDemoText(String(e))}</div>)}
                {clarify.map((q, i) => <div key={"q" + i} style={{ fontFamily: SANS, fontSize: 12, color: "#cdd6e8", background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 8, padding: "7px 10px" }}>{cleanDemoText(String(q))}</div>)}
              </div>
            )}
          </NeonCard>

          {/* Arşiv · Yasal süre · Denetim */}
          <NeonCard title="Arşiv · Yasal Süre · Denetim İzi" accent={T}>
            {arsiv.sdp_kodu && <KV k="SDP kodu (2005/7)" v={String(arsiv.sdp_kodu)} c="#d7c4ff" />}
            {(arsiv.saklama_suresi || arsiv.saklama) && <KV k="Saklama süresi" v={String(arsiv.saklama_suresi || arsiv.saklama)} />}
            {sla.durum && <KV k="Yasal süre durumu" v={`${sla.durum}${sla.kalan_gun != null ? ` · ${sla.kalan_gun}g` : ""}`} c={sla.durum === "NORMAL" ? "#34d399" : "#fde68a"} />}
            <KV k="Denetim izi" v={denAdimlar.length ? `SHA-256 zincir · ${denAdimlar.length} adım ✓` : "SHA-256 ✓"} c="#8ff0e0" />
            {den.kok_hash && <KV k="Kök hash" v={String(den.kok_hash).slice(0, 18) + "…"} c="#9aa6c0" />}
          </NeonCard>

        </div>

        {/* ============ GÖREV 2 · ÜRETİM ============ */}
        <GorevLabel n="2" t="ÜRETİM" color={V} />
        <div style={grid}>

          {/* Doğrulama (kalite kapısı) */}
          <NeonCard title="Doğrulama · Kalite Kapısı" tag={uyari.length ? `${uyari.length} uyarı` : "uyumlu ✓"} tagColor={uyari.length ? "#fbbf24" : "#34d399"} accent={V}>
            <KV k="Uydurma-veto" v={uyari.length ? `${uyari.length} işaret` : "temiz ✓"} c={uyari.length ? "#fde68a" : "#34d399"} />
            <KV k="Format (Yön. 2646)" v={r.format_uyumlu ? "uyumlu ✓" : "kontrol"} c={r.format_uyumlu ? "#34d399" : "#fde68a"} />
            {uyari.slice(0, 5).map((u, i) => <div key={i} style={{ marginTop: 6, fontFamily: MONO, fontSize: 10.5, color: "#fde68a", lineHeight: 1.4 }}>⚠ {cleanDemoText(String(u))}</div>)}
          </NeonCard>

          {/* Bilgilendirme */}
          {r.bilgilendirme && (
            <NeonCard title="Bilgilendirme" accent={V}>
              <p style={{ margin: 0, fontFamily: SANS, fontSize: 12.5, color: "#cdd6e8", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cleanDemoText(r.bilgilendirme).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>
            </NeonCard>
          )}

          {/* Resmî yazı taslağı — indir */}
          <NeonCard title="Resmî Yazı Taslağı" tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V} full>
            {r.yazi_taslak_md && (
              <pre style={{ margin: "0 0 12px", background: "#f4f5f9", borderRadius: 9, padding: "14px 16px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, maxHeight: 360, overflowY: "auto" }}>{cleanDemoText(r.yazi_taslak_md)}</pre>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => onDownload?.("pdf")} disabled={!canDownload || downloading === "pdf"} {...focusRing} style={btn(canDownload, "#b794ff")}>{downloading === "pdf" ? "indiriliyor…" : "PDF indir"}</button>
              <button onClick={() => onDownload?.("docx")} disabled={!canDownload || downloading === "docx"} {...focusRing} style={btn(canDownload, "#2ee6c9")}>{downloading === "docx" ? "indiriliyor…" : "DOCX indir"}</button>
              {!canDownload && <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2 }}>İndirme için örnek evrak metni gerekir (dosya yolunda metin sunucuda tutulmaz).</span>}
            </div>
          </NeonCard>

        </div>
      </div>
    </section>
  );
}

const btn = (enabled, accent) => ({
  cursor: enabled ? "pointer" : "not-allowed", padding: "9px 16px", borderRadius: 10,
  border: `1px solid ${enabled ? accent + "66" : "rgba(255,255,255,.1)"}`,
  background: enabled ? accent + "18" : "rgba(255,255,255,.03)",
  color: enabled ? accent : "#7d89a4", fontFamily: SANS, fontSize: 12.5, fontWeight: 600,
});
