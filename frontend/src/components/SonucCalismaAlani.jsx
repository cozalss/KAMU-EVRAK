import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import {
  Chip,
  slaInfo,
  subSlaRenk,
  MevzuatRow,
  SlaPanel,
  DuzeltmeDiff,
  Vrow,
  KanitAlinti,
  Lint2646Karti,
} from "./NeonDetayParts.jsx";
import {
  hukumYorum,
  unsurEtiket,
  eksikYorum,
  mevzuatDipnot,
  birimDipnot,
  lintGiris,
  decomposeGiris,
  riskGerekceYorum,
  riskSkorYorum,
} from "../lib/detayYorum.js";
import {
  MONO,
  T,
  V,
  PAL,
  BANT,
  DERIN,
  DERIN_OF,
  ALFA,
  TYPE,
  TNUM,
  RAD,
  SP,
  SH,
  NeonCard,
  Icon,
  Btn,
  focusRing,
  odakDongusu,
} from "./neonUi.jsx";

const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const clean = (value) => cleanDemoText(String(value ?? ""));
const plain = (value) => clean(value).replace(/\*\*/g, "");
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

const TON = {
  yesil: DERIN.yesil,
  sari: DERIN.sari,
  kirmizi: DERIN.kirmizi,
};

const RISK_BAND_HELP = {
  yesil: "Yeşil risk bandı: Kontroller rutin akış için uygun görünüyor; son karar yine yetkili memurdadır.",
  sari: "Sarı risk bandı: Göndermeden önce memurun içerik, eksik alan veya mevzuat işaretlerini kısa kontrol etmesi gerekir.",
  kirmizi: "Kırmızı risk bandı: Otomatik gönderim uygun değildir; memurun ayrıntılı inceleme yapması gerekir.",
};

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

function degerYaz(value) {
  if (typeof value === "boolean") return value ? "Var" : "Yok";
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

/* Demo kurumu uyuşmazlığı — 19 Tem revizyon: SARI bilgilendirme, KIRMIZI değil (gönderimi
   engellemez). Belge farklı türde bir kuruma hitaben yazılmışsa memur iki seçenekten birini
   seçer: belgedeki kurumu aktif kurum yap (antet + koşum yeniden üretilir) ya da mevcut aktif
   kurumla devam et (kart yalnız bu koşum için kapanır — yeni koşumda dismissed sıfırlanır). */
function KurumUyusmazlikBanner({ r, onKurumSec }) {
  const ku = r.kurum_uyusmazligi;
  const [dismissed, setDismissed] = useState(false);
  const kosumKimligi = r?.denetim_izi ?? r;
  useEffect(() => { setDismissed(false); }, [kosumKimligi]);
  if (!ku || dismissed) return null;
  const sariKoyu = DERIN_OF(BANT.sari.c);
  return (
    <section role="alert" aria-label="Demo kurumu uyuşmazlığı"
      style={{ display: "flex", alignItems: "flex-start", gap: SP.m, padding: "14px 16px", marginBottom: SP.m, borderRadius: RAD.card, border: `1px solid ${BANT.sari.c}`, background: ALFA(BANT.sari.c) }}>
      <Icon.alert width={18} height={18} style={{ flex: "none", marginTop: 2, color: sariKoyu }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Demo kurumu uyuşmazlığı</div>
        <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.ink2 }}>
          Bu belge <strong style={{ fontWeight: 600 }}>{ku.belge_kurumu}</strong> kurumuna hitaben yazılmış, ancak aktif kurumunuz{" "}
          <strong style={{ fontWeight: 600 }}>{ku.aktif_kurum}</strong>. Antet ve birim yönlendirmesi aktif kurumla oluşturuldu — göndermek engellenmedi.
        </p>
        <div style={{ display: "flex", gap: SP.s, marginTop: SP.m, flexWrap: "wrap" }}>
          <Btn primary accent={BANT.sari.c} disabled={!onKurumSec}
            onClick={() => onKurumSec?.(ku.belge_kurumu)}>
            Belgedeki kurumu aktif kurum olarak kullan
          </Btn>
          <Btn onClick={() => setDismissed(true)}>Mevcut aktif kurumla devam et</Btn>
        </div>
      </div>
    </section>
  );
}

function DecisionCard({ r, eksik, uyari, tutar }) {
  const [riskHelpOpen, setRiskHelpOpen] = useState(false);
  const hy = hukumYorum(r);
  const [ana, ...kuyruk] = String(hy.baslik || "İşlem tamamlandı").split(" · ");
  const band = BANT[r.risk_metadata?.bant] ? r.risk_metadata.bant : "yesil";
  const kontrolSayisi = eksik.length + uyari.length + tutar.length + arr(r.lint_2646?.uyari).length;
  const kararAciklama = kontrolSayisi
    ? `${kontrolSayisi} kontrol noktası memur incelemesi için işaretlendi.`
    : "Kontroller temiz; nihai karar yetkili memur tarafından verilir.";
  const riskEtiket = r.risk_metadata?.bant ? `${band === "sari" ? "sarı" : band === "kirmizi" ? "kırmızı" : "yeşil"} risk bandı` : "risk bandı yok";
  const durumSatiri = kuyruk.length ? kuyruk.join(" · ") : riskEtiket;
  const evrakTuru = EVRAK_TR(r.evrak_turu);
  // Çok-konulu evrakta tek birim adı yanıltıcı (jüri bulgusu: üç yüzey üç farklı birim
  // gösterip çelişki gibi okunuyordu) — hüküm, dağıtımın kendisini söyler; alt-talep
  // muhatapları taslak kartlarında etiketlidir.
  const altSayisi = arr(r.alt_talepler).length;
  // Kaynak-doğrulamalı ajan: doğrulanmış GERÇEK birim adı (serbest-metin) veya dürüst fallback
  // (hedef_birim=None → hedef_kategori önerisi + memur onayı). durum/insan_onayi_gerekli bayrakları.
  const kaynakDogrulandi = r.durum === "kaynak_dogrulandi" && !!r.hedef_birim;
  const onayGerekli = !!r.insan_onayi_gerekli;
  const kaynakKunye = r.hedef_birim_kaynak && r.hedef_birim_kaynak.birim_ad ? r.hedef_birim_kaynak : null;
  const muhatapAd = r.muhatap_kurum?.ad || "";
  const yetkiliAd = r.yetkili_kurum?.ad || "";
  const caprazKurum = !!yetkiliAd && !!muhatapAd && r.yetkili_kurum?.slug !== r.muhatap_kurum?.slug;
  const yonlendirilenBirim = altSayisi >= 2
    ? `${altSayisi} alt-talep · ayrı birimlere dağıtım`
    : (r.hedef_birim
        ? BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)
        : (r.hedef_kategori ? BIRIM_GOSTER(r.hedef_kategori, r.evrak_turu) : "Belirlenmedi"));
  const birimTitle = kaynakDogrulandi && kaynakKunye
    ? `Kaynak: ${kaynakKunye.kaynak_kurum} · ${kaynakKunye.belge_basligi}`
    : (r.hedef_kategori && altSayisi < 2 ? "Öneri — resmî kaynakla doğrulanmadı, memur onayı gerekli" : undefined);
  const riskAciklama = RISK_BAND_HELP[band] || RISK_BAND_HELP.yesil;
  const kontroleGit = () => {
    setRiskHelpOpen(false);
    const hedef = document.getElementById("sc-memur-kontrol");
    if (hedef) {
      window.requestAnimationFrame(() => {
        const rect = hedef.getBoundingClientRect();
        const top = window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 2);
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        hedef.focus({ preventScroll: true });
        hedef.classList.remove("is-highlighted");
        window.requestAnimationFrame(() => {
          hedef.classList.add("is-highlighted");
          window.setTimeout(() => hedef.classList.remove("is-highlighted"), 1800);
        });
      });
    }
  };

  return (
    <section
      className="sc-decision-card sc-decision-strip-card"
      aria-labelledby="sc-decision-title"
      style={{ borderColor: PAL.line, background: PAL.surf, boxShadow: SH.card }}
    >
      {/* Kart üstü renkli accent şeridi kaldırıldı (MASTER.md anti-pattern; bant bilgisi
          zaten durum satırı + çip ile veriliyor — jüri bulgusu). */}
      <div className="sc-decision-strip-main">
        <span
          className="sc-decision-icon"
          aria-hidden="true"
          style={{ background: ALFA(BANT.yesil.c), color: DERIN.yesil }}
        >
          {hy.ton === "yesil" ? <Icon.check width={24} height={24} /> : <Icon.shield width={24} height={24} />}
        </span>
        <span className="sc-decision-strip-copy">
          <h2 id="sc-decision-title" style={{ margin: 0, ...TYPE.h2, fontSize: 22, lineHeight: "28px", color: PAL.ink }}>
            {ana}
          </h2>
          <span className="sc-decision-status-line" style={{ marginTop: 2, color: TON[hy.ton] || DERIN.sari }}>
            {durumSatiri}
            {r.risk_metadata?.bant && (
              <span className="sc-risk-help">
                <button
                  type="button"
                  className="sc-risk-help-trigger"
                  aria-label={`${riskEtiket} nedir?`}
                  aria-expanded={riskHelpOpen}
                  onClick={() => setRiskHelpOpen((v) => !v)}
                  onKeyDown={(e) => { if (e.key === "Escape") setRiskHelpOpen(false); }}
                  {...focusRing}
                >
                  ?
                </button>
                {riskHelpOpen && (
                  <span className="sc-risk-help-popover" role="dialog" aria-label="Risk bandı açıklaması">
                    <span>{riskAciklama}</span>
                    <button type="button" onClick={kontroleGit} {...focusRing}>
                      Risk değerlendirmesine git
                    </button>
                  </span>
                )}
              </span>
            )}
          </span>
        </span>
        <dl className="sc-decision-strip-meta" aria-label="Belge yönlendirme özeti">
          <div>
            <dt>Evrak türü</dt>
            <dd>{evrakTuru}</dd>
          </div>
          <div>
            <dt>Yönlendirilen birim</dt>
            <dd title={birimTitle}>
              {yonlendirilenBirim}
              {altSayisi < 2 && kaynakDogrulandi && (
                <span
                  style={{ marginLeft: 6, padding: "1px 7px", borderRadius: RAD.chip, ...TYPE.meta,
                           fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c),
                           whiteSpace: "nowrap" }}
                >
                  ✓ kaynak doğrulandı
                </span>
              )}
              {altSayisi < 2 && !kaynakDogrulandi && onayGerekli && (
                <span
                  style={{ marginLeft: 6, padding: "1px 7px", borderRadius: RAD.chip, ...TYPE.meta,
                           fontWeight: 500, color: DERIN_OF(BANT.sari.c), background: ALFA(BANT.sari.c),
                           whiteSpace: "nowrap" }}
                >
                  memur onayı gerekli
                </span>
              )}
            </dd>
            {caprazKurum && (
              <dd style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut2 }}>
                muhatap: {muhatapAd} → yetkili: {yetkiliAd}
              </dd>
            )}
            {kaynakDogrulandi && kaynakKunye && (
              <dd style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut2 }}>
                kaynak: {kaynakKunye.kaynak_kurum}
              </dd>
            )}
          </div>
        </dl>
        <p className="sc-decision-strip-note" style={{ color: PAL.mut2 }}>{kararAciklama}</p>
        {r.risk_metadata?.bant && (
          <span className="sc-decision-strip-chip" style={{ color: DERIN_OF(BANT[band].c), background: ALFA(BANT[band].c) }}>
            {BANT[band].l}
          </span>
        )}
      </div>
    </section>
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
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false)
    .length;
  const entries = Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false)
    .slice(0, 5);
  const uy = unsurEtiket(r);

  return (
    <NeonCard title="Belgeden çıkarılan bilgiler" tag={uy.tag || (unsurSayisi ? `${unsurSayisi} alan` : "boş")} tagColor={T} accent={T} icon={<Icon.doc />} style={{ height: "100%" }}>
      {entries.length ? (
        <div className="sc-quick-info-list">
          {entries.map(([key, value]) => (
            <div key={key} className="sc-quick-info-row" style={{ borderBottomColor: PAL.line }}>
              <span>{alanEtiket(key)}</span>
              <strong>{degerYaz(value)}</strong>
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
          <RiskCard r={r} band={band} bantC={bantC} />
        </div>
        <ExtractedInfoQuickCard r={r} onOpen={onOpen} />
      </div>
    </section>
  );
}

function ExtractedInfoPanel({ r }) {
  const uy = unsurEtiket(r);
  const entries = Object.entries(r.bilgi_unsurlari || {})
    .filter(([k, v]) => k !== "pii_var" && v !== undefined && v !== null && v !== "" && v !== false)
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
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{degerYaz(value)}</span>
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
        style={{ background: PAL.surf, borderColor: PAL.line, boxShadow: SH.modal }}
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

function AltTaleplerCard({ alt }) {
  if (alt.length < 2) return null;
  return (
    <NeonCard title="Belgedeki talepler" tag={`${alt.length} ayrı iş`} accent={T} icon={<Icon.route />} full>
      <p style={{ margin: "0 0 10px", ...TYPE.data, color: PAL.mut2 }}>{decomposeGiris(alt)}</p>
      <div className="sc-subject-grid">
        {alt.map((a, i) => {
          const asla = a.sla_durum ? slaInfo({ durum: a.sla_durum }) : null;
          const slaColor = subSlaRenk(a.sla_durum);
          return (
            <article key={i} className="sc-subject-item" style={{ borderColor: PAL.line, background: PAL.surf2 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
                <span style={{ ...TYPE.meta, color: DERIN.T, fontFamily: MONO, ...TNUM }}>{String(i + 1).padStart(2, "0")}</span>
                <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2 }}>{clean(a.ozet || "Alt talep")}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s }}>
                <span style={{ ...TYPE.meta, color: PAL.mut2 }}>
                  {[a.tur_tr || (a.tur && EVRAK_TR(a.tur)), (a.birim && BIRIM_GOSTER(a.birim, a.tur)) || a.birim_tr, a.yazi_turu && YAZI_TR(a.yazi_turu), a.cevap_suresi && clean(a.cevap_suresi)].filter(Boolean).join(" · ")}
                </span>
                {asla && slaColor && <Chip c={slaColor} label={`Alt-talep yasal süre durumu: ${asla.label}`}>{asla.label}</Chip>}
              </div>
            </article>
          );
        })}
      </div>
    </NeonCard>
  );
}

function MevzuatCard({ r, mev, nliMap, onMevzuatAc, onMevzuatSec, seciliSet }) {
  if (!mev.length) return null;
  const secilebilir = !!onMevzuatSec;
  const secSay = mev.filter((m) => seciliSet.has(m.baslik)).length;
  // Dürüstlük sunumu: tüm öneriler zayıfsa (hepsi "düşük güven") panel, satır başına
  // tekrarlayan kırmızı "İnsan incelemesi önerilir" uyarısıyla BAŞARISIZ görünür — oysa
  // sistem dürüstçe "bu evrak için güçlü eşleşme yok" diyor. O durumu TEK sakin uyarıya
  // toplar ve satır-başı spam'ı bastırırız (inceleme={false}). Güven SAHTELENMEZ; yalnız
  // aynı dürüst bilgi bir kez, panik yaratmadan söylenir. Bir öneri bile "orta"/"yüksek"
  // ise satır-başı ayrımı bilgi taşır → eski davranış korunur.
  const hepsiZayif = mev.every((m) => (m.guven || "") === "düşük");
  return (
    <NeonCard
      title="Önerilen mevzuat"
      tag={secSay ? `${mev.length} öneri · ${secSay} işlendi` : `${mev.length} öneri`}
      tagColor={secSay ? DERIN.T : (hepsiZayif ? BANT.sari.c : undefined)}
      accent={T}
      icon={<Icon.book />}
      full
    >
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
          <MevzuatRow
            key={i}
            rank={i + 1}
            m={m}
            nli={nliMap.get(m.baslik)}
            ilk={i === 0}
            onAc={onMevzuatAc}
            secili={seciliSet.has(m.baslik)}
            onSec={secilebilir ? (checked) => onMevzuatSec(m, checked) : null}
            inceleme={!hepsiZayif}
          />
        ))}
      </div>
      <div style={{ marginTop: SP.m, display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.s, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: PAL.ink2 }}>
        <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1, color: DERIN.T }} />
        <span>
          {secilebilir
            ? "Öneriler otomatik eklenmez. Kutucuğu işaretlenen madde resmî yazıya dayanak olarak işlenir; işaret kaldırılınca taslak geri alınır."
            : "Bu öneriler bilgi amaçlıdır; atıf yapılacaksa madde açılıp doğrulanmalıdır."}
        </span>
      </div>
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{mevzuatDipnot(r)}</div>
    </NeonCard>
  );
}

function ArchiveSlaCard({ r, arsiv, sdpAdaylar, sla, sInfo }) {
  const hasArchive = !!(arsiv.sdp_kodu || arsiv.saklama_suresi || arsiv.saklama || arsiv.sdp_adi || arsiv.sdp_gerekce);
  return (
    <NeonCard title="Dosyalama ve yasal süre" tag={hasArchive ? "SDP" : "süre takibi"} accent={T} icon={<Icon.grid />}>
      {hasArchive ? (
        <div className="sc-archive-grid">
          <span>
            <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Dosya planı · SDP (2005/7)</span>
            <span style={{ ...TYPE.data, fontWeight: 700, color: DERIN.V, ...TNUM }}>{clean(arsiv.sdp_kodu || "Atanmadı")}</span>
            {arsiv.sdp_adi && <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, marginTop: 2 }}>{clean(arsiv.sdp_adi)}</span>}
          </span>
          <span>
            <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Saklama süresi</span>
            <span style={{ ...TYPE.data, fontWeight: 700, color: PAL.ink2, ...TNUM }}>{clean(arsiv.saklama_suresi || arsiv.saklama || "Belirtilmedi")}</span>
          </span>
        </div>
      ) : (
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu sonuçta arşiv sınıflandırması üretilmedi.</p>
      )}

      {arsiv.sdp_gerekce && (
        <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "8px 0 0" }}>
          <span style={{ color: DERIN.T }}>Otomatik atama: </span>{clean(arsiv.sdp_gerekce)}
        </div>
      )}

      {sdpAdaylar.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, margin: "8px 0 0" }}>
          {sdpAdaylar.map((a, i) => (
            <span key={a.kod || i} title={a.ad} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: i === 0 ? DERIN.T : PAL.mut2, ...TNUM }}>
              {a.kod} · {Number.isFinite(Number(a.skor)) ? Number(a.skor).toFixed(1) : "–"}
            </span>
          ))}
        </div>
      )}

      <SlaPanel sla={sla} info={sInfo} />
      {!r.sla_metadata && <span style={{ display: "block", marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Yasal süre bilgisi bulunamadı.</span>}
    </NeonCard>
  );
}

function RiskCard({ r, band, bantC }) {
  const riskGerekce = arr(r.risk_metadata?.gerekceler).slice(0, 5);
  if (!r.risk_metadata?.aciklama && !riskGerekce.length && !r.risk_metadata?.skor) return null;
  const yorumlar = riskGerekce.map((g) => riskGerekceYorum(String(g))).filter(Boolean);
  const skor = riskSkorYorum(Number(r.risk_metadata?.skor), r.risk_metadata?.katkilar, band, r.risk_metadata?.kalibrasyon);
  const seviyeGoster = skor?.seviye ? skor.seviye[0].toUpperCase() + skor.seviye.slice(1) : null;

  return (
    <NeonCard title="Risk değerlendirmesi" tag={BANT[band]?.l} tagColor={bantC} accent={V} icon={<Icon.alert />}>
      {skor && (
        <div className="sc-risk-gauge-row" style={{ marginBottom: SP.m }}>
          <span style={{ ...TYPE.num, color: bantC, flexShrink: 0 }}>%{skor.yuzde}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {seviyeGoster && <div style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{seviyeGoster}</div>}
            <span className="sc-risk-gauge-track" aria-hidden="true" style={{ display: "block", marginTop: 6, background: PAL.press }}>
              <span className="sc-risk-gauge-fill" style={{ width: `${Math.min(100, skor.yuzde)}%`, background: bantC }} />
            </span>
          </div>
        </div>
      )}
      {r.risk_metadata?.aciklama && r.risk_metadata.aciklama !== r.risk_metadata?.oneri && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
          <Icon.info width={14} height={14} style={{ flex: "none", marginTop: 2, color: PAL.mut2 }} />
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>{clean(r.risk_metadata.aciklama)}</span>
        </div>
      )}
      {yorumlar.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: r.risk_metadata?.aciklama ? SP.s : 0 }}>
          {yorumlar.map((yorum, i) => {
            const pay = skor?.paylar?.[i];
            return (
              <div key={i} className="sc-risk-reason">
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: bantC, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0, color: PAL.mut2 }}>{yorum.cevrildi ? yorum.sade : clean(yorum.sade)}</span>
                {pay != null && (
                  <>
                    <span className="sc-risk-meter" aria-hidden="true" style={{ background: PAL.press }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.min(100, pay)}%`, background: bantC }} />
                    </span>
                    <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut3, width: 34, textAlign: "right", flexShrink: 0 }}>%{pay}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {skor && (skor.not || skor.kalibrasyonNot) && (
        <div className="sc-positive-callout" style={{ marginTop: SP.m, background: PAL.surf2, color: PAL.mut2 }}>
          <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1 }} />
          <span>{skor.not} {skor.kalibrasyonNot}</span>
        </div>
      )}
    </NeonCard>
  );
}

function ValidationCard({ r, uyari, tutar }) {
  const lintFix = r.lint_duzeltme_md;
  return (
    <NeonCard
      title="Taslak doğrulaması"
      tag={uyari.length + tutar.length ? `${uyari.length + tutar.length} uyarı` : "uyumlu"}
      tagColor={uyari.length + tutar.length ? BANT.sari.c : BANT.yesil.c}
      accent={V}
      icon={<Icon.shield />}
    >
      <Vrow ok={!uyari.length} label="Kaynak kontrolü" val={uyari.length ? `${uyari.length} işaret` : "temiz"} />
      <Vrow ok={!!r.format_uyumlu} label="Format (Yön. 2646)" val={r.format_uyumlu ? "uyumlu" : "kontrol"} />
      <Vrow ok={!tutar.length} label="Veri tutarlılığı" val={tutar.length ? `${tutar.length} uyarı` : "temiz"} />
      {r.verify_notes && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}>{clean(r.verify_notes)}</div>}
      {uyari.slice(0, 5).map((u, i) => (
        <div key={i} className="sc-warning-row" style={{ color: DERIN.sari }}>
          <Icon.alert style={{ flex: "none", marginTop: 2 }} /> {clean(u)}
        </div>
      ))}
      {tutar.slice(0, 4).map((u, i) => (
        <div key={`t${i}`} className="sc-warning-row" style={{ color: DERIN.sari }}>
          <Icon.alert style={{ flex: "none", marginTop: 2 }} /> {clean(u)}
        </div>
      ))}
      {lintFix && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>Önerilen düzeltme (Yön. 2646) · mevcut taslakla fark</div>
          <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>Otomatik öneri; memur onayı olmadan uygulanmaz.</div>
          <DuzeltmeDiff eski={clean(r.yazi_taslak_md || "")} yeni={clean(lintFix)} />
        </div>
      )}
    </NeonCard>
  );
}

function RoutingCard({ r, birimAday }) {
  // hedef_birim yalnız kaynak-doğrulanmış GERÇEK birimde dolu (route_ajan.dogrulandi);
  // doğrulanamadığında (fallback_onerisi) None döner AMA birim_reasoning yine üretilir
  // (route_ajan.py her iki dalda da yazar) — kart hedef_birim'e kilitliyse bu gerekçe hiç
  // görünmez (kullanıcı bulgusu: şartname "süreç bilgilendirmesi" gereksinimiyle çelişir).
  const birim = r.hedef_birim || r.hedef_kategori;
  if (!birim) return null;
  const dogrulandi = r.durum === "kaynak_dogrulandi" && !!r.hedef_birim;
  return (
    <NeonCard title="Birim yönlendirme" tag={birimAday.length ? `${birimAday.length + 1} aday` : null} accent={V} icon={<Icon.route />}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>1.</span>
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{BIRIM_GOSTER(birim, r.evrak_turu)}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 600, color: dogrulandi ? DERIN.V : DERIN.sari }}>
          {dogrulandi
            ? (<><Icon.check width={12} height={12} /> önerilen</>)
            : (<><Icon.alert width={12} height={12} /> doğrulanmadı</>)}
        </span>
      </div>
      {birimAday.map((b, i) => (
        <div key={b} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{i + 2}.</span>
          <span style={{ ...TYPE.data, color: PAL.mut2 }}>{BIRIM_GOSTER(b, r.evrak_turu)}</span>
        </div>
      ))}
      {r.servis_birimi?.ad && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "8px 0 2px", marginTop: SP.xs, borderTop: `1px dashed ${PAL.line}` }}>
          <Icon.route width={13} height={13} style={{ color: DERIN_OF(V), flex: "none", marginTop: 2 }} />
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>
            <span style={{ color: PAL.mut2 }}>İçerik sinyalinden havale önerisi (kayıt birimi üzerinden): </span>
            <strong style={{ fontWeight: 700 }}>{r.servis_birimi.ad}</strong>
            {arr(r.servis_birimi.sinyal).length > 0 && <span style={{ ...TYPE.meta, color: PAL.mut3 }}> · içerik: {arr(r.servis_birimi.sinyal).join(", ")}</span>}
          </span>
        </div>
      )}
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{clean(birimDipnot(r))}</div>
    </NeonCard>
  );
}

function LintCard({ lint, lintKurallar, lintUyariSay }) {
  if (!lintKurallar.length) return null;
  return (
    <NeonCard
      title="Resmî yazışma kuralları"
      tag={`${lint.ozet?.gecti ?? 0}/${lintKurallar.length} kural`}
      tagColor={lintUyariSay ? BANT.sari.c : BANT.yesil.c}
      accent={V}
      icon={<Icon.shield />}
    >
      <Lint2646Karti lint={lint} giris={lintGiris(lint)} />
    </NeonCard>
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
  onKurumSec = null,
}) {
  const [popup, setPopup] = useState(null);
  const [sourceView, setSourceView] = useState("belge");
  const r = result;

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
    .filter((b) => b !== r.hedef_birim && b !== r.hedef_kategori).slice(0, 3);
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
      <div className="sc-workspace" aria-label="Belge inceleme sonucu">
        <KurumUyusmazlikBanner r={r} onKurumSec={onKurumSec} />
        <DecisionCard r={r} eksik={eksik} uyari={uyari} tutar={tutar} />

        <div className="sc-result-document-grid">
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
        </div>

        <QuickReviewSection r={r} band={band} bantC={bantC} onOpen={setPopup} />

        <section className="sc-review-section" aria-labelledby="sc-support-title">
          <div className="sc-review-heading">
            <div>
              <h2 id="sc-support-title" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Ayrıntılar ve kontroller</h2>
              <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>
                Önceki gelişmiş paneller burada korunur; memur yalnızca ihtiyaç duyduğunu açıp denetler.
              </p>
            </div>
          </div>

          <div className="sc-support-grid">
            <AltTaleplerCard alt={alt} />
            <MevzuatCard r={r} mev={mev} nliMap={nliMap} onMevzuatAc={onMevzuatAc} onMevzuatSec={onMevzuatSec} seciliSet={seciliSet} />
            <div className="sc-support-wide">
              <ArchiveSlaCard r={r} arsiv={arsiv} sdpAdaylar={sdpAdaylar} sla={sla} sInfo={sInfo} />
            </div>
            {(r.hedef_birim || r.hedef_kategori) && (
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
