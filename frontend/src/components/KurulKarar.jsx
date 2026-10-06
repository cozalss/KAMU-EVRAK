/* KurulKarar — Bürokrasi Kurulu tutanağının KARAR bölümü (MuzakereKurulu.jsx'ten ayrıldı:
   o dosya 800 satır sınırındaydı). Burada: hüküm (tek kaynak), revizyon önerileri, önce→sonra
   farkı, ÜYE İMZA BLOĞU ve gönderim kapanışı. Müzakere state'i ve akış MuzakereKurulu'da.

   HÜKÜM TEK KAYNAK (tur 6): başlık, damga, tutanağın son satırı ve masanın durum yazısı
   `kurulHukmu`ndan okunur. Eskiden hüküm yalnız `uzlasi_uygulanabilir`e bakıyordu → "DEĞİŞİKLİK
   YOK" damgasının hemen altında iki "Ekle" önerisi duruyordu (kurulun kendi kendisiyle çelişmesi).
   Artık: revize varsa revize; revize yok ama öneri varsa "n ekleme önerdi"; hiçbiri yoksa
   "değişiklik yok". */
import { useMemo, useState } from "react";
import { DISPLAY, MONO, Damga, T, V, R, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon, Btn } from "./neonUi.jsx";
import { KURUL, uyeGor, duruslariCikar } from "./KurulMasasi.jsx";
import { DuzeltmeDiff } from "./NeonDetayParts.jsx";
import { kaynakEtiketi, sozcukteKes } from "../lib/muzakere.js";
import { gonderimDenetimi } from "../lib/gonderimHazirlik.js";
import GonderimOnayFisi from "./GonderimOnayFisi.jsx";

// Tutanak öneri tipi → semantik renk + etiket (düzelt=amber · ekle=yeşil · çıkar=kırmızı).
const TIP = {
  duzelt: { etiket: "Düzelt", col: BANT.sari.c, isim: "düzeltme" },
  ekle: { etiket: "Ekle", col: BANT.yesil.c, isim: "ekleme" },
  cikar: { etiket: "Çıkar", col: BANT.kirmizi.c, isim: "çıkarma" },
};
const TIP_SIRA = ["cikar", "ekle", "duzelt"];   // en sert eylem en üstte

const cekinceli = (kurgu) => kurgu.risk === "sari" || kurgu.risk === "kirmizi";

/** Kurulun hükmü — başlık · damga · tutanak son satırı · masa durumu için TEK kaynak. */
export function kurulHukmu(kurgu) {
  const oneriler = Array.isArray(kurgu?.oneriler) ? kurgu.oneriler : [];
  if (kurgu?.uzlasi_uygulanabilir) {
    return { tur: "revize", baslik: "Kurul revize taslağı önerdi", damga: "Revize önerildi", ton: V, satir: "Kurul revize taslağını hazırladı; memur onayına sunuluyor.", durum: "Revize önerisi hazır" };
  }
  if (oneriler.length) {
    const tipler = [...new Set(oneriler.map((o) => o.tip))];
    const tek = tipler.length === 1 && TIP[tipler[0]] ? TIP[tipler[0]].isim : null;
    const ad = tek ? `${oneriler.length} ${tek}` : `${oneriler.length} öneri`;
    return {
      tur: "oneri", baslik: `Kurul ${ad} önerdi`, damga: tek ? `${tek.charAt(0).toLocaleUpperCase("tr")}${tek.slice(1)} önerildi` : "Öneri sunuldu", ton: T,
      satir: `Kurul ${ad} önerdi; öneriler taslağa henüz işlenmedi.`, durum: `${ad.charAt(0).toLocaleUpperCase("tr")}${ad.slice(1)} önerildi`,
    };
  }
  // olumlu: yalnız çekince YOKSA yeşil ✓. Çekince varken "değişiklik önermedi" bir onay değil,
  // metin yönünden boşluktur — aynı bölümde Birim Amiri "gönderime çıkmamalı" diyor (yanlış sinyal).
  const cekince = cekinceli(kurgu);
  return {
    tur: "yok", baslik: "Kurul değişiklik önermedi", damga: "Değişiklik yok", ton: null, durum: "Değişiklik önerilmedi", olumlu: !cekince,
    satir: cekince ? "Kurul metinde değişiklik önermedi; gönderim çekincesi aşağıda, Birim Amiri'nin sözünde." : "Kurul taslakta değişiklik önermedi — taslak bu hâliyle uygun görüldü.",
  };
}

/* İmza bloğu satırı — üyenin tutanağa GEÇMİŞ son duruşundan (uydurma oy değil). */
function imzaDurumu(id, durus, turlar, cekince) {
  const soz = turlar.filter((t) => t.who === id);
  if (durus === "karsi") {
    const gerekce = [...soz].reverse().find((t) => t.tutum === "karsi")?.text || "";
    return { etiket: "Şerh", aciklama: sozcukteKes(gerekce, 96), serh: true };
  }
  if (durus === "karar") return cekince ? { etiket: "Şerhli onay", aciklama: "Çekince giderilmeden gönderim önerilmez.", serh: true, damga: true } : { etiket: "Onaylıyorum", aciklama: "" };
  if (durus === "gelistir") return { etiket: "Katkıyla katılıyorum", aciklama: "" };
  if (durus === "katil") return { etiket: "Katılıyorum", aciklama: "" };
  return soz.length ? { etiket: "Söz aldı", aciklama: "Duruş bildirmedi." } : { etiket: "Söz almadı", aciklama: "" };
}

/* Üye imza bloğu — resmî kurul tutanağının alt kısmı: ad · görev · beyan. Şerhli amir
   hücresine küçük ŞERHLİ damgası basılır (ekranın ikinci ve son damgası). */
function ImzaBlogu({ kurgu, aksan, az }) {
  const turlar = useMemo(() => kurgu.turlar || [], [kurgu.turlar]);
  const durus = useMemo(() => duruslariCikar(turlar), [turlar]);
  const cekince = cekinceli(kurgu);
  return (
    <div style={{ marginTop: SP.l, paddingTop: SP.m, borderTop: `1px solid ${PAL.lineHi}` }}>
      <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: SP.s }}>Üyeler · beyan ve imza</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: `${SP.m}px ${SP.l}px` }}>
        {KURUL.map((base) => {
          const u = uyeGor(base.id, aksan);
          const b = imzaDurumu(u.id, durus[u.id], turlar, cekince);
          return (
            <li key={u.id} style={{ position: "relative", minWidth: 0, paddingTop: SP.s, borderTop: `1px solid ${PAL.ink}` }}>
              <div style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink }}>{u.ad}</div>
              <div style={{ ...TYPE.meta, color: PAL.mut3 }}>{u.rol}</div>
              <div style={{ marginTop: SP.xs, fontFamily: MONO, fontSize: 11, lineHeight: "16px", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: b.serh ? DERIN.R : DERIN_OF(u.col) }}>
                {b.serh && !b.damga ? <span aria-hidden="true" style={{ marginRight: 4 }}>§</span> : null}{b.etiket}
              </div>
              {b.aciklama && <div style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut2, fontStyle: b.serh ? "italic" : "normal" }}>{b.aciklama}</div>}
              {b.damga && <span style={{ position: "absolute", right: 0, top: SP.s }}><Damga ton={R} egim={-6} kucuk oncelik={2} animasyon={!az}>Şerhli</Damga></span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* Birim Amiri'nin sözü — tutanakta ALINTI gibi: kalın kenar + kendi rengi + imza satırı. */
const AmirSozu = ({ soz, aksan }) => (
  <figure style={{ margin: `0 0 ${SP.l}px`, padding: "4px 0 4px 16px", boxShadow: `inset 3px 0 0 ${aksan}` }}>
    <blockquote style={{ margin: 0, fontFamily: DISPLAY, fontSize: 16, lineHeight: "23px", fontWeight: 500, fontStretch: "100%", color: PAL.ink }}>“{soz}”</blockquote>
    <figcaption style={{ marginTop: 6, display: "flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 600, color: DERIN_OF(aksan) }}>
      <Icon.shield width={13} height={13} /> Birim Amiri · kurulun ölçtüğü bant üzerinden gönderim değerlendirmesi
    </figcaption>
  </figure>
);

/* Telefonda kapanış eylemleri tam genişlik (sağa yaslı yarım düğme yerine başparmak hedefi). */
const KURUL_EYLEM_CSS = `@media (max-width: 560px){[data-kurul-eylem]{width:100%;margin-left:0}[data-kurul-eylem]>*{flex:1 1 100%;display:flex}[data-kurul-eylem] button{width:100%;justify-content:center}}`;

/* Onaya geçiş düğmesi — çekince varsa ikincil "Yine de onaya geç"; fiş açıkken soluk/pasif. */
const OnayDugmesi = ({ geriCek, cekince, soluk, pasif, onAc }) => (
  <span style={{ opacity: soluk ? 0.45 : 1, transition: "opacity .16s ease-out" }}>
    <Btn primary={!geriCek} accent={cekince ? T : DERIN.yesil} disabled={pasif} onClick={onAc}
      ariaLabel={`${geriCek ? "Yine de onaya geç" : "Onayla ve gönder"} — önce onay fişi açılır`}>
      {/* çekince varken ✓ onay sinyali vermez — nötr ileri oku */}
      {geriCek ? <Icon.arrow /> : <Icon.check />} {geriCek ? "Yine de onaya geç" : "Onayla ve gönder"}
    </Btn>
  </span>
);

/* Gönderim denemesi — başarısızlıkta fiş açık kalır (tekrar dene), başarıda kapanır. */
async function gonderimDene({ gonderiyor, denetim, onGonder, finalMetin, setGonderiyor, setHata, setFisAcik }) {
  if (gonderiyor || !denetim.hazir) return;
  setGonderiyor(true); setHata(false);
  try {
    const ok = await onGonder(finalMetin);   // TaslaklarView onSend sonucu (bool)
    if (ok === false) setHata(true); else setFisAcik(false);
  } catch {
    setHata(true);
  } finally {
    setGonderiyor(false);
  }
}

/* Kapanış satırının başlık + açıklaması (durumdan saf türetme). */
function gonderimMetni({ denetim, revizeVar, geriCek, tavsiye, isleBirincil }) {
  const baslik = !denetim.hazir ? "Yazı henüz gönderilemez"
    : revizeVar ? "Kurulun revize taslağı gönderime hazır"
      : geriCek ? (tavsiye ? `Birim Amiri çekince bildirdi — ${tavsiye} öneri işlenmedi` : "Birim Amiri çekince bildirdi")
        : "Taslak kurulca uygun bulundu — gönderime hazır";
  const alt = !denetim.hazir ? denetim.engel[0]?.metin
    : isleBirincil ? "Önce önerileri taslağa işleyin; revize yeniden ölçülür. Gerekirse onaya yine de geçebilirsiniz."
      : revizeVar ? "Onay fişinde künyeyi görüp onaylarsanız revize sürüm Giden Evrak'a gönderilir."
        : "Onay fişinde künyeyi görüp onaylarsanız Giden Evrak'a gönderilir.";
  return { baslik, alt };
}

/* Gönderim kapanışı — tek primary kuralı + kurulun kendi tavsiyesi (tur 6):
   · Birim Amiri çekince bildirdi ve revize YOK → "Onayla ve gönder" primary DEĞİL; tavsiye
     kalan öneri varsa primary "Önerileri taslağa işle", onaya geçiş ikincil ("Yine de onaya geç").
   · Onay fişi açıkken arkadaki CTA pasif (ekranda iki primary görünmez).
   finalMetin: revize varsa kurulun revize metni (onay = revizeyi kabul), yoksa mevcut taslak. */
function GonderimeHazir({ kurgu, aksan, onGonder, r = null, onDuzenle = null, az = false, onTumunuIsle = null, isleyen = null }) {
  const [fisAcik, setFisAcik] = useState(false);
  const [gonderiyor, setGonderiyor] = useState(false);
  const [hata, setHata] = useState(false);
  const revizeVar = !!kurgu.uzlasi_uygulanabilir;
  const cekince = cekinceli(kurgu);
  const tavsiye = (kurgu.oneriler || []).filter((o) => !o.uygulanabilir).length;
  const geriCek = cekince && !revizeVar;                 // kurul "gönderime çıkmamalı" diyor
  const isleBirincil = geriCek && tavsiye > 0 && !!onTumunuIsle;
  const finalMetin = revizeVar ? (kurgu.uzlasi_metni || "") : (kurgu.taslak || []).map((l) => l.metin).join("\n");
  const denetim = useMemo(() => gonderimDenetimi(finalMetin), [finalMetin]);
  const amirSoz = (kurgu.turlar || []).filter((t) => t.who === "birim_amiri").slice(-1)[0]?.text || "";
  const gonder = () => gonderimDene({ gonderiyor, denetim, onGonder, finalMetin, setGonderiyor, setHata, setFisAcik });
  const { baslik, alt } = gonderimMetni({ denetim, revizeVar, geriCek, tavsiye, isleBirincil });
  const pasif = fisAcik || isleyen != null;
  return (
    <div style={{ marginTop: SP.l, animation: az ? "none" : "nu-rise .28s var(--ke-ease-out) both" }}>
      {amirSoz && <AmirSozu soz={amirSoz} aksan={aksan} />}
      <style>{KURUL_EYLEM_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "14px 16px", borderRadius: RAD.card, background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
        {/* ikon + metin TEK satır birimi: telefonda ikon kendi satırına düşmez */}
        <span style={{ display: "flex", alignItems: "flex-start", gap: SP.m, minWidth: 0, flex: "1 1 260px" }}>
          <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 2, color: !denetim.hazir ? DERIN.kirmizi : geriCek ? DERIN_OF(aksan) : DERIN.yesil }}>{!denetim.hazir || geriCek ? <Icon.alert /> : <Icon.shield />}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink }}>{baslik}</span>
            <span style={{ display: "block", ...TYPE.meta, color: denetim.hazir ? PAL.mut2 : DERIN.kirmizi }}>{alt}</span>
          </span>
        </span>
        <span data-kurul-eylem="" style={{ marginLeft: "auto", display: "inline-flex", gap: SP.s, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isleBirincil && (
            <Btn primary accent={T} onClick={onTumunuIsle} disabled={pasif}>
              {isleyen === "hepsi" ? <><Icon.spin width={14} height={14} /> İşleniyor…</> : <><Icon.plus width={14} height={14} /> Önerileri taslağa işle ({tavsiye})</>}
            </Btn>
          )}
          <OnayDugmesi geriCek={geriCek} cekince={cekince} soluk={fisAcik} pasif={pasif} onAc={() => { setHata(false); setFisAcik(true); }} />
        </span>
      </div>
      {fisAcik && (
        <GonderimOnayFisi denetim={denetim} r={r} gonderiliyor={gonderiyor} hata={hata}
          onOnayla={gonder} onVazgec={() => setFisAcik(false)}
          onDuzenle={() => { setFisAcik(false); onDuzenle?.(); }} />
      )}
    </div>
  );
}

/* Tek öneri satırı — tip etiketi · metin · dürüst bayrak (işlendi/tavsiye) · tek tık işle. */
function OneriSatiri({ o, ilk, onOneriIsle, isleyen }) {
  const t = TIP[o.tip] || TIP.duzelt;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: SP.s, padding: "8px 0", borderTop: ilk ? "none" : `1px solid ${PAL.line}` }}>
      <span style={{ flex: "none", marginTop: 1, ...TYPE.meta, fontWeight: 600, color: DERIN_OF(t.col), background: ALFA(t.col), borderRadius: RAD.chip, padding: "2px 8px", minWidth: 52, textAlign: "center" }}>{t.etiket}</span>
      <span style={{ flex: "1 1 220px", minWidth: 0, ...TYPE.data, color: PAL.ink2 }}>
        {o.metin}
        {o.uygulanabilir ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: SP.s, ...TYPE.meta, fontWeight: 500, color: DERIN.yesil }}>
            <Icon.check width={11} height={11} /> revize taslağa işlendi
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: SP.s, ...TYPE.meta, fontWeight: 500, color: PAL.mut3 }}>tavsiye · memur değerlendirir</span>
        )}
      </span>
      <span style={{ flex: "none", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.s }}>
        {!o.uygulanabilir && onOneriIsle && (
          <Btn onClick={() => onOneriIsle(o)} disabled={isleyen != null} ariaLabel={`Öneriyi revize taslağa işle: ${String(o.metin).slice(0, 60)}`} style={{ padding: "3px 10px", minHeight: 30 }}>
            {isleyen === o ? <><Icon.spin width={12} height={12} /> İşleniyor…</> : <><Icon.plus width={12} height={12} /> Taslağa işle</>}
          </Btn>
        )}
        {kaynakEtiketi(o.kaynak) && <span style={{ flex: "none", ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase" }}>{kaynakEtiketi(o.kaynak)}</span>}
      </span>
    </div>
  );
}

/* Ölçülen yakınsama — revize metin sunucuda yeniden ölçüldü; ölçüm yoksa satır basılmaz. */
function Yakinsama({ y }) {
  const temiz = !y.duran && !y.yeni;
  const renk = temiz ? BANT.yesil.c : BANT.sari.c;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, marginBottom: SP.m, padding: "8px 12px", borderRadius: RAD.card, background: ALFA(renk) }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 1, color: DERIN_OF(renk) }}><Icon.scale width={15} height={15} /></span>
      <span style={{ ...TYPE.data, color: PAL.ink2, ...TNUM }}>
        <strong style={{ fontWeight: 600 }}>{y.tur} tur müzakere</strong>{" · revize uygulanırsa: "}
        <strong style={{ fontWeight: 600, color: DERIN.yesil }}>{y.dusen} uyarı düşüyor</strong>
        {!!y.duran && <>{" · "}<strong style={{ fontWeight: 600, color: DERIN_OF(BANT.sari.c) }}>{y.duran} uyarı duruyor</strong></>}
        {!!y.yeni && <>{" · "}<strong style={{ fontWeight: 600, color: DERIN_OF(BANT.kirmizi.c) }}>revizyon {y.yeni} yeni uyarı üretiyor</strong></>}
        {temiz && " — taslakta işaretli uyarı kalmıyor."}
        <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, marginTop: 2 }}>Sayılar revize metin üzerinde yeniden ölçüldü (kurulun beyanı değil).</span>
      </span>
    </div>
  );
}

/* Revize taslağı → uygulamadan ÖNCE önce→sonra farkı (görünür HITL onayı). */
const RevizeFarki = ({ diff }) => (
  <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
    <div style={{ ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>Kurulun hazırladığı revize taslağı — mevcut taslakla fark</div>
    <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>Eklenen satır “+”, çıkarılan satır “−” ile işaretlidir. Onaylamadan uygulanmaz.</div>
    <DuzeltmeDiff eski={diff.eski} yeni={diff.yeni} />
  </div>
);

/* Kurul Tutanağı — KARAR bölümü: hüküm · öneriler · fark · imza bloğu · gönderim kapanışı. */
export function KurulTutanagi({ kurgu, aksan, az, onUygula, onOneriIsle = null, onTumunuIsle = null, isleyen = null, onGonder = null, r = null }) {
  const oneriler = Array.isArray(kurgu.oneriler) ? kurgu.oneriler : [];
  const sirali = TIP_SIRA.flatMap((t) => oneriler.filter((o) => o.tip === t));
  const uygulanabilir = !!onUygula && !!kurgu.uzlasi_uygulanabilir;
  const diff = kurgu.uzlasi_uygulanabilir ? { eski: (kurgu.taslak || []).map((l) => l.metin).join("\n"), yeni: kurgu.uzlasi_metni || "" } : null;
  const uygulanan = oneriler.filter((o) => o.uygulanabilir).length;
  const h = kurulHukmu(kurgu);
  return (
    <section aria-label="Kurul kararı" style={{ marginTop: SP.xxl, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: "20px clamp(16px, 2.4vw, 24px) 22px", animation: az ? "none" : "nu-rise .25s var(--ke-ease-out) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", paddingBottom: SP.m, marginBottom: SP.m, borderBottom: `1px solid ${PAL.lineHi}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 4 }}>III. Karar · kurulun hükmü</div>
          <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{h.baslik}</h3>
        </div>
        {/* oncelik 3: modal arkadaki Taslaklar ekranının damgalarını (oncelik 1) örter — hüküm
            kurul ekranının en önemli olgusudur, bütçede çipe inmemeli. */}
        <Damga ton={h.ton || aksan} egim={-5} oncelik={3} animasyon={!az}>{h.damga}</Damga>
        {uygulanan > 0 && <span style={{ marginLeft: "auto", ...TYPE.meta, fontWeight: 600, color: DERIN.yesil, ...TNUM }}>{uygulanan} / {oneriler.length} işlendi</span>}
      </div>
      {kurgu.yakinsama && <Yakinsama y={kurgu.yakinsama} />}
      {sirali.length === 0 ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.data, color: h.olumlu ? DERIN.yesil : PAL.ink2 }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 3, color: h.olumlu ? DERIN.yesil : PAL.mut3 }}>{h.olumlu ? <Icon.check width={15} height={15} /> : <Icon.info width={15} height={15} />}</span>
          <span style={{ minWidth: 0 }}>{h.satir}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sirali.map((o, i) => <OneriSatiri key={`${o.tip}-${o.kaynak}-${i}`} o={o} ilk={i === 0} onOneriIsle={onOneriIsle} isleyen={isleyen} />)}
        </div>
      )}
      {diff && <RevizeFarki diff={diff} />}
      {uygulanabilir && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.m, marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2, flex: "1 1 220px" }}>
            {onGonder ? "İsterseniz yalnız taslağa kaydedip sonra gönderebilirsiniz:" : "Kalıcı yazım memur kararıdır — kurul hiçbir değişikliği kendiliğinden uygulamaz."}
          </span>
          <span style={{ marginLeft: "auto" }}>
            {/* onGonder varsa primary "Onayla ve gönder"e devredilir → uygula ikincil kalır (tek primary). */}
            <Btn primary={!onGonder} accent={aksan} onClick={onUygula} style={{ whiteSpace: "nowrap" }}>
              <Icon.check /> {onGonder ? "Yalnız taslağa kaydet" : "Revize taslağını uygula"}
            </Btn>
          </span>
        </div>
      )}
      <ImzaBlogu kurgu={kurgu} aksan={aksan} az={az} />
      {onGonder && <GonderimeHazir kurgu={kurgu} aksan={aksan} onGonder={onGonder} r={r} onDuzenle={onUygula} az={az} onTumunuIsle={onTumunuIsle} isleyen={isleyen} />}
    </section>
  );
}
