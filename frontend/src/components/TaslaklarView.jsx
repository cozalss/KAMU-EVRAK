/* TaslaklarView — oturumda üretilen resmî yazı taslakları + filtre (arama/tür/birim/sıralama). */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, V, PAL, BANT, DERIN, ALFA, TYPE, TNUM, RAD, SP, focusRing } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Taslak adı…" },
  select: [
    { id: "evrak_turu", label: "Evrak türü", options: [] },
    { id: "hedef_birim", label: "Hedef birim", options: [] },
  ],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};

const KALEM = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M14 6l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const COP = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const INDIR = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Tek taslak kartı — görüntüle / düzenle (yaz → kaydet) / sil (onaylı). Düzenleme durumu kart-yereldir;
   kaydet/sil üst duruma (DashboardApp.drafts) yansır. */
function DraftCard({ h, onUpdate, onDelete, onToast, autoEdit = false, onAutoEditDone }) {
  const r = h.result;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [dl, setDl] = useState(false);

  const startEdit = () => { setText(cleanDemoText(r.yazi_taslak_md) || ""); setOpen(true); setEditing(true); };
  const save = () => { onUpdate(h.id, text); setEditing(false); };

  // Onay kartından "Düzenle" ile hedefli geliş: kart doğrudan düzenleme modunda açılır +
  // görünüre kaydırılır. Hedef bir kez tüketilir (sonraki ziyaretlerde normal açılır).
  const kartRef = useRef(null);
  useEffect(() => {
    if (!autoEdit) return;
    startEdit();
    onAutoEditDone?.();
    const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    kartRef.current?.scrollIntoView({ behavior: az ? "auto" : "smooth", block: "start" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div ref={kartRef}>
    <NeonCard title={h.name} tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "Taslak"} accent={V}>
      <div style={{ display: "flex", gap: SP.s, flexWrap: "wrap", alignItems: "center", marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, color: PAL.mut }}>{EVRAK_TR(r.evrak_turu)} · {BIRIM_LBL(r.hedef_birim)}</span>
        {editing && <span style={{ ...TYPE.meta, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(V), color: DERIN.V }}>Düzenleniyor</span>}
      </div>

      {editing ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Taslak metnini düzenle" spellCheck={false}
            {...focusRing}
            style={{ width: "100%", boxSizing: "border-box", minHeight: 240, resize: "vertical", background: PAL.surf, color: PAL.ink2, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "12px 16px", ...TYPE.read, outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginTop: SP.s }}>
            <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>{text.length} karakter</span>
            <Btn onClick={downloadDocx} disabled={dl || !text.trim()} ariaLabel="Düzenlenen taslağı DOCX olarak indir" title="DOCX indir">
              <INDIR /> {dl ? "İndiriliyor…" : "DOCX indir"}
            </Btn>
          </div>
        </>
      ) : (
        <pre style={{ margin: 0, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "12px 16px", ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: open ? "none" : 150, overflow: "hidden" }}>
          {cleanDemoText(r.yazi_taslak_md)}
        </pre>
      )}

      <div style={{ display: "flex", gap: SP.s, marginTop: SP.m, flexWrap: "wrap", alignItems: "center" }}>
        {editing ? (
          <>
            <Btn primary onClick={save}>Kaydet</Btn>
            <Btn onClick={() => setEditing(false)}>İptal</Btn>
          </>
        ) : confirmDel ? (
          <>
            <span style={{ marginRight: "auto", ...TYPE.data, color: DERIN.kirmizi }}>Taslak silinecek — emin misiniz?</span>
            <Btn primary accent={BANT.kirmizi.c} onClick={() => onDelete(h.id)}>Evet, sil</Btn>
            <Btn onClick={() => setConfirmDel(false)}>Vazgeç</Btn>
          </>
        ) : (
          <>
            <Btn primary onClick={startEdit}><KALEM /> Düzenle</Btn>
            <Btn onClick={() => setOpen((o) => !o)}>{open ? "Daralt" : "Tamamını gör"}</Btn>
            <Btn onClick={() => setConfirmDel(true)} ariaLabel="Taslağı sil" title="Taslağı sil" style={{ marginLeft: "auto", color: DERIN.kirmizi }}><COP /> Sil</Btn>
          </>
        )}
      </div>
    </NeonCard>
    </div>
  );
}

export default function TaslaklarView({ drafts = [], onGoInbox, onUpdate = () => {}, onDelete = () => {}, onToast = () => {}, hedef = null, onHedefAcildi }) {
  // drafts: yalnız "Düzenle" ile ayrılmış taslaklar (her biri result.yazi_taslak_md taşır).
  // hedef: onay kartından "Düzenle" ile gelinen taslağın id'si → o kart düzenleme modunda açılır.

  // Hedef listede yoksa (silinmiş vb.) sessizce tüket — sonraki ziyarette yanlış kart açılmasın.
  useEffect(() => {
    if (hedef && !drafts.some((d) => d.id === hedef)) onHedefAcildi?.();
  }, [hedef, drafts, onHedefAcildi]);
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: SP.l, alignItems: "start" }}>
          {filter.results.map((h) => <DraftCard key={h.id} h={h} onUpdate={onUpdate} onDelete={onDelete} onToast={onToast} autoEdit={h.id === hedef} onAutoEditDone={onHedefAcildi} />)}
        </div>
      )}
    </ViewWrap>
  );
}
