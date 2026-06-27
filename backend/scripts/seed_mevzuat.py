"""Mevzuat korpusu (data/mevzuat/*.txt) → madde-bazlı seed indeksi (mevzuat_index.json).

mevzuat_oner node'u bu indeksi (varsa) seed olarak okur; yoksa korpusu runtime chunk'lar.
Korpus genişletildikten sonra çalıştır:  uv run python scripts/seed_mevzuat.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from retrieval.chunker import chunk_mevzuat

_MIN_CHUNK_CHARS = 40
_ROOT = Path(__file__).resolve().parents[2]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
_INDEX_FILE = _MEVZUAT_DIR / "index" / "mevzuat_index.json"


def build_index() -> dict:
    chunks_out: list[dict] = []
    dosyalar = sorted(_MEVZUAT_DIR.glob("*.txt"))
    for path in dosyalar:
        text = path.read_text(encoding="utf-8", errors="replace")
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
            })
    return {"version": 1, "chunk_sayisi": len(chunks_out), "chunks": chunks_out, "mevzuat_sayisi": len(dosyalar)}


def main() -> None:
    index = build_index()
    _INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    _INDEX_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK {index['mevzuat_sayisi']} mevzuat → {index['chunk_sayisi']} chunk → {_INDEX_FILE.relative_to(_ROOT)}")


if __name__ == "__main__":
    main()
