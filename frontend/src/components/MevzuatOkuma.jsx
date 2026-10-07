/* MevzuatOkuma — mevzuatın tam metnini gösteren okuma modalı ("Resmî Gazete okuma salonu")
   + metin ayrıştırma. Ayrı dosya: hem MevzuatView (katalog/oturum önerileri) hem DashboardApp
   (global overlay — ayrıntılı sonuç ekranı + sohbet çipi) AYNI modalı kullansın; kod tek yerde.
   Kaynak: /mevzuat/icerik/{dosya} (backend beyaz-listeli dosya adı).

   Tipografi (2026-10 "Antet & Damga"): metin sütunu ~68ch ölçüde; madde numarası kenarda
   asılı (hanging marginalia), kenar başlığı madde başı; solda yapışkan madde dizini
   (scroll-spy), üstte okuma ilerleme çizgisi. Telefonda tam ekran kâğıt + yatay madde şeridi. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Btn, Damga, MONO, DISPLAY, T, V, R, PAL, DERIN, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, SR_ONLY, focusRing, odakDongusu } from "./neonUi.jsx";
import { kunyeCoz, kaynakNotuCoz, NITELIK, notTemizle } from "../lib/mevzuatKunye.js";
import { dogrulaParcala, vurguParcala } from "../lib/mevzuatVurgu.js";
import MevzuatMarj from "./MevzuatMarj.jsx";

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
/* "[DOĞRULA: …]" — korpusun kendi şüphe işareti (CLAUDE.md §1). Metnin parçası gibi akıp
   okunmasın: kesik sarı alt çizgili mono not, ekran okuyucuya "doğrulanmamış not" diye
   duyurulur. İçerik bire bir aynı kalır (dogrulaParcala yalnız böler). */
function DogrulaliMetin({ metin, sorgu }) {
  return dogrulaParcala(metin).map((p, i) => (p.dogrula ? (
    <span key={i} className="mo-dogrula" title="Doğrulanmamış hüküm notu — atıftan önce resmî metinle karşılaştırın">
      <span style={SR_ONLY}>Doğrulanmamış not: </span>{p.metin}
    </span>
  ) : sorgu ? vurguParcala(p.metin, sorgu).map((v, j) => (v.vurgu ? <mark key={`${i}-${j}`} className="mo-vurgu">{v.metin}</mark> : v.metin)) : p.metin));
}

/* Gövde satır aralığı 25/16 = %156: ekran gövdesi için Butterick'in %120–145 basılı
   aralığının hemen üstü (28px = %175 paragrafları gevşek bir ızgaraya dağıtıyordu). */
function Paragraf({ metin, sorgu }) {
  const m = metin.match(DEGISIKLIK_RE);
  const bent = /^[a-zçğıöşü]\)\s/i.test(metin);
  return (
    <p style={{ margin: `0 0 ${SP.m + 2}px`, ...TYPE.read, lineHeight: "25px", color: PAL.ink2, textWrap: "pretty", hyphens: "auto", ...(bent ? { paddingLeft: "1.6em", textIndent: "-1.6em" } : null) }}>
      {m && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut, letterSpacing: ".02em", marginRight: 6 }}>{m[1]}</span>}
      <DogrulaliMetin metin={m ? metin.slice(m[0].length) : metin} sorgu={sorgu} />
    </p>
  );
}

/* Okuma ölçüsü: ~68 KARAKTER/satır. "68ch" CSS'te "0" glifinin genişliğidir; Instrument
   Sans'ta ortalama harf ondan dar olduğundan 68ch ≈ 92 karakter çıkıyordu (ölçüldü).
   33em ≈ 16px'te 528px ≈ 68–72 karakter. */
const OLCU = "33em";
const kenarBasligi = (b) => b.baslik.replace(MADDE_BASLIK_RE, "").replace(/^\s*[—–:-]\s*/, "").trim();
const turKisa = (tur) => (tur === "ek" ? "Ek" : tur === "gecici" ? "Geçici" : "Madde");
const blokKimlik = (b) => `${b.tur}-${b.no}`;

/* Okuma başlığının künye satırı — ham künye yerine çözülmüş olgular (Kabul · RG tarih/sayı ·
   yürürlük) + metnin NİTELİĞİ + resmî kaynak bağlantısı. Nitelik okurun ilk bakışta bilmesi
   gereken şeydir: madde özeti hukuki atıf için yeterli değildir (CLAUDE.md §1). Renk tek
   sinyal değil — nitelik adı metin olarak yazılı, açıklaması title + ekran okuyucuda. */
const DURUM = {
  yururlukte: { ad: "Yürürlükte", renk: DERIN.yesil },
  kismen: { ad: "Kısmen yürürlükte", renk: DERIN.sari },
  mulga: { ad: "Mülga", renk: DERIN.R },
};

/* Metnin niteliği + yürürlüğü için kalıcı uyarı şeridi (legislation.gov.uk'in "Changes to
   legislation" bandı gibi): künye çipi OLGUYU söyler, şerit okurun NE YAPMASI gerektiğini.
   Lafzî ve yürürlükteki metinde basılmaz — yalnız atıf riski olan hâlde görünür. */
function NitelikSeridi({ kunye, metin }) {
  const kn = kunyeCoz(kunye);
  const not = kaynakNotuCoz(String(metin || "").slice(0, 1200));
  const mulga = kn.durum === "mulga";
  const ozet = not.nitelik === "ozet" || not.nitelik === "yakin";
  if (!mulga && !ozet) return null;
  const renk = mulga ? R : BANT.sari.c;
  const baslik = mulga ? "Yürürlükte değil." : not.nitelik === "ozet" ? "Madde özeti — lafzî metin değildir." : "Yakın-lafzî alıntı.";
  const govde = mulga
    ? "Bu mevzuata yeni yazıda dayanılamaz; kaynak notundaki yürürlükteki karşılığını kullanın."
    : "Hukuki atıf yapmadan önce maddeyi resmî metinle karşılaştırın.";
  return (
    <p role="note" className="mo-serit" style={{ margin: `${SP.m}px 0 0`, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: `2px ${SP.s}px`, padding: `${SP.s}px ${SP.m}px`,
      borderRadius: RAD.ctl, background: ALFA(renk), boxShadow: `inset 3px 0 0 ${renk}`, ...TYPE.data, color: PAL.ink2 }}>
      <strong style={{ fontWeight: 650, color: mulga ? DERIN.R : DERIN.sari }}>{baslik}</strong>
      <span className={mulga ? undefined : "mo-serit-govde"}>{govde}</span>
      {not.url && !mulga && (
        <a href={not.url} target="_blank" rel="noopener noreferrer" className="mo-resmi-bag" data-dokunma="" {...focusRing} style={{ display: "inline-flex", alignItems: "center", color: DERIN.T, fontWeight: 600, textUnderlineOffset: 3, borderRadius: RAD.chip, whiteSpace: "nowrap" }}>
          Resmî metni aç<span aria-hidden="true"> ↗</span><span style={SR_ONLY}> ({not.host}, yeni sekmede)</span>
        </a>
      )}
    </p>
  );
}

function KunyeSatiri({ kunye, metin, yer }) {
  const kn = kunyeCoz(kunye);
  const not = kaynakNotuCoz(String(metin || "").slice(0, 1200));
  // Şerit (NitelikSeridi) basılıyorsa nitelik ve resmî bağlantı YALNIZ şeritte durur — başlıkta
  // "yakın-lafzî" iki kez, kaynak bağlantısı iki kez basılıyordu (tur 6). Künye yalnız olgu taşır.
  const seritNitelik = not.nitelik === "ozet" || not.nitelik === "yakin";
  const seritBaglanti = seritNitelik && kn.durum !== "mulga";
  const nit = not.nitelik && !seritNitelik ? NITELIK[not.nitelik] : null;
  const parca = [
    kn.kabul && ["Kabul", kn.kabul],
    kn.rgTarih && ["RG", kn.rgSayi ? `${kn.rgTarih} / ${kn.rgSayi}` : kn.rgTarih],
    !kn.rgTarih && kn.kararTarih && ["Karar", kn.kararTarih],
  ].filter(Boolean);
  const ham = !parca.length ? (kn.altBaslik || kunye) : null;
  const durum = DURUM[kn.durum] || null;
  return (
    <div className={`mo-kunye mo-kunye-${yer}`} style={{ margin: `${SP.s}px 0 0`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${SP.xs}px ${SP.m}px`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.mut2, ...TNUM }}>
      {parca.map(([e, d]) => (
        <span key={e} title={kunye || undefined} style={{ whiteSpace: "nowrap" }}><span style={{ color: PAL.mut3 }}>{e} </span>{d}</span>
      ))}
      {ham && <span title={kunye} style={{ overflowWrap: "anywhere" }}>{ham}</span>}
      {durum && <span style={{ fontFamily: "inherit", fontWeight: 600, color: durum.renk, whiteSpace: "nowrap" }}>{durum.ad}</span>}
      {nit && (
        <span title={nit.aciklama} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "1px 8px", borderRadius: RAD.chip, whiteSpace: "nowrap",
          border: `1px solid color-mix(in srgb, ${BANT[nit.renk].c} 40%, transparent)`, background: ALFA(BANT[nit.renk].c), color: DERIN[nit.renk], fontWeight: 600 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: BANT[nit.renk].c }} />
          {nit.ad}<span style={SR_ONLY}>: {nit.aciklama}</span>
        </span>
      )}
      {not.url && !seritBaglanti && (
        <a href={not.url} target="_blank" rel="noopener noreferrer" data-dokunma="" {...focusRing}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: DERIN.T, textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap", borderRadius: RAD.chip }}>
          {not.host}<span aria-hidden="true">↗</span><span style={SR_ONLY}> (resmî kaynak, yeni sekmede açılır)</span>
        </a>
      )}
    </div>
  );
}

/* Künye-sonrası kaynak notu — her genişlikte KATLI gelir (native <details>: klavye + ekran
   okuyucu hazır); özü (nitelik + yürürlük + kaynak) zaten başlıktaki künye şeridinde. */
function KaynakNotu({ govde }) {
  // Etiket durumu yansıtır (tur 8: not açıkken "göster" yazıyordu). details/summary yerel
  // aria-expanded taşır; onToggle yalnız etiketi senkronlar.
  // Tur 8 jüri: masaüstünde de varsayılan KATLI — açık not ilk ekranın ~1/3'ünü kaplayıp
  // madde metnini katın altına itiyordu. Özet satırı nitelik + kaynağı tek satırda söyler.
  const [acik, setAcik] = useState(false);
  const ps = paragraflar(govde);
  return (
    <aside className="mo-satir" aria-label="Kaynak notu" style={{ marginBottom: SP.xxl }}>
      <div className="mo-kenar" aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, paddingTop: 3 }}>KAYNAK<br className="mo-kenar-br" /> NOTU</div>
      <details open={acik} onToggle={(e) => setAcik(e.currentTarget.open)} className="mo-not" style={{ borderLeft: `1px solid ${PAL.line}`, paddingLeft: SP.l, maxWidth: OLCU }}>
        <summary className="mo-not-ozet" {...focusRing} style={{ cursor: "pointer", ...TYPE.data, color: DERIN.T, fontWeight: 600, borderRadius: RAD.chip, padding: "6px 0", minHeight: 36, display: "flex", alignItems: "center", gap: SP.xs }}>
          {acik ? "Kaynak notunu gizle" : `Kaynak notunu göster · ${ps.length} paragraf`}
        </summary>
        {ps.map((p, i) => <p key={i} style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2, overflowWrap: "anywhere", textWrap: "pretty" }}>{notTemizle(p)}</p>)}
      </details>
    </aside>
  );
}

/* Tek madde — numara sol kenarda asılı (Archivo, kenar notu), kenar başlığı + akıtılmış gövde
   ~68ch ölçüde. Hedef madde mühür moru tint + "Önerilen madde" etiketi. */
function MaddeBlok({ blok, vurgulu, anchorRef, kayitRef, sorgu }) {
  if (blok.no === null) return <KaynakNotu govde={blok.govde} />;
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
        {vurgulu && <div style={{ ...TYPE.antet, color: DERIN.V, marginBottom: SP.xs }}>{sorgu ? "ARAMA SONUCU" : "ÖNERİLEN MADDE"}</div>}
        {kenar && <h3 style={{ margin: `2px 0 ${SP.s + 2}px`, fontFamily: DISPLAY, fontSize: 19, lineHeight: "24px", fontWeight: 650, fontStretch: "104%", letterSpacing: "-.01em", color: vurgulu ? DERIN.V : PAL.ink, textWrap: "balance" }}>{kenar}</h3>}
        {paragraflar(blok.govde).map((p, i) => <Paragraf key={i} metin={p} sorgu={sorgu} />)}
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
  // Ok tuşları (↑↓ masaüstü, ←→ telefon şeridi) + Home/End: dizinde gezer VE maddeye atlar.
  // Roving tabindex — Tab dizine bir kez girer (19 maddelik yönetmelikte 19 durak değil);
  // klavye eylemi animasyonsuz (Emil sıklık kuralı → onGit(k, true) anında kaydırır).
  const tusla = (e) => {
    const yon = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (yon == null && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const simdi = maddeler.findIndex((b) => blokKimlik(b) === e.target.dataset?.dizin);
    const i = e.key === "Home" ? 0 : e.key === "End" ? maddeler.length - 1 : Math.min(maddeler.length - 1, Math.max(0, (simdi < 0 ? 0 : simdi) + yon));
    const k = blokKimlik(maddeler[i]);
    listeRef.current?.querySelector(`[data-dizin="${k}"]`)?.focus();
    onGit(k, true);
  };
  const durak = maddeler.some((b) => blokKimlik(b) === aktif) ? aktif : blokKimlik(maddeler[0]);
  return (
    <nav aria-label="Madde dizini" className="mo-dizin">
      <div className="mo-dizin-baslik" style={{ ...TYPE.antet, color: PAL.mut3, padding: `0 ${SP.m}px ${SP.s}px` }}>MADDELER · {maddeler.length}</div>
      <ol ref={listeRef} className="mo-dizin-liste" onKeyDown={tusla} aria-describedby="mo-dizin-ipucu" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {maddeler.map((b) => {
          const k = blokKimlik(b);
          const secili = aktif === k;
          return (
            <li key={k}>
              <button type="button" data-dizin={k} onClick={() => onGit(k)} aria-current={secili ? "location" : undefined} {...focusRing} tabIndex={k === durak ? 0 : -1}
                className="mo-dizin-oge"
                style={{ display: "flex", alignItems: "baseline", gap: SP.s, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", border: "none",
                  background: secili ? ALFA(T) : "transparent", borderRadius: RAD.chip, padding: "5px 10px",
                  boxShadow: secili ? `inset 2px 0 0 ${T}` : "none", color: secili ? PAL.ink : PAL.mut2, transition: "background .12s ease-out, color .12s ease-out" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, minWidth: 30, color: k === vurguKimlik ? DERIN.V : secili ? DERIN.T : PAL.mut3, ...TNUM, flexShrink: 0 }}>
                  {b.tur === "ek" ? "E" : b.tur === "gecici" ? "G" : "m"}.{b.no}
                </span>
                <span className="mo-dizin-ad" title={kenarBasligi(b) || undefined} style={{ ...TYPE.meta, fontWeight: secili ? 600 : 500, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textWrap: "pretty" }}>{kenarBasligi(b) || "—"}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <span id="mo-dizin-ipucu" style={SR_ONLY}>Ok tuşlarıyla maddeler arasında gezinin.</span>
      <div className="mo-dizin-ipucu" aria-hidden="true" style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, padding: `${SP.m}px ${SP.m}px 0`, display: "flex", gap: SP.xs, alignItems: "center" }}>
        <kbd className="mo-kbd">↑</kbd><kbd className="mo-kbd">↓</kbd> GEZİN · <kbd className="mo-kbd">ESC</kbd> KAPAT
      </div>
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
.mo-kunye-tel{display:none!important}
.mo-govde{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0;flex:1}
.mo-marj{display:none}
/* ≥1600 (tur 8): kâğıt 1240'a açılır, sağ marjda okunan maddenin atıf fişi (MevzuatMarj). */
@media (min-width:1600px){
  .mo-kagit{width:min(1240px,100%)}
  .mo-govde{grid-template-columns:240px minmax(0,1fr) 264px}
  .mo-marj{display:block;border-left:1px solid var(--ke-line);padding:${SP.xl}px ${SP.l}px;overflow-y:auto;overscroll-behavior:contain}
}
.mo-dizin{border-right:1px solid var(--ke-line);padding:${SP.xl}px ${SP.s}px;overflow-y:auto;overscroll-behavior:contain}
.mo-satir{display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:${SP.xl}px}
.mo-metin{padding:${SP.xxl}px clamp(16px,4vw,56px) ${SP.xxxl}px clamp(8px,2vw,24px)}
.mo-dizin-oge:hover{background:var(--ke-hov)!important;color:var(--ke-ink)!important}
.mo-kbd{font:inherit;font-size:10px;padding:0 5px;border:1px solid var(--ke-line);border-bottom-width:2px;border-radius:4px;background:var(--ke-surf2)}
.mo-dogrula{font-size:.875em;font-style:italic;color:var(--ke-mut);text-decoration:underline dashed color-mix(in srgb, var(--ke-bant-sari) 90%, transparent);text-decoration-thickness:1.5px;text-underline-offset:5px;text-decoration-skip-ink:none}
.mo-vurgu{color:inherit;padding:0;border-radius:2px;background:linear-gradient(color-mix(in srgb, var(--ke-bant-sari) 38%, transparent),color-mix(in srgb, var(--ke-bant-sari) 38%, transparent)) no-repeat 0 85%/100% 70%;animation:mo-kalem .18s var(--ke-ease-out) both}
@keyframes mo-kalem{from{background-size:0% 70%}to{background-size:100% 70%}}
.mo-iskelet{position:relative;overflow:hidden;background:var(--ke-press);border-radius:3px}
.mo-iskelet::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ke-surf) 55%,transparent),transparent);transform:translateX(-100%);animation:mo-kuru 1.4s linear infinite}
@keyframes mo-kuru{to{transform:translateX(100%)}}
/* Okuma ilerlemesi JS'siz: kaydırma zaman çizelgesi (Chrome 115+/Safari 26). Desteklemeyen
   tarayıcıda ve reduced-motion'da (global kural animasyonu kapatır) rAF yedeği çalışır. */
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:scroll()){
  .mo-kagit{timeline-scope:--mo-oku}
  .mo-metin{scroll-timeline:--mo-oku block}
  .mo-ilerleme{animation:mo-ilerle linear both;animation-timeline:--mo-oku}
}}
@keyframes mo-ilerle{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.mo-not>summary{list-style:none}
.mo-not>summary::-webkit-details-marker{display:none}
@media (max-width:820px){
  .mo-dizin-ipucu{display:none!important}
  .mo-not-ozet{min-height:44px!important}
  .mo-kenar-br{display:none}
  .mo-serit-govde{display:none}
  .mo-kok{padding:0}
  .mo-kagit{width:100%;height:100%;border-radius:0;border:none!important}
  .mo-govde{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .mo-dizin{border-right:none;border-bottom:1px solid var(--ke-line);padding:${SP.s}px 0;overflow:visible}
  .mo-dizin-baslik{display:none}
  .mo-dizin-liste{display:flex;gap:${SP.xs}px;overflow-x:auto;padding:0 ${SP.l}px!important;scroll-snap-type:x proximity;scrollbar-width:none}
  .mo-dizin-liste::-webkit-scrollbar{display:none}
  .mo-dizin-liste li{scroll-snap-align:start;flex-shrink:0}
  .mo-dizin-ad{display:none}
  .mo-dizin-oge{min-height:44px;min-width:44px;align-items:center!important}
  .mo-resmi-bag{display:inline-flex;align-items:center;min-height:44px}
  .mo-serit{padding-block:0!important;align-items:center!important}
  .mo-satir{grid-template-columns:minmax(0,1fr);row-gap:${SP.xs}px}
  .mo-satir[data-vurgu]{padding-left:${SP.l}px!important}
  .mo-kenar{text-align:left!important;display:flex;align-items:baseline;gap:${SP.s}px}
  .mo-metin{padding:${SP.xl}px ${SP.l}px ${SP.xxxl}px}
  .mo-kunye-masa{display:none!important}
  .mo-kunye-tel{display:flex!important;margin-top:${SP.m}px!important}
  .mo-baslik-no{font-size:34px!important;line-height:36px!important}
}
`;

const ICERIK_CACHE = new Map(); // dosya → içerik yanıtı (modal her açılışta yeniden inmesin)
const azaltilmisHareket = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/* CSS kaydırma zaman çizelgesi ilerlemeyi sürüyorsa JS satır içi transform yazmaz (yazarsa
   animasyonun üstüne çıkmaz ama gereksiz iş yapar ve iki kaynak çatışır). */
const cssIlerleme = () => typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: scroll()") && !azaltilmisHareket();

/* Kaydırma kabı → ilerleme çizgisi (ref ile, render'sız) + scroll-spy (aktif madde). */
function useOkumaIzleyici(kapRef, cizgiRef, maddeEl, bloklar) {
  const [aktif, setAktif] = useState(null);
  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return undefined;
    let kare = 0;
    const jsIlerleme = !cssIlerleme();
    const olc = () => {
      kare = 0;
      const max = kap.scrollHeight - kap.clientHeight;
      if (jsIlerleme && cizgiRef.current) cizgiRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, kap.scrollTop / max) : 0})`;
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

/* Yükleniyor — gerçek madde düzeninin iskeleti (kenar numarası + kenar başlığı + gövde
   satırları); "kuruyan mürekkep" taraması. Spinner yok: okur metnin NEREYE geleceğini görür. */
function OkumaIskelet() {
  return (
    <div aria-busy="true">
      <span role="status" style={SR_ONLY}>Tam metin yükleniyor…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="mo-satir" style={{ marginBottom: SP.xxl }}>
          <div className="mo-kenar" style={{ display: "grid", justifyItems: "end", gap: 6 }}>
            <span className="mo-iskelet" style={{ width: 34, height: 8 }} />
            <span className="mo-iskelet" style={{ width: 26, height: 26 }} />
          </div>
          <div style={{ display: "grid", gap: 10, maxWidth: OLCU }}>
            <span className="mo-iskelet" style={{ width: "42%", height: 16, marginBottom: 4 }} />
            {[96, 100, 91, 64].map((w, j) => <span key={j} className="mo-iskelet" style={{ width: `${w}%`, height: 10 }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* İçerik alınamadı — ne olduğu + ne yapılacağı + (ikincil) teknik kod. Tek eylem: Tekrar dene. */
function OkumaHata({ kod, onTekrar }) {
  return (
    <div role="alert" className="mo-satir" style={{ paddingTop: SP.s }}>
      <div className="mo-kenar" aria-hidden="true" style={{ display: "flex", justifyContent: "flex-end", color: DERIN.R, paddingTop: 2 }}><Icon.alert width={22} height={22} /></div>
      <div style={{ maxWidth: OLCU }}>
        <h3 style={{ margin: `0 0 ${SP.s}px`, ...TYPE.h2, fontSize: 18, color: PAL.ink }}>Tam metin sunucudan alınamadı</h3>
        <p style={{ margin: `0 0 ${SP.l}px`, ...TYPE.ui, color: PAL.mut2, textWrap: "pretty" }}>
          Mevzuat kaydı yerinde; yalnız metin şu anda indirilemedi. Bağlantınızı kontrol edip tekrar deneyin — sorun sürerse kataloğa dönüp başka bir kaynak açabilirsiniz.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <Btn primary onClick={onTekrar}>Tekrar dene</Btn>
          {kod && <span style={{ fontFamily: MONO, fontSize: 11.5, color: PAL.mut3, letterSpacing: ".04em" }}>{kod}</span>}
        </div>
      </div>
    </div>
  );
}

/* Okuma modalı — ortada geniş kâğıt (telefonda tam ekran), arka plan karartılır.
   Esc / dış tıklama / kapat düğmesi kapatır; açılışta odak kapat butonuna, gövde kaydırması kilitlenir.
   view'dan BAĞIMSIZ: nerede render edilirse edilsin (Mevzuat sayfası VEYA ayrıntılı sonuç
   ekranı üstünde global overlay) aynı davranır. */
export function OkumaModal({ dosya, maddeNo, maddeTur = "madde", sorgu = "", onClose }) {
  const [icerik, setIcerik] = useState(ICERIK_CACHE.get(dosya) || null); // null=yükleniyor, "hata", {...}
  const [deneme, setDeneme] = useState(0);
  const [hataKod, setHataKod] = useState(null); // "HTTP 500" · "AĞ" — teknik ayrıntı, mono + ikincil
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
      .catch((e) => { if (!iptal) { setHataKod(/^\d+$/.test(e?.message) ? `HTTP ${e.message}` : "AĞ BAĞLANTISI"); setIcerik("hata"); } });
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
  const aktifSira = Math.max(0, maddeler.findIndex((b) => blokKimlik(b) === aktif));
  const aktifBlok = maddeler[aktifSira] || null;
  const mevcutKimlik = useMemo(() => new Set(maddeler.map(blokKimlik)), [maddeler]);

  // Hedef maddeye kaydır. rAF: içerik cache'liyken bloklar ilk render'da hazır olur ama modal
  // scroll konteyneri henüz layout almadan scrollIntoView boşa gider → bir tick ertele.
  useEffect(() => {
    if (!bloklar.length || maddeNo == null) return undefined;
    const id = requestAnimationFrame(() => maddeRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [bloklar, maddeNo]);

  const git = useCallback((k, anlik = false) => {
    maddeEl.current.get(k)?.scrollIntoView({ block: "start", behavior: anlik || azaltilmisHareket() ? "auto" : "smooth" });
  }, []);
  const kayit = (b) => (el) => { const k = blokKimlik(b); if (el) maddeEl.current.set(k, el); else maddeEl.current.delete(k); };

  const hazir = icerik && icerik !== "hata";
  const tur = hazir ? turEtiketi(icerik.baslik, icerik.no) : null;
  const mulga = hazir && kunyeCoz(icerik.kunye).durum === "mulga";
  const tekrarDene = () => { closeRef.current?.focus(); setDeneme((n) => n + 1); }; // düğme kaybolunca odak diyalog içinde kalsın

  // Portal (tur 7): görünüm ağacının içinde kalınca telefonda alt sekme şeridi (z 90, kabuk
  // yığın bağlamı) okuma kâğıdının dibini örtüyordu — metnin son satırları şeridin altında kalıyordu.
  return createPortal(
    // nu-sol: scrim tek karede çakılmak yerine solarak gelir (içerik nu-rise ile — iki katman
    // birlikte doğar, parlaklık sıçraması yok).
    <div role="presentation" onClick={onClose} className="mo-kok" style={{ position: "fixed", inset: 0, zIndex: 400, background: PAL.scrimKoyu, display: "flex", alignItems: "center", justifyContent: "center", animation: "nu-sol .16s var(--ke-ease-out) both" }}>
      <style>{OKUMA_CSS}</style>
      <div role="dialog" aria-modal="true" aria-labelledby="mevzuat-okuma-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} className="mo-kagit"
        style={{ display: "flex", flexDirection: "column", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, boxShadow: SH.modal, overflow: "hidden", animation: "nu-rise .22s var(--ke-ease-out)" }}>
        <header style={{ flexShrink: 0, padding: `${SP.l}px clamp(16px,3vw,32px) 0` }}>
          <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
            <span style={{ whiteSpace: "nowrap" }}>RESMÎ METİN</span>
            {tur && <><span style={{ color: PAL.mut3 }}>·</span><span style={{ whiteSpace: "nowrap", textTransform: "uppercase" }}>{tur}</span></>}
            <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: SP.l, marginTop: SP.m }}>
            {hazir && icerik.no && (
              <span className="mo-baslik-no" style={{ position: "relative", fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: "44px", fontStretch: "118%", letterSpacing: "-.035em", color: mulga ? PAL.mut2 : DERIN.T, flexShrink: 0, ...TNUM }}>
                {icerik.no}
                {/* Görünümün hükmü: yürürlükte olmayan metin — numaranın üstüne basılmış tek damga. */}
                {mulga && <Damga ton={R} egim={-8} kucuk style={{ position: "absolute", left: "50%", top: "62%", translate: "-50% 0", background: PAL.surfPop }}>Mülga</Damga>}
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
              <h2 id="mevzuat-okuma-h" style={{ margin: 0, ...TYPE.h2, ...(hazir && icerik.baslik?.length > 110 ? { fontSize: 17, lineHeight: "22px" } : null), color: PAL.ink, textWrap: "balance" }}>
                {icerik === null ? "Mevzuat yükleniyor…" : icerik === "hata" ? "Mevzuat açılamadı" : icerik.baslik}
              </h2>
              {hazir && <KunyeSatiri yer="masa" kunye={icerik.kunye} metin={icerik.metin} />}
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Okuma panelini kapat" {...focusRing} data-press="" data-dokunma=""
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
              style={{ cursor: "pointer", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink2, flexShrink: 0, transition: "background .12s ease-out, transform .14s var(--ke-ease-out)" }}><Icon.x /></button>
          </div>
          {/* Telefon: künye dar başlık sütununa sığmaz → tam genişlikte (masaüstü kopyası gizlenir;
             display:none erişilebilirlik ağacından da düşer, tekrar okunmaz). */}
          {hazir && <KunyeSatiri yer="tel" kunye={icerik.kunye} metin={icerik.metin} />}
          {hazir && <NitelikSeridi kunye={icerik.kunye} metin={icerik.metin} />}
          {/* Çift antet çizgisi + üstünde okuma ilerlemesi (kaydırma oranı, yalnız transform). */}
          <div aria-hidden="true" style={{ position: "relative", marginTop: SP.l, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: .9 }}>
            <span ref={cizgiRef} className="mo-ilerleme" style={{ position: "absolute", left: 0, right: 0, top: -2, height: 2, background: T, transformOrigin: "0 50%", transform: "scaleX(0)" }} />
          </div>
        </header>

        <div className="mo-govde">
          {maddeler.length > 1 ? <MaddeDizini maddeler={maddeler} aktif={aktif} onGit={git} vurguKimlik={vurguKimlik} /> : <div aria-hidden="true" className="mo-dizin" />}
          {/* Kaydırılan metin bölgesi klavyeyle odaklanabilir (axe: scrollable-region-focusable):
             Tab dizinden buraya gelir, ↑↓/PgDn ile okunur; diyaloğun SON durağı olduğu için
             odak döngüsü buradan kapat düğmesine sarar (önceden odak BODY'ye kaçıyordu). */}
          <div ref={kapRef} data-kaydirma-kapsa="" tabIndex={0} role="region" aria-label="Mevzuat metni" className="mo-metin" {...focusRing} style={{ overflowY: "auto", minHeight: 0, outline: "none" }}>
            {icerik === null && <OkumaIskelet />}
            {icerik === "hata" && <OkumaHata kod={hataKod} onTekrar={tekrarDene} />}
            {bloklar.map((b, i) => (
              <MaddeBlok key={i} blok={b} sorgu={sorgu} kayitRef={b.no === null ? () => {} : kayit(b)}
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
          {hazir && <MevzuatMarj icerik={icerik} blok={aktifBlok} sira={aktifSira + 1} toplam={maddeler.length} mevcut={mevcutKimlik} onGit={git} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
