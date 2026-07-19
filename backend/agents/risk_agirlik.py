"""Risk ağırlıkları — sinyal taksonomisi + ÖLÇÜLMÜŞ isabet (precision) ile skor üretimi.

NEDEN (eski davranışın kusuru): risk skoru banda göre SABİTTİ (`{yesil:0.1, sari:0.5,
kirmizi:0.9}`) ve arayüz onu gerekçe sayısına eşit bölüyordu. Sonuç ölçüm değil,
yanıltmaydı: 1 uydurma → çubuk %90 ama 9 uydurma → her çubuk %10 (kanıt arttıkça çubuk
KÜÇÜLÜYORDU); tek eksik imzalı SARI belge (%50) felaket KIRMIZI belgeden (%22) büyük
görünüyordu. Toplam skor ise hiç kıpırdamıyordu.

YENİ SÖZLEŞME:
    ağırlık(tip) = CIDDIYET[tip] × isabet(tip)
    skor         = 1 − Π(1 − ağırlıkᵢ)     (noisy-OR)

noisy-OR seçildi çünkü sinyaller BAĞIMSIZ KANITtır ve "biri bile doğruysa belge riskli"
semantiği taşır: kanıt arttıkça skor MONOTON artar, 1.0'ı asla aşmaz, toplama gibi
taşmaz. Çubuk = sinyalin KENDİ ağırlığı (toplamları skora eşit DEĞİLDİR — bu kasıtlı).

İKİ SAYININ EPİSTEMİK STATÜSÜ FARKLIDIR, karıştırma:
  • CIDDIYET → YARGI. "Bu sinyal DOĞRUYSA belge ne kadar kötü olur." Gerekçesi her
    satırın yanında; mevzuat/etki temelli. Ölçüm değildir, iddia da edilmez.
  • isabet   → sinyalin türüne göre üç ayrı statüden biri (bkz. aşağıdaki ayrım).

SİNYALLER İKİ TÜRDÜR — bu ayrım kalibrasyonun temelidir:
  • GÖZLEM (gozlem): deterministik OLGU. "TCKN checksum tutmuyor", "tarih gelecekte",
    "taslakta [DOĞRULA] işareti var", "zorunlu format bölümü yok". Bunlar tahmin değil,
    doğrulanmış gerçektir → isabet = 1.0. ÖLÇÜLMEZ, çünkü ölçülecek bir belirsizlik yok.
    (Yanılabilirlikleri "haksız alarm" değil, ciddiyet düşüklüğüdür → CIDDIYET taşır.)
  • ÇIKARIM (olculdu/onsel): sinyal bir TAHMİNdir ve yanılabilir. "Bu değer kaynakta
    yok" (token eşleşmesi kaçırabilir), "bu bölüm eksik" (anahtar-sözcük yanılır),
    "tür tahminim zayıf", "bu iddia dayanaksız" (LLM). İsabeti ÖLÇÜLMELİDİR:
    `python -m eval.risk_calibration` bağımsız oracle ile sayar → Wilson ALT sınırı
    (muhafazakâr: az örnekte ağırlık şişmez). Ölçülmemişse _ISABET_ONSEL + "onsel"
    bayrağı — rapor da arayüz de bunu gizlemez.

BANT KARARI BU MODÜLDEN ETKİLENMEZ. Bandı `risk_guard.compute_risk` kuralları belirler
(CLAUDE.md: "risk bandı KARARI daima deterministik"). Burası yalnız SKOR + KATKI üretir;
öğrenilmiş/ölçülmüş hiçbir sayı bir belgeyi kırmızıdan yeşile indiremez.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

# Sinyal tipleri (kapalı küme). Frontend detayYorum.js aynı şekilleri sade dile çevirir —
# gerekçe METNİ değişirse iki taraf birlikte güncellenir (metin = makine sözleşmesi).
UYDURMA_GROUNDING = "uydurma_grounding"
UYDURMA_DEGER = "uydurma_deger"
TUTARLILIK = "tutarlilik"
EKSIK_ZORUNLU = "eksik_zorunlu"
TUR_BELIRSIZ = "tur_belirsiz"
DUSUK_GUVEN = "dusuk_guven"
EKSIK_BOLUM = "eksik_bolum"
FORMAT_EKSIK = "format_eksik"
DOGRULA_ISARETI = "dogrula_isareti"
LINT_2646 = "lint_2646"
BILINMEYEN = "bilinmeyen"

# Gerekçe metni → sinyal tipi. Sıra önemli: uydurma desenleri daha spesifik, üstte.
_TAKSONOMI: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"kaynak evrakta yok \(LLM grounding\)"), UYDURMA_GROUNDING),
    (re.compile(r"kaynak evrakta yok"), UYDURMA_DEGER),
    (re.compile(r"^Tutarlılık:"), TUTARLILIK),
    (re.compile(r"^Eksik zorunlu bilgi:"), EKSIK_ZORUNLU),
    (re.compile(r"^Evrak türü belirsiz"), TUR_BELIRSIZ),
    (re.compile(r"^Düşük sınıflandırma güveni"), DUSUK_GUVEN),
    (re.compile(r"^Eksik bölüm:"), EKSIK_BOLUM),
    (re.compile(r"^Resmî yazı zorunlu format bölümleri eksik"), FORMAT_EKSIK),
    (re.compile(r"alan doğrulanmalı"), DOGRULA_ISARETI),
    (re.compile(r"^Format \(2646 lint\):"), LINT_2646),
)

# CIDDIYET — YARGI (ölçüm değil): sinyal doğruysa belgeye verdiği zarar.
CIDDIYET: dict[str, float] = {
    # Resmî yazıya kaynaksız İDDİA girer; imzalanınca kurumu bağlar → en ağır.
    UYDURMA_GROUNDING: 0.90,
    # Uydurma somut tarih/sayı: tebligat süresi ya da dosya no yanlışsa işlem sakatlanır.
    UYDURMA_DEGER: 0.85,
    # Kaynak evrak içi çelişki (TCKN checksum, gelecek tarih) — veri güvenilmez.
    TUTARLILIK: 0.45,
    # 3071 m.4: kritik unsur eksikse dilekçe incelenemez.
    EKSIK_ZORUNLU: 0.40,
    # Tür bilinmiyorsa yanlış birime havale riski doğar.
    TUR_BELIRSIZ: 0.35,
    EKSIK_BOLUM: 0.30,      # 2646 zorunlu bölüm yok → yazı iade edilebilir
    FORMAT_EKSIK: 0.30,
    DUSUK_GUVEN: 0.30,
    # Açıkça işaretli "bilinen bilinmeyen" — memur zaten uyarılmış, gizli hata değil.
    DOGRULA_ISARETI: 0.25,
    LINT_2646: 0.20,        # biçim ayrıntısı; içerik doğru kalır
    BILINMEYEN: 0.30,       # tanınmayan yeni sinyal → muhafazakâr orta ciddiyet
}

# GÖZLEM sinyalleri: deterministik olgu bildirir, tahmin etmez → isabet 1.0, ölçülmez.
#   tutarlilik      : TCKN checksum / gelecek tarih / m.11 sayı deseni — matematiksel olgu
#   dogrula_isareti : "[DOĞRULA]" işareti taslakta LİTERAL olarak vardır
#   lint_2646       : yönetmelik regex kuralı ihlali — metinde ya vardır ya yoktur
#   format_eksik    : zorunlu bölüm checklist'i (yazi_taslak'ın kendi bayrağı)
GOZLEM: frozenset[str] = frozenset(
    {TUTARLILIK, DOGRULA_ISARETI, LINT_2646, FORMAT_EKSIK})

# ÇIKARIM sinyalinde ölçüm yoksa kullanılan ÖNSEL. Ölçüm DEĞİLDİR; "onsel" ile raporlanır.
# 0.70: "sinyal 10 kez ateşlenirse ~7'sinde haklıdır" — kalibrasyon bunu yerinden eder.
_ISABET_ONSEL = 0.70

# isabet() / agirlik() ikinci dönüş değeri: sayının epistemik statüsü.
GOZLEM_DURUM, OLCULDU, ONSEL = "gozlem", "olculdu", "onsel"

_KALIBRASYON_DOSYA = Path(__file__).resolve().parent.parent / "eval" / "runs" / "risk_calibration.json"


@lru_cache(maxsize=1)
def kalibrasyon_yukle(yol: str | None = None) -> dict[str, dict[str, Any]]:
    """Ölçülmüş isabet tablosunu oku → {tip: {"isabet_alt": float, "n": int, ...}}.

    Dosya yok/bozuk → {} (sessizce önsele düşülür; eval çalıştırılmadan da sistem ayakta).
    """
    hedef = Path(yol) if yol else _KALIBRASYON_DOSYA
    try:
        veri = json.loads(hedef.read_text(encoding="utf-8"))
        tipler = veri.get("tipler")
        return tipler if isinstance(tipler, dict) else {}
    except (OSError, ValueError):
        return {}


def isabet(tip: str) -> tuple[float, str]:
    """(isabet, statü). GÖZLEM → (1.0, "gozlem"); ölçülmüş çıkarım → Wilson alt sınırı;
    aksi → (_ISABET_ONSEL, "onsel"). Statü asla gizlenmez, sunuma taşınır."""
    if tip in GOZLEM:
        return 1.0, GOZLEM_DURUM
    kayit = kalibrasyon_yukle().get(tip)
    if isinstance(kayit, dict):
        alt = kayit.get("isabet_alt")
        if isinstance(alt, (int, float)) and 0.0 <= float(alt) <= 1.0:
            return float(alt), OLCULDU
    return _ISABET_ONSEL, ONSEL


def gerekce_tipi(gerekce: str) -> str:
    """Gerekçe metnini kapalı-küme sinyal tipine eşle (tanınmayan → BILINMEYEN)."""
    metin = str(gerekce or "").strip()
    # risk_guard 'Uydurma şüphesi — ' öneki ekler; taksonomi ham verify metnine bakar.
    govde = metin.split("—", 1)[1].strip() if metin.startswith("Uydurma şüphesi —") else metin
    for desen, tip in _TAKSONOMI:
        if desen.search(govde):
            return tip
    return BILINMEYEN


def agirlik(tip: str) -> tuple[float, str]:
    """Sinyal ağırlığı = ciddiyet × isabet → (ağırlık, statü)."""
    p, durum = isabet(tip)
    return CIDDIYET.get(tip, CIDDIYET[BILINMEYEN]) * p, durum


def noisy_or(agirliklar: list[float]) -> float:
    """1 − Π(1 − wᵢ): bağımsız kanıt birleşimi. Monoton artar, [0,1] dışına çıkmaz."""
    kalan = 1.0
    for w in agirliklar:
        kalan *= 1.0 - min(max(float(w), 0.0), 1.0)
    return 1.0 - kalan


def kusur_olasiligi(gerekceler: list[str]) -> float:
    """P(en az bir ÇIKARIM sinyali gerçek kusuru işaret ediyor) = 1 − Π(1 − isabetᵢ).

    SKORDAN AYRI BİR BÜYÜKLÜKTÜR — karıştırmak kategori hatasıdır:
      • skor            = Σ⊕ (ciddiyet × isabet)  → BEKLENEN ZARAR (önceliklendirme için)
      • kusur_olasiligi = Σ⊕ (isabet)             → OLASILIK (kalibre edilebilir, Brier'e girer)
    Ciddiyet bir yargı olduğu için skor bir olasılık DEĞİLDİR ve "%90 ihtimalle kusurlu"
    diye okunamaz. Gözlem sinyalleri (isabet=1.0) buraya alınmaz: onlar zaten kesindir,
    olasılık hesabına girerse her belgeyi 1.0'a çakar ve ölçüm anlamsızlaşır.
    """
    isabetler = [isabet(t)[0] for t in (gerekce_tipi(g) for g in gerekceler) if t not in GOZLEM]
    return round(noisy_or(isabetler), 4)


def skor_ve_katkilar(gerekceler: list[str]) -> tuple[float, list[float], str]:
    """Gerekçe listesinden (skor, katkılar, kalibrasyon_durumu) üret.

    katkılar[i] = o gerekçenin KENDİ ağırlığı (çubuk yüksekliği). Toplamları skora eşit
    değildir — noisy-OR toplamsal değildir; arayüz bunu açıkça yazar.
    kalibrasyon durumu: her sinyal gözlem ya da ölçülmüş çıkarımsa "olculdu"; hiçbiri
    değilse "onsel"; karışıksa "kismi". Skorun ne kadarının ölçüme dayandığı GİZLENMEZ.
    """
    if not gerekceler:
        return 0.0, [], ONSEL
    katkilar: list[float] = []
    durumlar: list[str] = []
    for g in gerekceler:
        w, durum = agirlik(gerekce_tipi(g))
        katkilar.append(round(w, 4))
        durumlar.append(durum)
    dayanakli = [d != ONSEL for d in durumlar]   # gözlem veya ölçüm = dayanaklı
    kalibrasyon = (OLCULDU if all(dayanakli) else ONSEL if not any(dayanakli) else "kismi")
    return round(noisy_or(katkilar), 4), katkilar, kalibrasyon


__all__ = (
    "BILINMEYEN",
    "CIDDIYET",
    "DOGRULA_ISARETI",
    "DUSUK_GUVEN",
    "EKSIK_BOLUM",
    "EKSIK_ZORUNLU",
    "FORMAT_EKSIK",
    "GOZLEM",
    "GOZLEM_DURUM",
    "LINT_2646",
    "OLCULDU",
    "ONSEL",
    "TUR_BELIRSIZ",
    "TUTARLILIK",
    "UYDURMA_DEGER",
    "UYDURMA_GROUNDING",
    "agirlik",
    "gerekce_tipi",
    "isabet",
    "kalibrasyon_yukle",
    "kusur_olasiligi",
    "noisy_or",
    "skor_ve_katkilar",
)
