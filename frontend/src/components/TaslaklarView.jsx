/* TaslaklarView — oturumda üretilen resmî yazı taslakları + filtre (arama/tür/birim/sıralama). */
import React, { useMemo, useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL, BANT, focusRing } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Taslak adı…" },
  select: [
    { id: "evrak_turu", label: "Evrak Türü", options: [] },
    { id: "hedef_birim", label: "Hedef Birim", options: [] },
  ],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "name_asc", label: "Ad (A→Z)" },
  ] },
  dataMapping: { search: ["name"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};

const KALEM = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M14 6l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const COP = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const INDIR = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Tek taslak kartı — görüntüle / düzenle (yaz → kaydet) / sil (onaylı). Düzenleme durumu kart-yereldir;
   kaydet/sil üst duruma (DashboardApp.drafts) yansır. */
function DraftCard({ h, onUpdate, onDelete, onToast }) {
  const r = h.result;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [dl, setDl] = useState(false);
  const red = BANT.kirmizi.c;

  const startEdit = () => { setText(cleanDemoText(r.yazi_taslak_md) || ""); setOpen(true); setEditing(true); };
  const save = () => { onUpdate(h.id, text); setEditing(false); };

  // Düzenlenen metni DOĞRUDAN DOCX indir (pipeline yok → /yazi/render). Elde edilen gövde olduğu gibi.
  const downloadDocx = async () => {
    if (!text.trim() || dl) return;
    setDl(true);
    let url = "";
    try {
      const res = await fetch("/yazi/render?format=docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: h.name || "Resmî Yazı Taslağı" }),
      });
      if (!res.ok) throw new Error(`İndirilemedi (${res.status})`);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(h.name || "taslak").replace(/[^\w.-]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      onToast?.("Taslak DOCX olarak indirildi.");
    } catch (e) {
      onToast?.(e?.message || "İndirme başarısız — backend çalışıyor mu?");
    } finally {
      if (url) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 1500); }
      setDl(false);
    }
  };

  return (
    <NeonCard title={h.name} tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, fontFamily: MONO, fontSize: 10 }}>
        <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(47,143,166,.12)", color: "#1f6d82" }}>{EVRAK_TR(r.evrak_turu)}</span>
        <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,176,.14)", color: "#6a4787" }}>{BIRIM_LBL(r.hedef_birim)}</span>
        {editing && <span style={{ padding: "2px 8px", borderRadius: 6, background: `${V}1f`, color: "#6a4787", border: `1px solid ${V}44` }}>düzenleniyor</span>}
      </div>

      {editing ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Taslak metnini düzenle" spellCheck={false}
            onFocus={(e) => { e.currentTarget.style.borderColor = V; e.currentTarget.style.boxShadow = `0 0 0 3px ${V}33`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = PAL.lineHi; e.currentTarget.style.boxShadow = "none"; }}
            style={{ width: "100%", boxSizing: "border-box", minHeight: 240, resize: "vertical", background: "#ffffff", color: "#2a3346", border: `1px solid ${PAL.lineHi}`, borderRadius: 9, padding: "13px 15px", fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6, outline: "none", transition: "border-color .2s, box-shadow .2s" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: PAL.mut3 }}>{text.length} karakter</span>
            <button type="button" onClick={downloadDocx} disabled={dl || !text.trim()} aria-label="Düzenlenen taslağı DOCX olarak indir" title="DOCX indir" {...focusRing}
              style={{ cursor: dl || !text.trim() ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9, border: `1px solid ${T}55`, background: dl || !text.trim() ? "rgba(35,26,18,.05)" : `${T}14`, color: dl || !text.trim() ? PAL.mut2 : T, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
              <INDIR /> {dl ? "indiriliyor…" : "DOCX indir"}
            </button>
          </div>
        </>
      ) : (
        <pre style={{ margin: 0, background: "#ffffff", borderRadius: 9, padding: "13px 15px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, maxHeight: open ? "none" : 150, overflow: "hidden" }}>
          {cleanDemoText(r.yazi_taslak_md)}
        </pre>
      )}

      <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
        {editing ? (
          <>
            <Btn accent={V} primary onClick={save}>Kaydet</Btn>
            <Btn accent={V} onClick={() => setEditing(false)}>İptal</Btn>
          </>
        ) : confirmDel ? (
          <>
            <span style={{ marginRight: "auto", fontFamily: SANS, fontSize: 12, color: "#a23425" }}>Taslak silinecek — emin misiniz?</span>
            <button type="button" onClick={() => onDelete(h.id)} {...focusRing}
              style={{ cursor: "pointer", padding: "9px 15px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${red},${red}cc)`, color: "#fbf7f0", fontFamily: SANS, fontSize: 12.5, fontWeight: 700, boxShadow: `0 8px 20px -9px ${red}99` }}>Evet, sil</button>
            <Btn accent={V} onClick={() => setConfirmDel(false)}>Vazgeç</Btn>
          </>
        ) : (
          <>
            <Btn accent={V} primary onClick={startEdit}><KALEM /> Düzenle</Btn>
            <Btn accent={V} onClick={() => setOpen((o) => !o)}>{open ? "Daralt" : "Tamamını gör"}</Btn>
            <button type="button" onClick={() => setConfirmDel(true)} aria-label="Taslağı sil" title="Taslağı sil" {...focusRing}
              style={{ cursor: "pointer", marginLeft: "auto", padding: "9px 14px", borderRadius: 10, border: `1px solid ${red}66`, background: `${red}14`, color: "#a23425", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}><COP /> Sil</button>
          </>
        )}
      </div>
    </NeonCard>
  );
}

export default function TaslaklarView({ drafts = [], onGoInbox, onUpdate = () => {}, onDelete = () => {}, onToast = () => {} }) {
  // drafts: yalnız "Düzenle" ile ayrılmış taslaklar (her biri result.yazi_taslak_md taşır).
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(drafts, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(drafts, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [drafts]);
  const filter = useFilter(drafts, config);

  if (drafts.length === 0) {
    return (
      <ViewWrap id="taslak-h" title="Taslaklar" sub="Üretilen resmî yazı taslakları">
        <EmptyState icon={<Icon.doc />} title="Henüz taslak ayrılmadı"
          sub="Onay kartında “Düzenle” seçtiğinizde, ilgili resmî yazı taslağı düzenlenmek üzere burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="taslak-h" title="Taslaklar" sub={`${drafts.length} resmî yazı taslağı · düzenleme bekliyor`}>
      <FilterBar config={config} filter={filter} />
      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.doc />} title="Eşleşen taslak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: 16, alignItems: "start" }}>
          {filter.results.map((h) => <DraftCard key={h.id} h={h} onUpdate={onUpdate} onDelete={onDelete} onToast={onToast} />)}
        </div>
      )}
    </ViewWrap>
  );
}
