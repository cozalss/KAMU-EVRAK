"""Finalize — pipeline çıktısını kullanıcıya bilgilendirme metnine topla (Görev 2 son adım).

Şartname Görev 2: "Kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma" +
"gerekli durumlarda eksik bilgi talep edebilme". Bu node iki görevin çıktısını, evrakı
işleyen memura yönelik YAPISAL bir "işlem sonucu bildirimi"nde birleştirir.

Bildirim yapısı araştırma-temellidir (docs/arastirma — GOV.UK service manual
"sending emails and text messages" + confirmation-pages deseni; plainlanguage.gov;
NN/g visibility-of-system-status):
  ne_oldu   → tek paragraf anlatı: kimden geldi / ne sınıflandı / nereye hangi dayanakla
              havale (gerekçe görünür — 3071 m.7 / 4982 m.12 "gerekçeli cevap" ilkesi)
  sirada    → tamamlanan + bekleyen adımlar, açık tarihli süre (belirsiz "yakında" yasak)
  yapilacak → eksik maddeler + eylemsizliğin sonucu (tek birincil eylem)
  notlar    → koşullu mevzuat hatırlatmaları (ör. 4982 m.12-13 itiraz yolu)

MÜHENDİSLİK SÖZLEŞMESİ: iskeletin TAMAMI deterministiktir; GERÇEK LLM (DeepSeek) yalnız
"ne_oldu" anlatısını akıcılaştırır ve anlatı, olgularda OLMAYAN sayı/tarih ya da
selamlama/teşekkür kalıbı içerirse REDDEDİLİR (şablon kalır) — uydurulabilir alan yok.
LLM yok/mock/hata → şablon anlatı; `bilgilendirme` metni HER ZAMAN yapıdan render edilir
(tek kaynak, çift-metin drift'i olmaz).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.config import LLM_ATLA_NODELAR, YAZI_TURU_TR, birim_goster, evrak_turu_tr
from agents.nodes._llm_extract import llm_text

log = structlog.get_logger()

_SYSTEM = (
    "Sen kamu kurumunda gelen evrakı işleyen MEMURA sonuç bildiren bir asistansın. "
    "Verilen yapılandırılmış işlem sonucundan bildirimin yalnız 'NE OLDU' anlatısını yaz: "
    "evrakın kimden geldiği ve konusu; hangi tür olarak sınıflandırıldığı; hangi birime, "
    "hangi mevzuat dayanağıyla havale edildiği. EN FAZLA 2 cümle, tek paragraf.\n"
    "KESİN KURALLAR:\n"
    "1) Yalnız sana verilen bilgileri kullan; HİÇBİR ŞEY UYDURMA (tutar/tarih/isim/madde "
    "dahil). 'İlgili mevzuat' satırı 'yok' ise mevzuattan HİÇ bahsetme.\n"
    "2) Sıradaki adımları, eksik bilgileri ve süreleri YAZMA — bunlar bildirimin yapısal "
    "bölümlerinde ayrıca gösterilir (tek mesaj = tek iş).\n"
    "3) Etken ve özneli anlat: işlemi yapan/yapacak birim görünsün; belirsiz 'işlem "
    "yapılacaktır' kalıbı yasak (sade dil: aktif çatı, eylem öne).\n"
    "4) ÜSLUP: kurumsal-nötr, üçüncü şahıs. Selamlama, teşekkür ('İlginize teşekkür "
    "ederiz' vb.), temenni ve imza/kapanış kalıbı YASAK. Emoji yok. En fazla ~50 kelime."
)

# 3071 sayılı Dilekçe Hakkı Kanunu rejimindeki vatandaş-başvuru türleri (m.7: gerekçeli cevap).
_3071_AILESI = frozenset({"dilekce", "talep", "basvuru", "cimer", "sikayet", "ihbar"})

# CİMER "kurumsal-nötr" ilkesi: anlatıda selamlama/teşekkür/temenni kalıbı → reddet.
_YASAK_KALIPLAR = ("teşekkür", "saygılarımızla", "saygılarımla", "sayın ", "merhaba", "rica ederiz")

_ANLATI_MAX_KARAKTER = 420  # ~50 kelime üst sınırının karakter karşılığı (taşma → şablon)

# Ad/kurum/unvan adayı: 2+ ardışık Büyük-harf sözcük ("Ahmet Yılmaz", "Ankara Valiliği").
# Tek Büyük-harf sözcük (cümle başı "Evrak") üslup gereğidir, uydurma sayılmaz (kurul deseni).
_BUYUK_DIZI = re.compile(r"(?:[A-ZÇĞİÖŞÜ][^\W\d_]+['’]?\s+){1,}[A-ZÇĞİÖŞÜ][^\W\d_]+")

_KATLA_MAP = str.maketrans("İIıŞşĞğÜüÖöÇç", "iiissgguuoocc")


def _katla(s: str) -> str:
    """Türkçe harf-katlamalı normalize (kurul._katla ikizi) — grounding karşılaştırması."""
    return "".join(c for c in str(s).translate(_KATLA_MAP).lower() if c.isalnum())


def _tr_kucuk(s: str) -> str:
    """Türkçe-duyarlı küçültme: ascii lower'ın İ→i? tuzağı olmadan ('SAYIN' → 'sayın')."""
    return s.replace("İ", "i").replace("I", "ı").lower()


def _taslak_durumu(state: dict[str, Any]) -> str:
    """Yazı taslağının olaya-uygun durum cümlesi (yoksa boş — satır hiç yazılmaz)."""
    if state.get("clarify_stop"):
        return "Kritik eksikler nedeniyle taslak üretilmedi — bilgiler tamamlanınca hazırlanacak."
    if not state.get("yazi_taslak_md"):
        return ""
    yazi = YAZI_TURU_TR.get(state.get("yazi_turu", ""), "Resmî yazı")
    return f"{yazi} taslağı hazırlandı — memur onayı bekliyor."


def _sla_ozeti(state: dict[str, Any]) -> str:
    """Yasal cevap süresi tek satır özeti (yalnız son tarih hesaplanabildiyse)."""
    sla = state.get("sla_metadata") or {}
    if not sla.get("son_tarih"):
        return ""
    parcalar = [f"son tarih {sla['son_tarih']}"]
    if isinstance(sla.get("kalan_gun"), int):
        kalan = sla["kalan_gun"]
        parcalar.append(f"{kalan} gün kaldı" if kalan >= 0 else f"{-kalan} gün gecikmiş")
    sure = f"{sla['sure']} ({sla['mevzuat']}) — " if sla.get("sure") else ""
    return sure + ", ".join(parcalar)


def _anlati_sablon(state: dict[str, Any], turu: str, birim: str,
                   mevzuat: list[dict]) -> str:
    """Deterministik 'ne oldu' anlatısı — LLM yok/reddedildiyse bildirim bununla çıkar.

    Sade-dil kuralları: tek cümle, etken anlatım, gerekçe (dayanak) cümle içinde görünür.
    """
    gonderen = str((state.get("bilgi_unsurlari") or {}).get("gonderen") or "").strip()
    kim = f"{gonderen} tarafından gönderilen evrak" if gonderen else "Evrak"
    # Birim adları hâl eki içerir ("... Birimi/Müdürlüğü") → ek yinelenmemesi için parantezli.
    if mevzuat:
        return (f"{kim}, {turu} olarak sınıflandırıldı ve {mevzuat[0]['baslik']} "
                f"dayanak alınarak ilgili birime ({birim}) havale edildi.")
    return f"{kim}, {turu} olarak sınıflandırıldı ve ilgili birime ({birim}) havale edildi."


def _sirada(state: dict[str, Any], birim: str, eksik: list[str],
            sorular: list[str]) -> list[dict[str, Any]]:
    """GOV.UK 'what happens next': tamamlanan + bekleyen adımlar, açık tarihli süre."""
    adimlar: list[dict[str, Any]] = [
        {"adim": "Sorumlu birime havale", "detay": birim, "durum": "tamam"}]
    if eksik:
        # Sayı, yapilacak.maddeler ile AYNI kaynaktan (sorular ⊇ eksik olabilir) —
        # bildirimin iki bölümü farklı sayı söylemesin (review bulgusu).
        adimlar.append({"adim": "Eksik bilgilerin tamamlanması",
                        "detay": f"{len(sorular or eksik)} madde bekleniyor", "durum": "bekliyor"})
    if state.get("clarify_stop"):
        adimlar.append({"adim": "Yazı taslağının hazırlanması",
                        "detay": "bilgiler tamamlanınca", "durum": "bekliyor"})
    elif state.get("yazi_taslak_md"):
        yazi = YAZI_TURU_TR.get(state.get("yazi_turu", ""), "Resmî yazı")
        adimlar.append({"adim": f"{yazi} taslağının memur onayı", "detay": "", "durum": "bekliyor"})
    sla = state.get("sla_metadata") or {}
    if sla.get("son_tarih"):
        kalan = sla.get("kalan_gun")
        detay = f"yasal son tarih {sla['son_tarih']}"
        if isinstance(kalan, int):
            detay += f" ({kalan} gün kaldı)" if kalan >= 0 else f" ({-kalan} gün gecikmiş)"
        # sureli: UI'nın gecikme vurgusu bu AÇIK bayrağa bağlanır (metin sözleşmesi değil).
        adimlar.append({"adim": "Cevabın muhataba gönderilmesi", "detay": detay,
                        "durum": "bekliyor", "sureli": True})
    return adimlar


def _notlar(evrak_turu: str) -> list[str]:
    """Koşullu mevzuat hatırlatmaları — yalnız DOĞRULANMIŞ dayanaklar (uydurma yasak).

    4982 m.12: ret kararında gerekçe + başvuru yolları belirtilir; m.13: 15 gün içinde
    Bilgi Edinme Değerlendirme Kuruluna itiraz. 3071 m.7: cevap gerekçeli verilir.
    (Kaynak: mevzuat.gov.tr — docs/arastirma bildirim-normlari.)
    """
    if evrak_turu == "bilgi_edinme":
        return ["Olumsuz cevap verilecekse gerekçe ve itiraz yolu cevapta belirtilmelidir "
                "(4982 m.12; itiraz: 15 gün içinde Bilgi Edinme Değerlendirme Kuruluna, m.13)."]
    if evrak_turu in _3071_AILESI:
        return ["Cevap, 3071 sayılı Kanun m.7 gereği gerekçeli verilmelidir."]
    return []


def _sure_blok(state: dict[str, Any]) -> dict[str, Any] | None:
    """SLA metadata'sının bildirime giren kesiti (son tarih yoksa blok hiç yazılmaz)."""
    sla = state.get("sla_metadata") or {}
    if not sla.get("son_tarih"):
        return None
    return {k: sla.get(k) for k in ("son_tarih", "kalan_gun", "sure", "mevzuat", "durum", "etiket")}


def _yapisal(state: dict[str, Any], turu: str, birim: str, eksik: list[str],
             sorular: list[str], mevzuat: list[dict]) -> dict[str, Any]:
    """Bildirimin deterministik iskeleti — LLM yalnız 'ne_oldu' alanını değiştirebilir."""
    gonderen = str((state.get("bilgi_unsurlari") or {}).get("gonderen") or "").strip()
    yapilacak = None
    if eksik:
        yapilacak = {"maddeler": list(sorular or eksik),
                     "sonuc": "Bu bilgiler tamamlanmadan evrak işlemi kesinleştirilemez."}
    return {
        "surum": 1,
        "durum": "eksik" if eksik else "hazir",
        "durum_etiket": "Eksik bilgi bekleniyor" if eksik else "Evrak işleme hazır",
        "ne_oldu": _anlati_sablon(state, turu, birim, mevzuat),
        "ne_oldu_kaynak": "sablon",
        "referans": {"gonderen": gonderen, "evrak_turu": turu, "birim": birim,
                     "dayanak": [m["baslik"] for m in mevzuat[:3]]},
        "sirada": _sirada(state, birim, eksik, sorular),
        "yapilacak": yapilacak,
        "sure": _sure_blok(state),
        "notlar": _notlar(state.get("evrak_turu", "")),
    }


def _metin(y: dict[str, Any], state: dict[str, Any]) -> str:
    """`bilgilendirme` düz metnini YAPIDAN render et (tek kaynak; drift olmaz).

    Eski tüketiciler (adım detayı, DB kaydı, eval) düz metin okumaya devam eder.
    """
    satirlar = [y["ne_oldu"]]
    # Persist sözleşmesi: özet + TAM mevzuat listesi eski _det_metin'de vardı — düşmez
    # (DB'deki bilgilendirme alanını "olayın tam özeti" okuyan tüketiciler için).
    if state.get("ozet"):
        satirlar.append(f"**Özet:** {state['ozet']}")
    if y["referans"]["dayanak"]:
        satirlar.append("**İlgili mevzuat:** " + "; ".join(y["referans"]["dayanak"]))
    taslak, sla = _taslak_durumu(state), _sla_ozeti(state)
    if taslak:
        satirlar.append(f"**Yazı taslağı:** {taslak}")
    if sla:
        satirlar.append(f"**Yasal cevap süresi:** {sla}")
    bekleyen = [a["adim"] for a in y["sirada"] if a["durum"] == "bekliyor"]
    if bekleyen:
        satirlar.append("**Sırada:** " + " → ".join(bekleyen))
    arsiv = state.get("arsiv_metadata") or {}
    if arsiv.get("sdp_kodu"):
        satirlar.append(f"**Arşiv (SDP 2005/7):** dosya kodu {arsiv['sdp_kodu']}, "
                        f"saklama süresi {arsiv.get('saklama_suresi', '—')}")
    if y["yapilacak"]:
        maddeler = "\n".join(f"- {s}" for s in y["yapilacak"]["maddeler"])
        satirlar.append("**Evrakın işleme alınabilmesi için tamamlanması gerekenler "
                        f"({len(y['yapilacak']['maddeler'])}):**\n" + maddeler)
        satirlar.append(y["yapilacak"]["sonuc"])
    else:
        satirlar.append("**Zorunlu alanlar tam** — evrak işleme hazır.")
    satirlar += [f"Not: {n}" for n in y["notlar"]]
    return "\n\n".join(satirlar)


def _ad_dizisi_grounded(mf: str, f_fold: str) -> bool:
    """Katlanmış ad/kurum dizisi olgularda var mı? Son sözcüğün Türkçe hâl eki için
    kuyruktan ≤3 karakter tolerans ("CİMER Birimine" ↔ olgudaki "CİMER Birimi")."""
    for kes in range(4):
        aday = mf[: len(mf) - kes]
        if len(aday) >= 6 and aday in f_fold:
            return True
    return len(mf) < 6 and mf in f_fold  # çok kısa dizi → yalnız tam eşleşme


def _anlati_gecerli(facts: str, aday: str) -> bool:
    """LLM anlatısı yayınlanabilir mi? (CLAUDE.md §1 — sıfır uydurma, yapısal guard.)

    Ret koşulları — kurul motorundaki `_yeni_uydurma` deseninin anlatıya uyarlanmış hâli:
    boş/aşırı uzun · selamlama-teşekkür kalıbı (Türkçe-duyarlı küçültmeyle) · olgularda
    OLMAYAN sayısal token (tutar/tarih/kimlik/madde no) · olgularda OLMAYAN ad/kurum/unvan
    dizisi (sayısız uydurma da yakalanır; adversarial review bulgusu).
    """
    metin = (aday or "").strip()
    if not metin or len(metin) > _ANLATI_MAX_KARAKTER:
        return False
    kucuk = _tr_kucuk(metin)
    if any(k in kucuk for k in _YASAK_KALIPLAR):
        return False
    if set(re.findall(r"\d+", metin)) - set(re.findall(r"\d+", facts)):
        return False                                    # yeni sayı/tarih/kimlik/madde
    f_fold = _katla(facts)
    return all(
        _ad_dizisi_grounded(_katla(m.group(0)), f_fold)
        for m in _BUYUK_DIZI.finditer(metin)
    )                                                   # yeni ad/kurum/unvan → reddet


def _llm_facts(state: dict[str, Any], turu: str, birim: str,
               eksik: list[str], sorular: list[str], mevzuat: list[dict]) -> str:
    """LLM'e verilen yapılandırılmış olay özeti (ham evrak metni DEĞİL — özet zaten LLM)."""
    gonderen = str((state.get("bilgi_unsurlari") or {}).get("gonderen") or "").strip()
    arsiv = state.get("arsiv_metadata") or {}
    return (
        f"Gönderen: {gonderen or '—'}\n"
        f"Evrak türü: {turu}\n"
        f"Havale edilen birim: {birim}\n"
        f"İlgili mevzuat: {'; '.join(m['baslik'] for m in mevzuat[:3]) if mevzuat else 'yok'}\n"
        f"Özet: {state.get('ozet') or '—'}\n"
        f"Yazı taslağı: {_taslak_durumu(state) or 'üretilmedi'}\n"
        f"Yasal cevap süresi: {_sla_ozeti(state) or 'hesaplanamadı'}\n"
        f"Arşiv (SDP 2005/7): {arsiv.get('sdp_kodu', 'yok')}\n"
        f"Eksik zorunlu alanlar: {', '.join(eksik) if eksik else 'yok'}\n"
        f"Tamamlanması istenecekler: {'; '.join(sorular) if sorular else 'yok'}"
    )


async def finalize_node(state: dict[str, Any]) -> dict[str, Any]:
    """Görev 1+2 sonuçlarını yapısal bildirimde topla (metin yapıdan render edilir)."""
    turu = evrak_turu_tr(state.get("evrak_turu", "belirsiz"))
    # İÇERİK-DUYARLI birim etiketi (bildirim metni): düz dilekçe için "Başvuru-Kayıt" (yanlış CİMER
    # yok); yalnız evrak GERÇEKTEN cimer/bilgi_edinme türündeyse "CİMER"/"Bilgi Edinme" yükseltmesi.
    birim = birim_goster(state.get("hedef_birim", "yazi_isleri_evrak"), state.get("evrak_turu", ""))
    eksik = state.get("eksik_alanlar") or []
    sorular = state.get("clarify_questions") or []
    # CRAG düzeltme yaptıysa düzeltilmiş öneriler tercih edilir (yoksa baseline liste).
    # Terminal node ASLA düşmez: dict-olmayan / 'baslik'sız girdi burada elenir (crash-safety);
    # sonrası bracket erişimi güvenlidir.
    mevzuat = [m for m in (state.get("mevzuat_onerileri_corrected")
                           or state.get("mevzuat_onerileri") or [])
               if isinstance(m, dict) and m.get("baslik")]

    yapisal = _yapisal(state, turu, birim, eksik, sorular, mevzuat)

    # DeepSeek yalnız anlatıyı akıcılaştırır; guard'ı geçemezse şablon anlatı kalır.
    # Vitrin hız profili: bilgilendirme LLM'i danışma niteliğinde → atla, şablon kalır.
    facts = _llm_facts(state, turu, birim, eksik, sorular, mevzuat)
    llm_anlati = None if "finalize" in LLM_ATLA_NODELAR else await llm_text(
        system=_SYSTEM, user=facts, max_tokens=200,
    )
    if llm_anlati and _anlati_gecerli(facts, llm_anlati):
        yapisal["ne_oldu"], yapisal["ne_oldu_kaynak"] = llm_anlati.strip(), "llm"
    elif llm_anlati:
        log.info("finalize_anlati_reddedildi", uzunluk=len(llm_anlati))

    bilgilendirme = _metin(yapisal, state)
    log.info("finalize", turu=turu, birim=birim, eksik=len(eksik),
             llm=yapisal["ne_oldu_kaynak"] == "llm")
    return {"response": bilgilendirme, "bilgilendirme": bilgilendirme,
            "bilgilendirme_yapisal": yapisal}


__all__ = ("finalize_node",)
