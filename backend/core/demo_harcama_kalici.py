"""Günlük demo harcamasının KALICI toplamı — Render ücretsiz katmanı için dayanıklılık.

Render ücretsiz web servisinde **kalıcı disk yoktur**; dosya sistemi "redeploy, restart
veya spin-down'da" sıfırlanır. Bu, `data/demo_harcama.json` defterini her yeniden
başlatmada silerdi ve günlük tavan yeniden açılırdı — tavan "günlük 0,50 USD" olmaktan
çıkıp "konteyner ömrü başına 0,50 USD" olurdu.

KATMAN AYRIMI (bilinçli):
  · `core/butce_defteri.ButceDefteri`  → BİRİNCİL. Dosya, istek başına, kilitli,
    fail-closed. Para kararı her zaman burada verilir.
  · bu modül                           → DAYANIKLILIK. Açılışta bir kez okunur,
    istek sonunda (belge başına, LLM çağrısı başına DEĞİL) yazılır.

HATA SÖZLEŞMESİ — bilinçli olarak FAIL-OPEN, ve nedeni şudur: bu katman koruma
EKLER, koruma SAĞLAMAZ. DB erişilemezken fail-closed davransaydık, Supabase'in bir
hıçkırığı (ya da ücretsiz projenin 7 günlük hareketsizlik duraklaması) demoyu tamamen
öldürürdü. Erişilemediğinde geriye kalan, bu değişiklikten ÖNCEKİ korumanın aynısıdır:
konteyner ömrü boyunca sert tavan. Kayıp, tek bir yeniden başlatmada bir günlük
tavan kadardır ve GÜRÜLTÜLÜ loglanır.
"""

from __future__ import annotations

import structlog
from sqlalchemy import text

log = structlog.get_logger()


async def gunluk_oku(gun: int) -> float | None:
    """Verilen günün kalıcı toplamı. Erişilemezse None (çağıran dosyaya güvenir)."""
    try:
        from db.session import session_factory

        async with session_factory() as s:
            sonuc = await s.execute(
                text("SELECT toplam_usd FROM demo_harcama WHERE gun = :g"), {"g": gun},
            )
            satir = sonuc.first()
            return float(satir[0]) if satir else 0.0
    except Exception as exc:
        log.error("demo.kalici_okunamadi", gun=gun, hata=type(exc).__name__,
                  etki="günlük tavan yalnız konteyner ömrü boyunca sert kalır")
        return None


async def gunluk_yaz(gun: int, toplam: float) -> bool:
    """Günün toplamını yaz. ASLA AZALTMAZ — `GREATEST` ile yüksek-su seviyesi.

    Azaltmama şart: çok örnekli/yarışan yazımda küçük bir değerin büyüğü ezmesi, tavanı
    sessizce geri açardı. Aynı disiplin `ButceDefteri._surecte_harcanan`'da da var.
    """
    try:
        from db.session import session_factory

        async with session_factory() as s:
            await s.execute(
                text("""
                    INSERT INTO demo_harcama (gun, toplam_usd, guncelleme)
                    VALUES (:g, :t, now())
                    ON CONFLICT (gun) DO UPDATE
                       SET toplam_usd = GREATEST(demo_harcama.toplam_usd, EXCLUDED.toplam_usd),
                           guncelleme = now()
                """),
                {"g": gun, "t": round(max(0.0, toplam), 6)},
            )
            await s.commit()
        return True
    except Exception as exc:
        log.error("demo.kalici_yazilamadi", gun=gun, hata=type(exc).__name__,
                  etki="yeniden başlatmada bugünkü harcama unutulur")
        return False


__all__ = ("gunluk_oku", "gunluk_yaz")
