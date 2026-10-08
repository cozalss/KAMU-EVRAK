/* MevzuatDizin — Mevzuat görünümünün tipografik DİZİNİ ve madde-içi (derin) arama sonucu
   (MevzuatView.jsx'ten ayrıldı: o dosya 800 satır sınırına dayanmıştı).

   Dizin = kitabın içindekiler sayfası: sıra no · konu · noktalı kılavuz · adet. Tur 8: arama
   sürerken dizin KATALOG adetini değil İSABET / TOPLAM'ı yazar ("2 / 27"); isabeti olmayan konu
   sönükleşir — memur hangi konuda sonuç olduğunu dizinden okur. Madde içinde (derin) aramada
   da dizin görünür kalır ve konu başına eşleşen madde sayısını gösterir. */
import { useState } from "react";
import { motion } from "motion/react";
import { Icon, MONO, DISPLAY, T, V, BANT, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, focusRing } from "./neonUi.jsx";
import { vurguParcala } from "../lib/mevzuatVurgu.js";
import { snippetAyristir } from "../lib/mevzuatSnippet.js";

function Vurgulu({ metin, q }) {
  return vurguParcala(metin, q).map((p, i) => (p.vurgu ? <mark key={i} className="mv-vurgu">{p.metin}</mark> : p.metin));
}

function DizinOge({ ad, adet, toplam = null, sira, aktif, onSec }) {
  const sonuk = toplam != null && adet === 0 && !aktif;
  return (
    <li style={{ position: "relative", minWidth: 0 }}>
      {aktif && <motion.span layoutId="mv-dizin-imlec" className="mv-dizin-imlec" aria-hidden="true"
        transition={{ type: "spring", stiffness: 520, damping: 40 }}
        style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: T }} />}
      <button type="button" onClick={onSec} aria-pressed={aktif} {...focusRing} data-press="" className="mv-dizin-oge"
        aria-label={toplam != null ? `${ad}: ${adet} isabet, ${toplam} kaynak` : undefined}
        style={{ display: "flex", alignItems: "last baseline", gap: SP.s, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", border: "none",
          background: aktif ? ALFA(T) : "transparent", borderRadius: RAD.chip, padding: "6px 10px 6px 14px", color: "inherit", font: "inherit",
          opacity: sonuk ? 0.45 : 1, transition: "background .12s ease-out, opacity .14s ease-out" }}>
        <span className="mv-dizin-sira" style={{ alignSelf: "first baseline", fontFamily: MONO, fontSize: 11, color: aktif ? DERIN.T : PAL.mut3, minWidth: 18, ...TNUM }}>{sira}</span>
        <span className="mv-dizin-ad" style={{ ...TYPE.data, fontWeight: aktif ? 600 : 500, color: aktif ? PAL.ink : PAL.ink2, minWidth: 0, textWrap: "balance", transition: "color .12s ease-out" }}>{ad}</span>
        <span className="mv-dizin-kilavuz" aria-hidden="true" style={{ flex: 1, minWidth: 8, alignSelf: "flex-end", marginBottom: 4, borderBottom: `1px dotted ${PAL.lineHi}` }} />
        <span aria-hidden={toplam != null ? "true" : undefined} style={{ fontFamily: MONO, fontSize: 11.5, whiteSpace: "nowrap", color: aktif ? DERIN.T : PAL.mut, ...TNUM }}>
          {toplam != null ? <><span style={{ color: adet ? (aktif ? DERIN.T : PAL.ink) : PAL.mut3, fontWeight: adet ? 600 : 400 }}>{adet}</span><span style={{ color: PAL.mut3 }}> / {toplam}</span></> : adet}
        </span>
      </button>
    </li>
  );
}

function DizinDip({ cekirdekSayi }) {
  return (
    <div className="mv-dizin-dip" style={{ marginTop: SP.l, padding: `${SP.m}px 0 0 14px`, borderTop: `1px solid ${PAL.line}`, display: "grid", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        <span aria-hidden="true" style={{ width: 10, height: 14, background: ALFA(T), boxShadow: `inset 3px 0 0 ${T}`, borderRadius: 2 }} />
        Çekirdek mevzuat · {cekirdekSayi}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 11, color: PAL.mut3, textDecoration: "line-through", textDecorationThickness: 2, ...TNUM }}>1111</span>
        Mülga (yürürlükte değil)
      </span>
      <span style={{ display: "flex", alignItems: "flex-start", gap: SP.s, textWrap: "pretty" }}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 10, height: 10, marginTop: 3, borderRadius: 2, background: ALFA(BANT.sari.c), boxShadow: `inset 0 0 0 1px ${BANT.sari.c}` }} />
        Metnin niteliği (lafzî / madde özeti) okuma penceresinde yazar; özet metin hukuki atıf için yeterli değildir.
      </span>
    </div>
  );
}

/* isabet: Map<kategori, n> | null — null ise katalog adetleri (arama yok). birim: başlık sağı. */
export function Dizin({ kategoriler, kategoriAdet, toplam, kategori, setKategori, cekirdekSayi, isabet = null, birim = "ADET" }) {
  const toplamIsabet = isabet ? [...isabet.values()].reduce((a, b) => a + b, 0) : null;
  // Sorgu varken isabetsiz bölümler tek satıra katlanır (tur 9 jüri: 15 sönük tam boy satır
  // dizini gürültüye çeviriyordu). Seçili bölüm isabetsiz olsa da görünür kalır.
  const [acik, setAcik] = useState(false);
  const tum = kategoriler.map((ad, i) => ({ ad, i }));
  const isabetli = ({ ad }) => !isabet || (isabet.get(ad) || 0) > 0 || kategori === ad;
  const gorunen = acik ? tum : tum.filter(isabetli);
  const katlanan = isabet ? tum.filter((x) => !isabetli(x)).length : 0;
  return (
    <nav aria-label="Kategori dizini" className="mv-dizin">
      <div className="mv-dizin-baslik" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.s, padding: `0 0 ${SP.s}px 14px`, borderBottom: `1px solid ${PAL.ink}`, marginBottom: SP.s }}>
        DİZİN<span style={{ marginLeft: "auto" }}>{isabet ? `İSABET / ${birim}` : birim}</span>
      </div>
      <div role="group" aria-label="Kategori filtresi">
        <ol className="mv-dizin-liste" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 1 }}>
          <DizinOge ad="Tüm mevzuat" adet={isabet ? toplamIsabet : toplam} toplam={isabet ? toplam : null} sira="—" aktif={!kategori} onSec={() => setKategori("")} />
          {gorunen.map(({ ad, i }) => (
            <DizinOge key={ad} ad={ad} sira={String(i + 1).padStart(2, "0")} aktif={kategori === ad}
              adet={isabet ? (isabet.get(ad) || 0) : (kategoriAdet.get(ad) || 0)} toplam={isabet ? (kategoriAdet.get(ad) || 0) : null}
              onSec={() => setKategori(kategori === ad ? "" : ad)} />
          ))}
          {katlanan > 0 && (
            <li>
              <button type="button" onClick={() => setAcik((a) => !a)} aria-expanded={acik} {...focusRing} data-press="" className="mv-dizin-oge"
                style={{ display: "flex", alignItems: "baseline", gap: SP.s, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", border: "none", background: "transparent", borderRadius: RAD.chip, padding: "6px 10px 6px 14px", color: PAL.mut2, ...TYPE.meta }}>
                <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, minWidth: 18 }}>{acik ? "−" : "+"}</span>
                <span style={{ flex: 1 }}>{acik ? "İsabetsiz bölümleri gizle" : `Diğer ${katlanan} bölüm`}</span>
                {!acik && <span style={{ fontFamily: MONO, fontSize: 11.5, color: PAL.mut3, ...TNUM }}>0</span>}
              </button>
            </li>
          )}
        </ol>
      </div>
      <DizinDip cekirdekSayi={cekirdekSayi} />
    </nav>
  );
}

/* Derin arama sonucu — madde alıntısı: sırtta madde no (mühür moru), sağda kanun künyesi,
   madde BAŞLIĞI kalın ayrı satır, gövde alıntı rengi. Kartın tamamı bağlantı (tekrarlanan
   "Maddeye git" kaldırıldı, tur 8); ok yalnız hover/odakta belirir. */
export function DerinSonucSatir({ s, onAc, sira = 0, q = "" }) {
  const { baslik, govde } = snippetAyristir(s.snippet);
  return (
    <button type="button" onClick={() => onAc({ dosya: s.dosya, maddeNo: s.madde_no ?? null, maddeTur: s.madde_tur ?? null, sorgu: q })}
      aria-haspopup="dialog" {...focusRing} data-press="" className="mv-kart"
      style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", width: "100%", textAlign: "left", padding: 0, overflow: "hidden", borderRadius: RAD.card, background: PAL.surf,
        border: `1px solid ${PAL.line}`, cursor: "pointer", color: "inherit", font: "inherit", animation: sira < 6 ? `nu-rise .28s var(--ke-ease-out) ${sira * 18}ms backwards` : "none" }}>
      <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: `${SP.m + 2}px ${SP.s}px ${SP.m}px ${SP.m + 2}px`, background: ALFA(V), borderRight: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.antet, fontSize: 9.5, color: DERIN.V }}>{s.madde_tur === "ek" ? "EK" : s.madde_tur === "gecici" ? "GEÇİCİ" : "MADDE"}</span>
        <span className="mv-no" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: "30px", fontStretch: "100%", letterSpacing: "-.03em", color: DERIN.V, ...TNUM }}>{s.madde_no ?? "§"}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: SP.xs, padding: `${SP.m + 2}px ${SP.l}px ${SP.m}px`, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: "16px", color: PAL.mut2 }}>
          {s.no && <span style={{ fontWeight: 600, color: DERIN.T, flexShrink: 0 }}>{s.no}</span>}
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{s.baslik}</span>
          <span className="mv-ok" style={{ marginLeft: "auto", display: "inline-flex", color: DERIN.T, flexShrink: 0 }}><Icon.arrow width={14} height={14} /></span>
        </span>
        {baslik && <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Vurgulu metin={baslik} q={q} /></span>}
        <span style={{ ...TYPE.data, color: PAL.mut, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Vurgulu metin={govde} q={q} /></span>
      </span>
    </button>
  );
}
