"""Günlük belge kotasının KALICI sayacı — Render ücretsiz katmanı için dayanıklılık.

NEDEN VAR (ölçülen davranış, 9 Ağu 2026): kota sayacı `core/demo_kota._SAYAC`
süreç-içi bir sözlüktü. Render ücretsiz web servisi **15 dakika hareketsizlikte uyur**
ve sonraki istekte taze bir süreçle uyanır; ayrıca her redeploy/restart aynı sonucu
verir. Sözlük her uyanışta boştu, yani "günde 3 belge" fiilen "UYANIŞ BAŞINA 3 belge"
demekti. Siteyi 20 dakika bekletip dönen ziyaretçi sınırsız hak alıyordu.

Kalıcı olması gereken şey ufak: (gün, anahtar) → sayaç. Bu modül onu tutar.

KATMAN AYRIMI — `demo_harcama_kalici` ile AYNI disiplin, ama roller TERS:
  · para  → dosya defteri BİRİNCİL (fail-closed), DB dayanıklılık ekler.
  · kota  → DB BİRİNCİL (tek gerçek), bellek yalnız DB erişilemezken YEDEK.
Fark bilinçli: paranın kararı milisaniyelik ve fail-closed olmalı; kotanınki bir
adalet kararıdır ve tek doğru cevabı ancak kalıcı sayaç verebilir. Bellek yedeği
para tavanını zaten hiç etkilemez (`core/demo_butce` ayrı ve aşılamaz).

HATA SÖZLEŞMESİ — fail-open, ve nedeni `demo_harcama_kalici` ile aynı: bu katman
koruma EKLER. DB erişilemezken bellek yedeğine düşülür; geriye kalan, bu değişiklikten
ÖNCEKİ korumanın aynısıdır (süreç ömrü boyunca sert kota). Para tavanı ayakta kalır.

ARIZA DEVRESİ: DB tamamen düştüğünde HER ücretli istek bir bağlantı denemesi (ve
`statement_timeout` kadar gecikme) ödemesin diye üst üste `_ARIZA_ESIGI` başarısızlıkta
katman `_SOGUMA_SN` boyunca atlanır. Devre açıkken doğrudan bellek yedeği çalışır.
"""

from __future__ import annotations

import os
import time
from typing import NamedTuple

import structlog
from dotenv import find_dotenv, load_dotenv
from sqlalchemy import text

# .env'i BU MODÜL de yükler (db/session.py ve auth/security.py ile aynı desen). Gerekli,
# çünkü `_kalici_yapilandirildi` DATABASE_URL'i os.environ'dan okur ve o değişken yalnız
# `db.session` import edildiğinde doluyordu: bu modül ondan önce çağrılırsa katman kendini
# SESSİZCE kapatıyordu (ölçüldü — canlı sınav betiği "kullanilabilir: False" verdi ve
# tablo hiç kurulmadı). Bir korumanın açık/kapalı olması import sırasına bağlı olamaz.
load_dotenv(find_dotenv(usecwd=True))

log = structlog.get_logger()

# Anahtar uzunluk tavanı — anahtarlar sunucu üretimidir (imzalı çerez id'si, IP ağ öneki,
# kullanıcı UUID'si) ve hepsi bunun çok altında. Sınır, ileride bir çağıranın serbest metin
# geçirmesine karşı savunma: TEXT sütununa sınırsız veri yazılmasın.
_AZAMI_ANAHTAR_UZUNLUK = 128

_ARIZA_ESIGI = 3
_SOGUMA_SN = 60.0

_ardisik_ariza = 0
_devre_acilma = 0.0


def _kalici_yapilandirildi() -> bool:
    """Gerçek bir DATABASE_URL var mı? Yoksa katman hiç denenmez (yerel/dev koşum)."""
    return bool((os.getenv("DATABASE_URL", "") or "").strip())


def _devre_kapali_mi() -> bool:
    """Arıza devresi kapalıysa (yani DB denenebilirse) True."""
    if _ardisik_ariza < _ARIZA_ESIGI:
        return True
    return time.monotonic() - _devre_acilma >= _SOGUMA_SN   # soğuma bitti → yeniden dene


def kullanilabilir() -> bool:
    return _kalici_yapilandirildi() and _devre_kapali_mi()


def _basari() -> None:
    global _ardisik_ariza
    _ardisik_ariza = 0


def _ariza(exc: Exception, nerede: str) -> None:
    global _ardisik_ariza, _devre_acilma
    _ardisik_ariza += 1
    if _ardisik_ariza == _ARIZA_ESIGI:
        _devre_acilma = time.monotonic()
        log.error("demo.kota_kalici_devre_acildi", nerede=nerede,
                  hata=type(exc).__name__, soguma_sn=_SOGUMA_SN,
                  etki="kota yalnız süreç belleğinde sayılır — restart hakları yeniler")
    else:
        log.warning("demo.kota_kalici_hata", nerede=nerede, hata=type(exc).__name__)


def gecerli_anahtar(anahtar: str) -> bool:
    return bool(anahtar) and len(anahtar) <= _AZAMI_ANAHTAR_UZUNLUK


async def sayaclari_oku(gun: int, anahtarlar: tuple[str, ...]) -> dict[str, int] | None:
    """Anahtarların bugünkü sayaçları. DB erişilemezse None (çağıran belleğe düşer)."""
    if not anahtarlar or not kullanilabilir():
        return None
    try:
        from db.session import session_factory

        async with session_factory() as s:
            sonuc = await s.execute(
                text("SELECT anahtar, sayac FROM demo_kota "
                     "WHERE gun = :g AND anahtar = ANY(:a)"),
                {"g": gun, "a": list(anahtarlar)},
            )
            bulunan = {satir[0]: int(satir[1]) for satir in sonuc.all()}
        _basari()
        return {a: bulunan.get(a, 0) for a in anahtarlar}
    except Exception as exc:
        _ariza(exc, "oku")
        return None


class DusSonucu(NamedTuple):
    sayaclar: dict[str, int]   # karar anındaki sayaçlar (başarıda artıştan SONRAKİ)
    dolu: tuple[str, ...]      # tavana takılan anahtarlar; boşsa artış YAPILDI


async def dus(gun: int, istekler: tuple[tuple[str, int], ...]) -> DusSonucu | None:
    """HEP YA HİÇ düş: (anahtar, tavan) çiftlerinin HEPSİ müsaitse hepsi +1.

    Dönüş: `DusSonucu`, ya da DB erişilemezse None (çağıran belleğe düşer).

    TEK BAĞLANTI — bilerek. Okuma ve artış ayrı fonksiyonlardayken her ücretli istek
    `session_factory()`'yi İKİ kez açıyordu ve `db/session.py` NullPool kullandığı için
    bu iki AYRI TCP+TLS bağlantısı demekti (ölçüldü: test paketi 148sn → 254sn). Uzak bir
    Postgres'te (Render→Supabase) bu, belge başına iki gidiş-dönüş gecikmesidir. İkisi
    aynı transaction'da olunca hem tek bağlantı hem de okuma-artış arası tutarlılık kazanılır.

    ATOMİKLİK: koşullu upsert (`WHERE demo_kota.sayac < :t`) aynı anahtara eşzamanlı gelen
    iki isteğin ikisini de geçirmesini engeller — satır kilidi ikinciyi bekletir, uyanınca
    koşul artık tutmaz. Anahtarlar SIRALI işlenir: iki istek aynı iki anahtarı ters sırada
    kilitlerse Postgres deadlock üretirdi. Biri takılırsa transaction geri alınır, yani
    kısmi artış kalmaz (hakkı olan eksenin hakkı yanmaz).
    """
    if not istekler or not kullanilabilir():
        return None
    # Tavanı 0 (ya da negatif) olan eksen DB'ye hiç gitmez: satır yokken INSERT dalı
    # koşulu atlar ve sayac=1 yazardı — kapalı bir ekseni sessizce açan tek yol buydu.
    kapali = tuple(a for a, t in istekler if t <= 0)
    if kapali:
        return DusSonucu({a: 0 for a, _ in istekler}, kapali)

    anahtarlar = [a for a, _ in istekler]
    try:
        from db.session import session_factory

        async with session_factory() as s:
            sonuc = await s.execute(
                text("SELECT anahtar, sayac FROM demo_kota "
                     "WHERE gun = :g AND anahtar = ANY(:a)"),
                {"g": gun, "a": anahtarlar},
            )
            mevcut = {satir[0]: int(satir[1]) for satir in sonuc.all()}
            sayaclar = {a: mevcut.get(a, 0) for a in anahtarlar}

            dolu = tuple(a for a, t in istekler if sayaclar[a] >= t)
            if dolu:
                _basari()
                return DusSonucu(sayaclar, dolu)

            for anahtar, tavan in sorted(set(istekler)):
                artis = await s.execute(
                    text("""
                        INSERT INTO demo_kota (gun, anahtar, sayac, guncelleme)
                        VALUES (:g, :a, 1, now())
                        ON CONFLICT (gun, anahtar) DO UPDATE
                           SET sayac = demo_kota.sayac + 1, guncelleme = now()
                         WHERE demo_kota.sayac < :t
                        RETURNING sayac
                    """),
                    {"g": gun, "a": anahtar, "t": tavan},
                )
                satir = artis.first()
                if satir is None:
                    # Yarış: okuma ile artış arasında başkası tavanı doldurdu.
                    await s.rollback()
                    _basari()
                    return DusSonucu({**sayaclar, anahtar: tavan}, (anahtar,))
                sayaclar[anahtar] = int(satir[0])
            await s.commit()
        _basari()
        return DusSonucu(sayaclar, ())
    except Exception as exc:
        _ariza(exc, "dus")
        return None


async def tabloyu_hazirla() -> bool:
    """Açılışta tabloyu idempotent olarak kur. Zaten varsa hiçbir şey yapmaz.

    NEDEN UYGULAMA KODUNDA DDL (istisna, kural değil): dağıtım (Dockerfile CMD) yalnız
    uvicorn başlatır, `alembic upgrade` KOŞMAZ — şema elle uygulanıyor. Bu tablo elle
    adım beklerse, deploy'dan sonra katman sessizce devre dışı kalır ve düzeltmenin
    kapattığı açık AÇIK KALIR (üstelik hiçbir hata görünmez, yalnız yedek katman çalışır).
    Bir KORUMA mekanizmasının kendi kurulumunu unutulabilir bir adıma bağlamak yanlış.

    Sınırlar: yalnız bu tablo, yalnız CREATE IF NOT EXISTS, veri taşıma yok. Şemanın tek
    kaynağı hâlâ `alembic/versions/0007_demo_kota.py` + `db/schema.sql`; buradaki DDL
    onlarla birebir aynıdır. Yetki yoksa hata loglanır ve yedek katman devreye girer.
    """
    if not kullanilabilir():
        return False
    try:
        from db.session import session_factory

        async with session_factory() as s:
            await s.execute(text("""
                CREATE TABLE IF NOT EXISTS demo_kota (
                    gun          INTEGER      NOT NULL,
                    anahtar      TEXT         NOT NULL,
                    sayac        INTEGER      NOT NULL DEFAULT 0,
                    guncelleme   TIMESTAMPTZ  NOT NULL DEFAULT now(),
                    PRIMARY KEY (gun, anahtar)
                )
            """))
            await s.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_demo_kota_gun ON demo_kota (gun)"))
            await s.commit()
        _basari()
        return True
    except Exception as exc:
        _ariza(exc, "hazirla")
        return False


async def eski_gunleri_temizle(bugun: int, sakla_gun: int = 2) -> int | None:
    """Geçmiş günlerin satırlarını at. Tablo yalnız BUGÜNÜN kararını verir."""
    if not kullanilabilir():
        return None
    try:
        from db.session import session_factory

        async with session_factory() as s:
            sonuc = await s.execute(
                text("DELETE FROM demo_kota WHERE gun < :esik"),
                {"esik": bugun - max(0, sakla_gun)},
            )
            await s.commit()
        _basari()
        return sonuc.rowcount or 0
    except Exception as exc:
        _ariza(exc, "temizle")
        return None


def devreyi_sifirla() -> None:
    """YALNIZ test/bakım."""
    global _ardisik_ariza, _devre_acilma
    _ardisik_ariza = 0
    _devre_acilma = 0.0


__all__ = ("DusSonucu", "devreyi_sifirla", "dus", "eski_gunleri_temizle",
           "gecerli_anahtar", "kullanilabilir", "sayaclari_oku", "tabloyu_hazirla")
