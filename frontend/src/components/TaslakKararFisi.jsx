/* TaslakKararFisi — Taslaklar karar panelinin ÜST bölümü (eylemlerin üstündeki "fiş").
   2026-10 kullanıcı geri bildirimi: panel "üstte künye, altta düğmeler, arası boş" idi. Fiş,
   memurun Gönder demeden önce bakacağı şeyleri sırayla verir:
     konu → hüküm (risk bandı damgası) → yazının özü → muhatap / tür → mevzuat önerisi → künye.
   Risk YALNIZ bant etiketiyle söylenir (YEŞİL/SARI/KIRMIZI) — skor/yüzde YOK (CLAUDE.md §7).
   Mevzuat satırı "öneri"dir (RAG), doğrulanmış dayanak iddiası taşımaz. */
import { Fragment, useEffect, useState } from "react";
import { Damga, Icon, MONO, DISPLAY, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SR_ONLY, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR } from "../lib/evrakEtiket.js";
import { tarihHukmu, bugunTarihi } from "../lib/gonderimTarihi.js";

const dolu = (v) => v != null && String(v).trim() && v !== "—";

/* Yazının özü — 3 satır; uzunsa "Tamamı" ile yerinde açılır (tur 9 jüri: 6 satır + solma maskesi
   fişi uzatıp "Devamı" künyesini zorunlu kılıyordu). */
const OZ_SATIR = 3;
function YazininOzu({ oz }) {
  const [acik, setAcik] = useState(false);
  const uzun = String(oz).length > 150;
  return (
    <div>
      <BaslikEtiket>Yazının özü</BaslikEtiket>
      <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2, ...(acik ? null : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: OZ_SATIR, overflow: "hidden" }) }}>{oz}</p>
      {uzun && (
        <button type="button" onClick={() => setAcik((a) => !a)} aria-expanded={acik} {...focusRing} data-press=""
          style={{ marginTop: 4, padding: "2px 0", border: "none", background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: DERIN.T }}>
          {acik ? "Kısalt ↑" : "Tamamı ↓"}
        </button>
      )}
    </div>
  );
}

/* Yazının özü: gövdenin ilk anlamlı paragrafı (hitap/ilgi/künye satırları taslakOzeti'nde
   zaten ayıklanır). Kapanış kalıpları ("Bilgilerinize sunulur.") öz değildir. */
function ozCikar(govde = "") {
  const paragraflar = String(govde).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Künye artıkları da öz değildir: "İlgi : …" satırı, "Sayın …" hitabı ve BÜYÜK HARF muhatap
  // ("PARK VE BAHÇELER MÜDÜRLÜĞÜNE") — tur 6'da "Yazının özü" alanında İlgi satırı görünüyordu.
  const kunyeArtigi = (p) => /^((İlgi|Ilgi|Sayı|Konu)\s*:|Sayın\s)/i.test(p) || p === p.toLocaleUpperCase("tr-TR");
  return paragraflar.find((p) => p.length > 40 && !kunyeArtigi(p) && !/^(Gereğini|Bilgilerinize|Bilgi ve gereğini|Saygılarımla)/i.test(p))
    || paragraflar.find((p) => !kunyeArtigi(p)) || "";
}

const BaslikEtiket = ({ children }) => (
  <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>
);

/* Gönderim engeli — içi boş / "aşağıda" vaatli / [DOĞRULA]'lı yazı Gönder'e basılmadan
   ÖNCE söylenir (tur-4: açıklama vermeyen cevap tek tıkla gönderilebiliyordu). Metin
   lib/gonderimHazirlik.gonderimDenetimi'nden — onay fişiyle aynı kaynak, aynı kelimeler. */
function GovdeUyarisi({ metin, onDuzenle }) {
  return (
    <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "10px 12px", borderRadius: RAD.card,
      background: ALFA(BANT.kirmizi.c), boxShadow: `inset 3px 0 0 ${BANT.kirmizi.c}` }}>
      <Icon.alert width={15} height={15} style={{ flexShrink: 0, marginTop: 2, color: DERIN.kirmizi }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.data, fontWeight: 600, color: DERIN.kirmizi }}>Gönderime hazır değil</div>
        <p style={{ margin: "2px 0 6px", ...TYPE.meta, color: PAL.ink2, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }} title={metin}>{metin}</p>
        {onDuzenle && (
          <button type="button" onClick={onDuzenle} {...focusRing} data-press=""
            style={{ cursor: "pointer", padding: "2px 0", border: "none", background: "transparent", ...TYPE.meta, fontWeight: 600, color: DERIN.T, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Taslağı düzenle
          </button>
        )}
      </div>
    </div>
  );
}

/* GÖNDERİM KONTROLÜ (tur 8, ödül brifi hamle 7 — "havale fişi: kontrol et → paraf → gönder"):
   yazının künyesi METNİN KENDİSİNDEN okunur (lib/gonderimHazirlik.taslakKunyesi — onay fişiyle
   AYNI kaynak, aynı alanlar); bulunamayan alan boş halka + "metinde yok" der, uydurulmaz.
   Bu bir adım-durumu türetmesi DEĞİLDİR (akisKatman'ın alanı değil): yazı metninin denetimi.
   Fişin ortasındaki ölü boşluğu (jüri: 1920'de ~250px) karar verisiyle doldurur. */
function KontrolSatiri({ etiket, deger, mono = false, hukum = null }) {
  const var_ = dolu(deger);
  // hukum: "tamam" | "eksik" | "farkli" — verilmezse doluluktan. Tarih satırı onay fişiyle AYNI
  // yüklemi okur (lib/gonderimTarihi): bugünden farklı tarih ✓ SAYILMAZ (jüri tur 8, yüksek).
  const durum = hukum || (var_ ? "tamam" : "eksik");
  const tamam = durum === "tamam";
  const not = durum === "farkli" ? `bugünden farklı · bugün ${bugunTarihi()}` : null;
  return (
    <li style={{ display: "grid", gridTemplateColumns: "16px 74px minmax(0, 1fr)", alignItems: "start", gap: SP.s, padding: "6px 0", borderTop: `1px dashed ${PAL.line}` }}>
      <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 14, height: 14, marginTop: 1, borderRadius: RAD.dot,
        border: `1px solid ${tamam ? "transparent" : durum === "farkli" ? DERIN.sari : PAL.lineHi}`, background: tamam ? ALFA(BANT.yesil.c) : "transparent", color: DERIN.yesil }}>
        {tamam && <Icon.check width={10} height={10} />}
      </span>
      <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", paddingTop: 1 }}>{etiket}</span>
      {/* Değer 2 satıra kadar sarar (jüri: "BASIN, YAYIN VE H…" tek satırda kırpılıyordu); tamamı title'da. */}
      <span title={var_ ? deger : "Metinde bulunamadı"} style={{ minWidth: 0, overflowWrap: "anywhere",
        display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden",
        ...(mono && var_ ? { fontFamily: MONO, fontSize: 12, lineHeight: "16px", ...TNUM } : TYPE.meta), color: var_ ? PAL.ink2 : PAL.mut2, fontWeight: var_ && !mono ? 500 : 400 }}>
        {var_ ? deger : "metinde yok"}
        <span style={SR_ONLY}>{tamam ? " — var" : durum === "farkli" ? " — bugünden farklı" : ""}</span>
      </span>
      {not && <span style={{ gridColumn: "3", marginTop: -2, ...TYPE.meta, color: DERIN.sari }}>{not}</span>}
    </li>
  );
}

function GonderimKontrolu({ kunye }) {
  if (!kunye) return null;
  const satirlar = [
    { k: "Muhatap", v: kunye.muhatap }, { k: "Konu", v: kunye.konu }, { k: "Sayı", v: kunye.sayi, mono: true },
    { k: "Tarih", v: kunye.tarih, mono: true, hukum: tarihHukmu(kunye.tarih) },
    { k: "Kapanış", v: [kunye.kapanis, kunye.imza].filter(Boolean).join(" — ") },
  ];
  const tamam = satirlar.filter((s) => (s.hukum ? s.hukum === "tamam" : dolu(s.v))).length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 2 }}>
        <BaslikEtiket>Gönderim kontrolü</BaslikEtiket>
        <span style={{ marginLeft: "auto", ...TYPE.antet, ...TNUM, color: tamam === satirlar.length ? DERIN.yesil : PAL.mut2 }}>
          {String(tamam).padStart(2, "0")} / {String(satirlar.length).padStart(2, "0")}
        </span>
      </div>
      <ul aria-label="Gönderim kontrolü — yazının künyesi" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {satirlar.map((s) => <KontrolSatiri key={s.k} etiket={s.k} deger={s.v} mono={s.mono} hukum={s.hukum} />)}
      </ul>
    </div>
  );
}

export default function TaslakKararFisi({ h, r, ad, govde, tarih, sira, toplam, govdeUyari = null, onDuzenle = null, kunye: yaziKunyesi = null }) {
  const bant = BANT[r.risk_metadata?.bant] || null;
  const oz = ozCikar(govde);
  const mevzuat = (Array.isArray(r.mevzuat_onerileri) ? r.mevzuat_onerileri : [])
    .map((m) => m?.baslik).filter(dolu).slice(0, 2);
  const kunye = [
    ["Muhatap birim", BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)], ["Evrak türü", EVRAK_TR(r.evrak_turu)], ["Yazı türü", YAZI_TR(r.yazi_turu)],
    ["Dosya", h.name, true], ["Tarih", tarih, true],
  ].filter(([, v]) => dolu(v));

  return (
    <div style={{ minWidth: 0, flex: "1 0 auto", display: "flex", flexDirection: "column" }}>
      {/* Antet şeridi — panelin ne olduğu + kuyruktaki yeri. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "0 20px", height: 34, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
        <span>Karar fişi</span>
        <span style={{ marginLeft: "auto", ...TNUM }}>
          <span style={{ color: PAL.ink2, fontWeight: 600 }}>{String(sira).padStart(2, "0")}</span> / {String(toplam).padStart(2, "0")}
        </span>
      </div>

      <div style={{ flex: "1 0 auto", padding: "18px 20px 18px", display: "flex", flexDirection: "column", gap: SP.l }}>
        <div>
          <BaslikEtiket>Konu</BaslikEtiket>
          {/* Konu başlığı ÖLÇÜLÜ (18px) ve 3 satırla kelepçeli — konu satırları paragraf
              uzunluğunda gelebiliyor; dev başlık paneli yutuyordu. Tam metin title'da. */}
          <KonuBasligi ad={ad} />
        </div>

        {govdeUyari && <GovdeUyarisi metin={govdeUyari} onDuzenle={onDuzenle} />}

        {bant && (
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
            <Damga ton={bant.c} egim={-3} kucuk oncelik={1}>{bant.l} bant</Damga>
            <span style={{ ...TYPE.meta, color: DERIN_OF(bant.c), fontWeight: 500 }}>{bant.t}</span>
          </div>
        )}

        {oz && <YazininOzu oz={oz} />}

        <GonderimKontrolu kunye={yaziKunyesi} />

        {mevzuat.length > 0 && (
          <div>
            <BaslikEtiket>Mevzuat önerisi</BaslikEtiket>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {mevzuat.map((m) => (
                <li key={m} title={m} style={{ ...TYPE.meta, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>§ {m}</li>
              ))}
            </ul>
          </div>
        )}

        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: SP.m }}>
          {kunye.map(([k, v, mono]) => (
            <Fragment key={k}>
              <dt style={{ ...TYPE.meta, color: PAL.mut3, padding: "6px 0", borderTop: `1px solid ${PAL.line}` }}>{k}</dt>
              <dd title={v} style={{ margin: 0, padding: "6px 0", borderTop: `1px solid ${PAL.line}`, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                ...(mono ? { fontFamily: MONO, fontSize: 12, lineHeight: "16px", ...TNUM } : TYPE.meta), color: PAL.ink2, fontWeight: mono ? 400 : 500 }}>{v}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* Konu başlığı — 3 satır kelepçe; uzun konu "tümü" ile yerinde açılır (2. jüri: '…' ile kesik
   konu tooltip'e saklanıyordu). Seçim değişince yeniden kapanır. */
const KONU_ACILIR = 110;
function KonuBasligi({ ad }) {
  const [acik, setAcik] = useState(false);
  useEffect(() => { setAcik(false); }, [ad]);
  const uzun = String(ad || "").length > KONU_ACILIR;
  return (
    <>
      <h2 id="kd-fis-konu" title={uzun && !acik ? ad : undefined} style={{ margin: 0, fontFamily: DISPLAY, fontSize: 18, lineHeight: "24px", fontWeight: 700, fontStretch: "104%", letterSpacing: "-.01em", color: PAL.ink,
        overflowWrap: "anywhere", ...(acik ? null : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }) }}>{ad}</h2>
      {uzun && (
        <button type="button" onClick={() => setAcik((v) => !v)} aria-expanded={acik} aria-controls="kd-fis-konu" {...focusRing} data-press=""
          style={{ marginTop: 4, padding: "2px 0", border: 0, background: "none", cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: PAL.mut2, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
          {acik ? "Kısalt" : "Konunun tümü"}
        </button>
      )}
    </>
  );
}
