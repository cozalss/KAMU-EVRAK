"""2209-A onerisi icin GERCEK guc simulasyonu — H1, H2, H9, H4, H6.

Neden: istatistik hakemi "H2 ve H9 icin guc beyani yok, simulasyon basvurudan ONCE
kosulup sayi metne yazilirsa Yontem 21'den 23-24'e cikar" dedi. Metin su an
"IP1'de kosulacak" diye TAAHHUT ediyor; bu betik taahhudu GERCEKLESMIS SAYIYA cevirir.

Tasarim varsayimlari (hepsi belgeden, uydurma yok):
  - Ana kume n = 240 belge, replikasyon 120
  - D1: 4 mimari kolu x 3 bozulma duzeyi, BELGE-ICI tekrarli olcum
  - Belge duzeyi rastgele kesisim (belgeler zorlukta farklilasir)
  - Onaylayici aile IKI KOLA ayrilir: mekanizma kolu alfa = 0,04 (dort seri kapi),
    olcum gecerliligi kolu alfa = 0,01 (tek test, H4). FWER = 0,05.
    Kapi 1 = H1 x3 -> Holm en kati basamak 0,04/3 = 0,0133
    Kapi 2 = H3, H7 -> 0,04/2 = 0,02   ·   Kapi 4 = H6, H8, H2 -> 0,0133
  - H9 alt kumesi: ana kumenin %20'si = 48 belge (ve %30 = 72 senaryosu)
  - H4: 300 iddia, 60 belge, m = 5, ICC = 0,20 -> DEFF = 1,8

Yontem: Monte Carlo. Ikili sonuclar belge rastgele etkisi + kosul etkisiyle uretilir
(lojistik baglanti), sonra ilgili test kosulur. Guc = red orani.
"""
import sys, json, math
import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")
RNG = np.random.default_rng(20260808)   # sabit tohum: sonuc yeniden uretilebilir

N_SIM = 2000
ALFA_KAPI1 = 0.04 / 3      # Holm en kati basamak, Kapi 1'de uc test (mekanizma kolu)
ALFA_KAPI2 = 0.04 / 2      # Kapi 2 iki test
ALFA_H4 = 0.01             # olcum gecerliligi kolu, tek test
ALFA = 0.05


def lojistik(p):
    return math.log(p / (1 - p))


def ters_lojistik(x):
    return 1.0 / (1.0 + np.exp(-x))


# ----------------------------------------------------------------- H1: McNemar
def h1_mcnemar(n=240, p_disc=0.20, oran=3.0, alfa=ALFA_KAPI1, n_sim=N_SIM):
    """Eslesmis ikili sonuc. p_disc: uyumsuz cift orani, oran: p01/p10."""
    p10 = p_disc / (1 + oran)
    p01 = p_disc - p10
    red = 0
    for _ in range(n_sim):
        say = RNG.multinomial(n, [p01, p10, 1 - p_disc])
        b, c = say[0], say[1]
        if b + c == 0:
            continue
        p = stats.binomtest(b, b + c, 0.5).pvalue     # kesin McNemar
        red += p < alfa
    return red / n_sim


def h1_mdes(n=240, p_disc=0.20, guc=0.80, alfa=ALFA_KAPI1):
    """Saptanabilir en kucuk mutlak fark (arama ile)."""
    for fark in np.arange(0.02, 0.25, 0.005):
        # fark = p01 - p10, p01 + p10 = p_disc
        p01 = (p_disc + fark) / 2
        p10 = (p_disc - fark) / 2
        if p10 <= 0:
            continue
        oran = p01 / p10
        g = h1_mcnemar(n, p_disc, oran, alfa, n_sim=600)
        if g >= guc:
            return round(float(fark), 3), round(g, 3)
    return None, None


# ------------------------------------------- H2: mimari x bozulma ETKILESIMI
def h2_etkilesim(n_belge=240, taban=0.62, kol_etki=0.10, etkilesim=0.10,
                 sd_belge=0.8, alfa=ALFA, n_sim=N_SIM):
    """Fark-farklarin farki: (c)-(b2) farkinin YUKSEK bozulmada DUSUK'e gore artisi.

    etkilesim: yuksek bozulmada farkin ne kadar buyudugu (mutlak olasilik puani).
    Belge rastgele kesisimi ile eslesmis 2x2 desen; Wald testi kumelenmis varyansla.
    """
    red = 0
    for _ in range(n_sim):
        u = RNG.normal(0, sd_belge, n_belge)             # belge rastgele etkisi
        # dort hucre: (kol b2/c) x (bozulma dusuk/yuksek)
        p_b2_d = ters_lojistik(lojistik(taban) + u)
        p_c_d = ters_lojistik(lojistik(taban + kol_etki) + u)
        p_b2_y = ters_lojistik(lojistik(taban - 0.15) + u)
        p_c_y = ters_lojistik(lojistik(taban - 0.15 + kol_etki + etkilesim) + u)
        y = [RNG.binomial(1, p) for p in (p_b2_d, p_c_d, p_b2_y, p_c_y)]
        # belge duzeyi fark-farklarin farki
        d = (y[3] - y[2]) - (y[1] - y[0])
        se = d.std(ddof=1) / math.sqrt(n_belge)
        if se == 0:
            continue
        z = d.mean() / se
        red += abs(z) > stats.norm.ppf(1 - alfa / 2)
    return red / n_sim


# --------------------------------------------------- H9: alt grup etkilesimi
def h9_altgrup(n_alt=48, n_ana=240, taban=0.70, kume_disi_dusus=0.25,
               sd_belge=0.8, alfa=ALFA_KAPI2, n_sim=N_SIM):
    """Hedef birimin kapali kume DISINDA kaldigi belgelerde etkinin tersine donmesi."""
    red = 0
    n_ic = n_ana - n_alt
    for _ in range(n_sim):
        u_ic = RNG.normal(0, sd_belge, n_ic)
        u_dis = RNG.normal(0, sd_belge, n_alt)
        # kume ICINDE hibrit lehine, DISINDA aleyhine
        d_ic = RNG.binomial(1, ters_lojistik(lojistik(taban + 0.10) + u_ic)) - \
            RNG.binomial(1, ters_lojistik(lojistik(taban) + u_ic))
        d_dis = RNG.binomial(1, ters_lojistik(lojistik(taban - kume_disi_dusus) + u_dis)) - \
            RNG.binomial(1, ters_lojistik(lojistik(taban) + u_dis))
        se = math.sqrt(d_ic.var(ddof=1) / n_ic + d_dis.var(ddof=1) / n_alt)
        if se == 0:
            continue
        z = (d_ic.mean() - d_dis.mean()) / se
        red += abs(z) > stats.norm.ppf(1 - alfa / 2)
    return red / n_sim


# ------------------------------------------------------- H4: kappa (kumelenmis)
def h4_kappa(n_iddia=300, m=5, icc=0.20, kappa_h0=0.60, kappa_ger=0.80,
             yaygin=0.25, alfa=ALFA_H4, n_sim=1500):
    """Kumelenme duzeltmeli etkin orneklem ile kappa'nin alt sinirinin H0'i asmasi."""
    deff = 1 + (m - 1) * icc
    n_etkin = n_iddia / deff
    # kappa'nin standart hatasi (yaklasik, Fleiss): se ~ sqrt((1-k)/(n*(1-pe)))
    pe = yaygin ** 2 + (1 - yaygin) ** 2
    se = math.sqrt((1 - kappa_ger) * (1 - kappa_ger + 2 * (1 - kappa_ger)) /
                   (n_etkin * (1 - pe)))
    z = (kappa_ger - kappa_h0) / se
    guc = float(stats.norm.cdf(z - stats.norm.ppf(1 - alfa)))
    return deff, n_etkin, se, guc


# ------------------------------------------------------------ H6: Friedman
def h6_friedman(n_belge=240, turlar=(0, 1, 2, 3), taban_bulgu=3.0, azalma=0.45,
                alfa=ALFA, n_sim=1200):
    """Tur sayisi arttikca belge basina bulgu sayisi azalir (tekrarli olcum, sayim)."""
    red = 0
    for _ in range(n_sim):
        belge_etkisi = RNG.gamma(4.0, 0.25, n_belge)     # belge zorlugu
        sutunlar = []
        for t in turlar:
            lam = np.maximum(taban_bulgu * (1 - azalma) ** t * belge_etkisi, 0.05)
            sutunlar.append(RNG.poisson(lam))
        veri = np.column_stack(sutunlar)
        try:
            _, p = stats.friedmanchisquare(*[veri[:, i] for i in range(veri.shape[1])])
        except Exception:
            continue
        red += p < alfa
    return red / n_sim


# ===================================================================== KOŞUM
sonuc = {}
print("=" * 78)
print("GÜÇ SİMÜLASYONU — 2209-A önerisi (tohum 20260808, Monte Carlo)")
print("=" * 78)

print("\n[H1] Eşleştirilmiş kesin McNemar, n=240, α=0,0133 (Kapı 1 Holm en katı basamak)")
for fark, etiket in ((0.10, "ilan edilen 0,10 fark"), (0.09, "MDES sınırı 0,09")):
    p01 = (0.20 + fark) / 2
    p10 = (0.20 - fark) / 2
    g = h1_mcnemar(240, 0.20, p01 / p10)
    print(f"   fark={fark:.2f} ({etiket:<24}) → güç = {g:.3f}")
    sonuc[f"H1_guc_fark_{fark}"] = round(g, 3)
mdes, mdes_g = h1_mdes()
print(f"   saptanabilir en küçük fark (güç 0,80) = {mdes}  (ölçülen güç {mdes_g})")
sonuc["H1_MDES"] = mdes

print("\n[H2] Mimari × bozulma ETKİLEŞİMİ, n=240 belge, belge-içi eşleşmiş")
for e in (0.08, 0.10, 0.12):
    g = h2_etkilesim(etkilesim=e)
    print(f"   etkileşim büyüklüğü {e:.2f} → güç = {g:.3f}")
    sonuc[f"H2_guc_etkilesim_{e}"] = round(g, 3)

print("\n[H7] Alt grup etkileşimi (küme dışı belgeler, Kapı 2 α=0,02)")
for n_alt, etiket in ((48, "%20 alt küme"), (72, "%30 alt küme")):
    g = h9_altgrup(n_alt=n_alt)
    print(f"   n_alt={n_alt} ({etiket}) → güç = {g:.3f}")
    sonuc[f"H7_guc_n{n_alt}"] = round(g, 3)

print("\n[H4] Ölçüm geçerliliği — kümelenme düzeltmeli kappa (kendi kolu, α=0,01)")
deff, n_et, se, g = h4_kappa()
print(f"   DEFF = {deff:.2f} · etkin örneklem = {n_et:.0f} · SE = {se:.4f} → güç = {g:.3f}")
sonuc.update({"H4_DEFF": round(deff, 2), "H4_etkin_n": round(n_et),
              "H4_guc": round(g, 3)})

print("\n[H6] Müzakere turu — Friedman (tekrarlı ölçüm, sayım)")
for az in (0.30, 0.45):
    g = h6_friedman(azalma=az)
    print(f"   tur başına azalma {az:.0%} → güç = {g:.3f}")
    sonuc[f"H6_guc_azalma_{az}"] = round(g, 3)

print("\n" + "=" * 78)
yol = sys.argv[1] if len(sys.argv) > 1 else "guc_sonuc.json"
json.dump({"tohum": 20260808, "n_sim": N_SIM, "sonuc": sonuc},
          open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("YAZILDI:", yol)
