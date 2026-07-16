"""onay: taslak_id UNIQUE — karar arşivi tekliği DB kısıtına bağlanır

Revision ID: 0004_onay_taslak_uniq
Revises: 0003_owner_liste_idx
Create Date: 2026-07-16

Review bulgusu: "1 taslak = en çok 1 onay" tekliği yalnız uygulama-düzeyi bir varsayımdı
(tek yazım noktası karar_repo._karar_ve_giden; gerçek UNIQUE yalnız giden_evrak.taslak_id'de).
Onay'a doğrudan yazan gelecekteki herhangi bir yol (admin aracı, backfill) sessizce çift
karar üretebilir ve taslak/işlem listeleri satır çoğaltırdı. giden_evrak deseninin (0002)
aynısı onay'a uygulanır. Canlı veri doğrulandı: çift onay 0, 'bekliyor' satırı 0.
"""
from __future__ import annotations

from alembic import op

revision = "0004_onay_taslak_uniq"
down_revision = "0003_owner_liste_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_onay_taslak_uniq ON onay(taslak_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_onay_taslak_uniq;")
