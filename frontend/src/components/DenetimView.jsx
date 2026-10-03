/* DenetimView — değiştirilemez denetim izi kayıtları. Her işlenen evrak için tamper-evident
   SHA-256 hash-zinciri (Sayıştay/KVKK uyumlu). Oturum geçmişinden (gerçek denetim_izi).
   "Antet & Damga" (2026-10): ortak sicil defteri yüzeyi (SicilDefter) — satır başına kart
   yerine hairline-ayraçlı kayıt; zincir hücresi kök→son hash'i bir mühür zinciri olarak çizer. */
import React, { useMemo } from "react";
import { ViewWrap, Btn, Icon, MONO, V, PAL, BANT, DERIN, DERIN_OF, TYPE, TNUM, RAD, SP } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR } from "./result-cards.jsx";
import { SicilStil, BaslikHucre, DefterYuzey, BosDefter, DefterNotu, DefterIskelet, DefterHata, HUCRE } from "./SicilDefter.jsx";
import { bosDurumMetni } from "../lib/sicilDefter.js";

const fmtGun = (ts) => { try { return new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return ""; } };
const fmtSaat = (ts) => { try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } };
// Hash kısaltma — baş + son (ortası "…"): iki kaydın ayırt edilmesi için iki ucu da gerekir.
const kisa = (h) => { const s = String(h || ""); return s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-5)}` : s || "—"; };
const ZINCIR_AZAMI = 9;

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

/* Defter şablonu — zaman damgası · evrak · risk · zincir. Telefonda zincir tam satır alır. */
const SABLON = {
  kolon: "118px minmax(0,1fr) 84px minmax(260px,1.1fr)",
  alan: '"zaman ana risk zincir"',
  alanDar: '"zaman risk" "ana ana" "zincir zincir"',
  marj: "148px",
  adim: "64px",
};
const BASLIKLAR = [
  <BaslikHucre key="z" alan="zaman">Zaman damgası</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Evrak · tür</BaslikHucre>,
  <BaslikHucre key="r" alan="risk">Risk</BaslikHucre>,
  <BaslikHucre key="c" alan="zincir">Hash zinciri · kök → son</BaslikHucre>,
];

/* Zincir hücresi — kök hash ─ adım halkaları ─ son hash. Halka sayısı gerçek adım sayısıdır
   (en fazla 9 çizilir, fazlası "+n"); adım bilgisi yoksa bağ kesikli çizilir — olmayan
   halkayı çizmek, doğrulanmamış bir iddia olurdu. */
function ZincirHucre({ kok, son, adim }) {
  const cizilen = Math.min(adim, ZINCIR_AZAMI);
  return (
    <span {...HUCRE.table} style={{ gridArea: "zincir", display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}
      aria-label={`SHA-256 zinciri, ${adim || "bilinmeyen sayıda"} adım; kök ${kisa(kok)}, son ${kisa(son)}`}>
      <HashJeton etiket="kök" h={kok} />
      <span aria-hidden="true" style={{ flex: 1, minWidth: 28, display: "flex", alignItems: "center", gap: 3, position: "relative", height: 12 }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: `1.5px ${adim ? "solid" : "dashed"} ${adim ? DERIN.V : PAL.lineHi}`, opacity: adim ? 0.55 : 1 }} />
        {Array.from({ length: cizilen }, (_, i) => (
          <span key={i} style={{ position: "relative", flex: "0 0 auto", width: 8, height: 8, marginLeft: i ? "auto" : 6, marginRight: i === cizilen - 1 ? 6 : 0, borderRadius: RAD.dot, border: `1.5px solid ${DERIN.V}`, background: PAL.surf }} />
        ))}
        {adim > ZINCIR_AZAMI && <span style={{ position: "relative", fontFamily: MONO, fontSize: 10, color: DERIN.V, background: PAL.surf, padding: "0 3px" }}>+{adim - ZINCIR_AZAMI}</span>}
      </span>
      <HashJeton etiket="son" h={son} vurgu />
    </span>
  );
}

const HashJeton = ({ etiket, h, vurgu }) => (
  <span title={h || ""} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, flexShrink: 0, padding: "2px 7px", borderRadius: RAD.chip,
    border: `1px solid ${vurgu ? `color-mix(in srgb, ${V} 40%, transparent)` : PAL.line}`, background: vurgu ? `color-mix(in srgb, ${V} var(--ke-alfa, 8%), transparent)` : PAL.surf2 }}>
    <span style={{ ...TYPE.antet, fontSize: 9, color: PAL.mut3, textTransform: "uppercase" }}>{etiket}</span>
    <span style={{ fontFamily: MONO, fontSize: 11, color: vurgu ? DERIN.V : PAL.ink2, ...TNUM }}>{kisa(h)}</span>
  </span>
);

export default function DenetimView({ history = [], onGoInbox, yukleniyor = false, hata = null, onYenidenDene }) {
  const kayitlar = useMemo(() => history.filter((h) => h.result?.denetim_izi && Object.keys(h.result.denetim_izi).length), [history]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [{ ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(kayitlar, "evrak_turu", EVRAK_TR)] }],
  }), [kayitlar]);
  const filter = useFilter(kayitlar, config);

  if (kayitlar.length === 0) {
    return (
      <ViewWrap id="denetim-h" title="Denetim izi" kunye="Denetim kayıt defteri" sub="Değiştirilemez işlem kayıtları (SHA-256)">
        <SicilStil />
        {yukleniyor ? <DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Denetim kayıtları yükleniyor" />
          : hata ? <DefterHata sablon={SABLON} basliklar={BASLIKLAR} baslik="Denetim defteri alınamadı" ayrinti={String(hata?.message || hata)} onYenidenDene={onYenidenDene} />
            : <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="" satir={6} baslik="Henüz mühürlenmiş kayıt yok"
              sub="İşlenen her evrak için değiştirilemez bir SHA-256 hash-zinciri oluşturulur ve bu deftere zaman damgasıyla işlenir."
              actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />}
      </ViewWrap>
    );
  }

  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "kayıt", kalici: "zincir kayıtları silinmez" });
  return (
    <ViewWrap id="denetim-h" title="Denetim izi" kunye="Denetim kayıt defteri"
      sub={`${kayitlar.length} değiştirilemez kayıt · tamper-evident SHA-256 hash-zinciri`}
      damga={{ metin: `${kayitlar.length} kayıt zincirde`, ton: V, egim: -4 }}>
      <SicilStil />
      <DefterNotu ikon={<Icon.shield width={15} height={15} />} style={{ margin: `0 0 ${SP.l}px` }}>
        Her işlem adımı bir öncekinin hash'ini içerir → tek bir kaydın değiştirilmesi tüm zinciri bozar.
        <strong style={{ color: DERIN.yesil, fontWeight: 600 }}> Sayıştay denetimi ve KVKK</strong> için kanıt niteliğindedir.
      </DefterNotu>

      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="" damga="Eşleşme yok" baslik={bos.baslik}
          sub={bos.sub} actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <DefterYuzey sablon={SABLON} basliklar={BASLIKLAR} etiket="Denetim kayıtları" rol="table" dolgu={Math.max(0, 4 - filter.results.length)}>
          {filter.results.map((h, i) => {
            const di = h.result.denetim_izi;
            const zincir = Array.isArray(di.zincir) ? di.zincir : (Array.isArray(di.adimlar) ? di.adimlar : []);
            const riskC = BANT[h.bant]?.c;
            return (
              <div key={h.id} role="row" data-sicil-satir="" style={{ "--sd-i": i, cursor: "default" }}>
                <span {...HUCRE.table} style={{ gridArea: "zaman", display: "flex", flexDirection: "column", fontFamily: MONO, ...TNUM }}>
                  <span data-sd-no-sira="" style={{ fontSize: 13, fontWeight: 600, color: PAL.ink }}>{fmtSaat(h.ts)}</span>
                  <span style={{ fontSize: 11, color: PAL.mut3 }}>{fmtGun(h.ts)}</span>
                </span>
                <span {...HUCRE.table} style={{ gridArea: "ana", minWidth: 0, display: "flex", alignItems: "center", gap: SP.s }}>
                  <span aria-hidden="true" style={{ display: "flex", color: DERIN.yesil, flexShrink: 0 }}><Icon.shield width={16} height={16} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span title={h.name} style={{ display: "block", fontFamily: MONO, fontSize: 13, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                    <span style={{ display: "block", ...TYPE.meta, color: PAL.mut }}>{EVRAK_TR(h.evrak_turu)} · SHA-256 · {zincir.length || "—"} adım</span>
                  </span>
                </span>
                <span {...HUCRE.table} style={{ gridArea: "risk", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: ".06em", color: riskC ? DERIN_OF(riskC) : PAL.mut3 }}>{BANT[h.bant]?.l || "—"}</span>
                <ZincirHucre kok={di.kok_hash} son={di.son_hash} adim={zincir.length} />
              </div>
            );
          })}
        </DefterYuzey>
      )}
    </ViewWrap>
  );
}
