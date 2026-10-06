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
import { LOGOTYPE } from "./kabukAtomlari.jsx";
import { ScrollText } from "lucide-react";

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
const LOGO = LOGOTYPE;   // tek yazım (kabukAtomlari) — rayda "KAMU·EVRAK", burada "KAMU-EVRAK" idi
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.m, flexShrink: 0 }}>
      <MarkaKaro size={34} nokta={false} />
      <span ref={ref} aria-label={LOGO} role="img" style={{ display: "inline-flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap", flexShrink: 0 }}>
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

/* Alan — resmî formun numaralı satırı ("01  E-posta"): dilekçe/başvuru formlarındaki alan
   numarası, mono künye diliyle. Numara dekordur (aria-hidden); erişilebilir ad yalnız etiket. */
/* Etiket girdiyi SARMAZ, htmlFor ile bağlanır: sarmalayan etiket, içindeki göz düğmesinin
   adını ve büyük-harf uyarısını girdinin erişilebilir adına katıyordu ("Parola Parolayı göster"). */
function Field({ label, no, id, children, ek }) {
  return (
    <motion.div variants={YUKSEL} style={{ marginBottom: SP.l }}>
      <label htmlFor={id} style={{ display: "flex", alignItems: "baseline", gap: SP.s, ...TYPE.data, fontWeight: 600, color: PAL.ink2, marginBottom: 6 }}>
        {no && <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: ".04em", color: PAL.mut3, ...TNUM }}>{no}</span>}
        <span>{label}</span>
      </label>
      {children}
      {ek}
    </motion.div>
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
// Büyük harf kilidi uyarısı: "parolam doğru ama girmiyor"un en sık sebebi. Yalnız alan
// odaktayken ve kilit GERÇEKTEN açıkken (getModifierState) görünür; metin + ikon.
function ParolaField({ label, no, value, onChange, autoComplete, placeholder, hatali, describedBy, hataEk }) {
  const [goster, setGoster] = useState(false);
  const [buyukHarf, setBuyukHarf] = useState(false);
  const kilitOku = (e) => setBuyukHarf(!!e.getModifierState?.("CapsLock"));
  return (
    <Field label={label} no={no} id="ke-f-parola" ek={<>{buyukHarf && (
      <span role="status" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, ...TYPE.meta, color: DERIN.sari }}>
        <Icon.alert width={13} height={13} />Büyük harf kilidi açık
      </span>
    )}{hataEk}</>}>
      <span style={{ position: "relative", display: "block" }}>
        <Girdi id="ke-f-parola" type={goster ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} required placeholder={placeholder} style={{ paddingRight: 48 }}
          aria-invalid={hatali || undefined} aria-describedby={describedBy} onKeyDown={kilitOku} onKeyUp={kilitOku} onBlur={() => setBuyukHarf(false)} />
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
          <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={active} {...focusRing} data-press="" data-dokunma=""
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

const ALAN_ID = { ad: "ke-f-ad", eposta: "ke-f-eposta", parola: "ke-f-parola", ikisi: "ke-f-eposta" };
const sureYaz = (sn) => `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, "0")}`;

/* Hata notu — iki ton: kimlik/doğrulama hatası (kırmızı: ne oldu, ne yapmalı) ve hız sınırı
   (sarı: hata DEĞİL geçici kilit — bekleyince kendiliğinden açılır). role=alert yalnız
   ilk iletide okunur; geri sayım SR'yi her saniye rahatsız etmez (süre düğme metninde). */
function HataNotu({ metin, kilit, alanAlti = false }) {
  const c = kilit ? BANT.sari.c : BANT.kirmizi.c;
  return (
    <motion.div role="alert" id="ke-auth-hata"
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_BEZIER.out }}
      style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: "10px 12px", margin: alanAlti ? `${SP.s}px 0 0` : `0 0 ${SP.l}px`, borderRadius: RAD.ctl, background: ALFA(c), borderLeft: `3px solid ${c}`, color: kilit ? DERIN.sari : DERIN.kirmizi, ...TYPE.data }}>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginTop: 2 }}>{kilit ? <Icon.clock width={14} height={14} /> : <Icon.alert />}</span>
      <span style={{ minWidth: 0 }}>
        {kilit
          ? <><strong style={{ fontWeight: 600 }}>Güvenlik için giriş geçici olarak kilitlendi.</strong> Kısa sürede çok deneme yapıldı; süre dolunca form kendiliğinden açılır.</>
          : metin}
      </span>
    </motion.div>
  );
}

function TemaDugme({ tema, onTemaDegistir }) {
  const koyu = tema === "dark";
  return (
    <button type="button" className="ke-ust-link" onClick={(e) => onTemaDegistir?.(e.currentTarget)} {...focusRing} title={koyu ? "Açık moda geç" : "Koyu moda geç"}>
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
  // Alan düzeyinde kesinlik (tur 6, jüri): boş alan ön denetimi YALNIZ o alanı işaretler; 401/422
  // sunucu yanıtı kimliği birlikte reddeder → ikisi. null = işaretli alan yok.
  const [hataliAlan, setHataliAlan] = useState(null);   // "ad" | "eposta" | "parola" | "ikisi" | null
  // Hata notunun YERİ (tur 6 düzeltme): alana bağlı hata o alanın hemen altında durur ("Parolamı
  // unuttum"un altında, alandan kopuk duruyordu). Kimlik reddi (ikisi) parola altında; hız
  // sınırı / ağ hatası formun genel yerinde. Alan düzeltilince işaret kalkar, not yerinde kalır.
  const [hataYer, setHataYer] = useState("genel");
  const [kilitSn, setKilitSn] = useState(0);            // hız sınırı geri sayımı (sn)
  const [busy, setBusy] = useState(false);
  const [sifreNot, setSifreNot] = useState(false);     // "şifremi unuttum" yönlendirme notu açık mı
  const kagitRef = useRef(null);                       // hata → form kâğıdı iki kez yatay sallanır (WAAPI)
  const kayit = mode === "kayit";
  // Kullanıcı alanı düzeltmeye başlayınca kırmızı çerçeve kalkar (hata metni bir sonraki gönderime dek durur).
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); if (hataliAlan) setHataliAlan(null); };
  const changeMode = (id) => { setMode(id); setHata(""); setHataliAlan(null); setSifreNot(false); };
  const kilitli = kilitSn > 0;
  const hatali = (alan) => hataliAlan === alan || (hataliAlan === "ikisi" && (alan === "eposta" || alan === "parola"));
  const hataSlot = (yer) => (
    <AnimatePresence initial={false}>
      {hata && (kilitli ? yer === "genel" : hataYer === yer) && <HataNotu key={kilitli ? "kilit" : "hata"} metin={hata} kilit={kilitli} alanAlti={yer !== "genel"} />}
    </AnimatePresence>
  );
  const odakla = (alan) => requestAnimationFrame(() => document.getElementById(ALAN_ID[alan])?.focus());

  // 429 geri sayımı — saniyede bir; sıfırlanınca hata notu da kalkar (artık geçerli değil).
  useEffect(() => {
    if (!kilitli) return undefined;
    const t = setTimeout(() => {
      if (kilitSn <= 1) { setHata(""); }
      setKilitSn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [kilitli, kilitSn]);

  // Hata → kâğıt iki kez yatay sallanır (Hamle 9). Hareket azaltılmışsa yok.
  const salla = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    kagitRef.current?.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 360, easing: "ease-out" });
  };

  useEffect(() => {
    birimleriGetir().then((b) => {
      setBirimler(b);
      setForm((f) => (f.birim_kod ? f : { ...f, birim_kod: b[0]?.kod || "" }));
    }).catch(() => setBirimler([]));
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (kilitli) return;
    setHata(""); setHataliAlan(null);
    // İstemci ön denetimi: boş alan için sunucuya gidilip giriş hakkı (5/dk) yakılmaz.
    const eksik = kayit && !form.ad_soyad.trim() ? ["ad", "Ad soyad"] : !form.eposta.trim() ? ["eposta", "E-posta"] : !form.parola ? ["parola", "Parola"] : null;
    if (eksik) { setHata(`${eksik[1]} alanı boş bırakılamaz.`); setHataliAlan(eksik[0]); setHataYer(eksik[0]); salla(); odakla(eksik[0]); return; }
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
      const kimlik = err.status === 401 || err.status === 422;
      setHataYer(kimlik ? "parola" : "genel");
      if (kimlik) { setHataliAlan("ikisi"); odakla("ikisi"); }
      if (err.status === 429) setKilitSn(err.tekrarSaniye || 60);
      salla();
      setBusy(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="ke-auth-root" initial="gizli" animate="acik" variants={AKIS}>
        <style>{NEON_KEYFRAMES}</style>
        <style>{AUTH_CSS}</style>
        <div aria-hidden="true" className="ke-auth-lif" style={{ backgroundImage: `url("${GRAIN}")` }} />

        {/* Üst şerit — yalnız tema düğmesi (ayrı tanıtım sayfası yok; kök adres buraya açılır). */}
        <motion.header variants={SOL} className="ke-auth-ust">
          <TemaDugme tema={tema} onTemaDegistir={onTemaDegistir} />
        </motion.header>

        {/* Sol — masa: antet, vaat, sahne. */}
        <section className="ke-auth-sol" aria-label="Ürün tanıtımı">
          <motion.div variants={SOL} className="ke-auth-logo-satir" style={{ display: "flex", alignItems: "center", gap: SP.l, minWidth: 0 }}>
            <Logotype />
            <motion.span variants={CIZGI} aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.lineHi, transformOrigin: "left", minWidth: 24 }} />
            <span className="ke-antet-tarih" style={{ ...TYPE.antet, color: PAL.mut3, whiteSpace: "nowrap", textTransform: "uppercase", ...TNUM }}>Evrak masası · {bugun()}</span>
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
                  <Field label="Ad soyad" no="01" id="ke-f-ad" ek={hataSlot("ad")}>
                    <Girdi id="ke-f-ad" value={form.ad_soyad} onChange={set("ad_soyad")} autoComplete="name" required placeholder="Ayşe Yılmaz"
                      aria-invalid={hatali("ad") || undefined} aria-describedby={hatali("ad") ? "ke-auth-hata" : undefined} />
                  </Field>
                )}
                <Field id="ke-f-eposta" label="E-posta" no={kayit ? "02" : "01"} ek={hataSlot("eposta")}>
                  <Girdi id="ke-f-eposta" type="email" value={form.eposta} onChange={set("eposta")} autoComplete="email" required placeholder="ad.soyad@kurum.gov.tr"
                    inputMode="email" spellCheck={false} aria-invalid={hatali("eposta") || undefined} aria-describedby={hatali("eposta") ? "ke-auth-hata" : undefined} />
                </Field>
                {kayit && (
                  <>
                    <Field label="Birim" no="03" id="ke-f-birim">
                      <span style={{ position: "relative", display: "block" }}>
                        <select id="ke-f-birim" className="ke-girdi" value={form.birim_kod} onChange={(e) => set("birim_kod")(e.target.value)} required style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 40, cursor: "pointer" }}>
                          {birimler.length === 0 && <option value="">Yükleniyor…</option>}
                          {birimler.map((b) => <option key={b.kod} value={b.kod} style={{ background: PAL.surf }}>{b.ad}</option>)}
                        </select>
                        <span aria-hidden="true" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%) rotate(90deg)", display: "flex", color: PAL.mut2, pointerEvents: "none" }}><Icon.okSag /></span>
                      </span>
                    </Field>
                    <Field label="Unvan (opsiyonel)" no="04" id="ke-f-unvan">
                      <Girdi id="ke-f-unvan" value={form.unvan} onChange={set("unvan")} autoComplete="organization-title" placeholder="Yazı İşleri Müdürü" />
                    </Field>
                  </>
                )}
                <ParolaField label="Parola" no={kayit ? "05" : "02"} hatali={hatali("parola")} describedBy={hatali("parola") ? "ke-auth-hata" : undefined} hataEk={hataSlot("parola")} value={form.parola} onChange={set("parola")} autoComplete={kayit ? "new-password" : "current-password"} placeholder={kayit ? "En az 8 karakter" : "••••••••"} />

                {!kayit && (
                  <div style={{ marginTop: -SP.l, marginBottom: SP.m, textAlign: "right" }}>
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

                {hataSlot("genel")}

                <div className="ke-cta">
                  <Btn primary type="submit" disabled={busy || kilitli} style={{ width: "100%", justifyContent: "center", minHeight: 48, fontWeight: 600, ...TNUM }}>
                    {busy ? <span aria-hidden="true" className="ke-spin" /> : kilitli ? <Icon.clock width={16} height={16} /> : null}
                    {busy ? (kayit ? "Oluşturuluyor…" : "Giriş yapılıyor…") : kilitli ? `Yeniden deneme ${sureYaz(kilitSn)}` : (kayit ? "Hesap oluştur" : "Giriş yap")}
                    {!busy && !kilitli && <span aria-hidden="true" className="ke-ok"><Icon.arrow width={16} height={16} /></span>}
                  </Btn>
                </div>
              </form>

              <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.xl, paddingTop: SP.l, borderTop: `1px dashed ${PAL.lineHi}`, ...TYPE.meta, color: PAL.mut2 }}>
                <span aria-hidden="true" style={{ display: "flex", color: DERIN.T }}><ScrollText size={15} strokeWidth={1.75} /></span>
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
  display:grid; grid-template-columns:minmax(0,1fr); grid-template-areas:"sol" "sag";
  padding:16px 16px 40px; row-gap:24px; overflow-x:clip; }
.ke-auth-lif{ position:absolute; inset:0; background-size:160px 160px; opacity:.05; mix-blend-mode:multiply; pointer-events:none; }
:root[data-theme="dark"] .ke-auth-lif{ mix-blend-mode:screen; opacity:.035; }
/* Telefon/tablet (tur 6, jüri): tema düğmesi kendi satırını kaplıyordu, "Giriş yap" ilk ekranın
   altında kalıyordu. Düğme logo satırının sağına biner (mutlak), vaat sıkışır, açıklama düşer. */
.ke-auth-ust{ grid-area:ust; position:absolute; top:16px; right:16px; z-index:2; display:flex; align-items:center; justify-content:flex-end; gap:12px; }
.ke-auth-logo-satir{ padding-right:132px; min-height:36px; }
.ke-auth-sol{ grid-area:sol; position:relative; display:flex; flex-direction:column; gap:20px; min-width:0; }
.ke-auth-sag{ grid-area:sag; position:relative; display:flex; justify-content:center; min-width:0; }
.ke-auth-sahne{ display:none; }
.ke-auth-vaat-blok{ display:flex; flex-direction:column; gap:16px; }
.ke-vaat{ font-family:${DISPLAY}; font-weight:800; font-stretch:100%; font-size:32px; line-height:1; letter-spacing:-.03em; }
.ke-auth-alt{ display:none; }
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
.ke-girdi[aria-invalid="true"]{ border-color:${BANT.kirmizi.c}; }
/* Odak: yumuşak 4 px parıltı (üçüncü bir odak dili) kaldırıldı — girdi odağı küresel tek kaynaktan
   (kamu-evrak.css "ODAK: TEK KAYNAK"): kenar tükenmez mavisi + aynı ailenin dış ince çizgisi. */
.ke-girdi:focus{ border-color:${T}; }
.ke-goz{ position:absolute; right:2px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; justify-content:center;
  width:44px; height:44px; padding:0; border:none; background:transparent; color:${PAL.mut2}; cursor:pointer; border-radius:${RAD.ctl}px; transition:color .12s ease, background .12s ease; }
.ke-goz:hover{ color:${PAL.ink}; background:${PAL.hov}; }
.ke-metin-link{ background:none; border:none; padding:0 2px; min-height:44px; display:inline-flex; align-items:center; cursor:pointer; font:500 13px/18px ${SANS}; color:${DERIN.T}; border-radius:${RAD.chip}px;
  text-decoration:underline; text-decoration-color:color-mix(in srgb, ${DERIN.T} 35%, transparent); text-underline-offset:3px; transition:text-decoration-color .15s ease; }
.ke-metin-link:hover{ text-decoration-color:${DERIN.T}; }
.ke-cta .ke-ok{ display:inline-flex; transition:transform .25s var(--ke-ease-out); }
.ke-cta button:hover .ke-ok{ transform:translateX(4px); }
.ke-spin{ width:14px; height:14px; border-radius:50%; border:2px solid currentColor; border-right-color:transparent; animation:nu-spin .7s linear infinite; }
:root:not([data-theme="dark"]) .ke-murekkep{ mix-blend-mode:multiply; }
@media(min-width:700px){
  .ke-auth-root{ padding:24px 32px 48px; }
  .ke-auth-ust{ top:24px; right:32px; }
  .ke-auth-alt{ display:block; }
  .ke-auth-sol{ gap:28px; }
  .ke-vaat{ font-size:56px; font-stretch:108%; }
  .ke-form-kagit{ padding:32px 32px 24px; }
}
@media(min-width:1100px){
  .ke-auth-root{ height:calc(100vh / var(--z)); min-height:640px; grid-template-columns:minmax(0,1fr) 500px;
    grid-template-rows:auto minmax(0,1fr); grid-template-areas:"sol ust" "sol sag"; padding:0; row-gap:0; overflow:hidden; }
  .ke-auth-sol{ padding:32px 0 0 48px; gap:clamp(20px, 3.4vh, 36px); overflow:hidden; }
  .ke-auth-ust{ position:relative; top:auto; right:auto; padding:28px 48px 0 40px; }
  .ke-auth-logo-satir{ padding-right:0; }
  .ke-auth-sag{ align-items:center; padding:0 48px 40px 40px; }
  .ke-auth-sahne{ display:block; flex:1; min-height:0; position:relative; padding-right:48px;
    -webkit-mask-image:linear-gradient(to bottom, black 78%, transparent); mask-image:linear-gradient(to bottom, black 78%, transparent); }
  .ke-antet-tarih{ display:inline; }
  .ke-auth-vaat-blok{ flex-direction:row; align-items:flex-end; justify-content:space-between; gap:32px; flex-wrap:wrap; }
  .ke-vaat{ font-size:clamp(54px, 5vw, 92px); font-stretch:112%; line-height:.94; }
  /* Paragrafın SAĞ kenarı kâğıdın sağ kenarına hizalanır (sahnenin 48 px sağ dolgusu kadar içeri) —
     1440'ta başlıkla kâğıt arasında havada asılı duruyordu (jüri). */
  .ke-auth-alt{ max-width:280px!important; padding-bottom:6px; margin-right:48px!important; }
  .ke-form-kagit{ padding:36px 36px 28px; }
}
@media(min-width:1100px) and (max-width:1379px){ .ke-masa{ grid-template-columns:minmax(0,1fr)!important; } .ke-masa-defter{ display:none!important; } }
/* Geniş ekran (tur 4, jüri A#27/C#23): kompozisyon 1680 px'te durur ve ortalanır — 1920'de
   fiş, sayılar ve açıklama birbirinden ~400 px uzaklaşıp "dağılıyordu". Bu genişlikte vaat
   başlığı da sabitlenir; açıklama paragrafının SAĞ kenarı kâğıdın sağ kenarına hizalanır
   (sahnenin 48 px sağ dolgusu kadar içeri) — paragraf havada değil, kâğıda bağlı okunur. */
@media(min-width:1700px){
  /* Zemin + lif html/body'den gelir (THEME_CSS): kök kendi zeminini boyarsa ortalanmış kutunun
     iki yanında ayrı tonda şerit kalıyordu. */
  .ke-auth-root{ max-width:1680px; margin:0 auto; background:transparent; }
  .ke-auth-lif{ display:none; }
  .ke-vaat{ font-size:84px; }
  .ke-auth-alt{ max-width:320px!important; margin-right:48px!important; }
}
@media(min-width:1100px) and (max-height:760px){ .ke-auth-alt{ display:none; } }
@media(min-width:2100px){ .ke-auth-root{ --z:1.15; zoom:1.15 } }
@media(min-width:2400px){ .ke-auth-root{ --z:1.32; zoom:1.32 } }
@media(min-width:2900px){ .ke-auth-root{ --z:1.5;  zoom:1.5  } }
@media(min-width:3300px){ .ke-auth-root{ --z:1.68; zoom:1.68 } }
@media(min-width:3700px){ .ke-auth-root{ --z:1.9;  zoom:1.9  } }
`;
