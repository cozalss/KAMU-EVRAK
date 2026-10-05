"""Sicil veri düzeltmesi — kamu hizmet sağlayıcılarının TÜRÜ ve kurumların İL'i.

Neden (docs/benchmark/teshis-2026-10-05.json, "BİRİM YÖNLENDİRME + YETKİ" (d)):
yönlendirme ajanı yetkili kurumu artık sicilden kurulan KAPALI KÜMEden seçiyor
(`agents/kurum_aday.py`). Bu küme kurum türüne ve iline dayanır; oysa su/kanalizasyon
idareleri, elektrik ve doğalgaz dağıtım şirketleri sicilde 'diger' türündeydi ve korpustaki
55 belediyenin (Keçiören, Çankaya, Ankara BB...) il alanı boştu. Bu betik iki alanı, KAYDIN
KENDİ ADINDAN veya sicildeki BAŞKA BİR KAYITTAN türetir — dış veri ya da tahmin eklemez:

  1. tur: adı "Su ve Kanalizasyon İdaresi" içeren → su_kanalizasyon; "Elektrik Dağıtım"
     içeren (TEDAŞ genel müdürlüğü/KİT hariç, türü zaten belirli olanlar hariç) →
     elektrik_dagitim; "Doğal Gaz/Doğalgaz Dağıtım" içeren → dogalgaz_dagitim.
  2. il: su idaresi ve büyükşehir belediyesinde adın ilk sözcüğü sicildeki 81 valilik ilinden
     biriyse o il; ilçe belediyesinde sicilde AYNI ilçe adını taşıyan TEK kaymakamlık varsa
     onun ili. Birden çok ilde aynı ilçe adı varsa il YAZILMAZ (belirsizlik tahminle kapatılmaz).

Hizmet BÖLGESİ (hangi EDAŞ hangi ilde) bu betikte YOKTUR: EPDK lisans bölgeleri resmî
kaynaktan doğrulanmadan eklenmez. Bu yüzden kapalı küme elektrik/doğalgaz şirketlerinin
TAMAMINI aday verir ve seçim insan onayına gider.

Kullanım: python scripts/sicil_hizmet_saglayici_zenginlestir.py [--kontrol]
`--kontrol` yalnız değişecek kayıt sayısını yazar, dosyaya dokunmaz. İdempotenttir.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

_SICIL = Path(__file__).resolve().parents[1] / "data" / "teskilat" / "sicil.json"

_TUR_DESEN: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("su_kanalizasyon", re.compile(r"Su ve Kanalizasyon İdaresi")),
    ("elektrik_dagitim", re.compile(r"Elektrik Dağıtım")),
    ("dogalgaz_dagitim", re.compile(r"Doğal ?[Gg]az Dağıtım")),
)


def _tur_duzelt(kayit: dict[str, Any]) -> str | None:
    if kayit.get("tur") != "diger":
        return None  # türü belirli kayda (KİT, il müdürlüğü...) dokunulmaz
    ad = str(kayit.get("ad") or "")
    return next((tur for tur, desen in _TUR_DESEN if desen.search(ad)), None)


def _il_adlari(kurumlar: list[dict[str, Any]]) -> set[str]:
    return {str(k["il"]) for k in kurumlar if k.get("tur") == "valilik" and k.get("il")}


def _ilce_illeri(kurumlar: list[dict[str, Any]]) -> dict[str, set[str]]:
    harita: dict[str, set[str]] = {}
    for k in kurumlar:
        if k.get("tur") == "kaymakamlik" and k.get("ilce") and k.get("il"):
            harita.setdefault(str(k["ilce"]), set()).add(str(k["il"]))
    return harita


def _il_bul(kayit: dict[str, Any], iller: set[str], ilce_il: dict[str, set[str]]) -> str | None:
    if kayit.get("il"):
        return None
    ad = str(kayit.get("ad") or "")
    ilk = ad.split(" ")[0] if ad else ""
    tur = kayit.get("tur")
    if tur == "su_kanalizasyon" or "Büyükşehir" in ad:
        return ilk if ilk in iller else None
    if tur == "belediye" and ad.endswith(" Belediyesi"):
        ilce = ad[: -len(" Belediyesi")]
        adaylar = ilce_il.get(ilce) or set()
        return next(iter(adaylar)) if len(adaylar) == 1 else None
    return None


def zenginlestir(payload: dict[str, Any]) -> list[str]:
    """Sicili yerinde günceller; değişiklik özetini döndürür."""
    kurumlar = payload.get("kurumlar") or []
    degisen: list[str] = []
    for k in kurumlar:
        yeni_tur = _tur_duzelt(k)
        if yeni_tur:
            k["tur"] = yeni_tur
            degisen.append(f"tur {k['slug']} → {yeni_tur}")
    iller, ilce_il = _il_adlari(kurumlar), _ilce_illeri(kurumlar)
    for k in kurumlar:
        il = _il_bul(k, iller, ilce_il)
        if il:
            k["il"] = il
            if k.get("tur") == "belediye" and "Büyükşehir" not in str(k.get("ad")):
                k["ilce"] = str(k["ad"])[: -len(" Belediyesi")]
            degisen.append(f"il {k['slug']} → {il}")
    if degisen:
        dagilim: dict[str, int] = {}
        for k in kurumlar:
            dagilim[k["tur"]] = dagilim.get(k["tur"], 0) + 1
        payload["tur_dagilimi"] = dict(sorted(dagilim.items(), key=lambda x: -x[1]))
    return degisen


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kontrol", action="store_true")
    args = ap.parse_args()
    payload = json.loads(_SICIL.read_text(encoding="utf-8"))
    degisen = zenginlestir(payload)
    for satir in degisen:
        print(satir)
    print(f"{len(degisen)} değişiklik")
    if degisen and not args.kontrol:
        _SICIL.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")


if __name__ == "__main__":
    main()
