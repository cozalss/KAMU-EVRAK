"""gen_heldout üreteç testleri — held-out setin DÜRÜSTLÜK (dairesel-olmama) garantileri.

Kritik invariant'lar:
  - Etiketler kanonik taksonomi (config.EVRAK_TURLERI \\ 'belirsiz').
  - TCKN checksum-GEÇERLİ ama SAHTE (CLAUDE.md §2).
  - Held-out gövdesi gen_synthetic'in tür-imzası keyword'lerinden KAÇINIR
    (dairesel-olmama → mock skoru dürüstçe düşer).
  - Deterministik (aynı seed = aynı çıktı).
AAA deseni; ağ/GPU bağımlılığı yok.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from agents.config import EVRAK_TO_BIRIM, EVRAK_TURLERI

# scripts/ paket değil → gen_heldout.py'yi dosya yolundan yükle (mutlak).
# NOT: @dataclass çözümlemesi modülün sys.modules'te kayıtlı olmasını ister
# (dataclasses._is_type cls.__module__'u sys.modules'ten arar) → exec ÖNCESİ kaydet.
_GEN_PATH = Path(__file__).resolve().parent.parent.parent / "scripts" / "gen_heldout.py"
_spec = importlib.util.spec_from_file_location("gen_heldout", _GEN_PATH)
assert _spec and _spec.loader
gen_heldout = importlib.util.module_from_spec(_spec)
sys.modules["gen_heldout"] = gen_heldout
_spec.loader.exec_module(gen_heldout)


class TestTcknSahteAmaGecerli:
    """fake_tckn checksum doğrulamasını GEÇER (algoritma doğru) ama rastgele = sahte."""

    def _checksum_gecerli(self, t: str) -> bool:
        d = [int(c) for c in t]
        if len(d) != 11 or d[0] == 0:
            return False
        odd = d[0] + d[2] + d[4] + d[6] + d[8]
        even = d[1] + d[3] + d[5] + d[7]
        return d[9] == (odd * 7 - even) % 10 and d[10] == sum(d[:10]) % 10

    def test_uretilen_tckn_checksum_gecerli(self):
        # Arrange
        import random
        rng = random.Random(42)
        # Act + Assert — 50 örnek hepsi checksum-geçerli (format doğru)
        for _ in range(50):
            assert self._checksum_gecerli(gen_heldout.fake_tckn(rng))


class TestUretimYapisi:
    """generate() taksonomi-uyumlu, deterministik, doğru sayıda örnek üretir."""

    def test_18_tur_uretilir_belirsiz_haric(self):
        # Arrange + Act
        samples = gen_heldout.generate(per_type=4, seed=1)
        turler = {s.evrak_turu for s in samples}
        # Assert — 'belirsiz' üretilmez; kalan 18 tür hepsi var
        assert "belirsiz" not in turler
        assert turler == set(EVRAK_TURLERI) - {"belirsiz"}
        assert len(samples) == 18 * 4

    def test_etiketler_kanonik_kumede(self):
        # Arrange + Act
        samples = gen_heldout.generate(per_type=4, seed=1)
        # Assert — her etiket geçerli config türü + beklenen_birim doğru eşleme
        for s in samples:
            assert s.evrak_turu in EVRAK_TURLERI
            assert s.beklenen_birim == EVRAK_TO_BIRIM[s.evrak_turu]

    def test_deterministik_ayni_seed_ayni_cikti(self):
        # Arrange + Act
        a = gen_heldout.generate(per_type=4, seed=7)
        b = gen_heldout.generate(per_type=4, seed=7)
        # Assert
        assert [s.metin for s in a] == [s.metin for s in b]

    def test_to_record_kaynak_heldout(self):
        # Arrange + Act
        rec = gen_heldout.generate(per_type=4, seed=1)[0].to_record()
        # Assert — rapor held-out'u in-domain'den ayırabilsin
        assert rec["kaynak"] == "heldout"
        assert {"id", "evrak_turu", "metin", "beklenen_birim"} <= set(rec)


class TestDaireselOlmama:
    """Held-out gövdesi gen_synthetic tür-imzası keyword'lerinden KAÇINIR (dürüstlük)."""

    def test_dilekce_kelimesi_metinde_yok(self):
        # Arrange — dilekçe örnekleri 'dilekçe' sözcüğünü AÇIKÇA taşımamalı (sızıntı yok)
        samples = [s for s in gen_heldout.generate(8, seed=3) if s.evrak_turu == "dilekce"]
        # Act + Assert — gövdede 'dilekçe' geçmez (heuristik en güçlü sinyalini bulamaz)
        for s in samples:
            assert "dilekçe" not in s.metin.lower()

    def test_fatura_kelimesi_metinde_yok(self):
        # Arrange — fatura örnekleri 'fatura' sözcüğü taşımamalı (dolaylı mali bağlam)
        samples = [s for s in gen_heldout.generate(8, seed=3) if s.evrak_turu == "fatura"]
        # Act + Assert
        for s in samples:
            assert "fatura" not in s.metin.lower()

    def test_bazi_orneklerde_konu_satiri_yok(self):
        # Arrange — held-out bazı örneklerde 'Konu:' satırını ATLAR (heuristik zorlanır)
        samples = gen_heldout.generate(8, seed=3)
        # Act
        konusuz = [s for s in samples if "Konu" not in s.metin]
        # Assert — en az bir örnek konu satırsız (dürüst zorluk)
        assert len(konusuz) > 0
