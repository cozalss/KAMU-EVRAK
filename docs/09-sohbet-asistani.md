# Spec 09 — Sohbet Asistanı (FAB + Chatbot)

> Çalışma alanının (app.html) sağ alt köşesine yuvarlak bir buton (FAB); tıklanınca açılan,
> hem **site rehberliği** yapan hem de **gelen/giden evrak · taslak · işlem geçmişi · panel
> istatistiği · mevzuat** sorgulayabilen araç-çağıran (tool-calling) sohbet asistanı.

## 1 · Amaç

- **Kullanıcı:** çalışma alanındaki memur/yetkili (auth'lu oturum).
- **Değer:** ekranlar arasında gezinmeden doğal dille "dün gelen evraklar neler?",
  "reddedilen giden evrakları göster", "risk bandı nedir?" sorabilmek.
- **Yarışma değeri:** Demo 15 puanına canlı, gerçek-veriyle konuşan asistan; Yenilikçilik 15
  puanına araçlı-asistan mimarisi (şartname iki görevin üstüne katma değer).

## 2 · Varsayımlar

1. Asistan yalnız **çalışma alanında** görünür (landing'e dokunulmaz — CLAUDE.md).
2. Evrak verisinin **kaynağı DB'dir** (`sorgu_repo`) — frontend oturum-state'i değil;
   pipeline zaten her işlemi DB'ye yazar, iki kaynak tutarlıdır.
3. Sohbet geçmişi **oturumluktur** (component state); DB'ye yazılmaz (KVKK yüzeyini büyütmez).
4. LLM erişimi yoksa/mock'taysa asistan **deterministik fallback** ile tam çalışır
   (projedeki her LLM node'uyla aynı sözleşme).

## 3 · Mimari

```
ChatbotWidget.jsx (FAB + panel, lazy)          backend/api/routes/sohbet.py
        │  POST /sohbet {mesaj, gecmis}                │
        └──────────────► authFetch ────────────────────┤
                                                       ▼
                                    1) NİYET TESPİTİ  (llm_json → yoksa keyword/regex)
                                    2) ARAÇ YÜRÜTME   (sorgu_repo / hybrid_ara / bilgi tabanı)
                                    3) YANIT KOMPOZ.  (llm_text → yoksa şablon)
                                                       │
        ◄── {yanit, intent, kayitlar, kayit_turu, oneri_gorunum, kaynak} ──┘
```

### 3.1 Backend — `POST /sohbet` (auth-korumalı, `kayitlar.py` deseni)

**İstek:** `{ mesaj: str(1..1000), gecmis: [{rol: "kullanici"|"asistan", icerik}] (son 8) }`

**Yanıt:**

| Alan | Tip | Açıklama |
|---|---|---|
| `yanit` | str (hafif markdown) | Doğal dil cevap (`**kalın**` + satır sonu) |
| `intent` | str | Tespit edilen niyet (aşağıdaki küme) |
| `kayitlar` | list \| null | Yapısal kayıtlar (UI kart olarak çizer) |
| `kayit_turu` | `"gelen"\|"giden"\|"taslak"\|"islem"\|"mevzuat"` \| null | Kart şablonu seçimi |
| `oneri_gorunum` | str \| null | "Görünüme git" butonu (`gelen/giden/taslaklar/mevzuat/denetim/panel`) |
| `kaynak` | `"llm"\|"fallback"` | Şeffaflık (health'teki `llm_active` deseni) |

**Niyet kümesi + araçlar** (hepsi `owner_id = current_user.id` ile — veri sızıntısı yok):

| Intent | Araç | Fallback tetikleyici (örnek) |
|---|---|---|
| `gelen_evrak` | `gelen_evrak_listele` | "gelen", "kuyruk", "bekleyen evrak" |
| `giden_evrak` | `giden_evrak_listele(durum,risk)` | "giden", "gönderilen", "reddedilen" |
| `taslaklar` | `taslak_listele` | "taslak" |
| `islem_gecmisi` | `islem_listele` | "işlem", "geçmiş", "işlenen" |
| `panel_ozet` | `panel_istatistik` | "kaç", "istatistik", "özet", "durum" |
| `mevzuat_ara` | `hybrid_ara(q)` | "mevzuat", "kanun", "yönetmelik", "KVKK" |
| `site_yardim` | statik bilgi tabanı | "nedir", "nasıl", "ne işe yarar" |
| `selamlama` / `genel` | — | "merhaba" / hiçbiri eşleşmezse |

Filtre çıkarımı deterministik de çalışır: "reddedilen" → `durum=reddedildi`,
"kırmızı/riskli" → `risk=kirmizi`, "son 5" → `limit=5`.

- **Niyet tespiti:** `llm_json(system, mesaj)` → `{intent, parametreler}`; `None` →
  `fallback_niyet(mesaj)` (saf fonksiyon, birim-testli).
- **Yanıt kompozisyonu:** `llm_text` araç sonucunu doğal cevaba çevirir; `None` →
  deterministik Türkçe şablon (kayıt sayısı + ilk kayıtların özeti).
- **Bilgi tabanı:** görünümler, pipeline node'ları, risk bandı, HITL, iki görev — modül
  içi sabit sözlük (mevzuat maddesi UYDURMAZ; yalnız site anlatır).
- **PII:** kayıtlar DB'den maskeli gelir; asistan ham evrak metni döndürmez.

### 3.2 Frontend — `ChatbotWidget.jsx` (lazy, `DashboardApp` içine monte)

- **FAB:** `position:fixed; right:24; bottom:24`, 58px daire, `T` degrade zemin, açıkken ✕;
  `aria-label`, `focusRing`, hover büyüme, `nu-ring` nabız halkası (reduced-motion'da kapalı).
- **Panel:** `fixed; right:24; bottom:96`, 384×~min(560px, 72vh), beyaz yüzey + `PAL.line`
  çerçeve + kart gölgesi, `nu-rise` girişi. Başlık (asistan adı + `kaynak` rozeti) · mesaj
  listesi (kullanıcı balonu `T`14 zemin, asistan beyaz) · kayıt kartları (MONO, `BANT` risk
  noktası, "Görünüme git" butonu `onNavigate`) · öneri çipleri (ilk açılış) · giriş satırı.
- **a11y:** `role="dialog"` + `aria-label`, Esc kapatır, açılınca input odaklanır,
  mesaj listesi `aria-live="polite"`, tüm tıklanabilirlerde `focusRing`.
- **Durumlar:** yükleniyor (üç nokta `nu-think`), hata (balon içinde uyarı + tekrar dene),
  boş geçmiş (karşılama + çipler). Geçmiş component state'te yaşar (görünüm değişse de kalır).
- **z-index:** FAB 150 / panel 160 — Toast(200) üstte kalır.
- **Tema:** yalnız `neonUi.jsx` token'ları (`T/V/R/PAL/BANT/SANS/MONO`); elle hex yok.

## 4 · Komutlar

- Backend test: `cd backend && uv run pytest tests/test_sohbet.py -q`
- Backend lint: `cd backend && uv run ruff check .`
- Backend dev: `cd backend && uv run main.py`
- Frontend dev: `cd frontend && npm run dev` (Vite proxy'ye `/sohbet` eklenir)

## 5 · Dosya Planı

| Dosya | İş |
|---|---|
| `backend/api/routes/sohbet.py` | Router: istek/yanıt modelleri + 3 aşamalı akış |
| `backend/agents/sohbet_niyet.py` | Saf fonksiyonlar: `fallback_niyet`, filtre çıkarımı, şablon yanıt, bilgi tabanı |
| `backend/tests/test_sohbet.py` | Birim (niyet/filtre/şablon) + route (dependency override) testleri |
| `backend/main.py` | `sohbet.router` kaydı |
| `frontend/src/components/ChatbotWidget.jsx` | FAB + panel + kayıt kartları |
| `frontend/src/DashboardApp.jsx` | Lazy mount + `onNavigate=goView` |
| `frontend/vite.config.js` | `/sohbet` proxy |

## 6 · Test Stratejisi

- **Birim (deterministik, LLM'siz):** her intent için ≥2 Türkçe söylem → doğru intent+filtre;
  şablon yanıt kayıt sayısını/başlıklarını içerir; bilinmeyen söylem → `genel`.
- **Route:** `TestClient` + `dependency_overrides` (get_current_user → sahte kullanıcı,
  get_session → sahte oturum); mock modda 200 + `kaynak="fallback"`; token'sız → 401/403.
- **Elle:** iki sunucu ayakta → FAB → "son gelen evraklar" → kart listesi + görünüme git.

## 7 · Sınırlar

- **Her zaman:** owner-scoped sorgu, PII maskeli, deterministik fallback, token'lı tema.
- **Önce sor:** yeni bağımlılık, DB şema değişikliği, sohbet geçmişini kalıcılaştırma.
- **Asla:** mevzuat maddesi uydurma (şüphede `[DOĞRULA: ...]`), landing'e dokunma,
  gerçek PII, AGPL bağımlılık.

## 8 · Başarı Kriterleri

1. FAB her görünümde sağ altta; tıklayınca panel açılır/kapanır (Esc dahil).
2. "son gelen evraklar" → gerçek DB kayıtları kart olarak listelenir.
3. "reddedilen giden evraklar" → `durum=reddedildi` filtreli sonuç.
4. "risk bandı nedir" → bilgi tabanından doğru site açıklaması.
5. `LLM_MODE=mock` iken tüm akış deterministik çalışır; `pytest tests/test_sohbet.py` yeşil.
6. `ruff check` temiz; dosyalar <800 satır, fonksiyonlar <50 satır.

## 9 · Açık Sorular

- Sohbet geçmişinin kalıcılaştırılması (DB) ileride istenirse ayrı faz (KVKK değerlendirmesiyle).

## 10 · V2 — Akış + Genişletilmiş Araç Seti (UYGULANDI)

- **`POST /sohbet/stream` (SSE):** `meta` (intent + kayıtlar + onay_bekleyen, araçlar biter
  bitmez) → `delta` (LLM token'ları, `chat_stream`) → `done` (kaynak + tam yanıt). LLM
  yok/hata/timeout → tek parça şablon delta'sı (aynı sözleşme). Frontend birincil olarak
  akışı kullanır; başarısızsa düz `POST /sohbet`'e düşer.
- **Yeni niyetler:** `mevzuat_katalog` (233 kayıt + kategoriler; dosya-tabanlı, DB'siz) ·
  `mevzuat_icerik` (kanun no/ada göre tam metin özeti) · `islem_detay` (tek işlemin
  ayrıntısı) · `denetim_dogrula` (hash zinciri bütünlük kontrolü) · `taslak_onayla` /
  `taslak_reddet` (HITL aksiyonu).
- **HITL aksiyon el sıkışması (iki adım, durumsuz):** aksiyon niyeti → yanıt
  `onay_bekleyen{eylem, islem_id, ad}` taşır ve teyit sorar; frontend butonları bir sonraki
  mesajda `onay_baglam` olarak aynen geri gönderir; yalnız açık olumlu teyit (`onay_teyit`)
  `onayla_ve_gonder`'ı çağırır (buton akışıyla aynı rol kapısı: memur+). Vazgeç → eylem yok.
- **İstek/Yanıt ekleri:** `SohbetIstek.onay_baglam` · `SohbetYanit.onay_bekleyen`.
- Kaynak dokümantasyon: FastAPI SSE (`StreamingResponse`, `text/event-stream`) — context7
  üzerinden güncel sürüm (0.138) doğrulandı.
