/* MevzuatView — ilgili kamu mevzuatı referansı. Sabit çekirdek katalog (sistemin dayandığı
   mevzuat) + bu oturumda işlenen evraklarda RAG'in önerdiği mevzuat (gerçek). */
import React from "react";
import { ViewWrap, NeonCard, Icon, MONO, SANS, T, V, PAL } from "./neonUi.jsx";
import { cleanDemoText } from "./result-cards.jsx";

const KATALOG = [
  { no: "3071 s.K.", ad: "Dilekçe Hakkının Kullanılmasına Dair Kanun", aciklama: "Zorunlu unsurlar (ad-soyad, imza, adres) ve 30 günlük cevap süresi (m.4, m.7)." },
  { no: "4982 s.K.", ad: "Bilgi Edinme Hakkı Kanunu", aciklama: "Bilgi/belge taleplerinde 15 iş günü cevap süresi ve istisnalar." },
  { no: "7201 s.K.", ad: "Tebligat Kanunu", aciklama: "Resmî tebligat usulü; dava açma sürelerinin başlangıcı." },
  { no: "Yön. 2646", ad: "Resmî Yazışmalarda Usul ve Esaslar Yönetmeliği", aciklama: "Üst/cevabi/olur yazı formatı, sayı-konu-ilgi düzeni, e-imza." },
  { no: "5018 s.K.", ad: "Kamu Mali Yönetimi ve Kontrol Kanunu", aciklama: "Ödeme/tahakkuk süreçleri; mali evrak yönlendirme." },
  { no: "SDP 2005/7", ad: "Standart Dosya Planı (Başbakanlık Genelgesi)", aciklama: "Evrak saklama/arşiv kodları ve saklama süreleri." },
  { no: "6698 s.K.", ad: "Kişisel Verilerin Korunması Kanunu (KVKK)", aciklama: "TCKN/telefon gibi kişisel verilerin maskelenmesi ve işlenme ilkeleri." },
];

export default function MevzuatView({ history = [] }) {
  // Oturumda RAG'in önerdiği mevzuat (gerçek), başlığa göre tekilleştir.
  const seen = new Map();
  for (const h of history) for (const m of (h.result?.mevzuat_onerileri || [])) {
    if (m?.baslik && !seen.has(m.baslik)) seen.set(m.baslik, m);
  }
  const onerilen = [...seen.values()];

  return (
    <ViewWrap id="mevzuat-h" title="Mevzuat" sub="Sistemin dayandığı çekirdek mevzuat + işlenen evraklarda önerilen kaynaklar">
      {onerilen.length > 0 && (
        <NeonCard title={`Bu Oturumda Önerilen Mevzuat (RAG)`} tag={`${onerilen.length} kaynak`} accent={T} style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 12 }}>
            {onerilen.map((m, i) => (
              <div key={i} style={{ borderLeft: "2px solid rgba(47,143,166,.4)", paddingLeft: 11 }}>
                <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: PAL.ink2 }}>{cleanDemoText(m.baslik)}</div>
                {m.snippet && <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, lineHeight: 1.5 }}>{cleanDemoText(m.snippet)}</p>}
              </div>
            ))}
          </div>
        </NeonCard>
      )}

      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2, margin: "4px 0 12px" }}>ÇEKİRDEK MEVZUAT KATALOĞU</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px,1fr))", gap: 14, alignItems: "start" }}>
        {KATALOG.map((k) => (
          <div key={k.no} style={{ display: "flex", gap: 13, padding: "15px 17px", borderRadius: 12, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
            <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(47,143,166,.12)", color: T }}><Icon.book /></span>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: T }}>{k.no}</span>
                <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: PAL.ink2 }}>{k.ad}</span>
              </div>
              <p style={{ margin: "5px 0 0", fontFamily: MONO, fontSize: 11, color: PAL.mut2, lineHeight: 1.55 }}>{k.aciklama}</p>
            </div>
          </div>
        ))}
      </div>
    </ViewWrap>
  );
}
