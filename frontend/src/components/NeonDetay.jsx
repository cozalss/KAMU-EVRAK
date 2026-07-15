/* NeonDetay — ayrıntılı sonuç bölümü (yarışma-kalitesi). Komuta merkezinin ORTA panelinde
   gömülü yaşar (embedded); istenirse tam-genişlik bölüm olarak da çizilebilir.
   Hero Light v2 "Sakin Ürün" + gözlemlenebilirlik-aracı bilgi mimarisi (Langfuse/Braintrust/
   Stripe desenleri): en üstte HÜKÜM ŞERİDİ (tek bakışta sonuç + telemetri), solda
   yapışkan bölüm navigasyonu (scroll-spy, yalnız yeterli alanda), Görev 1 (anlama, teal) /
   Görev 2 (üretim, lavanta) grupları, kopyalanabilir SHA-256 zinciri, NLI destekli mevzuat
   satırları, kâğıt-görünümlü resmî yazı önizleme. Tümü GERÇEK ProcessResponse.
   Yaprak bileşenler: NeonDetayParts.jsx */
import { cloneElement, useEffect, useState } from "react";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, NeonCard, KV, RiskBand, Icon, focusRing } from "./neonUi.jsx";
import {
  Chip, Fact, StatTile, GorevLabel, slaInfo, subSlaRenk, MevzuatRow, SlaPanel,
  CopyChip, ZincirStepper, DuzeltmeDiff, Vrow, KanitAlinti, BilgilendirmeYapisal,
  Lint2646Karti,
} from "./NeonDetayParts.jsx";
import {
  hukumYorum, ozetDipnot, unsurEtiket, eksikYorum, mevzuatDipnot,
  birimDipnot, denetimDipnot, lintGiris, decomposeGiris,
  riskGerekceYorum, riskSkorYorum,
} from "../lib/detayYorum.js";

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
    // Konum-tabanlı scroll-spy: aktif bölüm = başlığı okuma çizgisini (yapışkan çubuk
    // altı) EN SON geçen bölüm. Eski IO bandı (%15-35) son bölüm kısaysa hiç tetiklenmiyordu
    // (klasik son-bölüm hatası — "Görev 2'ye gelmiyor" bulgusu); sayfa dibi fallback'i de var.
    const els = SECS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length) return undefined;
    let raf = 0;
    const hesapla = () => {
      raf = 0;
      const cizgi = ustOfset + 24;
      let id = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= cizgi) id = el.id;
      }
      // Sayfa dibi: son bölüm çizgide asla duramayacak kadar kısa olsa bile aktifleşir.
      const kok = document.scrollingElement || document.documentElement;
      if (window.innerHeight + window.scrollY >= kok.scrollHeight - 4) {
        id = els[els.length - 1].id;
      }
      setAktif(id);
    };
    const iste = () => { if (!raf) raf = requestAnimationFrame(hesapla); };
    hesapla();
    window.addEventListener("scroll", iste, { passive: true });
    window.addEventListener("resize", iste, { passive: true });
    return () => {
      window.removeEventListener("scroll", iste);
      window.removeEventListener("resize", iste);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ustOfset]);
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

/* onMevzuatAc({dosya, maddeNo}) — öneri satırından mevzuat okuma modalına köprü (DashboardApp
   state'i taşır; window-event yok). Verilmezse başlıklar düz metin kalır (gömülü/izole kullanım).
   onMevzuatSec(m, checked) + seciliMevzuat — kutucuk kurgusu: işaretlenen madde resmî yazıya
   dayanak olarak işlenir (DashboardApp /yazi/dayanak ile taslağı yeniden kurar). Verilmezse
   kutucuk gösterilmez (öneriler salt-okunur). */
export default function NeonDetay({ result, embedded = false, onMevzuatAc = null, onMevzuatSec = null, seciliMevzuat = [] }) {
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
  const bantC = BANT[band]?.c || BANT.yesil.c;   // hüküm şeridi + gerekçe bloğu ortak kullanır
  const riskGerekce = Array.isArray(r.risk_metadata?.gerekceler) ? r.risk_metadata.gerekceler.filter(Boolean).slice(0, 4) : [];
  const sInfo = slaInfo(sla);
  const hasChain = denAdimlar.length > 0 || !!den.kok_hash;
  const butunluk = den.butunluk !== false;
  const birimAday = (r.birim_alternatifleri || []).filter(Boolean).filter((b) => b !== r.hedef_birim).slice(0, 3);
  // Hüküm şeridi birim göstergesi: BÜYÜK değer = LLM'in içerikten seçtiği somut gerçek birim
  // (servis_birimi.ad), yoksa deterministik genel havale birimi (hedef_birim, ölçülü 9-set) fallback.
  // Genel havale birimi LLM biriminden farklıysa küçük "genel havale birimi:" bağlam satırı görünür.
  // BIRIM_GOSTER: basin_halkla_iliskiler_cimer kovasında "CİMER" yalnız evrak GERÇEKTEN CİMER/
  // bilgi-edinme türündeyse gösterilir; düz dilekçede halkla ilişkiler/başvuru-kayıt kanalı (yanlış CİMER yok).
  const genelBirim = r.hedef_birim ? BIRIM_GOSTER(r.hedef_birim, r.evrak_turu) : "";
  const llmBirimAd = r.servis_birimi?.ad || "";
  const buyukBirim = llmBirimAd || genelBirim;
  const birimBaglamGoster = !!llmBirimAd && llmBirimAd !== genelBirim;
  const turGuven = Number(r.tur_confidence) > 0 ? Math.round(Number(r.tur_confidence) * 100) : null;
  const ocrGuven = r.ocr_confidence != null && Number.isFinite(Number(r.ocr_confidence)) ? Math.round(Number(r.ocr_confidence) * 100) : null;

  // Duruma-uygun anlatı katmanı (detayYorum motoru) — statik iddia yok, hepsi state-türevli.
  const hy = hukumYorum(r);
  const uy = unsurEtiket(r);
  const ey = eksikYorum(r);
  const dy = denetimDipnot(butunluk, denAdimlar.length);
  const TON = { yesil: DERIN.yesil, sari: DERIN.sari, kirmizi: DERIN.kirmizi };

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
                <span aria-hidden="true" style={{ display: "flex", color: TON[hy.ton] || DERIN.sari }}>
                  {hy.ton === "yesil" ? <Icon.check width={18} height={18} /> : <Icon.alert width={18} height={18} />}
                </span>
                <span role="status" style={{ ...TYPE.h2, color: PAL.ink }}>{hy.baslik}</span>
              </div>
            </div>
            {/* Bant yalnız risk_guard gerçekten çalıştıysa çizilir — yokluk yeşil sayılmaz. */}
            {r.risk_metadata?.bant && <RiskBand band={band} lit sub="İçerik" />}
          </div>

          {/* ============ Glanceable katman — "bu evrak ne / nereye gidiyor" 2 büyük olgu.
              MASTER.md: TYPE.num = panel metrikleri; hüküm şeridinde yalnız BU ikisi büyür,
              geri kalanı (aşağıda) küçük kalır — enflasyon değil, tekli önceliklendirme. ============ */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xxl, marginTop: SP.l }}>
            <StatTile k="Evrak türü" v={EVRAK_TR(r.evrak_turu)} sub={turGuven != null ? `%${turGuven} güven` : null} icon={<Icon.doc />} />
            {r.hedef_birim && (
              // Değerler yukarıda türetildi (dosya deseni: derived const'lar return öncesi).
              // sub düz string — StatTile zaten TYPE.meta/PAL.mut3 ile sarar (çift sarma yok).
              <StatTile k="Yönlendirilecek birim" v={buyukBirim} c={V} icon={<Icon.route />}
                sub={birimBaglamGoster ? `genel havale birimi: ${genelBirim}` : null} />
            )}
          </div>

          {/* ============ "Ne yapmalısınız" — ikinci soruya doğrudan cevap; artık gerekçe
              bloğunun dibinde soluk metin değil, hükmün hemen altında bant rengiyle vurgulu. ============ */}
          {r.risk_metadata?.oneri && (
            // Kart içinde kart yasak (NeonDetayParts.jsx:137) — yalnız tint zemin, kenarlık yok;
            // dosyadaki diğer ALFA(...) uyarı kutularıyla aynı desen (satır ~439/447/479).
            // İkon banda göre değişir: yeşilde "sorun yok" onayı, sarı/kırmızıda gerçek uyarı —
            // Icon.alert'i her bantta göstermek renk=tek sinyal ilkesini bozardı.
            <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", marginTop: SP.l, padding: SP.m, borderRadius: RAD.card, background: ALFA(bantC) }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginTop: 2, color: DERIN_OF(bantC) }}>
                {band === "yesil" ? <Icon.check width={15} height={15} /> : <Icon.alert width={15} height={15} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink }}>Ne yapmalısınız</span>
                <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, marginTop: 2 }}>{cleanDemoText(String(r.risk_metadata.oneri))}</span>
              </span>
            </div>
          )}

          {/* ============ İkincil olgular + audit meta — küçük, düşük vurgulu; ilgilenen kazar. ============ */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginTop: SP.l, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
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
            {r.islem_id && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs }}>
                <span style={{ ...TYPE.meta, color: PAL.mut3 }}>İşlem no</span>
                <CopyChip deger={r.islem_id} kisa={String(r.islem_id).slice(0, 14)} label="İşlem numarasını panoya kopyala" />
              </span>
            )}
            {r.sure_ms != null && <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>işleme {sureFmt(r.sure_ms)}</span>}
            {denAdimlar.length > 0 && <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{denAdimlar.length} zincir halkası</span>}
          </div>

          {(r.risk_metadata?.aciklama || riskGerekce.length > 0) && (() => {
            /* Risk kırılımı memur diliyle sunulur: ham backend gerekçesi makine sözleşmesidir
               (risk_guard/muzakere/eval aynı stringe bakar) → çevirisi detayYorum'da yapılır,
               ham metin "Teknik ayrıntı" katlanabilir bölümünde birebir korunur (bilgi kaybı yok).
               Çubuk = backend'in gerekçe-başına ağırlığı (ciddiyet × ölçülen isabet); gerekçe
               sayısına BÖLÜNMEZ — bkz. agents/risk_agirlik.py + eval/risk_calibration.py.
               "Ne yapmalısınız" burada TEKRAR EDİLMEZ — üstte hükmün hemen altında zaten vurgulu. */
            const yorumlar = riskGerekce.map((g) => riskGerekceYorum(String(g))).filter(Boolean);
            const sy = riskSkorYorum(Number(r.risk_metadata?.skor), r.risk_metadata?.katkilar,
              band, r.risk_metadata?.kalibrasyon);
            return (
              <div style={{ marginTop: SP.l, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
                {/* aciklama sık sık oneri ile AYNI string'tir (backend: aciklama = llm_aciklama or
                    oneri; yeşilde LLM hiç çağrılmaz) — oneri üstte zaten vurgulandıysa burada
                    tekrar basılmaz (2026-07-14 review: aynı cümle iki kez görünüyordu). */}
                {r.risk_metadata?.aciklama && r.risk_metadata.aciklama !== r.risk_metadata?.oneri && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
                    <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: PAL.mut2 }}><Icon.info width={14} height={14} /></span>
                    <span style={{ ...TYPE.data, color: PAL.ink2 }}>{cleanDemoText(String(r.risk_metadata.aciklama))}</span>
                  </div>
                )}
                {yorumlar.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: r.risk_metadata?.aciklama ? SP.s : 0 }}>
                    {yorumlar.map((y, i) => {
                      const pay = sy?.paylar?.[i];   // bu nedenin KENDİ ağırlığı (bölünmemiş)
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2 }}>
                          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: bantC, flex: "none" }} />
                          {/* Çevrilemeyen (beklenmedik) şekilde ham metin gösterilir → cleanDemoText yalnız orada. */}
                          <span style={{ flex: 1, minWidth: 0 }}>{y.cevrildi ? y.sade : cleanDemoText(y.sade)}</span>
                          {pay != null && (
                            <>
                              <span aria-hidden="true" style={{ width: 110, height: 6, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden", flexShrink: 0 }}>
                                <span style={{ display: "block", height: "100%", width: `${Math.min(100, pay)}%`, background: bantC, borderRadius: RAD.chip }} />
                              </span>
                              <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut3, width: 34, textAlign: "right", flexShrink: 0 }} title={`Bu nedenin ağırlığı: %${pay}`}>%{pay}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {sy && (
                  <div style={{ ...TYPE.meta, color: PAL.ink2, marginTop: SP.s }}>{sy.baslik}.</div>
                )}
                {(yorumlar.some((y) => y.cevrildi) || sy) && (
                  <details style={{ marginTop: SP.s }}>
                    <summary
                      {...focusRing}
                      style={{ ...TYPE.meta, color: PAL.mut3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, borderRadius: RAD.ctl, outline: "none" }}
                    >
                      Teknik ayrıntı (sistem kaydı)
                    </summary>
                    <div style={{ marginTop: SP.xs, padding: SP.s, background: PAL.surfHi, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", gap: SP.xs }}>
                      {/* Skor metodolojisi (çubuk = ne demek, kalibrasyon durumu) burada — ana
                          görünüm sadeleşsin diye buraya taşındı; bilgi kaybolmadı, yalnız isteyerek
                          açılır (2026-07-14 kullanıcı geri bildirimi: "sade ve etkili olmalı"). */}
                      {sy && (sy.not || sy.kalibrasyonNot) && (
                        <div style={{ ...TYPE.meta, color: PAL.mut2 }}>{sy.not}{sy.kalibrasyonNot && <> {sy.kalibrasyonNot}</>}</div>
                      )}
                      {yorumlar.map((y, i) => (
                        <code key={i} style={{ ...TYPE.meta, fontFamily: MONO, color: PAL.mut2, wordBreak: "break-word" }}>{y.teknik}</code>
                      ))}
                      {sy && <code style={{ ...TYPE.meta, fontFamily: MONO, color: PAL.mut3, wordBreak: "break-word" }}>{sy.teknik}</code>}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
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
                    <p style={{ margin: "0 0 8px", ...TYPE.data, color: PAL.mut2 }}>{decomposeGiris(alt)}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: SP.s }}>
                      {alt.map((a, i) => {
                        const asla = a.sla_durum ? slaInfo({ durum: a.sla_durum }) : null;
                        return (
                          <div key={i} style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.m }}>
                            <div style={{ ...TYPE.data, color: PAL.ink2, marginBottom: SP.s }}>{cleanDemoText(a.ozet || "")}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
                              <span style={{ ...TYPE.meta, color: PAL.mut, minWidth: 0 }}>
                                {[a.tur_tr || (a.tur && EVRAK_TR(a.tur)), (a.birim && BIRIM_GOSTER(a.birim, a.tur)) || a.birim_tr, a.yazi_turu && YAZI_TR(a.yazi_turu), a.cevap_suresi && cleanDemoText(a.cevap_suresi)].filter(Boolean).join(" · ")}
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
                        <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{ozetDipnot(r)}</div>
                      </NeonCard>
                    ),

                    unsurRows.length > 0 && (
                      <NeonCard key="unsur" title="Bilgi unsurları" tag={uy.tag} tagColor={T} accent={T} icon={<Icon.doc />}>
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
                          {uy.dipnot}
                        </div>
                      </NeonCard>
                    ),

                    <NeonCard key="eksik" title="Eksik bilgi kontrolü" tag={eksik.length ? `${eksik.length} eksik` : "tam"} tagColor={eksik.length ? BANT.sari.c : BANT.yesil.c} accent={eksik.length ? BANT.sari.c : BANT.yesil.c} icon={<Icon.shield />}>
                      {eksik.length === 0 && clarify.length === 0 ? (
                        <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.m, borderRadius: RAD.card, background: ALFA(BANT.yesil.c), color: DERIN.yesil, ...TYPE.data }}>
                          <Icon.check width={16} height={16} style={{ flex: "none", marginTop: 1 }} />
                          <span>{ey.metin}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: SP.s }}>
                          <div style={{ ...TYPE.data, fontWeight: 500, color: DERIN.sari }}>{ey.metin}</div>
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
                    mev.length > 0 && (() => {
                      // Kutucuk kurgusu: işaretli maddeler resmî yazıya "Dayanak" bloğu olarak işlenir.
                      // Seçim başlıkla eşlenir (nliMap ile aynı anahtar) — çıkarınca taslak geri alınır.
                      const seciliSet = new Set((seciliMevzuat || []).map((x) => x && x.baslik).filter(Boolean));
                      const secSay = mev.filter((m) => seciliSet.has(m.baslik)).length;
                      const secilebilir = !!onMevzuatSec;
                      return (
                      <NeonCard key="mev" title="İlgili mevzuat" tag={secSay ? `${mev.length} öneri · ${secSay} işlendi` : `${mev.length} öneri`} tagColor={secSay ? DERIN.T : undefined} accent={T} icon={<Icon.book />}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {mev.map((m, i) => (
                            <MevzuatRow key={i} rank={i + 1} m={m} nli={nliMap.get(m.baslik)} ilk={i === 0} onAc={onMevzuatAc}
                              secili={seciliSet.has(m.baslik)}
                              onSec={secilebilir ? (checked) => onMevzuatSec(m, checked) : null} />
                          ))}
                        </div>
                        {/* Görev 2 sözleşmesi (kutucuk kurgusu): öneri OTOMATİK girmez; memur kutucukla
                            İŞARETLERSE dayanak olarak yazıya işlenir, çıkarınca geri alınır. Yanlış madde
                            sessizce sızmaz — atıf daima memurun açık seçimidir (CLAUDE.md §1). */}
                        <div style={{ marginTop: SP.m, display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.s, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: PAL.ink2 }}>
                          <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1, color: DERIN.T }} />
                          <span>{secilebilir
                            ? "Öneriler otomatik eklenmez. Kutucuğu işaretlediğiniz madde(ler) resmî yazıya dayanak olarak işlenir; işareti kaldırınca taslak geri alınır. Atıftan önce maddeyi açıp doğrulayın."
                            : "Bu öneriler bilgi amaçlıdır; yazı taslağına otomatik eklenmez. Atıf yapacaksanız maddeyi açıp doğrulayın."}</span>
                        </div>
                        <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{mevzuatDipnot(r)}</div>
                      </NeonCard>
                      );
                    })(),
                  ]}
                />

                <ColGrid
                  left={[
                    <NeonCard key="arsiv" title="Arşiv · Yasal süre" accent={T} icon={<Icon.grid />}>
                      {/* Arşiv sınıflandırma — SDP kodu + saklama süresi yan yana mini-stat
                          (SLA alt-ızgarasıyla aynı desen → kart içi tutarlılık; süresiz
                          evrakta kart sparse/düz görünmesin diye stat düzeni). */}
                      {(arsiv.sdp_kodu || arsiv.saklama_suresi || arsiv.saklama) && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: `${SP.s}px ${SP.l}px` }}>
                          {arsiv.sdp_kodu && (
                            <span>
                              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Dosya planı · SDP (2005/7)</span>
                              <span style={{ ...TYPE.data, fontWeight: 600, color: DERIN.V, ...TNUM }}>{String(arsiv.sdp_kodu)}</span>
                              {arsiv.sdp_adi && <span style={{ ...TYPE.meta, color: PAL.mut2 }}> · {cleanDemoText(String(arsiv.sdp_adi))}</span>}
                            </span>
                          )}
                          {(arsiv.saklama_suresi || arsiv.saklama) && (
                            <span>
                              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Saklama süresi</span>
                              <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2, ...TNUM }}>{String(arsiv.saklama_suresi || arsiv.saklama)}</span>
                            </span>
                          )}
                        </div>
                      )}
                      {arsiv.sdp_gerekce && (
                        <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "8px 0 0" }}>
                          <span style={{ color: DERIN.T }}>Otomatik atama:</span> {cleanDemoText(String(arsiv.sdp_gerekce))}
                        </div>
                      )}
                      {sdpAdaylar.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, margin: "8px 0 0" }}>
                          {sdpAdaylar.map((a, i) => (
                            <span key={a.kod || i} title={a.ad} aria-label={`SDP adayı: ${a.kod} ${a.ad || ""}`} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: i === 0 ? DERIN.T : PAL.mut2, ...TNUM }}>
                              {a.kod} · {Number.isFinite(Number(a.skor)) ? Number(a.skor).toFixed(1) : "–"}
                            </span>
                          ))}
                        </div>
                      )}
                      <SlaPanel sla={sla} info={sInfo} />
                    </NeonCard>,
                  ]}
                  right={[
                    hasChain && (
                      <NeonCard key="denetim" title="Denetim izi · SHA-256" tag={denAdimlar.length ? `${denAdimlar.length} halka` : null} accent={T} icon={<Icon.shield />}>
                        <ZincirStepper zincir={denAdimlar} kokHash={den.kok_hash} butunluk={butunluk} />
                        <div style={{ ...TYPE.meta, color: dy.ton === "yesil" ? PAL.mut3 : DERIN.sari, marginTop: SP.m, display: "flex", alignItems: "center", gap: SP.xs }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={butunluk ? BANT.yesil.c : BANT.sari.c} strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={butunluk ? BANT.yesil.c : BANT.sari.c} strokeWidth="1.6" /></svg>
                          {dy.metin}
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
                      // Yapısal bildirim (GOV.UK ne-oldu/sırada/yapılacak) varsa onu render et;
                      // eski kayıtlar (yapı öncesi persist) düz metin fallback'inde kalır.
                      <NeonCard key="bilgilendirme" title="Bilgilendirme" accent={V} icon={<Icon.info />} bodyCenter={!r.bilgilendirme_yapisal?.surum}>
                        {r.bilgilendirme_yapisal?.surum
                          ? <BilgilendirmeYapisal y={r.bilgilendirme_yapisal} />
                          : <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(r.bilgilendirme).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>}
                      </NeonCard>
                    ),
                  ]}
                  right={[
                    r.hedef_birim && (
                      <NeonCard key="birim" title="Birim yönlendirme" tag={birimAday.length ? `${birimAday.length + 1} aday değerlendirildi` : null} accent={V} icon={<Icon.route />}>
                        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
                          <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>1.</span>
                          <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)}</span>
                          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.V }}>
                            <Icon.check width={12} height={12} /> havale edildi
                          </span>
                        </div>
                        {birimAday.map((b, i) => (
                          <div key={b} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
                            <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{i + 2}.</span>
                            <span style={{ ...TYPE.data, color: PAL.mut2 }}>{BIRIM_GOSTER(b, r.evrak_turu)}</span>
                          </div>
                        ))}
                        {/* ADDITIVE: LLM'in içerikten seçtiği somut gerçek birim (kurum dairesi
                            veya hizmet müdürlüğü); büyük göstergede birincil, burada gerekçesiyle. */}
                        {r.servis_birimi?.ad && (
                          <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 0 2px", marginTop: SP.xs, borderTop: `1px dashed ${PAL.line}` }}>
                            <Icon.route width={13} height={13} aria-hidden="true" style={{ color: DERIN_OF(V), flex: "none" }} />
                            <span style={{ ...TYPE.data, color: PAL.ink2 }}>
                              <span style={{ color: PAL.mut2 }}>İçerikten önerilen birim: </span>
                              <strong style={{ fontWeight: 600 }}>{r.servis_birimi.ad}</strong>
                              {Array.isArray(r.servis_birimi.sinyal) && r.servis_birimi.sinyal.length > 0 && (
                                <span style={{ ...TYPE.meta, color: PAL.mut3 }}> · içerik: {r.servis_birimi.sinyal.join(", ")}</span>
                              )}
                            </span>
                          </div>
                        )}
                        <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{cleanDemoText(birimDipnot(r))}</div>
                      </NeonCard>
                    ),

                    lintKurallar.length > 0 && (
                      // Durum-gruplu, iki-seviye açılır denetim (satır → yönetmelik lafzı
                      // + düzeltme) — gövde Lint2646Karti'da (NeonDetayParts).
                      <NeonCard key="lint" title="Yazışma kuralları denetimi (Yön. 2646)" tag={`${lint.ozet?.gecti ?? 0}/${lintKurallar.length} kural`} tagColor={lintUyariSay ? BANT.sari.c : BANT.yesil.c} accent={V} icon={<Icon.shield />}>
                        <Lint2646Karti lint={lint} giris={lintGiris(lint)} />
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
