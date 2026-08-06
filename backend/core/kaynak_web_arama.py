"""Resmî kaynak adresini web aramasıyla bulur — canlı keşfin SON ve tek ücretli katmanı.

Sıra: (1) `kurum_alan` kalıptan adres türetir [ücretsiz, kurumların %69,8'i],
(2) `sayfa_kesif` o sitede birim sayfasını bulur [ücretsiz], (3) BURASI yalnız ikisi de
tutmazsa devreye girer. Yani ücretli katman kurumların ~%30'unu ilgilendirir.

MODEL NEYİ DÖNDÜRÜR: bir ADRES. Birim listesi DEĞİL. Adres `sayfa_kesif.izinli_mi`den
geçer, sayfayı biz indiririz, birim adlarının o sayfada birebir geçtiğini biz doğrularız.
Modelin ürettiği metin hiçbir zaman doğrudan korpusa yazılmaz.

ÜÇ KORUMA:
  · `allowed_domains` — API SEVİYESİNDE kısıt, prompt'ta rica değil. Model resmî alan
    dışına çıkamaz. Dönen adres ayrıca yerel olarak da doğrulanır (kemer + askı).
  · SERT HARCAMA TAVANI — `KESIF_AZAMI_HARCAMA_USD`. Tavana ulaşılınca arama kendini
    kapatır ve sistem ücretsiz katmanlara döner; hata fırlatmaz, yalnız link göstermez.
  · 429 GERİ ÇEKİLME — hesabın dakikalık token limiti dolabiliyor (ölçüldü 2026-08-06:
    tek çağrı 41.684 token istedi ve TPM limitine takıldı). Yeniden deneme olmadan
    keşif rastgele başarısız olur.

MALİYET (2026-08-06 ölçümü, tek çağrı 10.613 girdi + 178 çıktı token):
    gpt-5.6-luna  ≈ $0,008   ← varsayılan
    gpt-5.6-terra ≈ $0,030
Girdinin büyük olmasının sebebi arama sonuçlarının modele geri beslenmesidir; soru kısa
olsa da girdi büyük olur. Bu yüzden ucuz model varsayılandır.
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import structlog

from core.sayfa_kesif import izinli_mi

log = structlog.get_logger()

_UC = "https://api.openai.com/v1/responses"
# Arama bu alanlarla SINIRLI — API tarafında zorlanır (prompt'a bırakılmaz).
IZINLI_ARAMA_ALANLARI = ("gov.tr", "bel.tr", "edu.tr")
_ZAMAN_ASIMI = 60.0
_AZAMI_DENEME = 3
_URL_RE = re.compile(r"https://[^\s<>\"']+")

# 1M token başına USD (2026-08-06 fiyat sayfası). Harcama tavanını yerel hesaplamak için;
# fatura kaynağı değil, yalnız KENDİ KENDİNİ DURDURMA eşiği.
_FIYAT = {
    "gpt-5.6-luna": (0.20, 1.20),
    "gpt-5.6-terra": (2.00, 12.00),
    "gpt-5.6-sol": (5.00, 30.00),
}
_VARSAYILAN_FIYAT = (2.00, 12.00)   # bilinmeyen model → pahalı say, erken dur

_HARCAMA_DOSYASI = Path(__file__).resolve().parents[2] / "data" / "kesif_harcama.json"


@dataclass(frozen=True)
class AramaSonucu:
    url: str
    model: str
    maliyet_usd: float


def _cevre(ad: str, varsayilan: str = "") -> str:
    return (os.getenv(ad) or varsayilan).strip()


def azami_harcama() -> float:
    try:
        return max(0.0, float(_cevre("KESIF_AZAMI_HARCAMA_USD", "0")))
    except ValueError:
        return 0.0


def harcanan() -> float:
    """Bugüne kadar bu katmanda harcanan (yerel sayaç)."""
    try:
        return float(json.loads(_HARCAMA_DOSYASI.read_text(encoding="utf-8"))["usd"])
    except (OSError, ValueError, KeyError, TypeError):
        return 0.0


def _harcamayi_yaz(yeni: float) -> None:
    try:
        _HARCAMA_DOSYASI.parent.mkdir(parents=True, exist_ok=True)
        _HARCAMA_DOSYASI.write_text(
            json.dumps({"usd": round(yeni, 6)}, ensure_ascii=False) + "\n",
            encoding="utf-8", newline="\n",
        )
    except OSError as exc:
        log.warning("kesif.harcama_yazilamadi", hata=str(exc))


def acik_mi() -> bool:
    """Web araması kullanılabilir mi: anahtar var, tavan tanımlı ve aşılmamış."""
    return bool(_cevre("KESIF_OPENAI_API_KEY")) and harcanan() < azami_harcama()


def _maliyet(model: str, girdi: int, cikti: int) -> float:
    gi, co = _FIYAT.get(model, _VARSAYILAN_FIYAT)
    return girdi * gi / 1e6 + cikti * co / 1e6


def _soru(kurum_ad: str) -> str:
    return (
        f"{kurum_ad} kurumunun RESMÎ web sitesinde, birimlerini/teşkilatını listeleyen "
        "sayfanın TAM adresini bul. Yalnız adresi yaz, başka hiçbir şey yazma. "
        "Bulamazsan sadece YOK yaz."
    )


def kaynak_sayfasi_ara(kurum_ad: str) -> AramaSonucu | None:
    """Kurumun birim sayfasının adresini web aramasıyla bul. Kapalıysa/bulamazsa None.

    Dönen adres YALNIZ bir adrestir; sayfayı çağıran indirir ve birim adlarını orada
    birebir doğrular. Model çıktısı korpusa yazılmaz.
    """
    if not acik_mi():
        log.info("kesif.web_aramasi_kapali",
                 harcanan=round(harcanan(), 4), tavan=azami_harcama())
        return None
    model = _cevre("KESIF_ARAMA_MODEL", "gpt-5.6-luna")
    govde = {
        "model": model,
        "input": _soru(kurum_ad),
        "tools": [{"type": "web_search",
                   "filters": {"allowed_domains": list(IZINLI_ARAMA_ALANLARI)}}],
    }
    basliklar = {"Authorization": f"Bearer {_cevre('KESIF_OPENAI_API_KEY')}",
                 "Content-Type": "application/json"}

    yanit: httpx.Response | None = None
    for deneme in range(_AZAMI_DENEME):
        try:
            yanit = httpx.post(_UC, timeout=_ZAMAN_ASIMI, headers=basliklar, json=govde)
        except Exception as exc:
            log.warning("kesif.istek_hatasi", hata=type(exc).__name__)
            return None
        if yanit.status_code != 429:
            break
        # Hesabın dakikalık token limiti dolu; üstel geri çekilme.
        bekle = min(2 ** deneme * 4, 20)
        log.info("kesif.hiz_limiti", deneme=deneme + 1, bekle=bekle)
        time.sleep(bekle)
    if yanit is None or yanit.status_code != 200:
        log.warning("kesif.basarisiz", durum=None if yanit is None else yanit.status_code)
        return None

    veri = yanit.json()
    kullanim = veri.get("usage") or {}
    maliyet = _maliyet(model, int(kullanim.get("input_tokens") or 0),
                       int(kullanim.get("output_tokens") or 0))
    _harcamayi_yaz(harcanan() + maliyet)

    metin = " ".join(
        (parca.get("text") or "")
        for oge in veri.get("output", []) if oge.get("type") == "message"
        for parca in (oge.get("content") or [])
    )
    eslesme = _URL_RE.search(metin)
    if not eslesme:
        log.info("kesif.adres_bulunamadi", kurum=kurum_ad, maliyet=round(maliyet, 5))
        return None
    url = eslesme.group(0).rstrip(".,;)\"'")
    # KEMER + ASKI: allowed_domains API'de zorlansa da dönen adres yerel olarak da
    # doğrulanır. Filtrenin ileride değişmesi ya da modelin metin içinde başka bir
    # adres yazması bizi izinsiz alana götürmemeli.
    if not izinli_mi(url):
        log.warning("kesif.izinsiz_adres_reddedildi", url=url)
        return None
    log.info("kesif.bulundu", kurum=kurum_ad, url=url, maliyet=round(maliyet, 5))
    return AramaSonucu(url=url, model=model, maliyet_usd=maliyet)


__all__ = (
    "IZINLI_ARAMA_ALANLARI",
    "AramaSonucu",
    "acik_mi",
    "azami_harcama",
    "harcanan",
    "kaynak_sayfasi_ara",
)
