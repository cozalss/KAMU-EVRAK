"""Mevzuat korpusu (data/mevzuat/*.txt) -> madde-bazlı seed indeksi (mevzuat_index.json).

mevzuat_oner node'u bu indeksi (varsa) seed olarak okur; yoksa korpusu runtime chunk'lar.
Korpus genişletildikten sonra çalıştır:  uv run python scripts/seed_mevzuat.py
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from core.kaynak_guveni import (
    RESMI_DOGRULANMIS,
    atomik_json_yaz,
    dosya_sha256,
    manifest_yukle,
    mevzuat_kaynak_bilgisi,
)
from retrieval.chunker import chunk_mevzuat

_MIN_CHUNK_CHARS = 40
_ROOT = Path(__file__).resolve().parents[2]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
_INDEX_FILE = _MEVZUAT_DIR / "index" / "mevzuat_index.json"
_MANIFEST_FILE = _MEVZUAT_DIR / "kaynak_manifest.json"


def _korpus_sha256(dosyalar: list[Path]) -> str:
    """Korpus ve guven manifestinin deterministik surum kimligi."""
    h = hashlib.sha256()
    for path in dosyalar:
        h.update(path.name.encode("utf-8"))
        h.update(dosya_sha256(path).encode("ascii"))
    if _MANIFEST_FILE.is_file():
        h.update(dosya_sha256(_MANIFEST_FILE).encode("ascii"))
    return h.hexdigest()


def build_index() -> dict:
    chunks_out: list[dict] = []
    dosyalar = sorted(_MEVZUAT_DIR.glob("*.txt"))
    manifest = manifest_yukle(_MANIFEST_FILE)
    guvenli_dosya_sayisi = 0
    for path in dosyalar:
        text = path.read_text(encoding="utf-8", errors="replace")
        kaynak = mevzuat_kaynak_bilgisi(path, manifest)
        if kaynak.kaynak_guven == RESMI_DOGRULANMIS:
            guvenli_dosya_sayisi += 1
        etiket = path.stem.replace("_", " ")
        chunks = chunk_mevzuat(text, subchunk=False)
        madde_var = any(c.metadata.get("madde_no") is not None for c in chunks)
        for c in chunks:
            govde = c.text.strip()
            if len(govde) < _MIN_CHUNK_CHARS:
                continue
            # Künye/önsöz chunk'ını ele (madde başlığı yoksa, madde'li dosyada) — gürültü önle.
            if madde_var and c.metadata.get("madde_no") is None:
                continue
            chunks_out.append({
                "mevzuat": etiket,
                "kaynak_dosya": path.name,
                "madde_no": c.metadata.get("madde_no"),
                "madde_tur": c.metadata.get("madde_tur"),
                "text": govde,
                **kaynak.indeks_alanlari(),
            })
    guvenli_chunk_sayisi = sum(
        c.get("kaynak_guven") == RESMI_DOGRULANMIS for c in chunks_out
    )
    return {
        "version": 2,
        "korpus_sha256": _korpus_sha256(dosyalar),
        "chunk_sayisi": len(chunks_out),
        "guvenli_chunk_sayisi": guvenli_chunk_sayisi,
        "aday_chunk_sayisi": len(chunks_out) - guvenli_chunk_sayisi,
        "mevzuat_sayisi": len(dosyalar),
        "guvenli_mevzuat_sayisi": guvenli_dosya_sayisi,
        "aday_mevzuat_sayisi": len(dosyalar) - guvenli_dosya_sayisi,
        "chunks": chunks_out,
    }


def main() -> None:
    index = build_index()
    atomik_json_yaz(_INDEX_FILE, index)
    print(
        f"[OK] {index['mevzuat_sayisi']} mevzuat "
        f"({index['guvenli_mevzuat_sayisi']} dogrulanmis, "
        f"{index['aday_mevzuat_sayisi']} aday) -> "
        f"{index['chunk_sayisi']} chunk -> {_INDEX_FILE.relative_to(_ROOT)}"
    )


if __name__ == "__main__":
    main()
