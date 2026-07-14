/* GelenEvrakView — işlenecek evrak kuyruğu + kapsamlı filtre (arama/kategori/grup/sıralama).
   Örnek evraklar "gelen evrak"; tıkla → İşleniyor'da uçtan-uca işlenir.
   Kategori operasyonel gruplama için TÜRETİLİR (lib/kategori); güven/tarih işleme sonucu
   oluştuğundan kuyrukta boştur (durum "Yeni" / işlenmişse "İşlendi"). */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, T, PAL, BANT, TYPE, TNUM, RAD, SP, ALFA, DERIN, DERIN_OF } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter } from "../hooks/useFilter.js";
import { evrakKategori, kategoriMeta, KATEGORILER, KATEGORI_BIRIM } from "../lib/kategori.js";
import { BIRIM_LBL } from "./result-cards.jsx";

const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

// persistKey uid ile SUFFIX'lenir (bkz. çağıran) — sabit "gelen" anahtarı paylaşılan/kiosk
// tarayıcıda farklı memurlar arasında arama metni + çip/sıralama seçimini sızdırıyordu
// (authApi.tokens.clear() de bu anahtara dokunmuyordu — regresyon bulgusu).
const GELEN_FILTER_CONFIG_BASE = {
  // fuzzy: diakritik/yazım hatası affeden arama (fuse.js) — "dilekce" → "Dilekçe".
  search: { enabled: true, placeholder: "Evrak adı, açıklama…", fuzzy: true },
  chips: [{ id: "grup", label: "Grup", options: [
    { value: "Vatandaş", label: "Vatandaş" },
    { value: "Kurum", label: "Kurum" },
    { value: "Hukuk/Mali", label: "Hukuk/Mali" },
  ] }],
  select: [{ id: "kategori", label: "Kategori", options: KATEGORI_SELECT }],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "Kuyruk sırası" },
    { value: "name_asc", label: "Ad (A–Z)" },
    { value: "name_desc", label: "Ad (Z–A)" },
  ] },
  dataMapping: { search: ["label", "aciklama"], grup: "grup", kategori: "_kategori" },
};

/* Yasal süre (SLA) rozeti — backend /sla/onizleme sonucundan (compute_sla tek kaynak).
   GECİKMİŞ kırmızı, KRİTİK sarı, NORMAL yeşil; tarih okunamadıysa [DOĞRULA]; süre
   tanımsız türde rozet basılmaz (SlaTriyajCard ile aynı sessizlik kuralı). */
function SlaRozet({ sla }) {
  if (!sla || sla.durum === "tanimsiz") return null;
  if (sla.durum === "tarih_yok") {
    return <span title={sla.etiket} style={{ ...TYPE.meta, color: PAL.mut3 }}>[DOĞRULA] tarih</span>;
  }
  const renk = sla.durum === "GECIKMIS" ? BANT.kirmizi.c : sla.durum === "KRITIK" ? BANT.sari.c : BANT.yesil.c;
  const metin = sla.durum === "GECIKMIS" ? `${Math.abs(sla.kalan_gun)} gün gecikti`
    : sla.durum === "KRITIK" ? `son ${sla.kalan_gun} gün` : `${sla.kalan_gun} gün süre`;
  return (
    <span title={`${sla.etiket} — son tarih: ${sla.son_tarih || "?"} (${sla.mevzuat})`}
      style={{ ...TYPE.meta, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(renk), color: DERIN_OF(renk), ...TNUM }}>
      {metin}
    </span>
  );
}

export default function GelenEvrakView({ samples = [], processedIds, slaMap = null, onProcess, onUpload, busy, hedef = null, onHedefAcildi, uid = null }) {
  const done = processedIds || new Set();
  // Her örneğe operasyonel kategori türet (id ≈ evrak türü + metin anahtar sözcükleri).
  const items = useMemo(() => samples.map((s) => ({
    ...s, _kategori: s._kategori || evrakKategori({ evrak_turu: s.id, text: s.text }),
  })), [samples]);
  // Kayıtlı görünüm (Paperless saved-views hafif hâli) kullanıcıya özel — uid yoksa (henüz
  // yüklenmedi) kalıcılık atlanır, başka kullanıcının filtresi asla uygulanmaz.
  const filterConfig = useMemo(() => ({
    ...GELEN_FILTER_CONFIG_BASE, persistKey: uid ? `gelen-${uid}` : undefined,
  }), [uid]);
  const filter = useFilter(items, filterConfig);
  const [listeRef] = useAutoAnimate();   // filtre/işleme değişince satırlar akıcı girer-çıkar

  // Panel SLA satırından hedefli geliş: satırı görünüre kaydır + kısa süre vurgula.
  // Hedef aktif filtreye takılıysa filtreler temizlenir (bir sonraki render'da bulunur);
  // kuyruğa hiç yoksa (gönderilmiş) hedef sessizce tüketilir.
  const rowRefs = useRef(new Map());
  const [vurgu, setVurgu] = useState(null);
  useEffect(() => {
    if (!hedef) return undefined;
    const el = rowRefs.current.get(hedef);
    if (el) {
      const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      el.scrollIntoView({ behavior: az ? "auto" : "smooth", block: "center" });
      setVurgu(hedef);
      onHedefAcildi?.();
      const t = setTimeout(() => setVurgu(null), 2600);
      return () => clearTimeout(t);
    }
    if (filter.hasActiveFilters) { filter.clearAll(); return undefined; }
    onHedefAcildi?.();
    return undefined;
  }, [hedef, filter.results]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ViewWrap id="gelen-h" title="Gelen evrak" sub={`${samples.length} evrak kuyrukta · işlemek için seçin`}
      actions={[<Btn key="u" primary onClick={onUpload} disabled={busy}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <FilterBar config={GELEN_FILTER_CONFIG} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.inbox />} title="Eşleşen evrak yok"
          sub="Arama veya filtre ölçütlerinizi gevşetin." />
      ) : (
        <div ref={listeRef} style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
          {filter.results.map((s) => {
            const idx = samples.indexOf(samples.find((x) => x.id === s.id));
            const isDone = done.has(s.id);
            const kat = kategoriMeta(s._kategori);
            const onerilenBirim = BIRIM_LBL(KATEGORI_BIRIM[s._kategori] || "yazi_isleri_evrak");
            const vurgulu = vurgu === s.id;
            return (
              <div key={s.id}
                ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
                style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", borderRadius: RAD.card, background: vurgulu ? ALFA(T) : PAL.surf, border: `1px solid ${vurgulu ? T : PAL.line}`, transition: "background .3s ease-out, border-color .3s ease-out" }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: RAD.ctl, flexShrink: 0, display: "grid", placeItems: "center", background: PAL.surfHi, color: PAL.mut2, ...TYPE.data, fontWeight: 500, ...TNUM }}>{String(idx + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
                    <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{s.label}</span>
                    {/* Durum çipi (işlenme) + yasal süre rozeti (SLA önizleme) */}
                    <span style={{ ...TYPE.meta, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: isDone ? ALFA(BANT.yesil.c) : ALFA(T), color: isDone ? DERIN.yesil : DERIN.T }}>{isDone ? "İşlendi" : "Yeni"}</span>
                    <SlaRozet sla={slaMap?.[s.id]} />
                  </div>
                  {/* Kategori + grup: düz meta metin (operasyonel etiket, durum değil) */}
                  <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: SP.xs, display: "flex", gap: SP.s, flexWrap: "wrap" }}>
                    <span>{kat.label} · {s.grup || "Evrak"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{s.aciklama}</span>
                    <span aria-hidden="true" style={{ color: PAL.mut3 }}>· önerilen birim: {onerilenBirim}</span>
                  </div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, flexShrink: 0 }}>E-2026/{String(idx + 1).padStart(4, "0")}</span>
                {/* Tekrarlanan satır eylemi secondary — ekranın tek primary'si başlıktaki "Yeni evrak yükle". */}
                <Btn onClick={() => onProcess(s)} disabled={busy} ariaLabel={`${s.label} evrakını işle`}>
                  {isDone ? "Yeniden işle" : "İşle"} <Icon.arrow />
                </Btn>
              </div>
            );
          })}
        </div>
      )}

      <NeonCard style={{ marginTop: SP.l }}>
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>
          Gelen evrak kuyruğu örnek evraklarla hazır gelir. <strong style={{ color: PAL.ink2, fontWeight: 600 }}>EBYS / KEP</strong> entegrasyonunda gelen evrak otomatik düşer; güven skoru, sisteme geliş ve son işlem tarihleri işleme anında oluşur.
        </p>
      </NeonCard>
    </ViewWrap>
  );
}
