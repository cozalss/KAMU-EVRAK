"""SLA önizleme — işlenmemiş kuyruk öğeleri için yasal süre rozeti (DB'siz, saf hesap).

Gelen Evrak kuyruğundaki öğeler henüz pipeline'dan geçmediği için sla_metadata
taşımaz. Frontend rozet gösterebilsin diye compute_sla (agents/nodes/sla_triyaj —
TEK doğruluk kaynağı: EVRAK_TO_SURE + kritik eşik + iş günü mantığı) hafif bir
endpoint'le yeniden kullanılır; süre tablosu frontend'e KOPYALANMAZ.

Tarih çıkarımı bilinçli olarak dar: yalnız "Tarih:" etiketli satır okunur —
gövdedeki rastgele bir tarihi yakalayıp yanlış SLA üretme riski sla_triyaj.py'de
belgelidir, aynı kural burada da geçerlidir. Etiketli tarih yoksa compute_sla
'tarih_yok' döner (uydurma yok).
"""

from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agents.nodes.sla_triyaj import compute_sla

router = APIRouter(prefix="/sla", tags=["sla"])

# Yalnız "Tarih: dd.mm.yyyy" biçimli ETİKETLİ satır (bkz. modül docstring'i).
_RE_TARIH_SATIRI = re.compile(r"^\s*Tarih\s*[:\-]\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})", re.MULTILINE)


class SlaOge(BaseModel):
    id: str = Field(..., max_length=100)
    tur: str = Field(..., max_length=50)
    metin: str = Field("", max_length=20000)


class SlaOnizlemeIstek(BaseModel):
    ogeler: list[SlaOge] = Field(default_factory=list, max_length=40)


def _etiketli_tarih(metin: str) -> str:
    m = _RE_TARIH_SATIRI.search(metin or "")
    return m.group(1) if m else ""


@router.post("/onizleme")
async def sla_onizleme(istek: SlaOnizlemeIstek) -> dict:
    """Kuyruk öğeleri → sla_metadata listesi (sıra ve id korunur)."""
    bugun = date.today()
    sonuclar = [{
        "id": oge.id,
        "sla_metadata": compute_sla(oge.tur, _etiketli_tarih(oge.metin), bugun),
    } for oge in istek.ogeler]
    return {"adet": len(sonuclar), "sonuclar": sonuclar}


__all__ = ("router",)
