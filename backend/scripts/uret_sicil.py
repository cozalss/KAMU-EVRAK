"""Kurum sicili üretimi — girdi tablolarından `data/teskilat/sicil.json`.

Sözleşme: docs/10-kurum-sicili.md. Girdiler `data/teskilat/girdi/` altında versiyonlanır:
    il_ilce.json · universiteler.json · merkezi_teskilat.json · altyapi_kuruluslari.json

Üretim DETERMİNİSTİKTİR (ağ yok): aynı girdi → aynı sicil. Kurum adları adlandırma
mevzuatından türetilir (5393 m.3 "X Belediyesi", 5442 "X Valiliği"/"X Kaymakamlığı");
bu kayıtlar `kaynak_guveni="turetilmis"` taşır ve otomatik havale yetkisi VERMEZ.

    uv run python scripts/uret_sicil.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from agents.kurum_kimlik import _slug as _slug_ascii  # slug katlaması TEK kaynaktan
from agents.kurum_kimlik import ad_to_kurum
from agents.nodes.teskilat_ara import _bagsiz  # bağlaç normalizasyonu — tek kaynak
from core.kaynak_guveni import atomik_json_yaz
from core.sicil import GECERLI_GUVEN, GECERLI_TURLER, kayit_dogrula
from scripts.seed_teskilat import _BASLIK_RE  # korpus @başlık ayrıştırıcısı — tek kaynak
from core.text import tr_lower

_ROOT = Path(__file__).resolve().parents[2]
_GIRDI_DIR = _ROOT / "data" / "teskilat" / "girdi"
_SICIL_FILE = _ROOT / "data" / "teskilat" / "sicil.json"

_GIRDI_DOSYALARI = {
    "il_ilce": "il_ilce.json",
    "universiteler": "universiteler.json",
    "merkezi_teskilat": "merkezi_teskilat.json",
    "edevlet": "edevlet_kurumlar.json",
    "altyapi": "altyapi_kuruluslari.json",
}

# Aynı kurum iki tabloda birden geçtiğinde hangi kaydın kalacağı (yüksek güven kazanır).
_GUVEN_SIRA = {"resmi": 2, "ikincil": 1, "turetilmis": 0}

# Taşra şablonu genişletmesinde ATLANACAK adlar — il/ilçe tablosundan zaten üretiliyorlar
# (çift kayıt aynı slug'a düşüp kurumu gereksizce "belirsiz" yapardı).
_TASRA_ATLA = ("valilik", "valiliğ", "kaymakamlık", "kaymakamlığ")


def _guven(ham: Any) -> str:
    """Girdi tablosundaki güven etiketini kapalı kümeye indir.

    GÜVENLİK: tanınmayan etiket (ör. ajanın uydurduğu "ikincil_dogrulanan") DAİMA en düşük
    seviyeye ("ikincil") düşer — asla yukarı yuvarlanmaz. Böylece girdi tarafındaki serbest
    metin, sicilin güven sözleşmesini sessizce genişletemez.
    """
    deger = str(ham or "").strip()
    return deger if deger in GECERLI_GUVEN else "ikincil"


def _sicil_slug(ad: str) -> str:
    """Kurum adından slug — `kurum_kimlik.ad_to_kurum` birincil, TUTARLILIK GUARD'lı.

    ad_to_kurum tip kalıbını adın ORTASINDA da yakalayabilir: "Türkiye Elektrik Dağıtım
    A.Ş. Genel Müdürlüğü" → 'A.Ş.' özel-ad öbeğini kırdığı için yalnız "Genel Müdürlüğü"
    eşleşir ve slug 'genel-mudurlugu' olur — bu ad TÜM bu tip kurumlarda aynı çıkar ve
    hepsini birbirine karıştırır (2026-07-24 bulgusu). Guard: türetilen slug adın İLK
    sözcüğüyle başlamıyorsa kalıp güvenilmez sayılır ve TAM ad slug'lanır.
    """
    kalip = ad_to_kurum(ad)["slug"]
    tam = _slug_ascii(ad)
    if not kalip:
        return tam
    ilk = tam.split("-")[0] if tam else ""
    return kalip if ilk and kalip.startswith(ilk) else tam


def _ilk_kaynak_url(veri: dict[str, Any]) -> str:
    kaynaklar = veri.get("kaynaklar") or []
    return str(kaynaklar[0].get("url", "")) if kaynaklar else ""


def _kayit(
    ad: str,
    tur: str,
    *,
    kaynak_guveni: str,
    alt_tur: str = "",
    il: str = "",
    ilce: str = "",
    aliaslar: list[str] | None = None,
    web: str = "",
    ust_kurum: str = "",
    kaynak_url: str = "",
    erisim: str = "",
) -> dict[str, Any]:
    """Tek sicil kaydı. Slug DAİMA `kurum_kimlik.ad_to_kurum` ile üretilir — evraktan
    çözümlenen slug ile birebir aynı olsun (aksi hâlde sicil hep ıskalanır)."""
    ad = " ".join((ad or "").split())
    if tur not in GECERLI_TURLER:
        raise ValueError(f"tur kapalı küme dışı: {tur!r} (kurum: {ad!r})")
    if kaynak_guveni not in GECERLI_GUVEN:
        raise ValueError(f"kaynak_guveni geçersiz: {kaynak_guveni!r} (kurum: {ad!r})")
    return {
        "slug": _sicil_slug(ad),
        "ad": ad,
        "tur": tur,
        "alt_tur": alt_tur,
        "il": il,
        "ilce": ilce,
        "aliaslar": [a for a in (aliaslar or []) if str(a).strip()],
        "web": web,
        "ust_kurum": ust_kurum,
        "kaynak_guveni": kaynak_guveni,
        "kaynak_url": kaynak_url,
        "erisim": erisim,
    }


def _il_ilce_kayitlari(veri: dict[str, Any]) -> list[dict[str, Any]]:
    """Valilik · kaymakamlık · belediye · il özel idaresi (adlandırma mevzuatından)."""
    url = _ilk_kaynak_url(veri)
    kayitlar: list[dict[str, Any]] = []
    ortak = {"kaynak_guveni": "turetilmis", "kaynak_url": url}
    for il_kaydi in veri.get("iller") or []:
        il = str(il_kaydi.get("il", "")).strip()
        if not il:
            continue
        kayitlar.append(_kayit(f"{il} Valiliği", "valilik", il=il, **ortak))
        if il_kaydi.get("buyuksehir"):
            kayitlar.append(_kayit(f"{il} Büyükşehir Belediyesi", "belediye",
                                   alt_tur="buyuksehir", il=il, **ortak))
        else:
            kayitlar.append(_kayit(f"{il} Belediyesi", "belediye",
                                   alt_tur="il", il=il, **ortak))
            kayitlar.append(_kayit(f"{il} İl Özel İdaresi", "il_ozel_idare", il=il, **ortak))
        kayitlar.extend(_ilce_kayitlari(il_kaydi, il, ortak))
    return kayitlar


def _ilce_kayitlari(
    il_kaydi: dict[str, Any],
    il: str,
    ortak: dict[str, Any],
) -> list[dict[str, Any]]:
    """İlçe kaymakamlığı + ilçe belediyesi. Merkez ilçe ATLANIR: kaymakamlığı yoktur
    (vali yürütür) ve belediyesi il belediyesidir — ayrı kayıt uydurma kurum olurdu."""
    kayitlar: list[dict[str, Any]] = []
    for ham in il_kaydi.get("ilceler") or []:
        ilce = str(ham).strip()
        if not ilce or tr_lower(ilce) == "merkez":
            continue
        kayitlar.append(_kayit(f"{ilce} Kaymakamlığı", "kaymakamlik",
                               il=il, ilce=ilce, **ortak))
        kayitlar.append(_kayit(f"{ilce} Belediyesi", "belediye",
                               alt_tur="ilce", il=il, ilce=ilce, **ortak))
    return kayitlar


def _universite_kayitlari(veri: dict[str, Any]) -> list[dict[str, Any]]:
    url = _ilk_kaynak_url(veri)
    return [
        _kayit(
            str(u.get("ad", "")), "universite",
            alt_tur=str(u.get("tur", "")),
            il=str(u.get("il", "")),
            web=str(u.get("web", "")),
            kaynak_guveni=_guven(u.get("kaynak_guveni")),
            kaynak_url=str(u.get("kaynak_url") or url),
        )
        for u in veri.get("universiteler") or []
        if str(u.get("ad", "")).strip()
    ]


def _tasra_turu(ad: str) -> str:
    return "defterdarlik" if "defterdarl" in tr_lower(ad) else "il_mudurlugu"


def _merkezi_kayitlari(
    veri: dict[str, Any],
    il_adlari: list[str],
) -> list[dict[str, Any]]:
    """Merkez teşkilatı + taşra ŞABLONLARININ il bazında genişletilmesi."""
    url = _ilk_kaynak_url(veri)
    kayitlar: list[dict[str, Any]] = []
    for kurum in veri.get("kurumlar") or []:
        ad = str(kurum.get("ad", "")).strip()
        if not ad:
            continue
        tur = str(kurum.get("tur", ""))
        ust = str(kurum.get("bagli_oldugu", ""))
        if tur == "tasra_teskilati":
            if any(atla in tr_lower(ad) for atla in _TASRA_ATLA):
                continue  # valilik/kaymakamlık il-ilçe tablosundan geliyor
            kayitlar.extend(
                _kayit(f"{il} {ad}", _tasra_turu(ad), il=il, ust_kurum=ust,
                       kaynak_guveni="turetilmis", kaynak_url=url)
                for il in il_adlari
            )
            continue
        kayitlar.append(_kayit(
            ad, tur,
            aliaslar=[str(kurum.get("kisaltma", ""))],
            web=str(kurum.get("web", "")),
            ust_kurum=ust,
            kaynak_guveni=_guven(kurum.get("kaynak_guveni")),
            kaynak_url=str(kurum.get("kaynak_url") or url),
        ))
    return kayitlar


def _altyapi_kayitlari(veri: dict[str, Any]) -> list[dict[str, Any]]:
    """Elektrik/doğalgaz dağıtım + su ve kanalizasyon idareleri."""
    url = _ilk_kaynak_url(veri)
    kayitlar: list[dict[str, Any]] = []
    for kurulus in veri.get("kuruluslar") or []:
        ad = str(kurulus.get("ad", "")).strip()
        if not ad:
            continue
        bolge = [str(b) for b in (kurulus.get("hizmet_bolgesi") or [])]
        kayitlar.append(_kayit(
            ad, str(kurulus.get("tur", "")),
            il=bolge[0] if len(bolge) == 1 else "",
            aliaslar=[str(kurulus.get("kisaltma", ""))],
            web=str(kurulus.get("web", "")),
            kaynak_guveni=_guven(kurulus.get("kaynak_guveni")),
            kaynak_url=str(kurulus.get("kaynak_url") or url),
        ))
    return kayitlar


def _tekillestir(kurumlar: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aynı kurumun birden çok girdi tablosunda geçmesini tekille (ör. bakanlıklar hem
    merkezi_teskilat hem e-Devlet tablosunda).

    AYRIM: aynı slug + aynı `il` = AYNI kurum (tekilleştirilir); aynı slug + FARKLI il =
    gerçek belirsizlik (iki ildeki "Gölbaşı Belediyesi") → dokunulmaz, belirsiz işaretlenir.
    Ad karşılaştırması kullanılmaz: slug zaten ASCII-katlanmış addır, "Millî/Milli" gibi
    yazım farkı aynı kurumu iki kurum gibi göstermemelidir.
    """
    gruplar: dict[str, list[dict[str, Any]]] = {}
    for kurum in kurumlar:
        gruplar.setdefault(kurum["slug"], []).append(kurum)
    sonuc: list[dict[str, Any]] = []
    for grup in gruplar.values():
        # BOŞ il = "bilinmiyor" (joker); belirsizlik ancak iki FARKLI il görülünce doğar.
        iller = {k.get("il", "") for k in grup} - {""}
        if len(grup) == 1 or len(iller) > 1:
            sonuc.extend(grup)
            continue
        secili = max(grup, key=lambda k: (_GUVEN_SIRA.get(k["kaynak_guveni"], 0),
                                          k["tur"] != "diger"))
        aliaslar = sorted({a for k in grup for a in k.get("aliaslar") or []})
        sonuc.append({**secili, "aliaslar": aliaslar})
    return sonuc


def _varyant_birlestir(kurumlar: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """AYNI kısaltmayı taşıyan ve slug'ları ÖN-EK ilişkili kayıtları birleştir.

    Aynı kurum farklı tablolarda ad varyantıyla geçebilir: "Enerji Piyasası Düzenleme
    Kurumu" ve "... Kurumu Başkanlığı". Slug'lar farklı olduğu için tekilleştirme bunları
    yakalamaz, alias (EPDK) ise çakışma sanılıp DÜŞÜRÜLÜRDÜ (2026-07-24 bulgusu).
    İki koşul BİRLİKTE arandığı için (aynı kısaltma + ön-ek ilişkisi) farklı kurumların
    yanlışlıkla birleşmesi beklenmez; koşullardan biri tutmazsa kayıtlara dokunulmaz.
    """
    alias_slug: dict[str, list[str]] = {}
    for kurum in kurumlar:
        for ham in kurum.get("aliaslar") or []:
            alias = _sicil_slug(str(ham))
            if alias:
                alias_slug.setdefault(alias, []).append(kurum["slug"])
    esleme: dict[str, str] = {}  # varyant slug → kanonik slug
    for sluglar in alias_slug.values():
        benzersiz = sorted(set(sluglar), key=len)
        kanonik = benzersiz[-1]
        if len(benzersiz) > 1 and all(kanonik.startswith(s) for s in benzersiz):
            esleme.update({s: kanonik for s in benzersiz[:-1]})
    # BAĞLAÇ VARYANTI: "aile-ve-sosyal-..." ve "aile-sosyal-..." AYNI kurumdur (çalışma
    # zamanı da böyle çözer). Korpus dizini olan yazım kanonik kabul edilir — çalışma
    # zamanında eşleşen anahtar odur.
    baglac_grup: dict[str, list[str]] = {}
    for kurum in kurumlar:
        baglac_grup.setdefault(_bagsiz(kurum["slug"]), []).append(kurum["slug"])
    korpus_sluglari = {k["slug"] for k in kurumlar if "-ve-" in k["slug"]}
    for sluglar in baglac_grup.values():
        benzersiz = sorted(set(sluglar))
        if len(benzersiz) < 2:
            continue
        kanonik = next((s for s in benzersiz if s in korpus_sluglari), benzersiz[-1])
        esleme.update({s: kanonik for s in benzersiz if s != kanonik})
    if not esleme:
        return kurumlar
    # Varyant kaydı DÜŞÜRÜLÜR (slug'ı yeniden yazmak ad↔slug uyumunu bozardı); alias'ları ve
    # kendi slug'ı kanonik kayda alias olarak taşınır → kısa ad da çözümlenmeye devam eder.
    tasinan: dict[str, set[str]] = {}
    kalan: list[dict[str, Any]] = []
    for kurum in kurumlar:
        hedef = esleme.get(kurum["slug"])
        if hedef is None:
            kalan.append(kurum)
            continue
        tasinan.setdefault(hedef, set()).update(kurum.get("aliaslar") or [])
        tasinan[hedef].add(kurum["slug"])
    return [
        {**k, "aliaslar": sorted(set(k.get("aliaslar") or []) | tasinan[k["slug"]])}
        if k["slug"] in tasinan else k
        for k in kalan
    ]


# Korpus dosyalarındaki kurum tipini sicil taksonomisine eşleyen kapalı harita.
_KIMLIK_TUR = {
    "belediye": "belediye", "valilik": "valilik", "kaymakamlik": "kaymakamlik",
    "bakanlik": "bakanlik", "universite": "universite", "bassavcilik": "bassavcilik",
    "il_ozel_idare": "il_ozel_idare", "defterdarlik": "defterdarlik",
}


def _korpus_kayitlari(teskilat_dir: Path) -> list[dict[str, Any]]:
    """İnsan-küratörlü `data/teskilat/<kurum>/` korpusundan sicil kaydı.

    Korpus, vatandaşın fiilen yazıştığı kurumları (ASKİ, ASAT, UEDAŞ...) resmî künyesiyle
    zaten taşıyor. SLUG olarak DİZİN ADI kullanılır — çalışma zamanında eşleşen anahtar
    odur; adından türeyen varyant alias olarak eklenir. Kayıtlar sicil güven sözleşmesine
    indirilir (`_guven`): korpustaki "resmi_dogrulanmis" damgası sicile TAŞINMAZ (INV-3).
    """
    kayitlar: list[dict[str, Any]] = []
    for kurum_dir in sorted(teskilat_dir.glob("*")):
        if not kurum_dir.is_dir() or kurum_dir.name.startswith("_"):
            continue
        meta, aliaslar = _korpus_meta(kurum_dir)
        ad = meta.get("KURUM", "").strip()
        if not ad or "[" in ad:  # künyesi olmayan/şablon dosya → uydurma yok, atla
            continue
        turetilen = _sicil_slug(ad)
        if turetilen and turetilen != kurum_dir.name:
            aliaslar.append(turetilen)
        kayit = _kayit(
            ad, _KIMLIK_TUR.get(ad_to_kurum(ad)["tur"], "diger"),
            aliaslar=aliaslar,
            kaynak_guveni=_guven(meta.get("KAYNAK_GUVENI")),
            kaynak_url=meta.get("KAYNAK_KIMLIK", ""),
            erisim=meta.get("ERISIM", ""),
        )
        kayitlar.append({**kayit, "slug": kurum_dir.name})
    return kayitlar


def _korpus_meta(kurum_dir: Path) -> tuple[dict[str, str], list[str]]:
    """Kurum dizinindeki .txt başlıklarından @meta + @ALIAS token'ları."""
    meta: dict[str, str] = {}
    aliaslar: list[str] = []
    for path in sorted(kurum_dir.glob("*.txt")):
        for ham in path.read_text(encoding="utf-8", errors="replace").splitlines()[:12]:
            eslesme = _BASLIK_RE.match(ham.rstrip())
            if not eslesme:
                continue
            anahtar, deger = eslesme.group(1).upper(), eslesme.group(2).strip()
            if anahtar == "ALIAS":
                aliaslar.extend(t.strip() for t in deger.split(",") if t.strip())
            else:
                meta.setdefault(anahtar, deger)
    return meta, aliaslar


def _belirsizleri_isaretle(kurumlar: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aynı slug birden fazla kuruma aitse (iki ilde "Gölbaşı Belediyesi") ikisi de
    `belirsiz` işaretlenir → çözümleme None döner (yanlış kuruma havale etmektense hiç etme)."""
    sayac = Counter(k["slug"] for k in kurumlar)
    return [{**k, "belirsiz": True} if sayac[k["slug"]] > 1 else k for k in kurumlar]


def _alias_haritasi(
    kurumlar: list[dict[str, Any]],
) -> tuple[dict[str, str], list[str]]:
    """Kısaltma → slug. ÇAKIŞAN kısaltma (ASKİ: Ankara/Adana) tamamen DÜŞÜRÜLÜR (INV-5)."""
    sluglar = {k["slug"] for k in kurumlar}
    aliaslar: dict[str, str] = {}
    cakisan: set[str] = set()
    for kurum in kurumlar:
        if kurum.get("belirsiz"):
            continue
        for ham in kurum.get("aliaslar") or []:
            alias = _sicil_slug(str(ham))
            if not alias or alias == kurum["slug"] or alias in sluglar:
                continue  # boş, kendisi, ya da başka kurumun kanonik slug'ı
            if alias in aliaslar and aliaslar[alias] != kurum["slug"]:
                cakisan.add(alias)
                continue
            aliaslar[alias] = kurum["slug"]
    for alias in cakisan:
        aliaslar.pop(alias, None)
    return aliaslar, sorted(cakisan)


def _girdi_kaynaklari(girdiler: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"girdi": ad, **kaynak}
        for ad, veri in girdiler.items()
        for kaynak in ((veri or {}).get("kaynaklar") or [])
        if isinstance(kaynak, dict)
    ]


def sicil_uret(
    girdiler: dict[str, Any],
    *,
    uretim_tarihi: str = "",
    korpus_dir: Path | None = None,
) -> dict[str, Any]:
    """Girdi tablolarından sicil payload'ı üret. `korpus_dir` verilirse insan-küratörlü
    teşkilat korpusundaki kurumlar da sicile köprülenir (I/O yalnız o zaman)."""
    il_veri = girdiler.get("il_ilce") or {}
    il_adlari = [str(i.get("il", "")).strip() for i in il_veri.get("iller") or []]
    kurumlar = [
        *_il_ilce_kayitlari(il_veri),
        *_universite_kayitlari(girdiler.get("universiteler") or {}),
        *_merkezi_kayitlari(girdiler.get("merkezi_teskilat") or {},
                            [il for il in il_adlari if il]),
        *_merkezi_kayitlari(girdiler.get("edevlet") or {}, []),
        *_altyapi_kayitlari(girdiler.get("altyapi") or {}),
        *(_korpus_kayitlari(korpus_dir) if korpus_dir else []),
    ]
    kurumlar = _belirsizleri_isaretle(_varyant_birlestir(_tekillestir(kurumlar)))
    hatalar = [f"{k['ad']}: {h}" for k in kurumlar for h in kayit_dogrula(k)]
    if hatalar:
        raise ValueError("sicil kaydı sözleşmeye uymuyor: " + "; ".join(hatalar[:5]))
    aliaslar, cakisan = _alias_haritasi(kurumlar)
    return {
        "version": 1,
        "uretim_tarihi": uretim_tarihi,
        "girdi_kaynaklari": _girdi_kaynaklari(girdiler),
        "kurum_sayisi": len(kurumlar),
        "belirsiz_sayisi": sum(1 for k in kurumlar if k.get("belirsiz")),
        "tur_dagilimi": dict(sorted(Counter(k["tur"] for k in kurumlar).items())),
        "aliaslar": dict(sorted(aliaslar.items())),
        "cakisan_aliaslar": cakisan,
        "kurumlar": sorted(kurumlar, key=lambda k: (k["tur"], k["slug"], k["il"])),
    }


def _girdileri_oku() -> dict[str, Any]:
    girdiler: dict[str, Any] = {}
    for anahtar, dosya in _GIRDI_DOSYALARI.items():
        path = _GIRDI_DIR / dosya
        if not path.is_file():
            print(f"[UYARI] girdi yok, atlanıyor: {dosya}", file=sys.stderr)
            continue
        girdiler[anahtar] = json.loads(path.read_text(encoding="utf-8"))
    return girdiler


def main(argv: list[str] | None = None) -> int:
    girdiler = _girdileri_oku()
    if not girdiler:
        print(f"[HATA] {_GIRDI_DIR} altında girdi tablosu yok", file=sys.stderr)
        return 1
    tarih = max(
        (str(k.get("erisim", "")) for k in _girdi_kaynaklari(girdiler)),
        default="",
    )
    sicil = sicil_uret(girdiler, uretim_tarihi=tarih, korpus_dir=_GIRDI_DIR.parent)
    atomik_json_yaz(_SICIL_FILE, sicil)
    print(f"[OK] {sicil['kurum_sayisi']} kurum ({len(sicil['aliaslar'])} alias, "
          f"{sicil['belirsiz_sayisi']} belirsiz) -> {_SICIL_FILE.relative_to(_ROOT)}")
    for tur, adet in sicil["tur_dagilimi"].items():
        print(f"     {tur:32s} {adet:5d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
