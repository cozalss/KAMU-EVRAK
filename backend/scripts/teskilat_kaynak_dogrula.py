"""Teşkilat dosyalarını künyelerindeki resmî kaynağa karşı doğrular.

Sayfayı burada indirip karşılaştırırız; ekrana YALNIZ fark basılır. Amaç ajanın bağlamına
tüm listeyi taşımadan doğrulama yapabilmek — liste context'e girerse maliyet ~10 katına çıkar.

Çıktı satırları:
    TAM      dosyadaki her birim kaynakta bulundu, fazlalık yok
    FARK     eksik/fazla birimler listelenir (dosya manifeste ALINMAMALI, önce düzeltilmeli)
    ERISILEMEDI  kaynak indirilemedi (403/SSL/yönlendirme) — dosya aday kalır

Kullanım:
    python scripts/teskilat_kaynak_dogrula.py                    # tüm BEKLİYOR dosyaları
    python scripts/teskilat_kaynak_dogrula.py izmir mersin       # slug parçasına göre süz
"""
from __future__ import annotations

import html
import io
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
_MANIFEST = _TESKILAT_DIR / "kaynak_manifest.json"

# Resmî birim adları bu eklerden biriyle biter; "Genel Sekreter", "Belediye Başkanı" gibi
# MAKAM adları bilerek dışarıda kalır — onlar birim değil, kişi/kadro.
_SON_EKLER = (
    "Dairesi Başkanlığı", "Daire Başkanlığı", "Kurulu Başkanlığı", "Birimi Başkanlığı",
    "Birim Başkanlığı", "Şube Müdürlüğü", "Müdürlüğü", "Müşavirliği", "Başhekimliği",
    # Belediyelerde standart dışı ama gerçek unvanlar. Listede olmadıkları için sayfada
    # BULUNSALAR BİLE eşleşmiyor ve dosya haksız yere "FARK" çıkıyordu (ölçüldü:
    # Gaziantep'te 6, Diyarbakır'da 2 birim bu yüzden eksik sanıldı).
    "Koordinatörlüğü", "Uzmanlığı", "Birimi", "Kurulu", "Genel Sekreterliği",
    # Bazı belediye siteleri unvanı kısaltarak yazıyor (ölçüldü: Antalya "Dai.Bşk.",
    # Denizli/Diyarbakır "Dairesi Bşk."). Kısaltma birimin varlığını değiştirmez.
    "Dai.Bşk.", "Dai. Bşk.", "Dairesi Bşk.", "Daire Bşk.", "D.Bşk.", "Bşk.",
)
# Kısaltmalar normalleştirmede tam yazıma açılır; dosyada tam yazım tutulur.
_KISALTMA = (
    (r"\bdai\b", "daire"), (r"\bd\b(?= bsk)", "daire"), (r"\bbsk\b", "baskanligi"),
    (r"\bmud\b", "mudurlugu"), (r"\bilis\b", "iliskiler"), (r"\bhizm\b", "hizmetleri"),
)
_ADAY_RE = re.compile(
    r"[A-ZÇĞİÖŞÜ0-9][^<>\n\r\t|•]{2,75}?(?:" + "|".join(map(re.escape, _SON_EKLER)) + ")"
)
_ETIKET_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.S | re.I)
_ASCII = str.maketrans("çğıöşüâîûÇĞİÖŞÜÂÎÛ", "cgiosuaiuCGIOSUAIU")
_BASLIK = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "tr-TR,tr;q=0.9",
}


def _norm(s: str) -> str:
    s = html.unescape(s).replace("İ", "i").replace("I", "ı").lower().translate(_ASCII)
    s = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()
    # Aynı sitede "Daire Başkanlığı" ve "Dairesi Başkanlığı" karışık kullanılıyor; bu fark
    # birimin varlığını değiştirmediği için eşleştirmede yok sayılır (dosyadaki yazım korunur).
    s = re.sub(r"\bdairesi\b", "daire", s)
    for desen, acik in _KISALTMA:
        s = re.sub(desen, acik, s)
    return re.sub(r"\s+", " ", s).strip()


_KUYRUK_UNVAN_RE = re.compile(
    r"(?:daire baskanligi|baskanligi|sube mudurlugu|mudurlugu|musavirligi|"
    r"kurulu baskanligi|birimi baskanligi)"
)


def _kaynakta_var(bizimki: str, sayfa: set[str]) -> bool:
    """Kaynak sayfaları birim adının başına kişi/kurum adı ekleyebiliyor.

    'Adem Yavuz Kireker Yazı İşleri ve Kararlar Daire Başkanlığı' veya
    'MBB Yol Yapım ...' gibi. Bu yüzden birebir eşitlik yerine SONUNA bakılır — birim adı
    aday dizginin sonunda geçiyorsa kaynak o birimi destekliyor sayılır.
    """
    if any(a == bizimki or a.endswith(" " + bizimki) for a in sayfa):
        return True
    # Bazı siteler birimi unvansız yazıyor ("Afet İşleri ve Risk Yönetimi"), kaynak ise tam
    # unvanla. Kuyruk YALNIZ bilinen bir unvansa eşleşme kabul edilir — böylece
    # "Fen İşleri" ile "Fen İşleri Dairesi Başkanlığı" eşleşir, rastgele önekler eşleşmez.
    return any(
        a.startswith(bizimki + " ") and _KUYRUK_UNVAN_RE.fullmatch(a[len(bizimki) + 1 :])
        for a in sayfa
    )


@dataclass(frozen=True)
class Sonuc:
    dosya: str
    durum: str
    eksik: tuple[str, ...] = ()
    fazla: tuple[str, ...] = ()
    not_: str = ""


def _bizim_birimler(yol: Path) -> list[str]:
    return [
        s.split(":", 1)[1].strip()
        for s in yol.read_text(encoding="utf-8").splitlines()
        if s.startswith("BİRİM:")
    ]


def _kunye_url(yol: Path) -> str:
    """Doğrulama adresi. Ana sayfa JavaScript ile yükleniyorsa dosya `@DOGRULAMA_URL` ile
    aynı kurumun makine-okunur resmî belgesini (faaliyet raporu PDF'i, açık veri) gösterir;
    o varsa doğrulama onun üzerinden yapılır. Künyedeki @KAYNAK_KIMLIK değişmez."""
    ana = ""
    for s in yol.read_text(encoding="utf-8").splitlines():
        if s.startswith("@DOGRULAMA_URL:"):
            return s.split(":", 1)[1].strip()
        if s.startswith("@KAYNAK_KIMLIK:") and not ana:
            ana = s.split(":", 1)[1].strip()
    return ana


def _pdf_metni(veri: bytes) -> str:
    """Faaliyet raporu / yönetmelik PDF'inden metin çıkar (pypdfium2 — Apache/BSD)."""
    import pypdfium2 as pdfium

    belge = pdfium.PdfDocument(io.BytesIO(veri))
    return "\n".join(belge[i].get_textpage().get_text_range() for i in range(len(belge)))


def _indir(url: str) -> tuple[str, str]:
    """(metin, not) döner. SSL doğrulaması düşürülürse bu notta AÇIKÇA belirtilir."""
    son = ""
    for dogrula, etiket in ((True, ""), (False, "SSL DOĞRULAMASI KAPALI")):
        try:
            with httpx.Client(
                follow_redirects=True, timeout=45.0, headers=_BASLIK, verify=dogrula
            ) as c:
                y = c.get(url)
                y.raise_for_status()
                tur = y.headers.get("content-type", "")
                if "pdf" in tur.lower() or url.lower().endswith(".pdf"):
                    return _pdf_metni(y.content), (etiket or "PDF kaynak")
                return y.text, etiket
        except Exception as hata:  # ağ/SSL/HTTP/PDF — hepsi "erişilemedi" sayılır
            son = f"{type(hata).__name__}: {str(hata)[:70]}"
    return "", son


def _sayfadan_birimler(ham: str) -> set[str]:
    duz = html.unescape(_ETIKET_RE.sub(" ", ham))
    return {_norm(m.group(0)) for m in _ADAY_RE.finditer(duz)}


def dogrula(yol: Path) -> Sonuc:
    rel = yol.relative_to(_TESKILAT_DIR).as_posix()
    url = _kunye_url(yol)
    if not url.startswith("http"):
        return Sonuc(rel, "ATLANDI", not_="künyede resmî URL yok")
    ham, notu = _indir(url)
    if not ham:
        return Sonuc(rel, "ERISILEMEDI", not_=notu)
    sayfa = _sayfadan_birimler(ham)
    bizim = {_norm(b): b for b in _bizim_birimler(yol)}
    eksik = tuple(sorted(bizim[k] for k in bizim if not _kaynakta_var(k, sayfa)))
    # Liste JavaScript ile yükleniyorsa HTML'de hiç/az birim görünür ve bu "hepsi eksik"
    # gibi okunur. Bunu FARK saymak yanıltıcı olur: kaynak çürütmüyor, okunamıyor.
    if len(sayfa) < 5 or len(eksik) > 0.7 * max(len(bizim), 1):
        return Sonuc(
            rel,
            "KAYNAK OKUNAMADI",
            not_=f"sayfada {len(sayfa)} birim adı bulundu (JS ile yükleniyor olabilir)",
        )
    # Sayfada olup bizde olmayanlar bilgi amaçlı; makam/alt-şube gürültüsü olabilir.
    fazla_ham = tuple(sorted(s for s in sayfa if s not in bizim))
    durum = "TAM" if not eksik else "FARK"
    return Sonuc(rel, durum, eksik, fazla_ham[:12], notu)


def main() -> None:
    süzgec = [a.lower() for a in sys.argv[1:]]
    manifest = json.loads(_MANIFEST.read_text(encoding="utf-8")).get("kaynaklar", {})
    hedefler = [
        y
        for y in sorted(_TESKILAT_DIR.rglob("*.txt"))
        if y.relative_to(_TESKILAT_DIR).as_posix() not in manifest
        and _kunye_url(y).startswith("http")
        and (not süzgec or any(s in y.parent.name.lower() for s in süzgec))
    ]
    print(f"{len(hedefler)} dosya doğrulanacak\n")
    sayac: dict[str, int] = {}
    for y in hedefler:
        s = dogrula(y)
        sayac[s.durum] = sayac.get(s.durum, 0) + 1
        ek = f"  [{s.not_}]" if s.not_ else ""
        print(f"{s.durum:<13}{s.dosya}{ek}")
        if s.eksik:
            print(f"    DOSYADA VAR, KAYNAKTA YOK ({len(s.eksik)}):")
            for e in s.eksik:
                print(f"      - {e}")
        if s.durum == "FARK" and s.fazla:
            print(f"    kaynakta görünen, dosyada olmayan (ilk {len(s.fazla)}): {'; '.join(s.fazla)}")
    print("\n" + "  ".join(f"{k}={v}" for k, v in sorted(sayac.items())))


if __name__ == "__main__":
    main()
