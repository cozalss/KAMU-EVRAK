"""Korpus kaynaklari icin ortak guven, butunluk ve atomik yazim yardimcilari.

Bir resmi URL tek basina dogrulama sayilmaz. Otomatik havale veya LLM kaniti icin
manifest kaydi, dogrulayan/tarih, resmi HTTPS kaynak ve degismemis SHA-256 birlikte
zorunludur. Kosullardan biri bozulursa kayit sessizce kullanilmaz, aday durumuna duser.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ADAY = "aday"
RESMI_DOGRULANMIS = "resmi_dogrulanmis"
MANIFEST_VERSION = 1

_RESMI_ALAN_SONLARI = (".gov.tr", ".bel.tr", ".edu.tr", ".tsk.tr")
_MEVZUAT_KAYNAK_TURLERI = frozenset({
    "kanun",
    "yonetmelik",
    "cumhurbaskanligi_kararnamesi",
    "kanun_hukmunde_kararname",
    "genelge",
    "teblig",
    "tuzuk",
    "karar",
    "anayasa",
})
_TESKILAT_KAYNAK_TURLERI = frozenset({
    "resmi_yonetmelik",
    "resmi_teskilat",
    "resmi_hizmet",
    "resmi_karar",
    # Mevzuat-teskilat sinifi (docs/11): tur genelinde ZORUNLU kilinmis birim listesi
    # tasiyan sablon, ve sablonun kapsamini kilitleyen resmi idari bolunus listesi.
    "resmi_mevzuat_teskilat",
    "resmi_idari_bolunus",
})
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_KAYNAK_RE = re.compile(r"^\s*Kaynak\s*:\s*(https://\S+)\s*$", re.IGNORECASE | re.MULTILINE)


@dataclass(frozen=True)
class KaynakBilgisi:
    """Bir kaynak dosyasinin makinece denetlenebilir guven sonucu."""

    kaynak_guven: str
    kaynak_url: str
    kaynak_turu: str
    icerik_sha256: str
    dogrulayan: str = ""
    dogrulama_tarihi: str = ""
    dogrulama_yontemi: str = ""
    hatalar: tuple[str, ...] = ()

    def indeks_alanlari(self) -> dict[str, Any]:
        return {
            "kaynak_guven": self.kaynak_guven,
            "kaynak_url": self.kaynak_url,
            "kaynak_turu": self.kaynak_turu,
            "icerik_sha256": self.icerik_sha256,
            "dogrulayan": self.dogrulayan,
            "dogrulama_tarihi": self.dogrulama_tarihi,
            "dogrulama_yontemi": self.dogrulama_yontemi,
            "kaynak_guven_hatalari": list(self.hatalar),
        }


def dosya_sha256(path: Path) -> str:
    """Metin kaynagin ICERIK ozeti — satir sonu bicimi ve son satir farki NOTRLENIR.

    Ham bayt ozeti kullanildiginda guven zinciri icerik degismeden kiriliyordu (olculdu
    2026-08-02: 59 manifest kaydinin 35'i "KIRIK" cikti; tek fark 65 adet CR baytiydi, satir
    farki sifirdi). Sebep yapisal: bu depo Windows'ta duzenlenir, Python metin modunda CRLF
    yazar, editor/git ise LF'e cevirir. Kirilan hash "birileri dosyayi degistirdi" sinyalidir;
    her kaydetmede yanlis alarm vermesi o sinyali degersizlestirir.

    Normallestirme YALNIZ sunlari notrler: UTF-8 BOM, CRLF/CR -> LF, dosya sonundaki bosluk.
    Icerigin kendisinde tek karakterlik degisiklik hala ozeti degistirir — kurcalama tespiti
    korunur. Metin olarak cozulemeyen dosyalarda (ikili icerik) ham bayt ozetine dusulur.
    """
    veri = path.read_bytes()
    try:
        metin = veri.decode("utf-8-sig")
    except UnicodeDecodeError:
        return hashlib.sha256(veri).hexdigest()
    normal = metin.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n")
    return hashlib.sha256((normal + "\n").encode("utf-8")).hexdigest()


def resmi_https_url_mi(url: str) -> bool:
    """URL resmi Turkiye kamu alaninda HTTPS kullaniyor mu."""
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    return (
        parsed.scheme.lower() == "https"
        and any(host.endswith(sonek) for sonek in _RESMI_ALAN_SONLARI)
    )


def atomik_json_yaz(path: Path, payload: dict[str, Any]) -> None:
    """JSON'u ayni dizinde gecici dosyaya yazip tek os.replace ile yayinla."""
    path.parent.mkdir(parents=True, exist_ok=True)
    gecici: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as stream:
            gecici = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=1)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(gecici, path)
    finally:
        if gecici is not None and gecici.exists():
            gecici.unlink()


def manifest_yukle(path: Path) -> dict[str, dict[str, Any]]:
    """Manifest kayit haritasini yukle; bozuk semada guven vermek yerine bos don."""
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if payload.get("version") != MANIFEST_VERSION:
        return {}
    kaynaklar = payload.get("kaynaklar")
    if not isinstance(kaynaklar, dict):
        return {}
    return {
        str(ad): dict(kayit)
        for ad, kayit in kaynaklar.items()
        if isinstance(ad, str) and isinstance(kayit, dict)
    }


def bos_manifest() -> dict[str, Any]:
    return {
        "version": MANIFEST_VERSION,
        "aciklama": (
            "Yalniz resmi kaynaktan elle dogrulanmis ve SHA-256 ile kilitlenmis "
            "dosyalar bu manifestte yer alir."
        ),
        "kaynaklar": {},
    }


def _tarih_gecerli_mi(deger: str) -> bool:
    try:
        parsed = date.fromisoformat(deger)
    except ValueError:
        return False
    return parsed <= date.today()


def _manifest_dogrula(
    *,
    path: Path,
    manifest_anahtari: str,
    manifest: dict[str, dict[str, Any]],
    kaynak_url: str,
    kaynak_turu: str,
    izinli_turler: frozenset[str],
    metin: str,
) -> KaynakBilgisi:
    gercek_hash = dosya_sha256(path)
    kayit = manifest.get(manifest_anahtari)
    hatalar: list[str] = []
    if not kayit:
        hatalar.append("manifest kaydi yok")
        return KaynakBilgisi(ADAY, kaynak_url, kaynak_turu, gercek_hash, hatalar=tuple(hatalar))

    durum = str(kayit.get("durum", "") or "").strip()
    kayit_url = str(kayit.get("kaynak_url", "") or "").strip()
    kayit_turu = str(kayit.get("kaynak_turu", "") or "").strip().lower()
    beklenen_hash = str(kayit.get("icerik_sha256", "") or "").strip().lower()
    dogrulayan = str(kayit.get("dogrulayan", "") or "").strip()
    dogrulama_tarihi = str(kayit.get("dogrulama_tarihi", "") or "").strip()
    dogrulama_yontemi = str(kayit.get("dogrulama_yontemi", "") or "").strip()

    if durum != RESMI_DOGRULANMIS:
        hatalar.append("durum resmi_dogrulanmis degil")
    if not resmi_https_url_mi(kayit_url):
        hatalar.append("resmi HTTPS kaynak URL'i yok")
    if kaynak_url and kayit_url != kaynak_url:
        hatalar.append("manifest URL'i dosya basligiyla eslesmiyor")
    if kayit_turu not in izinli_turler:
        hatalar.append("kaynak turu izinli degil")
    if kaynak_turu and kayit_turu != kaynak_turu:
        hatalar.append("manifest kaynak turu dosya basligiyla eslesmiyor")
    if not dogrulayan:
        hatalar.append("dogrulayan yok")
    if not _tarih_gecerli_mi(dogrulama_tarihi):
        hatalar.append("dogrulama tarihi gecersiz veya gelecekte")
    if not dogrulama_yontemi:
        hatalar.append("dogrulama yontemi yok")
    if not _SHA256_RE.fullmatch(beklenen_hash):
        hatalar.append("manifest SHA-256 gecersiz")
    elif beklenen_hash != gercek_hash:
        hatalar.append("dosya SHA-256 manifestle eslesmiyor")
    if "[DOĞRULA" in metin.upper() or "[DOGRULA" in metin.upper():
        hatalar.append("dosyada cozulmemis DOGRULA isareti var")

    guven = RESMI_DOGRULANMIS if not hatalar else ADAY
    return KaynakBilgisi(
        guven,
        kayit_url or kaynak_url,
        kayit_turu or kaynak_turu,
        gercek_hash,
        dogrulayan,
        dogrulama_tarihi,
        dogrulama_yontemi,
        tuple(hatalar),
    )


def mevzuat_kaynak_bilgisi(
    path: Path,
    manifest: dict[str, dict[str, Any]],
) -> KaynakBilgisi:
    """Mevzuat dosyasini manifest + resmi URL + hash + inceleme kaydiyla dogrula."""
    metin = path.read_text(encoding="utf-8", errors="replace")
    eslesme = _KAYNAK_RE.search(metin)
    kaynak_url = eslesme.group(1).rstrip(".,;)") if eslesme else ""
    kayit = manifest.get(path.name) or {}
    kaynak_turu = str(kayit.get("kaynak_turu", "") or "").strip().lower()
    return _manifest_dogrula(
        path=path,
        manifest_anahtari=path.name,
        manifest=manifest,
        kaynak_url=kaynak_url,
        kaynak_turu=kaynak_turu,
        izinli_turler=_MEVZUAT_KAYNAK_TURLERI,
        metin=metin,
    )


def teskilat_kaynak_bilgisi(
    path: Path,
    *,
    teskilat_dir: Path,
    meta: dict[str, str],
    manifest: dict[str, dict[str, Any]],
) -> KaynakBilgisi:
    """Teskilat dosyasini baslik metadatasi ve hash-kilitli manifestle dogrula."""
    metin = path.read_text(encoding="utf-8", errors="replace")
    anahtar = path.relative_to(teskilat_dir).as_posix()
    kaynak_url = meta.get("KAYNAK_KIMLIK", "").strip()
    kaynak_turu = meta.get("KAYNAK_TURU", "").strip().lower()
    if meta.get("DOGRULAMA", "").strip().lower() != "resmi":
        bilgi = KaynakBilgisi(
            ADAY,
            kaynak_url,
            kaynak_turu,
            dosya_sha256(path),
            hatalar=("dosya basliginda @DOGRULAMA: resmi yok",),
        )
        return bilgi
    return _manifest_dogrula(
        path=path,
        manifest_anahtari=anahtar,
        manifest=manifest,
        kaynak_url=kaynak_url,
        kaynak_turu=kaynak_turu,
        izinli_turler=_TESKILAT_KAYNAK_TURLERI,
        metin=metin,
    )


__all__ = (
    "ADAY",
    "MANIFEST_VERSION",
    "RESMI_DOGRULANMIS",
    "KaynakBilgisi",
    "atomik_json_yaz",
    "bos_manifest",
    "dosya_sha256",
    "manifest_yukle",
    "mevzuat_kaynak_bilgisi",
    "resmi_https_url_mi",
    "teskilat_kaynak_bilgisi",
)
