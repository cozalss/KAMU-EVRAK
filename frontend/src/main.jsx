import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/useAuth.jsx";
import { tokens } from "./lib/authApi.js";

// Kod bölme (Dev Award · WPO): giriş ekranı ve çalışma alanı AYRI chunk'lar. Girişli memur
// AuthPage'i (masa sahnesi + form), girişsiz ziyaretçi bütün çalışma alanını indirmez.
// Şelale olmasın diye hangi kabuğun gerekeceği token'dan TAHMİN edilir ve import modül
// değerlendirilirken (React ilk kez çizmeden) başlatılır; lazy() aynı modül önbelleğini
// kullanır. Tahmin yanılırsa (süresi dolmuş oturum) öteki chunk o an iner — yalnız gecikme.
// DashboardApp React.lazy DEĞİL, elle tutulan modül: lazy, modül önbellekte olsa bile ilk
// çizimde bir kez askıya alır — giriş→çalışma alanı View Transition'ı o anki Splash'i
// yakalardı. Modül hazırsa doğrudan çizilir, değilse Splash + yükleme.
let DashboardApp = null;
const dashboardYukle = () => import("./DashboardApp.jsx").then((m) => { DashboardApp = m.default; return m; });
const authYukle = () => import("./components/AuthPage.jsx");
const AuthPage = React.lazy(authYukle);
try { (tokens.access() ? dashboardYukle : authYukle)(); } catch { /* depolama kapalı — lazy kendisi yükler */ }

// Uzak Supabase DNS'i ara ara düşüyor → DB okumaları 3 deneme + üstel geri çekilme ile
// kendini toparlar. 401/403/404 YENİDEN DENENMEZ (auth/izin hatası ağla düzelmez; mesaj
// deseni authApi.parseError'un "İstek başarısız (NNN)" biçimidir). Odak-refetch kapalı:
// oturum geçmişi canlı eklemelerle büyür, odak yenilemesi onları ezmemeli.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (count, err) => count < 3 && !/\((401|403|404)\)/.test(String(err?.message)),
    },
  },
});
import { PAL, SANS, TYPE, DERIN, THEME_CSS, MarkaKaro } from "./components/neonUi.jsx";
import "./styles/fonts.css";
import "./styles/kamu-evrak.css";   // global reset + result-cards yardımcı stilleri
// Tailwind utility katmanı — YALNIZ çalışma alanı için (kendi config'i, preflight YOK).
// kamu-evrak.css'ten SONRA yüklenir: utility'ler legacy yardımcı sınıfları ezebilsin.
import "./styles/app-tailwind.css";
// Görünüm geçişi YÖNÜ (geri tuşu ters oynar) — DashboardApp.gecisle html[data-vt-yon] kurar.
import "./styles/gecis.css";

// Tarayıcı çubuğu rengi = html zemini (THEME_CSS --ke-bg). app.html'deki iki media'lı
// theme-color meta'sı OS tercihini karşılar; kullanıcı açıkça seçince ikisi de o renge çekilir.
const TEMA_RENK = { light: "#eceee9", dark: "#0c0e14" };

// Açık/koyu mod tercihi: kalıcı (localStorage), yoksa OS prefers-color-scheme. Kök <html>
// [data-theme] alır (THEME_CSS bunu :root[data-theme="dark"] ile seçer) — Splash/AuthPage/
// DashboardApp'in hepsi aynı dokümanı paylaştığından tek noktadan (Root) uygulanır.
const TEMA_ANAHTAR = "ke-tema";
function useTema() {
  const [tema, setTemaState] = React.useState(() => {
    try {
      const kayitli = localStorage.getItem(TEMA_ANAHTAR);
      if (kayitli === "dark" || kayitli === "light") return kayitli;
    } catch { /* özel mod — OS tercihine düş */ }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  // useLayoutEffect: data-theme ilk boyamadan ÖNCE kurulur — OS koyu iken açık seçmiş
  // kullanıcıda (ya da tersi) ilk karede yanlış zemin parlamaz.
  React.useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", TEMA_RENK[tema]));
    try { localStorage.setItem(TEMA_ANAHTAR, tema); } catch { /* özel mod — tercih oturumluk kalır */ }
  }, [tema]);
  const toggleTema = React.useCallback(() => setTemaState((v) => (v === "dark" ? "light" : "dark")), []);
  return [tema, toggleTema];
}

// Giriş → çalışma alanı geçişi: antet (view-transition-name: ke-antet-baslik) giriş
// kartından çalışma alanı başlığına morflanır. Yalnız anon→auth yönünde, kabuk modülü
// İNDİKTEN SONRA başlar (yakalanan kare Splash olmasın); reduced-motion'da hiç başlamaz.
const hareketAz = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
function useGorunenDurum(status) {
  const [gorunen, setGorunen] = React.useState(status);
  const [, yenile] = React.useReducer((x) => x + 1, 0);
  React.useLayoutEffect(() => {
    if (gorunen === status) return;
    if (status !== "auth") { setGorunen(status); return; }
    let iptal = false;
    dashboardYukle().then(() => {
      if (iptal) return;
      if (gorunen !== "anon" || !document.startViewTransition || hareketAz()) { setGorunen(status); return; }
      const t = document.startViewTransition(() => { flushSync(() => setGorunen(status)); });
      [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p?.catch(() => {}));
    }, () => { if (!iptal) setGorunen(status); });
    return () => { iptal = true; };
  }, [status, gorunen]);
  // İlk açılışta (geçişsiz) auth ise modül inene kadar Splash; inince yeniden çiz.
  React.useEffect(() => {
    if (gorunen === "auth" && !DashboardApp) dashboardYukle().then(yenile, yenile);
  }, [gorunen]);
  // Giriş ekranındayken çalışma alanını boşta önceden indir — "Giriş yap"tan sonra bekleme yok.
  React.useEffect(() => {
    if (gorunen !== "anon") return;
    const ric = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    const id = ric(() => { dashboardYukle().catch(() => {}); });
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [gorunen]);
  return gorunen;
}

// Oturum kapısı: loading → Splash · anon → AuthPage (giriş/kayıt) · auth → DashboardApp (evrak).
function Root() {
  const { status: gercekDurum } = useAuth();
  const status = useGorunenDurum(gercekDurum);
  const [tema, toggleTema] = useTema();
  // Girişsiz başlık; girişli kabukta DashboardApp görünüm adını yazar.
  React.useEffect(() => { if (status === "anon") document.title = "Giriş · KAMU-EVRAK"; }, [status]);
  if (status === "loading") return <Splash />;
  // Kabuk chunk'ı inerken aynı Splash — ama GECİKMELİ: önbellekten gelen chunk birkaç ms'de
  // çözülür, o kısa anda mühür parlayıp sönmesin (yanıp sönme jank'tır). Tam ekran ortalı
  // olduğundan kabuk gelince düzen kayması doğmaz.
  return (
    <React.Suspense fallback={<Splash metin="Masa hazırlanıyor" gecikmeli />}>
      {status !== "auth"
        ? <AuthPage tema={tema} onTemaDegistir={toggleTema} />
        : DashboardApp ? <DashboardApp tema={tema} onTemaDegistir={toggleTema} /> : <Splash metin="Masa hazırlanıyor" gecikmeli />}
    </React.Suspense>
  );
}

function Splash({ metin = "Oturum doğrulanıyor", gecikmeli = false }) {
  // Açılış: "evrak masaya geliyor" — logo karosu + oturum damgası. Damga NEON_KEYFRAMES'e
  // bağlı olmadığı için kendi kısa vuruşunu taşır (bu ekran DashboardApp'ten önce).
  // gecikmeli: tüm ekran 180 ms boyunca görünmez (opacity), ancak bekleme gerçekten
  // uzarsa belirir — Emil'in "hızlıysa hiç gösterme" kuralı.
  return (
    <div role="status" aria-live="polite" style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: PAL.ink, fontFamily: SANS, animation: gecikmeli ? "ke-spl-gir .2s ease-out .18s both" : undefined }}>
      <style>{"@keyframes ke-spl{0%{opacity:0;transform:rotate(-6deg) scale(1.8)}60%{opacity:1;transform:rotate(-6deg) scale(.95)}100%{opacity:1;transform:rotate(-6deg) scale(1)}}@keyframes ke-spl-gir{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}"}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <MarkaKaro size={48} nokta={false} />
        <span style={{ ...TYPE.damga, fontSize: 12, color: DERIN.V, border: `2px solid ${DERIN.V}`, outline: `1px solid ${DERIN.V}`, outlineOffset: 2, padding: "5px 10px", borderRadius: 6, animation: `ke-spl .6s cubic-bezier(.23,1,.32,1) ${gecikmeli ? ".18s" : "0s"} both` }}>{metin}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_CSS}</style>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
