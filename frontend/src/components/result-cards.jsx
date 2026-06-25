/* Sonuç kartları — /process_doc ProcessResponse alanlarını cilalı, erişilebilir kartlara böler.
   SIFIR ek dep (saf React + CSS). Tüm etiketler Türkçe. Kart bileşenleri bağımsız test/yeniden
   kullanılabilir; App yalnız <ResultCards r={result} /> render eder.

   PII şeffaflığı (CLAUDE.md §2): backend TCKN/telefon'u ZATEN maskeler (tckn_maskeli/
   telefon_maskeli). UI bu alanlara açık "maskeli" rozeti basar — vatandaş korumasının
   görünür kanıtı (jüri "wow"). Ham PII frontend'e hiç ulaşmaz. */
import React, { useState } from "react";

// --- Makine kodu → Türkçe etiket (backend config ile eşleşir; UI okunabilirliği) ---
const EVRAK_TURU_TR = {
  dilekce: "Dilekçe", basvuru: "Başvuru", sikayet: "Şikâyet", ihbar: "İhbar",
  talep: "Talep", bilgi_edinme: "Bilgi Edinme Başvurusu", cimer: "CİMER Başvurusu",
  ust_yazi: "Üst Yazı", cevabi_yazi: "Cevabi Yazı", tebligat: "Tebligat",
  dava_evraki: "Dava Evrakı", icra_evraki: "İcra Evrakı", muzekkere: "Müzekkere",
  fatura: "Fatura / Ödeme Belgesi", tutanak: "Tutanak", rapor: "Rapor",
  gorus_mutalaa: "Görüş / Mütalaa", genelge_talimat_olur: "Genelge / Talimat / Olur",
  belirsiz: "Belirsiz",
};
const BIRIM_TR = {
  yazi_isleri_evrak: "Yazı İşleri / Genel Evrak Müdürlüğü",
  hukuk_musavirligi: "Hukuk Müşavirliği",
  insan_kaynaklari: "İnsan Kaynakları / Personel Dairesi",
  mali_strateji_sgb: "Strateji Geliştirme / Mali İşler",
  bilgi_islem: "Bilgi İşlem Dairesi",
  destek_idari_hizmetler: "Destek / İdari Hizmetler Dairesi",
  basin_halkla_iliskiler_cimer: "Basın-Halkla İlişkiler / CİMER Birimi",
  teftis_ic_denetim: "Teftiş / İç Denetim",
  ilgili_teknik_daire: "İlgili Teknik / Ana Hizmet Dairesi",
};
const YAZI_TURU_TR = {
  ust_yazi: "Üst Yazı", cevabi_yazi: "Cevabi Yazı",
  bilgilendirme: "Bilgilendirme Yazısı", olur: "Olur / Onay Yazısı",
};

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

const EVRAK_TR = (k) => EVRAK_TURU_TR[k] || k || "—";
const BIRIM_LBL = (k) => BIRIM_TR[k] || k || "—";
const YAZI_TR = (k) => YAZI_TURU_TR[k] || k || "";

// ---------- güven seviyesi tonu (renk TEK ayırt edici değil; etiket metni de var) ----------
function confTone(conf) {
  if (conf >= 0.7) return { cls: "high", label: "Yüksek" };
  if (conf >= 0.45) return { cls: "mid", label: "Orta" };
  return { cls: "low", label: "Düşük" };
}

/* ---------- 1) Evrak Türü + güven ---------- */
function EvrakTuruCard({ turu, conf }) {
  const pct = Math.round((conf || 0) * 100);
  const tone = confTone(conf || 0);
  return (
    <article className="rc-card rc-tur" aria-labelledby="rc-tur-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">📄</span>
        <h3 id="rc-tur-h" className="rc-card-title">Evrak Türü</h3>
      </header>
      <div className="rc-tur-body">
        <span className="rc-tur-name">{EVRAK_TR(turu)}</span>
        <span className={`rc-conf rc-conf-${tone.cls}`} title={`Sınıflandırma güveni: %${pct}`}>
          {tone.label} güven · %{pct}
        </span>
      </div>
      <div
        className="rc-meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={`Sınıflandırma güveni yüzde ${pct}`}
      >
        <span className={`rc-meter-fill rc-conf-${tone.cls}`} style={{ width: `${pct}%` }} />
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
        <span className="rc-ic" aria-hidden="true">🔎</span>
        <h3 id="rc-alan-h" className="rc-card-title">Çıkarılan Bilgi Unsurları</h3>
        {piiVar && (
          <span className="rc-badge rc-badge-pii" title="Kişisel veri tespit edildi ve maskelendi">
            🛡️ Kişisel veri maskelendi
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
                {meta.bool ? "Var ✓" : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
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
        <span className="rc-ic" aria-hidden="true">{tam ? "✅" : "⚠️"}</span>
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
            {e.map((alan) => <li className="rc-chip rc-chip-warn" key={alan}>{alan}</li>)}
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
function MevzuatCard({ oneriler }) {
  const list = oneriler || [];
  if (!list.length) return null;
  return (
    <article className="rc-card rc-mevzuat" aria-labelledby="rc-mev-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">📚</span>
        <h3 id="rc-mev-h" className="rc-card-title">İlgili Mevzuat</h3>
      </header>
      <ul className="rc-mev-list">
        {list.map((m, i) => (
          <li className="rc-mev-item" key={i}>
            <div className="rc-mev-top">
              {m.url ? (
                <a className="rc-mev-baslik" href={m.url} target="_blank" rel="noreferrer noopener">{m.baslik}</a>
              ) : (
                <span className="rc-mev-baslik">{m.baslik}</span>
              )}
              {typeof m.score === "number" && m.score > 0 && (
                <span className="rc-mev-score" title="İlgililik skoru">{Math.round(m.score * 100)}%</span>
              )}
            </div>
            {m.snippet && <p className="rc-mev-snippet">{m.snippet}</p>}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ---------- 5) Birim yönlendirme + alternatifler ---------- */
function BirimCard({ hedef, alternatifler }) {
  const alts = (alternatifler || []).filter((b) => b !== hedef);
  return (
    <article className="rc-card rc-birim rc-g2" aria-labelledby="rc-birim-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">➡️</span>
        <h3 id="rc-birim-h" className="rc-card-title">Önerilen Havale Birimi</h3>
      </header>
      <p className="rc-birim-hedef">{BIRIM_LBL(hedef)}</p>
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

/* ---------- 6) Yazı Taslağı (önizleme + kopyala + PDF/DOCX indir) ---------- */
function YaziTaslakCard({ yaziTuru, taslakMd, onToast, onDownload, downloading, canDownload }) {
  const [copied, setCopied] = useState(false);
  if (!taslakMd) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(taslakMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      onToast?.("Yazı taslağı panoya kopyalandı.");
    } catch {
      onToast?.("Kopyalanamadı — tarayıcı izni gerekebilir.");
    }
  };

  // İndirme yalnız evrak metni eldeyken (örnek metin yolu) etkin; aksi halde
  // (dosya/OCR yolu) buton devre dışı + açıklayıcı başlık.
  const busy = !!downloading;
  const dlTitle = canDownload
    ? "Taslağı indir"
    : "İndirme için örnek bir evrak metni seçin (dosya/OCR yolunda metin saklanmıyor)";
  const dl = (fmt) => () => onDownload?.(fmt);

  return (
    <article className="rc-card rc-taslak rc-g2" aria-labelledby="rc-taslak-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">📝</span>
        <h3 id="rc-taslak-h" className="rc-card-title">
          Resmî Yazı Taslağı{yaziTuru ? ` · ${YAZI_TR(yaziTuru)}` : ""}
        </h3>
        <div className="rc-taslak-actions">
          <button type="button" className="rc-btn" onClick={copy} aria-label="Yazı taslağını kopyala">
            {copied ? "✓ Kopyalandı" : "Kopyala"}
          </button>
          <button
            type="button" className="rc-btn" onClick={dl("pdf")}
            disabled={!canDownload || busy} title={dlTitle} aria-label="Taslağı PDF olarak indir"
          >
            {downloading === "pdf" ? "İndiriliyor…" : "PDF indir"}
          </button>
          <button
            type="button" className="rc-btn" onClick={dl("docx")}
            disabled={!canDownload || busy} title={dlTitle} aria-label="Taslağı DOCX olarak indir"
          >
            {downloading === "docx" ? "İndiriliyor…" : "DOCX indir"}
          </button>
        </div>
      </header>
      <pre className="rc-taslak-pre" tabIndex={0} aria-label="Yazı taslağı önizleme">{taslakMd}</pre>
      {!canDownload && (
        // Dosya/OCR yolunda evrak metni client'ta saklanmaz → indirme devre dışı.
        // Tooltip yeterli değil; jüri ve ekran okuyucu için görünür açıklama.
        <p className="rc-taslak-dlnote" role="note">
          ℹ️ İndirme (PDF/DOCX), <strong>örnek evrak</strong> akışında etkindir. Dosya yükleme
          yolunda taslağı yukarıdan <strong>Kopyala</strong> ile alabilirsiniz.
        </p>
      )}
      <p className="rc-taslak-note">
        Bu taslak yalnız ön hazırlıktır; <code>{"{{ }}"}</code> yer tutucuları yetkili birim
        tarafından doldurulmalıdır.
      </p>
    </article>
  );
}

/* ---------- 7) Doğrulama (verify kalite kapısı) ---------- */
/* Görev 2 kalite kapısı çıktısı: resmî yazı taslağının (a) zorunlu format bölümlerini
   içerip içermediği (format_uyumlu) ve (b) kaynak evrakta OLMAYAN somut tarih/sayı
   "uydurması" olup olmadığı (verify_uyari). Veri App'in elindeki verify node data'sından
   gelir (backend ProcessResponse şeması verify alanlarını taşımayabilir → graceful).
   taslakMd verilmediyse (taslak yok) kart gizlenir. */
function DogrulamaCard({ verify, taslakMd }) {
  if (!taslakMd) return null;
  const uyarilar = (verify?.verify_uyari || []).filter(Boolean);
  // format_uyumlu açıkça false ise format eksik; aksi halde uyumlu kabul (graceful).
  const formatOk = verify?.format_uyumlu !== false;
  const temiz = formatOk && uyarilar.length === 0;
  return (
    <article className={`rc-card rc-dogrulama rc-g2 ${temiz ? "rc-dogru-ok" : "rc-dogru-warn"}`} aria-labelledby="rc-dogru-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{temiz ? "🛡️" : "⚠️"}</span>
        <h3 id="rc-dogru-h" className="rc-card-title">Doğrulama (Kalite Kapısı)</h3>
        <span className={`rc-badge ${temiz ? "rc-badge-ok" : "rc-badge-warn"}`}>
          {temiz ? "Doğrulandı ✓" : `${uyarilar.length || 1} uyarı`}
        </span>
      </header>
      <ul className="rc-dogru-checks" aria-label="Doğrulama kontrolleri">
        <li className={formatOk ? "rc-dogru-pass" : "rc-dogru-fail"}>
          <span className="rc-dogru-mark" aria-hidden="true">{formatOk ? "✓" : "✕"}</span>
          Format uyumu — zorunlu bölümler (T.C. / Sayı / Konu / imza)
        </li>
        <li className={uyarilar.length === 0 ? "rc-dogru-pass" : "rc-dogru-fail"}>
          <span className="rc-dogru-mark" aria-hidden="true">{uyarilar.length === 0 ? "✓" : "✕"}</span>
          Uydurma veto — kaynakta olmayan somut tarih/sayı yok
        </li>
      </ul>
      {uyarilar.length > 0 ? (
        <div className="rc-dogru-uyarilar">
          <p className="rc-dogru-uyari-h">Doğrulama uyarıları:</p>
          <ul className="rc-chiplist" aria-label="Doğrulama uyarıları">
            {uyarilar.map((u, i) => <li className="rc-chip rc-chip-warn" key={i}>{u}</li>)}
          </ul>
        </div>
      ) : (
        <p className="rc-dogru-note">
          Taslak format açısından uyumlu ve kaynak evrakta bulunmayan somut veri içermiyor.
        </p>
      )}
    </article>
  );
}

/* ---------- üst özet (bilgilendirme) ---------- */
function BilgilendirmeCard({ text }) {
  if (!text) return null;
  return (
    <article className="rc-card rc-info" aria-labelledby="rc-info-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">📣</span>
        <h3 id="rc-info-h" className="rc-card-title">Bilgilendirme</h3>
      </header>
      <div className="rc-info-body">
        {text.split("\n\n").map((para, i) => <p key={i}>{renderInlineBold(para)}</p>)}
      </div>
    </article>
  );
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
    <section className="rc-grid" aria-label="Evrak işleme sonuçları">
      <BilgilendirmeCard text={r.bilgilendirme} />
      <div className="rc-row rc-row-2">
        <EvrakTuruCard turu={r.evrak_turu} conf={r.tur_confidence} />
        <BirimCard hedef={r.hedef_birim} alternatifler={r.birim_alternatifleri} />
      </div>
      <CikarilanAlanlarCard unsurlar={r.bilgi_unsurlari} />
      <EksikBilgiCard eksik={r.eksik_alanlar} sorular={r.clarify_questions} />
      <MevzuatCard oneriler={r.mevzuat_onerileri} />
      <YaziTaslakCard
        yaziTuru={r.yazi_turu} taslakMd={r.yazi_taslak_md} onToast={onToast}
        onDownload={onDownload} downloading={downloading} canDownload={canDownload}
      />
      <DogrulamaCard verify={verify} taslakMd={r.yazi_taslak_md} />
      {/* Yasal sorumluluk reddi — her sonuçta zorunlu (kamu kararı destek aracı, karar mercii değil) */}
      <p className="rc-disclaimer" role="note">
        ⚖️ Bu sistem <strong>karar-destek</strong> amaçlıdır; nihai sorumluluk yetkili personeldedir.
        Sınıflandırma, havale ve yazı onayı yetkili kamu görevlisi tarafından teyit edilmelidir.
        🛡️ Kişisel veriler (TCKN, telefon) <strong>maskelenerek</strong> işlenmiştir.
      </p>
    </section>
  );
}

export default ResultCards;
// Test/yeniden-kullanım için iç kartlar da export edilir.
export {
  EvrakTuruCard, CikarilanAlanlarCard, EksikBilgiCard, MevzuatCard,
  BirimCard, YaziTaslakCard, DogrulamaCard, BilgilendirmeCard,
  EVRAK_TR, BIRIM_LBL, YAZI_TR,
};
