/* TaslakKararFisi — Taslaklar karar panelinin ÜST bölümü (eylemlerin üstündeki "fiş").
   2026-10 kullanıcı geri bildirimi: panel "üstte künye, altta düğmeler, arası boş" idi. Fiş,
   memurun Gönder demeden önce bakacağı şeyleri sırayla verir:
     konu → hüküm (risk bandı damgası) → yazının özü → muhatap / tür → mevzuat önerisi → künye.
   Risk YALNIZ bant etiketiyle söylenir (YEŞİL/SARI/KIRMIZI) — skor/yüzde YOK (CLAUDE.md §7).
   Mevzuat satırı "öneri"dir (RAG), doğrulanmış dayanak iddiası taşımaz. */
import { Fragment } from "react";
import { Damga, MONO, DISPLAY, PAL, BANT, DERIN_OF, TYPE, TNUM, SP } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR } from "./result-cards.jsx";

const dolu = (v) => v != null && String(v).trim() && v !== "—";

/* Yazının özü: gövdenin ilk anlamlı paragrafı (hitap/ilgi/künye satırları taslakOzeti'nde
   zaten ayıklanır). Kapanış kalıpları ("Bilgilerinize sunulur.") öz değildir. */
function ozCikar(govde = "") {
  const paragraflar = String(govde).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  return paragraflar.find((p) => p.length > 40 && !/^(Gereğini|Bilgilerinize|Bilgi ve gereğini|Saygılarımla)/i.test(p)) || paragraflar[0] || "";
}

const BaslikEtiket = ({ children }) => (
  <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>
);

export default function TaslakKararFisi({ h, r, ad, govde, tarih, sira, toplam }) {
  const bant = BANT[r.risk_metadata?.bant] || null;
  const oz = ozCikar(govde);
  const mevzuat = (Array.isArray(r.mevzuat_onerileri) ? r.mevzuat_onerileri : [])
    .map((m) => m?.baslik).filter(dolu).slice(0, 2);
  const kunye = [
    ["Muhatap birim", BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)], ["Evrak türü", EVRAK_TR(r.evrak_turu)], ["Yazı türü", YAZI_TR(r.yazi_turu)],
    ["Dosya", h.name, true], ["Tarih", tarih, true],
  ].filter(([, v]) => dolu(v));

  return (
    <div style={{ minWidth: 0 }}>
      {/* Antet şeridi — panelin ne olduğu + kuyruktaki yeri. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "0 20px", height: 34, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
        <span>Karar fişi</span>
        <span style={{ marginLeft: "auto", ...TNUM }}>
          <span style={{ color: PAL.ink2, fontWeight: 600 }}>{String(sira).padStart(2, "0")}</span> / {String(toplam).padStart(2, "0")}
        </span>
      </div>

      <div style={{ padding: "18px 20px 18px", display: "flex", flexDirection: "column", gap: SP.l }}>
        <div>
          <BaslikEtiket>Konu</BaslikEtiket>
          {/* Konu başlığı ÖLÇÜLÜ (18px) ve 3 satırla kelepçeli — konu satırları paragraf
              uzunluğunda gelebiliyor; dev başlık paneli yutuyordu. Tam metin title'da. */}
          <h3 title={ad} style={{ margin: 0, fontFamily: DISPLAY, fontSize: 18, lineHeight: "24px", fontWeight: 700, fontStretch: "104%", letterSpacing: "-.01em", color: PAL.ink,
            display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden", overflowWrap: "anywhere" }}>{ad}</h3>
        </div>

        {bant && (
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
            <Damga ton={bant.c} egim={-3} kucuk>{bant.l} bant</Damga>
            <span style={{ ...TYPE.meta, color: DERIN_OF(bant.c), fontWeight: 500 }}>{bant.t}</span>
          </div>
        )}

        {oz && (
          <div>
            <BaslikEtiket>Yazının özü</BaslikEtiket>
            <p title={oz} style={{ margin: 0, ...TYPE.data, color: PAL.ink2, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 4, overflow: "hidden" }}>{oz}</p>
          </div>
        )}

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
