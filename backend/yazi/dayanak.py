"""Seçili mevzuat → resmî yazıya DETERMİNİSTİK dayanak (atıf) bloğu.

Görev 2 kurgusu: memur "İlgili mevzuat" panelindeki öneriyi KUTUCUKLA işaretler → o madde(ler)
resmî yazıya yasal dayanak olarak işlenir; işaret kaldırılınca taslak BİRE BİR eski hâline döner
(memur base'i korur → boş seçim = değişiklik yok). Birden çok seçim hepsini atıflar.

SIFIR UYDURMA (CLAUDE.md §1): dayanak metni yalnız memurun SEÇTİĞİ, korpus-destekli öneri
BAŞLIKLARINDAN kurulur — yeni madde/kanun/sayı ÜRETİLMEZ, panelde görünen etiket AYNEN işlenir.
Yalnız GERÇEK atıf ŞEKLİNDEKİ (madde referanslı) başlıklar geçer (`_gecerli_atif`); serbest metin
/ gömülü tutar reddedilir. Blok İNSAN-KÜRELİ referanstır (HITL) — bu yüzden anti-halüsinasyon
grounding'i (verify.py) LLM üretimi GÖVDEyi denetlerken bloğu `dayanak_blogunu_cikar` ile ayırır:
istemci-kontrollü hiçbir "whitelist" metni grounding'e girmez (güvenli; bkz. verify._grounding_iddialar).
Deterministik uydurma-vetosu (6+ hane sayı / tarih) taslağın TAMAMINA — dayanak bloğu dâhil — uygulanır.

Yerleştirme (additive text-surgery): kapanış satırından ÖNCE. Render pipeline'a, şablona veya
YaziContext'e DOKUNULMAZ. Kapanış satırı 6 türde de render'da DAİMA tam 9 boşluk girintilidir
(`{{ " " * 9 }}`) → muhatap(26)/imza(46)/OLUR(33) girintilerinden tekil olarak ayrışır.
"""

from __future__ import annotations

import re

# "Dayanak : " — İlgi/Konu ile aynı etiket dilinde resmî blok başlığı (Yön. 2646 üslubu).
# Devam satırı girintisi = etiket uzunluğu (10) → kapanış anchor'ıyla (tam 9) ÇAKIŞMAZ.
_ETIKET = "Dayanak : "
_GIRINTI = " " * len(_ETIKET)
# Çok maddeli listede a)/b)/c) harflendirmesi (İlgi bloğu deseni). Üst sınır DoS/şişme guard'ı.
_HARF = "abcdefgh"
_MAKS_ATIF = len(_HARF)          # en çok 8 dayanak (panel 3 öneri gösterir; bol pay)
_MAKS_ATIF_KARAKTER = 200        # tek atıf etiketi üst sınırı (satır enjeksiyonu + şişme guard)
_MIN_ATIF_KARAKTER = 6           # meşru atıf tabanı (kısa başlık gürültüdür)

# Var olan dayanak bloğunu tanımak için (idempotency + grounding ayrımı): "Dayanak :" etiket satırı.
# MULTILINE: `^` her SATIR başında eşleşsin (search taslağın ORTASINDAki bloğu bulabilsin).
_ETIKET_DESEN = re.compile(r"^Dayanak\s*:", re.MULTILINE)
# Devam satırı deseni — YALNIZ bu modülün ürettiği "<10 boşluk>x) " harf-satırları (blok-kapsamlı
# sök; gevşek girinti-genişliği eşleşmesi imza/muhatap satırını yanlışlıkla silmesin).
_DEVAM_DESEN = re.compile(r"^" + re.escape(_GIRINTI) + r"[a-h]\) ")
# Satır enjeksiyonu guard'ı: ASCII kontrol (0x00-0x1F: \t\r\n dâhil) + Unicode satır ayraçları
# (U+0085 NEL, U+2028 LS, U+2029 PS) — bunlar splitlines()/DOCX render'ında SATIR SONU sayılır;
# kırpılmazsa istemci başlığa gömüp DOCX'te BAĞIMSIZ sahte paragraf açabilir (PDF yalnız \n böler).
# Ham (raw) desen: kaçışları REGEX motoru çözer (\x85/  regex-destekli) → kaynak belirsizliği yok.
_KONTROL_DESEN = re.compile(r"[\r\n\t\x00-\x1f\x85  ]+")
# Meşru atıf en az bir HARF taşır (rakam/işaret değil).
_HARF_DESEN = re.compile(r"[^\W\d_]", re.UNICODE)
# Atıf ŞEKLİ: gerçek mevzuat başlığı DAİMA madde referansı taşır — "m.<no>" (ek/geç. dâhil) ya da
# `_baslik`'in [DOĞRULA] işareti. Serbest metin / gömülü tutar ("Ödenek 500.000 TL...") reddedilir
# → yazıya sızmaz, grounding-ayrımına da güvenilmez içerik girmez.
_MADDE_REF_DESEN = re.compile(r"m\.\s*\d|\[DOĞRULA")


def _gecerli_atif(s: str) -> bool:
    """Etiket meşru bir mevzuat atfı ŞEKLİNDE mi (çok-token + harfli + madde referanslı)?

    Gerçek başlık `_baslik`'ten gelir: "<mevzuat> m.<no>" veya "<mevzuat> [DOĞRULA: madde no]".
    Kısa/harfsiz/madde-referanssız istemci girdisi (gürültü ya da gömülü sahte tutar) elenir.
    """
    return (len(s) >= _MIN_ATIF_KARAKTER
            and len(s.split()) >= 2
            and _HARF_DESEN.search(s) is not None
            and _MADDE_REF_DESEN.search(s) is not None)


def _atif_satiri(m: dict) -> str:
    """Tek öneriden atıf etiketi — panelde görünen `baslik` AYNEN (tek-satıra indirgenmiş).

    Kontrol karakterleri + Unicode satır ayraçları boşluğa çevrilir (satır/paragraf enjeksiyonu
    guard'ı: istemci başlığa \\n/U+2028 koyup taslağa/DOCX'e BAĞIMSIZ sahte satır ekleyemesin),
    boşluk sıkıştırılır, uzunluk sınırlanır. Yeni bilgi ÜRETİLMEZ — yalnız seçilen etiket taşınır.
    """
    ham = str(m.get("baslik", "") or "")
    tek = _KONTROL_DESEN.sub(" ", ham)
    tek = re.sub(r"\s+", " ", tek).strip()
    return tek[:_MAKS_ATIF_KARAKTER]


def _atiflar(secili: list) -> list[str]:
    """Seçili önerilerden temiz, GEÇERLİ, TEKİL, sıralı atıf etiketleri (üst sınır)."""
    out: list[str] = []
    gorulen: set[str] = set()
    for m in secili or []:
        if not isinstance(m, dict):
            continue
        atif = _atif_satiri(m)
        if not atif or not _gecerli_atif(atif):
            continue
        anahtar = atif.casefold()
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        out.append(atif)
        if len(out) >= _MAKS_ATIF:
            break
    return out


def dayanak_blok(secili: list) -> str:
    """Seçili mevzuattan resmî "Dayanak" bloğu metni (boş/geçersiz seçim → "").

    Tek atıf → "Dayanak : <etiket>". Çok atıf → a)/b)/c) harflendirmeli, devam satırları
    etiket genişliğinde hizalı (İlgi bloğu deseni). Blok GÖVDE metnidir (yeni zorunlu-alan
    başlığı değil) → 2646 format-uyumunu bozmaz (placeholder yok).
    """
    atiflar = _atiflar(secili)
    if not atiflar:
        return ""
    if len(atiflar) == 1:
        return f"{_ETIKET}{atiflar[0]}"
    satirlar = [f"{_ETIKET}{_HARF[0]}) {atiflar[0]}"]
    for i, atif in enumerate(atiflar[1:], start=1):
        satirlar.append(f"{_GIRINTI}{_HARF[i]}) {atif}")
    return "\n".join(satirlar)


def dayanak_blogunu_cikar(taslak: str) -> str:
    """Var olan "Dayanak" bloğunu taslaktan sök.

    İki kullanım: (1) idempotency — dayanak_uygula her çağrıda bloğu söküp yeniden kurar;
    (2) grounding ayrımı — verify._grounding_iddialar, LLM'e taslağı bu blok ÇIKARILMIŞ olarak
    verir (insan-küreli atıf, LLM üretimi değil → anti-halüsinasyon denetiminin konusu değil;
    ve istemci-kontrollü metin grounding'e girmez). Etiket satırı + YALNIZ kendi harf-devam
    satırları atılır (blok-kapsamlı; imza/muhatap yanlışlıkla silinmez); üçlü boş satır ikiye iner.
    """
    if _ETIKET_DESEN.search(taslak) is None:
        return taslak
    lines = taslak.split("\n")
    out: list[str] = []
    i = 0
    n = len(lines)
    while i < n:
        if _ETIKET_DESEN.match(lines[i]):
            i += 1
            while i < n and _DEVAM_DESEN.match(lines[i]):
                i += 1
            continue
        out.append(lines[i])
        i += 1
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out))


def _kapanis_index(lines: list[str]) -> int | None:
    """Kapanış satırının indeksi — render'da DAİMA tam 9 boşluk girintili ilk satır."""
    for i, ln in enumerate(lines):
        if ln.strip() and (len(ln) - len(ln.lstrip(" "))) == 9:
            return i
    return None


def _imza_index(lines: list[str]) -> int | None:
    """İmza bloğu — ≥40 boşluk girintili ilk satır (kapanış bulunamazsa yedek anchor)."""
    for i, ln in enumerate(lines):
        if ln.strip() and (len(ln) - len(ln.lstrip(" "))) >= 40:
            return i
    return None


def dayanak_uygula(taslak_md: str, secili: list) -> str:
    """Taslağa seçili mevzuat dayanağını işle — kapanıştan ÖNCE, deterministik.

    Boş/geçersiz seçim → taslak (varsa eski dayanak bloğu sökülmüş) AYNEN döner → bire bir undo.
    Anchor: kapanış (9 boşluk) → yoksa imza (≥40 boşluk) → yoksa metin sonuna eklenir
    (hiçbir durumda geçersiz taslak üretilmez). Var olan blok önce sökülür (idempotent).
    """
    temiz = dayanak_blogunu_cikar(taslak_md)
    blok = dayanak_blok(secili)
    if not blok:
        return temiz
    lines = temiz.split("\n")
    blok_satir = blok.split("\n")
    yer = _kapanis_index(lines)
    if yer is None:
        yer = _imza_index(lines)
    if yer is None:
        return "\n".join([*lines, "", *blok_satir])
    return "\n".join([*lines[:yer], *blok_satir, "", *lines[yer:]])


__all__ = ("dayanak_blok", "dayanak_blogunu_cikar", "dayanak_uygula")
