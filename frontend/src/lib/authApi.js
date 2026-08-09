/* authApi — backend auth + DB API istemcisi (Faz 7).
   Token'lar localStorage'da (access + refresh). Fetch sarmalayıcı: Bearer ekler,
   401'de refresh ile bir kez yeniler. Hatalar backend `detail` mesajıyla fırlatılır.
   Vite proxy relatif path'leri :8000'e yönlendirir (vite.config.js). */

import { hafizaTemizle } from "./sohbetHafiza.js";

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
    // Sohbet geçmişi de gitmeli (9 Ağu 2026 güvenlik denetimi): `kamu-evrak-sohbet`
    // anahtarı kullanıcıya göre AYRILMIYOR ve çıkışta silinmiyordu. Kamu kurumlarında
    // paylaşımlı bilgisayar olağandır: bir sonraki memur, açılışta önceki memurun tam
    // sohbet geçmişini — içindeki evrak kayıt kartlarıyla birlikte — hazır buluyordu.
    // SENKRON olmalı: dinamik import kullanılsaydı çıkış akışı (ve sayfa yenilemesi)
    // temizlik çalışmadan bitebilirdi. `sohbetHafiza` hiçbir modülü içe aktarmaz →
    // döngüsel bağımlılık riski yok, statik import güvenli.
    hafizaTemizle();
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

// Alan → Türkçe doğrulama mesajı. FastAPI/pydantic 422'de detail bir dizi olur ve msg
// ham İNGİLİZCE gelir ("value is not a valid email address: The part after the @-sign…") —
// Türk memura sızmamalı (Playwright taraması, 2026-07-22). loc = ["body","<alan>"] alan adını
// verir; kuralları auth/schemas.py'den bilinir (eposta EmailStr · parola min 8 · ad_soyad
// min 2 · birim_kod min 2). Alan bilinmese de ham İngilizce yerine düz Türkçe döner.
const ALAN_TR = {
  eposta: "Geçerli bir e-posta adresi girin (örn. ad.soyad@kurum.gov.tr).",
  parola: "Parola en az 8 karakter olmalı.",
  ad_soyad: "Ad soyad en az 2 karakter olmalı.",
  birim_kod: "Lütfen bir birim seçin.",
  unvan: "Unvan geçersiz.",
};

function dogrulamaMesaji(dizi) {
  // İlk hatalı alanı bul (loc dizisinin SON parçası alan adıdır: ["body","eposta"]).
  for (const h of dizi) {
    const alan = Array.isArray(h?.loc) ? h.loc[h.loc.length - 1] : null;
    if (alan && ALAN_TR[alan]) return ALAN_TR[alan];
  }
  return "Girdiğiniz bilgilerde bir hata var — lütfen alanları kontrol edin.";
}

export async function parseError(res) {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (typeof d === "string") return d;           // backend'in kendi Türkçe mesajı (AuthError)
    if (Array.isArray(d) && d.length) return dogrulamaMesaji(d);  // pydantic 422 → Türkçeye çevir
    // slowapi'nin 429 handler'ı `{"error": "Rate limit exceeded: ..."}` döner — `detail` DEĞİL.
    // İki şekil de sahada var (mobil.py `detail` kullanır), ikisi de okunmalı; yoksa kullanıcı
    // hız sınırında yalnız çıplak durum kodu görür.
    if (typeof body?.error === "string" && body.error) {
      // slowapi'nin handler'ı İNGİLİZCE üretir ("Rate limit exceeded: 20 per 1 minute").
      // Ham hâliyle göstermek, Türkçe bir arayüzde kullanıcıya anlamsız gelir; kendi
      // uçlarımızın Türkçe `error` gövdeleri ise aynen geçer.
      if (/rate limit exceeded/i.test(body.error)) {
        return "Çok sık istek gönderildi — bir dakika bekleyip tekrar deneyin.";
      }
      return body.error;
    }
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

// Eşzamanlı 401'ler (açılışta benKimim + islemler + giden-evrak aynı anda tetiklenir,
// StrictMode'da iki kat) aynı refresh token'ı paylaşır; refresh tek kullanımlıktır
// (backend rotasyon) — yarışan her çağrı ayrı /auth/yenile atarsa kaybeden(ler) geçerli
// bir oturumu geçersiz sanıp token'ları siler. Tek-uçuş kilidi: eşzamanlı çağrılar aynı
// promise'i bekler, tek istek gider.
let refreshInFlight = null;

// Oturum ölümü aboneliği: refresh 401'i token'ları silince UI'ın da "anon"a düşmesi gerekir —
// önceden hiçbir yol AuthProvider'a haber vermiyordu; kullanıcı ölü oturumda takılı kalıyor,
// tüm yazma istekleri sessizce 401 yiyordu (bug avı bulgusu). AuthProvider mount'ta abone olur.
let oturumDustuFn = null;
export const oturumDustuAbone = (fn) => {
  oturumDustuFn = fn;
  return () => { if (oturumDustuFn === fn) oturumDustuFn = null; };
};

async function tryRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/auth/yenile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh() }),
      });
      if (res.status === 401) {
        tokens.clear(); // sunucu oturumu kesin geçersiz/iptal saydı — kalıcı çıkış doğru
        oturumDustuFn?.();
        return false;
      }
      if (!res.ok) return false; // 429/5xx/vb. geçici hata — oturumu bozma, bir sonrakinde tekrar denenir
      const data = await res.json();
      tokens.set(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false; // ağ hatası — geçici, token'lara dokunma
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
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
  const bloklariIsle = () => {
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const line = buf.slice(0, idx).split("\n").find((l) => l.startsWith("data:"));
      buf = buf.slice(idx + 2);
      const json = line ? line.slice(5).trim() : "";
      if (json) {
        try { onEvent(JSON.parse(json)); } catch { /* bozuk olay atlanır */ }
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    bloklariIsle();
  }
  // Kapanış chunk'ı ayraçsız gelebilir (usePipeline'da görülen hata ile aynı sınıf): decoder
  // flush + tamponda kalan SON event de işlenir — kurul akışının 'sonuc' event'i düşmesin.
  buf += decoder.decode();
  bloklariIsle();
  const sonSatir = buf.split("\n").find((l) => l.startsWith("data:"));
  const sonJson = sonSatir ? sonSatir.slice(5).trim() : "";
  if (sonJson) {
    try { onEvent(JSON.parse(sonJson)); } catch { /* bozuk olay atlanır */ }
  }
}

export async function apiDelete(path) {
  return apiFetch(path, { method: "DELETE" });
}

export async function apiPatch(path, body) {
  return apiFetch(path, { method: "PATCH", body });
}
