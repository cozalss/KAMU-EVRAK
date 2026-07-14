/* Yazı türü seçici — kompakt dropdown (şartname: üst yazı / cevabi yazı / bilgilendirme /
   alternatif tür). Memur taslağın TÜRÜNÜ seçer; seçilen türe göre taslak yeniden üretilir.
   Hem ana taslak kartında (CanliAjanAkisi) hem birim kartlarında (AltTaslakKarti) kullanılır.

   Tasarım (2026-07 sadeleştirme): tür = belgenin İKİNCİL üstverisidir, ekranın ana navigasyonu
   değil — eski 6-kutucuklu tam-genişlik band belgeyle görsel ağırlıkta yarışıyordu. Artık başlık
   şeridinde tek satırlık sessiz bir açılır seçici (native <select> → tam klavye/a11y, dış-tık
   yönetimi yok). Sistem önerisi seçenek metninde "· öneri"; üretim sürerken spinner + kilit. */
import { YAZI_TR } from "./result-cards.jsx";
import { PAL, DERIN, V, ALFA, TYPE, RAD, SP, focusRing } from "./neonUi.jsx";

const YAZI_TUR_SECENEK = [
  ["cevabi_yazi", "Cevabi yazı"], ["ust_yazi", "Üst yazı"], ["bilgilendirme", "Bilgilendirme"],
  ["olur", "Olur"], ["muzekkere", "Müzekkere"], ["gorus_mutalaa", "Görüş"],
];

export default function TurSecici({ secili, onerilen, uretilen, onSec, pasif = false }) {
  const kilitli = !!uretilen || pasif;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, minWidth: 0 }}>
      <span style={{ ...TYPE.meta, color: PAL.mut2, flexShrink: 0 }}>Tür</span>
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <select
          value={secili}
          disabled={kilitli}
          onChange={(e) => onSec(e.target.value)}
          aria-label="Resmî yazı türü — seçilen türe göre taslak yeniden üretilir"
          {...focusRing}
          style={{
            appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
            ...TYPE.meta, fontWeight: 600, color: kilitli ? PAL.mut2 : DERIN.V,
            background: kilitli ? PAL.surf2 : ALFA(V),
            border: `1px solid ${kilitli ? PAL.line : DERIN.V}`,
            borderRadius: RAD.chip, padding: "4px 24px 4px 10px", minHeight: 26,
            cursor: kilitli ? "default" : "pointer", outline: "none",
          }}>
          {YAZI_TUR_SECENEK.map(([tur, kisa]) => (
            <option key={tur} value={tur} style={{ background: PAL.surf, color: PAL.ink }}>
              {kisa}{tur === onerilen ? " · öneri" : ""}
            </option>
          ))}
        </select>
        {/* Chevron — native ok gizlendi; token-renkli kendi göstergemiz. Üretim sürerken
            spinner nokta (nu-think) ile değişir → "üretiliyor" durumu görünür. */}
        <span aria-hidden="true" style={{ position: "absolute", right: 8, display: "inline-flex", pointerEvents: "none" }}>
          {uretilen ? (
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: RAD.dot, background: DERIN.V, animation: "nu-think 1.2s ease-in-out infinite" }} />
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9 L12 15 L18 9" stroke={kilitli ? PAL.mut3 : DERIN.V} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </span>
      </span>
      {uretilen && <span style={{ ...TYPE.meta, color: PAL.mut2, flexShrink: 0 }}>üretiliyor…</span>}
      {/* SR: seçili türün tam adı (kısa etiket yerine) */}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Seçili tür: {YAZI_TR(secili)}
      </span>
    </label>
  );
}
