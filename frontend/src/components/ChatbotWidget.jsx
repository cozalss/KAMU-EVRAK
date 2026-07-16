/* ChatbotWidget — sağ altta yuvarlak FAB + Hero Light sohbet paneli.
   Backend POST /sohbet (auth'lu): niyet + araç (gelen/giden/taslak/işlem/panel/mevzuat) +
   yanıt; LLM yoksa deterministik fallback (kaynak rozetinde görünür). Kayıtlar yapısal
   kart olarak çizilir; oneri_gorunum "Görünüme git" butonuna bağlanır (onNavigate=goView).
   Geçmiş oturumluk (component state — DashboardApp ömrünce yaşar). Tema yalnız neonUi
   token'ları; z-index FAB 150 / panel 160 (Toast 200 üstte kalır).
   Spec: docs/09-sohbet-asistani.md */
import React, { useEffect, useRef, useState } from "react";
import { apiPost, authFetch } from "../lib/authApi.js";
import { BANT, MONO, PAL, T, V, DERIN, ALFA, TYPE, RAD, SP, SH, Icon, focusRing } from "./neonUi.jsx";

const GORUNUM_ETIKET = {
  gelen: "Gelen evrak", giden: "Giden evrak", taslaklar: "Taslaklar",
  mevzuat: "Mevzuat", denetim: "Denetim", panel: "Panel",
};
const ONERILER = [
  "Son gelen evraklar", "Reddedilen giden evraklar", "Kaç evrak işledik?",
  "Mevzuat kataloğu", "Son işlemin detayı", "Risk bandı nedir?",
];
const KARSILAMA = {
  rol: "asistan",
  icerik: "Merhaba! Ben **evrak asistanı**. Gelen/giden evraklarınızı listeleyebilir, " +
    "işlem geçmişinizi gösterebilir, mevzuat arayabilir ve sistemin işleyişini anlatabilirim.",
};

/* Hafif markdown: **kalın** + satır sonu + "• " madde satırı (kütüphanesiz, result-cards deseni). */
function Md({ text }) {
  return (text || "").split("\n").map((satir, i) => {
    const madde = satir.startsWith("• ");
    const icerik = (madde ? satir.slice(2) : satir).split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={j} style={{ fontWeight: 600, color: PAL.ink }}>{p.slice(2, -2)}</strong> : p);
    return madde
      ? <span key={i} style={{ display: "flex", gap: SP.s }}><span aria-hidden="true" style={{ color: DERIN.T }}>•</span><span style={{ minWidth: 0 }}>{icerik}</span></span>
      : <span key={i} style={{ display: "block" }}>{icerik}</span>;
  });
}

/* Tek kayıt kartı — tür-bilinçli alanlar (MONO yalnız makine-verisi meta satırı + risk noktası). */
function KayitKart({ tur, k }) {
  const ad = k.baslik || k.konu || k.name || k.evrak_no || k.giden_no || "kayıt";
  const risk = k.risk || k.bant;
  const satir2 = [
    tur === "gelen" && k.evrak_no,
    tur === "giden" && k.durum, tur === "giden" && k.alici_birim,
    tur === "islem" && k.evrak_turu, tur === "islem" && k.hedef_birim,
    tur === "taslak" && k.yazi_turu_kod,
    tur === "mevzuat" && (k.kanun_no || k.no) && `${k.kanun_no || k.no} sayılı`,
    tur === "mevzuat" && k.madde_no && `m. ${k.madde_no}`,
    tur === "mevzuat" && k.madde_sayisi && `${k.madde_sayisi} madde`,
    (k.olusturuldu || k.gonderim_tarihi || "").slice(0, 10),
  ].filter(Boolean);
  return (
    <div style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "8px 12px", display: "grid", gap: SP.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        {risk && BANT[risk] && <span title={BANT[risk].l} aria-label={`Risk: ${BANT[risk].l}`} style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[risk].c, flexShrink: 0 }} />}
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      </div>
      {satir2.length > 0 && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{satir2.join(" · ")}</span>}
      {tur === "mevzuat" && k.snippet && <span style={{ ...TYPE.meta, color: PAL.mut }}>{k.snippet}</span>}
    </div>
  );
}

/* Mevzuat kaynak çipi — asistan cevabının dayandığı madde; tıklanınca okuma modalı
   ilgili maddede açılır (DashboardApp köprüsü → MevzuatView.hedef). */
function KaynakCip({ kaynak, onMevzuatAc, onClose }) {
  const etiket = [kaynak.no && `${kaynak.no}`, kaynak.baslik, kaynak.madde_no != null && `m.${kaynak.madde_no}`]
    .filter(Boolean).join(" · ");
  return (
    <button type="button" {...focusRing} title={`${kaynak.baslik}: tam metni oku`}
      onClick={() => { onMevzuatAc?.({ dosya: kaynak.dosya, maddeNo: kaynak.madde_no ?? null }); onClose(); }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, maxWidth: "100%", ...TYPE.meta, fontWeight: 500, color: DERIN.V, background: ALFA(V), border: "none", borderRadius: RAD.chip, padding: "4px 10px", transition: "background .12s ease-out" }}>
      <Icon.book width={12} height={12} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiket}</span>
    </button>
  );
}

/* Mesaj balonu — kullanıcı sağda (T tint zemin), asistan solda (yüzey + hairline). */
function Balon({ m, onNavigate, onClose, onTeyit, onMevzuatAc, bekliyor }) {
  const kullanici = m.rol === "kullanici";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: kullanici ? "flex-end" : "flex-start", gap: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <div style={{
        maxWidth: "88%", padding: "8px 12px", borderRadius: RAD.pop, ...TYPE.ui,
        ...(kullanici
          ? { background: ALFA(T), color: PAL.ink, borderBottomRightRadius: RAD.chip }
          : { background: PAL.surf2, border: `1px solid ${PAL.line}`, color: PAL.ink2, borderBottomLeftRadius: RAD.chip }),
      }}>
        <Md text={m.icerik} />
      </div>
      {m.kayitlar?.length > 0 && (
        <div style={{ display: "grid", gap: SP.s, width: "88%" }}>
          {m.kayitlar.slice(0, 8).map((k, i) => <KayitKart key={i} tur={m.kayit_turu} k={k} />)}
        </div>
      )}
      {m.mevzuat_kaynaklari?.length > 0 && (
        <div role="group" aria-label="Cevabın mevzuat kaynakları" style={{ display: "flex", flexWrap: "wrap", gap: SP.s, maxWidth: "88%" }}>
          {m.mevzuat_kaynaklari.map((k, i) => (
            <KaynakCip key={`${k.dosya}-${k.madde_no ?? i}`} kaynak={k} onMevzuatAc={onMevzuatAc} onClose={onClose} />
          ))}
        </div>
      )}
      {m.onay_bekleyen && !m.onay_kullanildi && (
        <div style={{ display: "flex", gap: SP.s }}>
          {/* Başka bir mesaj akışta iken (bekliyor) devre dışı: aksi halde onTeyit balonu
              hemen "kullanıldı" işaretler ama gonder() kendi bekliyor kontrolünde isteği
              sessizce atlar — karar hiç gönderilmeden kaybolurdu (regresyon bulgusu). */}
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, true)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 500, color: PAL.onAccent, background: DERIN.T, border: "none", borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            <Icon.check /> Evet, uygula
          </button>
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, false)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, ...TYPE.data, fontWeight: 500, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            Vazgeç
          </button>
        </div>
      )}
      {m.oneri_gorunum && GORUNUM_ETIKET[m.oneri_gorunum] && (
        <button type="button" {...focusRing}
          onClick={() => { onNavigate?.(m.oneri_gorunum); onClose(); }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.data, fontWeight: 500, color: DERIN.T, background: ALFA(T), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          {GORUNUM_ETIKET[m.oneri_gorunum]} görünümüne git <Icon.arrow width={13} height={13} />
        </button>
      )}
      {m.hata && (
        <button type="button" {...focusRing} onClick={m.tekrar}
          style={{ cursor: "pointer", ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi, background: ALFA(BANT.kirmizi.c), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

function Yaziyor() {
  return (
    <div aria-label="Asistan yazıyor" role="status" style={{ display: "flex", gap: SP.xs, padding: "8px 12px", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop, width: "fit-content" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.mut3, animation: `nu-think 1.1s ${i * 0.18}s infinite` }} />
      ))}
    </div>
  );
}

export default function ChatbotWidget({ onNavigate, onMevzuatAc }) {
  const [acik, setAcik] = useState(false);
  // Kaydırma sırasında FAB küçülüp soluklaşır (satır eylemlerini örtmesin — jüri bulgusu);
  // durunca 500ms sonra geri gelir. capture:true iç scroll konteynerlerini de yakalar.
  const [kayiyor, setKayiyor] = useState(false);
  useEffect(() => {
    let t = null;
    const h = () => {
      setKayiyor(true);
      clearTimeout(t);
      t = setTimeout(() => setKayiyor(false), 500);
    };
    document.addEventListener("scroll", h, { capture: true, passive: true });
    return () => { document.removeEventListener("scroll", h, { capture: true }); clearTimeout(t); };
  }, []);
  const [mesajlar, setMesajlar] = useState([KARSILAMA]);
  const [girdi, setGirdi] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [kaynak, setKaynak] = useState(null);   // son yanıtın kaynağı (llm|fallback) — şeffaflık
  const fabRef = useRef(null);
  const inputRef = useRef(null);
  const listeRef = useRef(null);

  // Yeni mesaj/durumda en alta kay (kullanıcı son cevabı görsün).
  useEffect(() => {
    if (listeRef.current) listeRef.current.scrollTop = listeRef.current.scrollHeight;
  }, [mesajlar, bekliyor, acik]);
  useEffect(() => { if (acik) inputRef.current?.focus(); }, [acik]);

  const kapat = () => { setAcik(false); fabRef.current?.focus(); };

  // Son (akan) asistan balonunu fonksiyonel güncelle — akış sırasında state yarışı olmaz.
  const sonuGuncelle = (fn) => setMesajlar((ms) => {
    const s = ms.slice();
    s[s.length - 1] = fn(s[s.length - 1]);
    return s;
  });

  // SSE gövdesini işle: meta (kayıtlar/onay) → delta (token) → done (kaynak + tam yanıt).
  const akisiOku = async (res) => {
    setMesajlar((ms) => [...ms, { rol: "asistan", icerik: "", akiyor: true }]);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const satir = buf.slice(0, i).split("\n").find((l) => l.startsWith("data:"));
        buf = buf.slice(i + 2);
        if (!satir) continue;
        let ev;
        try { ev = JSON.parse(satir.slice(5)); } catch { continue; }
        if (ev.event === "meta") {
          sonuGuncelle((son) => ({ ...son, kayitlar: ev.kayitlar, kayit_turu: ev.kayit_turu, oneri_gorunum: ev.oneri_gorunum, onay_bekleyen: ev.onay_bekleyen, mevzuat_kaynaklari: ev.mevzuat_kaynaklari }));
        } else if (ev.event === "delta" && ev.t) {
          sonuGuncelle((son) => ({ ...son, icerik: (son.icerik || "") + ev.t }));
        } else if (ev.event === "done") {
          setKaynak(ev.kaynak);
          sonuGuncelle((son) => ({ ...son, icerik: ev.yanit || son.icerik, akiyor: false }));
        }
      }
    }
    sonuGuncelle((son) => ({ ...son, akiyor: false }));
  };

  const gonder = async (metin, onayBaglam = null) => {
    const mesaj = (metin ?? girdi).trim();
    if (!mesaj || bekliyor) return;
    setGirdi("");
    setBekliyor(true);
    // gecmis: karşılama + hata balonları hariç son 8 gerçek tur.
    const gecmis = mesajlar
      .filter((m) => m !== KARSILAMA && !m.hata)
      .slice(-8)
      .map((m) => ({ rol: m.rol, icerik: m.icerik.slice(0, 4000) }));
    const govde = { mesaj, gecmis, ...(onayBaglam ? { onay_baglam: onayBaglam } : {}) };
    setMesajlar((ms) => [...ms, { rol: "kullanici", icerik: mesaj }]);
    try {
      // Birincil: SSE akışı (token-token). Başarısızsa aşağıda düz POST'a düşülür.
      const res = await authFetch("/sohbet/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde),
      });
      if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
      await akisiOku(res);
    } catch {
      try {
        const y = await apiPost("/sohbet", govde);
        setKaynak(y.kaynak);
        const msg = { rol: "asistan", icerik: y.yanit, kayitlar: y.kayitlar, kayit_turu: y.kayit_turu, oneri_gorunum: y.oneri_gorunum, onay_bekleyen: y.onay_bekleyen, mevzuat_kaynaklari: y.mevzuat_kaynaklari };
        setMesajlar((ms) => {
          const s = ms.slice();
          const son = s[s.length - 1];
          // Akış yarıda kesildiyse boş yer tutucunun üzerine yaz; yoksa yeni balon ekle.
          if (son?.rol === "asistan" && son.akiyor && !son.icerik) s[s.length - 1] = msg;
          else s.push(msg);
          return s;
        });
      } catch (err2) {
        setMesajlar((ms) => [...ms, {
          rol: "asistan", hata: true, tekrar: () => gonder(mesaj, onayBaglam),
          icerik: `Yanıt alınamadı: ${err2.message || "bağlantı hatası"}`,
        }]);
      }
    } finally {
      setBekliyor(false);
    }
  };

  // HITL teyit butonları — bağlamı geri göndererek eylemi uygula/iptal et.
  const onTeyit = (m, evet) => {
    setMesajlar((ms) => ms.map((x) => (x === m ? { ...x, onay_kullanildi: true } : x)));
    gonder(evet ? "evet" : "vazgeç", m.onay_bekleyen);
  };

  const ilkAcilis = mesajlar.length <= 1;
  const gonderPasif = bekliyor || !girdi.trim();

  return (
    <>
      {acik && (
        <section role="dialog" aria-label="Evrak asistanı sohbeti"
          onKeyDown={(e) => { if (e.key === "Escape") kapat(); }}
          style={{
            position: "fixed", right: SP.xl, bottom: 96, zIndex: 160,
            width: "min(384px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 130px))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop,
            boxShadow: SH.modal,
            animation: "nu-rise .16s var(--ke-ease-out) both",
          }}>
          {/* Başlık */}
          <header style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", background: PAL.surf, borderBottom: `1px solid ${PAL.line}` }}>
            <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RAD.dot, display: "grid", placeItems: "center", background: DERIN.T, color: PAL.onAccent, flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8.5 8.5 H15.5 M8.5 11.5 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Evrak asistanı</div>
              <div style={{ ...TYPE.meta, color: PAL.mut2 }}>
                evrak sorgula · mevzuat ara · site rehberi
                {kaynak && <span style={{ marginLeft: SP.s, color: kaynak === "llm" ? DERIN.T : PAL.mut3 }}>[{kaynak === "llm" ? "canlı model" : "kural tabanlı"}]</span>}
              </div>
            </div>
            <button type="button" aria-label="Sohbeti kapat" onClick={kapat} {...focusRing}
              style={{ cursor: "pointer", width: 30, height: 30, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "none", color: PAL.mut, display: "grid", placeItems: "center", padding: 0 }}>
              <Icon.x />
            </button>
          </header>

          {/* Mesajlar */}
          <div ref={listeRef} role="log" aria-live="polite" aria-atomic="false" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: SP.m }}>
            {mesajlar.map((m, i) => <Balon key={i} m={m} onNavigate={onNavigate} onClose={kapat} onTeyit={onTeyit} onMevzuatAc={onMevzuatAc} bekliyor={bekliyor} />)}
            {bekliyor && mesajlar[mesajlar.length - 1]?.rol === "kullanici" && <Yaziyor />}
            {ilkAcilis && !bekliyor && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: SP.xs }}>
                {ONERILER.map((o) => (
                  <button key={o} type="button" {...focusRing} onClick={() => gonder(o)}
                    style={{ cursor: "pointer", ...TYPE.meta, fontWeight: 500, color: PAL.ink2, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.chip, padding: "4px 12px", transition: "background .12s ease-out" }}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Giriş */}
          <form onSubmit={(e) => { e.preventDefault(); gonder(); }}
            style={{ display: "flex", gap: SP.s, padding: SP.m, borderTop: `1px solid ${PAL.line}`, background: PAL.surf }}>
            <input ref={inputRef} type="text" value={girdi} onChange={(e) => setGirdi(e.target.value)}
              placeholder="Evrak sorun, mevzuat arayın…" aria-label="Asistana mesaj yaz"
              maxLength={1000} {...focusRing}
              style={{ flex: 1, minWidth: 0, ...TYPE.ui, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", outline: "none" }} />
            <button type="submit" aria-label="Mesajı gönder" disabled={gonderPasif} {...focusRing}
              style={{
                cursor: gonderPasif ? "not-allowed" : "pointer", width: 40, height: 36, borderRadius: RAD.ctl, border: "none",
                background: gonderPasif ? PAL.press : DERIN.T,
                color: gonderPasif ? PAL.mut2 : PAL.onAccent, display: "grid", placeItems: "center", flexShrink: 0,
                transition: "background .12s ease-out",
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12 L20 4 L14 20 L11.5 13.5 L4 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            </button>
          </form>
        </section>
      )}

      {/* FAB — her görünümde sağ altta */}
      <button ref={fabRef} type="button" onClick={() => (acik ? kapat() : setAcik(true))}
        aria-label={acik ? "Evrak asistanını kapat" : "Evrak asistanını aç"} aria-expanded={acik} {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = DERIN.Th; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = DERIN.T; }}
        style={{
          position: "fixed", right: SP.xl, bottom: SP.xl, zIndex: 150, width: 58, height: 58,
          borderRadius: RAD.dot, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          background: DERIN.T, color: PAL.onAccent,
          boxShadow: SH.pop,
          // Kaydırma sırasında küçül+soluklaş: liste eylemlerinin üstünü örtmesin (panel
          // açıkken davranış devre dışı — konuşma sürerken FAB sabit kalır).
          opacity: kayiyor && !acik ? 0.3 : 1,
          transform: kayiyor && !acik ? "scale(.72)" : "scale(1)",
          transformOrigin: "bottom right",
          transition: "background .12s ease-out, opacity .2s ease, transform .25s var(--ke-ease-out)",
        }}>
        {acik ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="9" cy="9.5" r="1" fill="currentColor" /><circle cx="12.5" cy="9.5" r="1" fill="currentColor" /><circle cx="16" cy="9.5" r="1" fill="currentColor" /></svg>
        )}
      </button>
    </>
  );
}
