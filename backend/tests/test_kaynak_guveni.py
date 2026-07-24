"""Trusted corpus provenance and integrity gate tests."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from core.kaynak_guveni import (
    ADAY,
    RESMI_DOGRULANMIS,
    atomik_json_yaz,
    dosya_sha256,
    mevzuat_kaynak_bilgisi,
)


def _manifest(path: Path, *, url: str, kaynak_turu: str = "kanun") -> dict:
    return {
        path.name: {
            "durum": RESMI_DOGRULANMIS,
            "kaynak_url": url,
            "kaynak_turu": kaynak_turu,
            "icerik_sha256": dosya_sha256(path),
            "dogrulayan": "test-reviewer",
            "dogrulama_tarihi": date.today().isoformat(),
            "dogrulama_yontemi": "Official text compared article by article",
        }
    }


def test_manifest_olmadan_resmi_url_aday_kalir(tmp_path: Path) -> None:
    path = tmp_path / "3071.txt"
    path.write_text(
        "Kaynak: https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3071.pdf\nMadde 1 - Metin.",
        encoding="utf-8",
    )

    bilgi = mevzuat_kaynak_bilgisi(path, {})

    assert bilgi.kaynak_guven == ADAY
    assert "manifest kaydi yok" in bilgi.hatalar


def test_resmi_kaynak_inceleme_ve_hash_ile_dogrulanir(tmp_path: Path) -> None:
    path = tmp_path / "3071.txt"
    url = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3071.pdf"
    path.write_text(f"Kaynak: {url}\nMadde 1 - Metin.", encoding="utf-8")

    bilgi = mevzuat_kaynak_bilgisi(path, _manifest(path, url=url))

    assert bilgi.kaynak_guven == RESMI_DOGRULANMIS
    assert bilgi.kaynak_url == url
    assert bilgi.dogrulayan == "test-reviewer"
    assert bilgi.hatalar == ()


def test_dosya_degistirilirse_dogrulama_otomatik_duser(tmp_path: Path) -> None:
    path = tmp_path / "3071.txt"
    url = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3071.pdf"
    path.write_text(f"Kaynak: {url}\nMadde 1 - Metin.", encoding="utf-8")
    manifest = _manifest(path, url=url)

    path.write_text(f"Kaynak: {url}\nMadde 1 - Degistirilmis metin.", encoding="utf-8")
    bilgi = mevzuat_kaynak_bilgisi(path, manifest)

    assert bilgi.kaynak_guven == ADAY
    assert "dosya SHA-256 manifestle eslesmiyor" in bilgi.hatalar


def test_cozulmemis_dogrula_isareti_kaynagi_adaya_dusurur(tmp_path: Path) -> None:
    path = tmp_path / "3071.txt"
    url = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3071.pdf"
    path.write_text(f"Kaynak: {url}\nMadde 1 - [DOGRULA] Metin.", encoding="utf-8")

    bilgi = mevzuat_kaynak_bilgisi(path, _manifest(path, url=url))

    assert bilgi.kaynak_guven == ADAY
    assert "dosyada cozulmemis DOGRULA isareti var" in bilgi.hatalar


def test_atomik_json_yaz_gecerli_tam_payload_yayinlar(tmp_path: Path) -> None:
    path = tmp_path / "index.json"
    payload = {"version": 2, "chunks": [{"text": "yeni indeks"}]}

    atomik_json_yaz(path, payload)

    assert json.loads(path.read_text(encoding="utf-8")) == payload
    assert not list(tmp_path.glob(f".{path.name}.*.tmp"))
