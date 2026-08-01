"""GÖNDEREN ≠ MUHATAP değişmezi — evrak kendi göndericisine havale EDİLEMEZ.

Ölçülen hata (2026-07-26): hitapsız resmî evrakta nominatif T.C.-antet kurumu MUHATAP
sanılıyordu; sistem "T.C./TARIM VE ORMAN BAKANLIĞI" antetli bir raporu Tarım ve Orman
Bakanlığı'na havale ediyordu. Kodun kendi docstring'i ("nominatif T.C. başlığı yalnızca
GÖNDEREN olabilir") ile davranışı çelişiyordu.

Bu dosya üç sızıntı yolunu birden kilitler: (1) nominatif desen eşleşmesi, (2) LLM-yedek
`bilgi_unsurlari['kurum']` alanı — `cikar` node'u oraya genellikle GÖNDEREN'i yazar ve
gönderen adı kaynakta geçtiği için grounding süzgecinden geçer, (3) route ajanının
LLM 'DISARIDA' eskalasyonu.
"""
from __future__ import annotations

import asyncio

from agents.kurum_kimlik import (
    gonderen_kurum_tespit,
    muhatap_kurum_tespit,
    muhatap_kurum_tespit_meta,
)
from agents.nodes.route_ajan import route_ajan

# Ekrandaki gerçek senaryo (hitap satırı YOK; nominatif antet = gönderen).
_RAPOR = """T.C.
TARIM VE ORMAN BAKANLIĞI
İl Müdürlüğü — İnceleme Heyeti

Sayı : E-40317295-260-2026/0512
Konu : Yerinde inceleme raporu

İlçemizde faaliyet gösteren tesise ilişkin şikâyet üzerine yapılan yerinde incelemede,
atık yönetimi kayıtlarının eksik tutulduğu tespit edilmiştir.
"""

# Yönelme-ekli hitap taşıyan evrak — muhatap tespiti BOZULMAMALI.
_HITAPLI = """T.C.
TARIM VE ORMAN BAKANLIĞI

Sayı : E-1
Konu : Bilgi talebi

YENİMAHALLE BELEDİYE BAŞKANLIĞINA

Gereğini arz ederim.
"""

# OCR'da yönelme eki düşmüş VATANDAŞ dilekçesi — gönderen SAYILMAMALI (tek satır başlık,
# Sayı/birim bloğu yok). Bu evrak bugün doğru havale ediliyor; değişiklik onu bozmamalı.
_DILEKCE = """YENİMAHALLE BELEDİYE BAŞKANLIĞI

Sokağımızın kaldırımları yıpranmıştır; onarım talep ederim.
Ayşe Yılmaz
"""


class TestGonderenTespiti:
    def test_nominatif_antet_gonderen_olarak_tespit_edilir(self):
        g = gonderen_kurum_tespit(_RAPOR)
        assert g["ad"] == "Tarım ve Orman Bakanlığı"
        assert g["slug"] == "tarim-orman-bakanligi"

    def test_gonderen_muhatap_yuvasina_SIZMAZ(self):
        """Ölçülen hatanın doğrudan regresyon testi."""
        kurum, hitapli = muhatap_kurum_tespit_meta(_RAPOR, {})
        assert hitapli is False
        assert kurum["slug"] == "", f"gönderen muhatap sanıldı: {kurum['ad']}"

    def test_llm_kurum_alani_gondereni_geri_sizdiramaz(self):
        """`cikar` node'u bilgi_unsurlari['kurum']'a GÖNDEREN'i yazar; yedek yol onu
        muhatap yapamaz — yoksa adım-2 düzeltmesi tek başına anlamsız kalır."""
        kurum = muhatap_kurum_tespit(_RAPOR, {"kurum": "Tarım ve Orman Bakanlığı"})
        assert kurum["slug"] == ""

    def test_hitap_ekli_satir_gonderen_SAYILMAZ(self):
        """'...BAŞKANLIĞINA' nominatif desene de uyar; muhatap olarak kalmalı."""
        assert gonderen_kurum_tespit(_HITAPLI)["slug"] == "tarim-orman-bakanligi"
        kurum, hitapli = muhatap_kurum_tespit_meta(_HITAPLI, {})
        assert hitapli is True
        assert kurum["slug"] == "yenimahalle-belediyesi"

    def test_eksiz_vatandas_dilekcesi_gonderen_SAYILMAZ(self):
        """Yapısal üçlü kanıt (T.C. + idare satırı + Sayı/birim) yoksa gönderen yok."""
        assert gonderen_kurum_tespit(_DILEKCE)["slug"] == ""
        assert muhatap_kurum_tespit(_DILEKCE, {})["slug"] == "yenimahalle-belediyesi"


class TestHavaleGondereneGitmez:
    def _kos(self, state, det):
        return asyncio.run(route_ajan(state, det))

    def test_gonderen_kurum_state_e_yazilir_ve_hedef_olmaz(self):
        out = self._kos(
            {"evrak_text": _RAPOR, "bilgi_unsurlari": {"konu": "yerinde inceleme raporu"}},
            {"hedef_birim": "ilgili_teknik_daire", "birim_alternatifleri": []},
        )
        assert out["gonderen_kurum"]["slug"] == "tarim-orman-bakanligi"
        # Havale hedefi hiçbir alanda gönderen olamaz.
        assert out["yetkili_kurum"].get("slug") != "tarim-orman-bakanligi"
        assert out.get("hedef_kurum_adi", "") != "Tarım ve Orman Bakanlığı"
        kaynak = out.get("hedef_birim_kaynak") or {}
        assert kaynak.get("kurum_slug", "") != "tarim-orman-bakanligi"

    def test_hitapsiz_evrakta_aktif_kurum_alici_olarak_kullanilir(self):
        out = self._kos(
            {"evrak_text": _RAPOR, "bilgi_unsurlari": {"konu": "atık yönetimi denetimi"},
             "aktif_kurum": "Yenimahalle Belediye Başkanlığı"},
            {"hedef_birim": "ilgili_teknik_daire", "birim_alternatifleri": []},
        )
        assert out["yetkili_kurum"]["slug"] == "yenimahalle-belediyesi"
        assert out["gonderen_kurum"]["slug"] == "tarim-orman-bakanligi"

    def test_alici_bilinmiyorsa_durust_fallback(self):
        """Aktif kurum yoksa uydurma hedef ÜRETİLMEZ — memur onayına düşer."""
        out = self._kos(
            {"evrak_text": _RAPOR, "bilgi_unsurlari": {"konu": "atık yönetimi denetimi"},
             "aktif_kurum": ""},
            {"hedef_birim": "ilgili_teknik_daire", "birim_alternatifleri": []},
        )
        assert out.get("hedef_birim") in (None, "")
        assert out.get("insan_onayi_gerekli") is True
