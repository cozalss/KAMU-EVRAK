/* authApi — backend auth + DB API istemcisi (Faz 7).
   Token'lar localStorage'da (access + refresh). Fetch sarmalayıcı: Bearer ekler,
   401'de refresh ile bir kez yeniler. Hatalar backend `detail` mesajıyla fırlatılır.
   Vite proxy relatif path'leri :8000'e yönlendirir (vite.config.js). */

const ACCESS_KEY = "ke_access";
const REFRESH_KEY = "ke_refresh";
const USER_KEY = "ke_user";
const DASH_KEY = "ke_dashboard";

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY) || "",
  refresh: () => localStorage.getItem(REFRESH_KEY) || "",
  set: (access, refresh) => {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY); // optimistik kullanıcı önbelleğini de temizle
    localStorage.removeItem(DASH_KEY); // optimistik panel önbelleğini de temizle
  },
};

// Optimistik oturum geri yükleme: refresh'te kullanıcıyı anında localStorage'dan
// kur (Splash beklemesi yok), arka planda /auth/ben ile doğrula/güncelle.
export const cachedUser = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  },
  set: (u) => {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  },
};

// Optimistik panel önbelleği: refresh'te history/outbox'u localStorage'dan ANINDA kur
// (boş→dolu "Henüz evrak işlenmedi" flash'ı yok), arka planda DB'den (uzak Supabase, gerçek
// gecikme) tazele. uid ile anahtarlı → başka kullanıcının verisi sızmaz; kota aşımında sessiz
// atlanır (DB fetch yine çalışır). cachedUser ile aynı desen.
export const cachedDashboard = {
  get: (uid) => {
    if (!uid) return null;
    try {
      const d = JSON.parse(localStorage.getItem(DASH_KEY) || "null");
      return d && d.uid === uid ? d : null;
    } catch {
      return null;
    }
  },
  set: (uid, data) => {
    if (!uid) return;
    try {
      localStorage.setItem(DASH_KEY, JSON.stringify({ uid, ...data }));
    } catch {
      /* localStorage kotası dolu → önbellek atlanır, DB reconcile yine çalışır */
    }
  },
};

async function parseError(res) {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  } catch {
    /* gövde JSON değil */
  }
  return `İstek başarısız (${res.status})`;
}

/* Düşük seviye fetch — Bearer ekler, 401'de refresh deneyip bir kez tekrarlar. */
export async function authFetch(path, { headers = {}, auth = true, _retry = true, ...options } = {}) {
  const nextHeaders = { ...headers };
  if (auth && tokens.access()) nextHeaders.Authorization = `Bearer ${tokens.access()}`;
  const res = await fetch(path, { ...options, headers: nextHeaders });

  if (res.status === 401 && auth && _retry && tokens.refresh()) {
    const yenilendi = await tryRefresh();
    if (yenilendi) return authFetch(path, { ...options, headers, auth, _retry: false });
  }
  return res;
}

async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const res = await authFetch(path, {
    method,
    auth,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
  try {
    const res = await fetch("/auth/yenile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh() }),
    });
    if (!res.ok) {
      tokens.clear();
      return false;
    }
    const data = await res.json();
    tokens.set(data.access_token, data.refresh_token);
    return true;
  } catch {
    tokens.clear();
    return false;
  }
}

/* ---- Auth ---- */
export async function girisYap(eposta, parola) {
  const data = await apiFetch("/auth/giris", { method: "POST", auth: false, body: { eposta, parola } });
  tokens.set(data.access_token, data.refresh_token);
  return data;
}

export async function kayitOl(payload) {
  return apiFetch("/auth/kayit", { method: "POST", auth: false, body: payload });
}

export async function benKimim() {
  return apiFetch("/auth/ben");
}

export async function cikisYap() {
  const refresh = tokens.refresh();
  try {
    if (refresh) await apiFetch("/auth/cikis", { method: "POST", auth: false, body: { refresh_token: refresh } });
  } finally {
    tokens.clear();
  }
}

/* ---- Referans / DB görünümleri ---- */
export async function birimleriGetir() {
  const data = await apiFetch("/referans/birimler", { auth: false });
  return data.birimler || [];
}

export async function apiGet(path) {
  return apiFetch(path);
}

export async function apiPost(path, body) {
  return apiFetch(path, { method: "POST", body });
}

/* SSE POST — canlı akış (text/event-stream). Her 'data: {...}' satırı JSON parse edilip
   onEvent'e verilir; stream bitince resolve. Ağ/HTTP hatası → reject (çağıran fallback'e düşer).
   AbortSignal ile iptal edilebilir (modal kapanınca). */
export async function apiStream(path, body, onEvent, signal) {
  const res = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await parseError(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const line = buf.slice(0, idx).split("\n").find((l) => l.startsWith("data:"));
      buf = buf.slice(idx + 2);
      const json = line ? line.slice(5).trim() : "";
      if (json) {
        try { onEvent(JSON.parse(json)); } catch { /* bozuk olay atlanır */ }
      }
    }
  }
}

export async function apiDelete(path) {
  return apiFetch(path, { method: "DELETE" });
}
