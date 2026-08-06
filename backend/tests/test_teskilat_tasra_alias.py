"""Taşraya adreslenmiş evrak, ulusal kurum kaydına çözümlenmeli.

Vatandaş ve kurumlar merkeze değil TAŞRA birimine yazar: "Ankara Vergi Dairesi
Başkanlığına", "Beşiktaş Tapu Müdürlüğüne", "Konya Sosyal Güvenlik İl Müdürlüğüne".
Bu adlar korpusta ayrı kurum olarak tutulmaz; `_kanonik_slug` il adını kırpıp künyedeki
@ALIAS satırı üzerinden ulusal kuruma bağlar.

NEDEN BU DOSYA VAR: 2026-08-06'da bu üç kurumun dosyaları resmî kaynaklardan yeniden
yazılırken @ALIAS satırındaki TAŞRA adları farkında olmadan düşürüldü. SGK'nınkini
`test_route_ajan.py::test_il_adi_kirpma_sgk` yakaladı; GİB ve TKGM'nin hiç testi yoktu ve
kayıp SESSİZ kaldı — taşraya adreslenmiş evrak kuruma hiç bağlanamaz hâle gelmişti.
Üçü de burada kilitlenir; yeni bir kurumun taşra alias'ı eklenirse listeye eklenmelidir.
"""
from __future__ import annotations

import pytest

from agents.nodes.teskilat_ara import _kanonik_slug

# (taşra birimi adı örneği, çözümlenmesi gereken ulusal kurum slug'ı)
TASRA_ESLEMELERI = [
    ("ankara-sosyal-guvenlik-il-mudurlugu", "sosyal-guvenlik-kurumu"),
    ("konya-sosyal-guvenlik-merkezi", "sosyal-guvenlik-kurumu"),
    ("ankara-vergi-dairesi-baskanligi", "gelir-idaresi-baskanligi"),
    ("izmir-vergi-dairesi-mudurlugu", "gelir-idaresi-baskanligi"),
    ("besiktas-tapu-mudurlugu", "tapu-ve-kadastro-genel-mudurlugu"),
    ("bursa-kadastro-mudurlugu", "tapu-ve-kadastro-genel-mudurlugu"),
]


@pytest.mark.parametrize("tasra,ulusal", TASRA_ESLEMELERI)
def test_tasra_birimi_ulusal_kuruma_cozumlenir(tasra: str, ulusal: str) -> None:
    assert _kanonik_slug(tasra) == ulusal, (
        f"{tasra} çözümlenemedi — {ulusal} künyesindeki @ALIAS satırından taşra adı "
        "silinmiş olabilir"
    )


@pytest.mark.parametrize("slug", sorted({u for _, u in TASRA_ESLEMELERI}))
def test_kurumun_kendi_slugu_da_cozumlenir(slug: str) -> None:
    """Taşra alias'ı eklenirken kurumun kendi slug'ı kaybolmamalı."""
    assert _kanonik_slug(slug) == slug
