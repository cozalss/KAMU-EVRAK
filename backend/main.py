"""kamu-evrak FastAPI uygulaması — Kamu Evrak ve Yazışma için Akıllı Agent Destek Sistemi.

ADALET-AGENT main.py deseninden ADAPT (lifespan/health/CORS KEEP; ağır preload opsiyonel).

Çalıştır:  uv run main.py  (backend/ dizininde)
  Varsayılan 0.0.0.0:8000 + reload — telefonla QR evrak yükleme (mobil QR) kutudan çıktığı
  gibi çalışır; .env'e gerek yok, UVICORN_HOST/UVICORN_PORT ile ezilebilir. uvicorn CLI'yi
  doğrudan kullanacaksan LAN erişimi için --host 0.0.0.0 vermeyi unutma (CLI varsayılanı
  127.0.0.1'dir ve telefonlar erişemez).
"""

from __future__ import annotations

import os
import socket
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from agents.config import LLM_MODE
from api.middleware.body_size import MaxBodySizeMiddleware
from api.middleware.demo_kapisi import DemoKapisiMiddleware
from api.middleware.ratelimit import setup_rate_limiting
from api.middleware.security_headers import SecurityHeadersMiddleware
from api.routes import kayitlar, mevzuat, mobil, multimodal, process_doc, sla, sohbet, yazi
from auth import auth_router
from core import demo_butce, demo_guard
from core.logging import configure_logging

# structlog'u İLK İŞ yapılandır — `log = structlog.get_logger()` satırından da, herhangi bir
# router import'undan da önce. Yapılandırılmamış structlog varsayılan seviye 0'da koşar:
# log.debug dahil HER ŞEY maskesiz akar ve ham evrak metni/dosya adı log'a düşer (KVKK).
# Bu çağrı olmadan `api/pii.py:3`'ün belgelediği maskeleme sözleşmesi kurulmuş SAYILMAZ.
configure_logging()

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # TODO(kamu-evrak): Gelecek faz — mevzuat-RAG embedder + reranker preload (ADALET
    # deseni); şu an retrieval lazy/stub, ağır model preload yok (hızlı boot tercih edildi).
    log.info("startup", llm_mode=LLM_MODE)
    # Demo günlük harcamasını kalıcı katmandan geri yükle — ücretsiz katmanda dosya
    # sistemi yeniden başlatmada silinir ve tavan sıfırlanırdı.
    try:
        await demo_butce.kalici_tohumla()
    except Exception as exc:
        log.error("demo_kalici_tohumlama_hatasi", hata=type(exc).__name__)
    # Kota tablosundan geçmiş günleri sil. Tablo yalnız BUGÜNÜN kararını verir; satırlar
    # birikirse ücretsiz Postgres kotasını gereksiz yer. Açılışta koşmak yeterli sıklıkta:
    # ücretsiz katman zaten sık uyanıyor (bu tablonun var olma sebebi de o).
    try:
        from core.demo_kota_kalici import eski_gunleri_temizle, tabloyu_hazirla
        from core.gun_indeksi import bugun_indeksi

        if await tabloyu_hazirla():
            silinen = await eski_gunleri_temizle(bugun_indeksi())
            if silinen:
                log.info("demo.kota_eski_gun_silindi", satir=silinen)
    except Exception as exc:
        log.error("demo_kota_temizlik_hatasi", hata=type(exc).__name__)
    try:
        yield
    finally:
        # LLM httpx bağlantılarını (openai/llamacpp_server) temiz kapat — aksi halde
        # SIGTERM'de bağlantı/thread sızar (ECC MEDIUM-4). MockLLM'de no-op.
        from agents.llm import aclose_llm

        await aclose_llm()
        # DB engine'i temiz kapat — NullPool sızıntı riski düşük ama asyncpg bağlantı
        # nesneleri SIGTERM'de düzgün sonlansın (DB denetimi hijyen bulgusu).
        try:
            from db.session import engine

            await engine.dispose()
        except Exception as e:  # pragma: no cover — kapanış best-effort
            log.warning("engine_dispose_hata", hata=str(e))
        log.info("shutdown")


_APP_ENV_PROD = os.getenv("APP_ENV", "").strip().lower() in ("prod", "production")
# Statik frontend kökü — "/" rotası ve alttaki mount ikisi de bunu okur.
_STATIK_KOK = os.getenv("STATIK_KOK", "").strip()

app = FastAPI(
    title="kamu-evrak — Akıllı Agent Destek Sistemi",
    description="Kamu evrak ve yazışma süreçleri için çok-ajanlı yapay zeka",
    version="0.1.0",
    lifespan=lifespan,
    # Swagger/ReDoc/OpenAPI şeması prod'da kapalı — iç API yüzeyinin/mimarinin keşfini
    # daraltır (ECC LOW: /docs kimliksiz erişilebiliyordu). Demo/dev'de açık kalır.
    docs_url=None if _APP_ENV_PROD else "/docs",
    redoc_url=None if _APP_ENV_PROD else "/redoc",
    openapi_url=None if _APP_ENV_PROD else "/openapi.json",
)

# Demo kapısı — günlük belge kotası + günlük para tavanı (yalnız DEMO_KORUMA=1 iken etkin).
# SecurityHeaders'tan ÖNCE eklenir: Starlette add_middleware'i 0. indekse sokup yığını
# reversed() kurduğu için ilk eklenen EN İÇTE kalır. Sonuç: kapı MaxBodySize'ın 413'ünden
# SONRA koşar (büyük gövde kota yakmaz) ve SecurityHeaders'ın İÇİNDE kalır (402/429 gövdesi
# de nosniff/CSP taşır). Bayrak kapalıyken __call__ ilk satırda geçirir → sıfır maliyet.
app.add_middleware(DemoKapisiMiddleware)

# Güvenlik başlıkları — her yanıta nosniff/DENY/Referrer-Policy/CSP (clickjacking + MIME guard).
app.add_middleware(SecurityHeadersMiddleware)

# Gövde-boyutu kapısı — büyük gövde route/parse'tan ÖNCE 413 (auth'suz upload DoS guard, bug avı).
app.add_middleware(MaxBodySizeMiddleware)

# CORS — frontend dev sunucusu (Vite :5173) erişebilsin. Origin'ler ENV'den (prod'da
# gerçek alan adı). Metod/başlık wildcard yerine SPESİFİK → credentials'lı isteklerde
# saldırı yüzeyi daralır (API yalnız GET/POST + Content-Type/Authorization kullanır).
# CORS_ORIGINS=* + allow_credentials=True BİRLİKTE asla kurulmaz: Starlette bu kombinasyonda
# '*' yerine gelen Origin'i AYNEN yansıtır (allow_all + credentials) → fiilen her origin'e
# credentials'lı erişim açılır, sessizce "çalışır" görünür (ECC HIGH). AUTH_JWT_SECRET/
# DATABASE_URL ile aynı fail-fast disiplini: yanlış konfigürasyon boot'ta durur.
_origins = [o.strip() for o in
            os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
            if o.strip()]
if "*" in _origins:
    raise RuntimeError(
        "CORS_ORIGINS='*' allow_credentials=True ile birlikte kullanılamaz — "
        "spesifik origin listesi ver (virgülle ayrılmış).")

# Demo modu boot kapısı — AYNI fail-fast disiplini. DEMO_KORUMA=1 iken güvensiz
# konfigürasyon (DB_PERSIST=1, SQL_ECHO=1, localhost CORS, tavansız bütçe...) süreci
# HİÇ AÇTIRMAZ. "Yabancının belgesi DB'ye yazılmaz" garantisi böylece ters çevrilebilir
# bir varsayılana değil, yapısal bir imkânsızlığa dayanır.
demo_guard.dogrula_veya_dur()
if demo_guard.demo_modu():
    # Yanlış yazılmış bir bayrak faturada değil, açılışın ilk on satırında görünsün.
    log.info("demo_koruma_acik", **demo_guard.boot_ozeti())
    for _uyari in demo_guard.uyarilar():
        log.warning("demo_koruma_uyari", uyari=_uyari)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    # PATCH+DELETE gerçek uçlardır (taslak Kaydet/Sil — kayitlar.py) ve frontend fiilen
    # çağırır; dev'de Vite proxy maskeler ama gerçek cross-origin'de preflight bunları
    # engellerse taslak güncelleme/silme sessizce kırılır.
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# IP-başı hız sınırı — slowapi varsa aktif, yoksa zarif şekilde atlanır (boot kırılmaz).
setup_rate_limiting(app)

app.include_router(process_doc.router)
app.include_router(multimodal.router)
app.include_router(yazi.router)
app.include_router(auth_router)
app.include_router(kayitlar.router)
app.include_router(mevzuat.router)
app.include_router(sohbet.router)
app.include_router(sla.router)
app.include_router(mobil.router)


def _active_llm() -> str:
    """get_llm()'in GERÇEK client tipi → 'openai' | 'mock' | 'llamacpp' | 'llamacpp_server'.

    LLM_MODE=openai iken anahtar yoksa get_llm() sessizce MockLLM'e düşer; operatör bunu
    yalnız `llm_mode` (istenen) bakarak GÖREMEZ. Aktif client tipini ayrı raporlarız →
    sessiz-fallback şeffaf olur (ECC HIGH-2). get_llm() RAISE ETMEZ (mock demo bozulmaz).
    """
    try:
        from agents.llm import get_llm

        return {
            "OpenAIClient": "openai",
            "MockLLM": "mock",
            "LlamaCppClient": "llamacpp",
            "LlamaCppServerClient": "llamacpp_server",
        }.get(type(get_llm()).__name__, type(get_llm()).__name__.lower())
    except Exception as exc:
        log.warning("health_llm_probe_failed", error=type(exc).__name__)
        return "unknown"


@app.get("/demo/durum")
async def demo_durum(request: Request) -> dict[str, Any]:
    """Ziyaretçinin kalan günlük demo hakkı — HAK YAKMADAN (`kota_bak`).

    Kenar çubuğundaki "Bugün kalan: 2 / 3" sayacı bunu okur. GET olduğu için demo
    kapısının ücretli listesine girmez; `kota_bak` sayaç artırmaz.
    Koruma kapalıyken `aktif: false` döner ve frontend sayacı hiç göstermez.
    """
    if not demo_butce.demo_acik():
        return {"aktif": False}
    from api.demo_kimlik import ziyaretci_kimligi
    from core import demo_kota

    kimlik = ziyaretci_kimligi(request.scope)
    durum = await demo_kota.kota_bak_dayanikli(
        kimlik.anahtar, kimlik.ag_anahtari, kimlik.kullanici_anahtari)
    # Gösterilen sayı en KISITLAYICI eksendir: oturum açık kullanıcı için hesap kovası
    # tarayıcı kovasından önce dolabilir; büyük olanı göstermek "1 hakkım var" deyip
    # 429 yiyen bir kullanıcı üretirdi.
    return {
        "aktif": True,
        "kalan": min(durum.kalan_ziyaretci, durum.kalan_kullanici),
        "gunluk": demo_kota.gunluk_ziyaretci(),
        "kalan_ag": durum.kalan_ag,
        # Bütçe tavanı dolduysa kota dolu olmasa bile işlem yapılamaz — UI bunu ayırt etsin.
        "butce_acik": demo_butce.acik_mi(),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    """Sağlık kontrolü — istenen LLM modu + GERÇEK aktif client + pipeline node SAYISI.

    Node adlarının tam listesi dönmez (iç pipeline mimarisinin keşfini kolaylaştırır,
    kimliksiz erişilebilir bir endpoint için gereksiz bilgi — ECC LOW); sayı boyut/health
    sinyali için yeterli.
    """
    from agents.graph import PIPELINE_NODES
    return {
        "status": "ok",
        "llm_mode": LLM_MODE,          # istenen mod (ENV)
        "llm_active": _active_llm(),   # gerçek client (sessiz-fallback görünür)
        "pipeline_node_sayisi": len(PIPELINE_NODES),
        "db_ok": await _db_ping(),     # DB erişimi (eskiden hiç test edilmiyordu — sahte "ok")
    }


async def _db_ping(timeout_s: float = 2.0) -> bool:
    """Kısa timeout'lu SELECT 1 — DB kopuksa /health yine 200 döner ama db_ok=False
    (izleme sinyali; endpoint'in kendisi DB'ye rehin kalmaz)."""
    import asyncio

    from sqlalchemy import text

    from db.session import session_factory

    async def _ping() -> bool:
        async with session_factory() as s:
            await s.execute(text("SELECT 1"))
        return True

    try:
        return await asyncio.wait_for(_ping(), timeout=timeout_s)
    except Exception as exc:  # sağlık sinyali: her hata db_ok=False demektir
        log.warning("health_db_ping_hata", hata=str(exc)[:200])
        return False


@app.get("/")
async def root():
    """Kök: statik frontend bağlıysa landing sayfası, değilse API kimlik kartı.

    Bu rota "/" mount'undan ÖNCE tanımlıdır ve onu gölgeler — tek servis dağıtımında
    ana adres JSON döndürüyordu (konteyner koşumunda ölçüldü). Statik kökte index.html
    varsa onu sunar; yoksa eski davranış aynen korunur (yerel dev, API-only kurulum).
    """
    if _STATIK_KOK:
        from pathlib import Path as _Yol

        from fastapi.responses import FileResponse

        _idx = _Yol(_STATIK_KOK) / "index.html"
        if _idx.is_file():
            return FileResponse(str(_idx))
    return {"app": "kamu-evrak", "docs": "/docs"}


def _dev_host_port() -> tuple[str, int]:
    """Dev sunucu bind adresi — mobil QR sözleşmesi: varsayılan LAN'a açık (0.0.0.0).

    Bilinçli tasarım: LAN binding'i uv'nin --env-file zincirine BAĞLI DEĞİL. O zincir
    kırılgandı — .env'de tırnaksız özel karakterli tek satır uv'nin dosyanın tamamını
    sessizce atlamasına, UVICORN_HOST'un düşmesine ve telefonların erişememesine yol
    açıyordu. Varsayılan burada, kodda: .env olmasa da taze klonda telefon erişir.
    Güvenilmeyen ağda UVICORN_HOST=127.0.0.1 ile kısıtlanır; bozuk girdi güvenli
    varsayılana döner (demo boot asla kırılmaz).
    """
    host = os.getenv("UVICORN_HOST", "").strip() or "0.0.0.0"
    try:
        port = int(os.getenv("UVICORN_PORT", "8000"))
    except ValueError:
        port = 8000
    if not 1 <= port <= 65535:
        port = 8000
    return host, port


def _port_bos_mu(host: str, port: int) -> bool:
    """Boot ön-kontrolü: port bağlanabilir mi? Doluysa uvicorn'un bind hatası reload
    gürültüsünde kaybolabiliyor; en sık neden kapatılmamış ESKİ backend süreci —
    istekleri o (çoğunlukla 127.0.0.1'e bağlı) süreç karşılar, telefonlar erişemez."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        probe.close()


# ---------------------------------------------------------------- statik frontend
# TEK SERVİS DAĞITIMI: frontend'i backend'in kendisi sunar.
#
# NEDEN böyle (Vercel + ayrı backend yerine): iki origin, aralarında yönetilmesi gereken
# bir sınır demektir ve o sınır üç sorun doğuruyordu — (1) ziyaretçi çerezi `SameSite=Lax`
# olduğu için siteler-arası GÖNDERİLMEZ, yani herkes çerezsiz kovaya düşer ve tüm demo
# günde `DEMO_KOTA_AG_GUN` belgeyle kilitlenir; (2) CORS + credentials yapılandırması;
# (3) SSE akışının vekilde tamponlanma riski. Tek origin bu üçünü de VAR ETMEZ.
# Ek fayda: `X-Robots-Tag` başlığı HTML'i de kapsar → arama motoruna kapalılık tek
# katmana iner.
#
# MUTLAKA EN SONDA: "/" kök mount'u kendisinden SONRA tanımlanan her yolu gölgeler.
# Bu blok tüm router'lardan, /health'ten ve /demo/durum'dan sonradır — API yolları kazanır.
if _STATIK_KOK:
    from pathlib import Path as _Path

    from fastapi.staticfiles import StaticFiles

    _kok = _Path(_STATIK_KOK)
    if _kok.is_dir():
        # html=True: dizin isteği index.html'e düşer (landing). Çalışma alanı /app.html.
        app.mount("/", StaticFiles(directory=str(_kok), html=True), name="statik")
        log.info("statik_frontend_baglandi", kok=str(_kok),
                 app_html=(_kok / "app.html").is_file(),
                 robots=(_kok / "robots.txt").is_file())
    else:
        # Sessizce geçmek, dağıtımda "site açılmıyor" olarak geri döner — yüksek sesle söyle.
        log.error("statik_kok_bulunamadi", kok=str(_kok),
                  not_="STATIK_KOK verildi ama dizin yok; frontend SUNULMAYACAK")


if __name__ == "__main__":
    import uvicorn

    _host, _port = _dev_host_port()
    # AUTH_JWT_SECRET/DATABASE_URL/CORS_ORIGINS ile aynı disiplin: gerçek prod ortamı
    # (APP_ENV=production) `uv run main.py` ile DOĞRUDAN çalıştırılırsa (sanctioned yol
    # Dockerfile CMD'dir, --reload YOK) reload+LAN-açık bind'i sessizce miras almaz —
    # dosya-izleyici + gereksiz geniş bind prod'a taşınmaz (ECC MEDIUM).
    _reload = not _APP_ENV_PROD
    if _APP_ENV_PROD and _host == "0.0.0.0":
        log.warning("prod_lan_bind_dikkat", host=_host, port=_port,
                    not_="APP_ENV=production + host=0.0.0.0 — LAN-QR yalnız demo/dev içindir; "
                         "gerçek üretimde UVICORN_HOST ile daraltın veya Dockerfile CMD kullanın")
    elif _host == "0.0.0.0":  # mobil QR sözleşmesi (bkz. _dev_host_port)
        # LAN'a açık dinleme her boot'ta TERMİNALDE görünsün — docstring'de gömülü kalmasın
        # (güvenilmeyen ağda UVICORN_HOST=127.0.0.1 ile kısıtlanır).
        log.warning("dev_lan_bind", host=_host, port=_port,
                    not_="tüm ağ arayüzlerinden erişilebilir — telefonla QR yükleme için gerekli")
    if not _port_bos_mu(_host, _port):
        # NOT: mesajda '→' gibi cp1254-dışı karakter KULLANMA — Windows konsolunda (cp1254)
        # structlog print'i UnicodeEncodeError ile çöker ve asıl hatayı maskeler (canlı bulgu).
        log.error("port_dolu", host=_host, port=_port,
                  not_=f"{_port} portunu başka bir süreç tutuyor (muhtemelen kapatılmamış eski "
                       f"backend) -- bu kopya BAĞLANAMAYACAK. Kapatın: "
                       f"netstat -ano | findstr :{_port}  sonra  taskkill /PID <pid> /F")
    uvicorn.run("main:app", host=_host, port=_port, reload=_reload)
