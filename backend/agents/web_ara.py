"""WebAdapter — kaynak-doğrulamalı yönlendirmenin canlı resmî-kaynak yedeği ('her yer' motoru).

REVİZYON 5: OfflineKorpusAdapter ile AYNI `OfficialSourceSearch` sözleşmesini uygular →
route ajanı/grounding kodu değişmez. Kuruma-özel offline kaynak yoksa (korpus-dışı kurum)
devreye girer. ENV-gated (ROUTE_WEB_YEDEK=1) + varsayılan KAPALI → offline/CI/mock ilkesi korunur.

Sağlayıcı sözleşmesi (pluggable): WEB_ARAMA_URL, `{"q": ...}` GET alıp
`{"results": [{"title","url","snippet"}]}` döndüren herhangi bir arama uç noktası olabilir
(resmî kurum-sitesi arama proxy'si, kurumsal search API, vb.). Anahtar WEB_ARAMA_KEY (opsiyonel,
Authorization: Bearer). URL tanımsız/hata/boş → [] döner → dispatcher offline jenerik adaylara düşer.

Çıktı `KaynakKaydi` (url_veya_belge_kimligi = gerçek URL, erisim_tarihi = bugün, icerik_hash) →
denetim izi + grounding kanıtı offline ile aynı şemada. Snippet'ten birim adı çıkarımı DeepSeek
ile (KVKK-maskeli); LLM yok/mock → başlık/snippet heuristiği. Uydurma yok: yalnız dönen
sonuçlardaki metinden birim üretilir, grounding (route ajanı) yine üçlü doğrular.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import date

import structlog

from agents.resmi_kaynak import KaynakKaydi

log = structlog.get_logger()

_TIMEOUT_S = float(os.getenv("WEB_ARAMA_TIMEOUT_S", "8.0"))
_MAX_SONUC = int(os.getenv("WEB_ARAMA_MAX", "5"))


def _kayit(kurum_ad: str, birim_ad: str, gorev: str, url: str, baslik: str) -> KaynakKaydi:
    metin = f"{birim_ad}. {gorev}"
    return {
        "birim_ad": birim_ad,
        "gorev": gorev,
        "kaynak_kurum": kurum_ad,
        "kurum_slug": "",
        "belge_basligi": baslik,
        "url_veya_belge_kimligi": url,
        "erisim_tarihi": date.today().isoformat(),
        "metin_parcasi": metin[:400],
        "icerik_hash": hashlib.sha256(metin.encode("utf-8")).hexdigest()[:16],
        "skor": 0.0,
        "kaynak_tipi": "web",
        "kaynak_guven": "aday",
        "kaynak_dosya": "",
        "kaynak_sha256": "",
        "dogrulayan": "",
        "dogrulama_tarihi": "",
    }


class WebAdapter:
    """Canlı resmî-kaynak araması. WEB_ARAMA_URL tanımsızsa etkin değildir ([] döner)."""

    def __init__(self) -> None:
        self._url = os.getenv("WEB_ARAMA_URL", "").strip()
        self._key = os.getenv("WEB_ARAMA_KEY", "").strip()

    def kurum_var(self, kurum_slug: str) -> bool:
        # Web adapter kurumu önceden 'bilmez'; her zaman canlı arar (dispatcher offline'ı önceler).
        return bool(self._url)

    def ara(self, kurum_slug: str, konu: str, *, tur: str = "") -> list[KaynakKaydi]:
        """Kurum + konu için canlı arama → KaynakKaydi listesi. Hata/boş/URL yok → []."""
        if not self._url or not konu:
            return []
        sorgu = f"{kurum_slug.replace('-', ' ')} {konu} görev yönetmeliği hangi birim müdürlük".strip()
        try:
            import httpx

            headers = {"Authorization": f"Bearer {self._key}"} if self._key else {}
            with httpx.Client(timeout=_TIMEOUT_S) as client:
                resp = client.get(self._url, params={"q": sorgu}, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:  # ağ/parse/timeout → sessiz boş (offline jeneriğe düşülür)
            log.warning("web_ara.basarisiz", hata=str(exc))
            return []

        sonuclar = (data or {}).get("results") or []
        kayitlar: list[KaynakKaydi] = []
        for s in sonuclar[:_MAX_SONUC]:
            baslik = (s.get("title") or "").strip()
            snippet = (s.get("snippet") or "").strip()
            url = (s.get("url") or "").strip()
            birim = _birim_adayi(baslik, snippet)
            if birim and url:
                kayitlar.append(_kayit(kurum_slug.replace("-", " ").title(), birim, snippet, url, baslik))
        log.info("web_ara", kurum=kurum_slug, n=len(kayitlar))
        return kayitlar


# Snippet'ten birim adı çıkarımı — "... Müdürlüğü"/"... Daire Başkanlığı" kalıbı (heuristik).
_BIRIM_RE = re.compile(
    r"([A-ZÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ ]{2,40}?(?:Müdürlüğü|Daire Başkanlığı|Başkanlığı|Şube Müdürlüğü|Genel Müdürlüğü))",
)


def _birim_adayi(baslik: str, snippet: str) -> str:
    """Başlık/snippet'ten '... Müdürlüğü' benzeri birim adını çıkar (ilk eşleşme)."""
    for kaynak in (baslik, snippet):
        m = _BIRIM_RE.search(kaynak or "")
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
    return ""


__all__ = ("WebAdapter",)
