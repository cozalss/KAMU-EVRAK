/* IslenenEvrakView — işlenen TÜM evrakların arşivi (oturum + DB geçmişi = history).
   Kurgu: Panel "İşlenen evrak" sayacının gerçek listesi. Her satır işlemin karar durumunu
   taşır (karar bekliyor / onaylandı / reddedildi / düzenlenerek gönderildi / işlendi);
   detay modalı özet + taslak metnini gösterir. Karar bekleyen işlemler buradan Taslaklar'a
   (tek düzenleme yüzeyi) hedefli gider — taslak DÜZENLEME burada yapılmaz, kurgu ayrımı:
   İşlenen = arşiv/izleme, Taslaklar = çalışma kuyruğu, Giden = gönderilmiş arşiv. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, Btn, EmptyState, KV, Icon, MONO, PAL, BANT, TYPE, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing, odakDongusu } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

/* Karar durumu tek sözlükten türetilir — Panel "Karar bekleyen" ve DashboardApp
   draftsFromHistory ile AYNI süzgeç (taslak var + karar yok = bekliyor). */
const durumOf = (r) =>
  r?.onay_durumu === "onaylandi" ? "onaylandi"
    : r?.onay_durumu === "reddedildi" ? "reddedildi"
      : r?.onay_durumu === "duzenlendi" ? "duzenlendi"
        : r?.yazi_taslak_md ? "bekliyor" : "islendi";

const DURUM_TR = {
  bekliyor: "Karar bekliyor",
  onaylandi: "Onaylandı · gönderildi",
  reddedildi: "Reddedildi",
  duzenlendi: "Düzenlenerek gönderildi",
  islendi: "İşlendi · taslak üretilmedi",
};
const DURUM_RENK = {
  bekliyor: BANT.sari.c,
  onaylandi: BANT.yesil.c,
  reddedildi: BANT.kirmizi.c,
  duzenlendi: BANT.yesil.c,
  islendi: null,   // nötr — renk yoksa gri nokta/metin (renk tek sinyal değil, metin ayırt eder)
};

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Evrak adı, konu…", fuzzy: true },
  chips: [
    { id: "risk", label: "Risk", options: [
      { value: "yesil", label: "Yeşil · Düşük", color: BANT.yesil.c },
      { value: "sari", label: "Sarı · Orta", color: BANT.sari.c },
      { value: "kirmizi", label: "Kırmızı · Yüksek", color: BANT.kirmizi.c },
    ] },
    { id: "durum", label: "Karar", options: [
      { value: "bekliyor", label: "Karar bekliyor", color: BANT.sari.c },
      { value: "onaylandi", label: "Onaylandı", color: BANT.yesil.c },
      { value: "duzenlendi", label: "Düzenlenerek", color: BANT.yesil.c },
      { value: "reddedildi", label: "Reddedildi", color: BANT.kirmizi.c },
    ] },
  ],
  select: [
    { id: "tur", label: "Evrak türü", options: [] },
    { id: "birim", label: "Hedef birim", options: [] },
  ],
  dateRange: { enabled: true, label: "İşlem tarihi" },
  datePresets: { enabled: true },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
    { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu"], risk: "bant", durum: "_durum", tur: "evrak_turu", birim: "hedef_birim", dateField: "ts" },
};

/* Detay modalı — GidenEvrakView.DetayModal ile aynı erişilebilirlik iskeleti (odak
   yakalama + Escape + odağın tetikleyene dönüşü caller'da). Karar bekleyen işlemde tek
   primary eylem: taslağı Taslaklar'da (tek düzenleme yüzeyi) açmak. */
function DetayModal({ item, onClose, onDuzenle }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!item) return null;
  const r = item.result || {};
  const ozet = cleanDemoText(r.ozet || "").replace(/\*\*/g, "");
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl }}>
      <div role="dialog" aria-modal="true" aria-labelledby="islenen-modal-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.xl, boxShadow: SH.modal }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.l, marginBottom: SP.l }}>
          <div>
            <h2 id="islenen-modal-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{cleanDemoText(item.konu) || item.name}</h2>
            <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{item.name}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" {...focusRing}
            style={{ cursor: "pointer", flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.hov, color: PAL.ink2, padding: 0 }}>
            <Icon.x />
          </button>
        </div>
        <div style={{ marginBottom: SP.l }}>
          <KV k="Evrak türü" v={EVRAK_TR(item.evrak_turu)} />
          {r.yazi_turu && <KV k="Üretilen yazı türü" v={YAZI_TR(r.yazi_turu)} />}
          <KV k="Hedef birim" v={BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)} c={DERIN.V} />
          <KV k="Sınıflandırma güveni" v={fmtGuven(r.tur_confidence) || "—"} c={r.tur_confidence >= 0.5 ? DERIN.T : PAL.mut2} />
          <KV k="Risk bandı" v={BANT[item.bant]?.l || "—"} c={DERIN_OF(BANT[item.bant]?.c)} />
          <KV k="Karar durumu" v={DURUM_TR[item._durum]} c={DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut2} />
          {r.sla_metadata?.durum && <KV k="Yasal süre" v={r.sla_metadata.durum === "GECIKMIS" ? "Gecikmiş" : r.sla_metadata.durum === "KRITIK" ? "Kritik" : "Normal takvim"} c={r.sla_metadata.durum === "GECIKMIS" ? DERIN.kirmizi : r.sla_metadata.durum === "KRITIK" ? DERIN.sari : DERIN.yesil} />}
          <KV k="İşlem tarihi" v={fmtTime(item.ts)} />
          {r.islem_id && <KV k="İşlem kimliği" v={String(r.islem_id).slice(0, 22)} />}
        </div>
        {ozet && (
          <p style={{ margin: `0 0 ${SP.l}px`, ...TYPE.data, color: PAL.ink2, background: ALFA(PAL.mut3), borderRadius: RAD.card, padding: SP.l }}>{ozet}</p>
        )}
        {r.yazi_taslak_md && (
          <pre style={{ margin: 0, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cleanDemoText(r.yazi_taslak_md)}</pre>
        )}
        {item._durum === "bekliyor" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: SP.l }}>
            <Btn primary onClick={() => { onClose(); onDuzenle(item); }} ariaLabel={`${item.name} taslağını Taslaklar'da düzenle`}>
              <Icon.edit /> Taslaklar'da düzenle
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IslenenEvrakView({ history = [], onGoInbox, onUpload, onDuzenle = () => {} }) {
  const [detay, setDetay] = useState(null);
  const triggerRef = useRef(null);   // modal kapanınca odak tetikleyen butona döner (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  // Filtre alanları üst seviyeye düzleştirilir (useFilter dataMapping düz alan okur).
  const items = useMemo(() => history.map((h) => ({
    ...h,
    _durum: durumOf(h.result),
    konu: h.result?.bilgi_unsurlari?.konu || h.result?.alt_talepler?.[0]?.ozet || "",
  })), [history]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(items, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(items, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [items]);
  const filter = useFilter(items, config);
  const bekleyen = items.filter((x) => x._durum === "bekliyor").length;

  if (history.length === 0) {
    return (
      <ViewWrap id="islenen-h" title="İşlenen evrak" sub="Bu oturumda ve önceki oturumlarda işlenen tüm evraklar">
        <EmptyState icon={<Icon.shield />} title="Henüz evrak işlenmedi"
          sub="Gelen evrak kuyruğundan bir evrak seçtiğinizde ya da yeni bir belge yüklediğinizde, işlenen her evrak karar durumuyla birlikte burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="islenen-h" title="İşlenen evrak"
      sub={`${history.length} evrak işlendi${bekleyen ? ` · ${bekleyen} karar bekliyor` : ""}`}
      actions={[<Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.shield />} title="Eşleşen evrak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
          {filter.results.map((item) => {
            const drenk = DURUM_RENK[item._durum];
            const riskC = BANT[item.bant]?.c;
            const guven = fmtGuven(item.result?.tur_confidence);
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: drenk || PAL.mut3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(item.konu) || item.name}</span>
                  <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: SP.xs, display: "flex", gap: SP.s, flexWrap: "wrap", alignItems: "center" }}>
                    <span>{item.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{EVRAK_TR(item.evrak_turu)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)}</span>
                    {guven && <><span aria-hidden="true">·</span><span>güven {guven}</span></>}
                    <span aria-hidden="true">·</span>
                    <span style={{ fontFamily: MONO, fontSize: 12 }}>{fmtTime(item.ts)}</span>
                  </div>
                </div>
                <span style={{ ...TYPE.meta, color: drenk ? DERIN_OF(drenk) : PAL.mut2, flexShrink: 0 }}>{DURUM_TR[item._durum]}</span>
                <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: riskC ? ALFA(riskC) : PAL.hov, color: riskC ? DERIN_OF(riskC) : PAL.mut2 }}>{BANT[item.bant]?.l || "—"}</span>
                <Btn onClick={(e) => { triggerRef.current = e.currentTarget; setDetay(item); }} ariaLabel={`${item.konu || item.name} detayını görüntüle`}>Görüntüle</Btn>
              </div>
            );
          })}
        </div>
      )}

      <DetayModal item={detay} onClose={closeDetay} onDuzenle={onDuzenle} />
    </ViewWrap>
  );
}
