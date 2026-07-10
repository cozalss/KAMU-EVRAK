/* MevzuatOkuma — mevzuatın tam metnini gösteren okuma modalı ("kağıt") + metin ayrıştırma.
   Ayrı dosya: hem MevzuatView (katalog/oturum önerileri) hem DashboardApp (global overlay —
   ayrıntılı sonuç ekranı + sohbet çipi) AYNI modalı kullansın; kod tek yerde dursun.
   Kaynak: /mevzuat/icerik/{dosya} (backend beyaz-listeli dosya adı). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Btn, MONO, V, PAL, DERIN, ALFA, TYPE, RAD, SP, SH, focusRing } from "./neonUi.jsx";

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

/* Okuma modalındaki tek madde bloğu — hedef madde lavanta şeritle vurgulanır. */
function MaddeBlok({ blok, vurgulu, anchorRef }) {
  if (blok.no === null) {
    return <p style={{ margin: "0 0 16px", ...TYPE.data, color: PAL.mut2, whiteSpace: "pre-wrap" }}>{blok.govde}</p>;
  }
  return (
    <section ref={vurgulu ? anchorRef : undefined}
      style={{ margin: "0 0 16px", scrollMarginTop: 8, ...(vurgulu ? { padding: "8px 12px", borderLeft: `2px solid ${V}`, background: ALFA(V), borderRadius: RAD.card } : {}) }}>
      <h3 style={{ margin: "0 0 6px", ...TYPE.ui, fontWeight: 600, color: vurgulu ? DERIN.V : PAL.ink }}>
        {blok.baslik}
        {vurgulu && <span style={{ marginLeft: SP.s, ...TYPE.meta, color: PAL.mut, verticalAlign: "middle" }}>Önerilen</span>}
      </h3>
      <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{blok.govde}</p>
    </section>
  );
}

const ICERIK_CACHE = new Map(); // dosya → içerik yanıtı (modal her açılışta yeniden inmesin)

/* Okuma modalı — ortada dar panel, arka plan blurlanır; yalnız seçilen mevzuat okunur.
   Esc / dış tıklama / kapat düğmesi kapatır; açılışta odak kapat butonuna, gövde kaydırması kilitlenir.
   view'dan BAĞIMSIZ: nerede render edilirse edilsin (Mevzuat sayfası VEYA ayrıntılı sonuç
   ekranı üstünde global overlay) aynı davranır. */
export function OkumaModal({ dosya, maddeNo, maddeTur = "madde", onClose }) {
  const [icerik, setIcerik] = useState(ICERIK_CACHE.get(dosya) || null); // null=yükleniyor, "hata", {...}
  const [deneme, setDeneme] = useState(0);
  const closeRef = useRef(null);
  const maddeRef = useRef(null);

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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // arka sayfa kaydırması kilitli — yalnız mevzuat okunur
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = eski; };
  }, [onClose]);

  const bloklar = useMemo(() => (icerik && icerik !== "hata" ? maddeAyir(icerik.metin) : []), [icerik]);
  // Hedef maddeye kaydır. rAF: içerik cache'liyken bloklar ilk render'da hazır olur ama modal
  // scroll konteyneri henüz layout almadan scrollIntoView boşa gider → bir tick ertele.
  useEffect(() => {
    if (!bloklar.length || maddeNo == null) return undefined;
    const id = requestAnimationFrame(() => maddeRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [bloklar, maddeNo]);

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mevzuat-okuma-h" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(760px,100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, overflow: "hidden", animation: "nu-rise .16s ease-out" }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.m, padding: "16px 24px 12px", borderBottom: `1px solid ${PAL.line}`, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.book /></span>
              {icerik && icerik !== "hata" && icerik.no && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: DERIN.T }}>{icerik.no}</span>}
              <h2 id="mevzuat-okuma-h" style={{ margin: 0, ...TYPE.read, fontWeight: 600, color: PAL.ink }}>
                {icerik === null ? "Mevzuat yükleniyor…" : icerik === "hata" ? "Mevzuat açılamadı" : icerik.baslik}
              </h2>
            </div>
            {icerik && icerik !== "hata" && icerik.kunye && (
              <p style={{ margin: "4px 0 0", ...TYPE.meta, color: PAL.mut2 }}>{icerik.kunye}</p>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Okuma panelini kapat" {...focusRing}
            style={{ cursor: "pointer", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.hov, color: PAL.ink2, flexShrink: 0, transition: "background .12s ease-out" }}><Icon.x /></button>
        </header>
        <div style={{ overflowY: "auto", padding: "16px 24px 24px" }}>
          {icerik === null && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2, padding: "16px 0" }}>
              <Icon.spin /> Tam metin yükleniyor…
            </div>
          )}
          {icerik === "hata" && (
            <div role="alert" style={{ ...TYPE.data, color: PAL.ink2, padding: "8px 0" }}>
              Tam metin alınamadı — backend çalışıyor mu?
              <div style={{ marginTop: SP.m }}><Btn onClick={() => setDeneme((n) => n + 1)}>Tekrar dene</Btn></div>
            </div>
          )}
          {bloklar.map((b, i) => <MaddeBlok key={i} blok={b} vurgulu={maddeNo != null && b.no === maddeNo && b.tur === maddeTur} anchorRef={maddeRef} />)}
        </div>
      </div>
    </div>
  );
}
