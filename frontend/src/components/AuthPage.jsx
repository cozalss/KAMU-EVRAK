/* AuthPage — giriş / kayıt ekranı. Sol: marka paneli (düz zemin + editoryal başlık +
   istatistik şeridi), sağ: kağıt-yüzeyli form kartı (üstte Giriş/Kayıt segmented tab).
   Backend auth API'sine useAuth ile bağlanır.
   a11y: <form> + <label> + autoComplete + focusRing + aria-live hata + aria-pressed tab. */
import React, { useEffect, useState } from "react";
import { PAL, T, R, SANS, TYPE, RAD, SP, SH, DERIN, ALFA, BANT, Btn, Icon, focusRing, NEON_KEYFRAMES } from "./neonUi.jsx";
import { birimleriGetir } from "../lib/authApi.js";
import { useAuth } from "../lib/useAuth.jsx";
import AjanSahnesi from "./AjanSahnesi.jsx";

const STATS = [
  { n: "16", l: "ajanlı analiz" },
  { n: "233", l: "mevzuat kaynağı" },
  { n: "SHA-256", l: "denetim izi" },
];

// Sol panel atmosferi — düz bg2 yerine dokulu, sakin bir zemin. Gradyan/glow DEĞİL; mevcut
// nokta-doku diliyle (CanliAjanAkisi belge zemini) tutarlı, token'dan türetilir.
//  1) blueprint nokta-grid: kenarlarda belirir, merkezde içeriğin arkasında radyal MASKE ile
//     silinir → kompozisyonu çerçeveler, metnin arkasını kalabalıklaştırmaz.
//  2) çok hafif kağıt grain: dokunsal "resmî kağıt" hissi (fractalNoise, %5 multiply).
// aria-hidden + pointer-events:none, z0; içerik z1'e kaldırılır.
const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
const NOKTA_MASKE = "radial-gradient(115% 82% at 50% 44%, transparent 33%, #000 82%)";

function PanelAtmosfer() {
  return (
    <>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(color-mix(in srgb, ${T} 24%, transparent) 1px, transparent 1.7px)`,
        backgroundSize: "26px 26px",
        WebkitMaskImage: NOKTA_MASKE, maskImage: NOKTA_MASKE,
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `url("${GRAIN}")`, backgroundSize: "140px 140px",
        opacity: 0.05, mixBlendMode: "multiply",
      }} />
    </>
  );
}

// Marka yazısı — düz ink metin + kelime sonunda 6px düz R nokta (tek imza dokunuşu).
function Marka() {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: SP.xs }}>
      <span style={{ ...TYPE.h2, color: PAL.ink }}>kamu-evrak</span>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: R, flexShrink: 0 }} />
    </span>
  );
}

function toTitleCaseTurkish(str) {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => {
      if (!word) return "";
      const firstChar = word.charAt(0);
      const rest = word.slice(1);
      let upperFirst;
      if (firstChar === "i") {
        upperFirst = "İ";
      } else if (firstChar === "ı") {
        upperFirst = "I";
      } else {
        upperFirst = firstChar.toLocaleUpperCase("tr-TR");
      }
      return upperFirst + rest.toLocaleLowerCase("tr-TR");
    })
    .join(" ");
}

function Field({ label, type = "text", value, onChange, onBlur, autoComplete, required, children, placeholder }) {
  return (
    <label style={{ display: "block", marginBottom: SP.m }}>
      <span style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>{label}</span>
      {children || (
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
          autoComplete={autoComplete} required={required} placeholder={placeholder}
          {...focusRing}
          style={{
            width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: RAD.ctl,
            background: PAL.surf, border: `1px solid ${PAL.inputLine}`,
            color: PAL.ink, ...TYPE.ui, outline: "none", transition: "border-color .15s ease-out",
          }}
        />
      )}
    </label>
  );
}

// Göz ikonları — parola görünürlük düğmesi (neonUi ikon setinde yok, yerel). Gizli durumda
// soluk göz + eğik çizgi ("kapalı"); görünür durumda net göz + gözbebeği.
const GozIkon = {
  ac: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  kapa: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity=".5" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
      <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

// Parola alanı — Field ile aynı görünüm + sağ içinde parolayı göster/gizle göz düğmesi.
// Kendi göster state'i vardır (her örnek bağımsız). a11y: aria-pressed + aria-label; düğme
// odağı almaz (mousedown preventDefault) → input imleci/odacı korunur.
function ParolaField({ label, value, onChange, autoComplete, placeholder }) {
  const [goster, setGoster] = useState(false);
  return (
    <label style={{ display: "block", marginBottom: SP.m }}>
      <span style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>{label}</span>
      <span style={{ position: "relative", display: "block" }}>
        <input
          type={goster ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} required placeholder={placeholder}
          {...focusRing}
          style={{
            width: "100%", boxSizing: "border-box", padding: "8px 42px 8px 12px", borderRadius: RAD.ctl,
            background: PAL.surf, border: `1px solid ${PAL.inputLine}`,
            color: PAL.ink, ...TYPE.ui, outline: "none", transition: "border-color .15s ease-out",
          }}
        />
        <button type="button" onClick={() => setGoster((g) => !g)} onMouseDown={(e) => e.preventDefault()}
          aria-label={goster ? "Parolayı gizle" : "Parolayı göster"} aria-pressed={goster}
          title={goster ? "Parolayı gizle" : "Parolayı göster"} {...focusRing}
          onMouseEnter={(e) => { e.currentTarget.style.color = PAL.ink2; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = PAL.mut2; }}
          style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, border: "none", background: "transparent", color: PAL.mut2, cursor: "pointer", borderRadius: RAD.ctl, transition: "color .12s ease-out" }}>
          {goster ? <GozIkon.kapa /> : <GozIkon.ac />}
        </button>
      </span>
    </label>
  );
}

// Segmented Giriş/Kayıt seçici — alt metin-link yerine üstte, kararlı bir tab deseni.
function ModeTabs({ mode, onChange }) {
  const items = [["giris", "Giriş"], ["kayit", "Kayıt"]];
  return (
    <div role="group" aria-label="Giriş veya kayıt seçin" style={{ display: "inline-flex", padding: SP.xs, borderRadius: RAD.ctl, background: PAL.bg2, border: `1px solid ${PAL.line}`, marginBottom: SP.xl, gap: SP.xs }}>
      {items.map(([id, label]) => {
        const active = mode === id;
        return (
          <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={active} {...focusRing}
            style={{
              cursor: "pointer", padding: "8px 24px", borderRadius: RAD.chip,
              border: `1px solid ${active ? PAL.line : "transparent"}`,
              ...TYPE.ui, fontWeight: 500,
              background: active ? PAL.surf : "transparent", color: active ? PAL.ink : PAL.mut2,
              boxShadow: active ? SH.card : "none",
              transition: "background .15s ease-out, color .15s ease-out",
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
  const [sifreNot, setSifreNot] = useState(false);     // "şifremi unuttum" yönlendirme notu açık mı
  const kayit = mode === "kayit";
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changeMode = (id) => { setMode(id); setHata(""); setSifreNot(false); };

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
        const formattedAdSoyad = toTitleCaseTurkish(form.ad_soyad).trim();
        const formattedUnvan = toTitleCaseTurkish(form.unvan).trim();
        await register({ eposta: form.eposta, parola: form.parola, ad_soyad: formattedAdSoyad, birim_kod: form.birim_kod, unvan: formattedUnvan });
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
    <div className="ke-auth-root" style={{ display: "flex", background: PAL.bg, color: PAL.ink, fontFamily: SANS }}>
      <style>{NEON_KEYFRAMES}</style>

      {/* Sol — showcase (IG konsepti uyarlaması): amblem sol-üstte, ORTADA başlık + hero olarak
          canlı işlem akışı (IG'deki fotoğraf kolajının yerine), altta stat şeridi. Koyu/gradyan/
          fotoğraf DEĞİL — Hero Light v2 disipliniyle render edilir; grid auto·1fr·auto. */}
      <section aria-hidden="true" style={{
        flex: "1 1 0", minWidth: 0, position: "relative", overflow: "hidden", display: "none",
        padding: SP.xxxl, gridTemplateRows: "auto 1fr auto", gap: SP.xl,
        background: PAL.bg2, borderRight: `1px solid ${PAL.line}`,
      }} className="ke-show">
        <PanelAtmosfer />
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: SP.m }}>
          <img src="/logo.png" alt="" width="46" height="46" style={{ borderRadius: RAD.card }} />
          <Marka />
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 0 }}>
          <h1 style={{ ...TYPE.h1, maxWidth: 520, margin: `0 0 ${SP.m}px`, color: PAL.ink, textWrap: "balance" }}>
            Gelen evrakı okur, <span style={{ color: DERIN.T }}>resmî yazıyı</span> yazar.
          </h1>
          <p style={{ ...TYPE.read, color: PAL.mut, maxWidth: 480, margin: `0 0 ${SP.xxl}px`, textWrap: "balance" }}>
            16 uzman ajan evrakı okur, sınıflandırır, mevzuatı eşler ve resmî yazı taslağını hazırlar — her adım denetlenebilir, memur onayına hazır.
          </p>
          <AjanSahnesi />
          <div style={{ display: "flex", alignItems: "stretch", paddingTop: SP.l, borderTop: `1px solid ${PAL.line}`, animation: "nu-rise .16s ease-out both" }}>
            {STATS.map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <span aria-hidden="true" style={{ width: 1, alignSelf: "center", height: 32, background: PAL.line, margin: `0 ${SP.xl}px` }} />}
                <div>
                  <div style={{ ...TYPE.num, color: PAL.ink }}>{s.n}</div>
                  <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: SP.s, whiteSpace: "nowrap" }}>{s.l}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, textAlign: "center", ...TYPE.meta, color: PAL.mut3 }}>Güvenli · Denetlenebilir · Kurumsal yapay zekâ</div>
      </section>

      {/* Sağ — giriş rayı: beyaz yüzey + dar form kolonu (IG'deki sağ giriş paneli). */}
      <aside className="ke-login" style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: PAL.surf, padding: `${SP.xxl}px ${SP.xl}px` }}>
        <div style={{ width: "100%", maxWidth: 384 }}>
          <a href="/" {...focusRing} style={{ display: "flex", width: "fit-content", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2, textDecoration: "none", marginBottom: SP.l, borderRadius: RAD.ctl }}>
            <Icon.arrow style={{ transform: "rotate(180deg)" }} />Ana sayfa
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.xl }} className="ke-formlogo">
            <img src="/logo.png" alt="" width="40" height="40" style={{ borderRadius: RAD.card }} />
            <Marka />
          </div>

          <ModeTabs mode={mode} onChange={changeMode} />

            <h2 style={{ ...TYPE.h2, margin: `0 0 ${SP.xs}px`, color: PAL.ink }}>
              {kayit ? "Hesap oluştur" : "Tekrar hoş geldiniz"}
            </h2>
            <p style={{ ...TYPE.data, color: PAL.mut2, margin: `0 0 ${SP.xl}px` }}>
              {kayit ? "Birim hesabınızı oluşturup evrak akışına başlayın." : "Evrak çalışma alanınıza giriş yapın."}
            </p>

            <form onSubmit={submit} noValidate>
              {kayit && (
                <Field label="Ad soyad" value={form.ad_soyad} onChange={(val) => set("ad_soyad")(toTitleCaseTurkish(val))} autoComplete="name" required placeholder="Ayşe Yılmaz" />
              )}
              <Field label="E-posta" type="email" value={form.eposta} onChange={set("eposta")} autoComplete="email" required placeholder="ad.soyad@kurum.gov.tr" />
              {kayit && (
                <>
                  <Field label="Birim">
                    <select value={form.birim_kod} onChange={(e) => set("birim_kod")(e.target.value)} required {...focusRing}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, color: PAL.ink, ...TYPE.ui, outline: "none", cursor: "pointer" }}>
                      {birimler.length === 0 && <option value="">Yükleniyor…</option>}
                      {birimler.map((b) => <option key={b.kod} value={b.kod} style={{ background: PAL.surf }}>{b.ad}</option>)}
                    </select>
                  </Field>
                  <Field label="Unvan (opsiyonel)" value={form.unvan} onChange={(val) => set("unvan")(toTitleCaseTurkish(val))} autoComplete="organization-title" placeholder="Yazı İşleri Müdürü" />
                </>
              )}
              <ParolaField label="Parola" value={form.parola} onChange={set("parola")} autoComplete={kayit ? "new-password" : "current-password"} placeholder={kayit ? "En az 8 karakter" : "••••••••"} />

              {!kayit && (
                <div style={{ marginTop: `-${SP.xs}px`, marginBottom: SP.m, textAlign: "right" }}>
                  <button type="button" onClick={() => setSifreNot((v) => !v)} aria-expanded={sifreNot} {...focusRing}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...TYPE.data, fontWeight: 500, color: DERIN.T, borderRadius: RAD.chip }}>
                    Şifremi unuttum?
                  </button>
                  {sifreNot && (
                    <p role="status" style={{ margin: `${SP.s}px 0 0`, ...TYPE.meta, color: PAL.mut2, textAlign: "left" }}>
                      Parolanızı sıfırlamak için birim yöneticinize ya da sistem yöneticinize başvurun.
                    </p>
                  )}
                </div>
              )}

              {hata && (
                <div role="alert" aria-live="assertive" style={{ display: "flex", gap: SP.s, alignItems: "center", padding: "8px 12px", marginBottom: SP.m, borderRadius: RAD.ctl, background: ALFA(BANT.kirmizi.c), color: DERIN.kirmizi, ...TYPE.data }}>
                  <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}><Icon.alert /></span><span>{hata}</span>
                </div>
              )}

              <Btn primary onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center", padding: SP.m, marginTop: SP.xs }}>
                {busy ? (kayit ? "Oluşturuluyor…" : "Giriş yapılıyor…") : (kayit ? "Hesap oluştur" : "Giriş yap")}
              </Btn>
            </form>
        </div>
      </aside>

      {/* Geniş ekran: showcase grid + sabit giriş rayı (≥1100px).
          Monitöre-uyarlı ölçek: sayfa 1920px'de "tam" görünecek şekilde tasarlandı; daha geniş
          ekranlarda (2K/4K) içerik ortada küçük kalmasın diye tüm sayfayı --z ile orantılı büyütür.
          zoom×100vh/100vw taşmasını önlemek için genişlik+yükseklik aynı --z ile telafi edilir;
          media query'ler viewport'a bakar (element zoom'undan etkilenmez), zoom desteklenmezse
          --z yok sayılır → sayfa mevcut 1.0 ölçekte render olur (güvenli fallback). */}
      <style>{`
        .ke-auth-root{ --z:1; zoom:1; width:100%; min-height:calc(100vh / var(--z)); }
        @media(min-width:1100px){ .ke-show{display:grid!important} .ke-formlogo{display:none!important} .ke-login{flex:0 0 480px!important} }
        @media(min-width:2100px){ .ke-auth-root{ --z:1.15; zoom:1.15 } }
        @media(min-width:2400px){ .ke-auth-root{ --z:1.32; zoom:1.32 } }
        @media(min-width:2900px){ .ke-auth-root{ --z:1.5;  zoom:1.5  } }
        @media(min-width:3300px){ .ke-auth-root{ --z:1.68; zoom:1.68 } }
        @media(min-width:3700px){ .ke-auth-root{ --z:1.9;  zoom:1.9  } }
      `}</style>
    </div>
  );
}
