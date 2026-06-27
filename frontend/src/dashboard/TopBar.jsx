/* TopBar — dosya meta + durum rozeti + Görev1/Görev2 + ilerleme çubuğu.
   TÜM veriler gerçek: dosya adı/boyut (File API / örnek metin uzunluğu), tür/sayfa/OCR%
   (ProcessResponse), ilerleme (node done sayısı). OCR% yalnız dosya yolunda (örnekte metin). */
import React from "react";
import { EVRAK_TR } from "../components/result-cards.jsx";
import { Icon } from "../components/icons.jsx";

function fmtSize(meta) {
  if (!meta) return "";
  if (meta.kind === "sample") return `${meta.size.toLocaleString("tr-TR")} karakter`;
  const b = meta.size || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function TopBar({ fileMeta, result, nodes, busy, error, pendingOnay }) {
  const total = nodes.length || 1;
  const done = nodes.filter((n) => n.status === "done").length;
  const pct = Math.round((done / total) * 100);

  // Aktif görev: çalışan (active) node'un görevi; yoksa son done node'un görevi.
  const activeNode = nodes.find((n) => n.status === "active");
  const lastDone = [...nodes].reverse().find((n) => n.status === "done");
  const activeGorev = activeNode?.gorev ?? lastDone?.gorev ?? null;

  let status = "sirada", statusLabel = "sırada";
  if (error) { status = "hata"; statusLabel = "hata"; }
  else if (busy) { status = "isleniyor"; statusLabel = "işleniyor"; }
  else if (result || pendingOnay) { status = "tamamlandi"; statusLabel = pendingOnay ? "onay bekliyor" : "tamamlandı"; }

  const r = result || pendingOnay;
  const hasFile = !!fileMeta;

  return (
    <header className="dash-topbar">
      <div className="dash-file">
        <span className="dash-file-ic" aria-hidden="true"><Icon.file /></span>
        <span className="dash-file-tx">
          <span className="dash-file-name">{hasFile ? fileMeta.name : "Evrak bekleniyor"}</span>
          <span className="dash-file-meta">
            {r?.evrak_turu && <span>{EVRAK_TR(r.evrak_turu)}</span>}
            {r?.page_count != null && (<><span className="sep">·</span><span>{r.page_count} sayfa</span></>)}
            {hasFile && (<><span className="sep">·</span><span>{fmtSize(fileMeta)}</span></>)}
            {r?.ocr_confidence != null && (<><span className="sep">·</span><span className="ocr">OCR %{Math.round(r.ocr_confidence * 100)}</span></>)}
            {!hasFile && <span>Soldaki “Yeni evrak yükle” ile başlayın</span>}
          </span>
        </span>
      </div>

      <div className="dash-topbar-spacer" />

      <div className="dash-gorevs" role="group" aria-label="Görevler">
        <span className={"dash-gorev g1" + (activeGorev === 1 ? " on" : "")}>
          <span className="dot" aria-hidden="true" /> Görev 1 · Anla
        </span>
        <span className={"dash-gorev g2" + (activeGorev === 2 ? " on" : "")}>
          <span className="dot" aria-hidden="true" /> Görev 2 · Üret
        </span>
      </div>

      <span className={"dash-status " + status} role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" /> {statusLabel}
      </span>

      <div className="dash-progress-wrap">
        <span className="dash-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="İşleme ilerlemesi">
          <span className="dash-progress-fill" style={{ "--p": pct / 100 }} />
        </span>
        <span className="dash-progress-pct">{pct}%</span>
      </div>
    </header>
  );
}

export default TopBar;
