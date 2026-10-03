/* SureRaporModal — Panel'deki kompakt "İşlem Süresi" kartının detay raporu (2026-07-25).
   Kompakt kart ve verisi AYNEN durur; bu modal onun genişletilmiş okumasıdır.

   VERİ KAYNAĞI YENİ DEĞİL: aynı `history` dizisi, aynı `result.sure_ms` + `ts` alanları.
   Tüm hesap lib/sureRapor.js'te (saf, test edilir); burası yalnız sunum.

   Yetersiz geçmişte SAYI UYDURULMAZ: kıyas penceresi boşsa "kıyas için yeterli geçmiş yok"
   yazılır, uydurma yüzde basılmaz (rapor jüriye gösterilecek bir belgedir).

   Tema: Hero Light — açık yüzey (PAL.surf), referans görselin lacivert zemini KOPYALANMADI.
   Modal deseni BelgeModal ile aynı: Radix Dialog (odak tuzağı + Esc + dış tık) + motion
   AnimatePresence (mount zamanlaması). */
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  Icon, MONO, TYPE, TNUM, SP, RAD, SH, EASE, EASE_BEZIER, DERIN, PAL, IRIS, IRIS_BAR, SR_ONLY, focusRing,
} from "./neonUi.jsx";
import { BIRIM_GOSTER } from "./result-cards.jsx";
import SureKiyasBloku, { TrendRozet } from "./SureKiyas.jsx";
import { olcumler, ortalama, esikMs, genelTrend, hizKademe, sirala, eksenKademe, fmtSn as sn, ESIK_KAT } from "../lib/sureRapor.js";

const fmtTarih = (ts) => {
  try { return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};
/* Kimlik kısaltması — islem_id bir UUID'dir, tabloya ham basılırsa satırı ezer. İlk 8
   karakter denetim izinde eşleştirmeye yeter; tamamı title'da durur (bilgi saklanmıyor). */
const kisaId = (id) => (id ? String(id).replace(/-/g, "").slice(0, 8) : "—");

/* Bar grafik — son ~20 ölçüm. Y ekseni saniye kademeleri, X ekseni işlem sırası.
   Renk: IRIS sıralı pastel rampası, Panel kartıyla AYNI kural (hizKademe) — aynı koşum
   iki ekranda aynı rengi taşır. Kırmızı-yeşil kullanılmaz (renk körlüğü); bilgi açıklıkta. */
function BarGrafik({ veri, ort }) {
  const { tavanSn, kademeler } = eksenKademe(Math.max(...veri.map((x) => x.ms)));
  const H = 168;
  return (
    <div style={{ display: "flex", gap: SP.s, marginTop: SP.m }}>
      {/* Y ekseni */}
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between",
        height: H, flexShrink: 0, textAlign: "right", minWidth: 38 }}>
        {kademeler.map((k) => (
          <span key={k} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3 }}>{k.toFixed(1)}</span>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
        {/* Izgara çizgileri + barlar aynı kutuda: çizgiler mutlak, barlar akışta */}
        <div style={{ position: "relative", height: H, minWidth: veri.length * 18 }}>
          {kademeler.map((k) => (
            <span key={k} aria-hidden="true" style={{ position: "absolute", left: 0, right: 0,
              top: `${(1 - k / tavanSn) * 100}%`, borderTop: `1px solid ${PAL.line}` }} />
          ))}
          <div role="img" aria-label={`Son ${veri.length} işlemin süreleri, en yüksek ${sn(Math.max(...veri.map((x) => x.ms)))} saniye`}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3 }}>
            {veri.map((x, i) => {
              const kademe = hizKademe(x.ms, ort);
              return (
                <span key={`${x.id}-${i}`} title={`Evrak-${i + 1}: ${sn(x.ms)} sn (${IRIS[kademe].l}) — ${x.ad}`}
                  style={{ flex: 1, minWidth: 10, height: `${Math.max(3, (x.ms / 1000 / tavanSn) * 100)}%`,
                    ...IRIS_BAR(kademe), borderBottom: "none", borderRadius: `${RAD.chip}px ${RAD.chip}px 0 0` }} />
              );
            })}
          </div>
        </div>
        {/* X ekseni — işlem sırası */}
        <div aria-hidden="true" style={{ display: "flex", gap: 3, marginTop: SP.xs, minWidth: veri.length * 18 }}>
          {veri.map((x, i) => (
            <span key={`e-${i}`} style={{ flex: 1, minWidth: 10, textAlign: "center",
              fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3 }}>{i + 1}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Sıralanabilir tablo başlığı — aktif kolonun yönü ok ile gösterilir. */
function ThSirali({ alan, etiket, aktif, artan, onSec, sayisal }) {
  return (
    <th scope="col" style={{ padding: 0, textAlign: sayisal ? "right" : "left", whiteSpace: "nowrap" }}>
      {/* Hit alanı hücre dolgusuna yayılır (padding butonda, th 0): görsel hiza aynı,
          tıklanabilir hedef ~16px'lik metin şeridinden tüm başlık hücresine (≥32px) çıkar. */}
      <button type="button" onClick={() => onSec(alan)} {...focusRing} data-press=""
        aria-label={`${etiket} sütununa göre sırala`}
        onMouseEnter={(e) => { e.currentTarget.style.color = DERIN.T; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = aktif ? DERIN.T : PAL.mut; }}
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs,
          width: "100%", justifyContent: sayisal ? "flex-end" : "flex-start",
          background: "transparent", border: "none", padding: `${SP.s}px ${SP.m}px`, ...TYPE.meta, fontWeight: 600,
          color: aktif ? DERIN.T : PAL.mut, transition: `color .12s ease, transform .14s ${EASE.out}` }}>
        {etiket}
        <span aria-hidden="true" style={{ opacity: aktif ? 1 : 0.3, fontSize: 9 }}>{aktif && !artan ? "▼" : "▲"}</span>
      </button>
    </th>
  );
}

export default function SureRaporModal({ acik, onKapat, history = [] }) {
  const [alan, setAlan] = useState("ts");
  const [artan, setArtan] = useState(false);          // varsayılan: en yeni önce

  const olcum = useMemo(() => olcumler(history), [history]);
  const ort = useMemo(() => ortalama(olcum), [olcum]);
  const esik = esikMs(ort);
  const gTrend = useMemo(() => genelTrend(olcum), [olcum]);
  const grafik = useMemo(() => olcum.slice(0, 20).reverse(), [olcum]);   // eski → yeni
  const tablo = useMemo(() => sirala(olcum, alan, artan).slice(0, 7), [olcum, alan, artan]);

  const sirala7 = (a) => { if (a === alan) setArtan((v) => !v); else { setAlan(a); setArtan(a === "ad" || a === "id"); } };
  const th = (a, etiket, sayisal) => (
    <ThSirali alan={a} etiket={etiket} aktif={alan === a} artan={artan} onSec={sirala7} sayisal={sayisal} />
  );
  const td = { padding: `${SP.s}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: PAL.ink2 };

  return (
    <Dialog.Root open={acik} onOpenChange={(v) => { if (!v) onKapat(); }}>
      <AnimatePresence>
        {acik && (
          <Dialog.Portal forceMount>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
              style={{ position: "fixed", inset: 0, zIndex: 80, background: PAL.scrim, overflowY: "auto", padding: "32px 16px 48px" }}>
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
                  style={{ width: "min(720px, 96vw)", margin: "0 auto", background: PAL.surfPop,
                    border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal,
                    padding: SP.xl, outline: "none" }}>
                  <Dialog.Description style={SR_ONLY}>
                    İşlem sürelerinin ayrıntılı raporu: ortalama, son işlemlerin dağılımı, tablo ve dönem kıyaslaması.
                  </Dialog.Description>

                  {/* Başlık + kapat */}
                  <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.xl }}>
                    <Dialog.Title asChild>
                      <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>İşlem Süresi Detay Raporu</h2>
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button type="button" aria-label="Raporu kapat" {...focusRing} data-press=""
                        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        style={{ cursor: "pointer", marginLeft: "auto", display: "inline-flex", alignItems: "center",
                          justifyContent: "center", width: 30, height: 30, background: "transparent",
                          border: `1px solid ${PAL.line}`, borderRadius: RAD.dot, color: PAL.mut,
                          transition: `background .12s ease, transform .14s ${EASE.out}` }}>
                        <Icon.x width={15} height={15} />
                      </button>
                    </Dialog.Close>
                  </div>

                  {olcum.length === 0 ? (
                    <p style={{ margin: 0, ...TYPE.read, color: PAL.mut2 }}>
                      Henüz süre ölçümü yok. Bir evrak işlediğinizde rapor buradan oluşur.
                    </p>
                  ) : (
                    <>
                      {/* Büyük metrik + trend */}
                      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
                        {/* TYPE.num (24/28, tabular-nums yerleşik): istatistik rakamı num
                            katmanında — h1 display token'ı görünüm başlıklarına aittir. */}
                        <span style={{ ...TYPE.num, color: PAL.ink }}>{sn(ort)} sn</span>
                        <TrendRozet t={gTrend} buyuk />
                        <span style={{ ...TYPE.data, color: PAL.mut2, ...TNUM }}>
                          ortalama · {olcum.length} işlem
                          {gTrend ? " · son koşumlar öncekilere göre" : " · trend için en az 4 işlem gerekir"}
                        </span>
                      </div>

                      <BarGrafik veri={grafik} ort={ort} />

                      {/* Tablo */}
                      <h3 style={{ margin: `${SP.xl}px 0 ${SP.s}px`, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>
                        Son 7 İşlem Detayı
                      </h3>
                      {/* Dar ekranda tablo YATAY kaydırılır — kolonları sarmalamak sayıları okunmaz yapardı */}
                      <div style={{ overflowX: "auto", border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                          <thead>
                            <tr style={{ background: PAL.surf2 }}>
                              {th("id", "İşlem Kimliği")}
                              {th("ad", "Evrak Adı")}
                              <th scope="col" style={{ padding: `${SP.s}px ${SP.m}px`, textAlign: "left", ...TYPE.meta, fontWeight: 600, color: PAL.mut, whiteSpace: "nowrap" }}>Birim</th>
                              {th("ms", "Süre (sn)", true)}
                              {th("ts", "Tarih/Saat")}
                              <th scope="col" style={{ padding: `${SP.s}px ${SP.m}px`, ...TYPE.meta, fontWeight: 600, color: PAL.mut }}>Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tablo.map((x, i) => {
                              const yavas = esik != null && x.ms > esik;
                              return (
                                <tr key={`${x.id}-${i}`}>
                                  <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap" }} title={x.id || "kaydediliyor"}>{kisaId(x.id)}</td>
                                  <td style={{ ...td, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.ad}>{x.ad}</td>
                                  <td style={{ ...td, color: DERIN.V, whiteSpace: "nowrap" }}>{BIRIM_GOSTER(x.hedefBirim, x.evrakTuru)}</td>
                                  <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontSize: 12, ...TNUM, whiteSpace: "nowrap" }}>{sn(x.ms)}</td>
                                  <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap" }}>{fmtTarih(x.ts)}</td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    {/* Renk tek sinyal değil: ikon ŞEKLİ de değişir (tik / üçgen-ünlem) */}
                                    <span title={yavas ? `Eşiğin üstünde (${sn(esik)} sn)` : `Eşiğin altında (${sn(esik)} sn)`}
                                      style={{ display: "inline-flex", color: yavas ? DERIN.sari : DERIN.yesil }}>
                                      {yavas ? <Icon.alert width={15} height={15} /> : <Icon.check width={15} height={15} />}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Eşik sabit bir sayı DEĞİL — ortalamadan türer; gizli sihirli sayı bırakmamak için yazılır */}
                      <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
                        Yavaş işlem eşiği: ortalama × {ESIK_KAT} = {sn(esik)} sn.
                      </p>

                      {/* Kıyaslama — Panel kartıyla ORTAK bileşen (bkz. SureKiyas.jsx) */}
                      <SureKiyasBloku history={history} />
                    </>
                  )}
                </motion.div>
              </Dialog.Content>
            </motion.div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
