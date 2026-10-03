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
import { Damga, PAL, T, V, TYPE, TNUM, MONO, RAD, SP, DERIN_OF } from "./neonUi.jsx";

export const SICIL_CSS = `
@keyframes sd-gir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[data-sd-yuzey]{background:var(--ke-surf);border:1px solid var(--ke-line);border-radius:12px;box-shadow:var(--ke-sh-card);overflow:clip}
[data-sd-baslik],[data-sicil-satir]{display:grid;grid-template-columns:var(--sd-kolon);grid-template-areas:var(--sd-alan);column-gap:28px;align-items:center}
[data-sd-baslik]{padding:9px 20px 8px;border-bottom:1px solid var(--ke-line-hi);background:var(--ke-surf2)}
[data-sicil-satir]{position:relative;padding:12px 20px;border-top:1px solid var(--ke-line);cursor:pointer;
  transition:background .18s ease;animation:sd-gir .42s var(--ke-ease-out) both;animation-delay:calc(var(--sd-i,0) * 32ms + 60ms)}
[data-sicil-satir]:first-of-type{border-top:none}
[data-sicil-satir]::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;
  background:var(--ke-t);transform:scaleY(0);transform-origin:50% 50%;transition:transform .26s var(--ke-ease-out)}
[data-sicil-satir]:hover,[data-sicil-satir]:focus-within{background:var(--ke-hov)}
[data-sicil-satir]:hover::before,[data-sicil-satir]:focus-within::before,[data-sicil-satir][data-vurgu]::before{transform:scaleY(1)}
[data-sicil-satir][data-vurgu]{background:color-mix(in srgb, var(--ke-t) 7%, transparent)}
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
@media (max-width:640px){
  [data-sd-baslik],[data-sd-ipucu]{display:none}
  [data-sd-konu]{white-space:normal!important}
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

/* Sütun başlığı hücresi — antet dili (mono, izlemeli, büyük harf). */
export const BaslikHucre = ({ alan, sag, children }) => (
  <span style={{ gridArea: alan, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", textAlign: sag ? "right" : "left", whiteSpace: "nowrap" }}>{children}</span>
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

/* Defter yüzeyi — başlık satırı + satırlar. sablon: { kolon, alan, alanDar, kolonDar }. */
export function DefterYuzey({ sablon, basliklar, children, etiket, style, listeRef, gezinme, ipucu }) {
  const degisken = {
    "--sd-kolon": sablon.kolon, "--sd-alan": sablon.alan,
    "--sd-alan-dar": sablon.alanDar, ...(sablon.marj ? { "--sd-marj": sablon.marj } : null), ...(sablon.kolonDar ? { "--sd-kolon-dar": sablon.kolonDar } : null),
  };
  return (
    <section data-sd-yuzey="" aria-label={etiket} ref={gezinme?.kokRef} onFocus={gezinme?.odakla} style={{ ...degisken, ...style }}>
      {basliklar && <div data-sd-baslik="" aria-hidden="true">{basliklar}</div>}
      <div ref={listeRef} data-sd-liste="" style={{ display: "flex", flexDirection: "column" }}>{children}</div>
      {ipucu && (
        <div data-sd-ipucu="" aria-hidden="true">
          <span><kbd>j</kbd> <kbd>k</kbd> satırlar arası</span>
          <span><kbd>Enter</kbd> {ipucu}</span>
        </div>
      )}
    </section>
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
          <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{baslik}</h3>
          {sub && <p style={{ margin: `${SP.s}px auto 0`, ...TYPE.ui, color: PAL.mut2 }}>{sub}</p>}
          {actions && <div style={{ display: "flex", gap: SP.m, justifyContent: "center", flexWrap: "wrap", marginTop: SP.l }}>{actions}</div>}
        </div>
      </div>
    </DefterYuzey>
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

export function useDefterGezinme() {
  const kokRef = useRef(null);
  const kaynak = useRef("fare");
  const [aktif, setAktif] = useState(null);
  const satirlar = () => [...(kokRef.current?.querySelectorAll("[data-sicil-satir]") || [])];
  const odakla = useCallback((e) => {
    const row = e.target.closest?.("[data-sicil-satir]");
    if (row?.dataset.sdAnahtar) setAktif(row.dataset.sdAnahtar);
  }, []);
  useEffect(() => {
    const tus = (e) => {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.ctrlKey || e.metaKey || e.altKey || yaziAlani(e.target) || document.querySelector('[aria-modal="true"]')) return;
      const rows = satirlar();
      if (!rows.length) return;
      e.preventDefault();
      const simdi = rows.findIndex((r) => r.dataset.sdAnahtar === aktif);
      const yeni = simdi < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, simdi + (e.key === "j" ? 1 : -1)));
      const row = rows[yeni];
      kaynak.current = "klavye";
      setAktif(row.dataset.sdAnahtar);
      const hedef = row.matches("[tabindex]") ? row : row.querySelector("button, [tabindex]") || row;
      hedef.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [aktif]);
  // Fareyle seçim: imleç yayla kayar. Satır div'inin onPointerDown'ına bağlanır.
  const sec = useCallback((anahtar) => { kaynak.current = "fare"; setAktif(anahtar); }, []);
  return { kokRef, aktif, odakla, kaynak, sec };
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
