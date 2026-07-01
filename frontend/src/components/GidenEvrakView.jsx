/* GidenEvrakView — onaylanıp gönderilen resmî yazıların arşivi + en zengin filtre
   (arama/risk/durum çip + tür/birim select + tarih + sıralama) + detay modalı.
   outbox: DashboardApp session state (Onayla&Gönder → giden evrak). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, KV, Icon, MONO, SANS, T, V, PAL, BANT } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta, KATEGORILER } from "../lib/kategori.js";

const DURUM_TR = { gonderildi: "Gönderildi", reddedildi: "Reddedildi", duzenlendi: "Düzenlenerek gönderildi" };
const DURUM_RENK = { gonderildi: BANT.yesil.c, reddedildi: BANT.kirmizi.c, duzenlendi: BANT.sari.c };
const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
// "bugün" / "N gün önce" (gönderim üstünden geçen süre).
const gecenSure = (ts) => {
  const gun = Math.floor((Date.now() - Number(ts || 0)) / 86400000);
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
    { id: "sla", label: "Yasal süre", options: [
      { value: "GECIKMIS", label: "Süresi geçmiş", color: BANT.kirmizi.c },
      { value: "KRITIK", label: "Süre yaklaşıyor", color: BANT.sari.c },
    ] },
  ],
  select: [
    { id: "kategori", label: "Kategori", options: KATEGORI_SELECT },
    { id: "tur", label: "Yazı Türü", options: [] },
    { id: "birim", label: "Alıcı Birim", options: [] },
  ],
  dateRange: { enabled: true, label: "Gönderim Tarihi" },
  datePresets: { enabled: true },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski bekleyenler" },
    { value: "risk_desc", label: "Risk (yüksek→düşük)" }, { value: "birim_asc", label: "Birim (A→Z)" },
  ] },
  dataMapping: { search: ["konu", "kaynak_evrak_adi", "id"], risk: "risk", durum: "durum", sla: "sla_durum", kategori: "_kategori", tur: "tur", birim: "alici_birim", dateField: "gonderim_tarihi" },
};

function DetayModal({ item, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!item) return null;
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(35,26,18,.35)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="giden-modal-h" onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: "#ffffff", border: `1px solid ${PAL.lineHi}`, borderRadius: 16, padding: "22px 24px", boxShadow: "0 30px 70px -20px rgba(35,26,18,.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 14 }}>
          <div>
            <h2 id="giden-modal-h" style={{ margin: 0, fontFamily: SANS, fontSize: 18, fontWeight: 600, color: PAL.ink }}>{item.id}</h2>
            <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 12, color: PAL.mut2 }}>{cleanDemoText(item.konu)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 9, border: `1px solid ${PAL.lineHi}`, background: "rgba(35,26,18,.04)", color: PAL.ink2, fontFamily: MONO, fontSize: 13 }}>✕</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <KV k="Kaynak evrak" v={item.kaynak_evrak_adi} />
          <KV k="Kategori" v={kategoriMeta(item._kategori).label} c={kategoriMeta(item._kategori).color} />
          <KV k="Evrak türü" v={EVRAK_TR(item.evrak_turu)} />
          <KV k="Yazı türü" v={item.tur ? YAZI_TR(item.tur) : "—"} />
          <KV k="Önerilen / alıcı birim" v={BIRIM_LBL(item.alici_birim)} c="#6a4787" />
          <KV k="Sınıflandırma güveni" v={fmtGuven(item.guven) || "—"} c={item.guven >= 0.5 ? "#1f6d82" : PAL.mut2} />
          <KV k="Risk bandı" v={BANT[item.risk]?.l || "—"} c={BANT[item.risk]?.c} />
          <KV k="Durum" v={DURUM_TR[item.durum] || item.durum} c={DURUM_RENK[item.durum]} />
          {item.sla_durum && <KV k="Yasal süre" v={item.sla_durum === "GECIKMIS" ? "Süresi geçmiş" : item.sla_durum === "KRITIK" ? "Süre yaklaşıyor" : item.sla_durum} c={item.sla_durum === "GECIKMIS" ? BANT.kirmizi.c : item.sla_durum === "KRITIK" ? BANT.sari.c : PAL.mut2} />}
          {item.evrak_tarihi && <KV k="Evrak / dilekçe tarihi" v={item.evrak_tarihi} />}
          <KV k="Gönderen memur" v={`${item.memor_adi} · ${item.memor_unvan}`} />
          <KV k="Gönderim tarihi" v={fmtTime(item.gonderim_tarihi)} />
          {item.son_hash && <KV k="Denetim hash" v={String(item.son_hash).slice(0, 22) + "…"} c="#1f7a52" />}
        </div>
        {item.taslak && (
          <pre style={{ margin: 0, background: "#ffffff", border: `1px solid ${PAL.line}`, borderRadius: 10, padding: "16px 18px", fontFamily: MONO, fontSize: 11, color: "#3a4252", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{cleanDemoText(item.taslak)}</pre>
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
      <ViewWrap id="giden-h" title="Giden Evrak" sub="Onaylanıp gönderilen resmî yazılar">
        <EmptyState icon={<Icon.arrow />} title="Henüz gönderilen evrak yok"
          sub="Bir evrakı işleyip İşleniyor görünümünde 'Onayla & Gönder' dediğinizde, üretilen resmî yazı buraya — değiştirilemez denetim iziyle — düşer."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="giden-h" title="Giden Evrak" sub={`${outbox.length} evrak · ${gonderildi} gönderildi`}
      actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.arrow />} title="Eşleşen evrak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filter.results.map((item) => {
            const drenk = DURUM_RENK[item.durum] || PAL.mut2;
            const kat = kategoriMeta(item._kategori);
            const guven = fmtGuven(item.guven);
            const gecikmis = item.sla_durum === "GECIKMIS";
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${drenk}` }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: drenk, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, flexShrink: 0, minWidth: 96 }}>{item.id}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(item.konu)}</span>
                    {/* Kategori rozeti (operasyonel gruplama) */}
                    <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9, letterSpacing: ".3px", padding: "2px 7px", borderRadius: 6, background: kat.color + "1c", color: kat.color, border: `1px solid ${kat.color}3a` }}>{kat.label}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut3, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span>{item.kaynak_evrak_adi}</span>
                    <span aria-hidden="true">·</span>
                    <span>{gecenSure(item.gonderim_tarihi)}</span>
                    {guven && <><span aria-hidden="true">·</span><span>güven {guven}</span></>}
                    {gecikmis && <span style={{ color: BANT.kirmizi.c }}>· süresi geçmiş</span>}
                  </div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 8px", borderRadius: 7, background: "rgba(139,92,176,.14)", color: "#6a4787", flexShrink: 0 }}>{BIRIM_LBL(item.alici_birim)}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 8px", borderRadius: 7, background: (BANT[item.risk]?.c || PAL.mut2) + "22", color: BANT[item.risk]?.c || PAL.mut2, flexShrink: 0 }}>{BANT[item.risk]?.l || "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 8px", borderRadius: 7, background: drenk + "1a", color: drenk, flexShrink: 0 }}>{DURUM_TR[item.durum] || item.durum}</span>
                <Btn accent={T} onClick={(e) => { triggerRef.current = e.currentTarget; setDetay(item); }} ariaLabel={`${item.id} detayını görüntüle`}>Görüntüle</Btn>
              </div>
            );
          })}
        </div>
      )}

      <DetayModal item={detay} onClose={closeDetay} />
    </ViewWrap>
  );
}
