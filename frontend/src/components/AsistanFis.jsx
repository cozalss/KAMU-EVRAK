/* AsistanFis — Evrak asistanı panelinin mesaj parçaları (ChatbotWidget'tan ayrıldı).
   Asistanın her cevabı bir DANIŞMA NOTU FİŞİdir (beyaz kâğıt + hairline + ıstampa moru cilt
   çizgisi): mono künye (tür · saat) + kesikli ayraç + gövde. Bekleme hâli de AYNI fiştir
   ("Danışma notu · hazırlanıyor" + kalem iskeleti) → bekleme → akış → son hâl arasında düzen
   kayması olmaz (tur 6: "yazıyor" kutusu karelerin yarısında boştu, balon dilindeydi).
   Mevzuat kaynakları fişin altında DİPNOT olarak numaralanır (¹ 4982 · m.7) — hukuki danışma
   notunun kendi dili; her dipnot okuma modalını ilgili maddede açar. */
import React from "react";
import { mdSatirAyristir } from "../lib/mdSatir.js";
import { satirIciParcala, kayitAdi, notSaati } from "../lib/sohbetMetin.js";
import { BANT, MONO, PAL, T, V, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, Icon, Damga, focusRing } from "./neonUi.jsx";

export const GORUNUM_ETIKET = {
  gelen: "Gelen evrak", giden: "Giden evrak", taslaklar: "Taslaklar",
  mevzuat: "Mevzuat", denetim: "Denetim", panel: "Panel", islenen: "İşlenen evrak",
};
const KAYIT_TUR_ETIKET = { gelen: "Gelen", giden: "Giden", islem: "İşlem", taslak: "Taslak", mevzuat: "Mevzuat", panel: "Panel" };
const UST = ["¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/* Hafif markdown: **kalın** + *eğik* + "• / - / *" madde + "1." numaralı madde (mono rakam,
   asılı girinti) + boş satır = paragraf arası + "---" ayraç (kütüphanesiz). */
const satirIci = (metin) => satirIciParcala(metin).map((p, j) =>
  p.tip === "kalin" ? <strong key={j} style={{ fontWeight: 600, color: "inherit" }}>{p.metin}</strong>
    : p.tip === "egik" ? <em key={j} style={{ fontStyle: "italic" }}>{p.metin}</em>
      : <React.Fragment key={j}>{p.metin}</React.Fragment>);

export function Md({ text }) {
  return (text || "").split("\n").map((satir, i) => {
    const { tip, govde, no } = mdSatirAyristir(satir);
    if (tip === "hr") return <hr key={i} aria-hidden="true" style={{ border: "none", borderTop: `1px solid ${PAL.line}`, margin: `${SP.s}px 0` }} />;
    if (tip === "bos") return <span key={i} aria-hidden="true" style={{ display: "block", height: SP.s }} />;
    if (tip === "madde" || tip === "numara") {
      return (
        <span key={i} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", columnGap: SP.xs, marginTop: 2 }}>
          <span aria-hidden="true" style={tip === "numara"
            ? { fontFamily: MONO, fontSize: 12, color: DERIN.V, textAlign: "right", paddingRight: 2, ...TNUM }
            : { color: DERIN.V, textAlign: "center" }}>{tip === "numara" ? `${no}.` : "–"}</span>
          <span>{satirIci(govde)}</span>
        </span>
      );
    }
    return <span key={i} style={{ display: "block" }}>{satirIci(govde)}</span>;
  });
}

/* ISO tarih → "03.10.2026" (ürünün geri kalanıyla aynı biçim). */
const trTarih = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
};
/* Mevzuat kaydının ham korpus adı ("4982 bilgi edinme kanunu") → aynı cevabın kaynak
   listesindeki RESMÎ ad; yoksa ilk harf büyütülmüş ham ad. */
const resmiAd = (k, kaynaklar) => {
  const anahtar = String(k.baslik || "").trim().toLocaleLowerCase("tr");
  const es = (kaynaklar || []).find((x) => String(x.dosya || "").replace(/_/g, " ").toLocaleLowerCase("tr") === anahtar);
  if (es?.baslik) return es.baslik;
  const ad = kayitAdi(k);
  return ad.charAt(0).toLocaleUpperCase("tr") + ad.slice(1);
};

/* Tek kayıt kartı — başlık bir kez yazılır; numara başlığa düştüyse meta satırında tekrarlanmaz. */
function KayitKart({ tur, k, kaynaklar }) {
  const ad = tur === "mevzuat" ? resmiAd(k, kaynaklar) : kayitAdi(k);
  const risk = k.risk || k.bant;
  const satir2 = [
    tur === "gelen" && k.evrak_no !== ad && k.evrak_no,
    tur === "giden" && k.durum, tur === "giden" && k.alici_birim,
    tur === "islem" && k.evrak_turu, tur === "islem" && k.hedef_birim,
    tur === "taslak" && k.yazi_turu_kod,
    tur === "mevzuat" && (k.kanun_no || k.no) && `${k.kanun_no || k.no} sayılı`,
    tur === "mevzuat" && k.madde_no && `m. ${k.madde_no}`,
    tur === "mevzuat" && k.madde_sayisi && `${k.madde_sayisi} madde`,
    trTarih(k.olusturuldu || k.gonderim_tarihi),
  ].filter(Boolean);
  return (
    <div style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `2px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, padding: "8px 12px", display: "grid", gap: SP.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
        {risk && BANT[risk] && <span title={BANT[risk].l} aria-label={`Risk: ${BANT[risk].l}`} style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[risk].c, flexShrink: 0 }} />}
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      </div>
      {satir2.length > 0 && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, ...TNUM }}>{satir2.join(" · ")}</span>}
      {tur === "mevzuat" && k.snippet && <span style={{ ...TYPE.meta, color: PAL.mut, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{k.snippet}</span>}
    </div>
  );
}

/* Dipnot — cevabın dayandığı madde; tıklanınca okuma modalı ilgili maddede açılır. */
function Dipnotlar({ kaynaklar, onMevzuatAc, onClose }) {
  return (
    <ol aria-label="Cevabın mevzuat dayanakları" style={{ listStyle: "none", margin: 0, padding: "8px 12px 10px", borderTop: `1px dashed ${PAL.lineHi}`, display: "grid", gap: 2 }}>
      {kaynaklar.map((k, i) => (
        <li key={`${k.dosya}-${k.madde_no ?? i}`} style={{ minWidth: 0 }}>
          <button type="button" className="ke-sohbet-dipnot" {...focusRing} title={`${k.baslik}: tam metni oku`}
            onClick={() => { onMevzuatAc?.({ dosya: k.dosya, maddeNo: k.madde_no ?? null }); onClose(); }}
            style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: SP.s, width: "calc(100% + 12px)", boxSizing: "border-box", minHeight: 30, padding: "4px 6px", margin: "0 -6px", textAlign: "left", border: "none", borderRadius: RAD.chip, background: "transparent", color: PAL.ink2, ...TYPE.meta }}>
            <span aria-hidden="true" style={{ fontFamily: MONO, color: DERIN.V, minWidth: 10 }}>{UST[i] || `${i + 1}.`}</span>
            <span style={{ fontFamily: MONO, color: DERIN.V, fontWeight: 600, whiteSpace: "nowrap", ...TNUM }}>{[k.no, k.madde_no != null && `m.${k.madde_no}`].filter(Boolean).join(" · ")}</span>
            <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.baslik}</span>
            <span aria-hidden="true" className="ke-sohbet-dipnot-ok" style={{ display: "flex", color: DERIN.T }}><Icon.arrow width={12} height={12} /></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* Kalem iskeleti — boş fişin gövdesi: iki satır çizgi çizilir (0→100) ve opaklıkla söner,
   silinip boşluk bırakmaz. Reduced-motion'da global kural animasyonu söndürür. */
const KalemIskeleti = () => (
  <div aria-hidden="true" style={{ display: "grid", gap: 9, padding: "12px 12px 14px" }}>
    {[88, 62].map((w, i) => (
      <svg key={i} width={`${w}%`} height="6" viewBox="0 0 100 6" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        {/* Satır izi: kalem sönükken de satır yeri okunur (koyu temada tek soluk çizgiye iniyordu). */}
        <path d="M0 3 H100" stroke={PAL.lineHi} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path className="ke-kalem" d="M0 3 H100" pathLength="100" stroke={T} strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          style={{ animationDelay: `${i * 0.28}s` }} />
      </svg>
    ))}
  </div>
);

/* Danışma notu fişi kabuğu — künye + gövde (+ dipnot). Karşılama, cevap, hata, bekleme aynı. */
export function DanismaFisi({ kunye, saat, hata = false, children, alt = null, role, ariaLabel }) {
  return (
    <div role={role} aria-label={ariaLabel} style={{ position: "relative", width: "92%", background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${hata ? BANT.kirmizi.c : V}`, borderRadius: RAD.ctl, boxShadow: SH.card, color: PAL.ink2, overflowWrap: "anywhere" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "7px 12px 6px", borderBottom: `1px dashed ${PAL.lineHi}`, ...TYPE.antet, fontSize: 10, lineHeight: "14px", textTransform: "uppercase", color: hata ? DERIN.kirmizi : PAL.mut3 }}>
        {hata && <Icon.alert width={12} height={12} />}
        <span>{kunye}</span>
        <span style={{ flex: 1 }} />
        {saat && <span style={TNUM}>{saat}</span>}
      </div>
      {children}
      {alt}
    </div>
  );
}

/* Bekleme fişi — ilk bayt gelmeden önce: boş danışma notu, künyesi anında dolu. */
export const BeklemeFisi = () => (
  <div style={{ display: "flex", animation: "nu-rise .16s var(--ke-ease-out) both" }}>
    <DanismaFisi role="status" ariaLabel="Asistan danışma notunu hazırlıyor" kunye="Danışma notu · hazırlanıyor" saat={notSaati(Date.now())}>
      <KalemIskeleti />
    </DanismaFisi>
  </div>
);

/* Zımba — araç sonucu kayıtları nota "zımbalı ek" olarak tutturulur. Saf dekor. */
const Zimba = ({ top = 10 }) => (
  <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8" style={{ position: "absolute", left: 16, top, zIndex: 1 }}>
    <path d="M2.5 6.5 V4 H21.5 V6.5" fill="none" stroke={PAL.mut2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 3.2 H20" stroke={PAL.surf} strokeWidth="1" strokeLinecap="round" opacity=".5" />
  </svg>
);

/* Zımbalı ek yığını — damga yığının sağ üstünde, fişten ayrı nefesle (zımbanın üstüne binmez). */
function EkYigini({ m, damgali }) {
  const n = m.kayitlar.length;
  return (
    // Damgalıyken üstte kendi şeridi açılır: damga ilk kaydın kenarına binmez (tur 7 bulgusu),
    // zımba yine kağıdın üst kenarını keser.
    <div style={{ position: "relative", display: "grid", gap: SP.s, width: "88%", paddingTop: damgali ? 30 : 14 }}>
      <Zimba top={damgali ? 26 : 10} />
      {damgali && (
        <Damga ton={V} egim={-3} kucuk style={{ position: "absolute", right: 6, top: 0, zIndex: 2, background: PAL.surf }}>
          {n} kayıt{KAYIT_TUR_ETIKET[m.kayit_turu] ? ` · ${KAYIT_TUR_ETIKET[m.kayit_turu]}` : ""}
        </Damga>
      )}
      {m.kayitlar.slice(0, 8).map((k, i) => <KayitKart key={i} tur={m.kayit_turu} k={k} kaynaklar={m.mevzuat_kaynaklari} />)}
      {n > 8 && <span style={{ ...TYPE.meta, color: PAL.mut2 }}>+{n - 8} kayıt daha — tümü ilgili görünümde</span>}
    </div>
  );
}

/* Mesajın altındaki eylemler: teyit (HITL) · görünüme git · tekrar dene. */
function MesajEylemleri({ m, bekliyor, onTeyit, onNavigate, onClose }) {
  const pasif = { cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1 };
  return (
    <>
      {m.onay_bekleyen && !m.onay_kullanildi && (
        <div style={{ display: "flex", gap: SP.s }}>
          {/* Akış sürerken devre dışı: aksi hâlde karar gönderilmeden kaybolurdu (regresyon bulgusu). */}
          <button type="button" className="ke-sohbet-dokun" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, true)}
            style={{ ...pasif, display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 500, color: PAL.onAccent, background: DERIN.T, border: "none", borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            <Icon.check /> Evet, uygula
          </button>
          <button type="button" className="ke-sohbet-dokun" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, false)}
            style={{ ...pasif, ...TYPE.data, fontWeight: 500, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            Vazgeç
          </button>
        </div>
      )}
      {m.oneri_gorunum && GORUNUM_ETIKET[m.oneri_gorunum] && (
        <button type="button" className="ke-sohbet-dokun" {...focusRing} onClick={() => { onNavigate?.(m.oneri_gorunum); onClose(); }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, minHeight: 32, ...TYPE.data, fontWeight: 500, color: DERIN.T, background: ALFA(T), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          {GORUNUM_ETIKET[m.oneri_gorunum]} görünümüne git <Icon.arrow width={13} height={13} />
        </button>
      )}
      {m.hata && (
        <button type="button" className="ke-sohbet-dokun" {...focusRing} onClick={m.tekrar}
          style={{ cursor: "pointer", minHeight: 32, ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi, background: ALFA(BANT.kirmizi.c), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          Tekrar dene
        </button>
      )}
    </>
  );
}

/* Mesaj — kullanıcı sağda (tükenmez mavisi kısa not), asistan solda danışma notu fişi. */
export function Balon({ m, onNavigate, onClose, onTeyit, onMevzuatAc, bekliyor, damgali, fisRef }) {
  const kullanici = m.rol === "kullanici";
  const kaynakEk = m.kaynak === "llm" ? " · Yapay zekâ" : m.kaynak ? " · Kural tabanlı" : "";
  const kunye = m.karsilama ? "Karşılama" : m.hata ? "İşlem durdu" : m.akiyor ? "Danışma notu · yazılıyor" : `Danışma notu${kaynakEk}`;
  const kaynaklar = m.mevzuat_kaynaklari?.length ? m.mevzuat_kaynaklari : null;
  return (
    <div ref={fisRef} data-mesaj-rol={m.rol} style={{ display: "flex", flexDirection: "column", alignItems: kullanici ? "flex-end" : "flex-start", gap: SP.s, scrollMarginTop: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      {kullanici ? (
        /* Soru fişi — balon değil: kâğıt zemin + sağda tükenmez cilt çizgisi + mono künye.
           Dolgun primary mavi görünümün tek primary'siyle yarışıyordu (tur 8 jüri). */
        <div style={{ maxWidth: "86%", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRight: `3px solid ${T}`, borderRadius: RAD.ctl, color: PAL.ink, overflowWrap: "anywhere" }}>
          <div aria-hidden="true" style={{ display: "flex", gap: SP.s, justifyContent: "flex-end", padding: "6px 12px 0", ...TYPE.antet, fontSize: 10, lineHeight: "14px", textTransform: "uppercase", color: PAL.mut3 }}>
            <span>Soru</span>{m.zaman && <span style={TNUM}>{notSaati(m.zaman)}</span>}
          </div>
          <div style={{ padding: "2px 12px 9px", ...TYPE.ui }}><Md text={m.icerik} /></div>
        </div>
      ) : (
        <DanismaFisi kunye={kunye} saat={notSaati(m.zaman)} hata={m.hata}
          alt={kaynaklar && !m.akiyor ? <Dipnotlar kaynaklar={kaynaklar} onMevzuatAc={onMevzuatAc} onClose={onClose} /> : null}>
          {m.akiyor && !m.icerik ? <KalemIskeleti /> : <div style={{ padding: "9px 12px 11px", ...TYPE.ui }}><Md text={m.icerik} /></div>}
        </DanismaFisi>
      )}
      {m.kayitlar?.length > 0 && <EkYigini m={m} damgali={damgali} />}
      <MesajEylemleri m={m} bekliyor={bekliyor} onTeyit={onTeyit} onNavigate={onNavigate} onClose={onClose} />
    </div>
  );
}
