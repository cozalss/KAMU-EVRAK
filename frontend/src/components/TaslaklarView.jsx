/* TaslaklarView — oturumda üretilen resmî yazı taslakları + filtre (arama/tür/birim/sıralama). */
import React, { useMemo, useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL } from "./neonUi.jsx";
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

export default function TaslaklarView({ history = [], onGoInbox }) {
  const [open, setOpen] = useState(null);
  const drafts = useMemo(() => history.filter((h) => h.result?.yazi_taslak_md), [history]);
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
        <EmptyState icon={<Icon.doc />} title="Henüz taslak üretilmedi"
          sub="Bir evrak işlendiğinde, üretilen resmî yazı taslağı (cevabi/üst/olur) burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="taslak-h" title="Taslaklar" sub={`${drafts.length} resmî yazı taslağı · memur onayı bekliyor`}>
      <FilterBar config={config} filter={filter} />
      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.doc />} title="Eşleşen taslak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: 16, alignItems: "start" }}>
          {filter.results.map((h) => {
            const r = h.result;
            const isOpen = open === h.id;
            return (
              <NeonCard key={h.id} title={h.name} tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, fontFamily: MONO, fontSize: 10 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(46,230,201,.12)", color: "#8ff0e0" }}>{EVRAK_TR(r.evrak_turu)}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(183,148,255,.14)", color: "#d7c4ff" }}>{BIRIM_LBL(r.hedef_birim)}</span>
                </div>
                <pre style={{ margin: 0, background: "#f4f5f9", borderRadius: 9, padding: "13px 15px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, maxHeight: isOpen ? "none" : 150, overflow: "hidden" }}>
                  {cleanDemoText(r.yazi_taslak_md)}
                </pre>
                <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
                  <Btn accent={V} onClick={() => setOpen(isOpen ? null : h.id)}>{isOpen ? "Daralt" : "Tamamını gör"}</Btn>
                </div>
              </NeonCard>
            );
          })}
        </div>
      )}
    </ViewWrap>
  );
}
