import React from "react";
import ReactDOM from "react-dom/client";
import DashboardApp from "./DashboardApp.jsx";
import "./styles/fonts.css";
import "./styles/kamu-evrak.css";   // açık-tema token tabanı (rc-* kartlar bunu kullanır)
import "./styles/dashboard.css";    // SONRA: .ke-dash dark scope override + dashboard yerleşim

// Geri dönüş (açık-tema tek-sayfa): DashboardApp → App ve dashboard.css satırını kaldır.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>,
);
