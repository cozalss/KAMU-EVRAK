"""Sesli görüşme açılış brifingi — durum-farkında ama UYDURMASIZ karşılama.

Sahne açılır açılmaz konuşulacak ilk cümledir; bu yüzden LLM'e SORULMAZ:
  · gecikme — kullanıcı orb'a bakarken 2-3 saniye sessizlik "ölü" hissettirir,
  · uydurma riski — ilk cümlede sayı uydurmak güveni en pahalı yerden kırar.
Metin tamamen deterministiktir: yalnız sorgudan gelen sayılar konuşulur, veri yoksa
sayı hiç anılmaz (CLAUDE.md "asla uydurma" kuralının sesli karşılığı).

Sayılar Türkçe SÖZCÜĞE çevrilir ("3" değil "üç"): TTS rakamı tekdüze/robotik okur.
"""

from __future__ import annotations

from typing import Any

_BIRLER = ("sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz")
_ONLAR = ("", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan")

# Bu eşiğin üstünde sözcüğe çevirmek okumayı uzatır; rakam daha anlaşılır kalır.
_YAZIYA_CEVIR_SINIRI = 100


def sayiyi_yaz(sayi: int) -> str:
    """0-99 arası sayıyı Türkçe sözcüğe çevirir; dışındakiler rakam olarak döner."""
    if not isinstance(sayi, int) or sayi < 0 or sayi >= _YAZIYA_CEVIR_SINIRI:
        return str(sayi)
    if sayi < 10:
        return _BIRLER[sayi]
    onlar, birler = divmod(sayi, 10)
    return _ONLAR[onlar] if birler == 0 else f"{_ONLAR[onlar]} {_BIRLER[birler]}"


def _sayi_al(kaynak: Any, anahtar: str) -> int:
    """Savunmacı okuma — beklenmedik tip/eksik alan karşılamayı ÇÖKERTMEZ, 0 sayılır.

    bool AYRICA elenir: isinstance(True, int) Python'da True'dur; bir bayrağın "bir taslağınız
    var" diye konuşulması tam da kaçınmak istediğimiz uydurma biçimidir.
    """
    if not isinstance(kaynak, dict):
        return 0
    deger = kaynak.get(anahtar)
    if isinstance(deger, bool) or not isinstance(deger, int):
        return 0
    return deger if deger > 0 else 0


def karsilama_metni(persona: str, brifing: Any) -> str:
    """Sesli sahnenin açılış cümlesi — persona tanıtımı + (varsa) gerçek durum + davet.

    `brifing`: api/routes/sohbet._brifing_araci çıktısı (ya da boş dict) —
    {"sla_kritik": int, "bekleyen_onay": int, "kirmizi_taslak": int}.

    panel_istatistik BİLEREK kullanılmaz: oradaki "taslak" tüm taslakları sayar (karar
    verilmişler dahil) ve "risk_dagilimi.kirmizi" işlem bazlıdır — taslakların alt kümesi
    değildir. İkisini tek cümlede birleştirmek, gerçek sayılarla YANLIŞ bir iddia kurar
    ("bir taslağınız var, bunlardan üçü kırmızı"). Sesli, kendinden emin bir tonla okunan
    böyle bir cümle uydurmanın en pahalı biçimidir.

    Yalnız SIFIRDAN BÜYÜK sayılar konuşulur; hiçbiri yoksa nötr karşılama döner.
    """
    sla = _sayi_al(brifing, "sla_kritik")
    bekleyen = _sayi_al(brifing, "bekleyen_onay")
    kirmizi = _sayi_al(brifing, "kirmizi_taslak")

    parcalar = [f"Merhaba, ben {persona}."]
    if sla:
        parcalar.append(f"Yasal süresi kritik {sayiyi_yaz(sla)} işiniz var.")
    if bekleyen:
        durum = f"Karar bekleyen {sayiyi_yaz(bekleyen)} taslağınız var"
        # Alt-küme iddiası YALNIZ tutarlıysa kurulur; tutarsız girdide sayı sessizce düşer.
        if 0 < kirmizi <= bekleyen:
            durum += f", bunlardan {sayiyi_yaz(kirmizi)} tanesi kırmızı bantta"
        parcalar.append(durum + ".")
    if not sla and not bekleyen:
        parcalar.append("Belge ve yazışma işlerinizde size yardımcı olmak için buradayım.")
    parcalar.append("Buyurun, sizi dinliyorum.")
    return " ".join(parcalar)


__all__ = ("karsilama_metni", "sayiyi_yaz")
