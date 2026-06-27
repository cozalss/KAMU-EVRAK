/* Sidebar — çalışma alanı navigasyonu (Panel/Gelen Evrak/İşleniyor/Taslaklar/Mevzuat/Denetim).
   İşleniyor = gerçek çalışan görünüm; diğerleri son-sonuç verisiyle beslenen stub'lar (dürüst).
   "Yeni evrak yükle" → dosya seçici. Aktif İşleniyor + busy iken canlı spinner. */
import React from "react";
import { Icon } from "../components/icons.jsx";

export const DASH_VIEWS = [
  { id: "panel", label: "Panel", icon: "panel" },
  { id: "gelen", label: "Gelen Evrak", icon: "inbox" },
  { id: "isleniyor", label: "İşleniyor", icon: "refresh", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "file" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
  { id: "denetim", label: "Denetim İzi", icon: "shieldCheck" },
];

export function Sidebar({ activeView, onNavigate, onUpload, busy }) {
  return (
    <aside className="dash-sidebar" aria-label="Çalışma alanı navigasyonu">
      <div className="dash-brand">
        <span className="dash-brand-logo" aria-hidden="true"><Icon.brand /></span>
        <span className="dash-brand-tx">
          <b>kamu-evrak</b>
          <span>TEKNOFEST 2026 · S1</span>
        </span>
      </div>

      <nav aria-label="Bölümler">
        <p className="dash-nav-h">Çalışma Alanı</p>
        <ul className="dash-nav">
          {DASH_VIEWS.map((v) => {
            const NavIcon = Icon[v.icon] || Icon.file;
            const isActive = activeView === v.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  className={"dash-nav-item" + (isActive ? " active" : "")}
                  onClick={() => onNavigate(v.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <NavIcon aria-hidden="true" />
                  <span>{v.label}</span>
                  {v.live && isActive && busy && (
                    <span className="dash-nav-spin" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="dash-sidebar-foot">
        <button type="button" className="dash-upload-btn" onClick={onUpload} disabled={busy}>
          <Icon.plus aria-hidden="true" /> Yeni evrak yükle
        </button>
        <p className="dash-foot-note">Sentetik veri · KVKK maskeli · karar-destek</p>
      </div>
    </aside>
  );
}

export default Sidebar;
