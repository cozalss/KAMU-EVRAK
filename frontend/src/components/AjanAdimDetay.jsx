/* AjanAdimDetay — Ajan izi istasyonuna tıklanınca açılan adım detay modalı.
   Her ajan adımının NE yaptığını (görev açıklaması) ve NE ürettiğini (node-tipine özel
   zengin çıktı: güven barı, kanıt pasajı, hash zinciri, risk gerekçeleri…) tek katmanda
   gösterir. Havada duran katman disiplini (MASTER): PAL.scrim + SH.modal + RAD.pop.
   a11y: role=dialog + aria-modal, Esc kapatır, ←/→ adımlar arasında gezdirir, açılışta
   odak kapat düğmesine gider, kapanışta tetikleyiciye döner, body scroll kilitlenir.
   Veri: node.data (SSE _node_summary) birincil; yoksa result alanlarına düşer — koşum
   CANLI sürerken de açılabilir, adım bittiğinde içerik kendiliğinden zenginleşir. */
import { useEffect, useRef } from "react";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import {
  Chip, MevzuatRow, SlaPanel, slaInfo, subSlaRenk, ZincirStepper, Vrow, CopyChip, KanitAlinti,
} from "./NeonDetayParts.jsx";
import {
  MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, Icon, KV, RiskBand,
} from "./neonUi.jsx";

const pct = (x) => Math.round((Number(x) || 0) * 100);
const dizi = (x) => (Array.isArray(x) ? x : []);

/* Her adımın "ne yaptığı" — sabit, sade dil görev açıklaması (jüri/kullanıcı eğitimi).
   Mevzuat/dayanak ifadeleri repo genelinde zaten kullanılan referanslarla sınırlıdır. */
const ACIKLAMA = {
  oku: "Belge (PDF, görsel veya Word) makine tarafından okunabilir metne çevrilir; taranmış belgelerde OCR devreye girer.",
  siniflandir: "Evrak metni incelenir ve belge türü (dilekçe, tebligat, üst yazı…) güven skoruyla birlikte belirlenir.",
  cikar: "Gönderen, tarih, sayı, konu gibi bilgi unsurları yapılandırılmış alanlara çıkarılır; kişisel veriler (TCKN, telefon) maskelenir.",
  kanit_baglama: "Çıkarılan her alan, kaynak belgedeki tam konumuna bağlanır — çıkarım uydurma değil, yeri gösterilebilir.",
  eksik_tespit: "Zorunlu bilgi unsurları denetlenir (3071 m.4); eksik alanlar sonraki adımlarda kullanıcıdan istenmek üzere işaretlenir.",
  decompose: "Evrak birden fazla konu veya talep içeriyorsa alt-taleplere bölünür; her alt-talep kendi birimine yönlendirilir.",
  mevzuat_oner: "İlgili mevzuat BM25 tabanlı aramayla önerilir; yapay zekâ yalnız yeniden sıralama ve doğrulama katmanıdır.",
  crag: "Getirilen mevzuat pasajları öz-değerlendirilir; yetersiz bulunursa sorgu yeniden yazılıp getirim düzeltilir.",
  mevzuat_dogrula: "Önerilen mevzuat atıfları doğal dil çıkarımı (NLI) ile 'madde bu talebi gerçekten destekliyor mu' testinden geçirilir.",
  ozetle: "Evrakın kısa ve öz bir yönetici özeti üretilir.",
  route_birim: "Evrak içeriğine göre sorumlu birime havale önerisi üretilir.",
  clarifier: "Kritik bilgi eksikse akış durdurulur ve kullanıcıya tamamlayıcı soru sorulur (dur-ve-sor).",
  yazi_taslak: "Resmî yazışma kurallarına (Yön. 2646) uygun cevap taslağı üretilir — üst yazı, cevabi, bilgilendirme veya olur.",
  verify: "Taslak; uydurma iddia, format ve tutarlılık yönünden denetlenir — sorunlar uyarıya dönüşür.",
  risk_guard: "Taslağın yayın güvenliği trafik ışığı bandına oturtulur; band kararı deterministik kurallarladır, yapay zekâ yalnız açıklamayı yazar.",
  self_rag: "Üretilen yanıtın talebi tam karşılayıp karşılamadığı öz-denetimden geçirilir.",
  onay_kapisi: "Koşullu insan onayı kapısı — riskli durumda akış, memur kararına kadar bekletilir.",
  arsiv: "Evrak, Standart Dosya Planı (2005/7) konu koduna göre arşivlenir ve saklama süresi belirlenir.",
  sla_triyaj: "Yasal cevap süresi hesaplanır; kalan güne göre normal, kritik veya gecikmiş triyajı yapılır.",
  denetim_izi: "Her adımın çıktısı SHA-256 hash-zinciriyle mühürlenir — tek karakter değişse zincir kopar (denetlenebilirlik).",
  finalize: "Kullanıcıya sonuç bilgilendirmesi hazırlanır; eksik bilgi varsa talep metni de eklenir.",
};

/* ——— Küçük yapı taşları ——— */

/* Bölüm başlığı — 12/500 etiket + hairline ayraç (+ sağda opsiyonel sayaç). */
const Bolum = ({ t, sag, children }) => (
  <section style={{ marginTop: SP.l }}>
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.s }}>
      <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, flexShrink: 0 }}>{t}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      {sag && <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0, ...TNUM }}>{sag}</span>}
    </div>
    {children}
  </section>
);

/* Sessiz bilgi notu — veri yokken/az bilgide düz açıklama satırı. */
const Not = ({ t }) => (
  <div style={{ ...TYPE.data, color: PAL.mut2, padding: "10px 12px", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{t}</div>
);

/* Büyük ölçüm — panel metriği dili (SANS + TNUM; mono yalnız makine verisinde). */
const Olcum = ({ k, v, c = PAL.ink, mono }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: 2 }}>{k}</div>
    <div style={mono
      ? { fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 500, color: c, ...TNUM }
      : { ...TYPE.num, color: c }}>{v}</div>
  </div>
);

/* İnce oran barı — 4px, düz dolgu, opsiyonel eşik çentiği. (MevzuatRow'un barında çentik YOK:
   oradaki skor lidere GÖRELİdir, üzerine mutlak eşik çizmek anlamsızdı — kaldırıldı.) */
const OranBar = ({ oran, fill = DERIN.T, esik, label }) => (
  <div style={{ position: "relative", height: 4, background: PAL.press, marginTop: SP.s }} role="img" aria-label={label}>
    <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, oran))}%`, background: fill, transition: "width .3s ease-out" }} />
    {esik != null && <div aria-hidden="true" style={{ position: "absolute", top: -2, bottom: -2, left: `${esik}%`, width: 1, background: PAL.lineHi }} />}
  </div>
);

/* "Neden bu karar?" gerekçe bloğu — ajanın KENDİ kararının nedenini öne çıkarır (tint
   zemin, satır-içi ikon; gradyan/kutu-içinde-kutu yok). Yalnız GERÇEK gerekçe verisi
   varken çizilir — uydurma açıklama üretilmez. */
const Gerekce = ({ c = T, children }) => (
  <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: "10px 12px", background: ALFA(c), borderRadius: RAD.card, marginBottom: SP.m }}>
    <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(c), marginTop: 2 }}><Icon.info width={14} height={14} /></span>
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(c), marginBottom: 2 }}>Neden bu karar?</div>
      <div style={{ ...TYPE.data, color: PAL.ink2 }}>{children}</div>
    </div>
  </div>
);

/* Madde satırı — nokta işaretli düz liste öğesi (gerekçe/soru/eksik). */
const Madde = ({ c = PAL.mut2, children }) => (
  <div style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: "4px 0" }}>
    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: c, marginTop: 6, flexShrink: 0 }} />
    <span style={{ ...TYPE.data, color: PAL.ink2, minWidth: 0 }}>{children}</span>
  </div>
);

/* ——— Node-tipine özel çıktı görünümleri ———
   d = node'un SSE data'sı (birincil) · r = uçtan-uca sonuç (fallback — canlı koşumda boş olabilir). */

function OkuDetay({ d, r }) {
  const conf = d.ocr_confidence ?? r?.ocr_confidence;
  const sayfa = d.page_count ?? r?.page_count;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: SP.l }}>
        <Olcum k="Okuma motoru" v={d.engine || "metin"} mono />
        {d.n_chars != null && <Olcum k="Çıkarılan metin" v={`${d.n_chars} karakter`} />}
        {sayfa != null && <Olcum k="Sayfa" v={sayfa} />}
        {conf != null && <Olcum k="OCR güveni" v={`%${pct(conf)}`} c={pct(conf) < 60 ? DERIN.sari : DERIN.yesil} />}
      </div>
      {conf != null && <OranBar oran={pct(conf)} esik={60} fill={pct(conf) < 60 ? DERIN.sari : DERIN.yesil} label={`OCR güveni yüzde ${pct(conf)}`} />}
    </>
  );
}

function SiniflandirDetay({ d, r }) {
  const tur = d.evrak_turu || r?.evrak_turu;
  const conf = d.tur_confidence ?? r?.tur_confidence;
  const neden = d.tur_reasoning || r?.tur_reasoning;
  if (!tur) return <Not t="Tür bilgisi bu adımda yayınlanmadı." />;
  return (
    <>
      {neden && <Gerekce>{cleanDemoText(String(neden))}</Gerekce>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: SP.l }}>
        <Olcum k="Belirlenen tür" v={EVRAK_TR(tur)} />
        {conf != null && <Olcum k="Güven skoru" v={`%${pct(conf)}`} c={pct(conf) < 60 ? DERIN.sari : DERIN.T} />}
      </div>
      {conf != null && <OranBar oran={pct(conf)} esik={60} fill={pct(conf) < 60 ? DERIN.sari : DERIN.T} label={`Sınıflandırma güveni yüzde ${pct(conf)}`} />}
    </>
  );
}

/* bilgi_unsurlari alan adları → okunur Türkçe etiket (bilinmeyen alan alt-çizgisiz kalır). */
const UNSUR_LBL = {
  gonderen: "Gönderen", kurum: "Kurum", konu: "Konu", tarih: "Tarih", sayi: "Sayı",
  talep: "Talep içeriyor", iletisim_adres: "İletişim adresi", imza: "İmza",
  tckn_maskeli: "TCKN (maskeli)", telefon_maskeli: "Telefon (maskeli)",
};

function CikarDetay({ d, r }) {
  const bu = d.bilgi_unsurlari || r?.bilgi_unsurlari || {};
  // pii_var çipe taşınır; false boolean "yok" gürültüsü üretmesin diye elenir.
  const alanlar = Object.entries(bu).filter(([k, v]) =>
    k !== "pii_var" && v != null && v !== false && String(v).trim() !== "");
  if (!alanlar.length) return <Not t="Çıkarılabilen bilgi unsuru yok." />;
  return (
    <>
      {bu.pii_var && (
        <div style={{ marginBottom: SP.s }}>
          <Chip c={BANT.yesil.c} label="Kişisel veriler maskelendi"><Icon.shield width={12} height={12} /> PII maskelendi — KVKK</Chip>
        </div>
      )}
      {alanlar.map(([k, v]) => (
        <KV key={k} k={UNSUR_LBL[k] || k.replace(/_/g, " ")} v={v === true ? "var" : cleanDemoText(String(v))} />
      ))}
    </>
  );
}

function KanitDetay({ d, r }) {
  const km = d.kanit_metadata || r?.kanit_metadata || {};
  const spanlar = dizi(km.spanlar);
  const metin = km.metin || r?.kanit_metadata?.metin || "";
  if (!spanlar.length) return <Not t="Bu evrakta bağlanacak kanıt pasajı bulunamadı." />;
  return (
    <>
      {metin && (
        <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>
          Satırın üzerine gelin — kaynak belgedeki kanıt pasajı vurgulu açılır.
        </div>
      )}
      {spanlar.map((sp, i) => (
        <KanitAlinti key={i} span={sp} metin={metin}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: SP.m, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
            <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0 }}>{sp.label}</span>
            <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, textAlign: "right", minWidth: 0, ...TNUM }}>{cleanDemoText(String(sp.deger || ""))}</span>
          </span>
        </KanitAlinti>
      ))}
    </>
  );
}

function EksikDetay({ d, r }) {
  const eksik = dizi(d.eksik_alanlar ?? r?.eksik_alanlar);
  if (!eksik.length) return <Vrow ok label="Tüm zorunlu alanlar tam" val="geçti" />;
  return (
    <>
      {eksik.map((e, i) => <Vrow key={i} ok={false} label={cleanDemoText(String(e))} val="eksik" />)}
      <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>
        Eksik alanlar "Bilgilendir" adımında kullanıcıdan talep edilir.
      </div>
    </>
  );
}

function DecomposeDetay({ d, r }) {
  const alt = dizi(d.alt_talepler ?? r?.alt_talepler);
  if (alt.length < 2) return <Not t="Evrak tek konulu — alt-taleplere bölme gerekmedi." />;
  return alt.map((a, i) => {
    const slaC = subSlaRenk(a.sla_durum);
    return (
      <div key={i} style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{i + 1}.</span>
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, flex: 1, minWidth: 160 }}>{cleanDemoText(String(a.konu || a.ozet || "alt-talep"))}</span>
        {a.birim && <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.V }}>{BIRIM_LBL(a.birim)}</span>}
        {slaC && <Chip c={slaC} label={`Yasal süre: ${a.sla_durum}`}>{String(a.sla_durum).toLocaleLowerCase("tr-TR")}</Chip>}
      </div>
    );
  });
}

function MevzuatDetay({ d, r }) {
  const oner = dizi(d.mevzuat_onerileri ?? r?.mevzuat_onerileri);
  const nli = dizi(r?.mevzuat_nli ?? d.mevzuat_nli);
  if (!oner.length) return <Not t="Bu evrak için mevzuat önerisi bulunamadı." />;
  return oner.map((m, i) => (
    <MevzuatRow key={i} rank={i + 1} m={m} ilk={i === 0} nli={nli.find((x) => x.baslik === m.baslik)} />
  ));
}

function CragDetay({ d }) {
  const once = d.crag_guven_oncesi, sonra = d.crag_guven_sonrasi;
  return (
    <>
      <Vrow ok={!d.crag_corrected} label={d.crag_corrected ? "Getirim yetersiz bulundu — sorgu yeniden yazıldı" : "Getirim yeterli bulundu"} val={d.crag_corrected ? "düzeltildi" : "geçti"} />
      {once != null && (
        <div style={{ marginTop: SP.s }}>
          <div style={{ ...TYPE.meta, color: PAL.mut3 }}>Getirim güveni: %{pct(once)}{sonra != null ? ` → %${pct(sonra)}` : ""}</div>
          <OranBar oran={pct(sonra ?? once)} fill={DERIN.T} label={`Getirim güveni yüzde ${pct(sonra ?? once)}`} />
        </div>
      )}
    </>
  );
}

function NliDetay({ d, r }) {
  const nli = dizi(d.mevzuat_nli ?? r?.mevzuat_nli);
  if (!nli.length) return <Not t="Doğrulanacak atıf bulunamadı." />;
  return nli.map((n, i) => (
    <Vrow key={i} ok={!!n.entailment} label={cleanDemoText(String(n.baslik || `atıf ${i + 1}`))}
      val={Number.isFinite(Number(n.skor)) ? `%${pct(n.skor)} destek` : (n.entailment ? "destekliyor" : "zayıf")} />
  ));
}

function OzetDetay({ d, r }) {
  const ozet = d.ozet || r?.ozet;
  if (!ozet) return <Not t="Özet bu adımda yayınlanmadı." />;
  return <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(String(ozet))}</p>;
}

function RouteDetay({ d, r }) {
  const birim = d.hedef_birim || r?.hedef_birim;
  const neden = d.birim_reasoning || r?.birim_reasoning;
  const alternatifler = dizi(d.birim_alternatifleri ?? r?.birim_alternatifleri).filter((b) => b !== birim);
  if (!birim) return <Not t="Birim önerisi bu adımda yayınlanmadı." />;
  return (
    <>
      {neden && <Gerekce c={V}>{cleanDemoText(String(neden))}</Gerekce>}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", color: DERIN.V }}><Icon.route width={20} height={20} /></span>
        <Olcum k="Önerilen birim (havale)" v={BIRIM_LBL(birim)} c={DERIN.V} />
      </div>
      {alternatifler.length > 0 && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>Değerlendirilen alternatifler</div>
          {alternatifler.map((b, i) => (
            <div key={b} style={{ display: "flex", gap: SP.s, alignItems: "baseline", padding: "4px 0", borderBottom: `1px solid ${PAL.line}` }}>
              <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{i + 2}.</span>
              <span style={{ ...TYPE.data, color: PAL.mut }}>{BIRIM_LBL(b)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ClarifierDetay({ d, r }) {
  const sorular = dizi(d.clarify_questions ?? r?.clarify_questions);
  if (!sorular.length) return <Vrow ok label="Bilgi tam — soru gerekmedi" val="geçti" />;
  return sorular.map((q, i) => (
    <div key={i} style={{ ...TYPE.data, color: PAL.ink2, background: ALFA(BANT.sari.c), borderRadius: RAD.card, padding: "8px 12px", marginBottom: SP.s }}>{cleanDemoText(String(q))}</div>
  ));
}

function TaslakDetay({ d, r }) {
  const tur = d.yazi_turu || r?.yazi_turu;
  const uyum = d.format_uyumlu ?? r?.format_uyumlu;
  const md = r?.yazi_taslak_md;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: SP.l, marginBottom: md ? SP.m : 0 }}>
        {tur && <Olcum k="Yazı türü" v={YAZI_TR(tur)} c={DERIN.V} />}
        {uyum != null && <Olcum k="Yön. 2646 format" v={uyum ? "uyumlu" : "uyarılı"} c={uyum ? DERIN.yesil : DERIN.sari} />}
      </div>
      {md && (
        <>
          <div style={{ ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "hidden", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "12px 16px" }}>{cleanDemoText(md)}</div>
          <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Kısaltılmış önizleme — tam metin ana ekrandaki taslak kartında (A4 görünüm).</div>
        </>
      )}
    </>
  );
}

function VerifyDetay({ d, r }) {
  const uyari = dizi(d.verify_uyari ?? r?.verify_uyari);
  const tutarlilik = dizi(d.tutarlilik_uyari ?? r?.tutarlilik_uyari);
  const lint = dizi(d.lint_2646 ?? r?.lint_2646);
  const notlar = dizi(d.verify_notes ?? r?.verify_notes);
  const uyum = d.format_uyumlu ?? r?.format_uyumlu;
  return (
    <>
      {uyum != null && <Vrow ok={!!uyum} label="Resmî yazışma formatı (Yön. 2646)" val={uyum ? "uyumlu" : "uyarılı"} />}
      <Vrow ok={uyari.length === 0} label="Uydurma iddia / doğrulama denetimi" val={uyari.length ? `${uyari.length} uyarı` : "geçti"} />
      {lint.length > 0 && <Vrow ok={false} label="2646 biçim önerisi" val={`${lint.length} öneri`} />}
      {tutarlilik.length > 0 && <Vrow ok={false} label="Tutarlılık denetimi" val={`${tutarlilik.length} uyarı`} />}
      {[...uyari, ...tutarlilik].map((u, i) => <Madde key={i} c={BANT.sari.c}>{cleanDemoText(String(u))}</Madde>)}
      {notlar.map((n, i) => (
        <div key={`n${i}`} style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut3 }}>{cleanDemoText(String(n))}</div>
      ))}
    </>
  );
}

function RiskDetay({ d, r }) {
  const meta = d.risk_metadata || r?.risk_metadata || {};
  const bant = BANT[meta.bant] ? meta.bant : null;
  if (!bant) return <Not t="Risk bandı bu adımda yayınlanmadı." />;
  const gerekceler = dizi(meta.gerekceler);
  return (
    <>
      {(meta.aciklama || meta.oneri) && (
        <Gerekce c={BANT[bant].c}>{cleanDemoText(String(meta.aciklama || meta.oneri))}</Gerekce>
      )}
      <RiskBand band={bant} lit />
      {/* Skor = noisy-OR(ciddiyet × ölçülen isabet) — beklenen zarar; olasılık DEĞİL. */}
      {Number.isFinite(Number(meta.skor)) && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>Risk puanı: %{pct(meta.skor)}</div>
          <OranBar oran={pct(meta.skor)} fill={BANT[bant].c} label={`Risk puanı yüzde ${pct(meta.skor)}`} />
        </div>
      )}
      {gerekceler.length > 0 && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>Bandı belirleyen kurallar</div>
          {gerekceler.map((g, i) => <Madde key={i} c={BANT[bant].c}>{cleanDemoText(String(g))}</Madde>)}
        </div>
      )}
    </>
  );
}

function SelfRagDetay({ d }) {
  const eksikler = dizi(d.self_rag_eksikler);
  return (
    <>
      <Vrow ok={!!d.self_rag_tam} label="Yanıt yeterlilik öz-denetimi" val={d.self_rag_tam ? "yeterli" : `${eksikler.length || "eksik"} bulgu`} />
      {eksikler.map((e, i) => <Madde key={i} c={BANT.sari.c}>{cleanDemoText(String(e))}</Madde>)}
      {d.self_rag_notu && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>{cleanDemoText(String(d.self_rag_notu))}</div>}
    </>
  );
}

function ArsivDetay({ d, r }) {
  const am = d.arsiv_metadata || r?.arsiv_metadata || {};
  const kod = am.sdp_kodu || am.sdp;
  if (!kod && !am.saklama_suresi) return <Not t="Arşiv üstverisi bu adımda yayınlanmadı." />;
  const adaylar = dizi(am.sdp_adaylari).slice(0, 3);
  return (
    <>
      {kod && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3 }}>SDP konu kodu</span>
          <CopyChip deger={kod} kisa={`SDP ${kod}`} label="SDP kodunu panoya kopyala" />
        </div>
      )}
      {am.sdp_adi && <KV k="SDP konu adı" v={cleanDemoText(String(am.sdp_adi))} />}
      {am.saklama_suresi && <KV k="Saklama süresi" v={cleanDemoText(String(am.saklama_suresi))} />}
      {am.sdp_gerekce && <div style={{ marginTop: SP.m }}><Gerekce>{cleanDemoText(String(am.sdp_gerekce))}</Gerekce></div>}
      {adaylar.length > 1 && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>Değerlendirilen adaylar</div>
          {adaylar.map((a2, i) => (
            <div key={i} style={{ padding: "4px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, ...TYPE.data, color: PAL.ink2 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, ...TNUM }}>{a2.kod}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(String(a2.ad || ""))}</span>
                {a2.skor != null && <span style={{ fontWeight: 500, color: DERIN.T, ...TNUM }}>%{pct(a2.skor)}</span>}
              </div>
              {a2.skor != null && <OranBar oran={pct(a2.skor)} label={`Aday skoru yüzde ${pct(a2.skor)}`} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SlaDetay({ d, r }) {
  const sla = d.sla_metadata || r?.sla_metadata;
  if (!sla) return <Not t="Yasal süre bilgisi bu adımda yayınlanmadı." />;
  return <SlaPanel sla={sla} info={slaInfo(sla)} />;
}

function DenetimDetay({ d, r }) {
  const den = d.denetim_izi || r?.denetim_izi || {};
  const zincir = dizi(den.zincir || den.adimlar);
  if (!zincir.length && !den.kok_hash) return <Not t="Denetim izi bu adımda yayınlanmadı." />;
  return <ZincirStepper zincir={zincir} kokHash={den.kok_hash} butunluk={den.butunluk !== false} />;
}

function FinalizeDetay({ r }) {
  const bilg = r?.bilgilendirme;
  if (!bilg) return <Not t="Bilgilendirme metni uçtan-uca sonuçla birlikte hazırlanır." />;
  return <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(String(bilg)).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>;
}

/* Bilinmeyen node — data'daki ilkel alanları düz KV dök (yeni ENV node'ları boş kalmasın). */
function GenelDetay({ d }) {
  const alanlar = Object.entries(d).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v));
  if (!alanlar.length) return <Not t="Bu adım ayrıntılı veri yayınlamadı." />;
  return alanlar.map(([k, v]) => <KV key={k} k={k.replace(/_/g, " ")} v={String(v)} />);
}

const GOVDE = {
  oku: OkuDetay, siniflandir: SiniflandirDetay, cikar: CikarDetay, kanit_baglama: KanitDetay,
  eksik_tespit: EksikDetay, decompose: DecomposeDetay, mevzuat_oner: MevzuatDetay, crag: CragDetay,
  mevzuat_dogrula: NliDetay, ozetle: OzetDetay, route_birim: RouteDetay, clarifier: ClarifierDetay,
  yazi_taslak: TaslakDetay, verify: VerifyDetay, risk_guard: RiskDetay, self_rag: SelfRagDetay,
  onay_kapisi: GenelDetay, arsiv: ArsivDetay, sla_triyaj: SlaDetay, denetim_izi: DenetimDetay,
  finalize: FinalizeDetay,
};

/* Konum şeridi — 16 istasyonun mini haritası; nokta tıklanınca o adıma geçilir.
   Geçerli adım nötr hairline halkayla işaretlenir (renk tek sinyal değil: başlık da değişir). */
function KonumSeridi({ display, idx, onGit }) {
  return (
    <div role="group" aria-label="Adımlar arasında geçiş" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, padding: `${SP.s}px 0 ${SP.m}px`, borderBottom: `1px solid ${PAL.line}` }}>
      {display.map((x, i) => {
        const col = x.gorev === 2 ? V : T;
        const done = x.status === "done", err = x.status === "error";
        const secili = i === idx;
        return (
          <button key={x.id} type="button" onClick={() => onGit(i)} title={x.label}
            aria-label={`${x.label} adımına git`} aria-current={secili ? "step" : undefined} {...focusRing}
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: "pointer", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, background: "transparent", borderRadius: RAD.dot, border: `1px solid ${secili ? PAL.lineHi : "transparent"}`, transition: "background .12s ease-out" }}>
            <span aria-hidden="true" style={{ width: secili ? 11 : 8, height: secili ? 11 : 8, borderRadius: RAD.dot, background: err ? BANT.kirmizi.c : done ? col : PAL.bg, border: done || err ? "none" : `1px solid ${PAL.lineHi}` }} />
          </button>
        );
      })}
    </div>
  );
}

/* Durum çipi — adımın anlık durumu (satır başına 1 semantik çip). */
function DurumCip({ st, col }) {
  if (st === "active") return <Chip c={T} label="Adım şu anda çalışıyor">işleniyor</Chip>;
  if (st === "error") return <Chip c={BANT.kirmizi.c} label="Adım hatayla sonuçlandı"><Icon.x width={11} height={11} /> hata</Chip>;
  if (st === "done") return <Chip c={col} label="Adım tamamlandı"><Icon.check width={11} height={11} /> tamamlandı</Chip>;
  return <Chip c={PAL.mut2} label="Adım sırada bekliyor">sırada</Chip>;
}

export default function AjanAdimDetay({ idx, display, result, onKapat, onGit }) {
  const kapatRef = useRef(null);
  const oncekiOdak = useRef(null);
  const a = display[idx];
  const toplam = display.length;

  // Esc kapatır, ←/→ adımlar arasında gezdirir; açılışta odak + body scroll kilidi.
  // Canlı prop'lar (idx/geri çağrılar/uzunluk) ref'ten okunur → efekt YALNIZ mount'ta koşar;
  // koşum sürerken gelen SSE render'ları odağı tekrar tekrar kapat düğmesine çekmez.
  const canli = useRef({});
  canli.current = { idx, onKapat, onGit, son: display.length - 1 };
  useEffect(() => {
    oncekiOdak.current = document.activeElement;
    kapatRef.current?.focus();
    const tusla = (e) => {
      const c = canli.current;
      if (e.key === "Escape") c.onKapat();
      else if (e.key === "ArrowLeft" && c.idx > 0) c.onGit(c.idx - 1);
      else if (e.key === "ArrowRight" && c.idx < c.son) c.onGit(c.idx + 1);
    };
    document.addEventListener("keydown", tusla);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tusla);
      document.body.style.overflow = eski;
      oncekiOdak.current?.focus?.();
    };
  }, []);

  if (!a) return null;
  const col = a.gorev === 2 ? V : T;
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const ms = a.t1 - a.t0;
  const sure = a.status === "done" && Number.isFinite(ms) ? (ms >= 50 ? `${(ms / 1000).toFixed(1)} sn` : "anlık") : null;
  const Icerik = GOVDE[a.id] || GenelDetay;
  const d = a.data || {};
  const calismadi = a.status === "pending";
  const onceki = display[idx - 1], sonraki = display[idx + 1];

  const navBtn = (hedef, etiket, sagOk) => (
    <button type="button" disabled={!hedef} onClick={() => hedef && onGit(hedef.sira)} {...focusRing}
      aria-label={hedef ? `${sagOk ? "Sonraki" : "Önceki"} adım: ${hedef.label}` : undefined}
      onMouseEnter={(e) => { if (hedef) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: hedef ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "8px 14px", minHeight: 36, maxWidth: "46%", borderRadius: RAD.ctl, border: `1px solid ${hedef ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: hedef ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease-out" }}>
      {!sagOk && <span aria-hidden="true" style={{ display: "flex", transform: "rotate(180deg)" }}><Icon.arrow width={13} height={13} /></span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiket}</span>
      {sagOk && <span aria-hidden="true" style={{ display: "flex" }}><Icon.arrow width={13} height={13} /></span>}
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`${a.label} — adım detayı`} onClick={onKapat}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: PAL.scrim, overflowY: "auto", padding: "48px 16px", animation: "nu-rise .16s ease-out both" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(680px, 96vw)", margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop, boxShadow: SH.modal, padding: SP.xl }}>

        {/* Başlık — hat roundeli + ad + durum + kapat */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: SP.m }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: RAD.dot, background: bantC || col, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: MONO, fontSize: 13, fontWeight: 500, ...TNUM }}>
            {String(idx + 1).padStart(2, "0")}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
              {/* key={a.id}: adım değişince başlık taze girişle gelir */}
              <h2 key={a.id} style={{ margin: 0, ...TYPE.h2, color: PAL.ink, animation: "nu-rise .16s ease-out both" }}>{a.label}</h2>
              <DurumCip st={a.status} col={bantC || col} />
            </div>
            <div style={{ marginTop: 2, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
              <span style={{ color: DERIN_OF(col), fontWeight: 500 }}>{a.gorev === 2 ? "Görev 2 · Üret" : "Görev 1 · Anla"}</span>
              {" · "}adım {idx + 1}/{toplam}{sure ? ` · ${sure}` : ""}
              {a.status === "done" && a.out ? ` · ${a.out}` : ""}
            </div>
          </div>
          <button ref={kapatRef} type="button" onClick={onKapat} aria-label="Detayı kapat (Esc)" {...focusRing}
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.mut, flexShrink: 0, transition: "background .12s ease-out" }}>
            <Icon.x />
          </button>
        </div>

        <KonumSeridi display={display} idx={idx} onGit={onGit} />

        {/* Görev açıklaması — bu adım pipeline'da ne yapar */}
        <Bolum t="Bu adım ne yapar">
          <p style={{ margin: 0, ...TYPE.data, color: PAL.mut }}>{ACIKLAMA[a.id] || a.desc || "Pipeline adımı."}</p>
        </Bolum>

        {/* Çıktı ve gerekçe — node-tipine özel zengin görünüm: ajanın kararı + NEDENİ
            (gerekçe bloğu / kurallar / kanıt). Canlı koşumda kendiliğinden dolar. */}
        <Bolum t="Çıktı ve gerekçe" sag={a.status === "done" && a.out ? a.out : undefined}>
          {calismadi ? (
            <Not t="Bu adım henüz çalışmadı — sıra geldiğinde çıktısı burada görünür." />
          ) : a.status === "error" ? (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "10px 12px", background: ALFA(BANT.kirmizi.c), border: `1px solid ${BANT.kirmizi.c}`, borderRadius: RAD.card, ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi }}>
              <Icon.alert /> Adım hatayla sonuçlandı — koşum bu noktada kesildi.
            </div>
          ) : (
            /* key={a.id}: adım değişince gövde taze girişle gelir */
            <div key={a.id} style={{ animation: "nu-rise .16s ease-out both" }}>
              {a.status === "active" && !a.data && (
                <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s, ...TYPE.data, color: DERIN_OF(col) }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: col, animation: "nu-think 1.2s ease-in-out infinite" }} />
                  Çalışıyor — çıktı hazır olduğunda burada görünecek…
                </div>
              )}
              <Icerik d={d} r={result} a={a} />
            </div>
          )}
        </Bolum>

        {/* Gezinme — önceki/sonraki istasyon */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginTop: SP.xl, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
          {navBtn(onceki, onceki ? onceki.label : "İlk adım")}
          <span style={{ ...TYPE.meta, color: PAL.mut3, textAlign: "center", flexShrink: 1 }}>← → gezinir · Esc kapatır</span>
          {navBtn(sonraki, sonraki ? sonraki.label : "Son adım", true)}
        </div>
      </div>
    </div>
  );
}
