"""Görev 1+2 (yenilikçilik) — Çok-konulu evrak ayrıştırma (decompose) node'u.

Kamu gerçeği: vatandaş TEK dilekçeye birden çok talep yazar ("çukur onarımı, AYRICA
fatura itirazı, BİR DE iş başvurusu sonucu..."). Memur o kâğıdı 3 kez fotokopileyip 3
ayrı daireye elle dağıtır. Bu node dilekçeyi alt-taleplere böler ve HER alt-talep için
ayrı {tür, birim, yazı türü, yasal cevap süresi} üretir → otomatik havale önerisi.

Tasarım (CLAUDE.md §1-2):
- DETERMİNİSTİK çekirdek: bağlaç/numara bazlı segmentasyon + keyword zenginleştirme
  (mock/CI'da anahtarsız, tekrarlanabilir). Halüsinasyon yok — tür/birim tablo dışıysa
  makul varsayılan (uydurma yok). Süre yalnız mevzuatta tanımlı (EVRAK_TO_SURE).
- LLM İYİLEŞTİRME (openai modunda): few-shot JSON ile daha iyi segmentasyon + AYNI tek
  çağrıda tur/birim önerisi (kapalı-küme EVRAK_TURLERI/BIRIMLER doğrulamalı; tablo dışı
  değer O ALAN için keyword yoluna düşer). Başarısız olursa deterministik segmente düşer
  (graceful). LLM yalnız ÇOK-talep sinyalinde çağrılır (tek-konulu evrakta ek maliyet yok).
- PII: alt-talep özeti `mask_pii` ile maskelenir (ham TCKN/telefon arayüze ulaşmaz).
- ENV-gated (DECOMPOSE_ENABLED): kapalıyken node grafta yok → baseline birebir korunur.
  Additive — birincil tür/birim/yönlendirme/özet/taslak DEĞİŞMEZ; yalnız alt_talepler eklenir.

Çıktı SÖZLEŞMESİ (frontend + AltTalepSchema ile eşleşir — anahtarlar SABİT):
    alt_talepler = [
        {"ozet": str, "tur": str, "tur_tr": str, "birim": str, "birim_tr": str,
         "yazi_turu": str, "cevap_suresi": str, "sla_durum": str}, ...
    ]
Tek-konulu evrak → [] (frontend kartı gizlenir; gürültü yok).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

import structlog

from agents.config import (
    BIRIMLER,
    DECOMPOSE_CAPA_ESIGI,
    DECOMPOSE_KESIKTE_DUSUNMESIZ,
    EVRAK_TO_BIRIM,
    EVRAK_TO_YAZI,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    birim_tr,
)
from agents.nodes._llm_extract import llm_json
from agents.nodes.route_birim import _content_scores
from agents.nodes.sla_triyaj import compute_sla
from api.pii import mask_for_llm, mask_pii
from core.text import tr_lower

log = structlog.get_logger()

# Alt-talep ayraçları: bağlaçlar + SIRA BİLDİREN sayma + noktalı virgül + madde başları.
#
# SIRA SÖZCÜKLERİ (2026-08-06'da eklendi): "Birinci olarak … İkinci olarak … Üçüncü
# olarak …" Türk dilekçe dilinde çok-konulu başvurunun EN YAYGIN kalıbıdır ama listede
# yoktu; bu kalıpla yazılmış üç talepli bir dilekçe tek parça sayılıyor ve decompose hiç
# çalışmıyordu (ölçüldü). Kalıp güvenli: "olarak/olmak üzere" eki zorunlu tutulduğu için
# "birinci derece akrabam" gibi sıradan kullanımlar ayraç sayılmaz.
_AYRAC = re.compile(
    r"(?:\bayrıca\b|\bbir de\b|\bbunun yanı ?sıra\b|\bbunun yanında\b|\bek olarak\b"
    r"|\bilaveten\b|\bayrıyeten\b|\bdiğer yandan\b|\böte yandan\b|\bhem de\b"
    r"|\bbir diğer\b|\bbir başka\b"
    r"|\b(?:birinci|ikinci|üçüncü|dördüncü|beşinci|son)\s+olarak\b"
    r"|\b(?:birincisi|ikincisi|üçüncüsü|dördüncüsü)\b"
    r"|;|\n\s*\d+[.)]\s|\n\s*[a-zçğşöüı][.)]\s)",
    re.IGNORECASE,
)
_MIN_SEG = 12     # bu uzunluğun altındaki parça fragment sayılır (atılır)
_MAX_OZET = 180   # alt-talep özeti üst sınırı (UI kartı)

# Resmî evrak başlık/künye/imza satırları — segmentasyondan ÖNCE atılır (gövdeye odaklan).
_BASLIK_KOK: tuple[str, ...] = (
    "t.c", "sayı", "sayi", "tarih", "konu", "adı soyad", "ad-soyad", "ad soyad",
    "adres", "telefon", "e-posta", "eposta", "e-imza", "imza", "firma", "dosya no",
    "karar no", "sicil", "ilgili", "i̇lgili", "fatura no", "kurum sicil",
)

# Tek-segment niyet → tür. SIRA önemli: bilgi_edinme/şikayet/ihbar 'talep'ten ÖNCE
# (ör. "öğrenmek istiyorum" 'istiyorum' içerir ama bilgi_edinme'dir).
_NIYET: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bilgi_edinme", ("öğrenmek", "öğrenmek ist", "sonucunu", "sonucu öğ", "akıbet",
                      "durumunu öğ", "ne zaman", "bilgi almak", "bilgi edin", "sorgu",
                      "hakkında bilgi", "sonuç bekl", "öğrenmek istiyor")),
    ("sikayet", ("şikayet", "şikâyet", "yanlış", "hatalı", "itiraz", "mağdur", "haksız",
                 "yanıltıcı", "fazla yansı", "haksızlık", "rahatsız", "yanlış oldu")),
    ("ihbar", ("ihbar", "kaçak", "usulsüz", "ruhsatsız", "bildiriyorum", "şikâyetçiyim")),
    ("talep", ("onar", "düzelt", "yapılmasını", "yapılması", "talep", "rica", "istiyorum",
               "iade", "tahsis", "temin", "kaldırılmasını", "iyileştir", "yenile",
               "tamir", "giderilme", "yapılmasin")),
)

# Belediye konu → birim (route_birim içerik-skorlamasını TAMAMLAR; konu-spesifik öncelik).
_KONU_BIRIM: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ilgili_teknik_daire", ("çukur", "yol", "asfalt", "kaldırım", "altyapı", "kanalizasyon",
                             "su kaçağı", "aydınlatma", "park", "bahçe", "onarım", "tamir",
                             "imar", "inşaat", "yıkım", "tretuvar")),
    ("mali_strateji_sgb", ("fatura", "su faturas", "ödeme", "borç", "tahsilat", "vergi",
                           "harç", "tahakkuk", "meblağ", "tutar", "su faturası")),
    ("insan_kaynaklari", ("iş başvuru", "işe alım", "istihdam", "personel alım", "memur alım",
                          "işe gir", "iş ilan", "kadro talep")),
    ("teftis_ic_denetim", ("soruşturma", "usulsüzlük", "denetim talep")),
)

# ÇOK-talep ön-sinyali: ayraç VAR ya da ≥2 farklı niyet kökü → LLM/segmentasyon dene.
_SINYAL_KOK: tuple[str, ...] = tuple(
    kok for _, koks in _NIYET for kok in koks
)

# Segmentasyonla birlikte tur/birim de AYNI tek çağrıda istenir (ek çağrı/maliyet yok);
# kapalı-küme doğrulaması Python tarafında (_llm_talep) — LLM çıktısına körü körüne güvenilmez.
_LLM_SYSTEM = (
    "Sen bir kamu evrak ayrıştırma asistanısın. Verilen dilekçe/başvuru metnindeki "
    "BİRBİRİNDEN AYRI istekleri ayrı maddelere böl. Her madde TEK somut isteği içersin "
    "(onarım, itiraz, bilgi talebi vb.). Tek istek varsa tek madde döndür. Uydurma EKLEME; "
    "her maddenin 'metin' alanını metnin kendi ifadesiyle yaz. 'tur' YALNIZ şunlardan biri: "
    + ", ".join(EVRAK_TURLERI)
    + ". 'birim' YALNIZ şunlardan biri: "
    + ", ".join(BIRIMLER)
    + '. SADECE şu JSON: {"talepler": [{"metin": "istek 1", "tur": "talep", '
    '"birim": "ilgili_teknik_daire"}]}'
)


# Numaralı liste maddesi ('1) ' / '2. ' vb.) — satır-içi de yakalar. _AYRAC'ın numaralı
# desenleri YALNIZ '\n'-çapalıydı; _govde metni tek satıra düzleştirdiği için o desenler
# govde'de ASLA eşleşmiyordu → numaralı çok-konulu evrak sessizce decompose EDİLMİYORDU.
# ≥2 işaret aranır (tek '(madde 5)' referansı yanlış tetiklemesin); 'm.11' gibi dayanak
# atfı eşleşmez (rakamdan hemen sonra ayraç + boşluk gerekir, 'm.' önekinde boşluk yok).
_NUMARALI_MADDE = re.compile(r"(?:(?<=\s)|^)\d{1,2}[.)]\s")


def _coklu_sinyal(text: str) -> bool:
    """Metinde çok-talep işareti var mı (ayraç · ≥2 numaralı madde · ≥2 farklı niyet kökü)."""
    if _AYRAC.search(text):
        return True
    if len(_NUMARALI_MADDE.findall(text)) >= 2:
        return True
    t = tr_lower(text)
    return sum(1 for kok in set(_SINYAL_KOK) if kok in t) >= 2


def _talep_iceriyor(seg: str) -> bool:
    """Segment bir istek taşıyor mu (niyet ya da konu kökü)."""
    t = tr_lower(seg)
    if any(kok in t for _, koks in _NIYET for kok in koks):
        return True
    return any(kw in t for _, kws in _KONU_BIRIM for kw in kws)


def _baslik_satiri(satir: str) -> bool:
    """Satır künye/başlık/imza mı (segmentasyondan atılır)."""
    s = tr_lower(satir.strip())
    if not s:
        return True
    if any(s.startswith(kok) for kok in _BASLIK_KOK):
        return True
    # Kısa ALL-CAPS kurum satırı (ör. 'KEÇİÖREN BELEDİYE BAŞKANLIĞINA').
    harf = [c for c in satir if c.isalpha()]
    return bool(harf) and len(satir.split()) <= 6 and sum(c.isupper() for c in harf) / len(harf) > 0.7


def _govde(text: str) -> str:
    """Künye/başlık/imza satırlarını ele → istek gövdesi (tek satır)."""
    return " ".join(s.strip() for s in text.splitlines() if not _baslik_satiri(s))


def _heuristik_segment(text: str) -> list[str]:
    """Bağlaç/numara bazlı böl → istek taşıyan, yeterince uzun segmentler."""
    # Düzleşmiş govde'de numaralı liste (≥2 madde) _AYRAC'a takılmaz → önce onu böl,
    # sonra her bloğu bağlaçtan ayır (deterministik yol da numaralı listeyi ayrıştırsın).
    bloklar = (_NUMARALI_MADDE.split(text)
               if len(_NUMARALI_MADDE.findall(text)) >= 2 else [text])
    segs: list[str] = []
    for blok in bloklar:
        for parca in _AYRAC.split(blok):
            s = parca.strip(" ,;.\n\t-—")
            if len(s) >= _MIN_SEG and _talep_iceriyor(s):
                segs.append(s)
    return segs


def _llm_talep(item: Any) -> dict[str, Any] | None:
    """LLM maddesini normalize et: metin zorunlu; tur/birim KAPALI-KÜME doğrulamalı.

    Tablo dışı tur/birim None'a düşer → _enrich o ALAN için keyword yolunu kullanır
    (segment bazında fallback; uydurma sınıf/birim asla arayüze ulaşmaz). Eski düz-string
    şeması da kabul edilir (geriye uyum — tur/birim tamamen keyword'den).
    """
    if isinstance(item, str):
        item = {"metin": item}
    if not isinstance(item, dict):
        return None
    metin = str(item.get("metin") or "").strip()
    if len(metin) < _MIN_SEG:
        return None
    tur, birim = item.get("tur"), item.get("birim")
    return {
        "metin": metin,
        "tur": tur if tur in EVRAK_TURLERI else None,
        "birim": birim if birim in BIRIMLER else None,
    }


_KELIME = re.compile(r"[0-9a-zçğıöşü]+")
_CAPA_MIN_KELIME = 4   # kısa kelimeler (ve/için/bir) çapa sinyali taşımaz
_CAPA_KOK = 5          # Türkçe eklemeli: kök başta, ilk 5 harf eşleşmesi yeterli


def _capa_orani(segment: str, kaynak_norm: str) -> float:
    """Segmentin kaynakta gerçekten karşılığı var mı (0..1).

    Türkçe eklemeli olduğu için tam kelime eşleşmesi aranmaz ("onarılmasını" ↔ "onarım"):
    kök başta durduğundan kelimenin ilk `_CAPA_KOK` harfi kaynakta aranır.
    """
    kelimeler = [k for k in _KELIME.findall(tr_lower(segment)) if len(k) >= _CAPA_MIN_KELIME]
    if not kelimeler:
        return 0.0
    tutan = sum(1 for k in kelimeler if k[:_CAPA_KOK] in kaynak_norm)
    return tutan / len(kelimeler)


async def _llm_segment(text: str) -> list[dict[str, Any]] | None:
    """LLM ile segmentle + tur/birim önerisi al (TEK çağrı). Geçersiz/yok → None (heuristiğe düşülür).

    KAYNAK ÇAPASI (2026-08-07): `tur`/`birim` kapalı-küme ile doğrulanıyordu ama `metin`
    yalnız uzunluk kontrolünden geçiyordu. O metin zararsız bir "özet" değil: çok-konulu
    evrakta her segmentin metni N ayrı RESMÎ YAZI'nın Konu satırına ve gövde tohumuna
    geçiyor (yazi_render), üstelik 2..N taslakları verify'ın uydurma vetosunu görmüyor.
    Yani uydurulmuş bir segment doğrudan resmî çıktıya sızabilirdi.
    Çapa bunu EK LLM ÇAĞRISI OLMADAN, deterministik biçimde kapatır: kaynakta karşılığı
    olmayan segment düşer; 2'nin altına inilirse tüm LLM segmenti reddedilir ve bugünkü
    heuristik yol aynen çalışır (fallback sözleşmesi korunur).
    """
    # KVKK: dış servise ham sayısal PII gitmez (içerik/segment anlamı korunur).
    obj = await llm_json(_LLM_SYSTEM, mask_for_llm(text, None)[:4000], max_tokens=600,
                         kesikte_dusunmesiz=DECOMPOSE_KESIKTE_DUSUNMESIZ)
    if not isinstance(obj, dict):
        return None
    talepler = obj.get("talepler")
    if not isinstance(talepler, list):
        return None
    temiz = [t for t in (_llm_talep(item) for item in talepler) if t]
    if not temiz:
        return None
    if DECOMPOSE_CAPA_ESIGI > 0:
        kaynak_norm = " ".join(_KELIME.findall(tr_lower(text)))
        capali = [t for t in temiz
                  if _capa_orani(t["metin"], kaynak_norm) >= DECOMPOSE_CAPA_ESIGI]
        if len(capali) < len(temiz):
            log.info("decompose_capa_reddi", reddedilen=len(temiz) - len(capali),
                     kalan=len(capali))
        # Tek segment "ayrıştırma" değildir; 2'nin altına düşen LLM çıktısı tümden reddedilir.
        if len(capali) < 2:
            return None
        temiz = capali
    return temiz


def _segment_turu(seg: str) -> str:
    """Tek segmentin türünü keyword niyetinden belirle (deterministik)."""
    t = tr_lower(seg)
    for tur, koks in _NIYET:
        if any(kok in t for kok in koks):
            return tur
    return "talep"  # vatandaş isteklerinin makul varsayılanı


def _segment_birim(seg: str, tur: str) -> str:
    """Segment birimi: konu-spesifik tablo → içerik skoru → tür config'i."""
    t = tr_lower(seg)
    for birim, kws in _KONU_BIRIM:
        if any(kw in t for kw in kws):
            return birim
    skor = _content_scores(t)
    if skor:
        return max(skor, key=lambda b: skor[b])
    return EVRAK_TO_BIRIM.get(tur, "yazi_isleri_evrak")


def _enrich(
    seg: str, tarih_str: str, bugun: date, *,
    tur: str | None = None, birim: str | None = None,
) -> dict[str, Any]:
    """Bir segmenti tür+birim+yazı türü+yasal süre ile zenginleştir (PII maskeli özet).

    tur/birim: LLM'in kapalı-küme DOĞRULANMIŞ önerisi (varsa); None → keyword yolu
    (alan bazında fallback). Yazı türü + SLA türetimi HER ZAMAN deterministik (config).
    """
    tur = tur or _segment_turu(seg)
    birim = birim or _segment_birim(seg, tur)
    sla = compute_sla(tur, tarih_str, bugun)
    if sla.get("sure"):
        cevap = f"{sla['sure']} ({sla['mevzuat']})"
    else:
        cevap = "Yasal süre türe göre tanımlı değil"
    return {
        "ozet": mask_pii(seg).masked_text[:_MAX_OZET].strip(),
        "tur": tur,
        "tur_tr": EVRAK_TURU_TR.get(tur, tur),
        "birim": birim,
        "birim_tr": birim_tr(birim),
        "yazi_turu": EVRAK_TO_YAZI.get(tur, "cevabi_yazi"),
        "cevap_suresi": cevap,
        "sla_durum": sla.get("durum", "tanimsiz"),
    }


def compute_decomposition(
    text: str, unsurlar: dict[str, Any], bugun: date,
) -> list[dict[str, Any]]:
    """SAF + deterministik ayrıştırma (heuristik segment + zenginleştirme).

    Çok-talep sinyali yoksa ya da <2 anlamlı segment çıkarsa [] döner (tek-konulu).
    Test-edilebilir (bugün enjekte edilir). decompose_node bunu LLM segmentle iyileştirebilir.
    """
    govde = _govde(text)
    if not _coklu_sinyal(govde):
        return []
    segs = _heuristik_segment(govde)
    if len(segs) < 2:
        return []
    tarih_str = str(unsurlar.get("tarih") or "")  # tüm metni GEÇİRME (yanlış tarih riski); yoksa tarih_yok
    return [_enrich(s, tarih_str, bugun) for s in segs]


async def decompose_node(state: dict[str, Any]) -> dict[str, Any]:
    """Çok-konulu evrakı alt-taleplere böl (additive, ENV-gated). LLM segment + heuristik fallback."""
    text = state.get("evrak_text", "") or ""
    unsurlar = state.get("bilgi_unsurlari") or {}
    bugun = date.today()
    govde = _govde(text)

    # ayristirma_denendi: boş `alt_talepler`in İKİ ayrı anlamını ayırır (bkz. state.py).
    # Arayüz "bu adım gerekmedi" iddiasını yalnız denenmediğinde kurabilir; boş listeden
    # çıkarım yapmak, gerçekten LLM çağrılmış bir koşumu "iş yapılmadı" diye gösterirdi.
    if not _coklu_sinyal(govde):
        return {"alt_talepler": [], "ayristirma_denendi": False}  # tek-konulu → LLM çağrısı yapma

    tarih_str = str(unsurlar.get("tarih") or "")  # tüm metni GEÇİRME (yanlış tarih riski); yoksa tarih_yok
    talepler = await _llm_segment(govde)
    if talepler and len(talepler) >= 2:
        # LLM segmenti + (doğrulanmışsa) tur/birim önerisi; None alanlar keyword'e düşer.
        alt = [_enrich(t["metin"], tarih_str, bugun, tur=t["tur"], birim=t["birim"])
               for t in talepler]
    else:
        segs = _heuristik_segment(govde)
        if len(segs) < 2:
            # LLM ÇAĞRILDI ama anlamlı bölünme çıkmadı — "gerekmedi" DEĞİL, "tek-konulu".
            return {"alt_talepler": [], "ayristirma_denendi": True}
        alt = [_enrich(s, tarih_str, bugun) for s in segs]
    log.info("decompose", n_alt=len(alt), birimler=[a["birim"] for a in alt])
    return {"alt_talepler": alt, "ayristirma_denendi": True}


__all__ = ("compute_decomposition", "decompose_node")
