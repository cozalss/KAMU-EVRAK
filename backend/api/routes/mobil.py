"""Telefonla evrak yükleme — QR eşleme oturumu (demo: jüri telefonuyla belgeyi çeker).

Akış:
  masaüstü  POST /mobil/oturum            → {oturum_id, mobil_url}   (QR bu URL'i kodlar)
  telefon   GET  /mobil/{oturum_id}       → mini yükleme sayfası (self-contained HTML)
  telefon   POST /mobil/{oturum_id}/yukle → multipart foto/PDF (tek sefer)
  masaüstü  GET  /mobil/{oturum_id}/durum → {durum, dosya_adi} (kısa aralıkla poll)
  masaüstü  GET  /mobil/{oturum_id}/dosya → bayt (TEK SEFERLİK — verilince bellekten silinir)
      → masaüstü dosyayı MEVCUT /process_doc/stream akışına verir; pipeline canlı yanar.

Güvenlik (jüri salonunda açık LAN varsayımı):
  - oturum_id `secrets.token_urlsafe(16)` → tahmin edilemez, tek kullanımlık eşleme
  - TTL + aktif oturum tavanı → bellek DoS kapalı
  - boyut kapısı GÖVDE AYRIŞTIRILMADAN: Content-Length zorunlu (yoksa 411) ve sınır
    aşımı erken 413 → dev gövde ne belleğe ne diske alınır. (Not: meşru ≤20MB yüklemede
    Starlette multipart ayrıştırıcısı >1MB parçayı GEÇİCİ dosyaya taşıyabilir; kalıcı
    saklanan kopya bellektedir ve tek indirme sonrası anında silinir.)
  - tek yükleme (409, kilit içinde atomik) + tek indirme (410) → tekrar oynatma yok
  - uzantı allowlist (foto/PDF); sınır process_doc ile aynı (20 MiB)
  - kamera erişimi <input capture> ile → getUserMedia yok, HTTPS gerekmez (HTTP LAN yeter)

Telefonun erişebilmesi için backend LAN'a açık dinlemeli:
  uv run uvicorn main:app --host 0.0.0.0   (QR, LAN IP'sini otomatik bulur;
  hotspot/çoklu-arayüz kurulumunda MOBIL_BASE_URL env ile ezilebilir.)
"""

from __future__ import annotations

import asyncio
import os
import secrets
import socket
import threading
import time
from dataclasses import dataclass, field

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from starlette.datastructures import UploadFile as StarletteUploadFile

from api.middleware.ratelimit import rate_limit

log = structlog.get_logger()
router = APIRouter(prefix="/mobil", tags=["mobil"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024          # process_doc.MAX_UPLOAD_BYTES ile aynı sözleşme
MULTIPART_ZARF_PAYI = 128 * 1024              # Content-Length kapısında sınır + form zarfı payı
OTURUM_TTL_S = 600                            # 10 dk — demo eşleme penceresi
MAX_AKTIF_OTURUM = 20                         # bellek tavanı (foto ~MB'larca olabilir)
IZINLI_UZANTILAR = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff"}


class OturumYanit(BaseModel):
    oturum_id: str
    mobil_url: str                      # birincil (varsayılan rota) — QR açılışta bunu kodlar
    aday_urller: list[str] = []         # tüm arayüzler; çoklu ağda modal seçici sunar
    ttl_s: int


class DurumYanit(BaseModel):
    durum: str
    dosya_adi: str


class YukleYanit(BaseModel):
    ok: bool = True


def _now() -> float:
    """Monotonik saat — testte monkeypatch edilebilir tek nokta."""
    return time.monotonic()


@dataclass
class MobilOturum:
    olusturma: float = field(default_factory=_now)
    durum: str = "bekliyor"                   # bekliyor → yuklendi → tamamlandi
    dosya: bytes | None = None
    dosya_adi: str = ""
    icerik_turu: str = "application/octet-stream"


_OTURUMLAR: dict[str, MobilOturum] = {}
_KILIT = threading.Lock()


def _purge_ve_al(oturum_id: str | None = None) -> MobilOturum | None:
    """Süresi dolan oturumları düşür; istenirse kalanlar arasından birini döndür."""
    esik = _now() - OTURUM_TTL_S
    with _KILIT:
        for oid in [k for k, o in _OTURUMLAR.items() if o.olusturma < esik]:
            _OTURUMLAR.pop(oid, None)
        return _OTURUMLAR.get(oturum_id) if oturum_id else None


def _varsayilan_ip() -> str:
    """Varsayılan rotanın IP'si (UDP connect numarası — paket gitmez). Bulunamazsa localhost.

    CACHE YOK — bilerek: personel ağ değiştirince (ofis Wi-Fi → hotspot) bir sonraki
    QR açılışı TAZE IP almalı; bayat IP "bazı telefonlarda açılmıyor"un baş nedeniydi.
    Yalnız oturum açılışında koşar (modal başına 1 kez, 30/dk sınırlı) → maliyet yok.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def _ozel_ip_mi(ip: str) -> bool:
    """RFC1918 özel aralık mı? (loopback/APIPA hariç — telefonun erişebileceği adresler)."""
    if ip.startswith(("127.", "169.254.")):
        return False
    if ip.startswith(("192.168.", "10.")):
        return True
    if ip.startswith("172."):
        try:
            return 16 <= int(ip.split(".")[1]) <= 31
        except (IndexError, ValueError):
            return False
    return False


def _aday_ipler() -> list[str]:
    """Telefonun erişebileceği aday IP'ler — varsayılan rota önde, diğer arayüzler ardında.

    Çoklu arayüz senaryosu (Ethernet + Wi-Fi/hotspot): varsayılan rota yanlış arayüzü
    gösterebilir; tüm adaylar dönerse masaüstü modalı ağ seçici sunar, QR anında yenilenir.
    """
    adaylar: list[str] = []
    vars_ip = _varsayilan_ip()
    if _ozel_ip_mi(vars_ip):
        adaylar.append(vars_ip)
    try:
        for bilgi in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = bilgi[4][0]
            if _ozel_ip_mi(ip) and ip not in adaylar:
                adaylar.append(ip)
    except OSError:
        pass
    return adaylar or [vars_ip]


def _mobil_tabanlar(request: Request) -> list[str]:
    """QR'a yazılabilecek taban URL'ler (öncelik sırasıyla). MOBIL_BASE_URL env tek başına ezer."""
    env = os.getenv("MOBIL_BASE_URL", "").rstrip("/")
    if env:
        return [env]
    port = request.url.port or 8000
    return [f"http://{ip}:{port}" for ip in _aday_ipler()]


# 30/dk: MAX_AKTIF_OTURUM (20) tavanı asıl fren — hız sınırı yalnız spam'e karşı,
# kendi tavanımızla yarışmasın.
@router.post("/oturum", response_model=OturumYanit,
             responses={429: {"description": "Oturum tavanı ya da hız sınırı"}})
@rate_limit("30/minute")
async def oturum_olustur(request: Request) -> OturumYanit:
    _purge_ve_al()
    with _KILIT:
        if len(_OTURUMLAR) >= MAX_AKTIF_OTURUM:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Aktif eşleme oturumu tavanına ulaşıldı; biraz sonra deneyin.")
        oid = secrets.token_urlsafe(16)
        _OTURUMLAR[oid] = MobilOturum()
    # Senkron socket keşfi thread'de — event loop bloklanmaz (oturum başına 1 kez).
    tabanlar = await asyncio.to_thread(_mobil_tabanlar, request)
    urller = [f"{taban}/mobil/{oid}" for taban in tabanlar]
    log.info("mobil_oturum_olustu", oturum=oid[:8], aday=len(urller))
    return OturumYanit(oturum_id=oid, mobil_url=urller[0], aday_urller=urller,
                       ttl_s=OTURUM_TTL_S)


@router.get("/{oturum_id}/durum", response_model=DurumYanit,
            responses={404: {"description": "Oturum yok ya da süresi doldu"}})
async def oturum_durum(oturum_id: str) -> DurumYanit:
    o = _purge_ve_al(oturum_id)
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok ya da süresi doldu.")
    return DurumYanit(durum=o.durum, dosya_adi=o.dosya_adi)


@router.post("/{oturum_id}/yukle", response_model=YukleYanit,
             responses={404: {"description": "Oturum yok/expired"}, 409: {"description": "Zaten yüklendi"},
                        411: {"description": "Content-Length zorunlu"}, 413: {"description": "Dosya çok büyük"},
                        415: {"description": "İzinsiz dosya türü"}})
@rate_limit("20/minute")
async def dosya_yukle(oturum_id: str, request: Request) -> YukleYanit:
    o = _purge_ve_al(oturum_id)
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok ya da süresi doldu.")
    if o.durum != "bekliyor":   # hızlı yol; bağlayıcı karar aşağıda kilit içinde (TOCTOU)
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu oturuma zaten dosya yüklendi.")

    # DoS kapısı — GÖVDE AYRIŞTIRILMADAN: `UploadFile = File(...)` bağımlılığı tüm multipart
    # gövdeyi route koşmadan önce okur/diske taşırır; bu yüzden dosyayı parametre olarak
    # ALMIYORUZ. Önce Content-Length'e bak (yoksa 411, sınır üstüyse 413) — sunucu (h11)
    # gövdenin beyan edilen uzunluğu aşmasına zaten izin vermez.
    cl = request.headers.get("content-length")
    if cl is None:
        raise HTTPException(status.HTTP_411_LENGTH_REQUIRED, "Content-Length zorunlu.")
    try:
        beyan = int(cl)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Content-Length geçersiz.") from None
    if beyan > MAX_UPLOAD_BYTES + MULTIPART_ZARF_PAYI:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Dosya çok büyük (en fazla 20 MB).")

    # Sınırlar AÇIK (FastAPI Request.form referansı): max_part_size varsayılanı 1MB'dır ve
    # kurulu Starlette'te dosya parçalarına uygulanmıyor olsa da bu sürüm-kırılgan bir
    # varsayım — açık değer, gelecekte gerçek telefon fotoğraflarının (>1MB) sessizce
    # kırılmasını önler. max_files/max_fields: bu endpoint tek dosya bekler.
    form = await request.form(max_files=2, max_fields=4,
                              max_part_size=MAX_UPLOAD_BYTES + MULTIPART_ZARF_PAYI)
    file = form.get("file")
    if not isinstance(file, StarletteUploadFile):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "multipart 'file' alanı gerekli.")

    ad = os.path.basename(file.filename or "belge")
    uzanti = os.path.splitext(ad)[1].lower()
    if uzanti not in IZINLI_UZANTILAR:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            "Yalnız fotoğraf (PNG/JPG/WEBP/TIFF) veya PDF kabul edilir.")

    data = await file.read(MAX_UPLOAD_BYTES + 1)   # savunma derinliği (zarf payına karşı)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Dosya çok büyük (en fazla 20 MB).")

    # Atomik karar: await'ler sırasında durum değişmiş/TTL süpürmüş olabilir → GÜNCEL store
    # kaydına karşı kilit içinde yeniden doğrula (eşzamanlı çifte yükleme 409'suz geçemez).
    with _KILIT:
        guncel = _OTURUMLAR.get(oturum_id)
        if guncel is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum süresi doldu.")
        if guncel.durum != "bekliyor":
            raise HTTPException(status.HTTP_409_CONFLICT, "Bu oturuma zaten dosya yüklendi.")
        guncel.dosya, guncel.dosya_adi = data, ad
        guncel.icerik_turu = file.content_type or "application/octet-stream"
        guncel.durum = "yuklendi"
    log.info("mobil_dosya_yuklendi", oturum=oturum_id[:8], boyut=len(data), ad=ad)
    return YukleYanit()


@router.get("/{oturum_id}/dosya",
            responses={404: {"description": "Oturum yok/expired"}, 409: {"description": "Henüz yüklenmedi"},
                       410: {"description": "Zaten teslim edildi (tek seferlik)"}})
async def dosya_al(oturum_id: str) -> Response:
    o = _purge_ve_al(oturum_id)
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok ya da süresi doldu.")
    with _KILIT:
        if o.durum == "bekliyor":   # henüz yükleme olmadı — "teslim edildi" yalanı söyleme
            raise HTTPException(status.HTTP_409_CONFLICT, "Dosya henüz yüklenmedi.")
        if o.durum == "tamamlandi" or o.dosya is None:
            raise HTTPException(status.HTTP_410_GONE, "Dosya zaten teslim edildi (tek seferlik).")
        data, tur = o.dosya, o.icerik_turu
        o.dosya, o.durum = None, "tamamlandi"   # one-shot: bellekten hemen düşür
    return Response(content=data, media_type=tur)


# ---------------------------------------------------------------------------
# Telefon sayfası — self-contained HTML. JS token'larına erişemez; hex'ler frontend
# Hero Light paletinin (CLAUDE.md / neonUi THEME_CSS) birebir yansımasıdır.
# Şablon .format DEĞİL .replace ile doldurulur → CSS/JS brace escape derdi yok.
# UX (araştırma: Filestack/Eleken/soulfx upload desenleri): önizleme + gerçek ilerleme
# çubuğu (XHR) + net durum ekranları + ≥48px dokunma hedefi + adım yönergesi.
# ---------------------------------------------------------------------------

_SAYFA_CSS = """
  :root{--bg:#f7f3ee;--bg2:#efe6da;--ink:#161616;--ink2:#3a3229;--mut:#6b6157;
        --t:#2f8fa6;--t-koyu:#25758a;--r:#e0563c;--yes:#2f9e6e;
        --line:rgba(22,22,22,.12);--line2:rgba(22,22,22,.2)}
  *{box-sizing:border-box;margin:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'IBM Plex Sans','Segoe UI',system-ui,sans-serif;color:var(--ink);
       background:linear-gradient(180deg,var(--bg) 0%,var(--bg2) 140%);
       min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;
       align-items:center;padding:max(20px,env(safe-area-inset-top)) 20px 28px;gap:18px}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
  header{display:flex;align-items:center;gap:10px;margin-top:6px}
  .logo{width:34px;height:34px;border-radius:9px;background:var(--ink);color:#f7f3ee;
        display:grid;place-items:center;font-weight:700;font-size:15px;letter-spacing:.02em}
  .marka{font-weight:600;font-size:15px;letter-spacing:.14em;color:var(--ink)}
  .marka small{display:block;letter-spacing:.02em;font-weight:400;font-size:12px;color:var(--mut)}
  .adimlar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mut)}
  .adim{display:flex;align-items:center;gap:6px}
  .adim b{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
          font-size:11px;font-weight:600;border:1px solid var(--line2);color:var(--ink2)}
  .adim.on b{background:var(--t);border-color:var(--t);color:#fff}
  .adim.on{color:var(--ink2);font-weight:500}
  .cizgi{width:16px;height:1px;background:var(--line2)}
  .kart{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 20px;
        width:100%;max-width:400px;display:flex;flex-direction:column;gap:16px;
        box-shadow:0 1px 2px rgba(22,22,22,.05),0 16px 40px -28px rgba(22,22,22,.3)}
  h1{font-size:20px;font-weight:600;letter-spacing:-.01em}
  .aciklama{color:var(--mut);font-size:13.5px;line-height:1.6}
  /* Vizör: belge-tarayıcı dili — kesikli çerçeve + köşe imleri, tamamı dokunma hedefi */
  .vizor{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;
         cursor:pointer;border:1.5px dashed var(--line2);border-radius:12px;
         padding:30px 16px 26px;background:linear-gradient(180deg,#fdfbf8,#f8f4ee);
         transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}
  .vizor:active{border-color:var(--t);background:#f2f8f9}
  .kose{position:absolute;width:18px;height:18px;border:2.5px solid var(--t);border-radius:2px}
  .kose.sa{top:-2px;left:-2px;border-right:0;border-bottom:0;border-top-left-radius:10px}
  .kose.sb{top:-2px;right:-2px;border-left:0;border-bottom:0;border-top-right-radius:10px}
  .kose.aa{bottom:-2px;left:-2px;border-right:0;border-top:0;border-bottom-left-radius:10px}
  .kose.ab{bottom:-2px;right:-2px;border-left:0;border-top:0;border-bottom-right-radius:10px}
  .vizor .ikon{width:58px;height:58px;border-radius:50%;background:var(--t);color:#fff;
               display:grid;place-items:center;box-shadow:0 8px 20px -8px rgba(47,143,166,.55)}
  .vizor .cta{font-size:16.5px;font-weight:600;color:var(--ink)}
  .vizor .ipucu{font-size:12px;color:var(--mut)}
  input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
  .rozetler{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
  .rozet{font-size:11px;padding:3px 9px;border-radius:99px;border:1px solid var(--line);
         color:var(--mut);background:#fff}
  /* Gönderim ekranı */
  .onizle-kutu{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--line);
               background:repeating-conic-gradient(#f1ece4 0% 25%,#faf7f2 0% 50%) 0/18px 18px;
               display:none;max-height:260px}
  .onizle-kutu img{display:block;width:100%;max-height:260px;object-fit:contain}
  .dosya-cip{display:none;align-items:center;gap:10px;border:1px solid var(--line);
             border-radius:12px;padding:12px 14px;background:#fdfbf8;text-align:left}
  .dosya-cip .dikon{width:38px;height:38px;border-radius:9px;background:rgba(47,143,166,.12);
                    color:var(--t);display:grid;place-items:center;flex-shrink:0}
  .dosya-cip .dad{font-size:13.5px;font-weight:600;word-break:break-all}
  .dosya-cip .dboy{font-size:11.5px;color:var(--mut)}
  .bar{height:6px;border-radius:3px;background:var(--bg2);overflow:hidden;display:none}
  .bar i{display:block;height:100%;width:0%;border-radius:3px;background:var(--t);
         transition:width .2s ease-out}
  .durum{font-size:13.5px;min-height:20px;color:var(--mut);text-align:center}
  .durum.hata{color:var(--r);font-weight:600}
  /* Başarı ekranı */
  .tamam{display:none;flex-direction:column;align-items:center;gap:12px;padding:8px 0 4px;text-align:center}
  .tamam .halka{width:76px;height:76px;border-radius:50%;background:rgba(47,158,110,.1);
                display:grid;place-items:center}
  .tamam svg circle{stroke:var(--yes);stroke-dasharray:151;stroke-dashoffset:151;
                    animation:ciz .5s ease-out forwards}
  .tamam svg path{stroke:var(--yes);stroke-dasharray:36;stroke-dashoffset:36;
                  animation:ciz .35s .4s ease-out forwards}
  @keyframes ciz{to{stroke-dashoffset:0}}
  .tamam h2{font-size:19px;font-weight:600;color:var(--ink)}
  .tamam p{font-size:13.5px;color:var(--mut);line-height:1.6}
  .not{border-top:1px dashed var(--line2);padding-top:12px;font-size:12px;color:var(--mut)}
  .btn{appearance:none;border:1px solid var(--t);background:#fff;color:var(--t);
       font:inherit;font-size:14.5px;font-weight:600;border-radius:10px;padding:13px 18px;
       min-height:48px;cursor:pointer;display:none;width:100%}
  .btn:active{background:rgba(47,143,166,.08)}
  footer{margin-top:auto;font-size:11.5px;color:var(--mut);display:flex;align-items:center;gap:8px}
  footer b{color:var(--ink2);font-weight:600}
  .nokta{width:3px;height:3px;border-radius:50%;background:var(--line2)}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}
    .tamam svg circle,.tamam svg path{stroke-dashoffset:0}}
"""

_SAYFA_HTML = """<!doctype html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f7f3ee">
<title>kamu-evrak — Telefonla Evrak Yükle</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23161616'/%3E%3Ctext x='16' y='21' font-family='sans-serif' font-size='13' font-weight='700' fill='%23f7f3ee' text-anchor='middle'%3EKE%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<style>__CSS__</style></head>
<body>
  <header>
    <span class="logo" aria-hidden="true">KE</span>
    <span class="marka">KAMU-EVRAK<small>telefonla evrak yükleme</small></span>
  </header>

  <nav class="adimlar" aria-label="Adımlar">
    <span class="adim on" id="a1"><b>1</b> Çek</span><span class="cizgi"></span>
    <span class="adim" id="a2"><b>2</b> Gönder</span><span class="cizgi"></span>
    <span class="adim" id="a3"><b>3</b> Büyük ekranda izle</span>
  </nav>

  <main class="kart">
    <!-- ÇEK -->
    <section id="s-cek">
      <h1>Belgeyi çekin</h1>
      <p class="aciklama" style="margin:6px 0 14px">Fiziksel evrakın fotoğrafını çekin —
         saniyeler içinde büyük ekranda 12 yapay zekâ ajanının işlediğini izleyin.</p>
      <label class="vizor">
        <span class="kose sa" aria-hidden="true"></span><span class="kose sb" aria-hidden="true"></span>
        <span class="kose aa" aria-hidden="true"></span><span class="kose ab" aria-hidden="true"></span>
        <span class="ikon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M4 8.5C4 7.7 4.7 7 5.5 7H7l1.2-1.8c.3-.4.7-.7 1.2-.7h5.2c.5 0 .9.3 1.2.7L17 7h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 19 4 18.3 4 17.5v-9Z" stroke="#fff" stroke-width="1.7"/>
            <circle cx="12" cy="13" r="3.4" stroke="#fff" stroke-width="1.7"/></svg>
        </span>
        <span class="cta">Fotoğraf çek / dosya seç</span>
        <span class="ipucu">Belgeyi düz bir zeminde, iyi ışıkta çekin</span>
        <input id="dosya" type="file" accept="image/*,.pdf" capture="environment">
      </label>
      <div class="rozetler" style="margin-top:12px">
        <span class="rozet">PDF</span><span class="rozet">PNG · JPG</span>
        <span class="rozet">WEBP · TIFF</span><span class="rozet">≤ 20 MB</span>
      </div>
    </section>

    <!-- GÖNDER -->
    <section id="s-gonder" hidden>
      <div class="onizle-kutu" id="onizle-kutu"><img id="onizle" alt="Çekilen belgenin önizlemesi"></div>
      <div class="dosya-cip" id="dosya-cip">
        <span class="dikon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </span>
        <span><span class="dad" id="dad"></span><br><span class="dboy mono" id="dboy"></span></span>
      </div>
      <div class="bar" id="bar" style="margin-top:14px"><i id="bar-ic"></i></div>
      <div class="durum" id="durum" role="status" aria-live="polite" style="margin-top:10px"></div>
      <button class="btn" id="btn-tekrar" type="button">Tekrar dene</button>
    </section>

    <!-- TAMAM -->
    <section id="s-tamam" class="tamam">
      <span class="halka" aria-hidden="true">
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="24" stroke-width="2.5"/>
          <path d="M16 27l7 7 13-15" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <h2>Gönderildi</h2>
      <p>Büyük ekrana bakın — <b>12 yapay zekâ ajanı</b> belgenizi şimdi işliyor:
         tür, eksik bilgi, ilgili mevzuat ve resmî yazı taslağı.</p>
      <p class="not">Yeni bir belge göndermek için büyük ekrandan yeni bir QR kod oluşturup
         tekrar okutun.</p>
    </section>
  </main>

  <footer><b>TEKNOFEST 2026</b><span class="nokta"></span>__AG_NOTU__<span class="nokta"></span><span class="mono">KVKK · sentetik veri</span></footer>

<script>
(function () {
  var MAX = __MAXBAYT__;
  var girdi = document.getElementById("dosya");
  var sCek = document.getElementById("s-cek"), sGonder = document.getElementById("s-gonder"),
      sTamam = document.getElementById("s-tamam");
  var kutu = document.getElementById("onizle-kutu"), img = document.getElementById("onizle"),
      cip = document.getElementById("dosya-cip");
  var bar = document.getElementById("bar"), barIc = document.getElementById("bar-ic"),
      durum = document.getElementById("durum"), btnTekrar = document.getElementById("btn-tekrar");
  var adim2 = document.getElementById("a2"), adim3 = document.getElementById("a3");

  function boyut(n) { return n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function hata(m) {
    bar.style.display = "none"; durum.textContent = m; durum.className = "durum hata";
    btnTekrar.style.display = "block";
  }

  btnTekrar.addEventListener("click", function () {
    girdi.value = ""; sGonder.hidden = true; sCek.hidden = false;
    adim2.className = "adim"; durum.textContent = ""; durum.className = "durum";
    btnTekrar.style.display = "none"; kutu.style.display = "none"; cip.style.display = "none";
  });

  girdi.addEventListener("change", function () {
    var f = girdi.files && girdi.files[0];
    if (!f) return;
    if (f.size > MAX) { sCek.hidden = true; sGonder.hidden = false; hata("Dosya çok büyük (en fazla 20 MB)."); return; }

    sCek.hidden = true; sGonder.hidden = false; adim2.className = "adim on";

    // Önizleme YALNIZ görsel gerçekten yüklenirse (HEIC vb. çözülmezse dosya kartı) —
    // eski sürümdeki "alt-text kutusu" hatasının düzeltmesi.
    var url = URL.createObjectURL(f);
    img.onload = function () { kutu.style.display = "block"; };
    img.onerror = function () { URL.revokeObjectURL(url); gosterCip(f); };
    if (f.type && f.type.indexOf("image/") === 0) { img.src = url; } else { gosterCip(f); }

    gonder(f);
  });

  function gosterCip(f) {
    document.getElementById("dad").textContent = f.name || "belge";
    document.getElementById("dboy").textContent = boyut(f.size) + (f.type ? " · " + f.type : "");
    cip.style.display = "flex";
  }

  function gonder(f) {
    bar.style.display = "block"; barIc.style.width = "0%";
    durum.className = "durum"; durum.textContent = "Gönderiliyor… %0";
    var fd = new FormData(); fd.append("file", f, f.name || "belge.jpg");
    var x = new XMLHttpRequest();
    x.open("POST", "/mobil/__OTURUM__/yukle");
    x.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var p = Math.round(e.loaded / e.total * 100);
      barIc.style.width = p + "%"; durum.textContent = "Gönderiliyor… %" + p;
    };
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) {
        sGonder.hidden = true; sTamam.style.display = "flex"; adim3.className = "adim on";
      } else {
        var m = "Yükleme başarısız oldu.";
        try { m = JSON.parse(x.responseText).detail || m; } catch (e) {}
        hata(m);
      }
    };
    x.onerror = function () { hata("Bağlantı hatası — laptop ile aynı Wi-Fi ağında olduğunuzdan emin olun."); };
    x.send(fd);
  }
})();
</script>
</body></html>"""

_HATA_HTML = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f7f3ee">
<title>kamu-evrak — kod geçersiz</title><style>__CSS__</style></head>
<body>
  <header>
    <span class="logo" aria-hidden="true">KE</span>
    <span class="marka">KAMU-EVRAK<small>telefonla evrak yükleme</small></span>
  </header>
  <main class="kart" style="text-align:center">
    <h1>QR kodun süresi dolmuş</h1>
    <p class="aciklama" style="margin-top:8px">Büyük ekrandaki “Telefonla çek” penceresinden
       yeni bir QR kod oluşturup tekrar okutun.</p>
  </main>
  <footer><b>TEKNOFEST 2026</b></footer>
</body></html>"""


@router.get("/{oturum_id}", response_class=HTMLResponse)
async def mobil_sayfa(oturum_id: str) -> HTMLResponse:
    o = _purge_ve_al(oturum_id)
    if o is None or o.durum != "bekliyor":
        return HTMLResponse(_HATA_HTML.replace("__CSS__", _SAYFA_CSS),
                            status_code=status.HTTP_410_GONE)
    # Tünel modunda (MOBIL_BASE_URL public https) "aynı Wi-Fi" şartı yoktur — notu uyarla.
    ag_notu = ("İnternet üzerinden bağlı" if os.getenv("MOBIL_BASE_URL")
               else "Aynı Wi-Fi ağında olun")
    sayfa = (_SAYFA_HTML
             .replace("__CSS__", _SAYFA_CSS)
             .replace("__OTURUM__", oturum_id)
             .replace("__MAXBAYT__", str(MAX_UPLOAD_BYTES))
             .replace("__AG_NOTU__", ag_notu))
    return HTMLResponse(sayfa)
