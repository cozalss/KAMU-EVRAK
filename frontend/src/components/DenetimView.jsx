/* DenetimView — değiştirilemez denetim izi kayıtları. Her işlenen evrak için değişikliği
   açığa çıkaran SHA-256 hash-zinciri (Sayıştay/KVKK uyumlu). Oturum geçmişinden (gerçek denetim_izi).
   "Antet & Damga" (2026-10): ortak sicil defteri yüzeyi (SicilDefter). Zincir hücresi son
   hash'in parmak izini çizer (veriden türer); satır açılınca zincir doğrulama çekmecesi
   halkaları gösterir ve sunucuda bağımsız doğrular (DenetimZincir.jsx). */
import React, { useCallback, useMemo, useState } from "react";
import { ViewWrap, Btn, Icon, MONO, V, R, PAL, BANT, DERIN, TYPE, TNUM, RAD, SP, SH, SR_ONLY } from "./neonUi.jsx";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, cleanDemoText } from "./result-cards.jsx";
import { SicilStil, BaslikHucre, DefterYuzey, BosDefter, DefterNotu, DefterIskelet, SessizCip, useDefterGezinme, Imlec, HUCRE, DEFTER_NO, DEFTER_MARJ, GrupBasligi } from "./SicilDefter.jsx";
import { ParmakIzi, HalkaSeridi, ZincirCekmece, kisaHash, semaAdi } from "./DenetimZincir.jsx";
import { bosDurumMetni } from "../lib/sicilDefter.js";

const fmtGun = (ts) => { try { return new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return ""; } };
const fmtSaat = (ts) => { try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } };

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, evrak adı…", label: "Denetim izinde ara" },
  chips: [{ id: "bant", label: "Risk", options: [
    { value: "yesil", label: "Yeşil · Düşük", color: BANT.yesil.c },
    { value: "sari", label: "Sarı · Orta", color: BANT.sari.c },
    { value: "kirmizi", label: "Kırmızı · Yüksek", color: BANT.kirmizi.c },
  ] }],
  select: [{ id: "evrak_turu", label: "Evrak türü", options: [] }],
  dateRange: { enabled: true, label: "İşlem tarihi" },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "risk_desc", label: "Risk (yüksek→düşük)" },
  ] },
  dataMapping: { search: ["_konu", "name"], bant: "bant", evrak_turu: "evrak_turu", dateField: "ts" },
};

/* Defter şablonu — zaman damgası · evrak · (risk) · zincir · eylem. Tur 8: boşluk satırın sonuna
   TAŞINMAZ, bilgiyle dolar — zincir sütunu kalan genişliği alır ve halka şeridini (adım sayısı
   kadar düğüm, kökten sona) çizer. Zaman sütunu + kırmızı cetvel diğer defterlerle AYNI x'te
   (DEFTER_NO/DEFTER_MARJ). Liste tek bantlıysa risk sütunu kalkar, bant nota iner (33 satırda
   aynı "Sarı · Orta" bilgi taşımıyordu). Telefonda zincir + eylem son satırda. */
/* Tur 8 (2. jüri): tüm kayıtlar aynı halka sayısını taşıyorsa şerit 33 satırda bire bir aynıydı
   (süs) → şerit NOTA bir kez lejant olarak iner, satırda yalnız parmak izi + hash kalır ve konu
   sütunu genişler. Şerit satırda yalnız SAPMA olduğunda (farklı halka sayısı / kırık) çizilir. */
const sablonOlustur = (riskSutunu, serit = true) => ({
  kolon: !serit
    ? `${DEFTER_NO} minmax(0,640px)${riskSutunu ? " 112px" : ""} minmax(220px,1fr) 40px`
    : riskSutunu
      ? `${DEFTER_NO} minmax(0,560px) 112px minmax(300px,1fr) 40px`
      : `${DEFTER_NO} minmax(0,600px) minmax(300px,1fr) 40px`,
  alan: riskSutunu ? '"zaman ana risk zincir eylem"' : '"zaman ana zincir eylem"',
  alanDar: riskSutunu ? '"zaman risk" "ana ana" "zincir eylem"' : '"zaman zaman" "ana ana" "zincir eylem"',
  marj: DEFTER_MARJ,
  adim: "64px",
});
const SABLON = sablonOlustur(true);
const basliklarOlustur = (riskSutunu, serit = true) => [
  <BaslikHucre key="z" alan="zaman">Zaman damgası</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Evrak · tür</BaslikHucre>,
  riskSutunu && <BaslikHucre key="r" alan="risk">Risk</BaslikHucre>,
  <BaslikHucre key="c" alan="zincir">{serit ? "Parmak izi · zincir · kök → son" : "Parmak izi · son hash"}</BaslikHucre>,
  <BaslikHucre key="e" alan="eylem" sag><span style={SR_ONLY}>İncele</span></BaslikHucre>,
].filter(Boolean);
const BASLIKLAR = basliklarOlustur(true);

/* Satır eylemi = ortak PARAF deseni (SicilDefterStil [data-sd-paraf]): dinlenmede çerçevesiz,
   satır hover/odakta çerçeve belirir (tur 8 jüri: 33 satırda 44 px çerçeveli ok ağır bir sütun
   kuruyordu). Şerit uç etiketleri yalnız geniş ekranda (1440'ta sütun dar, kırpılıyordu). */
const DENETIM_CSS = `
[data-denetim-uc]{display:none!important}
@media (min-width:1600px){[data-denetim-uc]{display:flex!important}}
@media (min-width:821px) and (max-width:1599px){[data-denetim-serit-cizgi]{display:none!important}[data-denetim-ozet]{display:inline!important}}
[data-denetim-ozet]{display:none}
[data-denetim-tam]{display:none!important}
@media (min-width:1600px){[data-denetim-tam]{display:block!important}[data-denetim-kisa]{display:none!important}}`;

/* Zincir hücresi — son hash'in parmak izi (16 çubuk, veriden) + adım sayısı + kısa hash.
   Dokuz özdeş halka yerine her kayıt bakışta ayırt edilir; aynı son hash = aynı izi. */
function ZincirHucre({ son, adim, kirik, serit = true }) {
  const ilk = semaAdi(0, adim), sonAd = semaAdi(adim - 1, adim);
  return (
    <span {...HUCRE.grid} style={{ gridArea: "zincir", display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}
      aria-label={`SHA-256 zinciri, ${adim || "bilinmeyen sayıda"} adım; son hash ${kisaHash(son)}`}>
      <ParmakIzi h={son} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, fontFamily: MONO, ...TNUM }}>
        <span title={son || ""} {...(serit ? null : { "data-denetim-kisa": "" })} style={{ fontSize: 11.5, lineHeight: "16px", color: DERIN.V, whiteSpace: "nowrap" }}>{kisaHash(son)}</span>
        {/* Geniş ekranda şerit yoksa sütun TAM son hash'i 8'li gruplarla taşır — boşluk veriyle dolar. */}
        {!serit && son && <span data-denetim-tam="" title={son} style={{ fontSize: 11.5, lineHeight: "16px", color: DERIN.V, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordSpacing: 2 }}>{(String(son).match(/.{1,8}/g) || []).join(" ")}</span>}
        <span style={{ fontSize: 10.5, lineHeight: "14px", color: PAL.mut3, whiteSpace: "nowrap" }}>{adim ? `${adim} halka` : "halka sayısı yok"}</span>
      </span>
      {/* <1600'de 13 etiketsiz boncuk yerine sayısal özet (tur 8 jüri: iki genişlikte iki dil). */}
      {serit && <span data-denetim-ozet="" style={{ fontFamily: MONO, fontSize: 11, color: kirik ? DERIN.R : PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>kök → {adim || "?"} → son</span>}
      {serit && <span data-denetim-serit="" data-denetim-serit-cizgi="" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <HalkaSeridi adim={adim} kirik={kirik} />
        {ilk && <span data-denetim-uc="" style={{ display: "flex", justifyContent: "space-between", maxWidth: 440, gap: SP.s, fontFamily: MONO, fontSize: 10, lineHeight: "12px", color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden" }}><span>{ilk}</span><span>{sonAd}</span></span>}
      </span>}
    </span>
  );
}

/* Risk hücresi — filtre çipleriyle AYNI dil (nokta + bant adı); renk tek sinyal değil. */
const RiskHucre = ({ bant }) => (
  <span {...HUCRE.grid} style={{ gridArea: "risk" }}>
    {BANT[bant] ? <SessizCip renk={BANT[bant].c} metin={`${BANT[bant].l.charAt(0)}${BANT[bant].l.slice(1).toLocaleLowerCase("tr")} · ${BANT[bant].t.split(" ")[0]}`} /> : <span style={{ ...TYPE.meta, color: PAL.mut3 }}>—</span>}
  </span>
);

/* Hata fişi — iskelet satırları arkadan sızmaz; neden duruma göre (ağ ≠ sunucu). */
function DenetimHata({ hata, onYenidenDene }) {
  const durum = hata?.status;
  const baslik = !durum ? "Sunucuya ulaşılamadı" : durum >= 500 ? "Sunucu denetim defterini veremedi" : "Denetim defteri alınamadı";
  const aciklama = !durum ? "Bağlantınızı kontrol edin; kayıtlar sunucuda güvende, bağlantı düzelince yeniden yüklenir."
    : durum >= 500 ? "Sunucu bir hata döndürdü. Zincir kayıtları silinmez; birkaç saniye sonra yeniden deneyin." : String(hata?.message || "İstek reddedildi.");
  return (
    <div role="alert" style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: SP.m, padding: `${SP.xl}px ${SP.xl}px ${SP.xl}px ${SP.xl + 2}px`, maxWidth: 720,
      borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: `inset 3px 0 0 ${BANT.kirmizi.c}, ${SH.card}` }}>
      <span aria-hidden="true" style={{ display: "flex", color: DERIN.kirmizi, paddingTop: 2 }}><Icon.alert width={20} height={20} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: SP.xs }}>{durum ? `Sunucu · HTTP ${durum}` : "Bağlantı · yanıt yok"}</div>
        <div style={{ ...TYPE.h2, fontSize: 18, lineHeight: "24px", color: PAL.ink }}>{baslik}</div>
        <p style={{ margin: `${SP.xs}px 0 ${SP.l}px`, ...TYPE.data, color: PAL.mut2, maxWidth: 560 }}>{aciklama}</p>
        {onYenidenDene && <Btn primary onClick={onYenidenDene}>Yeniden dene</Btn>}
      </div>
    </div>
  );
}

const zincirOf = (di) => (Array.isArray(di.zincir) ? di.zincir : (Array.isArray(di.adimlar) ? di.adimlar : []));
// DB kaydı zincirin kendisini değil adım SAYISINI taşır (adim_sayisi).
const adimOf = (di) => zincirOf(di).length || (Number.isFinite(di.adim_sayisi) ? di.adim_sayisi : 0);

function DenetimSatir({ h, i, gez, onAc, riskSutunu, serit, gunlu }) {
  const di = h.result.denetim_izi;
  const adim = adimOf(di);
  return (
    <div role="row" data-sicil-satir="" data-sd-anahtar={h.id} {...(gez.aktif === h.id ? { "data-imlec": "" } : null)} style={{ "--sd-i": i }}
      onPointerDown={() => gez.sec(h.id)} onClick={() => onAc(h)}>
      {gez.aktif === h.id && <Imlec gezinme={gez} kimlik="denetim" />}
      <span {...HUCRE.grid} style={{ gridArea: "zaman", display: "flex", flexDirection: "column", fontFamily: MONO, ...TNUM }}>
        <span data-sd-no-sira="" style={{ fontSize: 13, fontWeight: 600, color: PAL.ink }}>{fmtSaat(h.ts)}</span>
        {!gunlu && <span style={{ fontSize: 11, color: PAL.mut3 }}>{fmtGun(h.ts)}</span>}
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0, display: "flex", alignItems: "center", gap: SP.s }}>
        <span aria-hidden="true" style={{ display: "flex", color: di.butunluk === false ? DERIN.R : DERIN.yesil, flexShrink: 0 }}><Icon.shield width={16} height={16} /></span>
        <span style={{ minWidth: 0 }}>
          <span data-sd-konu="" title={h._konu || h.name} style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(h._konu) || h.name}</span>
          <span style={{ display: "block", ...TYPE.meta, color: PAL.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {EVRAK_TR(h.evrak_turu)}{h._konu && h.name ? <> · <span style={{ fontFamily: MONO, fontSize: 11 }}>{h.name}</span></> : null}
          </span>
        </span>
      </span>
      {riskSutunu && <RiskHucre bant={h.bant} />}
      <ZincirHucre son={di.son_hash || di.kok_hash} adim={adim} kirik={di.butunluk === false} serit={serit || di.butunluk === false} />
      <span {...HUCRE.grid} style={{ gridArea: "eylem", justifySelf: "end" }}>
        {/* Satırın kendisi açar; bu yalnız sessiz ok — klavye odağı ve Enter için (tur 7: her
            satırda tekrarlanan mavi "İncele →" satır tıklamasıyla aynı işi yapıp gürültü üretiyordu). */}
        <button type="button" data-sd-eylem="" data-sd-paraf="" data-press="" title="Zinciri incele" onClick={(e) => { e.stopPropagation(); onAc(h); }}
          aria-label={`${cleanDemoText(h._konu) || h.name} — hash zincirini incele ve doğrula`}
          style={{ padding: 0, width: 36, minHeight: 44, justifyContent: "center", color: PAL.mut2 }}>
          <Icon.arrow width={15} height={15} />
        </button>
      </span>
    </div>
  );
}

/* Gün ayracı (tur 8 jüri): zamana göre sıralıyken aynı tarih her satırda tekrar etmez — gün
   başına bir yapışkan bant (mono tarih + kayıt sayısı), satırda yalnız saat kalır. Risk
   sıralamasında günler dağılır → ayraç yok, tarih satırda kalır. */
function gunGruplari(kayitlar) {
  const gruplar = [];
  kayitlar.forEach((h) => {
    const gun = fmtGun(h.ts);
    const son = gruplar[gruplar.length - 1];
    if (son && son.gun === gun) son.kayitlar.push(h); else gruplar.push({ gun, kayitlar: [h] });
  });
  return gruplar;
}

/* Ortak halka lejantı — tüm zincirler aynı uzunluktaysa şerit bir kez burada çizilir. */
const HalkaLejant = ({ adim }) => (
  <span style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.s, maxWidth: 560, fontFamily: MONO, fontSize: 11, color: PAL.mut2, ...TNUM }}>
    <span style={{ whiteSpace: "nowrap" }}>{semaAdi(0, adim) || "kök"}</span>
    <HalkaSeridi adim={adim} />
    <span style={{ whiteSpace: "nowrap" }}>{semaAdi(adim - 1, adim) || "son"} · {adim} halka</span>
  </span>
);

const cekmeceKaydi = (h) => ({
  islemId: h.result?.islem_id || null,
  di: h.result.denetim_izi,
  baslik: cleanDemoText(h._konu) || h.name,
  meta: [EVRAK_TR(h.evrak_turu), `${fmtGun(h.ts)} ${fmtSaat(h.ts)}`, h.name].filter(Boolean).join(" · "),
});

/* Kayıtsız hâller — yükleniyor (gerçek defter geometrisinde iskelet) · hata fişi · boş defter. */
const DenetimBos = ({ yukleniyor, hata, onYenidenDene, onGoInbox }) => (
  <ViewWrap id="denetim-h" title="Denetim izi" kunye="Denetim kayıt defteri" sub="Değiştirilemez işlem kayıtları (SHA-256)">
    <SicilStil />
    {yukleniyor ? <DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Denetim kayıtları yükleniyor" />
      : hata ? <DenetimHata hata={hata} onYenidenDene={onYenidenDene} />
        : <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="" satir={6} baslik="Henüz mühürlenmiş kayıt yok"
          sub="İşlenen her evrak için değiştirilemez bir SHA-256 hash-zinciri oluşturulur ve bu deftere zaman damgasıyla işlenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />}
  </ViewWrap>
);

export default function DenetimView({ history = [], onGoInbox, yukleniyor = false, hata = null, onYenidenDene }) {
  const kayitlar = useMemo(() => history
    .filter((h) => h.result?.denetim_izi && Object.keys(h.result.denetim_izi).length)
    .map((h) => ({ ...h, _konu: h.result?.bilgi_unsurlari?.konu || "" })), [history]);
  // Tüm zincirler aynı başlangıç değerinden (genesis) türüyorsa kök bir kez nota yazılır.
  const ortakKok = useMemo(() => {
    const kokler = new Set(kayitlar.map((h) => h.result.denetim_izi.kok_hash || ""));
    return kokler.size === 1 ? [...kokler][0] : null;
  }, [kayitlar]);
  // Damga = ekranın tek olgusu: kayıtlı bütünlük beyanı (sayı tekrarı değil).
  const kirik = useMemo(() => kayitlar.filter((h) => h.result.denetim_izi.butunluk === false).length, [kayitlar]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [{ ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(kayitlar, "evrak_turu", EVRAK_TR)] }],
  }), [kayitlar]);
  const filter = useFilter(kayitlar, config);
  const gez = useDefterGezinme();
  const [secili, setSecili] = useState(null);
  const kapat = useCallback(() => setSecili(null), []);

  if (kayitlar.length === 0) return <DenetimBos yukleniyor={yukleniyor} hata={hata} onYenidenDene={onYenidenDene} onGoInbox={onGoInbox} />;

  // Liste tek bantlıysa risk sütunu bilgi taşımaz → nota iner (tur 8).
  const bantlar = new Set(filter.results.map((h) => h.bant || ""));
  const tekBant = bantlar.size === 1 ? [...bantlar][0] : null;
  const riskSutunu = !(tekBant && BANT[tekBant]);
  const adimlar = new Set(filter.results.map((h) => adimOf(h.result.denetim_izi)));
  const ortakAdim = adimlar.size === 1 ? [...adimlar][0] : 0;
  const serit = !ortakAdim;
  const gunlu = String(filter.filters.sortBy || "").startsWith("ts_");
  const sablon = riskSutunu && serit ? SABLON : sablonOlustur(riskSutunu, serit);
  const basliklar = riskSutunu && serit ? BASLIKLAR : basliklarOlustur(riskSutunu, serit);
  const kolonSayisi = riskSutunu ? 5 : 4;
  const satir = (h, i) => <DenetimSatir key={h.id} h={h} i={i} gez={gez} riskSutunu={riskSutunu} serit={serit} gunlu={gunlu} onAc={(k) => setSecili(cekmeceKaydi(k))} />;
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "kayıt", kalici: "zincir kayıtları silinmez" });
  return (
    <ViewWrap id="denetim-h" title="Denetim izi" kunye="Denetim kayıt defteri"
      sub="Değiştirilemez işlem kayıtları · her halka öncekinin SHA-256 hash'ini taşır, sonradan değişiklik zinciri kırar"
      damga={kirik ? { metin: `${kirik} kırık zincir`, ton: R, egim: -4 } : { metin: "Zincirler bütün", ton: V, egim: -4 }}>
      <SicilStil />
      <style>{DENETIM_CSS}</style>
      <DefterNotu ikon={<Icon.shield width={15} height={15} />} style={{ margin: `0 0 ${SP.l}px` }}>
        {/* Tek ölçü (≤72ch) + vurgusuz: yeşil kalın "uyum" iddiası pazarlama tonunda okunuyordu (tur 8). */}
        <span style={{ display: "block", maxWidth: "72ch" }}>
          Bir kaydı incelemek için satırı açın: halkalar sırayla gösterilir ve zincir sunucuda bağımsız yeniden hesaplanarak doğrulanır.
          Kayıtlar <span style={{ whiteSpace: "nowrap" }}>Sayıştay denetimi</span> ve KVKK işleme kaydı için kanıt niteliğindedir.
          {ortakKok ? <> Tüm zincirler aynı başlangıç değerinden türer (kök <span style={{ fontFamily: MONO, fontSize: 12 }}>{kisaHash(ortakKok)}</span>).</> : null}
          {ortakAdim > 0 && <HalkaLejant adim={ortakAdim} />}
          {!riskSutunu && <> Listelenen kayıtların tümü <SessizCip renk={BANT[tekBant].c} metin={`${BANT[tekBant].l.charAt(0)}${BANT[tekBant].l.slice(1).toLocaleLowerCase("tr")} · ${BANT[tekBant].t.toLocaleLowerCase("tr")}`} /> bandında.</>}
        </span>
      </DefterNotu>

      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        /* Arama ıskası hüküm değildir → damga yerine mono künye; tek hayalet satır (tur 8:
           dolgu satırları + kenar cetveli sayfa sonuna uzuyor, yarım tablo gibi okunuyordu). */
        <BosDefter sablon={sablon} basliklar={basliklar} onek="" damga={null} satir={1} kunye={`Arama · 0 / ${kayitlar.length} kayıt`} baslik={bos.baslik}
          sub={bos.sub} actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div data-denetim-defter="">
          <DefterYuzey sablon={sablon} basliklar={basliklar} etiket="Denetim kayıtları" rol="grid" gezinme={gez} ipucu="zinciri incele"
            dolgu={Math.max(0, 4 - filter.results.length)}>
            {gunlu
              ? gunGruplari(filter.results).map((g) => (
                <React.Fragment key={g.gun}>
                  <GrupBasligi etiket={g.gun} sayi={g.kayitlar.length} kolon={kolonSayisi} />
                  {g.kayitlar.map((h) => satir(h, filter.results.indexOf(h)))}
                </React.Fragment>))
              : filter.results.map(satir)}
          </DefterYuzey>
        </div>
      )}
      {secili && <ZincirCekmece kayit={secili} onKapat={kapat} />}
    </ViewWrap>
  );
}
