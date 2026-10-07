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
import { createPortal } from "react-dom";
import { DISPLAY, T, PAL, DERIN_OF, BANT, TYPE, TNUM, RAD, SP, SH, Icon, Btn, odakDongusu, focusRing } from "./neonUi.jsx";
import { UYE, uyeGor, turEtiketi, RISK, aksanRenk, KurulMasasi, duruslariCikar, TurSeridi, TutanakMaddesi, Yaziyor, TaslakKarti, KurulYukleniyor } from "./KurulMasasi.jsx";
import { KurulTutanagi, KurulHukumBasligi, kurulHukmu } from "./KurulKarar.jsx";
import { muzakereKurgusu, editUygula, nihaiTaslak, sunucuKurgusu, kurguUzlasiMetni, metniSatirlara, kurulRiskOzeti } from "../lib/muzakere.js";
import { apiStream } from "../lib/authApi.js";

// Yalnız AÇILIŞ turunu bekler (sonrası akışla gelir): açılış gelmezse deterministik motora düş.
// Sunucu açılış bütçesi 30 sn (KURUL_ACILIS_TIMEOUT_S) + ilk sinyal ölçümü → 45 sn güvenli tavan.
// Denetim turları bu tavana TABİ DEĞİL; akış açıldıktan sonra turlar geldikçe eklenir.
const KURUL_FETCH_TIMEOUT_MS = 45000;

const THINK = 900, READ = 1700;
// Telefon başlığı: ürün öneki ve metin "Kapat" düğmesi gizlenir, ikon kapat künye satırına çıkar.
const KURUL_BASLIK_CSS = `.ke-kurul-kapat-ikon{display:none}
@media (max-width:720px){.ke-kurul-kapat-ikon{display:grid}.ke-kurul-kapat-metin{display:none}}
@media (max-width:480px){.ke-kurul-onek{display:none}}
@media (max-width:720px){.ke-kurul-kap{padding-bottom:calc(72px + env(safe-area-inset-bottom))!important}}
@media (min-width:1600px){.ke-kurul-govde{--ke-kurul-w:1280px}}`;
// Tutanak antetindeki toplantı tarihi (gg.aa.yyyy — resmî biçim).
const bugun = () => new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
// Tutanak tur başlıklarının sıra numarası (resmî tutanak dili: I., II., III.).
const ROMA = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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

/* Müzakere sahnesi — animasyon state'inin TEK sahibi. CANLI AKIŞ: kurgu.turlar akışla büyür
   (açılış → +çapraz), reveal restart ETMEDEN devam eder (`akan`=stream sürüyor). Key yalnız
   kaynak değişince (llm↔deterministik) verilir → aynı akış içinde remount yok. */
function KurulSahnesi({ kurgu, az, onUygula, akan = false, onOneriIsle = null, onTumunuIsle = null, isleyen = null, onGonder = null, belgeBant = "", r = null }) {
  const aksan = aksanRenk(kurgu.risk);
  // Belgenin işlem anındaki bandı ile kurulun YENİDEN ölçtüğü bant ayrı olgulardır; farklıysa
  // masa bunu açıkça söyler (tur-4: fiş "SARI", kurul "yüksek risk" — hangisi doğru?).
  const riskOzet = kurulRiskOzeti(belgeBant, kurgu.risk);
  const riskRozet = riskOzet ? RISK[riskOzet.bant] : null;
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
  // Başlık: revizyon çıktısı odaklı (verdict değil). Hüküm TEK kaynaktan (KurulKarar.kurulHukmu):
  // masa, tutanağın son satırı ve karar bölümü aynı cümleyi kurar (tur 6 çelişkisi).
  const degisiklikN = kurgu.degisiklik || (kurgu.oneriler || []).filter((o) => o.uygulanabilir).length;
  const hukum = kurulHukmu(kurgu);
  // BEKLEME DURUMU: akış açık ama oynatılacak tur kalmadı → sunucu SIRADAKİ turu üretiyor.
  // Bu bekleme 40-90 sn sürebilir (reasoning modeli düşünüyor). Göstergesiz bırakılınca ekran
  // "3/3 tur" + donmuş transkriptle TAKILMIŞ gibi okunuyordu (kullanıcı bildirimi, 7 Ağu 2026).
  const bekliyor = bekleniyor;
  const sonrakiTur = TURLAR.length && TURLAR[TURLAR.length - 1].tur === 0
    ? "Çapraz eleştiri" : "Denetim";
  const durum = !done
    ? (bekliyor ? `${sonrakiTur} turu hazırlanıyor${bekleyenSn ? ` · ${bekleyenSn} sn` : ""}` : "Müzakere sürüyor")
    : hukum.tur === "revize" ? `Revize önerisi hazır${degisiklikN ? ` · ${degisiklikN} değişiklik` : ""}` : hukum.durum;
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
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskRozet.c }} /> Risk bandı: {riskRozet.bant} · {riskRozet.etiket.toLocaleLowerCase("tr-TR")}
            </span>
          )}
          {riskOzet?.fark && (
            <span style={{ ...TYPE.meta, color: PAL.mut2, maxWidth: 340 }}>
              Karar fişinde {RISK[riskOzet.belge].bant} idi; kurul taslağı yeniden ölçtü, bant {riskOzet.fark === "yukseldi" ? "yükseldi" : "düştü"}.
            </span>
          )}
        </>
      } />

      {/* Hüküm masanın hemen altında — toplantı kapanınca ilk görünen olgu (tur 8). */}
      {done && <KurulHukumBasligi kurgu={kurgu} aksan={aksan} az={az} />}

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
          {/* Besleme kendi içinde kayar (masaüstü); tur şeritleri YAPIŞKAN — otomatik kaydırmada
              bölüm başlığı çift çizginin altında yarım kesilmez, üst kenar 12px'te solar.
              Telefonda iç kaydırma YOK (başparmak tuzağı): tutanak modal akışında büyür. */}
          {/* Kaydırma kabı klavyeyle odaklanır (tabIndex 0): tek odak dili (global çift çizgi) +
              sol iç boşluk — tarayıcının kare siyah çerçevesi metnin kenarına biniyordu (tur 8). */}
          <div ref={feedRef} className="ke-kurul-besleme" tabIndex={0} aria-label="Toplantı tutanağı" {...focusRing} style={{ display: "flex", flexDirection: "column", padding: `0 ${SP.xs}px 0 ${SP.s}px`, borderTop: `2px solid ${PAL.ink}`, borderRadius: 2 }}>
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
              /* ✓ yalnız olumlu/revize hükümde; çekince varken nötr bilgi glifi + nötr renk (renk tek sinyal değil). */
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "10px 0 2px", borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: hukum.olumlu || hukum.tur === "revize" ? DERIN_OF(aksan) : PAL.ink2, fontWeight: 500, animation: az ? "none" : "nu-rise .2s var(--ke-ease-out) both" }}>
                {hukum.olumlu || hukum.tur === "revize" ? <Icon.check /> : <Icon.info width={15} height={15} />} {hukum.satir}
              </div>
            )}
          </div>
        </section>

        {/* Sağ — masadaki evrak: müzakere sürerken orijinal, bitince kurulun REVİZE taslağı */}
        <TaslakKarti draft={gosterilenDraft} revize={revizeGoster} kunye={done ? hukum.kunye : null} />
      </div>

      {/* Tartışmanın sonucu — tutanak yalnız müzakere bitince açılır (canlı gerilim korunur) */}
      {done && <KurulTutanagi kurgu={kurgu} aksan={aksan} az={az} onUygula={onUygula} onOneriIsle={onOneriIsle} onTumunuIsle={onTumunuIsle} isleyen={isleyen} onGonder={onGonder} r={r} />}
    </div>
  );
}

/* Oturum önbelleği — tamamlanmış canlı kurul, taslağın result nesnesine bağlı tutulur.
   Tur-4 bulgusu: Esc ~30 sn'lik (ücretli) müzakereyi sormadan atıyordu ve yeniden açmak
   yeni bir LLM turu demekti. Artık kapanan kurul aynı taslakta yeniden açılınca tutanak
   BİTMİŞ belge olarak geri gelir (işlenen öneriler dahil); "Yeniden topla" taze müzakere
   başlatır. Taslak güncellenince result değişir → eski tutanak kendiliğinden düşer (WeakMap). */
const KURUL_ONBELLEK = new WeakMap();

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
  // Canlı kurul (LLM) denendi ama gelmedi → yerel deterministik motor. Sessizce "aynı şey"
  // gibi sunulmaz: başlıkta dürüst bir satır söyler (CLAUDE.md §9 ruhu — koşmayan şey koştu sayılmaz).
  const [yedek, setYedek] = useState(false);
  const [bekSn, setBekSn] = useState(0);   // açılış beklenirken geçen süre (takıldı mı, sürüyor mu)
  const [tazele, setTazele] = useState(0);   // "Yeniden topla" → önbellek atlanır
  const [onbellekten, setOnbellekten] = useState(false);
  // Canlı kurul yerleşince (akış bitti) tutanak önbelleğe yazılır — öneri işlendikçe güncellenir.
  useEffect(() => {
    if (result && durum === "hazir" && !akan && kurgu?.kaynak === "llm") KURUL_ONBELLEK.set(result, kurgu);
  }, [result, durum, akan, kurgu]);
  useEffect(() => {
    if (durum !== "yukleniyor") { setBekSn(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setBekSn(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [durum]);

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
  // "Önerileri taslağa işle" (tur 6): Birim Amiri çekince bildirdiğinde birincil eylem budur.
  // Tavsiye kalan öneriler SIRAYLA aynı /yazi/dogrula talimat yolundan geçer; her biri bir
  // öncekinin ürettiği metnin üzerine işlenir (yarış yok). Kalıcı yazım yine memurun kararı.
  const oneriIsleHepsi = async () => {
    if (!onRevize || isleyen != null) return;
    const bekleyen = (kurgu.oneriler || []).filter((o) => !o.uygulanabilir);
    if (!bekleyen.length) return;
    setIsleyen("hepsi");
    let taban = kurguUzlasiMetni(kurgu);
    const islenen = [];
    try {
      for (const o of bekleyen) {
        const d = await onRevize(taban, `Kurul önerisini taslağa işle (tip: ${o.tip}): ${o.metin}`);
        if (d?.taslak_md && d.taslak_md.trim() !== taban.trim()) { taban = d.taslak_md; islenen.push(o); }
      }
    } catch (err) {
      console.warn("Kurul önerileri taslağa işlenemedi", err);
      onToast("Öneriler işlenirken bağlantı koptu — işlenenler korundu, kalanı tek tek deneyin.");
    } finally {
      if (islenen.length) {
        setKurgu((k) => ({
          ...k,
          oneriler: k.oneriler.map((o) => (islenen.includes(o) ? { ...o, uygulanabilir: true } : o)),
          uzlasi_metni: taban, uzlasi_uygulanabilir: true, degisiklik: (k.degisiklik || 0) + islenen.length,
        }));
      }
      onToast(islenen.length === bekleyen.length
        ? `${islenen.length} öneri revize taslağa işlendi — farkı inceleyip onaya geçebilirsiniz.`
        : `${islenen.length}/${bekleyen.length} öneri metinde değişiklik üretti; diğerleri tavsiye olarak kaldı.`);
      setIsleyen(null);
    }
  };
  const kapatRef = useRef(null);
  const oncekiOdak = useRef(null);
  // BelgeModal deseni: onKapat çoğu zaman inline arrow gelir (her render'da yeni kimlik) —
  // effect ona bağımlı olsaydı her üst-render odak/dinleyici kurulumunu yıkar-kurardı.
  // Ref-dolaylama ile effect YALNIZ mount/unmount'ta koşar, kapatma daima güncel callback'i çağırır.
  // Öneri revize taslağa işlenirken (uçuşta istek) kapatma ertelenir: yarım iş sessizce
  // kaybolmasın. İstek bitince tutanak önbellekte; kapatıp yeniden açmak hiçbir şey kaybettirmez.
  const isleyenRef = useRef(isleyen); isleyenRef.current = isleyen;
  const kapat = () => {
    if (isleyenRef.current != null) { onToast("Öneri taslağa işleniyor — bitince kapatabilirsiniz."); return; }
    onKapat();
  };
  const kapatIstegiRef = useRef(kapat);
  useEffect(() => { kapatIstegiRef.current = kapat; });

  // DeepSeek kurul müzakeresini CANLI AKIŞLA (SSE) çek — açılış turları hazır olunca (~3s)
  // ANINDA animasyona başlar (dead-wait yok), çapraz-eleştiri gelince eklenir. LLM yok/hata/
  // timeout → deterministik TAM debate (mock ayakta, uç asla kilitlenmez).
  useEffect(() => {
    if (!result?.yazi_taslak_md) { setKurgu(yerel); setDurum("hazir"); setAkan(false); return undefined; }
    const onceki = tazele === 0 ? KURUL_ONBELLEK.get(result) : null;
    if (onceki) { setKurgu(onceki); setDurum("hazir"); setAkan(false); setYedek(false); setOnbellekten(true); return undefined; }
    setOnbellekten(false);
    let alive = true;
    const ac = new AbortController();
    setDurum("yukleniyor"); setAkan(false); setYedek(false);
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
      if (alive && !acildi) { ac.abort(); setKurgu(yerel); setDurum("hazir"); setYedek(true); }
    }, KURUL_FETCH_TIMEOUT_MS);

    // İstek bir tık ERTELENİR: StrictMode (dev) efekti kur→sök→kur koşturur ve hızlı aç-kapa
    // da aynı deseni üretir. Hemen sökülen efektte zamanlayıcı iptal olur, sunucuya hiç istek
    // gitmez — önceden ilk istek iptal edilse de sunucu LLM çağrısını başlatmış oluyordu
    // (her Kurul açılışı 2× müzakere faturası, tur 3 ölçümü).
    const baslat = setTimeout(() => apiStream("/yazi/kurul/akis", govde, (olay) => {
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
      .then(() => { if (alive) { clearTimeout(zamanAsimi); setAkan(false); if (!sonucGeldi) { setKurgu(yerel); setDurum("hazir"); setYedek(true); } } })
      .catch(() => { if (alive) { clearTimeout(zamanAsimi); setAkan(false); if (!sonucGeldi) { setKurgu(yerel); setDurum("hazir"); setYedek(true); } } }), 0);
    return () => { alive = false; clearTimeout(baslat); clearTimeout(zamanAsimi); ac.abort(); };
  }, [result, yerel, tazele]);

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
    /* Simetrik pay (tur-4: üstte 32px, altta 0 — kâğıt pencere dibine yapışıyordu): kâğıt
       pencereye sığar, kaydırma kâğıdın İÇİNDEdir; antet her zaman aynı yerde başlar. */
    // Portal (z 80): onay fişi (GonderimOnayFisi, kendi portalı, z 80) DOM'da SONRA geldiği
    // için kurulun ÜSTÜNDE açılır — kurul z'sini yükseltmek fişi arkada bırakırdı (akış kırılır).
    // Telefonda alt sekme şeridi (z 90) kâğıdın dibini örtmesin diye kap altta pay bırakır.
    createPortal(<div role="dialog" aria-modal="true" aria-label="Bürokrasi Kurulu" className="ke-kurul-kap" onClick={() => kapatIstegiRef.current()} onKeyDown={odakDongusu}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: PAL.scrimKoyu, display: "flex", padding: "clamp(12px, 4vh, 32px) clamp(8px, 2vw, 32px)", boxSizing: "border-box", animation: "nu-sol .16s var(--ke-ease-out) both" }}>
      {/* ref+tabIndex: açılışta odak diyalog kabına girer (WCAG dialog deseni; bug avı: kapatRef
          hiçbir öğeye bağlı değildi → focus no-op, odak arka planda kalıyordu). */}
      <div ref={kapatRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="ke-kurul-govde" style={{ width: "min(var(--ke-kurul-w, 1060px), 100%)", maxHeight: "100%", margin: "0 auto", outline: "none", display: "flex", flexDirection: "column", minHeight: 0, animation: "nu-kagit .22s var(--ke-ease-out) both" }}>

        {/* Toplantı tutanağı kâğıdı — antet başlığı (künye satırı · başlık · çift çizgi) kâğıdın
            KENDİSİNDE; eskiden karartının üstünde yüzen bir şeritti ve arka sayfayla karışıyordu. */}
        <div data-kurul-kagit="" style={{ background: PAL.bg, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, padding: "20px clamp(16px, 3vw, 28px) 28px", overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
          <header style={{ marginBottom: SP.xl }}>
            {/* Künye: "T.C." yok (bağımsız ürün devlet kimliği taşımaz — ViewWrap kararı); telefonda
                ürün öneki gizlenir, değişken kısım ("TOPLANTI TUTANAĞI") kesilmez. Kapat telefonda
                künyeyle aynı satırda 44×44 ikon (tur 6: akışın ortasında koca bir düğmeydi). */}
            <style>{KURUL_BASLIK_CSS}</style>
            <div style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m, minWidth: 0 }}>
              <span aria-hidden="true" className="ke-kurul-onek" style={{ whiteSpace: "nowrap" }}>KAMU-EVRAK ·</span>
              <span aria-hidden="true" style={{ whiteSpace: "nowrap" }}>TOPLANTI TUTANAĞI</span>
              <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 16 }} />
              <span aria-hidden="true" style={{ whiteSpace: "nowrap", ...TNUM }}>{bugun()}</span>
              <button type="button" className="ke-kurul-kapat-ikon" onClick={() => kapatIstegiRef.current()} aria-label="Kurulu kapat" data-press=""
                style={{ cursor: "pointer", width: 44, height: 44, margin: "-12px -10px -12px 0", placeItems: "center", border: "none", borderRadius: RAD.ctl, background: "transparent", color: PAL.ink2 }}>
                <Icon.x width={18} height={18} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: SP.l, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 28, lineHeight: "32px", fontWeight: 800, fontStretch: "116%", letterSpacing: "-.025em", color: PAL.ink }}>Bürokrasi Kurulu</h2>
                {taslakAdi && (
                  <p style={{ margin: `${SP.s}px 0 0`, display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0, ...TYPE.data, color: PAL.ink2, fontWeight: 500 }}>
                    <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", flexShrink: 0 }}>Gündem</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={taslakAdi}>{taslakAdi}</span>
                  </p>
                )}
                <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut2 }}>
                  {kurgu.kaynak === "llm"
                    ? "Dört üye taslağı tartışır; önerilen revize, taslak yeniden ölçülerek sınanır."
                    : "Dört üye, taslağın ölçülmüş doğrulama sinyalleri üzerinden müzakere eder."}
                </p>
              </div>
              <span className="ke-kurul-kapat-metin"><Btn onClick={() => kapatIstegiRef.current()} ariaLabel="Kurulu kapat"><Icon.x width={13} height={13} /> Kapat</Btn></span>
            </div>
            {onbellekten && (
              <p role="note" style={{ margin: `${SP.m}px 0 0`, display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", ...TYPE.meta, color: PAL.mut2 }}>
                <span style={{ ...TYPE.antet, textTransform: "uppercase", color: PAL.ink2, padding: "1px 6px", border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.chip }}>Kayıtlı tutanak</span>
                Bu taslak için bu oturumda toplanan kurulun tutanağı açıldı.
                <Btn onClick={() => setTazele((n) => n + 1)} style={{ padding: "3px 10px", minHeight: 28 }}><Icon.undo width={12} height={12} /> Yeniden topla</Btn>
              </p>
            )}
            {yedek && kurgu.kaynak !== "llm" && (
              <p role="note" style={{ margin: `${SP.m}px 0 0`, display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", ...TYPE.meta, color: PAL.mut2 }}>
                <span style={{ ...TYPE.antet, textTransform: "uppercase", color: DERIN_OF(BANT.sari.c), padding: "1px 6px", border: `1px solid ${BANT.sari.c}`, borderRadius: RAD.chip }}>Yerel motor</span>
                Canlı kurula ulaşılamadı; müzakere taslağın ölçülmüş doğrulama sinyallerinden deterministik kuruldu.
              </p>
            )}
            <div aria-hidden="true" style={{ marginTop: SP.l, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
          </header>
          {durum === "yukleniyor" ? (
            <KurulYukleniyor az={az} sn={bekSn} tavanSn={KURUL_FETCH_TIMEOUT_MS / 1000} />
          ) : kurgu.toplanamaz ? (
            <div style={{ padding: "40px 20px", textAlign: "center", ...TYPE.data, color: PAL.mut2 }}>
              Bu taslak için kurul toplanamıyor — müzakere edilecek yazı metni bulunamadı.
            </div>
          ) : (
            <KurulSahnesi
              key={`${kurgu.kaynak}-${tazele}-${onbellekten}`}
              kurgu={kurgu}
              // Önbellekten açılan tutanak BİTMİŞ belgedir: yeniden oynatılmaz (statik açılır).
              az={az || onbellekten}
              belgeBant={result?.risk_metadata?.bant || ""}
              r={result}
              akan={akan}
              onUygula={onUygula ? () => onUygula(kurguUzlasiMetni(kurgu)) : null}
              // Örnek (etiketli kurgu) senaryoda gerçek revize/gönder çağrısı anlamsız → buton yok.
              onOneriIsle={onRevize && kurgu.kaynak !== "ornek" ? oneriIsle : null}
              onTumunuIsle={onRevize && kurgu.kaynak !== "ornek" ? oneriIsleHepsi : null}
              isleyen={isleyen}
              onGonder={onGonder && kurgu.kaynak !== "ornek" ? onGonder : null}
            />
          )}
        </div>
      </div>
    </div>, document.body)
  );
}
