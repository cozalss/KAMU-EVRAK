"""Ham belde belediyesi listesini sicil girdi tablosuna çevir.

Girdi : data/teskilat/girdi/ham/belde_belediyeleri_ham.txt  (İçişleri e-Belediye, ham)
Çıktı : data/teskilat/girdi/belde_belediyeleri.json

Ham metin serbest biçimlidir ("İl [İlçe İlçesi] <Belde> Belde Belediyesi/Beldesi") ve
KAYNAKTA yazım hataları vardır. Ayrıştırıcı bilinen hataları normalize eder, ayrıştıramadığı
satırı UYDURMAZ → `dogrulanmayanlar` listesine düşürür.

    uv run python scripts/ayikla_belde.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

_ROOT = Path(__file__).resolve().parents[2]
_HAM = _ROOT / "data" / "teskilat" / "girdi" / "ham" / "belde_belediyeleri_ham.txt"
_CIKTI = _ROOT / "data" / "teskilat" / "girdi" / "belde_belediyeleri.json"
_KAYNAK = "https://www.belediye.gov.tr/belediyeler"

# Kaynak metnindeki yazım hataları (İçişleri sayfasında böyle geçiyor) → düzeltme.
_IL_DUZELTME = {
    "BArtın": "Bartın", "Girasun": "Giresun", "onguldak": "Zonguldak",
    "Kırıklareli": "Kırklareli", "Hakkari": "Hakkâri",
}
# Belde adından ÖNCE gelen ve ada dahil OLMAYAN yapısal sözcükler.
_YAPISAL = re.compile(
    r"\b(?:İli|ilçesi|İlçesi|İlçe|ilçe|Merkez)\b", re.IGNORECASE)
# Satır sonundaki kurum tipi eki (yazım varyantları dahil).
_SON_EK = re.compile(
    r"\s*(?:Belde\s+Bel[ei]?[dl]?[ei]?yesi|Belde\s+Belediye|Belde\s+Beldesi|"
    r"Beldesi|Belde|Bel[ei]?diyesi|belediyesi)\s*$", re.IGNORECASE)


def _iller() -> set[str]:
    veri = json.loads((_ROOT / "data" / "teskilat" / "girdi" / "il_ilce.json")
                      .read_text(encoding="utf-8"))
    return {str(i.get("il", "")).strip() for i in veri.get("iller") or []}


def _ayikla(satir: str, iller: set[str]) -> tuple[str, str, str] | None:
    """'Afyonkarahisar Sinanpaşa İlçesi Güney Belde Belediyesi' → (Güney, Afyonkarahisar, Sinanpaşa)."""
    metin = satir.strip()
    for hatali, dogru in _IL_DUZELTME.items():
        if metin.startswith(hatali):
            metin = dogru + metin[len(hatali):]
            break
    parcalar = metin.split()
    if len(parcalar) < 2:
        return None
    il = parcalar[0]
    if il not in iller:
        return None
    govde = _SON_EK.sub("", " ".join(parcalar[1:])).strip()
    if not govde:
        return None
    # İlçe adı: "<İlçe> İlçesi" kalıbı varsa yakala, sonra gövdeden at.
    ilce = ""
    m = re.search(r"(\S+)\s+(?:İlçesi|ilçesi|İlçe|ilçe)\b", govde)
    if m:
        ilce = m.group(1)
        govde = govde[m.end():].strip()
    govde = _YAPISAL.sub(" ", govde).strip()
    belde = " ".join(govde.split())
    if not belde or len(belde) < 2:
        return None
    return belde, il, ilce


def main() -> int:
    if not _HAM.is_file():
        print(f"[HATA] ham dosya yok: {_HAM}", file=sys.stderr)
        return 1
    iller = _iller()
    kayitlar: list[dict[str, str]] = []
    hatali: list[dict[str, str]] = []
    for satir in _HAM.read_text(encoding="utf-8").splitlines():
        if not satir.strip() or satir.lstrip().startswith("#"):
            continue
        sonuc = _ayikla(satir, iller)
        if sonuc is None:
            hatali.append({"ham": satir.strip(), "neden": "ayrıştırılamadı"})
            continue
        belde, il, ilce = sonuc
        kayitlar.append({
            "ad": f"{belde} Belediyesi", "belde": belde, "il": il, "ilce": ilce,
            "kaynak_guveni": "resmi",
        })
    payload = {
        "kaynaklar": [{
            "url": _KAYNAK, "erisim": "2026-07-25",
            "kapsam": "e-Belediye Bilgi Sistemine Dahil Olan Belde Belediyeleri (219)",
            "not": ("KISMI liste: yalnız sisteme DAHİL OLAN beldeler. Türkiye'deki tüm belde "
                    "belediyelerini kapsamaz (aynı sayfa 20 büyükşehir diyor, oysa 30 var)."),
        }],
        "belediyeler": kayitlar,
        "dogrulanmayanlar": hatali,
    }
    _CIKTI.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] {len(kayitlar)} belde -> {_CIKTI.relative_to(_ROOT)}"
          f"  (ayrıştırılamayan: {len(hatali)})")
    for h in hatali[:10]:
        print(f"     ATLANDI: {h['ham']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
