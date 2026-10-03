/* GelenEvrakView — işlenecek evrak kuyruğu + kapsamlı filtre (arama/kategori/grup/sıralama).
   Örnek evraklar "gelen evrak"; tıkla → İşleniyor'da uçtan-uca işlenir.
   Kategori operasyonel gruplama için TÜRETİLİR (lib/kategori); güven/tarih işleme sonucu
   oluştuğundan kuyrukta boştur (durum "Yeni" / işlenmişse "İşlendi"). */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, Icon, MONO, T, R, PAL, BANT, TYPE, TNUM, RAD, SP, DERIN, focusRing, SR_ONLY } from "./neonUi.jsx";
import { SicilStil, SicilNo, BaslikHucre, SessizCip, DefterYuzey, BosDefter, DefterNotu, useDefterGezinme, Imlec, HUCRE } from "./SicilDefter.jsx";
import { bosDurumMetni } from "../lib/sicilDefter.js";
import FilterBar from "./FilterBar.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import { useFilter } from "../hooks/useFilter.js";
import { evrakKategori, kategoriMeta, KATEGORILER, KATEGORI_BIRIM } from "../lib/kategori.js";
import { BIRIM_LBL } from "./result-cards.jsx";
import { SAMPLE_DOCS } from "../lib/sampleDocs.js";

// Kalıcı kayıt numarası: evrakın SAMPLE_DOCS içindeki özgün konumu (id → no). Kuyruk
// filtrelense/gönderilse de numara değişmez (kayıt no değişmezliği — jüri bulgusu).
const EVRAK_NO = new Map(SAMPLE_DOCS.map((s, i) => [s.id, i + 1]));

const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

// persistKey uid ile SUFFIX'lenir (bkz. çağıran) — sabit "gelen" anahtarı paylaşılan/kiosk
// tarayıcıda farklı memurlar arasında arama metni + çip/sıralama seçimini sızdırıyordu
// (authApi.tokens.clear() de bu anahtara dokunmuyordu — regresyon bulgusu).
const GELEN_FILTER_CONFIG_BASE = {
  // fuzzy: diakritik/yazım hatası affeden arama (fuse.js) — "dilekce" → "Dilekçe".
  search: { enabled: true, placeholder: "Evrak adı, açıklama…", fuzzy: true },
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

/* Defter şablonu — kayıt no · konu bloğu · yasal süre · durum · eylem. Telefonda: üst satır
   no + süre, orta satır konu, alt satır durum + eylem (bilgi gizlenmez, yeniden dizilir). */
const SABLON = {
  kolon: "112px minmax(0,1fr) 158px 84px 112px",
  marj: "142px",
  alan: '"no ana sure durum eylem"',
  alanDar: '"no sure" "ana ana" "durum eylem"',
  adim: "88px",
};
const BASLIKLAR = [
  <BaslikHucre key="n" alan="no">Kayıt no</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · tür · önerilen birim</BaslikHucre>,
  <BaslikHucre key="s" alan="sure">Yasal süre</BaslikHucre>,
  <BaslikHucre key="d" alan="durum">Durum</BaslikHucre>,
  <BaslikHucre key="e" alan="eylem" sag>Eylem</BaslikHucre>,
];

/* Yasal süre hücresi — backend /sla/onizleme sonucundan (compute_sla tek kaynak).
   Ölçülü dil: yalnız GECİKMİŞ tint zemin + uyarı ikonu taşır (en ağır hâl); KRİTİK renkli
   nokta + metin; normal süre sessiz. Son gün mono alt satırda. Süre tanımsız türde "—"
   (SlaTriyajCard ile aynı sessizlik kuralı); okunamayan tarih memur diliyle. */
function SureHucre({ sla }) {
  if (!sla || sla.durum === "tanimsiz") return <span style={{ ...TYPE.meta, color: PAL.mut3 }} aria-label="Yasal süre tanımsız">—</span>;
  if (sla.durum === "tarih_yok") {
    return <span title={sla.etiket} style={{ ...TYPE.meta, color: PAL.mut2, fontStyle: "italic" }}>tarih doğrulanmalı</span>;
  }
  const gec = sla.durum === "GECIKMIS", kri = sla.durum === "KRITIK";
  const renk = gec ? BANT.kirmizi.c : kri ? BANT.sari.c : BANT.yesil.c;
  const metin = gec ? `${Math.abs(sla.kalan_gun)} gün gecikti` : kri ? `son ${sla.kalan_gun} gün` : `${sla.kalan_gun} gün süre`;
  return (
    <span title={`${sla.etiket}; son tarih: ${sla.son_tarih || "?"} (${sla.mevzuat})`} style={{ display: "inline-flex", flexDirection: "column", gap: 2, alignItems: "flex-start", minWidth: 0 }}>
      <SessizCip renk={renk} vurgulu={gec} metin={metin} ikon={gec ? <Icon.alert width={12} height={12} /> : null} />
      {sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM, paddingLeft: gec ? 8 : 12 }}>son gün {sla.son_tarih}</span>}
    </span>
  );
}

export default function GelenEvrakView({ samples = [], processedIds, slaMap = null, onProcess, onUpload, busy, hedef = null, onHedefAcildi, uid = null }) {
  const done = processedIds || new Set();
  // Her örneğe operasyonel kategori türet (id ≈ evrak türü + metin anahtar sözcükleri).
  // _slaGun: aciliyet sıralamasının anahtarı (Panel'in öğrettiği triyaj modeli artık
  // kuyruğun VARSAYILAN sırası — jüri bulgusu: gecikmiş evrak 22 satırda göz ile aranıyordu).
  const items = useMemo(() => samples.map((s) => ({
    ...s, _kategori: s._kategori || evrakKategori({ evrak_turu: s.tur || s.id, text: s.text }),
    _slaGun: Number.isFinite(slaMap?.[s.id]?.kalan_gun) ? slaMap[s.id].kalan_gun : null,
    _slaDurum: slaMap?.[s.id]?.durum || "",
  })), [samples, slaMap]);
  // Kayıtlı görünüm (Paperless saved-views hafif hâli) kullanıcıya özel — uid yoksa (henüz
  // yüklenmedi) kalıcılık atlanır, başka kullanıcının filtresi asla uygulanmaz.
  const filterConfig = useMemo(() => ({
    ...GELEN_FILTER_CONFIG_BASE, persistKey: uid ? `gelen-${uid}` : undefined,
  }), [uid]);
  const filter = useFilter(items, filterConfig);
  const [listeRef] = useAutoAnimate();   // filtre/işleme değişince satırlar akıcı girer-çıkar

  // Panel SLA satırından hedefli geliş: satırı görünüre kaydır + kısa süre vurgula.
  // Hedef aktif filtreye takılıysa filtreler temizlenir (bir sonraki render'da bulunur);
  // kuyruğa hiç yoksa (gönderilmiş) hedef sessizce tüketilir.
  const rowRefs = useRef(new Map());
  const [vurgu, setVurgu] = useState(null);
  // Önizleme: memur evrakı İŞLEMEDEN önce okuyabilmeli (jüri bulgusu — "önce oku, sonra
  // işle" temel akıştı; tek eylem kara kutuya çeviriyordu). Satır tıklaması A4 modal açar.
  const [onizle, setOnizle] = useState(null);
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
  // Sönme AYRI efekte: onHedefAcildi parent'ta hedef'i null'layınca üstteki efektin
  // cleanup'ı zamanlayıcıyı iptal ediyordu → vurgu HİÇ sönmüyordu (bug avı bulgusu).
  useEffect(() => {
    if (!vurgu) return undefined;
    const t = setTimeout(() => setVurgu(null), 2600);
    return () => clearTimeout(t);
  }, [vurgu]);

  // Görünümün hükmü: gecikmiş evrak sayısı (tek damga). Satırlarda gecikme ölçülü kalır —
  // 15 satırda 9 damga dikkat bütçesini yakardı; hüküm başlıkta bir kez basılır.
  const gez = useDefterGezinme();
  const gecikmisSay = items.filter((x) => x._slaDurum === "GECIKMIS").length;
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "evrak", kalici: "kuyruktaki evraklar silinmedi" });

  return (
    <ViewWrap id="gelen-h" title="Gelen evrak" kunye="Gelen evrak defteri"
      sub={`${samples.length} evrak kuyrukta · önizlemek için satıra, işlemek için “İşle”ye`}
      damga={gecikmisSay ? { metin: `${gecikmisSay} gecikmiş`, ton: R, egim: -5 } : undefined}
      actions={[<Btn key="u" primary onClick={onUpload} disabled={busy}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <SicilStil />
      <FilterBar config={filterConfig} filter={filter} />

      {samples.length === 0 ? (
        /* Kuyruk gerçekten boş (tüm örnekler gönderildi) — "eşleşme yok" DEĞİL, işin bittiği hâl. */
        <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="E-2026/" damga="Kuyruk temiz"
          baslik="Bekleyen gelen evrak yok" sub="Kuyruktaki tüm evraklar işlenip karara bağlandı. Yeni gelen evrakı yükleyerek deftere işleyebilirsiniz."
          actions={[<Btn key="u" onClick={onUpload} disabled={busy}><Icon.upload /> Evrak yükle</Btn>]} />
      ) : filter.results.length === 0 ? (
        <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="E-2026/" damga="Eşleşme yok"
          baslik={bos.baslik} sub={bos.sub}
          actions={filter.hasActiveFilters ? [<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>] : null} />
      ) : (
        <DefterYuzey sablon={SABLON} basliklar={BASLIKLAR} etiket="Gelen evrak kayıtları" listeRef={listeRef} gezinme={gez} ipucu="önizle"
          rol="grid" dolgu={Math.max(0, 4 - filter.results.length)}>
          {filter.results.map((s, i) => {
            const no = EVRAK_NO.get(s.id) ?? 0;
            const isDone = done.has(s.id);
            const kat = kategoriMeta(s._kategori);
            const onerilenBirim = BIRIM_LBL(KATEGORI_BIRIM[s._kategori] || "yazi_isleri_evrak");
            const vurgulu = vurgu === s.id;
            return (
              <div key={s.id} role="row" data-sicil-satir="" data-sd-anahtar={s.id} {...(vurgulu ? { "data-vurgu": "" } : null)}
                onPointerDown={() => gez.sec(s.id)}
                onClick={() => setOnizle(s)}
                ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
                style={{ "--sd-i": Math.min(i, 14) }}>
                {gez.aktif === s.id && <Imlec gezinme={gez} kimlik="gelen" />}
                <span {...HUCRE.grid} style={{ gridArea: "no" }}><SicilNo no={`E-2026/${String(no).padStart(4, "0")}`} /></span>
                <div {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setOnizle(s); }} {...focusRing} data-press=""
                    title={`${s.label}: evrakı önizle`}
                    /* Hedef ≥24px (WCAG 2.2 §2.5.8): dolgu kadar negatif kenar boşluğu — satır
                       yüksekliği değişmez, büyüyen yalnız tıklama alanı. */
                    style={{ cursor: "pointer", padding: "3px 0", margin: "-3px 0", maxWidth: "100%", background: "transparent", border: "none", borderRadius: RAD.chip, ...TYPE.ui, fontWeight: 600, color: PAL.ink, textAlign: "left",
                      /* Çok uzun konu iki satırda kesilir (tam metin title'da + önizlemede). */
                      display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>{s.konu || s.label}</button>
                  <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, display: "flex", columnGap: SP.s, rowGap: 2, flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ color: PAL.mut2, fontWeight: 500 }}>{kat.label}</span>
                    <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>
                    <span>{s.grup || "Evrak"}</span>
                    <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 200px" }} title={s.aciklama}>{s.aciklama}</span>
                  </div>
                  {/* Önerilen birim SR'a da okunur (Görev 2 çıktısı) — havale oku ile. */}
                  <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden="true" style={{ display: "flex", color: DERIN.V }}><Icon.route width={12} height={12} /></span>
                    <span><span style={SR_ONLY}>önerilen birim: </span>{onerilenBirim}</span>
                  </div>
                </div>
                <span {...HUCRE.grid} style={{ gridArea: "sure", minWidth: 0 }}><SureHucre sla={slaMap?.[s.id]} /></span>
                <span {...HUCRE.grid} style={{ gridArea: "durum" }}>
                  {isDone ? <SessizCip renk={BANT.yesil.c} vurgulu metin="İşlendi" ikon={<Icon.check width={12} height={12} />} />
                    : <SessizCip renk={T} metin="Yeni" />}
                </span>
                {/* Tekrarlanan satır eylemi hayalet — ekranın tek primary'si başlıktaki "Yeni evrak yükle". */}
                <span {...HUCRE.grid} style={{ gridArea: "eylem", justifySelf: "end" }}>
                  <button type="button" data-sd-eylem="" data-press=""
                    onClick={(e) => { e.stopPropagation(); onProcess(s); }} disabled={busy} aria-label={`${s.label} evrakını işle`}>
                    {isDone ? "Yeniden işle" : "İşle"} <Icon.arrow width={14} height={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </DefterYuzey>
      )}

      <DefterNotu ikon={<Icon.info width={14} height={14} />}>
        Gelen evrak kuyruğu örnek evraklarla hazır gelir. <strong style={{ color: PAL.ink2, fontWeight: 600 }}>EBYS / KEP</strong> entegrasyonunda gelen evrak otomatik düşer; güven skoru, sisteme geliş ve son işlem tarihleri işleme anında oluşur.
      </DefterNotu>

      {/* Salt-okunur evrak önizleme (satır tıklaması) — "önce oku, sonra işle" akışı;
          İşle birincil eylem olarak modal içinde de sunulur. */}
      <BelgeModal acik={!!onizle} baslik="Evrak önizleme" dosyaAdi={onizle?.label || ""}
        metin={onizle?.text || ""} onKapat={() => setOnizle(null)}
        eylemler={onizle ? (
          <ScrimDugme onClick={() => { const sec = onizle; setOnizle(null); onProcess(sec); }} disabled={busy} title="Bu evrakı işle">
            {done.has(onizle.id) ? "Yeniden işle" : "İşle"}
          </ScrimDugme>
        ) : null} />
    </ViewWrap>
  );
}
