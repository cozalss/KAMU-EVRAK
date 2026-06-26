# Ablasyon Çalışması — CRAG ve verify Node Katkısı (A/B)

> Otomatik üretildi: `python -m eval.ablation_eval`. Aynı gold-set üzerinde ENV-gated SOTA öz-düzeltme node'ları AÇIK vs KAPALI. İstatistik: eval/stats.py (exact-binom McNemar p + bootstrap Δ %95 CI). **Dürüstlük:** Δ küçük + p>0.05 → anlamlı DEĞİL.

## A/B Doğruluk Karşılaştırması

| Ablasyon | n | KAPALI (A) | AÇIK (B) | Δ / anlamlılık |
|----------|---|-----------|----------|----------------|
| CRAG — Sınıflandırma (mevzuat düzeltme; sınıfa dolaylı) | 60 | 0.933 [0.841, 0.974] | 0.933 [0.841, 0.974] | Δ=+0.0pp, %95 CI [+0.0, +0.0]pp, p=1.000 → anlamlı DEĞİL |
| CRAG — Yönlendirme (NEGATİF KONTROL; Δ≈0 beklenir) | 60 | 0.950 [0.863, 0.983] | 0.950 [0.863, 0.983] | Δ=+0.0pp, %95 CI [+0.0, +0.0]pp, p=1.000 → anlamlı DEĞİL |
| verify — Sınıflandırma (kalite-kapısı; sınıfa etkisiz beklenir) | 60 | 0.933 [0.841, 0.974] | 0.933 [0.841, 0.974] | Δ=+0.0pp, %95 CI [+0.0, +0.0]pp, p=1.000 → anlamlı DEĞİL |

## Node Mekanizma Etkisi (doğrudan ölçüm)

- **CRAG düzeltme (temiz gold, tam-graf):** 0/60 vakada düzeltme tetiklendi. Temiz sentetik gold'da `mevzuat_oner` zaten tür-ağırlıklı sorgu-genişletme yapar (raw BM25≈17-40) → retrieval güçlü, CRAG **dormant** kalır. Bu BEKLENEN ve dürüst sonuçtur (gereksiz müdahale yok).
- **CRAG mekanizma kontrolü (kontrollü düşük-güven state):** 4/4 türde, zayıf (config-fallback) retrieval verilen state'te CRAG sorguyu domain-terimle genişletip korpustan daha güçlü öneri getirdi; ortalama retrieval güven artışı **+0.417** (0..1 normalize). Mekanizma doğru çalışır; tam-grafta tetiklenmemesi corpus/baseline kalitesindendir.
- **verify kalite-kapısı:** 0/60 taslakta format-uyum/uydurma uyarısı üretildi (60 vakada doğrulama notu).

## Yorum

CRAG ve verify **additive** öz-düzeltme/doğrulama katmanlarıdır: birincil katkıları doğruluk metriğinde değil, **mevzuat önerisi alakası** (CRAG) ve **taslak güvenilirliği** (verify uydurma-veto) iyileştirmesindedir. Temiz gold'da sınıflandırma/yönlendirme doğruluğunda anlamlı fark BEKLENMEZ (yukarıdaki p>0.05 bunu dürüstçe doğrular). CRAG'in tam-grafta dormant kalması bir kusur değil; baseline retriever'ın (tür-boost'lu BM25) bu corpus'ta yeterince güçlü olduğunu, CRAG'in ise yalnızca GERÇEKTEN gerektiğinde (zayıf retrieval) devreye girip aksi halde çıktıyı bozmadığını gösterir — bu, öz-düzeltme katmanının doğru tasarımıdır.
