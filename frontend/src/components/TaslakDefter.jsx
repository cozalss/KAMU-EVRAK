/* TaslakDefter — Taslaklar kuyruğunun defter geometrisi (satır adımı, kenar çizgisi, cetvel)
   ve YÜKLEME iskeleti. TaslaklarView'dan ayrıldı (dosya <800 kuralı); iskelet gerçek düzenle
   aynı ölçüleri buradan okur — veri gelince yerleşim sıçramaz. */
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { R, PAL, RAD, SP, SH, SR_ONLY } from "./neonUi.jsx";

/* Satır yüksekliği SABİT: cetvel arka plandır, satırlar ondan kaymamalı. */
export const SATIR_H = 52;
export const MASA_PAY = 20;   // masa zemininin kâğıt çevresindeki payı (px)
export const KENAR_X = 44;
/* Cetvel kayıtların ALTINA en fazla BOS_SATIR boş satır kadar uzar (tur-4: 6 kayıt altında
   5–9 boş defter satırı "yarım ürün" gibi okunuyordu). Sonrası düz kâğıt yüzeyi. */
const BOS_SATIR = 2;
export const defterZemini = (kayit = 0) => {
  const boy = (Math.max(1, kayit) + BOS_SATIR) * SATIR_H;
  return {
    backgroundImage: [
      `linear-gradient(to right, transparent ${KENAR_X - 1}px, color-mix(in srgb, ${R} 30%, transparent) ${KENAR_X - 1}px, color-mix(in srgb, ${R} 30%, transparent) ${KENAR_X}px, transparent ${KENAR_X}px)`,
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${SATIR_H - 1}px, ${PAL.line} ${SATIR_H - 1}px, ${PAL.line} ${SATIR_H}px)`,
      /* KAPANIŞ ÇİZGİSİ (tur 6 doğrulaması: "cetvel iki boş satırdan sonra kesiliyor, ritim
         karışık"): defterlerde kayıtların altı çift çizgiyle kapatılır. Cetvelin bittiği yer
         artık kesik değil, bilinçli bir sondur; altı düz kâğıttır. */
      `linear-gradient(to bottom, ${PAL.lineHi} 0, ${PAL.lineHi} 1px, transparent 1px, transparent 3px, ${PAL.lineHi} 3px, ${PAL.lineHi} 4px)`,
    ].join(", "),
    backgroundSize: `100% ${boy}px, 100% ${boy}px, 100% 4px`,
    backgroundPosition: `0 0, 0 0, 0 ${boy - 1}px`,
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "local",
  };
};

/* Kalıcı kayıt (/islemler) durumu — taslak listesi o sorgudan türer (DashboardApp). Sorgu
   sürerken boş liste "kayıt yok" DEĞİLDİR: tur-4 ölçümünde ~3 sn boyunca "Henüz taslak
   ayrılmadı · KAYIT YOK" basılıyor, aynı anda kenar çubuğu "Taslaklar 6" diyordu
   (yüklenmeyen veri "boş" diye sunuluyordu — CLAUDE.md §9'un ekran karşılığı).
   Durum react-query önbelleğinden okunur; çağıran açıkça `yukleniyor`/`hata` verirse o kazanır. */
export function useIslemDurumu() {
  const qc = useQueryClient();
  const getiriliyor = useIsFetching({ queryKey: ["islemler"] });
  const durumlar = qc.getQueryCache().findAll({ queryKey: ["islemler"] }).map((q) => q.state);
  const veriVar = durumlar.some((d) => d.data !== undefined);
  // Yeniden deneme sayısı (react-query fetchFailureCount): kuyruk başlığı "yükleniyor" yerine
  // insan dilinde "bağlantı yeniden deneniyor (2/4)" der — jüri tur 8: 500 hatasında 6 sn
  // boyunca dilsiz iskelet duruyordu.
  const deneme = durumlar.reduce((m, d) => Math.max(m, d.fetchFailureCount || 0), 0);
  return {
    deneme,
    yukleniyor: !veriVar && getiriliyor > 0,
    hata: !veriVar && getiriliyor === 0 && durumlar.some((d) => d.status === "error"),
    yeniden: () => qc.refetchQueries({ queryKey: ["islemler"] }),
  };
}

/* Yükleme iskeleti — GERÇEK düzenin aynı kutuları (kuyruk satırları · masa+kâğıt · karar
   fişi): veri gelince yerleşim sıçramaz, yalnız içerik dolar. Nabız yalnız opaklık
   (nu-think, kompozitör). Ekran okuyucuya tek "yükleniyor" duyurusu. */
const IskeletCubuk = ({ w, h = 9, gecikme = 0 }) => (
  <span aria-hidden="true" style={{ display: "block", width: w, height: h, borderRadius: RAD.chip, background: PAL.press, animation: `nu-think 1.4s ease-in-out ${gecikme}ms infinite` }} />
);
export function IskeletSatirlar() {
  return (
    <div role="status" aria-live="polite" style={{ ...defterZemini(4), flex: 1, minHeight: SATIR_H * 4 }}>
      <span style={SR_ONLY}>Taslaklar yükleniyor…</span>
      {[0.78, 0.62, 0.7, 0.54].map((w, i) => (
        <div key={i} aria-hidden="true" style={{ height: SATIR_H, display: "flex", alignItems: "center" }}>
          <span style={{ width: KENAR_X, display: "flex", justifyContent: "center" }}><IskeletCubuk w={14} gecikme={i * 120} /></span>
          <span style={{ flex: 1, display: "grid", gap: 7, padding: "0 14px 0 12px" }}>
            <IskeletCubuk w={`${w * 100}%`} gecikme={i * 120} />
            <IskeletCubuk w="34%" h={7} gecikme={i * 120 + 60} />
          </span>
        </div>
      ))}
    </div>
  );
}
/* Karar iskeleti — gerçek düzenin kutuları (tur 6): masa = künye satırı + kâğıt; karar
   sütunu masa yüksekliğinde, eylem bloğu dipte. Veri gelince yerleşim sıçramaz. */
export function KararIskeleti({ genis, sutunH }) {
  return (
    <>
      <div aria-hidden="true" style={{ minWidth: 0, height: genis ? (sutunH ?? undefined) : undefined, display: "flex", flexDirection: "column", gap: SP.s,
        padding: genis ? `10px ${MASA_PAY}px ${MASA_PAY}px` : SP.m, boxSizing: "border-box", borderRadius: RAD.card, background: PAL.bg2,
        boxShadow: `inset 0 1px 3px color-mix(in srgb, ${PAL.ink} 7%, transparent)` }}>
        <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <IskeletCubuk w={110} h={8} />
          <IskeletCubuk w={120} h={22} gecikme={60} />
        </div>
        <div style={{ flex: genis ? 1 : "none", minHeight: 0, height: genis ? undefined : 320, background: PAL.surf, boxShadow: SH.kagit, padding: "7% 9%", boxSizing: "border-box", display: "grid", alignContent: "start", gap: 10 }}>
          <span style={{ justifySelf: "center" }}><IskeletCubuk w={60} /></span>
          <span style={{ justifySelf: "center", width: "56%" }}><IskeletCubuk w="100%" /></span>
          <span style={{ height: 18 }} />
          {[92, 100, 86, 64].map((w, i) => <IskeletCubuk key={i} w={`${w}%`} h={7} gecikme={i * 90} />)}
        </div>
      </div>
      <aside aria-hidden="true" style={{ display: "flex", flexDirection: "column", minWidth: 0, height: genis ? (sutunH ?? undefined) : undefined, boxSizing: "border-box",
        background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden" }}>
        <div style={{ display: "grid", alignContent: "start", gap: SP.l, padding: "18px 20px", flex: 1 }}>
          <IskeletCubuk w="40%" h={8} />
          <IskeletCubuk w="88%" h={16} gecikme={80} />
          <IskeletCubuk w="70%" h={16} gecikme={140} />
          <span style={{ height: 8 }} />
          {[100, 92, 76].map((w, i) => <IskeletCubuk key={i} w={`${w}%`} h={8} gecikme={200 + i * 80} />)}
        </div>
        <div style={{ display: "grid", gap: SP.s, padding: 20, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
          <span style={{ height: 42, borderRadius: RAD.ctl, background: PAL.press, opacity: 0.6 }} />
          <span style={{ height: 36, borderRadius: RAD.ctl, background: PAL.press, opacity: 0.4 }} />
        </div>
      </aside>
    </>
  );
}
