"""LangGraph EvrakState — kamu-evrak pipeline'ının paylaşılan durum modeli.

ADALET-AGENT `agents/state.py` deseninden ADAPT: TypedDict + `operator.add` /
union-dedup reducer'lar KEEP; `Domain`/`Citation` (hukuk) yerine evrak-iş-akışı
alanları (evrak türü, bilgi unsurları, eksik alanlar, mevzuat önerisi, birim,
yazı taslağı). Görev 1 + Görev 2'yi tek uçtan-uca state ile kapsar.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, NotRequired, TypedDict


def _merge_dict(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """dict reducer — paralel node'lar (mevzuat_oner + ozetle) aynı state'e fan-in."""
    if not left:
        return right
    if not right:
        return left
    return {**left, **right}


class MevzuatOneri(TypedDict):
    """Önerilen mevzuat/yazışma kuralı referansı."""

    baslik: str          # "3071 sayılı Dilekçe Hakkı Kanunu m.4"
    snippet: NotRequired[str]
    url: NotRequired[str]
    score: NotRequired[float]       # max-normalize (top≈1.0) — GÖRELİ sıra, mutlak alaka DEĞİL
    raw_score: NotRequired[float]   # normalizasyon öncesi ham BM25 (CRAG mutlak-kalite sinyali)
    # raw_score / sorgu_token_sayısı — belgeler arası karşılaştırılabilir TEK mutlak sinyal.
    # Güven bandı bundan türetilir (eval/mevzuat_guven_kalibrasyon.py: top-1 AUC 0.964).
    norm_score: NotRequired[float]
    kaynak_dosya: NotRequired[str]  # katalog anahtarı → /mevzuat/icerik/{dosya} (doğrulama bağı)
    madde_no: NotRequired[str | None]
    madde_tur: NotRequired[str | None]  # "madde"|"ek"|"gecici" → ek≠normal madde (link doğruluğu)


class EvrakState(TypedDict):
    # --- Giriş (OCR/route tarafından doldurulur) ---
    evrak_text: str
    filename: NotRequired[str]
    ocr_engine: NotRequired[str]
    page_count: NotRequired[int]
    ocr_confidence: NotRequired[float | None]

    # --- Görev 1: sınıflandırma + içerik analizi ---
    evrak_turu: NotRequired[str]            # EVRAK_TURLERI'nden biri
    tur_confidence: NotRequired[float]
    tur_reasoning: NotRequired[str]
    bilgi_unsurlari: Annotated[dict[str, Any], _merge_dict]  # gonderen/tarih/sayi/konu/talep...
    eksik_alanlar: NotRequired[list[str]]   # ZORUNLU_ALANLAR'dan eksik olanlar
    mevzuat_onerileri: Annotated[list[MevzuatOneri], operator.add]
    ozet: NotRequired[str]

    # --- Yenilikçilik: CRAG (corrective retrieval) öz-düzeltme (ENV-gated) ---
    # operator.add reducer kullanılan mevzuat_onerileri'ne EKLEMEMEK için (duplikasyon
    # önleme) düzeltilmiş öneriler ayrı alanda tutulur; consumer'lar varsa onu tercih eder.
    mevzuat_onerileri_corrected: NotRequired[list[MevzuatOneri]]
    crag_corrected: NotRequired[bool]       # CRAG düzeltme uyguladı mı (şeffaflık)
    # NLI atıf-gerekçelendirme (ENV-gated): her öneri için entailment (madde ⊨ talep?).
    mevzuat_nli: NotRequired[list[dict[str, Any]]]
    crag_guven_oncesi: NotRequired[float]
    crag_guven_sonrasi: NotRequired[float]

    # --- Yenilikçilik: Self-RAG (reflection) çıktı tamlık öz-değerlendirmesi (ENV-gated) ---
    self_rag_tam: NotRequired[bool]         # çıktı tam mı (tüm beklenen alanlar dolu)
    self_rag_eksikler: NotRequired[list[str]]  # eksik bulunan çıktı alanları
    self_rag_notu: NotRequired[str]         # okunabilir öz-değerlendirme notu

    # --- Görev 2: resmî yazı taslaklama + birim yönlendirme ---
    hedef_birim: NotRequired[str]           # BIRIMLER'den biri
    birim_alternatifleri: NotRequired[list[str]]
    birim_reasoning: NotRequired[str]
    # ADDITIVE: içerikten türetilen somut hizmet müdürlüğü önerisi (5393/norm kadro);
    # {kod, ad, sinyal}. Ölçülen hedef_birim'i DEĞİŞTİRMEZ — danışma katmanı.
    servis_birimi: NotRequired[dict[str, Any]]
    yazi_turu: NotRequired[str]             # YAZI_TURLERI'nden biri
    # Dinamik yazı planının (yazi/yazi_plan.py) insan-okunur gerekçesi; boş = statik yol.
    yazi_plan_notu: NotRequired[str]
    yazi_taslak_md: NotRequired[str]
    yazi_taslak_pdf_bytes: NotRequired[bytes | None]
    yazi_taslak_pdf_filename: NotRequired[str]
    yazi_taslak_docx_bytes: NotRequired[bytes | None]
    yazi_taslak_docx_filename: NotRequired[str]
    # Eksik bilgi varsa kullanıcıya sorulacak takip soruları (dur-ve-sor).
    clarify_questions: NotRequired[list[str]]

    # --- Yenilikçilik: Memur onay kapısı (HITL) ---
    # onay_kapisi_node interrupt() ile durur; memur kararı sonrası doldurulur.
    onay_durumu: NotRequired[str]           # onaylandı | düzenlendi | reddedildi
    onay_gerekce: NotRequired[str]          # red gerekçesi (varsa)

    # --- Doğrulama / kalite ---
    format_uyumlu: NotRequired[bool]        # resmî yazı zorunlu-alan checklist
    verify_notes: NotRequired[str]
    verify_uyari: NotRequired[list[str]]    # uydurma-veto + format eksik uyarıları
    # S2 (2026-07): Yönetmelik-2646 lint raporu ({kurallar, uyari, ozet} — yazi_lint.py)
    # + kaynak evrak veri-tutarlılık uyarıları (tutarlilik.py). İkisi de verify additive
    # çıktısı; risk_guard SARI sinyali olarak tüketir.
    lint_2646: NotRequired[dict[str, Any]]
    tutarlilik_uyari: NotRequired[list[str]]
    # Madde 2 (2026-07): lint ihlalleri için LLM düzeltme ÖNERİSİ (additive; yeniden-lint +
    # uydurma-veto doğrulamasından geçmiş). Mevcut taslak ASLA otomatik değişmez.
    lint_duzeltme_md: NotRequired[str]

    # --- Yenilikçilik: Risk bandı (trafik ışığı) + koşullu HITL ---
    # risk_guard_node verify sinyallerini YEŞİL/SARI/KIRMIZI bandına çevirir (deterministik,
    # tek-yazıcı → plain). Koşullu HITL: sarı/kırmızı → memur onayı, yeşil → otomatik geç.
    # Anahtarlar SABİT (frontend RiskBandCard eşleşir):
    #   bant/skor/gerekceler/katkilar/kalibrasyon/oneri (+ risk_guard_node 'aciklama' ekler).
    # skor = noisy-OR(ciddiyet × ölçülen isabet) — bkz. agents/risk_agirlik.py; bandı ETKİLEMEZ.
    risk_metadata: NotRequired[dict[str, Any]]

    # --- Yenilikçilik: Arşivleme (SDP 2005/7) metadata (Görev kapsamı + yenilikçilik) ---
    # arsiv_node SDP konu kodu + saklama süresi + sayı/tarih/konu/birim üretir (additive).
    # Sözleşme: frontend bununla eşleşir → anahtarlar SABİT (sdp_kodu/saklama_suresi/konu/
    # sayi/tarih/birim). Şüpheli madde/kod → değer içinde [DOĞRULA: ...] (CLAUDE.md §1).
    arsiv_metadata: NotRequired[dict[str, Any]]

    # --- Yenilikçilik: Yasal süre / SLA triyaj (additive, deterministik) ---
    # sla_triyaj_node evrak türü + tarihten yasal cevap son tarihini + durum bandını
    # üretir (GECİKMİŞ/KRİTİK/NORMAL). Anahtarlar SABİT (frontend rozeti eşleşir).
    sla_metadata: NotRequired[dict[str, Any]]

    # --- Yenilikçilik: Denetim izi (tamper-evident SHA-256 hash-chain) ---
    # denetim_izi_node pipeline kararlarını zincirler → Sayıştay/KVKK denetlenebilirlik.
    denetim_izi: NotRequired[dict[str, Any]]

    # --- Yenilikçilik: Kanıt bağlama (evidence grounding) ---
    # kanit_baglama_node çıkarılan unsurların MASKELİ metindeki span'larını üretir →
    # frontend "bunu nereden buldun?" → sarı vurgu. {metin (maskeli), spanlar}.
    kanit_metadata: NotRequired[dict[str, Any]]

    # --- Yenilikçilik: Çok-konulu evrak ayrıştırma (decompose, ENV-gated) ---
    # decompose_node tek dilekçedeki birden çok isteği alt-taleplere böler; her biri ayrı
    # tür+birim+yazı-türü+yasal-süre alır → otomatik havale. Tek-konulu evrak → boş liste.
    # Tek yazıcı (fan-out kaynağı), bir kez yazılır → plain (reducer gerekmez). Anahtarlar
    # SABİT (frontend + AltTalepSchema eşleşir): ozet/tur/tur_tr/birim/birim_tr/yazi_turu/
    # cevap_suresi/sla_durum. Özet PII-maskeli (CLAUDE.md §2).
    alt_talepler: NotRequired[list[dict[str, Any]]]

    # --- Görev 2: dur-ve-sor (clarifier) ---
    # Kritik alan eksikse taslak üretmeden kullanıcıdan bilgi istenir (ENV-gated).
    want_stop: NotRequired[bool]            # clarifier "dur-ve-sor" işareti
    clarify_stop: NotRequired[bool]         # akış clarifier'a yönlendirildi mi

    # --- Çıkış ---
    response: NotRequired[str]              # kullanıcıya özet bilgilendirme
    bilgilendirme: NotRequired[str]
    errors: Annotated[list[str], operator.add]


def make_initial_state(evrak_text: str, *, filename: str = "", **meta: Any) -> EvrakState:
    """Boş EvrakState — tüm reducer alanları başlatılır (TypedDict KeyError önlenir)."""
    return EvrakState(
        evrak_text=evrak_text,
        filename=filename,
        bilgi_unsurlari={},
        mevzuat_onerileri=[],
        eksik_alanlar=[],
        errors=[],
        **meta,
    )


__all__ = ("EvrakState", "MevzuatOneri", "make_initial_state")
