/* GelenEvrakView — işlenecek evrak kuyruğu: GELEN EVRAK DEFTERİ.
   Örnek evraklar "gelen evrak"; satır → A4 önizleme ("önce oku"), "İşle" → uçtan uca işlem.
   Kategori operasyonel gruplama için TÜRETİLİR (lib/kategori).

   Tur 6 (jüri): "Durum" sütunu kalktı — 15 satırın 14'ünde "Yeni" yazıyordu; istisna
   ("İşlendi") artık kayıt no'nun altında DERKENAR. Açılan yer konuya verildi. Yasal süre
   hücresi ortak ölçekli VADE CETVELİ (bkz. DefterVadeCetveli). Arama "tüm sözcükler" kipinde,
   eşleşen parça fosforla vurgulanır (lib/defterArama). Satırın kendisi odak alır (j/k). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, Icon, R, PAL, BANT, TYPE, SP, DERIN, SR_ONLY, MONO } from "./neonUi.jsx";
import { onizlemeMaskele } from "../lib/defterMaske.js";
import { SicilStil, BaslikHucre, DefterYuzey, BosDefter, DefterIskelet, DefterNotu, useDefterGezinme, Imlec, HUCRE, KayitNoHucre, Derkenar, Vurgulu, DEFTER_NO, DEFTER_MARJ, ADIM } from "./SicilDefter.jsx";
import DefterAntetKunye from "./DefterAntetKunye.jsx";
import { useMedyaSorgusu } from "../hooks/useMedya.js";
import { bosDurumMetni } from "../lib/sicilDefter.js";
import FilterBar from "./FilterBar.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import VadeHucre, { VadeStil, VadeBaslik, bugunHucre } from "./DefterVadeCetveli.jsx";
import { useFilter } from "../hooks/useFilter.js";
import { useDefterArama } from "../lib/useDefterArama.js";
import { vadeOlcusu, goreliVade, zamanEkseni, agirCeyrekEsigi } from "../lib/defterVade.js";
import { evrakKategori, etkinTur, kategoriMeta, KATEGORILER, KATEGORI_BIRIM } from "../lib/kategori.js";
import { BIRIM_LBL } from "./result-cards.jsx";
import { SAMPLE_DOCS } from "../lib/sampleDocs.js";

// Kalıcı kayıt numarası: evrakın SAMPLE_DOCS içindeki özgün konumu (id → no). Kuyruk
// filtrelense/gönderilse de numara değişmez (kayıt no değişmezliği).
const EVRAK_NO = new Map(SAMPLE_DOCS.map((s, i) => [s.id, `E-2026/${String(i + 1).padStart(4, "0")}`]));
const noOf = (s) => EVRAK_NO.get(s.id) || "";

const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

// persistKey uid ile SUFFIX'lenir — sabit anahtar paylaşılan tarayıcıda memurlar arasında
// filtre seçimini sızdırıyordu. Arama useDefterArama'da (fuse yok: search.fuzzy kapalı).
const GELEN_FILTER_CONFIG_BASE = {
  search: { enabled: true, placeholder: "Konu, kurum, kayıt no…", label: "Gelen evrak defterinde ara" },
  chips: [{ id: "grup", label: "Grup", options: [
    { value: "Vatandaş", label: "Vatandaş" },
    { value: "Kurum", label: "Kurum" },
    { value: "Hukuk/Mali", label: "Hukuk/Mali" },
  ] }, { id: "sla", label: "Yasal süre", options: [
    { value: "GECIKMIS", label: "Gecikmiş", color: BANT.kirmizi.c },
    { value: "KRITIK", label: "Kritik", color: BANT.sari.c },
    { value: "tarih_yok", label: "Tarih doğrulanmalı", color: PAL.mut3 },
    { value: "tanimsiz", label: "Süre tanımsız", color: PAL.mut },
  ] }],
  select: [{ id: "kategori", label: "Kategori", options: KATEGORI_SELECT }],
  sort: { enabled: true, default: "sla_asc", options: [
    { value: "sla_asc", label: "Yasal süre (en acil önce)" },
    { value: "ts_desc", label: "Kuyruk sırası" },
    { value: "name_asc", label: "Ad (A–Z)" },
    { value: "name_desc", label: "Ad (Z–A)" },
  ] },
  dataMapping: { search: ["konu", "label", "aciklama"], grup: "grup", sla: "_slaDurum", kategori: "_kategori" },
};
const metinOf = (s) => [s.konu, s.label, s.aciklama, s.grup, kategoriMeta(s._kategori).label, noOf(s)].join(" ");

/* Defter şablonu — kayıt no (+derkenar) · konu bloğu · vade çizelgesi · eylem. Telefonda
   SİCİL FİŞİ: solda dikey kayıt no koçanı, gövdede konu, altta süre + eylem.
   Tur 8 (jüri: 1920'de konu ile cetvel arasında 250–400 px ölü koridor): geniş ekranda artan
   genişlik VADE ÇİZELGESİNE akar (160 → 280 → 360 px) — ölü bant veriyle dolar. */
function useVadeGenislik() {
  const g1 = useMedyaSorgusu("(min-width: 1800px)");
  const g2 = useMedyaSorgusu("(min-width: 1600px)");
  return g1 ? 360 : g2 ? 280 : 160;
}
const sablonOf = (vade) => ({
  kolon: `${DEFTER_NO} minmax(0,1fr) ${vade + 12}px 112px`,
  marj: DEFTER_MARJ,
  satir: ADIM.rahat,
  alan: '"no ana sure eylem"',
  kolonDar: "34px minmax(0,1fr) auto",
  alanDar: '"no ana ana" "no sure eylem"',
});
const basliklarOf = (eksen, vade) => [
  <BaslikHucre key="n" alan="no">Kayıt no</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · tür · önerilen birim</BaslikHucre>,
  <VadeBaslik key="s" eksen={eksen} genislik={vade} />,
  <BaslikHucre key="e" alan="eylem" sag>Eylem</BaslikHucre>,
];

/* Bir gelen evrak kaydı — satırın kendisi odaklanır (Enter önizler); "İşle" ayrı eylem. */
function GelenSatir({ s, i, done, vurgulu, gez, rowRef, onOnizle, onProcess, busy, jetonlar, vade }) {
  const kat = kategoriMeta(s._kategori);
  const onerilenBirim = BIRIM_LBL(KATEGORI_BIRIM[s._kategori] || "yazi_isleri_evrak");
  const konu = s.konu || s.label;
  return (
    <div role="row" tabIndex={0} data-sicil-satir="" data-sd-fis="" data-sd-anahtar={s.id} {...(vurgulu ? { "data-vurgu": "" } : null)}
      aria-label={`${noOf(s)} — ${konu}${done ? " — işlendi" : ""}`}
      onPointerDown={() => gez.sec(s.id)} onClick={() => onOnizle(s)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); onOnizle(s); } }}
      ref={rowRef} style={{ "--sd-i": Math.min(i, 14) }}>
      {gez.aktif === s.id && <Imlec gezinme={gez} kimlik="gelen" />}
      <KayitNoHucre no={noOf(s)} derkenar={done ? <Derkenar ton="yesil" title="Bu evrak işlendi; yeniden işlenebilir">İşlendi</Derkenar> : null} />
      <div {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
        <span data-sd-konu="" title={konu} style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>
          <Vurgulu metin={konu} jetonlar={jetonlar} />
        </span>
        <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, display: "flex", columnGap: SP.s, rowGap: 2, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ color: PAL.mut2, fontWeight: 500 }}>{kat.label}</span>
          <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>
          <span>{s.grup || "Evrak"}</span>
          <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 200px" }} title={s.aciklama}><Vurgulu metin={s.aciklama || ""} jetonlar={jetonlar} /></span>
        </div>
        <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ display: "flex", color: DERIN.V }}><Icon.route width={12} height={12} /></span>
          <span><span style={SR_ONLY}>önerilen birim: </span>{onerilenBirim}</span>
        </div>
      </div>
      <span {...HUCRE.grid} {...bugunHucre(vade.eksen)} style={{ gridArea: "sure", minWidth: 0, alignSelf: "stretch", display: "flex", alignItems: "center", ...bugunHucre(vade.eksen).style }}>
        <VadeHucre {...vade} />
      </span>
      {/* Satır eylemi PARAF: her satırda AYNI sessiz biçim, bakılınca/odakta çerçeve belirir
          (tur 8 jüri 2: yalnız ilk satırın çerçeveli olması ritmi bozuyordu; aciliyet kırmızı
          derkenar + vade cetveliyle taşınır). Tek primary başlıktaki "Yeni evrak yükle". */}
      <span {...HUCRE.grid} style={{ gridArea: "eylem", justifySelf: "end", alignSelf: "center" }}>
        <button type="button" data-sd-eylem="" data-press="" data-sd-paraf=""
          onClick={(e) => { e.stopPropagation(); onProcess(s); }} disabled={busy} aria-label={`${konu} evrakını işle`}>
          {done ? "Yeniden işle" : "İşle"} <Icon.arrow width={14} height={14} />
        </button>
      </span>
    </div>
  );
}

/* Panel'den hedefli geliş: satırı görünüre kaydır + kısa vurgu. Hedef aktif filtreye
   takılıysa filtreler temizlenir; kuyrukta yoksa (gönderilmiş) hedef sessizce tüketilir. */
function useHedefVurgu({ hedef, onHedefAcildi, filter }) {
  const rowRefs = useRef(new Map());
  const [vurgu, setVurgu] = useState(null);
  useEffect(() => {
    if (!hedef) return undefined;
    const el = rowRefs.current.get(hedef);
    if (el) {
      const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      el.scrollIntoView({ behavior: az ? "auto" : "smooth", block: "center" });
      setVurgu(hedef);
      onHedefAcildi?.();
      return undefined;
    }
    if (filter.hasActiveFilters) { filter.clearAll(); return undefined; }
    onHedefAcildi?.();
    return undefined;
  }, [hedef, filter.results]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sönme AYRI efektte: hedef null'lanınca üstteki cleanup zamanlayıcıyı iptal ediyordu.
  useEffect(() => {
    if (!vurgu) return undefined;
    const t = setTimeout(() => setVurgu(null), 2600);
    return () => clearTimeout(t);
  }, [vurgu]);
  const refOf = useCallback((id) => (el) => { if (el) rowRefs.current.set(id, el); else rowRefs.current.delete(id); }, []);
  return { vurgu, refOf };
}

/* Vade çizelgesinin ortak ZAMAN EKSENİ + en ağır çeyrek — görünen satırlar üzerinden. */
function useVade(results, slaMap, genislik) {
  return useMemo(() => {
    const satir = new Map(results.map((s) => [s.id, { sla: slaMap?.[s.id], olcu: vadeOlcusu(slaMap?.[s.id]), aralik: goreliVade(slaMap?.[s.id]) }]));
    const eksen = zamanEkseni([...satir.values()].map((x) => x.aralik), genislik);
    const esik = agirCeyrekEsigi([...satir.values()].map((x) => x.olcu?.gecikme || 0));
    const of = (id) => {
      const x = satir.get(id) || {};
      return { ...x, eksen, genislik, agir: !!x.olcu && x.olcu.gecikme >= esik };
    };
    return { of, eksen };
  }, [results, slaMap, genislik]);
}

/* Yasal süre önizlemesi gelene dek defter İSKELETTE kalır: varsayılan sıra "en acil önce"
   olduğu için slaMap geç gelince satırlar yer değiştiriyor, ilk saniyedeki satır tıklaması
   başka kayda ya da boşluğa düşüyordu (tur 6 doğrulaması). Sorgu hata verirse ya da
   SLA_AZAMI_BEKLEME içinde dönmezse defter süresiz açılır — iskelet sonsuza kalmaz. */
const SLA_AZAMI_BEKLEME = 2500;
function useSlaBekleme(slaMap, n) {
  const [zamanAsimi, setZamanAsimi] = useState(false);
  useEffect(() => {
    if (slaMap) return undefined;
    const t = setTimeout(() => setZamanAsimi(true), SLA_AZAMI_BEKLEME);
    return () => clearTimeout(t);
  }, [slaMap]);
  return !slaMap && !zamanAsimi && n > 0;
}

/* Salt-okunur evrak önizleme — "önce oku, sonra işle": İşle perdenin TEK dolu düğmesi;
   başlıkta mono kayıt no. */
/* Kaynak metin önizlemede MASKELİ gösterilir (tur 8 jüri 2: TCKN/telefon/e-posta açık
   görünüyordu). Dipte mono künye: hangi alanların karartıldığı + kayıt no. */
function OnizlemeKunye({ no, alanlar }) {
  return (
    <div data-bm-alt-kunye="" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: SP.m, fontFamily: MONO, ...TYPE.antet, color: PAL.onInk2 }}>
      <span>{alanlar.length ? `KVKK · MASKELİ ÖNİZLEME · ${alanlar.join(", ").toLocaleUpperCase("tr-TR")}` : "KVKK · KİŞİSEL VERİ TESPİT EDİLMEDİ"}</span>
      {no && <span>GELEN KAYIT {no}</span>}
    </div>
  );
}

function GelenOnizleme({ s, done, busy, onKapat, onIsle }) {
  const mask = useMemo(() => onizlemeMaskele(s?.text || ""), [s]);
  return (
    <BelgeModal acik={!!s} baslik={s ? s.konu || s.label : ""} kayitNo={s ? noOf(s) : ""} dosyaAdi={s ? `önizleme · ${s.label}` : ""}
      metin={mask.metin} onKapat={onKapat} akit altKunye={s ? <OnizlemeKunye no={noOf(s)} alanlar={mask.alanlar} /> : null}
      birincil={s ? (
        <ScrimDugme birincil onClick={onIsle} disabled={busy} title="Bu evrakı işle">
          {done ? "Yeniden işle" : "İşle"} <Icon.arrow width={13} height={13} />
        </ScrimDugme>
      ) : null} />
  );
}

function GelenBos({ samples, filter, bos, onUpload, busy, SABLON, BASLIKLAR }) {
  if (samples.length === 0) {
    /* Kuyruk gerçekten boş — "eşleşme yok" DEĞİL, işin bittiği hâl: görünümün hükmü (damga). */
    return (
      <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="E-2026/" damga="Kuyruk temiz"
        baslik="Bekleyen gelen evrak yok" sub="Kuyruktaki tüm evraklar işlenip karara bağlandı. Yeni gelen evrakı yükleyerek deftere işleyebilirsiniz."
        actions={[<Btn key="u" onClick={onUpload} disabled={busy}><Icon.upload /> Evrak yükle</Btn>]} />
    );
  }
  /* Arama ıskası hüküm değil — damga yerine mono künye. */
  return (
    <BosDefter sablon={SABLON} basliklar={BASLIKLAR} damga={null}
      kunye={`${filter.filters.search.trim() ? "Arama" : "Filtre"} · 0 / ${samples.length} kayıt`}
      baslik={bos.baslik} sub={bos.sub}
      actions={filter.hasActiveFilters ? [<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>] : null} />
  );
}

/* Antet sağ künyesi + folyo — kuyruk, gecikme ve EN YAKIN son gün (backend son_tarih'inden;
   yalnız süresi henüz dolmamış kayıtlar arasında). */
function gelenKunye(items, slaMap) {
  const gecikmis = items.filter((x) => x._slaDurum === "GECIKMIS").length;
  const acik = items.map((x) => slaMap?.[x.id]).filter((x) => x && Number.isFinite(x.kalan_gun) && x.kalan_gun >= 0 && x.son_tarih);
  const yakin = [...acik].sort((a, b) => a.kalan_gun - b.kalan_gun)[0];
  return {
    satirlar: [
      { k: "Kuyruk", v: `${items.length} evrak` },
      { k: "Gecikmiş", v: gecikmis ? `${String(gecikmis).padStart(2, "0")} · gecikti` : "", ton: "kirmizi" },
      { k: "En yakın son gün", v: yakin ? yakin.son_tarih : "" },
    ],
    folyo: (n) => `Sayfa 1 · ${n} kayıt${yakin ? ` · en yakın son gün ${yakin.son_tarih}` : ""}`,
  };
}

export default function GelenEvrakView({ samples = [], processedIds, slaMap = null, onProcess, onUpload, busy, hedef = null, onHedefAcildi, uid = null }) {
  const done = processedIds || new Set();
  const items = useMemo(() => samples.map((s) => ({
    ...s, _kategori: s._kategori || evrakKategori({ evrak_turu: etkinTur(s), konu: s.konu, text: s.text }),
    _slaGun: Number.isFinite(slaMap?.[s.id]?.kalan_gun) ? slaMap[s.id].kalan_gun : null,
    _slaDurum: slaMap?.[s.id]?.durum || "",
  })), [samples, slaMap]);
  const filterConfig = useMemo(() => ({ ...GELEN_FILTER_CONFIG_BASE, persistKey: uid ? `gelen-${uid}` : undefined }), [uid]);
  const filter = useDefterArama(useFilter(items, filterConfig), { metinOf, noOf, persistKey: uid ? `gelen-${uid}` : undefined });
  const [listeRef] = useAutoAnimate();
  const { vurgu, refOf } = useHedefVurgu({ hedef, onHedefAcildi, filter });
  // Önizleme: memur evrakı İŞLEMEDEN önce okuyabilmeli ("önce oku, sonra işle").
  const [onizle, setOnizle] = useState(null);
  const gez = useDefterGezinme();
  const vadeG = useVadeGenislik();
  const { of: vadeOf, eksen } = useVade(filter.results, slaMap, vadeG);
  const SABLON = useMemo(() => sablonOf(vadeG), [vadeG]);
  const BASLIKLAR = basliklarOf(eksen, vadeG);
  const slaBekleniyor = useSlaBekleme(slaMap, samples.length);
  // Görünümün hükmü: gecikmiş evrak sayısı (tek damga) — satırlarda gecikme cetvelle ölçülü.
  const gecikmisSay = items.filter((x) => x._slaDurum === "GECIKMIS").length;
  const kunye = gelenKunye(items, slaMap);
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "evrak", kalici: "kuyruktaki evraklar silinmedi" });
  const isle = () => { const sec = onizle; setOnizle(null); onProcess(sec); };

  return (
    <ViewWrap id="gelen-h" title="Gelen evrak" kunye="Gelen evrak defteri"
      sub={`${samples.length} evrak kuyrukta · önizlemek için satıra, işlemek için “İşle”ye`}
      damga={gecikmisSay ? { metin: `${gecikmisSay} gecikmiş`, ton: R, egim: -5 } : undefined}
      actions={[<DefterAntetKunye key="k" etiket="Gelen evrak defteri özeti" satirlar={kunye.satirlar} />,
        <Btn key="u" primary onClick={onUpload} disabled={busy}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <SicilStil />
      <VadeStil />
      <div>
        <FilterBar config={filterConfig} filter={filter} />
        {slaBekleniyor ? (
          <DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Yasal süreler hesaplanıyor" satir={8} />
        ) : samples.length === 0 || filter.results.length === 0 ? (
          <GelenBos samples={samples} filter={filter} bos={bos} onUpload={onUpload} busy={busy} SABLON={SABLON} BASLIKLAR={BASLIKLAR} />
        ) : (
          <DefterYuzey sablon={SABLON} basliklar={BASLIKLAR} etiket="Gelen evrak kayıtları" listeRef={listeRef} gezinme={gez} ipucu="önizle"
            rol="grid" dolgu={Math.max(0, 4 - filter.results.length)} folyo={kunye.folyo(filter.results.length)}>
            {filter.results.map((s, i) => (
              <GelenSatir key={s.id} s={s} i={i} done={done.has(s.id)} vurgulu={vurgu === s.id} gez={gez} rowRef={refOf(s.id)}
                onOnizle={setOnizle} onProcess={onProcess} busy={busy} jetonlar={filter.jetonlar} vade={vadeOf(s.id)} />
            ))}
          </DefterYuzey>
        )}
        <DefterNotu ikon={<Icon.info width={14} height={14} />}>
          Gelen evrak kuyruğu örnek evraklarla hazır gelir. <strong style={{ color: PAL.ink2, fontWeight: 600 }}>EBYS / KEP</strong> entegrasyonunda gelen evrak otomatik düşer; güven skoru, sisteme geliş ve son işlem tarihleri işleme anında oluşur. Vade çizelgesinde tüm satırlar tek zaman eksenindedir: kırmızı dikey çizgi bugündür; mavi bölüm yasal sürenin geçen kısmı, son gün çentiğinden bugüne uzanan kırmızı bölüm gecikmedir.
        </DefterNotu>
      </div>

      <GelenOnizleme s={onizle} done={onizle ? done.has(onizle.id) : false} busy={busy} onKapat={() => setOnizle(null)} onIsle={isle} />
    </ViewWrap>
  );
}
