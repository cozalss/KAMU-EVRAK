"""Üretim imajı depo kökündeki data/ klasörünü taşımalı.

Kod veri dosyalarını `Path(__file__).parents[N] / "data"` ile DEPO KÖKÜNDE arar. Dockerfile
backend/'i /app'e kopyaladığı için konteynerde bu yol /data olur. data/ imaja girmezse canlı
site hiçbir hata vermeden her belgede deterministik yedeğe düşer (Ağu–Eki 2026'da tam olarak
bu oldu: mevzuat statik listeye, sicil boşa, yazı şablonları yedeğe düşüyordu).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_KOK = Path(__file__).resolve().parents[2]
_DOCKERFILE = _KOK / "Dockerfile"
_DOCKERIGNORE = _KOK / ".dockerignore"
# Çalışma anında okunan ve imajda bulunması ZORUNLU veri alt klasörleri.
_ZORUNLU = ("mevzuat", "teskilat", "templates", "sdp", "fonts")


def _runtime_asamasi() -> str:
    metin = _DOCKERFILE.read_text(encoding="utf-8")
    parca = re.split(r"(?im)^FROM\s+\S+\s+AS\s+runtime\s*$", metin)
    assert len(parca) == 2, "Dockerfile'da 'AS runtime' aşaması bulunamadı"
    return parca[1]


def test_runtime_imaji_data_klasorunu_depo_kokune_kopyalar() -> None:
    runtime = _runtime_asamasi()
    assert re.search(r"(?m)^COPY\s+(--\S+\s+)*data/?\s+/data/?\s*$", runtime), (
        "runtime aşaması 'COPY data/ /data/' içermeli — kod veriyi depo kökünde arar"
    )


@pytest.mark.parametrize("alt", _ZORUNLU)
def test_dockerignore_zorunlu_veriyi_dislamaz(alt: str) -> None:
    satirlar = [
        s.split("#", 1)[0].strip()
        for s in _DOCKERIGNORE.read_text(encoding="utf-8").splitlines()
    ]
    yasak = {"data", "data/", f"data/{alt}", f"data/{alt}/", "data/*", "data/**"}
    assert not yasak.intersection(satirlar), f".dockerignore data/{alt} klasörünü dışlıyor"


@pytest.mark.parametrize("alt", _ZORUNLU)
def test_zorunlu_veri_klasoru_depoda_var(alt: str) -> None:
    assert (_KOK / "data" / alt).is_dir()


def test_kod_veriyi_depo_kokunde_arar() -> None:
    """Varsayımın kendisi: kodun hesapladığı kök, backend'in bir üstü olmalı."""
    from agents.nodes import mevzuat_oner
    from core import sicil

    assert sicil._ROOT == _KOK
    assert mevzuat_oner._ROOT == _KOK
