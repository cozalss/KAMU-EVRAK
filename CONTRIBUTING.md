# Katkı Rehberi

> **kamu-evrak** — TEKNOFEST 2026, 1. Senaryo. Bu rehber depoya katkı verirken uyulması
> gereken kurulum, test, kod stili ve teslim kurallarını özetler. Daha derin proje kuralları
> için [`CLAUDE.md`](CLAUDE.md) ve [`README.md`](README.md) dosyalarına bakın.

Tüm katkılar, issue'lar, PR açıklamaları ve commit mesajları **Türkçe** yazılır.

---

## 1. Kurulum

### Backend (Python 3.11 — FastAPI + LangGraph)

[`uv`](https://docs.astral.sh/uv/) kullanıyoruz.

```bash
cd backend
uv sync                 # çekirdek iskelet (hafif; model indirmesi yok)
uv sync --extra dev     # + test/lint (pytest, ruff, faker)
cp ../.env.example ../.env   # LLM_MODE=mock yeterli (anahtar gerekmez)
uv run main.py               # http://localhost:8000/docs — reload + LAN (mobil QR)
```

Opsiyonel ağır bileşenler (CI'da kurulmaz):

```bash
uv sync --extra rag     # mevzuat RAG motoru (qdrant/torch/embedding — ağır)
uv sync --extra llm     # lokal LLM (Qwen GGUF, llama-cpp-python)
```

### Frontend (Vite + React)

```bash
cd frontend
npm ci                  # package-lock.json'a sadık kurulum
npm run dev             # http://localhost:5173
npm run build           # üretim derlemesi → dist/
```

Tek komutla demo: `bash scripts/run-local-demo.sh`.

---

## 2. Test çalıştırma

Katkıyı göndermeden önce **üç kontrol de** lokalde geçmelidir (CI bunları tekrar koşar):

```bash
# Backend — lint + test (mock modda; LLM anahtarı gerekmez)
cd backend
uv run ruff check .
uv run pytest -q

# Frontend — derleme
cd ../frontend
npm run build
```

- Testler **mock modda** koşar (`LLM_MODE=mock`); ağır bağımlılık (rapidocr/pypdfium2 vb.)
  gerektiren testler `importorskip` ile zarifçe atlanır.
- Yeni özellik veya hata düzeltmesi için **önce test yazın (TDD)**; deterministik metrikler
  CI'da doğrulanır.

---

## 3. Kod stili

### Python

- **Ruff** lint + format standardımız (`backend/pyproject.toml` içindeki config):
  satır uzunluğu 100, hedef `py311`, `E/F/I/N/UP/B/SIM/RUF` kuralları.
  ```bash
  uv run ruff check .          # lint
  uv run ruff check --fix .    # otomatik düzelt
  uv run ruff format .         # biçimlendir
  ```
- **Dosya < 800 satır, fonksiyon < 50 satır.** Büyüyen modülü parçalayın.
- Değişken/fonksiyon isimleri **Latin** (`evrak_turu`, `tckn`); içerik metinleri tam **Türkçe
  karakterli** (ç, ş, ğ, İ).
- Hataları açıkça ele alın; sessizce yutmayın.

### Frontend

- Saf React + Vite; `react`/`react-dom` dışında ek bağımlılık eklemekten kaçının.
- a11y koru: klavye gezinme, ARIA, `prefers-reduced-motion`.

---

## 4. Proje kuralları (CLAUDE.md — kırmızı çizgiler)

Bunlar **şartname uyumu** ve ürün bütünlüğü için zorunludur:

1. **Uydurma mevzuat referansı YOK.** Madde no şüpheliyse `[DOĞRULA: ...]` placeholder bırakın;
   üretimden önce mevzuat.gov.tr'de doğrulayın.
2. **Gerçek PII / gerçek kamu verisi YOK.** Yalnız sentetik/kurgu evrak + kamuya açık mevzuat.
   Sahte örnek: `Ayşe Yılmaz`, `0555-123-4567`, checksum-geçerli **sahte** TCKN. Çıkarılan
   PII (TCKN/telefon) **maskelenir**.
3. **Hardcoded secret YOK.** Anahtarlar `.env` içinde (`.gitignore`'da); model **ağırlıkları
   repoya yüklenmez** (link + sürüm + lisans yeterli — şartname §7).
4. **AGPL bağımlılık YOK.** Depo MIT açık-kaynak; PDF için PyMuPDF değil `pypdfium2` (Apache/BSD).
5. Her yanıtta **yasal disclaimer** korunur ("karar-destek amaçlıdır; nihai sorumluluk yetkili
   personeldedir").

Lisans: bu depo **MIT** lisanslıdır ([`LICENSE`](LICENSE)).

---

## 5. Commit & PR akışı

### Commit mesajı

Konvansiyonel format, Türkçe açıklama:

```
<tür>: <kısa açıklama>

<opsiyonel gövde>
```

Türler: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

### Pull Request

1. `main`/`master`'tan dallanın: `git checkout -b feat/birim-yonlendirme`.
2. Değişikliği yapın + **test ekleyin**; üç lokal kontrolü (ruff / pytest / build) geçirin.
3. PR açın — [`pull_request_template.md`](.github/pull_request_template.md) otomatik yüklenir;
   test planını ve kontrol listesini doldurun.
4. **CI yeşil olmalı** (backend lint+test, frontend build) — kırmızıysa merge edilmez.
5. Hata/özellik için issue açacaksanız `.github/ISSUE_TEMPLATE/` altındaki şablonları kullanın.
