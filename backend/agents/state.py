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
    gosterim_adi: NotRequired[str]  # resmî ad + madde (ekran); baslik = eşleştirme anahtarı
    snippet: NotRequired[str]
    url: NotRequired[str]
    score: NotRequired[float]       # max-normalize (top≈1.0) — GÖRELİ sıra, mutlak alaka DEĞİL
    raw_score: NotRequired[float]   # normalizasyon öncesi ham BM25 (CRAG mutlak-kalite sinyali)
    # raw_score / sorgu_token_sayısı — belgeler arası karşılaştırılabilir TEK mutlak sinyal.
    # Güven bandı bundan türetilir (eval/mevzuat_guven_kalibrasyon.py: top-1 AUC 0.964).
    norm_score: NotRequired[float]
    kaynak_dosya: NotRequired[str]  # katalog anahtarı → /mevzuat/icerik/{dosya} (doğrulama bağı)
    madde_no: NotRequired[str | None]
    kaynak_url: NotRequired[str]
    kaynak_turu: NotRequired[str]
    kaynak_guven: NotRequired[str]  # resmi_dogrulanmis | aday
    icerik_sha256: NotRequired[str]
    dogrulayan: NotRequired[str]
    dogrulama_tarihi: NotRequired[str]
    dogrulama_yontemi: NotRequired[str]
    kaynak_guven_hatalari: NotRequired[list[str]]
    madde_tur: NotRequired[str | None]  # "madde"|"ek"|"gecici" → ek≠normal madde (link doğruluğu)


class EvrakState(TypedDict):
    # --- Giriş (OCR/route tarafından doldurulur) ---
    evrak_text: str
    filename: NotRequired[str]
    # Kurum kimliği state'te TAŞINMAZ (6 Ağu 2026): istek-bazlı `aktif_kurum` override'ı
    # tamamen kaldırıldı. Antet kurumu ya belgeden gelir (hitap-ekli kurum; bkz.
    # kurum_kimlik.efektif_idare_adi — "biz belgeye göre hareket ediyoruz") ya da kurulum
    # sabiti env KURUM_ADI'dan.
    ocr_engine: NotRequired[str]
    page_count: NotRequired[int]
    ocr_confidence: NotRequired[float | None]

    # Sunucu-kaynaklı gerçek node süreleri. Paralel dallar aynı superstep'te farklı
    # anahtarlar yazdığı için dict reducer ile kayıpsız birleşir; UI istemci tahmini yapmaz.
    node_sureleri_ms: Annotated[dict[str, int], _merge_dict]

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
    # LLM taslak üretimine verilen kapalı mevzuat kanıt paketi (yalnız gerçek korpus madde
    # kaydı + snippet). Paket dışı LLM atfı güvenli şablona düşer ve inceleme sinyali olur.
    mevzuat_kanit_paketi: NotRequired[list[dict[str, Any]]]
    mevzuat_kanit_durumu: NotRequired[str]
    mevzuat_kanit_uyari: NotRequired[list[str]]
    mevzuat_kanit_atif_sayisi: NotRequired[int]

    # --- Yenilikçilik: Self-RAG (reflection) çıktı tamlık öz-değerlendirmesi (ENV-gated) ---
    self_rag_tam: NotRequired[bool]         # çıktı tam mı (tüm beklenen alanlar dolu)
    self_rag_eksikler: NotRequired[list[str]]  # eksik bulunan çıktı alanları
    self_rag_notu: NotRequired[str]         # okunabilir öz-değerlendirme notu

    # --- Kaynak-doğrulamalı yönlendirme: kurum kimliği (REVİZYON 1) ---
    # muhatap_kurum: evrakın hitap ettiği kurum (kurum_kimlik.muhatap_kurum_tespit).
    # yetkili_kurum: işlemin hukuken/idari yetkilisi; başlangıçta = muhatap, route ajanı
    # talep muhatabın görevinde değilse kurum-DIŞI gerçek yetkiliye günceller. {ad, slug, tur}.
    muhatap_kurum: NotRequired[dict[str, Any]]
    # gonderen_kurum: nominatif T.C.-antet kurumu (Yön. m.10 — evrağı GÖNDEREN idare).
    # DEĞİŞMEZ: gonderen_kurum.slug hiçbir zaman havale hedefi olamaz — nominatif antet
    # muhatap sayıldığında sistem gelen evrakı kendi göndericisine havale ediyordu.
    gonderen_kurum: NotRequired[dict[str, Any]]
    yetkili_kurum: NotRequired[dict[str, Any]]

    # --- Görev 2: resmî yazı taslaklama + birim yönlendirme ---
    hedef_birim: NotRequired[str | None]    # kaynak-doğrulanmış birim ADI; fallback'te None
    hedef_kurum_adi: NotRequired[str]
    hedef_birim_oneri: NotRequired[str]
    birim_alternatifleri: NotRequired[list[str]]
    birim_reasoning: NotRequired[str]
    # Kaynak-doğrulamalı ajan çıktısı (REVİZYON 6): seçilen birimin tam kaynak künyesi
    # {birim_ad, gorev, kaynak_kurum, belge_basligi, url_veya_belge_kimligi, erisim_tarihi,
    #  metin_parcasi, icerik_hash}. Grounding kanıtı + denetim izi.
    hedef_birim_kaynak: NotRequired[dict[str, Any]]
    # Canlı kaynak (2026-08-06): korpusta karşılığı OLMAYAN kuruma evrak düştüğünde kurumun
    # kendi resmî sitesinden canlı okunmuş öneri + kaynak linki. `hedef_birim_kaynak`tan
    # AYRI tutulur ve daima `dogrulanmis=False` taşır — doğrulanmış künyeye karışmamalı.
    # Şemada olması ZORUNLU: LangGraph tanımsız anahtarı sessizce düşürür, yani bu satır
    # olmadan node değeri döndürse bile API'ye hiç ulaşmaz (denetimde ölçüldü).
    canli_kaynak: NotRequired[dict[str, Any]]
    # Ajan başarısız/grounding-fail (REVİZYON 4): eski 9-set kategori GERÇEK birim değil,
    # yalnız öneri. durum="fallback_onerisi" + insan_onayi_gerekli=True bunu işaretler.
    hedef_kategori: NotRequired[str | None]
    durum: NotRequired[str]                  # "kaynak_dogrulandi" | "fallback_onerisi"
    insan_onayi_gerekli: NotRequired[bool]
    # ADDITIVE: içerikten türetilen somut hizmet müdürlüğü önerisi (5393/norm kadro);
    # {kod, ad, sinyal}. Ölçülen hedef_birim'i DEĞİŞTİRMEZ — danışma katmanı.
    servis_birimi: NotRequired[dict[str, Any]]
    # Sistem-tespitli antet künyesi {idare, birim, muhatap} — dinamik kurum kimliği
    # (yazi_taslak yazar; verify grounding muafiyeti + UI şeffaflığı okur).
    antet_meta: NotRequired[dict[str, str]]
    yazi_turu: NotRequired[str]             # YAZI_TURLERI'nden biri
    # Dinamik yazı planının (yazi/yazi_plan.py) insan-okunur gerekçesi; boş = statik yol.
    yazi_plan_notu: NotRequired[str]
    # [Akış B] Gerçek LLM varken yazı planı alınamadı → tür statik tablodan (görünür bayrak).
    yazi_plan_yedek: NotRequired[bool]
    # [Akış B] Yazışma paketi: [{rol: havale|cevap|devir|devir_bilgi|olur, yazi_turu, muhatap,
    # birim, konu, talep_ids, yazi_taslak_md, format_uyumlu}] — yazi_taslak_md ilk öğedir.
    yazi_paketi: NotRequired[list[dict[str, Any]]]
    # [Akış B] SDP TEK motor kararı {kod, ad, gerekce, adaylar}; yazi_taslak yazar, arsiv okur.
    sdp_secimi: NotRequired[dict[str, Any]]
    # TS 13298 üst-veri (EBYS metadata): belge türü + konu + SDP kodu/adı + güvenlik + tarih/sayı.
    ust_veri: NotRequired[dict[str, Any]]
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
    # Ayrıştırma GERÇEKTEN denendi mi? Boş `alt_talepler` iki ayrı yoldan gelir: (a) çok-konu
    # sinyali yok → LLM hiç çağrılmaz (adım fiilen boş geçer), (b) sinyal var, LLM çağrılır,
    # ama anlamlı 2 segment çıkmaz. Arayüz "bu adım gerekmedi" derken YALNIZ (a)'yı kastedebilir;
    # ikisi `alt_talepler`den ayırt EDİLEMEZ, o yüzden node gerçeği açıkça yazar. False =
    # denenmedi (gerekmedi), True = denendi (sonuç tek-konulu çıktı).
    ayristirma_denendi: NotRequired[bool]

    # --- Görev 2: dur-ve-sor (clarifier) ---
    # Kritik alan eksikse taslak üretmeden kullanıcıdan bilgi istenir (ENV-gated).
    want_stop: NotRequired[bool]            # clarifier "dur-ve-sor" işareti
    clarify_stop: NotRequired[bool]         # akış clarifier'a yönlendirildi mi

    # --- Çıkış ---
    response: NotRequired[str]              # kullanıcıya özet bilgilendirme
    bilgilendirme: NotRequired[str]
    bilgilendirme_yapisal: NotRequired[dict[str, Any]]  # GOV.UK 3'lü yapı (finalize)
    errors: Annotated[list[str], operator.add]


def make_initial_state(evrak_text: str, *, filename: str = "", **meta: Any) -> EvrakState:
    """Boş EvrakState — tüm reducer alanları başlatılır (TypedDict KeyError önlenir)."""
    return EvrakState(
        evrak_text=evrak_text,
        filename=filename,
        bilgi_unsurlari={},
        mevzuat_onerileri=[],
        eksik_alanlar=[],
        node_sureleri_ms={},
        errors=[],
        **meta,
    )


__all__ = ("EvrakState", "MevzuatOneri", "make_initial_state")
