/* Yazı türü seçici (şartname: üst yazı / cevabi yazı / bilgilendirme / alternatif tür).
   Memur taslağın TÜRÜNÜ kutucuklardan seçer; seçilen türe göre taslak yeniden üretilir.
   Hem ana taslak kartında (CanliAjanAkisi) hem birim kartlarında (AltTaslakKarti) kullanılır.
   Sistem önerisi noktayla işaretli; üretim sırasında tüm kutucuklar kilitlenir (yarış yok). */
import { YAZI_TR } from "./result-cards.jsx";
import { V, PAL, DERIN, ALFA, TYPE, RAD, SP, focusRing } from "./neonUi.jsx";

const YAZI_TUR_SECENEK = [
  ["cevabi_yazi", "Cevabi yazı"], ["ust_yazi", "Üst yazı"], ["bilgilendirme", "Bilgilendirme"],
  ["olur", "Olur"], ["muzekkere", "Müzekkere"], ["gorus_mutalaa", "Görüş"],
];

export default function TurSecici({ secili, onerilen, uretilen, onSec, pasif = false }) {
  return (
    <div role="group" aria-label="Resmî yazı türü seç" style={{ display: "flex", flexWrap: "wrap", gap: SP.xs, marginBottom: SP.s }}>
      {YAZI_TUR_SECENEK.map(([tur, kisa]) => {
        const on = tur === secili;
        const bekliyor = uretilen === tur;
        const kilitli = !!uretilen || pasif;
        return (
          <button key={tur} type="button" onClick={() => onSec(tur)} disabled={kilitli || on}
            aria-pressed={on} {...focusRing}
            title={`${YAZI_TR(tur)}${tur === onerilen ? " · sistem önerisi" : ""} — seçilen türe göre taslak yeniden üretilir`}
            onMouseEnter={(e) => { if (!on && !kilitli) e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = on ? ALFA(V) : PAL.surf; }}
            style={{
              cursor: on || kilitli ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", minHeight: 26, borderRadius: RAD.chip,
              border: `1px solid ${on ? DERIN.V : PAL.inputLine}`,
              background: on ? ALFA(V) : PAL.surf, ...TYPE.meta, fontWeight: on ? 600 : 400,
              color: kilitli && !bekliyor && !on ? PAL.mut2 : on ? DERIN.V : PAL.ink2,
              transition: "background .12s ease-out",
            }}>
            {tur === onerilen && (
              <span aria-hidden="true" title="Sistem önerisi"
                style={{ width: 5, height: 5, borderRadius: RAD.dot, background: on ? DERIN.V : PAL.mut, flexShrink: 0 }} />
            )}
            {bekliyor ? (
              <>
                <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: RAD.dot, background: DERIN.V, animation: "nu-think 1.2s ease-in-out infinite" }} />
                üretiliyor…
              </>
            ) : kisa}
          </button>
        );
      })}
    </div>
  );
}
