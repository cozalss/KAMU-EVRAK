"""AI Bürokrasi Kurulu — DeepSeek destekli çok-ajanlı taslak müzakeresi (Görev 2 yenilikçilik).

Kurul, GÜNCEL resmî yazı taslağını üç uzman üyenin gözünden ÇOK-TURLU DEBATE ile değerlendirir:
Taslakçı biçimi savunur (savunucu), Hukukçu mevzuat/2646/doğrulama itirazlarını yürütür (sert
şüpheci), Vatandaş Avukatı dili sadeleştirir; Birim Amiri moderatör olarak risk bandını sahiplenir.
İKİ yapılandırılmış DeepSeek çağrısı: (1) AÇILIŞ — üç üye birbirini görmeden ilk pozisyon; (2)
ÇAPRAZ-ELEŞTİRİ — GERÇEK açılışı görüp birbirine AD'la yanıt (karşı/katıl/geliştir) + öneriler
(düzelt/ekle/çıkar). Tek çağrıda self-debate anlaşmaya çökerdi; ayrı çağrı gerçek karşı-çıkış üretir
(araştırma: Du et al. MAD, sycophancy çalışmaları). Maliyet ~$0.004/belge (2 çağrı, taslak+sinyal
iki kez gider; LRU cache). Öneriler → DETERMİNİSTİK anchored-edit (grounding tek yerde, debate NASIL'ı tartışır).

Güven sınırı + sıfır-uydurma (CLAUDE.md §1):
  - real_llm yok/mock/hata → None; çağıran (endpoint) deterministik muzakere.js'e düşer (mock ayakta).
  - KARAR daima deterministik: risk bandı + çözülmemiş SUNUCU itirazından (LLM/istemci bağlamaz).
  - Uzlaşı metni `_uzlasi_gecerli`'den geçer: boş/şüpheli-kısalma + aşırı-uzama + orijinalde
    OLMAYAN kanun/madde atıfı reddedilir → orijinal korunur, sahte/uydurma "revize" üretilmez.
  - Normalize: LLM'in uydurduğu üye/öneri-tipi kapalı-kümeye eşlenmezse DÜŞÜRÜLÜR.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from typing import Any

import structlog

from agents.nodes._llm_extract import llm_json, real_llm
from yazi.yazi_render import _REVIZE_MAX_TASLAK_CHARS, _revize_metin_gecerli, _tek_satir

log = structlog.get_logger()

# Mevzuat atıf tespiti — NORMALİZE TOKEN kümesi (yüzeysel biçim değil, ATIF NUMARASI karşılaştırılır).
# Uzlaşı metni, orijinalde OLMAYAN bir atıf EKLİYORSA uydurmadır (CLAUDE.md §1) → reddedilir.
# Türkçe'nin YAYGIN biçimlerini kapsar: "12 sayılı" (1-2 haneli CBK dahil), "657 sayılı",
# "madde 4", "madde-4", "4. madde", "4 üncü madde", "m.102", "m 102", "md.5", "90. maddesi",
# "375 sayılı KHK / Cumhurbaşkanlığı Kararnamesi". Amaç GENİŞ tutmak — fazla eşleşme GÜVENLİdir
# (revizeyi reddeder, orijinali korur); eksik eşleşme uydurma atfın kaçmasına yol açar (adversarial bulgu).
_ATIF_DESENLERI = (
    re.compile(r"(\d{1,5})\s*sayılı", re.IGNORECASE),                         # "N sayılı" (N≥1 — CBK 1-99 dahil)
    re.compile(r"madde\w*\s*[-\s]?\s*(\d+)", re.IGNORECASE),                   # "madde 4", "madde-4", "maddesi 4"
    re.compile(r"(\d+)\s*(?:['’]?\s*(?:[iıuü]nc[iıuü]|üncü|ncı|nci|ncu|ncü))?\s*\.?\s*madde", re.IGNORECASE),  # "4. madde", "4 üncü madde", "90. maddesi"
    re.compile(r"\bm[dD]?\.?\s*(\d+)", re.IGNORECASE),                        # "m.102", "m 102", "md.5"
    re.compile(r"(?:kararname\w*|k\.?h\.?k\.?)\s*\D{0,15}?(\d{1,5})", re.IGNORECASE),  # "K.H.K. 375", "Kararnamesi 12"
)
_UZLASI_MAKS_ORAN = 2.2   # aşırı-uzama (sessiz padding) sınırı — orijinalin katı
_CIKAR_MIN_KAPSAM = 0.6   # 'cikar' bir satırı ancak çapa satırın ≥%60'ını kaplarsa siler (aşırı-silme guard)
_MIN_CAPA = 8             # daha kısa çapa belirsiz sayılır — edit üretmez
# Türkçe harf-katlama (çapa ↔ taslak satırı eşleştirme) — frontend muzakere.js trKatla ile birebir.
_KATLA_MAP = {"ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "İ": "i", "I": "i",
              "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u"}

# Kurul üyeleri — kapalı küme (LLM buraya EŞLENMELİ). Üye eklemek/çıkarmak için tek yer:
# id frontend UYE eşlemesiyle birebir; 'odak' prompt'ta üyenin bakış açısını sabitler.
KURUL_UYELERI: tuple[dict[str, str], ...] = (
    {"id": "taslakci", "ad": "Taslakçı", "odak": "biçim/akış — taslağı savunur, 2646 yapısını korur"},
    {"id": "hukukcu", "ad": "Hukukçu", "odak": "dayanak + doğrulama — mevzuat, 2646 uyumu, uydurma-veto"},
    {"id": "vatandas", "ad": "Vatandaş Avukatı", "odak": "üslup — sadelik, anlaşılırlık, vatandaş gözü"},
)
_UYE_ID = {u["id"] for u in KURUL_UYELERI}
_ONERI_TIP = {"duzelt", "ekle", "cikar"}
_DAYANAK = {"verify", "lint_2646", "nli", "tutarlilik", "uslup", "dayanak", "muzakere"}

_MAKS_TUR = 8
_MAKS_ONERI = 8
_MAKS_TOKENS = 4096
_ACILIS_TOKENS = 1024            # açılış turu kısa (3 pozisyon)
_AD = {u["id"]: u["ad"] for u in KURUL_UYELERI}    # transkript etiketi (çağrı-2'ye açılışı geçirirken)
_TUTUM = {"katil", "karsi", "gelistir"}            # çapraz-tur duruşu: katıl · karşı çık · geliştir

# Çapalı-edit kuralları — YALNIZ müzakere (2.) çağrısında; öneriler oradan gelir (grounding tek yerde).
_EDIT_KURAL = (
    "Ardından taslakta NEYİN düzeltilmesi/eklenmesi/çıkarılması gerektiğini SATIRA ÇAPALAYARAK öner; "
    "sistem DETERMİNİSTİK uygular (metni SEN yeniden yazmazsın):\n"
    "  • 'capa': dokunulan satırı BİREBİR taslaktan al (uydurma/yaklaşık çapa yok; satır yoksa öneri verme).\n"
    "  • tip='cikar': doğrulanamayan TÜM bir satırı kaldır ('capa'=satırın tamamı). Satır içi ifade için 'duzelt' kullan.\n"
    "  • tip='duzelt': 'capa'=eski satır, 'yeni'=düzeltilmiş TAM satır. 'yeni'de taslakta OLMAYAN "
    "kanun/madde/tarih/sayı/kişi EKLEME (eklersen uygulanmaz, tavsiye kalır).\n"
    "  • tip='ekle': eksik bölüm önerisi (tavsiye — otomatik eklenmez).\n"
    "Taslakta ZATEN olan kurum/kişi/tarih/sayı/madde'yi UYDURMA/değiştirme. 'İlgili mevzuat' listesi "
    "yalnız BAĞLAM, atıf ekleme lisansı DEĞİL."
)

# ÇAĞRI 1 — AÇILIŞ turu: üç üye birbirini görmeden İLK pozisyonunu açıklar (çeşitlilik en yüksek burada;
# araştırma: bağımsız açılış = konformizm öncesi en değerli tur). Roller SERT ve FARKLI (yumuşak nudge
# çalışmaz — Devil's-Advocate mandate'i şüpheciyi gerçekten karşı çıkmaya zorlar).
_SYSTEM_ACILIS = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresinin AÇILIŞ turunu canlandıran uzman bir asistansın. "
    "Sana GÜNCEL resmî yazı taslağı + taslağın GERÇEK doğrulama sinyalleri verilecek. ÜÇ üye, birbirini "
    "GÖRMEDEN İLK pozisyonunu açıklar. SABİT ve FARKLI roller:\n"
    "  • taslakci (SAVUNUCU): taslağın biçimini/akışını ve yeterli yanlarını GEREKÇESİYLE savunur.\n"
    "  • hukukcu (ŞÜPHECİ): GÖREVİN taslağın nesinin YANLIŞ/eksik/dayanaksız olduğunu bulmak — uydurma-veto, "
    "Yönetmelik-2646, mevzuat/NLI, tutarlılık sinyallerine dayan. Kanıtla zorlanmadıkça 'sorun yok' DEME.\n"
    "  • vatandas (VATANDAŞ AVUKATI): dili vatandaş gözünden değerlendirir (ağır/anlaşılmaz kalıp var mı).\n"
    "Her üye 1-2 cümle, Türkçe, resmî, 3. tekil. YALNIZ sinyallerde/taslakta OLAN'ı konuş — UYDURMA YOK. Emoji yok.\n"
    'YALNIZ şu şemada JSON döndür: {"turlar": [{"uye": "taslakci", "soz": "..."}, '
    '{"uye": "hukukcu", "soz": "..."}, {"uye": "vatandas", "soz": "..."}]}'
)

# ÇAĞRI 2 — ÇAPRAZ-ELEŞTİRİ + YAKINSAMA + öneriler. Üyelerin GERÇEK açılış pozisyonlarını görür →
# genuine yanıt (tek-çağrı self-debate anlaşmaya çöker; ayrı çağrı gerçek karşı-çıkış üretir).
# Tit-for-tat Level-2: anlaşmazlık zorunlu ama amaç DOĞRULUK, kazanmak değil. Sahte oybirliği yok.
_SYSTEM_MUZAKERE = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresinin ÇAPRAZ-ELEŞTİRİ ve YAKINSAMA turunu canlandıran "
    "uzman bir asistansın. Sana taslak + sinyaller + üyelerin AÇILIŞ pozisyonları verilecek. Şimdi üyeler "
    "BİRBİRİNE YANIT VERİR — gerçek bir tartışma, herkes aynı şeyi söylemez:\n"
    "  • Her tur BİR başka üyeye yanıttır: 'yanit'=yanıt verilen üye id'si (taslakci|hukukcu|vatandas), "
    "'tutum'={katil|karsi|gelistir}.\n"
    "  • Önce o üyenin SOMUT noktasına AD'la değin, sonra KENDİ gerekçeni ver. Amaç DOĞRU sonuç — "
    "tartışmayı KAZANMAK değil. Fikir değiştiriyorsan NEYİN değiştirdiğini söyle.\n"
    "  • hukukcu şüpheci kalır; taslakci savunur ama kanıt karşısında düzeltmeyi kabul edebilir; "
    "vatandas dili savunur. 3-6 çapraz tur üret; SAHTE OYBİRLİĞİ YAPMA — çözülmemiş itiraz varsa açıkça bırak.\n"
    + _EDIT_KURAL + "\n"
    "Türkçe, resmî, 3. tekil/edilgen. Emoji yok. Karar/oy verme (sistem hesaplar).\n"
    'YALNIZ şu şemada JSON döndür (örnek): {"turlar": [{"uye": "hukukcu", "yanit": "taslakci", '
    '"tutum": "karsi", "soz": "Yapıyı savundun ama İlgi tarihi kaynakta yok; bu satır kalamaz."}], '
    '"oneriler": [{"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.", '
    '"aciklama": "İlgi tarihi doğrulanamadı."}, {"tip": "duzelt", "dayanak": "uslup", '
    '"capa": "Gereğini rica ederim.", "yeni": "Bilgilerinize rica ederim.", "aciklama": "Cevabi yazı kapanışı."}]}'
)


def kurul_karar(bant: str, itiraz_sayisi: int) -> str:
    """Risk etiketi (yalnız frontend ROZETİNE çevrilir): kırmızı→sevk · sarı/itiraz→şerhli ·
    yeşil→uzlaşı. Sevk/mühür TÖRENİ yok — revize taslağı her bantta uygulanabilir."""
    if bant == "kirmizi":
        return "sevk"
    if bant == "sari" or itiraz_sayisi:
        return "serhli"
    return "uzlasti"


def _itiraz_sayisi(sinyaller: dict[str, Any]) -> int:
    """Çözülmemiş itiraz sayısı — şerh/uzlaşı ayrımının deterministik kaynağı (LLM değil)."""
    lint = sinyaller.get("lint_2646") or {}
    kurallar = lint.get("kurallar") if isinstance(lint, dict) else None
    lint_n = (sum(1 for k in kurallar if isinstance(k, dict) and k.get("durum") == "uyari")
              if isinstance(kurallar, list) else len(lint.get("uyari") or []) if isinstance(lint, dict) else 0)
    nli = sinyaller.get("nli") or []
    nli_zayif = sum(1 for n in nli if isinstance(n, dict) and n.get("entailment") is False)
    return (len(sinyaller.get("verify_uyari") or []) + lint_n + nli_zayif
            + len(sinyaller.get("tutarlilik_uyari") or []))


def _sinyal_ozeti(sinyaller: dict[str, Any], meta: dict[str, Any]) -> str:
    """LLM'e verilen sinyal digest'i — grounding (öneriler yalnız bunlara dayanabilir)."""
    lint = sinyaller.get("lint_2646") or {}
    lint_uyari = lint.get("uyari") if isinstance(lint, dict) else None
    # İstemci-kontrollü başlıklar → temizle + kısalt (enjeksiyon/DoS guard); yalnız bağlam.
    mevzuat = [_tek_satir(str(m.get("baslik") or ""), 160)
               for m in (meta.get("mevzuat") or [])[:10] if isinstance(m, dict) and m.get("baslik")]
    satir = [
        f"Uydurma-veto/doğrulama uyarıları: {'; '.join(sinyaller.get('verify_uyari') or []) or 'yok'}",
        f"Yönetmelik-2646 lint uyarıları: {'; '.join(lint_uyari or []) or 'yok'}",
        f"Veri tutarlılığı uyarıları: {'; '.join(sinyaller.get('tutarlilik_uyari') or []) or 'yok'}",
        f"İlgili mevzuat (yalnız BAĞLAM — atıf lisansı değil): {'; '.join(mevzuat[:3]) or 'yok'}",
        f"Risk bandı: {(sinyaller.get('risk_metadata') or {}).get('bant', 'yok')}",
        f"Yazı türü: {meta.get('yazi_turu') or 'belirsiz'}",
    ]
    return "\n".join(satir)


def _normalize_turlar(
    ham: Any, *, tur: int = 0, capraz: bool = False, hedefler: set[str] | None = None,
) -> list[dict[str, Any]]:
    """LLM turlarını kapalı-küme üyeye eşle + gövde temizle; 'tur' etiketi eklenir (0=açılış,
    1=çapraz-eleştiri, 2=moderatör). capraz=True: 'yanit' (kime yanıt) + 'tutum'
    (katil|karsi|gelistir) çözülür — frontend çapraz-referans/durum-geçişi render'ı için.

    'yanit' YALNIZ `hedefler` (gerçekten konuşan üyeler) içinde geçerlidir — transkriptte
    GÖRÜNMEYEN üyeye sarkan referans üretilmez (review bulgusu). 'tutum' 'yanit'a ATOMİK bağlı:
    geçerli yanit yoksa öksüz duruş bırakılmaz.
    """
    hedef_kume = hedefler if hedefler else _UYE_ID
    out: list[dict[str, Any]] = []
    for t in (ham if isinstance(ham, list) else [])[:_MAKS_TUR]:
        if not isinstance(t, dict):
            continue
        who = str(t.get("uye") or "").strip()
        soz = _tek_satir(str(t.get("soz") or ""), 400)
        if who not in _UYE_ID or not soz:
            continue
        item: dict[str, Any] = {"who": who, "kaynak": "muzakere", "text": soz, "tur": tur}
        if capraz:
            yanit = str(t.get("yanit") or "").strip()
            if yanit in hedef_kume and yanit != who:
                item["yanit"] = yanit
                tutum = str(t.get("tutum") or "").strip().lower()
                if tutum in _TUTUM:
                    item["tutum"] = tutum   # tutum yalnız geçerli yanit ile birlikte
        out.append(item)
    return out


def _normalize_oneriler(ham: Any) -> list[dict[str, Any]]:
    """LLM önerilerini kapalı-küme tip/dayanağa eşle + gövde temizle; geçersiz tip düşer.

    `_capa`/`_yeni` transient alanları edit motoruna taşınır; `uygulanabilir` BURADA
    belirlenmez — LLM'in 'uygula' öz-iddiasına GÜVENİLMEZ, final diff'e karşı uzlaştırılır.
    """
    out: list[dict[str, Any]] = []
    for o in (ham if isinstance(ham, list) else [])[:_MAKS_ONERI]:
        if not isinstance(o, dict):
            continue
        tip = str(o.get("tip") or "").strip().lower()
        metin = _tek_satir(str(o.get("aciklama") or ""), 300)
        if tip not in _ONERI_TIP or not metin:
            continue
        dayanak = str(o.get("dayanak") or "muzakere").strip().lower()
        out.append({
            "tip": tip, "kaynak": dayanak if dayanak in _DAYANAK else "muzakere",
            "metin": metin, "uygulanabilir": False,
            "_capa": _tek_satir(str(o.get("capa") or ""), 400),
            "_yeni": _tek_satir(str(o.get("yeni") or ""), 400),
        })
    return out


def _katla(s: str) -> str:
    """Türkçe harf-katlamalı normalize — muzakere.js trKatla ikizi (çapa eşleştirme)."""
    return "".join(
        c for c in (_KATLA_MAP.get(ch, ch).lower() for ch in str(s)) if c.isalnum()
    )


def _capa_coz(satirlar: list[str], capa: str) -> tuple[int, float] | None:
    """Çapayı TEK kesin satıra çöz → (idx, kapsam); yok/çoklu eşleşme → None (yanlış-satır guard).

    kapsam = çapanın o satırı ne kadar kapladığı (aşırı-silme guard'ı 'cikar'da bunu kullanır).
    """
    c = _katla(capa)
    if len(c) < _MIN_CAPA:
        return None
    # Çapa herhangi bir TEK satırdan uzunsa satırlara yayılıyordur (LLM iki satırı birleştirmiş) —
    # "en büyük parça"yı kazandırıp YANLIŞ satırı silmek yerine belirsiz say (adversarial bulgu).
    if len(c) > max((len(_katla(s)) for s in satirlar), default=0):
        return None
    eslesme: list[tuple[int, float]] = []
    for i, s in enumerate(satirlar):
        ks = _katla(s)
        if len(ks) < 4:
            continue
        if c in ks:
            eslesme.append((i, len(c) / len(ks)))
        elif ks in c and len(ks) >= 0.6 * len(c):
            eslesme.append((i, 1.0))
    return eslesme[0] if len(eslesme) == 1 else None


# Ad/kurum/unvan adayı: 2+ ardışık Büyük-harf sözcük dizisi ("Ahmet Yılmaz", "Şube Müdürü").
# Tek Büyük-harf sözcük (cümle başı "Başvurunuz") üslup değişikliğidir, uydurma sayılmaz.
_BUYUK_DIZI = re.compile(r"(?:[A-ZÇĞİÖŞÜ][^\W\d_]+['’]?\s+){1,}[A-ZÇĞİÖŞÜ][^\W\d_]+")


def _atiflar(metin: str) -> set[str]:
    """Kanun/madde atıflarını NORMALİZE token kümesine indir — yüzeysel biçimden bağımsız
    ("657 sayılı" ↔ "657 Sayılı", "m.11" ↔ "11 inci madde" aynı token). Grounding karşılaştırması."""
    out: set[str] = set()
    for i, desen in enumerate(_ATIF_DESENLERI):
        etiket = "s" if i in (0, 4) else "m"   # 0=sayılı, 4=kararname → 's'; madde/m. → 'm'
        out.update(etiket + m.group(1) for m in desen.finditer(metin))
    return out


def _yeni_uydurma(orijinal: str, yeni: str) -> bool:
    """duzelt 'yeni'si, orijinalde OLMAYAN somut olgu ekliyor mu (CLAUDE.md §1 — SIFIR UYDURMA).

    Üslup değişikliği (küçük-harf yeniden ifade, sözcük atma) SERBEST; ama yeni bir SAYISAL token
    (tarih/sayı/kimlik), yeni kanun/madde ATFI ya da yeni AD/KURUM/UNVAN dizisi eklemek uydurmadır
    → edit reddedilir, tavsiye kalır. (Yalnız kanun/madde bakmak yetmez — adversarial bulgu:
    'Ahmet Yılmaz'ın 10.01.2020 tarihli' gibi ad+tarih enjeksiyonu da yakalanmalı.)
    """
    if set(re.findall(r"\d+", yeni)) - set(re.findall(r"\d+", orijinal)):
        return True                                    # yeni sayı/tarih/kimlik
    if _atiflar(yeni) - _atiflar(orijinal):
        return True                                    # yeni kanun/madde atfı
    o_fold = _katla(orijinal)
    return any(_katla(m.group(0)) not in o_fold for m in _BUYUK_DIZI.finditer(yeni))  # yeni ad/unvan


_SINYAL_ESIK = 8   # çapa satırı ↔ uyarı ortak-katlanmış-substring eşiği (kısa ortak sözcük çakışmasını eler)


def _cikar_sinyalli(satir: str, sinyaller: dict[str, Any]) -> bool:
    """cikar YALNIZ gerçek sinyalin (verify/tutarlılık) işaretlediği içeriği kaldırır — LLM'in
    satır seçimine körü körüne güvenilmez (adversarial bulgu). Uyarılar işaretli içeriği ALINTILAR;
    satırın katlanmış hâli uyarı metinleriyle ≥8 karakter ortak dizi paylaşıyorsa grounded'dır
    (kısa ortak sözcük — 'ilgi' vb. — çakışmasını eler; meşru gövde/imza tavsiyede kalır)."""
    uyari_fold = _katla(" ".join(
        (sinyaller.get("verify_uyari") or []) + (sinyaller.get("tutarlilik_uyari") or [])
    ))
    if not uyari_fold:
        return False
    sf = _katla(satir)
    if len(sf) < _SINYAL_ESIK:
        return len(sf) >= 5 and sf in uyari_fold          # çok kısa satır → tam eşleşme
    return any(sf[i:i + _SINYAL_ESIK] in uyari_fold for i in range(len(sf) - _SINYAL_ESIK + 1))


# Yapısal satır — biçimin taşıyıcısı; risk sinyali işaretlese bile ASLA çıkarılmaz (duzelt olabilir).
_KORUNAN_SATIR = re.compile(r"^\s*(T\.C\.|Konu\s*:)", re.IGNORECASE)

# Etiketli alan satırı (Yön. 2646 zorunlu/yaygın alanlar) — cikar bu satırı TAMAMEN SİLMEZ,
# DOLDURULACAK yer tutucuya çevirir: taslak yapısal olarak eksiksiz/gönderime-yakın kalır,
# memur eksik alanı "yok olmuş" değil "tamamlanacak" olarak görür ([DOĞRULA] deseni, CLAUDE.md §1).
_ETIKET_SATIR = re.compile(r"^\s*(Sayı|İlgi|Koordinasyon|Belge Doğrulama Kodu)\s*:\s*", re.IGNORECASE)
_DOGRULA_YER_TUTUCU = "[DOĞRULA: kaynak evrakta doğrulanamadı]"


def _capali_edit(
    oneri: dict[str, Any], satirlar: list[str], taslak_md: str, sinyaller: dict[str, Any],
) -> dict[str, Any] | None:
    """Öneriyi grounded bir edit'e çöz (uygulanabilirse) ya da None (tavsiye kalır).

    cikar = tam satır sil — YALNIZ (a) çapa satırın ≥%60'ı, (b) yapısal DEĞİL, (c) gerçek sinyalin
            işaretlediği içerik; ETİKETLİ ALAN satırıysa (Sayı/İlgi/…) silinmez, alan adı korunarak
            '[DOĞRULA: …]' yer tutucusuyla değiştirilir (taslak gönderime-hazır KALIR — boş alan
            değil, görünür TODO). duzelt = satırı 'yeni' ile değiştir — 'yeni' uydurma olgu (sayı/
            tarih/ad/atıf) EKLEMEZ. ekle = yeni içerik enjeksiyonu (uydurma riski) → ASLA otomatik.
    Dönen edit `oneri`yi taşır (attribution) — uygulanabilirlik metin-çıkarımıyla DEĞİL, hangi
    önerinin hangi edit'i ürettiğiyle belirlenir.
    """
    tip = oneri.get("tip", "")
    if tip == "ekle":
        return None
    coz = _capa_coz(satirlar, oneri.get("_capa", ""))
    if coz is None:
        return None
    idx, kapsam = coz
    satir = satirlar[idx]
    if tip == "cikar":
        if kapsam < _CIKAR_MIN_KAPSAM or _KORUNAN_SATIR.match(satir) or not _cikar_sinyalli(satir, sinyaller):
            return None
        etiket = _ETIKET_SATIR.match(satir)
        if etiket:
            oneri["tip"] = "duzelt"   # gerçekte uygulanan işlemi yansıt (rozet artık 'Düzelt')
            return {"idx": idx, "op": "duzelt", "yeni": f"{etiket.group(0)}{_DOGRULA_YER_TUTUCU}", "oneri": oneri}
        return {"idx": idx, "op": "cikar", "oneri": oneri}
    yeni = oneri.get("_yeni", "")
    if not yeni or _katla(yeni) == _katla(satir) or _yeni_uydurma(taslak_md, yeni):
        return None
    return {"idx": idx, "op": "duzelt", "yeni": yeni, "oneri": oneri}


def _editleri_uygula(
    satirlar: list[str], editler: list[dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]]]:
    """Grounded editleri DETERMİNİSTİK uygula (saf) → (yeni satırlar, UYGULANAN editler).
    Satır başına ilk edit kazanır (dedup); dönen 'uygulanan' attribution'ın tek kaynağıdır —
    aynı satıra iki öneri çarparsa yalnız kazanan 'işlendi' sayılır (adversarial bulgu: dup-çapa)."""
    idx_edit: dict[int, dict[str, Any]] = {}
    for e in editler:
        idx_edit.setdefault(e["idx"], e)
    out: list[str] = []
    uygulanan: list[dict[str, Any]] = []
    for i, s in enumerate(satirlar):
        e = idx_edit.get(i)
        if e is None:
            out.append(s)
            continue
        uygulanan.append(e)
        if e["op"] == "duzelt":
            out.append(e["yeni"])
        # cikar → satır düşürülür
    return out, uygulanan


# Birim Amiri (4. üye) sözü DETERMİNİSTİK — gerçek risk bandından türer (LLM üretmez; kapalı-küme
# dışıdır). Risk sesi asla halüsinasyon olmaz, hem LLM hem deterministik fallback yolunda tutarlı.
_RISK_SOZ = {
    "kirmizi": ("Risk bandı kırmızı — doğrulanamayan/uydurma bilgi şüphesi var. Bu yazı memur "
                "teyidi olmadan gönderilmemeli; kuruldaki revize düzeltmelerini destekliyorum."),
    "sari": ("Risk bandı sarı — çekinceler giderilmeden gönderime çıkmamalı; revize sonrası "
             "tekrar değerlendirilmeli."),
    "yesil": ("Risk bandı yeşil — biçim ve dayanak yönünden gönderime engel görmüyorum; "
              "revize önerileri son hâli güçlendirir."),
}


def _birim_amiri_turu(bant: str) -> dict[str, str]:
    """Risk bandını sahiplenen kapanış sesi — bant'a göre deterministik (LLM'e bırakılmaz)."""
    soz = _RISK_SOZ.get(bant, "Risk değerlendirmesi için yeterli sinyal yok; gönderim öncesi "
                              "memur kontrolü önerilir.")
    return {"who": "birim_amiri", "kaynak": "risk_guard", "text": soz}


def _uzlasi_gecerli(orijinal: str, uzlasi: str) -> bool:
    """Uzlaşı metni güvenli mi — revize-guard + aşırı-uzama + mevzuat GROUNDING.

    Yalnız-uzunluk yetmez (adversarial bulgu): (1) revize-guard (boş/şüpheli-kısalma),
    (2) aşırı-uzama (sessiz padding), (3) orijinalde OLMAYAN kanun/madde atıfı → uydurma,
    reddedilir (CLAUDE.md §1). Reddedilirse çağıran orijinali korur (sahte revizyon yok).
    """
    if not _revize_metin_gecerli(orijinal, uzlasi):
        return False
    if len(uzlasi) > _UZLASI_MAKS_ORAN * max(len(orijinal), 1):
        log.warning("kurul_uzlasi_asiri_uzama", n_once=len(orijinal), n_sonra=len(uzlasi))
        return False
    yeni_atif = _atiflar(uzlasi) - _atiflar(orijinal)
    if yeni_atif:
        log.warning("kurul_uzlasi_uydurma_atif", atiflar=sorted(yeni_atif)[:5])
        return False
    return True


def _kurul_hazirla(
    taslak_md: str, meta: dict[str, Any], sinyaller: dict[str, Any],
) -> tuple[str, int, str, str] | None:
    """Guard + ortak hazırlık → (bant, itiraz, karar, user); LLM yok / taslak uzun → None.
    KARAR daima SUNUCU sinyalinden (istemci mevzuat_nli karara girmez — adversarial bulgu)."""
    if real_llm() is None:
        return None
    if len(taslak_md) > _REVIZE_MAX_TASLAK_CHARS:
        log.warning("kurul_taslak_cok_uzun", n_char=len(taslak_md))
        return None
    bant = str((sinyaller.get("risk_metadata") or {}).get("bant") or "")
    itiraz = _itiraz_sayisi(sinyaller)
    karar = kurul_karar(bant, itiraz)
    user = (
        f"GÜNCEL TASLAK:\n{taslak_md}\n\n"
        f"GERÇEK DOĞRULAMA SİNYALLERİ:\n{_sinyal_ozeti(sinyaller, meta)}"
    )
    return bant, itiraz, karar, user


async def _kurul_acilis(user: str) -> list[dict[str, Any]] | None:
    """ÇAĞRI 1 — AÇILIŞ turu: bağımsız ilk pozisyonlar (temp↑ → çeşitlilik; kısa timeout →
    yavaş açılış çağrı-2 bütçesini yemeden hızlı fallback'e düşer). Boş → None."""
    obj0 = await llm_json(_SYSTEM_ACILIS, user, max_tokens=_ACILIS_TOKENS, temperature=0.5, timeout_s=15.0)
    return _normalize_turlar(obj0.get("turlar") if isinstance(obj0, dict) else None, tur=0) or None


async def _kurul_sonuc(
    taslak_md: str, *, sinyaller: dict[str, Any], bant: str, karar: str, itiraz: int,
    acilis: list[dict[str, Any]], user: str,
) -> dict[str, Any] | None:
    """ÇAĞRI 2 — ÇAPRAZ-ELEŞTİRİ + yakınsama + öneriler. GERÇEK açılışı transkript olarak görür →
    genuine yanıt (tek çağrıda self-debate anlaşmaya çökerdi). Öneriler → deterministik anchored-edit."""
    transkript = "\n".join(f"{_AD.get(t['who'], t['who'])}: {t['text']}" for t in acilis)
    user2 = f"{user}\n\nAÇILIŞ TURU (üyelerin ilk pozisyonları):\n{transkript}"
    obj2 = await llm_json(_SYSTEM_MUZAKERE, user2, max_tokens=_MAKS_TOKENS, temperature=0.45)
    if not isinstance(obj2, dict):
        return None

    # 'yanit' YALNIZ açılışta konuşan üyelere geçerli (sarkan referans yok — review bulgusu).
    acanlar = {t["who"] for t in acilis}
    capraz = _normalize_turlar(obj2.get("turlar"), tur=1, capraz=True, hedefler=acanlar)
    ham_oneriler = _normalize_oneriler(obj2.get("oneriler"))
    if not capraz and not ham_oneriler:
        return None  # boş/kullanışsız çıktı → deterministik fallback daha iyi

    # Revize taslağı = grounded çapalı editlerin DETERMİNİSTİK toplamı, NE FAZLA NE EKSİK.
    # LLM'in holistik yeniden-yazımı KULLANILMAZ (attribution kopar + uydurma sızabilir).
    satirlar = taslak_md.split("\n")
    editler = [
        e for o in ham_oneriler
        if (e := _capali_edit(o, satirlar, taslak_md, sinyaller)) is not None
    ]
    yeni_satirlar, uygulanan = _editleri_uygula(satirlar, editler)
    assembled = "\n".join(yeni_satirlar)
    if uygulanan and _uzlasi_gecerli(taslak_md, assembled):
        uzlasi_metni = assembled
        uygulanan_id = {id(e["oneri"]) for e in uygulanan}
    else:
        uzlasi_metni = taslak_md
        uygulanan_id = set()

    # DÜRÜST bayrak = ATTRIBUTION (öneri UYGULANAN bir edit üretti mi) — metin-içermeden DEĞİL.
    oneriler = [
        {k: v for k, v in o.items() if k not in ("_capa", "_yeni")} | {"uygulanabilir": id(o) in uygulanan_id}
        for o in ham_oneriler
    ]
    uzlasi_degisti = uzlasi_metni.strip() != taslak_md.strip()
    # Turlar = AÇILIŞ (0) + ÇAPRAZ-ELEŞTİRİ (1) + Moderatör/Birim Amiri (2, deterministik risk sesi).
    turlar = [*acilis, *capraz, {**_birim_amiri_turu(bant), "tur": 2}]

    log.info("kurul_muzakere", karar=karar, n_acilis=len(acilis), n_capraz=len(capraz),
             n_oneri=len(oneriler), n_edit=len(uygulanan), uzlasi_degisti=uzlasi_degisti, itiraz=itiraz)
    return {
        "kaynak": "llm", "karar": karar, "turlar": turlar, "oneriler": oneriler,
        "uzlasi_metni": uzlasi_metni, "uzlasi_degisti": uzlasi_degisti,
        # Revize her bantta uygulanabilir (yüksek riskte bile: revizyon riski GİDERİR). Karar yalnız rozet.
        "uzlasi_uygulanabilir": uzlasi_degisti,
    }


async def kurul_muzakere(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any],
) -> dict[str, Any] | None:
    """DeepSeek 2-çağrılı debate (açılış → çapraz-eleştiri) → tam kurgu; LLM yok/mock/hata → None.
    Karar sunucuda deterministik; öneriler anchored-edit'ten geçer (sahte/uydurma revizyon yok)."""
    hz = _kurul_hazirla(taslak_md, meta, sinyaller)
    if hz is None:
        return None
    bant, itiraz, karar, user = hz
    acilis = await _kurul_acilis(user)
    if not acilis:
        return None
    return await _kurul_sonuc(taslak_md, sinyaller=sinyaller, bant=bant, karar=karar,
                              itiraz=itiraz, acilis=acilis, user=user)


async def kurul_muzakere_stream(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any],
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """CANLI AKIŞ: ('acilis', {turlar}) [açılış hazır olunca ~8s] → ('sonuc', tam kurgu) [çapraz
    hazır olunca] yield eder. LLM yok/hata → hiçbir şey yield etmez (çağıran deterministik fallback'e
    düşer). Davranış kurul_muzakere ile birebir aynı çağrı sırası (aynı llm_json dizisi) — yalnız
    ara sonucu yayar, böylece frontend açılışı beklemeden animasyona başlar (dead-wait kalkar)."""
    hz = _kurul_hazirla(taslak_md, meta, sinyaller)
    if hz is None:
        return
    bant, itiraz, karar, user = hz
    acilis = await _kurul_acilis(user)
    if not acilis:
        return
    yield "acilis", {"turlar": acilis}
    sonuc = await _kurul_sonuc(taslak_md, sinyaller=sinyaller, bant=bant, karar=karar,
                               itiraz=itiraz, acilis=acilis, user=user)
    if sonuc:
        yield "sonuc", sonuc


__all__ = ("KURUL_UYELERI", "kurul_karar", "kurul_muzakere", "kurul_muzakere_stream")
