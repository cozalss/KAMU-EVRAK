/* PanelGozlem — Panel'in GÖZLEM kuşağı (kahramanın arkasındaki sakin koro). PanelView'dan
   ayrıldı (dosya < 800 satır). Tur 6 değişiklikleri:
   · Dağılım: Risk Bandı üç ayrı çubuk ("0 (%0)" ×2) yerine kahramandaki SlaSerit diliyle TEK
     yığılı şerit + sayılı lejant — boş satırlar kalktı, kolon boyları eşitlendi.
   · Son İşlemler: satırlar artık IZGARA (kahramandaki defter gibi): nokta | evrak (+ mono tür
     künyesi) | durum (boşsa yer tutar) | birim | gün·saat. Çip satırdan satıra oynamaz.
     Telefonda nokta adın İÇİNDE, künye tek mono satırda; yetim nokta yok.
   · Tarih noktalı ("03.10 15:57") — defter/takvimle aynı ayırıcı.
   · Hata hâli "Yeniden dene" eylemi taşır. */
import { useMemo } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { RotateCw } from "lucide-react";
import { NeonCard, Btn, Icon, MONO, DISPLAY, T, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_GOSTER } from "./result-cards.jsx";
import { iskeletCizgi, iskeletNefes } from "./PanelBrif.jsx";
import { useDarEkran } from "../hooks/useMedya.js";
import { GUN_MS, gunBasi } from "../lib/gunlukSeri.js";
import { kayitAdi } from "../lib/sohbetMetin.js";
import { noktaliGunSaat, noktaliSaat } from "../lib/panelBrifSaf.js";

/* ---------- Dağılım ---------- */

function BosKolon({ metin }) {
  return (
    <div>
      {[0.82, 0.54].map((w) => (
        <div key={w} aria-hidden="true" style={{ marginBottom: SP.m }}>
          <div style={{ height: 14, width: `${w * 60}%`, borderRadius: RAD.chip, background: PAL.surfHi, marginBottom: SP.xs }} />
          <div style={{ height: 10, width: `${w * 100}%`, borderRadius: RAD.chip, border: `1px dashed ${PAL.lineHi}` }} />
        </div>
      ))}
      <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>{metin}</p>
    </div>
  );
}

function BarList({ rows, color, bos = "Kayıt yok." }) {
  if (!rows.length) return <BosKolon metin={bos} />;
  const max = rows[0][1] || 1;
  return rows.map(([label, c]) => (
    <div key={label} title={`${label}: ${c} evrak`} style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: SP.s, ...TYPE.data, color: PAL.mut2, marginBottom: SP.xs }}>
        <span style={{ color: PAL.ink2, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: DERIN_OF(color), fontWeight: 600, ...TNUM, flexShrink: 0 }}>{c}</span>
      </div>
      <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((c / max) * 100)}%`, background: color, borderRadius: RAD.chip }} />
      </div>
    </div>
  ));
}

function KolonBaslik({ children }) {
  return <p style={{ margin: `0 0 ${SP.m}px`, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{children}</p>;
}

/* Risk bandı — tek yığılı şerit (SlaSerit dili) + üç satırlık sayılı lejant. Sıfır kalemler
   lejantta soluk durur (bandın varlığı bilgidir), şeritte yer kaplamaz. Yüzde YOK: CLAUDE.md
   §7 risk dilinde yüzdeyi tek alana ayırır; burada adet yeterli. */
function RiskSerit({ risk, n }) {
  const kalemler = ["yesil", "sari", "kirmizi"].map((k) => ({ k, ...BANT[k], adet: risk[k] }));
  return (
    <div>
      <div role="img" aria-label={kalemler.map((x) => `${x.l} ${x.adet}`).join(", ")} style={{ display: "flex", gap: 3, height: 10 }}>
        {kalemler.filter((x) => x.adet > 0).map((x) => (
          <span key={x.k} title={`${x.l} · ${x.t}: ${x.adet}`} style={{ width: `${(x.adet / n) * 100}%`, minWidth: 6, background: x.c, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ marginTop: SP.m }}>
        {kalemler.map((x) => (
          <div key={x.k} style={{ display: "flex", alignItems: "baseline", gap: SP.s, padding: "5px 0", borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: x.adet ? PAL.ink2 : PAL.mut3 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: x.adet ? x.c : "transparent", border: `1px solid ${x.c}`, alignSelf: "center" }} />
            <span style={{ fontWeight: 600, color: x.adet ? DERIN_OF(x.c) : PAL.mut3 }}>{x.l}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{x.t}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 15, color: x.adet ? PAL.ink : PAL.mut3, ...TNUM }}>{x.adet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DagilimYuzeyi({ n, risk, turList, birimList, ortGuven, genis }) {
  if (n < 3) {
    return (
      <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />}>
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Dağılım özeti 3 işlemden sonra oluşur — {3 - n} evrak kaldı.</p>
      </NeonCard>
    );
  }
  const kolonStil = (i) => ({ minWidth: 0, paddingLeft: genis && i > 0 ? SP.l : 0, borderLeft: genis && i > 0 ? `1px solid ${PAL.line}` : "none",
    paddingTop: !genis && i > 0 ? SP.l : 0, borderTop: !genis && i > 0 ? `1px solid ${PAL.line}` : "none" });
  return (
    <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />} tag={ortGuven != null ? `ort. tür güveni %${ortGuven}` : undefined}>
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(3, minmax(0, 1fr))" : "1fr", gap: SP.l }}>
        <div style={kolonStil(0)}><KolonBaslik>Risk Bandı</KolonBaslik><RiskSerit risk={risk} n={n} /></div>
        {/* Tür = ıstampa moru, birim = tükenmez mavisi — sütun kimliği renkten de okunur. */}
        <div style={kolonStil(1)}><KolonBaslik>Evrak Türü</KolonBaslik><BarList rows={turList} color={V} /></div>
        <div style={kolonStil(2)}>
          <KolonBaslik>Havale Edilen Birim</KolonBaslik>
          <BarList rows={birimList} color={T}
            bos="Henüz kayıtlı havale yok — birim yönlendirmesi doğrulanan evraklar burada birime göre sayılır." />
        </div>
      </div>
    </NeonCard>
  );
}

/* ---------- Birim bazlı gecikme ---------- */

export function BirimGecikmeKart({ rows, dar }) {
  const [ref] = useAutoAnimate();
  const varmi = rows.length > 0;
  const cip = (renk, metin) => (
    <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(renk), background: ALFA(renk), borderRadius: RAD.chip, padding: "2px 8px", whiteSpace: "nowrap", ...TNUM }}>{metin}</span>
  );
  return (
    <NeonCard title="Birim Bazlı Gecikme" accent={varmi ? BANT.kirmizi.c : BANT.yesil.c} tag={dar ? undefined : "havale + yasal süre"} icon={<Icon.clock />}>
      {varmi ? (
        <div ref={ref}>
          {rows.map(([birim, e]) => (
            <div key={birim} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "7px 0", borderTop: `1px solid ${PAL.line}` }}>
              <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, textWrap: "pretty" }}>{birim}</span>
              {e.gecikmis > 0 && cip(BANT.kirmizi.c, `${e.gecikmis} gecikmiş`)}
              {e.kritik > 0 && cip(BANT.sari.c, `${e.kritik} kritik`)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: SP.m, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0, borderRadius: RAD.dot,
            color: DERIN.yesil, background: ALFA(BANT.yesil.c), border: `1px solid ${BANT.yesil.c}` }}>
            <Icon.check width={14} height={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Gecikmiş havale yok</p>
            <p style={{ margin: "2px 0 0", ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>
              İşlenen evrakın hiçbiri, havale edildiği birimde yasal süresini aşmadı ya da kritik eşikte değil.
            </p>
          </div>
        </div>
      )}
    </NeonCard>
  );
}

/* ---------- Son işlemler (ızgaralı defter) ---------- */

const FEED_SUTUN = "8px minmax(0, 1fr) 112px minmax(0, 220px) 88px";

function FeedSatir({ h, onGoIslenen, bugunGrubu, dar }) {
  const bekliyor = h.result?.yazi_taslak_md && !h.result?.onay_durumu;
  const ad = kayitAdi({ konu: h.result?.bilgi_unsurlari?.konu, name: h.name, evrak_turu: h.evrak_turu });
  const saat = Number.isFinite(h.ts) ? (bugunGrubu ? noktaliSaat(h.ts) : noktaliGunSaat(h.ts)) : "";
  const birim = BIRIM_GOSTER(h.hedef_birim, h.evrak_turu);
  const nokta = <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />;
  const cip = bekliyor ? <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.sari, background: ALFA(BANT.sari.c), borderRadius: RAD.chip, padding: "2px 8px", whiteSpace: "nowrap" }}>karar bekliyor</span> : null;
  const adMetin = <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={h.name}>{ad}</span>;
  const ortak = { cursor: "pointer", width: "100%", textAlign: "left", padding: `${SP.s}px ${SP.xs}px`, background: "transparent", border: "none",
    borderTop: `1px solid ${PAL.line}`, transition: `background .12s ease, transform .14s ${EASE.out}` };
  const hover = { onMouseEnter: (e) => { e.currentTarget.style.background = PAL.hov; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; } };
  if (dar) {
    return (
      <button type="button" onClick={onGoIslenen} aria-label={`${ad} — işlenen evrak arşivinde gör`} {...focusRing} {...hover} data-press="" style={{ ...ortak, display: "block" }}>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>{nokta}{adMetin}<span style={{ marginLeft: "auto", flexShrink: 0 }}>{cip}</span></span>
        {/* Zaman ayrı, kırpılmaz sütunda: satırın asıl bilgisi; uzun birim adı yalnız kendi payında kısalır. */}
        <span style={{ display: "flex", gap: SP.s, marginTop: 2, paddingLeft: 16, fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, minWidth: 0, ...TNUM }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{EVRAK_TR(h.evrak_turu)} · {birim}</span>
          {saat && <span style={{ flexShrink: 0, whiteSpace: "nowrap", color: PAL.mut2 }}>{saat}</span>}
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onGoIslenen} aria-label={`${ad} — işlenen evrak arşivinde gör`} {...focusRing} {...hover} data-press=""
      style={{ ...ortak, display: "grid", gridTemplateColumns: FEED_SUTUN, alignItems: "center", columnGap: SP.m }}>
      {nokta}
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {adMetin}
        <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "15px", color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{EVRAK_TR(h.evrak_turu)}</span>
      </span>
      <span>{cip}</span>
      <span style={{ ...TYPE.meta, color: DERIN.V, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={birim}>{birim}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, textAlign: "right", whiteSpace: "nowrap", ...TNUM }}>{saat}</span>
    </button>
  );
}

export function SonIslemlerFeed({ history, n, onGoIslenen }) {
  const [sonRef] = useAutoAnimate();
  const dar = useDarEkran();
  const gruplar = useMemo(() => {
    const bugun = gunBasi(Date.now());
    const g = { bugun: [], dun: [], eski: [] };
    for (const h of history.slice(0, 8)) {
      const t = Number.isFinite(h.ts) ? gunBasi(h.ts) : 0;
      if (t === bugun) g.bugun.push(h);
      else if (t === bugun - GUN_MS) g.dun.push(h);
      else g.eski.push(h);
    }
    return [["Bugün", g.bugun, true], ["Dün", g.dun, false], ["Daha eski", g.eski, false]].filter(([, list]) => list.length > 0);
  }, [history]);
  return (
    <NeonCard title="Son İşlemler" accent={T} tag={`son ${Math.min(history.length, 8)} / ${n}`} style={{ flex: 1 }}>
      {/* Başlıklar ve satırlar aynı konteynerin DOĞRUDAN çocukları — auto-animate yalnız onları izler. */}
      <div ref={sonRef}>
        {gruplar.flatMap(([etiket, list, bugunGrubu]) => [
          <div key={`grup-${etiket}`} style={{ display: "flex", justifyContent: "space-between", ...TYPE.antet, fontSize: 10, color: PAL.mut3, padding: `${SP.s}px ${SP.xs}px ${SP.xs}px`, ...TNUM }}>
            <span>{etiket.toLocaleUpperCase("tr")}</span><span>{list.length}</span>
          </div>,
          ...list.map((h) => <FeedSatir key={h.id} h={h} onGoIslenen={onGoIslenen} bugunGrubu={bugunGrubu} dar={dar} />),
        ])}
      </div>
      <button type="button" onClick={onGoIslenen} {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, width: "100%", padding: "10px 0", background: "transparent", border: "none", borderTop: `1px dashed ${PAL.lineHi}`, borderRadius: 0, ...TYPE.data, fontWeight: 500, color: DERIN.T, transition: `background .12s ease, transform .14s ${EASE.out}` }}>
        Tüm işlenen evrakı gör <Icon.arrow width={14} height={14} />
      </button>
    </NeonCard>
  );
}

/* ---------- Gözlem: yükleniyor / hata ---------- */

function IskeletKart({ satir, gecikme }) {
  return (
    <div aria-hidden="true" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
      padding: SP.l + 4, ...iskeletNefes(gecikme) }}>
      <div style={iskeletCizgi(120, 14, { marginBottom: SP.l })} />
      {Array.from({ length: satir }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: SP.m, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${PAL.line}` }}>
          <span style={iskeletCizgi(8, 8, { borderRadius: RAD.dot })} />
          <span style={iskeletCizgi(`${[62, 48, 70, 40, 56][i % 5]}%`, 10, { flexShrink: 1 })} />
          <span style={iskeletCizgi(44, 10, { marginLeft: "auto" })} />
        </div>
      ))}
    </div>
  );
}

/* Gözlem iskeleti — gerçek kuşağın iki bağımsız sütunu (8 + 4 kol); satır sayıları dolu
   kartların ölçülen boyundan. Kuşak katın altında başlar; amaç kaydırınca sıçramaması. */
const GOZLEM_ISKELET = {
  genis: [
    { kol: 8, kartlar: [{ satir: 5, gecikme: 0 }, { satir: 9, gecikme: 120 }] },
    { kol: 4, kartlar: [{ satir: 2, gecikme: 60 }, { satir: 14, gecikme: 180 }] },
  ],
  dar: [
    { kol: 8, kartlar: [{ satir: 14, gecikme: 0 }, { satir: 16, gecikme: 120 }] },
    { kol: 4, kartlar: [{ satir: 3, gecikme: 60 }, { satir: 14, gecikme: 180 }] },
  ],
};

export function GozlemAntet({ sag, giris, rol }) {
  return (
    <div role={rol} aria-hidden={rol ? undefined : "true"} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m, ...TYPE.antet, color: PAL.mut3, ...giris }}>
      <span>GÖZLEM</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      <span style={{ ...TNUM }}>{sag}</span>
    </div>
  );
}

export function GozlemDurum({ yukleniyor, span, genis, onYeniden }) {
  if (yukleniyor) {
    return (
      <>
        <GozlemAntet sag="İŞLEM GEÇMİŞİ YÜKLENİYOR" rol="status" />
        {GOZLEM_ISKELET[genis ? "genis" : "dar"].map(({ kol, kartlar }) => (
          <div key={kol} style={{ ...span(kol), alignSelf: "start", display: "flex", flexDirection: "column", gap: SP.l + 4 }}>
            {kartlar.map((k, i) => <IskeletKart key={i} satir={k.satir} gecikme={k.gecikme} />)}
          </div>
        ))}
      </>
    );
  }
  return (
    <div role="alert" style={{ ...span(12), display: "flex", alignItems: "flex-start", gap: SP.m, flexWrap: "wrap", padding: `${SP.l}px ${SP.l + 4}px`,
      background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `4px solid ${BANT.kirmizi.c}`, borderRadius: RAD.card, boxShadow: SH.card }}>
      <span aria-hidden="true" style={{ display: "flex", paddingTop: 2, color: DERIN_OF(BANT.kirmizi.c) }}><Icon.alert width={16} height={16} /></span>
      <span style={{ minWidth: 0, flex: "1 1 320px" }}>
        <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>İşlem geçmişi alınamadı</span>
        <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2, textWrap: "pretty" }}>
          Kayıtlı işlemler sunucudan okunamadı; dağılım, süre ve son işlemler bu yüzden boş. Kuyruk, yasal süreler ve
          giden sayısı etkilenmedi.
        </span>
      </span>
      {onYeniden && <Btn onClick={onYeniden}><RotateCw size={14} strokeWidth={1.75} aria-hidden="true" /> Yeniden dene</Btn>}
    </div>
  );
}
