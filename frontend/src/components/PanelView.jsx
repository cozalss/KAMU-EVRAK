/* PanelView — açılış paneli. Oturum özeti: işlenen evrak, tür/risk dağılımı, bekleyen kuyruk
   + son işlemler + hızlı eylemler. Tüm veri oturum geçmişinden (frontend state) — dürüst. */
import React from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL, BANT } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL } from "./result-cards.jsx";

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function Stat({ label, value, accent, icon }) {
  return (
    <NeonCard accent={accent} style={{ borderTop: `2px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", background: accent + "1a", color: accent }}>{icon}</span>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 700, color: PAL.ink, lineHeight: 1 }}>{value}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, marginTop: 3 }}>{label}</div>
        </div>
      </div>
    </NeonCard>
  );
}

export default function PanelView({ history = [], inboxCount = 0, onGoInbox, onUpload }) {
  const n = history.length;
  const taslakSay = history.filter((h) => h.result?.yazi_taslak_md).length;
  const risk = { yesil: 0, sari: 0, kirmizi: 0 };
  for (const h of history) if (risk[h.bant] != null) risk[h.bant]++;
  const turler = {};
  for (const h of history) { const t = EVRAK_TR(h.evrak_turu); turler[t] = (turler[t] || 0) + 1; }
  const turList = Object.entries(turler).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <ViewWrap id="panel-h" title="Panel" sub={`Hoş geldiniz, M. Yılmaz · ${new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}`}
      actions={[
        <Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak ({inboxCount})</Btn>,
        <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
      ]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: 14, marginBottom: 22 }}>
        <Stat label="İşlenen evrak" value={n} accent={T} icon={<Icon.doc />} />
        <Stat label="Bekleyen kuyruk" value={inboxCount} accent="#5b8cff" icon={<Icon.inbox />} />
        <Stat label="Üretilen taslak" value={taslakSay} accent={V} icon={<Icon.scale />} />
        <Stat label="Onaya sunulan" value={risk.sari + risk.kirmizi} accent="#fbbf24" icon={<Icon.clock />} />
      </div>

      {n === 0 ? (
        <EmptyState icon={<Icon.chart />} title="Henüz evrak işlenmedi"
          sub="Gelen Evrak kuyruğundan bir evrak seçerek ya da yeni bir belge yükleyerek başlayın. İşlenen her evrak burada özetlenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px,1fr))", gap: 16, alignItems: "start" }}>
          <NeonCard title="Risk Dağılımı" accent={T}>
            {["yesil", "sari", "kirmizi"].map((k) => {
              const pct = n ? Math.round((risk[k] / n) * 100) : 0;
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, marginBottom: 4 }}>
                    <span style={{ color: BANT[k].c }}>{BANT[k].l} · {BANT[k].t}</span><span>{risk[k]} (%{pct})</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: BANT[k].c, borderRadius: 4, transition: "width .5s" }} />
                  </div>
                </div>
              );
            })}
          </NeonCard>

          <NeonCard title="Evrak Türü Dağılımı" accent={V}>
            {turList.length === 0 ? <p style={{ fontFamily: MONO, fontSize: 11.5, color: PAL.mut2 }}>—</p> : turList.map(([t, c]) => (
              <div key={t} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${PAL.line}`, fontFamily: MONO, fontSize: 11.5 }}>
                <span style={{ color: PAL.ink2 }}>{t}</span><span style={{ color: V }}>{c}</span>
              </div>
            ))}
          </NeonCard>

          <NeonCard title="Son İşlemler" accent={T} full>
            {history.slice(0, 6).map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px dashed ${PAL.line}` }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: T }}>{EVRAK_TR(h.evrak_turu)}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#d7c4ff", textAlign: "right" }}>{BIRIM_LBL(h.hedef_birim)}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, flexShrink: 0 }}>{fmtTime(h.ts)}</span>
              </div>
            ))}
          </NeonCard>
        </div>
      )}
    </ViewWrap>
  );
}
