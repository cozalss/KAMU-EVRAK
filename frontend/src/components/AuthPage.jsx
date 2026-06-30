/* AuthPage — neon giriş / kayıt ekranı. Sol: marka paneli (atmosfer + değer önerisi),
   sağ: form kartı (giriş ⇄ kayıt geçişi). Backend auth API'sine useAuth ile bağlanır.
   a11y: <form> + <label> + autoComplete + focusRing + aria-live hata. Neon token'lar. */
import React, { useEffect, useState } from "react";
import { PAL, T, V, SANS, MONO, Btn, focusRing, NEON_KEYFRAMES } from "./neonUi.jsx";
import { birimleriGetir } from "../lib/authApi.js";
import { useAuth } from "../lib/useAuth.jsx";

const DEGERLER = [
  ["16 ajanlı analiz", "Sınıflandırma · çıkarım · mevzuat · yazı taslağı — tek akış"],
  ["233 mevzuat / 1506 madde", "Gerçek korpus üzerinde hibrit arama (BM25 + bulanık)"],
  ["Değiştirilemez denetim izi", "SHA-256 hash-zinciri — Sayıştay/KVKK uyumlu"],
];

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
            background: "rgba(255,255,255,.04)", border: `1px solid ${PAL.line}`,
            color: PAL.ink, fontFamily: SANS, fontSize: 14, outline: "none", transition: "border-color .2s",
          }}
        />
      )}
    </label>
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
        background: `radial-gradient(900px 500px at 12% 8%, rgba(46,230,201,.16), transparent 60%), radial-gradient(800px 600px at 90% 100%, rgba(183,148,255,.16), transparent 55%), ${PAL.bg2}`,
        borderRight: `1px solid ${PAL.line}`,
      }} className="ke-brand">
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(700px 500px at 30% 30%, #000, transparent 75%)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <img src="/logo.png" alt="" width="46" height="46" style={{ borderRadius: 13, boxShadow: "0 6px 26px -8px rgba(46,230,201,.55)" }} />
          <span style={{ fontFamily: SANS, fontSize: 25, fontWeight: 700, letterSpacing: "-.02em", textTransform: "uppercase", backgroundImage: "linear-gradient(100deg,#67e8e0,#2ee6c9 34%,#7cb4ff 70%,#b794ff)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>kamu-evrak</span>
        </div>

        <div style={{ position: "relative" }}>
          <h1 style={{ fontFamily: SANS, fontSize: 40, lineHeight: 1.08, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 14px", maxWidth: 460, color: PAL.ink }}>
            Yığından imzaya.<br /><span style={{ color: T }}>Saniyeler</span> içinde.
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 15, color: PAL.mut, maxWidth: 430, lineHeight: 1.6, margin: "0 0 30px" }}>
            Kamu evrak ve yazışma süreçleri için yapay zekâ ajan destek sistemi. Oku, sınıflandır, mevzuat öner, resmî yazı üret — denetlenebilir biçimde.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
            {DEGERLER.map(([b, a], i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", animation: "nu-rise-stag .4s ease-out both", animationDelay: `${i * 90}ms` }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, marginTop: 1, display: "grid", placeItems: "center", color: T, background: "rgba(46,230,201,.12)", border: "1px solid rgba(46,230,201,.3)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span><span style={{ display: "block", fontSize: 14, fontWeight: 600, color: PAL.ink2 }}>{b}</span><span style={{ display: "block", fontFamily: MONO, fontSize: 11, color: PAL.mut3, marginTop: 2 }}>{a}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ position: "relative", fontFamily: MONO, fontSize: 10.5, color: PAL.mut3, letterSpacing: ".5px" }}>TEKNOFEST 2026 · Yapay Zekâ Dil Ajanları · 1. Senaryo</div>
      </section>

      {/* Sağ — form */}
      <main style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 22px" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          {/* Odak halkası: global :focus-visible (kamu-evrak.css) kapsar — focusRing gereksiz. */}
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, textDecoration: "none", marginBottom: 18, borderRadius: 6, padding: "2px 4px" }}>← Ana sayfa</a>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }} className="ke-formlogo">
            <img src="/logo.png" alt="" width="40" height="40" style={{ borderRadius: 12 }} />
            <span style={{ fontFamily: SANS, fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-.02em", color: T }}>kamu-evrak</span>
          </div>

          <h2 style={{ fontFamily: SANS, fontSize: 23, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-.01em", color: PAL.ink }}>
            {kayit ? "Hesap oluştur" : "Tekrar hoş geldiniz"}
          </h2>
          <p style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, margin: "0 0 24px" }}>
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
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, background: "rgba(255,255,255,.04)", border: `1px solid ${PAL.line}`, color: PAL.ink, fontFamily: SANS, fontSize: 14, outline: "none", cursor: "pointer" }}>
                    {birimler.length === 0 && <option value="">Yükleniyor…</option>}
                    {birimler.map((b) => <option key={b.kod} value={b.kod} style={{ background: PAL.bg2 }}>{b.ad}</option>)}
                  </select>
                </Field>
                <Field label="Unvan (opsiyonel)" value={form.unvan} onChange={set("unvan")} autoComplete="organization-title" placeholder="Yazı İşleri Müdürü" />
              </>
            )}
            <Field label="Parola" type="password" value={form.parola} onChange={set("parola")} autoComplete={kayit ? "new-password" : "current-password"} required placeholder={kayit ? "En az 8 karakter" : "••••••••"} />

            {hata && (
              <div role="alert" aria-live="assertive" style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", marginBottom: 14, borderRadius: 10, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.4)", color: "#fca5a5", fontFamily: SANS, fontSize: 12.5 }}>
                <span aria-hidden="true">⚠</span><span>{hata}</span>
              </div>
            )}

            <Btn primary onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14, marginTop: 4 }}>
              {busy ? (kayit ? "Oluşturuluyor…" : "Giriş yapılıyor…") : (kayit ? "Hesap oluştur" : "Giriş yap")}
            </Btn>
          </form>

          <p style={{ textAlign: "center", marginTop: 22, fontFamily: SANS, fontSize: 13, color: PAL.mut }}>
            {kayit ? "Zaten hesabınız var mı? " : "Hesabınız yok mu? "}
            <button type="button" onClick={() => { setMode(kayit ? "giris" : "kayit"); setHata(""); }} {...focusRing}
              style={{ background: "none", border: "none", color: T, fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "2px 4px", borderRadius: 6 }}>
              {kayit ? "Giriş yapın" : "Kayıt olun"}
            </button>
          </p>
        </div>
      </main>

      {/* Geniş ekranda marka panelini göster (≥920px) */}
      <style>{`@media(min-width:920px){.ke-brand{display:flex!important}.ke-formlogo{display:none!important}}`}</style>
    </div>
  );
}
