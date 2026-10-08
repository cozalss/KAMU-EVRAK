/* IslenenEvrakView — işlenen TÜM evrakların arşivi: EVRAK SİCİL DEFTERİ.
   Üç katman: özet (çetele + karar dağılımı; telefonda tek satırlık şerit) · kompakt filtre
   (FilterBar kip="kompakt" — üç defterin ortak dilbilgisi) · sicil defteri (kova başına
   yapışkan ayraç, hairline kayıtlar).

   Tur 6 (jüri):
   · Sicil defterinin omurgası olan KAYIT NO geldi ("İ-2026/0007", yıl içi geliş sırası) —
     aynı başlıklı kayıtlar ayırt edilir; aynı kaynağın tekrar işlenişi künye satırında
     ("2./3 işleniş"). Derkenar istisnaya ayrılır: demo sicilinde 9 kaydın 9'u yinelemeydi,
     her satırdaki kenar notu ayırt etmiyordu. Kayıtlar birleştirilmez: her işlem ayrı karardır.
   · "Saat" başlığı altında tarih yazıyordu → "Tarih · saat", hücre her zaman iki satır.
   · Hover'da karar çipi kaybolmuyor; "Düzenle" sondaki ok yuvasında opaklıkla belirir.
   · Detay = ARŞİV NÜSHASI (IslenenNusha, BelgeModal ailesi).
   Kurgu ayrımı: İşlenen = arşiv/izleme, Taslaklar = çalışma kuyruğu, Giden = gönderilmiş. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ViewWrap, Btn, Icon, MONO, PAL, BANT, TYPE, TNUM, RAD, SP, ALFA, DERIN_OF, SR_ONLY } from "./neonUi.jsx";
import { SicilStil, BaslikHucre, DefterYuzey, BosDefter, DefterIskelet, DefterHata, GrupBasligi, useDefterGezinme, Imlec, HUCRE, KayitNoHucre, Derkenar, Vurgulu, alanlarOf, DEFTER_NO, DEFTER_MARJ, ADIM } from "./SicilDefter.jsx";
import DefterAntetKunye from "./DefterAntetKunye.jsx";
import { kovaKutlesi, AYNEN } from "../lib/defterKutle.js";
import { useDarEkran } from "../hooks/useMedya.js";
import { SecimKutu, SecimCubugu } from "./IslenenSecim.jsx";
import IslenenNusha, { DURUM_TR, DURUM_RENK, fmtGuven, fmtSure } from "./IslenenNusha.jsx";
import IslenenOzet, { OzetIskelet } from "./IslenenOzet.jsx";
import FilterBar, { FiltreIskelet } from "./FilterBar.jsx";
import { bosDurumMetni } from "../lib/sicilDefter.js";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { useDefterArama } from "../lib/useDefterArama.js";
import { riskAdi, baslikCase, islenenSicilNolari, yinelemeDerkenari, defterZamani } from "../lib/defterSozluk.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta } from "../lib/kategori.js";
import { sicilGrupla } from "../lib/sicilVaryant.js";

/* Karar durumu tek sözlükten — Panel sayaçları ve draftsFromHistory ile AYNI süzgeç. */
const durumOf = (r) =>
  r?.onay_durumu === "onaylandi" ? "onaylandi"
    : r?.onay_durumu === "reddedildi" ? "reddedildi"
      : r?.onay_durumu === "duzenlendi" ? "duzenlendi"
        : r?.yazi_taslak_md ? "bekliyor" : "islendi";
const DURUM_KISA = { bekliyor: "Karar bekliyor", onaylandi: "Onaylandı", reddedildi: "Reddedildi", duzenlendi: "Düzenlendi", islendi: "Taslak yok" };

/* Zaman kovası — insan-dostu kovalar; zamana göre monoton → sıralı listede gruplar bitişik. */
const GUN_MS = 86_400_000;
const ayniGun = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function gunEtiketi(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Tarihsiz";
  const bugun = new Date();
  if (ayniGun(d, bugun)) return "Bugün";
  const dun = new Date(bugun); dun.setDate(bugun.getDate() - 1);
  if (ayniGun(d, dun)) return "Dün";
  const fark = Math.floor((new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / GUN_MS);
  if (fark < 7) return "Bu hafta";
  if (fark < 14) return "Geçen hafta";
  return d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

/* Filtre — üç defterle ortak FilterBar; karar durumu (durum) özet karolarında seçilir. */
const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, dosya, kayıt no…", label: "Sicil defterinde ara" },
  chips: [
    { id: "risk", label: "Risk", options: ["yesil", "sari", "kirmizi"].map((b) => ({ value: b, label: riskAdi(b), color: BANT[b].c })) },
    { id: "durum", label: "Karar", options: Object.entries(DURUM_KISA).map(([value, label]) => ({ value, label })) },
  ],
  select: [{ id: "tur", label: "Evrak türü", options: [] }, { id: "birim", label: "Hedef birim", options: [] }],
  datePresets: { enabled: true },
  dateRange: { enabled: true, label: "İşlem tarihi" },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
    { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu"], risk: "bant", durum: "_durum", tur: "evrak_turu", birim: "hedef_birim", dateField: "ts" },
};
const metinOf = (x) => [x._konuGoster, x.name, EVRAK_TR(x.evrak_turu), BIRIM_GOSTER(x.hedef_birim, x.evrak_turu), x._no].join(" ");
const noOf = (x) => x._no;

/* Defter şablonu — kayıt no (+seçim, derkenar) · tarih/saat · konu · karar · risk · eylem.
   Telefonda SİCİL FİŞİ: dikey no koçanı; tarih + risk üstte, konu ortada, karar + eylem altta. */
const SABLON = {
  /* Tur 9 jüri: 1920'de konu ile KARAR arasında ~350 px ölü koridor → geniş ekranda karar
     (132→200) ve risk (68→120) sütunları büyür, konu sütununa düşen artık azalır; 1440'ta
     şablon önceki gibi (konu kesilmez). */
  kolon: `${DEFTER_NO} 84px minmax(0,1fr) clamp(132px, calc(100vw - 1460px), 200px) clamp(68px, calc(100vw - 1700px), 120px) 92px`,
  marj: DEFTER_MARJ,
  satir: ADIM.yogun,
  alan: '"no zaman ana durum risk eylem"',
  kolonDar: "34px minmax(0,1fr) auto",
  alanDar: '"no zaman risk" "no ana ana" "no durum eylem"',
};
const BASLIK_GOVDE = [
  <BaslikHucre key="z" alan="zaman">Tarih · saat</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · kaynak · tür · birim</BaslikHucre>,
  <BaslikHucre key="d" alan="durum">Karar</BaslikHucre>,
  <BaslikHucre key="r" alan="risk">Risk</BaslikHucre>,
  <BaslikHucre key="e" alan="eylem" sag>Eylem</BaslikHucre>,
];
const BASLIKLAR = [<BaslikHucre key="n" alan="no">Kayıt no</BaslikHucre>, ...BASLIK_GOVDE];

/* Sicil dökümü sütunları (CSV) — risk SKORU yok, yalnız bant kodu (CLAUDE.md §7). */
const DOKUM_SUTUN = [
  { baslik: "Kayıt no", deger: (r) => r._no },
  { baslik: "İşlem tarihi", deger: (r) => defterZamani(r.ts).tam },
  { baslik: "Dosya", deger: (r) => r.name },
  { baslik: "Konu", deger: (r) => r._konuGoster },
  { baslik: "Evrak türü", deger: (r) => EVRAK_TR(r.evrak_turu) },
  { baslik: "Hedef birim", deger: (r) => BIRIM_GOSTER(r.hedef_birim, r.evrak_turu) },
  { baslik: "Karar durumu", deger: (r) => DURUM_TR[r._durum] },
  { baslik: "Risk bandı", deger: (r) => BANT[r.bant]?.l || "" },
  { baslik: "Sınıflandırma güveni", deger: (r) => fmtGuven(r.result?.tur_confidence) },
];

/* Karar durumu — kütle durumu (bekliyor/işlendi) SESSİZ metin; yalnız karar verilmiş
   istisnalar tint çip. Hover'da da yerinde kalır (bilgi bakıldığı anda gizlenmez). */
/* AYNEN İŞARETİ (〃) — kova başlığı kütle durumunu söylediğinde (ör. "25/26 karar bekliyor")
   aynı durumu taşıyan satır deftercilerin "aynen" işaretini basar; satırda yalnız SAPAN
   (onaylandı, reddedildi…) yazılı kalır (tur 8 jüri: 32/33 satırda aynı "Karar bekliyor ·
   Orta" istisnayı gömüyordu). Ekran okuyucu tam metni okur. */
/* Tur 9 imza: satıra bakılınca 〃 yerinde asıl değere çözülür (120 ms çapraz geçiş, yalnız
   opaklık; iki katman aynı ızgara hücresinde → genişlik sabit, kayma yok). */
const Aynen = ({ metin, goster = metin }) => (
  <span title={metin} data-aynen="" style={{ ...TYPE.meta, color: PAL.mut3, whiteSpace: "nowrap" }}>
    <span aria-hidden="true" data-aynen-isaret="" style={{ fontSize: 15, lineHeight: "16px", paddingLeft: 10 }}>{AYNEN}</span>
    <span aria-hidden="true" data-aynen-deger="" style={{ color: PAL.mut2 }}>{goster}</span>
    <span style={SR_ONLY}>{metin}</span>
  </span>
);

/* Defterci geleneği: kovanın İLK satırı değeri mürekkeple tam yazar; 〃 yalnız bir üstteki
   satır AYNI değeri taşıdığında basılır (tur 8 jüri 2: ilk satır da 〃 olunca sütun boş
   okunuyordu). Önceki satır yoksa (kova başı) aynen yok. */
const aynenKutlesi = (kutle, onceki) => (onceki ? {
  durum: kutle.durum && onceki._durum === kutle.durum ? kutle.durum : null,
  risk: kutle.risk && onceki.bant === kutle.risk ? kutle.risk : null,
} : null);

function DurumCip({ durum, aynen }) {
  if (aynen) return <Aynen metin={DURUM_KISA[durum]} />;
  const renk = DURUM_RENK[durum];
  const sessiz = durum === "bekliyor" || durum === "islendi";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...TYPE.meta, fontWeight: 500, whiteSpace: "nowrap",
      ...(sessiz ? { color: PAL.mut2, padding: "2px 0" } : { padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(renk), color: DERIN_OF(renk) }) }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: renk || PAL.mut3, opacity: sessiz && renk ? 0.7 : 1 }} />
      {DURUM_KISA[durum]}
    </span>
  );
}

function ZamanHucre({ ts }) {
  const z = defterZamani(ts);
  return (
    <span {...HUCRE.grid} data-sd-zaman="" style={{ gridArea: "zaman", display: "flex", flexDirection: "column", fontFamily: MONO, fontSize: 12, lineHeight: "16px", ...TNUM }}>
      <span style={{ color: PAL.ink2, fontWeight: 500 }}>{z.gun}</span>
      <span style={{ color: PAL.mut3 }}>{z.saat}</span>
    </span>
  );
}

function EylemHucre({ item, onDuzenle }) {
  const duzenlenir = item._durum === "bekliyor" && onDuzenle;
  return (
    <span {...HUCRE.grid} data-sd-eylem-yuva="" style={{ gridArea: "eylem" }}>
      <span data-sd-ok={duzenlenir ? "degis" : ""} aria-hidden="true"><Icon.arrow width={13} height={13} /></span>
      {duzenlenir && (
        <button type="button" data-sd-eylem="" data-sd-gizli="" data-press="" onClick={(e) => { e.stopPropagation(); onDuzenle(item); }}
          aria-label={`${item._konuGoster} taslağını Taslaklar'da düzenle`} style={{ padding: "4px 10px" }}>
          <Icon.edit width={12} height={12} /> Düzenle
        </button>
      )}
    </span>
  );
}

/* Süre işareti — DERKENAR olarak kayıt no altında (tur 8 jüri: konu satırının sonunda konuyu
   "ih…" diye kesiyordu; en önemli bilgi en dar yerde kalıyordu). Konu tam genişliği alır. */
/* Telefon SİCİL FİŞİ düzeni değişmez: orada işaret konu satırının altında kalır (koçan dikey). */
const SureIsareti = ({ renk, children }) => (
  <span data-sd-sure-isaret="" style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(renk), whiteSpace: "nowrap" }}>
    <span data-sd-ayrac="" aria-hidden="true">· </span>{children}
  </span>
);
const sureDerkenari = (sla) => (sla === "GECIKMIS" ? <Derkenar ton="kirmizi" title="Yasal süresi geçmiş">Süre geçti</Derkenar>
  : sla === "KRITIK" ? <Derkenar ton="sari" title="Yasal süresi kritik">Süre kritik</Derkenar> : null);

const dosyaEslesir = (ad, jetonlar) => {
  if (!jetonlar?.length) return false;
  const k = String(ad).toLocaleLowerCase("tr-TR");
  return jetonlar.some((j) => j && k.includes(String(j).toLocaleLowerCase("tr-TR")));
};

/* İkincil satır — tür · birim · güven · süre · işleniş · DOSYA (en sonda, mono, soluk, ortadan
   kısaltılmış; tur 8 jüri: satır makine dosya adıyla başlıyordu). */
function MetaSatiri({ item, jetonlar }) {
  const r = item.result || {};
  const guven = fmtGuven(r.tur_confidence), sure = fmtSure(r.sure_ms), yin = item._yineleme;
  const ayrac = <span aria-hidden="true" style={{ color: PAL.mut3 }}> · </span>;
  return (
    <span style={{ display: "block", ...TYPE.meta, color: PAL.mut, marginTop: 3, paddingLeft: 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {EVRAK_TR(item.evrak_turu)}{ayrac}<span style={{ color: PAL.mut2 }}>{BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)}</span>
      {guven && <>{ayrac}güven {guven}</>}{sure && <>{ayrac}{sure}</>}
      {item.varyantlar?.length > 1 && <>{ayrac}{item.varyantlar.length} yazı türü</>}
      {yin && <span title={`Aynı kaynaktan ${yin.toplam} işlem — bu ${yin.sira}. işleniş`}>{ayrac}{yin.sira}./{yin.toplam} işleniş</span>}
      {/* Dosya adı makine verisidir: satırda YALNIZ arama dosya adında eşleştiğinde basılır
          (tur 8 jüri 2); tam ad nüsha künyesinde ve CSV dökümünde durur. */}
      {item.name && dosyaEslesir(item.name, jetonlar) && <>{ayrac}<span title={item.name} style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3 }}><Vurgulu metin={item.name} jetonlar={jetonlar} /></span></>}
    </span>
  );
}

/* Defter kaydı — satır = grid row (odaklanır; Enter detay, Space seçer — APG ızgara deseni). */
function DefterSatiri({ item, sira, onAc, onDuzenle, gez, secili, onSec, jetonlar, kutle, dar }) {
  const riskC = BANT[item.bant]?.c;
  const sla = item.result?.sla_metadata?.durum;
  const kat = kategoriMeta(evrakKategori({ evrak_turu: item.evrak_turu, konu: item.konu }));
  const KIcon = Icon[kat.icon] || Icon.doc;
  return (
    <div role="row" tabIndex={0} aria-selected={secili} data-sicil-satir="" data-sd-fis="" data-sd-anahtar={item.id} onClick={(e) => onAc(item, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") { e.preventDefault(); onAc(item, e.currentTarget); } else if (e.key === " ") { e.preventDefault(); onSec(item.id); }
      }}
      aria-label={`${item._no} — ${item._konuGoster} — ${DURUM_TR[item._durum]}${secili ? " — seçili" : ""}`}
      onPointerDown={() => gez.sec(item.id)} style={{ "--sd-i": Math.min(sira, 14) }}>
      {gez.aktif === item.id && <Imlec gezinme={gez} kimlik="islenen" />}
      <KayitNoHucre no={item._no} derkenar={dar ? null : sureDerkenari(sla)} onEk={<SecimKutu secili={secili} onDegis={() => onSec(item.id)} etiket={`Seç: ${item._konuGoster}`} />} />
      <ZamanHucre ts={item.ts} />
      <span {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
        <span data-sd-konu-satir="" style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
          <span aria-hidden="true" title={kat.label} style={{ display: "flex", flexShrink: 0, color: DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut3 }}><KIcon width={14} height={14} /></span>
          <span data-sd-konu="" title={item._konuGoster} style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <Vurgulu metin={item._konuGoster} jetonlar={jetonlar} />
          </span>
          {dar && sla === "GECIKMIS" && <SureIsareti renk={BANT.kirmizi.c}>süresi geçmiş</SureIsareti>}
          {dar && sla === "KRITIK" && <SureIsareti renk={BANT.sari.c}>süre kritik</SureIsareti>}
        </span>
        <MetaSatiri item={item} jetonlar={jetonlar} />
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "durum", minWidth: 0 }}><DurumCip durum={item._durum} aynen={kutle?.durum === item._durum} /></span>
      {kutle?.risk === item.bant ? <span {...HUCRE.grid} data-sd-sag-dar="" style={{ gridArea: "risk" }}><Aynen metin={`risk: ${riskAdi(item.bant)}`} goster={riskAdi(item.bant)} /></span> : (
        <span {...HUCRE.grid} data-sd-sag-dar="" style={{ gridArea: "risk", display: "inline-flex", alignItems: "center", gap: 6, ...TYPE.meta, fontWeight: 500, color: riskC ? DERIN_OF(riskC) : PAL.mut3, whiteSpace: "nowrap" }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskC || PAL.mut3, opacity: riskC ? 1 : 0.5 }} />
          <span style={SR_ONLY}>risk: </span>{riskAdi(item.bant) || "—"}
        </span>
      )}
      <EylemHucre item={item} onDuzenle={onDuzenle} />
    </div>
  );
}

/* Toplu seçim — anahtar kümesi (değişmez güncelleme), görünür kayıtlarla kesişim, Esc bırakır. */
function useTopluSecim(gorunur) {
  const [secim, setSecim] = useState(() => new Set());
  const gorunurIdler = useMemo(() => new Set(gorunur.map((x) => x.id)), [gorunur]);
  const etkin = useMemo(() => new Set([...secim].filter((id) => gorunurIdler.has(id))), [secim, gorunurIdler]);
  const degistir = useCallback((id) => setSecim((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; }), []);
  const birak = useCallback(() => setSecim(new Set()), []);
  const hepsi = gorunur.length > 0 && etkin.size === gorunur.length;
  const tumunu = useCallback(() => setSecim(hepsi ? new Set() : new Set(gorunurIdler)), [hepsi, gorunurIdler]);
  useEffect(() => {
    if (!etkin.size) return undefined;
    const tus = (e) => { if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) birak(); };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [etkin.size, birak]);
  return { etkin, degistir, birak, hepsi, tumunu, kayitlar: gorunur.filter((x) => etkin.has(x.id)) };
}

/* Gösterim normalizasyonu — konu sonundaki yazışma kısaltması "hk." / "hk" → "hakkında"
   (yalnız görüntü; kaynak veri ve arama aynı kalır). */
const konuNormal = (s) => String(s || "").replace(/\s+hk\.?\s*$/iu, " hakkında");

/* Belge başına TEK sicil satırı (sicilGrupla) + sicil no + yineleme derkenarı + konu. */
function useSicilKayitlari(history) {
  return useMemo(() => {
    const taban = sicilGrupla(history).map((h) => {
      const konu = h.result?.bilgi_unsurlari?.konu || h.result?.alt_talepler?.[0]?.ozet || "";
      return { ...h, hedef_birim: h.hedef_birim || h.hedef_birim_adi || "", _durum: durumOf(h.result), konu, _konuGoster: konuNormal(baslikCase(cleanDemoText(konu))) || h.name };
    });
    const nolar = islenenSicilNolari(taban);
    const yin = yinelemeDerkenari(taban, (x) => `${x.name}|${x._konuGoster}`);
    return taban.map((x) => ({ ...x, _no: nolar.get(x.id), _yineleme: yin.get(x.id) || null }));
  }, [history]);
}

function useIslenenFiltre(items) {
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(items, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(items, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [items]);
  return { config, filter: useDefterArama(useFilter(items, config), { metinOf, noOf }) };
}

function kovalar(results, tarihSirali) {
  if (!tarihSirali) return [{ etiket: null, rows: results }];
  const out = [];
  for (const row of results) {
    const etiket = gunEtiketi(row.ts);
    if (!out.length || out[out.length - 1].etiket !== etiket) out.push({ etiket, rows: [] });
    out[out.length - 1].rows.push(row);
  }
  return out;
}

function IslenenBos({ yukleniyor, hata, onYenidenDene, onGoInbox }) {
  if (yukleniyor) return <><OzetIskelet /><FiltreIskelet cip={3} /><DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Sicil kayıtları yükleniyor" /></>;
  if (hata) return <DefterHata sablon={SABLON} basliklar={BASLIKLAR} baslik="Sicil defteri alınamadı" ayrinti={String(hata?.message || hata)} onYenidenDene={onYenidenDene} />;
  return (
    <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek={`İ-${new Date().getFullYear()}/`} satir={4} baslik="Sicil defteri henüz açılmadı"
      sub="Gelen evrak kuyruğundan bir evrak seçtiğinizde ya da yeni bir belge yüklediğinizde, işlenen her evrak karar durumuyla birlikte buraya kaydedilir."
      actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
  );
}

/* Sicil defteri yüzeyi — seçim çubuğu + "tümünü seç" başlığı + kovalara bölünmüş kayıtlar. */
const KOLON = alanlarOf(SABLON.alan).length;

/* Kova başlığında kütle durumu — "karar bekliyor 25/26 · orta risk 24/26". */
function KutleEki({ kutle, n }) {
  const parca = [kutle.durum && `${DURUM_KISA[kutle.durum].toLocaleLowerCase("tr-TR")} ${kutle.durumSay}/${n}`,
    kutle.risk && `${riskAdi(kutle.risk).toLocaleLowerCase("tr-TR")} risk ${kutle.riskSay}/${n}`].filter(Boolean);
  if (!parca.length) return null;
  return <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM, marginLeft: "auto" }}>{AYNEN} = {parca.join(" · ")}</span>;
}

function IslenenDefter({ filter, gez, secim, onAc, onDuzenle, folyo }) {
  const dar = useDarEkran();
  const tarihSirali = filter.filters.sortBy === "ts_desc" || filter.filters.sortBy === "ts_asc";
  const gruplar = useMemo(() => kovalar(filter.results, tarihSirali), [filter.results, tarihSirali]);
  const basliklar = [
    <BaslikHucre key="n" alan="no">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <SecimKutu secili={secim.hepsi} karisik={secim.etkin.size > 0} onDegis={secim.tumunu}
          etiket={secim.hepsi ? "Tüm seçimi kaldır" : `Görünen ${filter.results.length} kaydın tümünü seç`} />
        Kayıt no
      </span>
    </BaslikHucre>, ...BASLIK_GOVDE];
  let sira = 0;
  return (
    <>
      <DefterYuzey sablon={SABLON} basliklar={basliklar} etiket="İşlenen evrak kayıtları" gezinme={gez} ipucu="arşiv nüshasını aç" folyo={folyo}
        rol="grid" secimli dolgu={Math.max(0, 6 - filter.results.length)}>
        {gruplar.map((g, gi) => {
          // Aynen işareti yalnız masaüstü defterinde (telefon fişi her değeri yerinde yazar).
          const kutle = g.etiket && !dar ? kovaKutlesi(g.rows) : null;
          return (
            <React.Fragment key={g.etiket || `düz-${gi}`}>
              {g.etiket && <GrupBasligi etiket={g.etiket} sayi={g.rows.length} kolon={KOLON}>{kutle && <KutleEki kutle={kutle} n={g.rows.length} />}</GrupBasligi>}
              {g.rows.map((item, i) => (
                <DefterSatiri key={item.id} item={item} sira={sira++} gez={gez} secili={secim.etkin.has(item.id)} onSec={secim.degistir}
                  onAc={onAc} onDuzenle={onDuzenle} jetonlar={filter.jetonlar} kutle={kutle ? aynenKutlesi(kutle, g.rows[i - 1]) : null} dar={dar} />
              ))}
            </React.Fragment>
          );
        })}
      </DefterYuzey>
      <SecimCubugu seciliKayitlar={secim.kayitlar} sutunlar={DOKUM_SUTUN} onBirak={secim.birak} />
    </>
  );
}

/* Antet sağ künyesi + folyo — yalnız sicilin kendi kayıtlarından. */
function islenenKunye(items) {
  const son = items.reduce((a, x) => (!a || Number(x.ts) > Number(a.ts) ? x : a), null);
  const sonZaman = son ? defterZamani(son.ts).tam : "";
  return {
    satirlar: [
      { k: "Son kayıt", v: son?._no || "" },
      { k: "Son işlem", v: sonZaman },
    ],
    // Folyo yalnız sayfa künyesi — son kayıt/işlem antet künyesinde (tekrar yok).
    folyo: (rows) => `Sayfa 1 · ${rows.length} kayıt`,
  };
}

/* yukleniyor / hata: DB işlem geçmişi sorgusunun durumu (DashboardApp islemlerQ). */
export default function IslenenEvrakView({ history = [], onGoInbox, onDuzenle = () => {}, onMevzuatAc = null, yukleniyor = false, hata = null, onYenidenDene }) {
  const [detay, setDetay] = useState(null);
  const items = useSicilKayitlari(history);
  const { config, filter } = useIslenenFiltre(items);
  const secim = useTopluSecim(filter.results);
  const gez = useDefterGezinme({ secimTusu: secim.degistir });
  const sureler = items.map((x) => x.result?.sure_ms).filter((x) => Number.isFinite(x) && x > 0);
  const ortSn = sureler.length ? sureler.reduce((a, x) => a + x, 0) / sureler.length / 1000 : null;

  if (history.length === 0) {
    return (
      <ViewWrap id="islenen-h" title="İşlenen evrak" kunye="Evrak sicil defteri" sub={yukleniyor ? "Defter açılıyor…" : "Bu oturumda ve önceki oturumlarda işlenen tüm evraklar"}>
        <SicilStil />
        <div><IslenenBos yukleniyor={yukleniyor} hata={hata} onYenidenDene={onYenidenDene} onGoInbox={onGoInbox} /></div>
      </ViewWrap>
    );
  }
  // Görünümün hükmü: memur kararı bekleyen kayıt sayısı (tek damga).
  const bekleyen = items.filter((x) => x._durum === "bekliyor").length;
  const kunye = islenenKunye(items);
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "kayıt", kalici: "sicil kayıtları silinmez" });
  // Başlıkta eylem YOK: "Yeni evrak yükle" kenar çubuğunda kalıcı duruyor.
  return (
    <ViewWrap id="islenen-h" title="İşlenen evrak" kunye="Evrak sicil defteri" sub="İşlenen her kayıt, karar durumu ve risk bandıyla"
      damga={bekleyen ? { metin: `${bekleyen} karar bekliyor`, ton: BANT.sari.c, egim: -4 } : undefined}
      actions={[<DefterAntetKunye key="k" etiket="Sicil defteri özeti" satirlar={kunye.satirlar} />]}>
      <SicilStil />
      <div>
        <IslenenOzet items={items} filter={filter} ortSn={ortSn} />
        <FilterBar config={config} filter={filter} kip="kompakt" satirIci={["risk"]} gizli={["durum"]} />
        {filter.results.length === 0 ? (
          <BosDefter sablon={SABLON} basliklar={BASLIKLAR} damga={null}
            kunye={`${filter.filters.search.trim() ? "Arama" : "Filtre"} · 0 / ${items.length} kayıt`}
            baslik={bos.baslik} sub={bos.sub} actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
        ) : (
          <IslenenDefter filter={filter} gez={gez} secim={secim} onAc={setDetay} onDuzenle={onDuzenle} folyo={kunye.folyo(filter.results)} />
        )}
      </div>
      <IslenenNusha item={detay} onClose={() => setDetay(null)} onDuzenle={onDuzenle} onMevzuatAc={onMevzuatAc} />
    </ViewWrap>
  );
}
