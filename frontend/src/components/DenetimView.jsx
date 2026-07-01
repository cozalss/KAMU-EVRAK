/* DenetimView — değiştirilemez denetim izi kayıtları. Her işlenen evrak için tamper-evident
   SHA-256 hash-zinciri (Sayıştay/KVKK uyumlu). Oturum geçmişinden (gerçek denetim_izi). */
import React, { useMemo } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL, BANT } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR } from "./result-cards.jsx";

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Evrak adı…" },
  chips: [{ id: "bant", label: "Risk", options: [
    { value: "yesil", label: "Yeşil · Düşük", color: BANT.yesil.c },
    { value: "sari", label: "Sarı · Orta", color: BANT.sari.c },
    { value: "kirmizi", label: "Kırmızı · Yüksek", color: BANT.kirmizi.c },
  ] }],
  select: [{ id: "evrak_turu", label: "Evrak Türü", options: [] }],
  dateRange: { enabled: true, label: "İşlem Tarihi" },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "risk_desc", label: "Risk (yüksek→düşük)" },
  ] },
  dataMapping: { search: ["name"], bant: "bant", evrak_turu: "evrak_turu", dateField: "ts" },
};

export default function DenetimView({ history = [], onGoInbox }) {
  const kayitlar = useMemo(() => history.filter((h) => h.result?.denetim_izi && Object.keys(h.result.denetim_izi).length), [history]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [{ ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(kayitlar, "evrak_turu", EVRAK_TR)] }],
  }), [kayitlar]);
  const filter = useFilter(kayitlar, config);

  if (kayitlar.length === 0) {
    return (
      <ViewWrap id="denetim-h" title="Denetim İzi" sub="Değiştirilemez işlem kayıtları (SHA-256)">
        <EmptyState icon={<Icon.shield />} title="Henüz denetim kaydı yok"
          sub="İşlenen her evrak için değiştirilemez bir SHA-256 hash-zinciri oluşturulur ve burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="denetim-h" title="Denetim İzi" sub={`${kayitlar.length} değiştirilemez kayıt · tamper-evident SHA-256 hash-zinciri`}>
      <NeonCard accent={BANT.yesil.c} style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, lineHeight: 1.6 }}>
          Her işlem adımı bir öncekinin hash'ini içerir → tek bir kaydın değiştirilmesi tüm zinciri bozar.
          <strong style={{ color: "#1f7a52" }}> Sayıştay denetimi ve KVKK</strong> için kanıt niteliğindedir.
        </p>
      </NeonCard>

      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.shield />} title="Eşleşen kayıt yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filter.results.map((h) => {
          const di = h.result.denetim_izi;
          const zincir = Array.isArray(di.zincir) ? di.zincir : (Array.isArray(di.adimlar) ? di.adimlar : []);
          return (
            <div key={h.id} style={{ padding: "15px 18px", borderRadius: 13, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${BANT.yesil.c}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <span aria-hidden="true" style={{ color: BANT.yesil.c, display: "flex" }}><Icon.shield /></span>
                <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: PAL.ink2 }}>{h.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(47,143,166,.12)", color: "#1f6d82" }}>{EVRAK_TR(h.evrak_turu)}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: (BANT[h.bant]?.c || PAL.mut2) + "22", color: BANT[h.bant]?.c || PAL.mut2 }}>{BANT[h.bant]?.l || "—"}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: PAL.mut2 }}>{fmtTime(h.ts)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 8 }}>
                <KV2 k="Zincir" v={`SHA-256 · ${zincir.length || "—"} adım ✓`} c="#1f7a52" />
                {di.kok_hash && <KV2 k="Kök hash" v={String(di.kok_hash).slice(0, 22) + "…"} />}
                {di.son_hash && <KV2 k="Son hash" v={String(di.son_hash).slice(0, 22) + "…"} />}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </ViewWrap>
  );
}

const KV2 = ({ k, v, c = PAL.ink2 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: MONO, fontSize: 11 }}>
    <span style={{ color: PAL.mut3 }}>{k}</span><span style={{ color: c, textAlign: "right" }}>{v}</span>
  </div>
);
