"""OpenAI TTS (metni sese çevirme) — sohbet asistanının sesli yanıt vermesi için.

DeepSeek'in TTS servisi YOK; bu yüzden OPENAI_API_KEY/OPENAI_BASE_URL (agents/config.py'de
DeepSeek'e işaret eder, core/openai_compat.py'nin paylaşılan anahtarı) BURADA KULLANILMAZ —
bağımsız OPENAI_TTS_API_KEY (her zaman gerçek api.openai.com'a gider, ana LLM sağlayıcısından
etkilenmez). Anahtar yoksa/hata olursa çağıran (api/routes/sohbet.py) sessizce metin-only'e
düşer (established deterministik-fallback deseni — bkz. core/openai_compat.py docstring'i).

ENV:
    OPENAI_TTS_API_KEY=sk-...              (zorunlu — yoksa RuntimeError → çağıran fallback yapar)
    OPENAI_TTS_MODEL=gpt-4o-mini-tts       (default; steerable kuşak — `instructions` destekler)
    OPENAI_TTS_VOICE=marin                 (persona sesi; yeni kuşakta marin|cedar|ash|sage|... )
    OPENAI_TTS_TALIMAT=...                 (prozodi yönergesi; boş bırakılırsa Türkçe varsayılan)
    OPENAI_TTS_BASE_URL=https://api.openai.com/v1  (test/proxy override — normalde değiştirilmez)

Model kuşakları (ölçüldü 2026-07-25, canlı API):
    · gpt-4o-mini-tts — `instructions` ile prozodi YÖNLENDİRİLEBİLİR + geniş ses seti
      (marin/cedar dahil). Türkçede belirgin şekilde daha doğal; varsayılan budur.
    · tts-1 / tts-1-hd — eski kuşak; `instructions`'ı yok sayar ve marin/cedar'ı TANIMAZ
      (HTTP 400). Eski modele düşülürse ses güvenli karşılığa indirilir (sesli mod susmasın).
"""

from __future__ import annotations

import os

import httpx
import structlog

from core import demo_butce
from core.openai_compat import send_with_retry

log = structlog.get_logger()

_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_SPEECH_PATH = "/audio/speech"

# OpenAI TTS girdi sınırı (karakter) — aşarsa API 400 döner; görünür kırp (sessiz kesme değil).
_MAX_INPUT_CHARS = 4000

_VARSAYILAN_MODEL = "gpt-4o-mini-tts"
_VARSAYILAN_SES = "marin"

# Çıktı formatı — GECİKME kararı, ÖLÇÜLDÜ (2026-08-01, aynı 3 Türkçe cümle, medyan):
#     wav 1819 ms / 204 KB · mp3 1725 ms / 56 KB · opus 1384 ms / 30 KB
# OpenAI kılavuzu "en hızlı yanıt için wav/pcm" der ama bu AKITARAK çalan istemci içindir;
# biz dosyayı tamponlayıp çaldığımız için wav'ın dört katı gövdesi transferde geri alıyor.
# Varsayılan mp3: ölçülen en hızlının 340 ms gerisinde ama HER tarayıcıda çalar. opus daha
# hızlı ve çok küçük — Ogg kabında geliyor, Chrome/Edge/Firefox çalar, Safari'de riskli;
# jüri demosu Chrome'daysa OPENAI_TTS_FORMAT=opus ile açılır (sessiz ses riskini bilerek al).
_VARSAYILAN_FORMAT = "mp3"
_FORMAT_MIME = {
    "wav": "audio/wav", "mp3": "audio/mpeg", "opus": "audio/ogg",
    "aac": "audio/aac", "flac": "audio/flac", "pcm": "audio/L16",
}


def tts_format() -> str:
    """Ses çıktı formatı (OPENAI_TTS_FORMAT). Tanınmayan değer → varsayılan (sessiz 400 yerine)."""
    istenen = os.getenv("OPENAI_TTS_FORMAT", "").strip().lower() or _VARSAYILAN_FORMAT
    if istenen not in _FORMAT_MIME:
        log.warning("tts_format_taninmadi", istenen=istenen, kullanilan=_VARSAYILAN_FORMAT)
        return _VARSAYILAN_FORMAT
    return istenen


def tts_media_type() -> str:
    """Seçili formatın HTTP media type'ı — <audio> doğru decoder'ı seçsin."""
    return _FORMAT_MIME[tts_format()]

# Eski kuşağın (tts-1*) tanıdığı ses kümesi — canlı API'nin 400 gövdesinden alındı.
# marin/cedar burada YOK: eski modele düşülürse ses bu kümeye indirilmeli.
_ESKI_KUSAK_SESLERI = frozenset(
    {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"})
_ESKI_KUSAK_YEDEK_SES = "ash"

# Prozodi yönergesi — `instructions` yalnız steerable kuşakta anlamlı. Robotikliğin panzehiri:
# modele NE söyleyeceğini değil NASIL söyleyeceğini anlatır (tempo, nefes, ton, rol).
_VARSAYILAN_TALIMAT = (
    "Türkçeyi ana dili gibi, doğal ve akıcı konuş. Deneyimli, sakin ve güven veren bir kamu "
    "görevlisi meslektaş tonu kullan. Orta tempo; virgüllerde kısa nefes al, cümle sonlarında "
    "tonu doğal biçimde indir. Kurum ve mevzuat adlarını acele etmeden, anlaşılır söyle. "
    "Robotik, haber spikeri gibi ya da abartılı neşeli olma."
)


def _steerable_mi(model: str) -> bool:
    """Model `instructions` (prozodi) destekliyor mu — gpt- kuşağı evet, tts-1* hayır."""
    return model.startswith("gpt-")


def _ses_secimi(model: str, ses: str) -> str:
    """Modelin tanımadığı sesi güvenli karşılığa indir (sessiz HTTP 400 yerine duyulur ses)."""
    if _steerable_mi(model) or ses in _ESKI_KUSAK_SESLERI:
        return ses
    log.warning("tts_ses_uyumsuz_dusuruldu", model=model, istenen=ses,
                kullanilan=_ESKI_KUSAK_YEDEK_SES)
    return _ESKI_KUSAK_YEDEK_SES


def _talimat() -> str:
    """Prozodi yönergesi — env override'ı yoksa Türkçe varsayılan."""
    return os.getenv("OPENAI_TTS_TALIMAT", "").strip() or _VARSAYILAN_TALIMAT


def tts_api_key() -> str:
    """OPENAI_TTS_API_KEY (trim'li) — OPENAI_API_KEY'den BAĞIMSIZ (DeepSeek'ten ayrı sağlayıcı)."""
    return os.environ.get("OPENAI_TTS_API_KEY", "").strip()


def tts_enabled() -> bool:
    """OpenAI TTS anahtarı set mi? (auto-routing kararı için)."""
    return bool(tts_api_key())


def _base_url() -> str:
    """TTS her zaman gerçek OpenAI'a gider — OPENAI_BASE_URL (DeepSeek override'ı) buraya SIZMAZ."""
    return os.getenv("OPENAI_TTS_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")


async def tts_openai(
    text: str,
    *,
    timeout_s: float,
    voice: str | None = None,
    model: str | None = None,
) -> bytes:
    """Metni OpenAI TTS ile sese çevir (format: tts_format()). Başarısızlıkta exception
    (çağıran metne düşer).

    Anahtar `.env`'den — ASLA hardcode edilmez.
    """
    api_key = tts_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_TTS_API_KEY yok — sesli yanıt devre dışı")

    metin = text.strip()
    if not metin:
        raise ValueError("tts_openai: boş metin")
    if len(metin) > _MAX_INPUT_CHARS:
        log.warning("tts_openai_kirpildi", uzunluk=len(metin), sinir=_MAX_INPUT_CHARS)
        metin = metin[:_MAX_INPUT_CHARS]

    secili_model = (model or os.getenv("OPENAI_TTS_MODEL", "") or _VARSAYILAN_MODEL).strip()
    # Persona sesi: marin (yeni kuşağın en doğal ailesi; kullanıcı seçimi 2026-07-25). Env ile
    # değiştirilebilir; TTS'in tek tüketicisi sesli görüşme sahnesi.
    secili_ses = (voice or os.getenv("OPENAI_TTS_VOICE", "") or _VARSAYILAN_SES).strip()

    payload = {
        "model": secili_model,
        "voice": _ses_secimi(secili_model, secili_ses),
        "input": metin,
        "response_format": tts_format(),
    }
    if _steerable_mi(secili_model):
        payload["instructions"] = _talimat()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base = _base_url()

    # Demo para kapısı — TTS `get_llm()` yolundan GEÇMEZ, bu yüzden ayrı ölçülür.
    # `core/tts_kota.py` KARAKTER sayar, DOLAR değil ve günlük tavanı yoktur: dakikada
    # 4000 karakter × gün = milyonlarca karakter, hepsi defterin dışında kalıyordu
    # (adversarial doğrulama bulgusu, 8 Ağu 2026). Kayıt açık olduğu için "auth'lu olması"
    # koruma sağlamıyor.
    demo_butce.butce_kapisi(secili_model)

    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as client:
        async def _post() -> httpx.Response:
            return await client.post(f"{base}{_SPEECH_PATH}", headers=headers, json=payload)

        resp = await send_with_retry(_post)
        # TTS token değil KARAKTER ile faturalanır; ölçülen büyüklük girdi uzunluğudur.
        demo_butce.ses_mutabakati(secili_model, len(metin))
        return resp.content


__all__ = ("tts_api_key", "tts_enabled", "tts_format", "tts_media_type", "tts_openai")
