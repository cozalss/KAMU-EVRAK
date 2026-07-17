"""alt_talep(islem_id,sira) UNIQUE + bilgi_unsuru/kanit_span FK indeksleri

Revision ID: 0005_alt_talep_uniq_fk_idx
Revises: 0004_onay_taslak_uniq
Create Date: 2026-07-17

DB denetimi (2 bağımsız ajan) bulguları — hepsi additive, mevcut sözleşmeleri kırmaz:

1. HIGH — alt_talep.islem_id indekssiz FK; her HITL kararında (onayla_ve_gonder_alt_talep,
   taslak_metnini_guncelle, taslak_sil) islem_id ile sorgulanıyor. UNIQUE(islem_id, sira)
   hem indeksi hem bütünlüğü tek hamlede getirir: islem_adimi/denetim_adimi zaten aynı
   deseni koruyor, alt_talep bu tutarlılığın dışında kalmıştı. Çift (islem_id, sira)
   oluşursa karar_repo'nun .scalar() sorgusu sessizce ilkini döner → yanlış alt-talebe
   karar bağlanma riski. Veri karar_repo._alt_talepler enumerate ile üretildiğinden aynı
   işlem içinde sira zaten tekil (0002/0004 aynı güvenle UNIQUE ekledi).

2. MEDIUM — bilgi_unsuru.islem_id / kanit_span.islem_id indekssiz FK; imha job'ı
   (imha_repo) islem_id IN (...) ile toplu güncelliyor, evrak hacmi büyüdükçe FK indeksi
   devreye girer. İleride kanıt görüntüleme okuma ucu eklenirse hazır.

Idempotent (IF NOT EXISTS). schema.sql §11 ile senkron tutuldu (drift önleme).
"""
from __future__ import annotations

from alembic import op

revision = "0005_alt_talep_uniq_fk_idx"
down_revision = "0004_onay_taslak_uniq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # UNIQUE: bütünlük + FK indeksi (islem_id önce → islem_id-only sorguları da kapsar).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_alt_talep_islem_sira "
        "ON alt_talep(islem_id, sira);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_bilgi_unsuru_islem ON bilgi_unsuru(islem_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kanit_span_islem   ON kanit_span(islem_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_kanit_span_islem;")
    op.execute("DROP INDEX IF EXISTS ix_bilgi_unsuru_islem;")
    op.execute("DROP INDEX IF EXISTS uq_alt_talep_islem_sira;")
