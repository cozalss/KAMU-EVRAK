/* useAuth — oturum durumu (user + status) React context'i.
   status: "loading" (açılışta token doğrulanıyor) | "anon" (girişsiz) | "auth" (girişli).
   Açılışta access token varsa /auth/ben ile doğrular; geçersizse anon'a düşer. */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { benKimim, cachedUser, cikisYap, girisYap, kayitOl, tokens } from "./authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Optimistik başlangıç: token + önbellekli kullanıcı varsa DOĞRUDAN "auth"
  // (Splash/"Oturum doğrulanıyor" beklemesi yok). Token yoksa hemen "anon".
  // Yalnız token var ama önbellek yoksa "loading" (ilk yük) — sonra doğrulanır.
  const [user, setUser] = useState(() => cachedUser.get());
  const [status, setStatus] = useState(() =>
    tokens.access() ? (cachedUser.get() ? "auth" : "loading") : "anon"
  );

  useEffect(() => {
    let iptal = false;
    (async () => {
      if (!tokens.access()) {
        setStatus("anon");
        return;
      }
      // Arka plan doğrulama: oturum geçerliyse kullanıcıyı tazele; değilse düşür.
      try {
        const ben = await benKimim();
        if (iptal) return;
        setUser(ben);
        cachedUser.set(ben);
        setStatus("auth");
      } catch {
        tokens.clear();
        if (iptal) return;
        setUser(null);
        setStatus("anon");
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  const login = useCallback(async (eposta, parola) => {
    await girisYap(eposta, parola);
    const ben = await benKimim();
    setUser(ben);
    cachedUser.set(ben);
    setStatus("auth");
    return ben;
  }, []);

  const register = useCallback(async (payload) => {
    await kayitOl(payload);
    // Kayıt sonrası otomatik giriş → akıcı UX.
    return login(payload.eposta, payload.parola);
  }, [login]);

  const logout = useCallback(async () => {
    // Ağ hatası olsa da oturum düşer (cikisYap finally'de token'ları zaten temizler).
    try { await cikisYap(); } catch { /* sunucuya çıkış yazılamadı — yerelde çıkış tamam */ }
    setUser(null);
    setStatus("anon");   // Root: anon → AuthPage (giriş ekranı) — tam sayfa yönlendirme yok.
    // Görünüm hash'ini temizle → sonraki giriş eski görünümde/geçmişte açılmasın.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}
