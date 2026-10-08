/* GidenEvrakView — onaylanıp gönderilen resmî yazıların arşivi: GİDEN EVRAK DEFTERİ.
   outbox: DashboardApp (Onayla & Gönder → giden evrak; DB /giden-evrak ile birleşir).

   Tur 6 (jüri):
   · GÜNÜN PULU: posta damgası satırlardan gün ayracına taşındı (her gün bir pul, 1:1 ölçek,
     en küçük yazı 9 px); satırda yalnız mono "saat 20:43".
   · Kompakt filtre (aşamalı açılım): 1 kayıtlık defterde 11 kontrol veriden ağırdı.
   · Detay = ARŞİV NÜSHASI: gönderilen yazı A4 kâğıtta, posta damgası kâğıdın köşesinde,
     denetim hash'i kâğıt dibinde künye (Gelen'le aynı BelgeModal ailesi).
   · Başlıkta birincil "yükle" yok — bu ekranın işi aramak/bulmak. */
import React, { useMemo, useState } from "react";
import { ViewWrap, Btn, Icon, MONO, PAL, BANT, TYPE, TNUM, SP, DERIN, DERIN_OF, SR_ONLY } from "./neonUi.jsx";
import { SicilStil, SicilNo, BaslikHucre, SessizCip, DefterYuzey, BosDefter, DefterIskelet, DefterHata, useDefterGezinme, Imlec, HUCRE, Derkenar, Vurgulu, alanlarOf, DEFTER_NO, DEFTER_MARJ, ADIM } from "./SicilDefter.jsx";
import DefterAntetKunye from "./DefterAntetKunye.jsx";
import DefterKagitOnizleme, { ONIZLEME_SUTUN } from "./DefterKagitOnizleme.jsx";
import { useMedyaSorgusu } from "../hooks/useMedya.js";
import { bosDurumMetni, gunleGrupla, kayitNoAramaMetni } from "../lib/sicilDefter.js";
import FilterBar, { FiltreIskelet } from "./FilterBar.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { fmtGuven } from "./IslenenNusha.jsx";
import { PostaDamgasi, GunPuluBasligi } from "./DefterPul.jsx";
import { KunyeFisi, KimlikDeger, AltKunye } from "./DefterNusha.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { useDefterArama } from "../lib/useDefterArama.js";
import { riskAdi, baslikCase, ortaElips, defterZamani } from "../lib/defterSozluk.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta, KATEGORILER } from "../lib/kategori.js";

const DURUM_TR = { gonderildi: "Gönderildi", reddedildi: "Reddedildi", duzenlendi: "Düzenlenerek gönderildi" };
const DURUM_RENK = { gonderildi: BANT.yesil.c, reddedildi: BANT.kirmizi.c, duzenlendi: BANT.sari.c };
const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
/* Resmî numara DB'den (/onayla → giden_no) gelir; o gelene dek satır GEÇİCİ kimlik taşır —
   geçici kimlik defter numarası gibi basılmaz. */
const numaraBekliyor = (o) => !!o?.numaraBekliyor || !/^E-G-\d{4}\/\d+$/.test(String(o?.id || ""));
const gitti = (o) => o.durum === "gonderildi" || o.durum === "duzenlendi";
const konuOf = (o) => baslikCase(cleanDemoText(o.konu)) || "Konusuz yazı";
// "bugün" / "N gün önce" — TAKVİM günü farkı.
const gecenSure = (ts) => {
  const simdi = new Date(); simdi.setHours(0, 0, 0, 0);
  const o = new Date(Number(ts || 0)); o.setHours(0, 0, 0, 0);
  const gun = Math.round((simdi - o) / 86400000);
  return gun <= 0 ? "bugün" : `${gun} gün önce`;
};
const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

/* Risk çipleri tek sözlükten (lib/defterSozluk): insan dili; renk kodu yalnız künyede. */
const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, kaynak evrak, kayıt no…", label: "Giden evrak defterinde ara" },
  chips: [
    { id: "risk", label: "Risk", options: ["yesil", "sari", "kirmizi"].map((b) => ({ value: b, label: riskAdi(b), color: BANT[b].c })) },
    { id: "durum", label: "Durum", options: [
      { value: "gonderildi", label: "Gönderildi", color: BANT.yesil.c },
      { value: "duzenlendi", label: "Düzenlenerek", color: BANT.sari.c },
      { value: "reddedildi", label: "Reddedildi", color: BANT.kirmizi.c },
    ] },
  ],
  select: [
    { id: "kategori", label: "Kategori", options: KATEGORI_SELECT },
    { id: "tur", label: "Yazı türü", options: [] },
    { id: "birim", label: "Alıcı birim", options: [] },
  ],
  dateRange: { enabled: true, label: "Gönderim tarihi" },
  datePresets: { enabled: true },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
    { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "birim_asc", label: "Birim (A–Z)" },
  ] },
  dataMapping: { search: ["konu"], risk: "risk", durum: "durum", kategori: "_kategori", tur: "tur", birim: "alici_birim", dateField: "gonderim_tarihi" },
};
const metinOf = (o) => [o.konu, o.kaynak_evrak_adi, BIRIM_LBL(o.alici_birim), kategoriMeta(o._kategori).label, o._noAra].join(" ");
const noOf = (o) => (numaraBekliyor(o) ? "" : o.id);

/* Defter şablonu — gönderi no (+saat, derkenar) · konu bloğu · risk · eylem.
   Tur 8: "Durum" sütunu kalktı — "Gönderildi" günün pulunda zaten söyleniyor; istisna
   (düzeltildi / iade) kayıt no altında DERKENAR. Satır yatayda tek ritim taşır. */
const SABLON = {
  kolon: `${DEFTER_NO} minmax(0,1fr) 140px 120px`,
  marj: DEFTER_MARJ,
  satir: ADIM.rahat,
  alan: '"no ana durum eylem"',
  kolonDar: "34px minmax(0,1fr) auto",
  alanDar: '"no ana ana" "no durum eylem"',
};
const BASLIKLAR = [
  <BaslikHucre key="n" alan="no">Gönderi no</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · tür · alıcı birim</BaslikHucre>,
  <BaslikHucre key="d" alan="durum">Risk</BaslikHucre>,
  <BaslikHucre key="e" alan="eylem" sag>Eylem</BaslikHucre>,
];

const DERKENAR = { duzenlendi: { metin: "Düzeltildi", ton: undefined }, reddedildi: { metin: "İade · ret", ton: "kirmizi" } };

function GidenNoHucre({ item, gunlu }) {
  const dk = DERKENAR[item.durum];
  return (
    <span {...HUCRE.grid} data-sd-no="" style={{ gridArea: "no" }}>
      {numaraBekliyor(item)
        ? <span title="Resmî giden numarası kayıt tamamlanınca atanır" style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.mut2, whiteSpace: "nowrap" }}>numara bekleniyor…</span>
        : <SicilNo no={item.id} />}
      {gunlu && <span data-sd-no-ek="" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM }}>saat {defterZamani(item.gonderim_tarihi).saat}</span>}
      {dk && <Derkenar ton={dk.ton}>{dk.metin}</Derkenar>}
    </span>
  );
}

/* Defter kaydı — satır odaklanır (Enter detay); gün gruplamasında göreli süre yazılmaz. */
function GidenSatir({ item, sira, gez, gunlu, onAc, jetonlar }) {
  const kat = kategoriMeta(item._kategori);
  const guven = fmtGuven(item.guven);
  const riskC = BANT[item.risk]?.c;
  const ayrac = <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>;
  const etiket = numaraBekliyor(item) ? "Numarası bekleyen gönderi" : item.id;
  return (
    <div role="row" tabIndex={0} data-sicil-satir="" data-sd-fis="" data-sd-anahtar={item.id} style={{ "--sd-i": Math.min(sira, 14) }}
      aria-label={`${etiket} — ${konuOf(item)} — ${DURUM_TR[item.durum] || item.durum}`}
      onPointerDown={() => gez.sec(item.id)} onClick={() => onAc(item)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); onAc(item); } }}>
      {gez.aktif === item.id && <Imlec gezinme={gez} kimlik="giden" />}
      <GidenNoHucre item={item} gunlu={gunlu} />
      <div {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
        <span data-sd-konu="" title={konuOf(item)} style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Vurgulu metin={konuOf(item)} jetonlar={jetonlar} /></span>
        <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, display: "flex", columnGap: SP.s, rowGap: 2, alignItems: "center", minWidth: 0, whiteSpace: "nowrap", flexWrap: "wrap" }}>
          <span style={{ color: PAL.mut2, fontWeight: 500 }}>{kat.label}</span>
          {item.evrak_turu && <>{ayrac}<span>{EVRAK_TR(item.evrak_turu)}</span></>}
          {item.tur && <>{ayrac}<span>{YAZI_TR(item.tur)}</span></>}
          {!gunlu && <>{ayrac}<span>{gecenSure(item.gonderim_tarihi)}</span></>}
          {guven && <>{ayrac}<span style={TNUM}>güven {guven}</span></>}
          {item.sla_durum === "GECIKMIS" && <span style={{ color: DERIN.kirmizi, fontWeight: 500 }}>· süresi geçmiş</span>}
        </div>
        <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 2, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span aria-hidden="true" style={{ display: "flex", color: DERIN.V, flexShrink: 0 }}><Icon.send width={11} height={11} /></span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={SR_ONLY}>alıcı birim: </span>{BIRIM_LBL(item.alici_birim)}</span>
        </div>
      </div>
      <span {...HUCRE.grid} style={{ gridArea: "durum", minWidth: 0 }}>
        <span style={SR_ONLY}>{DURUM_TR[item.durum] || item.durum}, </span>
        <SessizCip renk={riskC || PAL.mut3} metin={<><span style={SR_ONLY}>risk: </span>{riskAdi(item.risk) ? `${riskAdi(item.risk)} risk` : "Risk —"}</>} />
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "eylem", justifySelf: "end" }}>
        <button type="button" data-sd-eylem="" data-press="" onClick={(e) => { e.stopPropagation(); onAc(item); }} aria-label={`${etiket} arşiv nüshasını görüntüle`}>
          Nüsha <Icon.arrow width={14} height={14} />
        </button>
      </span>
    </div>
  );
}

/* Arşiv nüshası — künye fişi (kâğıdın üstünde) + A4 yazı + köşede posta damgası + dipte hash. */
function GidenNusha({ item, onClose }) {
  const durumC = DERIN_OF(DURUM_RENK[item?.durum]);
  const satirlar = item ? [
    { k: "Kaynak evrak", v: item.kaynak_evrak_adi ? <span title={item.kaynak_evrak_adi}>{ortaElips(item.kaynak_evrak_adi, 18, 10)}</span> : "", mono: true },
    { k: "Kategori · evrak türü", v: `${kategoriMeta(item._kategori).label} · ${EVRAK_TR(item.evrak_turu)}` },
    { k: "Yazı türü", v: item.tur ? YAZI_TR(item.tur) : "—" },
    { k: "Alıcı birim", v: BIRIM_LBL(item.alici_birim), c: DERIN.V },
    { k: "Durum", v: DURUM_TR[item.durum] || item.durum, c: durumC },
    { k: "Risk bandı", v: riskAdi(item.risk) ? <span title={`Bant kodu: ${BANT[item.risk]?.l || "—"}`}>{riskAdi(item.risk)}</span> : "—", c: DERIN_OF(BANT[item.risk]?.c) },
    { k: "Sınıflandırma güveni", v: fmtGuven(item.guven) || "—" },
    { k: "Yasal süre", v: item.sla_durum === "GECIKMIS" ? "Gecikmiş" : item.sla_durum === "KRITIK" ? "Kritik" : "" },
    { k: "Evrak / dilekçe tarihi", v: item.evrak_tarihi },
    { k: "Gönderen memur", v: [item.memor_adi, item.memor_unvan].filter(Boolean).join(" · ") },
    { k: "Gönderim", v: fmtTime(item.gonderim_tarihi), mono: true },
    { k: "Denetim hash", v: item.son_hash ? <KimlikDeger deger={item.son_hash} etiket="denetim hash'ini" /> : "" },
  ] : [];
  return (
    <BelgeModal acik={!!item} onKapat={onClose} baslik={item ? konuOf(item) : ""} cilt="Giden"
      kayitNo={item && !numaraBekliyor(item) ? item.id : "Numara bekleniyor"}
      dosyaAdi={item ? `arşiv nüshası · ${gitti(item) ? "gönderildi" : "gönderilmedi"}` : ""}
      metin={item?.taslak ? cleanDemoText(item.taslak) : "Bu kayıtta yazı metni saklanmamış."}
      ustIcerik={item ? <KunyeFisi baslik="Gönderi künyesi" satirlar={satirlar} /> : null}
      kagitKose={item && gitti(item) ? <PostaDamgasi ts={item.gonderim_tarihi} tohum={item.id} gecikme={260} /> : null}
      altKunye={item ? <AltKunye parcalar={[
        { k: "Giden no", v: numaraBekliyor(item) ? "" : item.id },
        { k: "Denetim izi", v: item.son_hash ? ortaElips(item.son_hash, 10, 6) : "", tam: item.son_hash },
        { k: "Gönderim", v: defterZamani(item.gonderim_tarihi).tam },
      ]} /> : null} />
  );
}

/* Kısa defter SAYFANIN DEVAMI olarak çizilir (tur 8 gerilemesi: 1 kayıttan sonra kart
   kapanıyor, 1920'de ekranın üçte ikisi boş masa kalıyordu). Sayfa 6 satırlık: dolgu cetveli
   kayıt adımıyla sürer, dipte folyo künyesi ("SAYFA 1 · 1 KAYIT · SON KAYIT …"). */
/* Tur 8 jüri 2: 6 satırlık sayfa 1440'ta ekranın yarısını bilgisiz çizgiyle dolduruyordu →
   dolgu en çok 3 satır; ilki "sıradaki gönderi" künyesini taşır. */
const DEFTER_SAYFA = 4;
const DOLGU_AZAMI = 3;
const KOLON = alanlarOf(SABLON.alan).length;

/* Antet sağ künyesi + defter folyosu — yalnız gerçek kayıtlardan (uydurma sıradaki no yok). */
/* Yükleniyor hâli AYNI etiket takımını "··" ile basar (tur 9 jüri: yüklenirken başka bir künye
   takımı görünüp yüklenince değişiyor, künye genişliği zıplıyordu). */
const KUNYE_BEKLIYOR = [{ k: "Defter", v: "··" }, { k: "Son no", v: "··" }, { k: "Son gönderi", v: "··" }];
const ALT_BASLIK = "Onaylanıp gönderilen resmî yazılar · arşiv nüshası için satıra tıklayın ya da Enter";

function useGidenKunye(outbox) {
  return useMemo(() => {
    const sirali = [...outbox].sort((a, b) => Number(new Date(b.gonderim_tarihi)) - Number(new Date(a.gonderim_tarihi)));
    const son = sirali[0];
    const sonNo = sirali.find((o) => !numaraBekliyor(o))?.id || "";
    const sonZaman = son ? defterZamani(son.gonderim_tarihi).tam : "";
    const iade = outbox.filter((o) => o.durum === "reddedildi").length;
    return {
      satirlar: [
        { k: "Defter", v: `${outbox.length} gönderi` },
        { k: "Son no", v: sonNo },
        iade ? { k: "İade", v: `${iade} yazı`, ton: "kirmizi" } : { k: "Son gönderi", v: sonZaman },
      ],
      // Folyo yalnız sayfa künyesi — son gönderi zamanı antet künyesinde (tekrar yok).
      folyo: (rows) => `Sayfa 1 · ${rows.length} kayıt`,
    };
  }, [outbox]);
}

/* Geniş ekran sağ sütunu — defter imlecindeki gönderinin A4 nüshası (master-detail). */
function GidenOnizleme({ item, onAc }) {
  return (
    <DefterKagitOnizleme kayitNo={numaraBekliyor(item) ? "numara bekleniyor" : item.id} baslik={konuOf(item)}
      metin={item.taslak ? cleanDemoText(item.taslak) : ""} onAc={() => onAc(item)}
      ek={`${BIRIM_LBL(item.alici_birim)} · ${defterZamani(item.gonderim_tarihi).tam}`}
      kunye={[
        { k: "Alıcı birim", v: BIRIM_LBL(item.alici_birim), c: DERIN.V },
        { k: "Yazı türü", v: item.tur ? YAZI_TR(item.tur) : "" },
        { k: "Gönderim", v: defterZamani(item.gonderim_tarihi).tam, mono: true },
        { k: "Durum", v: DURUM_TR[item.durum] || item.durum, c: DERIN_OF(DURUM_RENK[item.durum]) },
        { k: "Sayı", v: numaraBekliyor(item) ? "DETSİS numarası bekleniyor" : item.id, mono: true },
        { k: "Denetim izi", v: item.son_hash ? ortaElips(item.son_hash, 10, 6) : "", mono: true },
      ]}
      kose={gitti(item) ? <PostaDamgasi ts={item.gonderim_tarihi} tohum={item.id} gecikme={0} /> : null} />
  );
}

const BOS_ILK = {
  baslik: "Defterin ilk sayfası henüz boş",
  sub: "Bir evrakı işleyip “Onayla ve gönder” dediğinizde yazı buraya posta damgasıyla, değiştirilemez denetim iziyle birlikte işlenir.",
};

/* Boş defter üç hâli — yükleniyor (filtre + defter silüeti) · hata/çevrimdışı · ilk sayfa. */
function GidenBos({ yukleniyor, hata, onYenidenDene, onGoInbox }) {
  if (yukleniyor) return <><FiltreIskelet /><DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} satir={DEFTER_SAYFA} etiket="Giden evrak kayıtları yükleniyor" /></>;
  if (hata) return <DefterHata sablon={SABLON} basliklar={BASLIKLAR} baslik="Giden evrak defteri alınamadı" ayrinti={String(hata?.message || hata)} onYenidenDene={onYenidenDene} />;
  return (
    <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek={`E-G-${new Date().getFullYear()}/`} satir={4} baslik={BOS_ILK.baslik} sub={BOS_ILK.sub}
      actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
  );
}

function useGidenFiltre(outbox) {
  const items = useMemo(() => outbox.map((o) => ({
    ...o, _kategori: o._kategori || evrakKategori({ evrak_turu: o.evrak_turu, birim: o.alici_birim, konu: o.konu }),
    _noAra: numaraBekliyor(o) ? "" : kayitNoAramaMetni(o.id),
  })), [outbox]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      BASE_CONFIG.select[0],
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(items, "tur", YAZI_TR)] },
      { ...BASE_CONFIG.select[2], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(items, "alici_birim", BIRIM_LBL)] },
    ],
  }), [items]);
  return { config, filter: useDefterArama(useFilter(items, config), { metinOf, noOf }) };
}

/* yukleniyor / hata: DB'den giden evrak sorgusunun durumu (DashboardApp gidenQ). */
export default function GidenEvrakView({ outbox = [], onGoInbox, yukleniyor = false, hata = null, onYenidenDene }) {
  const [detay, setDetay] = useState(null);
  const gez = useDefterGezinme();
  const { config, filter } = useGidenFiltre(outbox);
  const kunye = useGidenKunye(outbox);
  // Tur 9 jüri: 1440'ta önizleme yoktu, tek kayıtlı defterin altı boş masaydı → ≥1360.
  const genis = useMedyaSorgusu("(min-width: 1360px)");
  // Zimmet çizelgesi: tarih sıralamasında GÜNÜN PULU ayraçları; risk/birim sırasında düz liste.
  const gunlu = filter.filters.sortBy === "ts_desc" || filter.filters.sortBy === "ts_asc";
  const gruplar = useMemo(() => (gunlu ? gunleGrupla(filter.results, (r) => r.gonderim_tarihi) : [{ anahtar: "duz", rows: filter.results }]), [filter.results, gunlu]);

  if (outbox.length === 0) {
    return (
      <ViewWrap id="giden-h" title="Giden evrak" kunye="Giden evrak defteri" sub={yukleniyor ? "Defter açılıyor…" : ALT_BASLIK}
        actions={yukleniyor ? [<DefterAntetKunye key="k" etiket="Giden evrak defteri özeti yükleniyor" satirlar={KUNYE_BEKLIYOR} />] : undefined}>
        <SicilStil />
        <div><GidenBos yukleniyor={yukleniyor} hata={hata} onYenidenDene={onYenidenDene} onGoInbox={onGoInbox} /></div>
      </ViewWrap>
    );
  }
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "gönderi", kalici: "gönderilen yazılar silinmez" });
  let sira = 0;
  return (
    <ViewWrap id="giden-h" title="Giden evrak" kunye="Giden evrak defteri" sub={ALT_BASLIK}
      actions={[<DefterAntetKunye key="k" etiket="Giden evrak defteri özeti" satirlar={kunye.satirlar} />]}>
      <SicilStil />
      <div>
        <FilterBar config={config} filter={filter} kip="kompakt" satirIci={outbox.length >= 10 ? ["durum"] : []} />
        {/* Tur 9 jüri: 1920'de defterin altında ~300 px ölü masa → geniş ekranda sayfa görünüm
            dibine kadar uzar (cetvel satırları sürer, folyo + önizleme künyesi dibe oturur). */}
        <div style={genis && filter.results.length ? { display: "grid", gridTemplateColumns: `minmax(0,1fr) ${ONIZLEME_SUTUN}px`, gap: SP.xl, alignItems: "stretch", minHeight: "max(560px, calc(100vh - 270px))" } : undefined}>
        {filter.results.length === 0 ? (
          <BosDefter sablon={SABLON} basliklar={BASLIKLAR} damga={null}
            kunye={`${filter.filters.search.trim() ? "Arama" : "Filtre"} · 0 / ${outbox.length} kayıt`}
            baslik={bos.baslik} sub={bos.sub} actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
        ) : (
          <DefterYuzey sablon={SABLON} basliklar={BASLIKLAR} etiket="Giden evrak kayıtları" gezinme={gez} ipucu="arşiv nüshasını aç"
            rol="grid" dolgu={Math.min(DOLGU_AZAMI, Math.max(0, DEFTER_SAYFA - filter.results.length))} folyo={kunye.folyo(filter.results)}
            dolguNotu="Sıradaki gönderi bu satıra işlenir" uzar={genis}>
            {gruplar.map((g) => (
              <React.Fragment key={g.anahtar}>
                {gunlu && <GunPuluBasligi etiket={g.etiket} tarih={g.tarih} sayi={g.rows.length} kolon={KOLON}
                  ts={genis ? null : g.rows.find(gitti)?.gonderim_tarihi ?? null} tohum={g.anahtar} />}
                {g.rows.map((item) => <GidenSatir key={item.id} item={item} sira={sira++} gez={gez} gunlu={gunlu} onAc={setDetay} jetonlar={filter.jetonlar} />)}
              </React.Fragment>
            ))}
          </DefterYuzey>
        )}
        {genis && filter.results.length > 0 && <GidenOnizleme item={filter.results.find((x) => x.id === gez.aktif) || filter.results[0]} onAc={setDetay} />}
        </div>
      </div>
      <GidenNusha item={detay} onClose={() => setDetay(null)} />
    </ViewWrap>
  );
}
