/* authApi — backend auth + DB API istemcisi (Faz 7).
   Token'lar localStorage'da (access + refresh). Fetch sarmalayıcı: Bearer ekler,
   401'de refresh ile bir kez yeniler. Hatalar backend `detail` mesajıyla fırlatılır.
   Vite proxy relatif path'leri :8000'e yönlendirir (vite.config.js). */

const ACCESS_KEY = "ke_access";
const REFRESH_KEY = "ke_refresh";

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
async function apiFetch(path, { method = "GET", body, auth = true, _retry = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && tokens.access()) headers.Authorization = `Bearer ${tokens.access()}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && _retry && tokens.refresh()) {
    const yenilendi = await tryRefresh();
    if (yenilendi) return apiFetch(path, { method, body, auth, _retry: false });
  }
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
