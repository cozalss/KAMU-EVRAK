"""Gerçekçi ALTIN uçtan-uca değerlendirme — "bir kamu kurumu bunu kullanabilir mi?"

NEDEN: mevcut eval'ler node'ları TEK TEK ölçer (sınıf, birim kovası, özet...). Canlı koşumda
görülen kusurlar ise node'ların ARASINDA doğuyordu: yönlendirme JSON'u kesilip yanlış birime
düşüyor, taslağın "İlgi" satırı vatandaşın dilekçesi yerine kurumun kendi yazısını gösteriyor,
"Konu" satırı dilekçe cümlesinin ham kopyası oluyor, iki ajan talep sayısında çelişiyor,
yetki başka kurumdayken (ASKİ, EDAŞ, tapu) sistem bunu söylemiyor. Bu harness GERÇEK grafı
(`build_graph().ainvoke`) `data/synthetic/e2e_gercek_gold.jsonl` üzerinde koşar ve memurun
göreceği çıktıyı memurun ölçütleriyle sayar. Düzeltmelerden önce/sonra TEK ölçüt budur.

Kurallar:
  - LLM-judge YOK. Her metrik açık, deterministik bir kuraldır (aşağıda tanımlı); kural
    yanlışsa test edilir (tests/test_e2e_gercek_eval.py), sessizce "yorumlanmaz".
  - Oranlar Wilson %95 CI ile yazılır (eval/stats.py) — 59 belgede nokta tahmini yanıltır.
  - Artefakt git SHA damgalıdır; belge metni yazılmaz (yalnız id + tahmin + başarısızlık).

Çalıştır (backend/ içinde):
  PYTHONUTF8=1 uv run python -m eval.e2e_gercek_eval --etiket baslangic

İnsan incelemesi için `--dokum <yol>` memurun gördüğü çıktıları belge başına JSONL yazar
(sentetik belge çıktısıdır; yalnız depo DIŞINA — ör. scratchpad — yazılmalıdır).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import contextvars
import datetime
import json
import os
import re
import statistics
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from eval.e2e_eslesme import (  # metin kuralları ayrı modülde (dosya <800 satır)
    _kelimeler,
    birim_dogru,
    icerir_herhangi,
    kok_icerir,
    norm,
)
from eval.stats import wilson_interval

_KOK = Path(__file__).resolve().parent.parent.parent
GOLD = _KOK / "data" / "synthetic" / "e2e_gercek_gold.jsonl"
RUNS = Path(__file__).resolve().parent / "runs"

# --- kural eşikleri (değiştirmek = ölçütü değiştirmek; artefakta yazılır) ---
KONU_AZAMI_KELIME = 12      # resmî "Konu" kısa isim öbeğidir (Yön. 2646 m.12 uygulaması)
HAM_KOPYA_NGRAM = 6         # kaynak gövdeyle ≥6 ardışık ortak kelime = cümle kopyası
MEVZUAT_K = 3               # precision@k
VARSAYILAN_ESZAMANLILIK = 6
VARSAYILAN_TIMEOUT_S = 240.0

_BIRINCI_SAHIS = re.compile(
    r"\b(arz|rica|talep)\s+ed(erim|iyorum|iyoruz|eriz)\b|\bederim\b|\bediyorum\b"
    r"|\bistiyorum\b|\bistiyoruz\b|\bbulunmaktadir\b|\bbulunmakta\b")
_TCKN = re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)")
_TELEFON = re.compile(r"(?<!\d)0?\s?5\d{2}[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}(?!\d)")

# İlgi satırında beklenen belge-türü sözcükleri (normalize edilmiş kökler).
ILGI_TUR_KELIME: dict[str, tuple[str, ...]] = {
    # "…tarihli başvurunuz" vatandaşa cevapta yerleşik kullanımdır; "yazınız" DEĞİLDİR.
    "dilekce": ("dilekce", "basvuru"),
    "basvuru": ("basvuru", "dilekce"),
    "cimer": ("cimer", "basvuru"),
    "bilgi_edinme": ("bilgi edinme", "basvuru"),
    "yazi": ("yazi",),
    "muzekkere": ("muzekkere", "yazi"),
    "icra": ("muzekkere", "yazi", "ihbarname", "haciz"),
}


# ============================================================ metin yardımcıları
def en_uzun_ortak_ngram(a: str, b: str) -> int:
    """a ile b arasındaki en uzun ARDIŞIK ortak kelime dizisinin uzunluğu."""
    x, y = _kelimeler(a), _kelimeler(b)
    best, prev = 0, [0] * (len(y) + 1)
    for i in range(1, len(x) + 1):
        cur = [0] * (len(y) + 1)
        for j in range(1, len(y) + 1):
            if x[i - 1] == y[j - 1]:
                cur[j] = prev[j - 1] + 1
                best = max(best, cur[j])
        prev = cur
    return best


def taslak_alani(md: str, etiket: str) -> str | None:
    """Taslaktaki 'Konu :' / 'İlgi :' alanı (devam satırları boş satıra kadar eklenir)."""
    satirlar = (md or "").splitlines()
    desen = re.compile(rf"^\s*{etiket}\s*:\s*(.*)$", re.IGNORECASE)
    for i, satir in enumerate(satirlar):
        m = desen.match(norm(satir))
        if not m:
            continue
        ham = satir.split(":", 1)[1].strip()
        for devam in satirlar[i + 1:]:
            if not devam.strip() or re.match(r"^\s*\w+\s*:", devam):
                break
            ham += " " + devam.strip()
        return ham.strip()
    return None


def taslak_anteti(md: str) -> str:
    """Antet bloğu: 'Sayı' satırından önceki dolu satırlar (T.C. / idare / birim)."""
    blok: list[str] = []
    for satir in (md or "").splitlines():
        if re.match(r"^\s*sayi\s*:", norm(satir)):
            break
        if satir.strip():
            blok.append(satir.strip())
    return " / ".join(blok)


def taslak_muhatabi(md: str) -> str:
    """Muhatap bloğu: 'Konu' alanından sonra, 'İlgi' alanından (yoksa ilk boş satırdan) önceki
    dolu satırlar — Yön. 2646 yerleşiminde muhatap konu ile ilgi arasındadır."""
    satirlar = (md or "").splitlines()
    i = next((k for k, s in enumerate(satirlar) if re.match(r"^\s*konu\s*:", norm(s))), None)
    if i is None:
        return ""
    blok: list[str] = []
    for satir in satirlar[i + 1:]:
        if re.match(r"^\s*ilgi\s*:", norm(satir)):
            break
        if not satir.strip():
            if blok:
                break
            continue
        if not blok and not satir.startswith(" "):  # konu devam satırı değil, gövde
            continue
        blok.append(satir.strip())
    return " ".join(blok)


def tarih_varyantlari(tarih: str) -> list[str]:
    """'02.10.2026' → yazımda görülebilecek eşdeğerler (2.10.2026, 02/10/2026...)."""
    g, a, y = tarih.split(".")
    gunler, aylar = {g, g.lstrip("0")}, {a, a.lstrip("0")}
    return [f"{x}{s}{z}{s}{y}" for x in gunler for z in aylar for s in (".", "/", "-")]


_IKINCI_SAHIS = re.compile(r"\b\w+n[iu]z(la|da|e)?\b")


def _kaynak_govdesi(metin: str) -> str:
    """Kaynak evrakın kendi 'Konu:' satırı çıkarılmış gövdesi — o satırı aynen taşımak
    kopya DEĞİL meşru devralmadır (kurum yazısında konu zaten resmî öbektir)."""
    return "\n".join(s for s in (metin or "").splitlines() if not re.match(r"^\s*konu\s*:", norm(s)))


# ============================================================ metrikler (saf fonksiyonlar)
def konu_degerlendir(konu: str | None, kaynak: str, anahtarlar: list[str]) -> dict[str, Any]:
    """Konu kuralı: var + ≤12 kelime + ham kopya değil + 1. şahıs fiil yok + anahtar kavram var."""
    if not konu:
        return {"gecti": False, "neden": ["konu_yok"], "konu": None}
    kelime = len(_kelimeler(konu))
    ngram = en_uzun_ortak_ngram(konu, _kaynak_govdesi(kaynak))
    nedenler = []
    if kelime > KONU_AZAMI_KELIME:
        nedenler.append(f"uzun({kelime}k)")
    if ngram >= HAM_KOPYA_NGRAM:
        nedenler.append(f"ham_kopya({ngram}-gram)")
    if _BIRINCI_SAHIS.search(norm(konu)):
        nedenler.append("birinci_sahis_fiil")
    if not kok_icerir(konu, anahtarlar):  # Türkçe çekim: 'kabri' ~ 'kabir'
        nedenler.append("anahtar_yok")
    return {"gecti": not nedenler, "neden": nedenler, "konu": konu, "kelime": kelime}


def ilgi_degerlendir(ilgi: str | None, b: dict[str, Any], muhatap: str = "") -> dict[str, Any]:
    """İlgi kuralı: satır var + doğru gönderen + doğru belge türü + gelen evrakın tarihi.

    Gönderen iki yoldan doğru sayılır: (a) ilgi göndereni adıyla anar ("Ayşe Yılmaz'ın ...
    dilekçesi"), ya da (b) yazı göndereNE cevaptır — muhatap gönderendir ve ilgi 2. şahıs
    iyelikle anar ("... tarihli başvurunuz"). (b) muhatap kontrolsüz kabul edilseydi, kendi
    yazımızı "yazınız" diye anan taslak da geçerdi.
    """
    if not b.get("ilgi_turu"):
        return {"gecti": True, "neden": [], "ilgi": ilgi}
    if not ilgi:
        return {"gecti": False, "neden": ["ilgi_yok"], "ilgi": None, "muhatap": muhatap}
    kabul = b.get("ilgi_gonderen_kabul") or [b.get("ilgi_gonderen", "")]
    ikinci_sahis = bool(_IKINCI_SAHIS.search(norm(ilgi))) and icerir_herhangi(muhatap, kabul)
    nedenler = []
    if not (icerir_herhangi(ilgi, kabul) or ikinci_sahis):
        nedenler.append("gonderen_yanlis")
    if not icerir_herhangi(ilgi, list(ILGI_TUR_KELIME.get(b["ilgi_turu"], ()))):
        nedenler.append("belge_turu_yanlis")
    if b.get("ilgi_tarih") and not icerir_herhangi(ilgi, tarih_varyantlari(b["ilgi_tarih"])):
        nedenler.append("tarih_yanlis")
    return {"gecti": not nedenler, "neden": nedenler, "ilgi": ilgi, "muhatap": muhatap}


_TARIHSEL_BIRIM_YER_TUTUCU = "Yazı İşleri Birimi"


def _birim_yer_tutucusu() -> str:
    """Render motorunun KURUM_BIRIM yokken bastığı jenerik birim satırı (tek kaynak:
    yazi.models._DEMO_DEFAULTS). duzelt/yazi'dan beri varsayılan BOŞ (yer tutucu basılmaz);
    eski koşumların yeniden puanlanabilmesi için tarihsel yer tutucu ölçülmeye devam eder."""
    with contextlib.suppress(Exception):
        from yazi.models import _DEMO_DEFAULTS
        if v := str(_DEMO_DEFAULTS.get("birim_adi") or ""):
            return v
    return _TARIHSEL_BIRIM_YER_TUTUCU


def antet_degerlendir(md: str, b: dict[str, Any]) -> dict[str, Any]:
    """Antet kuralı: yazıyı yazan idare = evrakın muhatabı (gelen evrakı işleyen kurum).

    Ayrıca (bileşiğe GİRMEYEN ayrı ölçüt) antetin birim satırı jenerik yer tutucu mu: tapu
    müdürlüğüne 'Yazı İşleri Birimi' basmak kurum metriğini geçer ama yanlış bir birim
    iddiasıdır (2026-10-05 incelemesi; Yön. m.10 birim satırını zorunlu kılmaz → boş olabilir).
    """
    antet = taslak_anteti(md)
    satirlar = [x.strip() for x in antet.split(" / ")] if antet else []
    birim_satiri = satirlar[2] if len(satirlar) >= 3 else ""
    yer_tutucu = _birim_yer_tutucusu()
    return {"antet": antet, "gecti": icerir_herhangi(antet, b["muhatap_kabul"]),
            "birim_satiri": birim_satiri,
            "birim_yer_tutucu": bool(birim_satiri and yer_tutucu
                                     and norm(birim_satiri) == norm(yer_tutucu))}


def tur_degerlendir(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    from agents.config import ayni_esdeger_grup
    pred = state.get("evrak_turu") or "belirsiz"
    kabul = pred == b["evrak_turu"] or pred in (b.get("evrak_turu_kabul") or [])
    operasyonel = ayni_esdeger_grup(pred, b["evrak_turu"])
    # Bileşik ölçüt: altının AÇIKÇA kabul ettiği tür ya da operasyonel eşdeğeri. Yalnız
    # eşdeğer gruba bakmak, altının kabul ettiği türü (ör. şikâyet ↔ dilekçe) başarısız
    # sayıyordu (2026-10-05 incelemesi: ilce_yenimahalle_cop).
    return {"tahmin": pred, "kesin": pred == b["evrak_turu"], "kabul": kabul,
            "operasyonel": operasyonel, "bilesik": kabul or operasyonel}


def birim_tahmini(state: dict[str, Any]) -> tuple[str, str]:
    """Memurun gördüğü havale birimi + hangi alandan geldiği (öncelik sırası sabit)."""
    from agents.config import BIRIM_TR
    # Yönlendirme tek doğruluk kaynağının memura gösterdiği metin (agents/yonlendirme.py);
    # varsa arşiv/bildirim/arayüz bunu basar → ölçülen de budur.
    if state.get("gosterim_birimi"):
        return state["gosterim_birimi"], "gosterim_birimi"
    if state.get("hedef_birim"):
        return state["hedef_birim"], "hedef_birim"
    if state.get("hedef_birim_oneri"):
        return state["hedef_birim_oneri"], "hedef_birim_oneri"
    servis = state.get("servis_birimi") or {}
    if servis.get("ad"):
        return servis["ad"], "servis_birimi"
    kat = state.get("hedef_kategori") or ""
    return BIRIM_TR.get(kat, kat), "hedef_kategori"


def _string_degerler(d: dict[str, Any], anahtar_kokleri: tuple[str, ...]) -> list[str]:
    """Anahtarı verilen köklerden birini içeren tüm string/dict-ad değerleri (ileri-uyumlu)."""
    out: list[str] = []
    for k, v in (d or {}).items():
        if not any(kok in k for kok in anahtar_kokleri):
            continue
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            out.extend(str(x) for x in v.values() if isinstance(x, str))
    return out


def talepleri_eslestir(gold: list[dict[str, Any]], adaylar: list[str]) -> list[int | None]:
    """Her altın talebe, anahtar kökü içeren İLK kullanılmamış aday indeksini ata."""
    kullanildi: set[int] = set()
    sonuc: list[int | None] = []
    for t in gold:
        bulunan = next((i for i, a in enumerate(adaylar)
                        if i not in kullanildi and icerir_herhangi(a, t["anahtar"])), None)
        if bulunan is not None:
            kullanildi.add(bulunan)
        sonuc.append(bulunan)
    return sonuc


def talep_degerlendir(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Talep kapsama: ayrıştırıcı (alt_talepler) + çıkarıcı (bilgi_unsurlari.talepler) ayrı ayrı."""
    gold = b["talep_detay"]
    alt = [a for a in (state.get("alt_talepler") or []) if isinstance(a, dict)]
    cikar = [str(t) for t in ((state.get("bilgi_unsurlari") or {}).get("talepler") or [])]
    es_alt = talepleri_eslestir(gold, [str(a.get("ozet", "")) for a in alt])
    es_cikar = talepleri_eslestir(gold, cikar)
    alt_birim = []
    for t, idx in zip(gold, es_alt, strict=True):
        if idx is None:
            alt_birim.append(None)
            continue
        alt_birim.append(icerir_herhangi(" | ".join(_string_degerler(alt[idx], ("birim",))),
                                         t["birim_kabul"]))
    tahmin_sayi = len(alt) if len(alt) > 1 else 1
    return {
        "gold_sayi": len(gold), "tahmin_sayi": tahmin_sayi, "cikar_sayi": len(cikar),
        "sayi_dogru": tahmin_sayi == len(gold),
        "decompose_bulunan": sum(i is not None for i in es_alt),
        "cikar_bulunan": sum(i is not None for i in es_cikar),
        "alt_birim_dogru": alt_birim,
        "tutarli": (sum(i is not None for i in es_alt) == sum(i is not None for i in es_cikar)),
    }


def yetki_degerlendir(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Yetki: YAPISAL sinyal (yetkili_kurum ≠ muhatap ve kabul edilen kurum; ya da alt talepte
    kurum/yetki alanı) ve METİNSEL sinyal (gerekçe/bilgilendirmede kurumun adı geçiyor)."""
    muh = (state.get("muhatap_kurum") or {}).get("slug") or ""
    yk = state.get("yetkili_kurum") or {}
    disari_yapisal_doc = bool(yk.get("slug")) and bool(muh) and yk.get("slug") != muh
    kabul = b.get("yetkili_kurum_kabul") or []
    alt_sinyal = [" | ".join(_string_degerler(a, ("yetki", "kurum")))
                  for a in (state.get("alt_talepler") or []) if isinstance(a, dict)]
    yapisal = (disari_yapisal_doc and icerir_herhangi(yk.get("ad"), kabul)) or any(
        icerir_herhangi(s, kabul) for s in alt_sinyal)
    serbest = " ".join(str(state.get(k) or "") for k in (
        "birim_reasoning", "bilgilendirme", "ozet", "hedef_kurum_adi"))
    serbest += " " + json.dumps(state.get("canli_kaynak") or {}, ensure_ascii=False)
    serbest += " " + " ".join(map(str, state.get("clarify_questions") or []))
    metinsel = bool(kabul) and icerir_herhangi(serbest, kabul)
    if b["yetki"] == "YARGI":
        return _yargi_degerlendir(state, disari_yapisal_doc, yk)
    if b["yetki"] == "DISARIDA":
        return {"beklenen": "DISARIDA", "yapisal": yapisal, "metinsel": metinsel or yapisal,
                "gecti": yapisal, "yetkili_tahmin": yk.get("ad")}
    return {"beklenen": "ICERIDE", "yanlis_alarm": disari_yapisal_doc, "gecti": not disari_yapisal_doc,
            "yetkili_tahmin": yk.get("ad")}


def _yargi_degerlendir(state: dict[str, Any], disari_doc: bool,
                       yk: dict[str, Any]) -> dict[str, Any]:
    """3071 m.6/b: yargı merciinin görevine giren dilekçe İNCELENEMEZ; m.5 devri yalnız
    'yetkili idari makama' yapılır → mahkemeye ya da başka idareye devir YANLIŞTIR. Doğru
    çıktı devirsiz cevaptır (vatandaşa yargı yolu bildirilir). Ölçüt yapısaldır: belge ya
    da talep düzeyinde kurum dışına devir yoksa geçer — sistemin bu sınıfa verdiği adın
    (karar etiketi) ne olduğuna bağlı değildir."""
    yon = state.get("yonlendirme") or {}
    talep_devir = any(isinstance(t, dict) and t.get("karar") == "DISARIDA"
                      for t in yon.get("talepler") or [])
    devir = disari_doc or yon.get("karar") in ("DISARIDA", "KARMA") or talep_devir
    return {"beklenen": "YARGI", "devir": devir, "yapisal": not devir,
            "metinsel": not devir, "gecti": not devir, "yetkili_tahmin": yk.get("ad")}


def mevzuat_eslesir(dosya: str, onekler: list[str]) -> bool:
    """Korpus dosya anahtarı ('3071_dilekce_hakki_kanunu') bir öneke eşleşiyor mu."""
    return any(dosya == o or dosya.startswith(o + "_") for o in onekler)


def mevzuat_degerlendir(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    oneriler = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []
    dosyalar: list[str] = []
    for o in oneriler:
        d = (o or {}).get("kaynak_dosya") or ""
        if d and d not in dosyalar:
            dosyalar.append(d)
    top = dosyalar[:MEVZUAT_K]
    beklenen = b.get("beklenen_mevzuat_herhangi") or []
    ilgili = beklenen + (b.get("mevzuat_kabul") or [])
    yasak = b.get("alakasiz_mevzuat_yasak") or []
    return {"top": top, "hit": any(mevzuat_eslesir(d, beklenen) for d in top),
            "ilgili_sayi": sum(mevzuat_eslesir(d, ilgili) for d in top),
            "yasak": [d for d in top if mevzuat_eslesir(d, yasak)]}


# Altın 'eksik_notlari' kodu → bilgi notunda aranacak ifade (eksik_tespit._IMZA_NOTU).
_NOT_IFADESI = {"imza_dogrulanamadi": "İmza metinden doğrulanamadı"}


def eksik_degerlendir(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    tahmin, gold = set(state.get("eksik_alanlar") or []), set(b.get("eksikler") or [])
    notlar = " ".join(map(str, state.get("eksik_bilgi_notlari") or []))
    beklenen_not = b.get("eksik_notlari") or []
    return {"tahmin": sorted(tahmin), "tam": tahmin == gold,
            "tp": len(tahmin & gold), "fp": len(tahmin - gold), "fn": len(gold - tahmin),
            "not_dogru": all(_NOT_IFADESI.get(k, k) in notlar for k in beklenen_not)}


def kullaniciya_giden_metinler(state: dict[str, Any]) -> dict[str, str]:
    """Memura/vatandaşa gösterilen serbest metin alanları (PII taraması yalnız bunlarda)."""
    alanlar = {k: str(state.get(k) or "") for k in (
        "yazi_taslak_md", "ozet", "bilgilendirme", "birim_reasoning", "tur_reasoning")}
    alanlar["bilgilendirme_yapisal"] = json.dumps(state.get("bilgilendirme_yapisal") or {},
                                                  ensure_ascii=False)
    alanlar["clarify_questions"] = " ".join(map(str, state.get("clarify_questions") or []))
    for i, a in enumerate(state.get("alt_talepler") or []):
        if isinstance(a, dict):
            alanlar[f"alt_talep_{i}"] = " ".join(str(v) for v in a.values() if isinstance(v, str))
    # Başka kurum/birimlere giden havale-devir-cevap yazıları da insana gider (2026-10-05:
    # tarama yalnız ana taslağa bakıyordu, paket yazıları ölçülmüyordu).
    for i, y in enumerate(state.get("yazi_paketi") or []):
        if isinstance(y, dict):
            alanlar[f"yazi_paketi_{i}"] = str(y.get("yazi_taslak_md") or "")
    return alanlar


def pii_tara(state: dict[str, Any]) -> list[str]:
    """Ham TCKN (11 hane) / cep telefonu geçen alan adları — maskelenmiş biçim yakalanmaz."""
    return sorted(ad for ad, m in kullaniciya_giden_metinler(state).items()
                  if _TCKN.search(m) or _TELEFON.search(m))


def belge_degerlendir(state: dict[str, Any], gold_satir: dict[str, Any],
                      meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Tek belge → tüm metrik sonuçları + başarısızlık nedenleri + bileşik karar."""
    b, meta = gold_satir["beklenen"], meta or {}
    md = state.get("yazi_taslak_md") or ""
    birim, birim_kaynak = birim_tahmini(state)
    r: dict[str, Any] = {
        "id": gold_satir["id"], "kurum_tipi": b.get("kurum_tipi"), "yetki_beklenen": b["yetki"],
        "cok_talepli": b["talep_sayisi"] > 1, "hata": meta.get("hata"),
        "sure_s": meta.get("sure_s"), "llm": meta.get("llm", {}),
        "tur": tur_degerlendir(state, b),
        "muhatap": {"tahmin": (state.get("muhatap_kurum") or {}).get("ad"),
                    "dogru": icerir_herhangi((state.get("muhatap_kurum") or {}).get("ad"),
                                             b["muhatap_kabul"])},
        "birim": {"tahmin": birim, "kaynak": birim_kaynak, "durum": state.get("durum"),
                  "dogru": birim_dogru(birim, b["birim_kabul_edilebilir"])},
        "yetki": yetki_degerlendir(state, b), "talep": talep_degerlendir(state, b),
        "konu": konu_degerlendir(taslak_alani(md, "konu"), gold_satir["metin"], b["konu_anahtar"]),
        "ilgi": ilgi_degerlendir(taslak_alani(md, "ilgi"), b, taslak_muhatabi(md)),
        "antet": antet_degerlendir(md, b),
        "mevzuat": mevzuat_degerlendir(state, b), "eksik": eksik_degerlendir(state, b),
        "pii_sizinti": pii_tara(state), "node_ms": state.get("node_sureleri_ms") or {},
    }
    r["basarisizliklar"] = basarisizlik_listesi(r)
    r["kurumda_kullanilabilir"] = not any(
        n.split(":")[0] in BILESIK_KRITERLER for n in r["basarisizliklar"])
    return r


BILESIK_KRITERLER = ("hata", "tur", "birim", "yetki", "talep", "konu", "ilgi", "antet", "pii")


def basarisizlik_listesi(r: dict[str, Any]) -> list[str]:
    """Okunabilir başarısızlık dökümü: '<kriter>: ayrıntı'."""
    f: list[str] = []
    if r.get("hata"):
        f.append(f"hata: {r['hata']}")
    if not r["tur"].get("bilesik", r["tur"]["operasyonel"]):
        f.append(f"tur: tahmin={r['tur']['tahmin']}")
    if not r["birim"]["dogru"]:
        f.append(f"birim: '{r['birim']['tahmin']}' ({r['birim']['kaynak']}, durum={r['birim']['durum']})")
    if not r["yetki"]["gecti"]:
        f.append(_yetki_nedeni(r["yetki"]))
    t = r["talep"]
    if r["cok_talepli"] and t["decompose_bulunan"] < t["gold_sayi"]:
        f.append(f"talep: ayrıştırıcı {t['decompose_bulunan']}/{t['gold_sayi']}")
    # Tek talepte ifade serbesttir ("işyerinin denetlenmesi" = gürültü talebi) → yalnız BOŞ
    # liste başarısızlıktır; çok talepte her talebin ayrı bulunması aranır.
    if r["cok_talepli"] and t["cikar_bulunan"] < t["gold_sayi"]:
        f.append(f"talep_cikar: bilgi_unsurlari {t['cikar_bulunan']}/{t['gold_sayi']}")
    elif not r["cok_talepli"] and t["cikar_sayi"] == 0:
        f.append("talep_cikar: bilgi_unsurlari.talepler boş")
    if not r["konu"]["gecti"]:
        f.append(f"konu: {','.join(r['konu']['neden'])} → {str(r['konu'].get('konu'))[:90]}")
    if not r["ilgi"]["gecti"]:
        f.append(f"ilgi: {','.join(r['ilgi']['neden'])} → {str(r['ilgi'].get('ilgi'))[:90]}")
    if not r["antet"]["gecti"]:
        f.append(f"antet: '{r['antet']['antet'][:80]}'")
    if not r["mevzuat"]["hit"]:
        f.append(f"mevzuat: beklenen yok, top={r['mevzuat']['top']}")
    if r["mevzuat"]["yasak"]:
        f.append(f"mevzuat_yasak: {r['mevzuat']['yasak']}")
    if r["pii_sizinti"]:
        f.append(f"pii: {r['pii_sizinti']}")
    if r["llm"].get("kesik"):
        f.append(f"json_kesik: {r['llm']['kesik']} çağrı")
    return f


def _yetki_nedeni(y: dict[str, Any]) -> str:
    if y["beklenen"] == "YARGI":
        return f"yetki: yargı konusu devredildi → {y['yetkili_tahmin']}"
    if y["beklenen"] == "DISARIDA":
        return "yetki: DISARIDA tespit edilmedi" + (" (yalnız metinde anıldı)"
                                                    if y.get("metinsel") else "")
    return f"yetki: yanlış alarm → {y['yetkili_tahmin']}"


# ============================================================ toplama
def oran(k: int, n: int) -> dict[str, Any]:
    lo, hi = wilson_interval(k, n)
    return {"k": k, "n": n, "oran": round(k / n, 4) if n else None,
            "ci95": [round(lo, 3), round(hi, 3)]}


def _yuzdelik(v: list[float], q: float) -> float | None:
    if not v:
        return None
    s = sorted(v)
    return round(s[min(len(s) - 1, max(0, round(q * (len(s) - 1))))], 2)


def topla(kayitlar: list[dict[str, Any]]) -> dict[str, Any]:
    """Belge kayıtları → metrik sözlüğü (her oran Wilson CI'lı)."""
    n = len(kayitlar)
    dis = [r for r in kayitlar if r["yetki_beklenen"] == "DISARIDA"]
    ic = [r for r in kayitlar if r["yetki_beklenen"] == "ICERIDE"]
    yargi = [r for r in kayitlar if r["yetki_beklenen"] == "YARGI"]
    cok = [r for r in kayitlar if r["cok_talepli"]]
    alt_birim = [x for r in cok for x in r["talep"]["alt_birim_dogru"]]
    mev_top = sum(len(r["mevzuat"]["top"]) for r in kayitlar)
    mev_ilgili = sum(r["mevzuat"]["ilgili_sayi"] for r in kayitlar)
    tp = sum(r["eksik"]["tp"] for r in kayitlar)
    fp = sum(r["eksik"]["fp"] for r in kayitlar)
    fn = sum(r["eksik"]["fn"] for r in kayitlar)
    sureler = [r["sure_s"] for r in kayitlar if r.get("sure_s") is not None and not r.get("hata")]
    return {
        "kurumda_kullanilabilir": oran(sum(r["kurumda_kullanilabilir"] for r in kayitlar), n),
        "tur_dogruluk": oran(sum(r["tur"]["kesin"] for r in kayitlar), n),
        "tur_dogruluk_kabul": oran(sum(r["tur"]["kabul"] for r in kayitlar), n),
        "tur_dogruluk_operasyonel": oran(sum(r["tur"]["operasyonel"] for r in kayitlar), n),
        "muhatap_dogruluk": oran(sum(r["muhatap"]["dogru"] for r in kayitlar), n),
        "birim_dogruluk": oran(sum(r["birim"]["dogru"] for r in kayitlar), n),
        "birim_dogruluk_alt_talep": oran(sum(x is True for x in alt_birim), len(alt_birim)),
        "routing_fallback": oran(sum(r["birim"]["durum"] == "fallback_onerisi" for r in kayitlar), n),
        "yetki_tespit_yapisal": oran(sum(r["yetki"]["yapisal"] for r in dis), len(dis)),
        "yetki_tespit_metinsel": oran(sum(r["yetki"]["metinsel"] for r in dis), len(dis)),
        "yetki_yanlis_alarm": oran(sum(r["yetki"]["yanlis_alarm"] for r in ic), len(ic)),
        "yetki_yargi_devirsiz": oran(sum(r["yetki"]["gecti"] for r in yargi), len(yargi)),
        "talep_recall_decompose": oran(sum(r["talep"]["decompose_bulunan"] for r in cok),
                                       sum(r["talep"]["gold_sayi"] for r in cok)),
        "talep_recall_cikar": oran(sum(r["talep"]["cikar_bulunan"] for r in cok),
                                   sum(r["talep"]["gold_sayi"] for r in cok)),
        "talep_sayisi_dogru": oran(sum(r["talep"]["sayi_dogru"] for r in kayitlar), n),
        "talep_ajan_tutarliligi": oran(sum(r["talep"]["tutarli"] for r in cok), len(cok)),
        "konu_kalitesi": oran(sum(r["konu"]["gecti"] for r in kayitlar), n),
        "ilgi_dogrulugu": oran(sum(r["ilgi"]["gecti"] for r in kayitlar), n),
        "antet_dogrulugu": oran(sum(r["antet"]["gecti"] for r in kayitlar), n),
        "antet_birim_yer_tutucu": oran(sum(bool(r["antet"].get("birim_yer_tutucu"))
                                           for r in kayitlar), n),
        "mevzuat_beklenen_hit": oran(sum(r["mevzuat"]["hit"] for r in kayitlar), n),
        "mevzuat_precision_at_3": oran(mev_ilgili, mev_top),
        "alakasiz_mevzuat_orani": oran(mev_top - mev_ilgili, mev_top),
        "yasak_mevzuat_belge": oran(sum(bool(r["mevzuat"]["yasak"]) for r in kayitlar), n),
        "eksik_tam_eslesme": oran(sum(r["eksik"]["tam"] for r in kayitlar), n),
        "eksik_precision": oran(tp, tp + fp), "eksik_recall": oran(tp, tp + fn),
        "pii_sizinti_belge": oran(sum(bool(r["pii_sizinti"]) for r in kayitlar), n),
        "json_kesilme_belge": oran(sum(bool(r["llm"].get("kesik")) for r in kayitlar), n),
        "json_kesilme_cagri": sum(r["llm"].get("kesik", 0) for r in kayitlar),
        "json_kesilme_butce": _butce_histogrami(kayitlar),
        "llm_cagri_toplam": sum(r["llm"].get("cagri", 0) for r in kayitlar),
        "hata_belge": sum(bool(r.get("hata")) for r in kayitlar),
        "sure_p50_s": _yuzdelik(sureler, 0.5), "sure_p95_s": _yuzdelik(sureler, 0.95),
        "node_ortalama_ms": _node_ortalama(kayitlar),
    }


def _butce_histogrami(kayitlar: list[dict[str, Any]]) -> dict[str, int]:
    """Kesilen çağrıların max_tokens bütçesi → adet (bütçe − LLM_DUSUNME_MARJI = node bütçesi)."""
    toplam: dict[str, int] = {}
    for r in kayitlar:
        for butce, adet in (r["llm"].get("kesik_butce") or {}).items():
            toplam[butce] = toplam.get(butce, 0) + adet
    return dict(sorted(toplam.items(), key=lambda kv: -kv[1]))


def _node_ortalama(kayitlar: list[dict[str, Any]]) -> dict[str, int]:
    toplam: dict[str, list[int]] = {}
    for r in kayitlar:
        for k, v in (r.get("node_ms") or {}).items():
            toplam.setdefault(k, []).append(int(v))
    return dict(sorted(((k, int(statistics.mean(v))) for k, v in toplam.items()),
                       key=lambda kv: -kv[1]))


# ============================================================ koşum
_LLM_SAYAC: contextvars.ContextVar[dict[str, int] | None] = contextvars.ContextVar(
    "e2e_llm_sayac", default=None)


def llm_sayacini_kur() -> None:
    """OpenAIClient.chat'i sar: belge başına çağrı / kesik (finish_reason=length) / token say.

    ContextVar belge görevine bağlıdır; LangGraph'ın açtığı alt görevler bağlamı kopyalar,
    sözlük nesnesi paylaşılır → eşzamanlı belgeler birbirine karışmaz.
    """
    from agents.llm import OpenAIClient
    if getattr(OpenAIClient.chat, "_e2e_sarili", False):
        return
    orijinal = OpenAIClient.chat

    async def sarili(self, *a, **kw):  # type: ignore[no-untyped-def]
        resp = await orijinal(self, *a, **kw)
        sayac = _LLM_SAYAC.get()
        if sayac is not None:
            kesik = getattr(resp, "finish_reason", "stop") == "length"
            sayac["cagri"] += 1
            sayac["kesik"] += int(kesik)
            sayac["tokens_out"] += int(getattr(resp, "tokens_out", 0) or 0)
            if kesik:  # bütçe = node max_tokens + düşünme marjı → kesilen node'u gösterir
                butce = str(kw.get("max_tokens", "?"))
                sayac["kesik_butce"][butce] = sayac["kesik_butce"].get(butce, 0) + 1
        return resp

    sarili._e2e_sarili = True  # type: ignore[attr-defined]
    OpenAIClient.chat = sarili  # type: ignore[method-assign]


# ============================================================ döküm (insan incelemesi)
DOKUM_ALANLARI = (
    "evrak_turu", "yazi_turu", "yonlendirme", "gosterim_birimi", "alt_talepler",
    "mevzuat_onerileri", "mevzuat_onerileri_corrected", "mevzuat_bulunamadi",
    "yazi_taslak_md", "sla_metadata", "bilgilendirme", "ozet", "eksik_alanlar",
    "eksik_bilgi_notlari", "durum")


def _llm_iz_ozeti(izler: list[dict[str, Any]]) -> dict[str, Any]:
    """llm_izleri → node başına çağrı/kesik/yedek sayısı (içerik YOK)."""
    ozet: dict[str, dict[str, int]] = {}
    for iz in izler or []:
        if not isinstance(iz, dict):
            continue
        d = ozet.setdefault(str(iz.get("node") or "?"), {"cagri": 0, "kesik": 0, "yedek": 0})
        d["cagri"] += 1
        d["kesik"] += int(bool(iz.get("kesik")))
        d["yedek"] += int(bool(iz.get("yedege_dustu")))
    return {"toplam": sum(v["cagri"] for v in ozet.values()), "node": ozet}


def dokum_satiri(state: dict[str, Any], r: dict[str, Any]) -> dict[str, Any]:
    """Tek belge için memurun göreceği çıktılar + değerlendirme özeti (JSON-serileşebilir)."""
    bu = state.get("bilgi_unsurlari") or {}
    risk = state.get("risk_metadata") or {}
    satir: dict[str, Any] = {"id": r["id"], "kurumda_kullanilabilir": r["kurumda_kullanilabilir"],
                             "basarisizliklar": r["basarisizliklar"], "hata": r.get("hata")}
    satir.update({k: state.get(k) for k in DOKUM_ALANLARI})
    satir["konu"] = bu.get("konu")
    satir["talep_kumesi"] = bu.get("talep_kumesi")
    satir["gelen_evrak"] = bu.get("gelen_evrak")
    satir["yazi_paketi"] = [
        {k: p.get(k) for k in ("rol", "yazi_turu", "muhatap", "birim", "konu", "talep_ids",
                               "yazi_taslak_md")}
        for p in (state.get("yazi_paketi") or []) if isinstance(p, dict)]
    satir["risk"] = {"bant": risk.get("bant"), "gerekceler": risk.get("gerekceler"),
                     "aciklama": risk.get("aciklama")}
    satir["llm_izleri"] = _llm_iz_ozeti(state.get("llm_izleri") or [])
    return satir


def dokum_yaz(yol: Path, satirlar: list[dict[str, Any]]) -> Path:
    """Döküm satırlarını id sırasıyla JSONL yazar."""
    yol.parent.mkdir(parents=True, exist_ok=True)
    with yol.open("w", encoding="utf-8") as f:
        for s in sorted(satirlar, key=lambda x: x["id"]):
            f.write(json.dumps(s, ensure_ascii=False, default=str) + "\n")
    return yol


async def _belge_kos(graph: Any, satir: dict[str, Any], sem: asyncio.Semaphore,
                     timeout_s: float, dokum: list[dict[str, Any]] | None = None
                     ) -> dict[str, Any]:
    from agents.state import make_initial_state
    async with sem:
        sayac: dict[str, Any] = {"cagri": 0, "kesik": 0, "tokens_out": 0, "kesik_butce": {}}
        _LLM_SAYAC.set(sayac)
        t0 = time.perf_counter()
        hata, state = None, {}
        try:
            state = await asyncio.wait_for(graph.ainvoke(make_initial_state(satir["metin"])),
                                           timeout=timeout_s)
        except TimeoutError:
            hata = f"timeout>{timeout_s:.0f}s"
        except Exception as exc:
            hata = f"{type(exc).__name__}: {str(exc)[:160]}"
        meta = {"sure_s": round(time.perf_counter() - t0, 2), "hata": hata, "llm": sayac}
        r = belge_degerlendir(state or {}, satir, meta)
        if dokum is not None:
            dokum.append(dokum_satiri(state or {}, r))
        durum = "OK " if r["kurumda_kullanilabilir"] else "ERR"
        print(f"  [{durum}] {satir['id']:<34} {meta['sure_s']:>6}s  "
              f"llm={sayac['cagri']} kesik={sayac['kesik']}  {len(r['basarisizliklar'])} sorun",
              flush=True)
        return r


async def kos(satirlar: list[dict[str, Any]], eszamanlilik: int,
              timeout_s: float, dokum: list[dict[str, Any]] | None = None
              ) -> list[dict[str, Any]]:
    from agents.graph import build_graph
    llm_sayacini_kur()
    graph = build_graph()
    sem = asyncio.Semaphore(eszamanlilik)
    return list(await asyncio.gather(*(_belge_kos(graph, s, sem, timeout_s, dokum) for s in satirlar)))


def git_damgasi() -> dict[str, Any]:
    def _git(*args: str) -> str:
        try:
            return subprocess.run(["git", *args], cwd=_KOK, capture_output=True, text=True,
                                  timeout=10, check=False).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""
    return {"sha": _git("rev-parse", "HEAD") or None,
            "kirli": bool(_git("status", "--porcelain", "--", "backend"))}


def gold_yukle(path: Path, ids: list[str] | None = None, limit: int | None = None) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"Gold yok: {path}")
    satirlar = [json.loads(s) for s in path.read_text(encoding="utf-8").splitlines() if s.strip()]
    if ids:
        satirlar = [s for s in satirlar if s["id"] in set(ids)]
    return satirlar[:limit] if limit else satirlar


def rapor_yaz(etiket: str, gold: Path, kayitlar: list[dict[str, Any]], metrik: dict[str, Any],
              sure_toplam: float, eszamanlilik: int) -> Path:
    mode = os.getenv("LLM_MODE", "mock")
    artefakt = {
        "etiket": etiket, "tarih": datetime.datetime.now(tz=datetime.UTC).isoformat(),
        "git": git_damgasi(), "gold": gold.name, "n": len(kayitlar),
        "llm_mode": mode, "model": os.getenv("OPENAI_LLM_MODEL", "—") if mode == "openai" else "—",
        "eszamanlilik": eszamanlilik, "sure_toplam_s": round(sure_toplam, 1),
        "kurallar": {"konu_azami_kelime": KONU_AZAMI_KELIME, "ham_kopya_ngram": HAM_KOPYA_NGRAM,
                     "mevzuat_k": MEVZUAT_K, "bilesik": list(BILESIK_KRITERLER)},
        "metrikler": metrik,
        "basarisizliklar": {r["id"]: r["basarisizliklar"] for r in kayitlar if r["basarisizliklar"]},
        "belgeler": kayitlar,
    }
    RUNS.mkdir(parents=True, exist_ok=True)
    out = RUNS / f"e2e_gercek_{re.sub(r'[^A-Za-z0-9_.-]', '_', etiket)}.json"
    out.write_text(json.dumps(artefakt, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return out


def ozet_yazdir(metrik: dict[str, Any]) -> None:
    print("\n" + "=" * 78)
    for ad, v in metrik.items():
        if isinstance(v, dict) and "oran" in v:
            o = "—" if v["oran"] is None else f"{v['oran']:.3f}"
            print(f"  {ad:<30} {o:>6}  ({v['k']}/{v['n']})  CI95 {v['ci95']}")
        elif not isinstance(v, dict):
            print(f"  {ad:<30} {v}")
    print("  json_kesilme_butce:", metrik["json_kesilme_butce"])
    print("  node_ortalama_ms (ilk 6):", dict(list(metrik["node_ortalama_ms"].items())[:6]))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Gerçekçi altın uçtan-uca değerlendirme (gerçek graf)")
    ap.add_argument("--etiket", required=True, help="koşum etiketi → runs/e2e_gercek_<etiket>.json")
    ap.add_argument("--gold", type=str, default=str(GOLD))
    ap.add_argument("--eszamanlilik", type=int, default=VARSAYILAN_ESZAMANLILIK)
    ap.add_argument("--timeout", type=float, default=VARSAYILAN_TIMEOUT_S, help="belge başına sn")
    ap.add_argument("--id", action="append", dest="ids", help="yalnız bu id (tekrarlanabilir)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dokum", type=str, default=None,
                    help="memur çıktılarının JSONL dökümü (repo DIŞINA yazın)")
    ap.add_argument("--env", type=str, default=str(_KOK / ".env"), help="yüklenecek .env")
    a = ap.parse_args(argv)
    with contextlib.suppress(ImportError):
        from dotenv import load_dotenv
        load_dotenv(a.env)
    gold = Path(a.gold)
    satirlar = gold_yukle(gold, a.ids, a.limit)
    print(f"e2e_gercek: {len(satirlar)} belge, eşzamanlılık={a.eszamanlilik}, "
          f"LLM_MODE={os.getenv('LLM_MODE', 'mock')}")
    t0 = time.perf_counter()
    dokum: list[dict[str, Any]] | None = [] if a.dokum else None
    kayitlar = asyncio.run(kos(satirlar, a.eszamanlilik, a.timeout, dokum))
    metrik = topla(kayitlar)
    ozet_yazdir(metrik)
    out = rapor_yaz(a.etiket, gold, kayitlar, metrik, time.perf_counter() - t0, a.eszamanlilik)
    print(f"\n  Artefakt: {out}")
    if a.dokum and dokum is not None:
        print(f"  Döküm: {dokum_yaz(Path(a.dokum), dokum)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
