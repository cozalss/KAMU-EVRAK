"""Doğrulanmamış kuruma evrak gelince canlı kaynak bulur — katmanları birleştiren yer.

AKIŞ (ucuzdan pahalıya, ilk tutan kazanır):
    0. ÖNBELLEK      — bu kurum daha önce bulunduysa hiç dışarı çıkma      [0 sn, 0 $]
    1. ALAN KALIBI   — sicil türünden adres türet (kurumların %69,8'i)     [~1 sn, 0 $]
    2. SAYFA KEŞFİ   — o sitede "birimler/teşkilat" sayfasını bul          [~1 sn, 0 $]
    3. WEB ARAMASI   — 1-2 tutmazsa; resmî alanlara kilitli, bütçe tavanlı [~8 sn, ~$0,002]
    4. BİRİM ÇIKARIM — sayfadan unvan ekiyle biten adları topla            [0 sn, 0 $]

NEDEN ÇIKARIMDA LLM YOK: birimler zaten SAYFADAN geliyor, yani "kaynakta birebir geçme"
şartı yapısı gereği sağlanıyor. Ölçüldü (2026-08-06): mevcut regex çıkarıcı Kayseri
Valiliğinden 26, Selçuklu Belediyesinden 37 gerçek birim adı çıkardı. LLM eklemek maliyet
ve gecikme getirir, doğruluk getirmez — konuyla eşleştirmeyi zaten BM25 yapıyor.

SONUÇ KORPUSA YAZILMAZ. Dönen şey memura gösterilecek bir ÖNERİ + KAYNAK LİNKİdir.
"Doğrulanmış" damgası manifest + SHA-256 + insan incelemesi gerektirir; canlı bulunan
sayfa bunlardan geçmemiştir. Ayrım UI'da da korunmalı (sarı, yeşil değil).

GÖZLENEN SINIR: valilik sitelerinin "hizmet birimleri" sayfası valiliğin KENDİ birimlerini
değil ildeki AYRI KURUMLARI listeliyor (İl Emniyet Müdürlüğü vb.). Bu yüzden öneri her
zaman memur onayına gider; otomatik havale bu yoldan ASLA yapılmaz.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import structlog

from core.kurum_alan import aday_alanlar
from core.sayfa_kesif import birim_sayfasi_bul, izinli_mi

log = structlog.get_logger()

_ONBELLEK_DOSYASI = Path(__file__).resolve().parents[2] / "data" / "canli_kaynak_onbellek.json"
# Kurum siteleri sık değişmez; bir ay sonra yeniden bakmak makul bir denge.
ONBELLEK_OMRU_SN = 30 * 24 * 3600
AZAMI_BIRIM = 60

# Birim adı unvanları — doğrulayıcıyla AYNI tanım kullanılmalı, yoksa bir araç "birim"
# derken diğeri demez. Tek kaynak: teskilat_kaynak_dogrula._SON_EKLER.
_SON_EKLER = (
    "Dairesi Başkanlığı", "Daire Başkanlığı", "Kurulu Başkanlığı", "Birimi Başkanlığı",
    "Şube Müdürlüğü", "Müdürlüğü", "Müşavirliği", "Başkanlığı", "Koordinatörlüğü",
    "Uzmanlığı", "Birimi",
)
_ADAY_RE = re.compile(
    r"[A-ZÇĞİÖŞÜ0-9][^<>\n\r\t|•]{2,75}?(?:" + "|".join(map(re.escape, _SON_EKLER)) + ")"
)


@dataclass(frozen=True)
class CanliKaynak:
    """Canlı bulunan kaynak. DOĞRULANMIŞ DEĞİLDİR — memur onayına gider."""

    kurum_slug: str
    url: str
    birimler: tuple[str, ...]
    yol: str            # hangi katman buldu: "onbellek" | "kalip" | "web_arama"
    bulundu_ts: float

    def kunye(self) -> dict[str, Any]:
        """UI'ya gidecek künye. `dogrulanmis` alanı BİLEREK sabit False."""
        return {
            "url": self.url,
            "birim_sayisi": len(self.birimler),
            "yol": self.yol,
            "dogrulanmis": False,
            "uyari": "Bu kaynak canlı bulundu; insan incelemesinden GEÇMEDİ.",
        }


def _onbellek_yukle() -> dict[str, Any]:
    try:
        return json.loads(_ONBELLEK_DOSYASI.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _onbellek_yaz(veri: dict[str, Any]) -> None:
    try:
        _ONBELLEK_DOSYASI.parent.mkdir(parents=True, exist_ok=True)
        gecici = _ONBELLEK_DOSYASI.with_suffix(".tmp")
        gecici.write_text(json.dumps(veri, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8", newline="\n")
        gecici.replace(_ONBELLEK_DOSYASI)
    except OSError as exc:
        log.warning("canli_kaynak.onbellek_yazilamadi", hata=str(exc))


def birimleri_cikar(metin: str) -> tuple[str, ...]:
    """Sayfa metninden unvan ekiyle biten aday birim adları (sıra korunur, tekil)."""
    bulunan = (re.sub(r"\s+", " ", m.group(0)).strip() for m in _ADAY_RE.finditer(metin))
    return tuple(dict.fromkeys(bulunan))[:AZAMI_BIRIM]


def onbellekten(kurum_slug: str) -> CanliKaynak | None:
    kayit = _onbellek_yukle().get(kurum_slug)
    if not isinstance(kayit, dict):
        return None
    if time.time() - float(kayit.get("bulundu_ts") or 0) > ONBELLEK_OMRU_SN:
        return None
    if not izinli_mi(str(kayit.get("url") or "")):
        return None      # önbellek dosyası elle bozulmuş olabilir; adres yine sınanır
    return CanliKaynak(
        kurum_slug=kurum_slug, url=str(kayit["url"]),
        birimler=tuple(kayit.get("birimler") or ()), yol="onbellek",
        bulundu_ts=float(kayit["bulundu_ts"]),
    )


def _onbellege_koy(kaynak: CanliKaynak) -> None:
    veri = _onbellek_yukle()
    kayit = asdict(kaynak)
    kayit["birimler"] = list(kaynak.birimler)
    kayit.pop("kurum_slug", None)
    veri[kaynak.kurum_slug] = kayit
    _onbellek_yaz(veri)


def canli_kaynak_bul(
    kayit: dict[str, Any], *, web_aramasi: bool = True
) -> CanliKaynak | None:
    """Kurum sicil kaydından canlı kaynak bul. Bulamazsa None.

    `web_aramasi=False` ile ücretli katman tamamen devre dışı bırakılabilir (test ve
    çevrimdışı çalışma). Ücretli katman ayrıca kendi bütçe tavanıyla da korunur.
    """
    slug = str(kayit.get("slug") or "")
    if not slug:
        return None

    onbellek = onbellekten(slug)
    if onbellek is not None:
        log.info("canli_kaynak.onbellekten", kurum=slug, url=onbellek.url)
        return onbellek

    # 1-2. katman: kalıptan adres + site içi sayfa keşfi (ücretsiz)
    bulgu = birim_sayfasi_bul(aday_alanlar(kayit))
    yol = "kalip"

    # 3. katman: yalnız ücretsiz yol tutmazsa (ücretli)
    if bulgu is None and web_aramasi:
        from core.kaynak_web_arama import kaynak_sayfasi_ara
        sonuc = kaynak_sayfasi_ara(str(kayit.get("ad") or slug))
        if sonuc is not None:
            bulgu = birim_sayfasi_bul([sonuc.url], azami_sayfa=2)
            yol = "web_arama"

    if bulgu is None:
        log.info("canli_kaynak.bulunamadi", kurum=slug)
        return None

    birimler = birimleri_cikar(bulgu.metin)
    if not birimler:
        # Sayfa açıldı ama birim adı çıkmadı — link göstermenin memura faydası yok.
        log.info("canli_kaynak.birim_cikmadi", kurum=slug, url=bulgu.url)
        return None

    kaynak = CanliKaynak(kurum_slug=slug, url=bulgu.url, birimler=birimler,
                         yol=yol, bulundu_ts=time.time())
    _onbellege_koy(kaynak)
    log.info("canli_kaynak.bulundu", kurum=slug, url=bulgu.url,
             birim=len(birimler), yol=yol)
    return kaynak


__all__ = ("AZAMI_BIRIM", "CanliKaynak", "birimleri_cikar", "canli_kaynak_bul",
           "onbellekten")
