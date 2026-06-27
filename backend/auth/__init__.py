"""Kimlik & yetki (Auth B — kendi kullanici/oturum tablolarımız).

argon2id parola + JWT (access 15dk / refresh 7g, rotation). RBAC: rol_turu
(memur/yetkili/yonetici/sistem) + e_imza_yetkisi (giden onayı, Yön. 2646).
"""
from __future__ import annotations

from auth.router import router as auth_router

__all__ = ("auth_router",)
