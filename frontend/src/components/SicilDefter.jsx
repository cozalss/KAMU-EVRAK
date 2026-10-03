/* SicilDefter — "evrak kayıt defteri" ortak atomları (Gelen · İşlenen · Giden · Denetim).
   Dört kayıt görünümü aynı defter dilini konuşur: beyaz evrak yüzeyi (masa = gri zemin),
   mono antet satırı gibi sütun başlığı, hairline satır ayraçları, solda/sağda sabit mono
   kayıt no sütunu. Izgara sütunları görünüm başına CSS değişkeniyle verilir
   (--sd-kolon / --sd-alan); telefonda ayrı alan haritası (--sd-alan-dar) devreye girer —
   bilgi gizlenmez, satır yeniden dizilir.

   Hover "fiziksel" ama sarsıntısız: zemin tonu + solda mürekkep cetveli (scaleY, yalnız
   transform) + kayıt no mürekkebe döner + satır eylemi belirginleşir. Klavye odağında
   aynısı (:focus-within). Giriş: satır başına kısa gecikmeli yükseliş (--sd-i).
   reduced-motion: neonUi global kuralı tüm animasyon/transition'ı kapatır. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Damga, PAL, T, V, TYPE, TNUM, MONO, RAD, SP, DERIN_OF, SR_ONLY } from "./neonUi.jsx";

export const SICIL_CSS = `
@keyframes sd-gir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[data-sd-yuzey]{background:var(--ke-surf);border:1px solid var(--ke-line);border-radius:12px;box-shadow:var(--ke-sh-card);overflow:clip}
[data-sd-baslik],[data-sicil-satir]{display:grid;grid-template-columns:var(--sd-kolon);grid-template-areas:var(--sd-alan);column-gap:28px;align-items:center}
[data-sd-baslik]{padding:9px 20px 8px;border-bottom:1px solid var(--ke-line-hi);background:var(--ke-surf2)}
/* Giriş koreografisi (BENCHMARK §4): ≤6 satır kademeli, 30ms aralık, 240ms — toplam <400ms;
   sonrası anında. content-visibility: ekran dışı satırlar yerleşim/boyama dışı (250+ kayıt). */
[data-sicil-satir]{position:relative;padding:12px 20px;border-top:1px solid var(--ke-line);cursor:pointer;
  content-visibility:auto;contain-intrinsic-size:auto 76px;
  transition:background .15s ease;animation:sd-gir .24s var(--ke-ease-out) both;animation-delay:calc(min(var(--sd-i,0), 5) * 30ms)}
[data-sicil-satir][aria-selected="true"]{background:color-mix(in srgb, var(--ke-t) 9%, transparent)}
[data-sicil-satir]:first-of-type{border-top:none}
[data-sicil-satir]::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;
  background:var(--ke-t);transform:scaleY(0);transform-origin:50% 50%;transition:transform .26s var(--ke-ease-out)}
[data-sicil-satir]:hover,[data-sicil-satir]:focus-within{background:var(--ke-hov)}
[data-sicil-satir]:hover::before,[data-sicil-satir]:focus-within::before,[data-sicil-satir][data-vurgu]::before{transform:scaleY(1)}
/* Hedefli geliş (Panel → satır): fosforlu sarı mürekkep basılır ve 1,2 sn'de kâğıda çekilir. */
@keyframes sd-murekkep{0%,25%{background:color-mix(in srgb, var(--ke-bant-sari) 24%, transparent)}100%{background:color-mix(in srgb, var(--ke-t) 6%, transparent)}}
[data-sicil-satir][data-vurgu]{animation:sd-murekkep 1.2s var(--ke-ease-out) both;background:color-mix(in srgb, var(--ke-t) 6%, transparent)}
[data-sicil-satir]:focus-visible{outline:2px solid var(--ke-t);outline-offset:-2px}
[data-sd-no-sira]{transition:color .18s ease}
[data-sicil-satir]:hover [data-sd-no-sira],[data-sicil-satir]:focus-within [data-sd-no-sira]{color:var(--ke-derin-t)}
[data-sd-eylem]{display:inline-flex;align-items:center;gap:6px;justify-self:end;cursor:pointer;white-space:nowrap;
  padding:6px 12px;min-height:32px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--ke-derin-t);
  font:500 13px/18px 'Instrument Sans','Segoe UI',system-ui,sans-serif;
  transition:background .14s ease,border-color .14s ease,transform .14s var(--ke-ease-out)}
[data-sd-eylem] svg{transition:transform .22s var(--ke-ease-out)}
[data-sicil-satir]:hover [data-sd-eylem],[data-sicil-satir]:focus-within [data-sd-eylem]{border-color:var(--ke-line-hi);background:var(--ke-surf)}
[data-sicil-satir]:hover [data-sd-eylem] svg{transform:translateX(2px)}
[data-sd-eylem]:hover{border-color:var(--ke-input-line)!important}
[data-sd-eylem]:disabled{cursor:not-allowed;color:var(--ke-mut2);opacity:.7}
[data-sd-eylem]:focus-visible{outline:2px solid var(--ke-t);outline-offset:2px}
[data-sd-liste]{position:relative}
/* Kenar marjı — defter sayfasının kırmızı çift marj çizgisi: kayıt no sütunu ile metin arasında. */
[data-sd-liste]::after,[data-sd-baslik]::after{content:"";position:absolute;top:0;bottom:0;left:var(--sd-marj,140px);width:4px;pointer-events:none;
  border-left:1px solid color-mix(in srgb, var(--ke-r) 42%, transparent);border-right:1px solid color-mix(in srgb, var(--ke-r) 22%, transparent)}
[data-sd-baslik]{position:relative}
[data-sd-ipucu]{display:flex;align-items:center;gap:14px;padding:8px 20px;border-top:1px solid var(--ke-line-hi);background:var(--ke-surf2);
  font:500 11px/14px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.04em;color:var(--ke-mut3)}
[data-sd-ipucu] kbd{font:inherit;color:var(--ke-ink2);padding:1px 6px;border:1px solid var(--ke-line-hi);border-bottom-width:2px;border-radius:4px;background:var(--ke-surf)}
[data-sd-bos-satir]{height:44px;border-top:1px solid var(--ke-line);display:flex;align-items:center;padding:0 20px}
[data-sd-bos-satir]:first-child{border-top:none}
/* Sayfa devamı — kısa listede defter sayfası bitmez: kayıt satırı yüksekliğinde cetvel
   çizgileri (repeating-linear-gradient, satır adımına kilitli) boş satırları sürdürür. */
[data-sd-dolgu]{border-top:1px solid var(--ke-line);background-image:repeating-linear-gradient(to bottom, transparent 0 calc(var(--sd-adim,52px) - 1px), color-mix(in srgb, var(--ke-line) 70%, transparent) calc(var(--sd-adim,52px) - 1px) var(--sd-adim,52px))}
@keyframes sd-tara{from{transform:translateX(-60%)}to{transform:translateX(160%)}}
[data-sd-iskelet]{position:relative;overflow:hidden}
[data-sd-iskelet]::after{content:"";position:absolute;inset:0;width:40%;pointer-events:none;
  background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--ke-surf) 75%, transparent), transparent);animation:sd-tara 1.4s var(--ke-ease-in-out) infinite}
[data-sd-grup]{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 20px;background:var(--ke-surf2);border-bottom:1px solid var(--ke-line)}
[data-sd-grup]+[data-sicil-satir]{border-top:none}
[data-sd-liste]>[data-sd-grup]~[data-sd-grup]{border-top:1px solid var(--ke-line-hi)}
@media (max-width:640px){
  [data-sd-ipucu]{display:none}
  /* Sütun başlığı telefonda GÖRSEL olarak gizlenir ama tablo semantiği için okunur kalır. */
  [data-sd-baslik]{position:absolute!important;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
  [data-sd-konu]{white-space:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
  [data-sd-grup]{padding:6px 16px}
  /* Konu satırındaki istisna çipi (ör. "süresi geçmiş") telefonda konunun ALTINA iner. */
  [data-sd-konu-satir]{flex-wrap:wrap;row-gap:4px}
  [data-sd-konu-satir]>[data-sd-konu]{flex:1 1 calc(100% - 30px)}
  [data-sd-liste]::after,[data-sd-baslik]::after{display:none}
  [data-sicil-satir]{grid-template-columns:var(--sd-kolon-dar,minmax(0,1fr) auto);grid-template-areas:var(--sd-alan-dar);row-gap:6px;padding:14px 16px}
  [data-sd-eylem]{border-color:var(--ke-line-hi);background:var(--ke-surf);min-height:40px}
}
`;

/* Stil tek sefer basılır — görünüm başına bir <SicilStil/> yeterli (aynı metin iki kez
   basılsa da zararsızdır; React aynı içerikli <style>'ı yeniden yazmaz). */
export const SicilStil = () => <style>{SICIL_CSS}</style>;

/* Kayıt no — "E-2026/" öneki sessiz, sıra numarası mürekkep. Ayrımın nedeni: defterde göz
   sıra numarasını tarar; önek her satırda aynıdır ve yalnız künye işlevi görür. */
export function SicilNo({ no, style }) {
  const s = String(no || "—");
  const kes = s.lastIndexOf("/");
  const onek = kes >= 0 ? s.slice(0, kes + 1) : "";
  const sira = kes >= 0 ? s.slice(kes + 1) : s;
  return (
    <span style={{ fontFamily: MONO, fontSize: 13, lineHeight: "18px", whiteSpace: "nowrap", ...TNUM, ...style }}>
      <span style={{ color: PAL.mut3 }}>{onek}</span>
      <span data-sd-no-sira="" style={{ color: PAL.ink, fontWeight: 600 }}>{sira}</span>
    </span>
  );
}

/* Sütun başlığı hücresi — antet dili (mono, izlemeli, büyük harf). Tablo semantiğinde
   columnheader'dır (DefterYuzey başlık satırı role=row). */
export const BaslikHucre = ({ alan, sag, children }) => (
  <span role="columnheader" style={{ gridArea: alan, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", textAlign: sag ? "right" : "left", whiteSpace: "nowrap" }}>{children}</span>
);

/* Sessiz durum çipi: nokta + metin. `vurgulu` yalnız istisna durumlarda tint zemin alır
   (kütle durumu tint taşımaz — 15/15 satırda aynı renkli çip gürültüdür). */
export function SessizCip({ renk, metin, vurgulu = false, ikon = null, title, mono = false }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      ...TYPE.meta, fontWeight: 500, ...(mono ? { fontFamily: MONO, fontSize: 11, letterSpacing: ".04em" } : null), ...TNUM,
      ...(vurgulu
        ? { padding: "2px 8px", borderRadius: RAD.chip, background: `color-mix(in srgb, ${renk} var(--ke-alfa, 8%), transparent)`, color: DERIN_OF(renk) }
        : { color: PAL.mut2 }) }}>
      {ikon || <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: renk || PAL.mut3, flexShrink: 0 }} />}
      {metin}
    </span>
  );
}

/* Defter yüzeyi — başlık satırı + satırlar. sablon: { kolon, alan, alanDar, kolonDar, adim }.
   Semantik (Dev Award): gezinmeli defter role=grid (satır = row, hücre = gridcell; j/k ve
   ok tuşları satırlar arası), salt-okunur defter role=table. Satır bileşenleri hücrelerine
   role="gridcell"/"cell" verir (bkz. HUCRE). Klavye gezinmesi ekran okuyucuya ayrı bir
   polite canlı bölgeden "3. kayıt / 15" olarak duyurulur. `dolgu`: kısa listede sayfanın
   devamı olarak çizilen boş cetvel satırı sayısı (salt görsel). */
export function DefterYuzey({ sablon, basliklar, children, etiket, style, listeRef, gezinme, ipucu, rol, dolgu = 0, secimli = false }) {
  const degisken = {
    "--sd-kolon": sablon.kolon, "--sd-alan": sablon.alan,
    "--sd-alan-dar": sablon.alanDar, ...(sablon.marj ? { "--sd-marj": sablon.marj } : null), ...(sablon.kolonDar ? { "--sd-kolon-dar": sablon.kolonDar } : null),
    ...(sablon.adim ? { "--sd-adim": sablon.adim } : null),
  };
  const semantik = rol || null;
  /* grid/table rolü <section>'a verilemez (aria-allowed-role) → rollü defter <div>; rolsüz
     defter etiketli <section> (bölge) olarak kalır. Klavye gezinmesi kokRef'e bağlı, etkilenmez. */
  const Yuzey = semantik ? "div" : "section";
  return (
    <>
      <Yuzey data-sd-yuzey="" aria-label={etiket} role={semantik || undefined} ref={gezinme?.kokRef} onFocus={gezinme?.odakla}
        {...(semantik === "grid" && secimli ? { "aria-multiselectable": "true" } : null)} style={{ ...degisken, ...style }}>
        {basliklar && (semantik
          ? <div role="rowgroup"><div data-sd-baslik="" role="row">{basliklar}</div></div>
          : <div data-sd-baslik="" aria-hidden="true">{basliklar}</div>)}
        <div ref={listeRef} data-sd-liste="" role={semantik ? "rowgroup" : undefined} style={{ display: "flex", flexDirection: "column" }}>
          {children}
          {dolgu > 0 && <div data-sd-dolgu="" aria-hidden="true" style={{ height: `calc(var(--sd-adim, 52px) * ${dolgu})` }} />}
        </div>
        {ipucu && (
          <div data-sd-ipucu="" aria-hidden="true">
            <span><kbd>j</kbd> <kbd>k</kbd> satırlar arası</span>
            <span><kbd>Enter</kbd> {ipucu}</span>
            {secimli && <span><kbd>x</kbd> seç</span>}
          </div>
        )}
      </Yuzey>
      {gezinme && <span role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{gezinme.duyuru}</span>}
    </>
  );
}

/* Hücre rolü — defter grid ise gridcell, tablo ise cell. Satır bileşenleri yayar: {...HUCRE.grid}. */
export const HUCRE = { grid: { role: "gridcell" }, table: { role: "cell" } };

/* Grup başlığı (zaman kovası / gün) — defter içinde yapışkan bant: kayıtlar altından akarken
   tarih okunur kalır (zimmet defterinin gün ayracı). Grid semantiğinde tek hücreli satır;
   hücre içinde gerçek başlık (h2 düzeyi — görünüm başlığı h1) — ekran okuyucu başlıklar arası atlayabilir. */
export function GrupBasligi({ etiket, ek, sayi, birim = "kayıt", rol = "grid" }) {
  return (
    <div data-sd-grup="" role="row">
      <span role={rol === "grid" ? "gridcell" : "cell"} aria-colspan={5} style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
        <span role="heading" aria-level={2} style={{ ...TYPE.antet, fontSize: 10, color: PAL.ink2, textTransform: "uppercase", whiteSpace: "nowrap" }}>{etiket}</span>
        {ek && <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>{ek}</span>}
        <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>· {sayi} {birim}</span>
      </span>
    </div>
  );
}

/* Boş defter — "henüz yazılmamış sicil sayfası": sütun başlığı yerinde, cetvelli boş
   satırlar soluk sıra numaralarıyla durur; mesaj sayfanın ortasında, KAYIT YOK damgası
   sayfaya basılı. Jenerik boş-ikon yerine görünümün KENDİSİNİN boş hâli. */
export function BosDefter({ sablon, basliklar, baslik, sub, actions, damga = "Kayıt yok", satir = 6, onek = "" }) {
  return (
    <DefterYuzey sablon={sablon} basliklar={basliklar} etiket={baslik} style={{ position: "relative" }}>
      <div aria-hidden="true" style={{ position: "relative" }}>
        {Array.from({ length: satir }, (_, i) => (
          <div key={i} data-sd-bos-satir="" style={{ opacity: 1 - i * 0.13 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, opacity: .55, ...TNUM }}>{onek}{String(i + 1).padStart(4, "0")}</span>
            <span style={{ marginLeft: SP.xl, height: 6, width: `${[38, 52, 30, 46, 34, 40][i % 6]}%`, borderRadius: 3, background: PAL.hov }} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: SP.l,
        background: `linear-gradient(to bottom, color-mix(in srgb, ${PAL.surf} 40%, transparent), ${PAL.surf} 38%, ${PAL.surf} 70%, color-mix(in srgb, ${PAL.surf} 60%, transparent))` }}>
        <div style={{ textAlign: "center", maxWidth: 460, animation: "sd-gir .5s var(--ke-ease-out) .08s both" }}>
          {damga && <div style={{ marginBottom: SP.l }}><Damga ton={V} egim={-6}>{damga}</Damga></div>}
          <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{baslik}</h2>
          {sub && <div style={{ margin: `${SP.s}px auto 0`, ...TYPE.ui, color: PAL.mut2 }}>{sub}</div>}
          {actions && <div style={{ display: "flex", gap: SP.m, justifyContent: "center", flexWrap: "wrap", marginTop: SP.l }}>{actions}</div>}
        </div>
      </div>
    </DefterYuzey>
  );
}

/* Yükleniyor — "kuruyan mürekkep" iskeleti: spinner yok; gerçek satır şeklinde kurşun kalem
   çizgileri (kayıt no + konu + ikincil satır) ve soldan sağa tek tarama. Sayfa düzeni
   yüklenince zıplamaz (aynı şablon, aynı satır adımı). */
export function DefterIskelet({ sablon, basliklar, satir = 6, etiket = "Kayıtlar yükleniyor" }) {
  return (
    <DefterYuzey sablon={sablon} basliklar={basliklar} etiket={etiket} style={{ position: "relative" }}>
      <span role="status" style={SR_ONLY}>{etiket}…</span>
      <div data-sd-iskelet="" aria-hidden="true">
        {Array.from({ length: satir }, (_, i) => (
          <div key={i} data-sd-bos-satir="" style={{ height: 64, gap: SP.xl, opacity: 1 - i * 0.1 }}>
            <span style={{ width: 72, height: 8, borderRadius: 3, background: PAL.line, flexShrink: 0 }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 0 }}>
              <span style={{ height: 8, width: `${[52, 64, 44, 58, 48, 60][i % 6]}%`, borderRadius: 3, background: PAL.line }} />
              <span style={{ height: 6, width: `${[34, 40, 28, 36, 30, 38][i % 6]}%`, borderRadius: 3, background: PAL.line, opacity: .7 }} />
            </span>
          </div>
        ))}
      </div>
    </DefterYuzey>
  );
}

/* Hata / çevrimdışı — defter sayfası yerinde, ne olduğunu ve ne yapılacağını söyler; teknik
   ayrıntı mono ve katlanır (<details>). Damga yok (hata bir hüküm değil, geçici durum). */
export function DefterHata({ sablon, basliklar, baslik = "Kayıtlar alınamadı", sub, ayrinti, onYenidenDene, ek }) {
  const cevrimdisi = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <BosDefter sablon={sablon} basliklar={basliklar} damga={null} satir={5}
      baslik={cevrimdisi ? "Bağlantı yok — defter çevrimdışı" : baslik}
      sub={<>
        {sub || (cevrimdisi ? "İnternet bağlantınız geri geldiğinde kayıtlar yeniden yüklenir." : "Sunucuya ulaşılamadı. Kayıtlar sunucuda güvende; bağlantı düzelince yeniden deneyin.")}
        {ayrinti && <details style={{ marginTop: SP.s }}><summary style={{ cursor: "pointer", ...TYPE.meta, color: PAL.mut2 }}>Teknik ayrıntı</summary>
          <code style={{ display: "block", marginTop: 4, fontFamily: MONO, fontSize: 11, color: PAL.mut2, overflowWrap: "anywhere" }}>{ayrinti}</code></details>}
      </>}
      actions={[onYenidenDene && <button key="r" type="button" onClick={onYenidenDene} data-sd-eylem="" data-press="" style={{ justifySelf: "center", borderColor: PAL.lineHi }}>Yeniden dene</button>, ek].filter(Boolean)} />
  );
}

/* Defter altı not — kart değil, solda ince cetvelli sessiz dipnot (sayfa altı açıklama). */
export const DefterNotu = ({ children, ikon, style }) => (
  <p style={{ display: "flex", gap: SP.m, alignItems: "flex-start", margin: `${SP.l}px 0 0`, padding: `${SP.xs}px 0 ${SP.xs}px ${SP.m}px`,
    borderLeft: `2px solid ${PAL.lineHi}`, ...TYPE.data, color: PAL.mut2, maxWidth: 860, ...style }}>
    {ikon && <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3, marginTop: 1 }}>{ikon}</span>}
    <span>{children}</span>
  </p>
);


/* ——— Klavye gezinmesi (j/k) + kayan seçim imleci ————————————————————————————
   j / k: sonraki / önceki kayıt — ANINDA (imleç yaysız atlar); fareyle seçimde imleç
   kısa bir yayla kayar (dosya sırtı layoutId deseni). Odak gerçekten satıra (ya da satırın
   ilk düğmesine) taşınır → Enter yerel davranışla açar, ekran okuyucu yeni kaydı okur.
   Çakışma kuralları: yazı alanında (input/textarea/select/contenteditable), değiştirici
   tuşla ya da açık bir diyalog (aria-modal) varken tuşlar YOK sayılır. */
const yaziAlani = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const ILERI = new Set(["j", "ArrowDown"]);
const GERI = new Set(["k", "ArrowUp"]);

/* secimTusu(anahtar): verilirse "x" aktif kaydı seçer/bırakır (Linear deseni). Ok tuşları
   yalnız odak defterin İÇİNDEYKEN çalışır (sayfa kaydırmasını gasp etmez); j/k globaldir. */
export function useDefterGezinme({ secimTusu } = {}) {
  const kokRef = useRef(null);
  const kaynak = useRef("fare");
  const [aktif, setAktif] = useState(null);
  const [duyuru, setDuyuru] = useState("");
  const satirlar = () => [...(kokRef.current?.querySelectorAll("[data-sicil-satir]") || [])];
  const odakla = useCallback((e) => {
    const row = e.target.closest?.("[data-sicil-satir]");
    if (row?.dataset.sdAnahtar) setAktif(row.dataset.sdAnahtar);
  }, []);
  useEffect(() => {
    const tus = (e) => {
      const ok = e.key === "ArrowDown" || e.key === "ArrowUp";
      const harf = e.key === "j" || e.key === "k" || e.key === "x";
      if (!ok && !harf) return;
      if (e.ctrlKey || e.metaKey || e.altKey || yaziAlani(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if (ok && !kokRef.current?.contains(document.activeElement)) return;
      const rows = satirlar();
      if (!rows.length) return;
      if (e.key === "x") {
        if (!secimTusu || !aktif) return;
        e.preventDefault();
        secimTusu(aktif);
        return;
      }
      e.preventDefault();
      const simdi = rows.findIndex((r) => r.dataset.sdAnahtar === aktif);
      const adim = ILERI.has(e.key) ? 1 : GERI.has(e.key) ? -1 : 0;
      const yeni = simdi < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, simdi + adim));
      const row = rows[yeni];
      kaynak.current = "klavye";
      setAktif(row.dataset.sdAnahtar);
      setDuyuru(`${yeni + 1}. kayıt / ${rows.length}${yeni === rows.length - 1 && adim > 0 && simdi === yeni ? " — son kayıt" : ""}`);
      const hedef = row.matches("[tabindex]") ? row : row.querySelector("button, [tabindex]") || row;
      hedef.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [aktif, secimTusu]);
  // Fareyle seçim: imleç yayla kayar. Satır div'inin onPointerDown'ına bağlanır.
  const sec = useCallback((anahtar) => { kaynak.current = "fare"; setAktif(anahtar); }, []);
  return { kokRef, aktif, odakla, kaynak, sec, duyuru };
}

/* Seçim imleci — satırın sol kenarında mürekkep çubuğu; satırlar arasında layoutId ile kayar.
   Klavyeyle anlık (duration 0), fareyle 150ms'lik sönümlü yay. */
export function Imlec({ gezinme, kimlik }) {
  const anlik = gezinme.kaynak.current === "klavye";
  return (
    <motion.span layoutId={`sd-imlec-${kimlik}`} aria-hidden="true"
      transition={anlik ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.6 }}
      style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 3px 3px 0", background: T, zIndex: 1 }} />
  );
}
