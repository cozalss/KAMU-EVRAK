/* MuzakereKurulu — "AI Bürokrasi Kurulu", Taslaklar akışına gömülü müzakere katmanı.
   Taslak kartında "Kurulu topla" → KurulModal açılır: üç kurul üyesi O taslağın GERÇEK
   pipeline sinyalleri (verify uydurma-veto · lint-2646 · NLI · tutarlılık · risk bandı)
   üzerinden müzakere eder — Taslakçı savunur, Hukukçu mevzuat/format itirazlarını yürütür,
   Vatandaş Avukatı üslup denetiminin gerçek sonucunu konuşur; itirazlar taslağa UYGULANIR,
   karar risk bandı + çözülmemiş itiraza bağlıdır (oybirliği / ŞERHLİ uzlaşı / mühürsüz sevk).
   Uzlaşıda değişiklik varsa "Uzlaşı taslağını uygula" MEMUR ONAYIYLA taslağın üzerine yazar
   (HITL — kurul hiçbir zaman doğrudan uygulamaz).

   Kurgu motoru: src/lib/muzakere.js (saf, node --test'li). Animasyon state'i KurulSahnesi'nde
   yaşar; modal her açılış/oynatışta sahneyi key ile sıfırdan kurar (eski-kare sızıntısı yok).
   Modal a11y BelgeModal deseni: role=dialog + aria-modal, Esc ve dış-tık kapatır, açılışta
   odak kapat düğmesine, kapanışta tetikleyiciye döner, body scroll kilitlenir.
   prefers-reduced-motion → son (karar) kare statik; turlar aria-live ile duyurulur. */
import { useEffect, useMemo, useRef, useState } from "react";
import { MONO, T, V, R, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon, Btn } from "./neonUi.jsx";
import { ScrimDugme } from "./BelgeModal.jsx";
import { muzakereKurgusu, editUygula, nihaiTaslak, uzlasiMetni } from "../lib/muzakere.js";

// Kişi (vatandaş) ikonu — neonUi setinde yok, yerel.
const KisiIkon = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 19 a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Kurul üyeleri ↔ gerçek pipeline ajanları eşlemesi (rol satırında görünür — dürüst kurgu).
const KURUL = [
  { id: "taslakci", ad: "Taslakçı", rol: "yazı ajanı · taslağı savunur", col: T, Ikon: Icon.doc },
  { id: "hukukcu", ad: "Hukukçu", rol: "verify + 2646 + NLI · itiraz yürütür", col: V, Ikon: Icon.scale },
  { id: "vatandas", ad: "Vatandaş Avukatı", rol: "üslup denetimi · vatandaş gözü", col: R, Ikon: KisiIkon },
];
const UYE = Object.fromEntries(KURUL.map((k) => [k.id, k]));

const THINK = 900, READ = 1700, SEAL = 800;

// vurgu tipi → aksan rengi + rozet etiketi (kaynağına sadık: format ≠ sadeleştirme).
const VURGU = {
  dayanak: { col: V, etiket: "dayanak eklendi" },
  format: { col: V, etiket: "2646 format düzeltmesi" },
  sade: { col: R, etiket: "dil sadeleştirildi" },   // yalnız örnek kurguda üretilir (lib)
};

// Tutanak öneri tipi → semantik renk + etiket (düzelt=amber · ekle=yeşil · çıkar=kırmızı).
const TIP = {
  duzelt: { etiket: "Düzelt", col: BANT.sari.c },
  ekle: { etiket: "Ekle", col: BANT.yesil.c },
  cikar: { etiket: "Çıkar", col: BANT.kirmizi.c },
};
const TIP_SIRA = ["cikar", "ekle", "duzelt"];   // en sert eylem en üstte

// Karar → durum çipi + mühür görünümü + kapanış bandı (risk_guard sözleşmesiyle hizalı).
const KARAR = {
  uzlasti: { durum: "Uzlaşıldı · mühürlendi", renk: BANT.yesil.c, muhur: "UZLAŞILDI", muhurCol: V, bant: "Kurul oybirliğiyle uzlaştı — uzlaşı taslağı mühürlendi." },
  serhli: { durum: "Şerhli uzlaşı · mühürlendi", renk: BANT.sari.c, muhur: "ŞERHLİ UZLAŞI", muhurCol: BANT.sari.c, bant: "Kurul şerhle uzlaştı — kalan uyarılar memur incelemesine not düşüldü." },
  sevk: { durum: "Memur onayına sevk", renk: BANT.kirmizi.c, muhur: null, muhurCol: null, bant: "Kurul uzlaşamadı — kırmızı risk nedeniyle dosya mühürsüz olarak memur onayına sevk edildi." },
};

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
              <span style={{ display: "block", ...TYPE.meta, color: aktif ? DERIN_OF(u.col) : PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aktif ? "söz alıyor…" : votes[u.id] ? "uzlaştı" : u.rol}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Tek konuşma balonu — avatar + ad + metin + kaynak sinyal rozeti (izlenebilirlik).
function Balon({ uye, text, kaynak }) {
  return (
    <div style={{ display: "flex", gap: SP.s, animation: "nu-rise .2s ease-out both" }}>
      <Avatar uye={uye} size={30} />
      <div style={{ minWidth: 0, flex: 1, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `2px solid ${uye.col}`, borderRadius: RAD.card, padding: "8px 12px", boxShadow: SH.card }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: 2 }}>
          <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(uye.col) }}>{uye.ad}</span>
          {kaynak && kaynak !== "ornek" && <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "14px", color: PAL.mut3 }}>· {kaynak}</span>}
        </span>
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

// Uzlaşı mührü — taslak kartına basılan yuvarlak ıstampa; şerhli uzlaşıda sarı ton.
function Muhur({ az, etiket, col }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: 18, right: 18, width: 92, height: 92, zIndex: 3, color: col, transform: "rotate(-9deg)", animation: az ? "none" : "nu-pop .4s ease-out both" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2.5px solid ${col}`, opacity: 0.9 }} />
      <span style={{ position: "absolute", inset: 8, borderRadius: "50%", border: `1px solid ${col}`, opacity: 0.6 }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".5px", opacity: 0.85 }}>KURUL</span>
        <Icon.check width={22} height={22} />
        <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: ".4px", opacity: 0.85, textAlign: "center" }}>{etiket}</span>
      </span>
    </div>
  );
}

/* Kurul Tutanağı — tartışmanın SONUCU: taslakta neyin düzeltilmesi/eklenmesi/çıkarılması
   gerektiği, tip-renkli satırlar + kaynak sinyal rozetiyle (her öneri izlenebilir).
   Edit-destekli düzeltmeler müzakerede taslağa işlenmiştir; kalıcı yazım MEMUR kararıdır. */
function KurulTutanagi({ kurgu, kararUi, az, onUygula }) {
  const oneriler = Array.isArray(kurgu.oneriler) ? kurgu.oneriler : [];
  const sirali = TIP_SIRA.flatMap((t) => oneriler.filter((o) => o.tip === t));
  const editSayisi = kurgu.turlar.filter((t) => t.edit).length;
  const uygulanabilir = kurgu.karar !== "sevk" && editSayisi > 0 && !!onUygula;
  const sayim = TIP_SIRA
    .map((t) => ({ t, n: oneriler.filter((o) => o.tip === t).length }))
    .filter((x) => x.n)
    .map((x) => `${x.n} ${TIP[x.t].etiket.toLocaleLowerCase("tr-TR")}`)
    .join(" · ");

  return (
    <section aria-label="Kurul tutanağı" style={{ marginTop: SP.l, background: PAL.surf, border: `1px solid ${PAL.line}`, borderTop: `2px solid ${kararUi.renk}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l, animation: az ? "none" : "nu-rise .25s ease-out both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: sirali.length ? SP.m : 0 }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN_OF(kararUi.renk) }}><Icon.scale /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Kurul tutanağı</h3>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(kararUi.renk), background: ALFA(kararUi.renk), borderRadius: RAD.chip, padding: "2px 8px" }}>{kararUi.durum}</span>
        {sayim && <span style={{ marginLeft: "auto", ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>{sayim}</span>}
      </div>

      {sirali.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: DERIN.yesil }}>
          <Icon.check width={15} height={15} /> Kurul değişiklik önermedi — taslak olduğu gibi uygun görüldü.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sirali.map((o, i) => {
            const t = TIP[o.tip] || TIP.duzelt;
            return (
              <div key={`${o.tip}-${o.kaynak}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "8px 0", borderTop: i ? `1px solid ${PAL.line}` : "none" }}>
                <span style={{ flex: "none", marginTop: 1, ...TYPE.meta, fontWeight: 600, color: DERIN_OF(t.col), background: ALFA(t.col), borderRadius: RAD.chip, padding: "2px 8px", minWidth: 52, textAlign: "center" }}>{t.etiket}</span>
                <span style={{ flex: 1, minWidth: 0, ...TYPE.data, color: PAL.ink2 }}>
                  {o.metin}
                  {o.uygulanabilir && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: SP.s, ...TYPE.meta, fontWeight: 500, color: DERIN.yesil }}>
                      <Icon.check width={11} height={11} /> müzakerede işlendi
                    </span>
                  )}
                </span>
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, lineHeight: "18px", color: PAL.mut3 }}>{o.kaynak}</span>
              </div>
            );
          })}
        </div>
      )}

      {(uygulanabilir || kurgu.karar === "sevk") && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          {kurgu.karar === "sevk" ? (
            <span style={{ ...TYPE.data, color: DERIN.kirmizi }}>Mühür basılmadı — tutanak, dosyayla birlikte memur onayına sunulur.</span>
          ) : (
            <>
              <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kalıcı yazım memur kararıdır — kurul hiçbir değişikliği kendiliğinden uygulamaz.</span>
              <span style={{ marginLeft: "auto" }}>
                <Btn primary accent={kararUi.renk} onClick={onUygula}>
                  <Icon.check /> Uzlaşı taslağını uygula ({editSayisi} düzeltme)
                </Btn>
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Taslak kartı — satırlar; müzakerede değişen satır aksanla vurgulanır; uzlaşıda mühür.
function TaslakKarti({ draft, sealed, kararUi, az }) {
  return (
    <div style={{ position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN.T }}><Icon.doc /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Resmî yazı taslağı</h3>
        <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut3 }}>{sealed ? "uzlaşı taslağı" : "müzakere ediliyor"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: SP.s, maxHeight: 440, overflowY: "auto" }}>
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
      {sealed && kararUi.muhur && <Muhur az={az} etiket={kararUi.muhur} col={kararUi.muhurCol} />}
    </div>
  );
}

/* Müzakere sahnesi — animasyon state'inin TEK sahibi. Çağıran, oynatma/taslak değişince
   key verir → sahne sıfırdan kurulur (effect-içi reset ve eski-kare sızıntısı yoktur). */
function KurulSahnesi({ kurgu, az, onUygula }) {
  // KARAR girdileri modül-seviyesi sabit nesnelerdir → kararUi/muhur referansı render'lar
  // arasında kararlıdır; effect bağımlılığında güvenle kullanılır (taze nesne DEĞİL).
  const kararUi = KARAR[kurgu.karar] || KARAR.uzlasti;
  const TURLAR = kurgu.turlar;
  const [turnIdx, setTurnIdx] = useState(az ? TURLAR.length : 0);   // açığa çıkmış tur sayısı
  const [speaking, setSpeaking] = useState(null);                    // o an "yazan" üye id'si
  const [draft, setDraft] = useState(() => (az ? nihaiTaslak(kurgu) : kurgu.taslak.map((l) => ({ ...l }))));
  const [votes, setVotes] = useState(() => (az ? Object.fromEntries(TURLAR.filter((t) => t.oy).map((t) => [t.who, true])) : {}));
  const [done, setDone] = useState(az);
  const [sealed, setSealed] = useState(az && !!kararUi.muhur);
  const feedRef = useRef(null);

  useEffect(() => {
    if (az) return undefined;                                        // reduced-motion → son kare statik
    let alive = true, timer, i = 0;
    const step = () => {
      if (!alive) return;
      if (i < TURLAR.length) {
        const t = TURLAR[i];
        setSpeaking(t.who);                                          // önce "yazıyor…"
        timer = setTimeout(() => {
          if (!alive) return;
          setTurnIdx(i + 1);                                         // balonu aç
          if (t.edit) setDraft((d) => editUygula(d, t.edit));        // itirazı taslağa uygula
          if (t.oy) setVotes((v) => ({ ...v, [t.who]: true }));
          setSpeaking(null);
          i += 1;
          timer = setTimeout(step, READ);
        }, THINK);
      } else {
        setDone(true);
        if (kararUi.muhur) timer = setTimeout(() => { if (alive) setSealed(true); }, SEAL);
      }
    };
    timer = setTimeout(step, 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [az, TURLAR, kararUi.muhur]);

  // Yeni balon/yazıyor gelince akışı en alta kaydır (canlı sohbet hissi).
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: az ? "auto" : "smooth" }); }, [turnIdx, speaking, az]);

  const gorunenTurlar = useMemo(() => TURLAR.slice(0, turnIdx), [TURLAR, turnIdx]);
  const durum = done ? kararUi.durum : "Müzakere sürüyor";
  const durumRenk = done ? kararUi.renk : T;

  return (
    <div>
      {/* Ekran okuyucu için canlı müzakere duyurusu */}
      <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {speaking ? `${UYE[speaking].ad} söz alıyor` : turnIdx > 0 ? `${UYE[TURLAR[turnIdx - 1].who].ad}: ${TURLAR[turnIdx - 1].text}` : ""}
        {done ? ` — ${kararUi.bant}` : ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: SP.m }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", borderRadius: RAD.chip, background: ALFA(durumRenk), ...TYPE.meta, fontWeight: 500, color: DERIN_OF(durumRenk) }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: durumRenk, animation: !done && !az ? "nu-think 1.3s ease-in-out infinite" : "none" }} />
          {durum}
        </span>
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
          <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: SP.m, maxHeight: 420, overflowY: "auto", paddingRight: SP.xs }}>
            {gorunenTurlar.map((t, i) => <Balon key={`${i}-${t.who}`} uye={UYE[t.who]} text={t.text} kaynak={t.kaynak} />)}
            {speaking && <Yaziyor uye={UYE[speaking]} />}
            {done && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderRadius: RAD.card, background: ALFA(kararUi.renk), ...TYPE.data, color: DERIN_OF(kararUi.renk), fontWeight: 500, animation: az ? "none" : "nu-rise .2s ease-out both" }}>
                {kurgu.karar === "sevk" ? <Icon.alert /> : <Icon.check />} {kararUi.bant}
              </div>
            )}
          </div>
        </div>

        {/* Sağ — müzakere ile evrilen taslak */}
        <TaslakKarti draft={draft} sealed={sealed} kararUi={kararUi} az={az} />
      </div>

      {/* Tartışmanın sonucu — tutanak yalnız müzakere bitince açılır (canlı gerilim korunur) */}
      {done && <KurulTutanagi kurgu={kurgu} kararUi={kararUi} az={az} onUygula={onUygula} />}
    </div>
  );
}

/* KurulModal — Taslaklar'dan "Kurulu topla" ile açılan müzakere katmanı (BelgeModal a11y
   deseni). onUygula(metin): memur "Uzlaşı taslağını uygula" derse uzlaşı metni verilir —
   çağıran taslağa yazar (updateDraft) ve modalı kapatır. */
export function KurulModal({ taslakAdi = "", result, onKapat = () => {}, onUygula = null }) {
  const az = useAzHareket();
  const kurgu = useMemo(() => muzakereKurgusu(result || null), [result]);
  const kapatRef = useRef(null);
  const oncekiOdak = useRef(null);
  // BelgeModal deseni: onKapat çoğu zaman inline arrow gelir (her render'da yeni kimlik) —
  // effect ona bağımlı olsaydı her üst-render odak/dinleyici kurulumunu yıkar-kurardı.
  // Ref-dolaylama ile effect YALNIZ mount/unmount'ta koşar, kapatma daima güncel callback'i çağırır.
  const kapatIstegiRef = useRef(onKapat);
  useEffect(() => { kapatIstegiRef.current = onKapat; });

  useEffect(() => {
    oncekiOdak.current = document.activeElement;
    kapatRef.current?.focus();
    const tusla = (e) => { if (e.key === "Escape") kapatIstegiRef.current(); };
    document.addEventListener("keydown", tusla);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // arkadaki sayfa kaymasın
    return () => {
      document.removeEventListener("keydown", tusla);
      document.body.style.overflow = eski;
      oncekiOdak.current?.focus?.();
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="AI Bürokrasi Kurulu" onClick={onKapat}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "rgba(22,22,22,.58)", overflowY: "auto", padding: "32px 16px 48px", animation: "nu-rise .16s ease-out both" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1060px, 96vw)", margin: "0 auto", display: "flex", flexDirection: "column", gap: SP.m }}>

        {/* Üst şerit — başlık + taslak kimliği + kapat (BelgeModal dili) */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.onInk }}>AI Bürokrasi Kurulu</span>
          {taslakAdi && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: "rgba(251,247,240,.72)" }}>{taslakAdi}</span>}
          <span style={{ ...TYPE.meta, color: "rgba(251,247,240,.6)" }}>üç ajan, taslağın gerçek doğrulama sinyalleri üzerinden müzakere eder</span>
          <span style={{ marginLeft: "auto" }}>
            <ScrimDugme onClick={onKapat} ariaLabel="Kurulu kapat"><Icon.x width={13} height={13} /> Kapat</ScrimDugme>
          </span>
        </div>

        <div style={{ background: PAL.bg, borderRadius: RAD.pop, boxShadow: SH.modal, padding: SP.l }}>
          {kurgu.toplanamaz ? (
            <div style={{ padding: "40px 20px", textAlign: "center", ...TYPE.data, color: PAL.mut2 }}>
              Bu taslak için kurul toplanamıyor — müzakere edilecek yazı metni bulunamadı.
            </div>
          ) : (
            <KurulSahnesi
              kurgu={kurgu}
              az={az}
              onUygula={onUygula ? () => onUygula(uzlasiMetni(kurgu)) : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
