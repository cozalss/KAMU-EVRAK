"""OpenAI Realtime oturumu — sesli görüşmenin STT+LLM+TTS zincirini TEK atlamaya indirir.

NEDEN (ölçüldü 2026-08-01, aynı 3 Türkçe soru, medyan):
    mevcut zincir : LLM ilk cümle 1459 ms + TTS 1725 ms ≈ 3184 ms
    realtime      : gpt-realtime-2.1 1079 ms · gpt-realtime-mini 905 ms
Yaklaşık 2,2 saniye/tur kazanç.

MİMARİ KARAR — Realtime KULAK ve AĞIZDIR, BEYİN DEĞİL:
Aynı ölçümde `gpt-realtime-2.1-mini` bilgi edinme süresini "yirmi ile otuz gün" dedi; doğrusu
4982 sayılı Kanun'a göre on beş İŞ GÜNÜ. Kamu evrak asistanının yanlış yasal süre söylemesi,
kazanılan saniyelerden pahalıdır. Bu yüzden model, mevzuat/kayıt/süre sorularını kendi
bilgisinden CEVAPLAMAZ; `kamu_evrak_sor` aracını çağırır ve cevap bizim grounded pipeline'ımızdan
(mevzuat RAG + persona + doğrulama) gelir. Model yalnız konuşmayı yürütür ve gelen cevabı seslendirir.

GÜVENLİK: gerçek API anahtarı tarayıcıya ASLA gitmez. Sunucu kısa ömürlü bir "client secret"
üretir (varsayılan 10 dk); tarayıcı yalnız onunla WebRTC kurar. Oturum yapılandırması (persona,
araçlar, ses) da burada kalır — istemci bunları değiştirebilse persona ve grounding sözleşmesi
istemci-kontrollü olurdu.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import structlog

from core import demo_butce

log = structlog.get_logger()

_ANAHTAR_UCU = "https://api.openai.com/v1/realtime/client_secrets"
_VARSAYILAN_MODEL = "gpt-realtime-2.1"
_VARSAYILAN_SES = "marin"
# Anahtar ömrü: sahne açılışında alınır, oturum boyunca yaşar. Kısa tutulur — sızarsa
# kullanılabileceği pencere dar olsun (API 10..7200 sn arası kabul ediyor).
_OMUR_SN = 600

# Modelin ÇAĞIRMAK ZORUNDA olduğu araç. Tek araç bilinçli: pipeline'ın tamamı (niyet, mevzuat
# RAG, kayıt sorgusu, birim yönlendirme, PII maskeleme) zaten /sohbet ucunun arkasında duruyor —
# burada yeniden tanımlamak iki ayrı doğruluk kaynağı yaratırdı.
ARACLAR: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "kamu_evrak_sor",
        "description": (
            "Kullanıcının evrak, taslak, kayıt, sayı, mevzuat, yasal süre ya da birim "
            "yönlendirme sorularında bu aracı çağır. Kendi bilginden kayıt sayısı, evrak "
            "bilgisi ya da spesifik madde numarası VERME — bunlar araçtan gelir. "
            "ÇAĞIRMADAN ÖNCE 'bakıyorum', 'kısaca anlatayım' gibi DOLGU CÜMLESİ KURMA; "
            "aracı hemen çağır, cevabı sonucu alınca tek seferde söyle. Dolgu cümlesi "
            "kullanıcıyı iki kez bekletiyor."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "soru": {
                    "type": "string",
                    "description": "Kullanıcının sorusu, olduğu gibi ya da netleştirilmiş hâliyle.",
                },
            },
            "required": ["soru"],
        },
    },
]


def realtime_acik() -> bool:
    """Realtime sesli mod açık mı? (SESLI_REALTIME=0 → eski STT+TTS zinciri kullanılır.)

    Kapatma anahtarı bilerek var: WebRTC bazı kurum ağlarında/güvenlik duvarlarında engellenir.
    Jüri gününde tek ENV ile çalışan yola dönebilmek, silinmiş bir yoldan iyidir.
    """
    return (os.getenv("SESLI_REALTIME", "1").strip().lower()
            not in ("0", "false", "hayir", "hayır", "off"))


def realtime_model() -> str:
    return os.getenv("SESLI_REALTIME_MODEL", "").strip() or _VARSAYILAN_MODEL


def realtime_ses() -> str:
    return os.getenv("OPENAI_TTS_VOICE", "").strip() or _VARSAYILAN_SES


def oturum_yapilandirmasi(talimat: str) -> dict[str, Any]:
    """Efemer anahtara iliştirilen oturum ayarları — persona, araç ve ses SUNUCUDA belirlenir."""
    return {
        "type": "realtime",
        "model": realtime_model(),
        "instructions": talimat,
        "audio": {
            "input": {
                # Konuşma bitişini modelin kendisi sezer (semantic_vad): tarayıcı STT'sinin
                # sabit sessizlik eşiğinden hem daha hızlı hem cümle ortasında kesmiyor.
                "turn_detection": {"type": "semantic_vad"},
                "transcription": {"model": "gpt-4o-mini-transcribe"},
            },
            "output": {"voice": realtime_ses()},
        },
        "tools": ARACLAR,
        "tool_choice": "auto",
    }


async def efemer_anahtar(talimat: str, *, timeout_s: float = 20.0) -> dict[str, Any]:
    """Kısa ömürlü istemci anahtarı üret. Başarısızlıkta exception (çağıran 503'e çevirir)."""
    # DEMO MODUNDA KAPALI — ölçülemeyen harcama sınırlanamaz.
    # Bu uç kısa ömürlü bir OpenAI Realtime istemci anahtarı basar; ses ondan sonra
    # TARAYICIDAN doğrudan sağlayıcıya akar ve BU SUNUCUDAN HİÇ GEÇMEZ. Dolayısıyla
    # harcamayı ölçmek fiziksel olarak mümkün değil: token sayısı bize hiç ulaşmıyor.
    # Kapatılamayan bir musluğa tavan koymuş gibi yapmak, tavanı olduğundan güvenli
    # göstermek olurdu (adversarial doğrulama bulgusu, 8 Ağu 2026). Kayıt açık olduğu
    # için "auth'lu" olması da koruma sağlamıyor — iki istekte hesap açılıyor.
    if demo_butce.demo_acik():
        raise RuntimeError(
            "Realtime sesli mod demo dağıtımında kapalıdır (harcama ölçülemediği için "
            "günlük bütçe tavanına dâhil edilemez).")

    api_key = os.environ.get("OPENAI_TTS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_TTS_API_KEY yok — realtime sesli mod devre dışı")

    govde = {
        "session": oturum_yapilandirmasi(talimat),
        "expires_after": {"anchor": "created_at", "seconds": _OMUR_SN},
    }
    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as client:
        resp = await client.post(
            _ANAHTAR_UCU,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=govde,
        )
    if resp.status_code != 200:
        # Ham gövde YAZILMAZ: sağlayıcı hata yanıtı isteği (oturum talimatları dâhil) yankılar.
        _hata = ""
        try:
            _h = (resp.json() or {}).get("error") or {}
            _hata = str(_h.get("code") or _h.get("type") or "")
        except Exception:
            _hata = ""
        log.warning("realtime_anahtar_hatasi", status=resp.status_code,
                    hata=_hata, govde_n=len(resp.text))
        raise RuntimeError(f"realtime anahtar alınamadı: HTTP {resp.status_code}")
    veri = resp.json()
    anahtar = veri.get("value") or (veri.get("client_secret") or {}).get("value")
    if not anahtar:
        raise RuntimeError("realtime yanıtında istemci anahtarı yok")
    # DİKKAT: yalnız efemer anahtar ve model döner. Oturum yapılandırmasının tamamını
    # istemciye geri vermek, persona/araç sözleşmesini istemciye açık etmek olurdu.
    return {"anahtar": anahtar, "model": realtime_model(), "omur_sn": _OMUR_SN}


__all__ = ("ARACLAR", "efemer_anahtar", "oturum_yapilandirmasi", "realtime_acik",
           "realtime_model", "realtime_ses")
