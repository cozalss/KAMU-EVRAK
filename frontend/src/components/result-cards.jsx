/* Sonuç kartları — /process_doc ProcessResponse alanlarını cilalı, erişilebilir kartlara böler.
   SIFIR ek dep (saf React + CSS). Tüm etiketler Türkçe. Kart bileşenleri bağımsız test/yeniden
   kullanılabilir; App yalnız <ResultCards r={result} /> render eder.

   PII şeffaflığı (CLAUDE.md §2): backend TCKN/telefon'u ZATEN maskeler (tckn_maskeli/
   telefon_maskeli). UI bu alanlara açık "maskeli" rozeti basar — vatandaş korumasının
   görünür kanıtı (jüri "wow"). Ham PII frontend'e hiç ulaşmaz. */
import React, { useState } from "react";
import { useTypewriter } from "../lib/useTypewriter.js";
import { Icon } from "./icons.jsx";
import { gosterimBirimi } from "../lib/gosterimBirimi.js";

// Etiket/temizleme yardımcıları lib/evrakEtiket.js'te (tur 6 bölünmesi) — burada geriye
// uyum için yeniden dışa aktarılır.
import {
  EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, safeUrl, cleanDemoText, normalizeDraftForDemo,
} from "../lib/evrakEtiket.js";
import { YaziTaslakCard, DogrulamaCard } from "./rcYaziKartlari.jsx";

// bilgi_unsurlari anahtarları → Türkçe alan adı + PII (maskeli) işareti.
const UNSUR_META = {
  gonderen: { label: "Gönderen", pii: false },
  kurum: { label: "Kurum", pii: false },
  konu: { label: "Konu", pii: false },
  tarih: { label: "Tarih", pii: false },
  sayi: { label: "Sayı", pii: false },
  tckn_maskeli: { label: "T.C. Kimlik No", pii: true },
  telefon_maskeli: { label: "Telefon", pii: true },
  talep: { label: "Somut talep", pii: false, bool: true },
  iletisim_adres: { label: "İletişim adresi", pii: false, bool: true },
  imza: { label: "İmza", pii: false, bool: true },
};
// "pii_var" bayrağı kartta ayrı rozet olur, satır olarak listelenmez.
const UNSUR_ORDER = [
  "gonderen", "kurum", "konu", "tarih", "sayi", "tckn_maskeli", "telefon_maskeli",
  "talep", "iletisim_adres", "imza",
];

// ---------- güven seviyesi tonu (renk TEK ayırt edici değil; etiket metni de var) ----------
function confTone(conf) {
  if (conf >= 0.7) return { cls: "high", label: "Yüksek" };
  if (conf >= 0.45) return { cls: "mid", label: "Orta" };
  return { cls: "low", label: "Düşük" };
}

/* ---------- 0b) Memur Onay Paneli (HITL — KİLİT DİFERANSİYATÖR) ----------
   AI taslağı üretti ama GÖNDERMEDEN önce yetkili memur onaylar/düzenler/reddeder
   (kamu imza akışının ajan karşılığı). data.onay_bekliyor=true iken görünür; aksi
   halde hiç render edilmez (HITL_ENABLED kapalıysa baseline akış birebir). onResume(
   secim, metin?, gerekce?) → /process_doc/resume çağrılır, final sonuç gelir. */
// Risk bandı (trafik ışığı) etiketleri — yeşil/sarı/kırmızı + ikon + ton sınıfı.
const RISK_LBL = {
  yesil: { text: "Yeşil — Yayın-hazır", tone: "ok", ic: <Icon.circleCheck /> },
  sari: { text: "Sarı — Memur incelesin", tone: "warn", ic: <Icon.alert /> },
  kirmizi: { text: "Kırmızı — Uydurma şüphesi", tone: "danger", ic: <Icon.alert /> },
};

function OnayPaneli({ data, onResume, busy }) {
  const [mode, setMode] = useState(null); // null | "duzenle" | "reddet"
  const [metin, setMetin] = useState(() => data?.yazi_taslak_md || "");
  const [gerekce, setGerekce] = useState("");
  const taslak = normalizeDraftForDemo(data?.yazi_taslak_md || "");
  return (
    <aside className="rc-onay-panel" role="region" aria-labelledby="rc-onay-h">
      <div className="rc-onay-bar" aria-hidden="true" />
      <div className="rc-onay-body">
        <header className="rc-onay-head">
          <span className="rc-onay-ic" aria-hidden="true"><Icon.hand /></span>
          <div>
            <h3 id="rc-onay-h" className="rc-onay-title">Memur Onayı Bekleniyor</h3>
            <p className="rc-onay-sub">
              Yapay zekâ resmî yazı taslağını hazırladı. <strong>Gönderilmeden önce</strong> yetkili
              memurun onayı gerekiyor — AI öneriyor, <strong>memur karar veriyor</strong>.
            </p>
          </div>
        </header>
        {(() => {
          // Risk bandı /process_doc yanıtında risk_metadata olarak gelir (interrupt payload değil).
          const bant = data?.risk_metadata?.bant;
          const gerekceler = data?.risk_metadata?.gerekceler;
          if (!bant || !RISK_LBL[bant]) return null;
          return (
            <div className={`rc-onay-risk rc-risk-${bant}`} role="status">
              <span className="rc-onay-risk-h">
                {RISK_LBL[bant].ic}
                <strong>{RISK_LBL[bant].text}</strong> — bu yüzden onayınıza sunuldu
              </span>
              {Array.isArray(gerekceler) && gerekceler.length > 0 && (
                <ul className="rc-onay-risk-list">
                  {gerekceler.slice(0, 4).map((g, i) => <li key={i}>{cleanDemoText(g)}</li>)}
                </ul>
              )}
            </div>
          );
        })()}
        <pre className="rc-onay-taslak" tabIndex={0} aria-label="Onay bekleyen taslak">{taslak.display}</pre>
        {mode === "duzenle" && (
          <textarea
            className="rc-onay-textarea" value={metin}
            onChange={(e) => setMetin(e.target.value)}
            aria-label="Taslağı düzenle" rows={8}
          />
        )}
        {mode === "reddet" && (
          <input
            className="rc-onay-input" value={gerekce}
            onChange={(e) => setGerekce(e.target.value)}
            placeholder="Red gerekçesi (örn. üslup uygun değil)" aria-label="Red gerekçesi"
          />
        )}
        <div className="rc-onay-actions">
          {mode === null && (
            <>
              <button type="button" className="rc-onay-btn rc-onay-ok" disabled={busy} onClick={() => onResume("onayla")}>
                <Icon.check aria-hidden="true" /> Onayla
              </button>
              <button type="button" className="rc-onay-btn" disabled={busy} onClick={() => setMode("duzenle")}>
                <Icon.pencil aria-hidden="true" /> Düzenle
              </button>
              <button type="button" className="rc-onay-btn rc-onay-red" disabled={busy} onClick={() => setMode("reddet")}>
                <Icon.close aria-hidden="true" /> Reddet
              </button>
            </>
          )}
          {mode === "duzenle" && (
            <>
              <button type="button" className="rc-onay-btn rc-onay-ok" disabled={busy} onClick={() => onResume("duzenle", metin)}>
                <Icon.check aria-hidden="true" /> Düzenlemeyi onayla
              </button>
              <button type="button" className="rc-onay-btn" disabled={busy} onClick={() => setMode(null)}>Vazgeç</button>
            </>
          )}
          {mode === "reddet" && (
            <>
              <button type="button" className="rc-onay-btn rc-onay-red" disabled={busy} onClick={() => onResume("reddet", "", gerekce)}>
                <Icon.close aria-hidden="true" /> Reddi gönder
              </button>
              <button type="button" className="rc-onay-btn" disabled={busy} onClick={() => setMode(null)}>Vazgeç</button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ---------- 1) Evrak Türü + güven ---------- */
function EvrakTuruCard({ turu, conf }) {
  const pct = Math.round((conf || 0) * 100);
  const tone = confTone(conf || 0);
  return (
    <article className="rc-card rc-tur" aria-labelledby="rc-tur-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.file /></span>
        <h3 id="rc-tur-h" className="rc-card-title">Evrak Türü</h3>
      </header>
      <div className="rc-tur-body">
        <span className="rc-tur-name">{EVRAK_TR(turu)}</span>
        <span className={`rc-conf rc-conf-${tone.cls}`} title={`Sınıflandırma güveni: %${pct}`}>
          {tone.label} güven · %{pct}
        </span>
      </div>
      <div
        className="rc-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={`Sınıflandırma güveni yüzde ${pct}`}
      >
        <span className={`rc-meter-fill rc-conf-${tone.cls}`} style={{ "--p": pct / 100 }} />
      </div>
    </article>
  );
}

/* ---------- 2) Çıkarılan Alanlar (PII maskeli rozet) ---------- */
function CikarilanAlanlarCard({ unsurlar }) {
  const u = unsurlar || {};
  const piiVar = !!u.pii_var;
  const rows = UNSUR_ORDER
    .filter((k) => u[k] !== undefined && u[k] !== null && u[k] !== false && u[k] !== "")
    .map((k) => ({ key: k, meta: UNSUR_META[k], value: u[k] }));
  return (
    <article className="rc-card rc-alanlar" aria-labelledby="rc-alan-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.search /></span>
        <h3 id="rc-alan-h" className="rc-card-title">Çıkarılan Bilgi Unsurları</h3>
        {piiVar && (
          <span className="rc-badge rc-badge-pii" title="Kişisel veri tespit edildi ve maskelendi">
            <Icon.shield aria-hidden="true" /> Kişisel veri maskelendi
          </span>
        )}
      </header>
      {rows.length === 0 ? (
        <p className="rc-empty">Yapısal bilgi unsuru çıkarılamadı.</p>
      ) : (
        <dl className="rc-kv">
          {rows.map(({ key, meta, value }) => (
            <div className="rc-kv-row" key={key}>
              <dt>
                {meta.label}
                {meta.pii && <span className="rc-mask-tag" aria-label="maskeli kişisel veri">maskeli</span>}
              </dt>
              <dd className={meta.pii ? "rc-mono" : undefined}>
                {meta.bool ? <>Var <Icon.check aria-hidden="true" /></> : cleanDemoText(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/* ---------- 2b) Kanıt — çıkarımın kaynaktaki yeri (sarı vurgu) ----------
   Şeffaflık: "bu sayıyı/tarihi nereden buldun?" → ham (maskeli) metinde tam yeri işaretli.
   result.kanit_metadata = { metin (PII-maskeli), spanlar:[{start,end,alan,label,deger}] }.
   Ham PII metne sızmaz (backend mask_pii ile maskeler). Veri yoksa kart gizli. */
function KanitVurguCard({ kanit }) {
  const k = kanit || {};
  const metin = typeof k.metin === "string" ? k.metin : "";
  const spanlar = Array.isArray(k.spanlar) ? k.spanlar : [];
  if (!metin || spanlar.length === 0) return null;
  // Metni span'lara göre düz/vurgulu segmentlere böl (çakışma backend'de elendi).
  const segs = [];
  let cur = 0;
  for (const sp of spanlar) {
    const s = Math.max(cur, Math.min(metin.length, sp.start | 0));
    const e = Math.max(s, Math.min(metin.length, sp.end | 0));
    if (s > cur) segs.push({ t: metin.slice(cur, s) });
    if (e > s) segs.push({ t: metin.slice(s, e), label: sp.label });
    cur = e;
  }
  if (cur < metin.length) segs.push({ t: metin.slice(cur) });
  return (
    <article className="rc-card rc-kanit" aria-labelledby="rc-kanit-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.search /></span>
        <h3 id="rc-kanit-h" className="rc-card-title">Kanıt — Çıkarımın Kaynaktaki Yeri</h3>
        <span className="rc-badge rc-badge-ok">{spanlar.length} işaretli</span>
      </header>
      <p className="rc-kanit-sub">
        Çıkarılan her unsurun <strong>ham evraktaki yeri</strong> sarı ile işaretlendi
        (kişisel veri maskeli gösterilir).
      </p>
      <pre className="rc-kanit-metin" tabIndex={0} aria-label="İşaretli kaynak metin">
        {segs.map((sg, i) => sg.label
          ? <mark className="rc-kanit-mark" key={i} title={sg.label}>{sg.t}</mark>
          : <span key={i}>{sg.t}</span>)}
      </pre>
    </article>
  );
}

/* ---------- 0) Dur-ve-sor (clarify) bannerı — KİLİT DİFERANSİYATÖR ----------
   Sistem eksik kritik bilgi tespit edince "körü körüne üretmek" yerine DURUR ve
   vatandaştan net bilgi ister. Bu, sonuç akışının EN ÜSTÜNDE belirgin, tasarlanmış
   bir uyarı bannerı olur (jüri mesajı: "sistem eksiği fark ediyor ve duruyor").

   Honest-data: backend ProcessResponse `clarify_questions` (eksik_tespit/clarifier
   çıktısı) + `eksik_alanlar` taşır. Veri yoksa banner hiç render edilmez (uydurma yok).
   Mevcut EksikBilgiCard KORUNUR (detaylı alan kontrolü) — bu banner onun üstünde özet/çağrı.
   Eksik alan makine-adlarını okunur Türkçe etikete çevirir (varsa). */
const EKSIK_ALAN_TR = {
  gonderen: "Gönderen (ad-soyad)",
  gonderen_ad_soyad: "Gönderen (ad-soyad)",
  imza: "İmza",
  iletisim_adres: "İletişim / tebligat adresi",
  tarih: "Tarih",
  konu: "Konu",
  sayi: "Sayı",
  kurum: "Muhatap kurum",
  talep: "Somut talep",
};
const EKSIK_TR = (k) => EKSIK_ALAN_TR[k] || k;

function ClarifyBanner({ eksik, sorular }) {
  const e = (eksik || []).filter(Boolean);
  const q = (sorular || []).filter(Boolean);
  // Banner yalnız sistem GERÇEKTEN soru ürettiğinde görünür (clarify tetiklendi).
  if (q.length === 0) return null;
  return (
    <aside
      className="rc-clarify-banner"
      role="region"
      aria-labelledby="rc-clarify-banner-h"
    >
      <div className="rc-clarify-banner-bar" aria-hidden="true" />
      <div className="rc-clarify-banner-body">
        <header className="rc-clarify-banner-head">
          <span className="rc-clarify-banner-ic" aria-hidden="true"><Icon.hand /></span>
          <div>
            <h3 id="rc-clarify-banner-h" className="rc-clarify-banner-title">
              Eksik Bilgi — Sistem Soru Soruyor
            </h3>
            <p className="rc-clarify-banner-sub">
              Evrak <strong>körü körüne işleme alınmadı</strong>. Sistem zorunlu alanlardaki
              eksiği fark edip <strong>durdu</strong> ve aşağıdaki bilgileri talep ediyor.
            </p>
          </div>
          <span className="rc-clarify-banner-count" aria-hidden="true">
            {q.length} soru
          </span>
        </header>

        {e.length > 0 && (
          <p className="rc-clarify-banner-why">
            <Icon.info aria-hidden="true" />
            <span>Neden soruldu? Zorunlu alanlardan{" "}
            <strong>{e.map(EKSIK_TR).join(", ")}</strong>{" "}
            evrakta tespit edilemedi (3071 sayılı Kanun m.4).</span>
          </p>
        )}

        <ol className="rc-clarify-banner-list" aria-label="Vatandaştan istenen bilgiler">
          {q.map((s, i) => (
            <li key={i}>
              <span className="rc-clarify-banner-q-ic" aria-hidden="true"><Icon.arrowRight /></span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <p className="rc-clarify-banner-foot" role="note">
          Bu bilgiler tamamlanıp evrak yeniden gönderildiğinde işlem kaldığı yerden sürer.
        </p>
      </div>
    </aside>
  );
}

/* ---------- 3) Eksik Bilgi + clarify soruları ---------- */
function EksikBilgiCard({ eksik, sorular }) {
  const e = eksik || [];
  const q = sorular || [];
  const tam = e.length === 0;
  return (
    <article className={`rc-card rc-eksik ${tam ? "rc-eksik-ok" : "rc-eksik-warn"}`} aria-labelledby="rc-eksik-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{tam ? <Icon.circleCheck /> : <Icon.alert />}</span>
        <h3 id="rc-eksik-h" className="rc-card-title">Eksik Bilgi Kontrolü</h3>
        <span className={`rc-badge ${tam ? "rc-badge-ok" : "rc-badge-warn"}`}>
          {tam ? "Zorunlu alanlar tam" : `${e.length} eksik alan`}
        </span>
      </header>
      {tam ? (
        <p className="rc-eksik-note">Zorunlu alanlar eksiksiz — evrak işleme alınabilir.</p>
      ) : (
        <>
          <ul className="rc-chiplist" aria-label="Eksik alanlar">
            {e.map((alan) => <li className="rc-chip rc-chip-warn" key={alan}>{EKSIK_TR(alan)}</li>)}
          </ul>
          {q.length > 0 && (
            <div className="rc-clarify">
              <p className="rc-clarify-h">Vatandaştan istenecek bilgiler:</p>
              <ol className="rc-clarify-list">
                {q.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ---------- 4) Mevzuat önerileri ---------- */
function MevzuatCard({ oneriler, nli }) {
  const list = oneriler || [];
  if (!list.length) return null;
  // NLI atıf-gerekçelendirme (ENV-gated; varsa) → başlığa göre entailment işareti.
  const nliByBaslik = new Map((nli || []).map((n) => [String(n.baslik || ""), n]));
  return (
    <article className="rc-card rc-mevzuat" aria-labelledby="rc-mev-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.book /></span>
        <h3 id="rc-mev-h" className="rc-card-title">İlgili Mevzuat</h3>
      </header>
      <ul className="rc-mev-list">
        {list.map((m, i) => {
          // javascript:/data: gibi tehlikeli şemalar reddedilir; yalnız http/https link olur.
          const href = safeUrl(m.url);
          const scorePct = typeof m.score === "number" && m.score > 0 ? Math.round(m.score * 100) : null;
          const baslik = cleanDemoText(m.gosterim_adi || m.baslik);
          const snippet = cleanDemoText(m.snippet);
          const nliMark = nliByBaslik.get(String(m.baslik || ""));
          return (
          <li className="rc-mev-item" key={i}>
            <div className="rc-mev-top">
              {href ? (
                /* SC 2.4.4 Link Amacı — linkin hedefi etiketinde açık */
                <a
                  className="rc-mev-baslik"
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${baslik} (yeni sekmede açılır)`}
                >
                  {baslik}
                </a>
              ) : (
                <span className="rc-mev-baslik">{baslik}</span>
              )}
              {scorePct !== null && (
                /* SC 1.4.1 — ikon+metin; renk tek sinyal değil (yüzde değeri metin olarak da var) */
                <span
                  className="rc-mev-score"
                  aria-label={`İlgililik skoru yüzde ${scorePct}`}
                >
                  {scorePct}%
                </span>
              )}
              {nliMark && (
                /* NLI entailment: madde evrak talebine anlamsal DESTEK veriyor mu (semantik anti-halüsinasyon). */
                <span
                  className={`rc-mev-nli ${nliMark.entailment ? "rc-badge-ok" : "rc-badge-warn"}`}
                  title={`Anlamsal destek (NLI): %${Math.round((nliMark.skor || 0) * 100)}`}
                >
                  {nliMark.entailment ? "anlamsal destek ✓" : "anlamsal destek zayıf"}
                </span>
              )}
            </div>
            {snippet && <p className="rc-mev-snippet">{snippet}</p>}
          </li>
          );
        })}
      </ul>
    </article>
  );
}

/* ---------- 5) Birim yönlendirme + alternatifler ---------- */
function BirimCard({ r }) {
  const hedef = gosterimBirimi(r);
  const alternatifler = r.birim_alternatifleri || [];
  const kurum = r.hedef_kurum_adi || r.hedef_birim_kaynak?.kaynak_kurum || r.yetkili_kurum?.ad || r.muhatap_kurum?.ad || "";
  const alts = alternatifler.filter((b) => b !== hedef);
  return (
    <article className="rc-card rc-birim rc-g2" aria-labelledby="rc-birim-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.route /></span>
        <h3 id="rc-birim-h" className="rc-card-title">Önerilen Havale Birimi</h3>
      </header>
      {kurum && <p className="rc-birim-kurum">Kurum: {kurum}</p>}
      <p className="rc-birim-hedef">Havale birimi: {BIRIM_LBL(hedef)}</p>
      {alts.length > 0 && (
        <div className="rc-birim-alts">
          <span className="rc-birim-alts-h">Alternatif birimler:</span>
          <ul className="rc-chiplist">
            {alts.map((b) => <li className="rc-chip" key={b}>{BIRIM_LBL(b)}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}

/* ---------- 8) Arşiv Bilgisi (SDP / saklama planı) ---------- */
/* Standart Dosya Planı (2005/7) çıktısı: belgenin saklama/arşiv künyesi.
   result.arsiv_metadata = { sdp_kodu, saklama_suresi, konu, sayi, tarih, birim }.
   Alan yoksa kart tamamen gizlenir (graceful — backend şeması henüz taşımayabilir). */
const ARSIV_ROWS = [
  { key: "sdp_kodu", label: "SDP kodu", mono: true },
  { key: "saklama_suresi", label: "Saklama süresi" },
  { key: "sayi", label: "Sayı", mono: true },
  { key: "tarih", label: "Tarih" },
  { key: "konu", label: "Konu" },
  { key: "birim", label: "Birim" },
];

function ArsivBilgisiCard({ arsiv }) {
  const a = arsiv || {};
  const rows = ARSIV_ROWS
    .filter(({ key }) => a[key] !== undefined && a[key] !== null && a[key] !== "")
    .map((row) => ({ ...row, value: a[row.key] }));
  // Hiçbir alan yoksa kartı hiç gösterme.
  if (rows.length === 0) return null;
  return (
    <article className="rc-card rc-arsiv" aria-labelledby="rc-arsiv-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.archive /></span>
        <h3 id="rc-arsiv-h" className="rc-card-title">Arşiv Bilgisi (Standart Dosya Planı)</h3>
      </header>
      <dl className="rc-kv">
        {rows.map(({ key, label, mono, value }) => (
          <div className="rc-kv-row" key={key}>
            <dt>{label}</dt>
            <dd className={mono ? "rc-mono" : undefined}>{cleanDemoText(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/* ---------- 8b) Yasal Süre / SLA triyaj (GECİKMİŞ/KRİTİK rozeti) ----------
   Kamu gerçeği: vatandaş başvurusunun yasal cevap süresi vardır (dilekçe 30 gün — 3071
   m.7; bilgi edinme 15 iş günü — 4982 m.11). result.sla_metadata = { durum, etiket,
   son_tarih, kalan_gun, baslangic, sure, mevzuat }. Süre tanımsız (kurum→kurum yazı) →
   kart gizlenir (graceful, uydurma yok). GECİKMİŞ/KRİTİK = belirgin uyarı rengi (demo-wow). */
const SLA_TONE = {
  GECIKMIS: { badge: "rc-badge-warn", ic: <Icon.alert /> },
  KRITIK: { badge: "rc-badge-warn", ic: <Icon.alert /> },
  NORMAL: { badge: "rc-badge-ok", ic: <Icon.circleCheck /> },
  tarih_yok: { badge: "rc-badge-warn", ic: <Icon.info /> },
};

function SlaTriyajCard({ sla }) {
  const s = sla || {};
  // Yasal vatandaş-süresi tanımsız tür (kurum→kurum) → kartı hiç gösterme.
  if (!s.durum || s.durum === "tanimsiz") return null;
  const tone = SLA_TONE[s.durum] || SLA_TONE.tarih_yok;
  const acil = s.durum === "GECIKMIS" || s.durum === "KRITIK";
  return (
    <article
      className={`rc-card rc-sla rc-sla-${s.durum.toLowerCase()}`}
      aria-labelledby="rc-sla-h"
    >
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{tone.ic}</span>
        <h3 id="rc-sla-h" className="rc-card-title">Yasal Süre Takibi</h3>
        <span className={`rc-badge ${tone.badge}`}>{cleanDemoText(s.etiket)}</span>
      </header>
      <dl className="rc-kv">
        {s.son_tarih && (
          <div className="rc-kv-row"><dt>Son cevap tarihi</dt><dd>{s.son_tarih}</dd></div>
        )}
        {typeof s.kalan_gun === "number" && (
          <div className="rc-kv-row">
            <dt>Kalan</dt>
            <dd className={acil ? "rc-mono" : undefined}>
              {s.kalan_gun < 0
                ? `${Math.abs(s.kalan_gun)} gün GECİKTİ`
                : `${s.kalan_gun} gün`}
            </dd>
          </div>
        )}
        {s.sure && <div className="rc-kv-row"><dt>Yasal süre</dt><dd>{s.sure}</dd></div>}
        {s.mevzuat && (
          <div className="rc-kv-row"><dt>Dayanak</dt><dd>{cleanDemoText(s.mevzuat)}</dd></div>
        )}
      </dl>
    </article>
  );
}

/* ---------- 8c2) Çok-Konulu Ayrıştırma (decompose) — VİTRİN ----------
   Kamu gerçeği: vatandaş tek dilekçeye birden çok istek yazar; memur 3 kez fotokopileyip
   3 ayrı daireye elle dağıtır. Sistem dilekçeyi alt-taleplere böler, her birine ayrı
   tür+birim+yasal süre verir → otomatik havale. result.alt_talepler = [{ozet,tur,tur_tr,
   birim,birim_tr,yazi_turu,cevap_suresi,sla_durum}, ...]. <2 alt-talep → tek-konulu → gizli. */
function DecomposeCard({ altTalepler }) {
  const items = Array.isArray(altTalepler) ? altTalepler : [];
  if (items.length < 2) return null;
  return (
    <article className="rc-card rc-decompose" aria-labelledby="rc-decompose-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.route /></span>
        <h3 id="rc-decompose-h" className="rc-card-title">Çok-Konulu Ayrıştırma</h3>
        <span className="rc-badge rc-badge-accent">{items.length} ayrı iş</span>
      </header>
      <p className="rc-decompose-sub">
        Bu tek evrak <strong>{items.length} ayrı iş</strong> içeriyor; her biri ilgili birime
        ayrı ayrı havale önerildi — kâğıdı elle bölüp dağıtmaya gerek yok.
      </p>
      <ol className="rc-decompose-list" aria-label="Alt-talepler">
        {items.map((a, i) => {
          const acil = a.sla_durum === "GECIKMIS" || a.sla_durum === "KRITIK";
          return (
            <li className="rc-decompose-item" key={i}>
              <div className="rc-decompose-row">
                <span className="rc-decompose-no" aria-hidden="true">{i + 1}</span>
                <p className="rc-decompose-ozet">{cleanDemoText(a.ozet || "")}</p>
              </div>
              <div className="rc-decompose-meta">
                {(a.tur_tr || a.tur) && (
                  <span className="rc-chip rc-chip-tur">{a.tur_tr || a.tur}</span>
                )}
                {(a.birim_tr || a.birim) && (
                  <span className="rc-chip rc-chip-birim">
                    <Icon.arrowRight aria-hidden="true" />
                    {a.birim_tr || a.birim}
                  </span>
                )}
                {a.cevap_suresi && (
                  <span className={"rc-chip rc-chip-sure" + (acil ? " rc-chip-acil" : "")}>
                    {cleanDemoText(a.cevap_suresi)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

/* ---------- 8c3) Risk Bandı (trafik ışığı) + koşullu onay — GÜVEN ----------
   Kamu gerçeği: kurum AI çıktısını gözden geçirmeden gönderemez. result.risk_metadata =
   {bant: yesil|sari|kirmizi, skor, gerekceler:[...], oneri}. yeşil=yayın-hazır,
   sarı=memur incelesin, kırmızı=uydurma şüphesi. Band yoksa kart gizlenir (graceful). */
function RiskBandCard({ risk }) {
  const r = risk || {};
  const lbl = RISK_LBL[r.bant];
  if (!lbl) return null;
  return (
    <article className={`rc-card rc-risk rc-risk-${r.bant}`} aria-labelledby="rc-risk-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{lbl.ic}</span>
        <h3 id="rc-risk-h" className="rc-card-title">Risk Bandı (Yayın Güvenliği)</h3>
        <span className={`rc-badge rc-risk-badge-${r.bant}`}>
          <span className="rc-risk-dot" aria-hidden="true" />{lbl.text}
        </span>
      </header>
      <p className="rc-risk-oneri">{cleanDemoText(r.oneri || "")}</p>
      {Array.isArray(r.gerekceler) && r.gerekceler.length > 0 && (
        <ul className="rc-risk-list">
          {r.gerekceler.map((g, i) => <li key={i}>{cleanDemoText(g)}</li>)}
        </ul>
      )}
    </article>
  );
}

/* ---------- 8c) Denetim İzi (tamper-evident SHA-256 hash-chain) ----------
   Kamu gerçeği: Sayıştay denetimi + KVKK işleme kaydı → kararların DEĞİŞTİRİLEMEZ izi.
   result.denetim_izi = { zincir:[{adim,veri,hash,onceki}], kok_hash, adim_sayisi,
   butunluk, algoritma }. Zincir yoksa kart gizlenir (graceful). */
function DenetimIziCard({ denetim }) {
  const d = denetim || {};
  if (!Array.isArray(d.zincir) || d.zincir.length === 0) return null;
  const ok = d.butunluk !== false;
  return (
    <article
      className={`rc-card rc-denetim ${ok ? "rc-denetim-ok" : "rc-denetim-warn"}`}
      aria-labelledby="rc-denetim-h"
    >
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{ok ? <Icon.shieldCheck /> : <Icon.alert />}</span>
        <h3 id="rc-denetim-h" className="rc-card-title">Denetim İzi (Değiştirilemez Kayıt)</h3>
        <span className={`rc-badge ${ok ? "rc-badge-ok" : "rc-badge-warn"}`}>
          {ok ? <>Bütünlük doğrulandı <span aria-hidden="true">✓</span></> : "BÜTÜNLÜK İHLALİ"}
        </span>
      </header>
      <p className="rc-denetim-sub">
        {d.adim_sayisi} karar adımı <strong>{d.algoritma || "SHA-256 hash-chain"}</strong> ile zincirlendi;
        her halka öncekinin parmak izini içerir → bir adım sonradan değişirse zincir kırılır
        (Sayıştay denetimi / KVKK işleme kaydı).
      </p>
      <div className="rc-denetim-kok">
        <span className="rc-denetim-kok-h">Kök parmak izi (SHA-256)</span>
        <code className="rc-mono rc-denetim-hash">{String(d.kok_hash || "")}</code>
      </div>
      <ol className="rc-denetim-chain" aria-label="Karar zinciri">
        {d.zincir.map((e, i) => (
          <li className="rc-denetim-link" key={i}>
            <span className="rc-denetim-step">{i + 1}. {e.adim}</span>
            <code className="rc-mono rc-denetim-h8">{String(e.hash || "").slice(0, 12)}…</code>
          </li>
        ))}
      </ol>
    </article>
  );
}

/* ---------- üst özet (bilgilendirme) ----------
   "Düşünen sistem" hissi: metin daktilo (token-token) efektiyle akar. Erişilebilirlik:
   görsel katman daktilo eder (aria-hidden); ekran okuyucuya TAM metin ayrı sr-only
   bölgede verilir → kısmi/parçalı duyuru olmaz. reduced-motion'da efekt KAPALI
   (hook anında tam metin döndürür) → görsel = sr-only, ikisi de tam metin. */
function BilgilendirmeCard({ text }) {
  // Backend metnine güvenme: kurumsal üslup için emoji/pictograph'ları temizle (UI ikonları SVG).
  const safe = cleanDemoText(stripEmoji(text || ""));
  // Hook'lar koşulsuz çağrılmalı (Rules of Hooks) → erken return ÖNCESİ.
  const { shown, animating } = useTypewriter(safe, { cps: 520 });
  if (!safe) return null;
  return (
    <article className="rc-card rc-info" aria-labelledby="rc-info-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.megaphone /></span>
        <h3 id="rc-info-h" className="rc-card-title">Bilgilendirme</h3>
      </header>
      {/* Görsel daktilo katmanı — ekran okuyucudan gizli; tam metin sr-only'de.
          Daktilo sırasında sizer overlay: görünmez TAM metin son boyutu kilitler,
          akan metin üstünde mutlak konumda → kutu frame-başı büyümez (reflow/jank fix). */}
      <div className={"rc-info-body" + (animating ? " is-typing" : "")} aria-hidden="true">
        {animating ? (
          /* overflow:hidden — caret satırı yazımın sonunda sizer yüksekliğini bir-iki
             saniye aşabiliyor; taşan caret kart padding'ine sarkmasın. */
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ visibility: "hidden" }}>
              {safe.split("\n\n").map((para, i) => <p key={i}>{renderInlineBold(para)}</p>)}
            </div>
            <div style={{ position: "absolute", inset: 0 }}>
              {shown.split("\n\n").map((para, i) => <p key={i}>{renderInlineBold(para)}</p>)}
              <span className="rc-caret" aria-hidden="true" />
            </div>
          </div>
        ) : shown.split("\n\n").map((para, i) => <p key={i}>{renderInlineBold(para)}</p>)}
      </div>
      <p className="rc-sr">{safe}</p>
    </article>
  );
}

// Backend kaynaklı metinden emoji/pictograph temizle — "no emoji" sözleşmesi UI sınırında
// da korunsun (backend regresyonuna karşı savunma). Ok/onay işaretleri (→ ✓) etkilenmez.
function stripEmoji(s) {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/️/g, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]{2,}/g, " ");
}

// Çok hafif **kalın** ve satır-sonu işleyici (markdown kütüphanesi gerektirmeden).
function renderInlineBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    // tek paragraf içindeki \n → <br/>
    const lines = p.split("\n");
    return lines.map((ln, j) => (
      <React.Fragment key={`${i}-${j}`}>{j > 0 && <br />}{ln}</React.Fragment>
    ));
  });
}

/* ---------- ana bileşen ---------- */
export function ResultCards({ r, onToast, onDownload, downloading, canDownload, verify }) {
  if (!r) return null;
  return (
    <section className="rc-grid" aria-labelledby="rc-results-h">
      {/* Başlık hiyerarşisi h1→h2→h3: kartlar (h3) bu h2'nin altına oturur (SC 1.3.1/2.4.6). */}
      <h2 id="rc-results-h" className="rc-sr">Evrak işleme sonuçları</h2>
      {/* Dur-ve-sor: sistem eksiği fark edip soru ürettiyse EN ÜSTTE belirgin banner. */}
      <ClarifyBanner eksik={r.eksik_alanlar} sorular={r.clarify_questions} />
      <BilgilendirmeCard text={r.bilgilendirme} />
      <div className="rc-row rc-row-2">
        <EvrakTuruCard turu={r.evrak_turu} conf={r.tur_confidence} />
        <BirimCard r={r} />
      </div>
      {/* VİTRİN — çok-konulu evrak ayrıştırma: tek dilekçe → N alt-talep, her biri ayrı
          birime otomatik havale. <2 alt-talep (tek-konulu) → kart kendini gizler. */}
      <DecomposeCard altTalepler={r.alt_talepler} />
      {/* Yasal süre takibi — GECİKMİŞ/KRİTİK belirgin (tanımsız türde gizli). */}
      <SlaTriyajCard sla={r.sla_metadata} />
      <CikarilanAlanlarCard unsurlar={r.bilgi_unsurlari} />
      <KanitVurguCard kanit={r.kanit_metadata} />
      <EksikBilgiCard eksik={r.eksik_alanlar} sorular={r.clarify_questions} />
      <MevzuatCard oneriler={r.mevzuat_onerileri} nli={r.mevzuat_nli} />
      <YaziTaslakCard
        yaziTuru={r.yazi_turu} taslakMd={r.yazi_taslak_md} onToast={onToast}
        onDownload={onDownload} downloading={downloading} canDownload={canDownload}
      />
      <DogrulamaCard verify={verify} taslakMd={r.yazi_taslak_md} />
      {/* Risk bandı (trafik ışığı) — yayın güvenliği: yeşil/sarı/kırmızı + koşullu onay tetiği. */}
      <RiskBandCard risk={r.risk_metadata} />
      <ArsivBilgisiCard arsiv={r.arsiv_metadata} />
      <DenetimIziCard denetim={r.denetim_izi} />
      {/* Yasal sorumluluk reddi — her sonuçta zorunlu (kamu kararı destek aracı, karar mercii değil) */}
      <p className="rc-disclaimer" role="note">
        <Icon.scale aria-hidden="true" />
        <span>Bu sistem <strong>karar-destek</strong> amaçlıdır; nihai sorumluluk yetkili personeldedir.
        Sınıflandırma, havale ve yazı onayı yetkili kamu görevlisi tarafından teyit edilmelidir.
        Kişisel veriler (TCKN, telefon) <strong>maskelenerek</strong> işlenmiştir.</span>
      </p>
    </section>
  );
}

export default ResultCards;
// Test/yeniden-kullanım için iç kartlar da export edilir.
export {
  OnayPaneli, ClarifyBanner, EvrakTuruCard, CikarilanAlanlarCard, KanitVurguCard, EksikBilgiCard, MevzuatCard,
  BirimCard, YaziTaslakCard, DogrulamaCard, ArsivBilgisiCard, SlaTriyajCard, DecomposeCard, RiskBandCard, DenetimIziCard, BilgilendirmeCard,
  EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, EKSIK_TR, safeUrl, cleanDemoText, normalizeDraftForDemo,
};
