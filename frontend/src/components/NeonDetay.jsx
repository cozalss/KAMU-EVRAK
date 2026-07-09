/* NeonDetay — ayrıntılı sonuç bölümü (yarışma-kalitesi). Komuta merkezinin ORTA panelinde
   gömülü yaşar (embedded); istenirse tam-genişlik bölüm olarak da çizilebilir.
   Hero Light v2 "Sakin Ürün" + gözlemlenebilirlik-aracı bilgi mimarisi (Langfuse/Braintrust/
   Vercel/Stripe desenleri): en üstte HÜKÜM ŞERİDİ (tek bakışta sonuç + telemetri), solda
   yapışkan bölüm navigasyonu (scroll-spy, yalnız yeterli alanda), Görev 1 (anlama, teal) /
   Görev 2 (üretim, lavanta) grupları, kopyalanabilir SHA-256 zinciri, NLI destekli mevzuat
   satırları, kâğıt-görünümlü resmî yazı önizleme. Tümü GERÇEK ProcessResponse.
   Yaprak bileşenler: NeonDetayParts.jsx */
import { cloneElement, useEffect, useState } from "react";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, NeonCard, KV, RiskBand, Icon, focusRing } from "./neonUi.jsx";
import {
  Chip, Fact, GorevLabel, slaInfo, subSlaRenk, MevzuatRow, SlaPanel,
  CopyChip, ZincirStepper, DuzeltmeDiff, Vrow, KanitAlinti,
} from "./NeonDetayParts.jsx";

/* Bölüm düzeni — kartlar dikey ritimde: tam-genişlik satırlar + dengeli sütun grubu. */
const STACK = { display: "flex", flexDirection: "column", gap: SP.l };
const COL = { ...STACK, minWidth: 0 };
/* Sütunun son kartı kalan boşluğu doldurur → iki sütunun alt kenarı hizalanır. */
const stretchLast = (cards) => cards.map((c, i) => (i === cards.length - 1 ? cloneElement(c, { style: { ...c.props.style, flex: 1 } }) : c));
/* Dengeli iki sütun: kısa kartlar bir sütunda üst üste, uzun kart karşısında. auto-fit dar
   ekranda tek sütuna düşürür; taraflardan biri boşsa düz responsive grid'e döner. */
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

/* Geniş ekran testi — yan navigasyon rayı yalnız yeterli alan varsa çizilir. */
function useWide(q = "(min-width: 1180px)") {
  const [w, setW] = useState(() => window.matchMedia?.(q)?.matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const fn = (e) => setW(e.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [q]);
  return w;
}

/* Bölüm navigasyonu (Linear/Stripe detay-sayfası deseni) — yapışkan ray + scroll-spy. */
/* col: görev bölümleri hat rengini taşır (Görev 1 = T, Görev 2 = V) — rayda nokta +
   aktif durumda kendi hat renginde çubuk/metin; izleme şeridiyle aynı renk dili. */
const SECS = [
  { id: "det-ozet", l: "Özet" },
  { id: "det-g1", l: "Görev 1 · Anlama", col: T },
  { id: "det-g2", l: "Görev 2 · Üretim", col: V },
];
/* Üst durum çubuğu (CanliAjanAkisi header) sticky ve ~90px yüksek — gömülü modda ray ve
   bölüm scroll-hedefleri onun ALTINA yapışmalı; yoksa rayın üst linkleri çubuğun arkasında
   gizli kalır (görülen hata: "Görev 1 yok"). */
const YAPISKAN_UST = 112;   // üst çubuk ~88px + nefes

function BolumRay({ ustOfset = SP.xl }) {
  const [aktif, setAktif] = useState("det-ozet");
  useEffect(() => {
    const els = SECS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((ents) => {
      const gorunur = ents.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (gorunur[0]) setAktif(gorunur[0].target.id);
    }, { rootMargin: "-15% 0px -65% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const git = (id) => {
    const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    document.getElementById(id)?.scrollIntoView({ behavior: az ? "auto" : "smooth", block: "start" });
  };
  return (
    <nav aria-label="Sonuç bölümleri" style={{ position: "sticky", top: ustOfset, width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ ...TYPE.meta, color: PAL.mut3, padding: "0 10px", marginBottom: SP.xs }}>Bölümler</span>
      {SECS.map((s) => {
        const on = aktif === s.id;
        const hat = s.col || T;   // görev bölümü kendi hat rengini taşır; diğerleri T
        return (
          <button key={s.id} type="button" onClick={() => git(s.id)} aria-current={on ? "true" : undefined} {...focusRing}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = on ? PAL.press : "transparent"; }}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, textAlign: "left", padding: "6px 10px", border: "none", borderLeft: `2px solid ${on ? hat : "transparent"}`, borderRadius: `0 ${RAD.ctl}px ${RAD.ctl}px 0`, background: on ? PAL.press : "transparent", ...TYPE.data, fontWeight: on ? 500 : 400, color: on ? DERIN_OF(hat) : PAL.mut2, transition: "background .12s ease-out" }}>
            {s.col && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: s.col, flexShrink: 0 }} />}
            {s.l}
          </button>
        );
      })}
    </nav>
  );
}

/* İşleme süresi biçimi — metrik: SANS + TNUM (mono yasak). */
const sureFmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} sn` : `${ms} ms`);

/* Unsur anahtarı ↔ kanıt span etiketi eşleme: span etiketleri insan dili ("T.C. Kimlik No",
   "Gönderen"), unsur anahtarları makine dili ("tckn", "gonderen") → Türkçe harf katlamalı
   normalize edip karşılaştır. */
const trKatla = (s) => String(s).toLocaleLowerCase("tr-TR")
  .replace(/ö/g, "o").replace(/ü/g, "u").replace(/ç/g, "c")
  .replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ı/g, "i")
  .replace(/[^a-z0-9]/g, "");
function kanitSpanBul(spanlar, anahtar) {
  const hedef = trKatla(anahtar.replace(/_maskeli$/, ""));
  return (spanlar || []).find((sp) => {
    const l = trKatla(sp?.label || "");
    return l === hedef || (hedef === "tckn" && l.includes("kimlik")) || (l === "tckn" && hedef.includes("kimlik"));
  }) || null;
}

export default function NeonDetay({ result, embedded = false }) {
  const r = result;
  // Gömülü modda panel sütunu dardır → bölüm rayı ancak çok geniş pencerede açılır.
  const wide = useWide(embedded ? "(min-width: 1560px)" : "(min-width: 1180px)");
  if (!r) return null;

  const alt = (r.alt_talepler || []).filter(Boolean);
  const mev = (r.mevzuat_onerileri || []).filter(Boolean);
  const nliMap = new Map((r.mevzuat_nli || []).filter((n) => n && n.baslik).map((n) => [n.baslik, n]));
  const eksik = r.eksik_alanlar || [];
  const clarify = r.clarify_questions || [];
  const uyari = r.verify_uyari || [];
  const tutar = r.tutarlilik_uyari || [];
  const lint = r.lint_2646 || {};
  const lintKurallar = (Array.isArray(lint.kurallar) ? lint.kurallar : []).filter((k) => k && typeof k === "object");
  const lintUyariSay = (lint.uyari || []).length;
  // Çıkarılan bilgi unsurları: string satırlar tabloya, boolean varlık kontrolleri çip dizisine.
  const unsurRows = Object.entries(r.bilgi_unsurlari || {})
    .filter(([, v]) => typeof v === "string" && v.trim())
    .slice(0, 12);
  const unsurBool = Object.entries(r.bilgi_unsurlari || {}).filter(([, v]) => typeof v === "boolean");
  const arsiv = r.arsiv_metadata || {};
  // arsiv_metadata / lint_2646 backend'de düz dict (iç doğrulama yok) → bozuk öğe render'ı düşürmesin.
  const sdpAdaylar = (Array.isArray(arsiv.sdp_adaylari) ? arsiv.sdp_adaylari : []).filter((a) => a && typeof a === "object");
  const sla = r.sla_metadata || {};
  const den = r.denetim_izi || {};
  const denAdimlar = Array.isArray(den.zincir) ? den.zincir : (Array.isArray(den.adimlar) ? den.adimlar : []);
  const band = r.risk_metadata?.bant || "yesil";
  const riskGerekce = Array.isArray(r.risk_metadata?.gerekceler) ? r.risk_metadata.gerekceler.filter(Boolean).slice(0, 4) : [];
  const sInfo = slaInfo(sla);
  const hasChain = denAdimlar.length > 0 || !!den.kok_hash;
  const butunluk = den.butunluk !== false;
  const birimAday = (r.birim_alternatifleri || []).filter(Boolean).filter((b) => b !== r.hedef_birim).slice(0, 3);
  const turGuven = Number(r.tur_confidence) > 0 ? Math.round(Number(r.tur_confidence) * 100) : null;
  const ocrGuven = r.ocr_confidence != null && Number.isFinite(Number(r.ocr_confidence)) ? Math.round(Number(r.ocr_confidence) * 100) : null;

  // Hüküm (verdict) — tüm kalite sinyallerinin tek cümlelik özeti (Vercel deploy başlığı deseni).
  const kontrolSay = uyari.length + tutar.length + eksik.length;
  const sorunsuz = kontrolSay === 0;

  // Doğrulanan zorunlu alanlar (kanıtlı çıkarım etiketleri → fallback bilgi_unsurlari anahtarları).
  const verified = [];
  {
    const seen = new Set();
    for (const sp of (r.kanit_metadata?.spanlar || [])) { if (sp?.label && !seen.has(sp.label)) { seen.add(sp.label); verified.push(cleanDemoText(sp.label)); } }
    if (verified.length === 0 && r.bilgi_unsurlari) { for (const k of Object.keys(r.bilgi_unsurlari)) { if (!seen.has(k)) { seen.add(k); verified.push(k.replace(/_/g, " ")); } } }
  }
  const verifiedShow = verified.slice(0, 8);

  return (
    <section aria-labelledby="cak-detay-h" style={embedded
      ? { minWidth: 0 }
      : { borderTop: `1px solid ${PAL.line}`, background: PAL.bg2, padding: "24px 24px 48px" }}>
      <div style={embedded ? { minWidth: 0 } : { maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap", marginBottom: SP.l }}>
          <div>
            <h2 id="cak-detay-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Ayrıntılı sonuç · Tüm ajan çıktıları</h2>
            <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>Görev 1 (anlama) + Görev 2 (üretim) — değiştirilemez denetim iziyle.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
            {hasChain && (
              <Chip c={butunluk ? T : BANT.sari.c} label={butunluk ? "Bütünlük doğrulandı, SHA-256 zinciri tutarlı" : "Bütünlük doğrulanamadı"}>
                {butunluk ? <Icon.check width={12} height={12} /> : <Icon.alert width={12} height={12} />}
                {butunluk ? "Bütünlük doğrulandı · SHA-256" : "Bütünlük doğrulanamadı"}
              </Chip>
            )}
          </div>
        </header>

        {/* ============ Hüküm şeridi — tek bakışta sonuç + telemetri ============ */}
        <div id="det-ozet" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "16px 24px", marginBottom: SP.xl, boxShadow: SH.card, animation: "nu-rise .16s ease-out both", scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
                <span aria-hidden="true" style={{ display: "flex", color: sorunsuz ? DERIN.yesil : DERIN.sari }}>
                  {sorunsuz ? <Icon.check width={18} height={18} /> : <Icon.alert width={18} height={18} />}
                </span>
                <span role="status" style={{ ...TYPE.h2, color: PAL.ink }}>
                  {sorunsuz ? "İşlem sorunsuz tamamlandı" : `İşlem tamamlandı · ${kontrolSay} kontrol noktası`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", marginTop: SP.s }}>
                {r.islem_id && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs }}>
                    <span style={{ ...TYPE.meta, color: PAL.mut3 }}>İşlem no</span>
                    <CopyChip deger={r.islem_id} kisa={String(r.islem_id).slice(0, 14)} label="İşlem numarasını panoya kopyala" />
                  </span>
                )}
                {r.sure_ms != null && <span style={{ ...TYPE.data, color: PAL.mut2, ...TNUM }}>işleme {sureFmt(r.sure_ms)}</span>}
                {denAdimlar.length > 0 && <span style={{ ...TYPE.data, color: PAL.mut2, ...TNUM }}>{denAdimlar.length} zincir halkası</span>}
              </div>
            </div>
            <RiskBand band={band} lit sub="İçerik" />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginTop: SP.l, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
            <Fact k="Evrak türü" v={turGuven != null ? `${EVRAK_TR(r.evrak_turu)} · %${turGuven}` : EVRAK_TR(r.evrak_turu)} c={PAL.ink2} icon={<Icon.doc />} />
            {r.hedef_birim && <Fact k="Hedef birim" v={BIRIM_LBL(r.hedef_birim)} c={V} icon={<Icon.route />} />}
            <Fact k="Eksik kontrol" v={eksik.length ? `${eksik.length} eksik` : "tam"} c={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />} />
            {sInfo && <Fact k="Yasal süre" v={sInfo.label} c={sInfo.color} icon={<Icon.clock />} />}
            {ocrGuven != null && <Fact k="OCR güveni" v={`%${ocrGuven}`} c={ocrGuven >= 80 ? BANT.yesil.c : BANT.sari.c} icon={<Icon.doc />} />}
            {r.llm_profil && (
              <Fact
                k="İşleme profili"
                v={r.llm_profil === "kvkk-onprem" ? "KVKK · veri yerinde" : r.llm_profil === "mock" ? "Deterministik (LLM'siz)" : "Bulut LLM"}
                c={r.llm_profil === "kvkk-onprem" ? BANT.yesil.c : PAL.ink2}
                icon={<Icon.shield />}
              />
            )}
          </div>

          {(r.risk_metadata?.aciklama || riskGerekce.length > 0) && (
            <div style={{ marginTop: SP.l, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
              {r.risk_metadata?.aciklama && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
                  <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: PAL.mut2 }}><Icon.info width={14} height={14} /></span>
                  <span style={{ ...TYPE.data, color: PAL.ink2 }}>{cleanDemoText(String(r.risk_metadata.aciklama))}</span>
                </div>
              )}
              {riskGerekce.length > 0 && (() => {
                /* Risk skoru kırılımı (Phoenix "explanation" deseni): skor gerekçelere eşit
                   bölünür (backend gerekçe-başına ağırlık vermez — dürüst yaklaşım) →
                   her satırda katkı çubuğu + yüzde. */
                const skor = Number(r.risk_metadata?.skor);
                const pay = Number.isFinite(skor) && skor > 0 ? skor / riskGerekce.length : null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: riskGerekce.length && r.risk_metadata?.aciklama ? SP.s : 0 }}>
                    {riskGerekce.map((g, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2 }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: BANT[band]?.c || BANT.yesil.c, flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>{cleanDemoText(String(g))}</span>
                        {pay != null && (
                          <>
                            <span aria-hidden="true" style={{ width: 110, height: 6, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden", flexShrink: 0 }}>
                              <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.round(pay * 100))}%`, background: BANT[band]?.c || BANT.yesil.c, borderRadius: RAD.chip }} />
                            </span>
                            <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut3, width: 34, textAlign: "right", flexShrink: 0 }}>%{Math.round(pay * 100)}</span>
                          </>
                        )}
                      </div>
                    ))}
                    {pay != null && (
                      <div style={{ ...TYPE.meta, color: PAL.mut3, marginTop: 2 }}>Skor katkıları eşit bölüşümle gösterilir — toplam risk skoru: {skor}</div>
                    )}
                  </div>
                );
              })()}
              {r.risk_metadata?.oneri && r.risk_metadata.oneri !== r.risk_metadata.aciklama && (
                <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}><span style={{ color: PAL.mut3 }}>Önerilen eylem:</span> {cleanDemoText(String(r.risk_metadata.oneri))}</div>
              )}
            </div>
          )}
        </div>

        {/* ============ Gövde: yapışkan bölüm rayı + içerik ============ */}
        <div style={{ display: "flex", gap: SP.xl, alignItems: "flex-start" }}>
          {wide && <BolumRay ustOfset={embedded ? YAPISKAN_UST : SP.xl} />}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ============ Görev 1 · Anlama ============ */}
            <section id="det-g1" aria-label="Görev 1 · Anlama" style={{ marginBottom: SP.xxl, scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl }}>
              <GorevLabel n="1" t="Anlama" color={T} count="anlama ajanları" />
              <div style={STACK}>

                {alt.length >= 2 && (
                  <NeonCard title="Çok-konulu ayrıştırma" tag={`${alt.length} alt-talep`} accent={T} icon={<Icon.route />}>
                    <p style={{ margin: "0 0 8px", ...TYPE.data, color: PAL.mut2 }}>Tek dilekçedeki ayrı istekler bölünüp her biri uygun birime ayrı havale edildi.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: SP.s }}>
                      {alt.map((a, i) => {
                        const asla = a.sla_durum ? slaInfo({ durum: a.sla_durum }) : null;
                        return (
                          <div key={i} style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.m }}>
                            <div style={{ ...TYPE.data, color: PAL.ink2, marginBottom: SP.s }}>{cleanDemoText(a.ozet || "")}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
                              <span style={{ ...TYPE.meta, color: PAL.mut, minWidth: 0 }}>
                                {[a.tur_tr || (a.tur && EVRAK_TR(a.tur)), a.birim_tr || (a.birim && BIRIM_LBL(a.birim)), a.yazi_turu && YAZI_TR(a.yazi_turu), a.cevap_suresi && cleanDemoText(a.cevap_suresi)].filter(Boolean).join(" · ")}
                              </span>
                              {asla && subSlaRenk(a.sla_durum) && <Chip c={subSlaRenk(a.sla_durum)} label={`Bu alt-talebin yasal süre durumu: ${asla.label}`}>{asla.label}</Chip>}
                            </div>
                          </div>
                        );
                      })}
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
                            // Kanıt popover'ı: unsur ↔ kaynak span eşleşmesi (hover/odakla açılır).
                            const span = kanitSpanBul(r.kanit_metadata?.spanlar, k);
                            return (
                              <KanitAlinti key={k} span={span} metin={r.kanit_metadata?.metin || ""}>
                                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SP.m, padding: "6px 2px", borderBottom: `1px solid ${PAL.line}`, cursor: span ? "help" : "default" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut2, flex: "none" }}>
                                    {span && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: DERIN.T }}><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M9 12 L11 14 L15 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                    {etiket}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
                                    <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.ink2, ...TNUM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{cleanDemoText(String(v))}</span>
                                    {maskeli && <Chip c={T} label="Bu alan KVKK gereği maskelendi">Maskeli</Chip>}
                                  </span>
                                </span>
                              </KanitAlinti>
                            );
                          })}
                        </div>
                        {unsurBool.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: SP.m }}>
                            {unsurBool.map(([k, v]) => {
                              const etiket = k === "pii_var" ? "PII" : k.replace(/_/g, " ");
                              const pozitifMetin = k === "pii_var" ? "tespit → maskelendi" : "var";
                              return (
                                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: v ? DERIN.yesil : PAL.mut3 }}>
                                  {v ? <Icon.check width={12} height={12} /> : <Icon.x width={12} height={12} />}
                                  {etiket} {v ? pozitifMetin : "yok"}
                                </span>
                              );
                            })}
                          </div>
                        )}
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
                          <span>Zorunlu alanlar <strong style={{ color: PAL.ink, fontWeight: 600 }}>eksiksiz</strong> — evrak işleme alınabilir. Eksik unsur yok; resmî yazı taslağı doğrudan hazırlandı.</span>
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
                            {verifiedShow.map((f, i) => <Chip key={i} c={BANT.yesil.c}><Icon.check width={12} height={12} /> {f}</Chip>)}
                          </div>
                        </>
                      )}
                    </NeonCard>,
                  ]}
                  right={[
                    mev.length > 0 && (
                      <NeonCard key="mev" title="İlgili mevzuat" tag={`${mev.length} öneri`} accent={T} icon={<Icon.book />}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {mev.map((m, i) => <MevzuatRow key={i} rank={i + 1} m={m} nli={nliMap.get(m.baslik)} ilk={i === 0} />)}
                        </div>
                        <div style={{ marginTop: SP.xs, ...TYPE.meta, color: PAL.mut3 }}>%60 ilgililik eşiği — altı düşük alaka (amber). Anlamsal destek NLI entailment ile ölçülür.</div>
                      </NeonCard>
                    ),
                  ]}
                />

                <ColGrid
                  left={[
                    <NeonCard key="arsiv" title="Arşiv · Yasal süre" accent={T} icon={<Icon.grid />}>
                      {arsiv.sdp_kodu && <KV k="SDP kodu (2005/7)" v={<span style={TNUM}>{String(arsiv.sdp_kodu)}{arsiv.sdp_adi ? ` · ${arsiv.sdp_adi}` : ""}</span>} c={DERIN.V} />}
                      {arsiv.sdp_gerekce && (
                        <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "8px 0" }}>
                          <span style={{ color: DERIN.T }}>Otomatik atama:</span> {cleanDemoText(String(arsiv.sdp_gerekce))}
                        </div>
                      )}
                      {sdpAdaylar.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, margin: "0 0 8px" }}>
                          {sdpAdaylar.map((a, i) => (
                            <span key={a.kod || i} title={a.ad} aria-label={`SDP adayı: ${a.kod} ${a.ad || ""}`} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: i === 0 ? DERIN.T : PAL.mut2, ...TNUM }}>
                              {a.kod} · {Number.isFinite(Number(a.skor)) ? Number(a.skor).toFixed(1) : "–"}
                            </span>
                          ))}
                        </div>
                      )}
                      {(arsiv.saklama_suresi || arsiv.saklama) && <KV k="Saklama süresi" v={String(arsiv.saklama_suresi || arsiv.saklama)} />}
                      <SlaPanel sla={sla} info={sInfo} />
                    </NeonCard>,
                  ]}
                  right={[
                    hasChain && (
                      <NeonCard key="denetim" title="Denetim izi · SHA-256" tag={denAdimlar.length ? `${denAdimlar.length} halka` : null} accent={T} icon={<Icon.shield />}>
                        <ZincirStepper zincir={denAdimlar} kokHash={den.kok_hash} butunluk={butunluk} />
                        <div style={{ ...TYPE.meta, color: PAL.mut3, marginTop: SP.m, display: "flex", alignItems: "center", gap: SP.xs }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={BANT.yesil.c} strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={BANT.yesil.c} strokeWidth="1.6" /></svg>
                          Değiştirilemez — her halka bir öncekinin hash'ini içerir (tamper-evident)
                        </div>
                      </NeonCard>
                    ),
                  ]}
                />

              </div>
            </section>

            {/* ============ Görev 2 · Üretim ============ */}
            <section id="det-g2" aria-label="Görev 2 · Üretim" style={{ scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl }}>
              <GorevLabel n="2" t="Üretim" color={V} count="üretim ajanları" />
              <div style={STACK}>

                <ColGrid
                  left={[
                    <NeonCard key="dogrulama" title="Doğrulama · Kalite kapıları" tag={uyari.length + tutar.length ? `${uyari.length + tutar.length} uyarı` : "uyumlu"} tagColor={uyari.length + tutar.length ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
                      <Vrow ok={!uyari.length} label={<>Uydurma-veto <span style={{ ...TYPE.meta, color: PAL.mut3 }}>(halüsinasyon kontrolü)</span></>} val={uyari.length ? `${uyari.length} işaret` : "temiz"} />
                      <Vrow ok={!!r.format_uyumlu} label="Format (Yön. 2646)" val={r.format_uyumlu ? "uyumlu" : "kontrol"} />
                      <Vrow ok={!tutar.length} label={<>Veri tutarlılığı <span style={{ ...TYPE.meta, color: PAL.mut3 }}>(TCKN checksum · tarih · sayı deseni)</span></>} val={tutar.length ? `${tutar.length} uyarı` : "temiz"} />
                      {r.verify_notes && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}>{cleanDemoText(String(r.verify_notes))}</div>}
                      {uyari.slice(0, 5).map((u, i) => <div key={i} style={{ marginTop: SP.s, display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.data, color: DERIN.sari }}><Icon.alert style={{ flex: "none", marginTop: 2 }} /> {cleanDemoText(String(u))}</div>)}
                      {tutar.slice(0, 4).map((u, i) => <div key={"t" + i} style={{ marginTop: SP.s, display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.data, color: DERIN.sari }}><Icon.alert style={{ flex: "none", marginTop: 2 }} /> {cleanDemoText(String(u))}</div>)}
                      {r.lint_duzeltme_md && (
                        <div style={{ marginTop: SP.m }}>
                          <div style={{ ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>Önerilen düzeltme (Yön. 2646) — mevcut taslakla fark</div>
                          <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>Otomatik öneri — memur onayı olmadan uygulanmaz. Eklenen satır "+", çıkarılan satır "−" ile işaretlidir.</div>
                          <DuzeltmeDiff eski={cleanDemoText(String(r.yazi_taslak_md || ""))} yeni={cleanDemoText(String(r.lint_duzeltme_md))} />
                        </div>
                      )}
                    </NeonCard>,

                    r.bilgilendirme && (
                      <NeonCard key="bilgilendirme" title="Bilgilendirme" accent={V} icon={<Icon.info />} bodyCenter>
                        <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(r.bilgilendirme).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>
                      </NeonCard>
                    ),
                  ]}
                  right={[
                    r.hedef_birim && (
                      <NeonCard key="birim" title="Birim yönlendirme" tag={birimAday.length ? `${birimAday.length + 1} aday değerlendirildi` : null} accent={V} icon={<Icon.route />}>
                        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
                          <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>1.</span>
                          <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{BIRIM_LBL(r.hedef_birim)}</span>
                          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.V }}>
                            <Icon.check width={12} height={12} /> havale edildi
                          </span>
                        </div>
                        {birimAday.map((b, i) => (
                          <div key={b} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
                            <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{i + 2}.</span>
                            <span style={{ ...TYPE.data, color: PAL.mut2 }}>{BIRIM_LBL(b)}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Sıralama içerik sinyali + birim görev alanı eşleşmesiyle yapılır; nihai havale memur onayındadır.</div>
                      </NeonCard>
                    ),

                    lintKurallar.length > 0 && (
                      <NeonCard key="lint" title="Yönetmelik-2646 lint" tag={`${lint.ozet?.gecti ?? 0}/${lintKurallar.length} kural`} tagColor={lintUyariSay ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
                        <p style={{ margin: "0 0 8px", ...TYPE.data, color: PAL.mut2 }}>Taslak, Resmî Yazışma Yönetmeliği (CB 2646/2020) kurallarından madde madde geçirilir.</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
                          {lintKurallar.map((k, i) => {
                            const renk = k.durum === "gecti" ? DERIN.yesil : k.durum === "uyari" ? DERIN.sari : PAL.mut2;
                            const Isaret = k.durum === "gecti" ? Icon.check : k.durum === "uyari" ? Icon.alert : Icon.info;
                            return (
                              <div key={k.kural || i} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "4px 0" }}>
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

              </div>
            </section>

          </div>
        </div>
      </div>
    </section>
  );
}
