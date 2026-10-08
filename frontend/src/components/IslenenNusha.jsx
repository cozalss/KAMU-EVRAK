/* IslenenNusha — İşlenen evrak sicil kaydının detayı: ARŞİV NÜSHASI (BelgeModal ailesi).
   Künye fişi (kâğıdın üstünde: tür, birim, karar, risk, süre, kimlik) + üretilen taslak A4
   kâğıtta + dipte denetim izi künyesi. Eski elle yazılmış KV modalı (giriş hareketi ve
   kaydırma kilidi yoktu, taslak gri <pre> kutusundaydı) kaldırıldı (jüri tur 6).
   Risk tek sözlükten: "Orta" + mono kod "SARI" yalnız künyede (lib/defterSozluk).
   Kimlikler ortadan kısalır, tam değer kopyalanır (KimlikDeger). */
import React, { useEffect, useState } from "react";
import { Icon, PAL, BANT, TYPE, RAD, SP, DERIN, DERIN_OF, focusRing } from "./neonUi.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import { GecisCip } from "./FilterBar.jsx";
import { KunyeFisi, KimlikDeger, AltKunye } from "./DefterNusha.jsx";
import { riskAdi, ortaElips, defterZamani } from "../lib/defterSozluk.js";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

export const DURUM_TR = {
  bekliyor: "Karar bekliyor",
  onaylandi: "Onaylandı · gönderildi",
  reddedildi: "Reddedildi",
  duzenlendi: "Düzenlenerek gönderildi",
  islendi: "İşlendi · taslak üretilmedi",
};
export const DURUM_RENK = { bekliyor: BANT.sari.c, onaylandi: BANT.yesil.c, reddedildi: BANT.kirmizi.c, duzenlendi: BANT.yesil.c, islendi: null };
export const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
export const fmtSure = (ms) => (Number.isFinite(ms) && ms >= 100 ? `${(ms / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn` : "");
const SLA_TR = { GECIKMIS: ["Gecikmiş", DERIN.kirmizi], KRITIK: ["Kritik", DERIN.sari] };

function MevzuatListesi({ mevzuat, onMevzuatAc }) {
  if (!mevzuat.length) return null;
  return (
    <div style={{ marginTop: SP.m }}>
      <style>{"[data-nusha-mevzuat]:hover{background:var(--ke-hov)!important}"}</style>
      <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: PAL.mut2 }}>Mevzuat dayanakları — tıklayınca madde metni açılır</p>
      {mevzuat.map((m, i) => (m.kaynak_dosya && onMevzuatAc ? (
        <button key={i} type="button" {...focusRing} data-press="" data-nusha-mevzuat=""
          onClick={() => onMevzuatAc({ dosya: m.kaynak_dosya, maddeNo: m.madde_no, maddeTur: m.madde_tur })}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left", padding: "6px 8px", background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.data, color: DERIN.T, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
          <Icon.book width={14} height={14} /> {m.gosterim_adi || m.baslik}
        </button>
      ) : (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 8px", ...TYPE.data, color: PAL.ink2 }}>
          <Icon.book width={14} height={14} /> {m.gosterim_adi || m.baslik}
        </span>
      )))}
    </div>
  );
}

/* ÖZET DERKENARI (tur 9 jüri: özet 200 px'lik künye kolonunda 18 satır akıyordu) — kâğıdın
   üstünde tam genişlikte, resmî yazıya düşülen el notu gibi: mono künye + ıstampa moru kenar. */
function OzetDerkenar({ ozet }) {
  return (
    <aside aria-label="Evrak özeti" style={{ padding: `${SP.m}px ${SP.l}px`, borderRadius: 2, background: PAL.surf, borderLeft: `3px solid ${DERIN.V}`, boxShadow: `0 0 0 1px ${PAL.line}` }}>
      <div style={{ ...TYPE.antet, fontSize: 10, color: DERIN.V, textTransform: "uppercase", marginBottom: SP.xs }}>Derkenar · özet</div>
      <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2, maxWidth: "72ch", textWrap: "pretty" }}>{ozet}</p>
    </aside>
  );
}

function kunyeSatirlari(item, aktifTur) {
  const r = item.result || {};
  const sla = SLA_TR[r.sla_metadata?.durum];
  return [
    { k: "Kaynak dosya", v: item.name ? <KimlikDeger deger={item.name} etiket="kaynak dosya adını" bas={12} son={8} /> : "" },
    { k: "Evrak türü", v: EVRAK_TR(item.evrak_turu) },
    { k: "Üretilen yazı türü", v: aktifTur ? YAZI_TR(aktifTur) : "" },
    { k: "Hedef birim", v: BIRIM_GOSTER(item.hedef_birim, item.evrak_turu), c: DERIN.V },
    { k: "Karar durumu", v: DURUM_TR[item._durum], c: DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut2 },
    // Tur 9 jüri: "Orta SARI" aynı bilgiyi iki kez veriyordu — bant kodu yalnız title'da.
    { k: "Risk bandı", v: riskAdi(item.bant) ? <span title={`Bant kodu: ${BANT[item.bant]?.l || "—"}`}>{riskAdi(item.bant)}</span> : "—", c: DERIN_OF(BANT[item.bant]?.c) },
    { k: "Sınıflandırma güveni", v: fmtGuven(r.tur_confidence) || "—" },
    { k: "Yasal süre", v: sla ? sla[0] : r.sla_metadata?.durum ? "Normal takvim" : "", c: sla ? sla[1] : DERIN.yesil },
    { k: "İşlem süresi", v: fmtSure(r.sure_ms) },
    { k: "İşlem tarihi", v: defterZamani(item.ts).tam, mono: true },
    { k: "İşlem kimliği", v: r.islem_id ? <KimlikDeger deger={r.islem_id} etiket="işlem kimliğini" /> : "" },
  ];
}

export default function IslenenNusha({ item, onClose, onDuzenle, onMevzuatAc }) {
  // Koşumda denenen yazı türleri seçenek çipleri; null = satırın son aktif türü.
  const [seciliTur, setSeciliTur] = useState(null);
  useEffect(() => { setSeciliTur(null); }, [item]);
  const r = item?.result || {};
  const varyantlar = item?.varyantlar || [];
  const aktif = varyantlar.find((v) => v.yazi_turu === (seciliTur || r.yazi_turu)) || varyantlar[0] || null;
  const aktifTur = aktif?.yazi_turu ?? r.yazi_turu;
  const aktifMd = aktif?.yazi_taslak_md ?? r.yazi_taslak_md;
  const ozet = cleanDemoText(r.ozet || "").replace(/\*\*/g, "");
  const fis = item ? (
    <KunyeFisi baslik="Sicil künyesi" satirlar={kunyeSatirlari(item, aktifTur)}>
      <MevzuatListesi mevzuat={(r.mevzuat_onerileri || []).slice(0, 3)} onMevzuatAc={onMevzuatAc} />
      {varyantlar.length > 1 && (
        <div role="group" aria-label="İşlenen yazı türleri" style={{ display: "flex", gap: SP.xs, flexWrap: "wrap", alignItems: "center", marginTop: SP.m }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2, marginRight: SP.xs }}>Nüsha:</span>
          {varyantlar.map((v) => (
            <GecisCip key={v.yazi_turu} on={v.yazi_turu === aktifTur} ariaLabel={`${YAZI_TR(v.yazi_turu)} taslağını göster`} onClick={() => setSeciliTur(v.yazi_turu)}>{YAZI_TR(v.yazi_turu)}</GecisCip>
          ))}
        </div>
      )}
    </KunyeFisi>
  ) : null;
  return (
    <BelgeModal acik={!!item} onKapat={onClose} baslik={item ? (item._konuGoster || item.name) : ""} kayitNo={item?._no || ""}
      dosyaAdi={item ? DURUM_TR[item._durum] : ""}
      metin={aktifMd ? cleanDemoText(aktifMd) : "Bu kayıt için resmî yazı taslağı üretilmedi."}
      ustIcerik={fis} cilt="Sicil" derkenar={ozet ? <OzetDerkenar ozet={ozet} /> : null}
      altKunye={item ? <AltKunye parcalar={[
        { k: "Sicil", v: item._no },
        { k: "Denetim izi", v: r.denetim_izi?.son_hash ? ortaElips(r.denetim_izi.son_hash, 10, 6) : "", tam: r.denetim_izi?.son_hash },
        { k: "İşlem", v: r.islem_id ? ortaElips(r.islem_id) : "", tam: r.islem_id },
      ]} /> : null}
      birincil={item?._durum === "bekliyor" ? (
        <ScrimDugme birincil onClick={() => { onClose(); onDuzenle(item); }} ariaLabel={`${item.name} taslağını Taslaklar'da düzenle`}>
          <Icon.edit width={13} height={13} /> Taslaklar'da düzenle
        </ScrimDugme>
      ) : null} />
  );
}
