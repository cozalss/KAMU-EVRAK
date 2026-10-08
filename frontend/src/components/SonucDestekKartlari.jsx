import { useEffect, useState } from "react";
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR } from "../lib/evrakEtiket.js";
import { kurumGorunur, katalogAdHaritasi, mevzuatGorunenAd, ondalikTr } from "../lib/sonucEtiket.js";
import { Chip, slaInfo, subSlaRenk, MevzuatRow, SlaPanel, DuzeltmeDiff, Vrow, Lint2646Karti } from "./NeonDetayParts.jsx";
import { mevzuatDipnot, birimDipnot, lintGiris, decomposeGiris, riskGerekceYorum, riskSkorYorum, canliKaynakYorum } from "../lib/detayYorum.js";
import { MONO, T, V, PAL, BANT, DERIN, ALFA, RAD, SP, NeonCard, Icon, TYPE, TNUM, focusRing } from "./neonUi.jsx";
import { arr, clean } from "./sonucOrtak.js";
import { KaynakLinki } from "./HukumKarti.jsx";
import { gosterimBirimi } from "../lib/gosterimBirimi.js";
import { mevzuatBolumleri } from "../lib/mevzuatGrup.js";
import { talepKarari } from "../lib/yazismaPaketi.js";

/* Talep başına yönlendirme kararı (KARMA belgede her talep ayrı karar alır): kurum içi
   birim ya da yetkili makama devir. Karar backend'in talep bazlı alanlarından okunur
   (lib/yazismaPaketi.talepKarari); devir moru + "Devir:" metni — renk tek sinyal değil. */
function TalepKarariSatiri({ a }) {
  const k = talepKarari(a);
  if (!k.etiket) return null;
  const c = k.tur === "devir" ? V : k.tur === "birim" ? T : BANT.sari.c;
  return (
    <p style={{ margin: `${SP.s}px 0 0`, display: "flex", alignItems: "center", gap: SP.xs, flexWrap: "wrap", ...TYPE.meta }}>
      <Chip c={c} label={`Yönlendirme kararı: ${k.etiket}`}>
        {k.tur === "devir" ? <Icon.route width={12} height={12} /> : <Icon.check width={12} height={12} />}
        {k.etiket}
      </Chip>
      <span style={{ color: PAL.mut2 }}>{k.ayrinti}</span>
    </p>
  );
}

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
              <TalepKarariSatiri a={a} />
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

function MevzuatBolumBasligi({ b }) {
  if (!b.baslik) return null;
  return (
    <div style={{ margin: `${SP.m}px 0 ${SP.xs}px`, ...TYPE.meta, fontWeight: 600, color: b.tur === "usul" ? DERIN.V : DERIN.T }}>
      {b.baslik}
    </div>
  );
}

function MevzuatBulunamadi() {
  return (
    <div role="status" style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.s, borderRadius: RAD.card, background: ALFA(BANT.sari.c), ...TYPE.data, color: PAL.ink2 }}>
      <Icon.alert width={14} height={14} style={{ flex: "none", marginTop: 2, color: DERIN.sari }} aria-hidden="true" />
      <span>Korpusta bu talebe doğrudan uygun mevzuat bulunamadı — dayanağı memur belirlemeli.</span>
    </div>
  );
}

/* Teknik sıralama notu (BM25…) memura yüzeyde gösterilmez (2. jüri: jargon); sade cümle
   kalır, ayrıntı "Nasıl sıralandı?" açılırında. Kalan dipnot cümleleri aynen basılır. */
const TEKNIK_SIRALAMA_RE = /^Sıralama BM25[^.]*\.\s*/;
function MevzuatDipnotu({ r }) {
  const dip = mevzuatDipnot(r);
  if (!dip) return null;
  const teknik = dip.match(TEKNIK_SIRALAMA_RE)?.[0]?.trim();
  const kalan = teknik ? dip.replace(TEKNIK_SIRALAMA_RE, "") : dip;
  return (
    <div className="kd-kart-dip" style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
      {teknik && "Sözcük eşleşmesine göre sıralandı; madde metnini doğrulayın. "}
      {kalan}
      {teknik && (
        <details style={{ marginTop: 4 }}>
          <summary {...focusRing} style={{ cursor: "pointer", width: "fit-content", color: PAL.mut2, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>Nasıl sıralandı?</summary>
          <p style={{ margin: "4px 0 0", color: PAL.mut3 }}>{teknik}</p>
        </details>
      )}
    </div>
  );
}

export function MevzuatCard({ r, mev, nliMap, onMevzuatAc, onMevzuatSec, seciliSet }) {
  const { gruplu, bolumler } = mevzuatBolumleri(mev, r);
  const adlar = useKatalogAdlari(mev.length > 0);
  if (!bolumler.length) return null;
  const secilebilir = !!onMevzuatSec;
  const secSay = mev.filter((m) => seciliSet.has(m.baslik)).length;
  // Dürüstlük sunumu: tüm öneriler zayıfsa (hepsi "düşük güven") panel, satır başına
  // tekrarlayan kırmızı "İnsan incelemesi önerilir" uyarısıyla BAŞARISIZ görünür — oysa
  // sistem dürüstçe "bu evrak için güçlü eşleşme yok" diyor. O durumu TEK sakin uyarıya
  // toplar ve satır-başı spam'ı bastırırız (inceleme={false}). Güven SAHTELENMEZ; yalnız
  // aynı dürüst bilgi bir kez, panik yaratmadan söylenir. Bir öneri bile "orta"/"yüksek"
  // ise satır-başı ayrımı bilgi taşır → eski davranış korunur.
  // Usul katmanı (başvuru usulü) içerik eşleşmesi değildir → "hepsi zayıf" yargısına girmez.
  const icerik = mev.filter((m) => m.katman !== "usul");
  const hepsiZayif = icerik.length > 0 && icerik.every((m) => (m.guven || "") === "düşük");
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
      {bolumler.map((b) => (
        <section key={b.anahtar} aria-label={b.baslik || undefined}>
          {gruplu && <MevzuatBolumBasligi b={b} />}
          {b.bulunamadi && <MevzuatBulunamadi />}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {b.ogeler.map(({ m, sira }) => (
              <div key={`${b.anahtar}-${sira}`}>
                <MevzuatRow
                  rank={sira}
                  m={m}
                  ad={mevzuatGorunenAd(m, adlar)}
                  nli={nliMap.get(m.baslik)}
                  ilk={sira === 1}
                  onAc={onMevzuatAc}
                  secili={seciliSet.has(m.baslik)}
                  onSec={secilebilir ? (checked) => onMevzuatSec(m, checked) : null}
                  inceleme={!hepsiZayif}
                />
                {m.gerekce && m.katman !== "usul" && (
                  <div style={{ margin: "0 0 6px", paddingLeft: SP.xl, ...TYPE.meta, color: PAL.mut2 }}>
                    Neden: {clean(m.gerekce)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <div style={{ marginTop: SP.m, display: "flex", gap: SP.s, alignItems: "flex-start", padding: SP.s, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: PAL.ink2 }}>
        <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1, color: DERIN.T }} />
        <span>
          {secilebilir
            ? "Öneriler otomatik eklenmez. Kutucuğu işaretlenen madde resmî yazıya dayanak olarak işlenir; işaret kaldırılınca taslak geri alınır."
            : "Bu öneriler bilgi amaçlıdır; atıf yapılacaksa madde açılıp doğrulanmalıdır."}
        </span>
      </div>
      <MevzuatDipnotu r={r} />
    </NeonCard>
  );
}

export function ArchiveSlaCard({ r, arsiv, sdpAdaylar, sla, sInfo }) {
  const hasArchive = !!(arsiv.sdp_kodu || arsiv.saklama_suresi || arsiv.saklama || arsiv.sdp_adi || arsiv.sdp_gerekce);
  return (
    <NeonCard title="Dosyalama ve yasal süre" tag={hasArchive ? "SDP" : "süre takibi"} accent={T} icon={<Icon.grid />}>
      {hasArchive ? (
        /* Künye = dl, üç eşit hücre (tur 8): kod · plan başlığı · saklama. Etiketler mono antet. */
        <dl className="sc-archive-grid" style={{ margin: 0 }}>
          <div style={{ minWidth: 0 }}>
            <dt style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>Dosya planı · SDP</dt>
            <dd style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: DERIN.V, ...TNUM }}>{clean(arsiv.sdp_kodu || "Atanmadı")}</dd>
          </div>
          <div style={{ minWidth: 0 }}>
            <dt style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>Plan başlığı</dt>
            <dd style={{ margin: "4px 0 0", ...TYPE.data, color: arsiv.sdp_adi ? PAL.ink2 : PAL.mut2 }}>{arsiv.sdp_adi ? clean(arsiv.sdp_adi) : "Belirtilmedi"}</dd>
          </div>
          <div style={{ minWidth: 0 }}>
            <dt style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>Saklama süresi</dt>
            <dd style={{ margin: "4px 0 0", ...TYPE.data, fontWeight: 600, color: PAL.ink2, ...TNUM }}>{clean(arsiv.saklama_suresi || arsiv.saklama || "Belirtilmedi")}</dd>
          </div>
        </dl>
      ) : (
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu sonuçta arşiv sınıflandırması üretilmedi.</p>
      )}

      {arsiv.sdp_gerekce && (
        <div style={{ ...TYPE.meta, color: PAL.mut2, margin: "8px 0 0" }}>
          <span style={{ color: DERIN.T }}>Otomatik atama: </span>{clean(arsiv.sdp_gerekce)}
        </div>
      )}

      {/* Aday dizisi ETİKETLİ (jüri tur 8: "622.03 · 2,5 100 · 1,0" çözümsüz mono diziydi):
          künye "Diğer adaylar", her aday "kod — ad" ve eşleşme puanı ayrı, adlandırılmış. */}
      {sdpAdaylar.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: `4px ${SP.m}px`, margin: "8px 0 0" }}>
          <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>SDP adayları</span>
          {sdpAdaylar.map((a, i) => (
            <span key={a.kod || i} title={a.ad ? `${a.kod} — ${a.ad}` : a.kod} style={{ ...TYPE.meta, color: i === 0 ? DERIN.T : PAL.mut2 }}>
              <span style={{ fontFamily: MONO, ...TNUM }}>{a.kod}</span>
              {a.ad && <span> {clean(a.ad)}</span>}
              {Number.isFinite(Number(a.skor)) && <span style={{ color: PAL.mut3 }}> · eşleşme puanı <span style={{ fontFamily: MONO, ...TNUM }}>{ondalikTr(a.skor, 1)}</span></span>}
            </span>
          ))}
        </div>
      )}

      <SlaPanel sla={sla} info={sInfo} />
      {!r.sla_metadata && <span style={{ display: "block", marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Yasal süre bilgisi bulunamadı.</span>}
    </NeonCard>
  );
}

const OLASILIK_KAYNAK = {
  olculdu: "ölçülen isabet oranlarından.",
  kismi: "kısmen ölçülmüş isabet oranlarından; kalanı öngörü.",
  onsel: "öngörü değeri; isabet oranları henüz ölçülmedi.",
  temiz: "ölçülen isabet oranlarından.",
};

export function RiskCard({ r, band, bantC }) {
  const riskGerekce = arr(r.risk_metadata?.gerekceler).slice(0, 5);
  if (!r.risk_metadata?.aciklama && !riskGerekce.length && !r.risk_metadata?.skor) return null;
  const yorumlar = riskGerekce.map((g) => riskGerekceYorum(String(g))).filter(Boolean);
  const skor = riskSkorYorum(Number(r.risk_metadata?.skor), r.risk_metadata?.katkilar, band,
    r.risk_metadata?.kalibrasyon, r.risk_metadata?.kusur_olasiligi);
  // Ölçüm beyanı TEK bayraktan (risk_metadata.kalibrasyon): olasılık satırı ile kalibrasyon
  // notu aynı kartta çelişmesin (2. jüri: "ölçülen isabet" + "henüz ölçülmedi" yan yanaydı).
  const kalib = r.risk_metadata?.kalibrasyon;
  const notGoster = skor && (skor.not || (skor.olasilikYuzde == null ? skor.kalibrasyonNot : null));
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
                Kusur olasılığı %{skor.olasilikYuzde} — {OLASILIK_KAYNAK[kalib] || OLASILIK_KAYNAK.onsel}
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
                <span style={{ flex: 1, minWidth: 0, color: PAL.mut2 }}>{gerekceSade(yorum.cevrildi ? yorum.sade : clean(yorum.sade))}</span>
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
      {notGoster && (
        <div className="sc-positive-callout kd-kart-dip" style={{ marginTop: SP.m, background: PAL.surf2, color: PAL.mut2 }}>
          <Icon.info width={13} height={13} style={{ flex: "none", marginTop: 1 }} />
          <span>{skor.not} {skor.olasilikYuzde == null ? skor.kalibrasyonNot : null}</span>
        </div>
      )}
    </NeonCard>
  );
}

/* Risk gerekçesinde iç içe ham etiket ("… — (mevzuat kanıtı) Doğrulanmış…") memura
   gösterilmez; tire sonrası cümle büyük harfle sürer (2. jüri: ham etiket). */
const ICTEKI_ETIKET_RE = /(—\s*)\(([^)]{2,40})\)\s*(\S)/u;
const gerekceSade = (t) => String(t ?? "").replace(ICTEKI_ETIKET_RE, (_, tire, _e, ilk) => tire + ilk.toLocaleUpperCase("tr-TR"));

/* Ham sinyal etiketi ("(mevzuat kanıtı) Doğrulanmış…") cümlenin başına yapışık gelmesin
   (2. jüri): etiket ayrı mono künye olur, cümle büyük harfle başlar. */
const ETIKET_RE = /^\s*\(([^)]{2,40})\)\s*/;
function UyariSatiri({ metin }) {
  const ham = clean(metin);
  const m = ham.match(ETIKET_RE);
  const govde = m ? ham.slice(m[0].length) : ham;
  const cumle = govde ? govde.charAt(0).toLocaleUpperCase("tr-TR") + govde.slice(1) : govde;
  return (
    <div className="sc-warning-row" style={{ color: DERIN.sari }}>
      <Icon.alert style={{ flex: "none", marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>
        {m && (
          <span style={{ display: "inline-block", marginRight: SP.s, padding: "0 6px", border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, ...TYPE.antet, color: PAL.mut2, verticalAlign: 1 }}>
            {m[1].toLocaleUpperCase("tr-TR")}
          </span>
        )}
        {cumle}
      </span>
    </div>
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
      {uyari.slice(0, 5).map((u, i) => <UyariSatiri key={i} metin={u} />)}
      {tutar.slice(0, 4).map((u, i) => <UyariSatiri key={`t${i}`} metin={u} />)}
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

/* Model/satıcı künyesi ("[DeepSeek+kaynak]") memura sızmaz — gerekçe kullanıcı dilinde (jüri tur 8). */
const SATICI_RE = /\s*\[(?:deepseek|openai|llm|gpt)[^\]]*\]\s*/gi;
const saticiEtiketiniSuz = (s) => String(s || "").replace(SATICI_RE, " ").replace(/\s{2,}/g, " ").trim();

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
      {/* SERVİS BİRİMİ İPUCU (jüri tur 8, yüksek): tek havale kararının altında ikinci, RAKİP bir
          havale önerisi basılıyordu (bakanlık evrakına belediye müdürlüğü) — "yönlendirme tek
          kaynak" sözleşmesini görsel olarak bozuyordu. Artık YALNIZ karar birimi yokken, katlı
          "ek bilgi" olarak görünür; havale önerisi değil, kayıt biriminin içerik ipucudur. */}
      {r.servis_birimi?.ad && !birim && (
        <details style={{ marginTop: SP.xs, padding: "6px 0 2px", borderTop: `1px dashed ${PAL.line}`, ...TYPE.meta, color: PAL.mut2 }}>
          <summary {...focusRing} style={{ cursor: "pointer", color: PAL.mut2 }}>Ek bilgi · kayıt biriminin içerik ipucu</summary>
          <span style={{ display: "block", marginTop: 4, ...TYPE.data, color: PAL.ink2 }}>
            {r.servis_birimi.ad}
            {arr(r.servis_birimi.sinyal).length > 0 && <span style={{ ...TYPE.meta, color: PAL.mut3 }}> · içerik: {arr(r.servis_birimi.sinyal).join(", ")}</span>}
          </span>
        </details>
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
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{saticiEtiketiniSuz(clean(birimDipnot(r)))}</div>
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
