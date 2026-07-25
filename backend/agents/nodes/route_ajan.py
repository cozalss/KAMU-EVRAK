"""Kaynak-doğrulamalı birim yönlendirme ajanı (route_birim'in ROUTE_AJAN yolu).

Akış (kullanıcı mimarisi):
  konu anla → resmî kaynakta ara (kaynak_ara: offline korpus + opsiyonel web) →
  görev tanımlarını karşılaştır → muhatap kurumun görevinde mi? değilse YETKİLİ kurumu bul →
  seç → ÜÇLÜ grounding (kurum + birim + görev-konu) → doğrulandıysa hedef, değilse DÜRÜST fallback.

Güvenlik sözleşmeleri:
  - Uydurma/başka-kurum birimi ASLA otomatik çıkmaz (yalnız kaynak_ara adayları + üçlü grounding).
  - Kaynak-doğrulanamazsa hedef_birim=None + hedef_kategori(eski 9-set) + insan_onayi_gerekli=True.
  - DeepSeek'e giden metin KVKK-maskeli (isim [AD] + TCKN/telefon/IBAN). LLM yok/mock → deterministik
    aday seçimi (en yüksek skorlu kuruma-özel aday); CI determinizmi korunur.
"""
from __future__ import annotations

import os
from typing import Any

import structlog

from agents.config import ROUTE_AJAN_MAX_TUR
from agents.kurum_kimlik import (
    ad_to_kurum,
    gonderen_kurum_tespit,
    muhatap_kurum_tespit,
)
from agents.nodes._llm_extract import llm_json, real_llm
from agents.resmi_kaynak import kaynak_ara, uclu_grounding
from api.pii import mask_for_llm

log = structlog.get_logger()

_SYSTEM = (
    "Sen bir kamu evrak havale uzmanısın. Görevin: evrakı GERÇEKTE var olan, YETKİLİ birime "
    "yönlendirmek. Sana verilen aday birimler resmî teşkilat kaynağından gelir; SADECE bu "
    "listeden seçebilirsin, birim UYDURMA. Önce şunu değerlendir: bu talep muhatap kurumun "
    "görev alanında mı? Değilse (ör. sokak/cadde aydınlatması elektrik dağıtım şirketinin, "
    "trafik ışığı/karayolu farklı kurumun görevidir) yetki='DISARIDA' de ve gerçek yetkili "
    "kurumun ADINI yaz. Muhatabın görevindeyse yetki='ICERIDE' ve listeden en uygun birimi seç. "
    "Karar ilkesi: konuyu mevzuat gereği doğrudan inceleyen/ölçen/uygulayan uzman birim, yalnız "
    "kayıt alan veya destek veren birimden önce gelir. 'Şikâyet' ve 'ihbar' yalnız evrak biçimidir; "
    "konunun kendisi değildir. Teftiş birimini yalnız belediyenin kendi personeli veya iş ve işlemi "
    "hakkında görevi kötüye kullanma, rüşvet, yolsuzluk, disiplin ya da soruşturma iddiasında seç. "
    "İşyeri/eğlence yeri kaynaklı çevresel gürültüde aday görev tanımı açıkça gürültü kontrolü, "
    "ölçümü ve çevre denetimini kapsıyorsa o uzman birimi; Zabıta/Ruhsat birimlerini destek olarak değerlendir."
)


def _aday_listesi(adaylar: list[dict[str, Any]]) -> str:
    """LLM prompt'u için aday birimler (ad + görev özeti). Yalnız bunlar seçilebilir."""
    satirlar = []
    for a in adaylar[:6]:
        gorev = (a.get("gorev") or "")[:180]
        satirlar.append(f"- {a.get('birim_ad')}: {gorev}")
    return "\n".join(satirlar) if satirlar else "(aday birim bulunamadı)"


def _arama_baglami(bilgi: dict[str, Any], masked_text: str) -> tuple[str, str]:
    """Build retrieval input from subject, requested actions, and masked body text."""
    konu = str(bilgi.get("konu") or "").strip()
    talepler = bilgi.get("talepler") or []
    talep_metinleri = [str(t).strip() for t in talepler if isinstance(t, str) and t.strip()]
    govde = masked_text[:1600]
    if not konu:
        konu = (" ".join(talep_metinleri) or govde[:300]).strip()
    arama = " ".join([konu, konu, konu, *talep_metinleri, govde]).strip()
    return konu, arama[:2600]


def _alternatif_adlari(
    adaylar: list[dict[str, Any]],
    secilen: dict[str, Any] | None,
    det: dict[str, Any],
) -> list[str]:
    """Kurum korpusu varsa gerçek birim adlarını, yoksa eski kategori yedeklerini döndür."""
    secilen_ad = (secilen or {}).get("birim_ad", "")
    adlar: list[str] = []
    kurum_adaylari = [
        aday for aday in adaylar
        if aday.get("kaynak_tipi") in ("kurum_ozel", "web", "aday", "mevzuat_teskilat")
    ]
    for aday in kurum_adaylari:
        ad = str(aday.get("birim_ad") or "").strip()
        if ad and ad != secilen_ad and ad not in adlar:
            adlar.append(ad)
    if adlar:
        return adlar[:3]
    return list(det.get("birim_alternatifleri", []))[:3]


def _yerel_oncelikli_secim(adaylar: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Model yoksa/hata verirse retrieval sirasindaki en guvenli yerel adayi sec."""
    dogrulanmis = [
        aday for aday in adaylar
        if (
            aday.get("kaynak_tipi") == "kurum_ozel"
            and aday.get("kaynak_guven") == "resmi_dogrulanmis"
            and aday.get("kaynak_sha256")
        )
    ]
    if dogrulanmis:
        return dogrulanmis[0]
    # Kurumun KENDİ kaydı (doğrulanmamış da olsa) tür-genel mevzuat şablonundan önce gelir:
    # şablon o idarede fiilen kurulu olmayabilir (Yönetmelik GEÇİCİ MADDE 1), kurumun kendi
    # beyanı ise kuruma özgüdür. İkisi de memur onayına gittiği için sıra bilgi kalitesidir.
    ozel = next((aday for aday in adaylar if aday.get("kaynak_tipi") == "aday"), None)
    if ozel:
        return ozel
    return next(
        (aday for aday in adaylar if aday.get("kaynak_tipi") == "mevzuat_teskilat"), None
    )


async def _llm_sec(
    masked_text: str, konu: str, yetkili: dict[str, Any], adaylar: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """DeepSeek: yetki içeride mi + hangi birim (kapalı-küme: yalnız aday listesinden)."""
    return await llm_json(
        system=_SYSTEM,
        user=(
            f"MUHATAP/YETKİLİ KURUM: {yetkili.get('ad') or '(bilinmiyor)'}\n"
            f"EVRAK KONUSU: {konu}\n\n"
            f"ADAY BİRİMLER (yalnız bunlardan seç, adı BİREBİR kopyala):\n{_aday_listesi(adaylar)}\n\n"
            f"EVRAK METNİ (maskeli):\n{masked_text[:900]}\n\n"
            'Yalnız şu JSON: {"yetki":"ICERIDE|DISARIDA",'
            '"yetkili_kurum_adi":"<DISARIDA ise gerçek yetkili kurum adı, değilse boş>",'
            '"secilen_birim":"<ICERIDE ise aday listesinden BİREBİR birim adı, değilse boş>",'
            '"gerekce":"<tek cümle Türkçe gerekçe>"}'
        ),
        max_tokens=260,
    )


def _kaynak_kunye(aday: dict[str, Any]) -> dict[str, Any]:
    """KaynakKaydi'yi state'e yazılacak künyeye indir (transient skor hariç değil — audit için tut)."""
    return {k: aday[k] for k in (
        "birim_ad", "gorev", "kaynak_kurum", "kurum_slug", "belge_basligi",
        "url_veya_belge_kimligi", "erisim_tarihi", "metin_parcasi", "icerik_hash",
        "kaynak_tipi", "kaynak_guven", "kaynak_dosya", "kaynak_sha256",
        "dogrulayan", "dogrulama_tarihi", "sablon_slug",
    ) if k in aday}


async def route_ajan(state: dict[str, Any], det: dict[str, Any]) -> dict[str, Any]:
    """Kaynak-doğrulamalı yönlendirme. det = _route_deterministik(state) (kategori köprüsü)."""
    bilgi = state.get("bilgi_unsurlari") or {}
    metin = state.get("evrak_text", "") or ""
    # GÖNDEREN ≠ MUHATAP (2026-07-26): nominatif T.C.-antet kurumu evrağı GÖNDEREN idaredir.
    # Havale hedefi ASLA gönderen olamaz — aksi hâlde evrak kendi göndericisine yollanır.
    gonderen = gonderen_kurum_tespit(metin)
    muhatap = muhatap_kurum_tespit(metin, bilgi)
    if not muhatap.get("slug"):
        # Hitapsız resmî evrak: muhatap BİZİZ (evrakı alan kurum). İstek-bazlı aktif kurum,
        # yoksa env KURUM_ADI; ikisi de yoksa boş künye → dürüst fallback + memur onayı.
        muhatap = ad_to_kurum(
            (state.get("aktif_kurum") or "").strip() or os.getenv("KURUM_ADI", "").strip())
    yetkili = dict(muhatap)
    isim = bilgi.get("gonderen")
    masked = mask_for_llm(state.get("evrak_text", "") or "", isim)
    konu, arama_baglami = _arama_baglami(bilgi, masked)

    kategori = det.get("hedef_birim")  # eski 9-set kategori (dürüst fallback köprüsü)
    llm = real_llm()
    secilen: dict[str, Any] | None = None
    son_adaylar: list[dict[str, Any]] = []
    gerekce = ""
    yetki_disari = False

    for tur_i in range(max(1, ROUTE_AJAN_MAX_TUR)):
        adaylar = kaynak_ara(yetkili.get("slug", ""), arama_baglami, tur=yetkili.get("tur", ""))
        son_adaylar = adaylar
        if llm is None:
            secilen = _yerel_oncelikli_secim(adaylar)
            break
        obj = await _llm_sec(masked, konu, yetkili, adaylar)
        if not obj:
            secilen = _yerel_oncelikli_secim(adaylar)
            gerekce = "Model yanıtı alınamadı; doğrulanmış resmî kaynak sırası kullanıldı"
            break
        if obj.get("yetki") == "DISARIDA" and tur_i < ROUTE_AJAN_MAX_TUR - 1:
            yk = ad_to_kurum((obj.get("yetkili_kurum_adi") or "").strip())
            # LLM yetkili olarak GÖNDERENİ gösterse bile eskalasyon yapma — gönderenin
            # korpusunda hiçbir turda arama yapılmaz (değişmezin ikinci savunması).
            if yk.get("slug") and gonderen.get("slug") and yk["slug"] == gonderen["slug"]:
                log.info("route_ajan.gonderen_eskalasyonu_reddedildi", kurum=yk.get("ad"))
                yk = {}
            if yk.get("slug") and yk["slug"] != yetkili.get("slug"):
                yetkili = dict(yk)
                yetki_disari = True
                gerekce = (obj.get("gerekce") or "").strip()
                continue  # yeni yetkili kurumda tekrar ara
        sb = (obj.get("secilen_birim") or "").strip()
        secilen = next((a for a in adaylar if (a.get("birim_ad") or "") == sb), None)
        gerekce = (obj.get("gerekce") or "").strip() or gerekce
        if secilen is None and obj.get("yetki") != "DISARIDA":
            secilen = _yerel_oncelikli_secim(adaylar)
            gerekce = (
                gerekce
                or "Model seçimi aday listesiyle eşleşmedi; doğrulanmış resmî kaynak sırası kullanıldı"
            )
        break

    base: dict[str, Any] = {
        "muhatap_kurum": muhatap, "yetkili_kurum": yetkili, "gonderen_kurum": gonderen,
    }
    # KEMER-ASKI: seçilen aday gönderen kurumun korpusundansa doğrulanmış hedef ÜRETİLMEZ.
    # Yukarıdaki iki guard'ı (muhatap tespiti + eskalasyon) atlatan gelecekteki her yeni
    # sızıntı yolunu da burada yakalarız; maliyeti bir slug karşılaştırması.
    if (
        secilen
        and gonderen.get("slug")
        and str(secilen.get("kurum_slug") or "") == gonderen["slug"]
    ):
        log.warning("route_ajan.gonderen_hedef_reddedildi", kurum=gonderen.get("ad"))
        secilen = None

    # ÜÇLÜ grounding — yalnız kuruma-özel kaynak + kurum/birim/görev-konu birlikte doğrulanırsa.
    if secilen and uclu_grounding(secilen, arama_baglami, yetkili.get("slug", "")):
        ad = secilen["birim_ad"]
        kaynak = secilen.get("kaynak_kurum", "")
        belge = secilen.get("belge_basligi", "")
        neden = gerekce or "görev tanımı evrak konusuyla örtüşüyor"
        log.info("route_ajan.dogrulandi", birim=ad, kurum=kaynak, yetki_disari=yetki_disari)
        return {
            **base,
            "hedef_birim": ad,
            "hedef_birim_oneri": ad,
            "hedef_kurum_adi": kaynak or yetkili.get("ad", ""),
            "hedef_birim_kaynak": _kaynak_kunye(secilen),
            "hedef_kategori": kategori,
            "durum": "kaynak_dogrulandi",
            "insan_onayi_gerekli": False,
            "birim_alternatifleri": _alternatif_adlari(son_adaylar, secilen, det),
            "birim_reasoning": f"{ad} — {neden} (kaynak: {kaynak} · {belge}) [DeepSeek+kaynak]",
        }

    # DÜRÜST fallback — kaynak-doğrulanamadı (REVİZYON 4): eski 9-set GERÇEK birim değil, öneri.
    parcalar = []
    if yetki_disari and yetkili.get("ad") and yetkili["slug"] != muhatap.get("slug"):
        parcalar.append(f"Yetkili kurum: {yetkili['ad']}")
    if secilen and secilen.get("birim_ad"):
        tip = {
            "kurum_ozel": "kuruma-özel",
            "mevzuat_teskilat": "mevzuat-teşkilat",
            "aday": "kurum kaynağı adayı",
        }.get(secilen.get("kaynak_tipi"), "jenerik aday")
        parcalar.append(f"Öneri ({tip}, doğrulanmadı): {secilen['birim_ad']}")
    parcalar.append("Resmî kaynakla doğrulanamadı — memur onayı gerekli.")
    log.info("route_ajan.fallback", muhatap=muhatap.get("slug"), yetki_disari=yetki_disari,
             kategori=kategori)
    return {
        **base,
        "hedef_birim": None,
        "hedef_birim_oneri": (secilen or {}).get("birim_ad", ""),
        "hedef_kurum_adi": ((secilen or {}).get("kaynak_kurum") or yetkili.get("ad", "")),
        "hedef_birim_kaynak": _kaynak_kunye(secilen) if secilen else {},
        "hedef_kategori": kategori,
        "durum": "fallback_onerisi",
        "insan_onayi_gerekli": True,
        "birim_alternatifleri": _alternatif_adlari(son_adaylar, secilen, det),
        "birim_reasoning": " · ".join(parcalar),
    }


__all__ = ("route_ajan",)
