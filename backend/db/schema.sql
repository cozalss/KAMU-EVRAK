-- kamu-evrak — Tam veritabanı şeması (Supabase / PostgreSQL 17).
-- Kaynak tasarım: docs/database-schema.md · database-reviewer düzeltmeleri uygulandı.
-- IDEMPOTENT: tekrar çalıştırılabilir (IF NOT EXISTS / DO bloklar / DROP-then-CREATE).
-- KVKK (CLAUDE.md §2/§6.5): ham PII saklanmaz; yalnız maskeli değer + maskeli metin.
-- Uygula: backend/db/apply_schema.py  (DATABASE_URL_SYNC, session pooler :5432).
--
-- GÜVENLİK NOTU (database-reviewer C-1/C-2/H-1):
--   * Backend `postgres` rolüyle bağlanır → RLS'i BYPASS eder (sahip/superuser). Erişim
--     denetimi UYGULAMA katmanında (JWT + repository) yapılır — bilinçli tasarım.
--   * RLS, Supabase PostgREST `anon`/`authenticated` rollerine karşı savunmadır:
--     hassas tablolar policy'SİZ ENABLE → default-deny (anon hiçbir satır göremez).
--     Referans + mevzuat (kamuya açık) tablolar public-read policy alır.
--   * app.* GUC tabanlı birim-RLS politikaları Faz 2'de (dedicated app rolü + middleware)
--     eklenecek; şimdilik default-deny yeterli ve güvenli.

-- ============================================================ 0. UZANTILAR + ŞEMA GÜVENLİĞİ
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Supabase anon, public rolünden miras alır → public'in CREATE'ini kıs (M-5).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ============================================================ 1. ENUM TÜRLERİ (idempotent)
DO $$ BEGIN
  CREATE TYPE rol_turu     AS ENUM ('memur','yetkili','yonetici','sistem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE risk_bandi   AS ENUM ('yesil','sari','kirmizi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE islem_durumu AS ENUM ('kuyrukta','isleniyor','onay_bekliyor','tamamlandi','hata');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE onay_karari  AS ENUM ('bekliyor','onaylandi','duzenlendi','reddedildi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE giden_durumu AS ENUM ('gonderildi','duzenlendi','reddedildi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE sla_durumu   AS ENUM ('normal','kritik','gecikmis','tanimsiz','tarih_yok');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE madde_turu   AS ENUM ('normal','ek','gecici','mukerrer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE adim_statusu AS ENUM ('pending','active','done','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================ 2. REFERANS (LOOKUP) TABLOLARI
CREATE TABLE IF NOT EXISTS evrak_turu (
    kod        TEXT PRIMARY KEY,
    etiket_tr  TEXT NOT NULL,
    aktif      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS yazi_turu (
    kod                TEXT PRIMARY KEY,
    etiket_tr          TEXT NOT NULL,
    varsayilan_kapanis TEXT NOT NULL DEFAULT 'Gereğini arz ederim.',
    sablon_dosya       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS birim (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kod          TEXT UNIQUE NOT NULL,
    ad           TEXT NOT NULL,
    ust_birim_id UUID REFERENCES birim(id) ON DELETE SET NULL,   -- L-2
    aktif        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================ 3. KİMLİK & YETKİ (RBAC)
CREATE TABLE IF NOT EXISTS kullanici (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eposta         TEXT UNIQUE NOT NULL,
    parola_hash    TEXT NOT NULL,
    ad_soyad       TEXT NOT NULL,
    unvan          TEXT NOT NULL DEFAULT '',
    rol            rol_turu NOT NULL DEFAULT 'memur',
    birim_id       UUID NOT NULL REFERENCES birim(id) ON DELETE RESTRICT,
    e_imza_yetkisi BOOLEAN NOT NULL DEFAULT FALSE,
    aktif          BOOLEAN NOT NULL DEFAULT TRUE,
    son_giris      TIMESTAMPTZ,
    guncellendi    TIMESTAMPTZ,                                  -- L-4
    olusturuldu    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oturum (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id       UUID NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    ip                 INET,
    user_agent         TEXT,
    gecerli_son        TIMESTAMPTZ NOT NULL,
    iptal              BOOLEAN NOT NULL DEFAULT FALSE,
    olusturuldu        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================ 4. GELEN EVRAK + EKLER
CREATE TABLE IF NOT EXISTS gelen_evrak (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evrak_no            TEXT UNIQUE NOT NULL,
    baslik              TEXT NOT NULL DEFAULT '',
    kaynak              TEXT NOT NULL DEFAULT 'yukleme',
    ocr_metni           TEXT NOT NULL,                           -- MASKELİ (PII yok)
    ocr_engine          TEXT,
    ocr_confidence      REAL,
    sayfa_sayisi        INT,
    dosya_boyut         BIGINT,
    mime_turu           TEXT,
    gelis_birim_id      UUID REFERENCES birim(id) ON DELETE SET NULL,        -- H-3
    atanan_kullanici_id UUID REFERENCES kullanici(id) ON DELETE SET NULL,    -- H-3
    olusturan_id        UUID NOT NULL REFERENCES kullanici(id) ON DELETE RESTRICT,
    olusturuldu         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evrak_eki (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gelen_evrak_id UUID NOT NULL REFERENCES gelen_evrak(id) ON DELETE CASCADE,
    dosya_adi      TEXT NOT NULL,
    depo_yolu      TEXT NOT NULL,
    mime_turu      TEXT,
    boyut          BIGINT
);

-- ============================================================ 5. MEVZUAT KORPUSU (RAG)
-- C-4: mevzuat_oneri'den ÖNCE tanımlanır (FK sırası).
CREATE TABLE IF NOT EXISTS mevzuat (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kanun_no     TEXT NOT NULL,
    baslik       TEXT NOT NULL,
    kunye        TEXT,
    kaynak_url   TEXT,
    kaynak_dosya TEXT UNIQUE,
    yururlukte   BOOLEAN NOT NULL DEFAULT TRUE,
    olusturuldu  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mevzuat_madde (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mevzuat_id      UUID NOT NULL REFERENCES mevzuat(id) ON DELETE CASCADE,
    madde_no        TEXT NOT NULL,
    madde_turu      madde_turu NOT NULL DEFAULT 'normal',
    baslik          TEXT,
    metin           TEXT NOT NULL,
    dogrula_isareti BOOLEAN NOT NULL DEFAULT FALSE
);
-- C-3 / L-3: tsv GENERATED column ('simple' config — Postgres'te 'turkish' yok).
CREATE TABLE IF NOT EXISTS mevzuat_chunk (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mevzuat_id UUID NOT NULL REFERENCES mevzuat(id) ON DELETE CASCADE,
    madde_id   UUID REFERENCES mevzuat_madde(id) ON DELETE CASCADE,
    metin      TEXT NOT NULL,
    tsv        tsvector GENERATED ALWAYS AS (to_tsvector('simple', metin)) STORED,
    embedding  vector(768)
);

-- ============================================================ 6. İŞLEME (pipeline koşumu)
CREATE TABLE IF NOT EXISTS islem (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gelen_evrak_id       UUID NOT NULL REFERENCES gelen_evrak(id) ON DELETE CASCADE,
    thread_id            TEXT NOT NULL,
    durum                islem_durumu NOT NULL DEFAULT 'kuyrukta',
    evrak_turu_kod       TEXT REFERENCES evrak_turu(kod) ON DELETE RESTRICT,   -- H-3 lookup
    tur_confidence       REAL DEFAULT 0,
    bilgi_unsurlari      JSONB NOT NULL DEFAULT '{}',
    eksik_alanlar        TEXT[] NOT NULL DEFAULT '{}',
    clarify_questions    TEXT[] NOT NULL DEFAULT '{}',
    ozet                 TEXT NOT NULL DEFAULT '',
    hedef_birim_id       UUID REFERENCES birim(id) ON DELETE SET NULL,
    birim_alternatifleri TEXT[] NOT NULL DEFAULT '{}',
    format_uyumlu        BOOLEAN NOT NULL DEFAULT FALSE,
    verify_uyari         TEXT[] NOT NULL DEFAULT '{}',
    verify_notes         TEXT NOT NULL DEFAULT '',
    bilgilendirme        TEXT NOT NULL DEFAULT '',
    arsiv_metadata       JSONB NOT NULL DEFAULT '{}',
    sla_metadata         JSONB NOT NULL DEFAULT '{}',
    risk_metadata        JSONB NOT NULL DEFAULT '{}',
    kanit_metadata       JSONB NOT NULL DEFAULT '{}',
    baslangic            TIMESTAMPTZ NOT NULL DEFAULT now(),
    bitis                TIMESTAMPTZ,
    sure_ms              BIGINT,                                  -- M-2 (INT taşar)
    guncellendi          TIMESTAMPTZ                              -- L-4
);
CREATE TABLE IF NOT EXISTS islem_adimi (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id   UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira       INT NOT NULL,
    node_kod   TEXT NOT NULL,
    gorev      SMALLINT NOT NULL,
    status     adim_statusu NOT NULL DEFAULT 'pending',
    ozet       TEXT,
    veri       JSONB,
    baslangic  TIMESTAMPTZ,
    bitis      TIMESTAMPTZ,
    UNIQUE (islem_id, sira)
);
CREATE TABLE IF NOT EXISTS bilgi_unsuru (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id      UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    alan          TEXT NOT NULL,
    etiket_tr     TEXT NOT NULL,
    deger_maskeli TEXT NOT NULL,                                 -- HAM PII YOK
    guven         REAL DEFAULT 0
);
-- KVKK (security-reviewer H-1): kanit_baglama MASKELİ metin (gelen_evrak.ocr_metni)
-- üzerinde çalışır → `deger` ve span'lar maskeli metnin substring'idir, HAM PII DEĞİL.
-- RLS default-deny (anon erişemez); değer yapısı gereği maskeli (uydurma/ham yok).
CREATE TABLE IF NOT EXISTS kanit_span (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id        UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    bilgi_unsuru_id UUID REFERENCES bilgi_unsuru(id) ON DELETE CASCADE,
    alan            TEXT NOT NULL,
    etiket          TEXT NOT NULL,
    deger           TEXT NOT NULL,           -- maskeli metin substring'i (HAM PII YOK)
    span_start      INT NOT NULL,
    span_end        INT NOT NULL
);
CREATE TABLE IF NOT EXISTS alt_talep (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id       UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira           INT NOT NULL,
    ozet           TEXT NOT NULL,
    tur_kod        TEXT REFERENCES evrak_turu(kod) ON DELETE SET NULL,
    hedef_birim_id UUID REFERENCES birim(id) ON DELETE SET NULL,
    yazi_turu_kod  TEXT REFERENCES yazi_turu(kod) ON DELETE SET NULL,
    cevap_suresi   TEXT,
    sla_durum      sla_durumu DEFAULT 'tanimsiz'
);
CREATE TABLE IF NOT EXISTS risk_degerlendirme (
    islem_id   UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    bant       risk_bandi NOT NULL,
    skor       REAL NOT NULL DEFAULT 0,
    gerekceler TEXT[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sla_takip (
    islem_id         UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    durum            sla_durumu NOT NULL DEFAULT 'tanimsiz',
    baslangic_tarihi DATE,
    son_tarih        DATE,
    kalan_gun        INT,
    dayanak          TEXT
);

-- ============================================================ 7. MEVZUAT ÖNERİSİ (işlem-başına)
CREATE TABLE IF NOT EXISTS mevzuat_oneri (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id   UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    mevzuat_id UUID REFERENCES mevzuat(id) ON DELETE SET NULL,
    madde_id   UUID REFERENCES mevzuat_madde(id) ON DELETE SET NULL,
    baslik     TEXT NOT NULL,
    snippet    TEXT,
    url        TEXT,
    score      REAL DEFAULT 0,
    nli_destek REAL
);

-- ============================================================ 8. TASLAK + HITL ONAY + GİDEN
CREATE TABLE IF NOT EXISTS taslak (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id              UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    yazi_turu_kod         TEXT NOT NULL REFERENCES yazi_turu(kod) ON DELETE RESTRICT,
    konu                  TEXT NOT NULL DEFAULT '',
    metin_md              TEXT NOT NULL,
    format_uyumlu         BOOLEAN NOT NULL DEFAULT FALSE,
    eksik_format_alanlari TEXT[] NOT NULL DEFAULT '{}',
    pdf_yolu              TEXT,
    docx_yolu             TEXT,
    surum                 INT NOT NULL DEFAULT 1,
    guncellendi           TIMESTAMPTZ,                           -- L-4
    olusturuldu           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS onay (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taslak_id        UUID NOT NULL REFERENCES taslak(id) ON DELETE CASCADE,
    karar            onay_karari NOT NULL DEFAULT 'bekliyor',
    karar_veren_id   UUID REFERENCES kullanici(id) ON DELETE SET NULL,   -- H-3
    duzenlenen_metin TEXT,
    gerekce          TEXT,
    karar_zamani     TIMESTAMPTZ,
    olusturuldu      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS giden_evrak (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giden_no        TEXT UNIQUE NOT NULL,
    taslak_id       UUID NOT NULL REFERENCES taslak(id) ON DELETE RESTRICT,
    kaynak_evrak_id UUID REFERENCES gelen_evrak(id) ON DELETE SET NULL,
    konu            TEXT NOT NULL DEFAULT '',
    alici_birim_id  UUID REFERENCES birim(id) ON DELETE SET NULL,
    yazi_turu_kod   TEXT REFERENCES yazi_turu(kod) ON DELETE SET NULL,
    risk            risk_bandi,
    durum           giden_durumu NOT NULL DEFAULT 'gonderildi',
    gonderen_id     UUID NOT NULL REFERENCES kullanici(id) ON DELETE RESTRICT,
    son_hash        TEXT,
    gonderim_tarihi TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================ 9. DENETİM İZİ (SHA-256 zincir)
CREATE TABLE IF NOT EXISTS denetim_izi (
    islem_id    UUID PRIMARY KEY REFERENCES islem(id) ON DELETE CASCADE,
    kok_hash    TEXT NOT NULL,
    son_hash    TEXT NOT NULL,
    adim_sayisi INT NOT NULL,
    butunluk    BOOLEAN NOT NULL DEFAULT TRUE,
    olusturuldu TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS denetim_adimi (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    islem_id    UUID NOT NULL REFERENCES islem(id) ON DELETE CASCADE,
    sira        INT NOT NULL,
    adim_adi    TEXT NOT NULL,
    karar_json  JSONB NOT NULL,
    onceki_hash TEXT NOT NULL,
    hash        TEXT NOT NULL,
    zaman       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (islem_id, sira)
);

-- ============================================================ 10. BİLDİRİM
CREATE TABLE IF NOT EXISTS bildirim (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id    UUID NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    tur             TEXT NOT NULL,
    mesaj           TEXT NOT NULL,
    ilgili_islem_id UUID REFERENCES islem(id) ON DELETE CASCADE,
    okundu          BOOLEAN NOT NULL DEFAULT FALSE,
    olusturuldu     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================ 11. İNDEKSLER
CREATE INDEX IF NOT EXISTS ix_birim_ust            ON birim(ust_birim_id);                 -- L-2
CREATE INDEX IF NOT EXISTS ix_kullanici_birim      ON kullanici(birim_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_oturum_token  ON oturum(refresh_token_hash);          -- M-3
CREATE INDEX IF NOT EXISTS ix_oturum_kullanici     ON oturum(kullanici_id, gecerli_son DESC);
CREATE INDEX IF NOT EXISTS ix_gelen_evrak_birim    ON gelen_evrak(gelis_birim_id, olusturuldu DESC);
CREATE INDEX IF NOT EXISTS ix_gelen_evrak_atanan   ON gelen_evrak(atanan_kullanici_id);
CREATE INDEX IF NOT EXISTS ix_evrak_eki_gelen      ON evrak_eki(gelen_evrak_id);           -- L-5
CREATE INDEX IF NOT EXISTS ix_islem_evrak          ON islem(gelen_evrak_id);
CREATE INDEX IF NOT EXISTS ix_islem_durum          ON islem(durum, baslangic DESC);
CREATE INDEX IF NOT EXISTS ix_islem_thread         ON islem(thread_id);
CREATE INDEX IF NOT EXISTS ix_adim_islem           ON islem_adimi(islem_id, sira);
CREATE INDEX IF NOT EXISTS ix_oneri_islem          ON mevzuat_oneri(islem_id);
CREATE INDEX IF NOT EXISTS ix_taslak_islem         ON taslak(islem_id);
CREATE INDEX IF NOT EXISTS ix_onay_taslak          ON onay(taslak_id, karar);
CREATE INDEX IF NOT EXISTS ix_giden_birim          ON giden_evrak(alici_birim_id, gonderim_tarihi DESC);
CREATE INDEX IF NOT EXISTS ix_giden_durum_risk     ON giden_evrak(durum, risk);
CREATE INDEX IF NOT EXISTS ix_giden_tarih          ON giden_evrak(gonderim_tarihi);
-- M-6: çift-gönderim guard (reddedilmemiş taslak yalnız bir kez gönderilir).
CREATE UNIQUE INDEX IF NOT EXISTS ix_giden_taslak_uniq ON giden_evrak(taslak_id) WHERE durum <> 'reddedildi';
CREATE INDEX IF NOT EXISTS ix_denetim_adim         ON denetim_adimi(islem_id, sira);
CREATE INDEX IF NOT EXISTS ix_islem_risk           ON risk_degerlendirme(bant);
CREATE INDEX IF NOT EXISTS ix_bildirim_kullanici   ON bildirim(kullanici_id, okundu, olusturuldu DESC);  -- M-4
CREATE INDEX IF NOT EXISTS ix_islem_risk_meta      ON islem USING GIN (risk_metadata);
CREATE INDEX IF NOT EXISTS ix_islem_arsiv_meta     ON islem USING GIN (arsiv_metadata);
-- Mevzuat hibrit arama: BM25 (tsv) + trgm (typo) + HNSW (vektör).
CREATE INDEX IF NOT EXISTS ix_chunk_tsv            ON mevzuat_chunk USING GIN (tsv);
CREATE INDEX IF NOT EXISTS ix_chunk_trgm           ON mevzuat_chunk USING GIN (metin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_chunk_embedding      ON mevzuat_chunk
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);   -- H-2
CREATE INDEX IF NOT EXISTS ix_madde_mevzuat        ON mevzuat_madde(mevzuat_id);

-- ============================================================ 12. TETİKLEYİCİLER
-- 12.1 denetim_adimi append-only (tamper-evident).
CREATE OR REPLACE FUNCTION denetim_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'denetim_adimi değiştirilemez (tamper-evident hash-zinciri)';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_denetim_no_update ON denetim_adimi;
CREATE TRIGGER trg_denetim_no_update BEFORE UPDATE OR DELETE ON denetim_adimi
    FOR EACH ROW EXECUTE FUNCTION denetim_immutable();

-- 12.2 guncellendi otomatik damga (L-4).
CREATE OR REPLACE FUNCTION set_guncellendi() RETURNS trigger AS $$
BEGIN
    NEW.guncellendi := now();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_islem_guncellendi ON islem;
CREATE TRIGGER trg_islem_guncellendi BEFORE UPDATE ON islem
    FOR EACH ROW EXECUTE FUNCTION set_guncellendi();
DROP TRIGGER IF EXISTS trg_taslak_guncellendi ON taslak;
CREATE TRIGGER trg_taslak_guncellendi BEFORE UPDATE ON taslak
    FOR EACH ROW EXECUTE FUNCTION set_guncellendi();
DROP TRIGGER IF EXISTS trg_kullanici_guncellendi ON kullanici;
CREATE TRIGGER trg_kullanici_guncellendi BEFORE UPDATE ON kullanici
    FOR EACH ROW EXECUTE FUNCTION set_guncellendi();

-- ============================================================ 13. RLS (Supabase anon savunması)
-- Hassas tablolar: ENABLE + policy YOK → anon/authenticated default-deny.
-- Backend postgres ile bağlanır → RLS BYPASS (uygulama-katmanı yetki). C-1/C-2/H-1.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kullanici','oturum','gelen_evrak','evrak_eki','islem','islem_adimi',
    'bilgi_unsuru','kanit_span','alt_talep','risk_degerlendirme','sla_takip',
    'mevzuat_oneri','taslak','onay','giden_evrak','denetim_izi','denetim_adimi','bildirim'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Referans + mevzuat (kamuya açık veri): ENABLE + public SELECT policy.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['evrak_turu','yazi_turu','birim','mevzuat','mevzuat_madde','mevzuat_chunk'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS p_read_%1$s ON %1$s;', t);
    EXECUTE format('CREATE POLICY p_read_%1$s ON %1$s FOR SELECT USING (true);', t);
  END LOOP;
END $$;

-- H-4: parola_hash / e_imza_yetkisi PostgREST rollerine asla görünmesin.
REVOKE SELECT (parola_hash, e_imza_yetkisi) ON kullanici FROM anon, authenticated;
