/* PanelView — "SABAH BRİFİ": amirin masasına bırakılmış tek sayfalık brif (Antet & Damga).
   Güncel düzen (tur 6, 12 kolonluk ızgara):
   · R1  KAHRAMAN (8 kol, PanelBrif) ∥ SÜRE TAKVİMİ (4 kol, SureTakvimi) — ikisi de aynı
         `kuyrukSla` dizisinden; brif ekranın tek "şimdi davran" sinyali ve TEK primary'si.
         SLA yoldayken iskeletler aynı yuvaları tutar (CLS); SLA hatasında kahraman yuvası
         BrifHata ile dolar (manşet = kuyruk, primary "Kuyruğu aç", ikincil "Yeniden dene").
   · R2  AKIŞ NABZI (12 kol, PanelAkis) — defter sayfa sonu "nakli yekûn" satırı + 7 günlük
         çetele. Geçmiş hatasında da durur; geçmişe bağlı sayılar "—/alınamadı" der.
   · R3  GÖZLEM (PanelGozlem): 8 kol Dağılım + Son İşlemler (ızgaralı defter) ∥ 4 kol Birim
         gecikme + İşlem Süresi (PanelSure, kronometre şeridi). Sütunlar bağımsız, DOĞAL boyda
         akar (kısa kart gerilip içi boş yüzey bırakmaz).
   · R4  PARAF kapanışı — antet çift çizgisinin aynası: brifin hazırlanma künyesi + paraf
         kutusu + "Brifi yazdır" (print CSS: brif A4'e dökülür, kabuk gizlenir).
   Tüm sayılar gerçek veriden (oturum + DB reconcile). */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { ViewWrap, Btn, EmptyState, Icon, MONO, SANS, TYPE, TNUM, SP, RAD, PAL } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL } from "./result-cards.jsx";
import SureTakvimi, { TakvimIskelet } from "./SureTakvimi.jsx";
import KahramanBrif, { BrifIskelet, BrifHata, PANEL_KF, giris } from "./PanelBrif.jsx";
import AkisKarti from "./PanelAkis.jsx";
import IslemSuresiKart from "./PanelSure.jsx";
import { DagilimYuzeyi, BirimGecikmeKart, SonIslemlerFeed, GozlemDurum, GozlemAntet } from "./PanelGozlem.jsx";
import { useDarEkran, useMedyaSorgusu } from "../hooks/useMedya.js";
import SureRaporModal from "./SureRaporModal.jsx";
import { adBuyut } from "../lib/trMetin.js";
import { gunlukSeri } from "../lib/gunlukSeri.js";
import { sicilGrupla } from "../lib/sicilVaryant.js";
import { noktaliTamTarih, parafHarf } from "../lib/panelBrifSaf.js";

/* Görsel olarak gizli, ekran okuyucuya açık durum metni (iskeletler aria-hidden). */
const SR_YALNIZ = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

/* Yazdırma — brif A4 tek sütuna dökülür; kabuk (kenar çubuğu, asistan tetiği) ve etkileşim
   öğeleri (düğmeler) gizlenir. Renk token'ları aynen kalır (hex yok). */
const YAZDIR_CSS = `
@media print{
  @page{size:A4;margin:12mm}
  [data-ray],[data-asistan-tetik],[data-yazdirma-gizle]{display:none!important}
  [data-panel-izgara]{display:block!important}
  [data-panel-izgara]>*{margin-bottom:12px;break-inside:avoid}
  [data-panel-izgara] button{box-shadow:none!important}
  *{animation:none!important;transition:none!important}
}`;

/* Kuyruk + geçmiş özeti (dağılım, birim gecikmesi, ortalama tür güveni). */
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
    birimGecikmeList: Object.entries(birimGecikme)
      .sort((a, b) => (b[1].gecikmis - a[1].gecikmis) || (b[1].kritik - a[1].kritik)).slice(0, 6),
    ortGuven: guvenler.length ? Math.round((guvenler.reduce((a, x) => a + x, 0) / guvenler.length) * 100) : null,
  };
}

/* Paraf kapanışı — resmî evrakın imza bloğu ritmi: sayfanın başı (antet) ve sonu belli. */
function ParafKapanis({ hazirlandi, kuyrukN, islemN, user, dar }) {
  return (
    <footer style={{ gridColumn: "1 / -1", marginTop: SP.xl }}>
      <div aria-hidden="true" style={{ height: 5, borderTop: `1px solid ${PAL.ink}`, borderBottom: `2px solid ${PAL.ink}`, opacity: 0.9 }} />
      <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", marginTop: SP.m }}>
        <div style={{ minWidth: 0, flex: "1 1 320px", ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
          <span style={{ display: "block" }}>BRİF HAZIRLANDI {noktaliTamTarih(hazirlandi)}</span>
          <span style={{ display: "block", marginTop: 2 }}>VERİ · KUYRUK {kuyrukN} · İŞLEM {islemN} · KAYNAK: OTURUM + KAYITLI GEÇMİŞ</span>
        </div>
        <span data-yazdirma-gizle="">
          <Btn onClick={() => window.print()} ariaLabel="Sabah brifini yazdır"><Printer size={15} strokeWidth={1.75} aria-hidden="true" /> Brifi yazdır</Btn>
        </span>
        <div aria-label={`Paraf: ${adBuyut(user?.ad_soyad) || "Memur"}`} role="img"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: dar ? 64 : 76, height: 56, padding: "4px 0",
            border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.ctl }}>
          <span style={{ fontFamily: MONO, fontSize: 9, lineHeight: "10px", letterSpacing: ".1em", color: PAL.mut3 }}>PARAF</span>
          <span style={{ fontFamily: SANS, fontStyle: "italic", fontSize: 20, lineHeight: "24px", fontWeight: 600, color: PAL.ink2, letterSpacing: "-.02em" }}>
            {parafHarf(user?.ad_soyad)}
          </span>
        </div>
      </div>
    </footer>
  );
}

/* Akış hücreleri — kart eşlemesi kurgu ayrımını izler; aria-label sayıyı da taşır. */
function akisHucreleri({ n, inboxCount, taslakN, giden, seriler, git }) {
  return [
    { label: "İşlenen evrak", value: n, icon: <Icon.doc />, onClick: git.islenen, ariaLabel: `${n} işlenen evrak — arşivi aç`, gunluk: seriler.islenen, gecmis: true },
    { label: "Gelen evrak", value: inboxCount, icon: <Icon.inbox />, onClick: git.gelen, ariaLabel: `${inboxCount} gelen evrak — kuyruğu aç`, gunluk: null },
    { label: "Üretilen taslak", value: taslakN, icon: <Icon.edit />, onClick: git.taslak, ariaLabel: `${taslakN} üretilen taslak — Taslaklar'ı aç`, gunluk: seriler.taslak, gecmis: true },
    { label: "Gönderilen evrak", value: giden, icon: <Icon.send />, onClick: git.giden, ariaLabel: `${giden} gönderilen evrak — Giden arşivini aç`, gunluk: seriler.giden },
  ];
}

/* Kahraman + takvim satırı — dört hâl: dolu · SLA yolda (iskelet) · SLA hatası · yok. */
function UstSira({ takvimVar, slaBekleniyor, slaHata, kuyrukSla, inboxCount, onGoInbox, onIsle, onSlaYeniden, span }) {
  if (takvimVar) {
    return (
      <>
        <div style={{ ...span(8), alignSelf: "stretch", ...giris(60) }}><KahramanBrif kuyrukSla={kuyrukSla} onGoInbox={onGoInbox} onIsle={onIsle} /></div>
        <div style={{ ...span(4), alignSelf: "stretch", ...giris(180) }}><SureTakvimi kuyrukSla={kuyrukSla} /></div>
      </>
    );
  }
  if (slaBekleniyor) {
    return (
      <>
        <div style={{ ...span(8), alignSelf: "stretch" }}>
          <span role="status" style={SR_YALNIZ}>Yasal süre özeti yükleniyor</span>
          <BrifIskelet />
        </div>
        <div style={{ ...span(4), alignSelf: "stretch" }}><TakvimIskelet /></div>
      </>
    );
  }
  if (slaHata) {
    return <div style={{ ...span(12), ...giris(60) }}><BrifHata kuyrukN={inboxCount} onGoInbox={onGoInbox} onYeniden={onSlaYeniden} /></div>;
  }
  return null;
}

/* Gözlem boş hâli (geçmiş yok, hata yok) — kuyruk dolu olduğu için tam ekran boş durum
   değil, kuşağın yerinde tek satırlık dürüst künye; nabız kartı üstte sayıları taşımaya devam eder. */
function GozlemBos({ span, onGoInbox }) {
  return (
    <>
      <GozlemAntet sag="0 İŞLEM" giris={giris(360)} />
      <div style={{ ...span(12), display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", padding: `${SP.l}px ${SP.l + 4}px`,
        background: PAL.surf, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.card, ...giris(380) }}>
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3 }}><Icon.chart width={18} height={18} /></span>
        <span style={{ minWidth: 0, flex: "1 1 280px" }}>
          <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Henüz evrak işlenmedi</span>
          <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2, textWrap: "pretty" }}>
            Kuyruktan bir evrak işlediğinizde dağılım, birim gecikmesi ve süre özetleri burada oluşur.
          </span>
        </span>
        <Btn onClick={() => onGoInbox()}><Icon.inbox /> Gelen evrakı aç</Btn>
      </div>
    </>
  );
}

/* Gözlem kuşağı — dört hâl: yükleniyor · hata · boş · dolu. Dolu hâlde iki bağımsız sütun
   (8 + 4) DOĞAL boyunda durur: kısa sütunun son kartı uzun komşusuna gerilip içi boş
   yüzey bırakmaz (tur 6 denetimi: İşlem Süresi altında ~170 px boş kart). */
function GozlemKusak({ n, history, ozet, gecmisYukleniyor, gecmisHatasi, span, genis, dar, onGoInbox, onGoIslenen, onRapor, onYeniden }) {
  if (n === 0 && (gecmisYukleniyor || gecmisHatasi)) {
    return <GozlemDurum yukleniyor={gecmisYukleniyor} span={span} genis={genis} onYeniden={onYeniden} />;
  }
  if (n === 0) return <GozlemBos span={span} onGoInbox={onGoInbox} />;
  const sutun = { alignSelf: "start", display: "flex", flexDirection: "column", gap: SP.l + 4 };
  return (
    <>
      <GozlemAntet sag={`${n} İŞLEM`} giris={giris(380)} />
      <div style={{ ...span(8), ...sutun }}>
        <div style={giris(420)}><DagilimYuzeyi n={n} {...ozet} genis={genis} /></div>
        <div style={giris(500)}><SonIslemlerFeed history={history} n={n} onGoIslenen={onGoIslenen} /></div>
      </div>
      <div style={{ ...span(4), ...sutun }}>
        <div style={giris(460)}><BirimGecikmeKart rows={ozet.birimGecikmeList} dar={dar} /></div>
        <div style={giris(540)}><IslemSuresiKart history={history} onRapor={onRapor} /></div>
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
function islemKunye(n, yukleniyor, hata) {
  if (n > 0) return String(n);
  if (yukleniyor) return "YÜKLENİYOR";
  return hata ? "ALINAMADI" : "0";
}

export default function PanelView({ history: hamGecmis = [], outbox = [], inboxCount = 0, kuyrukSla = [], slaHatasi = false, onGoInbox, onIsle = () => {}, onGoIslenen = () => {}, onGoGiden = () => {}, onGoTaslaklar = null, onUpload, user, gecmisYukleniyor = false, gecmisHatasi = false, onSlaYeniden, onGecmisYeniden }) {
  const genis = useMedyaSorgusu("(min-width: 1024px)");
  const dar = useDarEkran();
  const queryClient = useQueryClient();
  const [raporAcik, setRaporAcik] = useState(false);
  const [hazirlandi] = useState(() => Date.now());
  const { history, n, gonderilenler, taslaklilar, ozet, seriler } = useBrifVerisi(hamGecmis, outbox);
  /* Yeniden dene — DashboardApp prop verirse o, yoksa sorgunun kendisi tazelenir. */
  const slaYeniden = onSlaYeniden || (() => queryClient.refetchQueries({ queryKey: ["sla-onizleme"] }));
  const gecmisYeniden = onGecmisYeniden || (() => queryClient.refetchQueries({ queryKey: ["islemler"] }));
  const manset = `Hoş geldiniz, ${adBuyut(user?.ad_soyad) || "Memur"}`;
  const span = (kol) => ({ gridColumn: genis ? `span ${kol}` : "1 / -1", minWidth: 0 });
  const takvimVar = kuyrukSla.length > 0;
  /* SLA yolda: kuyruk dolu, SLA boş, hata yok → brif + takvim yuvaları iskeletle ayrılır. */
  const slaBekleniyor = !takvimVar && !slaHatasi && inboxCount > 0;
  const kunye = "Sabah brifingi";

  if (n === 0 && inboxCount === 0 && kuyrukSla.length === 0 && !gecmisYukleniyor && !gecmisHatasi) {
    return (
      <ViewWrap id="panel-h" title="Panel" sub={manset} kunye={kunye}>
        <EmptyState icon={<Icon.chart />} title="Kuyruk Boş"
          sub="Yeni bir belge yükleyerek başlayın — işlenen her evrak burada özetlenir."
          actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]} />
      </ViewWrap>
    );
  }

  const git = { islenen: onGoIslenen, gelen: () => onGoInbox(), taslak: onGoTaslaklar || onGoIslenen, giden: onGoGiden };
  const hucreler = akisHucreleri({ n, inboxCount, taslakN: taslaklilar.length, giden: gonderilenler.length, seriler, git });
  const gecmisHata = n === 0 && gecmisHatasi && !gecmisYukleniyor;

  return (
    <ViewWrap id="panel-h" title="Panel" sub={manset} kunye={kunye}>
      <style>{PANEL_KF + YAZDIR_CSS}</style>
      {/* Açılış koreografisi: kahraman (60ms) → takvim mührü (180ms) → akış (280ms) → gözlem. */}
      <div data-panel-izgara="" style={{ display: "grid", gridTemplateColumns: genis ? "repeat(12, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: SP.l + 4, alignItems: "start" }}>
        <UstSira takvimVar={takvimVar} slaBekleniyor={slaBekleniyor} slaHata={!takvimVar && slaHatasi} kuyrukSla={kuyrukSla} inboxCount={inboxCount}
          onGoInbox={onGoInbox} onIsle={onIsle} onSlaYeniden={slaYeniden} span={span} />
        <div style={{ ...span(12), ...giris(takvimVar ? 280 : 60) }}>
          <AkisKarti hucreler={hucreler} kolon={dar || !genis ? 2 : 4} yukleniyor={n === 0 && gecmisYukleniyor} hata={gecmisHata} />
        </div>
        <GozlemKusak n={n} history={history} ozet={ozet} gecmisYukleniyor={gecmisYukleniyor} gecmisHatasi={gecmisHatasi} span={span} genis={genis} dar={dar}
          onGoInbox={onGoInbox} onGoIslenen={onGoIslenen} onRapor={() => setRaporAcik(true)} onYeniden={gecmisYeniden} />
        <ParafKapanis hazirlandi={hazirlandi} kuyrukN={inboxCount} islemN={islemKunye(n, gecmisYukleniyor, gecmisHatasi)} user={user} dar={dar} />
      </div>
      <SureRaporModal acik={raporAcik} onKapat={() => setRaporAcik(false)} history={history} />
    </ViewWrap>
  );
}
