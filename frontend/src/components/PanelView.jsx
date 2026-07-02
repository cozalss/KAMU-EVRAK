/* PanelView — açılış paneli. Oturum özeti: işlenen evrak, karar bekleyen (gerçek HITL sayısı),
   kuyruk SLA dağılımı + eskalasyon listesi, tür/risk/birim dağılımı, işlem süresi + otomasyon
   kazancı, son işlemler. Tüm sayılar gerçek veriden (oturum + DB reconcile); tek varsayım
   otomasyon kartındaki manuel süredir ve ekranda "varsayım" olarak işaretlidir. */
import React from "react";
import NumberFlow from "@number-flow/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, T, V, TYPE, TNUM, SP, RAD, ALFA, DERIN, DERIN_OF, PAL, BANT } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL } from "./result-cards.jsx";

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

// Otomasyon kazancı varsayımı: bir evrakın elle okunup sınıflandırılması, özetlenmesi ve
// cevap taslağının yazılması için ortalama memur süresi (dk). ÖLÇÜM DEĞİL — kart üzerinde
// "varsayım" diye açıkça işaretlenir; ajan süreleri ise gerçek ölçümdür (sure_ms).
const MANUEL_DK_VARSAYIM = 15;

/* Karar bekleyen: taslağı üretilmiş ama memur kararı (onayla/reddet) verilmemiş işlemler.
   duzenle nihai karar değildir → bekleyende kalır. pendingOnay = canlı HITL duraklaması. */
const kararBekleyenSay = (history, pendingOnay) =>
  history.filter((h) => h.result?.yazi_taslak_md && !h.result?.onay_durumu).length + (pendingOnay ? 1 : 0);

function Stat({ label, value, accent, icon }) {
  return (
    <NeonCard>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: accent ? DERIN_OF(accent) : PAL.mut }}>{icon}</span>
        <div>
          {/* number-flow: sayı değişince odometre geçişi (prefers-reduced-motion'a kendisi uyar). */}
          <div style={{ ...TYPE.num, color: PAL.ink }}>{typeof value === "number" ? <NumberFlow value={value} /> : value}</div>
          <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: SP.xs }}>{label}</div>
        </div>
      </div>
    </NeonCard>
  );
}

/* Yatay sayım çubukları (tür/birim dağılımı ortak deseni) — en çok görülen ilk sırada. */
function BarList({ rows, color }) {
  if (!rows.length) return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>—</p>;
  const max = rows[0][1] || 1;
  return rows.map(([label, c]) => (
    <div key={label} title={`${label}: ${c} evrak`} style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
        <span style={{ color: PAL.ink2, fontWeight: 500 }}>{label}</span>
        <span style={{ color: DERIN_OF(color), fontWeight: 500, ...TNUM }}>{c}</span>
      </div>
      <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((c / max) * 100)}%`, background: color, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
      </div>
    </div>
  ));
}

/* Süresi yaklaşan/geçen kuyruk evrağı satırı — yasal dayanak + son tarih + hedefli eylem
   ("İşle" o evrakı Gelen Evrak'ta vurgulayıp kaydırır). */
function SlaSatir({ x, onGoInbox }) {
  const gecikmis = x.sla.durum === "GECIKMIS";
  const renk = gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  const kalanTxt = gecikmis ? `${Math.abs(x.sla.kalan_gun)} gün gecikti` : `son ${x.sla.kalan_gun} gün`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: renk, flexShrink: 0 }} />
      <span title={`${x.sla.etiket} — dayanak: ${x.sla.mevzuat}`} style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
      <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(renk), ...TNUM }}>{kalanTxt}</span>
      {x.sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, flexShrink: 0 }}>son: {x.sla.son_tarih}</span>}
      <Btn onClick={() => onGoInbox(x.id)} ariaLabel={`${x.label} evrakını kuyruğa git ve işle`} style={{ padding: "4px 10px" }}>İşle <Icon.arrow /></Btn>
    </div>
  );
}

/* Kuyruk SLA dağılımı — tek yığın çubuk (normal/kritik/gecikmiş/tanımsız) + sayaçlar +
   eskalasyon listesi. Kuyruğun genel sağlığı tek bakışta; acil yoksa dürüst yeşil not. */
function SlaDagilimKart({ kuyrukSla, onGoInbox }) {
  const [acilRef] = useAutoAnimate();   // satırlar işlendikçe akıcı giriş/çıkış
  const say = { normal: 0, kritik: 0, gecikmis: 0, diger: 0 };
  for (const x of kuyrukSla) {
    if (x.sla.durum === "NORMAL") say.normal++;
    else if (x.sla.durum === "KRITIK") say.kritik++;
    else if (x.sla.durum === "GECIKMIS") say.gecikmis++;
    else say.diger++;
  }
  const acil = kuyrukSla
    .filter((x) => x.sla.durum === "GECIKMIS" || x.sla.durum === "KRITIK")
    .sort((a, b) => (a.sla.kalan_gun ?? 0) - (b.sla.kalan_gun ?? 0));
  const dilimler = [
    { c: BANT.yesil.c, n: say.normal, l: "normal takvim" },
    { c: BANT.sari.c, n: say.kritik, l: "kritik" },
    { c: BANT.kirmizi.c, n: say.gecikmis, l: "gecikmiş" },
    { c: PAL.lineHi, n: say.diger, l: "süre tanımsız" },
  ].filter((d) => d.n > 0);
  const toplam = kuyrukSla.length || 1;
  const accent = say.gecikmis ? BANT.kirmizi.c : say.kritik ? BANT.sari.c : BANT.yesil.c;
  return (
    <NeonCard title="Kuyruk yasal süre durumu" tag={`${kuyrukSla.length} evrak`} accent={accent} icon={<Icon.clock />} style={{ marginBottom: SP.xl }}>
      <div role="img" aria-label={dilimler.map((d) => `${d.n} ${d.l}`).join(", ")}
        style={{ display: "flex", height: 8, borderRadius: RAD.chip, overflow: "hidden", background: PAL.surfHi }}>
        {dilimler.map((d) => <span key={d.l} style={{ width: `${(d.n / toplam) * 100}%`, background: d.c }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.l}px`, marginTop: SP.s }}>
        {dilimler.map((d) => (
          <span key={d.l} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: d.c }} />{d.n} {d.l}
          </span>
        ))}
      </div>
      {acil.length > 0 ? (
        <div style={{ marginTop: SP.m }}>
          <p style={{ margin: "0 0 4px", ...TYPE.meta, color: PAL.mut2 }}>
            Yasal cevap süresi dolan/dolmak üzere olan evraklar — dayanak için satır üzerine gelin.
          </p>
          <div ref={acilRef}>
            {acil.slice(0, 5).map((x) => <SlaSatir key={x.id} x={x} onGoInbox={onGoInbox} />)}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.m, ...TYPE.data, color: DERIN.yesil }}>
          <Icon.check width={14} height={14} /> Kuyruğun tamamı normal takvimde — eskalasyon gerekmiyor.
        </div>
      )}
    </NeonCard>
  );
}

/* İşlem süresi kartı içeriği — hero sayı (tüm ölçümlerin ortalaması) + son koşumların
   mini sütunları. Süre verisi sure_ms hattından gelir; eski kayıtlarda null → dürüst not. */
function SureGrafik({ history }) {
  const olculer = history
    .map((h) => ({ name: h.name, ms: h.result?.sure_ms }))
    .filter((x) => Number.isFinite(x.ms) && x.ms > 0);
  if (olculer.length === 0) {
    return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Süre verisi bu oturumdan itibaren toplanıyor — bir evrak işleyin.</p>;
  }
  const son = olculer.slice(0, 10).reverse(); // eski → yeni (soldan sağa zaman)
  const ort = olculer.reduce((a, x) => a + x.ms, 0) / olculer.length;
  const max = Math.max(...son.map((x) => x.ms));
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
        <span style={{ ...TYPE.num, color: PAL.ink, ...TNUM }}>{(ort / 1000).toFixed(1)} sn</span>
        <span style={{ ...TYPE.meta, color: PAL.mut }}>ortalama · {olculer.length} işlem</span>
      </div>
      <div role="img" aria-label={`Son ${son.length} işlemin süreleri, ortalama ${(ort / 1000).toFixed(1)} saniye`}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, marginTop: SP.m }}>
        {son.map((x, i) => (
          <span key={i} title={`${x.name} — ${(x.ms / 1000).toFixed(1)} sn`}
            style={{ flex: 1, minWidth: 6, height: `${Math.max(6, Math.round((x.ms / max) * 100))}%`, background: T, borderRadius: `${RAD.chip}px ${RAD.chip}px 0 0`, opacity: 0.9 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3, marginTop: SP.xs, ...TNUM }}>
        <span>eski</span><span>son {son.length} koşum</span><span>yeni</span>
      </div>
    </>
  );
}

/* Otomasyon kazancı — ölçülen ajan süresi vs manuel varsayım karşılaştırması + toplam
   tahmini kazanım. Varsayım ekranda açıkça işaretlenir (dürüstlük). */
function KazancKart({ history }) {
  const olculer = history.map((h) => h.result?.sure_ms).filter((ms) => Number.isFinite(ms) && ms > 0);
  if (olculer.length === 0) {
    return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Kazanım, süre ölçümü olan işlemlerden hesaplanır — bir evrak işleyin.</p>;
  }
  const toplamMs = olculer.reduce((a, x) => a + x, 0);
  const ortSn = toplamMs / olculer.length / 1000;
  const kazancDk = Math.max(0, olculer.length * MANUEL_DK_VARSAYIM - toplamMs / 60000);
  const ajanPct = Math.max(1, Math.min(100, (ortSn / (MANUEL_DK_VARSAYIM * 60)) * 100));
  const Cizgi = ({ label, deger, pct, renk }) => (
    <div style={{ marginBottom: SP.s }}>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
        <span>{label}</span><span style={{ color: DERIN_OF(renk), fontWeight: 500, ...TNUM }}>{deger}</span>
      </div>
      <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: renk, borderRadius: RAD.chip }} />
      </div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
        <span style={{ ...TYPE.num, color: PAL.ink, ...TNUM }}>≈ {Math.round(kazancDk)} dk</span>
        <span style={{ ...TYPE.meta, color: PAL.mut }}>tahmini kazanım · {olculer.length} işlem</span>
      </div>
      <div style={{ marginTop: SP.m }}>
        <Cizgi label={`Manuel işlem (varsayım, ~${MANUEL_DK_VARSAYIM} dk/evrak)`} deger={`${MANUEL_DK_VARSAYIM} dk`} pct={100} renk={PAL.lineHi} />
        <Cizgi label="Ajan işleme (gerçek ölçüm, ortalama)" deger={`${ortSn.toFixed(1)} sn`} pct={ajanPct} renk={T} />
      </div>
      <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3 }}>
        Manuel süre sektör varsayımıdır; ajan süreleri sistemin gerçek ölçümüdür (sure_ms).
      </p>
    </>
  );
}

export default function PanelView({ history = [], outbox = [], inboxCount = 0, kuyrukSla = [], draftCount = 0, pendingOnay = false, onGoInbox, onUpload, user }) {
  const n = history.length;
  const gonderilen = outbox.filter((o) => o.durum === "gonderildi").length;
  const kararBekleyen = kararBekleyenSay(history, pendingOnay);
  const risk = { yesil: 0, sari: 0, kirmizi: 0 };
  for (const h of history) if (risk[h.bant] != null) risk[h.bant]++;
  const turler = {};
  for (const h of history) { const t = EVRAK_TR(h.evrak_turu); turler[t] = (turler[t] || 0) + 1; }
  const turList = Object.entries(turler).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const birimler = {};
  for (const h of history) { if (h.hedef_birim) { const b = BIRIM_LBL(h.hedef_birim); birimler[b] = (birimler[b] || 0) + 1; } }
  const birimList = Object.entries(birimler).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const guvenler = history.map((h) => h.result?.tur_confidence).filter((x) => Number.isFinite(x) && x > 0);
  const ortGuven = guvenler.length ? Math.round((guvenler.reduce((a, x) => a + x, 0) / guvenler.length) * 100) : null;
  const [sonRef] = useAutoAnimate();   // yeni işlem satırı akıcı girer (auto-animate)

  return (
    <ViewWrap id="panel-h" title="Panel" sub={`Hoş geldiniz, ${user?.ad_soyad || "memur"} · ${new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}`}
      actions={[
        // Panel'in tek primary'si boş-durumdaki CTA — başlık eylemleri secondary kalır.
        <Btn key="g" onClick={onGoInbox}><Icon.inbox /> Gelen evrak ({inboxCount})</Btn>,
        <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
      ]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: SP.l, marginBottom: SP.xl }}>
        <Stat label="İşlenen evrak" value={n} accent={T} icon={<Icon.doc />} />
        <Stat label="Bekleyen kuyruk" value={inboxCount} icon={<Icon.inbox />} />
        <Stat label="Üretilen taslak" value={draftCount} accent={V} icon={<Icon.scale />} />
        <Stat label="Gönderilen evrak" value={gonderilen} accent={BANT.yesil.c} icon={<Icon.arrow />} />
        <Stat label="Karar bekleyen" value={kararBekleyen} accent={kararBekleyen ? BANT.sari.c : undefined} icon={<Icon.clock />} />
      </div>

      {kuyrukSla.length > 0 && <SlaDagilimKart kuyrukSla={kuyrukSla} onGoInbox={onGoInbox} />}

      {n === 0 ? (
        <EmptyState icon={<Icon.chart />} title="Henüz evrak işlenmedi"
          sub="Gelen Evrak kuyruğundan bir evrak seçerek ya da yeni bir belge yükleyerek başlayın. İşlenen her evrak burada özetlenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrak'ı aç</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px,1fr))", gap: SP.l, alignItems: "start" }}>
          <NeonCard title="Risk dağılımı" accent={T}>
            {["yesil", "sari", "kirmizi"].map((k) => {
              const pct = n ? Math.round((risk[k] / n) * 100) : 0;
              return (
                <div key={k} style={{ marginBottom: SP.m }}>
                  <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
                    <span style={{ color: DERIN_OF(BANT[k].c), fontWeight: 500 }}>{BANT[k].l} · {BANT[k].t}</span><span style={{ ...TNUM }}>{risk[k]} (%{pct})</span>
                  </div>
                  <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: BANT[k].c, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
                  </div>
                </div>
              );
            })}
          </NeonCard>

          <NeonCard title="Evrak türü dağılımı" accent={V} tag={ortGuven != null ? `ort. güven %${ortGuven}` : undefined} tagColor={T}>
            <BarList rows={turList} color={V} />
          </NeonCard>

          <NeonCard title="Birim dağılımı" accent={V} tag="havale edilen">
            <BarList rows={birimList} color={V} />
            {birimList.length > 0 && (
              <p style={{ margin: 0, ...TYPE.meta, color: PAL.mut3 }}>Görev 2 yönlendirmesi — en çok havale alan birimler.</p>
            )}
          </NeonCard>

          <NeonCard title="İşlem süresi" accent={T}>
            <SureGrafik history={history} />
          </NeonCard>

          <NeonCard title="Otomasyon kazancı" accent={T}>
            <KazancKart history={history} />
          </NeonCard>

          <NeonCard title="Son işlemler" accent={T} full>
            <div ref={sonRef}>
            {history.slice(0, 6).map((h) => {
              const bekliyor = h.result?.yazi_taslak_md && !h.result?.onay_durumu;
              return (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />
                  <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  {bekliyor && <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.sari, background: ALFA(BANT.sari.c), borderRadius: RAD.chip, padding: "2px 8px", flexShrink: 0 }}>karar bekliyor</span>}
                  <span style={{ ...TYPE.meta, color: PAL.mut }}>{EVRAK_TR(h.evrak_turu)}</span>
                  <span style={{ ...TYPE.meta, color: DERIN.V, textAlign: "right" }}>{BIRIM_LBL(h.hedef_birim)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400, color: PAL.mut2, flexShrink: 0 }}>{fmtTime(h.ts)}</span>
                </div>
              );
            })}
            </div>
          </NeonCard>
        </div>
      )}
    </ViewWrap>
  );
}
