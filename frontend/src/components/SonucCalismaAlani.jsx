import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVRAK_TR } from "./result-cards.jsx";
import { Chip, slaInfo, Vrow, KanitAlinti } from "./NeonDetayParts.jsx";
import { unsurEtiket, eksikYorum, canliKaynakYorum } from "../lib/detayYorum.js";
import { T, V, PAL, BANT, DERIN, ALFA, RAD, SP, SH, NeonCard, Icon, odakDongusu, TYPE, focusRing } from "./neonUi.jsx";
import { arr, clean, plain } from "./sonucOrtak.js";
import { talepleriSuz } from "../lib/sonucEtiket.js";
import DecisionCard from "./HukumKarti.jsx";
import { SONUC_CSS } from "./sonucStil.js";
import { kagitStilYukle } from "./kagitDoku.js";
import { useDayanakIpligi, DayanakSeridi, DayanakKatmani } from "./DayanakIpligi.jsx";
import { AltTaleplerCard, MevzuatCard, ArchiveSlaCard, RiskCard, ValidationCard, RoutingCard, LintCard } from "./SonucDestekKartlari.jsx";
import { gosterimBirimi } from "../lib/gosterimBirimi.js";
import YazismaPaketiKarti from "./YazismaPaketiKarti.jsx";

const TRUNCATED_TEXT_RE = /(?:\.{3}|…)\s*$/;

function ensureSentenceEnd(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function kaynakGovdeOzeti(r) {
  const kaynak = clean(r?.kanit_metadata?.metin || "");
  if (!kaynak) return "";
  const satirlar = kaynak.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const govde = [];
  for (const line of satirlar) {
    if (/^(ad[ıi]\s*soyad[ıi]|t\.?\s*c\.?\s*kimlik|adres|telefon|imza)\s*:/i.test(line)) break;
    if (/^t\.?\s*c\.?$/i.test(line)) continue;
    if (/^(tarih|konu|say[ıi])\s*:/i.test(line)) continue;
    const harfVar = /\p{L}/u.test(line);
    const buyukBaslik = harfVar && line.length <= 90 && line === line.toLocaleUpperCase("tr-TR");
    if (buyukBaslik) continue;
    govde.push(line);
  }
  return govde.join(" ").replace(/\s+/g, " ").trim();
}

function ozetGorunumMetni(r) {
  const mevcut = plain(r?.ozet || "");
  if (mevcut && !TRUNCATED_TEXT_RE.test(mevcut)) return mevcut;

  const unsurlar = r?.bilgi_unsurlari || {};
  const ust = [
    EVRAK_TR(r?.evrak_turu),
    unsurlar.konu ? `Konu: ${clean(unsurlar.konu)}` : "",
    unsurlar.tarih ? `Tarih: ${clean(unsurlar.tarih)}` : "",
  ].filter(Boolean).join(" — ");
  const govde = kaynakGovdeOzeti(r);
  const tam = [ust, govde].filter(Boolean).map(ensureSentenceEnd).join(" ");
  return tam || mevcut.replace(TRUNCATED_TEXT_RE, ".") || "Bu sonuçta özet üretilemedi.";
}


const ALAN_ETIKET = {
  gonderen: "Gönderen",
  kurum: "Kurum",
  konu: "Konu",
  tarih: "Tarih",
  sayi: "Sayı",
  tckn_maskeli: "T.C. Kimlik No",
  telefon_maskeli: "Telefon",
  talep: "Somut talep",
  iletisim_adres: "İletişim adresi",
  imza: "İmza",
  pii_var: "Kişisel veri",
};

function alanEtiket(key) {
  if (ALAN_ETIKET[key]) return ALAN_ETIKET[key];
  return String(key || "")
    .replace(/_maskeli$/, "")
    .replace(/_/g, " ")
    .replace(/\b\p{L}/gu, (m) => m.toLocaleUpperCase("tr-TR"));
}

function degerYaz(value, key = "") {
  if (typeof value === "boolean") return value ? "Var" : "Yok";
  // Talepler: antet artığı ("T.C") ve "Konu:" öneki memura sızmasın (backend çıkarım kusuru).
  if (key === "talepler") return talepleriSuz(value).join(" · ");
  if (Array.isArray(value)) return value.map(clean).join(", ");
  return clean(value);
}

const trKatla = (s) => String(s || "")
  .toLocaleLowerCase("tr-TR")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u")
  .replace(/ç/g, "c")
  .replace(/ş/g, "s")
  .replace(/ğ/g, "g")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9]/g, "");

function kanitSpanBul(spanlar, anahtar) {
  const hedef = trKatla(String(anahtar || "").replace(/_maskeli$/, ""));
  return arr(spanlar).find((sp) => {
    const label = trKatla(sp?.label || sp?.alan || "");
    return label === hedef
      || (hedef === "tckn" && label.includes("kimlik"))
      || (hedef === "telefon" && label.includes("telefon"));
  }) || null;
}

function SwapButton({ children, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...focusRing}
      data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SP.xs,
        minHeight: 28,
        padding: "4px 10px",
        borderRadius: RAD.ctl,
        border: `1px solid ${PAL.line}`,
        background: PAL.surf,
        color: PAL.ink2,
        ...TYPE.meta,
        fontWeight: 600,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptySource() {
  return (
    <div className="sc-source-placeholder" style={{ borderColor: PAL.line, background: PAL.surf }}>
      <Icon.doc />
      Kaynak belge bulunamadı
    </div>
  );
}

function SummaryContent({ r }) {
  return (
    <p className="sc-source-summary-text" style={{ color: PAL.ink2 }}>{ozetGorunumMetni(r)}</p>
  );
}

function SummarySwapPanel({ r, onBelge }) {
  return (
    <div className="sc-source-summary-card" style={{ borderColor: PAL.line, background: PAL.surf, boxShadow: SH.card }}>
      <div className="sc-source-summary-head" style={{ borderBottomColor: PAL.line }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.info /></span>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 60 }}>Özet</span>
        <SwapButton icon={<Icon.doc width={13} height={13} />} onClick={onBelge}>Okunan belge</SwapButton>
      </div>
      <div className="sc-source-summary-body" style={{ background: PAL.surf2 }}>
        <div className="sc-source-summary-paper" style={{ borderColor: PAL.line, background: PAL.surf, boxShadow: SH.pop }}>
          <SummaryContent r={r} />
        </div>
      </div>
    </div>
  );
}

function ExtractedInfoQuickCard({ r, onOpen }) {
  const unsurSayisi = Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false && degerYaz(v, k) !== "")
    .length;
  const entries = Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false && degerYaz(v, k) !== "")
    .slice(0, 5);
  const uy = unsurEtiket(r);

  return (
    <NeonCard title="Belgeden çıkarılan bilgiler" tag={uy.tag || (unsurSayisi ? `${unsurSayisi} alan` : "boş")} tagColor={T} accent={T} icon={<Icon.doc />} style={{ height: "100%" }}>
      {entries.length ? (
        <div className="sc-quick-info-list">
          {entries.map(([key, value]) => (
            <div key={key} className="sc-quick-info-row" style={{ borderBottomColor: PAL.line }}>
              <span>{alanEtiket(key)}</span>
              <strong>{degerYaz(value, key)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="sc-positive-callout" style={{ background: PAL.surf2, color: PAL.mut2 }}>
          <Icon.info />
          Yapısal bilgi unsuru çıkarılamadı.
        </div>
      )}
      <div className="sc-quick-info-footer">
        <span>{unsurSayisi ? `${unsurSayisi} alan ve kanıt bağlantısı incelenebilir.` : "Kanıt bağlantısı bulunamadı."}</span>
        <button type="button" onClick={() => onOpen("bilgiler")} {...focusRing} data-press="">
          Ayrıntıları aç
        </button>
      </div>
    </NeonCard>
  );
}

function QuickReviewSection({ r, band, bantC, onOpen }) {
  const rm = r.risk_metadata || {};
  const riskVar = Boolean(rm.aciklama || arr(rm.gerekceler).length || rm.skor);
  // Özet kartı bu bölümden kaldırıldı (kullanıcı isteği, 2026-07-16) — özet, kaynak belge
  // panelindeki "Özet" takas görünümünde yaşamaya devam eder; ilk kart risk değerlendirmesi.
  return (
    <section className="sc-quick-review-section" aria-labelledby="sc-quick-review-title">
      <div className="sc-review-heading">
        <div>
          <h2 id="sc-quick-review-title" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Hızlı inceleme</h2>
          <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>
            Memurun önce bakacağı karar sinyalleri burada toplanır.
          </p>
        </div>
      </div>
      <div className="sc-quick-review-grid">
        <div id="sc-memur-kontrol" className="sc-review-anchor" tabIndex={-1}>
          {riskVar ? <RiskCard r={r} band={band} bantC={bantC} /> : (
            /* Risk adımı veri üretmediyse ızgarada delik kalmasın — ama bant UYDURULMAZ:
               yokluk yeşil sayılmaz, memura açıkça "hesaplanmadı" denir. */
            <NeonCard title="Risk değerlendirmesi" tag="hesaplanmadı" tagColor={PAL.mut2} accent={V} icon={<Icon.alert />} style={{ height: "100%" }}>
              <div className="sc-positive-callout" style={{ background: PAL.surf2, color: PAL.mut2 }}>
                <Icon.info />
                Bu koşumda risk bandı üretilmedi. Taslağı göndermeden önce tamamını kendiniz okuyun.
              </div>
            </NeonCard>
          )}
        </div>
        <ExtractedInfoQuickCard r={r} onOpen={onOpen} />
      </div>
    </section>
  );
}

function ExtractedInfoPanel({ r }) {
  const uy = unsurEtiket(r);
  const entries = Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false && degerYaz(v, k) !== "")
    .slice(0, 18);
  const bools = Object.entries(r.bilgi_unsurlari || {}).filter(([, v]) => typeof v === "boolean");
  const kanitMetin = r.kanit_metadata?.metin || "";
  const spanlar = r.kanit_metadata?.spanlar;

  return (
    <div className="sc-detail-content">
      <NeonCard title="Bilgi unsurları" tag={uy.tag} tagColor={T} accent={T} icon={<Icon.doc />} full>
        {entries.length === 0 ? (
          <div className="sc-positive-callout" style={{ background: PAL.surf2, color: PAL.mut2 }}>
            <Icon.info />
            Yapısal bilgi unsuru çıkarılamadı.
          </div>
        ) : (
          <div className="sc-field-grid">
            {entries.map(([key, value]) => {
              const maskeli = key.endsWith("_maskeli");
              const span = kanitSpanBul(spanlar, key);
              return (
                <KanitAlinti key={key} span={span} metin={kanitMetin}>
                  <div className="sc-field-row" style={{ borderBottomColor: PAL.line, cursor: span ? "help" : "default" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut2 }}>
                      {span && <Icon.check width={12} height={12} style={{ color: DERIN.T }} />}
                      {alanEtiket(key)}
                    </span>
                    <span style={{ margin: 0, minWidth: 0, display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 600, color: PAL.ink2, textAlign: "right" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{degerYaz(value, key)}</span>
                      {maskeli && <Chip c={T} label="Bu alan KVKK gereği maskelendi">Maskeli</Chip>}
                    </span>
                  </div>
                </KanitAlinti>
              );
            })}
          </div>
        )}

        {bools.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: SP.m }}>
            {bools.map(([key, value]) => (
              <Chip key={key} c={value ? BANT.yesil.c : PAL.mut2} label={`${alanEtiket(key)}: ${value ? "var" : "yok"}`}>
                {value ? <Icon.check width={12} height={12} /> : <Icon.x width={12} height={12} />}
                {alanEtiket(key)} {value ? (key === "pii_var" ? "maskelendi" : "var") : "yok"}
              </Chip>
            ))}
          </div>
        )}

        <div style={{ marginTop: SP.m, display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.meta, color: PAL.mut3 }}>
          <Icon.shield width={13} height={13} style={{ flex: "none", marginTop: 1, color: DERIN.T }} />
          <span>{uy.dipnot}</span>
        </div>
      </NeonCard>
    </div>
  );
}

function RequiredFieldsPanel({ r }) {
  const eksik = arr(r.eksik_alanlar);
  const clarify = arr(r.clarify_questions);
  const uyari = arr(r.verify_uyari);
  const tutar = arr(r.tutarlilik_uyari);
  const ey = eksikYorum(r);
  const verified = [];
  const seen = new Set();
  for (const sp of arr(r.kanit_metadata?.spanlar)) {
    if (sp?.label && !seen.has(sp.label)) {
      seen.add(sp.label);
      verified.push(clean(sp.label));
    }
  }
  if (!verified.length && r.bilgi_unsurlari) {
    for (const key of Object.keys(r.bilgi_unsurlari)) {
      if (!seen.has(key) && key !== "pii_var") {
        seen.add(key);
        verified.push(alanEtiket(key));
      }
    }
  }

  return (
    <div className="sc-detail-content">
      <NeonCard
        title="Zorunlu alan kontrolü"
        tag={eksik.length ? `${eksik.length} eksik` : "tam"}
        tagColor={eksik.length ? BANT.sari.c : BANT.yesil.c}
        accent={eksik.length ? BANT.sari.c : BANT.yesil.c}
        icon={eksik.length ? <Icon.alert /> : <Icon.shield />}
        full
      >
        <div style={{ display: "flex", flexDirection: "column", gap: SP.s }}>
          <Vrow ok={!eksik.length} label="Zorunlu alanlar" val={eksik.length ? `${eksik.length} eksik` : "tam"} />
          <Vrow ok={!uyari.length} label="Kaynak doğrulaması" val={uyari.length ? `${uyari.length} işaret` : "temiz"} />
          <Vrow ok={!tutar.length} label="Veri tutarlılığı" val={tutar.length ? `${tutar.length} uyarı` : "temiz"} />
        </div>

        <div
          className="sc-positive-callout"
          style={{ marginTop: SP.m, background: ALFA(eksik.length ? BANT.sari.c : BANT.yesil.c), color: eksik.length ? DERIN.sari : DERIN.yesil }}
        >
          {eksik.length ? <Icon.alert /> : <Icon.check />}
          <span>{ey.metin}</span>
        </div>

        {eksik.length > 0 && (
          <>
            <div style={{ ...TYPE.meta, color: PAL.mut3, margin: `${SP.m}px 0 ${SP.xs}px` }}>Eksik alanlar</div>
            <ul className="sc-plain-list">
              {eksik.map((item, i) => (
                <li key={i} style={{ ...TYPE.data, color: DERIN.sari }}>{alanEtiket(item)}</li>
              ))}
            </ul>
          </>
        )}

        {clarify.length > 0 && (
          <>
            <div style={{ ...TYPE.meta, color: PAL.mut3, margin: `${SP.m}px 0 ${SP.xs}px` }}>Sorulacak netleştirme soruları</div>
            <div style={{ display: "flex", flexDirection: "column", gap: SP.s }}>
              {clarify.map((q, i) => (
                <div key={i} style={{ ...TYPE.data, color: PAL.ink2, background: ALFA(BANT.sari.c), borderRadius: RAD.card, padding: "8px 12px" }}>
                  {clean(q)}
                </div>
              ))}
            </div>
          </>
        )}

        {!eksik.length && verified.length > 0 && (
          <>
            <div style={{ ...TYPE.meta, color: PAL.mut3, margin: `${SP.m}px 0 ${SP.xs}px` }}>Doğrulanan alanlar</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xs }}>
              {verified.slice(0, 10).map((field, i) => (
                <Chip key={i} c={BANT.yesil.c}><Icon.check width={12} height={12} /> {field}</Chip>
              ))}
            </div>
          </>
        )}
      </NeonCard>
    </div>
  );
}

function DetailModal({ type, r, onClose }) {
  // Odak yönetimi (WCAG 2.4.3 — jüri T9): açılışta kapat düğmesine odak, kapanışta
  // tetikleyiciye iade; Tab döngüsü odakDongusu ile diyalog içinde kalır.
  const kapatRef = useRef(null);
  // onClose çağrı yerinde inline arrow (her render'da yeni kimlik) — effect ona bağlıyken
  // modal açıkken HER üst re-render odak kurulumunu yıkıp kuruyordu: odak içerikten kapat
  // düğmesine çalınıyor, `onceki` kapat düğmesi olunca kapanışta tetikleyiciye iade
  // sessizce kırılıyordu (bug avı bulgusu). Ref-dolaylama: effect yalnız type'a bağlı.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!type) return undefined;
    const onceki = document.activeElement;
    kapatRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    // Arkadaki sayfa kaymasın (BelgeModal/KurulModal deseni — eksikti).
    const eskiOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = eskiOverflow;
      if (onceki && document.contains(onceki)) onceki.focus();
    };
  }, [type]);

  if (!type) return null;
  const meta = type === "bilgiler"
    ? { title: "Belgeden çıkarılan bilgiler", sub: "Yapısal alanlar, maskelenen veriler ve kanıt bağlantıları.", icon: <Icon.doc /> }
    : { title: "Zorunlu alan kontrolü", sub: "Eksik alanlar, netleştirme soruları ve doğrulama kapıları.", icon: <Icon.shield /> };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="sc-detail-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="sc-detail-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-detail-modal-title"
        style={{ background: PAL.surfPop, borderColor: PAL.line, boxShadow: SH.modal }}
        onKeyDown={odakDongusu}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sc-detail-modal-header" style={{ borderBottomColor: PAL.line, background: PAL.bg }}>
          <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: SP.m }}>
            <span aria-hidden="true" style={{ display: "flex", color: DERIN.T, flexShrink: 0 }}>{meta.icon}</span>
            <span style={{ minWidth: 0 }}>
              <h2 id="sc-detail-modal-title" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{meta.title}</h2>
              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, marginTop: 2 }}>{meta.sub}</span>
            </span>
          </span>
          <button
            ref={kapatRef}
            type="button"
            onClick={onClose}
            aria-label="Pencereyi kapat"
            title="Kapat"
            {...focusRing}
            data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: "pointer", width: 34, height: 34, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <Icon.x />
          </button>
        </header>
        <div className="sc-detail-modal-body">
          {type === "bilgiler" ? <ExtractedInfoPanel r={r} /> : <RequiredFieldsPanel r={r} />}
        </div>
      </section>
    </div>,
    document.body
  );
}


export default function SonucCalismaAlani({
  result,
  onMevzuatAc = null,
  onMevzuatSec = null,
  seciliMevzuat = [],
  solPanel = null,
  yanTaslak = null,
  altAkis = null,
}) {
  const [popup, setPopup] = useState(null);
  const [sourceView, setSourceView] = useState("belge");
  const r = result;
  const gridRef = useRef(null);
  const ip = useDayanakIpligi(r, gridRef);
  useEffect(() => { kagitStilYukle(); }, []);

  // Sekmeyi YALNIZ gerçekten yeni bir koşumda "Belge"ye sıfırla — denetim_izi koşum
  // kimliğidir ve persist merge'i/applyTaslak zenginleşmesi onu KORUR (yeni üst-düzey result
  // referansı üretse de). `[r]` demek, ~20-27 sn sonra gelen persist event'inin memurun
  // seçtiği "Özet" görünümünü sessizce "Belge"ye atmasıydı (bug avı bulgusu).
  const kosumKimligi = r?.denetim_izi ?? r;
  useEffect(() => { setSourceView("belge"); }, [kosumKimligi]);

  const alt = useMemo(() => arr(r?.alt_talepler), [r?.alt_talepler]);
  const mev = useMemo(() => arr(r?.mevzuat_onerileri), [r?.mevzuat_onerileri]);
  const nliMap = useMemo(() => new Map(arr(r?.mevzuat_nli).filter((n) => n && n.baslik).map((n) => [n.baslik, n])), [r?.mevzuat_nli]);
  const seciliSet = useMemo(() => new Set(arr(seciliMevzuat).map((x) => x && x.baslik).filter(Boolean)), [seciliMevzuat]);

  if (!r) return null;

  const eksik = arr(r.eksik_alanlar);
  const uyari = arr(r.verify_uyari);
  const tutar = arr(r.tutarlilik_uyari);
  const lint = r.lint_2646 || {};
  const lintKurallar = arr(lint.kurallar).filter((k) => k && typeof k === "object");
  const lintUyariSay = arr(lint.uyari).length;
  const arsiv = r.arsiv_metadata || {};
  const sdpAdaylar = arr(arsiv.sdp_adaylari).filter((item) => item && typeof item === "object");
  const sla = r.sla_metadata || {};
  const sInfo = slaInfo(sla);
  const band = BANT[r.risk_metadata?.bant] ? r.risk_metadata.bant : "yesil";
  const bantC = BANT[band]?.c || BANT.yesil.c;
  const birimAday = arr(r.birim_alternatifleri)
    .filter((b) => b !== r.hedef_birim && b !== r.hedef_birim_oneri && b !== r.hedef_kategori).slice(0, 3);
  const ozetButonu = (
    <SwapButton icon={<Icon.info width={13} height={13} />} onClick={() => setSourceView("ozet")}>
      Özet
    </SwapButton>
  );
  const okunanPanel = sourceView === "ozet"
    ? <SummarySwapPanel r={r} onBelge={() => setSourceView("belge")} />
    : isValidElement(solPanel)
      ? cloneElement(solPanel, { ekAksiyon: ozetButonu })
      : (solPanel || <EmptySource />);

  return (
    <>
      <style>{SONUC_CSS}</style>
      <div className="sc-workspace kd-sonuc" aria-label="Belge inceleme sonucu">
        <DecisionCard r={r} eksik={eksik} uyari={uyari} tutar={tutar} />
        <DayanakSeridi ip={ip} />

        <div className="sc-result-document-grid" ref={gridRef}>
          <section className="sc-document-slot sc-source-slot" aria-label="Okunan kaynak belge">
            {okunanPanel}
          </section>
          <section className="sc-document-slot sc-main-draft-shell" aria-label="Önerilen resmî yazı taslağı">
            {yanTaslak || (
              <NeonCard title="Resmî yazı taslağı" accent={V} icon={<Icon.doc />}>
                <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu sonuçta resmî yazı taslağı üretilmedi.</p>
              </NeonCard>
            )}
          </section>
          <DayanakKatmani ip={ip} />
        </div>

        <QuickReviewSection r={r} band={band} bantC={bantC} onOpen={setPopup} />

        <section className="sc-review-section" aria-labelledby="sc-support-title">
          <div className="sc-review-heading">
            <div>
              <h2 id="sc-support-title" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Ayrıntılar ve kontroller</h2>
              <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>
                Mevzuat önerileri, dosyalama, birim yönlendirme ve yazışma kuralı denetimleri.
              </p>
            </div>
          </div>

          <div className="sc-support-grid">
            <AltTaleplerCard alt={alt} />
            <YazismaPaketiKarti r={r} />
            <MevzuatCard r={r} mev={mev} nliMap={nliMap} onMevzuatAc={onMevzuatAc} onMevzuatSec={onMevzuatSec} seciliSet={seciliSet} />
            <div className="sc-support-wide">
              <ArchiveSlaCard r={r} arsiv={arsiv} sdpAdaylar={sdpAdaylar} sla={sla} sInfo={sInfo} />
            </div>
            {/* `canli_kaynak` de karta yeter: doğrulanmamış kurumda korpus birimi HİÇ
                olmayabilir ve kartın tek içeriği canlı kaynak linki olur — asıl
                gösterilmesi gereken durum tam olarak budur.
                Kapı HAM `r.canli_kaynak.url` yerine DOĞRULANMIŞ künyeyi sorar: adres
                güvenlik sınavından geçmezse RoutingCard onu zaten basmaz ve burada ham
                alana bakmak boş bir kart hücresi bırakırdı. */}
            {(gosterimBirimi(r) || canliKaynakYorum(r)) && (
              <div className="sc-support-half">
                <RoutingCard r={r} birimAday={birimAday} />
              </div>
            )}
            <div className="sc-support-half">
              <ValidationCard r={r} uyari={uyari} tutar={tutar} />
            </div>
            {lintKurallar.length > 0 && (
              <div className="sc-support-wide">
                <LintCard lint={lint} lintKurallar={lintKurallar} lintUyariSay={lintUyariSay} />
              </div>
            )}
          </div>
        </section>

        {/* "Satır gibi" ajan akışı özeti — sayfanın en altı (kullanıcı isteği, 2026-07-16).
            İçerik CanliAjanAkisi'nden hazır gelir (display + adım detay modal bağı orada). */}
        {altAkis}
      </div>

      <DetailModal type={popup} r={r} onClose={() => setPopup(null)} />
    </>
  );
}
