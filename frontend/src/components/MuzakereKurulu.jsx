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
import { MONO, DISPLAY, Damga, T, V, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon, Btn, odakDongusu } from "./neonUi.jsx";
import { UYE, uyeGor, turEtiketi, RISK, aksanRenk, KurulMasasi, duruslariCikar, TurSeridi, TutanakMaddesi, Yaziyor, TaslakKarti, KurulYukleniyor } from "./KurulMasasi.jsx";
import { DuzeltmeDiff } from "./NeonDetayParts.jsx";
import { muzakereKurgusu, editUygula, nihaiTaslak, sunucuKurgusu, kurguUzlasiMetni, metniSatirlara } from "../lib/muzakere.js";
import { apiStream } from "../lib/authApi.js";

// Yalnız AÇILIŞ turunu bekler (sonrası akışla gelir): açılış gelmezse deterministik motora düş.
// Sunucu açılış bütçesi 30 sn (KURUL_ACILIS_TIMEOUT_S) + ilk sinyal ölçümü → 45 sn güvenli tavan.
// Denetim turları bu tavana TABİ DEĞİL; akış açıldıktan sonra turlar geldikçe eklenir.
const KURUL_FETCH_TIMEOUT_MS = 45000;

const THINK = 900, READ = 1700;
// Tutanak antetindeki toplantı tarihi (gg.aa.yyyy — resmî biçim).
const bugun = () => new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
// Tutanak tur başlıklarının sıra numarası (resmî tutanak dili: I., II., III.).
const ROMA = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// Tutanak öneri tipi → semantik renk + etiket (düzelt=amber · ekle=yeşil · çıkar=kırmızı).
const TIP = {
  duzelt: { etiket: "Düzelt", col: BANT.sari.c },
  ekle: { etiket: "Ekle", col: BANT.yesil.c },
  cikar: { etiket: "Çıkar", col: BANT.kirmizi.c },
};
const TIP_SIRA = ["cikar", "ekle", "duzelt"];   // en sert eylem en üstte

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

/* Gönderime hazır — kurul incelemesinden SONRA memur taslağın doğruluğunu onaylar ve
   gönderir (Giden Evrak'a). Geri alınamaz → İKİ ADIMLI onay (KararPaneli deseni).
   finalMetin: revize varsa kurulun revize metni (onay = revizeyi kabul), yoksa mevcut taslak.
   Bu, kurulun "dünyanın en iyisi" olma noktası: müzakere → doğruluk onayı → gönderime hazır. */
function GonderimeHazir({ kurgu, aksan, onGonder, az = false }) {
  const [teyit, setTeyit] = useState(false);
  const [gonderiyor, setGonderiyor] = useState(false);
  const [hata, setHata] = useState(false);   // gönderim başarısız → modal açık kalır, tekrar dene
  const revizeVar = !!kurgu.uzlasi_uygulanabilir;
  const finalMetin = revizeVar
    ? (kurgu.uzlasi_metni || "")
    : (kurgu.taslak || []).map((l) => l.metin).join("\n");
  // Birim Amiri'nin (risk_guard) kapanış sözü — gönderim kararının dayanağı. Akışta gömülüydü;
  // karar anında memurun önüne getirilir (verdict töreni DEĞİL, kurulun gerekçesi).
  const amirSoz = (kurgu.turlar || []).filter((t) => t.who === "birim_amiri").slice(-1)[0]?.text || "";
  const gonder = async () => {
    if (gonderiyor) return;
    setGonderiyor(true); setHata(false);
    try {
      const ok = await onGonder(finalMetin);   // TaslaklarView onSend sonucu (bool)
      if (ok === false) setHata(true);          // başarısız (ağ/karar) → dürüst hata, teyit açık kalır
    } catch {
      setHata(true);
    } finally {
      setGonderiyor(false);
    }
  };
  return (
    <div style={{ marginTop: SP.l, animation: az ? "none" : "nu-rise .28s var(--ke-ease-out) both" }}>
      {/* Birim Amiri'nin gönderim değerlendirmesi — kararın dayanağı (kurulun gerekçesi). */}
      {amirSoz && (
        /* Amirin sözü tutanakta ALINTI gibi durur: kalın kenar + kendi rengi + adı altta imza gibi. */
        <figure style={{ margin: `0 0 ${SP.l}px`, padding: "4px 0 4px 16px", boxShadow: `inset 3px 0 0 ${aksan}` }}>
          <blockquote style={{ margin: 0, fontFamily: DISPLAY, fontSize: 16, lineHeight: "23px", fontWeight: 500, fontStretch: "100%", color: PAL.ink }}>“{amirSoz}”</blockquote>
          <figcaption style={{ marginTop: 6, display: "flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 600, color: DERIN_OF(aksan) }}>
            <Icon.shield width={13} height={13} /> Birim Amiri · gönderim değerlendirmesi
          </figcaption>
        </figure>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "14px 16px", borderRadius: RAD.card, background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN.yesil }}><Icon.shield /></span>
        <span style={{ minWidth: 0, flex: "1 1 260px" }}>
          <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink }}>
            {revizeVar ? "Kurulun revize taslağı gönderime hazır" : "Taslak kurulca uygun bulundu — gönderime hazır"}
          </span>
          <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2 }}>
            {revizeVar
              ? "Onaylarsanız revize sürüm doğrulanıp Giden Evrak'a gönderilir."
              : "Doğruluğunu onaylarsanız Giden Evrak'a gönderilir."}
          </span>
        </span>
        <span style={{ marginLeft: "auto" }}>
          {!teyit ? (
            <Btn primary accent={DERIN.yesil} onClick={() => setTeyit(true)}
              ariaLabel="Taslağı onayla ve gönderime hazırla">
              <Icon.check /> Onayla ve gönder
            </Btn>
          ) : (
            <span style={{ display: "inline-flex", gap: SP.s, alignItems: "center", flexWrap: "wrap" }}>
              <span role={hata ? "alert" : "status"} aria-live={hata ? "assertive" : "polite"}
                style={{ ...TYPE.meta, color: DERIN.kirmizi, fontWeight: 500 }}>
                {hata ? "Gönderilemedi — bağlantıyı kontrol edip tekrar deneyin." : "Geri alınamaz — emin misiniz?"}
              </span>
              <Btn primary accent={DERIN.yesil} onClick={gonder} disabled={gonderiyor} ariaLabel="Evet, Giden Evrak'a gönder">
                {gonderiyor
                  ? <><Icon.spin width={13} height={13} /> Gönderiliyor…</>
                  : <><Icon.check /> {hata ? "Tekrar dene" : "Evet, gönder"}</>}
              </Btn>
              <Btn onClick={() => { setTeyit(false); setHata(false); }} disabled={gonderiyor} ariaLabel="Gönderimden vazgeç">Vazgeç</Btn>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* Kurul Tutanağı — REVİZYON ÖNERİSİ: taslakta neyin düzeltilmesi/eklenmesi/çıkarılması
   gerektiği (tip-renkli + kaynak sinyal rozetli), sonra uygulanacak revize taslağının
   önce→sonra farkı. Kalıcı yazım MEMUR kararıdır (HITL) — kurul kendiliğinden uygulamaz.
   onOneriIsle: "tavsiye" kalan (revizeye işlenmemiş) öneriyi TEK TEK revize taslağa katlar
   (/yazi/dogrula talimat yolu) — yine yalnız öneriyi işler, kalıcı yazım "uygula"da kalır.
   onGonder: memur doğruluğu onaylayıp gönderir (Giden Evrak) — kurulun kapanış eylemi. */
function KurulTutanagi({ kurgu, aksan, az, onUygula, onOneriIsle = null, isleyen = null, onGonder = null }) {
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
    <section aria-label="Kurul kararı" style={{ marginTop: SP.xxl, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: "20px clamp(16px, 2.4vw, 24px) 22px", animation: az ? "none" : "nu-rise .25s var(--ke-ease-out) both" }}>
      {/* Kararın başlığı — tutanağın son bölümü. Hüküm TEK damgadır (ekranın tek damgası):
          revize önerildi mi, önerilmedi mi. Uygunluk/risk iddiası damgaya YÜKLENMEZ — o
          Birim Amiri'nin sözünde ve risk bandında, kendi kelimeleriyle durur. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", paddingBottom: SP.m, marginBottom: SP.m, borderBottom: `1px solid ${PAL.lineHi}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 4 }}>Kurul kararı · revize önerisi</div>
          <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{kurgu.uzlasi_uygulanabilir ? "Kurul revize taslağı önerdi" : "Kurul değişiklik önermedi"}</h3>
        </div>
        <Damga ton={kurgu.uzlasi_uygulanabilir ? V : aksan} egim={-5} animasyon={!az}>{kurgu.uzlasi_uygulanabilir ? "Revize önerildi" : "Değişiklik yok"}</Damga>
        {oneriler.length > 0 && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.s, ...TNUM }}>
            {uygulanan > 0 && <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN.yesil }}>{uygulanan} işlendi</span>}
            {sayim && <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{sayim}</span>}
          </span>
        )}
      </div>

      {/* ÖLÇÜLEN yakınsama — kurulun asıl kanıtı. "İşlendi" kaç öneri UYGULANDIĞINI söyler;
          bu satır revizenin NE İŞE YARADIĞINI söyler: revize taslak sunucuda yeniden
          verify/risk_guard'dan geçirildi ve uyarılar YENİDEN SAYILDI. Ölçüm yoksa (mock,
          ölçüm hatası, revize düştü) satır hiç görünmez — kanıtsız kazanım iddia edilmez. */}
      {kurgu.yakinsama && (() => {
        const y = kurgu.yakinsama;
        const temiz = !y.duran && !y.yeni;                       // duran da yok, yeni de yok
        const renk = temiz ? BANT.yesil.c : BANT.sari.c;
        return (
          <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, marginBottom: SP.m, padding: "8px 12px", borderRadius: RAD.card, background: ALFA(renk) }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 1, color: DERIN_OF(renk) }}>
              <Icon.scale width={15} height={15} />
            </span>
            <span style={{ ...TYPE.data, color: PAL.ink2, ...TNUM }}>
              <strong style={{ fontWeight: 600 }}>{y.tur} tur müzakere</strong>{" · revize uygulanırsa: "}
              <strong style={{ fontWeight: 600, color: DERIN.yesil }}>{y.dusen} uyarı düşüyor</strong>
              {!!y.duran && <>{" · "}<strong style={{ fontWeight: 600, color: DERIN_OF(BANT.sari.c) }}>{y.duran} uyarı duruyor</strong></>}
              {/* "Yeni uyarı" AYRI gösterilir: revizyonun kendi ürettiği sorun, net farkın
                  içinde eritilirse memur bunu hiç görmez (canlı koşum bulgusu). */}
              {!!y.yeni && <>{" · "}<strong style={{ fontWeight: 600, color: DERIN_OF(BANT.kirmizi.c) }}>revizyon {y.yeni} yeni uyarı üretiyor</strong></>}
              {temiz && " — taslakta işaretli uyarı kalmıyor."}
              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, marginTop: 2 }}>
                Sayılar revize metin üzerinde yeniden ölçüldü (kurulun beyanı değil).
              </span>
            </span>
          </div>
        );
      })()}

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
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3 }}>{o.kaynak}</span>
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
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>
            {onGonder
              ? "İsterseniz yalnız taslağa kaydedip sonra gönderebilirsiniz:"
              : "Kalıcı yazım memur kararıdır — kurul hiçbir değişikliği kendiliğinden uygulamaz."}
          </span>
          <span style={{ marginLeft: "auto" }}>
            {/* onGonder varsa primary "Onayla ve gönder"e devredilir → uygula ikincil kalır (tek primary). */}
            <Btn primary={!onGonder} accent={aksan} onClick={onUygula}>
              <Icon.check /> {onGonder ? "Yalnız taslağa kaydet" : "Revize taslağını uygula"}
            </Btn>
          </span>
        </div>
      )}

      {/* Kurulun kapanışı — memur doğruluğu onaylar ve gönderime hazırlar (Giden Evrak). */}
      {onGonder && <GonderimeHazir kurgu={kurgu} aksan={aksan} onGonder={onGonder} az={az} />}
    </section>
  );
}

/* Müzakere sahnesi — animasyon state'inin TEK sahibi. CANLI AKIŞ: kurgu.turlar akışla büyür
   (açılış → +çapraz), reveal restart ETMEDEN devam eder (`akan`=stream sürüyor). Key yalnız
   kaynak değişince (llm↔deterministik) verilir → aynı akış içinde remount yok. */
function KurulSahnesi({ kurgu, az, onUygula, akan = false, onOneriIsle = null, isleyen = null, onGonder = null }) {
  const aksan = aksanRenk(kurgu.risk);
  const riskRozet = RISK[kurgu.risk] || null;
  const TURLAR = kurgu.turlar;
  const turlarRef = useRef(TURLAR); turlarRef.current = TURLAR;   // effect daima en güncel turları görür
  const akanRef = useRef(akan); akanRef.current = akan;
  const [turnIdx, setTurnIdx] = useState(az ? TURLAR.length : 0);   // açığa çıkmış tur sayısı
  const [speaking, setSpeaking] = useState(null);                    // o an "yazan" üye id'si
  const [bekleyenSn, setBekleyenSn] = useState(0);                   // sıradaki tur beklenirken geçen süre
  const [draft, setDraft] = useState(() => (az ? nihaiTaslak(kurgu) : kurgu.taslak.map((l) => ({ ...l }))));
  const [done, setDone] = useState(az && !akan);
  const feedRef = useRef(null);

  useEffect(() => {
    if (az) return undefined;                                        // reduced-motion → aşağıdaki senkron effect
    // az true→false geçişi (modal açıkken reduced-motion kapatıldı): reduced-motion effect'i
    // turnIdx'i TURLAR.length yapmıştı → artan reveal'ı 0'dan başlatmadan ÖNCE sıfırla, yoksa
    // açılmış balonlar setTurnIdx(1) ile çöküp yeniden açılıyordu (bug avı bulgusu).
    setTurnIdx(0);
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
    setDraft(nihaiTaslak({ ...kurgu, turlar: TURLAR }));
    setDone(!akan);
  }, [az, TURLAR, akan, kurgu]);

  // Yeni balon/yazıyor gelince akışı en alta kaydır (canlı sohbet hissi).
  // Reduced-motion'da tutanak canlı oynamaz, BİTMİŞ bir belge olarak açılır → BAŞTAN okunur
  // (eskiden en alta atlıyor, memur açılış turunu görmeden §8'den başlıyordu). Akış sürerken
  // (akan) yeni madde gelirse yine en alta iner — o hâlde canlı bilgi en sondadır.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (az && !akan) { el.scrollTop = 0; return; }
    el.scrollTo({ top: el.scrollHeight, behavior: az ? "auto" : "smooth" });
  }, [turnIdx, speaking, az, akan]);

  // Sıradaki tur beklenirken saniye sayacı — "canlı ama uzun" ile "takıldı"yı ayıran tek şey.
  // Sayaç bekleme BİTİNCE sıfırlanır; reduced-motion'da da çalışır (hareket değil, bilgi).
  const bekleniyor = akan && !speaking && turnIdx >= TURLAR.length;
  useEffect(() => {
    if (!bekleniyor) { setBekleyenSn(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setBekleyenSn(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [bekleniyor]);

  const gorunenTurlar = useMemo(() => TURLAR.slice(0, turnIdx), [TURLAR, turnIdx]);
  // Koltuk mühürleri tutanağa GEÇMİŞ maddelerden türer (açılmamış madde mühür basmaz).
  const durus = useMemo(() => duruslariCikar(gorunenTurlar), [gorunenTurlar]);
  // Başlık: revizyon çıktısı odaklı (verdict değil). Bitince revize var mı yok mu söyler.
  const degisiklikN = kurgu.degisiklik || (kurgu.oneriler || []).filter((o) => o.uygulanabilir).length;
  // BEKLEME DURUMU: akış açık ama oynatılacak tur kalmadı → sunucu SIRADAKİ turu üretiyor.
  // Bu bekleme 40-90 sn sürebilir (reasoning modeli düşünüyor). Göstergesiz bırakılınca ekran
  // "3/3 tur" + donmuş transkriptle TAKILMIŞ gibi okunuyordu (kullanıcı bildirimi, 7 Ağu 2026).
  const bekliyor = bekleniyor;
  const sonrakiTur = TURLAR.length && TURLAR[TURLAR.length - 1].tur === 0
    ? "Çapraz eleştiri" : "Denetim";
  const durum = !done
    ? (bekliyor ? `${sonrakiTur} turu hazırlanıyor${bekleyenSn ? ` · ${bekleyenSn} sn` : ""}` : "Müzakere sürüyor")
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
        {/* Bekleme sessiz kalmamalı: görme engelli memur da "sürüyor mu, takıldı mı" bilmeli.
            Saniye sayacı duyuruya GİRMEZ — her saniye tekrar okunması gürültü olur. */}
        {bekliyor ? ` — ${sonrakiTur} turu hazırlanıyor` : ""}
        {done ? ` — ${durum}` : ""}
      </div>

      {/* Toplantı masası — koltuklar + masanın üstünde o anki durum ve risk. */}
      <KurulMasasi speaking={speaking} durus={durus} aksan={aksan} az={az} orta={
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: durumRenk, animation: !done && !az ? "nu-think 1.3s ease-in-out infinite" : "none" }} />
            {done ? "Toplantı kapandı" : "Toplantı sürüyor"}
            <span style={{ ...TNUM }}>· {akan ? `${TURLAR.length} tur` : `${Math.min(turnIdx, TURLAR.length)}/${TURLAR.length}`}</span>
          </span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, lineHeight: "21px", fontWeight: 700, fontStretch: "106%", letterSpacing: "-.005em", color: PAL.ink, ...TNUM }}>{durum}</span>
          {riskRozet && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(riskRozet.c) }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskRozet.c }} /> Risk bandı: {riskRozet.etiket.toLocaleLowerCase("tr-TR")}
            </span>
          )}
        </>
      } />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: SP.xl, marginTop: SP.xl, alignItems: "start" }}>
        {/* Sol — toplantı tutanağı (canlı akış). */}
        <section aria-label="Müzakere tutanağı" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, paddingBottom: SP.s }}>
            <h3 style={{ margin: 0, ...TYPE.h2, fontSize: 17, lineHeight: "22px", color: PAL.ink }}>Toplantı tutanağı</h3>
            {/* Akış sürerken "3/3 tur" TAMAMLANDI gibi okunuyordu; tur sayısı önceden BİLİNMEZ
                (kurul ölçüm temizlenince erken durur) → sürerken yalnız gelen tur sayısı. */}
            <span style={{ marginLeft: "auto", ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>
              {akan ? `${TURLAR.length} madde · sürüyor` : `${Math.min(turnIdx, TURLAR.length)}/${TURLAR.length} madde`}
            </span>
          </div>
          <div ref={feedRef} style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto", paddingRight: SP.xs, borderTop: `2px solid ${PAL.ink}` }}>
            {/* Turlar kaynağında SIRALI-GRUPLU gelir (motor [*acilis,*capraz,moderatör]; sunucu da
                aynı sırada) — şerit bu bitişik-tur değişimine göre çizilir; ara-sıralama gerekmez. */}
            {(() => {
              let turNo = 0;
              return gorunenTurlar.map((t, i) => {
                const etiket = turEtiketi(t);
                const yeniTur = i === 0 || turEtiketi(gorunenTurlar[i - 1]) !== etiket;
                if (yeniTur) turNo += 1;
                return (
                  <Fragment key={`${i}-${t.who}`}>
                    {yeniTur && <TurSeridi etiket={etiket} no={ROMA[turNo - 1] || turNo} />}
                    <TutanakMaddesi uye={uyeGor(t.who, aksan)} t={t} aksan={aksan} no={i + 1} />
                  </Fragment>
                );
              });
            })()}
            {speaking && <Yaziyor uye={uyeGor(speaking, aksan)} az={az} />}
            {/* Sıradaki tur beklenirken: ne beklendiği + geçen süre. Kurul burada GERÇEKTEN
                çalışıyor (revize ölçülüyor, sonraki tur üretiliyor) — sessiz kalmak "takıldı"
                izlenimi veriyordu. */}
            {bekliyor && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, margin: `${SP.s}px 0`, padding: "8px 12px", borderRadius: RAD.ctl, background: PAL.surf, border: `1px dashed ${PAL.lineHi}`, ...TYPE.meta, color: PAL.mut }}>
                <Icon.spin width={13} height={13} donuk={az} />
                <span style={{ ...TNUM }}>
                  {sonrakiTur === "Denetim"
                    ? "Revize taslak yeniden ölçülüyor, denetim turu hazırlanıyor"
                    : "Üyeler birbirine yanıt hazırlıyor"}
                  {bekleyenSn ? ` · ${bekleyenSn} sn` : ""}
                </span>
              </div>
            )}
            {done && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "10px 0 2px", borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: DERIN_OF(aksan), fontWeight: 500, animation: az ? "none" : "nu-rise .2s var(--ke-ease-out) both" }}>
                <Icon.check /> {kurgu.uzlasi_uygulanabilir
                  ? "Kurul revize taslağını hazırladı; memur onayına sunuluyor."
                  : "Kurul taslakta değişiklik önermedi."}
              </div>
            )}
          </div>
        </section>

        {/* Sağ — masadaki evrak: müzakere sürerken orijinal, bitince kurulun REVİZE taslağı */}
        <TaslakKarti draft={gosterilenDraft} revize={revizeGoster} />
      </div>

      {/* Tartışmanın sonucu — tutanak yalnız müzakere bitince açılır (canlı gerilim korunur) */}
      {done && <KurulTutanagi kurgu={kurgu} aksan={aksan} az={az} onUygula={onUygula} onOneriIsle={onOneriIsle} isleyen={isleyen} onGonder={onGonder} />}
    </div>
  );
}

/* KurulModal — Taslaklar'dan "Kurulu topla" ile açılan revizyon katmanı (BelgeModal a11y
   deseni). onUygula(metin): memur "Revize taslağını uygula" derse kurulun revize metni verilir —
   çağıran taslağa yazar (updateDraft) ve modalı kapatır. */
export function KurulModal({ taslakAdi = "", result, onKapat = () => {}, onUygula = null, onRevize = null, onToast = () => {}, onGonder = null }) {
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
    // Canlı müzakere birikimi: açılış + hazır olan her müzakere turu. Sunucu yakınsama
    // döngüsünde tur SAYISI önceden bilinmez (ölçüm temizlenirse erken durur), bu yüzden
    // turlar geldikçe eklenir; animasyon zaten `akan` bayrağıyla yeni turu bekler.
    let biriken = [];
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
      } else if (olay.tip === "acilis" || olay.tip === "tur") {
        acildi = true;
        biriken = [...biriken, ...(olay.turlar || [])];
        // Kısmi kurgu = o ana kadarki turlar → HEMEN oynatmaya başla (canlı akış); müzakere
        // sürerken gelen DENETİM turları da aynı yoldan eklenir (memur tartışmayı oluşurken izler).
        const kismi = sunucuKurgusu({ kaynak: "llm", turlar: biriken, oneriler: [], sinyaller: { risk_metadata: { bant } } }, result);
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
    // Scrim YALNIZ solar (nu-sol), içerik yükselir (nu-rise) — karartma perdesi mekânda
    // hareket etmez (Apple materyal kuralı). Karartı tonu tek kaynaktan: PAL.scrimKoyu.
    <div role="dialog" aria-modal="true" aria-label="AI Bürokrasi Kurulu" onClick={onKapat} onKeyDown={odakDongusu}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: PAL.scrimKoyu, overflowY: "auto", padding: "32px clamp(8px, 2vw, 16px) 48px", animation: "nu-sol .16s var(--ke-ease-out) both" }}>
      {/* ref+tabIndex: açılışta odak diyalog kabına girer (WCAG dialog deseni; bug avı: kapatRef
          hiçbir öğeye bağlı değildi → focus no-op, odak arka planda kalıyordu). */}
      <div ref={kapatRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "min(1060px, 100%)", margin: "0 auto", outline: "none", display: "flex", flexDirection: "column", gap: SP.m, animation: "nu-rise .16s var(--ke-ease-out) both" }}>

        {/* Toplantı tutanağı kâğıdı — antet başlığı (künye satırı · başlık · çift çizgi) kâğıdın
            KENDİSİNDE; eskiden karartının üstünde yüzen bir şeritti ve arka sayfayla karışıyordu. */}
        <div style={{ background: PAL.bg, borderRadius: RAD.pop, boxShadow: SH.modal, padding: "20px clamp(16px, 3vw, 28px) 28px" }}>
          <header style={{ marginBottom: SP.xl }}>
            <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m, minWidth: 0 }}>
              <span style={{ whiteSpace: "nowrap" }}>T.C. · KAMU-EVRAK</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>TOPLANTI TUTANAĞI</span>
              <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 16 }} />
              <span style={{ whiteSpace: "nowrap", ...TNUM }}>{bugun()}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: SP.l, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 28, lineHeight: "32px", fontWeight: 800, fontStretch: "116%", letterSpacing: "-.025em", color: PAL.ink }}>Bürokrasi Kurulu</h2>
                <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.data, color: PAL.mut2 }}>
                  {taslakAdi && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.ink2, marginRight: SP.s }}>{taslakAdi}</span>}
                  {kurgu.kaynak === "llm" ? "Üç uzman tartışır, revize yeniden ölçülür, sonuç dürüstçe raporlanır." : "Üç ajan, taslağın gerçek doğrulama sinyalleri üzerinden müzakere eder."}
                </p>
              </div>
              <Btn onClick={onKapat} ariaLabel="Kurulu kapat"><Icon.x width={13} height={13} /> Kapat</Btn>
            </div>
            <div aria-hidden="true" style={{ marginTop: SP.l, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
          </header>
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
              // Örnek (etiketli kurgu) senaryoda gerçek revize/gönder çağrısı anlamsız → buton yok.
              onOneriIsle={onRevize && kurgu.kaynak !== "ornek" ? oneriIsle : null}
              isleyen={isleyen}
              onGonder={onGonder && kurgu.kaynak !== "ornek" ? onGonder : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
