/* GidenEvrakView — onaylanıp gönderilen resmî yazıların arşivi + en zengin filtre
   (arama/risk/durum çip + tür/birim select + tarih + sıralama) + detay modalı.
   outbox: DashboardApp session state (Onayla&Gönder → giden evrak). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, Btn, EmptyState, KV, Icon, MONO, PAL, BANT, TYPE, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing, odakDongusu } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta, KATEGORILER } from "../lib/kategori.js";

const DURUM_TR = { gonderildi: "Gönderildi", reddedildi: "Reddedildi", duzenlendi: "Düzenlenerek gönderildi" };
const DURUM_RENK = { gonderildi: BANT.yesil.c, reddedildi: BANT.kirmizi.c, duzenlendi: BANT.sari.c };
const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
// "bugün" / "N gün önce" — TAKVİM günü farkı (saat-tabanlı fark dün 18:00'i bugün 09:00'da
// "bugün" sayıyordu — bug avı bulgusu).
const gecenSure = (ts) => {
  const simdi = new Date(); simdi.setHours(0, 0, 0, 0);
  const o = new Date(Number(ts || 0)); o.setHours(0, 0, 0, 0);
  const gun = Math.round((simdi - o) / 86400000);
  return gun <= 0 ? "bugün" : `${gun} gün önce`;
};
const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, kaynak evrak, kayıt no…" },
  chips: [
    { id: "risk", label: "Risk", options: [
      { value: "yesil", label: "Yeşil · Düşük", color: BANT.yesil.c },
      { value: "sari", label: "Sarı · Orta", color: BANT.sari.c },
      { value: "kirmizi", label: "Kırmızı · Yüksek", color: BANT.kirmizi.c },
    ] },
    { id: "durum", label: "Durum", options: [
      { value: "gonderildi", label: "Gönderildi", color: BANT.yesil.c },
      { value: "duzenlendi", label: "Düzenlenerek", color: BANT.sari.c },
      { value: "reddedildi", label: "Reddedildi", color: BANT.kirmizi.c },
    ] },
    /* "Yasal süre" çipi KALDIRILDI (bug avı bulgusu): sla_durum yalnız oturum satırlarında
       var — DB'de GidenEvrak tablosu bu kolonu taşımıyor, /giden-evrak döndürmüyor → çip
       refresh sonrası HİÇBİR kayıtla eşleşmiyordu (ölü filtre yanıltıcı). Satır/detaydaki
       koşullu "süresi geçmiş" gösterimi kalır; kalıcı filtre için şema değişikliği gerekir. */
  ],
  select: [
    { id: "kategori", label: "Kategori", options: KATEGORI_SELECT },
    { id: "tur", label: "Yazı türü", options: [] },
    { id: "birim", label: "Alıcı birim", options: [] },
  ],
  dateRange: { enabled: true, label: "Gönderim tarihi" },
  datePresets: { enabled: true },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
    { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "birim_asc", label: "Birim (A–Z)" },
  ] },
  dataMapping: { search: ["konu", "kaynak_evrak_adi", "id"], risk: "risk", durum: "durum", sla: "sla_durum", kategori: "_kategori", tur: "tur", birim: "alici_birim", dateField: "gonderim_tarihi" },
};

function DetayModal({ item, onClose }) {
  const closeRef = useRef(null);
  // Escape dinleyicisi YALNIZ modal açıkken (bug avı bulgusu): kapalıyken de bağlı kalınca
  // arama kutusundaki Esc, odağı listedeki eski satıra çalıyordu.
  useEffect(() => {
    if (!item) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, item]);
  if (!item) return null;
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl }}>
      <div role="dialog" aria-modal="true" aria-labelledby="giden-modal-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.xl, boxShadow: SH.modal }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.l, marginBottom: SP.l }}>
          <div>
            <h2 id="giden-modal-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{item.id}</h2>
            <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{cleanDemoText(item.konu)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" {...focusRing} data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: "pointer", flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink2, padding: 0, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
            <Icon.x />
          </button>
        </div>
        <div style={{ marginBottom: SP.l }}>
          <KV k="Kaynak evrak" v={item.kaynak_evrak_adi} />
          <KV k="Kategori" v={kategoriMeta(item._kategori).label} />
          <KV k="Evrak türü" v={EVRAK_TR(item.evrak_turu)} />
          <KV k="Yazı türü" v={item.tur ? YAZI_TR(item.tur) : "—"} />
          <KV k="Önerilen / alıcı birim" v={BIRIM_LBL(item.alici_birim)} c={DERIN.V} />
          <KV k="Sınıflandırma güveni" v={fmtGuven(item.guven) || "—"} c={item.guven >= 0.5 ? DERIN.T : PAL.mut2} />
          <KV k="Risk bandı" v={BANT[item.risk]?.l || "—"} c={DERIN_OF(BANT[item.risk]?.c)} />
          <KV k="Durum" v={DURUM_TR[item.durum] || item.durum} c={DERIN_OF(DURUM_RENK[item.durum])} />
          {item.sla_durum && <KV k="Yasal süre" v={item.sla_durum === "GECIKMIS" ? "Gecikmiş" : item.sla_durum === "KRITIK" ? "Kritik" : item.sla_durum} c={item.sla_durum === "GECIKMIS" ? DERIN.kirmizi : item.sla_durum === "KRITIK" ? DERIN.sari : PAL.mut2} />}
          {item.evrak_tarihi && <KV k="Evrak / dilekçe tarihi" v={item.evrak_tarihi} />}
          <KV k="Gönderen memur" v={[item.memor_adi, item.memor_unvan].filter(Boolean).join(" · ")} />
          <KV k="Gönderim tarihi" v={fmtTime(item.gonderim_tarihi)} />
          {item.son_hash && <KV k="Denetim hash" v={String(item.son_hash).slice(0, 22) + "…"} c={DERIN.yesil} />}
        </div>
        {item.taslak && (
          <pre style={{ margin: 0, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cleanDemoText(item.taslak)}</pre>
        )}
      </div>
    </div>
  );
}

export default function GidenEvrakView({ outbox = [], onUpload, onGoInbox, onResend }) {
  const [detay, setDetay] = useState(null);
  const triggerRef = useRef(null);   // modal kapanınca odağı tetikleyen butona geri ver (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  // Her gönderiye operasyonel kategori türet (evrak türü + birim + konu) — filtre + rozet.
  const items = useMemo(() => outbox.map((o) => ({
    ...o, _kategori: o._kategori || evrakKategori({ evrak_turu: o.evrak_turu, birim: o.alici_birim, konu: o.konu }),
  })), [outbox]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      BASE_CONFIG.select[0], // kategori (statik tam liste)
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(items, "tur", YAZI_TR)] },
      { ...BASE_CONFIG.select[2], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(items, "alici_birim", BIRIM_LBL)] },
    ],
  }), [items]);
  const filter = useFilter(items, config);
  const gonderildi = outbox.filter((o) => o.durum === "gonderildi").length;

  if (outbox.length === 0) {
    return (
      <ViewWrap id="giden-h" title="Giden evrak" sub="Onaylanıp gönderilen resmî yazılar">
        <EmptyState icon={<Icon.send />} title="Henüz gönderilen evrak yok"
          sub="Bir evrakı işleyip İşleniyor görünümünde “Onayla ve gönder” dediğinizde, onayladığınız yazılar, değiştirilemez denetim iziyle birlikte burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="giden-h" title="Giden evrak" sub={`${outbox.length} evrak · ${gonderildi} gönderildi`}
      actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.send />} title="Eşleşen evrak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
          {filter.results.map((item) => {
            const drenk = DURUM_RENK[item.durum] || PAL.mut2;
            const kat = kategoriMeta(item._kategori);
            const guven = fmtGuven(item.guven);
            const gecikmis = item.sla_durum === "GECIKMIS";
            const riskC = BANT[item.risk]?.c;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
                {/* Durum: 8px düz renk noktası + sağda 12px metin (çip yerine) */}
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: drenk, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, flexShrink: 0, minWidth: 96 }}>{item.id}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(item.konu)}</span>
                  {/* Kategori + kaynak + süre + güven + birim: düz meta metin */}
                  <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: SP.xs, display: "flex", gap: SP.s, flexWrap: "wrap", alignItems: "center" }}>
                    <span>{kat.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.kaynak_evrak_adi}</span>
                    <span aria-hidden="true">·</span>
                    <span>{gecenSure(item.gonderim_tarihi)}</span>
                    {guven && <><span aria-hidden="true">·</span><span>güven {guven}</span></>}
                    <span aria-hidden="true">·</span>
                    <span>{BIRIM_LBL(item.alici_birim)}</span>
                    {gecikmis && <span style={{ color: DERIN.kirmizi }}>· süresi geçmiş</span>}
                  </div>
                </div>
                <span style={{ ...TYPE.meta, color: DERIN_OF(drenk), flexShrink: 0 }}>{DURUM_TR[item.durum] || item.durum}</span>
                {/* Tek çip: risk kodu (BANT.l uppercase istisnası — mono 12) */}
                <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: riskC ? ALFA(riskC) : PAL.hov, color: riskC ? DERIN_OF(riskC) : PAL.mut2 }}>{BANT[item.risk]?.l || "—"}</span>
                <Btn onClick={(e) => { triggerRef.current = e.currentTarget; setDetay(item); }} ariaLabel={`${item.id} detayını görüntüle`}>Görüntüle</Btn>
              </div>
            );
          })}
        </div>
      )}

      <DetayModal item={detay} onClose={closeDetay} />
    </ViewWrap>
  );
}
