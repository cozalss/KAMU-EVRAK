#!/usr/bin/env python
"""Mevzuat korpusu seed scripti — Görev 1 `mevzuat_oner` BM25 retrieval kaynağı.

Akış:
  1. data/mevzuat/*.txt (kamuya açık mevzuat özet/alıntı metinleri) okunur.
  2. retrieval/chunker.chunk_mevzuat (MADDE_PATTERN) ile madde-bazlı chunk'lanır
     → her madde ayrı chunk, madde_no metadata'da.
  3. Madde-chunk'lar JSON indeks olarak data/mevzuat/index/mevzuat_index.json'a
     yazılır (tokenleştirme + BM25 skorlaması runtime'da yapılır — indeks salt
     metin + metadata taşır, böylece rank_bm25 kurulu olmasa da indeks geçerli).

Şartname §6.5: GERÇEK kamu verisi/PII içermez — yalnız kamuya açık mevzuat metni.
CLAUDE.md §1: madde no UYDURULMAZ; korpus metni `[DOĞRULA:]` işaretlerini taşır.

Çalıştır (mutlak yol; PYTHONPATH=...\\backend):
    python scripts/seed_mevzuat.py [--src DIR] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import structlog

# PYTHONPATH ayarlanmamışsa backend'i sys.path'e ekle (standalone çalıştırma kolaylığı).
_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if _BACKEND.is_dir() and str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from retrieval.chunker import chunk_mevzuat  # noqa: E402

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_SRC = _ROOT / "data" / "mevzuat"
_DEFAULT_OUT = _ROOT / "data" / "mevzuat" / "index" / "mevzuat_index.json"
_MIN_CHUNK_CHARS = 40  # gürültü/başlık-tek-satır chunk'larını ele


def _etiket(path: Path) -> str:
    """Dosya adından okunabilir mevzuat etiketi: '3071_dilekce...' → '3071 dilekce...'."""
    return path.stem.replace("_", " ")


def _chunk_kayitlari(path: Path) -> list[dict[str, object]]:
    """Tek mevzuat dosyasını madde-bazlı chunk kayıtlarına çevir."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        log.warning("seed_mevzuat.read_failed", dosya=path.name, hata=str(exc))
        return []

    etiket = _etiket(path)
    kayitlar: list[dict[str, object]] = []
    # subchunk=False: madde başına TEK tam-metin chunk (seed dersi — alt-chunk
    # çakışması/baş-kaybı yok; chunker.py docstring'i referans).
    for chunk in chunk_mevzuat(text, subchunk=False):
        govde = chunk.text.strip()
        if len(govde) < _MIN_CHUNK_CHARS:
            continue
        kayitlar.append({
            "mevzuat": etiket,
            "kaynak_dosya": path.name,
            "madde_no": chunk.metadata.get("madde_no"),
            "madde_tur": chunk.metadata.get("madde_tur"),
            "text": govde,
        })
    return kayitlar


def build_index(src_dir: Path) -> list[dict[str, object]]:
    """src_dir/*.txt → madde-chunk kayıt listesi (BM25 indeks gövdesi)."""
    if not src_dir.is_dir():
        log.warning("seed_mevzuat.src_missing", src=str(src_dir))
        return []
    kayitlar: list[dict[str, object]] = []
    for path in sorted(src_dir.glob("*.txt")):
        kayitlar.extend(_chunk_kayitlari(path))
    return kayitlar


def write_index(kayitlar: list[dict[str, object]], out_file: Path) -> None:
    """Chunk kayıtlarını JSON indeks olarak yaz (dizin yoksa oluşturulur)."""
    out_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "chunk_sayisi": len(kayitlar), "chunks": kayitlar}
    out_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mevzuat korpusu BM25 indeks seed")
    parser.add_argument("--src", type=Path, default=_DEFAULT_SRC, help="*.txt korpus dizini")
    parser.add_argument("--out", type=Path, default=_DEFAULT_OUT, help="JSON indeks çıktı yolu")
    args = parser.parse_args(argv)

    kayitlar = build_index(args.src)
    if not kayitlar:
        log.error("seed_mevzuat.bos_korpus", src=str(args.src))
        err = f"[HATA] {args.src} altinda chunk uretilemedi."
        sys.stderr.buffer.write((err + "\n").encode("utf-8", errors="replace"))
        return 1

    write_index(kayitlar, args.out)
    madde_li = sum(1 for k in kayitlar if k.get("madde_no") is not None)
    log.info("seed_mevzuat.done", chunk=len(kayitlar), madde=madde_li, out=str(args.out))
    # Windows konsolu (cp1254) Türkçe/Unicode'da patlamasın → ASCII-güvenli yaz.
    msg = f"[OK] {len(kayitlar)} chunk ({madde_li} madde-basligi) -> {args.out}"
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
