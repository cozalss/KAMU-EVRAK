"""Dogrulanmis korpus kaynagini hash-kilitli manifeste kaydet.

Bu arac kaynak metnini dogrulamaz; yapilan insan incelemesini denetlenebilir hale
getirir. Kaynak URL'i resmi HTTPS alaninda olmali, dogrulayan ve yontem acikca
yazilmalidir. Dosya sonradan degisirse indeksleyici kaydi otomatik olarak adaya dusurur.

Ornek:
    uv run python scripts/kaynak_kaydet.py mevzuat ../../data/mevzuat/3071_...txt \
      --kaynak-turu kanun --dogrulayan "Ad Soyad" \
      --dogrulama-yontemi "Resmi PDF ile madde madde karsilastirma"
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from core.kaynak_guveni import (
    MEVZUAT_KAYNAK_TURLERI,
    RESMI_DOGRULANMIS,
    TESKILAT_KAYNAK_TURLERI,
    atomik_json_yaz,
    bos_manifest,
    dosya_sha256,
    resmi_https_url_mi,
)

_ROOT = Path(__file__).resolve().parents[2]
_VERI_DIRLERI = {
    "mevzuat": _ROOT / "data" / "mevzuat",
    "teskilat": _ROOT / "data" / "teskilat",
}
# İzinli tür kümeleri BURADA KOPYALANMAZ; indeksleyicinin kabul ettiği kümeyle aynı olmak
# zorundadır. Kopya tutulduğunda bayatladı: mevzuat-teşkilat sınıfı (`resmi_mevzuat_teskilat`,
# `resmi_idari_bolunus`) çekirdeğe eklendi ama bu araca eklenmedi; sonuç olarak sistemin
# TANIDIĞI bir tür bu araçla KAYDEDİLEMİYORDU (ölçüldü 2026-08-06: 30 su idaresi dosyası
# "Kaynak turu izinli degil" ile reddedildi).
_BASLIK_RE = re.compile(r"^@(\w+):\s*(.*)$")
_KAYNAK_RE = re.compile(r"^\s*Kaynak\s*:\s*(https://\S+)\s*$", re.IGNORECASE | re.MULTILINE)


def _manifest_payload(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return bos_manifest()
    import json

    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != 1 or not isinstance(payload.get("kaynaklar"), dict):
        raise ValueError(f"Manifest semasi gecersiz: {path}")
    return payload


def _meta(path: Path) -> dict[str, str]:
    meta: dict[str, str] = {}
    for satir in path.read_text(encoding="utf-8", errors="replace").splitlines()[:20]:
        eslesme = _BASLIK_RE.match(satir.rstrip())
        if eslesme:
            meta[eslesme.group(1).upper()] = eslesme.group(2).strip()
    return meta


def _mevzuat_url(path: Path) -> str:
    eslesme = _KAYNAK_RE.search(path.read_text(encoding="utf-8", errors="replace"))
    return eslesme.group(1).rstrip(".,;)") if eslesme else ""


def _tarih_dogrula(deger: str) -> str:
    parsed = date.fromisoformat(deger)
    if parsed > date.today():
        raise ValueError("Dogrulama tarihi gelecekte olamaz.")
    return parsed.isoformat()


def _dosya_dogrula(path: Path, veri_dir: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_file() or not resolved.is_relative_to(veri_dir.resolve()):
        raise ValueError(f"Dosya veri dizini icinde degil: {path}")
    if resolved.suffix.lower() != ".txt":
        raise ValueError("Yalniz .txt korpus dosyalari kaydedilebilir.")
    return resolved


def _kayit(
    *,
    path: Path,
    veri_turu: str,
    kaynak_url: str,
    kaynak_turu: str,
    dogrulayan: str,
    dogrulama_tarihi: str,
    dogrulama_yontemi: str,
    erisim_tarihi: str = "",
) -> dict[str, Any]:
    metin = path.read_text(encoding="utf-8", errors="replace")
    if not resmi_https_url_mi(kaynak_url):
        raise ValueError("Kaynak URL'i resmi bir HTTPS kamu alani olmali.")
    izinli = MEVZUAT_KAYNAK_TURLERI if veri_turu == "mevzuat" else TESKILAT_KAYNAK_TURLERI
    if kaynak_turu not in izinli:
        raise ValueError(f"Kaynak turu izinli degil: {kaynak_turu}")
    if not dogrulayan.strip() or not dogrulama_yontemi.strip():
        raise ValueError("Dogrulayan ve dogrulama yontemi zorunludur.")
    if "[DOĞRULA" in metin.upper() or "[DOGRULA" in metin.upper():
        raise ValueError("Dosyada cozulmemis DOGRULA isareti var; dogrulanmis kaydedilemez.")
    return {
        "durum": RESMI_DOGRULANMIS,
        "kaynak_url": kaynak_url,
        "kaynak_turu": kaynak_turu,
        "icerik_sha256": dosya_sha256(path),
        "dogrulayan": dogrulayan.strip(),
        "dogrulama_tarihi": _tarih_dogrula(dogrulama_tarihi),
        "dogrulama_yontemi": dogrulama_yontemi.strip(),
        "kaynak_erisim_tarihi": erisim_tarihi,
    }


def _tek_dosya_ekle(args: argparse.Namespace, payload: dict[str, Any]) -> int:
    veri_dir = _VERI_DIRLERI[args.veri_turu]
    if args.dosya is None:
        raise ValueError("Dosya yolu zorunludur.")
    path = _dosya_dogrula(args.dosya, veri_dir)
    if args.veri_turu == "teskilat":
        meta = _meta(path)
        kaynak_url = args.kaynak_url or meta.get("KAYNAK_KIMLIK", "")
        kaynak_turu = args.kaynak_turu or meta.get("KAYNAK_TURU", "").lower()
        erisim = meta.get("ERISIM", "")
        anahtar = path.relative_to(veri_dir).as_posix()
    else:
        kaynak_url = args.kaynak_url or _mevzuat_url(path)
        kaynak_turu = args.kaynak_turu
        erisim = ""
        anahtar = path.name
    payload["kaynaklar"][anahtar] = _kayit(
        path=path,
        veri_turu=args.veri_turu,
        kaynak_url=kaynak_url,
        kaynak_turu=kaynak_turu,
        dogrulayan=args.dogrulayan,
        dogrulama_tarihi=args.dogrulama_tarihi,
        dogrulama_yontemi=args.dogrulama_yontemi,
        erisim_tarihi=erisim,
    )
    return 1


def _mevcut_teskilat_migrasyonu(args: argparse.Namespace, payload: dict[str, Any]) -> int:
    veri_dir = _VERI_DIRLERI["teskilat"]
    sayi = 0
    for path in sorted(veri_dir.glob("*/*.txt")):
        meta = _meta(path)
        kaynak_url = meta.get("KAYNAK_KIMLIK", "")
        kaynak_turu = meta.get("KAYNAK_TURU", "").lower()
        if (
            meta.get("DOGRULAMA", "").lower() != "resmi"
            or kaynak_turu not in TESKILAT_KAYNAK_TURLERI
            or not resmi_https_url_mi(kaynak_url)
        ):
            continue
        anahtar = path.relative_to(veri_dir).as_posix()
        payload["kaynaklar"][anahtar] = _kayit(
            path=path,
            veri_turu="teskilat",
            kaynak_url=kaynak_url,
            kaynak_turu=kaynak_turu,
            dogrulayan=args.dogrulayan,
            dogrulama_tarihi=args.dogrulama_tarihi,
            dogrulama_yontemi=args.dogrulama_yontemi,
            erisim_tarihi=meta.get("ERISIM", ""),
        )
        sayi += 1
    return sayi


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hash-kilitli guvenilir kaynak kaydi")
    parser.add_argument("veri_turu", choices=sorted(_VERI_DIRLERI))
    parser.add_argument("dosya", type=Path, nargs="?")
    parser.add_argument("--kaynak-url", default="")
    parser.add_argument("--kaynak-turu", default="")
    parser.add_argument("--dogrulayan", required=True)
    parser.add_argument("--dogrulama-tarihi", default=date.today().isoformat())
    parser.add_argument("--dogrulama-yontemi", required=True)
    parser.add_argument(
        "--mevcut-resmi-teskilati-migre-et",
        action="store_true",
        help="Mevcut @DOGRULAMA: resmi teskilat kayitlarini bir kez hash ile kilitle",
    )
    args = parser.parse_args(argv)
    if args.mevcut_resmi_teskilati_migre_et and args.veri_turu != "teskilat":
        parser.error("Toplu migrasyon yalniz teskilat icindir.")

    manifest_path = _VERI_DIRLERI[args.veri_turu] / "kaynak_manifest.json"
    try:
        payload = _manifest_payload(manifest_path)
        if args.mevcut_resmi_teskilati_migre_et:
            sayi = _mevcut_teskilat_migrasyonu(args, payload)
        else:
            sayi = _tek_dosya_ekle(args, payload)
        atomik_json_yaz(manifest_path, payload)
    except (OSError, ValueError) as exc:
        print(f"[HATA] {exc}", file=sys.stderr)
        return 1
    print(f"[OK] {sayi} kaynak hash-kilitli manifeste kaydedildi: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
