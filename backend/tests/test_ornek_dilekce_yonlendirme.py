"""Frontend'teki örnek dilekçelerin kritik yönlendirme sözleşmesi."""
from __future__ import annotations

import pytest

from agents.nodes.route_birim import route_birim_node


@pytest.mark.parametrize(
    ("kurum", "antet", "konu", "metin", "beklenen_birim"),
    (
        (
            "Yenimahalle Belediyesi",
            "YENİMAHALLE BELEDİYE BAŞKANLIĞINA",
            "İşyeri açma ve çalışma ruhsatı başvurusu",
            "Kırtasiye işletmesi için işyeri açma ve çalışma ruhsatı düzenlenmesini talep ederim.",
            "Ruhsat ve Denetim Müdürlüğü",
        ),
        (
            "Keçiören Belediyesi",
            "KEÇİÖREN BELEDİYE BAŞKANLIĞINA",
            "Sokak çukuru onarımı talebi",
            "Sokağımızın başındaki çukurun onarılmasını, yol ve kaldırımın güvenli hale getirilmesini talep ederim.",
            "Fen İşleri Müdürlüğü",
        ),
        (
            "Odunpazarı Belediyesi",
            "ODUNPAZARI BELEDİYE BAŞKANLIĞINA",
            "Yol ve kaldırım yapımı talebi",
            "Sokağımızın asfalt yüzeyi ve kaldırımları yıpranmıştır; bakım ve onarım yapılmasını talep ederim.",
            "Fen İşleri Müdürlüğü",
        ),
        (
            "Akdeniz Belediyesi",
            "AKDENİZ BELEDİYE BAŞKANLIĞINA",
            "Başıboş sokak köpekleri hakkında şikayet",
            "Sahipsiz köpeklerin toplanması, rehabilitasyonu ve gerekli sağlık tedbirlerinin alınmasını talep ederim.",
            "Veteriner İşleri Müdürlüğü",
        ),
    ),
)
async def test_ornek_dilekce_resmi_kurum_birimine_yonlendirilir(
    kurum: str,
    antet: str,
    konu: str,
    metin: str,
    beklenen_birim: str,
) -> None:
    out = await route_birim_node(
        {
            "evrak_turu": "dilekce",
            "evrak_text": f"T.C.\n{antet}\n\nKonu: {konu}\n\n{metin}",
            "bilgi_unsurlari": {"kurum": kurum, "konu": konu},
        }
    )

    assert out["hedef_kurum_adi"] == kurum
    assert out["hedef_birim"] == beklenen_birim
    assert out["durum"] == "kaynak_dogrulandi"
    assert out["insan_onayi_gerekli"] is False
    assert out["hedef_birim_kaynak"]["kaynak_tipi"] == "kurum_ozel"
