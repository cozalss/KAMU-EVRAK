"""İçerik-türetimli servis / ana-hizmet müdürlüğü önerisi (ADDITIVE katman).

Amaç: ölçülen 9-birim yönlendirmesini (route_birim / EVRAK_TO_BIRIM / gold) HİÇ
değiştirmeden, evrakın İÇERİĞİNDEN somut hizmet müdürlüğünü türetip kullanıcıya
"adam akıllı" bir öneri sunmak. Örn. "ilgili teknik daireye havale" yerine ek satır:
"önerilen müdürlük: FEN İŞLERİ MÜDÜRLÜĞÜ (içerik: çukur, asfalt)".

Taksonomi 5393 sayılı Belediye Kanunu + Belediye Norm Kadro İlke ve Standartlarına
Dair Yönetmelik'teki tipik hizmet müdürlükleridir (kamu gerçekliği — şartname §6.2/6.4.2).
Deterministik + saf: hiç anahtar eşleşmezse None döner (uydurma müdürlük ÜRETİLMEZ).
Bu bir DANIŞMA sinyalidir; resmî havale kararı yetkili personeldedir.
"""

from __future__ import annotations

import structlog

from agents.config import BIRIM_TR
from agents.nodes._llm_extract import llm_json, real_llm
from core.text import tr_lower

log = structlog.get_logger()

SERVIS_BIRIM_TR: dict[str, str] = {
    "fen_isleri": "Fen İşleri Müdürlüğü",
    "imar_sehircilik": "İmar ve Şehircilik Müdürlüğü",
    "zabita": "Zabıta Müdürlüğü",
    "su_kanalizasyon": "Su ve Kanalizasyon Müdürlüğü",
    "temizlik_cevre": "Temizlik İşleri / Çevre Koruma Müdürlüğü",
    "park_bahce": "Park ve Bahçeler Müdürlüğü",
    "ulasim": "Ulaşım / Toplu Taşıma Müdürlüğü",
    "sosyal_yardim": "Sosyal Yardım İşleri Müdürlüğü",
    "saglik_veteriner": "Sağlık İşleri / Veteriner Müdürlüğü",
    "emlak_istimlak": "Emlak ve İstimlak Müdürlüğü",
    "ruhsat_denetim": "Ruhsat ve Denetim Müdürlüğü",
}

# LLM'in seçebileceği TAM gerçek birim kataloğu: kurum-düzeyi daireler (BIRIM_TR, 9) +
# somut belediye hizmet müdürlükleri (SERVIS_BIRIM_TR, 11). LLM bu KAPALI kümeden TEK en
# uygun gerçek birimi kendi kamu-yapısı bilgisiyle seçer (dava→Hukuk Müşavirliği,
# gürültü→Zabıta, yol→Fen İşleri, fatura→Mali İşler). İnternet YOK; havuz-dışı kod Python'da
# elenir. Ölçülen deterministik hedef_birim (route_birim, 9-set) OMURGA+FALLBACK olarak
# KORUNUR; bu katman yalnız gerçek-anahtar varken çalışır (mock→None→deterministik, CI birebir).
TAM_BIRIM_KATALOG: dict[str, str] = {**BIRIM_TR, **SERVIS_BIRIM_TR}

# Kurum-düzeyi birimler için kısa kapsam ipucu (müdürlüklerinki _SERVIS_KEYWORDS'te) — LLM
# bare isimden emin olamayıp temkinli boş dönmesin diye; kapsam yine de kararı BAĞLAMAZ.
_KURUM_KAPSAM: dict[str, tuple[str, ...]] = {
    "hukuk_musavirligi": ("dava", "icra", "haciz", "tebligat", "mahkeme", "mütalaa"),
    "insan_kaynaklari": ("personel", "atama", "izin", "disiplin", "kadro", "özlük"),
    "mali_strateji_sgb": ("fatura", "ödeme", "bütçe", "tahakkuk", "maaş", "ihale bedeli"),
    "bilgi_islem": ("sistem", "yazılım", "donanım", "ebys", "e-posta arızası"),
    "destek_idari_hizmetler": ("satın alma", "lojistik", "araç", "bakım", "tedarik"),
    "basin_halkla_iliskiler_cimer": ("cimer", "bilgi edinme", "basın", "halkla ilişkiler"),
    "teftis_ic_denetim": ("şikayet", "ihbar", "soruşturma", "denetim", "usulsüzlük"),
    "ilgili_teknik_daire": ("ruhsat başvurusu", "izin belgesi", "proje", "teknik başvuru"),
    "yazi_isleri_evrak": ("genel evrak", "havale", "kayıt", "kurumlar arası yazışma"),
}

# KÖK-bazlı içerik anahtarları (Türkçe çekim eklerini yutacak şekilde kısa).
# Sıra tie-break: eşit eşleşmede LİSTEDE ÖNCE gelen kazanır (deterministik).
_SERVIS_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("su_kanalizasyon",
     ("su fatura", "su abone", "sayaç", "kanalizasyon", "içme suyu", "su arıza",
      "su kesin", "logar", "atık su", "su borç")),
    ("imar_sehircilik",
     ("kaçak yapı", "ruhsatsız yapı", "imar plan", "iskan", "yapı ruhsat", "yapı denetim",
      "kat irtifak", "parsel", "tadilat", "imar durum", "yıkım")),
    ("ruhsat_denetim",
     ("işyeri açma", "çalışma ruhsat", "işyeri ruhsat", "gsm ruhsat", "hafta tatili ruhsat")),
    ("zabita",
     ("gürültü", "işgal", "seyyar", "pazar yeri", "işyeri denetim", "umuma açık",
      "kaldırım işgal", "dilenci", "izinsiz afiş")),
    ("temizlik_cevre",
     ("çöp", "atık", "temizlik", "katı atık", "geri dönüşüm", "çevre kirlilik", "moloz",
      "koku", "haşere")),
    ("fen_isleri",
     ("çukur", "asfalt", "yol onar", "kaldırım", "altyapı", "bordür", "köprü", "menfez",
      "kazı", "yol yapım", "üstyapı")),
    ("park_bahce",
     ("park", "yeşil alan", "ağaç", "bahçe", "oyun grup", "peyzaj", "fidan", "çim")),
    ("ulasim",
     ("otobüs", "toplu taşıma", "sefer", "durak", "güzergah", "ulaşım", "trafik işaret")),
    ("sosyal_yardim",
     ("sosyal yardım", "muhtaç", "engelli", "yaşlı bakım", "gıda yardım", "nakdi yardım",
      "evde bakım")),
    ("saglik_veteriner",
     ("veteriner", "sokak hayvan", "başıboş hayvan", "mezarlık", "ilaçlama", "sağlık ocağ")),
    ("emlak_istimlak",
     ("kamulaştır", "istimlak", "taşınmaz tahsis", "emlak beyan", "ecrimisil")),
)
# _liste() her LLM çağrısında yeniden dict kurmasın diye modül seviyesinde önbelleklenir.
_SERVIS_KEYWORDS_DICT: dict[str, tuple[str, ...]] = dict(_SERVIS_KEYWORDS)


def oner_servis_birimi(text: str) -> dict[str, object] | None:
    """Evrak metninden en olası hizmet müdürlüğünü türet (eşleşme yoksa None).

    Dönen: {"kod": str, "ad": str, "sinyal": list[str]} — sinyal, kararı tetikleyen
    içerik anahtarları (UI'da "içerik: çukur, asfalt" ipucu + şeffaflık). En çok
    anahtar eşleşen müdürlük kazanır; hiç eşleşme yoksa öneri yapılmaz (uydurma yok).
    """
    t = tr_lower(text or "")
    if not t:
        return None
    best_kod: str | None = None
    best_hits: tuple[str, ...] = ()
    for kod, kws in _SERVIS_KEYWORDS:
        hits = tuple(kw for kw in kws if tr_lower(kw) in t)
        if len(hits) > len(best_hits):
            best_kod, best_hits = kod, hits
    if best_kod is None:
        return None
    return {"kod": best_kod, "ad": SERVIS_BIRIM_TR[best_kod], "sinyal": list(best_hits[:3])}


def _liste() -> str:
    # Yalnız ad değil, kapsam ipucu da verilir — LLM'in bare isimden emin olamayıp temkinli
    # "" dönmesini önler; kapsam dışı kod yine de Python'da elenir (havuz sabit kalır).
    def kapsam(kod: str) -> str:
        return ", ".join((_SERVIS_KEYWORDS_DICT.get(kod) or _KURUM_KAPSAM.get(kod, ()))[:4]) or "-"
    return "\n".join(
        f"- {kod}: {ad} (kapsam örn.: {kapsam(kod)})"
        for kod, ad in TAM_BIRIM_KATALOG.items()
    )


async def oner_servis_birimi_llm(text: str) -> dict[str, object] | None:
    """Kapalı-küme LLM birim seçimi (arsiv.py _sdp_llm_secimi ile aynı desen): evrak metnini
    okuyup TAM_BIRIM_KATALOG havuzundan (kurum daireleri + hizmet müdürlükleri) EN UYGUN
    gerçek birimi akıl-yürütmeyle seçer — kök-anahtar listesinin yakalayamadığı eş-anlamlı/
    dolaylı ifadeleri de kapsar (kelime listesi değil, anlam). İnternet YOK; LLM kendi kamu-
    yapısı bilgisini kullanır. Havuz dışı kod / boş / mock / anahtarsız / hata → None
    (deterministik fallback devreye girer, uydurma birim ÜRETİLMEZ)."""
    t = (text or "").strip()
    if not t or real_llm() is None:
        return None
    obj = await llm_json(
        system=(
            "Sen bir kamu kurumunda evrak havale uzmanısın. Evrakı SADECE listedeki "
            "birimlerden (kurum dairesi veya hizmet müdürlüğü) İÇERİĞE göre EN UYGUN olanına "
            'yönlendir; hiçbiri açıkça uymuyorsa "kod":"" döndür. Liste dışına ASLA çıkma, '
            "birim uydurma. Genel kategori yerine mümkün olan EN SOMUT birimi seç."
        ),
        user=(
            f"BİRİMLER (kod: ad):\n{_liste()}\n\n"
            f"EVRAK İÇERİĞİ:\n{t[:900]}\n\n"
            'Yalnız şu JSON: {"kod":"<aday_kod veya bos>",'
            '"sinyal":["<kısa 1-3 kelimelik içerik ipucu>", "..."]}'
        ),
        max_tokens=140,
    )
    kod = str((obj or {}).get("kod") or "").strip()
    if kod not in TAM_BIRIM_KATALOG:
        return None  # boş/geçersiz/havuz-dışı kod → deterministik fallback
    # sinyal UI'da kısa rozet dizisi olarak gösterilir (deterministik yolla AYNI şekil —
    # NeonDetay.jsx "· içerik: a, b" deseni) — tam cümle gerekçe burada YAZILMAZ (biçim bozar).
    # llm_json yalnız üst-düzey dict garanti eder; iç alan bozuk şekilde gelirse (ör. int)
    # for döngüsü TypeError verirdi → isinstance guard ile boş listeye düş (savunma).
    ham_sinyal = obj.get("sinyal")
    sinyal = ([str(s).strip() for s in ham_sinyal if str(s).strip()][:3]
              if isinstance(ham_sinyal, list) else [])
    log.info("servis_birim_llm", kod=kod)
    return {"kod": kod, "ad": TAM_BIRIM_KATALOG[kod], "sinyal": sinyal}


__all__ = ("SERVIS_BIRIM_TR", "TAM_BIRIM_KATALOG", "oner_servis_birimi", "oner_servis_birimi_llm")
