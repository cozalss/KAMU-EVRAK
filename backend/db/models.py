"""SQLAlchemy 2.0 ORM modelleri — db/schema.sql ile birebir (tek-doğruluk schema.sql).

Enum türleri DB'de zaten var (schema.sql) → create_type=False. Repository katmanı
(Faz 3) bu modeller üzerinden okur/yazar. Tablo adları/sütunlar schema.sql ile EŞ.
KVKK: PII alanı yok — yalnız maskeli (deger_maskeli, ocr_metni maskeli).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM, INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base, Olusturuldu, UUIDPk

# --- Enum türleri (DB'de mevcut; create_type=False) ---
_ROL = ENUM("memur", "yetkili", "yonetici", "sistem", name="rol_turu", create_type=False)
_RISK = ENUM("yesil", "sari", "kirmizi", name="risk_bandi", create_type=False)
_ISLEM = ENUM("kuyrukta", "isleniyor", "onay_bekliyor", "tamamlandi", "hata",
              name="islem_durumu", create_type=False)
_ONAY = ENUM("bekliyor", "onaylandi", "duzenlendi", "reddedildi",
             name="onay_karari", create_type=False)
_GIDEN = ENUM("gonderildi", "duzenlendi", "reddedildi", name="giden_durumu", create_type=False)
_SLA = ENUM("normal", "kritik", "gecikmis", "tanimsiz", "tarih_yok",
            name="sla_durumu", create_type=False)
_MADDE = ENUM("normal", "ek", "gecici", "mukerrer", name="madde_turu", create_type=False)
_ADIM = ENUM("pending", "active", "done", "error", name="adim_statusu", create_type=False)


# ============================================================ Referans (lookup)
class EvrakTuru(Base):
    __tablename__ = "evrak_turu"
    kod: Mapped[str] = mapped_column(Text, primary_key=True)
    etiket_tr: Mapped[str] = mapped_column(Text)
    aktif: Mapped[bool] = mapped_column(Boolean, server_default="true")


class YaziTuru(Base):
    __tablename__ = "yazi_turu"
    kod: Mapped[str] = mapped_column(Text, primary_key=True)
    etiket_tr: Mapped[str] = mapped_column(Text)
    varsayilan_kapanis: Mapped[str] = mapped_column(Text, server_default="Gereğini arz ederim.")
    sablon_dosya: Mapped[str] = mapped_column(Text)


class Birim(UUIDPk, Base):
    __tablename__ = "birim"
    kod: Mapped[str] = mapped_column(Text, unique=True)
    ad: Mapped[str] = mapped_column(Text)
    ust_birim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("birim.id", ondelete="SET NULL"))
    aktif: Mapped[bool] = mapped_column(Boolean, server_default="true")


# ============================================================ Kimlik & yetki
class Kullanici(UUIDPk, Olusturuldu, Base):
    __tablename__ = "kullanici"
    eposta: Mapped[str] = mapped_column(Text, unique=True)
    parola_hash: Mapped[str] = mapped_column(Text)
    ad_soyad: Mapped[str] = mapped_column(Text)
    unvan: Mapped[str] = mapped_column(Text, server_default="")
    rol: Mapped[str] = mapped_column(_ROL, server_default="memur")
    birim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("birim.id", ondelete="RESTRICT"))
    e_imza_yetkisi: Mapped[bool] = mapped_column(Boolean, server_default="false")
    aktif: Mapped[bool] = mapped_column(Boolean, server_default="true")
    son_giris: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))
    guncellendi: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Oturum(UUIDPk, Olusturuldu, Base):
    __tablename__ = "oturum"
    kullanici_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kullanici.id", ondelete="CASCADE"))
    refresh_token_hash: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    gecerli_son: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True))
    iptal: Mapped[bool] = mapped_column(Boolean, server_default="false")


# ============================================================ Gelen evrak + ekler
class GelenEvrak(UUIDPk, Olusturuldu, Base):
    __tablename__ = "gelen_evrak"
    evrak_no: Mapped[str] = mapped_column(Text, unique=True)
    baslik: Mapped[str] = mapped_column(Text, server_default="")
    kaynak: Mapped[str] = mapped_column(Text, server_default="yukleme")
    ocr_metni: Mapped[str] = mapped_column(Text)
    ocr_engine: Mapped[str | None] = mapped_column(Text)
    ocr_confidence: Mapped[float | None] = mapped_column(Float)
    sayfa_sayisi: Mapped[int | None] = mapped_column(Integer)
    dosya_boyut: Mapped[int | None] = mapped_column(BigInteger)
    mime_turu: Mapped[str | None] = mapped_column(Text)
    gelis_birim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("birim.id", ondelete="SET NULL"))
    atanan_kullanici_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("kullanici.id", ondelete="SET NULL"))
    olusturan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kullanici.id", ondelete="RESTRICT"))


class EvrakEki(UUIDPk, Base):
    __tablename__ = "evrak_eki"
    gelen_evrak_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gelen_evrak.id", ondelete="CASCADE"))
    dosya_adi: Mapped[str] = mapped_column(Text)
    depo_yolu: Mapped[str] = mapped_column(Text)
    mime_turu: Mapped[str | None] = mapped_column(Text)
    boyut: Mapped[int | None] = mapped_column(BigInteger)


# ============================================================ Mevzuat korpusu (RAG)
class Mevzuat(UUIDPk, Olusturuldu, Base):
    __tablename__ = "mevzuat"
    kanun_no: Mapped[str] = mapped_column(Text)
    baslik: Mapped[str] = mapped_column(Text)
    kunye: Mapped[str | None] = mapped_column(Text)
    kaynak_url: Mapped[str | None] = mapped_column(Text)
    kaynak_dosya: Mapped[str | None] = mapped_column(Text, unique=True)
    yururlukte: Mapped[bool] = mapped_column(Boolean, server_default="true")
    maddeler: Mapped[list[MevzuatMadde]] = relationship(back_populates="mevzuat")


class MevzuatMadde(UUIDPk, Base):
    __tablename__ = "mevzuat_madde"
    mevzuat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("mevzuat.id", ondelete="CASCADE"))
    madde_no: Mapped[str] = mapped_column(Text)
    madde_turu: Mapped[str] = mapped_column(_MADDE, server_default="normal")
    baslik: Mapped[str | None] = mapped_column(Text)
    metin: Mapped[str] = mapped_column(Text)
    dogrula_isareti: Mapped[bool] = mapped_column(Boolean, server_default="false")
    mevzuat: Mapped[Mevzuat] = relationship(back_populates="maddeler")


class MevzuatChunk(UUIDPk, Base):
    __tablename__ = "mevzuat_chunk"
    mevzuat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("mevzuat.id", ondelete="CASCADE"))
    madde_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mevzuat_madde.id", ondelete="CASCADE"))
    metin: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    # tsv: GENERATED column (DB yönetir) — ORM'de salt-okunur, eşlenmez.


# ============================================================ İşleme (pipeline)
class Islem(UUIDPk, Base):
    __tablename__ = "islem"
    gelen_evrak_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gelen_evrak.id", ondelete="CASCADE"))
    thread_id: Mapped[str] = mapped_column(Text)
    durum: Mapped[str] = mapped_column(_ISLEM, server_default="kuyrukta")
    evrak_turu_kod: Mapped[str | None] = mapped_column(ForeignKey("evrak_turu.kod", ondelete="RESTRICT"))
    tur_confidence: Mapped[float | None] = mapped_column(Float, server_default="0")
    bilgi_unsurlari: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    eksik_alanlar: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    clarify_questions: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    ozet: Mapped[str] = mapped_column(Text, server_default="")
    hedef_birim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("birim.id", ondelete="SET NULL"))
    birim_alternatifleri: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    format_uyumlu: Mapped[bool] = mapped_column(Boolean, server_default="false")
    verify_uyari: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    verify_notes: Mapped[str] = mapped_column(Text, server_default="")
    bilgilendirme: Mapped[str] = mapped_column(Text, server_default="")
    arsiv_metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    sla_metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    risk_metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    kanit_metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    baslangic: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bitis: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))
    sure_ms: Mapped[int | None] = mapped_column(BigInteger)
    guncellendi: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))


class IslemAdimi(UUIDPk, Base):
    __tablename__ = "islem_adimi"
    __table_args__ = (UniqueConstraint("islem_id", "sira"),)
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    sira: Mapped[int] = mapped_column(Integer)
    node_kod: Mapped[str] = mapped_column(Text)
    gorev: Mapped[int] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(_ADIM, server_default="pending")
    ozet: Mapped[str | None] = mapped_column(Text)
    veri: Mapped[dict | None] = mapped_column(JSONB)
    baslangic: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))
    bitis: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))


class BilgiUnsuru(UUIDPk, Base):
    __tablename__ = "bilgi_unsuru"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    alan: Mapped[str] = mapped_column(Text)
    etiket_tr: Mapped[str] = mapped_column(Text)
    deger_maskeli: Mapped[str] = mapped_column(Text)
    guven: Mapped[float | None] = mapped_column(Float, server_default="0")


class KanitSpan(UUIDPk, Base):
    __tablename__ = "kanit_span"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    bilgi_unsuru_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bilgi_unsuru.id", ondelete="CASCADE"))
    alan: Mapped[str] = mapped_column(Text)
    etiket: Mapped[str] = mapped_column(Text)
    deger: Mapped[str] = mapped_column(Text)
    span_start: Mapped[int] = mapped_column(Integer)
    span_end: Mapped[int] = mapped_column(Integer)


class AltTalep(UUIDPk, Base):
    __tablename__ = "alt_talep"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    sira: Mapped[int] = mapped_column(Integer)
    ozet: Mapped[str] = mapped_column(Text)
    tur_kod: Mapped[str | None] = mapped_column(ForeignKey("evrak_turu.kod", ondelete="SET NULL"))
    hedef_birim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("birim.id", ondelete="SET NULL"))
    yazi_turu_kod: Mapped[str | None] = mapped_column(ForeignKey("yazi_turu.kod", ondelete="SET NULL"))
    cevap_suresi: Mapped[str | None] = mapped_column(Text)
    sla_durum: Mapped[str | None] = mapped_column(_SLA, server_default="tanimsiz")


class RiskDegerlendirme(Base):
    __tablename__ = "risk_degerlendirme"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"), primary_key=True)
    bant: Mapped[str] = mapped_column(_RISK)
    skor: Mapped[float] = mapped_column(Float, server_default="0")
    gerekceler: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")


class SlaTakip(Base):
    __tablename__ = "sla_takip"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"), primary_key=True)
    durum: Mapped[str] = mapped_column(_SLA, server_default="tanimsiz")
    baslangic_tarihi: Mapped[_dt.date | None] = mapped_column(Date)
    son_tarih: Mapped[_dt.date | None] = mapped_column(Date)
    kalan_gun: Mapped[int | None] = mapped_column(Integer)
    dayanak: Mapped[str | None] = mapped_column(Text)


class MevzuatOneri(UUIDPk, Base):
    __tablename__ = "mevzuat_oneri"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    mevzuat_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mevzuat.id", ondelete="SET NULL"))
    madde_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mevzuat_madde.id", ondelete="SET NULL"))
    baslik: Mapped[str] = mapped_column(Text)
    snippet: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    score: Mapped[float | None] = mapped_column(Float, server_default="0")
    nli_destek: Mapped[float | None] = mapped_column(Float)


# ============================================================ Taslak + HITL + Giden
class Taslak(UUIDPk, Olusturuldu, Base):
    __tablename__ = "taslak"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    yazi_turu_kod: Mapped[str] = mapped_column(ForeignKey("yazi_turu.kod", ondelete="RESTRICT"))
    konu: Mapped[str] = mapped_column(Text, server_default="")
    metin_md: Mapped[str] = mapped_column(Text)
    format_uyumlu: Mapped[bool] = mapped_column(Boolean, server_default="false")
    eksik_format_alanlari: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    pdf_yolu: Mapped[str | None] = mapped_column(Text)
    docx_yolu: Mapped[str | None] = mapped_column(Text)
    surum: Mapped[int] = mapped_column(Integer, server_default="1")
    guncellendi: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Onay(UUIDPk, Olusturuldu, Base):
    __tablename__ = "onay"
    taslak_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("taslak.id", ondelete="CASCADE"))
    karar: Mapped[str] = mapped_column(_ONAY, server_default="bekliyor")
    karar_veren_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("kullanici.id", ondelete="SET NULL"))
    duzenlenen_metin: Mapped[str | None] = mapped_column(Text)
    gerekce: Mapped[str | None] = mapped_column(Text)
    karar_zamani: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True))


class GidenEvrak(UUIDPk, Base):
    __tablename__ = "giden_evrak"
    giden_no: Mapped[str] = mapped_column(Text, unique=True)
    taslak_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("taslak.id", ondelete="RESTRICT"))
    kaynak_evrak_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("gelen_evrak.id", ondelete="SET NULL"))
    konu: Mapped[str] = mapped_column(Text, server_default="")
    alici_birim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("birim.id", ondelete="SET NULL"))
    yazi_turu_kod: Mapped[str | None] = mapped_column(ForeignKey("yazi_turu.kod", ondelete="SET NULL"))
    risk: Mapped[str | None] = mapped_column(_RISK)
    durum: Mapped[str] = mapped_column(_GIDEN, server_default="gonderildi")
    gonderen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kullanici.id", ondelete="RESTRICT"))
    son_hash: Mapped[str | None] = mapped_column(Text)
    gonderim_tarihi: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================ Denetim izi (hash-zinciri)
class DenetimIzi(Olusturuldu, Base):
    __tablename__ = "denetim_izi"
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"), primary_key=True)
    kok_hash: Mapped[str] = mapped_column(Text)
    son_hash: Mapped[str] = mapped_column(Text)
    adim_sayisi: Mapped[int] = mapped_column(Integer)
    butunluk: Mapped[bool] = mapped_column(Boolean, server_default="true")


class DenetimAdimi(UUIDPk, Base):
    __tablename__ = "denetim_adimi"
    __table_args__ = (UniqueConstraint("islem_id", "sira"),)
    islem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    sira: Mapped[int] = mapped_column(Integer)
    adim_adi: Mapped[str] = mapped_column(Text)
    karar_json: Mapped[dict] = mapped_column(JSONB)
    onceki_hash: Mapped[str] = mapped_column(Text)
    hash: Mapped[str] = mapped_column(Text)
    zaman: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================ Bildirim
class Bildirim(UUIDPk, Olusturuldu, Base):
    __tablename__ = "bildirim"
    kullanici_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kullanici.id", ondelete="CASCADE"))
    tur: Mapped[str] = mapped_column(Text)
    mesaj: Mapped[str] = mapped_column(Text)
    ilgili_islem_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("islem.id", ondelete="CASCADE"))
    okundu: Mapped[bool] = mapped_column(Boolean, server_default="false")


__all__ = (
    "EvrakTuru", "YaziTuru", "Birim", "Kullanici", "Oturum", "GelenEvrak", "EvrakEki",
    "Mevzuat", "MevzuatMadde", "MevzuatChunk", "Islem", "IslemAdimi", "BilgiUnsuru",
    "KanitSpan", "AltTalep", "RiskDegerlendirme", "SlaTakip", "MevzuatOneri", "Taslak",
    "Onay", "GidenEvrak", "DenetimIzi", "DenetimAdimi", "Bildirim",
)
