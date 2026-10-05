import { useEffect, useState } from "react";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR } from "./result-cards.jsx";
import { kurumGorunur, katalogAdHaritasi, mevzuatGorunenAd, ondalikTr } from "../lib/sonucEtiket.js";
import { Chip, slaInfo, subSlaRenk, MevzuatRow, SlaPanel, DuzeltmeDiff, Vrow, Lint2646Karti } from "./NeonDetayParts.jsx";
import { mevzuatDipnot, birimDipnot, lintGiris, decomposeGiris, riskGerekceYorum, riskSkorYorum, canliKaynakYorum } from "../lib/detayYorum.js";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, RAD, SP, NeonCard, Icon, TYPE, TNUM } from "./neonUi.jsx";
import { arr, clean } from "./sonucOrtak.js";
import { KaynakLinki } from "./HukumKarti.jsx";
import { gosterimBirimi } from "../lib/gosterimBirimi.js";

export function AltTaleplerCard({ alt }) {
  if (alt.length < 2) return null;
  return (
    <NeonCard title="Belgedeki talepler" tag={`${alt.length} ayrı iş`} accent={T} icon={<Icon.route />} full>
      <p style={{ margin: "0 0 10px", ...TYPE.data, color: PAL.mut2 }}>{decomposeGiris(alt)}</p>
      <div className="sc-subject-grid">
        {alt.map((a, i) => {
          const asla = a.sla_durum ? slaInfo({ durum: a.sla_durum }) : null;
          const slaColor = subSlaRenk(a.sla_durum);
          return (
            <article key={i} className="sc-subject-item" style={{ borderColor: PAL.line, background: PAL.surf2 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
                <span style={{ ...TYPE.meta, color: DERIN.T, fontFamily: MONO, ...TNUM }}>{String(i + 1).padStart(2, "0")}</span>
                <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2 }}>{clean(a.ozet || "Alt talep")}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s }}>
                <span style={{ ...TYPE.meta, color: PAL.mut2 }}>
                  {[a.tur_tr || (a.tur && EVRAK_TR(a.tur)), (a.birim && BIRIM_GOSTER(a.birim, a.tur)) || a.birim_tr, a.yazi_turu && YAZI_TR(a.yazi_turu), a.cevap_suresi && clean(a.cevap_suresi)].filter(Boolean).join(" · ")}
                </span>
                {asla && slaColor && <Chip c={slaColor} label={`Alt-talep yasal süre durumu: ${asla.label}`}>{asla.label}</Chip>}
              </div>
            </article>
          );
        })}
      </div>
    </NeonCard>
  );
}

/* Mevzuat görünen adları — katalog (/mevzuat/katalog, RAG ile aynı korpus) oturumda BİR kez
   çekilir. Öneri başlığı backend'de dosya slug'ından türediği için Türkçe karaktersiz geliyordu
   ("kvkk aydinlatma yukumlulugu tebligi m.5"); resmî ad katalogdan okunur. Katalog gelmezse
   ham başlık kalır — ad uydurulmaz. */
let katalogSozu = null;
function katalogAdlari() {
  if (!katalogSozu) {
    katalogSozu = fetch("/mevzuat/katalog")
      .then((y) => (y.ok ? y.json() : null))
      .then((j) => katalogAdHaritasi(j))
      .catch(() => { katalogSozu = null; return new Map(); });
  }
  return katalogSozu;
}
function useKatalogAdlari(aktif) {
  const [harita, setHarita] = useState(null);
  useEffect(() => {
    if (!aktif) return undefined;
    let canli = true;
    katalogAdlari().then((h) => { if (canli) setHarita(h); });
    return () => { canli = false; };
  }, [aktif]);
  return harita;
}

export function MevzuatCard({ r, mev, nliMap, onMevzuatAc, onMevzuatSec, seciliSet }) {
  const adlar = useKatalogAdlari(mev.length > 0);
  if (!mev.length) return null;
  const secilebilir = !!onMevzuatSec;
  const secSay = mev.filter((m) => seciliSet.has(m.baslik)).length;
  // Dürüstlük sunumu: tüm öneriler zayıfsa (hepsi "düşük güven") panel, satır başına
  // tekrarlayan kırmızı "İnsan incelemesi önerilir" uyarısıyla BAŞARISIZ görünür — oysa
  // sistem dürüstçe "bu evrak için güçlü eşleşme yok" diyor. O durumu TEK sakin uyarıya
  // toplar ve satır-başı spam'ı bastırırız (inceleme={false}). Güven SAHTELENMEZ; yalnız
  // aynı dürüst bilgi bir kez, panik yaratmadan söylenir. Bir öneri bile "orta"/"yüksek"
  // ise satır-başı ayrımı bilgi taşır → eski davranış korunur.
  const hepsiZayif = mev.every((m) => (m.guven || "") === "düşük");
  return (
    <NeonCard
      title="Önerilen mevzuat"
      tag={secSay ? `${mev.length} öneri · ${secSay} işlendi` : `${mev.length} öneri`}
      tagColor={secSay ? DERIN.T : (hepsiZayif ? BANT.sari.c : undefined)}
      accent={T}
      icon={<Icon.book />}
      full
    >
      {hepsiZayif && (
        <div role="status" style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.m, marginBottom: SP.m, borderRadius: RAD.card, background: ALFA(BANT.sari.c), ...TYPE.data, color: PAL.ink2 }}>
          <Icon.alert width={15} height={15} style={{ flex: "none", marginTop: 1, color: DERIN.sari }} aria-hidden="true" />
          <span>
            <strong style={{ color: DERIN.sari, fontWeight: 600 }}>Güçlü bir mevzuat eşleşmesi bulunamadı.</strong>{" "}
            Aşağıdaki öneriler yalnızca sözcüksel benzerlikten geldi (düşük güven) ve bu talebi
            doğrudan karşılamayabilir. Dayanak olarak kullanmadan önce ilgili maddeyi açıp el ile doğrulayın.
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {mev.map((m, i) => (
          <MevzuatRow
            key={i}
            rank={i + 1}
            m={m}
            ad={mevzuatGorunenAd(m, adlar)}
            nli={nliMap.get(m.baslik)}
            ilk={i === 0}
            onAc={onMevzuatAc}
            secili={seciliSet.has(m.baslik)}
            onSec={secilebilir ? (checked) => onMevzuatSec(m, checked) : null}
            inceleme={!hepsiZayif}
          />
        ))}
      </div>
      <div style={{ marginTop: SP.m, display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.s, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: PAL.ink2 }}>
        <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1, color: DERIN.T }} />
        <span>
          {secilebilir
            ? "Öneriler otomatik eklenmez. Kutucuğu işaretlenen madde resmî yazıya dayanak olarak işlenir; işaret kaldırılınca taslak geri alınır."
            : "Bu öneriler bilgi amaçlıdır; atıf yapılacaksa madde açılıp doğrulanmalıdır."}
        </span>
      </div>
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{mevzuatDipnot(r)}</div>
    </NeonCard>
  );
}

export function ArchiveSlaCard({ r, arsiv, sdpAdaylar, sla, sInfo }) {
  const hasArchive = !!(arsiv.sdp_kodu || arsiv.saklama_suresi || arsiv.saklama || arsiv.sdp_adi || arsiv.sdp_gerekce);
  return (
    <NeonCard title="Dosyalama ve yasal süre" tag={hasArchive ? "SDP" : "süre takibi"} accent={T} icon={<Icon.grid />}>
      {hasArchive ? (
        <div className="sc-archive-grid">
          <span>
            <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Dosya planı · SDP (2005/7)</span>
            <span style={{ ...TYPE.data, fontWeight: 700, color: DERIN.V, ...TNUM }}>{clean(arsiv.sdp_kodu || "Atanmadı")}</span>
            {arsiv.sdp_adi && <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, marginTop: 2 }}>{clean(arsiv.sdp_adi)}</span>}
          </span>
          <span>
            <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Saklama süresi</span>
            <span style={{ ...TYPE.data, fontWeight: 700, color: PAL.ink2, ...TNUM }}>{clean(arsiv.saklama_suresi || arsiv.saklama || "Belirtilmedi")}</span>
          </span>
        </div>
      ) : (
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu sonuçta arşiv sınıflandırması üretilmedi.</p>
      )}

      {arsiv.sdp_gerekce && (
        <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "8px 0 0" }}>
          <span style={{ color: DERIN.T }}>Otomatik atama: </span>{clean(arsiv.sdp_gerekce)}
        </div>
      )}

      {sdpAdaylar.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, margin: "8px 0 0" }}>
          {sdpAdaylar.map((a, i) => (
            <span key={a.kod || i} title={a.ad} style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: i === 0 ? DERIN.T : PAL.mut2, ...TNUM }}>
              {a.kod} · {ondalikTr(a.skor, 1)}
            </span>
          ))}
        </div>
      )}

      <SlaPanel sla={sla} info={sInfo} />
      {!r.sla_metadata && <span style={{ display: "block", marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Yasal süre bilgisi bulunamadı.</span>}
    </NeonCard>
  );
}

export function RiskCard({ r, band, bantC }) {
  const riskGerekce = arr(r.risk_metadata?.gerekceler).slice(0, 5);
  if (!r.risk_metadata?.aciklama && !riskGerekce.length && !r.risk_metadata?.skor) return null;
  const yorumlar = riskGerekce.map((g) => riskGerekceYorum(String(g))).filter(Boolean);
  const skor = riskSkorYorum(Number(r.risk_metadata?.skor), r.risk_metadata?.katkilar, band,
    r.risk_metadata?.kalibrasyon, r.risk_metadata?.kusur_olasiligi);
  const seviyeGoster = skor?.seviye ? skor.seviye[0].toUpperCase() + skor.seviye.slice(1) : null;

  return (
    <NeonCard title="Risk değerlendirmesi" tag={BANT[band]?.l} tagColor={bantC} accent={V} icon={<Icon.alert />}>
      {skor && (
        <div className="sc-risk-gauge-row" style={{ marginBottom: SP.m }}>
          {/* Puan BİRİMSİZDİR — "/ 1" ölçeği açıkça yazılır. Eskiden "%87" sunuluyordu ve bu,
              beklenen zararı olasılık gibi okutuyordu (bkz. riskSkorYorum doküman bloğu).
              Yüzde YALNIZ kusur olasılığı için kullanılır; o da ayrı satırda etiketiyle. */}
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2, flexShrink: 0 }}>
            <span style={{ ...TYPE.num, color: bantC }}>{skor.puan}</span>
            <span style={{ ...TYPE.meta, color: PAL.mut2 }}>/ 1</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {seviyeGoster && <div style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{seviyeGoster}</div>}
            <span className="sc-risk-gauge-track" aria-hidden="true" style={{ display: "block", marginTop: 6, background: PAL.press }}>
              <span className="sc-risk-gauge-fill" style={{ width: `${Math.min(100, skor.dolgu)}%`, background: bantC }} />
            </span>
            {skor.olasilikYuzde != null && (
              <div style={{ marginTop: 4, ...TYPE.meta, color: PAL.mut2 }}>
                Kusur olasılığı %{skor.olasilikYuzde} — ölçülen isabet oranlarından.
              </div>
            )}
          </div>
        </div>
      )}
      {r.risk_metadata?.aciklama && r.risk_metadata.aciklama !== r.risk_metadata?.oneri && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s }}>
          <Icon.info width={14} height={14} style={{ flex: "none", marginTop: 2, color: PAL.mut2 }} />
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>{clean(r.risk_metadata.aciklama)}</span>
        </div>
      )}
      {yorumlar.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: r.risk_metadata?.aciklama ? SP.s : 0 }}>
          {yorumlar.map((yorum, i) => {
            const pay = skor?.paylar?.[i];
            const payEtiket = skor?.payEtiketleri?.[i];
            return (
              <div key={i} className="sc-risk-reason">
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: bantC, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0, color: PAL.mut2 }}>{yorum.cevrildi ? yorum.sade : clean(yorum.sade)}</span>
                {pay != null && (
                  <>
                    <span className="sc-risk-meter" aria-hidden="true" style={{ background: PAL.press }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.min(100, pay)}%`, background: bantC }} />
                    </span>
                    {/* Ağırlık birimsizdir (CLAUDE.md §7) — "%21" değil "0,21". */}
                    <span title="Bu nedenin ağırlığı (ciddiyet × isabet), birimsiz" style={{ ...TYPE.meta, ...TNUM, color: PAL.mut3, width: 34, textAlign: "right", flexShrink: 0 }}>{payEtiket}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {skor && (skor.not || skor.kalibrasyonNot) && (
        <div className="sc-positive-callout" style={{ marginTop: SP.m, background: PAL.surf2, color: PAL.mut2 }}>
          <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1 }} />
          <span>{skor.not} {skor.kalibrasyonNot}</span>
        </div>
      )}
    </NeonCard>
  );
}

export function ValidationCard({ r, uyari, tutar }) {
  const lintFix = r.lint_duzeltme_md;
  // Yazışma kuralı uyarıları da sayılır: aynı ekranda "uyumlu" etiketi ile "1 uyarı (m.15)"
  // yan yana duruyordu (bağımsız denetim). Format satırı da lint uyarısını görür.
  const lintUyari = arr(r.lint_2646?.uyari).length;
  const toplam = uyari.length + tutar.length + lintUyari;
  const formatTemiz = !!r.format_uyumlu && !lintUyari;
  return (
    <NeonCard
      title="Taslak doğrulaması"
      tag={toplam ? `${toplam} uyarı` : "uyumlu"}
      tagColor={toplam ? BANT.sari.c : BANT.yesil.c}
      accent={V}
      icon={<Icon.shield />}
    >
      <Vrow ok={!uyari.length} label="Kaynak kontrolü" val={uyari.length ? `${uyari.length} işaret` : "temiz"} />
      <Vrow ok={formatTemiz} label="Format (Yön. 2646)" val={formatTemiz ? "uyumlu" : lintUyari ? `${lintUyari} kural uyarısı` : "kontrol"} />
      <Vrow ok={!tutar.length} label="Veri tutarlılığı" val={tutar.length ? `${tutar.length} uyarı` : "temiz"} />
      {r.verify_notes && !toplam && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}>{clean(r.verify_notes)}</div>}
      {uyari.slice(0, 5).map((u, i) => (
        <div key={i} className="sc-warning-row" style={{ color: DERIN.sari }}>
          <Icon.alert style={{ flex: "none", marginTop: 2 }} /> {clean(u)}
        </div>
      ))}
      {tutar.slice(0, 4).map((u, i) => (
        <div key={`t${i}`} className="sc-warning-row" style={{ color: DERIN.sari }}>
          <Icon.alert style={{ flex: "none", marginTop: 2 }} /> {clean(u)}
        </div>
      ))}
      {lintFix && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>Önerilen düzeltme (Yön. 2646) · mevcut taslakla fark</div>
          <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>Otomatik öneri; memur onayı olmadan uygulanmaz.</div>
          <DuzeltmeDiff eski={clean(r.yazi_taslak_md || "")} yeni={clean(lintFix)} />
        </div>
      )}
    </NeonCard>
  );
}

export function RoutingCard({ r, birimAday }) {
  // hedef_birim yalnız kaynak-doğrulanmış GERÇEK birimde dolu (route_ajan.dogrulandi);
  // doğrulanamadığında (fallback_onerisi) None döner AMA birim_reasoning yine üretilir
  // (route_ajan.py her iki dalda da yazar) — kart hedef_birim'e kilitliyse bu gerekçe hiç
  // görünmez (kullanıcı bulgusu: şartname "süreç bilgilendirmesi" gereksinimiyle çelişir).
  //
  // CANLI KAYNAK: korpusta karşılığı olmayan kuruma evrak düştüğünde backend, kurumun
  // KENDİ resmî sitesinden okunmuş bir öneri + kaynak linki döndürür. Kart bu durumda da
  // AÇILIR (eskiden `birim` yoksa null dönüyordu ve özelliğin tamamı görünmezdi).
  const canli = canliKaynakYorum(r);
  const korpusBirim = gosterimBirimi(r);
  // Öncelik havaleYorum ile BİREBİR AYNI olmalı (doğrulanmış > canlı spesifik > jenerik):
  // iki yerde farklı sıralarsak karar şeridi ile bu kart birbirini yalanlar.
  const canliBirim = !r.hedef_birim && canli && !canli.dogrulanmis ? canli.birimOneri : "";
  const birim = r.hedef_birim || canliBirim || korpusBirim;
  if (!birim && !canli) return null;
  const dogrulandi = r.durum === "kaynak_dogrulandi" && !!r.hedef_birim;
  const canlidanGeldi = !!canliBirim && birim === canliBirim;
  // Canlı öneri 1. sıraya geçtiyse jenerik korpus adayı SİLİNMEZ, alternatiflere iner —
  // memur iki seçeneği de görsün.
  const adaylar = [...new Set(
    (canlidanGeldi && korpusBirim ? [korpusBirim, ...birimAday] : birimAday).filter((b) => b && b !== birim),
  )];
  const kurum = kurumGorunur(r.hedef_kurum_adi || r.hedef_birim_kaynak?.kaynak_kurum || r.yetkili_kurum?.ad || r.muhatap_kurum?.ad || "");
  return (
    <NeonCard title="Birim yönlendirme" tag={adaylar.length ? `${adaylar.length + 1} aday` : null} accent={V} icon={<Icon.route />}>
      {kurum && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>Kurum</span>
          <strong style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{clean(kurum)}</strong>
        </div>
      )}
      {/* GÖNDEREN ayrı gösterilir: nominatif T.C. anteti bir zamanlar MUHATAP sanılıyor ve
          evrak kendi göndericisine havale ediliyordu. Artık havale hedefi olamaz; memurun
          ikisini karıştırmaması için künye açıkça yazılır. */}
      {r.gonderen_kurum?.ad && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>Gönderen</span>
          <span style={{ ...TYPE.data, color: PAL.mut2 }}>{clean(r.gonderen_kurum.ad)}</span>
          <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut3 }}>havale hedefi değil</span>
        </div>
      )}
      {birim && (
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>1.</span>
        <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>Havale birimi</span>
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2 }}>{BIRIM_GOSTER(birim, r.evrak_turu)}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 600, color: dogrulandi ? DERIN.V : DERIN.sari }}>
          {dogrulandi
            ? (<><Icon.check width={12} height={12} /> önerilen</>)
            : canlidanGeldi
              ? (<><Icon.kure width={12} height={12} /> canlı · doğrulanmadı</>)
              : (<><Icon.alert width={12} height={12} /> doğrulanmadı</>)}
        </span>
      </div>
      )}
      {/* Numaralandırma 1. satırın GERÇEKTEN basılıp basılmadığına bağlanır. Sabit `i+2`
          yazılırsa, birim yokken (yalnız canlı kaynak olan kart) liste "2."den başlar. */}
      {adaylar.map((b, i) => (
        <div key={b} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{i + (birim ? 2 : 1)}.</span>
          <span style={{ ...TYPE.data, color: PAL.mut2 }}>{BIRIM_GOSTER(b, r.evrak_turu)}</span>
        </div>
      ))}
      {r.servis_birimi?.ad && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "8px 0 2px", marginTop: SP.xs, borderTop: `1px dashed ${PAL.line}` }}>
          <Icon.route width={13} height={13} style={{ color: DERIN_OF(V), flex: "none", marginTop: 2 }} />
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>
            <span style={{ color: PAL.mut2 }}>İçerik sinyalinden havale önerisi (kayıt birimi üzerinden): </span>
            <strong style={{ fontWeight: 700 }}>{r.servis_birimi.ad}</strong>
            {arr(r.servis_birimi.sinyal).length > 0 && <span style={{ ...TYPE.meta, color: PAL.mut3 }}> · içerik: {arr(r.servis_birimi.sinyal).join(", ")}</span>}
          </span>
        </div>
      )}
      {canli && (
        /* CANLI KAYNAK PANELİ — provenance'ı gözle ayırt edilebilir kılar.
           Tint zemin + sarı metin bilinçli: bu blok korpustan GELMEYEN veriyi taşır ve
           memur onu doğrulanmış birimle karıştırmamalı. Panel hiçbir koşulda yeşile
           dönmez; `dogrulanmis` künyeden true gelse bile (gelmemeli) metin "insan
           incelemesinden geçmedi" der, çünkü bu iddiayı doğrulayacak bir imza yok. */
        <div
          style={{
            marginTop: SP.s, padding: "8px 12px", borderRadius: RAD.card,
            background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginBottom: 4 }}>
            <span aria-hidden="true" style={{ display: "flex", color: DERIN.sari }}><Icon.kure /></span>
            <strong style={{ ...TYPE.meta, fontWeight: 700, color: DERIN.sari }}>
              Canlı kaynak — doğrulanmadı
            </strong>
            <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut2, textAlign: "right" }}>
              {canli.birimSayisi > 0 && (
                <span style={{ fontFamily: MONO, ...TNUM }}>{canli.birimSayisi} birim</span>
              )}
              {/* Bulunma yolu denetlenebilirlik içindir: memur "sistem bunu nereden aldı?"
                  sorusunu sormadan görsün. Cümleye gömülmez — kendi başına durur. */}
              {canli.yol && <span> · {clean(canli.yol)}</span>}
            </span>
          </div>
          {canli.birimOneri && (
            <div style={{ ...TYPE.data, color: PAL.ink2, marginBottom: 4 }}>
              Sayfadan okunan öneri: <strong style={{ fontWeight: 700 }}>{clean(canli.birimOneri)}</strong>
            </div>
          )}
          <KaynakLinki canli={canli} />
          {/* Sayfadan okunan diğer birimler: öneri yanlışsa memur listeye bakıp doğrusunu
              seçebilsin. Önerinin kendisi tekrarlanmaz. */}
          {canli.ornekler.filter((b) => b !== canli.birimOneri).length > 0 && (
            <div style={{ marginTop: 4, ...TYPE.meta, color: PAL.mut2 }}>
              Sayfadaki diğer birimler:{" "}
              {canli.ornekler.filter((b) => b !== canli.birimOneri).slice(0, 3).map(clean).join(" · ")}
            </div>
          )}
          <p style={{ margin: "6px 0 0", ...TYPE.meta, color: PAL.mut2 }}>
            Bu kurumun doğrulanmış teşkilat kaydı yok. Sistem kurumun kendi resmî sitesini
            bulup birim sayfasını okudu; kayıt manifest ve insan incelemesinden{" "}
            <strong style={{ fontWeight: 700 }}>geçmedi</strong>.
            Havale etmeden önce linke bakıp birimi teyit edin.
          </p>
        </div>
      )}
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{clean(birimDipnot(r))}</div>
    </NeonCard>
  );
}

export function LintCard({ lint, lintKurallar, lintUyariSay }) {
  if (!lintKurallar.length) return null;
  return (
    <NeonCard
      title="Resmî yazışma kuralları"
      tag={`${lint.ozet?.gecti ?? 0}/${lintKurallar.length} kural`}
      tagColor={lintUyariSay ? BANT.sari.c : BANT.yesil.c}
      accent={V}
      icon={<Icon.shield />}
    >
      <Lint2646Karti lint={lint} giris={lintGiris(lint)} />
    </NeonCard>
  );
}
