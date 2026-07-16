"""Liste sorguları için owner composite index'leri (seq-scan önlemi)

Revision ID: 0003_owner_liste_idx
Revises: 0002_giden_taslak_uniq
Create Date: 2026-07-16

Sağlık taraması bulgusu: gelen_evrak_listele / giden_evrak_listele / panel_istatistik /
islem_listele neredeyse tamamen owner kolonuyla (olusturan_id / gonderen_id) filtreleyip
tarihe göre sıralıyor, ancak bu kolonlarda index yoktu (yalnız birim FK'leri indeksliydi) —
veri büyüdükçe her liste çağrısı tam tablo taramasına dönüşüyordu. Composite (owner, tarih
DESC) index'leri hem filtreyi hem ORDER BY ... DESC LIMIT desenini tek index'ten karşılar.
"""
from __future__ import annotations

from alembic import op

revision = "0003_owner_liste_idx"
down_revision = "0002_giden_taslak_uniq"
branch_labels = None
depends_on = None

_INDEXLER = (
    ("ix_gelen_olusturan_tarih", "gelen_evrak", "(olusturan_id, olusturuldu DESC)"),
    ("ix_giden_gonderen_tarih", "giden_evrak", "(gonderen_id, gonderim_tarihi DESC)"),
)


def upgrade() -> None:
    for ad, tablo, kolonlar in _INDEXLER:
        op.execute(f"CREATE INDEX IF NOT EXISTS {ad} ON {tablo}{kolonlar};")


def downgrade() -> None:
    for ad, _tablo, _kolonlar in _INDEXLER:
        op.execute(f"DROP INDEX IF EXISTS {ad};")
