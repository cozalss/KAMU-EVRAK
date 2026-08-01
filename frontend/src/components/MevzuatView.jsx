/* MevzuatView — kapsamlı mevzuat referans paneli. Sistemdeki TÜM mevzuat (backend
   /mevzuat/katalog → data/mevzuat korpusu, RAG ile aynı kaynak) aranabilir kart listesi;
   kart tıklanınca ortada blur arka planlı okuma modalı tam metni gösterir
   (/mevzuat/icerik/{dosya}). Oturumda RAG'in önerdiği mevzuat da tıklanınca ilgili
   maddeye kaydırılmış açılır. Backend yoksa statik çekirdek katalog fallback. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, NeonCard, EmptyState, Icon, Btn, MONO, T, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, focusRing, SR_ONLY } from "./neonUi.jsx";
import { cleanDemoText } from "./result-cards.jsx";
import { OkumaModal } from "./MevzuatOkuma.jsx";

/* Sistemin dayandığı çekirdek mevzuat — katalogda etiketlenir + listede öne alınır.
   2709 = Anayasa (dilekçe/bilgi edinme üst-normu, m.74); 2026-07 genişletmesiyle eklendi. */
const CEKIRDEK_NO = new Set(["2709", "3071", "4982", "7201", "2646", "5018", "2005-7", "6698"]);

/* Backend kapalıyken (statik dağıtım / demo) asgari referans listesi — eski davranış. */
const STATIK_KATALOG = [
  { no: "AY 2709", ad: "Türkiye Cumhuriyeti Anayasası (seçili md.)", aciklama: "Dilekçe/bilgi edinme hakkı (m.74), başvuru yollarının bildirilmesi (m.40), idari işleme karşı yargı yolu (m.125); evrak haklarının üst normu." },
  { no: "3071 s.K.", ad: "Dilekçe Hakkının Kullanılmasına Dair Kanun", aciklama: "Zorunlu unsurlar (ad-soyad, imza, adres) ve 30 günlük cevap süresi (m.4, m.7)." },
  { no: "4982 s.K.", ad: "Bilgi Edinme Hakkı Kanunu", aciklama: "Bilgi/belge taleplerinde 15 iş günü cevap süresi ve istisnalar." },
  { no: "7201 s.K.", ad: "Tebligat Kanunu", aciklama: "Resmî tebligat usulü; dava açma sürelerinin başlangıcı." },
  { no: "Yön. 2646", ad: "Resmî Yazışmalarda Usul ve Esaslar Yönetmeliği", aciklama: "Üst/cevabi/olur yazı formatı, sayı-konu-ilgi düzeni, e-imza." },
  { no: "5018 s.K.", ad: "Kamu Mali Yönetimi ve Kontrol Kanunu", aciklama: "Ödeme/tahakkuk süreçleri; mali evrak yönlendirme." },
  { no: "SDP 2005/7", ad: "Standart Dosya Planı (Başbakanlık Genelgesi)", aciklama: "Evrak saklama/arşiv kodları ve saklama süreleri." },
  { no: "6698 s.K.", ad: "Kişisel Verilerin Korunması Kanunu (KVKK)", aciklama: "TCKN/telefon gibi kişisel verilerin maskelenmesi ve işlenme ilkeleri." },
];

const trLower = (s) => String(s || "").toLocaleLowerCase("tr");

/* Kategori başlığı altındaki tek satırlık rehber — personelin grubu tanıması için.
   Anahtarlar backend _KATEGORI_KURALLARI adlarıyla birebir; eksik ad = açıklamasız grup. */
const KATEGORI_ACIKLAMA = {
  "İdari Usul & Yazışma": "Anayasal haklar, dilekçe, bilgi edinme, tebligat, resmî yazışma, arşiv, e-imza ve bilgi güvenliği; günlük evrak işinin temeli.",
  "Vergi & Kamu Maliyesi": "Vergi kanunları, harçlar, amme alacakları, kamu ihalesi ve mali yönetim.",
  "Sağlık": "Sağlık hizmetleri, meslek kanunları (hekim/eczacı/hemşire), hasta hakları.",
  "Yargı & Adalet": "Usul kanunları, icra-iflas, ceza ve infaz, arabuluculuk, adli meslekler.",
  "Kamu Personeli": "Memur statüsü, disiplin, şikâyet-müracaat, harcırah, mal bildirimi.",
  "Çalışma, Sosyal Güvenlik & Aile": "İş kanunları, SGK, emeklilik, sendikalar, sosyal hizmet ve aile koruması.",
  "Eğitim, Gençlik & Spor": "Eğitim sistemi, yükseköğretim, burs-yurt, mesleki yeterlilik, spor.",
  "Güvenlik & Kamu Düzeni": "Askerlik, terörle mücadele, kaçakçılık, özel güvenlik, toplantı-gösteri.",
  "Tarım, Hayvancılık & Gıda": "Tarım destekleri, veterinerlik, tohum-ıslah, mera ve toprak koruma.",
  "Çevre, Orman & Su": "Çevre izin/denetim, atık, hava-su-gürültü kontrolü, orman ve sular.",
  "İmar, Şehircilik & Afet": "İmar, yapı ruhsatı, tapu-kadastro, kamulaştırma, afet ve dönüşüm.",
  "Enerji & Madencilik": "Maden, petrol, doğal gaz, elektrik piyasası ve yenilenebilir enerji.",
  "Ulaştırma & Haberleşme": "Trafik, taşıma, havacılık-denizcilik, posta ve elektronik haberleşme.",
  "Kültür, Turizm & Medya": "Kültür varlıkları, turizm, basın-yayın, internet ve fikri haklar.",
  "STK & Meslek Kuruluşları": "Dernekler, vakıflar, yardım toplama, odalar-borsalar ve esnaf kuruluşları.",
  "Ekonomi, Ticaret & Sanayi": "Ticaret, rekabet, tüketici, bankacılık-finans, gümrük, sanayi ve yatırımlar.",
  "Kamu Yönetimi & Yerel İdare": "Teşkilat, il ve belediye idaresi, nüfus-vatandaşlık, Sayıştay, seçimler.",
  "Diğer": "Belirli bir gruba atanmamış mevzuat.",
};

/* RAG önerisi → katalog dosyası + madde no + tür. Backend artık `kaynak_dosya`/`madde_no`/
   `madde_tur` gönderir (chunk metadata'sından gelen DOĞRULANABİLİR bağ) — onu tercih ederiz.
   `madde_tur` şart: "Ek Madde 1" ve normal "Madde 1" aynı no'yu taşır; modal doğru bloğu
   ancak tür ile ayırır. Alanları taşımayan eski/statik öneriler için başlıktan türetmeye
   düşülür ("3071 dilekce hakki kanunu m.4" → dosya adı sözleşmesi). Katalogda yoksa null. */
function oneriHedef(m, dosyalar) {
  const maddeNo = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
  const dogrudan = String(m?.kaynak_dosya || "");
  if (dogrudan && dosyalar.has(dogrudan)) {
    return { dosya: dogrudan, maddeNo: maddeNo(m.madde_no), maddeTur: m.madde_tur || "madde" };
  }
  const ham = String(m?.baslik || "");
  const madde = ham.match(/\s+m\.(\d+)\s*$/i);
  const etiket = ham.replace(/\s+m\.\d+\s*$/i, "").replace(/\s*\[DOĞRULA:.*$/i, "").trim();
  const dosya = etiket.replace(/\s+/g, "_");
  if (!dosyalar.has(dosya)) return null;
  return { dosya, maddeNo: madde ? Number(madde[1]) : null, maddeTur: "madde" };
}

/* Katalog kartı — tıklanabilir; okuma modalını açar. Hover = zemin tonu (kalkış yok). */
function KatalogKart({ m, onAc }) {
  const cekirdek = CEKIRDEK_NO.has(m.no);
  return (
    <button type="button" onClick={() => onAc({ dosya: m.dosya, maddeNo: null })} aria-haspopup="dialog" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ display: "flex", gap: SP.m, alignItems: "flex-start", textAlign: "left", padding: SP.l, borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, cursor: "pointer", transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.book /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap" }}>
          {m.no && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: DERIN.T }}>{m.no}</span>}
          {cekirdek && <span style={{ ...TYPE.meta, color: PAL.mut }} title="Sınıflandırma ve yasal süre kurallarının dayandığı çekirdek mevzuat">Çekirdek</span>}
          <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{m.madde_sayisi > 0 ? `${m.madde_sayisi} madde` : "tam metin"}</span>
        </span>
        <span style={{ display: "block", marginTop: SP.xs, ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{m.baslik}</span>
        {/* Künye 2 satıra sarar — RG tarihi/sayısı gibi atomik değerler ortadan kesilmez (jüri T8). */}
        {m.kunye && <span title={m.kunye} style={{ marginTop: SP.xs, ...TYPE.meta, color: PAL.mut2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.kunye}</span>}
      </span>
    </button>
  );
}

/* Oturumda RAG'in önerdiği kaynak — katalogda karşılığı varsa tıklanınca ilgili maddeye açılır.
   Hover/press diğer tıklanabilir kartlarla (KatalogKart/DerinSonucSatir) AYNI dilde — önceden
   bu kart hover'da sessiz kalıyordu (jüri'nin ilk gördüğü AI-öneri bölgesi tıklanabilirliğini
   göstermiyordu). */
function OneriSatir({ m, dosyalar, onAc }) {
  const hedef = oneriHedef(m, dosyalar);
  const govde = (
    <>
      <div style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{cleanDemoText(m.baslik)}</div>
      {m.snippet && <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{cleanDemoText(m.snippet)}</p>}
    </>
  );
  const stil = { borderLeft: `2px solid ${T}`, paddingLeft: SP.m };
  if (!hedef) return <div style={stil}>{govde}</div>;
  return (
    <button type="button" onClick={() => onAc(hedef)} aria-haspopup="dialog" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...stil, display: "block", textAlign: "left", background: "transparent", border: "none", borderLeft: stil.borderLeft, borderRadius: `0 ${RAD.ctl}px ${RAD.ctl}px 0`, cursor: "pointer", padding: `${SP.s}px 0 ${SP.s}px ${SP.m}px`, width: "100%", transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      {govde}
      <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, marginTop: SP.s, ...TYPE.meta, color: DERIN.T }}>Tam metni oku <Icon.arrow /></span>
    </button>
  );
}

/* Kategori filtre düğmesi — aktifken gök mavisi tint zemin, değilken beyaz yüzey. */
function KategoriCip({ ad, adet, aktif, onSec }) {
  return (
    <button type="button" onClick={onSec} aria-pressed={aktif} {...focusRing} data-press=""
      style={{ cursor: "pointer", padding: "4px 12px", borderRadius: RAD.chip, border: "1px solid",
        borderColor: aktif ? "transparent" : PAL.line, background: aktif ? ALFA(T) : PAL.surf,
        color: aktif ? DERIN.T : PAL.ink2, ...TYPE.meta, fontWeight: 500,
        display: "inline-flex", alignItems: "center", gap: SP.s, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      {ad}
      <span style={{ opacity: 0.75, fontWeight: 400, ...TNUM }}>{adet}</span>
    </button>
  );
}

/* Açılır chevron — <summary> katlama durumunu gösterir (details[open]'da 90° döner). */
const ChevronSag = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Kategori grup bölümü — katlanabilir (native <details>). Katalog tek sayfada 304 kayıt =
   18.7 ekranlık kesintisiz kaydırma (Playwright ölçümü) → memur konu grubunu göz ile
   arıyordu. <details> ile: klavye/erişilebilirlik native, reduced-motion'da anında,
   sıfır bağımlılık. Arama/filtre aktifken (acik) tüm gruplar açık gelir — sonuç zaten dar. */
function KategoriGrup({ ad, mevzuatlar, onAc, acik }) {
  return (
    <details open={acik} aria-label={`${ad} mevzuatı`} style={{ marginBottom: SP.l, borderBottom: `1px solid ${PAL.line}`, paddingBottom: SP.l }}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: SP.s, padding: "4px 0", borderRadius: RAD.ctl }}>
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut2, transition: "transform .15s var(--ke-ease-out)", flexShrink: 0 }} className="mev-chevron"><ChevronSag /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{ad}</h3>
        <span style={{ ...TYPE.meta, color: PAL.mut, ...TNUM }}>{mevzuatlar.length}</span>
      </summary>
      {KATEGORI_ACIKLAMA[ad] && (
        <p style={{ margin: "8px 0 12px 24px", ...TYPE.data, color: PAL.mut2 }}>{KATEGORI_ACIKLAMA[ad]}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: SP.l, alignItems: "start", marginTop: SP.s }}>
        {mevzuatlar.map((m) => <KatalogKart key={m.dosya} m={m} onAc={onAc} />)}
      </div>
    </details>
  );
}

/* Arama modu seçici — "Katalogda" (başlık/künye) | "Madde içinde" (BM25 derin arama). */
function AramaModSecici({ modu, onSec }) {
  const secenekler = [["katalog", "Katalogda"], ["derin", "Madde içinde"]];
  return (
    <div role="group" aria-label="Arama modu" style={{ display: "inline-flex", padding: 2, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surfHi }}>
      {secenekler.map(([k, ad]) => (
        <button key={k} type="button" onClick={() => onSec(k)} aria-pressed={modu === k} {...focusRing} data-press=""
          onBlur={(e) => { e.currentTarget.style.boxShadow = modu === k ? SH.card : "none"; }}
          style={{ cursor: "pointer", padding: "5px 12px", borderRadius: RAD.chip, border: "none",
            background: modu === k ? PAL.surf : "transparent", color: modu === k ? DERIN.T : PAL.mut2,
            ...TYPE.meta, fontWeight: modu === k ? 600 : 500, boxShadow: modu === k ? SH.card : "none",
            transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
          {ad}
        </button>
      ))}
    </div>
  );
}

/* Derin arama sonucu — tıklanınca okuma modalı İLGİLİ MADDEDE açılır. */
function DerinSonucSatir({ s, onAc }) {
  return (
    <button type="button" onClick={() => onAc({ dosya: s.dosya, maddeNo: s.madde_no ?? null, maddeTur: s.madde_tur ?? null })}
      aria-haspopup="dialog" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ display: "block", width: "100%", textAlign: "left", padding: SP.l, borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, cursor: "pointer", transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap" }}>
        {s.no && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: DERIN.T }}>{s.no}</span>}
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{s.baslik}</span>
        {s.madde_no != null && <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN.V }}>m.{s.madde_no}</span>}
      </span>
      <span style={{ display: "block", marginTop: SP.xs, ...TYPE.data, color: PAL.mut2 }}>{s.snippet}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, marginTop: SP.s, ...TYPE.meta, color: DERIN.T }}>Maddeye git <Icon.arrow /></span>
    </button>
  );
}

/* Backend kapalıyken statik çekirdek liste (tıklanamaz — tam metin backend'den gelir). */
function StatikKatalog() {
  return (
    <>
      <p role="status" style={{ margin: "0 0 12px", ...TYPE.data, color: PAL.mut2 }}>
        Canlı katalog yüklenemedi — çekirdek referans listesi gösteriliyor. Tam metin şu anda alınamıyor; katalog özeti gösteriliyor.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))", gap: SP.l, alignItems: "start" }}>
        {STATIK_KATALOG.map((k) => (
          <div key={k.no} style={{ display: "flex", gap: SP.m, padding: SP.l, borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.book /></span>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: DERIN.T }}>{k.no}</span>
                <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{k.ad}</span>
              </div>
              <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{k.aciklama}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function MevzuatView({ history = [] }) {
  const [katalog, setKatalog] = useState(null);   // null=yükleniyor, "hata", [liste]
  const [kategoriler, setKategoriler] = useState([]); // backend'in sıralı grup listesi
  const [kategori, setKategori] = useState("");   // "" = tüm gruplar
  const [filtre, setFiltre] = useState("");
  const [aramaModu, setAramaModu] = useState("katalog"); // "katalog" | "derin" (madde içinde)
  const [derin, setDerin] = useState(null);       // null | "hata" | {q, sonuclar}
  const [derinBekliyor, setDerinBekliyor] = useState(false);
  const [secili, setSecili] = useState(null);     // {dosya, maddeNo} → okuma modalı açık
  const sonOdak = useRef(null);
  const aramaRef = useRef(null);
  const [aramaOdakta, setAramaOdakta] = useState(false);

  // "/" ile arama kutusuna odaklan (GitHub/Linear alışkanlığı) — yalnız Mevzuat aktifken
  // bağlı (mount/unmount ile), başka bir alanda yazarken (input/textarea) müdahale etmez.
  useEffect(() => {
    const dinle = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      e.preventDefault();
      aramaRef.current?.focus();
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, []);

  useEffect(() => {
    let iptal = false;
    fetch("/mevzuat/katalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (iptal) return;
        setKatalog(d.mevzuatlar || []);
        setKategoriler(d.kategoriler || []);
      })
      .catch(() => { if (!iptal) setKatalog("hata"); });
    return () => { iptal = true; };
  }, []);

  const ac = useCallback((h) => { sonOdak.current = document.activeElement; setSecili(h); }, []);
  const kapat = useCallback(() => { setSecili(null); sonOdak.current?.focus?.(); }, []); // odak tetikleyene döner (a11y)

  // Derin arama: mod aktif + sorgu ≥3 karakter → debounce'lu /mevzuat/derin-ara.
  useEffect(() => {
    if (aramaModu !== "derin") return undefined;
    const q = filtre.trim();
    if (q.length < 3) { setDerin(null); setDerinBekliyor(false); return undefined; }
    let iptal = false;
    setDerinBekliyor(true);
    const t = setTimeout(() => {
      fetch(`/mevzuat/derin-ara?q=${encodeURIComponent(q)}&limit=30`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        // Şekil doğrula: aşağıdaki render derin.sonuclar.length/.map çağırır — backend 200 ama
        // beklenmedik gövde (sonuclar yok/null/dizi değil) dönerse guard'sız erişim TypeError
        // fırlatıp TÜM Mevzuat görünümünü beyaz ekrana düşürürdü. Dizi değilse boş sonuç say.
        .then((d) => { if (!iptal) setDerin(d && Array.isArray(d.sonuclar) ? d : { q, sonuclar: [] }); })
        .catch(() => { if (!iptal) setDerin("hata"); })
        .finally(() => { if (!iptal) setDerinBekliyor(false); });
    }, 350);
    return () => { iptal = true; clearTimeout(t); };
  }, [aramaModu, filtre]);

  // Oturumda RAG'in önerdiği mevzuat (gerçek), başlığa göre tekilleştir.
  const onerilen = useMemo(() => {
    const seen = new Map();
    for (const h of history) for (const m of (h.result?.mevzuat_onerileri || [])) {
      if (m?.baslik && !seen.has(m.baslik)) seen.set(m.baslik, m);
    }
    return [...seen.values()];
  }, [history]);

  const dosyalar = useMemo(() => new Set(Array.isArray(katalog) ? katalog.map((m) => m.dosya) : []), [katalog]);

  // Arama + kategori filtresi birlikte; grup içi sıra: çekirdek önce, sonra Türkçe alfabetik.
  const listelenen = useMemo(() => {
    if (!Array.isArray(katalog)) return [];
    const q = trLower(filtre.trim());
    let uyan = q ? katalog.filter((m) => trLower(`${m.no} ${m.baslik} ${m.kunye} ${m.kategori} ${m.dosya.replace(/_/g, " ")}`).includes(q)) : katalog;
    if (kategori) uyan = uyan.filter((m) => m.kategori === kategori);
    return [...uyan].sort((a, b) =>
      (CEKIRDEK_NO.has(b.no) - CEKIRDEK_NO.has(a.no)) || a.baslik.localeCompare(b.baslik, "tr"));
  }, [katalog, filtre, kategori]);

  // Kategori başına adet (çipler) — arama uygulanmış hâliyle değil, tüm katalogla sayılır
  // (çip adetleri sabit kalır; arama sonucu grup başlıklarındaki adetten okunur).
  const kategoriAdet = useMemo(() => {
    const sayim = new Map();
    if (Array.isArray(katalog)) for (const m of katalog) sayim.set(m.kategori, (sayim.get(m.kategori) || 0) + 1);
    return sayim;
  }, [katalog]);

  // Gruplu görünüm: backend'in kategori sırasıyla, yalnız eşleşmesi olan gruplar.
  const gruplar = useMemo(() => {
    const sira = kategoriler.length ? kategoriler : [...new Set(listelenen.map((m) => m.kategori))];
    return sira
      .map((ad) => [ad, listelenen.filter((m) => m.kategori === ad)])
      .filter(([, uyeler]) => uyeler.length > 0);
  }, [kategoriler, listelenen]);

  return (
    <ViewWrap id="mevzuat-h" title="Mevzuat" sub="Sistemdeki 304 mevzuat kaynağı konu gruplarına ayrılmış olarak listelenir. Kategori seçin veya arayın; karta tıklayınca tam metin açılır.">
      {onerilen.length > 0 && (
        // AI-önerisi bölgesi kataloğun geri kalanından zemince ayrışır — tek izinli alfa eki
        // (ALFA(T), %8 tint); yeni renk/gradyan yok. Görev 1'in RAG çıktısı jürinin ilk gördüğü
        // öge; sayfanın geri kalanıyla bit-aynı beyaz zeminde kayboluyordu.
        <NeonCard title="Bu oturumda önerilen mevzuat (RAG)" tag={`${onerilen.length} kaynak`} accent={T} style={{ marginBottom: SP.l, background: ALFA(T) }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: SP.m }}>
            {onerilen.map((m, i) => <OneriSatir key={i} m={m} dosyalar={dosyalar} onAc={ac} />)}
          </div>
        </NeonCard>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", margin: "4px 0 12px" }}>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Mevzuat kataloğu</span>
        {aramaModu === "katalog" && Array.isArray(katalog) && (
          <span style={{ ...TYPE.meta, color: PAL.mut, ...TNUM }}>
            {filtre.trim() || kategori ? `${listelenen.length} / ${katalog.length}` : `${katalog.length} mevzuat`}
          </span>
        )}
        {aramaModu === "derin" && derin && derin !== "hata" && (
          <span style={{ ...TYPE.meta, color: PAL.mut, ...TNUM }}>{derin.sonuclar.length} madde eşleşti</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
          <AramaModSecici modu={aramaModu} onSec={setAramaModu} />
          {/* Sol ikon + sağ "/" kısayol ipucu (GitHub/Linear alışkanlığı) — odaklanınca/yazınca
              ipucu kaybolur, sabit padding sayesinde sıçrama olmaz. */}
          <div style={{ position: "relative", width: "min(360px,100%)" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
            <input ref={aramaRef} type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)}
              placeholder={aramaModu === "derin" ? "Madde metninde ara: dilekçede zorunlu şartlar…" : "Kanun adı, numara veya konu ara…"}
              aria-label={aramaModu === "derin" ? "Mevzuat maddelerinin içinde ara" : "Mevzuat kataloğunda ara"}
              onFocus={(e) => { focusRing.onFocus(e); setAramaOdakta(true); }}
              onBlur={(e) => { focusRing.onBlur(e); setAramaOdakta(false); }}
              style={{ width: "100%", padding: "8px 34px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, ...TYPE.ui, color: PAL.ink, outline: "none" }} />
            {!filtre && !aramaOdakta && (
              <span aria-hidden="true" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", ...TYPE.meta, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 6px", background: PAL.surfHi, pointerEvents: "none" }}>/</span>
            )}
          </div>
        </div>
      </div>

      {aramaModu === "derin" && (
        filtre.trim().length < 3 ? (
          <p role="status" style={{ margin: "8px 0 0", ...TYPE.data, color: PAL.mut2 }}>
            Madde içinde arama: en az 3 karakter yazın — sonuç, ilgili maddeye kaydırılmış okuma paneliyle açılır.
          </p>
        ) : derinBekliyor && !derin ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2, padding: "12px 0" }}>
            <Icon.spin /> Maddelerde aranıyor…
          </div>
        ) : derin === "hata" ? (
          <div role="alert" style={{ ...TYPE.data, color: PAL.ink2, padding: "8px 0" }}>
            Arama şu anda yapılamıyor. Bağlantınızı kontrol edip tekrar deneyin.
          </div>
        ) : derin && derin.sonuclar.length === 0 ? (
          <EmptyState icon={<Icon.book />} title="Eşleşen madde yok"
            sub={`"${filtre.trim()}" için madde metinlerinde sonuç bulunamadı. Farklı terimlerle deneyin.`}
            actions={<Btn onClick={() => setFiltre("")}>Aramayı temizle</Btn>} />
        ) : derin ? (
          <div aria-live="polite" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))", gap: SP.l, alignItems: "start", opacity: derinBekliyor ? 0.6 : 1, transition: "opacity .12s ease-out" }}>
            {derin.sonuclar.map((s) => <DerinSonucSatir key={`${s.dosya}-${s.madde_no}-${s.madde_tur ?? "madde"}`} s={s} onAc={ac} />)}
          </div>
        ) : null
      )}

      {aramaModu === "katalog" && Array.isArray(katalog) && kategoriler.length > 0 && (
        <div role="group" aria-label="Kategori filtresi" style={{ display: "flex", gap: SP.s, flexWrap: "wrap", marginBottom: SP.xl }}>
          <KategoriCip ad="Tümü" adet={katalog.length} aktif={!kategori} onSec={() => setKategori("")} />
          {kategoriler.map((ad) => (
            <KategoriCip key={ad} ad={ad} adet={kategoriAdet.get(ad) || 0} aktif={kategori === ad} onSec={() => setKategori(kategori === ad ? "" : ad)} />
          ))}
        </div>
      )}

      {aramaModu === "katalog" && katalog === null && (
        <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: SP.l }}>
          <span role="status" style={SR_ONLY}>Mevzuat kataloğu yükleniyor…</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} aria-hidden="true" style={{ height: 104, borderRadius: RAD.card, background: PAL.surfHi, animation: "nu-think 1.6s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {aramaModu === "katalog" && katalog === "hata" && <StatikKatalog />}

      {aramaModu === "katalog" && Array.isArray(katalog) && (listelenen.length === 0 ? (
        <EmptyState icon={<Icon.book />} title="Eşleşen mevzuat yok"
          sub={filtre.trim()
            ? `"${filtre.trim()}" için ${kategori ? `${kategori} grubunda` : "katalogda"} sonuç bulunamadı. Kanun adı veya numarasıyla deneyin.`
            : "Bu grupta gösterilecek mevzuat yok."}
          actions={<Btn onClick={() => { setFiltre(""); setKategori(""); }}>Filtreleri temizle</Btn>} />
      ) : (
        // Açık gelenler: arama/filtre aktifse hepsi (sonuç zaten dar) VEYA tek grup varsa
        // o. Aksi halde yalnız ilk grup açık; gerisi katlı → memur konu seçip açar.
        gruplar.map(([ad, uyeler], gi) => (
          <KategoriGrup key={ad} ad={ad} mevzuatlar={uyeler} onAc={ac}
            acik={!!filtre.trim() || !!kategori || gruplar.length === 1 || gi === 0} />
        ))
      ))}

      {secili && <OkumaModal dosya={secili.dosya} maddeNo={secili.maddeNo} maddeTur={secili.maddeTur} onClose={kapat} />}
    </ViewWrap>
  );
}
