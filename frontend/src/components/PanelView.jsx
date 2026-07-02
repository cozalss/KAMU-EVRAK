/* PanelView — açılış paneli. Oturum özeti: işlenen evrak, tür/risk dağılımı, bekleyen kuyruk
   + son işlemler + hızlı eylemler. Tüm veri oturum geçmişinden (frontend state) — dürüst. */
import React from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, T, V, TYPE, TNUM, SP, RAD, DERIN, DERIN_OF, PAL, BANT } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL } from "./result-cards.jsx";

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function Stat({ label, value, accent, icon }) {
  return (
    <NeonCard>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: accent ? DERIN_OF(accent) : PAL.mut }}>{icon}</span>
        <div>
          <div style={{ ...TYPE.num, color: PAL.ink }}>{value}</div>
          <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: SP.xs }}>{label}</div>
        </div>
      </div>
    </NeonCard>
  );
}

/* Süresi yaklaşan/geçen kuyruk evrağı satırı — yasal dayanak + son tarih + eylem. */
function SlaSatir({ x, onGoInbox }) {
  const gecikmis = x.sla.durum === "GECIKMIS";
  const renk = gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  const kalanTxt = gecikmis ? `${Math.abs(x.sla.kalan_gun)} gün gecikti` : `son ${x.sla.kalan_gun} gün`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: renk, flexShrink: 0 }} />
      <span title={`${x.sla.etiket} — dayanak: ${x.sla.mevzuat}`} style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
      <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(renk), ...TNUM }}>{kalanTxt}</span>
      {x.sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, flexShrink: 0 }}>son: {x.sla.son_tarih}</span>}
      <Btn onClick={onGoInbox} ariaLabel={`${x.label} evrakını kuyruğa git ve işle`} style={{ padding: "4px 10px" }}>İşle <Icon.arrow /></Btn>
    </div>
  );
}

/* İşlem süresi kartı içeriği — hero sayı (ortalama) + son koşumların mini sütunları.
   Süre verisi sure_ms hattından gelir (yeni); eski DB kayıtlarında null → dürüst not. */
function SureGrafik({ history }) {
  const olculer = history
    .map((h) => ({ name: h.name, ms: h.result?.sure_ms }))
    .filter((x) => Number.isFinite(x.ms) && x.ms > 0);
  if (olculer.length === 0) {
    return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Süre verisi bu oturumdan itibaren toplanıyor — bir evrak işleyin.</p>;
  }
  const son = olculer.slice(0, 10).reverse(); // eski → yeni (soldan sağa zaman)
  const ort = olculer.reduce((a, x) => a + x.ms, 0) / olculer.length;
  const max = Math.max(...son.map((x) => x.ms));
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
        <span style={{ ...TYPE.num, color: PAL.ink, ...TNUM }}>{(ort / 1000).toFixed(1)} sn</span>
        <span style={{ ...TYPE.meta, color: PAL.mut }}>ortalama · {olculer.length} işlem</span>
      </div>
      <div role="img" aria-label={`Son ${son.length} işlemin süreleri, ortalama ${(ort / 1000).toFixed(1)} saniye`}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, marginTop: SP.m }}>
        {son.map((x, i) => (
          <span key={i} title={`${x.name} — ${(x.ms / 1000).toFixed(1)} sn`}
            style={{ flex: 1, minWidth: 6, height: `${Math.max(6, Math.round((x.ms / max) * 100))}%`, background: T, borderRadius: `${RAD.chip}px ${RAD.chip}px 0 0`, opacity: 0.9 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3, marginTop: SP.xs }}>
        <span>eski</span><span>yeni</span>
      </div>
    </>
  );
}

export default function PanelView({ history = [], outbox = [], inboxCount = 0, kuyrukSla = [], onGoInbox, onUpload, user }) {
  const n = history.length;
  // Kuyruktaki yasal süresi geçmiş/kritik evrak — kalan güne göre en acil önce.
  const acil = kuyrukSla
    .filter((x) => x.sla?.durum === "GECIKMIS" || x.sla?.durum === "KRITIK")
    .sort((a, b) => (a.sla.kalan_gun ?? 0) - (b.sla.kalan_gun ?? 0));
  const taslakSay = history.filter((h) => h.result?.yazi_taslak_md).length;
  const gonderilen = outbox.filter((o) => o.durum === "gonderildi").length;
  const risk = { yesil: 0, sari: 0, kirmizi: 0 };
  for (const h of history) if (risk[h.bant] != null) risk[h.bant]++;
  const turler = {};
  for (const h of history) { const t = EVRAK_TR(h.evrak_turu); turler[t] = (turler[t] || 0) + 1; }
  const turList = Object.entries(turler).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <ViewWrap id="panel-h" title="Panel" sub={`Hoş geldiniz, ${user?.ad_soyad || "memur"} · ${new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}`}
      actions={[
        // Panel'in tek primary'si boş-durumdaki CTA — başlık eylemleri secondary kalır.
        <Btn key="g" onClick={onGoInbox}><Icon.inbox /> Gelen evrak ({inboxCount})</Btn>,
        <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
      ]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: SP.l, marginBottom: SP.xl }}>
        <Stat label="İşlenen evrak" value={n} accent={T} icon={<Icon.doc />} />
        <Stat label="Bekleyen kuyruk" value={inboxCount} icon={<Icon.inbox />} />
        <Stat label="Üretilen taslak" value={taslakSay} accent={V} icon={<Icon.scale />} />
        <Stat label="Gönderilen evrak" value={gonderilen} accent={BANT.yesil.c} icon={<Icon.arrow />} />
        <Stat label="Onaya sunulan" value={risk.sari + risk.kirmizi} accent={BANT.sari.c} icon={<Icon.clock />} />
      </div>

      {acil.length > 0 && (
        <NeonCard title="Yasal süresi yaklaşan / geçen evrak" tag={`${acil.length} evrak`}
          tagColor={BANT.kirmizi.c} accent={BANT.kirmizi.c} style={{ marginBottom: SP.xl }}>
          <p style={{ margin: "0 0 4px", ...TYPE.meta, color: PAL.mut2 }}>
            Kuyrukta bekleyen ve yasal cevap süresi dolan/dolmak üzere olan evraklar — dayanak için satır üzerine gelin.
          </p>
          {acil.slice(0, 5).map((x) => <SlaSatir key={x.id} x={x} onGoInbox={onGoInbox} />)}
        </NeonCard>
      )}

      {n === 0 ? (
        <EmptyState icon={<Icon.chart />} title="Henüz evrak işlenmedi"
          sub="Gelen Evrak kuyruğundan bir evrak seçerek ya da yeni bir belge yükleyerek başlayın. İşlenen her evrak burada özetlenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrak'ı aç</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px,1fr))", gap: SP.l, alignItems: "start" }}>
          <NeonCard title="Risk dağılımı" accent={T}>
            {["yesil", "sari", "kirmizi"].map((k) => {
              const pct = n ? Math.round((risk[k] / n) * 100) : 0;
              return (
                <div key={k} style={{ marginBottom: SP.m }}>
                  <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
                    <span style={{ color: DERIN_OF(BANT[k].c), fontWeight: 500 }}>{BANT[k].l} · {BANT[k].t}</span><span style={{ ...TNUM }}>{risk[k]} (%{pct})</span>
                  </div>
                  <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: BANT[k].c, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
                  </div>
                </div>
              );
            })}
          </NeonCard>

          <NeonCard title="Evrak türü dağılımı" accent={V}>
            {turList.length === 0 ? <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>—</p> : turList.map(([t, c]) => {
              const maxTur = turList[0][1] || 1;
              return (
                <div key={t} title={`${t}: ${c} evrak`} style={{ marginBottom: SP.m }}>
                  <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
                    <span style={{ color: PAL.ink2, fontWeight: 500 }}>{t}</span>
                    <span style={{ color: DERIN.V, fontWeight: 500, ...TNUM }}>{c}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((c / maxTur) * 100)}%`, background: V, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
                  </div>
                </div>
              );
            })}
          </NeonCard>

          <NeonCard title="İşlem süresi" accent={T}>
            <SureGrafik history={history} />
          </NeonCard>

          <NeonCard title="Son işlemler" accent={T} full>
            {history.slice(0, 6).map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />
                <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                <span style={{ ...TYPE.meta, color: PAL.mut }}>{EVRAK_TR(h.evrak_turu)}</span>
                <span style={{ ...TYPE.meta, color: DERIN.V, textAlign: "right" }}>{BIRIM_LBL(h.hedef_birim)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400, color: PAL.mut2, flexShrink: 0 }}>{fmtTime(h.ts)}</span>
              </div>
            ))}
          </NeonCard>
        </div>
      )}
    </ViewWrap>
  );
}
