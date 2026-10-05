"""Pydantic şemaları — kamu-evrak API giriş/çıkış sözleşmeleri.

ADALET-AGENT api/schemas.py deseninden ADAPT: zarf + DoS guard (max uzunluk) KEEP;
hukuk şemaları (Citation/Claim/Prediction) → evrak şemaları (tür/birim/yazı/eksik).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# Girdi DoS guard — aşırı uzun metin reddi (ADALET deseni).
MAX_EVRAK_CHARS = 50_000


class ProcessRequest(BaseModel):
    """Hazır metinle pipeline çalıştırma (OCR'sız; test/entegrasyon)."""

    evrak_text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    filename: str = Field("", max_length=255)


class YaziTaslakRequest(BaseModel):
    """Resmî yazı taslağını PDF/DOCX olarak indirme isteği (Görev 2)."""

    evrak_text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    filename: str = Field("", max_length=255)


class TaslakTuruRequest(BaseModel):
    """Seçilen resmî yazı TÜRÜ için taslağı yeniden üretme isteği (şartname: üst yazı /
    cevabi yazı / bilgilendirme / alternatif tür seçilebilmeli).

    Pipeline TEKRAR koşulmaz: frontend elindeki bilgi unsurları + evrak metniyle yalnız
    gövde-üretim + render katmanı çağrılır (1 LLM çağrısı; mock'ta deterministik).
    """

    evrak_text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    yazi_turu: str = Field(..., pattern="^(ust_yazi|cevabi_yazi|bilgilendirme|olur|muzekkere|gorus_mutalaa)$")
    bilgi_unsurlari: dict = Field(default_factory=dict, max_length=50)  # DoS-guard: anahtar sayısı sınırlı
    hedef_birim: str = Field("", max_length=100)   # birim kodu — ust_yazi muhatabı için


class YaziRenderRequest(BaseModel):
    """Düzenlenmiş taslak metnini DOĞRUDAN PDF/DOCX'e render etme isteği (pipeline YOK).

    TaslaklarView 'DOCX indir' — memurun elle düzenlediği gövde olduğu gibi indirilir.
    """

    text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    title: str = Field("", max_length=255)


class YaziEypRequest(BaseModel):
    """EYP 2.0-uyumlu paket iskeleti indirme isteği (S5 — ticarileşme/EBYS köprüsü).

    Hızlı yol: frontend elindeki taslak + sonuç üstverisini gönderir (pipeline YOK).
    Yavaş yol: yalnız evrak_text gelirse pipeline koşulur (taslak endpoint deseni).
    """

    evrak_text: str = Field("", max_length=MAX_EVRAK_CHARS)
    taslak_md: str = Field("", max_length=MAX_EVRAK_CHARS)
    filename: str = Field("", max_length=255)
    konu: str = Field("", max_length=500)
    yazi_turu: str = Field("", max_length=50)
    sdp_kodu: str = Field("", max_length=120)
    sdp_adi: str = Field("", max_length=200)
    hedef_birim: str = Field("", max_length=200)
    ilgi_tarih: str = Field("", max_length=40)
    ilgi_sayi: str = Field("", max_length=120)


class YaziDogrulaRequest(BaseModel):
    """Taslağı (opsiyonel doğal-dil revizyon sonrası) verify+risk_guard'dan yeniden geçirme
    isteği — HITL onayına SUNULMADAN önce güvenlik kapılarının atlanmadığından emin olunur.

    talimat boşsa yalnız doğrulama yapılır (elle düzenlenmiş taslak — bkz. sendDraft bug fix);
    doluysa önce DeepSeek taslağı talimata göre revize eder, sonra revize edilmiş metin
    doğrulanır. Revizyon başarısız/LLM yoksa orijinal taslak DEĞİŞTİRİLMEDEN doğrulanır.
    """

    taslak_md: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    evrak_text: str = Field("", max_length=MAX_EVRAK_CHARS)
    yazi_turu: str = Field("", max_length=50)
    evrak_turu: str = Field("", max_length=50)
    hedef_birim: str = Field("", max_length=100)
    bilgi_unsurlari: dict = Field(default_factory=dict, max_length=50)  # DoS-guard: anahtar sayısı sınırlı
    talimat: str = Field("", max_length=500)


class YaziDayanakRequest(BaseModel):
    """Seçili mevzuatı taslağa DETERMİNİSTİK dayanak bloğu olarak işleme (kutucuk kurgusu).

    Pipeline/LLM YOK — base taslağa kapanış-öncesi atıf bloğu yerleştirilir (yazi.dayanak).
    Boş seçim → base AYNEN döner (bire bir undo). Frontend base'i ayrı tutar → bu uç her
    çağrıda TEMİZ base ile gelir (blok yine de idempotent şekilde sökülüp yeniden kurulur).
    """

    taslak_md: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    # Seçili öneriler (MevzuatOneriSchema alt kümesi; yalnız `baslik` kullanılır, gerisi yok sayılır).
    secili_mevzuat: list = Field(default_factory=list, max_length=20)
    yazi_turu: str = Field("", max_length=50)   # yalnız loglama/telemetri


class KurulRequest(BaseModel):
    """AI Bürokrasi Kurulu müzakere isteği — GÜNCEL taslak + bağlam.

    Sunucu verify+risk_guard'ı taslaktan YENİDEN hesaplar (istemci sinyaline güvenmez);
    mevzuat/nli yalnız danışma bağlamıdır. LLM yok/mock/hata → deterministik fallback
    (frontend muzakere.js) — bu uç asla 500'le demoyu düşürmez.
    """

    taslak_md: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    evrak_text: str = Field("", max_length=MAX_EVRAK_CHARS)
    yazi_turu: str = Field("", max_length=50)
    evrak_turu: str = Field("", max_length=50)
    hedef_birim: str = Field("", max_length=100)
    bilgi_unsurlari: dict = Field(default_factory=dict, max_length=50)  # DoS-guard: anahtar sayısı sınırlı
    # Danışma bağlamı (yalnız prompt) — başlıklar sunucuda temizlenir/kısaltılır, KARARA girmez.
    # Liste boyutu sınırlı (DoS/prompt-şişme guard); başlık atıf lisansı DEĞİL, yalnız bağlam.
    mevzuat_onerileri: list = Field(default_factory=list, max_length=20)
    mevzuat_nli: list = Field(default_factory=list, max_length=20)


class OnayResumeRequest(BaseModel):
    """HITL memur onay kararı — duraklamış pipeline'ı sürdürür (Görev 2 yenilikçilik)."""

    thread_id: str = Field(..., min_length=1, max_length=128)
    secim: str = Field("onayla", pattern="^(onayla|duzenle|reddet)$")
    metin: str = Field("", max_length=MAX_EVRAK_CHARS)   # düzenle: yeni gövde
    gerekce: str = Field("", max_length=2000)            # reddet: gerekçe


class MevzuatOneriSchema(BaseModel):
    baslik: str
    # Ekran adı (korpusun resmî ad satırı + madde) — `baslik` eşleştirme anahtarı olarak kalır.
    gosterim_adi: str = ""
    snippet: str | None = None
    url: str | None = None
    score: float = 0.0            # max-normalize: top DAİMA 1.0 → GÖRELİ sıra, mutlak alaka DEĞİL
    raw_score: float | None = None    # tür-boost'lu ham BM25 (sorgu uzunluğuna bağlı)
    norm_score: float | None = None   # raw_score / sorgu_token — güven bandının kaynağı
    # B2 — şeffaflık (kaynak göstermeyen öneri = güven kaybı). Hepsi türetilmiş/doğrulanabilir.
    # NOT: eski adı `dayanak`tı. İdari Türkçede "dayanak" = işlemin HUKUKİ MESNEDİ; bu alan
    # ise önerinin hangi SORGUDAN geldiğini söyler → memur tersten okuyordu, yeniden adlandırıldı.
    eslesme_gerekcesi: str = ""    # "bu öneri hangi talep/aramadan geldi"
    guven: str = ""               # "yüksek" | "orta" | "düşük" (norm_score bandından, kalibre)
    guven_isabet: float | None = None  # bandın gold sette ÖLÇÜLEN top-1 isabeti (tooltip kanıtı)
    inceleme_oner: bool = False    # düşük güven / [DOĞRULA] → insan incelemesi önerilir
    dogrula: bool = False         # başlık/snippet'te [DOĞRULA] işareti
    nli_etiket: str = ""          # NLI açıksa: "destekleniyor" / "[DOĞRULA: anlamsal destek zayıf]"
    yururluk: str = ""            # başlıkta zaten var olan sürüm/yürürlük (uydurma yok)
    # Öneriyi kaynağında doğrulama bağı — /mevzuat/icerik/{kaynak_dosya}, ilgili maddeye atlar.
    kaynak_dosya: str = ""
    madde_no: str | None = None
    kaynak_url: str = ""
    kaynak_turu: str = ""
    kaynak_guven: str = "aday"
    kaynak_dogrulanmis: bool = False
    icerik_sha256: str = ""
    dogrulayan: str = ""
    dogrulama_tarihi: str = ""
    dogrulama_yontemi: str = ""
    kaynak_guven_hatalari: list[str] = Field(default_factory=list)
    madde_tur: str | None = None   # "madde"|"ek"|"gecici" → modal doğru maddeyi vurgular (ek≠normal)
    # S7 — GraphRAG-lite: öneri, top sonucun atıf verdiği mevzuattan 1-hop genişletmeyle geldi.
    atif_genisletme: bool = False
    # İçerik odaklı, talep bazlı yol (agents/mevzuat_yargic) — additive; eski yolda boş.
    talep_id: str = ""            # bilgi_unsurlari.talep_kumesi[].id ile eşleşir
    gerekce: str = ""             # alaka yargıcının kısa gerekçesi (hukuki dayanak DEĞİL)
    katman: str = "esas"          # "esas" (içerik) | "usul" (başvuru usulü / cevap süresi)
    yargic: bool | None = None    # True: yargıçtan geçti · False: yargıçsız yedek · None: eski yol


class AltTalepSchema(BaseModel):
    """Çok-konulu evrak alt-talebi (decompose) — her istek ayrı tür+birim+yasal süre.

    Tek dilekçedeki birden çok istek ayrıştırılır → otomatik havale önerisi. Özet PII-maskeli.
    """

    ozet: str
    tur: str = "belirsiz"
    tur_tr: str = ""
    birim: str = ""
    birim_tr: str = ""
    # Talep bazlı yönlendirme (route_ajan, additive): ICERIDE|DISARIDA|BELIRSIZ + gerçek birim.
    # (Kimlik alanı `id` aşağıda TEK tanımlıdır — talep kümesiyle ortak; çift tanım kaldırıldı.)
    yetki: str = ""
    birim_ad: str = ""
    yetkili_kurum_ad: str = ""
    yazi_turu: str = ""
    cevap_suresi: str = ""        # "30 gün (3071 s.K. m.7)" vb.
    sla_durum: str = ""           # NORMAL | GECIKMIS | KRITIK | tanimsiz | tarih_yok
    # Bu alt-talebin KENDİ hedef birimine yönlendirilen üst yazı taslağı (>= 2 alt-talepte dolu).
    yazi_taslak_md: str = ""
    format_uyumlu: bool = False
    # Talep kümesiyle bağ (additive, 2026-10): kimlik (route_ajan talep kararı aynı id ile
    # eşleşir), kısa resmî konu, birebir kanıt.
    id: str | None = None
    konu: str = ""
    kanit: str = ""


class ProcessResponse(BaseModel):
    """Uçtan-uca pipeline çıktısı (Görev 1 + Görev 2)."""

    evrak_turu: str
    tur_confidence: float = 0.0
    bilgi_unsurlari: dict = Field(default_factory=dict)
    eksik_alanlar: list[str] = Field(default_factory=list)
    clarify_questions: list[str] = Field(default_factory=list)
    # Eksik SAYILMAYAN ama memurun kontrol etmesi gereken notlar (ör. imza doğrulanamadı).
    eksik_bilgi_notlari: list[str] = Field(default_factory=list)
    mevzuat_onerileri: list[MevzuatOneriSchema] = Field(default_factory=list)
    # Yenilikçilik — NLI atıf-gerekçelendirme (her öneri için entailment işareti).
    mevzuat_nli: list = Field(default_factory=list)
    # İçerik odaklı mevzuat yolu: yargıç hiçbir talep için uygun madde bulmadı (dürüst boş).
    mevzuat_bulunamadi: bool = False
    # Talep başına {talep_id, mesele, bulundu} — kartta "uygun mevzuat bulunamadı" satırı.
    mevzuat_talep_durumu: list = Field(default_factory=list)
    ozet: str = ""
    # Kaynak-doğrulamalı ajan: doğrulanmış GERÇEK birim adı (serbest-metin) veya None (fallback).
    hedef_birim: str | None = ""
    hedef_kurum_adi: str = ""
    hedef_birim_oneri: str = ""
    birim_alternatifleri: list[str] = Field(default_factory=list)
    # "Neden bu birim" gerekçe metni (route_ajan/route_birim üretir) — dogrulandi VE
    # fallback_onerisi dalında YAZILIR; boşsa frontend jenerik dipnota düşer.
    birim_reasoning: str = ""
    # ADDITIVE: içerikten türetilen somut hizmet müdürlüğü önerisi ({kod, ad, sinyal}); danışma.
    servis_birimi: dict = Field(default_factory=dict)
    # Kaynak-doğrulamalı yönlendirme (REVİZYON 1/4/6): kurum kimliği + kaynak künyesi + durum.
    muhatap_kurum: dict = Field(default_factory=dict)
    # Evrağı GÖNDEREN idare (nominatif T.C. anteti). Havale hedefi ASLA bu olamaz;
    # UI'da "Gönderen" olarak gösterilir ki memur muhatapla karıştırmasın.
    gonderen_kurum: dict = Field(default_factory=dict)
    yetkili_kurum: dict = Field(default_factory=dict)
    hedef_birim_kaynak: dict = Field(default_factory=dict)   # KaynakKaydi (grounding kanıtı)
    canli_kaynak: dict = Field(default_factory=dict)         # doğrulanmamış canlı kaynak künyesi
    hedef_kategori: str | None = None                        # dürüst fallback köprüsü (eski 9-set)
    durum: str = ""            # "kaynak_dogrulandi" | "llm_onerisi" | "fallback_onerisi"
    insan_onayi_gerekli: bool = False
    # Yönlendirme tek doğruluk kaynağı (agents/yonlendirme.py) + memurun göreceği birim metni.
    yonlendirme: dict = Field(default_factory=dict)
    gosterim_birimi: str = ""
    yazi_turu: str = ""
    # Dinamik yazı planı gerekçesi ("neden bu tür/muhatap"); boş = statik eşleme kullanıldı.
    yazi_plan_notu: str = ""
    # [Akış B] Yazışma paketi (havale/cevap/devir/devir_bilgi) + plan yedek bayrağı.
    yazi_paketi: list = Field(default_factory=list)
    yazi_plan_yedek: bool = False
    # TS 13298 üst-veri (EBYS metadata) — belge türü/konu/SDP kodu+adı/güvenlik/tarih/sayı.
    ust_veri: dict = Field(default_factory=dict)
    # Sistem-tespitli antet künyesi {idare, birim, muhatap} — dinamik kurum kimliği.
    antet_meta: dict = Field(default_factory=dict)
    yazi_taslak_md: str = ""
    format_uyumlu: bool = False
    verify_uyari: list[str] = Field(default_factory=list)
    verify_notes: str = ""
    # S2 — Yönetmelik-2646 lint raporu ({kurallar,uyari,ozet}) + veri-tutarlılık uyarıları.
    lint_2646: dict = Field(default_factory=dict)
    tutarlilik_uyari: list[str] = Field(default_factory=list)
    # Madde 2 — lint ihlalleri için LLM düzeltme önerisi (doğrulanmış; boş = öneri yok).
    lint_duzeltme_md: str = ""
    # S6 — işleme profili rozeti: kvkk-onprem (veri kurumdan çıkmaz) | mock | bulut.
    llm_profil: str = ""
    bilgilendirme: str = ""
    # Yapısal bildirim (GOV.UK ne-oldu/sırada/yapılacak deseni) — metin bundan render edilir.
    bilgilendirme_yapisal: dict = Field(default_factory=dict)
    # Yenilikçilik — Arşivleme (SDP 2005/7) metadata (frontend bununla eşleşir).
    arsiv_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — Yasal süre / SLA triyaj metadata (GECİKMİŞ/KRİTİK rozeti).
    sla_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — Tamper-evident SHA-256 denetim izi (Sayıştay/KVKK).
    denetim_izi: dict = Field(default_factory=dict)
    # Yenilikçilik — Kanıt bağlama (maskeli metin + çıkarım span'ları, sarı vurgu).
    kanit_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — Çok-konulu evrak ayrıştırma (decompose): tek dilekçe → N alt-talep,
    # her biri ayrı tür+birim+yasal süre. Boş liste = tek-konulu (frontend kartı gizler).
    alt_talepler: list[AltTalepSchema] = Field(default_factory=list)
    # Yenilikçilik — Risk bandı (trafik ışığı): {bant: yesil|sari|kirmizi, skor, gerekceler, oneri}.
    # yeşil=yayın-hazır, sarı=memur incelesin, kırmızı=uydurma şüphesi (koşullu HITL tetiği).
    risk_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — HITL memur onay kapısı (varsa). onay_bekliyor=True → frontend onay
    # panelini açar; thread_id ile /process_doc/resume çağrılır. onay_durumu resume sonrası dolar.
    islem_id: str = ""           # DB persistence açıksa kalıcı işlem id'si
    onay_bekliyor: bool = False
    thread_id: str = ""
    onay_durumu: str = ""        # onaylandı | düzenlendi | reddedildi
    onay_gerekce: str = ""
    # OCR meta (dosya yüklendiyse)
    ocr_engine: str | None = None
    page_count: int | None = None
    # OCR güven skoru (0-1) — OCRResponse.confidence'tan taşınır (dosya yolu); metin yolunda None.
    ocr_confidence: float | None = None
    # Uçtan-uca işlem süresi (ms) — route katmanında ölçülür (Panel süre grafiği kaynağı);
    # /resume'da None kalır (kısmi segment süresi yanıltıcı olur).
    sure_ms: int | None = None


class OCRResponse(BaseModel):
    """Salt-OCR çıktısı (/multimodal/ocr)."""

    text: str
    engine: str
    n_chars: int
    page_count: int = 1
    confidence: float | None = None
    error: str | None = None


__all__ = ("MAX_EVRAK_CHARS", "AltTalepSchema", "MevzuatOneriSchema", "OCRResponse",
           "OnayResumeRequest", "ProcessRequest", "ProcessResponse", "YaziEypRequest",
           "YaziRenderRequest", "YaziTaslakRequest")
