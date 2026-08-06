"""Resmî kaynak adresini web aramasıyla bulur — canlı keşfin SON ve tek ücretli katmanı.

Sıra: (1) `kurum_alan` kalıptan adres türetir [ücretsiz, kurumların %69,8'i],
(2) `sayfa_kesif` o sitede birim sayfasını bulur [ücretsiz], (3) BURASI yalnız ikisi de
tutmazsa devreye girer. Yani ücretli katman kurumların ~%30'unu ilgilendirir.

MODEL NEYİ DÖNDÜRÜR: bir ADRES. Birim listesi DEĞİL. Adres `sayfa_kesif.izinli_mi`den
geçer, sayfayı biz indiririz, birim adlarının o sayfada birebir geçtiğini biz doğrularız.
Modelin ürettiği metin hiçbir zaman doğrudan korpusa yazılmaz.

ÜÇ KORUMA:
  · `allowed_domains` — API SEVİYESİNDE kısıt, prompt'ta rica değil. Model resmî alan
    dışına çıkamaz. Dönen adres ayrıca yerel olarak da doğrulanır (kemer + askı).
  · SERT HARCAMA TAVANI — `KESIF_AZAMI_HARCAMA_USD`. Tavana ulaşılınca arama kendini
    kapatır ve sistem ücretsiz katmanlara döner; hata fırlatmaz, yalnız link göstermez.
  · 429 GERİ ÇEKİLME — hesabın dakikalık token limiti dolabiliyor (ölçüldü 2026-08-06:
    tek çağrı 41.684 token istedi ve TPM limitine takıldı). Yeniden deneme olmadan
    keşif rastgele başarısız olur.

MALİYET (2026-08-06 ölçümü, tek çağrı 10.613 girdi + 178 çıktı token):
    gpt-5.6-luna  ≈ $0,008   ← varsayılan
    gpt-5.6-terra ≈ $0,030
Girdinin büyük olmasının sebebi arama sonuçlarının modele geri beslenmesidir; soru kısa
olsa da girdi büyük olur. Bu yüzden ucuz model varsayılandır.

SAYAÇ NEDEN DEFTER (LEDGER) — 2026-08-06 denetimi:
Sayaç önce tek bir `{"usd": x}` dosyasıydı ve oku→ekle→yaz biçiminde güncelleniyordu.
Ölçüldü: 20 iş parçacığı × 10 artım × $0,001'de beklenen $0,20 yerine dosyaya **$0,007**
yazıldı — paranın %96,5'i kayboldu (son yazan kazanıyor). Ayrıca `write_text` dosyayı
önce boşalttığı için yarım okuma/çökme sonrası sayaç **0 sayılıyor** ve tavan sıfırdan
başlıyordu. Üçüncü olarak tavan kontrolü ile harcamanın arası kilitsizdi (TOCTOU):
tavana $0,0005 kala 50 eşzamanlı kontrolün 50'si de "açık" dedi.

Şimdi sayaç **yalnız ekleme yapılan bir defterdir**: her çağrı bir satır ekler, bakiye
satırların toplamıdır. Ekleme yarışı yoktur (kimse kimsenin satırını ezmez), çökme en
fazla son satırı bozar, ve defter denetlenebilirdir. Üç kural daha:
  · FAIL-CLOSED okuma: defter VAR ama bozuksa bakiye sonsuz sayılır (katman kapanır).
    Dosyanın hiç olmaması meşrudur (ilk çalıştırma) ve 0 sayılır.
  · REZERVASYON: para İSTEKTEN ÖNCE düşülür, yanıt gelince gerçek maliyetle mutabakat
    yapılır. Böylece "ödendi ama yazılamadı" (timeout, çökme) penceresi kapanır.
  · Yazamıyorsak HARCAMIYORUZ: defter yazılamazsa katman süreç boyunca kapanır.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx
import structlog

from core.sayfa_kesif import izinli_mi

log = structlog.get_logger()

_UC = "https://api.openai.com/v1/responses"
# Arama bu alanlarla SINIRLI — API tarafında zorlanır (prompt'a bırakılmaz).
IZINLI_ARAMA_ALANLARI = ("gov.tr", "bel.tr", "edu.tr")
_ZAMAN_ASIMI = 60.0
_AZAMI_DENEME = 3
_URL_RE = re.compile(r"https://[^\s<>\"']+")

# 1M token başına USD (2026-08-06 fiyat sayfası). Harcama tavanını yerel hesaplamak için;
# fatura kaynağı değil, yalnız KENDİ KENDİNİ DURDURMA eşiği.
_FIYAT = {
    "gpt-5.6-luna": (0.20, 1.20),
    "gpt-5.6-terra": (2.00, 12.00),
    "gpt-5.6-sol": (5.00, 30.00),
}
_VARSAYILAN_FIYAT = (2.00, 12.00)   # bilinmeyen model → pahalı say, erken dur

# Token ücreti maliyetin YALNIZ BİR PARÇASI: `web_search` aracı çağrı başına ayrıca
# faturalanır. Deponun kendi ölçümü (10.613 girdi + 178 çıktı → ≈$0,008) ile token
# hesabı (luna'da $0,0023) arasındaki fark bu araç ücretidir. Aradaki 3,4 katlık boşluk
# denetimde bulundu: tavan $1,50 iken gerçek harcama ~$5'e çıkabiliyordu.
# Sağlayıcı fiyat sayfasından teyit edilene kadar YUKARI yuvarlanır — fazla saymak
# güvenli yön, eksik saymak değil.
_ARAMA_ARAC_UCRETI_USD = 0.006
# Bir çağrı hiçbir koşulda bundan ucuz sayılmaz (ölçülen gerçek çağrı bedeli).
_OLCULEN_ASGARI_CAGRI_USD = 0.008
# İstek atılmadan önce düşülen tutar. Yanıt gelince gerçekle mutabakat yapılır; hata/
# timeout hâlinde olduğu gibi kalır (para gitmiş olabilir, sayaç bunu varsayar).
_REZERVASYON_USD = 0.02

_HARCAMA_DOSYASI = Path(__file__).resolve().parents[2] / "data" / "kesif_harcama.json"
# Süreç içi kilit: "tavanı kontrol et + rezerve et" tek kritik bölge olmalı (TOCTOU).
# Çok-süreçli dağıtımda bu kilit yetmez; o hâlde defterin toplamı yine doğru kalır,
# yalnız tavan bir rezervasyon kadar aşılabilir — bilinçli ve sınırlı bir kayıp.
_KILIT = threading.RLock()
# Defter yazılamıyorsa (salt-okunur dizin, disk dolu) katman bu süreçte kapanır:
# harcamayı kaydedemiyorsak harcama yapmayız.
_YAZILAMIYOR = False
# Bu süreçte deftere yazılan toplam — dosya silinse bile tavanı geri açtırmayan alt sınır.
_SURECTE_HARCANAN = 0.0


@dataclass(frozen=True)
class AramaSonucu:
    url: str
    model: str
    maliyet_usd: float


def _cevre(ad: str, varsayilan: str = "") -> str:
    return (os.getenv(ad) or varsayilan).strip()


def azami_harcama() -> float:
    try:
        return max(0.0, float(_cevre("KESIF_AZAMI_HARCAMA_USD", "0")))
    except ValueError:
        return 0.0


def harcanan() -> float:
    """Defterdeki toplam harcama. FAIL-CLOSED.

    · Dosya hiç yoksa 0.0 — ilk çalıştırma meşrudur.
    · Dosya VAR ama okunamıyor/bozuksa `inf` — katman kapanır. Eskiden burada 0.0
      dönülüyordu ve tek bir bozuk yazma tavanı sıfırlıyordu (denetimde ölçüldü).
    · SÜREÇ-İÇİ YÜKSEK SU SEVİYESİ: dönen değer bu süreçte yazılan toplamdan asla küçük
      olamaz. "Dosya yoksa 0" kuralı doğru ama tek başına tavanı SİLİNEBİLİR bir dosyaya
      bağlıyordu; log rotasyonu, disk temizliği ya da bir `git clean -fdx` bütçeyi
      sessizce yeniden açardı. Süreç yaşadığı sürece bu mümkün değil.
    """
    try:
        ham = _HARCAMA_DOSYASI.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _SURECTE_HARCANAN
    except OSError as exc:
        log.error("kesif.defter_okunamadi", hata=str(exc))
        return float("inf")
    toplam = 0.0
    for satir in ham.splitlines():
        satir = satir.strip()
        if not satir:
            continue
        try:
            toplam += float(json.loads(satir)["usd"])
        except (ValueError, KeyError, TypeError):
            # Bozuk satır = kaybolmuş harcama kaydı. Ne kadar harcandığını bilmiyoruz,
            # bu yüzden "harcanmadı" varsayamayız.
            log.error("kesif.defter_bozuk", satir=satir[:80])
            return float("inf")
    return max(toplam, _SURECTE_HARCANAN)


def _deftere_ekle(tutar: float) -> bool:
    """Deftere tek satır EKLE (üzerine yazma yok). Yazılamazsa katmanı kapat.

    Ekleme kipi bilinçli: iki eşzamanlı yazıcı birbirinin satırını ezemez, çökme en
    fazla son satırı bozar ve o da `harcanan()` tarafından fail-closed yakalanır.

    KİLİT NEDEN GEREKLİ (ölçüldü): yalnız ekleme kipine güvenmek Windows'ta YETMİYOR —
    aynı dosyayı 20 iş parçacığıyla paralel açmak paylaşım ihlali (OSError) veriyor ve
    200 yazımın 124'ü düşüyordu. Kilit süreç içindeki yazımları sıraya sokar.
    ÇOK-SÜREÇLİ SINIR: birden çok uvicorn worker'ında bu kilit paylaşılmaz; o hâlde bile
    defter TOPLAMI doğru kalır (ekleme kipi), yalnız nadir bir paylaşım ihlali fazladan
    bir çağrıyı iptal edebilir — güvenli yön.
    """
    global _YAZILAMIYOR, _SURECTE_HARCANAN
    satir = json.dumps({"usd": round(tutar, 6), "ts": int(time.time()),
                        "pid": os.getpid(), "id": uuid.uuid4().hex[:8]},
                       ensure_ascii=False) + "\n"
    with _KILIT:
        try:
            _HARCAMA_DOSYASI.parent.mkdir(parents=True, exist_ok=True)
            with open(_HARCAMA_DOSYASI, "a", encoding="utf-8", newline="\n") as f:
                f.write(satir)
                f.flush()
                os.fsync(f.fileno())
        except OSError as exc:
            _YAZILAMIYOR = True
            log.error("kesif.defter_yazilamadi_katman_kapandi", hata=str(exc))
            return False
        _SURECTE_HARCANAN = max(0.0, _SURECTE_HARCANAN + tutar)
    return True


def acik_mi() -> bool:
    """Web araması kullanılabilir mi: anahtar var, defter sağlam, tavan aşılmamış."""
    if _YAZILAMIYOR or not _cevre("KESIF_OPENAI_API_KEY"):
        return False
    return harcanan() < azami_harcama()


def _rezerve_et() -> bool:
    """Tavanı kontrol et ve parayı ÖNCEDEN düş — tek kritik bölgede (TOCTOU kapalı)."""
    with _KILIT:
        if not acik_mi():
            return False
        return _deftere_ekle(_REZERVASYON_USD)


def _mutabakat(gercek: float) -> None:
    """Rezervasyonu gerçek maliyetle düzelt (fark negatif olabilir — defter toplamdır)."""
    fark = round(gercek - _REZERVASYON_USD, 6)
    if fark:
        with _KILIT:
            _deftere_ekle(fark)


def _maliyet(model: str, girdi: int, cikti: int, arama_sayisi: int = 1) -> float:
    """Token ücreti + `web_search` araç ücreti; ölçülen asgari çağrı bedelinin altına inmez."""
    gi, co = _FIYAT.get(model, _VARSAYILAN_FIYAT)
    token = girdi * gi / 1e6 + cikti * co / 1e6
    arac = max(1, arama_sayisi) * _ARAMA_ARAC_UCRETI_USD
    return max(token + arac, _OLCULEN_ASGARI_CAGRI_USD)


def _soru(kurum_ad: str) -> str:
    return (
        f"{kurum_ad} kurumunun RESMÎ web sitesinde, birimlerini/teşkilatını listeleyen "
        "sayfanın TAM adresini bul. Yalnız adresi yaz, başka hiçbir şey yazma. "
        "Bulamazsan sadece YOK yaz."
    )


def kaynak_sayfasi_ara(kurum_ad: str) -> AramaSonucu | None:
    """Kurumun birim sayfasının adresini web aramasıyla bul. Kapalıysa/bulamazsa None.

    Dönen adres YALNIZ bir adrestir; sayfayı çağıran indirir ve birim adlarını orada
    birebir doğrular. Model çıktısı korpusa yazılmaz.
    """
    # Tavan kontrolü ve paranın düşülmesi TEK kritik bölgede yapılır; ayrı yapılırsa
    # eşzamanlı çağrılar aynı bakiyeyi görüp hep birlikte geçiyordu (ölçüldü: tavana
    # $0,0005 kala 50 eşzamanlı kontrolün 50'si de "açık" dedi).
    if not _rezerve_et():
        bakiye = harcanan()
        log.info("kesif.web_aramasi_kapali",
                 harcanan=None if bakiye == float("inf") else round(bakiye, 4),
                 tavan=azami_harcama(), defter_bozuk=bakiye == float("inf"))
        return None
    model = _cevre("KESIF_ARAMA_MODEL", "gpt-5.6-luna")
    govde = {
        "model": model,
        "input": _soru(kurum_ad),
        "tools": [{"type": "web_search",
                   "filters": {"allowed_domains": list(IZINLI_ARAMA_ALANLARI)}}],
        # TEK ÇAĞRININ maliyeti üstten sınırlı olmalı: model istediği kadar arama yapıp
        # istediği kadar yazarsa bir çağrı tek başına tavanı aşabilir. Bizim beklediğimiz
        # çıktı tek bir adres — 120 token fazlasıyla yeter.
        "max_output_tokens": 120,
        "max_tool_calls": 2,
    }
    basliklar = {"Authorization": f"Bearer {_cevre('KESIF_OPENAI_API_KEY')}",
                 "Content-Type": "application/json"}

    yanit: httpx.Response | None = None
    for deneme in range(_AZAMI_DENEME):
        try:
            yanit = httpx.post(_UC, timeout=_ZAMAN_ASIMI, headers=basliklar, json=govde)
        except Exception as exc:
            # Rezervasyon BİLEREK geri alınmaz: istek sağlayıcıya ulaşıp faturalanmış
            # olabilir (özellikle timeout'ta). Fazla saymak güvenli yön.
            log.warning("kesif.istek_hatasi", hata=type(exc).__name__)
            return None
        if yanit.status_code != 429:
            break
        # Hesabın dakikalık token limiti dolu; üstel geri çekilme.
        bekle = min(2 ** deneme * 4, 20)
        log.info("kesif.hiz_limiti", deneme=deneme + 1, bekle=bekle)
        time.sleep(bekle)
    if yanit is None or yanit.status_code != 200:
        log.warning("kesif.basarisiz", durum=None if yanit is None else yanit.status_code)
        return None

    try:
        veri = yanit.json()
    except ValueError:
        # 200 ama JSON değil (proxy/WAF hata sayfası, kesik gövde). Çağrı faturalandı;
        # rezervasyon yerinde kalır.
        log.warning("kesif.yanit_json_degil")
        return None

    kullanim = veri.get("usage") or {}
    # Alan adları sağlayıcıya/sürüme göre değişebiliyor; bilinen eşanlamlılar denenir.
    girdi = int(kullanim.get("input_tokens") or kullanim.get("prompt_tokens") or 0)
    cikti = int(kullanim.get("output_tokens") or kullanim.get("completion_tokens") or 0)
    arama_sayisi = sum(1 for oge in veri.get("output", [])
                       if str(oge.get("type", "")).startswith("web_search"))
    if not girdi and not cikti:
        # usage okunamadı. SIFIR YAZMAK "ücretsiz çağrı" demektir ve sayacı sonsuza
        # kadar açık bırakır — ölçülen asgari bedeli yaz.
        log.error("kesif.usage_okunamadi", anahtarlar=sorted(kullanim)[:6])
    maliyet = _maliyet(model, girdi, cikti, arama_sayisi)
    _mutabakat(maliyet)

    metin = " ".join(
        (parca.get("text") or "")
        for oge in veri.get("output", []) if oge.get("type") == "message"
        for parca in (oge.get("content") or [])
    )
    eslesme = _URL_RE.search(metin)
    if not eslesme:
        log.info("kesif.adres_bulunamadi", kurum=kurum_ad, maliyet=round(maliyet, 5))
        return None
    url = eslesme.group(0).rstrip(".,;)\"'")
    # KEMER + ASKI: allowed_domains API'de zorlansa da dönen adres yerel olarak da
    # doğrulanır. Filtrenin ileride değişmesi ya da modelin metin içinde başka bir
    # adres yazması bizi izinsiz alana götürmemeli.
    if not izinli_mi(url):
        log.warning("kesif.izinsiz_adres_reddedildi", url=url)
        return None
    log.info("kesif.bulundu", kurum=kurum_ad, url=url, maliyet=round(maliyet, 5))
    return AramaSonucu(url=url, model=model, maliyet_usd=maliyet)


__all__ = (
    "IZINLI_ARAMA_ALANLARI",
    "AramaSonucu",
    "acik_mi",
    "azami_harcama",
    "harcanan",
    "kaynak_sayfasi_ara",
)
