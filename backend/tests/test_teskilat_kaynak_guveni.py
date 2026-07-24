"""Teşkilat korpusunda otomatik havale güven eşiği testleri."""
from __future__ import annotations

from urllib.parse import urlparse

from agents.nodes.teskilat_ara import kurum_korpusta_var, teskilat_birim_ara
from scripts.seed_teskilat import _kaynak_guveni, build_index


def test_resmi_kaynak_icin_acik_metadata_zorunlu() -> None:
    meta = {
        "KAYNAK_KIMLIK": "https://www.ornek.gov.tr/birimler",
        "KAYNAK_TURU": "resmi_teskilat",
    }
    assert _kaynak_guveni(meta) == "aday"


def test_indeksteki_resmi_kaynaklar_resmi_https_alanda() -> None:
    index = build_index()
    resmi = [c for c in index["chunks"] if c["kaynak_guven"] == "resmi_dogrulanmis"]

    assert resmi
    for chunk in resmi:
        parsed = urlparse(chunk["kaynak_kimlik"])
        assert parsed.scheme == "https"
        assert (parsed.hostname or "").endswith((".gov.tr", ".bel.tr", ".edu.tr", ".tsk.tr"))
        assert chunk["kaynak_turu"] in {
            "resmi_yonetmelik",
            "resmi_teskilat",
            "resmi_hizmet",
            "resmi_karar",
        }
        assert len(chunk["icerik_sha256"]) == 64
        assert chunk["dogrulayan"]
        assert chunk["dogrulama_tarihi"]
        assert chunk["dogrulama_yontemi"]


def test_eski_model_kaynak_insan_onayi_adayi_kalir() -> None:
    adaylar = teskilat_birim_ara(
        "uludag-elektrik-dagitim",
        "sokak aydınlatması arızası",
    )

    assert kurum_korpusta_var("uludag-elektrik-dagitim") is False
    assert adaylar and adaylar[0]["kaynak_tipi"] == "aday"
