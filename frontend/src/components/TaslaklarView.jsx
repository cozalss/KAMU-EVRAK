/* TaslaklarView — bu oturumda üretilen resmî yazı taslakları. Her biri görüntülenir/indirilir. */
import React, { useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

export default function TaslaklarView({ history = [], onGoInbox, onView }) {
  const [open, setOpen] = useState(null);
  const drafts = history.filter((h) => h.result?.yazi_taslak_md);

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: 16, alignItems: "start" }}>
        {drafts.map((h) => {
          const r = h.result;
          const isOpen = open === h.id;
          return (
            <NeonCard key={h.id} title={h.name} tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "taslak"} accent={V}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, fontFamily: MONO, fontSize: 10 }}>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(46,230,201,.12)", color: "#8ff0e0" }}>{EVRAK_TR(r.evrak_turu)}</span>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(183,148,255,.14)", color: "#d7c4ff" }}>{BIRIM_LBL(r.hedef_birim)}</span>
              </div>
              <pre style={{ margin: 0, background: "#f4f5f9", borderRadius: 9, padding: "13px 15px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, maxHeight: isOpen ? "none" : 150, overflow: "hidden", position: "relative" }}>
                {cleanDemoText(r.yazi_taslak_md)}
              </pre>
              <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
                <Btn accent={V} onClick={() => setOpen(isOpen ? null : h.id)}>{isOpen ? "Daralt" : "Tamamını gör"}</Btn>
                {onView && <Btn accent={T} onClick={() => onView(h)}><Icon.arrow /> İşleniyor'da aç</Btn>}
              </div>
            </NeonCard>
          );
        })}
      </div>
    </ViewWrap>
  );
}
