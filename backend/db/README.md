# kamu-evrak — Persistence Katmanı (Supabase / PostgreSQL)

Oturum-içi (stateless) pipeline'ı **kalıcı, çok-kullanıcılı, denetlenebilir** backend'e taşıyan
katman. Tasarım: [docs/database-schema.md](../../docs/database-schema.md). Şema tek-doğruluk:
[`schema.sql`](schema.sql).

## Yığın
SQLAlchemy 2.0 async + asyncpg · Alembic · pgvector/pgcrypto/pg_trgm · argon2 + JWT.

## .env (gitignore)
```
DATABASE_URL=postgresql+asyncpg://...@...pooler.supabase.com:6543/postgres   # app (txn pooler)
DATABASE_URL_SYNC=postgresql+psycopg://...@...pooler.supabase.com:5432/postgres  # DDL (session)
AUTH_JWT_SECRET=...           # uygulama JWT imza anahtarı (access 15dk / refresh 7g)
DB_PERSIST=0                  # 1 → /process_doc koşumlarını DB'ye yazar (varsayılan kapalı)
```

## Kurulum (sıfırdan)
```bash
uv run python -m db.apply_schema       # şema (24 tablo+enum+indeks+trigger+RLS) — idempotent
uv run python -m db.seed_referans      # evrak_turu(19)/yazi_turu(6)/birim(9)
uv run python -m db.seed_mevzuat_db    # mevzuat(233)/madde(1492)/chunk(1506) + tsv
uv run alembic stamp 0001_baseline     # mevcut şemayı baseline'a damgala
# (sıfır DB'de: uv run alembic upgrade head)
```
Migration zinciri: `0001_baseline` → `0002_giden_taslak_uniq` → `0003_owner_liste_idx`
→ `0004_onay_taslak_uniq` → `0005_alt_talep_uniq_fk_idx` (alt_talep(islem_id,sira) UNIQUE +
bilgi_unsuru/kanit_span FK indeksleri). Mevcut DB'de: `uv run alembic upgrade head`.

## Paket
| Dosya | Sorumluluk |
|---|---|
| `session.py` | async engine + `get_session` (FastAPI dependency) |
| `models.py` | 24 tablo ORM (schema.sql ile birebir) |
| `repositories/islem_repo.py` | `evrak_olustur`, `persist_islem` (ProcessResponse → islem+normalize) |
| `repositories/denetim_repo.py` | `persist_denetim`, `dogrula_denetim` (SHA-256 hash-zinciri) |
| `repositories/mevzuat_repo.py` | `hybrid_ara` (BM25 OR + trgm fallback) |
| `repositories/sorgu_repo.py` | panel istatistik + liste okuyucular |
| `repositories/persist_run.py` | ENV-gated pipeline koşum kalıcılaştırma |

## REST (auth-korumalı — `Authorization: Bearer <access>`)
`POST /auth/kayit·giris·yenile·cikis` · `GET /auth/ben`
`GET /panel/istatistik` · `/mevzuat/ara?q=` · `/gelen-evrak` · `/giden-evrak` · `/taslaklar`
`GET /islem/{id}` · `/islem/{id}/denetim/dogrula`

## Güvenlik / KVKK
- Backend `postgres` ile bağlanır → RLS bypass (yetki **uygulama katmanında**: JWT + repository).
  RLS, Supabase PostgREST `anon` rolüne karşı savunma (hassas tablo = default-deny).
  **Mimari kısıt:** tüm trafik backend REST'ten geçmeli — frontend'e doğrudan Supabase
  client (anon-key) erişimi eklenirse bu izolasyon çöker.
- Ham PII kolonu **yok** — yalnız maskeli (`deger_maskeli`, maskeli `ocr_metni`).
- `denetim_adimi` append-only (trigger): UPDATE yasak; DELETE yalnız `SET LOCAL
  app.denetim_silmeye_izin='on'` (kontrollü imha / 3473 saklama).
- `parola_hash`/refresh token saklanmaz (argon2id / SHA-256 hash).

## Dayanıklılık / operasyon (2026-07-17 DB denetimi)
- **Bağlantı sigortası** (`session.py`): runtime engine `server_settings` ile
  `statement_timeout=15s` + `idle_in_transaction_session_timeout=10s` (env:
  `DB_STATEMENT_TIMEOUT_MS`/`DB_IDLE_TX_TIMEOUT_MS`) — sızmış tek transaction free-tier
  pooler slotlarını süresiz kilitlemesin.
- **Tam yedek** (`.github/workflows/db-backup.yml`): haftalık `pg_dump -Fc` → GitHub
  artifact (30 gün). `DATABASE_URL_SYNC` secret'ı ile aktif; yoksa job temiz atlar.
  Denetim tabloları AYRICA `db.yedek_denetim` ile JSON (Sayıştay kanıtı, ana yedekten bağımsız).
  Elle: `pg_dump "$DATABASE_URL_SYNC" -Fc -f data/backups/kamu_evrak_$(date +%Y%m%d).dump`

## Canlı smoke (CI'da değil — `uv run python -m db.<ad>`)
`smoke_auth` · `smoke_islem` · `smoke_denetim` · `smoke_api` · `smoke_persist_run`
(her biri test verisini kontrollü siler).
