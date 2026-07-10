"""AI Bürokrasi Kurulu — DeepSeek destekli çok-ajanlı taslak müzakeresi (Görev 2 yenilikçilik).

Kurul, GÜNCEL resmî yazı taslağını üç uzman üyenin gözünden değerlendirir: Taslakçı biçimi
savunur, Hukukçu mevzuat/2646/doğrulama itirazlarını yürütür, Vatandaş Avukatı dili
sadeleştirir. Tek yapılandırılmış DeepSeek çağrısı (roundtable) → turlar + öneriler
(düzelt/ekle/çıkar) + uzlaşı taslağı. Maliyet ~$0.002/belge (cost-aware: tek çağrı, LRU cache).

Güven sınırı + sıfır-uydurma (CLAUDE.md §1):
  - real_llm yok/mock/hata → None; çağıran (endpoint) deterministik muzakere.js'e düşer (mock ayakta).
  - KARAR daima deterministik: risk bandı + çözülmemiş SUNUCU itirazından (LLM/istemci bağlamaz).
  - Uzlaşı metni `_uzlasi_gecerli`'den geçer: boş/şüpheli-kısalma + aşırı-uzama + orijinalde
    OLMAYAN kanun/madde atıfı reddedilir → orijinal korunur, sahte/uydurma "revize" üretilmez.
  - Normalize: LLM'in uydurduğu üye/öneri-tipi kapalı-kümeye eşlenmezse DÜŞÜRÜLÜR.
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.nodes._llm_extract import llm_json, real_llm
from yazi.yazi_render import _REVIZE_MAX_TASLAK_CHARS, _revize_metin_gecerli, _tek_satir

log = structlog.get_logger()

# Mevzuat atıf deseni — "657 sayılı", "m.125", "madde 4". Uzlaşı metni, orijinalde OLMAYAN
# bir atıf EKLİYORSA uydurmadır (CLAUDE.md §1) → reddedilir. Yalnız-uzunluk guard'ı yetmez.
_ATIF_DESENI = re.compile(r"\b\d{3,5}\s*sayılı|\bm\.\s?\d+|\bmadde\s+\d+", re.IGNORECASE)
_UZLASI_MAKS_ORAN = 2.2   # aşırı-uzama (sessiz padding) sınırı — orijinalin katı

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

_SYSTEM = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresini canlandıran uzman bir asistansın. "
    "Sana GÜNCEL bir resmî yazı taslağı ve bu taslağın GERÇEK doğrulama sinyalleri (uydurma-veto, "
    "Yönetmelik-2646 lint uyarıları, mevzuat/NLI, veri tutarlılığı, risk bandı) verilecek. "
    "Üç kurul üyesi taslağı KENDİ bakış açısından değerlendirir ve BİRBİRİYLE TARTIŞIR: "
    "biri öneri getirir, diğeri karşı çıkar ya da geliştirir (gerçek bir müzakere — herkes aynı "
    "şeyi söylemez, taslağın İÇERİĞİNE göre konuşur). Sonunda taslakta NEYİN düzeltilmesi/"
    "eklenmesi/çıkarılması gerektiğini SOMUT önerir ve önerileri uygulayarak taslağı YENİDEN YAZAR.\n"
    "ÜYELER (yalnız bu id'ler): taslakci (biçim/akış), hukukcu (dayanak+doğrulama), vatandas (üslup).\n"
    "KESİN KURALLAR:\n"
    "1) 'oneriler' ve 'uzlasi_metni' içinde YALNIZCA taslak metninde ZATEN GEÇEN kanun/madde "
    "atıflarına dokunabilirsin. Aşağıdaki 'İlgili mevzuat' listesi yalnızca BAĞLAMDIR; yeni atıf "
    "ekleme lisansı DEĞİLDİR. Taslakta olmayan HİÇBİR kanun adı/numarası/madde ekleme.\n"
    "2) 'uzlasi_metni': önerileri uygulayarak taslağı yeniden yaz. Taslakta ZATEN var olan kurum/kişi "
    "adı, tarih, sayı, madde numaralarını DEĞİŞTİRME. Yeni somut bilgi ekleme (kaynakta yoksa). "
    "Değişiklik gerekmiyorsa taslağı OLDUĞU GİBİ döndür.\n"
    "3) Türkçe, resmî, 3. tekil/edilgen üslup. Emoji yok. Karar/oy verme (kararı sistem hesaplar).\n"
    "YALNIZ şu şemada geçerli JSON döndür:\n"
    '{"turlar": [{"uye": "taslakci|hukukcu|vatandas", "soz": "kısa müzakere cümlesi"}], '
    '"oneriler": [{"tip": "duzelt|ekle|cikar", "dayanak": "verify|lint_2646|nli|tutarlilik|uslup|dayanak", '
    '"aciklama": "somut öneri", "uygula": true}], '
    '"uzlasi_metni": "önerilerle revize edilmiş TAM taslak metni"}'
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


def _normalize_turlar(ham: Any) -> list[dict[str, str]]:
    """LLM turlarını kapalı-küme üyeye eşle + gövde temizle; uydurma üye/boş söz düşer."""
    out: list[dict[str, str]] = []
    for t in (ham if isinstance(ham, list) else [])[:_MAKS_TUR]:
        if not isinstance(t, dict):
            continue
        who = str(t.get("uye") or "").strip()
        soz = _tek_satir(str(t.get("soz") or ""), 400)
        if who in _UYE_ID and soz:
            out.append({"who": who, "kaynak": "muzakere", "text": soz})
    return out


def _normalize_oneriler(ham: Any) -> list[dict[str, Any]]:
    """LLM önerilerini kapalı-küme tip/dayanağa eşle + gövde temizle; geçersiz tip düşer."""
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
            "metin": metin, "uygulanabilir": bool(o.get("uygula", False)),
        })
    return out


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
    yeni_atif = {a.lower() for a in _ATIF_DESENI.findall(uzlasi)} - {a.lower() for a in _ATIF_DESENI.findall(orijinal)}
    if yeni_atif:
        log.warning("kurul_uzlasi_uydurma_atif", atiflar=sorted(yeni_atif)[:5])
        return False
    return True


async def kurul_muzakere(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any],
) -> dict[str, Any] | None:
    """DeepSeek roundtable → normalize edilmiş kurgu; LLM yok/mock/hata/parse-fail → None.

    Dönen (frontend muzakere kurgusu şekliyle uyumlu, kaynak='llm'):
      {kaynak, karar, turlar, oneriler, uzlasi_metni, uzlasi_degisti, uzlasi_uygulanabilir}
    Karar sunucuda deterministik; uzlaşı metni revize-guard'dan geçer (sahte revizyon yok).
    """
    if real_llm() is None:
        return None
    if len(taslak_md) > _REVIZE_MAX_TASLAK_CHARS:
        log.warning("kurul_taslak_cok_uzun", n_char=len(taslak_md))
        return None

    # KARAR daima SUNUCU sinyalinden — istemci mevzuat_nli KARARA girmez (yalnız prompt bağlamı);
    # aksi hâlde istemci nli:[] göndererek şerhi uzlaşıya yumuşatabilirdi (adversarial bulgu).
    bant = str((sinyaller.get("risk_metadata") or {}).get("bant") or "")
    itiraz = _itiraz_sayisi(sinyaller)
    karar = kurul_karar(bant, itiraz)

    user = (
        f"GÜNCEL TASLAK:\n{taslak_md}\n\n"
        f"GERÇEK DOĞRULAMA SİNYALLERİ:\n{_sinyal_ozeti(sinyaller, meta)}"
    )
    obj = await llm_json(_SYSTEM, user, max_tokens=_MAKS_TOKENS, temperature=0.3)
    if not isinstance(obj, dict):
        return None

    turlar = _normalize_turlar(obj.get("turlar"))
    oneriler = _normalize_oneriler(obj.get("oneriler"))
    if not turlar and not oneriler:
        return None  # boş/kullanışsız çıktı → deterministik fallback daha iyi

    # Uzlaşı metni: revize-guard + aşırı-uzama + mevzuat grounding → geçmezse orijinal korunur.
    ham_uzlasi = obj.get("uzlasi_metni")
    uzlasi = ham_uzlasi.strip() if isinstance(ham_uzlasi, str) else ""
    gecerli = bool(uzlasi) and _uzlasi_gecerli(taslak_md, uzlasi)
    uzlasi_metni = uzlasi if gecerli else taslak_md
    uzlasi_degisti = gecerli and uzlasi_metni.strip() != taslak_md.strip()

    log.info("kurul_muzakere", karar=karar, n_tur=len(turlar), n_oneri=len(oneriler),
             uzlasi_degisti=uzlasi_degisti, itiraz=itiraz)
    return {
        "kaynak": "llm",
        "karar": karar,
        "turlar": turlar,
        "oneriler": oneriler,
        "uzlasi_metni": uzlasi_metni,
        "uzlasi_degisti": uzlasi_degisti,
        # Revize taslağı her bantta uygulanabilir (yüksek riskte bile: revizyon riski GİDERİR,
        # ör. dayanaksız iddiayı çıkarır). Karar yalnız risk ROZETİ; sevk/mühür töreni yok.
        "uzlasi_uygulanabilir": uzlasi_degisti,
    }


__all__ = ("KURUL_UYELERI", "kurul_karar", "kurul_muzakere")
