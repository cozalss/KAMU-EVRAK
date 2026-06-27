"""Mevzuat korpusu → DB seed (Faz 6). data/mevzuat/index/mevzuat_index.json kaynak.

mevzuat (dosya başına) → mevzuat_madde (madde başına) → mevzuat_chunk (chunk başına).
tsv GENERATED ('simple') otomatik dolar; embedding ŞİMDİLİK NULL (ayrı embedding job —
BM25 tsvector + pg_trgm hibrit aramaya yeter). Idempotent: per-mevzuat çocukları siler,
yeniden kurar (kaynak_dosya UNIQUE → mevzuat satırı korunur, FK güvenli).

SIFIR UYDURMA (CLAUDE.md §1): kaynak_url/künye üretilmez (NULL); dogrula_isareti
metindeki '[DOĞRULA' işaretinden türetilir (şeffaflık).

Çalıştır:  uv run python -m db.seed_mevzuat_db
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import asyncpg
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))

_ROOT = Path(__file__).resolve().parents[2]
_INDEX = _ROOT / "data" / "mevzuat" / "index" / "mevzuat_index.json"
# Chunker madde_tur → DB enum (madde_turu): 'madde'→'normal'.
_TUR_MAP = {"madde": "normal", "ek": "ek", "gecici": "gecici", "mukerrer": "mukerrer"}
_KANUN_NO_RE = re.compile(r"^\d+[A-Za-z]?$")


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL_SYNC") or os.environ["DATABASE_URL"]
    return url.replace("postgresql+psycopg://", "postgresql://").replace(
        "postgresql+asyncpg://", "postgresql://")


def _kanun_no(kaynak_dosya: str) -> str:
    """Dosya adının ilk sayısal token'ı kanun no (yoksa '')."""
    ilk = kaynak_dosya.replace(".txt", "").split("_", 1)[0]
    return ilk if _KANUN_NO_RE.match(ilk) else ""


def _madde_baslik(text: str) -> str | None:
    """Chunk ilk satırı = madde başlığı (kısalt)."""
    line = text.strip().splitlines()[0].strip() if text.strip() else ""
    return line[:300] or None


async def main() -> int:
    data = json.loads(_INDEX.read_text(encoding="utf-8"))
    by_file: dict[str, list[dict]] = defaultdict(list)
    etiket: dict[str, str] = {}
    for c in data["chunks"]:
        by_file[c["kaynak_dosya"]].append(c)
        etiket.setdefault(c["kaynak_dosya"], c["mevzuat"])

    conn = await asyncpg.connect(_dsn(), timeout=60, statement_cache_size=0)
    try:
        n_mev = n_madde = n_chunk = 0
        async with conn.transaction():
            for dosya, chunks in by_file.items():
                baslik = etiket[dosya]
                kanun = _kanun_no(dosya)
                mev_id = await conn.fetchval(
                    """INSERT INTO mevzuat (kanun_no, baslik, kaynak_dosya)
                       VALUES ($1, $2, $3)
                       ON CONFLICT (kaynak_dosya) DO UPDATE
                         SET baslik = EXCLUDED.baslik, kanun_no = EXCLUDED.kanun_no
                       RETURNING id""",
                    kanun, baslik, dosya,
                )
                # Idempotent: bu mevzuatın eski madde+chunk'larını temizle (cascade).
                await conn.execute("DELETE FROM mevzuat_madde WHERE mevzuat_id=$1", mev_id)
                await conn.execute("DELETE FROM mevzuat_chunk WHERE mevzuat_id=$1", mev_id)
                n_mev += 1

                # (madde_no, madde_turu) → madde_id (dedup; subchunk=False → genelde 1:1).
                madde_ids: dict[tuple, str] = {}
                chunk_rows: list[tuple] = []
                for c in chunks:
                    text = c["text"]
                    dogrula = "[DOĞRULA" in text
                    madde_id = None
                    if c.get("madde_no") is not None:
                        tur = _TUR_MAP.get(c.get("madde_tur") or "madde", "normal")
                        key = (c["madde_no"], tur)
                        madde_id = madde_ids.get(key)
                        if madde_id is None:
                            madde_id = await conn.fetchval(
                                """INSERT INTO mevzuat_madde
                                   (mevzuat_id, madde_no, madde_turu, baslik, metin, dogrula_isareti)
                                   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
                                mev_id, str(c["madde_no"]), tur, _madde_baslik(text), text, dogrula,
                            )
                            madde_ids[key] = madde_id
                            n_madde += 1
                    chunk_rows.append((mev_id, madde_id, text))
                await conn.executemany(
                    "INSERT INTO mevzuat_chunk (mevzuat_id, madde_id, metin) VALUES ($1,$2,$3)",
                    chunk_rows,
                )
                n_chunk += len(chunk_rows)

        # Doğrulama + örnek hibrit arama (BM25 tsv).
        cm = await conn.fetchval("SELECT count(*) FROM mevzuat")
        cmd = await conn.fetchval("SELECT count(*) FROM mevzuat_madde")
        cc = await conn.fetchval("SELECT count(*) FROM mevzuat_chunk")
        dogrula = await conn.fetchval(
            "SELECT count(*) FROM mevzuat_madde WHERE dogrula_isareti")
        hit = await conn.fetchval(
            """SELECT count(*) FROM mevzuat_chunk
               WHERE tsv @@ plainto_tsquery('simple', 'dilekçe hakkı')""")
        print(f"Seed: mevzuat={cm} madde={cmd} chunk={cc}  ([DOĞRULA] madde={dogrula})")
        print(f"BM25 tsv testi ('dilekçe hakkı'): {hit} chunk eşleşti")
        ok = cm == data["mevzuat_sayisi"] and cc == data["chunk_sayisi"] and hit > 0
        print("SONUÇ:", "✅ MEVZUAT DB HAZIR" if ok else "⚠️ kontrol et")
        return 0 if ok else 2
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
