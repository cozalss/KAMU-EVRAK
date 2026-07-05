"""EvrakState → YaziContext köprüsü + resmî üslupta metin gövdesi üretimi.

`yazi_taslak_node` ince kalsın diye (CLAUDE.md: fonksiyon <50 satır) bağlam
kurulumu ve gövde üretimi buraya taşındı.

Metin gövdesi:
  - mock/anahtarsız: deterministik şablon-tabanlı (LLM YOK) — test/CI güvenli.
  - openai/llamacpp: get_llm ile resmî üslupta (3. tekil/edilgen, kısa-açık;
    Yön. 2646 m.5/üslup). Çıkarılan olgular DIŞINDA kurum/tarih/sayı UYDURMAZ.

SIFIR UYDURMA: gövde yalnız evraktan çıkarılan unsurlara (konu/talep/ilgi)
dayanır; somut veri yoksa nötr çerçeve cümlesi kurulur (sahte sayı/kişi yok).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

import structlog

from agents.config import YAZI_TURU_TR
from yazi.models import YaziContext
from yazi.template_registry import default_kapanis, resolve_yazi_turu

log = structlog.get_logger()

# Gövde üretimi için LLM system prompt (Yön. 2646 m.5 resmî üslup).
_BODY_SYSTEM = (
    "Sen bir kamu kurumu yazı işleri uzmanısın. Resmî Yazışmalarda Uygulanacak "
    "Usul ve Esaslar Hakkında Yönetmelik (CB 2646/2020) üslubuna uygun, KISA "
    "(2-4 cümle) bir yazı GÖVDESİ yaz: 3. tekil/edilgen kip, açık ve resmî dil, "
    "argo/kısaltma yok. SADECE verilen bilgilere dayan; kurum adı, kişi adı, "
    "tarih, sayı, madde no UYDURMA. Yalnız gövde metnini döndür (başlık/imza yazma)."
)


def _olcu_meta(unsurlar: dict[str, Any]) -> dict[str, str]:
    """olur türü için teklif/onay alanlarını unsurlardan derle (eksik → demo varsayılanı)."""
    return {
        "teklif_eden": str(unsurlar.get("teklif_eden", "") or ""),
        "talep": str(unsurlar.get("olur_talep", "") or ""),
    }


def _fallback_body(yazi_turu: str, konu: str, has_ilgi: bool) -> str:
    """LLM yokken deterministik, uydurmasız gövde (test/CI).

    Yön. 2646 m.16 — giriş/gelişme/sonuç akışı: konuya bağlı resmî-üslup paragraf
    kurar (yalnız çıkarılan konuya değinir; somut sayı/kişi/karar UYDURMAZ).
    Yazı türüne göre kip farklılaşır → tür-uygun anlamlı metin (sadece placeholder
    değil). cevabi_yazi her zaman İlgi atfıyla başlar; olur teklif kipinde.
    """
    konu_ifade = f"\"{konu}\"" if konu else "ilgili"
    if yazi_turu == "cevabi_yazi":
        return (
            f"İlgi yazıda belirtilen {konu_ifade} konusu kurumumuzca incelenmiştir. "
            "Söz konusu talebe ilişkin gerekli değerlendirme yapılmış olup sonucu "
            "aşağıda sunulmuştur."
        )
    if yazi_turu == "olur":
        return (
            f"{konu_ifade} konusunda yürütülecek iş ve işlemlerin mevzuata uygun "
            "şekilde tamamlanabilmesi için gerekli onayın verilmesi hususunda; "
            "Aşağıda arz edilen teklifin değerlendirilmesi uygun mütalaa edilmektedir."
        )
    if yazi_turu == "bilgilendirme":
        return (
            f"{konu_ifade} konusuna ilişkin olarak yürütülen iş ve işlemler hakkında "
            "ilgili birim ve kişilerin bilgilendirilmesi gereği duyulmuştur. Konuya "
            "ilişkin açıklamalar aşağıda sunulmuştur."
        )
    if yazi_turu == "muzekkere":
        return (
            f"{konu_ifade} konusuna ilişkin bilgi/belge veya gerekli işlemin yapılması "
            "hususunda ilgili makamdan gereğinin yerine getirilmesi rica olunur."
        )
    if yazi_turu == "gorus_mutalaa":
        return (
            f"{konu_ifade} konusuna ilişkin talep edilen hukuki değerlendirme incelenmiş "
            "olup değerlendirme sonucu aşağıda sunulmuştur."
        )
    # üst yazı (gönderen makam → muhatap makam)
    if has_ilgi:
        return (
            f"İlgi yazı ile bildirilen {konu_ifade} konusuna ilişkin gerekli iş ve "
            "işlemlerin yapılması hususunda gereğini arz/rica ederim."
        )
    return (
        f"{konu_ifade} konusuna ilişkin gerekli iş ve işlemlerin yürütülmesini "
        "teminen işbu yazı tanzim edilmiştir."
    )


async def build_body(
    yazi_turu: str, unsurlar: dict[str, Any], evrak_text: str,
) -> str:
    """Resmî üslupta gövde metni üret (LLM varsa get_llm; yoksa deterministik)."""
    konu = str(unsurlar.get("konu", "") or "")
    has_ilgi = bool(unsurlar.get("sayi") or unsurlar.get("tarih"))
    try:
        from agents.llm import ChatMessage, MockLLM, get_llm

        llm = get_llm()
        if isinstance(llm, MockLLM):  # mock → deterministik (mock metni resmî değil)
            return _fallback_body(yazi_turu, konu, has_ilgi)
        prompt = (
            f"Yazı türü: {YAZI_TURU_TR.get(yazi_turu, yazi_turu)}\n"
            f"Konu: {konu or '(belirtilmemiş)'}\n"
            f"Kaynak evrak (özet): {evrak_text[:1200]}"
        )
        resp = await llm.chat(
            [ChatMessage(role="system", content=_BODY_SYSTEM),
             ChatMessage(role="user", content=prompt)],
            temperature=0.2, max_tokens=320,
        )
        body = (resp.content or "").strip()
        return body or _fallback_body(yazi_turu, konu, has_ilgi)
    except Exception as exc:  # LLM hata → deterministik fallback (node patlamaz)
        log.warning("yazi_body_llm_failed", err=str(exc))
        return _fallback_body(yazi_turu, konu, has_ilgi)


def _muhatap(unsurlar: dict[str, Any]) -> str:
    """Cevabi yazıda muhatap = gelen belgenin GÖNDEREN'i (Yön. m.14).

    Gelen dilekçe/başvuruyu yazan kişi/kurum, cevabımızın muhatabıdır. Gerçek kişi
    → "Sayın <Ad Soyad>"; tüzel kişi/kurum → adı aynen. Eksikse boş (demo varsayılanı).
    Parantezli sıfat ('(İlgili)', '(Vatandaş)') atılır — resmî hitapta yer almaz.
    """
    gonderen = str(unsurlar.get("gonderen", "") or "").strip()
    if gonderen:
        gonderen = re.sub(r"\s*\([^)]*\)\s*$", "", gonderen).strip()
        if gonderen:
            return f"Sayın {gonderen}"
    kurum = str(unsurlar.get("kurum", "") or "").strip()
    return kurum  # boşsa YaziContext demo varsayılanı kullanır


def _ilgi_satirlari(unsurlar: dict[str, Any]) -> tuple[str, ...]:
    """İlgi satırlarını gelen belgenin tarih+sayısından kur (Yön. m.15).

    Hem tarih hem sayı varsa tam satır yazılır. Biri eksikse Jinja placeholder
    göstermek yerine doğal ve nötr bir atıf kurulur; bilgi uydurulmaz. Tek atıf
    için "a)" etiketi kullanılmaz (sade tek-satır).
    """
    tarih = str(unsurlar.get("tarih", "") or "").strip()
    sayi = str(unsurlar.get("sayi", "") or "").strip()
    if tarih and sayi:
        return (f"{tarih} tarihli ve {sayi} sayılı yazınız.",)
    if tarih:
        return (f"{tarih} tarihli başvurunuz.",)
    if sayi:
        return (f"{sayi} sayılı başvurunuz.",)
    return ("Başvurunuz.",)


def build_context(
    yazi_turu: str, unsurlar: dict[str, Any], metin: str,
    *, muhatap_override: str | None = None,
) -> YaziContext:
    """EvrakState bilgi_unsurları + üretilen gövde → YaziContext (demo-safe).

    Çıkarılan unsurlardan azami otomatik doldurma (Yön. 2646): konu, muhatap
    (gönderen→cevap muhatabı), ilgi (gelen belge tarih/sayı). Bilinmeyen alanlar
    (idare/birim/imza/OUR sayısı) nötr taslak değerlerle gösterilir; uydurma yok.

    muhatap_override: üst yazıda (kurum-içi iletim) muhatap gelen belgenin GÖNDEREN'i
    değil HEDEF BİRİM'dir (Yön. m.14) — route_birim/decompose'un bulduğu birim adı
    verilirse gönderen yerine bu kullanılır. olur türünde hiçbir zaman uygulanmaz.
    """
    turu = resolve_yazi_turu(yazi_turu)
    # cevabi/üst yazı + müzekkere/görüş de İlgi atfı kurar (şablonları İlgi bloğu içerir);
    # olur'da ilgi yoktur, bilgilendirme nötr (dağıtım yerlerine, tekil ilgi taşımaz).
    ilgi = (_ilgi_satirlari(unsurlar)
            if turu in ("cevabi_yazi", "ust_yazi", "muzekkere", "gorus_mutalaa") else ())
    if turu == "olur":
        muhatap = ""  # olur'da muhatap hiçbir zaman render edilmez (Yön. m.20) — override dahil
    elif muhatap_override:
        muhatap = muhatap_override
    elif turu in ("muzekkere", "gorus_mutalaa"):
        # _muhatap() vatandaşın adını döner (Yön. m.14 cevabi-yazı varsayımı) — müzekkere/
        # görüş kurum-içi/hukuki makama gider; hedef makam bilinmiyorsa UYDURULMAZ, şablonun
        # kendi nötr varsayılanı (MAKAMA / placeholder) devreye girer.
        muhatap = ""
    else:
        muhatap = _muhatap(unsurlar)
    return YaziContext(
        yazi_turu=turu,
        tarih=date.today().strftime("%d.%m.%Y"),
        # m.13: konunun sonuna nokta konulmaz → çıkarılan konudaki kuyruk noktası atılır.
        konu=str(unsurlar.get("konu", "") or "").strip().rstrip("."),
        metin=metin,
        muhatap=muhatap,
        ilgi_tarih=str(unsurlar.get("tarih", "") or ""),
        ilgi_sayi=str(unsurlar.get("sayi", "") or ""),
        ilgi_satirlari=ilgi,
        kapanis=default_kapanis(turu),
        olur_alanlari=_olcu_meta(unsurlar) if turu == "olur" else {},
    )


async def build_alt_talep_taslaklari(
    alt_talepler: list[dict[str, Any]], unsurlar: dict[str, Any], evrak_text: str,
) -> list[dict[str, Any]]:
    """Çok-konulu evrakta HER alt-talep için ayrı üst yazı taslağı (kuruma yönlendirme).

    Tek ortak cevabi_yazi vatandaşa gitmez; her alt-talep KENDİ hedef birimine
    (Yön. m.14) muhatap alan, yalnız kendi özetine odaklanan bir üst yazı alır.
    < 2 alt-talep (tek-konulu) → değişmeden döner (ek LLM çağrısı/maliyet yok).
    """
    if len(alt_talepler) < 2:
        return list(alt_talepler)
    from yazi.renderer import render_yazi

    out: list[dict[str, Any]] = []
    for item in alt_talepler:
        ozet = str(item.get("ozet", "") or "")
        muhatap = str(item.get("birim_tr", "") or "") or "İlgili Birime"
        child_unsurlar = {**unsurlar, "konu": ozet}
        metin = await build_body("ust_yazi", child_unsurlar, ozet)
        ctx = build_context("ust_yazi", child_unsurlar, metin, muhatap_override=muhatap)
        result = render_yazi(ctx)
        out.append({
            **item, "yazi_turu": "ust_yazi",
            "yazi_taslak_md": result.metin, "format_uyumlu": result.format_uyumlu,
        })
    return out


__all__ = ("build_alt_talep_taslaklari", "build_body", "build_context")
