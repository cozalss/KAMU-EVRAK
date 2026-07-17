/* NeonDetay — ayrıntılı sonuç bölümü (yarışma-kalitesi). Komuta merkezinin ORTA panelinde
   gömülü yaşar (embedded); istenirse tam-genişlik bölüm olarak da çizilebilir.
   Hero Light v2 "Sakin Ürün" + gözlemlenebilirlik-aracı bilgi mimarisi (Langfuse/Braintrust/
   Stripe desenleri): en üstte HÜKÜM ŞERİDİ (tek bakışta sonuç + telemetri), solda
   yapışkan bölüm navigasyonu (scroll-spy, yalnız yeterli alanda), belge analizi (teal) /
   taslak ve yönlendirme (lavanta) grupları, NLI destekli mevzuat satırları ve kâğıt-görünümlü
   resmî yazı önizlemesi. Tümü GERÇEK ProcessResponse.
   Yaprak bileşenler: NeonDetayParts.jsx */
import { cloneElement, useEffect, useState } from "react";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, NeonCard, RiskBand, Icon, focusRing } from "./neonUi.jsx";
import {
  Chip, HukumDurak, GorevLabel, slaInfo, subSlaRenk, MevzuatRow, SlaPanel,
  DuzeltmeDiff, Vrow, KanitAlinti, BilgilendirmeYapisal,
  Lint2646Karti,
} from "./NeonDetayParts.jsx";
import {
  hukumYorum, ozetDipnot, unsurEtiket, eksikYorum, mevzuatDipnot,
  birimDipnot, lintGiris, decomposeGiris,
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
  { id: "det-g1", l: "Belge analizi", col: T },
  { id: "det-g2", l: "Taslak ve yönlendirme", col: V },
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
export default function NeonDetay({ result, embedded = false, onMevzuatAc = null, onMevzuatSec = null, seciliMevzuat = [], yanTaslak = null, solPanel = null }) {
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
  const band = r.risk_metadata?.bant || "yesil";
  const bantC = BANT[band]?.c || BANT.yesil.c;   // hüküm şeridi + gerekçe bloğu ortak kullanır
  const riskGerekce = Array.isArray(r.risk_metadata?.gerekceler) ? r.risk_metadata.gerekceler.filter(Boolean).slice(0, 4) : [];
  const sInfo = slaInfo(sla);
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

  // Duruma-uygun anlatı katmanı (detayYorum motoru) — statik iddia yok, hepsi state-türevli.
  const hy = hukumYorum(r);
  // Hüküm başlığı " · " ayracından bölünür (yalnız SUNUM — motor metni değişmez): ana hüküm
  // büyük, kontrol-noktası/onay kuyruğu tonlu ikinci satır. Yeşilde kuyruk zaten yoktur.
  const [hukumAna, ...hukumKuyruk] = String(hy.baslik).split(" · ");
  const hukumDetay = hukumKuyruk.join(" · ");
  const uy = unsurEtiket(r);
  const ey = eksikYorum(r);
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
        <header style={{ marginBottom: SP.xl }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: DERIN.yesil, fontFamily: MONO, fontWeight: 600, letterSpacing: ".06em" }}>
            <Icon.check width={13} height={13} /> SONUÇ HAZIR
          </span>
          <h2 id="cak-detay-h" style={{ margin: "6px 0 0", ...TYPE.h2, color: PAL.ink }}>İnceleme ve karar</h2>
          <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>Önerilen yönlendirmeyi ve taslağı gözden geçirip kararınızı verin.</p>
        </header>

        {/* Önce karar özeti ve taslak yan yana: memurun ilk bakışta ihtiyaç duyduğu iki yüzey. */}
        <div style={{ display: "grid", gridTemplateColumns: yanTaslak ? "repeat(auto-fit, minmax(min(360px,100%), 1fr))" : "1fr", gap: SP.l, alignItems: "stretch", marginBottom: SP.xl }}>
        {/* Karar özeti — İLK GÖRÜLEN kart.
            Eski hâli ortalanmış küçük bir blok + üst/alt asılı boşluktu; yeni kompozisyon
            kartın TÜM boyunu 3 bölgeye dağıtır: ÜSTTE hüküm (tonlu disk + sonuç + risk bandı
            satırı), ORTADA evrak→birim güzergâh rayı (dikey ağırlık merkezi, flex:1 ortalar),
            ALTTA "Ne yapmalısınız" (marginTop:auto ile alt kenara sabit). Üst 3px şerit hüküm
            tonunu taşır (renk tek sinyal değil — ikon+metin+RiskBand aynı bilgiyi söyler).
            Bölgeler 0/50/100ms nu-rise kademesiyle girer (tek sefer, reduced-motion söner). */}
        <div id="det-ozet" style={{ display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden", animation: "nu-rise .16s var(--ke-ease-out) both", scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl, minWidth: 0 }}>
          <span aria-hidden="true" style={{ height: 3, background: TON[hy.ton] || DERIN.sari, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 24px 24px", minWidth: 0 }}>

            {/* ── 1) Hüküm — ilk okunan satır. Başlık " · " ayracından bölünür: ana hüküm
                TYPE.num (karar-kritik boy paritesi, MASTER), kontrol/onay kuyruğu tonlu
                ikinci satır — uzun amber/kırmızı başlıklar tek dev satır olarak sarmaz. */}
            <div style={{ animation: "nu-rise .18s var(--ke-ease-out) both" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: SP.l }}>
                {/* Tonlu durum diski — Chip ile aynı dil (yalnız ALFA tint, kenarlık yok);
                    nu-pop = tamamlanma vuruşu (RiskBand aktif noktasıyla aynı desen). */}
                <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: RAD.dot, background: ALFA(BANT[hy.ton]?.c || BANT.sari.c), color: TON[hy.ton] || DERIN.sari, flexShrink: 0, animation: "nu-pop .3s var(--ke-ease-out) both" }}>
                  {hy.ton === "yesil" ? <Icon.check width={24} height={24} /> : <Icon.alert width={24} height={24} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", ...TYPE.ui, color: PAL.mut3, marginBottom: 2 }}>İşlem sonucu</span>
                  {/* Lider satır TYPE.disp — ekranın tek "display" ögesi (neonUi tip ölçeği notu). */}
                  <span role="status" style={{ display: "block", ...TYPE.disp, color: PAL.ink }}>
                    {hukumAna}
                    {hukumDetay && <span style={{ display: "block", ...TYPE.ui, fontWeight: 500, color: TON[hy.ton] || DERIN.sari, marginTop: SP.xs }}>{hukumDetay}</span>}
                  </span>
                </span>
              </div>
              {/* Bant yalnız risk_guard gerçekten çalıştıysa çizilir — yokluk yeşil sayılmaz.
                  Tam-genişlik telemetri satırı: dar yarı-genişlikte başlığın yanında sıkışıp
                  sarmıyor, kendi hairline-ayrılmış rayında duruyor. */}
              {r.risk_metadata?.bant && (
                <div style={{ marginTop: SP.l, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
                  <RiskBand band={band} lit sub="İçerik" />
                </div>
              )}
            </div>

            {/* ── 2) Güzergâh — "bu evrak ne / nereye gidiyor" 2 karar-kritik olgu, dikey
                durak rayında (HukumDurak): okundu (T, anlama) → yönlendirildi (V, üretim).
                flex:1 + ortalama: eşit-boy modunda (yanTaslak) kartın orta ağırlık merkezi —
                boşluk asılı kalmaz, kompozisyona dağılır. MASTER: TYPE.num yalnız bu ikisi. */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", margin: `${SP.xl}px 0 0`, animation: "nu-rise .18s var(--ke-ease-out) 50ms both" }}>
              <HukumDurak k="Evrak türü" v={EVRAK_TR(r.evrak_turu)} hat={T} icon={<Icon.doc width={18} height={18} />}
                meter={turGuven} sub={turGuven != null ? `%${turGuven} güven` : null} son={!r.hedef_birim} />
              {r.hedef_birim && (
                // Değerler yukarıda türetildi (dosya deseni: derived const'lar return öncesi).
                // sub düz string — HukumDurak zaten TYPE.data/PAL.mut2 ile sarar (çift sarma yok).
                <HukumDurak k="Yönlendirilecek birim" v={buyukBirim} c={V} hat={V} icon={<Icon.route width={17} height={17} />}
                  sub={birimBaglamGoster ? `genel havale birimi: ${genelBirim}` : null} son />
              )}
            </div>

            {/* ── 3) "Ne yapmalısınız" — ikinci soruya doğrudan cevap; marginTop:auto kartın
                ALT kenarına sabitler (üstte hüküm, ortada güzergâh, altta eylem). */}
            {r.risk_metadata?.oneri && (
              // Kart içinde kart yasak (NeonDetayParts.jsx:137) — yalnız tint zemin, kenarlık yok;
              // dosyadaki diğer ALFA(...) uyarı kutularıyla aynı desen (satır ~439/447/479).
              // İkon banda göre değişir: yeşilde "sorun yok" onayı, sarı/kırmızıda gerçek uyarı —
              // Icon.alert'i her bantta göstermek renk=tek sinyal ilkesini bozardı.
              <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", marginTop: "auto", paddingTop: SP.xl, animation: "nu-rise .18s var(--ke-ease-out) 100ms both" }}>
                <div style={{ flex: 1, display: "flex", gap: SP.m, alignItems: "flex-start", padding: SP.l, borderRadius: RAD.card, background: ALFA(bantC), minWidth: 0 }}>
                  <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginTop: 3, color: DERIN_OF(bantC) }}>
                    {band === "yesil" ? <Icon.check width={17} height={17} /> : <Icon.alert width={17} height={17} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", ...TYPE.read, fontWeight: 600, color: PAL.ink }}>Ne yapmalısınız</span>
                    <span style={{ display: "block", ...TYPE.read, color: PAL.ink2, marginTop: 2 }}>{cleanDemoText(String(r.risk_metadata.oneri))}</span>
                  </span>
                </div>
              </div>
            )}

            {/* İkincil olgular ve risk gerekçeleri ilk karar yüzeyinden ayrıdır: eksik bilgi,
                mevzuat, yasal süre ve ayrıntılı değerlendirmeler aşağıdaki inceleme alanlarında
                kalır. Hüküm şeridi yalnız sonucu, türü, birimi ve önerilen eylemi taşır. */}

          </div>
        </div>
        {/* SAĞ yarı — resmî yazı taslağı (yalnız CanliAjanAkisi geçince). */}
        {yanTaslak && <div style={{ minWidth: 0 }}>{yanTaslak}</div>}
        </div>

        {/* Kaynak belge karar yüzeyinin altında kalır: gerektiğinde kanıt kontrolü için erişilir,
            ancak taslak ve karar eylemleriyle ilk bakışta rekabet etmez. */}
        {solPanel && <section aria-label="Kaynak belge" style={{ marginBottom: SP.xl }}>{solPanel}</section>}

        {/* ============ Gövde: yapışkan bölüm rayı + içerik ============ */}
        <div style={{ display: "flex", gap: SP.xl, alignItems: "flex-start" }}>
          {wide && <BolumRay ustOfset={embedded ? YAPISKAN_UST : SP.xl} />}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ============ Belge analizi ============ */}
            <section id="det-g1" aria-label="Belge analizi" style={{ marginBottom: SP.xxl, scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl, animation: "nu-rise .18s var(--ke-ease-out) both" }}>
              <GorevLabel n="1" t="Belge analizi" color={T} count="inceleme alanları" />
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
                      // Dürüstlük sunumu (SonucCalismaAlani.MevzuatCard ile aynı): tüm öneriler
                      // zayıfsa satır-başı "İnsan incelemesi" spam'ı yerine tek sakin uyarı.
                      const hepsiZayif = mev.every((m) => (m.guven || "") === "düşük");
                      return (
                      <NeonCard key="mev" title="İlgili mevzuat" tag={secSay ? `${mev.length} öneri · ${secSay} işlendi` : `${mev.length} öneri`} tagColor={secSay ? DERIN.T : (hepsiZayif ? BANT.sari.c : undefined)} accent={T} icon={<Icon.book />}>
                        {hepsiZayif && (
                          <div role="status" style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.m, marginBottom: SP.m, borderRadius: RAD.card, background: ALFA(BANT.sari.c), ...TYPE.data, color: PAL.ink2 }}>
                            <Icon.alert width={15} height={15} style={{ flex: "none", marginTop: 1, color: DERIN.sari }} aria-hidden="true" />
                            <span>
                              <strong style={{ color: DERIN.sari, fontWeight: 600 }}>Güçlü bir mevzuat eşleşmesi bulunamadı.</strong>{" "}
                              Aşağıdaki öneriler yalnızca sözcüksel benzerlikten geldi (düşük güven) ve bu talebi
                              doğrudan karşılamayabilir. Dayanak olarak kullanmadan önce ilgili maddeyi açıp el ile doğrulayın.
                            </span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {mev.map((m, i) => (
                            <MevzuatRow key={i} rank={i + 1} m={m} nli={nliMap.get(m.baslik)} ilk={i === 0} onAc={onMevzuatAc}
                              secili={seciliSet.has(m.baslik)}
                              onSec={secilebilir ? (checked) => onMevzuatSec(m, checked) : null}
                              inceleme={!hepsiZayif} />
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
                  right={[]}
                />

              </div>
            </section>

            {/* ============ Taslak ve yönlendirme ============ */}
            <section id="det-g2" aria-label="Taslak ve yönlendirme" style={{ scrollMarginTop: embedded ? YAPISKAN_UST : SP.xl, animation: "nu-rise .18s var(--ke-ease-out) 40ms both" }}>
              <GorevLabel n="2" t="Taslak ve yönlendirme" color={V} count="karar destekleri" />
              <div style={STACK}>

                <ColGrid
                  left={[
                    /* Risk değerlendirmesi — hüküm şeridinden TAŞINDI (ilk ekran sade). Bant özeti
                       yukarıda hükümde; nedenler + ağırlık çubukları + skor + teknik ayrıntı burada. */
                    (r.risk_metadata?.aciklama || riskGerekce.length > 0) && (() => {
                      const yorumlar = riskGerekce.map((g) => riskGerekceYorum(String(g))).filter(Boolean);
                      const sy = riskSkorYorum(Number(r.risk_metadata?.skor), r.risk_metadata?.katkilar, band, r.risk_metadata?.kalibrasyon);
                      return (
                        <NeonCard key="risk" title="Risk değerlendirmesi" tag={BANT[band]?.l} tagColor={bantC} accent={V} icon={<Icon.alert />}>
                          {r.risk_metadata?.aciklama && r.risk_metadata.aciklama !== r.risk_metadata?.oneri && (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
                              <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: PAL.mut2 }}><Icon.info width={14} height={14} /></span>
                              <span style={{ ...TYPE.data, color: PAL.ink2 }}>{cleanDemoText(String(r.risk_metadata.aciklama))}</span>
                            </div>
                          )}
                          {yorumlar.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: r.risk_metadata?.aciklama ? SP.s : 0 }}>
                              {yorumlar.map((y, i) => {
                                const pay = sy?.paylar?.[i];
                                return (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2 }}>
                                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: bantC, flex: "none" }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>{y.cevrildi ? y.sade : cleanDemoText(y.sade)}</span>
                                    {pay != null && (
                                      <>
                                        <span aria-hidden="true" style={{ width: 110, height: 6, borderRadius: RAD.chip, background: PAL.press, overflow: "hidden", flexShrink: 0 }}>
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
                          {sy && <div style={{ ...TYPE.meta, color: PAL.ink2, marginTop: SP.s }}>{sy.baslik}.</div>}
                          {(yorumlar.some((y) => y.cevrildi) || sy) && (
                            <details style={{ marginTop: SP.s }}>
                              <summary {...focusRing} style={{ ...TYPE.meta, color: PAL.mut3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, borderRadius: RAD.ctl, outline: "none" }}>
                                Teknik ayrıntı (sistem kaydı)
                              </summary>
                              <div style={{ marginTop: SP.xs, padding: SP.s, background: PAL.surfHi, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", gap: SP.xs }}>
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
                        </NeonCard>
                      );
                    })(),

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
