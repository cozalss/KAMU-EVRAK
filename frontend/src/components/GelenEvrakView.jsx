/* GelenEvrakView — işlenecek evrak kuyruğu + kapsamlı filtre (arama/kategori/grup/sıralama).
   Örnek evraklar "gelen evrak"; tıkla → İşleniyor'da uçtan-uca işlenir.
   Kategori operasyonel gruplama için TÜRETİLİR (lib/kategori); güven/tarih işleme sonucu
   oluştuğundan kuyrukta boştur (durum "Yeni" / işlenmişse "İşlendi"). */
import React, { useMemo } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, SANS, T, V, PAL } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter } from "../hooks/useFilter.js";
import { evrakKategori, kategoriMeta, KATEGORILER, KATEGORI_BIRIM } from "../lib/kategori.js";
import { BIRIM_LBL } from "./result-cards.jsx";

const GRUP_RENK = { "Vatandaş": T, "Kurum": "#5b8cff", "Hukuk/Mali": V };
const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

const GELEN_FILTER_CONFIG = {
  search: { enabled: true, placeholder: "Evrak adı, açıklama…" },
  chips: [{ id: "grup", label: "Grup", options: [
    { value: "Vatandaş", label: "Vatandaş", color: T },
    { value: "Kurum", label: "Kurum", color: "#5b8cff" },
    { value: "Hukuk/Mali", label: "Hukuk/Mali", color: V },
  ] }],
  select: [{ id: "kategori", label: "Kategori", options: KATEGORI_SELECT }],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "Kuyruk sırası" },
    { value: "name_asc", label: "Ad (A→Z)" },
    { value: "name_desc", label: "Ad (Z→A)" },
  ] },
  dataMapping: { search: ["label", "aciklama"], grup: "grup", kategori: "_kategori" },
};

export default function GelenEvrakView({ samples = [], processedIds, onProcess, onUpload, busy }) {
  const done = processedIds || new Set();
  // Her örneğe operasyonel kategori türet (id ≈ evrak türü + metin anahtar sözcükleri).
  const items = useMemo(() => samples.map((s) => ({
    ...s, _kategori: s._kategori || evrakKategori({ evrak_turu: s.id, text: s.text }),
  })), [samples]);
  const filter = useFilter(items, GELEN_FILTER_CONFIG);

  return (
    <ViewWrap id="gelen-h" title="Gelen Evrak" sub={`${samples.length} evrak kuyrukta · işlemek için seçin`}
      actions={[<Btn key="u" primary onClick={onUpload} disabled={busy}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <FilterBar config={GELEN_FILTER_CONFIG} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.inbox />} title="Eşleşen evrak yok"
          sub="Arama veya filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filter.results.map((s) => {
            const idx = samples.indexOf(samples.find((x) => x.id === s.id));
            const isDone = done.has(s.id);
            const renk = GRUP_RENK[s.grup] || T;
            const kat = kategoriMeta(s._kategori);
            const onerilenBirim = BIRIM_LBL(KATEGORI_BIRIM[s._kategori] || "yazi_isleri_evrak");
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: renk + "18", color: renk, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{String(idx + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: PAL.ink2 }}>{s.label}</span>
                    {/* Kategori rozeti (operasyonel) */}
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".3px", padding: "2px 7px", borderRadius: 6, background: kat.color + "1c", color: kat.color, border: `1px solid ${kat.color}3a` }}>{kat.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 8px", borderRadius: 7, background: renk + "1a", color: renk }}>{s.grup || "Evrak"}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 8px", borderRadius: 7, background: isDone ? "rgba(52,211,153,.14)" : "rgba(124,180,255,.14)", color: isDone ? "#7ff0c4" : "#aec6ff" }}>{isDone ? "İşlendi ✓" : "Yeni"}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{s.aciklama}</span>
                    <span aria-hidden="true" style={{ color: PAL.mut3 }}>· önerilen birim: {onerilenBirim}</span>
                  </div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut3, flexShrink: 0 }}>E-2026/{String(idx + 1).padStart(4, "0")}</span>
                <Btn accent={renk} primary={!isDone} onClick={() => onProcess(s)} disabled={busy} ariaLabel={`${s.label} evrakını işle`}>
                  {isDone ? "Yeniden işle" : "İşle"} <Icon.arrow />
                </Btn>
              </div>
            );
          })}
        </div>
      )}

      <NeonCard accent="#5b8cff" style={{ marginTop: 18 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, color: PAL.mut2, lineHeight: 1.6 }}>
          Gelen evrak kuyruğu örnek evraklarla hazır gelir. <strong style={{ color: "#aec6ff" }}>EBYS / KEP</strong> entegrasyonunda gelen evrak otomatik düşer; güven skoru, sisteme geliş ve son işlem tarihleri işleme anında oluşur.
        </p>
      </NeonCard>
    </ViewWrap>
  );
}
