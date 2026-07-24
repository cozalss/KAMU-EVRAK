"""Atomic corpus index updates must be visible without a process restart."""
from __future__ import annotations

import json
from pathlib import Path

from agents.nodes import mevzuat_oner, teskilat_ara


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_mevzuat_indeksi_canli_yenilenir(tmp_path: Path, monkeypatch) -> None:
    index = tmp_path / "mevzuat_index.json"
    monkeypatch.setattr(mevzuat_oner, "_INDEX_FILE", index)
    mevzuat_oner._indeks_onbellegini_temizle()
    _write(index, {"chunks": [{"text": "ilk"}]})

    assert mevzuat_oner._load_index()[0]["text"] == "ilk"

    _write(index, {"chunks": [{"text": "ikinci ve daha uzun indeks"}]})
    assert mevzuat_oner._load_index()[0]["text"] == "ikinci ve daha uzun indeks"
    mevzuat_oner._indeks_onbellegini_temizle()


def test_teskilat_indeksi_canli_yenilenir(tmp_path: Path, monkeypatch) -> None:
    index = tmp_path / "teskilat_index.json"
    monkeypatch.setattr(teskilat_ara, "_INDEX_FILE", index)
    teskilat_ara.indeks_onbellegini_temizle()
    _write(index, {"chunks": [{"birim_ad": "Ilk Birim"}], "aliases": {}})

    assert teskilat_ara._load_index()[0]["birim_ad"] == "Ilk Birim"

    _write(index, {"chunks": [{"birim_ad": "Yeni ve Uzun Birim"}], "aliases": {}})
    assert teskilat_ara._load_index()[0]["birim_ad"] == "Yeni ve Uzun Birim"
    teskilat_ara.indeks_onbellegini_temizle()
