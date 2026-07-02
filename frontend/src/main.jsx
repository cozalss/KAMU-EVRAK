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
import { PAL, T, SANS, MONO } from "./components/neonUi.jsx";
import "./styles/fonts.css";
import "./styles/kamu-evrak.css";   // global reset + result-cards yardımcı stilleri

// Oturum kapısı: loading → Splash · anon → AuthPage (giriş/kayıt) · auth → DashboardApp (evrak).
function Root() {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status !== "auth") return <AuthPage />;
  return <DashboardApp />;
}

function Splash() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: PAL.bg, color: PAL.ink, fontFamily: SANS }}>
      <style>{"@keyframes ke-spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid rgba(46,230,201,.25)", borderTopColor: T, animation: "ke-spin .8s linear infinite" }} />
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "1px", color: PAL.mut2 }}>Oturum doğrulanıyor…</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
