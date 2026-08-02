"""Mevzuat-teşkilat şablonlarının kuruma genişletilmesi — kapsam ve kalıp çözümlemesi.

Sözleşme: `docs/11-mevzuat-teskilat.md`. Bazı kurum türlerinde birim listesini kurumun
kendisi değil MEVZUAT tür geneli için belirler (her ilçede İlçe Yazı İşleri Müdürlüğü
bulunur — Valilik ve Kaymakamlık Birimleri Yönetmeliği m.10/1-a). Bu modül, doğrulanmış
bir şablonun somut bir kuruma genişletilip genişletilemeyeceğine karar verir.

ÜRETTİĞİ ŞEY BİR ÖNERİDİR, OTOMATİK HAVALE DEĞİL. Aynı Yönetmelik m.26/2 havaleyi
"valilik tarafından çıkarılacak İmza Yetkileri Yönergesi ile belirlenen görevli"ye ait
devredilmiş imza yetkisi sayar; GEÇİCİ MADDE 1 ise birimin o mülki idarede fiilen kurulu
olmasını garanti etmez. Bu yüzden `uclu_grounding` mevzuat adayını KABUL ETMEZ — aday
memur onayına gider (bkz. docs/11 §7).

Otorite `sicil.tur` DEĞİL, `kurum_kimlik.tur` de DEĞİL: doğrulanmış şablon DOSYASININ kendi
başlığındaki kapsam deklarasyonuna karşı **kanonik slug kalıbı** eşleşmesidir (INV-6). Kalıp,
ad kalıbı ve kapsam listesi indeksten değil, manifest+SHA-256 ile doğrulanmış DOSYADAN
okunur (INV-8); indeksin `sablonlar` bölümü yalnız keşif listesidir.

BM25 puanlaması bilinçli olarak burada DEĞİL — çağıran (`teskilat_ara`) kendi skorlayıcısını
kullanır; böylece bu modül `teskilat_ara`'ya bağımlı olmaz (döngüsel import yok).
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from core.kaynak_guveni import RESMI_DOGRULANMIS, manifest_yukle

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[3]
_TESKILAT_DIR = _ROOT / "data" / "teskilat"
_MANIFEST_FILE = _TESKILAT_DIR / "kaynak_manifest.json"

# Şablon dizini öneki. `_genel-*` (jenerik havuz) ile KESİŞMEZ — INV-7.
SABLON_ONEK = "_mevzuat-"
KAPSAM_DIR = "_kapsam"
KAYNAK_TIPI = "mevzuat_teskilat"

# "{alan}-valiligi" → sabit kuyruk "-valiligi". {alan} tam olarak bir kez geçmeli.
_KALIP_RE = re.compile(r"^\{alan\}(?P<kuyruk>[a-z0-9-]+)$")
_AD_KALIP_RE = re.compile(r"\{ad\}")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_BASLIK_RE = re.compile(r"^@(\w+):\s*(.*)$")

# İçerik-adresli önbellek: anahtar dosyanın SHA-256'sı. mtime/size ile anahtarlamak
# (os.utime + dolgu ile taklit edilebildiği için) YETERSİZDİR — güvenlik denetimi bulgusu.
_ICERIK_ONBELLEK: dict[str, Any] = {}


@dataclass(frozen=True)
class Genisleme:
    """Bir kurumun hangi şablondan, hangi kapsam üyeliğiyle genişletileceği."""

    sablon_slug: str
    kaynak_dosya: str    # doğrulanmış şablon dosyası (teskilat dizinine göreli)
    kurum_slug: str      # genişletmenin hedefi (kanonik)
    kurum_ad: str        # kapsam listesindeki resmî ad + şablonun ad kalıbı
    alan: str            # kapsam listesi üyesi (il/ilçe slug'ı)


def onbellegi_temizle() -> None:
    """Test/operasyon: içerik önbelleğini boşalt."""
    _ICERIK_ONBELLEK.clear()


def _dogrulanmis_icerik(rel_yol: str) -> str | None:
    """Dosya manifest'te resmi_dogrulanmis VE SHA-256'sı uyuşuyorsa içeriğini döndür.

    INV-8: adayın/indeksin beyanına GÜVENİLMEZ; hash her çağrıda diskten hesaplanır.
    Uyuşmazsa `None` — çağıran genişletmeyi sessizce durdurur.
    """
    if not rel_yol:
        return None
    path = _TESKILAT_DIR / rel_yol
    # TOCTOU: baytlar BİR KEZ okunur, hash BELLEKTEKİ baytlardan hesaplanır. Önce hash'leyip
    # sonra ayrıca okumak, arada değiştirilen dosyanın doğrulanmamış içeriğini geçerli hash
    # anahtarıyla önbelleğe yazardı (güvenlik denetimi bulgusu F9).
    try:
        veri = path.read_bytes()
    except OSError:
        return None
    # Özet, manifesti üreten `dosya_sha256` ile AYNI normalleştirmeyi uygulamalı (BOM, CRLF/CR
    # -> LF, dosya sonu boşluğu). Aksi halde depo Windows'ta düzenlendiğinde satır sonu bicimi
    # degisir, hash tutmaz ve doğrulanmış şablon SESSİZCE devre dışı kalır — ölçüldü 2026-08-02:
    # üniversite şablonu bu yüzden hiç genişlemedi, sorgular jenerik listeye düşüyordu.
    try:
        gercek = hashlib.sha256(
            (veri.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n").rstrip("\n") + "\n")
            .encode("utf-8")
        ).hexdigest()
    except UnicodeDecodeError:
        gercek = hashlib.sha256(veri).hexdigest()
    kayit = manifest_yukle(_MANIFEST_FILE).get(rel_yol) or {}
    if str(kayit.get("durum", "")).strip() != RESMI_DOGRULANMIS:
        return None
    beklenen = str(kayit.get("icerik_sha256", "") or "").strip().lower()
    if not beklenen or beklenen != gercek:
        return None
    onbellek = _ICERIK_ONBELLEK.get(gercek)
    if onbellek is None:
        onbellek = veri.decode("utf-8", errors="replace")
        if len(_ICERIK_ONBELLEK) >= 32:
            _ICERIK_ONBELLEK.clear()
        _ICERIK_ONBELLEK[gercek] = onbellek
    return onbellek


def dosya_gecerli(rel_yol: str) -> bool:
    """Dosya manifest + SHA-256 yeniden doğrulamasından geçiyor mu."""
    return _dogrulanmis_icerik(rel_yol) is not None


def _baslik(icerik: str) -> dict[str, str]:
    """Doğrulanmış dosyanın TÜM @-başlıklarını oku (pencere yok — guard kaçağı olmasın)."""
    meta: dict[str, str] = {}
    for ham in icerik.splitlines():
        m = _BASLIK_RE.match(ham.rstrip())
        if m:
            meta[m.group(1).upper()] = m.group(2).strip()
    return meta


def _kapsam_ayristir(icerik: str) -> dict[str, str]:
    """Kapsam dosyası içeriği → {alan_slug: resmî ad}. Satır: `slug|Resmî Ad`."""
    kapsam: dict[str, str] = {}
    for ham in icerik.splitlines():
        satir = ham.strip()
        if not satir or satir.startswith("#") or satir.startswith("@"):
            continue
        slug, ayirac, ad = satir.partition("|")
        slug, ad = slug.strip(), ad.strip()
        if ayirac and slug and ad and _SLUG_RE.match(slug):
            kapsam.setdefault(slug, ad)
    return kapsam


def _sablonlar(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """İndeksin şablon KEŞİF listesi. Yetki taşımaz; her tanım dosyadan doğrulanır."""
    ham = payload.get("sablonlar")
    if not isinstance(ham, dict):
        return {}
    return {ad: t for ad, t in ham.items() if isinstance(t, dict)}


def _kuyruk(kalip: str) -> str:
    """'{alan}-valiligi' → '-valiligi'; kalıp bozuksa boş (eşleşme olmaz)."""
    m = _KALIP_RE.match((kalip or "").strip())
    return m.group("kuyruk") if m else ""


def kapsam_cozumle(payload: dict[str, Any], kurum_slug: str) -> Genisleme | None:
    """Kurum bir mevzuat şablonunun kapsamına giriyor mu? Girmiyorsa None.

    Koşullar (hepsi birden): slug geçerli biçimde · `_` ile başlamıyor · şablon dosyası
    manifest+SHA ile ŞU AN doğrulanıyor · kalıp/ad kalıbı/kapsam dosyası ADI o doğrulanmış
    dosyanın başlığından okunuyor · kapsam dosyası da doğrulanıyor ve DİSKTEN ayrıştırılıyor ·
    slug kalıba ARTIK TOKEN BIRAKMADAN oturuyor · `{alan}` kapsam listesinde. Birden çok
    şablon eşleşirse BELİRSİZLİK sayılır ve genişleme yapılmaz (güvenli taraf).
    """
    slug = (kurum_slug or "").strip()
    if not slug or slug.startswith("_") or not _SLUG_RE.match(slug):
        return None

    bulunan: list[Genisleme] = []
    for sablon_slug, tanim in _sablonlar(payload).items():
        if not sablon_slug.startswith(SABLON_ONEK):
            continue  # INV-7: yalnız _mevzuat-* şablon olabilir
        rel = str(tanim.get("kaynak_dosya", ""))
        # Kalıp ve kapsam DOSYADAN okunur; indeksteki kopya yalnız keşif içindir (INV-8).
        icerik = _dogrulanmis_icerik(rel)
        if icerik is None:
            continue
        meta = _baslik(icerik)
        kuyruk = _kuyruk(meta.get("KAPSAM_KALIP", ""))
        ad_kalip = meta.get("KAPSAM_AD_KALIP", "")
        kapsam_dosya = meta.get("KAPSAM_ALAN_DOSYA", "")
        if not kuyruk or not ad_kalip or not _AD_KALIP_RE.search(ad_kalip):
            continue
        if not slug.endswith(kuyruk):
            continue
        alan = slug[: -len(kuyruk)]
        if not alan:
            continue
        kapsam_icerik = _dogrulanmis_icerik(kapsam_dosya)
        if kapsam_icerik is None:
            continue
        resmi_ad = _kapsam_ayristir(kapsam_icerik).get(alan, "")
        if not resmi_ad:
            continue
        bulunan.append(Genisleme(
            sablon_slug=sablon_slug,
            kaynak_dosya=rel,
            kurum_slug=slug,
            kurum_ad=_AD_KALIP_RE.sub(resmi_ad, ad_kalip),
            alan=alan,
        ))

    if len(bulunan) != 1:
        if bulunan:
            log.warning("mevzuat.kapsam_belirsiz", kurum=slug,
                        sablonlar=[g.sablon_slug for g in bulunan])
        return None
    return bulunan[0]


def mevzuat_kapsaminda(payload: dict[str, Any], kurum_slug: str) -> bool:
    """Kurum için mevzuat-dayanaklı bir birim ÖNERİSİ üretilebilir mi?

    `kurum_korpusta_var()` ile KARIŞTIRMA: o, kuruma-özel doğrulanmış kaynağı sorar ve
    INV-1 gereği bu yoldan asla True dönmez. Bu predicate de otomatik havale yetkisi
    VERMEZ — mevzuat adayı her hâlükârda memur onayına gider.
    """
    return kapsam_cozumle(payload, kurum_slug) is not None


__all__ = (
    "KAYNAK_TIPI",
    "SABLON_ONEK",
    "Genisleme",
    "dosya_gecerli",
    "kapsam_cozumle",
    "mevzuat_kapsaminda",
    "onbellegi_temizle",
)
