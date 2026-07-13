/* CanliAjanAkisi — "İşleniyor" görünümü (canlı komuta merkezi ana içeriği).
   SADECE gerçek veri: nodes (canlı SSE/JSON) + ProcessResponse. Sahte demo auto-animasyon YOK —
   evrak işlenmiyorsa anlamlı boş durum ("Gelen Evrak'tan seçin veya yükleyin").
   Sidebar kabuğu DashboardApp'te; bu bileşen <main> içine yerleşir.
   Üst-bar (dosya meta + ilerleme) + 3-panel: SOL kaynak belge ↔ ORTA dinamik sahne ↔ SAĞ
   çıkarılan/risk/taslak+HITL. Orta panel koşum sürerken CANLI AJAN İZİ kartını gösterir
   (demo yıldızı); sonuç gelince iz kartı sol sütuna (kaynak belge altı) iner ve orta paneli
   Ayrıntılı sonuç (NeonDetay gömülü) devralır. */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import NeonDetay from "./NeonDetay.jsx";
import AjanAdimDetay from "./AjanAdimDetay.jsx";
import HataSiniri from "./HataSiniri.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import AltTaslakKarti from "./AltTaslakKarti.jsx";
import { Chip } from "./NeonDetayParts.jsx";

import { MONO, SANS, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY, EmptyState, Btn, Icon, BuyutDugme } from "./neonUi.jsx";
import TurSecici from "./TurSecici.jsx";

/* ——— Evrak hattı: ajan izi, metro hat şeması dilinde ———
   Her ajan bir istasyon; Görev 1 = T hattı, Görev 2 = V hattı. Ray, adımlar tamamlandıkça
   istasyondan istasyona hat rengiyle dolar. İki hat tek kart yüzeyinde yaşar: panel genişse
   yan yana (metro şeması), darsa alt alta; Görev 2'nin başındaki kesikli parça aktarmadır
   (Görev 1 çıktısı bu hatta devreder). Düz dolgu + hairline (gradyan/glow yok); renk tek
   sinyal değil — durum her zaman işaret + metinle de verilir. Geometri: 28px oluk, ray x=13. */
const HAT = { x: 13, w: 2, merkez: 16 };

/* Oluk içi dikey ray parçası: dolu = hat rengi, boş = hairline, kesikli = aktarma.
   akis (SAHNE): dolu ray üzerinde aşağı akan ışık kesikleri — Magic UI "animated beam" /
   Aceternity "tracing beam" deseninin satır-içi uyarlaması (veri hatta akıyor hissi). */
const Ray = ({ top, height, bottom, filled, col, dashed, akis }) => (
  <span aria-hidden="true" style={dashed
    ? { position: "absolute", left: HAT.x, width: 0, top, height, bottom, borderLeft: `2px dashed ${PAL.lineHi}` }
    : { position: "absolute", left: HAT.x, width: HAT.w, top, height, bottom, background: filled ? col : PAL.line, transition: "background .3s ease-out" }}>
    {filled && akis && (
      <span style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundImage: `repeating-linear-gradient(180deg, transparent 0 6px, ${PAL.onAccent} 6px 10px)`, opacity: 0.75, animation: "nu-akis .8s linear infinite" }} />
    )}
  </span>
);

/* İstasyon işareti — dolu disk (bitti/hata, tamamlanma "pop"uyla gelir) · dönen ilerleme
   halkası (çalışıyor) · ara durak (sırada, ray arkadan geçer). key={st}: durum değişince
   remount → pop/halka animasyonu o anda oynar. */
function HatDurak({ st, col }) {
  const orta = { position: "absolute", left: 0, width: 28, display: "flex", justifyContent: "center" };
  if (st === "pending") return <span aria-hidden="true" style={{ ...orta, top: 11 }}><span style={{ width: 10, height: 10, borderRadius: RAD.dot, background: PAL.bg, border: `1px solid ${PAL.lineHi}` }} /></span>;
  if (st === "active") return (
    <span key={st} aria-hidden="true" style={{ ...orta, top: 6 }}>
      <span style={{ position: "relative", width: 20, height: 20 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1s linear infinite" }}>
          <circle cx="10" cy="10" r="8.5" stroke={PAL.line} strokeWidth="2" fill={PAL.bg} />
          <path d="M10 1.5 A8.5 8.5 0 0 1 18.5 10" stroke={col} strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <span style={{ position: "absolute", left: 7, top: 7, width: 6, height: 6, borderRadius: RAD.dot, background: col, animation: "nu-think 1.1s ease-in-out infinite" }} />
      </span>
    </span>
  );
  const Ic = st === "error" ? Icon.x : Icon.check;
  return (
    <span key={st} aria-hidden="true" style={{ ...orta, top: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: RAD.dot, background: st === "error" ? BANT.kirmizi.c : col, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", animation: "nu-pop .35s ease-out both" }}>
        <Ic width={10} height={10} />
      </span>
    </span>
  );
}

/* Hat başlığı — terminal roundeli (hat no) + görev adı + ince ayraç + adım sayısı ve hat süresi.
   devir: Görev 2 hattının başındaki kesikli giriş (Görev 1 çıktısı bu hatta devreder).
   girisAktif: ilk istasyona girildi. */
function HatTerminal({ n, col, count, sure, devir, girisAktif, glow, akis }) {
  const pt = devir ? SP.m : 0;
  return (
    <div style={{ position: "relative", padding: `${pt}px 0 ${SP.s}px`, animation: glow ? "nu-rise .18s ease-out both" : "none" }}>
      {/* Aktarma kesiği yukarı taşar (-10): alt alta dizilimde Görev 1 terminüsünün hemen
          altından başlayıp rozete kadar iner — arada kopuk boşluk kalmaz. */}
      {devir && <Ray top={-(SP.s + 2)} height={pt + SP.s + 4} dashed />}
      <Ray top={pt + 22} bottom={0} filled={girisAktif} col={col} akis={akis} />
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, height: 24 }}>
        <span style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span aria-hidden="true" style={{ position: "relative", width: 20, height: 20, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 12, lineHeight: "20px", fontWeight: 600, textAlign: "center", ...TNUM }}>{n}</span>
        </span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0 }}>{n === 2 ? "Görev 2 · Üret" : "Görev 1 · Anla"}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
        <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0, ...TNUM }}>{count} adım{sure ? ` · ${sure}` : ""}</span>
      </div>
    </div>
  );
}

/* Tek istasyon satırı — oluk (ray + durak) + içerik (ad · süre · sıra no · çıktı özeti).
   Aktif satır SAHNE'de spot alır: tint zemin + hat renginde iç çerçeve + hafif gölge.
   Satır TIKLANABİLİR (role=button + klavye): adım detay modalını açar (AjanAdimDetay). */
function HatIstasyon({ a, i, col, risk, hasTop, topFill, hasBot, glow, akis, onDetay }) {
  const done = a.status === "done", active = a.status === "active", err = a.status === "error";
  // Risk istasyonunun rengi node'un KENDİ bandından; yoksa genel sonuç bandına düşer.
  const nodeBant = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant] : null;
  const durakCol = a.id === "risk_guard" && done ? (nodeBant || risk).c : col;
  const ms = a.t1 - a.t0;
  const sure = done && Number.isFinite(ms) && ms >= 50 ? `${(ms / 1000).toFixed(1)}s` : null;
  const altYazi = done ? (a.out || "tamamlandı") : active ? (a.desc || "çalışıyor…") : err ? "hata · adım başarısız" : (a.desc || "—");
  const altRenk = err ? DERIN.kirmizi : done ? (a.id === "risk_guard" ? DERIN_OF((nodeBant || risk).c) : PAL.mut) : active ? PAL.mut : PAL.mut2;
  const zemin = active ? ALFA(col) : "transparent";
  const spotGolge = active && akis ? `inset 0 0 0 1px ${col}, ${SH.card}` : "none";
  return (
    /* aria-label YOK: role=button adını içerikten alır (ad + süre + çıktı özeti ekran
       okuyucuya aynen gider); "detayını aç" ipucu title'da. focusRing'in onBlur'u gölgeyi
       "none"a çeker — aktif satırın spot iç gölgesi blur'da GERİ yüklenir (DOM mutasyonunu
       React fark etmez, aynı string'e diff çıkmaz). */
    <div role="button" tabIndex={0} onClick={onDetay} title={`${a.label} — adım detayını aç`}
      {...focusRing}
      onBlur={(e) => { e.currentTarget.style.boxShadow = spotGolge; }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetay(); } }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}
      style={{ cursor: "pointer", position: "relative", display: "grid", gridTemplateColumns: "28px 1fr", gap: SP.m, padding: "6px 8px 6px 0", borderRadius: RAD.ctl, background: zemin, boxShadow: spotGolge, transition: "background .25s ease-out, box-shadow .25s ease-out", animation: glow ? `nu-rise .18s ease-out ${Math.min(i * 28, 420)}ms both` : "none" }}>
      <div style={{ position: "relative", minHeight: 40 }}>
        {/* Ray parçaları satırın 6px dikey dolgusuna taşar (-6) → istasyonlar arası boru
            kopukluğu kalmaz, hat kesintisiz akar. */}
        {hasTop && <Ray top={-6} height={HAT.merkez + 6} filled={topFill} col={col} akis={akis} />}
        {hasBot && <Ray top={HAT.merkez} bottom={-6} filled={done} col={col} akis={akis} />}
        <HatDurak st={a.status} col={durakCol} />
      </div>
      <div style={{ minWidth: 0, opacity: a.status === "pending" ? 0.55 : 1, transition: "opacity .2s ease-out" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span style={{ ...TYPE.ui, fontWeight: 500, color: active ? PAL.ink : done ? PAL.ink2 : PAL.mut2, transition: "color .15s ease-out", minWidth: 0 }}>{a.label}</span>
          {active ? (
            <span aria-hidden="true" style={{ marginLeft: "auto", ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0, animation: glow ? "nu-think 1.2s ease-in-out infinite" : "none" }}>işleniyor</span>
          ) : (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: SP.s, flexShrink: 0, fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3, ...TNUM }}>
              {sure && <span>{sure}</span>}
              <span style={{ opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, ...TYPE.data, color: altRenk, animation: active && glow ? "nu-think 1.3s ease-in-out infinite" : "none" }}>{altYazi}</div>
      </div>
    </div>
  );
}

/* Hat sonu — son istasyondan çıkan kısa ray + terminüs çubuğu (hat tamamlanınca dolar). */
const HatSon = ({ col, done, akis }) => (
  <div aria-hidden="true" style={{ position: "relative", height: 12 }}>
    <Ray top={0} height={6} filled={done} col={col} akis={akis} />
    <span style={{ position: "absolute", top: 6, left: HAT.x - 4, width: 10, height: 4, borderRadius: RAD.chip, background: done ? col : PAL.lineHi, transition: "background .3s ease-out" }} />
  </div>
);

/* Tek hat (görev fazı) — terminal başlığı + istasyonlar + terminüs. Kart içindeki grid geniş
   panelde iki hattı yan yana koyar (metro şeması), darda alt alta yığar. Terminüs, hattın
   kendi istasyonları bitince dolar (Görev 1 hattı, Görev 2'yi beklemez); istasyon numarası
   global sıradır (01–16) — iki hat tek koşumun parçaları. */
function HatFaz({ n, items, risk, glow, sahne, sonHat = true, onDetay }) {
  const col = n === 2 ? V : T;
  const ms = items.reduce((s, a) => (a.status === "done" && Number.isFinite(a.t1 - a.t0) ? s + (a.t1 - a.t0) : s), 0);
  const sure = ms >= 100 ? `${ms < 10000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)}s` : null;
  const fazDone = items.length > 0 && items.every((a) => a.status === "done");
  // Akan ışık yalnız SAHNE'de (canlı koşum) — sonuç sonrası sol sütunda hat sakinleşir.
  const akis = sahne && glow;
  return (
    <div style={{ minWidth: 0 }}>
      <HatTerminal n={n} col={col} count={items.length} sure={sure} devir={n === 2}
        girisAktif={items[0]?.status !== "pending"} glow={glow} akis={akis} />
      {items.map((a, j) => (
        /* hasTop ilk istasyonda da açık: terminal rayından gelen hat, istasyona kesintisiz girer. */
        <HatIstasyon key={a.id} a={a} i={a.sira} col={col} risk={risk} hasTop
          topFill={j === 0 ? a.status !== "pending" : items[j - 1].status === "done"}
          hasBot glow={glow} akis={akis} onDetay={() => onDetay(a.sira)} />
      ))}
      {/* Terminüs yalnız koşumun GERÇEK sonunda — devreden hat (Görev 1) bitmez,
          kesikli aktarmayla sonraki hatta bağlanır (metro dili). */}
      {sonHat && <HatSon col={col} done={fazDone} akis={akis} />}
    </div>
  );
}

/* SAHNE telemetrisi — sayaçlar + koşum boyunca işleyen canlı saniye. Node t0/t1 damgaları
   koşum başlangıcına GÖRELİdir; mutlak taban usePipeline.runBase'ten gelir →
   geçen = performance.now() - runBase (saat karıştırılırsa sayaç saçmalar: görülen hata).
   Kendi hook'ları kendi gövdesinde (CanliAjanAkisi'nin erken-dönüş deseni bozulmaz). */
function SahneTelemetri({ busy, allDone, doneCount, total, pct, toplamSn, runBase, glow }) {
  const [, setTik] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [busy]);
  const gecen = busy && Number.isFinite(runBase) && runBase > 0 ? Math.max(0, (performance.now() - runBase) / 1000) : null;
  return (
    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut, ...TNUM, flexShrink: 0 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : (allDone ? BANT.yesil.c : PAL.mut2), animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
      {busy ? "Canlı" : (allDone ? "Tamam" : "Beklemede")} · {String(doneCount).padStart(2, "0")}/{total} · %{pct}
      {gecen != null ? ` · ${gecen.toFixed(0)} sn` : (toplamSn ? ` · ${toplamSn}` : "")}
    </span>
  );
}

/* ——— SAHNE AKIŞI: canlı koşumun "şu an işleyen ajan" görünümü ———
   Dikey metro yerine Now-Playing sahnesi: (1) 16 istasyonluk YATAY hat şeridi — dolu bağlar
   hat rengiyle, üzerinde akan ışık (Magic UI "animated beam" uyarlaması), tamamlanan istasyon
   pop'la gelir, aktif istasyon dönen halka; (2) ortada aktif ajanın büyük spot kartı (ad,
   canlı açıklama, gerçek-zaman süre); (3) yanlarda önceki/sıradaki adım; (4) altta tamamlanan
   çıktı çipleri. Sonuç geldikten sonra sol sütunda dikey metro şeması kullanılır (dar sütun). */
function SahneNokta({ a, col }) {
  // Risk istasyonu kendi bandının rengini alır (backend node verisiyle birebir).
  // title YOK: nokta artık IstasyonSeridi'de buton içinde yaşar — tooltip butondan gelir
  // (iç title dıştakini gölgeliyordu).
  const dotCol = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : col;
  if (a.status === "active") return (
    <span style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 20 20" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1s linear infinite" }}>
        <circle cx="10" cy="10" r="7.5" stroke={PAL.line} strokeWidth="3.5" fill={PAL.surf} />
        <path d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" stroke={dotCol} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
  const done = a.status === "done", err = a.status === "error";
  return (
    <span key={a.status} style={{ width: done || err ? 12 : 9, height: done || err ? 12 : 9, borderRadius: RAD.dot, background: err ? BANT.kirmizi.c : (done ? dotCol : PAL.bg), border: done || err ? "none" : `1px solid ${PAL.lineHi}`, flexShrink: 0, animation: done ? "nu-pop .3s ease-out both" : "none" }} />
  );
}

/* İki istasyon arası yatay bağ — dolu = hat rengi; üzerinde TEK ışık süpürmesi (beam) kayar
   (kesikli desen bağda "kopuk çizgi" gibi okunuyordu). Kesikli = Görev 1→2 aktarması. */
const SahneBag = ({ filled, col, dashed, akis }) => (
  <span aria-hidden="true" style={dashed
    ? { flex: 1, minWidth: 10, height: 0, borderTop: `2px dashed ${PAL.lineHi}`, alignSelf: "center" }
    : { flex: 1, minWidth: 8, height: 3, borderRadius: 1.5, background: filled ? col : PAL.line, position: "relative", overflow: "hidden", transition: "background .3s ease-out" }}>
    {!dashed && filled && akis && (
      <span style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundImage: `linear-gradient(90deg, transparent, ${PAL.onAccent}, transparent)`, backgroundSize: "48px 100%", backgroundRepeat: "no-repeat", opacity: 0.65, animation: "nu-tara 1.6s linear infinite" }} />
    )}
  </span>
);

/* Yatay istasyon şeridi — roundel + noktalar + bağlar; hat rengi göreve göre döner.
   Noktalar tıklanabilir: adım detay modalını açar (canlı koşumda da). */
function IstasyonSeridi({ display, glow, onDetay }) {
  const parcalar = [];
  display.forEach((a, i) => {
    const col = a.gorev === 2 ? V : T;
    const next = display[i + 1];
    if (i === 0 || (display[i - 1] && display[i - 1].gorev !== a.gorev)) {
      parcalar.push(
        <span key={`r${a.gorev}`} aria-hidden="true" style={{ width: 18, height: 18, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 11, lineHeight: "18px", fontWeight: 600, textAlign: "center", flexShrink: 0, ...TNUM }}>{a.gorev}</span>
      );
      parcalar.push(
        <span key={`rl${a.gorev}`} style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0, whiteSpace: "nowrap" }}>{a.gorev === 2 ? "Görev 2 · Üret" : "Görev 1 · Anla"}</span>
      );
      parcalar.push(<SahneBag key={`rb${a.gorev}`} filled={a.status !== "pending"} col={col} akis={glow} />);
    }
    parcalar.push(
      <button key={a.id} type="button" onClick={() => onDetay(a.sira)} title={`${a.label} — detay`}
        aria-label={`${a.label} — adım detayını aç`} {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 0, background: "transparent", border: "none", borderRadius: RAD.dot, flexShrink: 0, transition: "background .12s ease-out" }}>
        <SahneNokta a={a} col={col} />
      </button>
    );
    if (next) parcalar.push(
      <SahneBag key={`b${a.id}`} filled={a.status === "done"} col={next.gorev === 2 ? V : T}
        dashed={next.gorev !== a.gorev} akis={glow} />
    );
  });
  return <div style={{ display: "flex", alignItems: "center", gap: SP.xs, margin: `${SP.xs}px 0 0` }}>{parcalar}</div>;
}

/* Aktif ajan spot kartı — büyük halka/disk + ad + canlı açıklama + gerçek-zaman süre.
   Canlı süre = (performance.now() - runBase) - t0 (t0 koşuma göreli; taban runBase);
   yalnız aktifken 300ms'de bir işler. */
function MerkezKart({ a, total, glow, runBase }) {
  const [, setTik] = useState(0);
  const active = a.status === "active";
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 300);
    return () => clearInterval(id);
  }, [active, a.id]);
  const col = a.gorev === 2 ? V : T;
  const done = a.status === "done", err = a.status === "error";
  // Risk istasyonunda spot kartın rengi/metni node'un kendi bandını yansıtır.
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const relNow = Number.isFinite(runBase) && runBase > 0 ? performance.now() - runBase : null;
  const ms = active && relNow != null && Number.isFinite(a.t0) ? relNow - a.t0
    : (done && Number.isFinite(a.t1 - a.t0) ? a.t1 - a.t0 : null);
  // 100ms altı ölçüm anlamlı değil ("0.0 sn" yazmasın) — deterministik node'lar anlıktır.
  const sure = ms != null && ms >= 100 ? `${(ms / 1000).toFixed(1)} sn` : null;
  const durum = active ? (a.desc || "çalışıyor…") : done ? (a.out || "tamamlandı") : err ? "hata · adım başarısız" : (a.desc || "sırada");
  return (
    <div key={a.id} style={{ flex: "0 1 560px", minWidth: 0, display: "flex", alignItems: "center", gap: SP.l, padding: `${SP.l}px ${SP.xl}px`, borderRadius: RAD.card, background: PAL.surf, boxShadow: `inset 0 0 0 1px ${err ? BANT.kirmizi.c : col}, ${SH.pop}`, animation: glow ? "nu-rise .2s ease-out both" : "none" }}>
      <span aria-hidden="true" style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
        {active ? (
          <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1.1s linear infinite" }}>
            <circle cx="20" cy="20" r="17" stroke={PAL.line} strokeWidth="3.5" fill={PAL.surf} />
            <path d="M20 3 A17 17 0 0 1 37 20" stroke={col} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </svg>
        ) : (done || err) ? (
          <span style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, borderRadius: RAD.dot, background: err ? BANT.kirmizi.c : (bantC || col), color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", animation: glow ? "nu-pop .35s ease-out both" : "none" }}>
            {err ? <Icon.x width={18} height={18} /> : <Icon.check width={18} height={18} />}
          </span>
        ) : (
          /* sırada — içi boş durak (bitti izlenimi veren onay diski YOK) */
          <span style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, borderRadius: RAD.dot, background: PAL.surf, border: `2px solid ${PAL.lineHi}` }} />
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.m }}>
          <span style={{ ...TYPE.h2, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
          <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0, ...TNUM }}>adım {a.sira + 1}/{total}</span>
        </span>
        <span style={{ display: "block", marginTop: 2, ...TYPE.data, color: active ? DERIN_OF(col) : (bantC ? DERIN_OF(bantC) : PAL.mut), animation: active && glow ? "nu-think 1.3s ease-in-out infinite" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{durum}</span>
      </span>
      {sure && <span style={{ ...TYPE.ui, fontWeight: 500, color: PAL.ink2, flexShrink: 0, ...TNUM }}>{sure}</span>}
    </div>
  );
}

/* Yan kart — önceki/sıradaki adımın sessiz özeti. */
function YanKart({ a, rol, sag }) {
  if (!a) return <span aria-hidden="true" style={{ flex: "1 1 140px" }} />;
  const bitti = a.status === "done";
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0, textAlign: sag ? "left" : "right", alignSelf: "center" }}>
      <div style={{ ...TYPE.meta, color: PAL.mut3 }}>{rol}</div>
      <div style={{ ...TYPE.ui, fontWeight: 500, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</div>
      <div style={{ ...TYPE.data, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bitti ? (a.out || "tamamlandı") : "sırada"}</div>
    </div>
  );
}

/* Sahne gövdesi — şerit + (önceki | spot | sıradaki) + tamamlanan çıktı çipleri.
   Şerit noktaları + çıktı çipleri tıklanabilir: adım detay modalını açar. */
function SahneAkis({ display, total, glow, runBase, onDetay }) {
  const aktifIdx = display.findIndex((x) => x.status === "active");
  let sonBiten = -1;
  display.forEach((x, i) => { if (x.status === "done") sonBiten = i; });
  const merkezIdx = aktifIdx >= 0 ? aktifIdx : (sonBiten >= 0 ? sonBiten : 0);
  const merkez = display[merkezIdx];
  const bitenler = display.filter((x) => x.status === "done" && x.sira !== merkezIdx);
  return (
    /* Sahne içeriği ortalanmış okuma sütununda toplanır — kart tam genişlik kalır ama
       16 istasyon dev ekranda uçlara gerilip seyrelmez. */
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xl, width: "100%", maxWidth: 1080, margin: "0 auto" }}>
      <IstasyonSeridi display={display} glow={glow} onDetay={onDetay} />
      <div style={{ display: "flex", alignItems: "stretch", gap: SP.l, flexWrap: "wrap", justifyContent: "center", padding: `${SP.s}px 0` }}>
        <YanKart a={display[merkezIdx - 1]} rol="önceki" />
        {merkez && <MerkezKart a={merkez} total={total} glow={glow} runBase={runBase} />}
        <YanKart a={display[merkezIdx + 1]} rol="sıradaki" sag />
      </div>
      {bitenler.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, justifyContent: "center" }}>
          {/* Çipte aria-label YOK — adı içeriğinden gelir (ad + çıktı özeti SR'a aynen gider) */}
          {bitenler.map((x) => (
            <button key={x.id} type="button" onClick={() => onDetay(x.sira)} title={`${x.label} — adım detayını aç`}
              {...focusRing}
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "3px 10px", borderRadius: RAD.chip, border: `1px solid ${PAL.line}`, background: PAL.surf, ...TYPE.meta, color: PAL.mut, maxWidth: 280, transition: "background .12s ease-out", animation: glow ? "nu-pop .3s ease-out both" : "none" }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(x.gorev === 2 ? V : T) }}><Icon.check width={11} height={11} /></span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}{x.out ? ` · ${x.out}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSegments(metin, spanlar) {
  const segs = [];
  let cur = 0;
  for (const sp of [...spanlar].sort((a, b) => (a.start | 0) - (b.start | 0))) {
    const s = Math.max(cur, Math.min(metin.length, sp.start | 0));
    const e = Math.max(s, Math.min(metin.length, sp.end | 0));
    if (s > cur) segs.push({ t: metin.slice(cur, s) });
    if (e > s) segs.push({ t: metin.slice(s, e), mark: true });
    cur = e;
  }
  if (cur < metin.length) segs.push({ t: metin.slice(cur) });
  return segs;
}

function buildMetaLine(r, fileMeta) {
  const parts = [];
  if (r?.evrak_turu) parts.push(EVRAK_TR(r.evrak_turu));
  if (r?.page_count != null) parts.push(`${r.page_count} sayfa`);
  if (fileMeta?.kind === "file" && fileMeta.size) parts.push(`${(fileMeta.size / (1024 * 1024)).toFixed(1)} MB`);
  else if (fileMeta?.kind === "sample") parts.push(`${fileMeta.size} karakter`);
  if (r?.ocr_confidence != null) parts.push(`OCR %${Math.round(r.ocr_confidence * 100)}`);
  parts.push(fileMeta?.kind === "file" ? "/process_doc/stream" : "/process_doc");
  return parts.join(" · ");
}

/* Boş durum + sürükle-bırak (react-dropzone): dosya bu alana bırakılınca doğrudan işleme
   başlar; tıklama davranışı butonlarda kalır (noClick — yanlışlıkla dosya seçici açılmaz).
   Kabul edilen türler backend ACCEPT listesiyle birebir. */
const DROP_KABUL = {
  "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"], "image/tiff": [".tiff"], "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function BosDurumDropzone({ onGoInbox, onUpload, onFileDrop, onTelefon }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, noClick: true, noKeyboard: true, accept: DROP_KABUL,
    onDrop: (kabul) => { if (kabul?.[0]) onFileDrop(kabul[0]); },
  });
  return (
    <div {...getRootProps()} style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100vh - 1px)", padding: "0 24px", outline: "none", border: `2px dashed ${isDragActive ? T : "transparent"}`, background: isDragActive ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      <input {...getInputProps()} aria-hidden="true" />
      <EmptyState
        icon={<Icon.spin />}
        title={isDragActive ? "Bırakın — işleme başlasın" : "İşlenecek evrak seçilmedi"}
        sub={isDragActive
          ? "PDF, görsel (PNG/JPG/WEBP/TIFF), DOCX veya TXT kabul edilir."
          : "Gelen Evrak kuyruğundan bir evrak seçin, yeni bir belge yükleyin ya da dosyayı bu alana sürükleyip bırakın. Seçtiğiniz evrak burada uçtan-uca, canlı olarak işlenir."}
        actions={[
          <Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>,
          <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
          <Btn key="t" onClick={onTelefon}><Icon.phone /> Telefonla yükle</Btn>,
        ]}
      />
    </div>
  );
}

/* Kaynak belge paneli — PDF yüklendiyse gerçek sayfa görüntüsü (react-pdf, tembel yüklenir,
   ana bundle büyümez) ile çıkarım-vurgulu metin arasında sekme; PDF yoksa eski davranış
   birebir. Kendi hook'ları kendi gövdesinde (CanliAjanAkisi'nin erken-dönüş deseni bozulmaz). */
const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

function KaynakBelge({ fileUrl, segs, busy, glow, onBuyut }) {
  const [sekme, setSekme] = useState("belge");
  const pdfGoster = !!fileUrl && (sekme === "belge" || !segs);
  // İçerik hazırsa panel tıklanabilir → A4 modal (klavye: Enter/Space).
  const tiklanabilir = !!onBuyut && (!!fileUrl || !!segs);
  const acKlavye = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBuyut(); }
  };
  const SekmeBtn = ({ id, label }) => (
    <button type="button" onClick={() => setSekme(id)} aria-pressed={sekme === id} {...focusRing}
      style={{ cursor: "pointer", padding: "2px 10px", borderRadius: RAD.chip, border: `1px solid ${sekme === id ? T : PAL.line}`, background: sekme === id ? ALFA(T) : PAL.surf, color: sekme === id ? DERIN.T : PAL.mut2, ...TYPE.meta, fontWeight: 500, transition: "background .12s ease-out" }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, flex: 1 }}>Kaynak belge</span>
        {fileUrl && segs && (<><SekmeBtn id="belge" label="Belge" /><SekmeBtn id="metin" label="Metin" /></>)}
        {tiklanabilir && <BuyutDugme onClick={onBuyut} label="Kaynak belgeyi A4 görünümde büyüt" />}
      </div>
      <div
        {...(tiklanabilir ? { role: "button", tabIndex: 0, onClick: onBuyut, onKeyDown: acKlavye, title: "Büyüt (A4 görünüm)", ...focusRing } : {})}
        style={{ position: "relative", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, minHeight: 300, aspectRatio: (segs || fileUrl) ? "auto" : "1 / 1.34", cursor: tiklanabilir ? "zoom-in" : "default" }}>
        {pdfGoster ? (
          <Suspense fallback={<div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
            <PdfOnizleme fileUrl={fileUrl} />
          </Suspense>
        ) : segs ? (
          <pre style={{ margin: 0, padding: SP.l, fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {segs.map((sg, i) => sg.mark ? <mark key={i} style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, padding: "0 2px" }}>{sg.t}</mark> : <span key={i}>{sg.t}</span>)}
          </pre>
        ) : (
          <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: SP.s, ...TYPE.data, color: PAL.mut2 }}>
            <div style={{ height: 8, width: "55%", background: PAL.press, borderRadius: RAD.chip, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
            <div style={{ height: 8, width: "40%", background: PAL.press, borderRadius: RAD.chip, marginBottom: SP.xs, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
            {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Metin işlenecek…"}
          </div>
        )}
      </div>
      <div style={{ marginTop: SP.l, padding: SP.m, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: DERIN.T, display: "flex", gap: SP.s, alignItems: "flex-start" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="6" cy="12" r="2.2" fill={T} /><circle cx="12" cy="12" r="2.2" fill={T} /><circle cx="18" cy="12" r="2.2" fill={T} /></svg>
        Kişisel veriler (TCKN, telefon) maskelenerek işleniyor — KVKK uyumlu.
      </div>
    </div>
  );
}

export default function CanliAjanAkisi({
  nodes = [], result = null, busy = false, started = false, runBase = 0,
  riskOutcome = "yesil", fileMeta = null, pendingOnay = null,
  onApprove = () => {}, onEdit = () => {}, onReject = () => {}, onAltKarar = () => {},
  onAltTurUret = () => null, onAltDuzenle = () => {},
  onTurSec = () => {}, turUretiliyor = "", onerilenTur = "",
  onDownload = () => {}, downloading = "", canDownload = false,
  onUpload = () => {}, onGoInbox = () => {}, glow = true, fileUrl = "", onFileDrop = () => {},
  onTelefon = () => {}, onMevzuatAc = null,
  onMevzuatSec = null, seciliMevzuat = [], dayanakUretiliyor = false,
}) {
  // EVRAK İŞLENMİYOR → anlamlı boş durum (sahte demo yok) + sürükle-bırak yükleme alanı.
  if (!started) {
    return <BosDurumDropzone onGoInbox={onGoInbox} onUpload={onUpload} onFileDrop={onFileDrop} onTelefon={onTelefon} />;
  }

  const risk = BANT[riskOutcome] || BANT.yesil;
  const display = nodes.map((n, i) => ({
    id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
    // data: SSE node yükü OLDUĞU GİBİ taşınır — adım detay modalı (AjanAdimDetay) zengin
    // görünümü bundan kurar (canlı koşumda result henüz yokken tek veri kaynağı budur).
    data: n.data || null,
    out: summarize(n.id, n.data), desc: n.desc || "", t0: n.t0, t1: n.t1, sira: i,
    // risk_guard istasyonu KENDİ bandını taşır — koşum sırasında genel sonuç bandı henüz
    // oluşmadığından node verisi tek doğru kaynak (backend ile birebir uyum).
    bant: n.data?.risk_metadata?.bant || null,
  }));
  const gorevler = [...new Set(display.map((a) => a.gorev))];
  const total = display.length || 1;
  const doneCount = display.filter((a) => a.status === "done").length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = !busy && doneCount >= total;
  // Uçtan-uca gerçek koşum süresi (usePipeline t0/t1 damgaları; yoksa sessizce gizlenir).
  const toplamSn = (() => {
    if (!allDone) return null;
    const t0s = display.map((a) => a.t0).filter(Number.isFinite);
    const t1s = display.map((a) => a.t1).filter(Number.isFinite);
    if (!t0s.length || !t1s.length) return null;
    const sn = (Math.max(...t1s) - Math.min(...t0s)) / 1000;
    return sn >= 0.1 ? `${sn < 10 ? sn.toFixed(1) : Math.round(sn)} sn` : null;
  })();
  const statusText = busy ? "İşleniyor · " + String(doneCount).padStart(2, "0") + "/" + total : (allDone ? "Tamamlandı" : "Sırada");

  // A4 belge modalı — "kaynak" | "taslak" | null (paneller tıklanınca açılır).
  const [belgeModal, setBelgeModal] = useState(null);
  // Ajan izi adım detay modalı — display index'i (istasyon/nokta/çip tıklanınca açılır).
  const [detayIdx, setDetayIdx] = useState(null);
  const km = result?.kanit_metadata;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const draftMd = result?.yazi_taslak_md;
  // Çok-konulu evrakta birim başına ayrı üst yazı taslağı — her biri kendi HITL kararını taşır.
  const altTaslaklar = (result?.alt_talepler || []).filter((a) => a?.yazi_taslak_md);
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  const metaLine = buildMetaLine(result, fileMeta);
  // Panel kartları (ajan izi + sağ sütun) — düz beyaz yüzey + 1px hairline (border-first), NeonCard ile tutarlı.
  const card = { position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: SP.l, boxShadow: SH.card };

  return (
    <>
      {/* SR: canlı ilerleme */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {(() => {
          const ai = display.findIndex((a) => a.status === "active");
          if (ai >= 0) return `${display[ai].label} çalışıyor — adım ${ai + 1} / ${total}`;
          if (allDone) return `İşleme tamamlandı — ${total} ajan başarıyla yürütüldü.`;
          return "";
        })()}
      </div>

      {/* Üst durum çubuğu */}
      <header style={{ padding: "16px 24px", borderBottom: `1px solid ${PAL.line}`, background: PAL.bg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: PAL.mut }}>
              <Icon.doc width={18} height={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: "18px", color: PAL.ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{fileLabel}</h2>
              <span style={{ display: "block", marginTop: 2, ...TYPE.meta, color: PAL.mut2 }}>{metaLine}</span>
            </span>
            <span style={{ marginLeft: SP.s, flexShrink: 0 }}>
              <Chip c={allDone ? BANT.yesil.c : busy ? T : PAL.mut2} label={`Durum: ${statusText}`}>
                {allDone ? <Icon.check width={12} height={12} />
                  : busy ? <Icon.spin width={12} height={12} />
                  : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.mut2 }} />}
                {statusText}
              </Chip>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
            <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: T }} />Görev 1 · Anla
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: V, marginLeft: SP.xs }} />Görev 2 · Üret
            </span>
            <span aria-hidden="true" style={{ width: 1, height: 20, background: PAL.line, flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
              {/* Telefonla çek — işlem sürerken kapalı: one-shot indirme busy'de sessizce
                  düşer (dosya kaybı); tamamlanınca yeni evrak telefondan da eklenebilsin. */}
              <button onClick={onTelefon} disabled={busy} aria-label="Telefonla evrak yükle" {...focusRing}
                title={busy ? "İşlem sürerken telefonla yükleme başlatılamaz" : "Telefonla yükle"}
                onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = PAL.hov; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
                style={{ cursor: busy ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: busy ? PAL.mut3 : PAL.mut, transition: "background .12s ease-out" }}>
                <Icon.phone />
              </button>
              <button onClick={onUpload} aria-label="Yeni evrak yükle" {...focusRing} title="Yeni evrak"
                onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.mut, transition: "background .12s ease-out" }}>
                <Icon.upload />
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.m }}>
          <div aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: RAD.chip, background: PAL.press, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: RAD.chip, background: allDone ? BANT.yesil.c : T, transition: "width .4s ease-out, background .2s ease-out" }} />
          </div>
          <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, flexShrink: 0, minWidth: 38, textAlign: "right", ...TNUM }}>{pct}%</span>
        </div>
      </header>

      {/* 3 panel — komuta merkezi. flex-wrap: geniş ekranda yan yana, dar ekranda alt alta.
          Ajan izi kartı DİNAMİK konumlanır: koşum sürerken (sonuç yok) ORTA panelde sahne
          alır — canlı demo yıldızı; sonuç gelince SOL sütuna (kaynak belge altı) iner ve
          orta paneli Ayrıntılı sonuç devralır. */}
      {(() => {
        const sahne = !result;   // koşum sahnesi: iz ortada, akan ışık + spot + nokta-ızgara zemin
        const izKart = (
          <section aria-label="Ajan izi" style={sahne
            ? { ...card, width: "100%", backgroundImage: `radial-gradient(${ALFA(T)} 1px, transparent 1.5px)`, backgroundSize: "22px 22px" }
            : card}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.l, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.route /></span>
              <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Ajan izi</h3>
              <SahneTelemetri busy={busy} allDone={allDone} doneCount={doneCount} total={total}
                pct={pct} toplamSn={toplamSn} runBase={runBase} glow={glow} />
            </div>
            {sahne ? (
              /* Koşum sahnesi: yatay istasyon şeridi + aktif ajan spotu + çıktı çipleri. */
              <SahneAkis display={display} total={total} glow={glow} runBase={runBase} onDetay={setDetayIdx} />
            ) : (
              /* Sonuç sonrası (sol sütun): dikey metro şeması — dar sütuna uyar. */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 460px))", justifyContent: "center", columnGap: SP.xxxl, rowGap: SP.s }}>
                {gorevler.map((g) => (
                  <HatFaz key={g} n={g} items={display.filter((a) => a.gorev === g)} risk={risk} glow={glow} sahne={false}
                    sonHat={g === gorevler[gorevler.length - 1]} onDetay={setDetayIdx} />
                ))}
              </div>
            )}
          </section>
        );
        // Resmî yazı taslağı + HITL kararı = Görev 2 (üretim) çıktısı. Tek yerde tanımlanır;
        // SONUÇ sonrası MERKEZE (ayrıntılı sonucun/Görev 2'nin ALTINA) yerleşir, koşum sırasında
        // sağ sütunda "üretiliyor" olarak kalır. Sağ sütun sonuç gelince tümüyle kaldırılır.
        const taslakBlok = (
          <>
            {altTaslaklar.length < 2 && (
              <div style={{ ...card, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                {/* Başlık şeridi — kutusuz ikon + başlık + A4 büyüt düğmesi. */}
                <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}` }}>
                  <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.V }}><Icon.doc /></span>
                  <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 0 }}>Resmî yazı taslağı{result?.yazi_turu ? ` · ${YAZI_TR(result.yazi_turu)}` : ""}</span>
                  {draftMd && <BuyutDugme onClick={() => setBelgeModal("taslak")} label="Resmî yazı taslağını A4 görünümde büyüt" />}
                </div>
                {/* Kağıt tezgahı — beyaz A4 sayfası tint zemin üstünde yüzer; içerik ortalanmış,
                    gerçek A4 oranında (~800px) okunur kolon → geniş merkezde full-width stretch
                    ve dead-space olmaz. Belge "arayüz kartı" değil "evrak" gibi durur. */}
                <div style={{ background: PAL.bg2, padding: `${SP.l}px ${SP.l}px ${SP.xl}px` }}>
                  {draftMd && (
                    <div style={{ maxWidth: 800, margin: `0 auto ${SP.l}px` }}>
                      <TurSecici secili={result?.yazi_turu} onerilen={onerilenTur}
                        uretilen={turUretiliyor} onSec={onTurSec} />
                    </div>
                  )}
                  {draftMd ? (
                    <div role="button" tabIndex={0} title="Büyüt (A4 görünüm)" {...focusRing}
                      onClick={() => setBelgeModal("taslak")}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBelgeModal("taslak"); } }}
                      style={{ maxWidth: 800, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "52px 68px", boxShadow: SH.pop, cursor: "zoom-in", animation: "nu-rise .16s ease-out both", opacity: (turUretiliyor || dayanakUretiliyor) ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
                      <pre style={{ ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{cleanDemoText(draftMd)}</pre>
                    </div>
                  ) : (
                    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: SP.s, justifyContent: "center", ...TYPE.data, color: PAL.mut2, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.card, padding: SP.xxl, background: PAL.surf }}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: RAD.dot, background: PAL.mut2, animation: "nu-think 1.2s ease-in-out infinite" }} />
                      Taslak, "Yazı Taslağı" adımında üretilecek…
                    </div>
                  )}
                </div>
                {/* HITL karar footer — içerik paper ile hizalı (max 800, ortalı): Reddet sağ
                    kenardan uzaklaşır → sağ-alt sohbet FAB'ıyla çakışmaz; belge kolonuyla hizalı. */}
                <div style={{ padding: `${SP.m}px ${SP.l}px ${SP.l}px`, borderTop: `1px solid ${PAL.line}` }}>
                  <div style={{ maxWidth: 800, margin: "0 auto" }}>
                  <div id="cak-hitl-desc" style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: V, flexShrink: 0 }} />
                    Yapay zekâ <strong style={{ color: PAL.ink2, fontWeight: 600 }}>öneriyor</strong> — yetkili memur <strong style={{ color: PAL.ink2, fontWeight: 600 }}>karar verir</strong> (HITL)
                  </div>
                  <div style={{ display: "flex", gap: SP.s, marginTop: SP.s }}>
                    <button onClick={onApprove} disabled={!decisionReady} aria-label="Taslağı onayla ve gönder" aria-describedby="cak-hitl-desc" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.Th; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.T; }}
                      style={{ flex: 1, cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: "none", ...TYPE.ui, fontWeight: 500, color: decisionReady ? PAL.onAccent : PAL.mut2, background: decisionReady ? DERIN.T : PAL.press, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>Onayla &amp; gönder</button>
                    <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" aria-describedby="cak-hitl-desc" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>Düzenle</button>
                    <button onClick={onReject} disabled={!decisionReady} aria-label="Taslağı reddet" aria-describedby="cak-hitl-desc" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? DERIN.kirmizi : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>Reddet</button>
                  </div>
                  </div>
                </div>
              </div>
            )}
            {altTaslaklar.map((a, i) => (
              <AltTaslakKarti key={i} altTalep={a}
                onTurUret={(tur) => onAltTurUret(a, tur)}
                onOnaylaGonder={(metin, tur) => onAltKarar(a, metin, "onayla", i + 1, tur)}
                onReddet={(metin, tur) => onAltKarar(a, metin, "reddet", i + 1, tur)}
                onDuzenle={(metin, tur) => onAltDuzenle(a, metin, tur, i + 1)} />
            ))}
          </>
        );
        return (
          <section style={{ minHeight: "calc(100vh - 132px)" }}>
            <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap" }}>

              {/* Sol sütun — kaynak belge; sonuç geldikten sonra altına ajan izi iner */}
              <div style={{ flex: "1 1 320px", minWidth: 0, borderRight: `1px solid ${PAL.line}`, padding: SP.l, display: "flex", flexDirection: "column", gap: SP.l }}>
                <KaynakBelge fileUrl={fileUrl} segs={segs} busy={busy} glow={glow} onBuyut={() => setBelgeModal("kaynak")} />
                {result && izKart}
              </div>

              {/* Orta panel — koşum sürerken canlı ajan izi (panel üstünde tam genişlik,
                  içerik boyu beyaz dikdörtgen); sonuç gelince ayrıntılı sonuç */}
              {/* Alt dolgu 96px: sağ-altta sabit sohbet FAB'ının (ChatbotWidget, ~82px erişim)
                  son satırı (Reddet/HITL) örtmesini önler — içerik FAB'ın üstünde kalır. */}
              <div style={{ flex: "99 1 480px", minWidth: 0, padding: "16px 24px 96px", display: "flex", flexDirection: "column", gap: SP.l }}>
                {result ? (
                  <HataSiniri baslik="Ayrıntılı sonuç gösterilemedi">
                    <NeonDetay embedded result={result} onMevzuatAc={onMevzuatAc}
                      onMevzuatSec={onMevzuatSec} seciliMevzuat={seciliMevzuat} />
                  </HataSiniri>
                ) : izKart}
                {/* Resmî yazı taslağı + HITL — Görev 2 (üretim) çıktısı: ayrıntılı sonucun
                    (Görev 2'nin) ALTINA yerleşir. Sağ sütun kaldırıldı; taslak buraya taşındı. */}
                {result && taslakBlok}
              </div>

          {/* Sağ sütun tümüyle kaldırıldı (kullanıcı isteği): sonuçta çıkarılan veri merkezde
              kanonik (duplikasyondu) + taslak Görev 2 altında; koşumda da gereksiz görüldü.
              Sayfa artık HER durumda 2 sütun: sol (kaynak + ajan izi) · merkez (ajan izi/sonuç). */}
            </div>
          </section>
        );
      })()}

      {/* Ajan izi adım detayı — istasyon/nokta/çip tıklanınca; ←/→ ile adımlar arasında
          gezinilir. Koşum CANLI sürerken de açılabilir (içerik node bittikçe dolar). */}
      {detayIdx != null && display[detayIdx] && (
        <AjanAdimDetay idx={detayIdx} display={display} result={result}
          onKapat={() => setDetayIdx(null)} onGit={setDetayIdx} />
      )}

      {/* A4 belge modalları — kaynak belge (maskeli metin / gerçek PDF sayfası) + resmî yazı
          taslağı (PDF/DOCX indirme kısayollu). Tetikleyiciler: panel tıklaması / büyüt düğmesi. */}
      <BelgeModal acik={belgeModal === "kaynak"} baslik="Kaynak belge" dosyaAdi={fileLabel} mono
        metin={km?.metin || ""} segmentler={segs} fileUrl={fileUrl} onKapat={() => setBelgeModal(null)} />
      <BelgeModal acik={belgeModal === "taslak"} baslik="Resmî yazı taslağı" dosyaAdi={fileLabel}
        metin={draftMd ? cleanDemoText(draftMd) : ""} onKapat={() => setBelgeModal(null)}
        eylemler={draftMd ? (
          <>
            <ScrimDugme onClick={() => onDownload("pdf")} disabled={!canDownload || downloading === "pdf"} title="Resmî yazıyı PDF indir">
              {downloading === "pdf" ? "indiriliyor…" : "PDF indir"}
            </ScrimDugme>
            <ScrimDugme onClick={() => onDownload("docx")} disabled={!canDownload || downloading === "docx"} title="Resmî yazıyı DOCX indir">
              {downloading === "docx" ? "indiriliyor…" : "DOCX"}
            </ScrimDugme>
          </>
        ) : null} />
    </>
  );
}
