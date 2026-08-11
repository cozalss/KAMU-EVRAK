"""Superstep (katman) hesabı — graf kenarlarından eşzamanlılık haritası.

NEDEN: canlı akış ekranı adımları düz bir 01→N dizisi olarak sunuyordu. Gerçek pipeline bir
DAG'dır; düz liste hem eşzamanlılığı gizler hem de sırayı yanlış verebilir (liste
`eksik_tespit`i `decompose`tan önce sayıyordu, oysa graf `decompose → eksik_tespit` koşar).

SÖZLEŞME: bu modül SAFTIR ve LangGraph'ı import ETMEZ — girdisi yalnız (kaynak, hedef)
çiftleridir. Çağıran taraf kenarları DERLENMİŞ graftan verir (`graph.pipeline_katmanlari`),
elle tutulan bir kopyadan değil. Böylece ENV bayrakları topolojiyi değiştirdiğinde harita
kendiliğinden değişir ve UI'ın "bunlar aynı anda koştu" iddiası grafla çelişemez.

YÖNTEM: LangGraph bariyer semantiğinde bir node TÜM öncülleri bitince koşar → katman =
başlangıçtan EN UZUN yol uzunluğu (Kahn + en-uzun-yol gevşetmesi). Aynı katmandaki node'lar
eşzamanlıdır. Koşullu kenarlar da sayılır: katman "en erken koşabileceği superstep"tir.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

BASLANGIC = "__start__"
BITIS = "__end__"


def katmanlar(
    kenarlar: Iterable[tuple[str, str]],
    *,
    baslangic: str = BASLANGIC,
    bitis: str = BITIS,
) -> dict[str, int]:
    """(kaynak, hedef) çiftlerinden node → superstep indeksi üret.

    Başlangıç ve bitiş düğümleri iş adımı olmadığı için sonuçta YER ALMAZ.
    Katmanlanamayan düğüm (döngü ya da başlangıçtan erişilemeyen dal) sessizce
    düşürülmez — topoloji hatasıdır, ValueError yükseltir.
    """
    ardillar: dict[str, list[str]] = {}
    derece: dict[str, int] = {}
    dugumler: set[str] = set()
    for kaynak, hedef in kenarlar:
        if hedef == bitis or kaynak == bitis:
            continue                       # bitiş bir iş adımı değil
        dugumler.update((kaynak, hedef))
        ardillar.setdefault(kaynak, []).append(hedef)
        derece[hedef] = derece.get(hedef, 0) + 1

    if baslangic not in dugumler:
        return {}

    katman: dict[str, int] = {baslangic: 0}
    kuyruk = deque([baslangic])
    while kuyruk:
        u = kuyruk.popleft()
        for v in ardillar.get(u, ()):
            # En uzun yol: bariyer en geç biten öncülü bekler.
            katman[v] = max(katman.get(v, 0), katman[u] + 1)
            derece[v] -= 1
            if derece[v] == 0:
                kuyruk.append(v)

    # Kalan derece > 0 → döngü; katmansız düğüm → başlangıçtan beslenmiyor. İkisi de
    # topoloji hatasıdır ve ucuz biçimde birbirinden ayrılamaz; ikisini de bildir.
    kalan = sorted(
        d for d in dugumler
        if d != baslangic and (derece.get(d, 0) > 0 or d not in katman)
    )
    if kalan:
        raise ValueError(
            "graf katmanlanamadı — döngü ya da erişilemeyen düğüm: " + ", ".join(kalan)
        )

    del katman[baslangic]
    return katman


def gruplar(katman_haritasi: dict[str, int], sira: Iterable[str]) -> list[list[str]]:
    """Katman haritasını, `sira` içindeki görünür node'lardan eşzamanlı gruplara böl.

    Dönen liste ÇALIŞMA sırasındadır (katman artan); grup içi sıra `sira`daki göreli
    sırayı korur. Haritada olmayan node (ENV kapalı vb.) sessizce atlanır — çağıran
    zaten yalnız SSE'de duyurulan node'ları geçirir.
    """
    yerler = {ad: i for i, ad in enumerate(sira)}
    bilinen = [ad for ad in yerler if ad in katman_haritasi]
    bilinen.sort(key=lambda ad: (katman_haritasi[ad], yerler[ad]))
    cikti: list[list[str]] = []
    for ad in bilinen:
        if cikti and katman_haritasi[cikti[-1][0]] == katman_haritasi[ad]:
            cikti[-1].append(ad)
        else:
            cikti.append([ad])
    return cikti


__all__ = ("BASLANGIC", "BITIS", "gruplar", "katmanlar")
