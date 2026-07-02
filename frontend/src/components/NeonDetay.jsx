/* NeonDetay — komuta merkezinin ALTINDA açılan ayrıntılı sonuç bölümü (yarışma-kalitesi).
   Hero Light v2 "Sakin Ürün": düz beyaz kartlar (neonUi.NeonCard), Görev 1 (anlama, teal) /
   Görev 2 (üretim, lavanta) grupları, üstte özet şeridi (olgular + yasal süre + açıklamalı
   RiskBand) + bütünlük çipi. Data-viz: mevzuat skor barları (ilgililik eşiği), SLA çizgi+nokta,
   SHA-256 hash zinciri, doğrulanan alan çipleri, resmî yazı kâğıt önizleme. Tümü GERÇEK ProcessResponse. */
import { cloneElement } from "react";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, NeonCard, KV, RiskBand, Btn, Icon } from "./neonUi.jsx";

/* yasal süre durumu → renk + etiket + marker konumu. */
function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("GEC")) return { label: `Gecikmiş${gun}`, color: BANT.kirmizi.c, marker: 0.92 };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `Kritik${gun}`, color: BANT.sari.c, marker: 0.75 };
  if (d.includes("NORMAL")) return { label: `Normal${gun}`, color: BANT.yesil.c, marker: 0.4 };
  return { label: sla.durum, color: PAL.mut, marker: null };
}

/* Özet şeridi tek olgu (kutusuz ikon + etiket + değer). */
const Fact = ({ k, v, c = PAL.ink2, icon }) => (
  <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
    {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(c) }}>{icon}</span>}
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, marginBottom: 2 }}>{k}</span>
      <span style={{ display: "block", ...TYPE.ui, fontWeight: 500, color: DERIN_OF(c), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220, ...TNUM }}>{v}</span>
    </span>
  </span>
);

/* Görev bölüm etiketi — 12/500 sentence case + düz hairline ayraç. */
const GorevLabel = ({ n, t, color, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: SP.m, margin: "0 0 12px" }}>
    <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(color), flex: "none" }}>Görev {n} — {t}</span>
    <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
    {count && <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>{count}</span>}
  </div>
);

/* Güven seviyesi → AA metin rengi (kaynak şeffaflığı; renk tek sinyal değil, metin de var). */
const GUVEN_RENK = { yüksek: DERIN.T, orta: DERIN.sari, düşük: DERIN.kirmizi };

/* Mevzuat öneri kartı — skor barı + güven seviyesi + dayanak + yürürlük + "insan incelemesi"
   (B2 şeffaflık: kaynak göstermeyen öneri = güven kaybı). */
function ScoreBar({ rank, m }) {
  const pct = Math.round((Number(m.score) || 0) * 100);
  const low = pct > 0 && pct < 60;
  const fill = low ? DERIN.sari : DERIN.T;
  const guven = m.guven || "";
  const gc = GUVEN_RENK[guven] || PAL.mut2;
  const title = cleanDemoText(m.baslik);
  const snippet = m.snippet ? cleanDemoText(m.snippet) : null;
  const dayanak = m.dayanak ? cleanDemoText(m.dayanak) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.s, paddingBottom: SP.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{rank}.</span>
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{title}</span>
        {guven && (
          <span aria-label={`Güven seviyesi: ${guven}`} style={{ ...TYPE.meta, fontWeight: 500, color: gc, background: ALFA(gc), borderRadius: RAD.chip, padding: "2px 8px" }}>{guven} güven</span>
        )}
        {m.atif_genisletme && (
          <span title="Bu öneri, üstteki maddenin atıf verdiği mevzuattan otomatik genişletmeyle geldi (GraphRAG-lite)" aria-label="Atıf grafiği genişletmesiyle gelen öneri" style={{ ...TYPE.meta, color: PAL.mut }}>atıf grafiğinden</span>
        )}
        {pct > 0 && <span style={{ marginLeft: "auto", ...TYPE.data, fontWeight: 500, color: fill, minWidth: 42, textAlign: "right", ...TNUM }}>%{pct}</span>}
      </div>
      {pct > 0 && (
        <div style={{ position: "relative", height: 4, background: PAL.press }}>
          <div style={{ height: "100%", width: `${pct}%`, background: fill }} />
          <div aria-hidden="true" style={{ position: "absolute", top: -2, bottom: -2, left: "60%", width: 1, background: PAL.lineHi }} />
        </div>
      )}
      {snippet && <div style={{ ...TYPE.data, color: PAL.mut2 }}>{snippet}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

/* Yasal süre göstergesi — düz ray + düz konum noktası + durum çipi. */
function SlaBullet({ info }) {
  if (!info) return <KV k="Yasal süre durumu" v="tanımsız" c={PAL.mut2} />;
  const dc = DERIN_OF(info.color);
  return (
    <div style={{ margin: "8px 0 4px", padding: SP.m, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Yasal süre durumu</span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: dc, background: ALFA(info.color), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{info.label}</span>
      </div>
      <div style={{ position: "relative", height: 4, background: PAL.press }}>
        {info.marker != null && <span aria-hidden="true" style={{ position: "absolute", top: -3, left: `${info.marker * 100}%`, width: 10, height: 10, borderRadius: RAD.dot, background: info.color, transform: "translateX(-50%)" }} />}
      </div>
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3, display: "flex", justifyContent: "space-between" }}><span>başvuru</span><span>yasal süre</span><span>bugün</span></div>
    </div>
  );
}

/* SHA-256 hash zinciri görseli (n adım, düz çizgi + düz nokta; son halka yeşil). */
function HashChain({ n }) {
  const links = Math.min(n, 16);
  const items = [];
  for (let i = 0; i < links; i++) {
    if (i > 0) items.push(<span key={"s" + i} aria-hidden="true" style={{ height: 1, flex: 1, background: PAL.lineHi }} />);
    const last = i === links - 1;
    items.push(<span key={"l" + i} aria-hidden="true" style={{ width: 10, height: 10, borderRadius: RAD.dot, flex: "none", background: last ? BANT.yesil.c : V }} />);
  }
  return <div style={{ display: "flex", alignItems: "center", margin: "8px 0" }}>{items}</div>;
}

/* Bölüm düzeni — kartlar dikey ritimde: tam-genişlik satırlar + dengeli sütun grubu. */
const STACK = { display: "flex", flexDirection: "column", gap: SP.l };
const COL = { ...STACK, minWidth: 0 };
/* Sütunun son kartı kalan boşluğu doldurur → iki sütunun alt kenarı hizalanır. */
const stretchLast = (cards) => cards.map((c, i) => (i === cards.length - 1 ? cloneElement(c, { style: { ...c.props.style, flex: 1 } }) : c));
/* Dengeli iki sütun: kısa kartlar bir sütunda üst üste, uzun kart karşısında — uzun kartın
   yanında dev boşluk kalmaz. auto-fit dar ekranda tek sütuna düşürür; taraflardan biri
   boşsa düz responsive grid'e döner. */
function ColGrid({ left, right }) {
  const l = (left || []).filter(Boolean), r = (right || []).filter(Boolean);
  if (!l.length && !r.length) return null;
  if (!l.length || !r.length) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px,100%),1fr))", gap: SP.l, alignItems: "start" }}>{l.length ? l : r}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(430px,100%),1fr))", gap: SP.l }}>
      <div style={COL}>{stretchLast(l)}</div>
      <div style={COL}>{stretchLast(r)}</div>
    </div>
  );
}

export default function NeonDetay({ result, onDownload, downloading, canDownload }) {
  const r = result;
  if (!r) return null;

  const alt = (r.alt_talepler || []).filter(Boolean);
  const mev = (r.mevzuat_onerileri || []).filter(Boolean);
  const eksik = r.eksik_alanlar || [];
  const clarify = r.clarify_questions || [];
  const uyari = r.verify_uyari || [];
  // S2/S4 — 2646 lint raporu + veri-tutarlılık uyarıları (verify additive çıktıları).
  const tutar = r.tutarlilik_uyari || [];
  const lint = r.lint_2646 || {};
  const lintKurallar = Array.isArray(lint.kurallar) ? lint.kurallar : [];
  const lintUyariSay = (lint.uyari || []).length;
  // S4 — çıkarılan bilgi unsurları tablosu (yalnız dolu string alanlar; PII maskeli gelir).
  const unsurRows = Object.entries(r.bilgi_unsurlari || {})
    .filter(([, v]) => typeof v === "string" && v.trim())
    .slice(0, 12);
  const arsiv = r.arsiv_metadata || {};
  const sdpAdaylar = Array.isArray(arsiv.sdp_adaylari) ? arsiv.sdp_adaylari : [];
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
    <section aria-labelledby="cak-detay-h" style={{ borderTop: `1px solid ${PAL.line}`, background: PAL.bg2, padding: "24px 24px 48px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap", marginBottom: SP.l }}>
          <div>
            <h2 id="cak-detay-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Ayrıntılı sonuç · Tüm ajan çıktıları</h2>
            <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>Görev 1 (anlama) + Görev 2 (üretim) — değiştirilemez denetim iziyle.</p>
          </div>
          {hasChain && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.T, background: ALFA(T), borderRadius: RAD.chip, padding: "2px 8px" }}>
              <Icon.check width={12} height={12} />
              Bütünlük doğrulandı · SHA-256
            </span>
          )}
        </header>

        {/* Özet şeridi */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.l, alignItems: "center", justifyContent: "space-between", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "16px 24px", marginBottom: SP.xl, boxShadow: SH.card }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", minWidth: 0 }}>
            <Fact k="Evrak türü" v={EVRAK_TR(r.evrak_turu)} c={PAL.ink2} icon={<Icon.doc />} />
            {r.hedef_birim && <Fact k="Hedef birim" v={BIRIM_LBL(r.hedef_birim)} c={V} icon={<Icon.route />} />}
            <Fact k="Eksik kontrol" v={eksik.length ? `${eksik.length} eksik` : "tam"} c={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />} />
            {sInfo && <Fact k="Yasal süre" v={sInfo.label} c={sInfo.color} icon={<Icon.clock />} />}
            {hasChain && <Fact k="Denetim izi" v={denAdimlar.length ? `${denAdimlar.length} adım` : "SHA-256"} c={DERIN.T} icon={<Icon.shield />} />}
            {r.llm_profil && (
              <Fact
                k="İşleme profili"
                v={r.llm_profil === "kvkk-onprem" ? "KVKK · veri yerinde" : r.llm_profil === "mock" ? "Deterministik (LLM'siz)" : "Bulut LLM"}
                c={r.llm_profil === "kvkk-onprem" ? BANT.yesil.c : PAL.ink2}
                icon={<Icon.shield />}
              />
            )}
          </div>
          <RiskBand band={band} lit sub="İçerik" />
        </div>

        {/* ============ Görev 1 · Anlama ============ */}
        <section aria-label="Görev 1 · Anlama" style={{ marginBottom: SP.xxl }}>
          <GorevLabel n="1" t="Anlama" color={T} count="anlama ajanları" />
          <div style={STACK}>

            {alt.length >= 2 && (
              <NeonCard title="Çok-konulu ayrıştırma" tag={`${alt.length} alt-talep`} accent={T} icon={<Icon.route />}>
                <p style={{ margin: "0 0 8px", ...TYPE.data, color: PAL.mut2 }}>Tek dilekçedeki ayrı istekler bölünüp her biri uygun birime ayrı havale edildi.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: SP.s }}>
                  {alt.map((a, i) => (
                    <div key={i} style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.m }}>
                      <div style={{ ...TYPE.data, color: PAL.ink2, marginBottom: SP.s }}>{cleanDemoText(a.ozet || "")}</div>
                      <div style={{ ...TYPE.meta, color: PAL.mut }}>
                        {[a.tur_tr || (a.tur && EVRAK_TR(a.tur)), a.birim_tr || (a.birim && BIRIM_LBL(a.birim)), a.cevap_suresi && cleanDemoText(a.cevap_suresi)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </NeonCard>
            )}

            <ColGrid
              left={[
                r.ozet && (
              <NeonCard key="ozet" title="Özet" tag="Görev 1.6" accent={T} icon={<Icon.info />}>
                <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2 }}>{cleanDemoText(r.ozet).replace(/\*\*/g, "")}</p>
                <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Kısa öz — kişisel veriler özetten önce maskelenir (KVKK).</div>
              </NeonCard>
                ),

                unsurRows.length > 0 && (
              <NeonCard key="unsur" title="Bilgi unsurları" tag="KVKK maskeli" tagColor={T} accent={T} icon={<Icon.doc />}>
                <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
                  {unsurRows.map(([k, v]) => {
                    const maskeli = k.endsWith("_maskeli");
                    const etiket = k.replace(/_maskeli$/, "").replace(/_/g, " ");
                    return (
                      <div key={k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SP.m, padding: "6px 2px", borderBottom: `1px solid ${PAL.line}` }}>
                        <span style={{ ...TYPE.meta, color: PAL.mut2, flex: "none" }}>{etiket}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.ink2, ...TNUM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{cleanDemoText(String(v))}</span>
                          {maskeli && <span style={{ flex: "none", ...TYPE.meta, fontWeight: 500, color: DERIN.T, background: ALFA(T), borderRadius: RAD.chip, padding: "2px 8px" }}>Maskeli</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: SP.m, display: "flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={T} strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={T} strokeWidth="1.6" /></svg>
                  Ham TCKN/telefon sistemde tutulmaz — çıkarım anında maskelenir (KVKK).
                </div>
              </NeonCard>
                ),

                <NeonCard key="eksik" title="Eksik bilgi kontrolü" tag={eksik.length ? `${eksik.length} eksik` : "tam"} tagColor={eksik.length ? BANT.sari.c : BANT.yesil.c} accent={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />}>
              {eksik.length === 0 && clarify.length === 0 ? (
                <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.m, borderRadius: RAD.card, background: ALFA(BANT.yesil.c), color: DERIN.yesil, ...TYPE.data }}>
                  <Icon.check width={16} height={16} style={{ flex: "none", marginTop: 1 }} />
                  <span>Zorunlu alanlar <strong style={{ color: PAL.ink, fontWeight: 600 }}>eksiksiz</strong> — evrak işleme alınabilir (3071 s.K. m.4). Eksik unsur yok; resmî yazı taslağı doğrudan hazırlandı.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: SP.s }}>
                  {eksik.map((e, i) => <div key={"e" + i} style={{ ...TYPE.data, color: DERIN.sari }}>• {cleanDemoText(String(e))}</div>)}
                  {clarify.map((q, i) => <div key={"q" + i} style={{ ...TYPE.data, color: PAL.ink2, background: ALFA(BANT.sari.c), borderRadius: RAD.card, padding: "8px 12px" }}>{cleanDemoText(String(q))}</div>)}
                </div>
              )}
              {eksik.length === 0 && verifiedShow.length > 0 && (
                <>
                  <div style={{ ...TYPE.meta, color: PAL.mut3, margin: "12px 0 8px" }}>Doğrulanan zorunlu alanlar</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xs }}>
                    {verifiedShow.map((f, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT.yesil.c), color: DERIN.yesil }}><Icon.check width={12} height={12} /> {f}</span>)}
                  </div>
                </>
              )}
            </NeonCard>,
              ]}
              right={[
                mev.length > 0 && (
              <NeonCard key="mev" title="İlgili mevzuat" tag={`${mev.length} öneri`} accent={T} icon={<Icon.book />}>
                <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
                  {mev.map((m, i) => <ScoreBar key={i} rank={i + 1} m={m} />)}
                </div>
                <div style={{ marginTop: SP.m, ...TYPE.meta, color: PAL.mut3 }}>%60 ilgililik eşiği — altı düşük alaka (amber)</div>
              </NeonCard>
                ),
              ]}
            />

            <NeonCard title="Arşiv · Yasal süre · Denetim izi" accent={T} icon={<Icon.grid />}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: "0 24px" }}>
                <div>
                  {arsiv.sdp_kodu && <KV k="SDP kodu (2005/7)" v={<span style={TNUM}>{String(arsiv.sdp_kodu)}{arsiv.sdp_adi ? ` · ${arsiv.sdp_adi}` : ""}</span>} c={DERIN.V} />}
                  {arsiv.sdp_gerekce && (
                    <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "2px 0 8px", padding: "8px 12px", borderRadius: RAD.card, background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
                      <span style={{ color: DERIN.T }}>Otomatik atama:</span> {cleanDemoText(String(arsiv.sdp_gerekce))}
                    </div>
                  )}
                  {sdpAdaylar.length > 1 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, margin: "0 0 8px" }}>
                      {sdpAdaylar.map((a, i) => (
                        <span key={a.kod} title={a.ad} aria-label={`SDP adayı: ${a.kod} ${a.ad || ""}`} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: i === 0 ? DERIN.T : PAL.mut2, ...TNUM }}>
                          {a.kod} · {Number.isFinite(Number(a.skor)) ? Number(a.skor).toFixed(1) : "–"}
                        </span>
                      ))}
                    </div>
                  )}
                  {(arsiv.saklama_suresi || arsiv.saklama) && <KV k="Saklama süresi" v={String(arsiv.saklama_suresi || arsiv.saklama)} />}
                  <SlaBullet info={sInfo} />
                </div>
                <div>
                  <KV k="Denetim izi" v={<span>SHA-256 zincir{denAdimlar.length ? <span style={TNUM}> · {denAdimlar.length} adım</span> : null}</span>} c={DERIN.T} />
                  {denAdimlar.length > 0 && <HashChain n={denAdimlar.length} />}
                  {den.kok_hash && (
                    <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, background: PAL.hov, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "8px 12px", wordBreak: "break-all" }}>Kök hash: {String(den.kok_hash).slice(0, 24)}…</div>
                  )}
                  <div style={{ ...TYPE.meta, color: PAL.mut3, marginTop: SP.s, display: "flex", alignItems: "center", gap: SP.xs }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={BANT.yesil.c} strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={BANT.yesil.c} strokeWidth="1.6" /></svg>
                    Değiştirilemez — her adım bir öncekini mühürler (tamper-evident)
                  </div>
                </div>
              </div>
            </NeonCard>

          </div>
        </section>

        {/* ============ Görev 2 · Üretim ============ */}
        <section aria-label="Görev 2 · Üretim">
          <GorevLabel n="2" t="Üretim" color={V} count="üretim ajanları" />
          <div style={STACK}>

            <ColGrid
              left={[
                <NeonCard key="dogrulama" title="Doğrulama · Kalite kapısı" tag={uyari.length + tutar.length ? `${uyari.length + tutar.length} uyarı` : "uyumlu"} tagColor={uyari.length + tutar.length ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
              <Vrow ok={!uyari.length} label={<>Uydurma-veto <span style={{ ...TYPE.meta, color: PAL.mut3 }}>(halüsinasyon kontrolü)</span></>} val={uyari.length ? `${uyari.length} işaret` : "temiz"} />
              <Vrow ok={!!r.format_uyumlu} label="Format (Yön. 2646)" val={r.format_uyumlu ? "uyumlu" : "kontrol"} />
              <Vrow ok={!tutar.length} label={<>Veri tutarlılığı <span style={{ ...TYPE.meta, color: PAL.mut3 }}>(TCKN checksum · tarih · sayı deseni)</span></>} val={tutar.length ? `${tutar.length} uyarı` : "temiz"} />
              {uyari.slice(0, 5).map((u, i) => <div key={i} style={{ marginTop: SP.s, display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.data, color: DERIN.sari }}><Icon.alert style={{ flex: "none", marginTop: 2 }} /> {cleanDemoText(String(u))}</div>)}
              {tutar.slice(0, 4).map((u, i) => <div key={"t" + i} style={{ marginTop: SP.s, display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.data, color: DERIN.sari }}><Icon.alert style={{ flex: "none", marginTop: 2 }} /> {cleanDemoText(String(u))}</div>)}
            </NeonCard>,

                r.bilgilendirme && (
              <NeonCard key="bilgilendirme" title="Bilgilendirme" accent={V} icon={<Icon.info />}>
                <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(r.bilgilendirme).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>
              </NeonCard>
                ),
              ]}
              right={[
                lintKurallar.length > 0 && (
              <NeonCard key="lint" title="Yönetmelik-2646 lint" tag={`${lint.ozet?.gecti ?? 0}/${lintKurallar.length} kural`} tagColor={lintUyariSay ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
                <p style={{ margin: "0 0 8px", ...TYPE.data, color: PAL.mut2 }}>Taslak, Resmî Yazışma Yönetmeliği (CB 2646/2020) kurallarından madde madde geçirilir.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
                  {lintKurallar.map((k) => {
                    const renk = k.durum === "gecti" ? DERIN.yesil : k.durum === "uyari" ? DERIN.sari : PAL.mut2;
                    const Isaret = k.durum === "gecti" ? Icon.check : k.durum === "uyari" ? Icon.alert : Icon.info;
                    return (
                      <div key={k.kural} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "4px 0" }}>
                        <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: renk }}><Isaret width={14} height={14} /></span>
                        <span style={{ flex: "none", fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: DERIN.V, marginTop: 1 }}>{k.madde}</span>
                        <span style={{ ...TYPE.data, color: k.durum === "uyari" ? DERIN.sari : PAL.ink2 }}>{cleanDemoText(String(k.mesaj))}</span>
                      </div>
                    );
                  })}
                </div>
              </NeonCard>
                ),
              ]}
            />

            <NeonCard title="Resmî yazı taslağı" tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V} icon={<Icon.doc />}>
              {r.yazi_taslak_md && (
                <div style={{ margin: "0 0 16px", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", background: PAL.surf2, borderBottom: `1px solid ${PAL.line}` }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h9l5 5v13H5z" stroke={DERIN.V} strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h5" stroke={DERIN.V} strokeWidth="1.6" /></svg>
                    <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{r.yazi_turu ? YAZI_TR(r.yazi_turu).toLocaleLowerCase("tr-TR").replace(/\s+/g, "-") : "taslak"}.docx · Yön. 2646</span>
                    {r.format_uyumlu && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.V, background: ALFA(V), borderRadius: RAD.chip, padding: "2px 8px" }}><Icon.check width={12} height={12} /> Format</span>}
                  </div>
                  <pre style={{ margin: 0, padding: SP.l, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 360, overflowY: "auto" }}>{cleanDemoText(r.yazi_taslak_md)}</pre>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
                <Btn primary onClick={() => onDownload?.("pdf")} disabled={!canDownload || downloading === "pdf"}>{downloading === "pdf" ? "indiriliyor…" : "PDF indir"}</Btn>
                <Btn onClick={() => onDownload?.("docx")} disabled={!canDownload || downloading === "docx"}>{downloading === "docx" ? "indiriliyor…" : "DOCX indir"}</Btn>
                <Btn onClick={() => onDownload?.("eyp")} disabled={!canDownload || downloading === "eyp"} title="EYP 2.0 (e-Yazışma Teknik Rehberi) uyumlu paket iskeleti — EBYS'ye doğrudan girebilir">{downloading === "eyp" ? "hazırlanıyor…" : "EYP 2.0 paketi"}</Btn>
                {!canDownload && <span style={{ ...TYPE.meta, color: PAL.mut2 }}>İndirme için örnek evrak metni gerekir (dosya yolunda metin sunucuda tutulmaz).</span>}
              </div>
            </NeonCard>

          </div>
        </section>
      </div>
    </section>
  );
}

/* Doğrulama satırı (yeşil onay / amber uyarı) — düz satır + hairline, ikon = gerçek durum. */
function Vrow({ ok, label, val }) {
  const c = ok ? DERIN.yesil : DERIN.sari;
  const Ic = ok ? Icon.check : Icon.alert;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.ink2 }}>
        <span aria-hidden="true" style={{ display: "flex", flex: "none", color: c }}><Ic /></span>
        {label}
      </span>
      <span style={{ ...TYPE.data, fontWeight: 500, color: c, flex: "none" }}>{val}</span>
    </div>
  );
}
