/* AuthPage — giriş / kayıt ekranı ("Antet & Damga", 2026-10). Sayfa bir MASADIR: solda ürünün
   vaadi dev Archivo ile ("Evrak gelir. Ajan okur. Memur imzalar.") + masanın üstünde canlı
   evrak sahnesi (AuthMasa: okunur → havale edilir → mühürlenir); sağda resmî FORM kâğıdı.
   Giriş koreografisi motion varyantlarıyla tek akış: antet → çizgi → vaat satırları → imza
   çizgisi → sahne → form kâğıdı. MotionConfig reducedMotion="user" hepsini söndürür.
   Backend auth API'sine useAuth ile bağlanır (mantık değişmedi).
   a11y: <form> + <label> + autoComplete + :focus-visible halkası + aria-live hata + aria-pressed tab. */
import React, { useEffect, useRef, useState } from "react";
import { MotionConfig, AnimatePresence, motion } from "motion/react";
import { PAL, T, MONO, SANS, DISPLAY, TYPE, TNUM, RAD, SP, SH, DERIN, ALFA, BANT, EASE_BEZIER, Btn, Icon, focusRing, NEON_KEYFRAMES, MarkaKaro } from "./neonUi.jsx";
import { birimleriGetir } from "../lib/authApi.js";
import { useAuth } from "../lib/useAuth.jsx";
import AuthMasa, { GRAIN } from "./AuthMasa.jsx";

const bugun = () => new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

// Giriş koreografisi — tek kök varyant ağacı; çocuklar sırayla (stagger) belirir.
const AKIS = { gizli: {}, acik: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const SOL = { gizli: { opacity: 0 }, acik: { opacity: 1, transition: { duration: 0.5, ease: EASE_BEZIER.out } } };
const CIZGI = { gizli: { scaleX: 0 }, acik: { scaleX: 1, transition: { duration: 0.9, ease: EASE_BEZIER.inOut } } };
const SATIR = { gizli: { y: "108%" }, acik: { y: "0%", transition: { duration: 0.8, ease: EASE_BEZIER.out } } };
const YUKSEL = { gizli: { opacity: 0, y: 14 }, acik: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_BEZIER.out } } };
const KAGIT = { gizli: { opacity: 0, x: 28, rotate: 0.6 }, acik: { opacity: 1, x: 0, rotate: 0, transition: { type: "spring", stiffness: 120, damping: 20, delay: 0.25 } } };

const VAAT = ["Evrak gelir.", "Ajan okur.", "Memur imzalar."];

/* Logotype — Exat dersi: imlece yakın harfler Archivo'nun GENİŞLİK ekseninde daralır, uzaklaşınca
   geri açılır (dalga). Yalnız pointer:fine + hareket azaltılmamışsa; dokunmatikte statik.
   Harf merkezleri dinlenme hâlinde ölçülüp önbelleğe alınır (her karede ölçmek, genişlik
   değiştikçe kendi kendini besleyen titreşim yapardı). rAF ile kare başına tek yazım. */
const LOGO = "KAMU-EVRAK";
function Logotype() {
  const ref = useRef(null);
  useEffect(() => {
    const kok = ref.current;
    if (!kok || !window.matchMedia?.("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const harfler = [...kok.querySelectorAll("[data-harf]")];
    let merkez = [], raf = 0, px = -1e4, py = -1e4;
    const olc = () => { merkez = harfler.map((h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); };
    const ciz = () => {
      raf = 0;
      harfler.forEach((h, n) => {
        const k = Math.max(0, 1 - Math.hypot(px - merkez[n][0], py - merkez[n][1]) / 90);
        h.style.fontStretch = `${125 - 50 * k * k * (3 - 2 * k)}%`;
      });
    };
    const hareket = (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(ciz); };
    const zaman = setTimeout(olc, 900);   // giriş koreografisi oturduktan sonra ölç
    document.fonts?.ready.then(olc);
    window.addEventListener("pointermove", hareket, { passive: true });
    window.addEventListener("resize", olc);
    return () => { clearTimeout(zaman); cancelAnimationFrame(raf); window.removeEventListener("pointermove", hareket); window.removeEventListener("resize", olc); };
  }, []);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.m }}>
      <MarkaKaro size={34} nokta={false} />
      <span ref={ref} aria-label={LOGO} role="img" style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
        <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 15, lineHeight: "18px", letterSpacing: ".06em", color: PAL.ink }}>
          {[...LOGO].map((h, n) => <span key={n} data-harf="" style={{ fontStretch: "125%", transition: "font-stretch .35s var(--ke-ease-out)" }}>{h}</span>)}
        </span>
        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: RAD.dot, background: "var(--ke-r)", flexShrink: 0 }} />
      </span>
    </span>
  );
}

/* Başarılı giriş damgası — "GİRİŞ KAYDEDİLDİ". AuthPage girişte anında unmount olur (oturum
   durumu useAuth'ta; o sözleşmeye dokunulmaz), bu yüzden damga React ağacının DIŞINDA,
   body'ye eklenen tek bir katmanda basılır: panel altında monte olurken ~600 ms üstte kalır
   ve kendini siler. pointer-events:none → hiçbir şeyi bloklamaz; yalnız BAŞARIDA çağrılır;
   hareket azaltılmışsa hiç basılmaz. Renk/font token var()'larından. */
function girisDamgasi() {
  if (typeof document === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const kat = document.createElement("div");
  kat.setAttribute("aria-hidden", "true");
  Object.assign(kat.style, { position: "fixed", inset: "0", zIndex: "9999", pointerEvents: "none", display: "grid", placeItems: "center" });
  const d = document.createElement("div");
  d.textContent = "Giriş kaydedildi";
  Object.assign(d.style, {
    fontFamily: DISPLAY, fontWeight: "800", fontStretch: "125%", fontSize: "26px", lineHeight: "30px", letterSpacing: ".1em",
    textTransform: "uppercase", color: DERIN.V, padding: "12px 22px", border: `3px solid ${DERIN.V}`, borderRadius: "8px",
    outline: `1.5px solid ${DERIN.V}`, outlineOffset: "4px", background: `color-mix(in srgb, ${PAL.surf} 88%, transparent)`,
  });
  kat.appendChild(d);
  document.body.appendChild(kat);
  d.style.opacity = "0";
  const sil = () => kat.remove();
  // İki kare bekle: panelin ilk montajı ana iş parçacığını bir süre tutar; damga ondan ÖNCE
  // başlarsa kompozitörde oynayıp ilk boyamadan önce biterdi (ölçüldü: hiç görünmüyordu).
  // İki rAF = panel boyandıktan sonra bas.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const anim = d.animate([
      // Eğri SEGMENT başına (vuruş sert iner, bekler, söner) — tüm zaman çizelgesine tek
      // easing verilince bekleme süresi sıkışıp damga neredeyse hiç görünmüyordu (ölçüldü).
      { opacity: 0, transform: "rotate(-7deg) scale(1.9)", easing: "cubic-bezier(0.23,1,0.32,1)" },
      { opacity: 1, transform: "rotate(-7deg) scale(.95)", offset: 0.22, easing: "ease-out" },
      { opacity: 1, transform: "rotate(-7deg) scale(1)", offset: 0.3 },
      { opacity: 1, transform: "rotate(-7deg) scale(1)", offset: 0.78, easing: "ease-in" },
      { opacity: 0, transform: "rotate(-7deg) scale(1)" },
    ], { duration: 600, easing: "linear", fill: "forwards" });
    anim.onfinish = sil;
    setTimeout(sil, 900);   // güvenlik: animasyon olayı gelmezse yine silinir
  }));
  setTimeout(sil, 4000);    // kare hiç gelmezse (arka plan sekmesi) katman yine temizlenir
}

/* Vaat — üç satır, her biri kendi maskesinden yükselir. Son satır ıslak-imza mavisi; altına
   tükenmez kalem çizgisi kendini çizer (pathLength). */
function Vaat() {
  return (
    <h1 className="ke-vaat" style={{ margin: 0, color: PAL.ink }}>
      {VAAT.map((s, n) => (
        <span key={s} style={{ display: "block", overflow: "hidden", paddingBottom: ".06em", marginBottom: "-.06em" }}>
          <motion.span variants={SATIR} style={{ display: "inline-block", position: "relative", color: n === 2 ? DERIN.T : PAL.ink }}>
            {s}
            {n === 2 && (
              <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" style={{ position: "absolute", left: "-1%", right: 0, bottom: "-.16em", width: "100%", height: ".26em", overflow: "visible" }}>
                <motion.path d="M4 16 C60 6 120 4 170 10 C210 15 240 18 296 6" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.55 }}
                  transition={{ duration: 0.9, delay: 0.95, ease: EASE_BEZIER.inOut }} />
              </svg>
            )}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

function Field({ label, children }) {
  return (
    <motion.label variants={YUKSEL} style={{ display: "block", marginBottom: SP.l }}>
      <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink2, marginBottom: 6 }}>{label}</span>
      {children}
    </motion.label>
  );
}

const Girdi = ({ value, onChange, ...p }) => (
  <input className="ke-girdi" value={value} onChange={(e) => onChange(e.target.value)} {...p} />
);

// Göz ikonları — parola görünürlük düğmesi (neonUi ikon setinde yok, yerel).
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

// Parola alanı — göster/gizle düğmesi; düğme odağı çalmaz (mousedown preventDefault).
function ParolaField({ label, value, onChange, autoComplete, placeholder }) {
  const [goster, setGoster] = useState(false);
  return (
    <Field label={label}>
      <span style={{ position: "relative", display: "block" }}>
        <Girdi type={goster ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} required placeholder={placeholder} style={{ paddingRight: 48 }} />
        <button type="button" className="ke-goz" onClick={() => setGoster((g) => !g)} onMouseDown={(e) => e.preventDefault()}
          aria-label={goster ? "Parolayı gizle" : "Parolayı göster"} aria-pressed={goster}
          title={goster ? "Parolayı gizle" : "Parolayı göster"} {...focusRing}>
          {goster ? <GozIkon.kapa /> : <GozIkon.ac />}
        </button>
      </span>
    </Field>
  );
}

/* Giriş/Kayıt seçici — iki sekme, seçili zemin layoutId ile aralarında KAYAR (yaylı). */
function ModeTabs({ mode, onChange }) {
  const items = [["giris", "Giriş"], ["kayit", "Kayıt"]];
  return (
    <div role="group" aria-label="Giriş veya kayıt seçin" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 3, borderRadius: RAD.ctl + 2, background: PAL.bg, border: `1px solid ${PAL.line}`, marginBottom: SP.xl }}>
      {items.map(([id, label]) => {
        const active = mode === id;
        return (
          <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={active} {...focusRing} data-press=""
            style={{ position: "relative", cursor: "pointer", height: 36, borderRadius: RAD.ctl, border: "none", background: "transparent", ...TYPE.ui, fontWeight: 600, color: active ? PAL.ink : PAL.mut2, transition: "color .2s ease" }}>
            {active && (
              <motion.span layoutId="ke-auth-sekme" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 34 }}
                style={{ position: "absolute", inset: 0, borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card }} />
            )}
            <span style={{ position: "relative" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TemaDugme({ tema, onTemaDegistir }) {
  const koyu = tema === "dark";
  return (
    <button type="button" className="ke-ust-link" onClick={() => onTemaDegistir?.()} {...focusRing} title={koyu ? "Açık moda geç" : "Koyu moda geç"}>
      {koyu ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
      <span>{koyu ? "Açık görünüm" : "Koyu görünüm"}</span>
    </button>
  );
}

export default function AuthPage({ tema, onTemaDegistir }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("giris");           // "giris" | "kayit"
  const [form, setForm] = useState({ eposta: "", parola: "", ad_soyad: "", birim_kod: "", unvan: "" });
  const [birimler, setBirimler] = useState([]);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const [sifreNot, setSifreNot] = useState(false);     // "şifremi unuttum" yönlendirme notu açık mı
  const kagitRef = useRef(null);                       // hata → form kâğıdı iki kez yatay sallanır (WAAPI)
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
    e?.preventDefault?.();
    setHata("");
    setBusy(true);
    try {
      if (kayit) {
        const formattedAdSoyad = form.ad_soyad.trim();
        const formattedUnvan = form.unvan.trim();
        await register({ eposta: form.eposta, parola: form.parola, ad_soyad: formattedAdSoyad, birim_kod: form.birim_kod, unvan: formattedUnvan });
      } else {
        await login(form.eposta, form.parola);
      }
      girisDamgasi();
      // başarı → AuthProvider status="auth" → Root dashboard'a geçer (unmount).
    } catch (err) {
      setHata(err.message || "Bir hata oluştu.");
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        kagitRef.current?.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 360, easing: "ease-out" });
      }
      setBusy(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="ke-auth-root" initial="gizli" animate="acik" variants={AKIS}>
        <style>{NEON_KEYFRAMES}</style>
        <style>{AUTH_CSS}</style>
        <div aria-hidden="true" className="ke-auth-lif" style={{ backgroundImage: `url("${GRAIN}")` }} />

        {/* Üst şerit — ana sayfa + tema (mobilde en üstte; masaüstünde form sütununun başında). */}
        <motion.div variants={SOL} className="ke-auth-ust">
          <a href="/" className="ke-ust-link" {...focusRing}>
            <Icon.arrow style={{ transform: "rotate(180deg)" }} />Ana sayfa
          </a>
          <TemaDugme tema={tema} onTemaDegistir={onTemaDegistir} />
        </motion.div>

        {/* Sol — masa: antet, vaat, sahne. */}
        <section className="ke-auth-sol" aria-label="Ürün tanıtımı">
          <motion.div variants={SOL} style={{ display: "flex", alignItems: "center", gap: SP.l, minWidth: 0 }}>
            <Logotype />
            <motion.span variants={CIZGI} aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.lineHi, transformOrigin: "left", minWidth: 24 }} />
            <span className="ke-antet-tarih" style={{ ...TYPE.antet, color: PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>T.C. · {bugun()}</span>
          </motion.div>

          <div className="ke-auth-vaat-blok">
            <Vaat />
            <motion.p variants={YUKSEL} className="ke-auth-alt" style={{ ...TYPE.read, color: PAL.mut2, margin: 0, maxWidth: 440, textWrap: "pretty" }}>
              Gelen yazıyı okur, künyesini çıkarır, sorumlu birime havale eder ve resmî cevabın
              taslağını hazırlar. <span style={{ color: PAL.ink, fontWeight: 600 }}>Karar daima memurda kalır.</span>
            </motion.p>
          </div>

          <motion.div variants={YUKSEL} className="ke-auth-sahne">
            <AuthMasa />
          </motion.div>
        </section>

        {/* Sağ — form kâğıdı. */}
        <main className="ke-auth-sag">
          <motion.div variants={KAGIT} className="ke-form-kagit">
            <motion.div variants={AKIS} ref={kagitRef}>
              <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", justifyContent: "space-between", gap: SP.m, textTransform: "uppercase" }}>
                <span>Form KE-01 · {kayit ? "Hesap kaydı" : "Oturum açma"}</span>
                <span>Kişiye özel</span>
              </div>
              <div aria-hidden="true" style={{ margin: `${SP.s}px 0 ${SP.xl}px`, height: 4, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />

              <ModeTabs mode={mode} onChange={changeMode} />

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: EASE_BEZIER.out }}>
                  <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: 28, lineHeight: "32px", letterSpacing: "-.02em", margin: `0 0 ${SP.xs}px`, color: PAL.ink }}>
                    {kayit ? "Hesap oluştur" : "Tekrar hoş geldiniz"}
                  </h2>
                  <p style={{ ...TYPE.ui, color: PAL.mut2, margin: `0 0 ${SP.xl}px` }}>
                    {kayit ? "Birim hesabınızı açın, evrak akışına katılın." : "Evrak çalışma alanınıza giriş yapın."}
                  </p>
                </motion.div>
              </AnimatePresence>

              <form onSubmit={submit} noValidate>
                {kayit && (
                  <Field label="Ad soyad">
                    <Girdi value={form.ad_soyad} onChange={set("ad_soyad")} autoComplete="name" required placeholder="Ayşe Yılmaz" />
                  </Field>
                )}
                <Field label="E-posta">
                  <Girdi type="email" value={form.eposta} onChange={set("eposta")} autoComplete="email" required placeholder="ad.soyad@kurum.gov.tr" />
                </Field>
                {kayit && (
                  <>
                    <Field label="Birim">
                      <span style={{ position: "relative", display: "block" }}>
                        <select className="ke-girdi" value={form.birim_kod} onChange={(e) => set("birim_kod")(e.target.value)} required style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 40, cursor: "pointer" }}>
                          {birimler.length === 0 && <option value="">Yükleniyor…</option>}
                          {birimler.map((b) => <option key={b.kod} value={b.kod} style={{ background: PAL.surf }}>{b.ad}</option>)}
                        </select>
                        <span aria-hidden="true" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%) rotate(90deg)", display: "flex", color: PAL.mut2, pointerEvents: "none" }}><Icon.okSag /></span>
                      </span>
                    </Field>
                    <Field label="Unvan (opsiyonel)">
                      <Girdi value={form.unvan} onChange={set("unvan")} autoComplete="organization-title" placeholder="Yazı İşleri Müdürü" />
                    </Field>
                  </>
                )}
                <ParolaField label="Parola" value={form.parola} onChange={set("parola")} autoComplete={kayit ? "new-password" : "current-password"} placeholder={kayit ? "En az 8 karakter" : "••••••••"} />

                {!kayit && (
                  <div style={{ marginTop: -SP.s, marginBottom: SP.l, textAlign: "right" }}>
                    <button type="button" className="ke-metin-link" onClick={() => setSifreNot((v) => !v)} aria-expanded={sifreNot} {...focusRing}>
                      Parolamı unuttum
                    </button>
                    <AnimatePresence initial={false}>
                      {sifreNot && (
                        <motion.p role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE_BEZIER.out }}
                          style={{ margin: 0, overflow: "hidden", ...TYPE.data, color: PAL.mut2, textAlign: "left" }}>
                          <span style={{ display: "block", paddingTop: SP.s }}>Parolanızı sıfırlamak için birim yöneticinize ya da sistem yöneticinize başvurun.</span>
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {hata && (
                    <motion.div role="alert" aria-live="assertive" key="hata"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_BEZIER.out }}
                      style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: "10px 12px", marginBottom: SP.l, borderRadius: RAD.ctl, background: ALFA(BANT.kirmizi.c), borderLeft: `3px solid ${BANT.kirmizi.c}`, color: DERIN.kirmizi, ...TYPE.data }}>
                      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginTop: 2 }}><Icon.alert /></span><span>{hata}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="ke-cta">
                  <Btn primary type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", minHeight: 48, fontWeight: 600 }}>
                    {busy ? <span aria-hidden="true" className="ke-spin" /> : null}
                    {busy ? (kayit ? "Oluşturuluyor…" : "Giriş yapılıyor…") : (kayit ? "Hesap oluştur" : "Giriş yap")}
                    {!busy && <span aria-hidden="true" className="ke-ok"><Icon.arrow width={16} height={16} /></span>}
                  </Btn>
                </div>
              </form>

              <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.xl, paddingTop: SP.l, borderTop: `1px dashed ${PAL.lineHi}`, ...TYPE.meta, color: PAL.mut2 }}>
                <span aria-hidden="true" style={{ display: "flex", color: DERIN.T }}><Icon.shield width={15} height={15} /></span>
                <span>Her oturum <span style={{ fontFamily: MONO, fontSize: 11 }}>SHA-256</span> denetim izine işlenir.</span>
              </div>
            </motion.div>
          </motion.div>
        </main>
      </motion.div>
    </MotionConfig>
  );
}

/* Düzen + etkileşim durumları. Satır-içi stil :hover/:focus/medya sorgusu yazamadığı için
   bu ekranın kuralları tek <style> bloğunda; renkler yalnız token var()'larından.
   Monitöre-uyarlı ölçek (2K/4K'da --z ile orantılı büyütme) korunur. */
const AUTH_CSS = `
.ke-auth-root{ --z:1; zoom:1; position:relative; width:100%; min-height:calc(100vh / var(--z)); box-sizing:border-box;
  background:${PAL.bg}; color:${PAL.ink}; font-family:${SANS};
  display:grid; grid-template-columns:minmax(0,1fr); grid-template-areas:"ust" "sol" "sag";
  padding:16px 16px 40px; row-gap:24px; overflow-x:clip; }
.ke-auth-lif{ position:absolute; inset:0; background-size:160px 160px; opacity:.05; mix-blend-mode:multiply; pointer-events:none; }
:root[data-theme="dark"] .ke-auth-lif{ mix-blend-mode:screen; opacity:.035; }
.ke-auth-ust{ grid-area:ust; position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.ke-auth-sol{ grid-area:sol; position:relative; display:flex; flex-direction:column; gap:28px; min-width:0; }
.ke-auth-sag{ grid-area:sag; position:relative; display:flex; justify-content:center; min-width:0; }
.ke-auth-sahne{ display:none; }
.ke-auth-vaat-blok{ display:flex; flex-direction:column; gap:16px; }
.ke-vaat{ font-family:${DISPLAY}; font-weight:800; font-stretch:100%; font-size:40px; line-height:.98; letter-spacing:-.035em; }
.ke-antet-tarih{ display:none; }
.ke-form-kagit{ position:relative; width:100%; max-width:440px; box-sizing:border-box; background:${PAL.surf}; border:1px solid ${PAL.line};
  border-radius:${RAD.card}px; box-shadow:${SH.kagit}; padding:24px 20px 20px; }
.ke-ust-link{ display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:0 8px; margin:0 -8px; border:none; background:none;
  cursor:pointer; color:${PAL.mut2}; text-decoration:none; border-radius:${RAD.chip}px; font:500 13px/18px ${SANS}; transition:color .15s ease; }
.ke-ust-link:hover{ color:${PAL.ink}; }
.ke-girdi{ display:block; width:100%; box-sizing:border-box; height:46px; padding:0 14px; border-radius:${RAD.ctl}px;
  background:${PAL.surf}; border:1px solid ${PAL.inputLine}; color:${PAL.ink}; font:400 16px/24px ${SANS}; outline:none;
  transition:border-color .15s ease, box-shadow .2s ease, background .15s ease; }
.ke-girdi::placeholder{ color:${PAL.mut3}; opacity:1; }
.ke-girdi:hover{ border-color:color-mix(in srgb, ${PAL.ink} 45%, transparent); }
.ke-girdi:focus-visible, .ke-girdi:focus{ border-color:${T}; box-shadow:0 0 0 4px color-mix(in srgb, ${T} 18%, transparent); }
.ke-goz{ position:absolute; right:6px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; justify-content:center;
  width:36px; height:36px; padding:0; border:none; background:transparent; color:${PAL.mut2}; cursor:pointer; border-radius:${RAD.ctl}px; transition:color .12s ease, background .12s ease; }
.ke-goz:hover{ color:${PAL.ink}; background:${PAL.hov}; }
.ke-metin-link{ background:none; border:none; padding:2px 0; cursor:pointer; font:500 13px/18px ${SANS}; color:${DERIN.T}; border-radius:${RAD.chip}px;
  text-decoration:underline; text-decoration-color:color-mix(in srgb, ${DERIN.T} 35%, transparent); text-underline-offset:3px; transition:text-decoration-color .15s ease; }
.ke-metin-link:hover{ text-decoration-color:${DERIN.T}; }
.ke-cta .ke-ok{ display:inline-flex; transition:transform .25s var(--ke-ease-out); }
.ke-cta button:hover .ke-ok{ transform:translateX(4px); }
.ke-spin{ width:14px; height:14px; border-radius:50%; border:2px solid currentColor; border-right-color:transparent; animation:nu-spin .7s linear infinite; }
:root:not([data-theme="dark"]) .ke-murekkep{ mix-blend-mode:multiply; }
@media(min-width:700px){
  .ke-auth-root{ padding:24px 32px 48px; }
  .ke-vaat{ font-size:56px; font-stretch:108%; }
  .ke-form-kagit{ padding:32px 32px 24px; }
}
@media(min-width:1100px){
  .ke-auth-root{ height:calc(100vh / var(--z)); min-height:640px; grid-template-columns:minmax(0,1fr) 500px;
    grid-template-rows:auto minmax(0,1fr); grid-template-areas:"sol ust" "sol sag"; padding:0; row-gap:0; overflow:hidden; }
  .ke-auth-sol{ padding:32px 0 0 48px; gap:clamp(20px, 3.4vh, 36px); overflow:hidden; }
  .ke-auth-ust{ padding:28px 48px 0 40px; }
  .ke-auth-sag{ align-items:center; padding:0 48px 40px 40px; }
  .ke-auth-sahne{ display:block; flex:1; min-height:0; position:relative; padding-right:48px;
    -webkit-mask-image:linear-gradient(to bottom, black 78%, transparent); mask-image:linear-gradient(to bottom, black 78%, transparent); }
  .ke-antet-tarih{ display:inline; }
  .ke-auth-vaat-blok{ flex-direction:row; align-items:flex-end; justify-content:space-between; gap:32px; flex-wrap:wrap; }
  .ke-vaat{ font-size:clamp(54px, 5vw, 92px); font-stretch:112%; line-height:.94; }
  .ke-auth-alt{ max-width:280px!important; padding-bottom:6px; }
  .ke-form-kagit{ padding:36px 36px 28px; }
}
@media(min-width:1100px) and (max-width:1379px){ .ke-masa{ grid-template-columns:minmax(0,1fr)!important; } .ke-masa-defter{ display:none!important; } }
@media(min-width:1100px) and (max-height:760px){ .ke-auth-alt{ display:none; } }
@media(min-width:2100px){ .ke-auth-root{ --z:1.15; zoom:1.15 } }
@media(min-width:2400px){ .ke-auth-root{ --z:1.32; zoom:1.32 } }
@media(min-width:2900px){ .ke-auth-root{ --z:1.5;  zoom:1.5  } }
@media(min-width:3300px){ .ke-auth-root{ --z:1.68; zoom:1.68 } }
@media(min-width:3700px){ .ke-auth-root{ --z:1.9;  zoom:1.9  } }
`;
