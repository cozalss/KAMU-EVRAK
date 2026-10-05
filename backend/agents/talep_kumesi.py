"""Tek talep kümesi (TalepKumesi) — belgedeki isteklerin TEK doğruluk kaynağı.

NEDEN (teşhis 2026-10-05, sorun 4): iki ajan birbirinden bağımsız iki talep çıkarıcı
çalıştırıyordu — `cikar` kapalı fiil listeli bir regex, `decompose` ayrı bir LLM çağrısı +
ayrı bir heuristik. Ölçüm: 12 metnin 9'unda talep sayıları farklıydı, cikar recall'ı %43'tü,
alt akış ikisini karıştırıyordu. Çelişkiyi yapısal olarak imkânsız kılmak için talepler
yalnız BİR yerde (cikar'ın tek LLM çağrısında) çıkarılır; diğer her şey (talepler string
listesi, alt_talepler, Konu, gövde bağlamı) bu yapıdan deterministik olarak TÜRETİLİR.

Öğe sözleşmesi (akışlar arası arayüz):
    {"id": "t1", "kanit": <evrak metninden birebir alıntı, maskeli>,
     "ozet": <2-6 kelime isim öbeği>, "tur": <EVRAK_TURLERI>, "birim_ipucu": <BIRIMLER|None>}

Güvenlik ağı (deterministik): LLM öğesinin kanıtı kaynakta birebir geçmezse öğe düşer;
özet kaynak köklerine çapalanmazsa kanıttan kısaltılır; tür/birim kapalı küme dışındaysa
düşer. LLM yok/hata/0 geçerli öğe → AYNI tip, morfolojik heuristikle üretilir (kelime
listesi değil: Türkçe istek cümlesinin biçimi — yüklem + adlaşmış nesne).
"""

from __future__ import annotations

import re
from typing import Any

from agents.config import BIRIMLER, EVRAK_TURLERI
from api.pii import mask_for_llm
from core.text import tr_lower, tr_upper

TALEP_AZAMI = 8            # kurul.py zaten [:8] okuyor
OZET_CAPA_ESIGI = 0.6      # özet bir parafrazdır; kanıt kadar katı değil ama kökleri kaynakta
_KANIT_AZAMI = 300
_OZET_AZAMI_KELIME = 8
_KANIT_MIN_KR = 12

# ---------------------------------------------------------------------------
# Niyet → tür (deterministik yedek; decompose da buradan okur)
# ---------------------------------------------------------------------------
# SIRA önemli: bilgi_edinme/şikayet/ihbar 'talep'ten ÖNCE ("öğrenmek istiyorum" bilgi_edinme).
NIYET: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bilgi_edinme", ("öğrenmek", "sonucunu", "akıbet", "durumunu öğ", "ne zaman",
                      "bilgi almak", "bilgi edin", "hakkında bilgi", "sonuç bekl")),
    ("sikayet", ("şikayet", "şikâyet", "yanlış", "hatalı", "itiraz", "mağdur", "haksız",
                 "yanıltıcı", "fazla yansı", "rahatsız")),
    ("ihbar", ("ihbar", "kaçak", "usulsüz", "ruhsatsız", "bildiriyorum")),
    ("talep", ("onar", "düzelt", "yapılmasını", "yapılması", "talep", "rica", "istiyorum",
               "iade", "tahsis", "temin", "kaldırılmasını", "iyileştir", "yenile",
               "tamir", "giderilme")),
)


def niyet_turu(metin: str) -> str:
    """Tek istek metninin türü (deterministik yedek)."""
    t = tr_lower(metin)
    for tur, koks in NIYET:
        if any(kok in t for kok in koks):
            return tur
    return "talep"


# ---------------------------------------------------------------------------
# Kaynak çapası
# ---------------------------------------------------------------------------
_KELIME = re.compile(r"[0-9a-zçğıöşüâîû]+")
_CAPA_MIN_KELIME = 4   # kısa kelimeler (ve/için/bir) çapa sinyali taşımaz
_CAPA_KOK = 5          # Türkçe eklemeli: kök başta
# Ünsüz yumuşaması (sokak→sokağı, kitap→kitabı, renk→rengi): kök karşılaştırmasından önce
# iki taraf da sert ünsüze indirgenir. Olmadan 'Sokaktaki'↔'Sokağımızda' 0,67 çıkıyordu.
_YUMUSAMA = str.maketrans({"ğ": "k", "c": "ç", "d": "t", "b": "p", "â": "a", "î": "i", "û": "u"})


def _kok_norm(metin: str) -> str:
    return " ".join(_KELIME.findall(tr_lower(metin or ""))).translate(_YUMUSAMA)


def capa_orani(segment: str, kaynak: str) -> float:
    """Segmentin anlamlı kelime köklerinin kaynakta geçme oranı (0..1)."""
    kaynak_norm = _kok_norm(kaynak)
    kelimeler = [k for k in _kok_norm(segment).split() if len(k) >= _CAPA_MIN_KELIME]
    if not kelimeler:
        return 0.0
    return sum(1 for k in kelimeler if k[:_CAPA_KOK] in kaynak_norm) / len(kelimeler)


def _bosluk(metin: str) -> str:
    return re.sub(r"\s+", " ", metin or "").strip()


def kanit_kaynakta(kanit: Any, kaynak: str, *, min_kr: int = 15) -> bool:
    """Alıntı kaynak metinde birebir geçiyor mu (boşluk/büyük-küçük harf toleranslı).

    Asgari uzunluk + ≥2 kelime: kısa alıntılar ("arz e") kaynakta tesadüfen geçer.
    """
    if not isinstance(kanit, str):
        return False
    k = _bosluk(kanit).casefold()
    if len(k) < min_kr or " " not in k:
        return False
    return k in _bosluk(kaynak).casefold()


# ---------------------------------------------------------------------------
# İstek cümlesinin biçimi (morfoloji — kapalı fiil listesi DEĞİL)
# ---------------------------------------------------------------------------
# Yüklem: istek/arz kipleri. Tüm eşleştirmeler tr_lower(metin) üzerinde (İ/I tuzağı).
_YUKLEM = re.compile(
    r"\b(?:talep|rica|arz|itiraz|ihbar|şik[aâ]yet|istirham)\s+(?:ed|eyl|olun|ett)\w*"
    r"|\bist(?:iyor|er|emekte|enmekte|irham)\w*|\bbekl(?:iyor|emekte|eriz|erim)\w*"
    r"|\bşik[aâ]yetçiyim\b|\bgereğini\b")
# Adlaşmış nesne: -mAsInI / -mAsI / -mAk / -DIğInI / iyelik+belirtme (-sInI: iadesini).
_NESNE = re.compile(r"\w+(?:s[ıiuü]n[ıiuü]|m[ae]s[ıi]|m[ae]k|[dt][ıiuü]ğ[ıiuü]n[ıiuü])\b")
# Kalıp kapanış / yüklem sözcükleri: içerik sayılmaz ("Gereğinin yapılmasını arz ederim").
_GENEL = re.compile(
    r"^(?:ed|eyl|olun|ist|bekl|talep|rica|arz|istirham|gereğ|bilgi|saygı|husus|aşağı|"
    r"olurl|müsaade|takdir|yapılma|yapılmas|sunar|ilgili|konu|durum|taraf|lütfen|kısa|"
    r"süre|önce|gerek|işlem|itiraz|ihbar|şik)")

_RE_KUNYE = re.compile(
    r"^\s*(?:T\.\s*C\.?|(?:Tarih|Konu|Sayı|İlgi|Ek(?:ler)?|Adres|Tel(?:efon)?|E-posta|"
    r"Adı\s+Soyadı|Ad-Soyad|Ad\s+Soyad|T\.C\.\s*Kimlik\s+No|TCKN|Başvuru\s+(?:No|Türü|Tarihi)|"
    r"İlgili\s+Kurum|Dosya\s+No|Esas\s+No|Karar\s+No)\s*:.*|Sayın\b.*|İmza\s*|"
    r"(?:[A-ZÇĞİÖŞÜ][a-zçğıöşü]+[ \t]*){2,3}|[^a-zçğıöşü]+)\s*$")
_NUMARA = re.compile(r"(?:^|(?<=\s))(?:\d{1,2}|[a-zçğışöü])[.)]\s+")
_CUMLE_SONU = re.compile(r"(?<!\d)[.!?:](?:\s+|$)|\n[ \t]*\n")
_AYRAC = re.compile(
    r"\bayrıca\b|\bbir de\b|\bbunun yanı ?sıra\b|\bbunun yanında\b|\bek olarak\b|\bilaveten\b"
    r"|\bayrıyeten\b|\bdiğer yandan\b|\böte yandan\b|\bbir diğer\b|\bbir başka\b"
    r"|\b(?:birinci|ikinci|üçüncü|dördüncü|beşinci|son)\s+olarak\b"
    r"|\b(?:birincisi|ikincisi|üçüncüsü|dördüncüsü)\b|;")


def _icerik_var(metin: str) -> bool:
    """Kalıp kapanış/yüklem dışında en az bir içerik sözcüğü var mı."""
    return any(len(w) >= 3 and not _GENEL.match(w) and not w.isdigit()
               for w in _KELIME.findall(tr_lower(metin)))


def _bloklar(govde: str) -> list[tuple[str, bool]]:
    """Numaralı liste (≥2 işaret) varsa maddelere ayır; (metin, numaralı_mı)."""
    isaretler = list(_NUMARA.finditer(govde))
    if len(isaretler) < 2:
        return [(govde, False)]
    out = [(govde[:isaretler[0].start()], False)]
    for i, m in enumerate(isaretler):
        son = isaretler[i + 1].start() if i + 1 < len(isaretler) else len(govde)
        out.append((govde[m.end():son], True))
    return out


def _cumle_ogeleri(cumle: str) -> list[str]:
    """İstek cümlesini bağlaçlardan böl; istek taşımayan parça komşusuna bitişik kalır.

    Parçalar SPAN olarak birleştirilir → kanıt her zaman kaynakta birebir geçer.
    """
    sinirlar = [0] + [x for m in _AYRAC.finditer(tr_lower(cumle)) for x in (m.start(), m.end())]
    sinirlar.append(len(cumle))
    parcalar = [(sinirlar[i], sinirlar[i + 1]) for i in range(0, len(sinirlar) - 1, 2)]
    ogeler: list[list[int]] = []
    bekleyen: int | None = None
    for bas, son in parcalar:
        p = tr_lower(cumle[bas:son])
        if len(p.strip(" ,;.-—")) < 4:
            continue
        if _NESNE.search(p) or _YUKLEM.search(p):
            ogeler.append([bekleyen if bekleyen is not None else bas, son])
            bekleyen = None
        elif ogeler:
            ogeler[-1][1] = son
        elif bekleyen is None:
            bekleyen = bas
    if bekleyen is not None and ogeler:
        ogeler[-1][0] = min(ogeler[-1][0], bekleyen)
    return [cumle[b:s].strip(" ,;.-—\n\t") for b, s in ogeler]


def heuristik_talep_kumesi(metin: str) -> list[dict[str, Any]]:
    """LLM yokken AYNI talep kümesi tipini deterministik üret (mock/CI tek kaynak)."""
    if not metin or not metin.strip():
        return []
    govde = "\n".join(s for s in metin.splitlines() if not _RE_KUNYE.match(s))
    adaylar: list[str] = []
    durum: list[str] = []
    kalip = False
    for blok, numarali in _bloklar(govde):
        for j, cumle in enumerate(c for c in _CUMLE_SONU.split(blok) if c and c.strip()):
            kucuk = tr_lower(cumle)
            if not (_YUKLEM.search(kucuk) or (numarali and j == 0)):
                durum.append(_bosluk(cumle))
                continue
            for oge in _cumle_ogeleri(cumle):
                if len(oge) < _KANIT_MIN_KR:
                    continue
                if _icerik_var(oge):
                    adaylar.append(_bosluk(oge))
                else:
                    kalip = True
    # "Gereğinin yapılmasını arz ederim" tek başına istek değildir; gereği istenen şey önceki
    # durum anlatımıdır → o cümle talebin kanıtı olur (yalnız başka istek yoksa).
    if not adaylar and kalip and durum:
        adaylar = [d for d in durum[-1:] if _icerik_var(d) and len(d) >= _KANIT_MIN_KR]
    return _kume_kur([{"kanit": a} for a in adaylar], kaynak=None)


# ---------------------------------------------------------------------------
# Kısa konu (isim öbeği) türetimi
# ---------------------------------------------------------------------------
_YUKLEM_SON = re.compile(
    r"\s*(?:(?:talep|rica|arz|istirham|itiraz|ihbar)\s+\S+|ist\S+|bekl\S+|"
    r"şik[aâ]yetçiyim)\s*$")
_DOLGU = re.compile(r"\b(?:en kısa sürede|bir an önce|ivedilikle|acilen|lütfen)\b\s*")
_BAS_BAGLAC = re.compile(r"^(?:ve|ile|ayrıca|bir de|ek olarak|(?:birinci|ikinci|üçüncü|"
                         r"dördüncü|beşinci|son)\s+olarak)\b[\s,]*")


def ozet_kisa(kanit: str) -> str:
    """Kanıt cümlesinden 2-6 kelimelik isim öbeği ('Çukurun kapatılması')."""
    t = _bosluk(kanit).rstrip(" .;,:")
    kucuk = tr_lower(t)
    if m := _YUKLEM_SON.search(kucuk):
        t, kucuk = t[:m.start()], kucuk[:m.start()]
    if m := _BAS_BAGLAC.match(kucuk):
        t = t[m.end():]
    t = re.sub(_DOLGU.pattern, "", t, flags=re.IGNORECASE)
    kelimeler = t.strip(" ,;").split()
    if kelimeler and re.search(r"s[ıiuü]n[ıiuü]$", kelimeler[-1]):
        kelimeler[-1] = kelimeler[-1][:-2]       # -sInI → -sI: 'kapatılmasını' → 'kapatılması'
    kelimeler = kelimeler[-6:]
    ozet = " ".join(kelimeler).strip(" ,;")
    # Son-6 kesimi cümle ortasındaki bağlacı başa taşıyabilir ('ve fazla tahsil edilen
    # …' → konu birleşiminde 'X ve Ve fazla …'); kesimden SONRA da bağlaç atılır.
    if m := _BAS_BAGLAC.match(tr_lower(ozet)):
        ozet = ozet[m.end():].strip(" ,;")
    return (tr_upper(ozet[:1]) + ozet[1:]) if ozet else _bosluk(kanit)[:60]


# ---------------------------------------------------------------------------
# LLM öğelerinin doğrulanması + kümenin kurulması
# ---------------------------------------------------------------------------


def _oge_temizle(ham: dict[str, Any], kaynak: str | None) -> dict[str, Any] | None:
    kanit = ham.get("kanit")
    if not isinstance(kanit, str) or not kanit.strip():
        return None
    if kaynak is not None and not kanit_kaynakta(kanit, kaynak, min_kr=_KANIT_MIN_KR):
        return None  # uydurma alıntı: güvenlik ağı
    kanit = mask_for_llm(_bosluk(kanit), None).rstrip(" .;,")[:_KANIT_AZAMI]
    ozet = ham.get("ozet")
    ozet = mask_for_llm(_bosluk(ozet), None).rstrip(" .") if isinstance(ozet, str) else ""
    capa_kaynagi = kaynak if kaynak is not None else kanit
    if (not ozet or len(ozet.split()) > _OZET_AZAMI_KELIME
            or capa_orani(ozet, capa_kaynagi) < OZET_CAPA_ESIGI):
        ozet = ozet_kisa(kanit)
    tur = ham.get("tur")
    birim = ham.get("birim_ipucu")
    return {
        "kanit": kanit,
        "ozet": ozet,
        "tur": tur if tur in EVRAK_TURLERI and tur != "belirsiz" else niyet_turu(kanit),
        "birim_ipucu": birim if birim in BIRIMLER else None,
    }


def _kume_kur(hamlar: list[Any], *, kaynak: str | None) -> list[dict[str, Any]]:
    kume: list[dict[str, Any]] = []
    gorulen: set[str] = set()
    for ham in hamlar:
        if not isinstance(ham, dict):
            continue
        oge = _oge_temizle(ham, kaynak)
        if oge is None:
            continue
        anahtar = _bosluk(oge["kanit"]).casefold()
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        kume.append(oge)
        if len(kume) >= TALEP_AZAMI:
            break
    return [{"id": f"t{i}", **o} for i, o in enumerate(kume, start=1)]


def talep_kumesi_dogrula(hamlar: Any, kaynak: str) -> list[dict[str, Any]]:
    """LLM'in talep listesini doğrula (kaynak = LLM'e giden MASKELİ metin)."""
    if not isinstance(hamlar, list):
        return []
    return _kume_kur(hamlar, kaynak=kaynak)


def talep_metinleri(kume: list[dict[str, Any]]) -> list[str]:
    """Eski `bilgi_unsurlari['talepler']` (list[str]) sözleşmesi: kanıt cümleleri."""
    return [str(o.get("kanit") or "") for o in kume if o.get("kanit")]


__all__ = (
    "NIYET", "TALEP_AZAMI", "capa_orani", "heuristik_talep_kumesi", "kanit_kaynakta",
    "niyet_turu", "ozet_kisa", "talep_kumesi_dogrula", "talep_metinleri",
)
