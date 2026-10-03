/* MevzuatOkuma — mevzuatın tam metnini gösteren okuma modalı ("Resmî Gazete okuma salonu")
   + metin ayrıştırma. Ayrı dosya: hem MevzuatView (katalog/oturum önerileri) hem DashboardApp
   (global overlay — ayrıntılı sonuç ekranı + sohbet çipi) AYNI modalı kullansın; kod tek yerde.
   Kaynak: /mevzuat/icerik/{dosya} (backend beyaz-listeli dosya adı).

   Tipografi (2026-10 "Antet & Damga"): metin sütunu ~68ch ölçüde; madde numarası kenarda
   asılı (hanging marginalia), kenar başlığı madde başı; solda yapışkan madde dizini
   (scroll-spy), üstte okuma ilerleme çizgisi. Telefonda tam ekran kâğıt + yatay madde şeridi. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Btn, MONO, DISPLAY, T, V, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, odakDongusu } from "./neonUi.jsx";

/* Ham mevzuat metni → bloklar: künye-sonrası giriş notu + "Madde N — ..." blokları.
   Backend chunker (_MADDE_HEADER_RE) ile aynı önek dili — "Ek Madde 1" / "Geçici Madde 2"
   ayrı blok olmalı. Tanınmazsa ek/geçici metni bir önceki maddenin gövdesine yapışır ve
   "Ek Madde 1" ile normal "Madde 1" aynı no'yu paylaştığından vurgu yanlış bloğa gider. */
const MADDE_BASLIK_RE = /^(?:(Ek)\s+|(Geçici)\s+)?Madde\s+(\d+)/i;
const maddeTurBul = (m) => (m[1] ? "ek" : m[2] ? "gecici" : "madde");

function maddeAyir(metin) {
  const satirlar = String(metin || "").split("\n").slice(2); // 1-2. satır başlık+künye (modal başlığında)
  const bloklar = [];
  let aktif = { no: null, tur: null, baslik: "", parcalar: [] };
  const kapat = () => {
    const govde = aktif.parcalar.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (aktif.baslik || govde) bloklar.push({ no: aktif.no, tur: aktif.tur, baslik: aktif.baslik, govde });
  };
  for (const satir of satirlar) {
    const m = satir.match(MADDE_BASLIK_RE);
    if (m) { kapat(); aktif = { no: Number(m[3]), tur: maddeTurBul(m), baslik: satir.trim(), parcalar: [] }; }
    else aktif.parcalar.push(satir);
  }
  kapat();
  return bloklar;
}

/* Kaynak PDF'ten gelen sabit ~80 karakterlik satır kırılmalarını paragraflara akıt (YALNIZ
   görüntü — metin değişmez). Yeni paragraf: boş satır, "(Ek fıkra: …)"/"(Değişik: …)" ile
   başlayan satır, bent ("a) ", "1. ") veya madde işareti. Aksi hâlde satır öncekine eklenir. */
const PARAGRAF_BASI_RE = /^(\(|[a-zçğıöşü]\)\s|\d+[.)]\s|[-–•]\s)/i;
function paragraflar(govde) {
  const cikti = [];
  for (const ham of String(govde || "").split("\n")) {
    const satir = ham.trim();
    if (!satir) { cikti.push(null); continue; }
    const son = cikti[cikti.length - 1];
    if (typeof son === "string" && !PARAGRAF_BASI_RE.test(satir)) cikti[cikti.length - 1] = `${son} ${satir}`;
    else cikti.push(satir);
  }
  return cikti.filter(Boolean);
}

/* Paragraf başındaki değişiklik notu — "(Değişik: 2/1/2003-4778/26 md.)" — metnin kendisi
   değil, kaynak işaretidir: mono + sessiz renkle ayrışır. */
const DEGISIKLIK_RE = /^(\((?:Ek|Değişik|Mülga|İptal|Yeniden düzenleme|Ek fıkra|Ek bent)[^)]*\))\s*/i;
function Paragraf({ metin }) {
  const m = metin.match(DEGISIKLIK_RE);
  const bent = /^[a-zçğıöşü]\)\s/i.test(metin);
  return (
    <p style={{ margin: `0 0 ${SP.m}px`, ...TYPE.read, lineHeight: "28px", color: PAL.ink2, textWrap: "pretty", hyphens: "auto", ...(bent ? { paddingLeft: "1.6em", textIndent: "-1.6em" } : null) }}>
      {m && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut, letterSpacing: ".02em", marginRight: 6 }}>{m[1]}</span>}
      {m ? metin.slice(m[0].length) : metin}
    </p>
  );
}

/* ——— Künye ayrıştırma (YALNIZ görüntü; katalog kartı + okuma başlığı AYNI kaynağı kullanır) ———
   Künyeler elle derlendi, biçim karışık: "RG 07.04.1969/13168" · "Resmî Gazete: 24/6/1973,
   Sayı 14574" · "Resmî Gazete 25766 — 24.03.2005" · "14/6/2014 tarih ve 29030 sayılı RG" ·
   "RG: 4 Mart 2009, Sayı 27159" · "(e-Yazışma / … Boyutu)" (künye değil alt başlık).
   304 kaydın 300'ünde RG tarihi çözülür (2026-10 ölçümü); kalanlar ham metin yerine
   kabul tarihi / Düstur / alt başlık / hiçbir şey gösterir — ham dağınıklık asla. */
const AYLAR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
const AY_RE = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/gi;
const TARIH_RE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;
const tarihYaz = (m) => `${String(m[1]).padStart(2, "0")}.${String(m[2]).padStart(2, "0")}.${m[3]}`;

function rgSayisi(k, rg, tarih) {
  if (tarih) {
    const son = k.slice(tarih.index + tarih[0].length);
    const s = son.match(/^\s*(?:\/\s*(\d{3,6})|-\s*(\d{4,6})|(?:tarih(?:li)?\s*)?(?:[/,]|ve)?\s*(?:Sayı\s*:?\s*)?(\d{4,6})\b(?![./]\d))/i);
    if (s) return s[1] || s[2] || s[3];
  }
  const sonra = k.slice(rg.index + rg[0].length, rg.index + rg[0].length + 60);
  const s2 = sonra.match(/^\s*:?\s*(\d{4,6})\b(?![./]\d)/) || sonra.match(/Sayı\s*:?\s*(\d{4,6})/i)
    || k.slice(Math.max(0, rg.index - 40), rg.index).match(/(\d{4,6})\s*(?:mükerrer\s*)?sayılı\s*$/i);
  return s2 ? s2[1] : null;
}

export function kunyeCoz(kunye = "") {
  const k = String(kunye || "").replace(/\s+/g, " ").trim()
    .replace(AY_RE, (_, g, a, y) => `${g}.${AYLAR.indexOf(a.toLocaleLowerCase("tr")) + 1}.${y}`);
  const mulga = /MÜLGA|yürürlükten kaldırılmıştır/i.test(k);
  const r = { kabul: null, rgTarih: null, rgSayi: null, kararTarih: null, duz: false, altBaslik: null,
    mulga, yururlukte: !mulga && /Y[ÜU]R[ÜU]RL[ÜU]KTE/i.test(k) };
  if (!k) return r;
  const tarihler = [...k.matchAll(TARIH_RE)];
  const kabul = k.match(/Kabul(?:\s*Tarihi)?\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  if (kabul) r.kabul = tarihYaz(kabul);
  const rg = k.match(/\bRG\b|Resm[iî]\s*Gazete/i);
  if (rg) {
    const yakin = tarihler
      .filter((t) => !(kabul && t.index >= kabul.index && t.index < kabul.index + kabul[0].length))
      .map((t) => ({ t, d: Math.min(Math.abs(t.index - rg.index), Math.abs(t.index - rg.index - rg[0].length)) }))
      .sort((a, b) => a.d - b.d)[0];
    const tarih = yakin && yakin.d < 48 ? yakin.t : null;
    if (tarih) r.rgTarih = tarihYaz(tarih);
    r.rgSayi = rgSayisi(k, rg, tarih);
  }
  if (!r.rgTarih) {
    const karar = k.match(/Karar(?:ının)?\s*Tarihi\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
    if (karar) r.kararTarih = tarihYaz(karar);
    r.duz = /Düstur/i.test(k);
  }
  if (!tarihler.length && /^\(.*\)$/.test(k)) r.altBaslik = k.slice(1, -1).trim();
  return r;
}

/* Künye-öncesi kaynak notu → kaynak bağlantısı + metnin NİTELİĞİ. Korpustaki notlar metnin
   lafzî mi yoksa madde özeti mi olduğunu açıkça söyler; okur bunu ilk satırda görmeli
   (madde özeti hukuki atıf için yeterli değildir). Tanınmazsa nitelik null → çip basılmaz. */
export function kaynakNotuCoz(govde = "") {
  const g = String(govde || "");
  const u = g.match(/Kaynak\s*:\s*(https:\/\/[^\s)]+)/i);
  let host = null;
  try { host = u ? new URL(u[1]).hostname.replace(/^www\./, "") : null; } catch { host = null; }
  const kucuk = g.toLocaleLowerCase("tr");
  const nitelik = /özetlerinden|lafz[iî] tam metin değil/.test(kucuk) ? "ozet"
    : /yakın-lafz/.test(kucuk) ? "yakin" : /lafz[iî]\s*metn/.test(kucuk) ? "lafzi" : null;
  return { url: host ? u[1] : null, host, nitelik };
}
const NITELIK = {
  lafzi: { ad: "Lafzî metin", aciklama: "Resmî metinden birebir alınmıştır.", renk: "yesil" },
  yakin: { ad: "Yakın-lafzî alıntı", aciklama: "Resmî metne yakın alıntı; atıf öncesi asıl metinle karşılaştırın.", renk: "sari" },
  ozet: { ad: "Madde özeti", aciklama: "Lafzî metin değildir; hukuki atıf için resmî kaynağı açın.", renk: "sari" },
};

/* Okuma ölçüsü: ~68 KARAKTER/satır. "68ch" CSS'te "0" glifinin genişliğidir; Instrument
   Sans'ta ortalama harf ondan dar olduğundan 68ch ≈ 92 karakter çıkıyordu (ölçüldü).
   33em ≈ 16px'te 528px ≈ 68–72 karakter. */
const OLCU = "33em";
const kenarBasligi = (b) => b.baslik.replace(MADDE_BASLIK_RE, "").replace(/^\s*[—–:-]\s*/, "").trim();
const turKisa = (tur) => (tur === "ek" ? "Ek" : tur === "gecici" ? "Geçici" : "Madde");
const blokKimlik = (b) => `${b.tur}-${b.no}`;

/* Tek madde — numara sol kenarda asılı (Archivo, kenar notu), kenar başlığı + akıtılmış gövde
   ~68ch ölçüde. Hedef madde mühür moru tint + "Önerilen madde" etiketi. */
function MaddeBlok({ blok, vurgulu, anchorRef, kayitRef }) {
  if (blok.no === null) {
    return (
      <aside className="mo-satir" style={{ marginBottom: SP.xxl }}>
        <div className="mo-kenar" aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, paddingTop: 3 }}>KAYNAK<br />NOTU</div>
        <div style={{ borderLeft: `1px solid ${PAL.line}`, paddingLeft: SP.l, maxWidth: OLCU }}>
          {paragraflar(blok.govde).map((p, i) => <p key={i} style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2, overflowWrap: "anywhere", textWrap: "pretty" }}>{p}</p>)}
        </div>
      </aside>
    );
  }
  const kenar = kenarBasligi(blok);
  return (
    <section ref={(el) => { kayitRef(el); if (vurgulu && anchorRef) anchorRef.current = el; }} data-madde={blokKimlik(blok)}
      aria-label={`${turKisa(blok.tur)} ${blok.no}${kenar ? ` — ${kenar}` : ""}`} className="mo-satir" data-vurgu={vurgulu ? "" : undefined}
      style={{ scrollMarginTop: SP.xl, marginBottom: SP.xl + 4, position: "relative",
        ...(vurgulu ? { background: ALFA(V), borderRadius: RAD.card, padding: `${SP.l}px ${SP.l}px ${SP.xs}px 0`, boxShadow: `inset 3px 0 0 ${V}` } : null) }}>
      <div className="mo-kenar" style={{ textAlign: "right", paddingTop: 2 }}>
        <div style={{ ...TYPE.antet, fontSize: 10, color: vurgulu ? DERIN.V : PAL.mut3 }}>{turKisa(blok.tur).toLocaleUpperCase("tr")}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: "32px", fontStretch: "112%", letterSpacing: "-.03em", color: vurgulu ? DERIN.V : PAL.ink, ...TNUM }}>{blok.no}</div>
      </div>
      <div style={{ minWidth: 0, maxWidth: OLCU }}>
        {vurgulu && <div style={{ ...TYPE.antet, color: DERIN.V, marginBottom: SP.xs }}>ÖNERİLEN MADDE</div>}
        {kenar && <h3 style={{ margin: `2px 0 ${SP.s + 2}px`, fontFamily: DISPLAY, fontSize: 19, lineHeight: "24px", fontWeight: 650, fontStretch: "104%", letterSpacing: "-.01em", color: vurgulu ? DERIN.V : PAL.ink, textWrap: "balance" }}>{kenar}</h3>}
        {paragraflar(blok.govde).map((p, i) => <Paragraf key={i} metin={p} />)}
      </div>
    </section>
  );
}

/* Yapışkan madde dizini — masaüstünde sol sütun, telefonda üstte yatay şerit. Aktif madde
   kaydırma konumundan (scroll-spy) gelir; tıklama ilgili maddeye kaydırır. */
function MaddeDizini({ maddeler, aktif, onGit, vurguKimlik }) {
  const listeRef = useRef(null);
  useEffect(() => { // aktif öğe dizinin görünür alanında kalsın (uzun kanunlar)
    const el = listeRef.current?.querySelector(`[data-dizin="${aktif}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktif]);
  return (
    <nav aria-label="Madde dizini" className="mo-dizin">
      <div className="mo-dizin-baslik" style={{ ...TYPE.antet, color: PAL.mut3, padding: `0 ${SP.m}px ${SP.s}px` }}>MADDELER · {maddeler.length}</div>
      <ol ref={listeRef} className="mo-dizin-liste" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {maddeler.map((b) => {
          const k = blokKimlik(b);
          const secili = aktif === k;
          return (
            <li key={k}>
              <button type="button" data-dizin={k} onClick={() => onGit(k)} aria-current={secili ? "location" : undefined} {...focusRing}
                className="mo-dizin-oge"
                style={{ display: "flex", alignItems: "baseline", gap: SP.s, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", border: "none",
                  background: secili ? ALFA(T) : "transparent", borderRadius: RAD.chip, padding: "5px 10px",
                  boxShadow: secili ? `inset 2px 0 0 ${T}` : "none", color: secili ? PAL.ink : PAL.mut2, transition: "background .12s ease-out, color .12s ease-out" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, minWidth: 30, color: k === vurguKimlik ? DERIN.V : secili ? DERIN.T : PAL.mut3, ...TNUM, flexShrink: 0 }}>
                  {b.tur === "ek" ? "E" : b.tur === "gecici" ? "G" : "m"}.{b.no}
                </span>
                <span className="mo-dizin-ad" style={{ ...TYPE.meta, fontWeight: secili ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kenarBasligi(b) || "—"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* Başlıktan tür etiketi — yalnız görüntü (Kanun / Yönetmelik / Kararname …). */
function turEtiketi(baslik = "", no = "") {
  const b = String(baslik).toLocaleLowerCase("tr");
  if (b.includes("anayasa")) return "Anayasa";
  if (b.includes("yönetmeli")) return "Yönetmelik";
  if (b.includes("tebliğ")) return "Tebliğ";
  if (b.includes("genelge") || String(no).includes("-")) return "Genelge";
  if (b.includes("kararname")) return "Kararname";
  if (b.includes("esas") && b.includes("usul")) return "Usul ve Esas";
  if (b.includes("kanun")) return "Kanun";
  return "Mevzuat";
}

/* Modalın yerel CSS'i — yalnız düzen kırılımları + scroll-spy dizininin hover'ı (token var()'ları
   ile; hex yok). Satır-içi stil medya sorgusu taşıyamadığı için tek <style>. */
const OKUMA_CSS = `
.mo-kok{padding:${SP.xl}px}
.mo-kagit{width:min(960px,100%);height:min(92vh,1000px);border-radius:${RAD.pop}px}
.mo-govde{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0;flex:1}
.mo-dizin{border-right:1px solid var(--ke-line);padding:${SP.xl}px ${SP.s}px;overflow-y:auto;overscroll-behavior:contain}
.mo-satir{display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:${SP.xl}px}
.mo-metin{padding:${SP.xxl}px clamp(16px,4vw,56px) ${SP.xxxl}px clamp(8px,2vw,24px)}
.mo-dizin-oge:hover{background:var(--ke-hov)!important;color:var(--ke-ink)!important}
@media (max-width:820px){
  .mo-kok{padding:0}
  .mo-kagit{width:100%;height:100%;border-radius:0;border:none!important}
  .mo-govde{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .mo-dizin{border-right:none;border-bottom:1px solid var(--ke-line);padding:${SP.s}px 0;overflow:visible}
  .mo-dizin-baslik{display:none}
  .mo-dizin-liste{display:flex;gap:${SP.xs}px;overflow-x:auto;padding:0 ${SP.l}px!important;scroll-snap-type:x proximity;scrollbar-width:none}
  .mo-dizin-liste::-webkit-scrollbar{display:none}
  .mo-dizin-liste li{scroll-snap-align:start;flex-shrink:0}
  .mo-dizin-ad{display:none}
  .mo-dizin-oge{min-height:36px;align-items:center!important}
  .mo-satir{grid-template-columns:minmax(0,1fr);row-gap:${SP.xs}px}
  .mo-satir[data-vurgu]{padding-left:${SP.l}px!important}
  .mo-kenar{text-align:left!important;display:flex;align-items:baseline;gap:${SP.s}px}
  .mo-metin{padding:${SP.xl}px ${SP.l}px ${SP.xxxl}px}
  .mo-kunye{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .mo-baslik-no{font-size:34px!important;line-height:36px!important}
}
`;

const ICERIK_CACHE = new Map(); // dosya → içerik yanıtı (modal her açılışta yeniden inmesin)
const azaltilmisHareket = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* Kaydırma kabı → ilerleme çizgisi (ref ile, render'sız) + scroll-spy (aktif madde). */
function useOkumaIzleyici(kapRef, cizgiRef, maddeEl, bloklar) {
  const [aktif, setAktif] = useState(null);
  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return undefined;
    let kare = 0;
    const olc = () => {
      kare = 0;
      const max = kap.scrollHeight - kap.clientHeight;
      if (cizgiRef.current) cizgiRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, kap.scrollTop / max) : 0})`;
      const esik = kap.getBoundingClientRect().top + 96;
      let bulunan = null;
      for (const el of maddeEl.current.values()) {
        if (el && el.getBoundingClientRect().top <= esik) bulunan = el.dataset.madde;
      }
      if (!bulunan) bulunan = maddeEl.current.values().next().value?.dataset.madde ?? null;
      setAktif((o) => (o === bulunan ? o : bulunan));
    };
    const dinle = () => { if (!kare) kare = requestAnimationFrame(olc); };
    olc();
    kap.addEventListener("scroll", dinle, { passive: true });
    return () => { kap.removeEventListener("scroll", dinle); cancelAnimationFrame(kare); };
  }, [kapRef, cizgiRef, maddeEl, bloklar]);
  return aktif;
}

/* Okuma modalı — ortada geniş kâğıt (telefonda tam ekran), arka plan karartılır.
   Esc / dış tıklama / kapat düğmesi kapatır; açılışta odak kapat butonuna, gövde kaydırması kilitlenir.
   view'dan BAĞIMSIZ: nerede render edilirse edilsin (Mevzuat sayfası VEYA ayrıntılı sonuç
   ekranı üstünde global overlay) aynı davranır. */
export function OkumaModal({ dosya, maddeNo, maddeTur = "madde", onClose }) {
  const [icerik, setIcerik] = useState(ICERIK_CACHE.get(dosya) || null); // null=yükleniyor, "hata", {...}
  const [deneme, setDeneme] = useState(0);
  const closeRef = useRef(null);
  const maddeRef = useRef(null);
  const kapRef = useRef(null);
  const cizgiRef = useRef(null);
  const maddeEl = useRef(new Map());

  useEffect(() => {
    if (ICERIK_CACHE.has(dosya)) { setIcerik(ICERIK_CACHE.get(dosya)); return undefined; }
    let iptal = false;
    setIcerik(null);
    fetch(`/mevzuat/icerik/${encodeURIComponent(dosya)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { ICERIK_CACHE.set(dosya, d); if (!iptal) setIcerik(d); })
      .catch(() => { if (!iptal) setIcerik("hata"); });
    return () => { iptal = true; };
  }, [dosya, deneme]);

  // Odak iadesi (AjanAdimDetay idiomu): modal kapanınca odak tetikleyiciye döner — klavye
  // kullanıcısı MevzuatView kartındaki / sohbetteki konumunu kaybetmez.
  const oncekiOdak = useRef(null);
  useEffect(() => {
    oncekiOdak.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // arka sayfa kaydırması kilitli — yalnız mevzuat okunur
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = eski;
      oncekiOdak.current?.focus?.();
    };
  }, [onClose]);

  const bloklar = useMemo(() => (icerik && icerik !== "hata" ? maddeAyir(icerik.metin) : []), [icerik]);
  const maddeler = useMemo(() => bloklar.filter((b) => b.no !== null), [bloklar]);
  const aktif = useOkumaIzleyici(kapRef, cizgiRef, maddeEl, bloklar);
  const vurguKimlik = maddeNo != null ? `${maddeTur}-${maddeNo}` : null;

  // Hedef maddeye kaydır. rAF: içerik cache'liyken bloklar ilk render'da hazır olur ama modal
  // scroll konteyneri henüz layout almadan scrollIntoView boşa gider → bir tick ertele.
  useEffect(() => {
    if (!bloklar.length || maddeNo == null) return undefined;
    const id = requestAnimationFrame(() => maddeRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [bloklar, maddeNo]);

  const git = useCallback((k) => {
    maddeEl.current.get(k)?.scrollIntoView({ block: "start", behavior: azaltilmisHareket() ? "auto" : "smooth" });
  }, []);
  const kayit = (b) => (el) => { const k = blokKimlik(b); if (el) maddeEl.current.set(k, el); else maddeEl.current.delete(k); };

  const hazir = icerik && icerik !== "hata";
  const tur = hazir ? turEtiketi(icerik.baslik, icerik.no) : null;

  return (
    // nu-sol: scrim tek karede çakılmak yerine solarak gelir (içerik nu-rise ile — iki katman
    // birlikte doğar, parlaklık sıçraması yok).
    <div role="presentation" onClick={onClose} className="mo-kok" style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, display: "flex", alignItems: "center", justifyContent: "center", animation: "nu-sol .16s var(--ke-ease-out) both" }}>
      <style>{OKUMA_CSS}</style>
      <div role="dialog" aria-modal="true" aria-labelledby="mevzuat-okuma-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} className="mo-kagit"
        style={{ display: "flex", flexDirection: "column", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, boxShadow: SH.modal, overflow: "hidden", animation: "nu-rise .22s var(--ke-ease-out)" }}>
        <header style={{ flexShrink: 0, padding: `${SP.l}px clamp(16px,3vw,32px) 0` }}>
          <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
            <span style={{ whiteSpace: "nowrap" }}>RESMÎ METİN</span>
            {tur && <span style={{ whiteSpace: "nowrap", textTransform: "uppercase" }}>{tur}</span>}
            <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: SP.l, marginTop: SP.m }}>
            {hazir && icerik.no && (
              <span className="mo-baslik-no" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: "44px", fontStretch: "118%", letterSpacing: "-.035em", color: DERIN.T, flexShrink: 0, ...TNUM }}>{icerik.no}</span>
            )}
            <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
              <h2 id="mevzuat-okuma-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink, textWrap: "balance" }}>
                {icerik === null ? "Mevzuat yükleniyor…" : icerik === "hata" ? "Mevzuat açılamadı" : icerik.baslik}
              </h2>
              {hazir && icerik.kunye && (
                <p className="mo-kunye" title={icerik.kunye} style={{ margin: `${SP.xs + 2}px 0 0`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.mut2, overflowWrap: "anywhere" }}>{icerik.kunye}</p>
              )}
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Okuma panelini kapat" {...focusRing} data-press="" data-dokunma=""
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
              style={{ cursor: "pointer", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink2, flexShrink: 0, transition: "background .12s ease-out, transform .14s var(--ke-ease-out)" }}><Icon.x /></button>
          </div>
          {/* Çift antet çizgisi + üstünde okuma ilerlemesi (kaydırma oranı, yalnız transform). */}
          <div aria-hidden="true" style={{ position: "relative", marginTop: SP.l, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: .9 }}>
            <span ref={cizgiRef} style={{ position: "absolute", left: 0, right: 0, top: -2, height: 2, background: T, transformOrigin: "0 50%", transform: "scaleX(0)" }} />
          </div>
        </header>

        <div className="mo-govde">
          {maddeler.length > 1 ? <MaddeDizini maddeler={maddeler} aktif={aktif} onGit={git} vurguKimlik={vurguKimlik} /> : <div aria-hidden="true" className="mo-dizin" />}
          <div ref={kapRef} data-kaydirma-kapsa="" tabIndex={-1} className="mo-metin" style={{ overflowY: "auto", minHeight: 0, outline: "none" }}>
            {icerik === null && (
              <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2, padding: "16px 0" }}>
                <Icon.spin /> Tam metin yükleniyor…
              </div>
            )}
            {icerik === "hata" && (
              <div role="alert" style={{ ...TYPE.data, color: PAL.ink2, padding: "8px 0" }}>
                Tam metin şu anda alınamıyor. Lütfen tekrar deneyin.
                <div style={{ marginTop: SP.m }}><Btn onClick={() => setDeneme((n) => n + 1)}>Tekrar dene</Btn></div>
              </div>
            )}
            {bloklar.map((b, i) => (
              <MaddeBlok key={i} blok={b} kayitRef={b.no === null ? () => {} : kayit(b)}
                vurgulu={maddeNo != null && b.no === maddeNo && b.tur === maddeTur} anchorRef={maddeRef} />
            ))}
            {hazir && bloklar.length > 0 && (
              <div aria-hidden="true" className="mo-satir" style={{ marginTop: SP.xxl }}>
                <span />
                <div style={{ display: "flex", alignItems: "center", gap: SP.m, maxWidth: OLCU, ...TYPE.antet, color: PAL.mut3 }}>
                  <span style={{ flex: 1, height: 1, background: PAL.line }} />METNİN SONU<span style={{ flex: 1, height: 1, background: PAL.line }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
