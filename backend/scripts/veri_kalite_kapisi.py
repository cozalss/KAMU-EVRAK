"""Mevzuat ve teskilat korpuslari icin yayin-oncesi kalite kapisi.

Hata durumunda non-zero doner:
  - manifestte dogrulanmis denen kaydin URL/hash/inceleme zinciri gecersizse,
  - manifest kaydi olmayan dosyaya isaret ediyorsa,
  - diskteki indeks korpus + manifestin guncel surumu degilse,
  - indeks JSON'u eksik veya bozuksa.

Kayitsiz kaynaklar hata degil adaydir; raporda gorunur, LLM kaniti veya otomatik
havale olamaz. Boylece korpus guvenli bicimde kademeli buyutulebilir.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from core.kaynak_guveni import (
    RESMI_DOGRULANMIS,
    manifest_yukle,
    mevzuat_kaynak_bilgisi,
    teskilat_kaynak_bilgisi,
)
from scripts.seed_mevzuat import build_index as mevzuat_index_uret
from scripts.seed_teskilat import (
    _BASLIK_RE,
)
from scripts.seed_teskilat import (
    build_index as teskilat_index_uret,
)

_ROOT = Path(__file__).resolve().parents[2]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
_TESKILAT_DIR = _ROOT / "data" / "teskilat"
_MEVZUAT_MANIFEST = _MEVZUAT_DIR / "kaynak_manifest.json"
_TESKILAT_MANIFEST = _TESKILAT_DIR / "kaynak_manifest.json"
_MEVZUAT_INDEX = _MEVZUAT_DIR / "index" / "mevzuat_index.json"
_TESKILAT_INDEX = _TESKILAT_DIR / "teskilat_index.json"


def _json_oku(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _teskilat_meta(path: Path) -> dict[str, str]:
    meta: dict[str, str] = {}
    for satir in path.read_text(encoding="utf-8", errors="replace").splitlines()[:20]:
        eslesme = _BASLIK_RE.match(satir.rstrip())
        if eslesme:
            meta[eslesme.group(1).upper()] = eslesme.group(2).strip()
    return meta


def _manifest_kontrol(
    veri_turu: str,
    veri_dir: Path,
    manifest_path: Path,
) -> tuple[list[str], list[str], int]:
    hatalar: list[str] = []
    uyarilar: list[str] = []
    manifest = manifest_yukle(manifest_path)
    ham = _json_oku(manifest_path)
    if ham is None or ham.get("version") != 1 or not isinstance(ham.get("kaynaklar"), dict):
        return [f"{veri_turu}: manifest yok veya semasi gecersiz"], uyarilar, 0
    for anahtar, kayit in manifest.items():
        path = veri_dir / Path(anahtar)
        if not path.is_file() or not path.resolve().is_relative_to(veri_dir.resolve()):
            hatalar.append(f"{veri_turu}: manifest dosyasi yok: {anahtar}")
            continue
        if kayit.get("durum") != RESMI_DOGRULANMIS:
            uyarilar.append(f"{veri_turu}: manifest kaydi dogrulanmis degil: {anahtar}")
            continue
        if veri_turu == "mevzuat":
            bilgi = mevzuat_kaynak_bilgisi(path, manifest)
        else:
            bilgi = teskilat_kaynak_bilgisi(
                path,
                teskilat_dir=veri_dir,
                meta=_teskilat_meta(path),
                manifest=manifest,
            )
        if bilgi.kaynak_guven != RESMI_DOGRULANMIS:
            neden = "; ".join(bilgi.hatalar) or "bilinmeyen guven hatasi"
            hatalar.append(f"{veri_turu}: {anahtar}: {neden}")
    return hatalar, uyarilar, len(manifest)


def _indeks_kontrol(
    ad: str,
    path: Path,
    uretilen: dict[str, Any],
) -> list[str]:
    diskteki = _json_oku(path)
    if diskteki is None:
        return [f"{ad}: indeks yok veya JSON bozuk: {path}"]
    hatalar: list[str] = []
    if diskteki.get("korpus_sha256") != uretilen.get("korpus_sha256"):
        hatalar.append(f"{ad}: indeks bayat; seed betigi yeniden calistirilmali")
    if diskteki.get("chunk_sayisi") != uretilen.get("chunk_sayisi"):
        hatalar.append(f"{ad}: indeks chunk sayisi korpusla eslesmiyor")
    return hatalar


def degerlendir() -> dict[str, Any]:
    mevzuat = mevzuat_index_uret()
    teskilat = teskilat_index_uret()
    hatalar: list[str] = []
    uyarilar: list[str] = []

    for veri_turu, veri_dir, manifest_path in (
        ("mevzuat", _MEVZUAT_DIR, _MEVZUAT_MANIFEST),
        ("teskilat", _TESKILAT_DIR, _TESKILAT_MANIFEST),
    ):
        h, u, _n = _manifest_kontrol(veri_turu, veri_dir, manifest_path)
        hatalar.extend(h)
        uyarilar.extend(u)

    hatalar.extend(_indeks_kontrol("mevzuat", _MEVZUAT_INDEX, mevzuat))
    hatalar.extend(_indeks_kontrol("teskilat", _TESKILAT_INDEX, teskilat))
    if mevzuat["guvenli_mevzuat_sayisi"] == 0:
        uyarilar.append(
            "mevzuat: dogrulanmis kaynak yok; retrieval onerileri aday kalir ve LLM'e kanit verilmez"
        )
    if teskilat["resmi_kaynak_sayisi"] == 0:
        uyarilar.append(
            "teskilat: dogrulanmis kaynak yok; otomatik birim havalesi devre disi kalir"
        )
    return {
        "durum": "gecti" if not hatalar else "kaldi",
        "hatalar": hatalar,
        "uyarilar": uyarilar,
        "mevzuat": {
            "dosya": mevzuat["mevzuat_sayisi"],
            "dogrulanmis_dosya": mevzuat["guvenli_mevzuat_sayisi"],
            "aday_dosya": mevzuat["aday_mevzuat_sayisi"],
            "chunk": mevzuat["chunk_sayisi"],
            "dogrulanmis_chunk": mevzuat["guvenli_chunk_sayisi"],
        },
        "teskilat": {
            "kurum": teskilat["kurum_sayisi"],
            "dogrulanmis_kaynak": teskilat["resmi_kaynak_sayisi"],
            "aday_kaynak": teskilat["aday_kaynak_sayisi"],
            "birim_chunk": teskilat["chunk_sayisi"],
        },
    }


def _metin_raporu(rapor: dict[str, Any]) -> str:
    m = rapor["mevzuat"]
    t = rapor["teskilat"]
    satirlar = [
        f"VERI KALITE KAPISI: {rapor['durum'].upper()}",
        (
            f"Mevzuat: {m['dosya']} dosya / {m['chunk']} chunk / "
            f"{m['dogrulanmis_dosya']} dogrulanmis / {m['aday_dosya']} aday"
        ),
        (
            f"Teskilat: {t['kurum']} kurum / {t['birim_chunk']} birim / "
            f"{t['dogrulanmis_kaynak']} dogrulanmis kaynak / {t['aday_kaynak']} aday"
        ),
    ]
    satirlar.extend(f"HATA: {hata}" for hata in rapor["hatalar"])
    satirlar.extend(f"UYARI: {uyari}" for uyari in rapor["uyarilar"])
    return "\n".join(satirlar)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Korpus guven ve indeks kalite kapisi")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    rapor = degerlendir()
    if args.json:
        print(json.dumps(rapor, ensure_ascii=False, indent=2))
    else:
        print(_metin_raporu(rapor))
    return 0 if rapor["durum"] == "gecti" else 1


if __name__ == "__main__":
    raise SystemExit(main())
