/* MuzakereKurulu — "AI Bürokrasi Kurulu", Taslaklar akışına gömülü müzakere katmanı.
   Taslak kartında "Kurulu topla" → KurulModal açılır: üç kurul üyesi O taslağın GERÇEK
   pipeline sinyalleri (verify uydurma-veto · lint-2646 · NLI · tutarlılık · risk bandı)
   üzerinden müzakere eder — Taslakçı savunur, Hukukçu mevzuat/format itirazlarını yürütür,
   Vatandaş Avukatı üslup denetiminin gerçek sonucunu konuşur; itirazlar taslağa UYGULANIR ve
   kurul bir REVİZE TASLAĞI üretir. Verdict/mühür/sevk töreni YOK — risk yalnız küçük rozet.
   Değişiklik varsa "Revize taslağını uygula" MEMUR ONAYIYLA (önce→sonra diff görünür) taslağın
   üzerine yazar (HITL — kurul hiçbir zaman doğrudan uygulamaz).

   Kurgu motoru: src/lib/muzakere.js (saf, node --test'li). Animasyon state'i KurulSahnesi'nde
   yaşar; modal her açılış/oynatışta sahneyi key ile sıfırdan kurar (eski-kare sızıntısı yok).
   Modal a11y BelgeModal deseni: role=dialog + aria-modal, Esc ve dış-tık kapatır, açılışta
   odak kapat düğmesine, kapanışta tetikleyiciye döner, body scroll kilitlenir.
   prefers-reduced-motion → son (karar) kare statik; turlar aria-live ile duyurulur. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MONO, SANS, T, V, R, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon, Btn, odakDongusu } from "./neonUi.jsx";
import { ScrimDugme } from "./BelgeModal.jsx";
import { DuzeltmeDiff } from "./NeonDetayParts.jsx";
import { muzakereKurgusu, editUygula, nihaiTaslak, sunucuKurgusu, kurguUzlasiMetni, metniSatirlara } from "../lib/muzakere.js";
import { apiStream } from "../lib/authApi.js";

const KURUL_FETCH_TIMEOUT_MS = 55000;   // çok-turlu debate = 2 LLM çağrısı (açılış + çapraz) → daha uzun tavan

// Kişi (vatandaş) ikonu — neonUi setinde yok, yerel.
const KisiIkon = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 19 a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Kurul üyeleri ↔ gerçek pipeline ajanları eşlemesi (rol satırında görünür — dürüst kurgu).
// Birim Amiri = 4. üye: risk_guard bandını sahiplenen kapanış sesi; rengi DİNAMİK (üstündeki
// riskin rengini taşır — semantik: amir riskin rengini giyer), sözü backend'de deterministik.
const KURUL = [
  { id: "taslakci", ad: "Taslakçı", rol: "yazı ajanı · taslağı savunur", col: T, Ikon: Icon.doc },
  { id: "hukukcu", ad: "Hukukçu", rol: "verify + 2646 + NLI · itiraz yürütür", col: V, Ikon: Icon.scale },
  { id: "vatandas", ad: "Vatandaş Avukatı", rol: "üslup denetimi · vatandaş gözü", col: R, Ikon: KisiIkon },
  { id: "birim_amiri", ad: "Birim Amiri", rol: "risk bandı · gönderim kararı", col: V, Ikon: Icon.shield, dinamik: true },
];
const UYE = Object.fromEntries(KURUL.map((k) => [k.id, k]));
// Dinamik-renkli üye (Birim Amiri) sahnenin risk aksanını taşır; diğerleri sabit token rengi.
const uyeGor = (id, aksan) => (UYE[id]?.dinamik ? { ...UYE[id], col: aksan } : UYE[id]);

const THINK = 900, READ = 1700;

// Debate turu → şerit etiketi (açılış → çapraz eleştiri → karar). Turlar arası geçişte gösterilir.
const TUR_ETIKET = { 0: "Açılış turu", 1: "Çapraz eleştiri", 2: "Karar" };
// Çapraz-tur duruşu → çapraz-referans ipucu (kime · nasıl): karşı çıkıyor / katılıyor / geliştiriyor.
const TUTUM_META = {
  karsi: { etiket: "karşı çıkıyor", col: BANT.kirmizi.c },
  katil: { etiket: "katılıyor", col: BANT.yesil.c },
  gelistir: { etiket: "geliştiriyor", col: T },
};

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

// Risk bandı → küçük ROZET (verdict/mühür/sevk töreni YOK — kurulun çıktısı revize taslağıdır).
const RISK = {
  yesil: { etiket: "Düşük risk", c: BANT.yesil.c },
  sari: { etiket: "Dikkat", c: BANT.sari.c },
  kirmizi: { etiket: "Yüksek risk", c: BANT.kirmizi.c },
};
// Sahne aksan rengi: risk varsa onun rengi, yoksa mühür moru (üretim hattı).
const aksanRenk = (risk) => RISK[risk]?.c || V;

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
        <span style={{ position: "absolute", right: -3, bottom: -3, width: 15, height: 15, borderRadius: RAD.dot, background: BANT.yesil.c, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${PAL.surf}`, animation: "nu-pop .3s var(--ke-ease-out) both" }}>
          <Icon.check width={9} height={9} />
        </span>
      )}
    </span>
  );
}

// Kurul sırası — üye kartları; konuşan üye vurgulanır, oy verenlerde tik. Birim Amiri kartı
// sahnenin risk aksanını taşır (uyeGor ile dinamik renk).
function KurulSirasi({ speaking, votes, aksan }) {
  return (
    <div style={{ display: "flex", gap: SP.s, flexWrap: "wrap" }}>
      {KURUL.map((base) => {
        const u = uyeGor(base.id, aksan);
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

// Debate tur şeridi — turlar arası geçişte "Açılış turu / Çapraz eleştiri / Karar" ayıracı.
function TurSeridi({ tur }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, margin: "2px 2px" }}>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      <span style={{ ...TYPE.meta, fontWeight: 600, color: PAL.mut2 }}>{TUR_ETIKET[tur]}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
    </div>
  );
}

// Tek konuşma balonu — avatar + ad + ÇAPRAZ-REFERANS çipi (@kime · duruş) + metin + kaynak rozeti.
// Çapraz-referans = debate'in görünür dinamizmi: kimin kime karşı çıktığı/katıldığı (durum-geçişi).
function Balon({ uye, t, aksan }) {
  const hedef = t.yanit ? uyeGor(t.yanit, aksan) : null;   // dinamik renk (Birim Amiri hedef olursa risk aksanı)
  const tm = t.tutum ? TUTUM_META[t.tutum] : null;
  return (
    <div style={{ display: "flex", gap: SP.s, animation: "nu-rise .2s var(--ke-ease-out) both" }}>
      <Avatar uye={uye} size={30} />
      <div style={{ minWidth: 0, flex: 1, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `2px solid ${uye.col}`, borderRadius: RAD.card, padding: "8px 12px", boxShadow: SH.card }}>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(uye.col) }}>{uye.ad}</span>
          {hedef && tm && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(tm.col), background: ALFA(tm.col), borderRadius: RAD.chip, padding: "1px 8px" }}>
              <Icon.arrow width={9} height={9} /> {hedef.ad} · {tm.etiket}
            </span>
          )}
          {t.kaynak && !["ornek", "muzakere"].includes(t.kaynak) && <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "14px", color: PAL.mut3 }}>· {t.kaynak}</span>}
        </span>
        <span style={{ ...TYPE.data, color: PAL.ink2 }}>{t.text}</span>
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

/* Kurul Tutanağı — REVİZYON ÖNERİSİ: taslakta neyin düzeltilmesi/eklenmesi/çıkarılması
   gerektiği (tip-renkli + kaynak sinyal rozetli), sonra uygulanacak revize taslağının
   önce→sonra farkı. Kalıcı yazım MEMUR kararıdır (HITL) — kurul kendiliğinden uygulamaz.
   onOneriIsle: "tavsiye" kalan (revizeye işlenmemiş) öneriyi TEK TEK revize taslağa katlar
   (/yazi/dogrula talimat yolu) — yine yalnız öneriyi işler, kalıcı yazım "uygula"da kalır. */
function KurulTutanagi({ kurgu, aksan, az, onUygula, onOneriIsle = null, isleyen = null }) {
  const oneriler = Array.isArray(kurgu.oneriler) ? kurgu.oneriler : [];
  const sirali = TIP_SIRA.flatMap((t) => oneriler.filter((o) => o.tip === t));
  const uygulanabilir = !!onUygula && !!kurgu.uzlasi_uygulanabilir;
  // GÖRÜNÜR ONAY (HITL): revize taslağı memura uygulamadan ÖNCE önce→sonra farkıyla gösterilir.
  const diff = kurgu.uzlasi_uygulanabilir
    ? { eski: (kurgu.taslak || []).map((l) => l.metin).join("\n"), yeni: kurgu.uzlasi_metni || "" }
    : null;
  const sayim = TIP_SIRA
    .map((t) => ({ t, n: oneriler.filter((o) => o.tip === t).length }))
    .filter((x) => x.n)
    .map((x) => `${x.n} ${TIP[x.t].etiket.toLocaleLowerCase("tr-TR")}`)
    .join(" · ");
  const uygulanan = oneriler.filter((o) => o.uygulanabilir).length;   // grounded işlenen öneri sayısı

  return (
    <section aria-label="Kurul tutanağı" style={{ marginTop: SP.l, background: PAL.surf, border: `1px solid ${PAL.line}`, borderTop: `2px solid ${aksan}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l, animation: az ? "none" : "nu-rise .25s var(--ke-ease-out) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: sirali.length ? SP.m : 0 }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN_OF(aksan) }}><Icon.scale /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Kurul tutanağı · revize önerisi</h3>
        {oneriler.length > 0 && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.s, ...TNUM }}>
            {uygulanan > 0 && <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN.yesil }}>{uygulanan} işlendi</span>}
            {sayim && <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{sayim}</span>}
          </span>
        )}
      </div>

      {sirali.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: DERIN.yesil }}>
          <Icon.check width={15} height={15} /> Kurul taslakta değişiklik önermedi — taslak bu hâliyle uygun görüldü.
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
                  {/* DÜRÜST bayrak: grounded uygulandıysa "işlendi" (yeşil), yoksa "tavsiye" (nötr) —
                      revize taslağa işlendi rozeti YALNIZ diff'te gerçekten değişen öneride görünür. */}
                  {o.uygulanabilir ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: SP.s, ...TYPE.meta, fontWeight: 500, color: DERIN.yesil }}>
                      <Icon.check width={11} height={11} /> revize taslağa işlendi
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: SP.s, ...TYPE.meta, fontWeight: 500, color: PAL.mut3 }}>
                      tavsiye · memur değerlendirir
                    </span>
                  )}
                </span>
                {/* Tavsiye kalan öneri TEK TIKLA revize taslağa katılır (AI revize yolu) —
                    aynı anda tek istek (isleyen kilidi); işlenmiş öneride buton yok. */}
                {!o.uygulanabilir && onOneriIsle && (
                  <span style={{ flex: "none" }}>
                    <Btn onClick={() => onOneriIsle(o)} disabled={isleyen != null}
                      ariaLabel={`Öneriyi revize taslağa işle: ${String(o.metin).slice(0, 60)}`}
                      style={{ padding: "3px 10px", minHeight: 26 }}>
                      {isleyen === o
                        ? <><Icon.spin width={12} height={12} /> İşleniyor…</>
                        : <><Icon.plus width={12} height={12} /> Taslağa işle</>}
                    </Btn>
                  </span>
                )}
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, lineHeight: "18px", color: PAL.mut3 }}>{o.kaynak}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Revize taslağı → uygulamadan ÖNCE önce→sonra farkı (görünür HITL onayı) */}
      {diff && (
        <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <div style={{ ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>Kurulun hazırladığı revize taslağı — mevcut taslakla fark</div>
          <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>Eklenen satır “+”, çıkarılan satır “−” ile işaretlidir. Onaylamadan uygulanmaz.</div>
          <DuzeltmeDiff eski={diff.eski} yeni={diff.yeni} />
        </div>
      )}

      {uygulanabilir && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kalıcı yazım memur kararıdır — kurul hiçbir değişikliği kendiliğinden uygulamaz.</span>
          <span style={{ marginLeft: "auto" }}>
            <Btn primary accent={aksan} onClick={onUygula}>
              <Icon.check /> Revize taslağını uygula
            </Btn>
          </span>
        </div>
      )}
    </section>
  );
}

// Taslak kartı — müzakere sürerken orijinal, kurul revize önerdiyse REVİZE taslağı gösterir.
function TaslakKarti({ draft, revize }) {
  return (
    <div style={{ position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", color: revize ? DERIN.V : DERIN.T }}><Icon.doc /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{revize ? "Kurulun revize taslağı" : "Resmî yazı taslağı"}</h3>
        <span style={{ marginLeft: "auto", ...TYPE.meta, color: revize ? DERIN_OF(V) : PAL.mut3 }}>{revize ? "önerilen sürüm" : "müzakere ediliyor"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: SP.s, maxHeight: 440, overflowY: "auto" }}>
        {draft.map((l) => {
          const v = l.vurgu ? VURGU[l.vurgu] : null;
          return (
            <div key={l.id} style={{ padding: v ? "6px 10px" : "2px 0", borderRadius: RAD.ctl, background: v ? ALFA(v.col) : "transparent", borderLeft: v ? `2px solid ${v.col}` : "none", transition: "background .3s ease-out" }}>
              <span style={{ fontFamily: SANS, fontSize: 13, lineHeight: "18px", color: l.sabit ? PAL.mut2 : PAL.ink2, whiteSpace: "pre-wrap" }}>{l.metin}</span>
              {v && <span style={{ display: "block", marginTop: 3, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(v.col) }}>✎ {v.etiket}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Müzakere sahnesi — animasyon state'inin TEK sahibi. CANLI AKIŞ: kurgu.turlar akışla büyür
   (açılış → +çapraz), reveal restart ETMEDEN devam eder (`akan`=stream sürüyor). Key yalnız
   kaynak değişince (llm↔deterministik) verilir → aynı akış içinde remount yok. */
function KurulSahnesi({ kurgu, az, onUygula, akan = false, onOneriIsle = null, isleyen = null }) {
  const aksan = aksanRenk(kurgu.risk);
  const riskRozet = RISK[kurgu.risk] || null;
  const TURLAR = kurgu.turlar;
  const turlarRef = useRef(TURLAR); turlarRef.current = TURLAR;   // effect daima en güncel turları görür
  const akanRef = useRef(akan); akanRef.current = akan;
  const [turnIdx, setTurnIdx] = useState(az ? TURLAR.length : 0);   // açığa çıkmış tur sayısı
  const [speaking, setSpeaking] = useState(null);                    // o an "yazan" üye id'si
  const [draft, setDraft] = useState(() => (az ? nihaiTaslak(kurgu) : kurgu.taslak.map((l) => ({ ...l }))));
  const [votes, setVotes] = useState(() => (az ? Object.fromEntries(TURLAR.filter((t) => t.oy).map((t) => [t.who, true])) : {}));
  const [done, setDone] = useState(az && !akan);
  const feedRef = useRef(null);

  useEffect(() => {
    if (az) return undefined;                                        // reduced-motion → aşağıdaki senkron effect
    // az true→false geçişi (modal açıkken reduced-motion kapatıldı): reduced-motion effect'i
    // turnIdx'i TURLAR.length yapmıştı → artan reveal'ı 0'dan başlatmadan ÖNCE sıfırla, yoksa
    // açılmış balonlar setTurnIdx(1) ile çöküp yeniden açılıyordu (bug avı bulgusu).
    setTurnIdx(0);
    setVotes({});
    setDraft(kurgu.taslak.map((l) => ({ ...l })));
    setDone(false);
    let alive = true, timer, i = 0;
    const step = () => {
      if (!alive) return;
      const TT = turlarRef.current;
      if (i < TT.length) {
        const t = TT[i];
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
      } else if (akanRef.current) {
        setSpeaking(null);                                           // turlar bitti, AKIŞ sürüyor → yeni tur bekle
        timer = setTimeout(step, 350);
      } else {
        setDone(true);                                               // akış bitti + hepsi açıldı → tamam
      }
    };
    timer = setTimeout(step, 500);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [az]);                                                          // append/kurgu restart ETMEZ (turlarRef ile okunur; kurgu.taslak yalnız az-flip reset'inde)

  // Reduced-motion: turlar büyüdükçe hepsini statik göster; akış bitince tamam.
  // Oy tikleri + taslak editleri de senkronlanır (denetim bulgusu: akışla yeni tur/edit
  // geldiğinde yalnız balonlar güncelleniyordu — "uzlaştı" tikleri ve sağ panel bayattı).
  useEffect(() => {
    if (!az) return;
    setTurnIdx(TURLAR.length);
    setVotes(Object.fromEntries(TURLAR.filter((t) => t.oy).map((t) => [t.who, true])));
    setDraft(nihaiTaslak({ ...kurgu, turlar: TURLAR }));
    setDone(!akan);
  }, [az, TURLAR, akan, kurgu]);

  // Yeni balon/yazıyor gelince akışı en alta kaydır (canlı sohbet hissi).
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: az ? "auto" : "smooth" }); }, [turnIdx, speaking, az]);

  const gorunenTurlar = useMemo(() => TURLAR.slice(0, turnIdx), [TURLAR, turnIdx]);
  // Başlık: revizyon çıktısı odaklı (verdict değil). Bitince revize var mı yok mu söyler.
  const degisiklikN = kurgu.degisiklik || (kurgu.oneriler || []).filter((o) => o.uygulanabilir).length;
  const durum = !done ? "Müzakere sürüyor"
    : kurgu.uzlasi_uygulanabilir ? `Revize önerisi hazır${degisiklikN ? ` · ${degisiklikN} değişiklik` : ""}` : "Değişiklik önerilmedi";
  const durumRenk = done ? aksan : T;
  // Bitince sağ panelde REVİZE taslağını göster (memur uygulayacağı sürümü görür).
  const revizeGoster = done && kurgu.uzlasi_uygulanabilir;
  const gosterilenDraft = revizeGoster ? metniSatirlara(kurgu.uzlasi_metni || "", "r") : draft;

  return (
    <div>
      {/* Ekran okuyucu için canlı müzakere duyurusu */}
      <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {speaking ? `${UYE[speaking].ad} söz alıyor` : turnIdx > 0 ? `${UYE[TURLAR[turnIdx - 1].who].ad}: ${TURLAR[turnIdx - 1].text}` : ""}
        {done ? ` — ${durum}` : ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: SP.m }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", borderRadius: RAD.chip, background: ALFA(durumRenk), ...TYPE.meta, fontWeight: 500, color: DERIN_OF(durumRenk) }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: durumRenk, animation: !done && !az ? "nu-think 1.3s ease-in-out infinite" : "none" }} />
          {durum}
        </span>
        {riskRozet && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(riskRozet.c), background: ALFA(riskRozet.c), borderRadius: RAD.chip, padding: "4px 10px" }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskRozet.c }} /> {riskRozet.etiket}
          </span>
        )}
      </div>

      <KurulSirasi speaking={speaking} votes={votes} aksan={aksan} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: SP.l, marginTop: SP.l, alignItems: "start" }}>
        {/* Sol — canlı müzakere akışı */}
        <div style={{ background: PAL.bg2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
            <span aria-hidden="true" style={{ display: "flex", color: DERIN.V }}><Icon.scale /></span>
            <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Müzakere</h3>
            <span style={{ marginLeft: "auto", ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>{Math.min(turnIdx, TURLAR.length)}/{TURLAR.length} tur</span>
          </div>
          <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: SP.m, maxHeight: 420, overflowY: "auto", paddingRight: SP.xs }}>
            {/* Turlar kaynağında SIRALI-GRUPLU gelir (motor [*acilis,*capraz,moderatör]; sunucu da
                aynı sırada) — şerit bu bitişik-tur değişimine göre çizilir; ara-sıralama gerekmez. */}
            {gorunenTurlar.map((t, i) => {
              const yeniTur = TUR_ETIKET[t.tur] && (i === 0 || gorunenTurlar[i - 1].tur !== t.tur);
              return (
                <Fragment key={`${i}-${t.who}`}>
                  {yeniTur && <TurSeridi tur={t.tur} />}
                  <Balon uye={uyeGor(t.who, aksan)} t={t} aksan={aksan} />
                </Fragment>
              );
            })}
            {speaking && <Yaziyor uye={uyeGor(speaking, aksan)} />}
            {done && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderRadius: RAD.card, background: ALFA(aksan), ...TYPE.data, color: DERIN_OF(aksan), fontWeight: 500, animation: az ? "none" : "nu-rise .2s var(--ke-ease-out) both" }}>
                <Icon.check /> {kurgu.uzlasi_uygulanabilir
                  ? "Kurul revize taslağını hazırladı; memur onayına sunuluyor."
                  : "Kurul taslakta değişiklik önermedi."}
              </div>
            )}
          </div>
        </div>

        {/* Sağ — müzakere sürerken orijinal, bitince kurulun REVİZE taslağı */}
        <TaslakKarti draft={gosterilenDraft} revize={revizeGoster} />
      </div>

      {/* Tartışmanın sonucu — tutanak yalnız müzakere bitince açılır (canlı gerilim korunur) */}
      {done && <KurulTutanagi kurgu={kurgu} aksan={aksan} az={az} onUygula={onUygula} onOneriIsle={onOneriIsle} isleyen={isleyen} />}
    </div>
  );
}

/* KurulModal — Taslaklar'dan "Kurulu topla" ile açılan revizyon katmanı (BelgeModal a11y
   deseni). onUygula(metin): memur "Revize taslağını uygula" derse kurulun revize metni verilir —
   çağıran taslağa yazar (updateDraft) ve modalı kapatır. */
// Kurul toplanıyor — DeepSeek roundtable ağ turu sürerken üç üye "okuyor" durumu.
function KurulYukleniyor({ az }) {
  return (
    <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: SP.m }}>
      <div style={{ display: "flex", gap: SP.s }}>
        {KURUL.map((u, i) => (
          <span key={u.id} aria-hidden="true" style={{ width: 40, height: 40, borderRadius: RAD.dot, background: ALFA(u.col), border: `1.5px solid ${u.col}`, color: DERIN_OF(u.col), display: "flex", alignItems: "center", justifyContent: "center", animation: az ? "none" : "nu-think 1.2s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}>
            <u.Ikon />
          </span>
        ))}
      </div>
      <span style={{ ...TYPE.data, color: PAL.mut2 }}>Kurul toplanıyor — üyeler taslağı okuyor ve müzakereye hazırlanıyor…</span>
    </div>
  );
}

export function KurulModal({ taslakAdi = "", result, onKapat = () => {}, onUygula = null, onRevize = null, onToast = () => {} }) {
  const az = useAzHareket();
  const yerel = useMemo(() => muzakereKurgusu(result || null), [result]);
  // LLM birincil (DeepSeek roundtable), deterministik yerel motor fallback. Taslaksız evrakta
  // (yerel.toplanamaz) ağ turu atlanır; LLM yok/mock/hata → yerel kurgu (mock ayakta).
  const [durum, setDurum] = useState(() => (result?.yazi_taslak_md ? "yukleniyor" : "hazir"));
  const [kurgu, setKurgu] = useState(yerel);
  const [akan, setAkan] = useState(false);   // canlı akış: turlar hâlâ büyüyor (açılış→çapraz)
  const [isleyen, setIsleyen] = useState(null);   // uçuştaki tek öneri (çift istek kilidi)

  // "Tavsiye" kalan kurul önerisini TEK TEK revize taslağa katla: mevcut etkin metin
  // (revize varsa o, yoksa orijinal) + öneri, /yazi/dogrula talimat yoluna gider (BelgeModal
  // "AI ile revize et" ile AYNI uç: uydurma-veto/2646-lint/risk kapılarından geçer). Başarıda
  // yalnız KURGU güncellenir — kalıcı yazım yine memurun "Revize taslağını uygula" kararıdır.
  const oneriIsle = async (oneri) => {
    if (!onRevize || isleyen != null) return;
    setIsleyen(oneri);
    try {
      const taban = kurguUzlasiMetni(kurgu);
      const talimat = `Kurul önerisini taslağa işle (tip: ${oneri.tip}): ${oneri.metin}`;
      const dogrulanan = await onRevize(taban, talimat);
      if (!dogrulanan?.taslak_md) throw new Error("boş yanıt");
      const degisti = dogrulanan.taslak_md.trim() !== taban.trim();
      if (degisti) {
        setKurgu((k) => ({
          ...k,
          oneriler: k.oneriler.map((o) => (o === oneri ? { ...o, uygulanabilir: true } : o)),
          uzlasi_metni: dogrulanan.taslak_md,
          uzlasi_uygulanabilir: true,
          degisiklik: (k.degisiklik || 0) + 1,
        }));
        onToast("Öneri revize taslağa işlendi — farkı inceleyip uygulayabilirsiniz.");
      } else {
        // Dürüstlük: metin değişmediyse "işlendi" rozeti YALANDIR — öneri tavsiye kalır.
        onToast("Öneri işlendi ancak metinde değişiklik üretmedi — tavsiye olarak kaldı.");
      }
    } catch (err) {
      console.warn("Kurul önerisi taslağa işlenemedi", err);
      onToast("Öneri taslağa işlenemedi — bağlantıyı kontrol edip tekrar deneyin.");
    } finally {
      setIsleyen(null);
    }
  };
  const kapatRef = useRef(null);
  const oncekiOdak = useRef(null);
  // BelgeModal deseni: onKapat çoğu zaman inline arrow gelir (her render'da yeni kimlik) —
  // effect ona bağımlı olsaydı her üst-render odak/dinleyici kurulumunu yıkar-kurardı.
  // Ref-dolaylama ile effect YALNIZ mount/unmount'ta koşar, kapatma daima güncel callback'i çağırır.
  const kapatIstegiRef = useRef(onKapat);
  useEffect(() => { kapatIstegiRef.current = onKapat; });

  // DeepSeek kurul müzakeresini CANLI AKIŞLA (SSE) çek — açılış turları hazır olunca (~3s)
  // ANINDA animasyona başlar (dead-wait yok), çapraz-eleştiri gelince eklenir. LLM yok/hata/
  // timeout → deterministik TAM debate (mock ayakta, uç asla kilitlenmez).
  useEffect(() => {
    if (!result?.yazi_taslak_md) { setKurgu(yerel); setDurum("hazir"); setAkan(false); return undefined; }
    let alive = true;
    const ac = new AbortController();
    setDurum("yukleniyor"); setAkan(false);
    let bant = "";                       // 'sinyaller' olayından risk bandı (kısmi kurguya renk verir)
    let acildi = false, sonucGeldi = false;
    const govde = {
      taslak_md: result.yazi_taslak_md, evrak_text: result.evrak_text || "",
      yazi_turu: result.yazi_turu || "", evrak_turu: result.evrak_turu || "",
      hedef_birim: result.hedef_birim || "", bilgi_unsurlari: result.bilgi_unsurlari || {},
      mevzuat_onerileri: result.mevzuat_onerileri || [], mevzuat_nli: result.mevzuat_nli || [],
    };
    // Açılış üst sınırda gelmezse deterministik motora düş (ağ takılması demo'yu kilitlemesin).
    const zamanAsimi = setTimeout(() => {
      if (alive && !acildi) { ac.abort(); setKurgu(yerel); setDurum("hazir"); }
    }, KURUL_FETCH_TIMEOUT_MS);

    apiStream("/yazi/kurul/akis", govde, (olay) => {
      if (!alive) return;
      if (olay.tip === "sinyaller") {
        bant = ((olay.sinyaller || {}).risk_metadata || {}).bant || "";
      } else if (olay.tip === "acilis") {
        acildi = true;
        // Kısmi kurgu = yalnız açılış turları → HEMEN oynatmaya başla (canlı akış).
        const kismi = sunucuKurgusu({ kaynak: "llm", turlar: olay.turlar, oneriler: [], sinyaller: { risk_metadata: { bant } } }, result);
        if (kismi) { setKurgu(kismi); setDurum("hazir"); setAkan(true); }
      } else if (olay.tip === "sonuc") {
        sonucGeldi = true;
        const tam = sunucuKurgusu({ ...olay, sinyaller: { risk_metadata: { bant } } }, result);
        if (tam) setKurgu(tam);
        setAkan(false);
      }
    }, ac.signal)
      .then(() => { if (alive) { clearTimeout(zamanAsimi); setAkan(false); if (!sonucGeldi) { setKurgu(yerel); setDurum("hazir"); } } })
      .catch(() => { if (alive) { clearTimeout(zamanAsimi); setAkan(false); if (!sonucGeldi) { setKurgu(yerel); setDurum("hazir"); } } });
    return () => { alive = false; clearTimeout(zamanAsimi); ac.abort(); };
  }, [result, yerel]);

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
    <div role="dialog" aria-modal="true" aria-label="AI Bürokrasi Kurulu" onClick={onKapat} onKeyDown={odakDongusu}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "rgba(22,22,22,.58)", overflowY: "auto", padding: "32px 16px 48px", animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1060px, 96vw)", margin: "0 auto", display: "flex", flexDirection: "column", gap: SP.m }}>

        {/* Üst şerit — başlık + taslak kimliği + kapat (BelgeModal dili) */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.onInk }}>AI Bürokrasi Kurulu</span>
          {taslakAdi && <span style={{ fontFamily: SANS, fontSize: 13, lineHeight: "16px", color: "rgba(251,247,240,.72)" }}>{taslakAdi}</span>}
          <span style={{ ...TYPE.meta, color: "rgba(251,247,240,.6)" }}>
            {kurgu.kaynak === "llm" ? "DeepSeek uzman ajanları taslağı müzakere eder" : "üç ajan, taslağın gerçek doğrulama sinyalleri üzerinden müzakere eder"}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <ScrimDugme onClick={onKapat} ariaLabel="Kurulu kapat"><Icon.x width={13} height={13} /> Kapat</ScrimDugme>
          </span>
        </div>

        <div style={{ background: PAL.bg, borderRadius: RAD.pop, boxShadow: SH.modal, padding: SP.l }}>
          {durum === "yukleniyor" ? (
            <KurulYukleniyor az={az} />
          ) : kurgu.toplanamaz ? (
            <div style={{ padding: "40px 20px", textAlign: "center", ...TYPE.data, color: PAL.mut2 }}>
              Bu taslak için kurul toplanamıyor — müzakere edilecek yazı metni bulunamadı.
            </div>
          ) : (
            <KurulSahnesi
              key={kurgu.kaynak}
              kurgu={kurgu}
              az={az}
              akan={akan}
              onUygula={onUygula ? () => onUygula(kurguUzlasiMetni(kurgu)) : null}
              // Örnek (etiketli kurgu) senaryoda gerçek revize çağrısı anlamsız → buton yok.
              onOneriIsle={onRevize && kurgu.kaynak !== "ornek" ? oneriIsle : null}
              isleyen={isleyen}
            />
          )}
        </div>
      </div>
    </div>
  );
}
