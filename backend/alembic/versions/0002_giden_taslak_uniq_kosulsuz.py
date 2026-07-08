"""giden_evrak: taslak_id UNIQUE koşulsuz (reddet dahil çift-gönderim guard)

Revision ID: 0002_giden_taslak_uniq
Revises: 0001_baseline
Create Date: 2026-07-09

Denetim bulgusu: ix_giden_taslak_uniq eskiden `WHERE durum <> 'reddedildi'` idi — reddet
(reddet) kararı bu kısmi kısıtın DIŞINDAYDI, yani aynı taslak çift-tıklama/ikinci-sekme/ağ
tekrarıyla iki kez reddedilebiliyor, hatta zaten gönderilmiş (onaylanmış) bir taslak sonradan
ayrıca "reddedilebiliyordu". Uygulama tarafı (karar_repo._karar_ve_giden) artık TÜM karar
türlerinde ön-kontrol yapıyor; bu migration DB kısıtını da aynı kurala genişletir (defense
in depth — eşzamanlı isteklerde yalnız DB kısıtı gerçek atomiklik sağlar).
"""
from __future__ import annotations

from alembic import op

revision = "0002_giden_taslak_uniq"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_giden_taslak_uniq;")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_giden_taslak_uniq ON giden_evrak(taslak_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_giden_taslak_uniq;")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_giden_taslak_uniq "
        "ON giden_evrak(taslak_id) WHERE durum <> 'reddedildi';")
