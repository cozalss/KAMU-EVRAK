/* TaslaklarView — KARAR BEKLEYEN taslakların çalışma kuyruğu: yalnız taslak oluşturma/
   düzenleme/gönderme (kurgu ayrımı: işlenen evrak arşivi IslenenEvrakView'da, gönderilmişler
   GidenEvrakView'da). Filtre (arama/tür/birim/sıralama); düzenleme A4 kâğıt modalında yapılır
   (BelgeModal duzenlenebilir) — kart yalnız önizler. */
import React, { useEffect, useMemo, useState } from "react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, V, PAL, BANT, DERIN, TYPE, TNUM, RAD, SP, focusRing } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { KurulModal } from "./MuzakereKurulu.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

/* Düzenlenen metni DOĞRUDAN DOCX indir (pipeline yok → /yazi/render). Gövde olduğu gibi. */
async function docxIndir(text, name, onToast) {
  if (!text.trim()) return;
  let url = "";
  try {
    const res = await fetch("/yazi/render?format=docx", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title: name || "Resmî Yazı Taslağı" }),
    });
    if (!res.ok) throw new Error(`İndirilemedi (${res.status})`);
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(name || "taslak").replace(/[^\w.-]+/g, "_")}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    onToast?.("Taslak DOCX olarak indirildi.");
  } catch (e) {
    onToast?.(e?.message || "İndirme tamamlanamadı. Lütfen tekrar deneyin.");
  } finally {
    if (url) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 1500); }
  }
}

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Taslak adı…" },
  select: [
    { id: "evrak_turu", label: "Evrak türü", options: [] },
    { id: "hedef_birim", label: "Hedef birim", options: [] },
  ],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};

const KALEM = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M14 6l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Taslak metninden KONU + gövdenin ilk anlamlı paragrafını çıkar — kart önizlemesi
   her kartta aynı olan resmî başlık kalıbını ("T.C. / KAMU KURUMU / Sayı…") tekrarlamasın,
   kartlar birbirinden ayırt edilebilsin. */
function taslakOzeti(md) {
  const temiz = cleanDemoText(md) || "";
  let konu = temiz.match(/^\s*Konu\s*:\s*(.+)$/m)?.[1]?.trim() || "";
  if (konu) konu = konu.charAt(0).toLocaleUpperCase("tr-TR") + konu.slice(1);   // başlık zarafeti
  const satirlar = temiz.split("\n");
  const konuIdx = satirlar.findIndex((s) => /^\s*Konu\s*:/.test(s));
  let govde = "";
  for (let k = konuIdx + 1; k < satirlar.length; k++) {
    const s = satirlar[k].trim();
    if (!s || /^(Sayın|Sayı\s*:|İlgi\s*:)/.test(s)) continue;   // hitap/künye satırlarını geç
    govde = satirlar.slice(k).join("\n").trim();
    break;
  }
  return { konu, govde: govde || temiz };
}

/* Sakin metin-düğme — kart altındaki eylemler (buton kutusu enflasyonu yerine). */
function KartEylem({ onClick, renk = DERIN.T, ariaLabel, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...focusRing}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "5px 10px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: renk, opacity: disabled ? 0.55 : 1, transition: "background .12s ease-out" }}>
      {children}
    </button>
  );
}
const COP = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Tek taslak kartı — başlık KONU (kartları ayırt eden bilgi), meta satırı, gövdenin ilk
   paragrafından zarif satır-kesmeli kâğıt önizleme, sakin metin-eylemler. Düzenleme yüzeyi
   TEK: ortadaki A4 kâğıt modalı (BelgeModal) — kart önizler ve tetikler. */
function DraftCard({ h, onEdit, onDelete, onSend, onKurul }) {
  const r = h.result;
  const [confirmDel, setConfirmDel] = useState(false);
  // sendBusy: /yazi/dogrula artık ağ turu içeriyor (eskiden senkron pushOutbox'tı) — koruma
  // olmadan hızlı çift tıklama aynı taslak için iki Giden Evrak kaydı açabilir.
  const [sendBusy, setSendBusy] = useState(false);
  const { konu, govde } = taslakOzeti(r.yazi_taslak_md);
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const gonder = async () => {
    if (sendBusy) return;
    setSendBusy(true);
    try { await onSend(h, r.yazi_taslak_md); } finally { setSendBusy(false); }
  };

  return (
    <NeonCard title={konu || h.name} tag={r.yazi_turu ? YAZI_TR(r.yazi_turu) : "Taslak"} accent={V} icon={<Icon.doc width={16} height={16} />}>
      <div style={{ display: "flex", gap: SP.s, alignItems: "baseline", flexWrap: "wrap", marginBottom: SP.m, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, flexShrink: 0 }}>{h.name}</span>
        <span style={{ ...TYPE.meta, color: PAL.mut3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {EVRAK_TR(r.evrak_turu)} · {BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)}
        </span>
      </div>

      {/* Kâğıt önizleme — resmî başlık kalıbı atlanır, gövdenin ilk paragrafı 4 satırda
          üç-nokta ile biter (orta satırdan sert kesilme yok). Tıkla → A4 düzenleme. */}
      <div role="button" tabIndex={0} title="Düzenle (A4 görünüm)" {...focusRing}
        onClick={() => onEdit(h.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(h.id); } }}
        style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "14px 16px", cursor: "zoom-in" }}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", ...TYPE.data, lineHeight: "20px", color: PAL.ink2, whiteSpace: "pre-line", wordBreak: "break-word" }}>
          {govde}
        </span>
      </div>

      <div style={{ display: "flex", gap: SP.xs, marginTop: SP.s, alignItems: "center" }}>
        {confirmDel ? (
          <>
            <span style={{ marginRight: "auto", ...TYPE.data, color: DERIN.kirmizi }}>Taslak silinecek. Emin misiniz?</span>
            <Btn primary accent={BANT.kirmizi.c} onClick={() => onDelete(h.id)}>Evet, sil</Btn>
            <Btn onClick={() => setConfirmDel(false)}>Vazgeç</Btn>
          </>
        ) : (
          <>
            <KartEylem onClick={() => onEdit(h.id)} ariaLabel={`${konu || h.name} taslağını düzenle`}><KALEM /> Düzenle</KartEylem>
            {/* AI Bürokrasi Kurulu — üç ajan BU taslağı gerçek doğrulama sinyalleriyle tartışır */}
            <KartEylem onClick={() => onKurul(h.id)} renk={DERIN.V} ariaLabel={`${konu || h.name} taslağı için Bürokrasi Kurulu'nu topla`}>
              <Icon.scale width={13} height={13} /> Kurulu topla
            </KartEylem>
            <KartEylem onClick={gonder} disabled={sendBusy} renk={DERIN.yesil} ariaLabel={`${konu || h.name} taslağını gönder`}>
              {sendBusy ? <><Icon.spin width={13} height={13} /> Gönderiliyor…</> : <><Icon.arrow width={13} height={13} /> Gönder</>}
            </KartEylem>
            {tarih && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM }}>{tarih}</span>}
            <KartEylem onClick={() => setConfirmDel(true)} renk={DERIN.kirmizi} ariaLabel="Taslağı sil"><COP /> Sil</KartEylem>
          </>
        )}
      </div>
    </NeonCard>
  );
}

export default function TaslaklarView({ drafts = [], onGoInbox, onUpdate = () => {}, onDelete = () => {}, onSend = () => {}, onRevize = null, onToast = () => {}, hedef = null, onHedefAcildi }) {
  // drafts: yalnız "Düzenle" ile ayrılmış taslaklar (her biri result.yazi_taslak_md taşır).
  // hedef: onay kartından "Düzenle" ile gelinen taslağın id'si → A4 düzenleme modalı doğrudan açılır.
  const [duzenleId, setDuzenleId] = useState(null);
  // "Kurulu topla" ile açılan müzakere modalının taslak id'si (koşullu render → taze açılış).
  const [kurulId, setKurulId] = useState(null);
  // KARŞILIKLI DIŞLAMA: iki modal aynı anda açılamaz — aksi halde BelgeModal'da kaydedilen
  // metnin üstüne, kurulun ESKİ result'tan türettiği uzlaşı yazılabilirdi (stale-write).
  const acDuzenle = (id) => { setKurulId(null); setDuzenleId(id); };
  const acKurul = (id) => { setDuzenleId(null); setKurulId(id); };

  // Hedefli geliş: taslak varsa modalı aç; yoksa hedefi sessizce tüket.
  useEffect(() => {
    if (!hedef) return;
    if (drafts.some((d) => d.id === hedef)) { setKurulId(null); setDuzenleId(hedef); }
    onHedefAcildi?.();
  }, [hedef, drafts, onHedefAcildi]);

  const aktif = drafts.find((d) => d.id === duzenleId) || null;
  const kurulAktif = drafts.find((d) => d.id === kurulId) || null;
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(drafts, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(drafts, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [drafts]);
  // Arama, kartta görünen KONU başlığını da taramalı (yalnız h.name yetmez — bkz. taslakOzeti).
  const aramaKaynagi = useMemo(() => drafts.map((d) => ({ ...d, konu: taslakOzeti(d.result?.yazi_taslak_md).konu })), [drafts]);
  const filter = useFilter(aramaKaynagi, config);

  if (drafts.length === 0) {
    return (
      <ViewWrap id="taslak-h" title="Taslaklar" sub="Üretilen resmî yazı taslakları">
        <EmptyState icon={<Icon.doc />} title="Henüz taslak ayrılmadı"
          sub="İşleniyor görünümündeki onay kartında “Düzenle” seçtiğinizde ya da önceki oturumlardan karar bekleyen bir taslak bulunduğunda, resmî yazı taslağı burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="taslak-h" title="Taslaklar" sub={`${drafts.length} taslak karar bekliyor · düzenleyin, kurula danışın ya da gönderin`}>
      <FilterBar config={config} filter={filter} />
      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.doc />} title="Eşleşen taslak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: SP.l, alignItems: "start" }}>
          {filter.results.map((h) => <DraftCard key={h.id} h={h} onEdit={acDuzenle} onDelete={onDelete} onSend={onSend} onKurul={acKurul} />)}
        </div>
      )}

      {/* A4 düzenleme modalı — koşullu render: kapanınca unmount, her açılış taze taslakla başlar */}
      {aktif && (
        <BelgeModal key={aktif.id} acik duzenlenebilir
          baslik="Resmî yazı taslağını düzenle" dosyaAdi={aktif.name}
          metin={cleanDemoText(aktif.result.yazi_taslak_md) || ""}
          onKapat={() => setDuzenleId(null)}
          onKaydet={(t) => { onUpdate(aktif.id, t); onToast("Taslak güncellendi."); setDuzenleId(null); }}
          onGonder={async (t) => { if (await onSend(aktif, t)) setDuzenleId(null); }}
          onIndir={(t) => docxIndir(t, aktif.name, onToast)}
          onRevize={onRevize ? (metinGuncel, talimat) => onRevize(aktif.result, metinGuncel, talimat) : null} />
      )}

      {/* AI Bürokrasi Kurulu — üç ajan seçilen taslağı gerçek pipeline sinyalleriyle tartışır;
          "Revize taslağını uygula" MEMUR kararıdır → taslağa yazılır (updateDraft yolu). */}
      {kurulAktif && (
        <KurulModal key={kurulAktif.id}
          taslakAdi={kurulAktif.name}
          result={kurulAktif.result}
          onKapat={() => setKurulId(null)}
          onUygula={(metin) => {
            onUpdate(kurulAktif.id, metin);
            onToast("Kurul revize taslağı uygulandı; taslak güncellendi.");
            setKurulId(null);
          }} />
      )}
    </ViewWrap>
  );
}
