/* KomutPaleti — Ctrl+K komut paleti (cmdk, MIT). Görünüm geçişi + evrak yükleme + örnek
   evrak işleme tek arama kutusundan; memur klavyeden çıkmadan havale akışını başlatır.
   Scrim/dialog deseni MevzuatView okuma modalıyla birebir (rgba scrim + RAD.pop + SH.modal).
   NOT: cmdk headless'tır; grup başlığı ve seçili-satır durumu ancak [cmdk-*] öznitelik
   seçicileriyle stillenebilir → bileşene özel tek <style> bloğu (keyframes istisnasının
   üçüncü-parti eşdeğeri), renkler yine token'dan. */
import React, { useEffect } from "react";
import { Command } from "cmdk";
import { MONO, T, PAL, DERIN, ALFA, TYPE, SP, RAD, SH, Icon } from "./neonUi.jsx";

const CMDK_STYLE = `
[cmdk-group-heading]{font-family:inherit;font-size:12px;line-height:16px;letter-spacing:.32px;
  color:${PAL.mut3};font-weight:500;padding:10px 12px 4px}
[cmdk-item]{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:${RAD.ctl}px;
  font-size:14px;line-height:20px;color:${PAL.ink2};cursor:pointer}
[cmdk-item][data-selected="true"]{background:${ALFA(T)};color:${DERIN.T}}
[cmdk-item][data-disabled="true"]{color:${PAL.mut3};cursor:not-allowed}
[cmdk-empty]{padding:16px 12px;font-size:13px;line-height:18px;color:${PAL.mut2}}
`;

export default function KomutPaleti({ acik, onKapat, onNavigate, onUpload, samples = [], onPickSample, busy }) {
  // Palet açıkken arka plan kaydırmasını kilitle (modal disiplini).
  useEffect(() => {
    if (!acik) return undefined;
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = eski; };
  }, [acik]);

  if (!acik) return null;
  const sec = (eylem) => { onKapat(); eylem(); };
  const GORUNUMLER = [
    ["panel", "Panel", Icon.grid], ["gelen", "Gelen evrak", Icon.inbox], ["giden", "Giden evrak", Icon.arrow],
    ["isleniyor", "İşleniyor", Icon.spin], ["taslaklar", "Taslaklar", Icon.doc],
    ["mevzuat", "Mevzuat", Icon.book], ["denetim", "Denetim izi", Icon.shield],
  ];
  return (
    <div role="presentation" onClick={onKapat} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 24px 24px" }}>
      <style>{CMDK_STYLE}</style>
      <div role="dialog" aria-modal="true" aria-label="Komut paleti" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px,100%)", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, overflow: "hidden", animation: "nu-rise .16s ease-out" }}>
        <Command label="Komut paleti" style={{ fontFamily: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "4px 12px", borderBottom: `1px solid ${PAL.line}` }}>
            <span aria-hidden="true" style={{ display: "flex", color: PAL.mut }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </span>
            <Command.Input autoFocus placeholder="Görünüm, eylem ya da örnek evrak ara…"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "12px 0", ...TYPE.ui, color: PAL.ink, fontFamily: "inherit" }} />
            <kbd style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 6px" }}>Esc</kbd>
          </div>
          <Command.List style={{ maxHeight: 340, overflowY: "auto", padding: SP.s }}>
            <Command.Empty>Eşleşen komut yok.</Command.Empty>
            <Command.Group heading="Görünümler">
              {GORUNUMLER.map(([id, ad, Ic]) => (
                <Command.Item key={id} value={`gorunum ${ad}`} onSelect={() => sec(() => onNavigate(id))}>
                  <Ic width={15} height={15} /> {ad}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Eylemler">
              <Command.Item value="yeni evrak yukle dosya" onSelect={() => sec(onUpload)}>
                <Icon.upload width={15} height={15} /> Yeni evrak yükle
              </Command.Item>
            </Command.Group>
            {samples.length > 0 && (
              <Command.Group heading="Örnek evrak işle">
                {samples.map((s) => (
                  <Command.Item key={s.id} value={`isle ${s.label} ${s.aciklama || ""}`} disabled={busy}
                    onSelect={() => { if (!busy) sec(() => onPickSample(s)); }}>
                    <Icon.doc width={15} height={15} /> İşle: {s.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
