/* AjanAdimGovde — adım detay modalının node-tipine özel gövdeleri (tur 6'da AjanAdimDetay'dan
   ayrıldı: dosya <800 kuralı). d = node'un SSE data'sı (birincil) · r = uçtan-uca sonuç
   (yedek — canlı koşumda boş olabilir). Yokluktan olumlu hüküm türetilmez. */
import { EVRAK_TR, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { riskSkorYorum } from "../lib/detayYorum.js";
import {
  Chip, MevzuatRow, SlaPanel, slaInfo, subSlaRenk, ZincirStepper, Vrow, CopyChip, KanitAlinti,
  BilgilendirmeYapisal,
} from "./NeonDetayParts.jsx";
import { motorEtiketi } from "../lib/pipelinePhases.js";
import A4Belge from "./A4Belge.jsx";
import {
  MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, Icon, KV, RiskBand,
} from "./neonUi.jsx";

const pct = (x) => Math.round((Number(x) || 0) * 100);
const dizi = (x) => (Array.isArray(x) ? x : []);

/* Her adımın "ne yaptığı" — sabit, sade dil görev açıklaması (jüri/kullanıcı eğitimi).
   Mevzuat/dayanak ifadeleri repo genelinde zaten kullanılan referanslarla sınırlıdır. */
export const ACIKLAMA = {
  oku: "Belge (PDF, görsel veya Word) makine tarafından okunabilir metne çevrilir; taranmış belgelerde OCR devreye girer.",
  siniflandir: "Evrak metni incelenir ve belge türü (dilekçe, tebligat, üst yazı…) güven skoruyla birlikte belirlenir.",
  cikar: "Gönderen, tarih, sayı, konu gibi bilgi unsurları yapılandırılmış alanlara çıkarılır; kişisel veriler (TCKN, telefon) maskelenir.",
  kanit_baglama: "Çıkarılan her alan, kaynak belgedeki tam konumuna bağlanır; çıkarım uydurma değil, yeri gösterilebilir.",
  eksik_tespit: "Zorunlu bilgi unsurları denetlenir (3071 m.4); eksik alanlar sonraki adımlarda kullanıcıdan istenmek üzere işaretlenir.",
  decompose: "Evrak birden fazla konu veya talep içeriyorsa alt-taleplere bölünür; her alt-talep kendi birimine yönlendirilir.",
  mevzuat_oner: "İlgili mevzuat BM25 tabanlı aramayla önerilir; yapay zekâ yalnız yeniden sıralama ve doğrulama katmanıdır.",
  crag: "Getirilen mevzuat pasajları öz-değerlendirilir; yetersiz bulunursa sorgu yeniden yazılıp getirim düzeltilir.",
  mevzuat_dogrula: "Önerilen mevzuat atıfları doğal dil çıkarımı (NLI) ile 'madde bu talebi gerçekten destekliyor mu' testinden geçirilir.",
  ozetle: "Evrakın kısa ve öz bir yönetici özeti üretilir.",
  route_birim: "Evrak içeriğine göre sorumlu birime havale önerisi üretilir.",
  clarifier: "Kritik bilgi eksikse akış durdurulur ve kullanıcıya tamamlayıcı soru sorulur (dur-ve-sor).",
  yazi_taslak: "Resmî yazışma kurallarına (Yön. 2646) uygun cevap taslağı üretilir: üst yazı, cevabi, bilgilendirme veya olur.",
  verify: "Taslak; uydurma iddia, format ve tutarlılık yönünden denetlenir; sorunlar uyarıya dönüşür.",
  risk_guard: "Taslağın yayın güvenliği trafik ışığı bandına oturtulur; band kararı deterministik kurallarladır, yapay zekâ yalnız açıklamayı yazar.",
  self_rag: "Üretilen yanıtın talebi tam karşılayıp karşılamadığı öz-denetimden geçirilir.",
  onay_kapisi: "Koşullu insan onayı kapısı; riskli durumda akış, memur kararına kadar bekletilir.",
  arsiv: "Evrak, Standart Dosya Planı (2005/7) konu koduna göre arşivlenir ve saklama süresi belirlenir.",
  sla_triyaj: "Yasal cevap süresi hesaplanır; kalan güne göre normal, kritik veya gecikmiş triyajı yapılır.",
  denetim_izi: "Her adımın çıktısı SHA-256 hash-zinciriyle mühürlenir; tek karakter değişse zincir kopar (denetlenebilirlik).",
  finalize: "Kullanıcıya sonuç bilgilendirmesi hazırlanır; eksik bilgi varsa talep metni de eklenir.",
};

/* ——— Küçük yapı taşları ——— */

/* Bölüm başlığı — 12/500 etiket + hairline ayraç (+ sağda opsiyonel sayaç). */
export const Bolum = ({ t, sag, children }) => (
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
export const Not = ({ t }) => (
  <div style={{ ...TYPE.data, color: PAL.mut2, padding: "10px 12px", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{t}</div>
);

/* Büyük ölçüm — panel metriği dili (SANS + TNUM; mono yalnız makine verisinde). */
const Olcum = ({ k, v, c = PAL.ink, mono }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: 2 }}>{k}</div>
    <div style={mono
      ? { fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 500, color: c, ...TNUM }
      : { ...TYPE.h2, fontSize: 18, lineHeight: "24px", color: c, ...TNUM }}>{v}</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))", gap: SP.l }}>
        <Olcum k="Okuma yolu" v={motorEtiketi(d.engine)} />
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: SP.l }}>
        <Olcum k="Belirlenen tür" v={EVRAK_TR(tur)} />
        {conf != null && <Olcum k="Güven skoru" v={`%${pct(conf)}`} c={pct(conf) < 60 ? DERIN.sari : DERIN.T} />}
      </div>
      {conf != null && <OranBar oran={pct(conf)} esik={60} fill={pct(conf) < 60 ? DERIN.sari : DERIN.T} label={`Sınıflandırma güveni yüzde ${pct(conf)}`} />}
    </>
  );
}

/* bilgi_unsurlari alan adları → okunur Türkçe etiket (bilinmeyen alan alt-çizgisiz kalır). */
/* bilgi_unsurlari → okunur Türkçe etiket. BEYAZ LİSTE (tur 6): sözlükte olmayan anahtar
   GÖSTERİLMEZ — ham makine anahtarı ("talepler") ve çöp değer ("T.C") kullanıcı yüzeyine
   sızıyordu. Talepler yalnız tek talep kümesinden (talep_kumesi.ozet) listelenir. */
const UNSUR_LBL = {
  gonderen: "Gönderen", kurum: "Kurum", konu: "Konu", tarih: "Tarih", sayi: "Sayı",
  talep: "Talep içeriyor", iletisim_adres: "İletişim adresi", imza: "İmza",
  tckn_maskeli: "TCKN (maskeli)", telefon_maskeli: "Telefon (maskeli)",
};

function TalepKumesi({ liste }) {
  return (
    <div style={{ marginTop: SP.m }}>
      <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>Talepler</div>
      {liste.map((t, i) => (
        <div key={t.id ?? i} style={{ display: "flex", gap: SP.s, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{i + 1}.</span>
          <span style={{ ...TYPE.data, color: PAL.ink2, minWidth: 0 }}>{cleanDemoText(String(t.ozet))}</span>
        </div>
      ))}
    </div>
  );
}

/* Maskeleme rozeti OLGUNUN KENDİSİNİ söyler (tur 8): genel "PII maskelendi" rozetinin hemen
   altında gönderen adı açık yazıyordu — iddia kapsamından genişti. Rozet yalnız gerçekten
   maskeli gelen alanları sayar; maskeli alan yoksa rozet basılmaz. */
const MASKE_ALAN = [["tckn_maskeli", "TCKN"], ["telefon_maskeli", "Telefon"]];
function maskeRozeti(bu) {
  const adlar = MASKE_ALAN.filter(([k]) => typeof bu[k] === "string" && bu[k].trim()).map(([, ad]) => ad);
  if (!adlar.length) return null;
  return `${adlar.join(" ve ")} maskelendi`;
}

function CikarDetay({ d, r }) {
  const bu = d.bilgi_unsurlari || r?.bilgi_unsurlari || {};
  // pii_var çipe taşınır; false boolean "yok" gürültüsü üretmesin diye elenir.
  const alanlar = Object.entries(bu).filter(([k, v]) =>
    UNSUR_LBL[k] && v != null && v !== false && String(v).trim() !== "");
  const talepler = (Array.isArray(bu.talep_kumesi) ? bu.talep_kumesi : []).filter((t) => t && typeof t.ozet === "string" && t.ozet.trim());
  if (!alanlar.length && !talepler.length) return <Not t="Çıkarılabilen bilgi unsuru yok." />;
  return (
    <>
      {bu.pii_var && maskeRozeti(bu) && (
        <div style={{ marginBottom: SP.s }}>
          <Chip c={BANT.yesil.c} label={`${maskeRozeti(bu)} (KVKK)`}><Icon.shield width={12} height={12} /> {maskeRozeti(bu)} (KVKK)</Chip>
        </div>
      )}
      {alanlar.map(([k, v]) => (
        <KV key={k} k={UNSUR_LBL[k]} v={v === true ? "var" : cleanDemoText(String(v))} />
      ))}
      {talepler.length > 0 && <TalepKumesi liste={talepler} />}
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
      {/* Değerler KAYNAKTAKİ YAZIMIYLA (tur 8: "Bilgi Çıkar"da başlık harfi, burada BÜYÜK HARF
          aynı kurum iki biçimde okunuyordu) — bu tablo alıntıdır, normalize edilmez. */}
      <div style={{ ...TYPE.meta, color: PAL.mut3, marginBottom: SP.s }}>
        Değerler kaynaktaki yazımıyla{metin ? " · satırın üzerine gelin, kanıt pasajı vurgulu açılır." : "."}
      </div>
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
  if (alt.length < 2) return <Not t="Evrak tek konulu; alt-taleplere bölme gerekmedi." />;
  return alt.map((a, i) => {
    const slaC = subSlaRenk(a.sla_durum);
    return (
      <div key={i} style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{i + 1}.</span>
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, flex: 1, minWidth: 160 }}>{cleanDemoText(String(a.konu || a.ozet || "alt-talep"))}</span>
        {a.birim && <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.V }}>{BIRIM_GOSTER(a.birim, a.tur)}</span>}
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
      <Vrow ok={!d.crag_corrected} label={d.crag_corrected ? "Getirim yetersiz bulundu; sorgu yeniden yazıldı" : "Getirim yeterli bulundu"} val={d.crag_corrected ? "düzeltildi" : "geçti"} />
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
        <Olcum k="Önerilen birim (havale)" v={BIRIM_GOSTER(birim, d.evrak_turu || r?.evrak_turu)} c={DERIN.V} />
      </div>
      {alternatifler.length > 0 && (
        <div style={{ marginTop: SP.m }}>
          <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.xs }}>Değerlendirilen alternatifler</div>
          {alternatifler.map((b, i) => (
            <div key={b} style={{ display: "flex", gap: SP.s, alignItems: "baseline", padding: "4px 0", borderBottom: `1px solid ${PAL.line}` }}>
              <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{i + 2}.</span>
              <span style={{ ...TYPE.data, color: PAL.mut }}>{BIRIM_GOSTER(b, d.evrak_turu || r?.evrak_turu)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ClarifierDetay({ d, r }) {
  const sorular = dizi(d.clarify_questions ?? r?.clarify_questions);
  if (!sorular.length) return <Vrow ok label="Bilgi tam, soru gerekmedi" val="geçti" />;
  return sorular.map((q, i) => (
    <div key={i} style={{ ...TYPE.data, color: PAL.ink2, background: ALFA(BANT.sari.c), borderRadius: RAD.card, padding: "8px 12px", marginBottom: SP.s }}>{cleanDemoText(String(q))}</div>
  ));
}

/* Yazı taslağı masası — Görev 2'nin ana çıktısı (tur 6: en çok merak edilen masa en boş
   detaya sahipti). Künye (muhatap · konu · sayı · dosya planı) canlı koşumda node verisinden
   gelir; taslağın minyatür A4 önizlemesi sonuç geldiğinde. Uydurma alan yok: yoksa satır yok. */
function TaslakKunye({ d, r }) {
  const uv = d.ust_veri || r?.ust_veri || {};
  const am = d.antet_meta || r?.antet_meta || {};
  const satirlar = [
    ["Muhatap", am.muhatap], ["Konu", uv.konu], ["Sayı", uv.sayi],
    ["Dosya planı", uv.dosya_plani_kodu ? `${uv.dosya_plani_kodu}${uv.dosya_plani_adi ? ` · ${uv.dosya_plani_adi}` : ""}` : null],
    ["Güvenlik", uv.guvenlik_kodu],
  ].filter(([, v]) => typeof v === "string" && v.trim());
  if (!satirlar.length) return null;
  return <div style={{ marginTop: SP.m }}>{satirlar.map(([k, v]) => <KV key={k} k={k} v={cleanDemoText(v)} />)}</div>;
}

function TaslakDetay({ d, r }) {
  const tur = d.yazi_turu || r?.yazi_turu;
  const uyum = d.format_uyumlu ?? r?.format_uyumlu;
  const md = r?.yazi_taslak_md;
  const not = d.yazi_plan_notu || r?.yazi_plan_notu;
  return (
    <>
      {typeof not === "string" && not.trim() && <Gerekce c={V}>{cleanDemoText(not)}</Gerekce>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: SP.l }}>
        {tur && <Olcum k="Yazı türü" v={YAZI_TR(tur)} c={DERIN.V} />}
        {uyum != null && <Olcum k="Yön. 2646 biçim" v={uyum ? "uyumlu" : "uyarılı"} c={uyum ? DERIN.yesil : DERIN.sari} />}
      </div>
      <TaslakKunye d={d} r={r} />
      {md ? (
        <div style={{ marginTop: SP.m }}>
          <div data-evrak-kagit="" style={{ height: 300, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.s, overflow: "hidden" }}>
            <A4Belge metin={cleanDemoText(md)} sigdir="kutu" />
          </div>
          <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}>Minyatür önizleme — tam metin ve karar ana ekrandaki taslak kartında.</div>
        </div>
      ) : (
        <div style={{ marginTop: SP.m, ...TYPE.meta, color: PAL.mut3 }}>Taslağın A4 önizlemesi koşum tamamlanınca burada görünür.</div>
      )}
    </>
  );
}

function VerifyDetay({ d, r }) {
  const uyari = dizi(d.verify_uyari ?? r?.verify_uyari);
  const tutarlilik = dizi(d.tutarlilik_uyari ?? r?.tutarlilik_uyari);
  // lint_2646 backend sözleşmesinde DICT'tir ({kurallar, uyari}) — dizi() onu [] yapıyor,
  // bölüm HİÇ görünmüyordu (bug avı bulgusu; SonucCalismaAlani kartıyla çelişiyordu).
  const lintHam = d.lint_2646 ?? r?.lint_2646;
  const lintObj = lintHam && typeof lintHam === "object" && !Array.isArray(lintHam) ? lintHam : null;
  const lintN = dizi(lintObj?.kurallar).filter((k) => k?.durum === "uyari").length
    || dizi(lintObj?.uyari).length;
  // verify_notes STRING'dir — dizi() düşürüyordu; diziye de toleranslı normalize edilir.
  const notHam = d.verify_notes ?? r?.verify_notes;
  const notlar = (Array.isArray(notHam) ? notHam : [notHam])
    .filter((n) => typeof n === "string" && n.trim());
  const uyum = d.format_uyumlu ?? r?.format_uyumlu;
  return (
    <>
      {uyum != null && <Vrow ok={!!uyum} label="Resmî yazışma formatı (Yön. 2646)" val={uyum ? "uyumlu" : "uyarılı"} />}
      <Vrow ok={uyari.length === 0} label="Uydurma iddia / doğrulama denetimi" val={uyari.length ? `${uyari.length} uyarı` : "geçti"} />
      {lintN > 0 && <Vrow ok={false} label="2646 biçim önerisi" val={`${lintN} öneri`} />}
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
      {/* Skor = noisy-OR(ciddiyet × ölçülen isabet) — beklenen zarar; olasılık DEĞİL.
          Bu blok bir zamanlar yorumun tam tersini yapıp "%87" basıyordu; biçimlendirme
          artık sonuç kartıyla ORTAK tek kaynaktan (riskSkorYorum) gelir, iki yüzey
          aynı sayıyı farklı anlamda gösteremez. Yüzde yalnız kusur olasılığında. */}
      {(() => {
        const s = riskSkorYorum(Number(meta.skor), meta.katkilar, bant,
          meta.kalibrasyon, meta.kusur_olasiligi);
        if (!s) return null;
        return (
          <div style={{ marginTop: SP.m }}>
            <div style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM }}>{s.baslik}</div>
            <OranBar oran={s.dolgu} fill={BANT[bant].c} label={`Risk puanı ${s.puan}, 1 üzerinden`} />
            {s.olasilikYuzde != null && (
              <div style={{ marginTop: 4, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
                Kusur olasılığı %{s.olasilikYuzde} — ölçülen isabet oranlarından.
              </div>
            )}
          </div>
        );
      })()}
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

function FinalizeDetay({ d, r }) {
  // SSE node.data birincil (canlı akışta finalize biter bitmez dolar); yoksa final sonuç.
  const yapisal = d?.bilgilendirme_yapisal || r?.bilgilendirme_yapisal;
  if (yapisal?.surum) return <BilgilendirmeYapisal y={yapisal} />;
  const bilg = d?.bilgilendirme || r?.bilgilendirme;
  if (!bilg) return <Not t="Bilgilendirme metni uçtan-uca sonuçla birlikte hazırlanır." />;
  return <p style={{ margin: 0, ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap" }}>{cleanDemoText(String(bilg)).replace(/\*\*/g, "").replace(/\s*##\s*/g, "  ")}</p>;
}

/* Bilinmeyen node — data'daki ilkel alanları düz KV dök (yeni ENV node'ları boş kalmasın). */
export function GenelDetay({ d }) {
  const alanlar = Object.entries(d).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v));
  if (!alanlar.length) return <Not t="Bu adım ayrıntılı veri yayınlamadı." />;
  return alanlar.map(([k, v]) => <KV key={k} k={k.replace(/_/g, " ")} v={String(v)} />);
}

export const GOVDE = {
  oku: OkuDetay, siniflandir: SiniflandirDetay, cikar: CikarDetay, kanit_baglama: KanitDetay,
  eksik_tespit: EksikDetay, decompose: DecomposeDetay, mevzuat_oner: MevzuatDetay, crag: CragDetay,
  mevzuat_dogrula: NliDetay, ozetle: OzetDetay, route_birim: RouteDetay, clarifier: ClarifierDetay,
  yazi_taslak: TaslakDetay, verify: VerifyDetay, risk_guard: RiskDetay, self_rag: SelfRagDetay,
  onay_kapisi: GenelDetay, arsiv: ArsivDetay, sla_triyaj: SlaDetay, denetim_izi: DenetimDetay,
  finalize: FinalizeDetay,
};
