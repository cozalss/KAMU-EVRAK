"""Dinamik yazı planı — LLM belgeyi anlayıp {yazı türü, muhatap, gerekçe} önerir.

Statik EVRAK_TO_YAZI tablosu tek başına duruma uyum sağlayamıyor: aynı türden iki
evrak farklı yazı isteyebilir (ör. bir üst yazı bilgi İSTİYORSA cevabi yazı, yalnız
bilgi VERİYORSA bilgilendirme/dosyalama gerekir). Bu modül belge İÇERİĞİNE göre
karar verir; tablo deterministik fallback olarak kalır (mock/anahtarsız/hata → None,
çağıran statik yola döner — CI yeşil, davranış asla belirsizleşmez).

GÜVENLİK KAPILARI (uydurma imkânsız):
  - yazi_turu KAPALI KÜME: YAZI_TURLERI dışındaysa plan tümden reddedilir.
  - muhatap GROUNDED: yalnız (a) belgede birebir geçen ad/kurum, (b) hedef birimin
    resmî adı, (c) boş (varsayılan muhatap mantığı) kabul edilir. LLM'in uydurduğu
    bir muhatap taslağa ASLA giremez — geçersizse muhatap düşürülür, tür korunur.
  - gerekce yalnız kullanıcıya gösterilen NOT'tur; karar verisi değildir.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import YAZI_TURLERI, YAZI_TURU_TR, birim_tr
from agents.nodes._llm_extract import llm_json, real_llm
from api.pii import mask_for_llm
from core.text import tr_lower

log = structlog.get_logger()

# Tür seçim rehberi — kapalı kümenin her üyesi "ne zaman" açıklamasıyla verilir;
# LLM serbest metin değil bu kümeden KOD seçer (decompose/SDP kapalı-küme deseni).
_TUR_REHBER = (
    "- ust_yazi: evrak KURUM İÇİNDE başka bir birime İLETİLECEKSE (fatura→mali, "
    "icra/dava/tebligat→hukuk gibi); muhatap = hedef birim, gönderen DEĞİL\n"
    "- cevabi_yazi: gönderene KARŞILIK verilecekse (vatandaş dilekçesi, bilgi/belge "
    "isteyen kurum yazısı, müzekkere celbi)\n"
    "- bilgilendirme: talep yok, yalnız bilgi verme/duyuru gerekiyorsa (4982 bilgi "
    "edinme cevabı, CİMER bilgilendirmesi)\n"
    "- olur: makam ONAYI gerektiren iş varsa (soruşturma açılması, düzenleyici işlem)\n"
    "- muzekkere: BAŞKA makamdan bilgi/belge/kayıt İSTENECEKSE\n"
    "- gorus_mutalaa: hukuki görüş/mütalaa YAZILACAKSA (görüş talebine yanıt)"
)

_PLAN_SYSTEM = (
    "Sen bir kamu kurumu yazı işleri uzmanısın. Gelen evrakı analiz edip kurumun "
    "buna karşılık ÜRETECEĞİ resmî yazının planını çıkar. Yazı türünü YALNIZ verilen "
    "kapalı listeden seç. Muhatap yalnız (a) evrakta birebir geçen kişi/kurum adı, "
    "(b) verilen hedef birim adı ya da (c) boş olabilir — evrakta olmayan hiçbir ad "
    "UYDURMA. Kararsızsan güvenli seçimi yap ve gerekçende belirt."
)


def _muhatap_grounded(muhatap: str, evrak_text: str, hedef_birim: str) -> bool:
    """Muhatap belgeye/birime dayanıyor mu? ('Sayın ' öneki toleranslı, TR-casefold)."""
    aday = tr_lower(muhatap.removeprefix("Sayın ").strip())
    if not aday:
        return False
    if aday == tr_lower(birim_tr(hedef_birim)):
        return True
    return aday in tr_lower(evrak_text)


async def yazi_plani(
    evrak_turu: str, unsurlar: dict[str, Any], evrak_text: str, hedef_birim: str,
) -> dict[str, str] | None:
    """Belge içeriğinden yazı planı üret: {yazi_turu, muhatap, gerekce} | None.

    None → çağıran (yazi_taslak_node) statik EVRAK_TO_YAZI yoluna döner. Kapalı-küme
    + grounded-muhatap kapıları geçilemezse kısmen düşürülür (tür geçerli + muhatap
    geçersiz → muhatap boşaltılır) ya da tümden reddedilir (tür geçersiz).
    """
    if real_llm() is None:  # mock/anahtarsız → statik yol (CI deterministik)
        return None
    konu = str(unsurlar.get("konu", "") or "")
    obj = await llm_json(
        system=_PLAN_SYSTEM,
        user=(
            f"EVRAK TÜRÜ: {evrak_turu}\nKONU: {konu or '(belirtilmemiş)'}\n"
            f"HAVALE EDİLEN BİRİM: {birim_tr(hedef_birim) if hedef_birim else '(yok)'}\n\n"
            f"YAZI TÜRÜ SEÇENEKLERİ:\n{_TUR_REHBER}\n\n"
            f"EVRAK METNİ:\n{mask_for_llm(evrak_text[:1500])}\n\n"
            'Yalnız şu JSON: {"yazi_turu":"<kod>","muhatap":"<ad ya da boş>",'
            '"gerekce":"<tek cümle Türkçe: neden bu tür ve bu muhatap>"}'
        ),
        max_tokens=200,
    )
    if not obj:
        return None
    tur = str(obj.get("yazi_turu", "") or "").strip()
    if tur not in YAZI_TURLERI:  # kapalı küme dışı → plan tümden geçersiz
        log.warning("yazi_plan_gecersiz_tur", tur=tur)
        return None
    muhatap = str(obj.get("muhatap", "") or "").strip()
    if muhatap and not _muhatap_grounded(muhatap, evrak_text, hedef_birim):
        # muhatap ÇIKARILDI: prompt açıkça "<ad ya da boş>" istiyor, yani bu alan bir KİŞİ
        # ADI taşıyabilir ve `mask_pii` adları yakalamaz (yalnız TCKN/telefon/IBAN).
        # Üstelik bu satır tam da modelin muhatabı UYDURDUĞU dalda ateşlenir — dilekçeden
        # devşirilmiş bir vatandaş adı taşıma ihtimali en yüksek olan yer.
        # (adversarial doğrulama bulgusu — 7. log sızıntısı, 8 Ağu 2026)
        log.warning("yazi_plan_muhatap_grounded_degil", muhatap_n=len(muhatap))
        muhatap = ""  # uydurma muhatap taslağa giremez; tür korunur
    gerekce = str(obj.get("gerekce", "") or "").strip()[:300]
    log.info("yazi_plan", tur=tur, muhatap_var=bool(muhatap),
             tur_tr=YAZI_TURU_TR.get(tur, tur))
    return {"yazi_turu": tur, "muhatap": muhatap, "gerekce": gerekce}


__all__ = ("yazi_plani",)
