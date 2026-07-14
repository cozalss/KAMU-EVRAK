/* authApi refresh-rotasyon testleri — `node --test src/lib/authApi.test.js` (bağımlılıksız, saf).
   Sözleşme: hızlı art arda reload'da benKimim + islemler + giden-evrak gibi eşzamanlı 401'ler
   TEK /auth/yenile isteği paylaşır (tek-uçuş kilidi) — aksi halde tek-kullanımlık rotasyonda
   yarışı kaybeden çağrı geçerli bir oturumu geçersiz sanıp token'ları siler (regresyon: "2-3
   reload'da sign-in'e düşme" hatası). Ayrıca: refresh'te geçici hata (429/5xx/ağ) token'ları
   SİLMEZ; yalnız kesin 401 (oturum_gecersiz) siler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { authFetch, apiGet, tokens } from "./authApi.js";

function sahteLocalStorage() {
  const depo = new Map();
  return {
    getItem: (k) => (depo.has(k) ? depo.get(k) : null),
    setItem: (k, v) => depo.set(k, String(v)),
    removeItem: (k) => depo.delete(k),
  };
}

test("eşzamanlı 401'ler tek /auth/yenile isteği üretir (tek-uçuş kilidi)", async () => {
  global.localStorage = sahteLocalStorage();
  tokens.set("eski-access", "eski-refresh");

  let yenileCagriSayisi = 0;
  global.fetch = async (url, opts) => {
    if (url === "/auth/yenile") {
      yenileCagriSayisi += 1;
      await new Promise((r) => setTimeout(r, 20)); // eşzamanlı çağrıları simüle et
      return { ok: true, status: 200, json: async () => ({ access_token: "yeni-access", refresh_token: "yeni-refresh" }) };
    }
    const auth = opts?.headers?.Authorization || "";
    if (auth === "Bearer yeni-access") return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: false, status: 401, json: async () => ({ detail: "süresi doldu" }) };
  };

  const sonuclar = await Promise.all([
    authFetch("/korumali-1"),
    authFetch("/korumali-2"),
    authFetch("/korumali-3"),
  ]);

  assert.equal(yenileCagriSayisi, 1, "eşzamanlı 401'ler tek /auth/yenile isteğini paylaşmalı");
  assert.ok(sonuclar.every((r) => r.ok), "tek-uçuş sonrası her çağrı yeni token'la başarılı olmalı");
  assert.equal(tokens.access(), "yeni-access");
});

test("refresh'te geçici hata (429) token'ları SİLMEZ", async () => {
  global.localStorage = sahteLocalStorage();
  tokens.set("access", "refresh-1");

  global.fetch = async (url) => {
    if (url === "/auth/yenile") return { ok: false, status: 429, json: async () => ({ detail: "çok istek" }) };
    return { ok: false, status: 401, json: async () => ({ detail: "süresi doldu" }) };
  };

  await assert.rejects(() => apiGet("/korumali"));
  assert.equal(tokens.refresh(), "refresh-1", "429 geçici hata — refresh token silinmemeli");
});

test("refresh'te kesin 401 (oturum_gecersiz) token'ları SİLER", async () => {
  global.localStorage = sahteLocalStorage();
  tokens.set("access", "refresh-1");

  global.fetch = async (url) => ({ ok: false, status: 401, json: async () => ({ detail: "oturum_gecersiz" }) });

  await assert.rejects(() => apiGet("/korumali"));
  assert.equal(tokens.refresh(), "", "kesin 401 — refresh token silinmeli (gerçek çıkış)");
});
