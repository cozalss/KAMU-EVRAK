import { useEffect, useRef, useState } from "react";
import { BIRIM_GOSTER, EVRAK_TR } from "./result-cards.jsx";
import { hukumYorum, denetimRozeti, havaleYorum } from "../lib/detayYorum.js";
import { MONO, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, RAD, SP, SR_ONLY, Icon, focusRing, Damga } from "./neonUi.jsx";
import { arr } from "./sonucOrtak.js";
import { gonderimDenetimi } from "../lib/gonderimHazirlik.js";

const TON = {
  yesil: DERIN.yesil,
  sari: DERIN.sari,
  kirmizi: DERIN.kirmizi,
};

const RISK_BAND_HELP = {
  yesil: "Yeşil risk bandı: Kontroller rutin akış için uygun görünüyor; son karar yine yetkili memurdadır.",
  sari: "Sarı risk bandı: Göndermeden önce memurun içerik, eksik alan veya mevzuat işaretlerini kısa kontrol etmesi gerekir.",
  kirmizi: "Kırmızı risk bandı: Otomatik gönderim uygun değildir; memurun ayrıntılı inceleme yapması gerekir.",
};

const ROZET_RENK = {
  yesil: { c: DERIN.yesil, bg: ALFA(BANT.yesil.c) },
  sari: { c: DERIN_OF(BANT.sari.c), bg: ALFA(BANT.sari.c) },
  kirmizi: { c: DERIN_OF(BANT.kirmizi.c), bg: ALFA(BANT.kirmizi.c) },
};

/* Karar şeridinin tek meta slotu (havale/devir).
   Gerekçe artık `title=` native tooltip DEĞİL, klavyeyle açılabilen popover'da: tooltip
   dokunmatikte hiç görünmüyor, ekran okuyucuda güvenilmiyor ve memura "onayla" derken
   dayanağı hover ardında bırakıyordu. Tetik bilinçli olarak `dt` içinde — `dd` iki satıra
   kelepçeli (-webkit-line-clamp + overflow:hidden) olduğu için popover orada kırpılırdı. */
/* Canlı bulunmuş kaynağın tıklanabilir künyesi.
   Bu bileşen DAİMA sarıdır ve "doğrulanmadı" ibaresini taşır: canlı kaynak manifest +
   SHA-256 + insan incelemesinden GEÇMEMİŞTİR (backend/core/canli_kaynak.py). Yeşil rozet
   bu yoldan asla basılmaz — memurun tek bakışta "bu, korpustan gelen doğrulanmış birim
   DEĞİL" diyebilmesi bütün özelliğin dürüstlük şartıdır.
   Adres güvenliği lib/detayYorum.guvenliKaynakAdresi'nde sınanır; buraya yalnız izinli
   resmî HTTPS alanı ulaşır (sunucudaki kontrolün istemci tarafı ikizi). */
export function KaynakLinki({ canli }) {
  return (
    <a
      href={canli.url}
      target="_blank"
      rel="noopener noreferrer"
      data-press=""
      title={canli.url}
      style={{
        display: "inline-flex", alignItems: "center", gap: SP.xs, maxWidth: "100%",
        ...TYPE.meta, fontFamily: MONO, color: DERIN.sari,
        textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer",
      }}
      {...focusRing}
    >
      <span aria-hidden="true" style={{ display: "flex", flex: "none" }}><Icon.dis /></span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{canli.alan}</span>
      <span style={SR_ONLY}> — kaynak sayfası, yeni sekmede açılır; doğrulanmamış kaynak</span>
    </a>
  );
}

function MetaSlot({ slot, id, acik, ac }) {
  const acikMi = acik === id;
  const rozet = slot.rozet ? ROZET_RENK[slot.rozet.ton] || ROZET_RENK.sari : null;
  // Kurum ve birim AYRI biliniyorsa ikisini de eşit ağırlıkta göster (bkz. dd içindeki not).
  const ciftSlot = Boolean(slot.kurum && slot.birim && slot.kurum !== slot.birim);
  return (
    <div>
      <dt>
        <span>{slot.etiket}</span>
        {/* Escape sarmalayıcıda: popover İÇİNDEKİ odakta da çalışsın (yalnız tetikleyicide değil). */}
        <span className="sc-risk-help" onKeyDown={(e) => { if (e.key === "Escape") ac(null); }}>
          <button
            type="button"
            className="sc-risk-help-trigger"
            aria-label={`${slot.etiket} — bu karar neye dayanıyor?`}
            aria-expanded={acikMi}
            onClick={() => ac((v) => (v === id ? null : id))}
            {...focusRing}
          >
            ?
          </button>
          {acikMi && (
            <span className="sc-risk-help-popover" role="dialog" aria-label={`${slot.etiket} gerekçesi`}>
              <span>{slot.gerekce}</span>
            </span>
          )}
        </span>
      </dt>
      <dd style={slot.vurgu && slot.ton ? { color: TON[slot.ton] } : undefined}>
        {/* Havale iki bileşenlidir (KURUM + BİRİM) ve ikisi de karar için eşit kritiktir.
            Eskiden birim `alt` satırında küçük/soluk yazılıp gözden kaçıyordu (kullanıcı
            bulgusu) — artık ikisi de aynı ağırlıkta, her biri kendi mikro etiketiyle.
            Renk/ölçü/boşluk token'dan gelir; elle hex yok (CLAUDE.md UI kuralı). */}
        {ciftSlot ? (
          <span style={{ display: "grid", gap: 2 }}>
            {[["Kurum", slot.kurum], ["Birim", slot.birim]].map(([et, deger]) => (
              <span key={et} style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
                <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", minWidth: 42 }}>{et}</span>
                <span>{deger}</span>
              </span>
            ))}
          </span>
        ) : (
          slot.deger
        )}
        {rozet && (
          <span
            style={{ marginLeft: 6, padding: "1px 7px", borderRadius: RAD.chip, ...TYPE.meta,
                     fontWeight: 500, color: rozet.c, background: rozet.bg, whiteSpace: "nowrap" }}
          >
            {slot.rozet.ton === "yesil" ? "✓ " : ""}{slot.rozet.metin}
          </span>
        )}
      </dd>
      {/* Çift slot açıkken `alt`taki "Birim: X" satırı TEKRAR olur → gizlenir. */}
      {(ciftSlot ? [] : slot.alt).map((satir, i) => (
        <dd key={`${id}-${i}`} style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut2 }}>{satir}</dd>
      ))}
      {/* Canlı kaynak künyesi ÇİFT SLOTTA DA basılır: adresin kendisi kararın dayanağıdır,
          birim adının tekrarı değil. Memur linke bakıp beş saniyede kendi gözüyle
          doğrulayabilsin diye şeritten çıkarılmaz. */}
      {slot.canli && (
        <dd key={`${id}-canli`} style={{ marginTop: 3 }}>
          <KaynakLinki canli={slot.canli} />
        </dd>
      )}
    </div>
  );
}

export default function DecisionCard({ r, eksik, uyari, tutar }) {
  // Tek yardım kanalı: aynı anda yalnız bir gerekçe açık ("risk" | "havale" | "sure" | null).
  const [acikYardim, setAcikYardim] = useState(null);
  // Light-dismiss: gerekçe popover'ı açıkken sayfanın başka yerine basmak kapatır (geçici
  // yüzeyin standart çıkışı — yalnız aynı ? butonuna geri tıklamak yeterli değildi).
  // capture: iç stopPropagation'lar dinleyiciyi atlatamasın; .sc-risk-help içi tıklar muaf.
  useEffect(() => {
    if (!acikYardim) return undefined;
    const disariTik = (e) => { if (!e.target?.closest?.(".sc-risk-help")) setAcikYardim(null); };
    document.addEventListener("pointerdown", disariTik, true);
    return () => document.removeEventListener("pointerdown", disariTik, true);
  }, [acikYardim]);
  const hy = hukumYorum(r);
  const [ana, ...kuyruk] = String(hy.baslik || "İşlem tamamlandı").split(" · ");
  const band = BANT[r.risk_metadata?.bant] ? r.risk_metadata.bant : "yesil";
  const denetimIz = denetimRozeti(r.denetim_izi);
  const kontrolSayisi = eksik.length + uyari.length + tutar.length + arr(r.lint_2646?.uyari).length;
  const riskEtiket = r.risk_metadata?.bant ? `${band === "sari" ? "sarı" : band === "kirmizi" ? "kırmızı" : "yeşil"} risk bandı` : "risk bandı yok";
  const durumSatiri = kuyruk.length ? kuyruk.join(" · ") : riskEtiket;
  // Şeritte TEK karar slotu: "ne yapacağım + kime" (havale/devir). Saf türetim
  // lib/detayYorum'da (orada test edilir); birim kodu→ad görünüm işi olduğu için
  // BIRIM_GOSTER enjekte edilir. Evrak türü (özet+belgede zaten var) ve yasal süre
  // (aşağıdaki SLA kartında duruyor) şeritten bilinçli olarak çıkarıldı — kullanıcı kararı.
  const havale = havaleYorum(r, BIRIM_GOSTER);
  // Not, durum satırının saydığı kontrol noktasını TEKRAR ETMEZ — memurun bir sonraki EYLEMİNİ söyler.
  const onayBekliyor = r.onay_bekliyor === true;
  const kararAciklama = onayBekliyor
    ? "Koşum onay kapısında durdu: taslağı okuyun, ardından onaylayıp gönderin ya da reddedin. Arşiv ve süre adımları kararınızdan sonra koşar."
    : havale.devir
    ? "Kurum içi havale yapmayın: yazıyı yetkili kuruma gönderin ve durumu başvurana yazılı bildirin."
    : kontrolSayisi
      ? "Havaleyi onaylamadan önce işaretli kontrol noktalarını inceleyin."
      : "Kontroller temiz; nihai havale kararı yetkili memurundur.";
  const riskAciklama = RISK_BAND_HELP[band] || RISK_BAND_HELP.yesil;
  // Gönderimi engelleyen taslak kusuru (boş gövde vb.) şeritte de AÇIKÇA söylenir — yalnız fişte değil.
  const engel = r.yazi_taslak_md ? gonderimDenetimi(r.yazi_taslak_md).engel[0] : null;
  const kontroleGit = () => {
    setAcikYardim(null);
    const hedef = document.getElementById("sc-memur-kontrol");
    if (hedef) {
      window.requestAnimationFrame(() => {
        const rect = hedef.getBoundingClientRect();
        const top = window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 2);
        // JS-sürümlü smooth scroll'a CSS kill-switch erişemez — guard elle (GelenEvrakView deseni).
        const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        window.scrollTo({ top: Math.max(0, top), behavior: az ? "auto" : "smooth" });
        hedef.focus({ preventScroll: true });
        hedef.classList.remove("is-highlighted");
        window.requestAnimationFrame(() => {
          hedef.classList.add("is-highlighted");
          window.setTimeout(() => hedef.classList.remove("is-highlighted"), 1800);
        });
      });
    }
  };

  /* BİRİNCİL EYLEM FOLD ÜSTÜNDE (bağımsız denetim: "Onayla ve gönder" 1440×900'de y≈1190'daydı).
     Şeritteki "İncele ve onayla" kendi gönderim yolu KURMAZ — taslak kartındaki asıl düğmeye
     basar; böylece onay fişi + kabul sözleşmesi + kâğıttaki mühür TEK yoldan geçer. Önce kâğıt
     görünür alana kaydırılır: mühür memurun gözü önünde insin. Kaydırma reduced-motion'a uyar. */
  const kararDugmesi = () => {
    const satir = document.querySelector(".sc-main-draft-shell .sc-decision-footer, .sc-draft-card .sc-decision-footer");
    const birincil = satir && Array.from(satir.querySelectorAll("button")).find((b) => /onayla/i.test(b.textContent || ""));
    return { satir, birincil };
  };
  const kararaGit = (ac = false) => {
    const { satir, birincil } = kararDugmesi();
    if (!satir) return;
    const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    satir.scrollIntoView({ block: "end", behavior: az ? "auto" : "smooth" });
    if (!birincil || birincil.disabled) return;
    birincil.focus({ preventScroll: true });
    if (ac) birincil.click();
  };
  const taslakVar = !!String(r.yazi_taslak_md || "").trim();

  // İşlem bitince odak <body>'ye düşüyordu (13 Tab ile karara ulaşılıyordu): sonuç başlığına al.
  // Yalnız odak sahipsizse — memur başka bir öğedeyse odağı çalmayız.
  const baslikRef = useRef(null);
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body || a.id === "nu-main") baslikRef.current?.focus({ preventScroll: true });
  }, []);

  const bantVar = !!r.risk_metadata?.bant;
  const tur = r.evrak_turu ? EVRAK_TR(r.evrak_turu) : "";

  /* HÜKÜM — sonucun tek cümlelik kararı, resmî bir şerh/pusula gibi dizilir:
     mono künye satırı (HÜKÜM · evrak türü ———— hash-zinciri) → geniş Archivo karar başlığı +
     durum satırı · havale sütunu · memurun bir sonraki eylemi · RİSK BANDI DAMGASI.
     Damga bu ekranın tek hükmüdür (dikkat bütçesi): bandın ADINI basar — YEŞİL/SARI/KIRMIZI.
     Puan/yüzde DEĞİL (CLAUDE.md §7: skor beklenen zarardır, olasılık değil); renk de tek
     sinyal değil — damga metni + durum satırı aynı bilgiyi yazıyla taşır. */
  return (
    <section className="sc-decision-card sc-decision-strip-card kd-hukum" aria-labelledby="sc-decision-title">
      <div className="kd-hukum-kunye" aria-hidden="true">
        <span>SONUÇ</span>
        {tur && <span className="kd-hukum-kunye-tur">{tur}</span>}
        <span className="kd-hukum-kunye-cizgi" />
        {denetimIz && (
          <span className="kd-hukum-kunye-iz" title={denetimIz.baslik}>
            <Icon.shield width={11} height={11} />
            {denetimIz.metin}
          </span>
        )}
      </div>
      <div className="kd-hukum-izgara">
        <div className="kd-hukum-baslik">
          <h2 id="sc-decision-title" ref={baslikRef} tabIndex={-1} style={{ outline: "none" }}>{ana}</h2>
          <span className="sc-decision-status-line" style={{ color: TON[hy.ton] || DERIN.sari }}>
            {durumSatiri}
            {bantVar && (
              <span className="sc-risk-help" onKeyDown={(e) => { if (e.key === "Escape") setAcikYardim(null); }}>
                <button
                  type="button"
                  className="sc-risk-help-trigger"
                  aria-label={`${riskEtiket} nedir?`}
                  aria-expanded={acikYardim === "risk"}
                  onClick={() => setAcikYardim((v) => (v === "risk" ? null : "risk"))}
                  {...focusRing}
                >
                  ?
                </button>
                {acikYardim === "risk" && (
                  <span className="sc-risk-help-popover" role="dialog" aria-label="Risk bandı açıklaması">
                    <span>{riskAciklama}</span>
                    <button type="button" onClick={kontroleGit} {...focusRing}>
                      Risk değerlendirmesine git
                    </button>
                  </span>
                )}
              </span>
            )}
          </span>
        </div>
        <dl className="sc-decision-strip-meta kd-hukum-havale" aria-label="Havale kararı">
          <MetaSlot slot={havale} id="havale" acik={acikYardim} ac={setAcikYardim} />
        </dl>
        <p className="kd-hukum-not">
          <span className="kd-hukum-not-etiket">{engel ? "Gönderim kilitli" : onayBekliyor ? "Kararınız bekleniyor" : "Sıradaki adım"}</span>
          {engel ? <span role="status" style={{ color: DERIN.kirmizi }}>{engel.metin}</span> : kararAciklama}
          {taslakVar && (
            <button type="button" className="kd-hukum-karar" onClick={() => kararaGit(true)} data-press="" {...focusRing}
              aria-label={engel ? "Gönderimi engelleyen eksiği gör — onay fişi açılır" : "Yazıyı incele ve onayla — önce gönderim onay fişi açılır"}>
              <Icon.send width={13} height={13} aria-hidden="true" /> {engel ? "Eksiği gör" : "İncele ve onayla"}
            </button>
          )}
        </p>
        {bantVar && (
          <div className="kd-hukum-damga">
            <Damga oncelik={1} ton={BANT[band].c} egim={-6} style={{ padding: "8px 14px 7px", outlineOffset: 3 }}>
              <span className="kd-damga-ic">
                <span className="kd-damga-ust">Risk bandı</span>
                <span className="kd-damga-ad">{BANT[band].l}</span>
              </span>
            </Damga>
          </div>
        )}
      </div>
    </section>
  );
}
