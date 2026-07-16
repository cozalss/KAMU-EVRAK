/* IslenenEvrakView — işlenen TÜM evrakların arşivi (oturum + DB geçmişi = history).
   Kurgu: Panel "İşlenen evrak" sayacının gerçek listesi. Katmanlar:
   · Özet şeridi: karar durumu kırılımı TIKLANABİLİR kutucuklarla — kutucuk listeyi o
     karara filtreler (useFilter durum çipiyle aynı state, iki ayrı filtre kaynağı yok).
   · Liste: tarih sıralamasında GÜN başlıklarıyla gruplanır (Bugün/Dün/tarih); satırın
     tamamı tıklanabilir → detay modalı (künye + özet + mevzuat dayanakları + taslak).
   · Karar bekleyenler modaldan Taslaklar'a (tek düzenleme yüzeyi) hedefli gider.
   Kurgu ayrımı: İşlenen = arşiv/izleme, Taslaklar = çalışma kuyruğu, Giden = gönderilmiş. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { ViewWrap, Btn, EmptyState, KV, Icon, MONO, T, PAL, BANT, TYPE, TNUM, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing, odakDongusu } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

/* Karar durumu tek sözlükten türetilir — Panel sayaçları ve DashboardApp
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

const fmtSaat = (ts) => { try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const fmtTam = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
const fmtSure = (ms) => (Number.isFinite(ms) && ms >= 100 ? `${(ms / 1000).toFixed(1)} sn` : "");

/* Gün başlığı — arşiv taranabilirliği: "Bugün / Dün / 14 Temmuz 2026". */
const ayniGun = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function gunEtiketi(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Tarihsiz";
  const bugun = new Date();
  if (ayniGun(d, bugun)) return "Bugün";
  const dun = new Date(bugun); dun.setDate(bugun.getDate() - 1);
  if (ayniGun(d, dun)) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

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

/* Özet şeridi kutucuğu — sayaç + etiket; TIKLANINCA listeyi o karara filtreler (durum
   çipiyle aynı state → çip ve kutucuk hep senkron). aria-pressed filtre durumunu söyler. */
function DurumKutu({ label, value, renk, aktif, onClick }) {
  const sifir = value === 0;
  const vurgu = renk || T;
  return (
    <button type="button" onClick={onClick} aria-pressed={aktif}
      aria-label={`${label}: ${value} evrak${aktif ? " — filtre açık" : ""}`} {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(vurgu) : PAL.surf; }}
      style={{ cursor: "pointer", textAlign: "left", padding: `${SP.m}px ${SP.l}px`, borderRadius: RAD.card,
        background: aktif ? ALFA(vurgu) : PAL.surf, border: `1px solid ${aktif ? vurgu : PAL.line}`,
        transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
      <span style={{ display: "block", ...TYPE.num, color: sifir ? PAL.mut3 : PAL.ink, ...TNUM }}>
        <NumberFlow value={value} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: SP.xs, marginTop: SP.xs, ...TYPE.meta, color: sifir ? PAL.mut3 : PAL.mut }}>
        {renk && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: renk, flexShrink: 0 }} />}
        {label}
      </span>
    </button>
  );
}

function OzetSeridi({ items, filter }) {
  const say = { bekliyor: 0, onaylandi: 0, duzenlendi: 0, reddedildi: 0, islendi: 0 };
  for (const x of items) say[x._durum] = (say[x._durum] || 0) + 1;
  const aktifSet = filter.filters.chips.durum || new Set();
  // "Toplam" kutusu = durum filtresini sıfırla (yalnız durum çipleri — arama/diğerleri kalır).
  const temizle = () => aktifSet.forEach((v) => filter.toggleChip("durum", v));
  const kutular = [
    { key: "bekliyor", label: "Karar bekliyor", renk: BANT.sari.c },
    { key: "onaylandi", label: "Onaylandı", renk: BANT.yesil.c },
    { key: "duzenlendi", label: "Düzenlenerek gönderildi", renk: BANT.yesil.c },
    { key: "reddedildi", label: "Reddedildi", renk: BANT.kirmizi.c },
  ];
  return (
    <div role="group" aria-label="Karar durumu kırılımı — kutucuk listeyi filtreler"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: SP.m, marginBottom: SP.l }}>
      <DurumKutu label="Toplam işlem" value={items.length} renk={null} aktif={aktifSet.size === 0} onClick={temizle} />
      {kutular.map((k) => (
        <DurumKutu key={k.key} label={k.label} value={say[k.key]} renk={k.renk}
          aktif={aktifSet.has(k.key)} onClick={() => filter.toggleChip("durum", k.key)} />
      ))}
    </div>
  );
}

/* Detay modalı — GidenEvrakView.DetayModal ile aynı erişilebilirlik iskeleti (odak
   yakalama + Escape + odağın tetikleyene dönüşü caller'da). Mevzuat dayanakları global
   okuma modalında açılır (onMevzuatAc — sayfa/moda değişmez, üstte "kağıt"). Karar
   bekleyen işlemde tek primary eylem: taslağı Taslaklar'da açmak. */
function DetayModal({ item, onClose, onDuzenle, onMevzuatAc }) {
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
  const mevzuat = (r.mevzuat_onerileri || []).slice(0, 3);
  const sure = fmtSure(r.sure_ms);
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
          {sure && <KV k="İşlem süresi" v={sure} c={DERIN.T} />}
          <KV k="İşlem tarihi" v={fmtTam(item.ts)} />
          {r.islem_id && <KV k="İşlem kimliği" v={String(r.islem_id).slice(0, 22)} />}
          {r.denetim_izi?.son_hash && <KV k="Denetim hash" v={String(r.denetim_izi.son_hash).slice(0, 22) + "…"} c={DERIN.yesil} />}
        </div>
        {ozet && (
          <p style={{ margin: `0 0 ${SP.l}px`, ...TYPE.data, color: PAL.ink2, background: ALFA(PAL.mut3), borderRadius: RAD.card, padding: SP.l }}>{ozet}</p>
        )}
        {mevzuat.length > 0 && (
          <div style={{ marginBottom: SP.l }}>
            <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: PAL.mut2 }}>Mevzuat dayanakları — tıklayınca madde metni açılır</p>
            {mevzuat.map((m, i) => (
              m.kaynak_dosya && onMevzuatAc ? (
                <button key={i} type="button" {...focusRing} data-press=""
                  onClick={() => onMevzuatAc({ dosya: m.kaynak_dosya, maddeNo: m.madde_no, maddeTur: m.madde_tur })}
                  onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left", padding: "6px 8px", background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.data, color: DERIN.T, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                  <Icon.book width={14} height={14} /> {m.baslik}
                </button>
              ) : (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 8px", ...TYPE.data, color: PAL.ink2 }}>
                  <Icon.book width={14} height={14} /> {m.baslik}
                </span>
              )
            ))}
          </div>
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

/* Tek arşiv satırı — TAMAMI tıklanabilir buton (geniş hedef); sağda karar + risk + ok. */
function IslenenSatir({ item, saatMi, onAc }) {
  const drenk = DURUM_RENK[item._durum];
  const riskC = BANT[item.bant]?.c;
  const guven = fmtGuven(item.result?.tur_confidence);
  const sure = fmtSure(item.result?.sure_ms);
  const sla = item.result?.sla_metadata?.durum;
  return (
    <button type="button" onClick={(e) => onAc(item, e.currentTarget)}
      aria-label={`${item.konu || item.name} — ${DURUM_TR[item._durum]} — detayı aç`} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
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
          {sure && <><span aria-hidden="true">·</span><span>{sure}</span></>}
          <span aria-hidden="true">·</span>
          <span style={{ fontFamily: MONO, fontSize: 12 }}>{saatMi ? fmtSaat(item.ts) : fmtTam(item.ts)}</span>
          {sla === "GECIKMIS" && <span style={{ color: DERIN.kirmizi }}>· yasal süresi geçmiş</span>}
          {sla === "KRITIK" && <span style={{ color: DERIN.sari }}>· yasal süre kritik</span>}
        </div>
      </div>
      <span style={{ ...TYPE.meta, color: drenk ? DERIN_OF(drenk) : PAL.mut2, flexShrink: 0 }}>{DURUM_TR[item._durum]}</span>
      <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: riskC ? ALFA(riskC) : PAL.hov, color: riskC ? DERIN_OF(riskC) : PAL.mut2 }}>{BANT[item.bant]?.l || "—"}</span>
      <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3, flexShrink: 0 }}><Icon.arrow width={13} height={13} /></span>
    </button>
  );
}

export default function IslenenEvrakView({ history = [], onGoInbox, onUpload, onDuzenle = () => {}, onMevzuatAc = null }) {
  const [detay, setDetay] = useState(null);
  const triggerRef = useRef(null);   // modal kapanınca odak tetikleyen satıra döner (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  const acDetay = useCallback((item, el) => { triggerRef.current = el; setDetay(item); }, []);
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

  // Gün gruplaması yalnız TARİH sıralamasında (risk/ad sıralamasında gün başlığı yanıltır).
  const tarihSirali = filter.filters.sortBy === "ts_desc" || filter.filters.sortBy === "ts_asc";
  const gruplar = useMemo(() => {
    if (!tarihSirali) return [{ etiket: null, rows: filter.results }];
    const out = [];
    for (const row of filter.results) {
      const etiket = gunEtiketi(row.ts);
      if (!out.length || out[out.length - 1].etiket !== etiket) out.push({ etiket, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  }, [filter.results, tarihSirali]);

  // Ortalama işlem süresi — başlık altında dürüst telemetri (veri yoksa yazılmaz).
  const sureler = items.map((x) => x.result?.sure_ms).filter((x) => Number.isFinite(x) && x > 0);
  const ortSn = sureler.length ? (sureler.reduce((a, x) => a + x, 0) / sureler.length / 1000).toFixed(1) : null;

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
      sub={`${history.length} evrak işlendi${ortSn ? ` · ort. işlem ${ortSn} sn` : ""}`}
      actions={[<Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <OzetSeridi items={items} filter={filter} />
      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.shield />} title="Eşleşen evrak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
          {gruplar.map((g, gi) => (
            <React.Fragment key={g.etiket || `düz-${gi}`}>
              {g.etiket && (
                <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: gi ? SP.s : 0 }}>
                  <span style={{ ...TYPE.meta, fontWeight: 600, color: PAL.mut2, flexShrink: 0 }}>{g.etiket}</span>
                  <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{g.rows.length} evrak</span>
                  <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
                </div>
              )}
              {g.rows.map((item) => <IslenenSatir key={item.id} item={item} saatMi={tarihSirali} onAc={acDetay} />)}
            </React.Fragment>
          ))}
        </div>
      )}

      <DetayModal item={detay} onClose={closeDetay} onDuzenle={onDuzenle} onMevzuatAc={onMevzuatAc} />
    </ViewWrap>
  );
}
