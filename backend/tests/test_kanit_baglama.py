"""kanit_baglama node testleri — çıkarım span'ları (deterministik, PII-güvenli).

Span'lar MASKELİ metin üzerinde hesaplanır → ham TCKN/telefon frontend'e sızmaz.
Bulunamayan değer atlanır (uydurma konum yok). AAA deseni.
"""

from __future__ import annotations

import re

from agents.nodes.kanit_baglama import compute_spans, kanit_baglama_node
from api.pii import mask_pii

_TEXT = (
    "T.C. KAMU KURUMU\n"
    "Sayı : E-2024-8842\n"
    "Tarih : 01.06.2026\n"
    "Konu : yol çukuru tamiri\n"
    "Gönderen: Ayşe Yılmaz\n"
    "TCKN: 12345678950"
)


class TestComputeSpans:
    def test_tarih_konu_sayi_bulunur_ve_dogru_isaret(self):
        # Arrange
        unsurlar = {"sayi": "E-2024-8842", "tarih": "01.06.2026", "konu": "yol çukuru tamiri"}
        # Act
        out = compute_spans(_TEXT, unsurlar)
        # Assert — üç alan da işaretlendi; her span tam değeri gösterir
        alanlar = {s["alan"] for s in out["spanlar"]}
        assert {"sayi", "tarih", "konu"} <= alanlar
        for s in out["spanlar"]:
            assert out["metin"][s["start"]:s["end"]] == s["deger"]
        tarih = next(s for s in out["spanlar"] if s["alan"] == "tarih")
        assert tarih["deger"] == "01.06.2026"

    def test_spanlar_baslangica_gore_sirali(self):
        # Arrange + Act
        out = compute_spans(_TEXT, {"sayi": "E-2024-8842", "tarih": "01.06.2026"})
        # Assert
        starts = [s["start"] for s in out["spanlar"]]
        assert starts == sorted(starts)

    def test_ham_tckn_metne_sizmaz_pii_guvenli(self):
        # Arrange — maskeli TCKN değeri (cikar'ın ürettiği biçim)
        tckn_maskeli = mask_pii("12345678950").masked_text  # "123******50"
        # Act
        out = compute_spans(_TEXT, {"tckn_maskeli": tckn_maskeli})
        # Assert — döndürülen metinde 11-haneli ham TCKN YOK
        assert not re.search(r"\b[1-9]\d{10}\b", out["metin"])
        # maskeli TCKN span'ı bulundu (konum doğru, değer maskeli)
        assert any(s["alan"] == "tckn_maskeli" for s in out["spanlar"])

    def test_bulunamayan_deger_atlanir(self):
        # Arrange + Act — metinde olmayan değer span üretmez (uydurma konum yok)
        out = compute_spans(_TEXT, {"konu": "burada hiç geçmeyen bambaşka metin"})
        # Assert
        assert all(s["alan"] != "konu" for s in out["spanlar"])

    def test_bos_metin_bos_span(self):
        # Arrange + Act
        out = compute_spans("", {"konu": "x"})
        # Assert
        assert out["metin"] == ""
        assert out["spanlar"] == []


class TestKanitBaglamaNode:
    async def test_node_kanit_metadata_doner(self):
        # Arrange
        state = {"evrak_text": _TEXT, "bilgi_unsurlari": {"tarih": "01.06.2026", "konu": "yol çukuru tamiri"}}
        # Act
        out = await kanit_baglama_node(state)
        # Assert
        assert "kanit_metadata" in out
        assert out["kanit_metadata"]["spanlar"]
        assert "metin" in out["kanit_metadata"]

    async def test_node_bos_state_patlamaz(self):
        # Arrange + Act
        out = await kanit_baglama_node({})
        # Assert — additive, asla patlamaz
        assert out["kanit_metadata"] == {"metin": "", "spanlar": []}
