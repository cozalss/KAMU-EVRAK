"""Teşkilat korpusu (data/teskilat/<kurum-slug>/*.txt) -> birim-bazlı seed indeksi.

Kaynak-doğrulamalı birim yönlendirmesi (route ajanı → birim_ara aracı) bu indeksi okur.
Her kurum dizinindeki .txt dosyaları @-başlık (kurum künyesi) + 'BİRİM:'/'GÖREV:' blokları
içerir; her blok bir birim chunk'ına dönüşür. Korpus genişletildikten sonra çalıştır:
    uv run python scripts/seed_teskilat.py

Format:
    @KURUM: <kanonik ad>
    @BELGE: <kaynak belge başlığı>
    @KAYNAK_KIMLIK: <yerel belge kimliği veya URL>
    @ERISIM: <YYYY-AA-GG>
    @ALIAS: <virgülle ayrılmış alternatif slug'lar (kısaltma/tam-unvan varyantı) — opsiyonel>
    @NOT: <uyarı satırı — opsiyonel>

    BİRİM: <birim adı>
    GÖREV: <görev tanımı (tek paragraf, anahtar-kelime yoğun)>

@ALIAS satırları index'e üst-düzey `aliases` haritası olarak yazılır (alias-slug → kurum-slug);
teskilat_ara kurum çözümlemede kullanır (ör. "uedas" → "uludag-elektrik-dagitim").
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_TESKILAT_DIR = _ROOT / "data" / "teskilat"
_INDEX_FILE = _TESKILAT_DIR / "teskilat_index.json"
_MIN_GOREV_CHARS = 20

_BASLIK_RE = re.compile(r"^@(\w+):\s*(.*)$")
_BIRIM_RE = re.compile(r"^BİRİM:\s*(.+)$")
_GOREV_RE = re.compile(r"^GÖREV:\s*(.+)$")

_ASCII = str.maketrans("çğıöşüâîûÇĞİÖŞÜ", "cgiosuaiucgiosu")


def _alias_slug(s: str) -> str:
    """@ALIAS token'ını dosya-güvenli slug'a indir (kurum_kimlik._slug ile hizalı)."""
    kok = s.replace("İ", "i").replace("I", "ı").lower().translate(_ASCII)
    return "-".join(p for p in re.split(r"[^a-z0-9]+", kok) if p)


def _parse_dosya(path: Path, kurum_slug: str) -> list[dict]:
    """Tek teşkilat .txt dosyasını birim chunk'larına ayır."""
    meta: dict[str, str] = {}
    chunks: list[dict] = []
    birim_ad: str | None = None
    gorev_parcalari: list[str] = []

    def _flush() -> None:
        nonlocal birim_ad, gorev_parcalari
        if birim_ad and gorev_parcalari:
            gorev = " ".join(gorev_parcalari).strip()
            if len(gorev) >= _MIN_GOREV_CHARS:
                chunks.append({
                    "kurum_slug": kurum_slug,
                    "kurum_ad": meta.get("KURUM", kurum_slug),
                    "birim_ad": birim_ad.strip(),
                    "gorev": gorev,
                    # BM25 arama metni: birim adı + görev (hem ad hem görev aranabilir).
                    "text": f"{birim_ad.strip()}. {gorev}",
                    "belge_basligi": meta.get("BELGE", ""),
                    "kaynak_kimlik": meta.get("KAYNAK_KIMLIK", f"teskilat/{kurum_slug}"),
                    "erisim": meta.get("ERISIM", ""),
                })
        birim_ad = None
        gorev_parcalari = []

    for ham in path.read_text(encoding="utf-8", errors="replace").splitlines():
        satir = ham.rstrip()
        mb = _BASLIK_RE.match(satir)
        if mb:
            meta[mb.group(1).upper()] = mb.group(2).strip()
            continue
        mbi = _BIRIM_RE.match(satir)
        if mbi:
            _flush()
            birim_ad = mbi.group(1)
            continue
        mg = _GOREV_RE.match(satir)
        if mg:
            gorev_parcalari.append(mg.group(1))
            continue
        if satir and birim_ad and gorev_parcalari:
            gorev_parcalari.append(satir)  # görev tanımı çok satıra taşarsa
    _flush()
    return chunks


def _dosya_aliaslari(path: Path, kurum_slug: str) -> dict[str, str]:
    """Dosyanın @ALIAS satırından {alias_slug: kurum_slug} haritası (yalnız üst blok okunur)."""
    aliases: dict[str, str] = {}
    for ham in path.read_text(encoding="utf-8", errors="replace").splitlines()[:12]:
        m = _BASLIK_RE.match(ham.rstrip())
        if m and m.group(1).upper() == "ALIAS":
            for token in m.group(2).split(","):
                a = _alias_slug(token)
                if a and a != kurum_slug:
                    aliases[a] = kurum_slug
    return aliases


def build_index() -> dict:
    chunks_out: list[dict] = []
    aliases: dict[str, str] = {}
    cakisan: set[str] = set()
    kurumlar = sorted(p for p in _TESKILAT_DIR.glob("*") if p.is_dir())
    for kurum_dir in kurumlar:
        kurum_slug = kurum_dir.name
        for path in sorted(kurum_dir.glob("*.txt")):
            chunks_out.extend(_parse_dosya(path, kurum_slug))
            for alias, hedef in _dosya_aliaslari(path, kurum_slug).items():
                # ÇAKIŞMA GUARD'I: aynı alias iki FARKLI kuruma eşlenirse (ASKİ Ankara/Adana,
                # SASKİ Samsun/Sakarya...) sessiz last-writer-wins YANLIŞ kuruma yönlendirir →
                # alias tamamen DÜŞÜRÜLÜR + uyarı basılır (belirsiz kısaltma kimseye gitmez).
                if alias in aliases and aliases[alias] != hedef:
                    cakisan.add(alias)
                    print(f"[UYARI] alias çakışması: {alias!r} → {aliases[alias]!r} ve "
                          f"{hedef!r}; alias DÜŞÜRÜLDÜ", file=sys.stderr)
                    continue
                aliases[alias] = hedef
    for alias in cakisan:
        aliases.pop(alias, None)
    return {
        "version": 2,
        "chunk_sayisi": len(chunks_out),
        "kurum_sayisi": len(kurumlar),
        "aliases": aliases,
        "chunks": chunks_out,
    }


def main() -> None:
    if not _TESKILAT_DIR.is_dir():
        print(f"[HATA] {_TESKILAT_DIR} yok", file=sys.stderr)
        sys.exit(1)
    index = build_index()
    _INDEX_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[OK] {index['kurum_sayisi']} kurum -> {index['chunk_sayisi']} birim -> "
          f"{_INDEX_FILE.relative_to(_ROOT)}")


if __name__ == "__main__":
    main()
