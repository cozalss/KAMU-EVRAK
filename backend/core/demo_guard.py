"""Demo modu boot doğrulaması — yanlış konfigürasyonda süreç HİÇ AÇILMAZ.

Bu modülün varlık sebebi tek bir cümle: "yabancının belgesi veri tabanına yazılmaz"
garantisi, ters çevrilebilir bir VARSAYILANA değil, YAPISAL bir imkânsızlığa dayanmalı.
`DB_PERSIST` bugün varsayılan olarak kapalı; ama varsayılan bir bayrak açılabilir.
`DEMO_KORUMA=1` ile `DB_PERSIST=1` birlikte verilirse uygulama BAŞLAMAZ — böylece
"demo açıkken kalıcılık" durumu var olamaz.

Aynı fail-fast disiplini `main.py`'de CORS_ORIGINS='*' için zaten kurulu; bu doğrulama
onun hemen yanına takılır.

Saf fonksiyon + ince sarmalayıcı deseni `agents/config._bayrak` ile aynı: `dogrula()`
düz bir sözlük alır ve ihlal metinleri döndürür → düz dict ile test edilir, ortam
değişkeni kurcalamaya gerek kalmaz.
"""

from __future__ import annotations

import os
from collections.abc import Mapping

import structlog

log = structlog.get_logger()

_ACIK_DEGERLER = ("1", "true", "yes", "on")
_PROD = ("prod", "production")


def _acik(env: Mapping[str, str], ad: str, varsayilan: str = "0") -> bool:
    return (env.get(ad, varsayilan) or "").strip().lower() in _ACIK_DEGERLER


def demo_modu(env: Mapping[str, str] | None = None) -> bool:
    """DEMO_KORUMA açık mı?"""
    return _acik(env if env is not None else os.environ, "DEMO_KORUMA")


def db_persist_acik(env: Mapping[str, str] | None = None) -> bool:
    """Kalıcılık açık mı?

    TARİHÇE (9 Ağu 2026): bu fonksiyon demo modunda HER ZAMAN False dönüyordu ve boot
    doğrulaması `DEMO_KORUMA=1 + DB_PERSIST=1` ikilisini REDDEDİYORDU. Gerekçe "halka
    açık demoda YABANCININ belgesi veri tabanına yazılmaz" idi ve o gerekçe o ürün için
    doğruydu.

    ÜRÜN DEĞİŞTİ: sistem artık anonim bir demo değil, herkesin KENDİ HESABINI açtığı
    bir uygulama. Kişinin kendi belgesini kendi hesabına kaydetmesi ürünün işlevinin ta
    kendisidir — işlenen evrak, taslak ve karar geçmişi kalıcı olmazsa uygulama yarım
    kalır. Dolayısıyla kısıt kaldırıldı; bayrak artık olduğu gibi okunur.

    KORUNAN GÜVENCELER (kalıcılık açıkken de geçerli):
      · `db/repositories/persist_run.py` metni `mask_pii` ile MASKELEYEREK yazar
        (TCKN/telefon/IBAN yıldızlanır, ham hâliyle DB'ye girmez)
      · dosya adı `_baslik_guvenli` ile maskelenir
      · kayıt kullanıcının KENDİ hesabına bağlanır (`_owner_id_from_request`)
    """
    e = env if env is not None else os.environ
    # DB_PERSIST için TOLERANT PARSE YOK — eski satır `os.getenv("DB_PERSIST","0") != "1"`
    # idi. `_acik()` kullanmak `DB_PERSIST=true` olan bir kurulumda kalıcılığı SESSİZCE
    # AÇARDI (adversarial doğrulama bulgusu): önce stateless koşan sistem, tek satır kod
    # değişikliğiyle her belgeyi Postgres'e yazmaya başlardı. Veri yazmayı genişleten bir
    # değişiklik asla yan etki olarak gelmemeli.
    return (e.get("DB_PERSIST", "0") or "").strip() == "1"


def dogrula(env: Mapping[str, str]) -> tuple[str, ...]:
    """Demo modunda güvenli olmayan konfigürasyonları listele. Demo kapalıysa boş döner."""
    if not demo_modu(env):
        return ()

    ihlal: list[str] = []

    if _acik(env, "SQL_ECHO"):
        ihlal.append(
            "SQL_ECHO=1 demo modunda yasak — tam SQL metni (belge içeriği dâhil) log'a düşer.")

    if (env.get("APP_ENV", "") or "").strip().lower() not in _PROD:
        ihlal.append(
            "DEMO_KORUMA=1 için APP_ENV=production gerekir — /docs, /redoc, /openapi.json "
            "kapansın ve HSTS açılsın.")

    kokenler = [o.strip() for o in (env.get("CORS_ORIGINS", "") or "").split(",") if o.strip()]
    if not kokenler:
        ihlal.append(
            "CORS_ORIGINS boş — demoda gerçek alan adı verilmeli (varsayılan localhost'tur).")
    elif any("localhost" in o or "127.0.0.1" in o for o in kokenler):
        ihlal.append(
            f"CORS_ORIGINS localhost içeriyor ({kokenler}) — demoda yalnız gerçek alan adı.")

    if (env.get("RATE_LIMIT_ENABLED", "true") or "").strip().lower() in ("0", "false", "no"):
        ihlal.append(
            "RATE_LIMIT_ENABLED kapalı — halka açık uçta IP hız sınırı olmadan DoS ve "
            "LLM faturası riski var.")

    if not (env.get("AUTH_JWT_SECRET", "") or "").strip():
        ihlal.append("AUTH_JWT_SECRET zorunlu (üret: `openssl rand -hex 32`).")

    tavan = (env.get("DEMO_AZAMI_GUNLUK_USD", "") or "").strip()
    if not tavan:
        ihlal.append(
            "DEMO_AZAMI_GUNLUK_USD tanımsız — tanımsız tavan demoyu tamamen kapatır "
            "(fail-closed). Örn: DEMO_AZAMI_GUNLUK_USD=0.50")
    else:
        try:
            if float(tavan) <= 0:
                ihlal.append(f"DEMO_AZAMI_GUNLUK_USD pozitif olmalı (verilen: {tavan!r}).")
        except ValueError:
            ihlal.append(
                f"DEMO_AZAMI_GUNLUK_USD sayı değil: {tavan!r} — nokta kullanın "
                "(Türkçe ondalık virgül kabul edilmez: '0,50' DEĞİL '0.50').")

    return tuple(ihlal)


def dogrula_veya_dur(env: Mapping[str, str] | None = None) -> None:
    """İhlal varsa RuntimeError ile boot'u durdur."""
    e = env if env is not None else os.environ
    ihlal = dogrula(e)
    if ihlal:
        raise RuntimeError(
            "DEMO_KORUMA=1 ile güvensiz konfigürasyon:\n  - " + "\n  - ".join(ihlal))


def uyarilar(env: Mapping[str, str] | None = None) -> tuple[str, ...]:
    """Boot'u durdurmayan ama log'a yazılması gereken riskler."""
    e = env if env is not None else os.environ
    if not demo_modu(e):
        return ()
    cikti: list[str] = []
    worker = (e.get("WEB_CONCURRENCY", "") or "").strip()
    if worker and worker != "1":
        cikti.append(
            f"WEB_CONCURRENCY={worker} — kota sözlüğü ve kilitler worker BAŞINA ayrıdır; "
            "günlük kota worker sayısıyla çarpılır. WEB_CONCURRENCY=1 önerilir.")
    if (e.get("DEMO_GUVENILEN_PROXY_SAYISI", "0") or "0").strip() not in ("", "0"):
        cikti.append(
            "DEMO_GUVENILEN_PROXY_SAYISI>0 — X-Forwarded-For'a GÜVENİLİYOR. Gerçekte önde "
            "vekil yoksa ağ kotası sahte başlıkla atlatılabilir.")
    if _acik(e, "DB_PERSIST"):
        cikti.append(
            "DB_PERSIST=1 — kullanıcıların işlediği evrak veri tabanında SAKLANIYOR "
            "(metin ve dosya adı maskeli). Saklama süresi imhası OTOMATİK DEĞİL: "
            "`uv run python -m db.imha_job --uygula` periyodik koşturulmalı (KVKK md.7).")
    if not (e.get("DEMO_KOTA_SECRET", "") or "").strip():
        cikti.append(
            "DEMO_KOTA_SECRET yok — çerez anahtarı AUTH_JWT_SECRET'tan türetiliyor; "
            "o da yoksa süreç restart'ında tüm ziyaretçi çerezleri geçersizleşir.")
    return tuple(cikti)


def boot_ozeti(env: Mapping[str, str] | None = None) -> dict[str, object]:
    """Açılış banner'ı için çözümlenmiş demo ayarları (yanlış yazılmış bayrak görünsün)."""
    e = env if env is not None else os.environ
    return {
        "demo_koruma": demo_modu(e),
        "tavan_usd": (e.get("DEMO_AZAMI_GUNLUK_USD", "") or "tanımsız").strip(),
        "kota_ziyaretci": (e.get("DEMO_KOTA_BELGE_GUN", "3") or "3").strip(),
        "kota_ag": (e.get("DEMO_KOTA_AG_GUN", "12") or "12").strip(),
        "rezervasyon_usd": (e.get("DEMO_BELGE_REZERVASYON_USD", "0.03") or "0.03").strip(),
        "guvenilen_proxy": (e.get("DEMO_GUVENILEN_PROXY_SAYISI", "0") or "0").strip(),
        "db_persist": db_persist_acik(e),
    }


__all__ = ("boot_ozeti", "db_persist_acik", "demo_modu", "dogrula", "dogrula_veya_dur",
           "uyarilar")
