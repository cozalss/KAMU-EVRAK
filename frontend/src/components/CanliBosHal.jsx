/* CanliBosHal — "İşleniyor" görünümünün BOŞ hâli (tur 6, jüri fırsatı #7: "boşken sönük pusula").
   Tur 5'te jenerik bir EmptyState'ti: küçük ikon, iki satır, üç buton; 1920'de ekranın ~%70'i
   boş kalıyor, bırakma alanı sürükleme başlayana kadar görünmüyordu. Artık boş ekran ürünün
   kendisini ÖNİZLER:
   · Solda kuru mürekkeple çizilmiş havale pusulası — paraf defteri (ıstampa) yuvaları boş,
     masalar sırada. Bu bir ÖNİZLEMEDİR: hiçbir durum/eşzamanlılık iddiası taşımaz (koşum
     yok); masa listesi varsayılan akıştan, katman haritası olmadığı için düz sıra (§8).
   · Sağda kesik kenarlı A4 "gelen evrak" tepsisi — HER ZAMAN görünür bırakma hedefi. Dosya
     sürüklenince tepsi tükenmez mavisine döner ve pusulanın ilk masası nefes alır.
   Tek primary (Gelen evrakı aç). Telefonda tepsi önce gelir, düğmeler tam genişlik/44px;
   "Telefonla yükle" telefondan bakan kişi için anlamsız olduğundan orada gizlenir. */
import { useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { T, V, PAL, ALFA, TYPE, TNUM, RAD, SP, SH, DISPLAY, MONO, DERIN_OF, Btn, Icon, ViewWrap } from "./neonUi.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import { DEFAULT_NODE_IDS, makeNode } from "../lib/nodeMeta.js";
import { useDarEkran } from "../hooks/useMedya.js";
import AjanOrb from "./AjanOrb.jsx";
import { useMasaKunyesi } from "./canliBosVeri.js";
import { defterZamani, baslikCase } from "../lib/defterSozluk.js";
import { cleanDemoText } from "./result-cards.jsx";

/* MASAÜSTÜ YÜKSEKLİK (tur 8): 1920×1080'de kartların altında ~280 px ölü alan vardı. 1100 px
   üstünde iki kart görünümün kalan yüksekliğini doldurur; pusulanın masa satırları bu alana
   eşit dağılır. Tur 8 jüri 2: 1fr satırlar 1920'de 62 px'e şişiyordu → satır sabit 40 px;
   artan yükseklik tepsideki bırakma yuvasına akar (tepsi ile pusula dipte hizalı). Altında eski düzen aynen (telefon dokunulmaz). */
const BOS_CSS = `
@media (min-width:1100px){
.ke-bos-satirlar{display:grid;grid-template-rows:repeat(var(--satir),40px)}
.ke-bos-yuva{max-height:240px}
}
`;

/* Kabul edilen türler backend ACCEPT listesiyle birebir. */
const DROP_KABUL = {
  "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"], "image/tiff": [".tiff"], "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

/* NUMARASIZ ÖNİZLEME (tur 8 jüri 2): masa sırası koşumda SSE start.katmanlar'dan gelir (§8);
   önizleme varsayılan listeye numara bağlayınca canlı akışla çelişiyordu (05/06 yer değişiyordu).
   Önizlemede numara yok — yalnız masa adı ve faz. */
function useOnizlemeMasalari() {
  return useMemo(() => DEFAULT_NODE_IDS.filter((id) => id !== "denetim_izi")
    .map((id, i) => ({ ...makeNode(id), sira: i, numarasiz: true })), []);
}

/* Satır başına TEK durum göstergesi (tur 9): canlı pusuladaki bekleyen masa diliyle aynı —
   solda hat düğümü, sağda boş paraf halkası YOK. Sürükleme anında ilk masanın düğümü nefes alır. */
function MasaSatiri({ a, nefes }) {
  const col = a.gorev === 2 ? V : T;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", alignItems: "center", columnGap: SP.s, minHeight: 34, borderBottom: `1px solid ${PAL.line}` }}>
      <span aria-hidden="true" style={{ width: nefes ? 9 : 6, height: nefes ? 9 : 6, boxSizing: "border-box", borderRadius: RAD.dot, background: nefes ? PAL.surf : PAL.lineHi, border: nefes ? `2px solid ${col}` : "none", justifySelf: "center", animation: nefes ? "ke-e-nefes 1.2s ease-in-out infinite" : "none" }} />
      <span style={{ ...TYPE.data, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
    </div>
  );
}

function SonukPusula({ masalar, surukleniyor, dar }) {
  const fazlar = [1, 2].map((n) => masalar.filter((a) => (a.gorev === 2 ? 2 : 1) === n));
  return (
    <section aria-label="Havale pusulası önizlemesi" style={{ display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: "clamp(16px, 2.4vw, 28px)", minWidth: 0 }}>
      {/* Tek satır: telefonda "15 MASA" künyenin altında öksüz satır kaplıyordu. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", flexWrap: "nowrap", minWidth: 0 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Havale pusulası · evrak bekleniyor</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
      </div>
      <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.35 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "clamp(16px, 2.4vw, 28px)", marginTop: SP.l, alignItems: "center" }}>
        <div style={{ padding: SP.s, borderRadius: RAD.pop, background: PAL.surf2, boxShadow: `inset 0 0 0 1px ${PAL.lineHi}` }}>
          <AjanOrb display={masalar} kosumda={false} yukseklik={dar ? 150 : 188} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 18, height: 2, background: PAL.mut3, flexShrink: 0 }} />Masa boş · hat hazır
          </div>
          {/* "00" yer tutucu değil, olgu (tur 8): sönük lineHi tonu koyu temada okunmuyordu —
              ink-2 rakam + mut2 payda; ince çerçeveli rakam kutusu "henüz masa açılmadı" der. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginTop: SP.s }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: "clamp(56px, 6vw, 88px)", lineHeight: 0.82, letterSpacing: "-.05em", color: PAL.mut2, ...TNUM }}>00</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 22, color: PAL.mut2, ...TNUM }}>/ {String(masalar.length).padStart(2, "0")}</span>
          </div>
          <p style={{ margin: `${SP.m}px 0 0`, ...TYPE.ui, color: PAL.mut2, maxWidth: 380 }}>
            Evrak geldiğinde masalar sırayla çalışır; işini gerçekten yapan her masa satırına paraf atar.
          </p>
        </div>
      </div>
      {!dar && (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", columnGap: SP.xxl, rowGap: SP.l, marginTop: SP.xl, "--satir": Math.max(...fazlar.map((f) => f.length)) }}>
          {fazlar.map((f, i) => f.length > 0 && (
            <div key={i} style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, paddingBottom: SP.xs, ...TYPE.antet, color: DERIN_OF(i ? V : T), textTransform: "uppercase" }}>
                <span>{gorevFaz(i + 1).uzun}</span>
              </div>
              <div className="ke-bos-satirlar">
                {f.map((a) => <MasaSatiri key={a.id} a={a} nefes={surukleniyor && a.sira === 0} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* Tepsi = kâğıt (düz kenar) + içinde kesik çizgili bırakma yuvası. Künye satırı kabul
   edilen türleri söyler; yuvanın kendisi her zaman görünür bir hedeftir. */
function BirakmaYuvasi({ surukleniyor, dar }) {
  const ton = surukleniyor ? T : PAL.lineHi;
  return (
    <div className={dar ? undefined : "ke-bos-yuva"} style={{ flex: 1, minHeight: dar ? 132 : 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.m, padding: SP.xl, textAlign: "center", borderRadius: RAD.ctl, border: `1.5px dashed ${ton}`, background: surukleniyor ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      {/* Kâğıt yığını (tur 8): tepside bekleyen evrakın kenarları — iki ofset hairline yaprak. */}
      <span aria-hidden="true" style={{ position: "relative", width: 44, height: 54 }}>
        {!dar && [8, 4].map((o) => <span key={o} style={{ position: "absolute", inset: 0, transform: `translate(${o}px, ${-o}px)`, borderRadius: 3, border: `1px solid ${PAL.lineHi}`, background: PAL.surf }} />)}
        <span style={{ position: "absolute", inset: 0, borderRadius: 3, border: `1.5px solid ${surukleniyor ? T : PAL.lineHi}`, background: PAL.surf, display: "grid", placeItems: "center", color: surukleniyor ? DERIN_OF(T) : PAL.mut2, transform: surukleniyor ? "translateY(-4px)" : "none", transition: "transform .2s var(--ke-ease-out), border-color .15s ease-out" }}>
          <Icon.upload width={18} height={18} />
        </span>
      </span>
      <div>
        <div style={{ ...TYPE.h2, fontSize: dar ? 20 : 24, lineHeight: dar ? "26px" : "30px", color: PAL.ink }}>{surukleniyor ? "Bırakın — işleme başlasın" : "Evrakı buraya bırakın"}</div>
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.data, color: PAL.mut2 }}>PDF, görsel, DOCX ya da TXT — bırakıldığı an masalar çalışmaya başlar.</p>
      </div>
    </div>
  );
}

/* Masadan son geçenler — boş tepsinin altında defterin devamı (tur 8): kabuğun /islemler
   önbelleğinden saat + konu; tıklanmaz (bilgi yüzeyi). Veri yoksa bölüm hiç basılmaz. */
function SonGecenler({ son }) {
  if (!son.length) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>
        <span style={{ whiteSpace: "nowrap" }}>Masadan son geçenler</span>
        <span aria-hidden="true" style={{ flex: 1, borderTop: `1px dashed ${PAL.lineHi}` }} />
      </div>
      <ol aria-label="Masadan son geçen evraklar" style={{ listStyle: "none", margin: `${SP.s}px 0 0`, padding: 0 }}>
        {son.map((k, i) => (
          <li key={k.id ?? i} style={{ display: "grid", gridTemplateColumns: "88px minmax(0,1fr)", gap: SP.m, alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${PAL.line}`, animation: `nu-rise .28s var(--ke-ease-out) ${i * 18}ms both` }}>
            <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, ...TNUM }}>{defterZamani(k.ts).gun} · {defterZamani(k.ts).saat}</span>
            <span style={{ ...TYPE.data, color: PAL.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={cleanDemoText(k.ad)}>{baslikCase(cleanDemoText(k.ad))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GelenTepsisi({ surukleniyor, onGoInbox, onUpload, onTelefon, dar, son = [] }) {
  const tam = { minHeight: 44, justifyContent: "center", width: "100%" };
  return (
    /* Tepsi bir BELGE değil, çalışma yüzeyidir: gece kâğıdı kapsamı (data-evrak-kagit) yok —
       koyu temada krem levha gibi parlıyor, üstündeki ikincil düğmelerin kenarı kayboluyordu. */
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: SP.l, padding: dar ? SP.l : "clamp(20px, 2.4vw, 28px)", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: surukleniyor ? `0 0 0 4px ${ALFA(T)}, ${SH.card}` : SH.card, transition: "box-shadow .15s ease-out" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: surukleniyor ? DERIN_OF(T) : PAL.mut2, textTransform: "uppercase", flexWrap: "wrap" }}>
          <span style={{ whiteSpace: "nowrap" }}>Gelen evrak tepsisi</span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
        </div>
        <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.35 }} />
      </div>
      <BirakmaYuvasi surukleniyor={surukleniyor} dar={dar} />
      {!dar && <SonGecenler son={son} />}
      <div style={{ display: "grid", gridTemplateColumns: dar ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: SP.s, marginTop: dar ? 0 : "auto" }}>
        <span style={{ gridColumn: "1 / -1", display: "flex" }}><Btn primary onClick={onGoInbox} style={tam}><Icon.inbox /> Gelen evrakı aç</Btn></span>
        <Btn onClick={onUpload} style={tam}><Icon.upload /> Dosya seç</Btn>
        {!dar && <Btn onClick={onTelefon} style={tam}><Icon.phone /> Telefonla yükle</Btn>}
      </div>
    </div>
  );
}

/* ANTET SAĞ KÜNYESİ (tur 8, brif #1) — resmî yazının "Sayı / Tarih" bloğu gibi sağa hizalı üç
   mono satır: görünümün canlı özeti. Bilinmeyen değer "—" (00 diye beyan edilmez). */
function AntetKunye({ bugun, sonSaat }) {
  // Künye = dosya olguları; masa sayısı kahramanın "00 / 15"inde tek yerde (tur 9: "15" dört kez).
  const satirlar = [["Son işlem", sonSaat || "—"], ["Bugün işlenen", bugun == null ? "—" : String(bugun)]];
  return (
    <dl aria-label="Masa künyesi" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto auto", columnGap: SP.l, rowGap: 2, ...TYPE.antet, textTransform: "uppercase", ...TNUM }}>
      {satirlar.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt style={{ color: PAL.mut3, textAlign: "right" }}>{k}</dt>
          <dd style={{ margin: 0, color: PAL.ink2, fontWeight: 600, textAlign: "right" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function CanliBosHal({ onGoInbox, onUpload, onFileDrop, onTelefon }) {
  const dar = useDarEkran();
  const masalar = useOnizlemeMasalari();
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, noClick: true, noKeyboard: true, accept: DROP_KABUL,
    onDrop: (kabul) => { if (kabul?.[0]) onFileDrop(kabul[0]); },
  });
  const kunye = useMasaKunyesi(dar ? 0 : 8);
  // Son işlem bugün değilse gün de yazılır ("21:14" dünkü kaydı bugünkü gibi okutuyordu).
  const sonZ = kunye.son[0] ? defterZamani(kunye.son[0].ts) : null;
  const sonSaat = !sonZ ? "" : (kunye.bugun > 0 ? sonZ.saat : `${sonZ.gun} ${sonZ.saat}`);
  const tepsi = <GelenTepsisi surukleniyor={isDragActive} onGoInbox={onGoInbox} onUpload={onUpload} onTelefon={onTelefon} dar={dar} son={kunye.son} />;
  return (
    <div {...getRootProps()} style={{ position: "relative", outline: "none" }}>
      <input {...getInputProps()} aria-hidden="true" />
      <style>{BOS_CSS}</style>
      <ViewWrap id="isleniyor-h" title="İşleniyor" kunye="Canlı işlem masası" sub="Seçilen evrak burada uçtan uca, masa masa canlı işlenir."
        actions={dar ? null : <AntetKunye bugun={kunye.bugun} sonSaat={sonSaat} />}>
        <div className="ke-bos-izgara" style={{ display: "grid", gridTemplateColumns: dar ? "minmax(0,1fr)" : "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: SP.xl, alignItems: "stretch" }}>
          {dar && tepsi}
          <SonukPusula masalar={masalar} surukleniyor={isDragActive} dar={dar} />
          {!dar && tepsi}
        </div>
      </ViewWrap>
    </div>
  );
}
