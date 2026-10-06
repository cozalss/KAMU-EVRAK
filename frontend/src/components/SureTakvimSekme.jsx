/* SureTakvimSekme — Süre takviminin alt parçaları (SureTakvimi.jsx < 800 satır kalsın diye):
   · AySekmeleri: ay şeridi artık DOSYA CİLDİ SEKME SIRASI (tur 6). Eskiden 10 px mono etiket +
     10 px çubuk + boş ayda 1 px kıl — takvimin en güçlü bilgi taşıyıcısı en zayıf öğesiydi.
     Şimdi sekme başına Archivo ay adı + Archivo evrak sayısı (boşsa "—") + 4 px yük şeridi;
     seçili sekme kâğıda BAĞLANIR (kenar çubuğundaki dosya sırtıyla aynı dil: alt kenarı yok,
     takvim yüzeyiyle birleşir). Bugünün ayı tükenmez mavisi çentikle işaretlenir.
   · BosAy: boş ayda en yakın işaretli aylara atlama kartları — mühürlü günlerin MİNİ ÖNİZLEMESİ
     ile (kartın altı ölü kâğıt kalmıyordu).
   · TakvimIskelet: yükleme şekli.
   Hepsi aynı işaret haritasından/ay özetinden; yeni veri kaynağı yok. */
import { useMemo } from "react";
import { Icon, DISPLAY, T, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { iskeletCizgi, iskeletNefes, ISKELET_MUREKKEP } from "./PanelBrif.jsx";

export const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const AGIRLIK_RENK = { 1: BANT.yesil.c, 2: BANT.sari.c, 3: BANT.kirmizi.c };
export const ayFark = (a, b) => (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
const SERIT_AZAMI = 12;

/* Sekmede gösterilecek aylar — kuyruğun son günleri + bugünün ayı (en çok 12 ay). */
function sekmeAylari(ozet, buAy) {
  const tarihler = [...ozet.values()].map((x) => x.tarih);
  let bas = new Date(Math.min(buAy, ...tarihler)), bit = new Date(Math.max(buAy, ...tarihler));
  if (ayFark(bit, bas) >= SERIT_AZAMI) {
    bit = new Date(Math.min(bit, new Date(buAy.getFullYear(), buAy.getMonth() + 3, 1)));
    bas = new Date(bit.getFullYear(), bit.getMonth() - (SERIT_AZAMI - 1), 1);
  }
  return Array.from({ length: ayFark(bit, bas) + 1 }, (_, i) => {
    const t = new Date(bas.getFullYear(), bas.getMonth() + i, 1);
    return { tarih: t, ...(ozet.get(`${t.getFullYear()}-${t.getMonth()}`) || { n: 0, agirlik: 0 }) };
  });
}

function Sekme({ x, secili, bugunAyi, max, onGit, sik }) {
  const renk = AGIRLIK_RENK[x.agirlik] || PAL.lineHi;
  const ad = `${AY_ADI[x.tarih.getMonth()]} ${x.tarih.getFullYear()}`;
  return (
    <button type="button" role="tab" aria-selected={secili} onClick={() => onGit(x.tarih)} {...focusRing} data-press=""
      aria-label={`${ad} — ${x.n ? `${x.n} evrakın son günü` : "son gün yok"}${bugunAyi ? " (bu ay)" : ""}`}
      onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { if (!secili) e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", position: "relative", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2,
        padding: `${SP.s - 2}px ${sik ? 3 : 6}px 0`, marginBottom: -1, zIndex: secili ? 1 : 0,
        background: secili ? PAL.surf : "transparent", borderTop: `1px solid ${secili ? PAL.line : "transparent"}`, borderLeft: `1px solid ${secili ? PAL.line : "transparent"}`,
        borderRight: `1px solid ${secili ? PAL.line : "transparent"}`, borderBottom: "none",
        borderRadius: `${RAD.ctl}px ${RAD.ctl}px 0 0`, transition: `background .14s ease, transform .14s ${EASE.out}` }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: DISPLAY, fontSize: 12, lineHeight: "14px",
        fontWeight: secili ? 700 : 600, fontStretch: "106%", color: secili ? PAL.ink : bugunAyi ? DERIN.T : PAL.mut2 }}>
        {bugunAyi && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: RAD.dot, background: T, flexShrink: 0 }} />}
        {AY_KISA[x.tarih.getMonth()]}
      </span>
      <span style={{ textAlign: "center", fontFamily: DISPLAY, fontSize: 16, lineHeight: "18px", fontWeight: 800, fontStretch: "112%",
        color: x.n ? DERIN_OF(renk) : PAL.mut3, ...TNUM }}>{x.n || "—"}</span>
      {/* Yük şeridi — sekmenin tabanında; boy oranla, renk ayın en kötü durumu. */}
      <span aria-hidden="true" style={{ display: "block", height: 4, marginTop: 3, background: secili ? "transparent" : PAL.line, borderRadius: "2px 2px 0 0", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${x.n ? Math.max(18, (x.n / max) * 100) : 0}%`, margin: "0 auto", background: renk }} />
      </span>
    </button>
  );
}

export function AySekmeleri({ ozet, ay, buAy, onGit }) {
  const aylar = useMemo(() => sekmeAylari(ozet, buAy), [ozet, buAy]);
  if (aylar.length < 2) return null;
  const max = Math.max(1, ...aylar.map((x) => x.n));
  return (
    <div role="tablist" aria-label="Son günlerin aylara dağılımı" style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
      {aylar.map((x) => (
        <Sekme key={`${x.tarih.getFullYear()}-${x.tarih.getMonth()}`} x={x} max={max} onGit={onGit} sik={aylar.length > 6}
          secili={ayFark(x.tarih, ay) === 0} bugunAyi={ayFark(x.tarih, buAy) === 0} />
      ))}
    </div>
  );
}

/* Mini mühür — boş ay kartındaki önizleme (gün numarası halkada). */
function MiniMuhur({ gun, renk }) {
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: RAD.dot, border: `1.5px solid ${renk}`,
      background: ALFA(renk), fontFamily: DISPLAY, fontSize: 10, fontWeight: 800, color: DERIN_OF(renk), ...TNUM }}>{gun}</span>
  );
}

function AtlaKart({ h, yon, gunler, onGit }) {
  return (
    <button type="button" onClick={() => onGit(h.tarih)} {...focusRing} data-press="" data-dokunma=""
      aria-label={`${AY_ADI[h.tarih.getMonth()]} ${h.tarih.getFullYear()} ayına git — ${h.n} evrakın son günü`}
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: yon === "sol" ? "flex-start" : "flex-end",
        gap: SP.s, padding: `${SP.m}px ${SP.m}px`, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...TYPE.meta, color: PAL.mut2 }}>
        {yon === "sol" && <Icon.okSol width={12} height={12} />}{AY_ADI[h.tarih.getMonth()]} {h.tarih.getFullYear()}{yon === "sag" && <Icon.okSag width={12} height={12} />}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, color: DERIN_OF(AGIRLIK_RENK[h.agirlik] || BANT.yesil.c) }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "115%", fontSize: 22, lineHeight: "24px", ...TNUM }}>{h.n}</span>
        <span style={{ ...TYPE.meta }}>evrak</span>
      </span>
      <span aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: yon === "sol" ? "flex-start" : "flex-end" }}>
        {gunler.slice(0, 6).map((g) => <MiniMuhur key={g.anahtar} gun={g.tarih.getDate()} renk={AGIRLIK_RENK[g.agirlik]} />)}
      </span>
    </button>
  );
}

/* Boş ay — en yakın işaretli önceki/sonraki aya atlama (mini mühür önizlemeli). */
export function BosAy({ ay, ozet, isaret, onGit }) {
  const { once, sonra } = useMemo(() => {
    const liste = [...ozet.values()].sort((x, y) => x.tarih - y.tarih);
    return { once: liste.filter((x) => x.tarih < ay).pop(), sonra: liste.find((x) => x.tarih > ay) };
  }, [ay, ozet]);
  const ayGunleri = (h) => [...isaret.entries()]
    .filter(([, k]) => ayFark(k.tarih, h.tarih) === 0)
    .map(([anahtar, k]) => ({ anahtar, ...k }))
    .sort((a, b) => a.tarih - b.tarih);
  return (
    <div>
      <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2 }}>{AY_ADI[ay.getMonth()]} ayında son günü dolan evrak yok.</p>
      {(once || sonra) && (
        <div style={{ display: "flex", gap: SP.s }}>
          {once && <AtlaKart h={once} yon="sol" gunler={ayGunleri(once)} onGit={onGit} />}
          {sonra && <AtlaKart h={sonra} yon="sag" gunler={ayGunleri(sonra)} onGit={onGit} />}
        </div>
      )}
    </div>
  );
}

/* Yükleme iskeleti — takvimin ŞEKLİ (başlık, sekmeler, 7×6 ızgara, lejant, gün paneli). */
const ISKELET_HAFTA = 6;
export function TakvimIskelet() {
  return (
    <section aria-hidden="true"
      style={{ height: "100%", display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.line}`,
        borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden", ...iskeletNefes(150) }}>
      <div style={{ padding: `${SP.m}px ${SP.l}px 0`, background: PAL.surf2, borderBottom: `1px solid ${PAL.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, height: 28 }}>
          <span style={iskeletCizgi(13, 13)} />
          <span style={iskeletCizgi(92, 10)} />
          <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 8 }} />
          <span style={iskeletCizgi(84, 28, { borderRadius: RAD.ctl })} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, height: 30, marginTop: SP.s }}>
          <span style={iskeletCizgi(132, 22)} />
          <span style={iskeletCizgi(84, 10)} />
        </div>
        <span style={iskeletCizgi(150, 9, { marginTop: SP.xs })} />
        <span style={iskeletCizgi("100%", 46, { marginTop: SP.m, borderRadius: `${RAD.ctl}px ${RAD.ctl}px 0 0` })} />
      </div>
      <div style={{ flex: 1, padding: `${SP.m}px ${SP.l}px ${SP.l}px` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {Array.from({ length: ISKELET_HAFTA * 7 + 7 }, (_, i) => (
            <span key={i} style={{ height: i < 7 ? 18 : 44, borderRadius: RAD.ctl, background: i < 7 ? "transparent" : ISKELET_MUREKKEP, opacity: i < 7 ? 1 : 0.55 }} />
          ))}
        </div>
        <span style={iskeletCizgi("62%", 10, { margin: `${SP.m}px auto 0` })} />
        <div style={{ marginTop: SP.m }}>
          {[70, 54, 62].map((w) => (
            <div key={w} style={{ display: "flex", alignItems: "center", gap: SP.s, height: 36, borderTop: `1px solid ${PAL.line}` }}>
              <span style={iskeletCizgi(8, 8, { borderRadius: RAD.dot })} />
              <span style={iskeletCizgi(`${w}%`, 10)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

