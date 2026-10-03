import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardApp from "./DashboardApp.jsx";
import AuthPage from "./components/AuthPage.jsx";
import { AuthProvider, useAuth } from "./lib/useAuth.jsx";

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
// Landing (index.html) bu dosyayı hiç görmez; onun CSS'i ayrı bundle'da kalır.
import "./styles/app-tailwind.css";

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
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "dark" ? "#0b0a09" : "#f7f3ee");
    try { localStorage.setItem(TEMA_ANAHTAR, tema); } catch { /* özel mod — tercih oturumluk kalır */ }
  }, [tema]);
  const toggleTema = React.useCallback(() => setTemaState((v) => (v === "dark" ? "light" : "dark")), []);
  return [tema, toggleTema];
}

// Oturum kapısı: loading → Splash · anon → AuthPage (giriş/kayıt) · auth → DashboardApp (evrak).
function Root() {
  const { status } = useAuth();
  const [tema, toggleTema] = useTema();
  if (status === "loading") return <Splash />;
  if (status !== "auth") return <AuthPage tema={tema} onTemaDegistir={toggleTema} />;
  return <DashboardApp tema={tema} onTemaDegistir={toggleTema} />;
}

function Splash() {
  // Açılış: "evrak masaya geliyor" — logo karosu + oturum damgası. Damga NEON_KEYFRAMES'e
  // bağlı olmadığı için kendi kısa vuruşunu taşır (bu ekran DashboardApp'ten önce).
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: PAL.ink, fontFamily: SANS }}>
      <style>{"@keyframes ke-spl{0%{opacity:0;transform:rotate(-6deg) scale(1.8)}60%{opacity:1;transform:rotate(-6deg) scale(.95)}100%{opacity:1;transform:rotate(-6deg) scale(1)}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}"}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <MarkaKaro size={48} nokta={false} />
        <span style={{ ...TYPE.damga, fontSize: 12, color: DERIN.V, border: `2px solid ${DERIN.V}`, outline: `1px solid ${DERIN.V}`, outlineOffset: 2, padding: "5px 10px", borderRadius: 6, animation: "ke-spl .6s cubic-bezier(.23,1,.32,1) both" }}>Oturum doğrulanıyor</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_CSS}</style>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
