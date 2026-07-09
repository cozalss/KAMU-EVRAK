/* MuzakereKurulu — "AI Bürokrasi Kurulu": taslak üretilince ÜÇ ajan jüri önünde CANLI müzakere
   eder. Taslakçı taslağı savunur, Hukukçu mevzuattan itiraz eder ("m.4 dayanağın zayıf"),
   Vatandaş Avukatı dili sadeleştirmeye zorlar; itirazlar taslağa UYGULANIR (önce→sonra görünür),
   uzlaşılan taslak MÜHÜRLENİR. Konuşma balonları tur tur açılır → gerçek-zaman müzakere hissi.

   FAZ 1 — DETERMİNİSTİK PROTOTİP (backend'siz, kurgu senaryo): amaç konsepti görmek. Faz 2'de
   aynı UI gerçek `muzakere` node'una bağlanacak (yazi_taslak sonrası; itirazlar verify/mevzuat_dogrula/
   lint sinyallerinden gelir, uzlaşı taslağı → risk_guard → mühür). Kendi kendine oynar + "Yeniden
   oynat"; prefers-reduced-motion → son (mühürlü uzlaşı) kare statik. aria-live ile turlar duyurulur. */
import { useEffect, useMemo, useRef, useState } from "react";
import { MONO, T, V, R, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon, ViewWrap, Btn, focusRing } from "./neonUi.jsx";

// Kişi (vatandaş) ikonu — neonUi setinde yok, yerel.
const KisiIkon = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 19 a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Kurul üyeleri — renk token'ları: Taslakçı gök mavisi (sistem), Hukukçu mühür moru (V, hukuk),
// Vatandaş Avukatı imza mercanı (R, vatandaş).
const KURUL = [
  { id: "taslakci", ad: "Taslakçı", rol: "Taslağı savunur", col: T, Ikon: Icon.doc },
  { id: "hukukcu", ad: "Hukukçu", rol: "Mevzuattan itiraz", col: V, Ikon: Icon.scale },
  { id: "vatandas", ad: "Vatandaş Avukatı", rol: "Dili sadeleştirir", col: R, Ikon: KisiIkon },
];
const UYE = Object.fromEntries(KURUL.map((k) => [k.id, k]));

// Uzlaşıya varılınca "oy veren" üyeler (kurul rozeti onay tikine döner).
const TASLAK_ILK = [
  { id: "ust", metin: "T.C.\n… VALİLİĞİ\nİnsan Kaynakları ve Eğitim Müdürlüğü", sabit: true },
  { id: "sayi", metin: "Sayı : E-2026/1502", sabit: true },
  { id: "konu", metin: "Konu : Bilgi Edinme Başvurusu", sabit: true },
  { id: "ilgi", metin: "İlgi : 09.07.2026 tarihli başvurunuz.", sabit: true },
  { id: "govde1", metin: "İşbu talebinize binaen, tarafınızca talep edilen bilgiler 4982 sayılı Kanun kapsamında değerlendirilmiştir." },
  { id: "govde2", metin: "Söz konusu bilgiler 15 iş günü içinde tarafınıza iletilecektir." },
  { id: "kapanis", metin: "Bilgilerinize saygıyla sunulur.", sabit: true },
];

// Müzakere turları — who: konuşan üye · text: konuşma · edit: taslağa uygulanan değişiklik
// (satirId + yeni metin + vurgu tipi) · oy: bu turda üye uzlaşıya katıldı.
const TURLAR = [
  { who: "taslakci", text: "Taslağı Yön. 2646 formatında hazırladım. 4982 sayılı Kanun kapsamında 15 iş günü içinde yanıt öngörülüyor." },
  { who: "hukukcu", text: "Dayanağın zayıf. Başvuru 3071 sayılı Kanun m.4 dilekçe hakkına dayanıyor; ancak süre için madde yok — 4982 m.11 açıkça yazılmalı.",
    edit: { satirId: "govde2", yeni: "Söz konusu bilgiler, 4982 sayılı Kanun'un 11. maddesi uyarınca 15 iş günü içinde tarafınıza iletilecektir.", vurgu: "dayanak" } },
  { who: "vatandas", text: "Dil çok ağır. 'İşbu talebinize binaen' vatandaşı yıldırır — 'Başvurunuz üzerine' demek yeterli, üstelik daha anlaşılır.",
    edit: { satirId: "govde1", yeni: "Başvurunuz üzerine, talep ettiğiniz bilgiler 4982 sayılı Bilgi Edinme Kanunu kapsamında değerlendirilmiştir.", vurgu: "sade" } },
  { who: "taslakci", text: "Sadeleştirmeyi kabul ediyorum; resmî üslup kapanışta korunuyor. m.11 dayanağını da ekledim." },
  { who: "hukukcu", text: "m.11 eklendi, NLI atıf doğrulaması geçti — dayanak artık sağlam. Onayımı veriyorum.", oy: true },
  { who: "vatandas", text: "Dil sadeleşti, okunabilirlik puanı yükseldi. Vatandaş adına onaylıyorum.", oy: true },
  { who: "taslakci", text: "Uzlaşı taslağı hazır. Mühürlenebilir.", oy: true },
];

const THINK = 900, READ = 1700, SEAL = 800;

// vurgu tipi → aksan rengi + rozet etiketi (dayanak eklendi / dil sadeleştirildi).
const VURGU = {
  dayanak: { col: V, etiket: "dayanak eklendi" },
  sade: { col: R, etiket: "dil sadeleştirildi" },
};

function applyEdit(draft, edit) {
  return draft.map((l) => (l.id === edit.satirId ? { ...l, metin: edit.yeni, vurgu: edit.vurgu } : l));
}
function finalDraft() {
  return TURLAR.reduce((d, t) => (t.edit ? applyEdit(d, t.edit) : d), TASLAK_ILK.map((l) => ({ ...l })));
}
function finalVotes() {
  return Object.fromEntries(TURLAR.filter((t) => t.oy).map((t) => [t.who, true]));
}

function useAzHareket() {
  const [az, setAz] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setAz(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return az;
}

// Üye avatarı — renkli disk + ikon; konuşurken hafif nabız, oy verince köşede onay tiki.
function Avatar({ uye, size = 34, aktif, oy }) {
  return (
    <span aria-hidden="true" style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ width: size, height: size, borderRadius: RAD.dot, background: ALFA(uye.col), border: `1.5px solid ${uye.col}`, color: DERIN_OF(uye.col), display: "flex", alignItems: "center", justifyContent: "center", animation: aktif ? "nu-think 1.2s ease-in-out infinite" : "none" }}>
        <uye.Ikon />
      </span>
      {oy && (
        <span style={{ position: "absolute", right: -3, bottom: -3, width: 15, height: 15, borderRadius: RAD.dot, background: BANT.yesil.c, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${PAL.surf}`, animation: "nu-pop .3s ease-out both" }}>
          <Icon.check width={9} height={9} />
        </span>
      )}
    </span>
  );
}

// Kurul sırası — 3 üye kartı; konuşan üye vurgulanır, oy verenlerde tik.
function KurulSirasi({ speaking, votes }) {
  return (
    <div style={{ display: "flex", gap: SP.s, flexWrap: "wrap" }}>
      {KURUL.map((u) => {
        const aktif = speaking === u.id;
        return (
          <div key={u.id} style={{ flex: "1 1 150px", minWidth: 0, display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderRadius: RAD.card, background: aktif ? ALFA(u.col) : PAL.surf, border: `1px solid ${aktif ? u.col : PAL.line}`, boxShadow: aktif ? SH.card : "none", transition: "background .2s ease-out, border-color .2s ease-out" }}>
            <Avatar uye={u} aktif={aktif} oy={!!votes[u.id]} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.ad}</span>
              <span style={{ display: "block", ...TYPE.meta, color: aktif ? DERIN_OF(u.col) : PAL.mut3 }}>{aktif ? "söz alıyor…" : votes[u.id] ? "uzlaştı" : u.rol}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Tek konuşma balonu — avatar + ad + metin, üyenin renginde sol aksan.
function Balon({ uye, text }) {
  return (
    <div style={{ display: "flex", gap: SP.s, animation: "nu-rise .2s ease-out both" }}>
      <Avatar uye={uye} size={30} />
      <div style={{ minWidth: 0, flex: 1, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `2px solid ${uye.col}`, borderRadius: RAD.card, padding: "8px 12px", boxShadow: SH.card }}>
        <span style={{ display: "block", ...TYPE.meta, fontWeight: 600, color: DERIN_OF(uye.col), marginBottom: 2 }}>{uye.ad}</span>
        <span style={{ ...TYPE.data, color: PAL.ink2 }}>{text}</span>
      </div>
    </div>
  );
}

// "Yazıyor" göstergesi — konuşan üyenin balonu belirmeden önce üç nokta.
function Yaziyor({ uye }) {
  return (
    <div style={{ display: "flex", gap: SP.s, alignItems: "center" }}>
      <Avatar uye={uye} size={30} aktif />
      <div style={{ display: "flex", gap: 4, padding: "10px 14px", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: RAD.dot, background: uye.col, animation: "nu-think 1s ease-in-out infinite", animationDelay: `${i * 0.16}s` }} />
        ))}
      </div>
    </div>
  );
}

// Uzlaşı mührü — taslak kartına basılan yuvarlak ıstampa (mühür moru V).
function Muhur({ az }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: 18, right: 18, width: 92, height: 92, zIndex: 3, color: V, transform: "rotate(-9deg)", animation: az ? "none" : "nu-pop .4s ease-out both" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2.5px solid ${V}`, opacity: 0.9 }} />
      <span style={{ position: "absolute", inset: 8, borderRadius: "50%", border: `1px solid ${V}`, opacity: 0.6 }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".5px", opacity: 0.85 }}>KURUL</span>
        <Icon.check width={22} height={22} />
        <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: ".4px", opacity: 0.85 }}>UZLAŞILDI</span>
      </span>
    </div>
  );
}

// Taslak kartı — satırlar; müzakerede değişen satır aksanla vurgulanır; uzlaşıda mühür.
function TaslakKarti({ draft, sealed, az }) {
  return (
    <div style={{ position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN.T }}><Icon.doc /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Resmî yazı taslağı</h3>
        <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut3 }}>{sealed ? "uzlaşı taslağı" : "müzakere ediliyor"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: SP.s }}>
        {draft.map((l) => {
          const v = l.vurgu ? VURGU[l.vurgu] : null;
          return (
            <div key={l.id} style={{ padding: v ? "6px 10px" : "2px 0", borderRadius: RAD.ctl, background: v ? ALFA(v.col) : "transparent", borderLeft: v ? `2px solid ${v.col}` : "none", transition: "background .3s ease-out" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: l.sabit ? PAL.mut2 : PAL.ink2, whiteSpace: "pre-wrap" }}>{l.metin}</span>
              {v && <span style={{ display: "block", marginTop: 3, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(v.col) }}>✎ {v.etiket}</span>}
            </div>
          );
        })}
      </div>
      {sealed && <Muhur az={az} />}
    </div>
  );
}

export default function MuzakereKurulu() {
  const az = useAzHareket();
  const [runId, setRunId] = useState(0);                    // "Yeniden oynat" → effect'i yeniden koştur
  const [turnIdx, setTurnIdx] = useState(0);                // açığa çıkmış tur sayısı
  const [speaking, setSpeaking] = useState(null);           // o an "yazan" üye id'si
  const [draft, setDraft] = useState(() => TASLAK_ILK.map((l) => ({ ...l })));
  const [votes, setVotes] = useState({});
  const [done, setDone] = useState(false);
  const [sealed, setSealed] = useState(false);
  const feedRef = useRef(null);

  useEffect(() => {
    if (az) {                                               // reduced-motion → uzlaşı + mühür statik
      setTurnIdx(TURLAR.length); setDraft(finalDraft()); setVotes(finalVotes());
      setSpeaking(null); setDone(true); setSealed(true);
      return undefined;
    }
    let alive = true, timer, i = 0;
    setTurnIdx(0); setDraft(TASLAK_ILK.map((l) => ({ ...l }))); setVotes({});
    setSpeaking(null); setDone(false); setSealed(false);
    const step = () => {
      if (!alive) return;
      if (i < TURLAR.length) {
        const t = TURLAR[i];
        setSpeaking(t.who);                                  // önce "yazıyor…"
        timer = setTimeout(() => {
          if (!alive) return;
          setTurnIdx(i + 1);                                 // balonu aç
          if (t.edit) setDraft((d) => applyEdit(d, t.edit)); // itirazı taslağa uygula
          if (t.oy) setVotes((v) => ({ ...v, [t.who]: true }));
          setSpeaking(null);
          i += 1;
          timer = setTimeout(step, READ);
        }, THINK);
      } else {
        setDone(true);
        timer = setTimeout(() => { if (alive) setSealed(true); }, SEAL);
      }
    };
    timer = setTimeout(step, 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [az, runId]);

  // Yeni balon/yazıyor gelince akışı en alta kaydır (canlı sohbet hissi).
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: az ? "auto" : "smooth" }); }, [turnIdx, speaking, az]);

  const gorunenTurlar = useMemo(() => TURLAR.slice(0, turnIdx), [turnIdx]);
  const durum = sealed ? "Uzlaşıldı · mühürlendi" : done ? "Uzlaşıldı" : "Müzakere sürüyor";
  const durumRenk = sealed || done ? BANT.yesil.c : T;

  return (
    <ViewWrap
      id="kurul-baslik"
      title="AI Bürokrasi Kurulu"
      sub="Taslak üretildi — üç ajan uzlaşıya varana dek jüri önünde müzakere eder; itirazlar taslağa uygulanır, uzlaşılan taslak mühürlenir."
      actions={
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", borderRadius: RAD.chip, background: ALFA(durumRenk), ...TYPE.meta, fontWeight: 500, color: DERIN_OF(durumRenk) }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: durumRenk, animation: !done && !az ? "nu-think 1.3s ease-in-out infinite" : "none" }} />
            {durum}
          </span>
          <Btn onClick={() => setRunId((n) => n + 1)}><Icon.spin /> Yeniden oynat</Btn>
        </>
      }
    >
      {/* Ekran okuyucu için canlı müzakere duyurusu */}
      <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {speaking ? `${UYE[speaking].ad} söz alıyor` : turnIdx > 0 ? `${UYE[TURLAR[turnIdx - 1].who].ad}: ${TURLAR[turnIdx - 1].text}` : ""}
        {sealed ? " — Kurul uzlaştı, taslak mühürlendi." : ""}
      </div>

      <KurulSirasi speaking={speaking} votes={votes} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: SP.l, marginTop: SP.l, alignItems: "start" }}>
        {/* Sol — canlı müzakere akışı */}
        <div style={{ background: PAL.bg2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
            <span aria-hidden="true" style={{ display: "flex", color: DERIN.V }}><Icon.scale /></span>
            <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Müzakere</h3>
            <span style={{ marginLeft: "auto", ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>{Math.min(turnIdx, TURLAR.length)}/{TURLAR.length} tur</span>
          </div>
          <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: SP.m, maxHeight: 460, overflowY: "auto", paddingRight: SP.xs }}>
            {gorunenTurlar.map((t, i) => <Balon key={i} uye={UYE[t.who]} text={t.text} />)}
            {speaking && <Yaziyor uye={UYE[speaking]} />}
            {done && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderRadius: RAD.card, background: ALFA(BANT.yesil.c), ...TYPE.data, color: DERIN.yesil, fontWeight: 500, animation: az ? "none" : "nu-rise .2s ease-out both" }}>
                <Icon.check /> Kurul oybirliğiyle uzlaştı — uzlaşı taslağı mühürlendi.
              </div>
            )}
          </div>
        </div>

        {/* Sağ — müzakere ile evrilen taslak */}
        <TaslakKarti draft={draft} sealed={sealed} az={az} />
      </div>
    </ViewWrap>
  );
}
