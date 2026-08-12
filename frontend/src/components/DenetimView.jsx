/* DenetimView — değiştirilemez denetim izi kayıtları. Her işlenen evrak için tamper-evident
   SHA-256 hash-zinciri (Sayıştay/KVKK uyumlu). Oturum geçmişinden (gerçek denetim_izi). */
import React, { useMemo } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, RAD, SP } from "./neonUi.jsx";
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
  select: [{ id: "evrak_turu", label: "Evrak türü", options: [] }],
  dateRange: { enabled: true, label: "İşlem tarihi" },
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
      <ViewWrap id="denetim-h" title="Denetim izi" sub="Değiştirilemez işlem kayıtları (SHA-256)">
        <EmptyState icon={<Icon.shield />} title="Henüz denetim kaydı yok"
          sub="İşlenen her evrak için değiştirilemez bir SHA-256 hash-zinciri oluşturulur ve burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="denetim-h" title="Denetim izi" sub={`${kayitlar.length} değiştirilemez kayıt · tamper-evident SHA-256 hash-zinciri`}>
      <NeonCard accent={BANT.yesil.c} style={{ marginBottom: SP.l }}>
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>
          Her işlem adımı bir öncekinin hash'ini içerir → tek bir kaydın değiştirilmesi tüm zinciri bozar.
          <strong style={{ color: DERIN.yesil }}> Sayıştay denetimi ve KVKK</strong> için kanıt niteliğindedir.
        </p>
      </NeonCard>

      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.shield />} title="Eşleşen kayıt yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
        {filter.results.map((h) => {
          const di = h.result.denetim_izi;
          const zincir = Array.isArray(di.zincir) ? di.zincir : (Array.isArray(di.adimlar) ? di.adimlar : []);
          return (
            <div key={h.id} style={{ padding: SP.l, borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", marginBottom: SP.m }}>
                <span aria-hidden="true" style={{ color: DERIN.yesil, display: "flex" }}><Icon.shield /></span>
                <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{h.name}</span>
                <span style={{ ...TYPE.meta, color: PAL.mut }}>{EVRAK_TR(h.evrak_turu)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT[h.bant]?.c || PAL.mut2), color: BANT[h.bant] ? DERIN_OF(BANT[h.bant].c) : PAL.mut2 }}>{BANT[h.bant]?.l || "—"}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: PAL.mut2 }}>{fmtTime(h.ts)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%),1fr))", gap: SP.s }}>
                <KV2 k="Zincir" v={<span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs }}>SHA-256 · {zincir.length || "—"} adım <Icon.check /></span>} c={DERIN.yesil} />
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
  <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m }}>
    <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{k}</span>
    <span style={{ fontFamily: MONO, fontSize: 12, color: c, textAlign: "right" }}>{v}</span>
  </div>
);
