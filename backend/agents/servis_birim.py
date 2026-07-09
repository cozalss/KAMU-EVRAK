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

from core.text import tr_lower

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


__all__ = ("SERVIS_BIRIM_TR", "oner_servis_birimi")
