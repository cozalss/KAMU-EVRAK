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

/* Kabul edilen türler backend ACCEPT listesiyle birebir. */
const DROP_KABUL = {
  "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"], "image/tiff": [".tiff"], "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function useOnizlemeMasalari() {
  return useMemo(() => DEFAULT_NODE_IDS.filter((id) => id !== "denetim_izi")
    .map((id, i) => ({ ...makeNode(id), sira: i })), []);
}

function MasaSatiri({ a, nefes }) {
  const col = a.gorev === 2 ? V : T;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 24px", alignItems: "center", columnGap: SP.s, height: 34, borderBottom: `1px solid ${PAL.line}` }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>{String(a.sira + 1).padStart(2, "0")}</span>
      <span style={{ ...TYPE.data, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
      <span aria-hidden="true" style={{ width: 22, height: 22, boxSizing: "border-box", borderRadius: RAD.dot, border: nefes ? `1.5px dashed ${col}` : `1px dotted ${PAL.lineHi}`, animation: nefes ? "ke-e-nefes 1.2s ease-in-out infinite" : "none" }} />
    </div>
  );
}

function SonukPusula({ masalar, surukleniyor, dar }) {
  const fazlar = [1, 2].map((n) => masalar.filter((a) => (a.gorev === 2 ? 2 : 1) === n));
  return (
    <section aria-label="Havale pusulası önizlemesi" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: "clamp(16px, 2.4vw, 28px)", minWidth: 0 }}>
      {/* Tek satır: telefonda "15 MASA" künyenin altında öksüz satır kaplıyordu. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", flexWrap: "nowrap", minWidth: 0 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Havale pusulası · evrak bekleniyor</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
        <span style={{ ...TNUM, flexShrink: 0, whiteSpace: "nowrap" }}>{masalar.length} masa</span>
      </div>
      <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.35 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "clamp(16px, 2.4vw, 28px)", marginTop: SP.l, alignItems: "center" }}>
        <div style={{ padding: SP.s, borderRadius: RAD.pop, background: PAL.surf2, boxShadow: `inset 0 0 0 1px ${PAL.lineHi}`, opacity: 0.85 }}>
          <AjanOrb display={masalar} kosumda={false} yukseklik={dar ? 150 : 188} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>Masa boş</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginTop: SP.s }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: "clamp(56px, 6vw, 88px)", lineHeight: 0.82, letterSpacing: "-.05em", color: PAL.lineHi, ...TNUM }}>00</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 22, color: PAL.mut3, ...TNUM }}>/ {String(masalar.length).padStart(2, "0")}</span>
          </div>
          <p style={{ margin: `${SP.m}px 0 0`, ...TYPE.ui, color: PAL.mut2, maxWidth: 380 }}>
            Evrak geldiğinde masalar sırayla çalışır; işini gerçekten yapan her masa satırına paraf atar.
          </p>
        </div>
      </div>
      {!dar && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", columnGap: SP.xxl, rowGap: SP.l, marginTop: SP.xl }}>
          {fazlar.map((f, i) => f.length > 0 && (
            <div key={i} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, paddingBottom: SP.xs, ...TYPE.antet, color: DERIN_OF(i ? V : T), textTransform: "uppercase" }}>
                <span>{gorevFaz(i + 1).uzun}</span>
              </div>
              {f.map((a) => <MasaSatiri key={a.id} a={a} nefes={surukleniyor && a.sira === 0} />)}
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
    <div style={{ flex: 1, minHeight: dar ? 132 : 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.m, padding: SP.xl, textAlign: "center", borderRadius: RAD.ctl, border: `1.5px dashed ${ton}`, background: surukleniyor ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      <span aria-hidden="true" style={{ position: "relative", width: 44, height: 54, borderRadius: 3, border: `1.5px solid ${surukleniyor ? T : PAL.lineHi}`, background: PAL.surf, display: "grid", placeItems: "center", color: surukleniyor ? DERIN_OF(T) : PAL.mut2, transform: surukleniyor ? "translateY(-4px)" : "none", transition: "transform .2s var(--ke-ease-out), border-color .15s ease-out" }}>
        <Icon.upload width={18} height={18} />
      </span>
      <div>
        <div style={{ ...TYPE.h2, fontSize: dar ? 20 : 24, lineHeight: dar ? "26px" : "30px", color: PAL.ink }}>{surukleniyor ? "Bırakın — işleme başlasın" : "Evrakı buraya bırakın"}</div>
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.data, color: PAL.mut2 }}>PDF, görsel, DOCX ya da TXT — bırakıldığı an masalar çalışmaya başlar.</p>
      </div>
    </div>
  );
}

function GelenTepsisi({ surukleniyor, onGoInbox, onUpload, onTelefon, dar }) {
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
      <div style={{ display: "grid", gridTemplateColumns: dar ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: SP.s }}>
        <span style={{ gridColumn: "1 / -1", display: "flex" }}><Btn primary onClick={onGoInbox} style={tam}><Icon.inbox /> Gelen evrakı aç</Btn></span>
        <Btn onClick={onUpload} style={tam}><Icon.upload /> Dosya seç</Btn>
        {!dar && <Btn onClick={onTelefon} style={tam}><Icon.phone /> Telefonla yükle</Btn>}
      </div>
    </div>
  );
}

export default function CanliBosHal({ onGoInbox, onUpload, onFileDrop, onTelefon }) {
  const dar = useDarEkran();
  const masalar = useOnizlemeMasalari();
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, noClick: true, noKeyboard: true, accept: DROP_KABUL,
    onDrop: (kabul) => { if (kabul?.[0]) onFileDrop(kabul[0]); },
  });
  const tepsi = <GelenTepsisi surukleniyor={isDragActive} onGoInbox={onGoInbox} onUpload={onUpload} onTelefon={onTelefon} dar={dar} />;
  return (
    <div {...getRootProps()} style={{ position: "relative", outline: "none" }}>
      <input {...getInputProps()} aria-hidden="true" />
      <ViewWrap id="isleniyor-h" title="İşleniyor" kunye="Canlı işlem masası" sub="Seçilen evrak burada uçtan uca, masa masa canlı işlenir.">
        <div style={{ display: "grid", gridTemplateColumns: dar ? "minmax(0,1fr)" : "minmax(0, 1.6fr) minmax(300px, 1fr)", gap: SP.xl, alignItems: "stretch" }}>
          {dar && tepsi}
          <SonukPusula masalar={masalar} surukleniyor={isDragActive} dar={dar} />
          {!dar && tepsi}
        </div>
      </ViewWrap>
    </div>
  );
}
