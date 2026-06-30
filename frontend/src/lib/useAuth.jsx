/* useAuth — oturum durumu (user + status) React context'i.
   status: "loading" (açılışta token doğrulanıyor) | "anon" (girişsiz) | "auth" (girişli).
   Açılışta access token varsa /auth/ben ile doğrular; geçersizse anon'a düşer. */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { benKimim, cikisYap, girisYap, kayitOl, tokens } from "./authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let iptal = false;
    (async () => {
      if (!tokens.access()) {
        setStatus("anon");
        return;
      }
      try {
        const ben = await benKimim();
        if (!iptal) {
          setUser(ben);
          setStatus("auth");
        }
      } catch {
        tokens.clear();
        if (!iptal) setStatus("anon");
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
    setStatus("auth");
    return ben;
  }, []);

  const register = useCallback(async (payload) => {
    await kayitOl(payload);
    // Kayıt sonrası otomatik giriş → akıcı UX.
    return login(payload.eposta, payload.parola);
  }, [login]);

  const logout = useCallback(async () => {
    await cikisYap();
    setUser(null);
    setStatus("anon");
    // Çıkışta herkese açık landing'e (sitenin ön kapısı) dön.
    window.location.assign("/");
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
