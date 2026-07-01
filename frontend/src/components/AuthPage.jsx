/* AuthPage — giriş / kayıt ekranı. Sol: marka paneli (editoryal başlık + "uçuşan kağıtlar"
   motifi — landing hero'nun görsel imzası, CSS-only + istatistik şeridi), sağ: kağıt-yüzeyli
   form kartı (üstte Giriş/Kayıt segmented tab). Backend auth API'sine useAuth ile bağlanır.
   a11y: <form> + <label> + autoComplete + focusRing + aria-live hata + aria-pressed tab. */
import React, { useEffect, useState } from "react";
import { PAL, T, V, R, SANS, MONO, Btn, NeonCard, focusRing, NEON_KEYFRAMES } from "./neonUi.jsx";
import { birimleriGetir } from "../lib/authApi.js";
import { useAuth } from "../lib/useAuth.jsx";

const STATS = [
  { n: "16", l: "ajanlı analiz" },
  { n: "233", l: "mevzuat kaynağı" },
  { n: "SHA-256", l: "denetim izi" },
];

// "Uçuşan kağıtlar" motifi — landing hero'daki fotoğrafın CSS-only karşılığı (ek asset yok).
// Sağ-üst kümede, kısmen panel kenarından taşan, farklı boy/açılı "kağıt" dikdörtgenleri.
const PAPERS = [
  { top: "4%", right: "22%", w: 78, h: 100, rot: -9, delay: 0 },
  { top: "-2%", right: "2%", w: 96, h: 124, rot: 7, delay: 70, lines: true },
  { top: "24%", right: "-4%", w: 72, h: 94, rot: 15, delay: 140 },
  { top: "30%", right: "34%", w: 88, h: 112, rot: -4, delay: 210, lines: true, dot: true },
];

function PaperMotif() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {PAPERS.map((p, i) => (
        <div key={i} style={{
          position: "absolute", top: p.top, right: p.right, width: p.w, height: p.h,
          background: "#fdfbf7", border: `1px solid ${PAL.line}`, borderRadius: 10,
          boxShadow: "0 14px 26px -16px rgba(35,26,18,.32)",
          transform: `rotate(${p.rot}deg)`, padding: "12px 11px",
          animation: "nu-rise-stag .5s cubic-bezier(.2,.8,.2,1) both", animationDelay: `${p.delay}ms`,
        }}>
          {p.lines && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <span style={{ display: "block", height: 2, width: "80%", background: PAL.line, borderRadius: 1 }} />
              <span style={{ display: "block", height: 2, width: "55%", background: PAL.line, borderRadius: 1 }} />
              <span style={{ display: "block", height: 2, width: "68%", background: PAL.line, borderRadius: 1 }} />
            </div>
          )}
          {p.dot && <span style={{ position: "absolute", bottom: 10, right: 10, width: 6, height: 6, borderRadius: "50%", background: R }} />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, type = "text", value, onChange, autoComplete, required, children, placeholder }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontFamily: MONO, fontSize: 10.5, letterSpacing: "1.4px", color: PAL.mut2, marginBottom: 6, textTransform: "uppercase" }}>{label}</span>
      {children || (
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} required={required} placeholder={placeholder}
          {...focusRing}
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11,
            background: PAL.surfHi, border: `1px solid ${PAL.line}`,
            color: PAL.ink, fontFamily: SANS, fontSize: 14, outline: "none", transition: "border-color .2s",
          }}
        />
      )}
    </label>
  );
}

// Segmented Giriş/Kayıt seçici — alt metin-link yerine üstte, kararlı bir tab deseni.
function ModeTabs({ mode, onChange }) {
  const items = [["giris", "Giriş"], ["kayit", "Kayıt"]];
  return (
    <div role="group" aria-label="Giriş veya kayıt seçin" style={{ display: "inline-flex", padding: 4, borderRadius: 12, background: PAL.bg2, border: `1px solid ${PAL.line}`, marginBottom: 24, gap: 2 }}>
      {items.map(([id, label]) => {
        const active = mode === id;
        return (
          <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={active} {...focusRing}
            style={{
              cursor: "pointer", padding: "8px 24px", borderRadius: 9, border: "none",
              fontFamily: SANS, fontSize: 13, fontWeight: 600,
              background: active ? "#ffffff" : "transparent", color: active ? PAL.ink : PAL.mut2,
              boxShadow: active ? "0 2px 8px -2px rgba(35,26,18,.2)" : "none",
              transition: "background .2s, color .2s, box-shadow .2s",
            }}>{label}</button>
        );
      })}
    </div>
  );
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("giris");           // "giris" | "kayit"
  const [form, setForm] = useState({ eposta: "", parola: "", ad_soyad: "", birim_kod: "", unvan: "" });
  const [birimler, setBirimler] = useState([]);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const kayit = mode === "kayit";
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changeMode = (id) => { setMode(id); setHata(""); };

  useEffect(() => {
    birimleriGetir().then((b) => {
      setBirimler(b);
      setForm((f) => (f.birim_kod ? f : { ...f, birim_kod: b[0]?.kod || "" }));
    }).catch(() => setBirimler([]));
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();   // Btn type="button" → onClick'ten de çağrılır (form submit etmez)
    setHata("");
    setBusy(true);
    try {
      if (kayit) {
        await register({ eposta: form.eposta, parola: form.parola, ad_soyad: form.ad_soyad, birim_kod: form.birim_kod, unvan: form.unvan });
      } else {
        await login(form.eposta, form.parola);
      }
      // başarı → AuthProvider status="auth" → Root dashboard'a geçer (unmount).
    } catch (err) {
      setHata(err.message || "Bir hata oluştu.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: PAL.bg, color: PAL.ink, fontFamily: SANS }}>
      <style>{NEON_KEYFRAMES}</style>

      {/* Sol — marka paneli (geniş ekran) */}
      <section aria-hidden="true" style={{
        flex: "1 1 0", minWidth: 0, position: "relative", overflow: "hidden", display: "none",
        padding: "56px 52px", flexDirection: "column", justifyContent: "space-between",
        background: `radial-gradient(700px 400px at 50% -10%, rgba(224,86,60,.07), transparent 60%), radial-gradient(900px 500px at 12% 8%, rgba(47,143,166,.14), transparent 60%), radial-gradient(800px 600px at 90% 100%, rgba(139,92,176,.14), transparent 55%), ${PAL.bg2}`,
        borderRight: `1px solid ${PAL.line}`,
      }} className="ke-brand">
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(35,26,18,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(35,26,18,.035) 1px,transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(700px 500px at 30% 30%, #000, transparent 75%)" }} />
        <PaperMotif />

        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <img src="/logo.png" alt="" width="46" height="46" style={{ borderRadius: 13, boxShadow: "0 6px 22px -8px rgba(47,143,166,.4)" }} />
          <span style={{ fontFamily: SANS, fontSize: 25, fontWeight: 700, letterSpacing: "-.02em", textTransform: "uppercase", backgroundImage: `linear-gradient(100deg, ${R} 0%, ${V} 48%, ${T} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>kamu-evrak</span>
        </div>

        <div style={{ position: "relative" }}>
          <h1 style={{ fontFamily: SANS, fontSize: 56, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-.03em", margin: "0 0 18px", maxWidth: 480, color: PAL.ink }}>
            Yığından imzaya.<br /><span style={{ color: T }}>Saniyeler</span> içinde.
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 15, color: PAL.mut, maxWidth: 420, lineHeight: 1.6, margin: "0 0 32px" }}>
            Kamu evrak ve yazışma süreçleri için yapay zekâ ajan destek sistemi. Oku, sınıflandır, mevzuat öner, resmî yazı üret — denetlenebilir biçimde.
          </p>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {STATS.map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <span aria-hidden="true" style={{ width: 1, alignSelf: "center", height: 34, background: PAL.line, margin: "0 22px" }} />}
                <div style={{ animation: "nu-rise-stag .45s ease-out both", animationDelay: `${300 + i * 90}ms` }}>
                  <div style={{ fontFamily: i === 2 ? MONO : SANS, fontSize: i === 2 ? 19 : 27, fontWeight: 700, color: PAL.ink, letterSpacing: "-.01em", lineHeight: 1 }}>{s.n}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, marginTop: 7, letterSpacing: ".3px", whiteSpace: "nowrap" }}>{s.l}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", fontFamily: MONO, fontSize: 10.5, color: PAL.mut3, letterSpacing: ".5px" }}>Güvenli · Denetlenebilir · Kurumsal yapay zekâ</div>
      </section>

      {/* Sağ — form */}
      <main style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 22px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <a href="/" {...focusRing} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, textDecoration: "none", marginBottom: 18, borderRadius: 6, padding: "2px 4px" }}>← Ana sayfa</a>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }} className="ke-formlogo">
            <img src="/logo.png" alt="" width="40" height="40" style={{ borderRadius: 12 }} />
            <span style={{ fontFamily: SANS, fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-.02em", color: T }}>kamu-evrak</span>
          </div>

          <NeonCard accent={T} style={{ padding: "30px 28px 28px" }}>
            <ModeTabs mode={mode} onChange={changeMode} />

            <h2 style={{ fontFamily: SANS, fontSize: 22, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-.01em", color: PAL.ink }}>
              {kayit ? "Hesap oluştur" : "Tekrar hoş geldiniz"}
            </h2>
            <p style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, margin: "0 0 22px" }}>
              {kayit ? "Birim hesabınızı oluşturup evrak akışına başlayın." : "Evrak çalışma alanınıza giriş yapın."}
            </p>

            <form onSubmit={submit} noValidate>
              {kayit && (
                <Field label="Ad Soyad" value={form.ad_soyad} onChange={set("ad_soyad")} autoComplete="name" required placeholder="Ayşe Yılmaz" />
              )}
              <Field label="E-posta" type="email" value={form.eposta} onChange={set("eposta")} autoComplete="email" required placeholder="ad.soyad@kurum.gov.tr" />
              {kayit && (
                <>
                  <Field label="Birim">
                    <select value={form.birim_kod} onChange={(e) => set("birim_kod")(e.target.value)} required {...focusRing}
                      style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, background: PAL.surfHi, border: `1px solid ${PAL.line}`, color: PAL.ink, fontFamily: SANS, fontSize: 14, outline: "none", cursor: "pointer" }}>
                      {birimler.length === 0 && <option value="">Yükleniyor…</option>}
                      {birimler.map((b) => <option key={b.kod} value={b.kod} style={{ background: "#ffffff" }}>{b.ad}</option>)}
                    </select>
                  </Field>
                  <Field label="Unvan (opsiyonel)" value={form.unvan} onChange={set("unvan")} autoComplete="organization-title" placeholder="Yazı İşleri Müdürü" />
                </>
              )}
              <Field label="Parola" type="password" value={form.parola} onChange={set("parola")} autoComplete={kayit ? "new-password" : "current-password"} required placeholder={kayit ? "En az 8 karakter" : "••••••••"} />

              {hata && (
                <div role="alert" aria-live="assertive" style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", marginBottom: 14, borderRadius: 10, background: "rgba(201,67,47,.08)", border: "1px solid rgba(201,67,47,.35)", color: "#a23425", fontFamily: SANS, fontSize: 12.5 }}>
                  <span aria-hidden="true">⚠</span><span>{hata}</span>
                </div>
              )}

              <Btn primary onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14, marginTop: 4 }}>
                {busy ? (kayit ? "Oluşturuluyor…" : "Giriş yapılıyor…") : (kayit ? "Hesap oluştur" : "Giriş yap")}
              </Btn>
            </form>
          </NeonCard>
        </div>
      </main>

      {/* Geniş ekranda marka panelini göster (≥920px) */}
      <style>{`@media(min-width:920px){.ke-brand{display:flex!important}.ke-formlogo{display:none!important}}`}</style>
    </div>
  );
}
