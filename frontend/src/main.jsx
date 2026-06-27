import React from "react";
import ReactDOM from "react-dom/client";
import DashboardApp from "./DashboardApp.jsx";
import "./styles/fonts.css";
import "./styles/kamu-evrak.css";   // global reset + result-cards yardımcı stilleri (gövde kenar boşluğu sıfırlama)

// Aktif görünüm: CanliAjanAkisi (neon komuta merkezi, satır-içi stilli) — DashboardApp sarmalar.
// Geri dönüş (açık-tema tek-sayfa): DashboardApp → App.jsx.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>,
);
