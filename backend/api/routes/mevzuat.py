"""Mevzuat katalog paneli — dosya-tabanlı, DB'siz referans API'si.

data/mevzuat/*.txt korpusu (mevzuat_oner RAG'inin kullandığı AYNI kaynak) doğrudan
servis edilir: personel tüm mevzuatı listeler ve tam metnini okur. PUBLIC (kamuya
açık telifsiz mevzuat, PII yok — /referans/birimler deseni); DB gerektirmez →
mock/demo modda ve DB'siz ortamda da çalışır.

Dosya biçim sözleşmesi (korpus geneli): 1. satır = başlık, 2. satır = künye
(kanun no / kabul / RG), gövde = "Madde N — ..." blokları.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter(prefix="/mevzuat", tags=["mevzuat"])

_ROOT = Path(__file__).resolve().parents[3]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
# Beyaz liste: korpus dosya adları ascii küçük harf + rakam + _/-. Nokta YOK →
# uzantı/traversal enjekte edilemez ("..", "%2e%2e", "x.txt" hepsi elenir).
_DOSYA_RE = re.compile(r"^[a-z0-9_-]+$")
_MADDE_RE = re.compile(r"^Madde\s+\d", re.MULTILINE)
_NO_RE = re.compile(r"^\d[\d-]*$")  # "3071", "2005-7" numara; "atik..." gibi öneksizler değil

# Konu/tema sınıflandırması — dosya adı üzerinde anahtar-kelime kuralları, İLK eşleşme
# kazanır (sıra çakışma çözer: örn. "basin_is"→Çalışma, Kültür'deki "basin"den önce;
# "tutun_urunleri_zarar"→Sağlık, Ekonomi'deki "tutun"dan önce). 304 dosyanın tamamı
# elden geçirilerek kalibre edildi; test: bilinen eşleşmeler + "Diğer" ≤ 12.
_KATEGORI_KURALLARI: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("İdari Usul & Yazışma", (
        "dilekce", "bilgi_edinme", "tebligat", "resmi_yazisma", "dosya_plani", "evrak",
        "arsiv", "elektronik_imza", "elektronik_posta", "cimer", "kvkk", "muhur",
        "mevzuat_hazirlama", "kamu_denetciligi", "etik_kurulu",
        # 2026-07 genişletme: Anayasa (dilekçe/bilgi edinme üst-normu), bilgi/iletişim
        # güvenliği genelgesi (evrak gizlilik/e-yazışma), kamu hizmetlerinin sunumu
        # (başvuru/hizmet standartları). Anahtarlar distinktif — mevcut korpusla çakışmaz.
        "anayasa", "iletisim_guvenligi", "hizmetlerinin_sunumu",
        # 2026-07 Batch 9: gizlilik dereceli belgeler (evrak gizlilik zinciri) + etik
        # davranış ilkeleri yönetmeliği (5176 uygulama).
        "gizlilik", "etik_davranis",
    )),
    ("Vergi & Kamu Maliyesi", (
        "vergi", "harclar", "damga", "amme_alacaklari", "kamu_mali", "ihale",
        "belediye_gelirleri", "tasinir_mal", "tasinmaz_tahsis",
        "ic_kontrol",  # 2026-07: Kamu İç Kontrol Standartları (5018 ikincil, mali kontrol)
        # 2026-07 Batch 9: harcama belgeleri (ödeme evrakı belge standardı) + iç denetçi
        # çalışma usulü (5018 iç denetim ikincil).
        "harcama_belgeleri", "ic_denetci",
        # 2026-07 Batch 10: kamu zararlarının tahsili + ön ödeme (avans/kredi) — 5018 ikincil.
        "kamu_zarar", "on_odeme",
        # 2026-07 Batch 11: SMMM/YMM + merkezi/mahalli muhasebe + kamu gözetimi (mali/denetim).
        "smmm", "musavir", "muhasebe",
    )),
    ("Sağlık", (
        "tababet", "ispenciyari", "hifzissihha", "organ_doku", "saglik_hizmetleri",
        "aile_hekimligi", "eczaci", "hemsire", "kan_ve_kan", "seriri",
        "tutun_urunleri_zarar", "hasta_haklari",
        "saglik_verileri",  # 2026-07 Batch 9: Kişisel Sağlık Verileri Yönetmeliği (KVKK sağlık)
        "hastane", "yatakli_tedavi",  # 2026-07 Batch 11: özel hastaneler + yataklı tedavi kurumları
    )),
    ("Yargı & Adalet", (
        "icra_iflas", "yargilama", "mahkeme", "muhakeme", "ceza", "infaz", "adli_sicil",
        "arabuluculuk", "bilirkisilik", "avukatlik", "noterlik", "kabahatler", "medeni",
        "borclar", "abonelik",
        # 2026-07 Batch 11: yüksek yargı + adli kurumlar + milletlerarası hukuk.
        "danistay", "yargitay", "hakimler", "denetimli_serbestlik", "adli_tip",
        "tanik_koruma", "milletlerarasi_ozel", "tahkim",
    )),
    ("Kamu Personeli", (
        "memur", "harcirah", "mal_bildirimi", "khk",
        # 2026-07 Batch 10: görevde yükselme/unvan değişikliği + sözleşmeli personel (657 4/B).
        "gorevde_yukselme", "sozlesmeli_personel",
    )),
    ("Çalışma, Sosyal Güvenlik & Aile", (
        "is_kanunu", "deniz_is", "basin_is", "is_sagligi", "issizlik", "sosyal",
        "emekli", "sendika", "is_kurumu", "isgucu", "aylik_baglanmasi", "engelliler",
        "cocuk_koruma", "ailenin_korunmasi", "hizmet_birlestirme",
    )),
    ("Eğitim, Gençlik & Spor", (
        "egitim", "ogretim", "ogrenim", "burs", "genclik", "spor", "mesleki_yeterlilik",
    )),
    ("Güvenlik & Kamu Düzeni", (
        "asker", "teror", "kacakcilik", "ozel_guvenlik", "toplanti", "kimlik_bildirme",
        "guvenlik_sorusturmasi",  # 2026-07 Batch 9: Güvenlik Soruşturması Kanunu 7315
        # 2026-07 Batch 11: kolluk/güvenlik teşkilat + silah + sivil savunma
        # (jandarma/emniyet "teskilat"tan önce burada yakalanmalı — bu yüzden 8. sırada).
        "polis", "jandarma", "emniyet", "atesli_silah", "sahil_guvenlik", "sivil_savunma",
    )),
    ("Tarım, Hayvancılık & Gıda", (
        "tarim", "veteriner", "tohum", "islahci", "mera", "avcilig", "sebze_meyve",
        "su_urunleri", "sulama", "hayvan_islahi", "toprak",
        "gida",  # 2026-07 Batch 11: Türk Gıda Kodeksi Yönetmeliği
    )),
    ("Çevre, Orman & Su", (
        "cevre", "atik", "orman", "milli_park", "sulak", "hava_kirliligi", "gurultu",
        "hayvanlari_koruma", "su_kirliligi", "su_tahsis", "yeralti_su", "sular_hakkinda",
        "ambalaj",
        "su_isleri",  # 2026-07 Batch 11: Devlet Su İşleri (DSİ) Kanunu
    )),
    ("İmar, Şehircilik & Afet", (
        "imar", "yapi_", "kat_mulkiyeti", "tapu", "kadastro", "kamulastirma",
        "toplu_konut", "gecekondu", "afet", "kiyi", "yipranan",
        "mekansal", "yangindan",  # 2026-07 Batch 11: mekânsal planlar + binaların yangından korunması
    )),
    ("Enerji & Madencilik", (
        "maden", "petrol", "dogal_gaz", "elektrik_piyasasi", "yenilenebilir", "enerji",
        "jeotermal",
    )),
    ("Ulaştırma & Haberleşme", (
        "trafik", "karayolu", "karayollari", "havacilik", "denizde", "liman", "haberlesme", "posta",
    )),
    ("Kültür, Turizm & Medya", (
        "basin", "radyo", "internet", "fikir", "sinema", "turizm", "seyahat", "kultur",
    )),
    ("STK & Meslek Kuruluşları", ("dernek", "vakif", "yardim_toplama", "tobb", "esnaf")),
    ("Ekonomi, Ticaret & Sanayi", (
        "banka", "sigorta", "sermaye", "finansal", "ticaret", "tuketici", "rekabet",
        "kooperatif", "gumruk", "ithalat", "serbest_bolge", "kosgeb", "sanayi",
        "yatirim", "ozellestirme", "tutun", "perakende", "tasfiye", "sinai",
        # 2026-07 Batch 11: çek + kambiyo (TPKKK) + ölçüler/ayar + TSE. "cek_kanunu"
        # ("cek" değil — 'gecekondu' ile çakışmaması için).
        "cek_kanunu", "turk_parasi", "olculer", "turk_standardlari",
    )),
    ("Kamu Yönetimi & Yerel İdare", (
        "cumhurbaskanligi", "teskilat", "il_idaresi", "il_ozel", "belediye",
        "buyuksehir", "mahalli", "iski", "diyanet", "sayistay", "istatistik", "secim",
        "bayram", "nufus", "vatandaslig", "pasaport", "yabancilar", "kamu_konutlari",
        "tasit_kanunu", "isyeri_acma",
        # 2026-07 Batch 11: siyasi partiler + üst kademe atama CBK + il genel meclisi.
        "siyasi_partiler", "ust_kademe", "il_genel_meclisi",
    )),
)
_DIGER = "Diğer"


def _kategori(dosya: str) -> str:
    for ad, anahtarlar in _KATEGORI_KURALLARI:
        if any(a in dosya for a in anahtarlar):
            return ad
    return _DIGER


def _no(dosya: str) -> str:
    onek = dosya.split("_", 1)[0]
    return onek if _NO_RE.match(onek) else ""


def _oku(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


@lru_cache(maxsize=1)
def _katalog() -> tuple[dict, ...]:
    """Korpus kataloğu — process ömrü boyunca bir kez kurulur (mevzuat_oner deseni)."""
    kayitlar: list[dict] = []
    if not _MEVZUAT_DIR.is_dir():
        return ()
    for path in sorted(_MEVZUAT_DIR.glob("*.txt")):
        try:
            metin = _oku(path)
        except OSError:
            continue
        satirlar = metin.splitlines()
        kayitlar.append({
            "dosya": path.stem,
            "no": _no(path.stem),
            "baslik": (satirlar[0].strip() if satirlar else "") or path.stem.replace("_", " "),
            "kunye": satirlar[1].strip() if len(satirlar) > 1 else "",
            "madde_sayisi": len(_MADDE_RE.findall(metin)),
            "kategori": _kategori(path.stem),
        })
    return tuple(kayitlar)


@router.get("/katalog")
async def katalog() -> dict:
    """Sistemdeki TÜM mevzuatın listesi + sıralı kategori grupları (Mevzuat paneli)."""
    kayitlar = _katalog()
    mevcut = {k["kategori"] for k in kayitlar}
    kategoriler = [ad for ad, _ in _KATEGORI_KURALLARI if ad in mevcut]
    if _DIGER in mevcut:
        kategoriler.append(_DIGER)
    return {"adet": len(kayitlar), "kategoriler": kategoriler, "mevzuatlar": list(kayitlar)}


_SNIPPET_CHARS = 240


def _chunk_dosya(chunk: dict) -> str:
    """Chunk → katalog dosya anahtarı (mevzuat_oner ile TEK sözleşme; ağır modül → lazy)."""
    from agents.nodes.mevzuat_oner import _kaynak_dosya

    return _kaynak_dosya(chunk)


def derin_ara(q: str, limit: int = 20) -> list[dict]:
    """Madde İÇİNDE BM25 araması (mevzuat_oner ile AYNI indeks + skorlayıcı).

    Sonuçlar katalogla birleştirilir (baslik/no) ve katalogda olmayan dosyalar elenir
    → her sonuç /mevzuat/icerik/{dosya} ile açılabilir. (dosya, madde_no) dedup'lu.
    Sohbet asistanı da kaynak üretmek için bu fonksiyonu paylaşır (DB gerektirmez).
    """
    from agents.nodes.mevzuat_oner import _load_index, _score  # ağır modül — lazy

    ranked = _score(q, _load_index())
    if not ranked:
        return []
    katalog = {k["dosya"]: k for k in _katalog()}
    max_skor = ranked[0][0] or 1.0
    sonuclar: list[dict] = []
    gorulen: set[tuple[str, int | None]] = set()
    for skor, chunk in ranked:
        dosya = _chunk_dosya(chunk)
        kayit = katalog.get(dosya)
        anahtar = (dosya, chunk.get("madde_no"))
        if kayit is None or anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        metin = str(chunk.get("text", ""))
        sonuclar.append({
            "dosya": dosya,
            "no": kayit["no"],
            "baslik": kayit["baslik"],
            "madde_no": chunk.get("madde_no"),
            "snippet": metin[:_SNIPPET_CHARS] + ("…" if len(metin) > _SNIPPET_CHARS else ""),
            "skor": round(skor / max_skor, 3),
        })
        if len(sonuclar) >= limit:
            break
    return sonuclar


@router.get("/derin-ara")
async def derin_ara_endpoint(
    q: Annotated[str, Query(min_length=1, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    """Madde içinde arama — sonuçtaki (dosya, madde_no) okuma modalına atlar."""
    sonuclar = derin_ara(q, limit)
    return {"q": q, "adet": len(sonuclar), "sonuclar": sonuclar}


@router.get("/icerik/{dosya}")
async def icerik(dosya: str) -> dict:
    """Tek mevzuatın tam metni. Beyaz-liste dışı/bilinmeyen ad → 404 (bilgi sızdırmaz)."""
    if not _DOSYA_RE.match(dosya):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mevzuat bulunamadı.")
    path = _MEVZUAT_DIR / f"{dosya}.txt"
    # Savunma derinliği: regex zaten ayraç/nokta engeller; yine de kök dışına çözülen
    # veya var olmayan yol reddedilir.
    if path.resolve().parent != _MEVZUAT_DIR.resolve() or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mevzuat bulunamadı.")
    metin = _oku(path)
    satirlar = metin.splitlines()
    return {
        "dosya": dosya,
        "no": _no(dosya),
        "baslik": (satirlar[0].strip() if satirlar else "") or dosya.replace("_", " "),
        "kunye": satirlar[1].strip() if len(satirlar) > 1 else "",
        "metin": metin,
    }


__all__ = ("derin_ara", "router")
