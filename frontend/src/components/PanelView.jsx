/* PanelView — "SABAH BRİFİ": amirin masasına bırakılmış tek sayfalık brif (Antet & Damga).
   Düzen (tur 8, 12 kolonluk ızgara):
   · ANTET  başlık "Sabah Brifi" + gün künyesi; sağda 3 satırlık Sayı/Tarih/Konu künyesi (PanelParca).
   · R1  KAHRAMAN (8 kol; ≥1760 px'te 9) ∥ SÜRE TAKVİMİ (4; 3) — aynı `kuyrukSla`. Beş hâl:
         dolu · SLA yolda (iskelet, react-query durumundan) · SLA hatası · SLA BOŞ (süre tanımlı
         evrak yok — sakin kahraman) · kuyruk boş. Defter satırı ↔ takvim günü ↔ cetvel iğnesi
         "mürekkep köprüsü" ile birlikte vurgulanır (paylaşılan `odak`).
   · R2  AKIŞ NABZI — hücre bazlı kaynak durumu (gelen kuyruğu hiç iskelete girmez).
   · R3  GÖZLEM — iki sütun ortak taban çizgisinde biter (son kartlar esner, eylemleri dibe).
   · R4  PARAF kapanışı + yazdırma (print CSS: brif A4'e dökülür, kabuk gizlenir).
   Kaynak durumu (bekliyor/ok/bayat/yok) panelKaynak'tan: boş dizi "yükleniyor" sayılmaz. */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ViewWrap, Btn, EmptyState, Icon, SP } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL } from "./result-cards.jsx";
import SureTakvimi, { TakvimIskelet } from "./SureTakvimi.jsx";
import KahramanBrif, { BrifIskelet, BrifHata, SureYokBrif, PANEL_KF, giris } from "./PanelBrif.jsx";
import AkisKarti, { kuyrukCetelesi } from "./PanelAkis.jsx";
import IslemSuresiKart from "./PanelSure.jsx";
import { DagilimYuzeyi, BirimGecikmeKart, SonIslemlerFeed, GozlemDurum, GozlemAntet } from "./PanelGozlem.jsx";
import { AntetKunye, ParafKapanis, GozlemBos, GozlemDusenDefter, BirlesikHata } from "./PanelParca.jsx";
import { usePanelKaynaklari, kaynakHazir } from "./panelKaynak.js";
import { kaynakOzeti, parafOrani } from "../lib/panelBrifSaf.js";
import { useDarEkran, useMedyaSorgusu } from "../hooks/useMedya.js";
import SureRaporModal from "./SureRaporModal.jsx";
import { gunlukSeri } from "../lib/gunlukSeri.js";
import { tumKaynaklarYok } from "../lib/kabukSicil.js";
import { sicilGrupla } from "../lib/sicilVaryant.js";

/* Görsel olarak gizli, ekran okuyucuya açık durum metni (iskeletler aria-hidden). */
const SR_YALNIZ = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

/* Yazdırma — brif A4 tek sütuna dökülür; kabuk (kenar çubuğu, asistan tetiği) ve etkileşim
   öğeleri (düğmeler) gizlenir. Damga siyah-beyaz basılır. Renk token'ları aynen kalır (hex yok). */
const YAZDIR_CSS = `
@media print{
  @page{size:A4;margin:12mm}
  [data-ray],[data-asistan-tetik],[data-yazdirma-gizle]{display:none!important}
  [data-panel-izgara]{display:block!important}
  [data-panel-izgara]>*{margin-bottom:12px;break-inside:avoid}
  [data-panel-izgara] button{box-shadow:none!important}
  [data-damga]{filter:grayscale(1)!important}
  [data-paraf-harf]{fill:currentColor!important;stroke-dashoffset:0!important}
  *{animation:none!important;transition:none!important}
}`;

/* Kuyruk + geçmiş özeti (dağılım, birim gecikmesi + havale adedi, ortalama tür güveni). */
function ozetHesapla(history) {
  const risk = { yesil: 0, sari: 0, kirmizi: 0 };
  const turler = {}, birimler = {}, birimGecikme = {};
  const guvenler = [];
  for (const h of history) {
    if (risk[h.bant] != null) risk[h.bant]++;
    const t = EVRAK_TR(h.evrak_turu); turler[t] = (turler[t] || 0) + 1;
    if (h.hedef_birim) { const b = BIRIM_LBL(h.hedef_birim); birimler[b] = (birimler[b] || 0) + 1; }
    const durum = h.result?.sla_metadata?.durum;
    if ((durum === "GECIKMIS" || durum === "KRITIK") && h.hedef_birim) {
      const b = BIRIM_LBL(h.hedef_birim);
      const e = birimGecikme[b] || { gecikmis: 0, kritik: 0 };
      birimGecikme[b] = durum === "GECIKMIS" ? { ...e, gecikmis: e.gecikmis + 1 } : { ...e, kritik: e.kritik + 1 };
    }
    const g = h.result?.tur_confidence;
    if (Number.isFinite(g) && g > 0) guvenler.push(g);
  }
  return {
    risk,
    turList: Object.entries(turler).sort((a, b) => b[1] - a[1]).slice(0, 4),
    birimList: Object.entries(birimler).sort((a, b) => b[1] - a[1]).slice(0, 4),
    // Tur 8: birim satırı havale adedini de taşır (Dağılım ile Birim Gecikme aynı birim ekseni).
    birimGecikmeList: Object.entries(birimGecikme)
      .sort((a, b) => (b[1].gecikmis - a[1].gecikmis) || (b[1].kritik - a[1].kritik)).slice(0, 6)
      .map(([b, e]) => [b, { ...e, havale: birimler[b] || 0 }]),
    ortGuven: guvenler.length ? Math.round((guvenler.reduce((a, x) => a + x, 0) / guvenler.length) * 100) : null,
  };
}

/* Akış hücreleri — her hücre KENDİ kaynağının durumunu taşır (tur 8: giden 500 dönerken
   "0 · bugün henüz yok" basılıyordu). Canlı oturumda bilinen değer varsa durum "ok". */
function akisHucreleri({ n, inboxCount, taslakN, paraf, giden, seriler, git, kaynak, kuyruk }) {
  const islemD = n > 0 ? "ok" : kaynak.islemler;
  const gidenD = giden > 0 ? "ok" : kaynak.giden;
  return [
    { label: "İşlenen evrak", value: n, icon: <Icon.doc />, onClick: git.islenen, gunluk: seriler.islenen, durum: islemD, iyiYon: "artis",
      ariaLabel: `Son 7 günde ${seriler.islenen.son7N}, toplam ${n} işlenen evrak — arşivi aç` },
    { label: "Gelen evrak", value: inboxCount, icon: <Icon.inbox />, onClick: git.gelen, kuyruk, durum: "ok",
      ariaLabel: `${inboxCount} gelen evrak kuyrukta — kuyruğu aç` },
    /* Tur 8 jüri: "Üretilen taslak 33" İşlenen'in 33'ünü tekrarlıyordu → hücre KARAR durumunu
       anlatır: rakam karar bekleyen, görsel paraf şeridi (onay_durumu'ndan). */
    { label: "Karar bekleyen taslak", value: paraf.bekliyor, paraf, icon: <Icon.edit />, onClick: git.taslak, durum: islemD,
      ariaLabel: `${taslakN} taslağın ${paraf.bekliyor} tanesi karar bekliyor, ${paraf.onaylandi} onaylandı, ${paraf.reddedildi} reddedildi — Taslaklar'ı aç` },
    { label: "Gönderilen evrak", value: giden, icon: <Icon.send />, onClick: git.giden, gunluk: seriler.giden, durum: gidenD, iyiYon: "artis",
      ariaLabel: `Son 7 günde ${seriler.giden.son7N}, toplam ${giden} gönderilen evrak — Giden arşivini aç` },
  ];
}

/* Kahraman + takvim satırı — beş hâl. `kol` = [kahraman, takvim] kolon sayısı. */
function UstSira({ sla, kuyrukSla, inboxCount, onGoInbox, onIsle, onSlaYeniden, span, kol, odak, onOdak, hata }) {
  const [k1, k2] = kol;
  if (kuyrukSla.length > 0) {
    return (
      <>
        <div style={{ ...span(k1), alignSelf: "stretch", ...giris(60) }}>
          <KahramanBrif kuyrukSla={kuyrukSla} kuyrukN={inboxCount} onGoInbox={onGoInbox} onIsle={onIsle} odak={odak} onOdak={onOdak} />
        </div>
        <div style={{ ...span(k2), alignSelf: "stretch", ...giris(180) }}><SureTakvimi kuyrukSla={kuyrukSla} odak={odak} onOdak={onOdak} /></div>
      </>
    );
  }
  if (inboxCount === 0) return null;
  if (sla === "bekliyor") {
    return (
      <>
        <div style={{ ...span(k1), alignSelf: "stretch" }}>
          <span role="status" style={SR_YALNIZ}>Yasal süre özeti yükleniyor</span>
          <BrifIskelet />
        </div>
        <div style={{ ...span(k2), alignSelf: "stretch" }}><TakvimIskelet /></div>
      </>
    );
  }
  if (sla === "yok") {
    /* ≥2 kaynak düştüyse kahraman yuvası BİRLEŞİK fişe kalır (tek fiş, tek "Yeniden dene"). */
    if (hata.birlesik) return <div style={{ ...span(12), ...giris(60) }}><BirlesikHata {...hata.fis} birincil /></div>;
    return <div style={{ ...span(12), ...giris(60) }}><BrifHata kuyrukN={inboxCount} onGoInbox={onGoInbox} onYeniden={onSlaYeniden} saglamCumle={hata.ozet.saglamCumle} /></div>;
  }
  return <div style={{ ...span(12), ...giris(60) }}><SureYokBrif kuyrukN={inboxCount} onGoInbox={onGoInbox} /></div>;
}

/* Gözlem kuşağı — dört hâl: yükleniyor · hata · boş · dolu. Dolu hâlde iki sütun ORTAK TABAN
   çizgisinde biter (tur 8 jüri): sütunlar gerilir, her sütunun son kartı esner; esneyen kartın
   eylemi (Detay raporu / Tüm işlenen) dibe yaslanır — boşluk kartın içinde, eylemin üstünde. */
function GozlemKusak({ n, history, ozet, islemDurum, span, genis, dar, kol, hata, onGoInbox, onGoIslenen, onRapor, onYeniden, onUpload }) {
  const [k1, k2] = kol;
  if (n === 0 && (islemDurum === "bekliyor" || islemDurum === "yok")) {
    /* Birleşik fiş kahraman yuvasında DEĞİLSE (SLA sağlam) burada basılır — yine tek fiş. */
    if (islemDurum === "yok" && hata.birlesik && !hata.ustte) return <div style={span(12)}><BirlesikHata {...hata.fis} birincil={false} /></div>;
    if (islemDurum === "yok" && hata.birlesik) return <GozlemDusenDefter span={span} />;
    return <GozlemDurum yukleniyor={islemDurum === "bekliyor"} span={span} genis={genis} kol={kol} onYeniden={onYeniden}
      saglamCumle={hata.ozet.saglamCumle} birlesik={hata.birlesik} />;
  }
  if (n === 0) return <GozlemBos span={span} onGoInbox={onGoInbox} onUpload={onUpload} />;
  const sutun = { alignSelf: genis ? "stretch" : "start", display: "flex", flexDirection: "column", gap: SP.l + 4 };
  const esnek = { flex: 1, display: "flex", flexDirection: "column" };
  return (
    <>
      <GozlemAntet sag={`${n} İŞLEM`} giris={giris(380)} />
      <div style={{ ...span(k1), ...sutun }}>
        <div style={giris(420)}><DagilimYuzeyi n={n} {...ozet} genis={genis} /></div>
        <div style={{ ...esnek, ...giris(500) }}><SonIslemlerFeed history={history} n={n} onGoIslenen={onGoIslenen} /></div>
      </div>
      <div style={{ ...span(k2), ...sutun }}>
        <div style={giris(460)}><BirimGecikmeKart rows={ozet.birimGecikmeList} dar={dar} onGoIslenen={onGoIslenen} /></div>
        <div style={{ ...esnek, ...giris(540) }}><IslemSuresiKart history={history} onRapor={onRapor} /></div>
      </div>
    </>
  );
}

/* Brif verisi — sicil birimiyle gruplanmış geçmiş + türetilen sayaçlar/seriler. */
function useBrifVerisi(hamGecmis, outbox) {
  // Tek sayaç kaynağı: İşlenen sicili ile AYNI kayıt birimi (sicilGrupla).
  const history = useMemo(() => sicilGrupla(hamGecmis).map((h) => (h.hedef_birim || !h.hedef_birim_adi ? h
    : { ...h, hedef_birim: h.hedef_birim_adi })), [hamGecmis]);
  const gonderilenler = useMemo(() => outbox.filter((o) => o.durum === "gonderildi"), [outbox]);
  const taslaklilar = useMemo(() => history.filter((h) => h.result?.yazi_taslak_md), [history]);
  const ozet = useMemo(() => ozetHesapla(history), [history]);
  // Outbox'ta zaman alanı gonderim_tarihi'dir (ts değil).
  const seriler = useMemo(() => ({
    islenen: gunlukSeri(history.map((h) => h.ts)),
    taslak: gunlukSeri(taslaklilar.map((h) => h.ts)),
    giden: gunlukSeri(gonderilenler.map((o) => o.gonderim_tarihi)),
  }), [history, taslaklilar, gonderilenler]);
  return { history, n: history.length, gonderilenler, taslaklilar, ozet, seriler };
}

/* İmza satırındaki işlem sayısı — bilinmeyen değer SIFIR diye beyan edilmez. */
function islemKunye(n, durum) {
  if (n > 0) return String(n);
  if (durum === "bekliyor") return "YÜKLENİYOR";
  return durum === "yok" ? "ALINAMADI" : "0";
}

/* Antet alt satırı — gün + masadaki iş (jüri: "Hoş geldiniz" ürün iskeleti dilindeydi). */
function gunKunyesi(inboxCount) {
  const gun = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  return `${gun} · ${inboxCount} evrak masada`;
}

/* DashboardApp bayrakları önbellek durumuyla birleşir: prop hata derken önbellek boşsa "yok". */
const birlesik = (onbellek, hata) => (hata && onbellek === "bekliyor" ? "yok" : onbellek);

/* Kuyruk + geçmiş tamamen boş — tek davet: yeni evrak yükle. */
function PanelBos({ baslik, kunye, onUpload }) {
  return (
    <ViewWrap id="panel-h" title={baslik} sub={gunKunyesi(0)} kunye={kunye}>
      <EmptyState icon={<Icon.chart />} title="Kuyruk Boş"
        sub="Yeni bir belge yükleyerek başlayın — işlenen her evrak burada özetlenir."
        actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]} />
    </ViewWrap>
  );
}

export default function PanelView({ history: hamGecmis = [], outbox = [], inboxCount = 0, kuyrukSla = [], slaHatasi = false, onGoInbox, onIsle = () => {}, onGoIslenen = () => {}, onGoGiden = () => {}, onGoTaslaklar = null, onUpload, user, gecmisHatasi = false, onSlaYeniden, onGecmisYeniden }) {
  const genis = useMedyaSorgusu("(min-width: 1024px)");
  const cokGenis = useMedyaSorgusu("(min-width: 1760px)");
  const dar = useDarEkran();
  const queryClient = useQueryClient();
  const [raporAcik, setRaporAcik] = useState(false);
  const [odak, setOdak] = useState(null);
  const [hazirlandi] = useState(() => Date.now());
  const onb = usePanelKaynaklari();
  const kaynak = { sla: birlesik(onb.sla, slaHatasi), islemler: birlesik(onb.islemler, gecmisHatasi), giden: onb.giden };
  const { history, n, gonderilenler, ozet, seriler } = useBrifVerisi(hamGecmis, outbox);
  /* Yeniden dene — DashboardApp prop verirse o, yoksa sorgunun kendisi tazelenir. */
  const slaYeniden = onSlaYeniden || (() => queryClient.refetchQueries({ queryKey: ["sla-onizleme"] }));
  const gecmisYeniden = onGecmisYeniden || (() => queryClient.refetchQueries({ queryKey: ["islemler"] }));
  const span = (kol) => ({ gridColumn: genis ? `span ${kol}` : "1 / -1", minWidth: 0 });
  /* Tur 8 jüri: üst sıra 9/3'e geçerken Gözlem 8/4'te kalıyordu (126 px dikey hiza kırığı) —
     tüm sıralar TEK kolon çiftine kilitli. */
  const kol = cokGenis ? [9, 3] : [8, 4];
  /* Hata cümleleri ve birleşik fiş GERÇEK kaynak durumundan (kaynakOzeti). */
  const kOzet = kaynakOzeti(kaynak, inboxCount);
  const tumYeniden = () => queryClient.refetchQueries({ predicate: (q) => ["sla-onizleme", "islemler", "giden-evrak"].includes(q.queryKey[0]) });
  const hata = { ozet: kOzet, birlesik: kOzet.dusen.length >= 2, ustte: kaynak.sla === "yok" && inboxCount > 0 && kuyrukSla.length === 0,
    fis: { ozet: kOzet, onYeniden: tumYeniden, onGoInbox, kuyrukN: inboxCount, bantVar: tumKaynaklarYok(kaynak) } };
  const brifHazir = n > 0 || kaynakHazir(kaynak.islemler);
  const kunye = "Panel · sabah brifingi";
  const baslik = "Sabah Brifi";

  if (n === 0 && inboxCount === 0 && kuyrukSla.length === 0 && kaynak.islemler !== "bekliyor" && kaynak.islemler !== "yok") {
    return <PanelBos baslik={baslik} kunye={kunye} onUpload={onUpload} />;
  }

  const git = { islenen: onGoIslenen, gelen: () => onGoInbox(), taslak: onGoTaslaklar || onGoIslenen, giden: onGoGiden };
  /* Paraf sayımı HAM geçmişten (kabuk taslak sayacı da sicil gruplaması öncesi listeyi sayar). */
  const paraf = parafOrani(hamGecmis.filter((h) => h.result?.yazi_taslak_md));
  const hucreler = akisHucreleri({ n, inboxCount, taslakN: paraf.toplam, paraf, giden: gonderilenler.length, seriler, git, kaynak,
    kuyruk: kuyrukCetelesi(kuyrukSla, inboxCount, kaynak.sla === "ok" || kaynak.sla === "bayat") });
  const gidenBilinen = gonderilenler.length > 0 || kaynak.giden === "ok" || kaynak.giden === "bayat";
  const kunyeBlok = genis ? (
    <AntetKunye kaynaklar={kaynak} inboxCount={inboxCount} kuyrukSla={kuyrukSla} islemN={islemKunye(n, kaynak.islemler)}
      gidenN={gidenBilinen ? String(gonderilenler.length) : "—"} />
  ) : null;

  return (
    <ViewWrap id="panel-h" title={baslik} sub={gunKunyesi(inboxCount)} kunye={kunye} actions={kunyeBlok}>
      <style>{PANEL_KF + YAZDIR_CSS}</style>
      {/* Açılış koreografisi: kahraman (60ms) → takvim mührü (180ms) → akış (280ms) → gözlem. */}
      <div data-panel-izgara="" style={{ display: "grid", gridTemplateColumns: genis ? "repeat(12, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: SP.l + 4, alignItems: "start" }}>
        <UstSira sla={kaynak.sla} kuyrukSla={kuyrukSla} inboxCount={inboxCount} onGoInbox={onGoInbox} onIsle={onIsle} onSlaYeniden={slaYeniden}
          span={span} kol={kol} odak={odak} onOdak={genis ? setOdak : null} hata={hata} />
        {hata.birlesik && !hata.ustte && n > 0 && <div style={span(12)}><BirlesikHata {...hata.fis} birincil={false} /></div>}
        <div style={{ ...span(12), ...giris(kuyrukSla.length ? 280 : 60) }}>
          <AkisKarti hucreler={hucreler} kolon={dar || !genis ? 2 : 4} />
        </div>
        <GozlemKusak n={n} history={history} ozet={ozet} islemDurum={kaynak.islemler} span={span} genis={genis} dar={dar} kol={kol} hata={hata}
          onGoInbox={onGoInbox} onGoIslenen={onGoIslenen} onRapor={() => setRaporAcik(true)} onYeniden={gecmisYeniden} onUpload={onUpload} />
        <ParafKapanis hazirlandi={hazirlandi} kuyrukN={inboxCount} islemN={islemKunye(n, kaynak.islemler)} user={user} dar={dar}
          hazir={brifHazir} kaynakIlerleme={`${kOzet.hazirN}/${kOzet.toplam} KAYNAK`} />
      </div>
      <SureRaporModal acik={raporAcik} onKapat={() => setRaporAcik(false)} history={history} />
    </ViewWrap>
  );
}
