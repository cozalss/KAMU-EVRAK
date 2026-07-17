"""Karar/inceleme grounding — soyut taahhüt uydurmasının deterministik vetosu.

verify.py'nin `_uydurma_veto`'su yalnız SOMUT tarih/sayı/ad uydurmasını yakalar; kendi
docstring'i (verify.py:103-105) "yalnız-niteliksel uydurma (ad/sayı içermeyen soyut
taahhüt) burada yakalanmaz" diye açıkça itiraf eder. Bu modül o boşluğu kapatır:

  Kullanıcı şikâyeti: "gerçekte incelenmeyen bir evrak için 'incelenmiştir'",
  "yetkisi bilinmeden 'uygun bulunmuştur' / 'reddedilmiştir'".

TEMEL İÇGÖRÜ: taslak ÜRETİM anında evrak henüz İNSAN tarafından incelenmedi ve karar
HITL onay kapısında verilecek — yani review_completed ve decision_exists bu aşamada
DAİMA false. Dolayısıyla taslak gövdesinde TAMAMLANMIŞ inceleme/karar iddiası
("incelenmiştir", "uygun bulunmuştur", "reddedilmiştir"), bu iddia KAYNAK evrakta
(aynı fiil köküyle) geçmiyorsa, uydurmadır — mevcut `_uydurma_veto` deseniyle birebir
aynı mantık (taslakta var + kaynakta yok = uydurma), yalnız somut token yerine
tamamlanmış-edilgen karar/inceleme FİİL kalıpları üzerinde.

DETERMİNİSTİK: LLM yok, saf regex → mock/CI'da da çalışır, PYTHONHASHSEED'den bağımsız.
GÜVENLİK: dönen mesaj `_UYDURMA_IMZA` ("kaynak evrakta yok") taşır → risk_guard bunu
KIRMIZI'ya çevirir (deterministik veto, tek başına HITL onayı zorunlu kılar). Kaynakta
geçen / talep-kipi (görülmesi/incelenmesi) kalıplar MUAF (yanlış-pozitif önleme).
"""
from __future__ import annotations

import re

from core.text import tr_lower

# İmza — verify._uydurma_veto ile AYNI: risk_guard._UYDURMA_IMZA bunu KIRMIZI yapar
# (deterministik veto; grounding-LLM imzası değil → SARI'ya düşmez, tam KIRMIZI).
_IMZA = "kaynak evrakta yok"

# TAMAMLANMIŞ inceleme/karar iddiaları — edilgen + bitmiş kip ("-mış/-miş … -tir" veya
# "-mış olup/olarak"). Yalnız İŞ-BİTTİ iddiaları; TALEP/GELECEK kipleri (incelenmesi,
# değerlendirilmesi, uygun görülmesi, incelenmek üzere) BİLİNÇLİ olarak DIŞARIDA — onlar
# meşru sevk/talep dilidir. Her kalıbın "fiil kökü" grounding muafiyeti için ayrı tutulur:
# aynı kök kaynak evrakta geçiyorsa (ör. gelen cevabî yazı zaten "reddedilmiştir" diyorsa),
# taslak ona atıf yapabilir → veto edilmez.
_KARAR_KALIPLARI: tuple[tuple[str, str], ...] = (
    # (regex kalıbı, fiil kökü — kaynak muafiyet anahtarı)
    (r"incelenmiş(?:tir| olup| olarak| bulun)", "incelen"),
    (r"tetkik edilmiş(?:tir| olup)", "tetkik edil"),
    (r"değerlendirilmiş(?:tir| olup| bulunmuş)", "değerlendiril"),
    (r"uygun bulunmuş(?:tur| olup)", "uygun bulun"),
    (r"uygun görülmüş(?:tür| olup)", "uygun görül"),
    (r"uygun bulunmamış(?:tır)?", "uygun bulun"),
    (r"uygun görülmemiş(?:tir)?", "uygun görül"),
    (r"onaylanmış(?:tır| olup)", "onaylan"),
    (r"kabul edilmiş(?:tir| olup)", "kabul edil"),
    (r"reddedilmiş(?:tir| olup)", "reddedil"),
    (r"reddolunmuş(?:tur)?", "reddol"),
    (r"iptal edilmiş(?:tir| olup)", "iptal edil"),
    (r"ruhsat(?:ı)? (?:verilmiş|düzenlenmiş)(?:tir)?", "ruhsat veril"),
    (r"izin verilmiş(?:tir)?", "izin veril"),
    (r"karar verilmiş(?:tir)?", "karar veril"),
    (r"karara bağlanmış(?:tır)?", "karara bağlan"),
)
_DERLI: tuple[tuple[re.Pattern[str], str, str], ...] = tuple(
    (re.compile(p), kok, p) for p, kok in _KARAR_KALIPLARI
)

# Henüz doldurulmamış jinja placeholder'ları — uydurma değil, muaf.
_RE_PLACEHOLDER = re.compile(r"\{\{.*?\}\}", re.DOTALL)


# Doldurulmamış iskelet/placeholder ifadeleri — render gerçek değeri koyamadığında metinde
# kalan "boş" işaretler. Bunlar UYDURMA değil (grounding beyaz-listesinde) ama nihai belgede
# BELİRSİZ muhatap/imza olarak kalmamalı (kullanıcı §5/§6: "[BİLGİ GEREKLİ]" uyarısı + dışa
# aktarma engeli). GERÇEK birim etiketleri (ör. "İlgili Teknik / Ana Hizmet Dairesi" — ölçülen
# 9-birimden biri) BİLİNÇLİ olarak DIŞARIDA: onlar meşru routing hedefidir, belirsiz değil.
_BELIRSIZ_IFADELER: tuple[tuple[str, str], ...] = (
    ("yetkili imza", "İmzalayacak yetkilinin adı/unvanı"),
    ("birim yetkilisi", "İmzalayacak yetkilinin adı/unvanı"),
    ("yetkili makam", "Kesin muhatap/onay makamı"),
    ("ilgili makama", "Kesin muhatap birim"),
    ("ilgili makam ", "Kesin muhatap birim"),
    ("kamu kurumu", "Kurum adı"),
)


def belirsiz_makam_uyari(taslak: str) -> list[str]:
    """Doldurulmamış iskelet ifadesi (Yetkili İmza / İlgili Makama / KAMU KURUMU) nihai
    metinde kaldıysa "[BİLGİ GEREKLİ]" uyarısı üret (§5/§6). Gerçek birim etiketleri muaf.

    UYDURMA imzası taşımaz → risk_guard'ı tek başına KIRMIZI yapmaz (bunlar uydurma değil,
    eksik-bilgi işareti); UI'da görünür + eksik-bilgi sinyali olarak HITL'e taşınır.
    """
    if not taslak:
        return []
    govde = tr_lower(_RE_PLACEHOLDER.sub(" ", taslak))
    uyarilar: list[str] = []
    gorulen: set[str] = set()
    for ifade, alan in _BELIRSIZ_IFADELER:
        if ifade in govde and alan not in gorulen:
            gorulen.add(alan)
            uyarilar.append(f"[BİLGİ GEREKLİ: {alan}] — taslakta belirsiz/genel ifade var, "
                            "kesinleştirilmeden gönderilmemeli.")
    return uyarilar


def karar_grounding_veto(taslak: str, evrak_text: str) -> list[str]:
    """Taslakta tamamlanmış inceleme/karar iddiası var + kaynakta (aynı kök) yok → uyarı.

    Dönen her mesaj `_IMZA` ("kaynak evrakta yok") taşır → risk_guard KIRMIZI yapar.
    Placeholder blokları ve kaynakta kökü geçen kalıplar muaftır. Boş taslak → [].
    """
    if not taslak:
        return []
    govde = tr_lower(_RE_PLACEHOLDER.sub(" ", taslak))
    kaynak = tr_lower(evrak_text or "")
    uyarilar: list[str] = []
    gorulen: set[str] = set()
    for rx, kok, _ham in _DERLI:
        m = rx.search(govde)
        if not m:
            continue
        # Kaynak muafiyeti: aynı fiil kökü gelen evrakta geçiyorsa taslak ona atıf yapıyor
        # olabilir (ör. gelen yazı zaten "reddedilmiştir") → uydurma sayma.
        if kok in kaynak:
            continue
        bulunan = m.group(0)
        if bulunan in gorulen:
            continue
        gorulen.add(bulunan)
        uyarilar.append(
            f"Taslaktaki '{bulunan}' karar/inceleme ifadesi kaynak evrakta yok — "
            f"evrak henüz incelenmeden/karar verilmeden bu ifade kullanılamaz (doğrulayın)."
        )
    return uyarilar


__all__ = ("belirsiz_makam_uyari", "karar_grounding_veto")
