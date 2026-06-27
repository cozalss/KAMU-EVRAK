# kamu-evrak — Veritabanı Şeması & Yapılacaklar (Teslim Dokümanı)

> **Amaç:** Şu an oturum-içi (stateless / frontend-state) çalışan sistemi **kalıcı, çok-kullanıcılı, denetlenebilir** bir backend'e taşımak için tam veritabanı tasarımı + uygulama yol haritası. Şema gerçek veri modeline (`ProcessResponse`, `YaziContext`, mevzuat korpusu, frontend `outbox`/`history`) **birebir** dayanır.
>
> **KVKK (CLAUDE.md §2/§6.5):** Ham PII (TCKN/telefon/IBAN) **kalıcı saklanmaz**. Veritabanına **yalnız maskeli** değerler yazılır (`123****8901`). Tüm tablolarda PII alanı yoktur; kanıt span'ları maskeli metin üzerinde tutulur.

---

## 0. Teknoloji Yığını

| Katman | Seçim | Gerekçe |
|---|---|---|
| RDBMS | **PostgreSQL 16** | ACID + JSONB + RLS (satır-güvenliği) + denetim için ideal |
| Vektör | **pgvector** (`vector` uzantısı) | Mevzuat-RAG embedding (tek DB, Qdrant'a alternatif) |
| Hash/UUID | **pgcrypto** + `gen_random_uuid()` | Denetim hash-zinciri + UUID PK |
| Tam-metin | PostgreSQL **GIN** + `tsvector` (Türkçe config) | Mevzuat/evrak arama (BM25 hibrit) |
| ORM | **SQLAlchemy 2.0** (async) + **asyncpg** | FastAPI ile async |
| Migration | **Alembic** | Versiyonlu şema |
| Auth | **JWT** (access+refresh) + bcrypt/argon2 | Rol-tabanlı erişim |

**Uzantılar (migration 0001):**
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- bulanık arama / typo tolerans
```

---

## 1. ER Diyagramı (özet)

```
birim 1─N kullanici 1─N oturum
birim 1─N gelen_evrak ─1─ islem 1─N islem_adimi
                              │
                              ├─1─ N bilgi_unsuru ─1─N kanit_span
                              ├─1─ N alt_talep
                              ├─1─ N mevzuat_oneri ─N─1 mevzuat
                              ├─1─1 risk_degerlendirme
                              ├─1─1 sla_takip
                              ├─1─1 taslak ─1─N onay ─1─1 giden_evrak
                              └─1─1 denetim_izi ─1─N denetim_adimi   (SHA-256 zincir)

mevzuat 1─N mevzuat_madde 1─N mevzuat_chunk (+ embedding vector)
```

---

## 2. ENUM Türleri (migration 0002)

```sql
CREATE TYPE rol_turu        AS ENUM ('memur', 'yetkili', 'yonetici', 'sistem');
CREATE TYPE risk_bandi      AS ENUM ('yesil', 'sari', 'kirmizi');
CREATE TYPE islem_durumu    AS ENUM ('kuyrukta', 'isleniyor', 'onay_bekliyor', 'tamamlandi', 'hata');
CREATE TYPE onay_karari     AS ENUM ('bekliyor', 'onaylandi', 'duzenlendi', 'reddedildi');
CREATE TYPE giden_durumu    AS ENUM ('gonderildi', 'duzenlendi', 'reddedildi');
CREATE TYPE sla_durumu      AS ENUM ('normal', 'kritik', 'gecikmis', 'tanimsiz', 'tarih_yok');
CREATE TYPE madde_turu      AS ENUM ('normal', 'ek', 'gecici', 'mukerrer');
CREATE TYPE adim_statusu    AS ENUM ('pending', 'active', 'done', 'error');
```

> **Genişleyebilen kümeler** (evrak türü 18+, birim, yazı türü 6) ENUM yerine **referans tabloları** (lookup) ile tutulur → yeni tür eklerken migration gerekmez (§3.0).

---

## 3. Tablolar (DDL)

### 3.0 Referans (lookup) tabloları

```sql
-- Evrak türleri (config.EVRAK_TURLERI: dilekce, sikayet, ... + belirsiz) — 18+1
CREATE TABLE evrak_turu (
    kod          TEXT PRIMARY KEY,              -- 'dilekce'
    etiket_tr    TEXT NOT NULL,                 -- 'Dilekçe'
    aktif        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Yazı türleri (config.YAZI_TURLERI: ust_yazi, cevabi_yazi, ..., muzekkere, gorus_mutalaa)
CREATE TABLE yazi_turu (
    kod          TEXT PRIMARY KEY,
    etiket_tr    TEXT NOT NULL,
    varsayilan_kapanis TEXT NOT NULL DEFAULT 'Gereğini arz ederim.',
    sablon_dosya TEXT NOT NULL                  -- 'cevabi_yazi.j2'
);

-- Birimler (config.BIRIM_TR: yazi_isleri_evrak, hukuk_musavirligi, cimer, ...)
CREATE TABLE birim (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kod          TEXT UNIQUE NOT NULL,          -- 'hukuk_musavirligi'
    ad           TEXT NOT NULL,                 -- 'Hukuk Müşavirliği'
    ust_birim_id UUID REFERENCES birim(id),     -- hiyerarşi (self-FK)
    aktif        BOOLEAN NOT NULL DEFAULT TRUE
);
```

### 3.1 Kimlik & Yetki (RBAC)

```sql
CREATE TABLE kullanici (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eposta        TEXT UNIQUE NOT NULL,
    parola_hash   TEXT NOT NULL,                -- argon2id / bcrypt
    ad_soyad      TEXT NOT NULL,
    unvan         TEXT NOT NULL DEFAULT '',     -- 'Yazı İşleri Müdürü' (imza bloğu)
    rol           rol_turu NOT NULL DEFAULT 'memur',
    birim_id      UUID NOT NULL REFERENCES birim(id),
    e_imza_yetkisi BOOLEAN NOT NULL DEFAULT FALSE,  -- Yön. 2646 e-imza (giden onayı)
    aktif         BOOLEAN NOT NULL DEFAULT TRUE,
    son_giris     TIMESTAMPTZ,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oturum (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id  UUID NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,           -- ham token saklanmaz
    ip            INET,
    user_agent    TEXT,
    gecerli_son   TIMESTAMPTZ NOT NULL,
    iptal         BOOLEAN NOT NULL DEFAULT FALSE,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Gelen Evrak (incoming) + ekler

```sql
CREATE TABLE gelen_evrak (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evrak_no      TEXT UNIQUE NOT NULL,         -- 'E-2026/0001' (sistem üretir)
    baslik        TEXT NOT NULL DEFAULT '',     -- dosya adı / örnek etiketi
    kaynak        TEXT NOT NULL DEFAULT 'yukleme', -- 'yukleme' | 'ornek' | 'ebys' | 'kep'
    ocr_metni     TEXT NOT NULL,                -- MASKELİ tam metin (PII yok)
    ocr_engine    TEXT,                         -- 'rapidocr' | 'pdfium' | ...
    ocr_confidence REAL,
    sayfa_sayisi  INT,
    dosya_boyut   BIGINT,                       -- byte
    mime_turu     TEXT,
    gelis_birim_id UUID REFERENCES birim(id),
    atanan_kullanici_id UUID REFERENCES kullanici(id),
    olusturan_id  UUID NOT NULL REFERENCES kullanici(id),
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evrak_eki (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gelen_evrak_id UUID NOT NULL REFERENCES gelen_evrak(id) ON DELETE CASCADE,
    dosya_adi     TEXT NOT NULL,
    depo_yolu     TEXT NOT NULL,                -- S3/MinIO objesi (DB'de bytes tutulmaz)
    mime_turu     TEXT,
    boyut         BIGINT
);
```

### 3.3 İşleme (pipeline koşumu) — `ProcessResponse` karşılığı

```sql
-- Bir gelen evrakın bir pipeline koşumu (yeniden işlenebilir → 1─N).
CREATE TABLE islem (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gelen_evrak_id UUID NOT NULL REFERENCES gelen_evrak(id) ON DELETE CASCADE,
    thread_id     TEXT NOT NULL,                -- LangGraph thread (HITL resume)
    durum         islem_durumu NOT NULL DEFAULT 'kuyrukta',
    -- Görev 1 çıktıları
    evrak_turu_kod TEXT REFERENCES evrak_turu(kod),
    tur_confidence REAL DEFAULT 0,
    bilgi_unsurlari JSONB NOT NULL DEFAULT '{}', -- esnek; normalize: bilgi_unsuru tablosu
    eksik_alanlar  TEXT[] NOT NULL DEFAULT '{}',
    clarify_questions TEXT[] NOT NULL DEFAULT '{}',
    ozet          TEXT NOT NULL DEFAULT '',
    -- Görev 2 / yönlendirme
    hedef_birim_id UUID REFERENCES birim(id),
    birim_alternatifleri TEXT[] NOT NULL DEFAULT '{}',
    -- doğrulama / risk
    format_uyumlu BOOLEAN NOT NULL DEFAULT FALSE,
    verify_uyari  TEXT[] NOT NULL DEFAULT '{}',
    verify_notes  TEXT NOT NULL DEFAULT '',
    bilgilendirme TEXT NOT NULL DEFAULT '',
    -- esnek metadata (normalize edilmeyen node çıktıları)
    arsiv_metadata JSONB NOT NULL DEFAULT '{}',  -- {sdp_kodu, saklama_suresi}
    sla_metadata   JSONB NOT NULL DEFAULT '{}',
    risk_metadata  JSONB NOT NULL DEFAULT '{}',  -- {bant, skor, gerekceler[]}
    kanit_metadata JSONB NOT NULL DEFAULT '{}',  -- {metin, spanlar[]}  (maskeli)
    -- süreç
    baslangic     TIMESTAMPTZ NOT NULL DEFAULT now(),
    bitis         TIMESTAMPTZ,
    sure_ms       INT
);

-- Canlı SSE akışının kalıcı izi (her node bir satır).
CREATE TABLE islem_adimi (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira          INT NOT NULL,                 -- 1..16
    node_kod      TEXT NOT NULL,                -- 'oku', 'siniflandir', ...
    gorev         SMALLINT NOT NULL,            -- 1=anlama 2=üretim
    status        adim_statusu NOT NULL DEFAULT 'pending',
    ozet          TEXT,                         -- node._node_summary()
    veri          JSONB,                        -- node.data (SSE 'data')
    baslangic     TIMESTAMPTZ,
    bitis         TIMESTAMPTZ,
    UNIQUE (islem_id, sira)
);

-- Çıkarılan bilgi unsurları (normalize, MASKELİ değer).
CREATE TABLE bilgi_unsuru (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    alan          TEXT NOT NULL,                -- 'gonderen', 'tckn', 'tarih', 'konu', 'telefon'
    etiket_tr     TEXT NOT NULL,                -- 'Gönderen', 'T.C. Kimlik No'
    deger_maskeli TEXT NOT NULL,                -- '123****8901'  (HAM PII YOK)
    guven         REAL DEFAULT 0
);

-- Kanıt bağlama (deger ↔ kaynak metin span'ı) — maskeli metin üzerinde.
CREATE TABLE kanit_span (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    bilgi_unsuru_id UUID REFERENCES bilgi_unsuru(id) ON DELETE CASCADE,
    alan          TEXT NOT NULL,
    etiket        TEXT NOT NULL,
    deger         TEXT NOT NULL,                -- maskeli substring
    span_start    INT NOT NULL,
    span_end      INT NOT NULL
);

-- Çok-konulu ayrıştırma (decompose).
CREATE TABLE alt_talep (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira          INT NOT NULL,
    ozet          TEXT NOT NULL,
    tur_kod       TEXT REFERENCES evrak_turu(kod),
    hedef_birim_id UUID REFERENCES birim(id),
    yazi_turu_kod TEXT REFERENCES yazi_turu(kod),
    cevap_suresi  TEXT,                         -- '30 gün (3071 s.K. m.7)'
    sla_durum     sla_durumu DEFAULT 'tanimsiz'
);

-- Risk değerlendirme (risk_guard).
CREATE TABLE risk_degerlendirme (
    islem_id      UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    bant          risk_bandi NOT NULL,
    skor          REAL NOT NULL DEFAULT 0,
    gerekceler    TEXT[] NOT NULL DEFAULT '{}'
);

-- Yasal süre triyaj (sla_triyaj).
CREATE TABLE sla_takip (
    islem_id      UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    durum         sla_durumu NOT NULL DEFAULT 'tanimsiz',
    baslangic_tarihi DATE,
    son_tarih     DATE,
    kalan_gun     INT,
    dayanak       TEXT                          -- '3071 s.K. m.7 (30 gün)'
);
```

### 3.4 Mevzuat önerileri (işlem-başına) → mevzuat FK

```sql
CREATE TABLE mevzuat_oneri (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    mevzuat_id    UUID REFERENCES mevzuat(id),  -- korpus eşleşmesi (varsa)
    madde_id      UUID REFERENCES mevzuat_madde(id),
    baslik        TEXT NOT NULL,                -- '3071 s.K. m.4'
    snippet       TEXT,
    url           TEXT,
    score         REAL DEFAULT 0,
    nli_destek    REAL                          -- madde ⊨ talep entailment (opsiyonel)
);
```

### 3.5 Resmî Yazı Taslağı + HITL Onay + Giden Evrak

```sql
CREATE TABLE taslak (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    yazi_turu_kod TEXT NOT NULL REFERENCES yazi_turu(kod),
    konu          TEXT NOT NULL DEFAULT '',
    metin_md      TEXT NOT NULL,                -- yazi_taslak_md (render düz-metin)
    format_uyumlu BOOLEAN NOT NULL DEFAULT FALSE,
    eksik_format_alanlari TEXT[] NOT NULL DEFAULT '{}',
    pdf_yolu      TEXT,                         -- S3/MinIO (bytes DB'de değil)
    docx_yolu     TEXT,
    surum         INT NOT NULL DEFAULT 1,       -- düzenle → yeni sürüm
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HITL onay kapısı (interrupt → memur kararı).
CREATE TABLE onay (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taslak_id     UUID NOT NULL REFERENCES taslak(id) ON DELETE CASCADE,
    karar         onay_karari NOT NULL DEFAULT 'bekliyor',
    karar_veren_id UUID REFERENCES kullanici(id),  -- yetkili
    duzenlenen_metin TEXT,                      -- karar='duzenlendi'
    gerekce       TEXT,                         -- karar='reddedildi'
    karar_zamani  TIMESTAMPTZ,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onaylanıp gönderilen resmî yazı (frontend outbox karşılığı).
CREATE TABLE giden_evrak (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giden_no      TEXT UNIQUE NOT NULL,         -- 'E-G-2026/0001'
    taslak_id     UUID NOT NULL REFERENCES taslak(id),
    kaynak_evrak_id UUID REFERENCES gelen_evrak(id),
    konu          TEXT NOT NULL DEFAULT '',
    alici_birim_id UUID REFERENCES birim(id),
    yazi_turu_kod TEXT REFERENCES yazi_turu(kod),
    risk          risk_bandi,
    durum         giden_durumu NOT NULL DEFAULT 'gonderildi',
    gonderen_id   UUID NOT NULL REFERENCES kullanici(id),
    son_hash      TEXT,                         -- denetim_izi.son_hash kopyası
    gonderim_tarihi TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.6 Denetim İzi (tamper-evident SHA-256 hash-zinciri)

```sql
CREATE TABLE denetim_izi (
    islem_id      UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    kok_hash      TEXT NOT NULL,                -- genesis
    son_hash      TEXT NOT NULL,
    adim_sayisi   INT NOT NULL,
    butunluk      BOOLEAN NOT NULL DEFAULT TRUE,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zincir adımları (append-only; UPDATE/DELETE tetikleyiciyle yasaklanır).
CREATE TABLE denetim_adimi (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira          INT NOT NULL,
    adim_adi      TEXT NOT NULL,                -- node adı
    karar_json    JSONB NOT NULL,               -- kanonik JSON (hash girdisi)
    onceki_hash   TEXT NOT NULL,
    hash          TEXT NOT NULL,                -- SHA256(onceki_hash || kanonik_json)
    zaman         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (islem_id, sira)
);
```

### 3.7 Mevzuat Korpusu (RAG) — 212 mevzuat / ~1372 chunk

```sql
CREATE TABLE mevzuat (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kanun_no      TEXT NOT NULL,                -- '3071', 'CB 2646'
    baslik        TEXT NOT NULL,
    kunye         TEXT,                         -- kabul/RG + yürürlük
    kaynak_url    TEXT,                         -- mevzuat.gov.tr
    kaynak_dosya  TEXT UNIQUE,                  -- '3071_dilekce_hakki_kanunu.txt'
    yururlukte    BOOLEAN NOT NULL DEFAULT TRUE,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mevzuat_madde (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mevzuat_id    UUID NOT NULL REFERENCES mevzuat(id) ON DELETE CASCADE,
    madde_no      TEXT NOT NULL,                -- '4', '7/A'
    madde_turu    madde_turu NOT NULL DEFAULT 'normal',
    baslik        TEXT,
    metin         TEXT NOT NULL,                -- madde özeti (kamuya açık)
    dogrula_isareti BOOLEAN NOT NULL DEFAULT FALSE  -- '[DOĞRULA: ...]' içeriyor mu
);

CREATE TABLE mevzuat_chunk (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mevzuat_id    UUID NOT NULL REFERENCES mevzuat(id) ON DELETE CASCADE,
    madde_id      UUID REFERENCES mevzuat_madde(id) ON DELETE CASCADE,
    metin         TEXT NOT NULL,
    tsv           tsvector,                     -- tam-metin (BM25 hibrit)
    embedding     vector(768)                   -- pgvector (model: e5/bge-tr)
);
```

### 3.8 Bildirim & sistem (opsiyonel)

```sql
CREATE TABLE bildirim (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id  UUID NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    tur           TEXT NOT NULL,                -- 'onay_bekliyor', 'sla_kritik'
    mesaj         TEXT NOT NULL,
    ilgili_islem_id UUID REFERENCES islem(id),
    okundu        BOOLEAN NOT NULL DEFAULT FALSE,
    olusturuldu   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. İndeksler (migration 00xx)

```sql
-- Sık FK + filtre
CREATE INDEX ix_kullanici_birim       ON kullanici(birim_id);
CREATE INDEX ix_gelen_evrak_birim     ON gelen_evrak(gelis_birim_id, olusturuldu DESC);
CREATE INDEX ix_gelen_evrak_atanan    ON gelen_evrak(atanan_kullanici_id);
CREATE INDEX ix_islem_evrak           ON islem(gelen_evrak_id);
CREATE INDEX ix_islem_durum           ON islem(durum, baslangic DESC);
CREATE INDEX ix_islem_thread          ON islem(thread_id);
CREATE INDEX ix_adim_islem            ON islem_adimi(islem_id, sira);
CREATE INDEX ix_oneri_islem           ON mevzuat_oneri(islem_id);
CREATE INDEX ix_taslak_islem          ON taslak(islem_id);
CREATE INDEX ix_onay_taslak           ON onay(taslak_id, karar);
CREATE INDEX ix_giden_birim           ON giden_evrak(alici_birim_id, gonderim_tarihi DESC);
CREATE INDEX ix_giden_durum_risk      ON giden_evrak(durum, risk);
CREATE INDEX ix_denetim_adim          ON denetim_adimi(islem_id, sira);

-- Filtreleme (frontend FilterBar: risk/durum/tür/birim/tarih)
CREATE INDEX ix_giden_tarih           ON giden_evrak(gonderim_tarihi);
CREATE INDEX ix_islem_risk            ON risk_degerlendirme(bant);

-- JSONB metadata sorguları
CREATE INDEX ix_islem_risk_meta       ON islem USING GIN (risk_metadata);
CREATE INDEX ix_islem_arsiv_meta      ON islem USING GIN (arsiv_metadata);

-- Mevzuat arama: hibrit (BM25 tsvector + vektör)
CREATE INDEX ix_chunk_tsv             ON mevzuat_chunk USING GIN (tsv);
CREATE INDEX ix_chunk_embedding       ON mevzuat_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ix_chunk_trgm            ON mevzuat_chunk USING GIN (metin gin_trgm_ops);  -- typo tolerans
CREATE INDEX ix_madde_mevzuat         ON mevzuat_madde(mevzuat_id);
```

---

## 5. Güvenlik & Bütünlük (KVKK + Sayıştay)

### 5.1 Denetim zinciri değiştirilemezliği (trigger)
```sql
-- denetim_adimi UPDATE/DELETE engelle (append-only).
CREATE OR REPLACE FUNCTION denetim_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'denetim_adimi değiştirilemez (tamper-evident)';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_denetim_no_update BEFORE UPDATE OR DELETE ON denetim_adimi
    FOR EACH ROW EXECUTE FUNCTION denetim_immutable();
```

### 5.2 Satır-Güvenliği (RLS) — birim-bazlı + KVKK
```sql
ALTER TABLE gelen_evrak ENABLE ROW LEVEL SECURITY;
-- Memur: yalnız kendi birimi/atanan evrakı; yönetici: hepsi.
CREATE POLICY p_gelen_birim ON gelen_evrak USING (
    current_setting('app.rol') = 'yonetici'
    OR gelis_birim_id = current_setting('app.birim_id')::uuid
    OR atanan_kullanici_id = current_setting('app.kullanici_id')::uuid
);
-- Aynı kalıp: islem, taslak, giden_evrak, onay için.
```

### 5.3 KVKK kuralları (şema-düzeyi garanti)
- **Ham PII alanı YOK** — `gelen_evrak.ocr_metni` ve tüm `deger_maskeli`/`kanit_span` alanları **maskeli** yazılır (uygulama sınırında maskeleme; DB sözleşmesi).
- PDF/DOCX/ek dosyaları **DB'de değil** nesne depoda (S3/MinIO), erişim imzalı-URL + RLS.
- `oturum.refresh_token_hash`, `kullanici.parola_hash` — ham değer asla saklanmaz.
- Saklama süresi: `arsiv_metadata.saklama_suresi` (SDP 2005/7) → otomatik imha job'ı (3473 s.K.).

---

## 6. ✅ YAPILACAKLAR — Uygulama Yol Haritası

> Sırayla; her madde bir PR. Mevcut stateless pipeline'ı **bozmadan** persistence katmanı eklenir.

### Faz 1 — Altyapı
- [ ] PostgreSQL 16 + pgvector + pgcrypto + pg_trgm kur (docker-compose servisi).
- [ ] `backend/db/` paketi: SQLAlchemy 2.0 async engine + `asyncpg`, session factory, `.env` `DATABASE_URL`.
- [ ] Alembic kur; `migration 0001` (uzantılar) + `0002` (enum) + `0003` (referans tablolar).
- [ ] Referans seed: `evrak_turu` (config.EVRAK_TURLERI), `yazi_turu` (config.YAZI_TURLERI + registry), `birim` (config.BIRIM_TR).

### Faz 2 — Kimlik & Yetki
- [ ] `kullanici` + `oturum` tabloları + migration.
- [ ] Auth servisi: kayıt/giriş, argon2 parola, JWT (access 15dk + refresh 7g), refresh-rotation.
- [ ] FastAPI bağımlılığı `get_current_user` + rol kontrolü (`require_role('yetkili')`).
- [ ] RLS oturum değişkenleri (`app.rol`, `app.birim_id`, `app.kullanici_id`) middleware'de set et.

### Faz 3 — Evrak & İşleme persistence
- [ ] `gelen_evrak` + `evrak_eki` (ekler MinIO'ya, meta DB'ye).
- [ ] `/process_doc/stream` → koşum başlarken `islem` satırı (durum=isleniyor); her SSE node → `islem_adimi` upsert.
- [ ] `ProcessResponse` → `islem` (skaler/JSONB) + normalize: `bilgi_unsuru`, `kanit_span`, `alt_talep`, `mevzuat_oneri`, `risk_degerlendirme`, `sla_takip`.
- [ ] Repository deseni: `IslemRepository`, `EvrakRepository` (findAll/findById/create/update).

### Faz 4 — Taslak & HITL & Giden
- [ ] `taslak` (PDF/DOCX MinIO'ya, yol DB'ye) — render sonrası kaydet.
- [ ] `onay` — HITL `interrupt()` → `onay(bekliyor)`; `/process_doc/resume` → kararı yaz (onaylandi/duzenlendi/reddedildi).
- [ ] Onay='onaylandi/duzenlendi' → `giden_evrak` satırı (`E-G-YYYY/NNNN` üret) + `son_hash` kopyala.
- [ ] Çift-gönderim guard'ı DB unique (`giden_evrak.taslak_id` üzerinde kısmi unique).

### Faz 5 — Denetim İzi (kalıcı)
- [ ] `denetim_izi` + `denetim_adimi` yaz (mevcut SHA-256 hash-chain mantığı → DB).
- [ ] Append-only trigger + bütünlük doğrulama endpoint'i (`GET /islem/{id}/denetim/dogrula`).

### Faz 6 — Mevzuat Korpusu DB'ye
- [ ] `mevzuat` + `mevzuat_madde` + `mevzuat_chunk` migration.
- [ ] **Seed script** (`scripts/seed_mevzuat_db.py`): `data/mevzuat/*.txt` → chunk → 212 mevzuat / 1372 chunk INSERT; `tsv` (Türkçe config) + `embedding` (e5/bge-tr) doldur.
- [ ] `mevzuat_oner` node → DB hibrit retrieval (tsvector BM25 + `ivfflat` vektör + RRF birleştirme); mevcut JSON-index fallback kalsın.

### Faz 7 — API & Görünümler (frontend bağla)
- [ ] REST: `/gelen-evrak`, `/giden-evrak`, `/taslaklar`, `/denetim`, `/mevzuat`, `/panel/istatistik` (filtre+sayfalama — FilterBar parametreleri: arama/risk/durum/tür/birim/tarih/sıralama).
- [ ] Frontend `usePipeline` + view'ler oturum-state yerine API'den besle (gelen/giden/taslak/denetim).
- [ ] Panel istatistikleri SQL agregasyonu (işlenen/bekleyen/risk dağılımı/tür dağılımı).

### Faz 8 — Operasyon
- [ ] İmha job'ı (saklama süresi dolan evrak → arşiv/anonimleştir, 3473 s.K. / SDP).
- [ ] Yedekleme (PITR) + denetim tablolarının ayrı yedeği.
- [ ] Testler: repository unit + RLS izolasyon + denetim-zinciri bütünlük + seed idempotency (TDD, ≥%80).

---

## 7. Notlar
- **Tek-DB tercihi:** pgvector ile mevzuat RAG aynı PostgreSQL'de → Qdrant opsiyonel kalır (operasyon sadeliği).
- **JSONB vs normalize:** kritik/sorgulanan alanlar (risk bandı, sla, unsurlar, öneriler) **normalize tablo**; nadiren sorgulanan node metadata'sı **JSONB** (`arsiv/sla/risk/kanit_metadata`).
- **Geriye uyum:** Pipeline'ın kendisi değişmez; persistence bir **adapter katmanı** (node çıktısı → repository). Stateless demo modu ENV ile korunur.
- **Üretim ölçeği:** `islem_adimi` ve `denetim_adimi` en hızlı büyüyen tablolar → aylık partition (`pg_partman`) önerilir.
