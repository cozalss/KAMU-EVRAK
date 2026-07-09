"""Finalize — pipeline çıktısını kullanıcıya bilgilendirme metnine topla (Görev 2 son adım).

Şartname Görev 2: "Kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma" +
"gerekli durumlarda eksik bilgi talep edebilme". Bu node iki görevin çıktısını, evrakı
işleyen memura yönelik tek "işlem sonucu bildirimi"nde birleştirir: evrak kimden geldi /
ne olarak sınıflandı / hangi birime havale edildi / taslak durumu / yasal cevap süresi /
eksikler + tamamlanmazsa sonucu.

GERÇEK LLM (DeepSeek) yapılandırılmış sonuçtan AKICI, kurumsal-nötr bir bildirim yazar;
bilgi UYDURMAZ (yalnız verilenleri kullanır) ve selamlama/teşekkür kalıbı kullanmaz.
LLM yok/mock/hata → deterministik metin birleştirme (test-edilebilir) aynen devreye girer.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import LLM_ATLA_NODELAR, YAZI_TURU_TR, birim_tr, evrak_turu_tr
from agents.nodes._llm_extract import llm_text

log = structlog.get_logger()

_SYSTEM = (
    "Sen kamu kurumunda gelen evrakı işleyen MEMURA sonuç bildiren bir asistansın. "
    "Verilen yapılandırılmış işlem sonucundan, evrak yönetim ekranında gösterilecek kısa "
    "ve resmî bir İŞLEM SONUCU BİLDİRİMİ yaz.\n"
    "YAPI (bu sırayla):\n"
    "1) Tek paragraf: evrakın kimden geldiği ve konusu; hangi tür olarak sınıflandırıldığı; "
    "hangi birime, hangi mevzuat dayanağıyla havale edildiği.\n"
    "2) Varsa bir cümle: yazı taslağı durumu ve yasal cevap süresi / son tarih.\n"
    "3) Eksik bilgi varsa 'Evrakın işleme alınabilmesi için aşağıdaki bilgilerin "
    "tamamlanması gerekmektedir:' başlığıyla madde listesi + tek cümle sonuç uyarısı "
    "(tamamlanmadan işlemin kesinleşmeyeceği). Eksik yoksa evrakın işleme hazır olduğunu belirt.\n"
    "KESİN KURALLAR:\n"
    "1) Yalnız sana verilen bilgileri kullan; HİÇBİR ŞEY UYDURMA (tutar/tarih/isim dahil).\n"
    "2) MEVZUAT: yalnızca 'İlgili mevzuat' satırındaki başlıkları AYNEN kullan. ASLA yeni "
    "kanun adı, kanun numarası veya madde numarası ekleme. 'yok' ise mevzuattan HİÇ bahsetme.\n"
    "3) ÜSLUP: kurumsal-nötr, üçüncü şahıs. Selamlama, teşekkür ('İlginize teşekkür ederiz' "
    "vb.), temenni ve imza/kapanış kalıbı YASAK. Emoji yok. En fazla ~120 kelime."
)


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


def _det_metin(state: dict[str, Any], turu: str, birim: str,
               eksik: list[str], sorular: list[str], mevzuat: list[dict]) -> str:
    """Deterministik şablon bildirim (LLM yok/atla/hata fallback'i)."""
    gonderen = str((state.get("bilgi_unsurlari") or {}).get("gonderen") or "").strip()
    arsiv = state.get("arsiv_metadata") or {}
    taslak, sla = _taslak_durumu(state), _sla_ozeti(state)

    satirlar = [f"**Gönderen:** {gonderen}"] if gonderen else []
    satirlar += [f"**Evrak türü:** {turu}", f"**Önerilen birim:** {birim}"]
    if mevzuat:
        satirlar.append("**İlgili mevzuat:** " + "; ".join(m["baslik"] for m in mevzuat[:3]))
    if state.get("ozet"):
        satirlar.append(f"**Özet:** {state['ozet']}")
    if taslak:
        satirlar.append(f"**Yazı taslağı:** {taslak}")
    if sla:
        satirlar.append(f"**Yasal cevap süresi:** {sla}")
    # Arşivleme (SDP 2005/7) — bir satır bilgilendirme (additive; arsiv_node üretti).
    if arsiv.get("sdp_kodu"):
        satirlar.append(
            f"**Arşiv (SDP 2005/7):** dosya kodu {arsiv['sdp_kodu']}, "
            f"saklama süresi {arsiv.get('saklama_suresi', '—')}"
        )
    if eksik:
        satirlar.append(
            "**Evrakın işleme alınabilmesi için tamamlanması gerekenler "
            f"({len(eksik)}):**\n" + "\n".join(f"- {s}" for s in (sorular or eksik))
        )
        satirlar.append("Bu bilgiler tamamlanmadan evrak işlemi kesinleştirilemez.")
    else:
        satirlar.append("**Zorunlu alanlar tam** — evrak işleme hazır.")
    return "\n\n".join(satirlar)


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
    """Görev 1+2 sonuçlarını tek bilgilendirme metninde topla."""
    turu = evrak_turu_tr(state.get("evrak_turu", "belirsiz"))
    birim = birim_tr(state.get("hedef_birim", "yazi_isleri_evrak"))
    eksik = state.get("eksik_alanlar") or []
    sorular = state.get("clarify_questions") or []
    # CRAG düzeltme yaptıysa düzeltilmiş öneriler tercih edilir (yoksa baseline liste).
    mevzuat = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []

    det_bilgilendirme = _det_metin(state, turu, birim, eksik, sorular, mevzuat)

    # DeepSeek ile akıcı bildirim (gerçek LLM'de); başarısız/mock → deterministik metin.
    # Vitrin hız profili: bilgilendirme LLM'i danışma niteliğinde → atla, şablon kalır.
    llm_metin = None if "finalize" in LLM_ATLA_NODELAR else await llm_text(
        system=_SYSTEM,
        user=_llm_facts(state, turu, birim, eksik, sorular, mevzuat),
        max_tokens=400,
    )
    bilgilendirme = llm_metin or det_bilgilendirme
    log.info("finalize", turu=turu, birim=birim, eksik=len(eksik), llm=bool(llm_metin))
    return {"response": bilgilendirme, "bilgilendirme": bilgilendirme}


__all__ = ("finalize_node",)
