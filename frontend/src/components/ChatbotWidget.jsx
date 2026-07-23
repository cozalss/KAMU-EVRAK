/* ChatbotWidget — sağ altta yuvarlak FAB + Hero Light sohbet paneli.
   Backend POST /sohbet (auth'lu): niyet + araç (gelen/giden/taslak/işlem/panel/mevzuat) +
   yanıt; LLM yoksa deterministik fallback (kaynak rozetinde görünür). Kayıtlar yapısal
   kart olarak çizilir; oneri_gorunum "Görünüme git" butonuna bağlanır (onNavigate=goView).
   Geçmiş oturumluk (component state — DashboardApp ömrünce yaşar). Tema yalnız neonUi
   token'ları; z-index FAB 150 / panel 160 (Toast 200 üstte kalır).
   Spec: docs/09-sohbet-asistani.md */
import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, authFetch } from "../lib/authApi.js";
import { belgeMetniMi, belgeOzetiMd, pipelineOlay } from "../lib/belgeIsle.js";
import { makeNode } from "../lib/nodeMeta.js";
import { mdSatirTipi } from "../lib/mdSatir.js";
import { sesliMetneCevir, sesTanimaOlustur, sttDestekleniyorMu } from "../lib/sesliMod.js";
import { hafizaKaydet, hafizaTemizle, hafizaYukle } from "../lib/sohbetHafiza.js";
import { BANT, MONO, PAL, T, V, DERIN, ALFA, TYPE, RAD, SP, SH, Icon, focusRing } from "./neonUi.jsx";

const SESLI_MOD_ANAHTARI = "ke-sesli-mod";

const GORUNUM_ETIKET = {
  gelen: "Gelen evrak", giden: "Giden evrak", taslaklar: "Taslaklar",
  mevzuat: "Mevzuat", denetim: "Denetim", panel: "Panel", islenen: "İşlenen evrak",
};
const ONERILER = [
  "Son gelen evraklar", "Reddedilen giden evraklar", "Kaç evrak işledik?",
  "Mevzuat kataloğu", "Son işlemin detayı", "Risk bandı nedir?",
];
const KARSILAMA = {
  rol: "asistan",
  karsilama: true,  // kararlı bayrak: reload'da referans-eşitliği bozulur, bu bayrak korunur (bug avı)
  icerik: "Merhaba! Ben **evrak asistanı**. Gelen/giden evraklarınızı listeleyebilir, " +
    "işlem geçmişinizi gösterebilir, mevzuat arayabilir ve sistemin işleyişini anlatabilirim.",
};

/* Hafif markdown: **kalın** + satır sonu + "• " madde + "---" yatay ayraç (kütüphanesiz). */
function Md({ text }) {
  return (text || "").split("\n").map((satir, i) => {
    const tip = mdSatirTipi(satir);
    if (tip === "hr") {
      return <hr key={i} aria-hidden="true" style={{ border: "none", borderTop: `1px solid ${PAL.line}`, margin: "8px 0" }} />;
    }
    const madde = tip === "madde";
    const icerik = (madde ? satir.slice(2) : satir).split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={j} style={{ fontWeight: 600, color: PAL.ink }}>{p.slice(2, -2)}</strong> : p);
    return madde
      ? <span key={i} style={{ display: "flex", gap: SP.s }}><span aria-hidden="true" style={{ color: DERIN.T }}>•</span><span style={{ minWidth: 0 }}>{icerik}</span></span>
      : <span key={i} style={{ display: "block" }}>{icerik}</span>;
  });
}

/* Tek kayıt kartı — tür-bilinçli alanlar (MONO yalnız makine-verisi meta satırı + risk noktası). */
function KayitKart({ tur, k }) {
  const ad = k.baslik || k.konu || k.name || k.evrak_no || k.giden_no || "kayıt";
  const risk = k.risk || k.bant;
  const satir2 = [
    tur === "gelen" && k.evrak_no,
    tur === "giden" && k.durum, tur === "giden" && k.alici_birim,
    tur === "islem" && k.evrak_turu, tur === "islem" && k.hedef_birim,
    tur === "taslak" && k.yazi_turu_kod,
    tur === "mevzuat" && (k.kanun_no || k.no) && `${k.kanun_no || k.no} sayılı`,
    tur === "mevzuat" && k.madde_no && `m. ${k.madde_no}`,
    tur === "mevzuat" && k.madde_sayisi && `${k.madde_sayisi} madde`,
    (k.olusturuldu || k.gonderim_tarihi || "").slice(0, 10),
  ].filter(Boolean);
  return (
    <div style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "8px 12px", display: "grid", gap: SP.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        {risk && BANT[risk] && <span title={BANT[risk].l} aria-label={`Risk: ${BANT[risk].l}`} style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[risk].c, flexShrink: 0 }} />}
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      </div>
      {satir2.length > 0 && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{satir2.join(" · ")}</span>}
      {tur === "mevzuat" && k.snippet && <span style={{ ...TYPE.meta, color: PAL.mut }}>{k.snippet}</span>}
    </div>
  );
}

/* Mevzuat kaynak çipi — asistan cevabının dayandığı madde; tıklanınca okuma modalı
   ilgili maddede açılır (DashboardApp köprüsü → MevzuatView.hedef). */
function KaynakCip({ kaynak, onMevzuatAc, onClose }) {
  const etiket = [kaynak.no && `${kaynak.no}`, kaynak.baslik, kaynak.madde_no != null && `m.${kaynak.madde_no}`]
    .filter(Boolean).join(" · ");
  return (
    <button type="button" {...focusRing} title={`${kaynak.baslik}: tam metni oku`}
      onClick={() => { onMevzuatAc?.({ dosya: kaynak.dosya, maddeNo: kaynak.madde_no ?? null }); onClose(); }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, maxWidth: "100%", ...TYPE.meta, fontWeight: 500, color: DERIN.V, background: ALFA(V), border: "none", borderRadius: RAD.chip, padding: "4px 10px", transition: "background .12s ease-out" }}>
      <Icon.book width={12} height={12} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiket}</span>
    </button>
  );
}

/* Mesaj balonu — kullanıcı sağda (T tint zemin), asistan solda (yüzey + hairline). */
function Balon({ m, onNavigate, onClose, onTeyit, onMevzuatAc, bekliyor }) {
  const kullanici = m.rol === "kullanici";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: kullanici ? "flex-end" : "flex-start", gap: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <div style={{
        maxWidth: "88%", padding: "8px 12px", borderRadius: RAD.pop, ...TYPE.ui,
        ...(kullanici
          ? { background: ALFA(T), color: PAL.ink, borderBottomRightRadius: RAD.chip }
          : { background: PAL.surf2, border: `1px solid ${PAL.line}`, color: PAL.ink2, borderBottomLeftRadius: RAD.chip }),
      }}>
        <Md text={m.icerik} />
      </div>
      {m.kayitlar?.length > 0 && (
        <div style={{ display: "grid", gap: SP.s, width: "88%" }}>
          {m.kayitlar.slice(0, 8).map((k, i) => <KayitKart key={i} tur={m.kayit_turu} k={k} />)}
        </div>
      )}
      {m.mevzuat_kaynaklari?.length > 0 && (
        <div role="group" aria-label="Cevabın mevzuat kaynakları" style={{ display: "flex", flexWrap: "wrap", gap: SP.s, maxWidth: "88%" }}>
          {m.mevzuat_kaynaklari.map((k, i) => (
            <KaynakCip key={`${k.dosya}-${k.madde_no ?? i}`} kaynak={k} onMevzuatAc={onMevzuatAc} onClose={onClose} />
          ))}
        </div>
      )}
      {m.onay_bekleyen && !m.onay_kullanildi && (
        <div style={{ display: "flex", gap: SP.s }}>
          {/* Başka bir mesaj akışta iken (bekliyor) devre dışı: aksi halde onTeyit balonu
              hemen "kullanıldı" işaretler ama gonder() kendi bekliyor kontrolünde isteği
              sessizce atlar — karar hiç gönderilmeden kaybolurdu (regresyon bulgusu). */}
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, true)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 500, color: PAL.onAccent, background: DERIN.T, border: "none", borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            <Icon.check /> Evet, uygula
          </button>
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, false)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, ...TYPE.data, fontWeight: 500, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            Vazgeç
          </button>
        </div>
      )}
      {m.oneri_gorunum && GORUNUM_ETIKET[m.oneri_gorunum] && (
        <button type="button" {...focusRing}
          onClick={() => { onNavigate?.(m.oneri_gorunum); onClose(); }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.data, fontWeight: 500, color: DERIN.T, background: ALFA(T), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          {GORUNUM_ETIKET[m.oneri_gorunum]} görünümüne git <Icon.arrow width={13} height={13} />
        </button>
      )}
      {m.hata && (
        <button type="button" {...focusRing} onClick={m.tekrar}
          style={{ cursor: "pointer", ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi, background: ALFA(BANT.kirmizi.c), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

function Yaziyor() {
  return (
    <div aria-label="Asistan yazıyor" role="status" style={{ display: "flex", gap: SP.xs, padding: "8px 12px", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop, width: "fit-content" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.mut3, animation: `nu-think 1.1s ${i * 0.18}s infinite` }} />
      ))}
    </div>
  );
}

export default function ChatbotWidget({ onNavigate, onMevzuatAc }) {
  const queryClient = useQueryClient();   // teyit sonrası panel/giden senkronu
  const [acik, setAcik] = useState(false);
  // Kaydırma sırasında FAB küçülüp soluklaşır (satır eylemlerini örtmesin — jüri bulgusu);
  // durunca 500ms sonra geri gelir. capture:true iç scroll konteynerlerini de yakalar.
  const [kayiyor, setKayiyor] = useState(false);
  useEffect(() => {
    let t = null;
    const h = () => {
      setKayiyor(true);
      clearTimeout(t);
      t = setTimeout(() => setKayiyor(false), 500);
    };
    document.addEventListener("scroll", h, { capture: true, passive: true });
    return () => { document.removeEventListener("scroll", h, { capture: true }); clearTimeout(t); };
  }, []);
  // Sohbet geçmişi localStorage'dan hidre edilir (reload/sekme kalıcılığı; DB gerektirmez).
  const [mesajlar, setMesajlar] = useState(() => hafizaYukle() ?? [KARSILAMA]);
  const [girdi, setGirdi] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [kaynak, setKaynak] = useState(null);   // son yanıtın kaynağı (llm|fallback) — şeffaflık
  // Sesli mod: opt-in (varsayılan KAPALI — sürpriz ses istemeyen kullanıcıyı rahatsız etmez),
  // localStorage'da kalıcı. STT (mikrofon) tarayıcı desteklemiyorsa (Firefox vb.) buton hiç
  // render edilmez — sessiz devre dışı, hata yok.
  const sttVar = sttDestekleniyorMu();
  const [sesliModAcik, setSesliModAcik] = useState(() => {
    try { return sttVar && window.localStorage.getItem(SESLI_MOD_ANAHTARI) === "1"; } catch { return false; }
  });
  const [dinliyor, setDinliyor] = useState(false);
  const tanimaRef = useRef(null);
  const sesRef = useRef(null);   // çalan TTS <audio> — yeni mikrofon/kapatma barge-in ile keser
  const fabRef = useRef(null);
  const inputRef = useRef(null);
  const listeRef = useRef(null);

  // Yeni mesaj/durumda en alta kay (kullanıcı son cevabı görsün).
  useEffect(() => {
    if (listeRef.current) listeRef.current.scrollTop = listeRef.current.scrollHeight;
  }, [mesajlar, bekliyor, acik]);
  useEffect(() => { if (acik) inputRef.current?.focus(); }, [acik]);

  // Konuşma bitince (akış sürerken değil) geçmişi localStorage'a yaz — reload'da kalıcı.
  useEffect(() => { if (!bekliyor) hafizaKaydet(mesajlar); }, [mesajlar, bekliyor]);

  const kapat = () => { setAcik(false); fabRef.current?.focus(); };
  const gecmisiTemizle = () => {
    sesRef.current?.pause();
    hafizaTemizle(); setMesajlar([KARSILAMA]); setKaynak(null); inputRef.current?.focus();
  };

  // Asistan yanıtını backend TTS'e (OpenAI, /sohbet/seslendir) gönderip sesli oynatır.
  // TTS anahtarı yoksa/hata olursa backend 503 döner — burada SESSİZCE düşülür (metin balonu
  // zaten ekranda, sohbet asla bozulmaz). Yeni yanıt geldiğinde önceki ses barge-in ile kesilir.
  const sesliOku = async (yaniMetin) => {
    const duz = sesliMetneCevir(yaniMetin);
    if (!duz) return;
    try {
      const res = await authFetch("/sohbet/seslendir", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metin: duz }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      sesRef.current?.pause();
      const ses = new Audio(url);
      ses.onended = () => URL.revokeObjectURL(url);
      sesRef.current = ses;
      ses.play().catch(() => {});
    } catch {
      /* ağ hatası — sessiz düş, sohbet metni etkilenmez */
    }
  };

  const sesliModDegistir = () => {
    setSesliModAcik((v) => {
      const yeni = !v;
      try { window.localStorage.setItem(SESLI_MOD_ANAHTARI, yeni ? "1" : "0"); } catch { /* yoksay */ }
      if (!yeni) sesRef.current?.pause();
      return yeni;
    });
  };

  // Mikrofon push-to-talk: basınca dinlemeye başlar, transcript gelince otomatik gönderir.
  // Konuşmaya başlarken çalan TTS sesi barge-in ile kesilir (üst üste binmesin).
  const mikrofonBasildi = () => {
    if (dinliyor) { tanimaRef.current?.stop(); return; }
    sesRef.current?.pause();
    const tanima = sesTanimaOlustur({
      onSonuc: (metin) => gonder(metin),
      onBitti: () => setDinliyor(false),
      onHata: () => setDinliyor(false),
    });
    if (!tanima) return;
    tanimaRef.current = tanima;
    setDinliyor(true);
    tanima.start();
  };

  // Son (akan) asistan balonunu fonksiyonel güncelle — akış sırasında state yarışı olmaz.
  const sonuGuncelle = (fn) => setMesajlar((ms) => {
    const s = ms.slice();
    s[s.length - 1] = fn(s[s.length - 1]);
    return s;
  });

  // SSE gövdesini işle: meta (kayıtlar/onay) → delta (token) → done (kaynak + tam yanıt).
  const akisiOku = async (res) => {
    setMesajlar((ms) => [...ms, { rol: "asistan", icerik: "", akiyor: true }]);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    // Tek SSE bloğunu işle (döngüde + döngü sonrası kalan için ortak — bug avı: ayraçsız
    // son 'done' event'i düşüyordu → sessiz yarım yanıt, kaynak rozeti güncellenmiyordu).
    const islemBlok = (blok) => {
      const satir = blok.split("\n").find((l) => l.startsWith("data:"));
      if (!satir) return;
      let ev;
      try { ev = JSON.parse(satir.slice(5)); } catch { return; }
      if (ev.event === "meta") {
        sonuGuncelle((son) => ({ ...son, kayitlar: ev.kayitlar, kayit_turu: ev.kayit_turu, oneri_gorunum: ev.oneri_gorunum, onay_bekleyen: ev.onay_bekleyen, mevzuat_kaynaklari: ev.mevzuat_kaynaklari }));
      } else if (ev.event === "delta" && ev.t) {
        sonuGuncelle((son) => ({ ...son, icerik: (son.icerik || "") + ev.t }));
      } else if (ev.event === "done") {
        setKaynak(ev.kaynak);
        sonuGuncelle((son) => ({ ...son, icerik: ev.yanit || son.icerik, akiyor: false }));
        if (sesliModAcik && ev.yanit) sesliOku(ev.yanit);
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        islemBlok(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
    buf += dec.decode();               // flush (kalan çok-baytlı karakter)
    if (buf.trim()) islemBlok(buf);    // ayraçsız son event'i de işle
    sonuGuncelle((son) => ({ ...son, akiyor: false }));
  };

  const gonder = async (metin, onayBaglam = null) => {
    const mesaj = (metin ?? girdi).trim();
    if (!mesaj || bekliyor) return;
    setGirdi("");
    setBekliyor(true);
    // gecmis: karşılama + hata balonları hariç son 8 gerçek tur.
    const gecmis = mesajlar
      .filter((m) => !m.karsilama && !m.hata)  // karşılama (reload'da yeni obje) + hata balonları hariç
      .slice(-8)
      .map((m) => ({ rol: m.rol, icerik: m.icerik.slice(0, 4000) }));
    const govde = { mesaj, gecmis, ...(onayBaglam ? { onay_baglam: onayBaglam } : {}) };
    setMesajlar((ms) => [...ms, { rol: "kullanici", icerik: mesaj }]);
    try {
      // Birincil: SSE akışı (token-token). Başarısızsa aşağıda düz POST'a düşülür.
      const res = await authFetch("/sohbet/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde),
      });
      if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
      await akisiOku(res);
    } catch {
      // Onay eylemi taşıyan istek OTOMATİK yeniden gönderilmez (bug avı bulgusu): akış
      // sunucuda eylemi UYGULAMIŞ olabilir — düz-POST tekrarı aynı onayı ikinci kez işleyip
      // Giden Evrak'a çift kayıt açardı. Yarım balon kapatılır, karar kullanıcıya bırakılır.
      if (onayBaglam) {
        setMesajlar((ms) => [
          ...ms
            .filter((m) => !(m.rol === "asistan" && m.akiyor && !m.icerik))
            .map((m) => (m.akiyor ? { ...m, akiyor: false } : m)),
          {
            rol: "asistan", hata: true, tekrar: () => gonder(mesaj, onayBaglam),
            icerik: "Bağlantı akış sırasında koptu — eylem uygulanmış olabilir. Giden Evrak'ı kontrol edin; uygulanmadıysa Tekrar dene.",
          },
        ]);
        return;
      }
      try {
        const y = await apiPost("/sohbet", govde);
        setKaynak(y.kaynak);
        const msg = { rol: "asistan", icerik: y.yanit, kayitlar: y.kayitlar, kayit_turu: y.kayit_turu, oneri_gorunum: y.oneri_gorunum, onay_bekleyen: y.onay_bekleyen, mevzuat_kaynaklari: y.mevzuat_kaynaklari };
        setMesajlar((ms) => {
          const s = ms.slice();
          const son = s[s.length - 1];
          // Akış yarıda kesildiyse (kısmi içerikli DÂHİL — çift balon olmasın) üzerine yaz.
          if (son?.rol === "asistan" && son.akiyor) s[s.length - 1] = msg;
          else s.push(msg);
          return s;
        });
      } catch (err2) {
        setMesajlar((ms) => [
          ...ms.map((m) => (m.akiyor ? { ...m, akiyor: false } : m)),
          {
            rol: "asistan", hata: true, tekrar: () => gonder(mesaj, onayBaglam),
            icerik: `Yanıt alınamadı: ${err2.message || "bağlantı hatası"}`,
          },
        ]);
      }
    } finally {
      setBekliyor(false);
    }
  };

  // Belge işle (FAZ 3, Görev 1): yapıştırılan evrak metnini /process_doc/stream'e (.txt blob)
  // gönder → pipeline node'ları CANLI akar ("✓ Sınıflandır… ✓ Mevzuat Öner…"), done'da Görev-1
  // özeti render edilir. "Ajanı izle" demo anı. Kısa sorgu değilse dürüst uyarı verir.
  const belgeYukle = async (metin) => {
    const text = (metin ?? girdi).trim();
    if (!text || bekliyor) return;
    if (!belgeMetniMi(text)) {
      setMesajlar((ms) => [...ms, {
        rol: "asistan",
        icerik: "İşlemek için evrak metnini (en az birkaç cümle) yapıştırıp 📎 işle deyin.",
      }]);
      return;
    }
    setGirdi("");
    setBekliyor(true);
    const onizleme = text.slice(0, 80) + (text.length > 80 ? "…" : "");
    setMesajlar((ms) => [
      ...ms,
      { rol: "kullanici", icerik: `📎 Belge işlensin: ${onizleme}` },
      { rol: "asistan", icerik: "📄 Belge işleniyor…", akiyor: true },
    ]);
    const bitenler = [];
    try {
      const fd = new FormData();
      fd.append("file", new Blob([text], { type: "text/plain" }), "sohbet-evrak.txt");
      const res = await authFetch("/process_doc/stream", { method: "POST", body: fd });
      if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let sonucGeldi = false;
      // Tek SSE bloğunu işle — döngü + döngü sonrası kalan için ortak (bug avı: ayraçsız son
      // 'done' event'i düşüyordu → özet hiç görünmüyor, balon 'işleniyor…'da kalıyordu).
      const islemBlok = (blok) => {
        const satir = blok.split("\n").find((l) => l.startsWith("data:"));
        if (!satir) return;
        let ev;
        try { ev = JSON.parse(satir.slice(5)); } catch { return; }
        const o = pipelineOlay(ev);
        if (o.tip === "node") {
          bitenler.push(`✓ ${makeNode(o.node).label}`);
          sonuGuncelle((son) => ({ ...son, icerik: `📄 Belge işleniyor…\n${bitenler.join("\n")}` }));
        } else if (o.tip === "sonuc") {
          sonucGeldi = true;
          setKaynak("llm");
          sonuGuncelle((son) => ({ ...son, icerik: belgeOzetiMd(o.sonuc), akiyor: false }));
        } else if (o.tip === "hata") {
          sonucGeldi = true;
          sonuGuncelle((son) => ({ ...son, icerik: `Belge işlenemedi: ${o.mesaj}`, akiyor: false, hata: true }));
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          islemBlok(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
      }
      buf += dec.decode();               // flush
      if (buf.trim()) islemBlok(buf);    // ayraçsız son event'i de işle
      if (!sonucGeldi) {                 // hiç sonuç/hata gelmedi → dürüst yarım-kaldı mesajı
        sonuGuncelle((son) => ({
          ...son, akiyor: false, hata: true, tekrar: () => belgeYukle(text),
          icerik: "Belge işleme yarım kaldı — sonuç alınamadı. Tekrar deneyin.",
        }));
      } else {
        sonuGuncelle((son) => ({ ...son, akiyor: false }));
      }
    } catch (err) {
      sonuGuncelle((son) => ({
        ...son, akiyor: false, hata: true, tekrar: () => belgeYukle(text),
        icerik: `Belge işlenemedi: ${err.message || "bağlantı hatası"}`,
      }));
    } finally {
      setBekliyor(false);
    }
  };

  // HITL teyit butonları — bağlamı geri göndererek eylemi uygula/iptal et.
  // "Evet" DB'ye gerçek karar yazar (sohbet.py → onayla_ve_gonder) — Panel/Taslaklar/Giden
  // ekranları eskiden F5'e dek eski durumu gösteriyordu (denetim bulgusu): kararın ardından
  // islemler + giden-evrak sorguları invalidate edilir, DashboardApp effect'leri DB gerçeğini kurar.
  const onTeyit = async (m, evet) => {
    setMesajlar((ms) => ms.map((x) => (x === m ? { ...x, onay_kullanildi: true } : x)));
    await gonder(evet ? "evet" : "vazgeç", m.onay_bekleyen);
    if (evet) {
      queryClient.invalidateQueries({ queryKey: ["islemler"] });
      queryClient.invalidateQueries({ queryKey: ["giden-evrak"] });
    }
  };

  const ilkAcilis = mesajlar.length <= 1;
  const gonderPasif = bekliyor || !girdi.trim();

  return (
    <>
      {acik && (
        <section role="dialog" aria-label="Evrak asistanı sohbeti"
          onKeyDown={(e) => { if (e.key === "Escape") kapat(); }}
          style={{
            position: "fixed", right: SP.xl, bottom: 96, zIndex: 160,
            width: "min(384px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 130px))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop,
            boxShadow: SH.modal,
            animation: "nu-rise .16s var(--ke-ease-out) both",
          }}>
          {/* Başlık */}
          <header style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "12px 16px", background: PAL.surf, borderBottom: `1px solid ${PAL.line}` }}>
            <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RAD.dot, display: "grid", placeItems: "center", background: DERIN.T, color: PAL.onAccent, flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8.5 8.5 H15.5 M8.5 11.5 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Evrak asistanı</div>
              <div style={{ ...TYPE.meta, color: PAL.mut2 }}>
                evrak sorgula · mevzuat ara · site rehberi
                {kaynak && <span style={{ marginLeft: SP.s, color: kaynak === "llm" ? DERIN.T : PAL.mut3 }}>[{kaynak === "llm" ? "canlı model" : "kural tabanlı"}]</span>}
              </div>
            </div>
            {sttVar && (
              <button type="button" aria-label={sesliModAcik ? "Sesli modu kapat" : "Sesli modu aç"}
                title={sesliModAcik ? "Sesli mod açık — yanıtlar okunur" : "Sesli modu aç"}
                aria-pressed={sesliModAcik} onClick={sesliModDegistir} {...focusRing}
                style={{ cursor: "pointer", width: 30, height: 30, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: sesliModAcik ? ALFA(T) : "none", color: sesliModAcik ? DERIN.T : PAL.mut, display: "grid", placeItems: "center", padding: 0, transition: "background .12s ease-out" }}>
                {sesliModAcik ? <Icon.volume /> : <Icon.volumeOff />}
              </button>
            )}
            {mesajlar.length > 1 && (
              <button type="button" aria-label="Sohbet geçmişini temizle" title="Geçmişi temizle" onClick={gecmisiTemizle} {...focusRing}
                style={{ cursor: "pointer", width: 30, height: 30, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "none", color: PAL.mut, display: "grid", placeItems: "center", padding: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7 H20 M9 7 V5 a1 1 0 0 1 1-1 H14 a1 1 0 0 1 1 1 V7 M6 7 L7 19 a2 2 0 0 0 2 2 H15 a2 2 0 0 0 2-2 L18 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            <button type="button" aria-label="Sohbeti kapat" onClick={kapat} {...focusRing}
              style={{ cursor: "pointer", width: 30, height: 30, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "none", color: PAL.mut, display: "grid", placeItems: "center", padding: 0 }}>
              <Icon.x />
            </button>
          </header>

          {/* Mesajlar */}
          <div ref={listeRef} role="log" aria-live="polite" aria-atomic="false" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: SP.m }}>
            {mesajlar.map((m, i) => <Balon key={i} m={m} onNavigate={onNavigate} onClose={kapat} onTeyit={onTeyit} onMevzuatAc={onMevzuatAc} bekliyor={bekliyor} />)}
            {bekliyor && mesajlar[mesajlar.length - 1]?.rol === "kullanici" && <Yaziyor />}
            {ilkAcilis && !bekliyor && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: SP.xs }}>
                {ONERILER.map((o) => (
                  <button key={o} type="button" {...focusRing} onClick={() => gonder(o)}
                    style={{ cursor: "pointer", ...TYPE.meta, fontWeight: 500, color: PAL.ink2, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.chip, padding: "4px 12px", transition: "background .12s ease-out" }}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Giriş */}
          <form onSubmit={(e) => { e.preventDefault(); gonder(); }}
            style={{ display: "flex", gap: SP.s, padding: SP.m, borderTop: `1px solid ${PAL.line}`, background: PAL.surf }}>
            <button type="button" aria-label="Belgeyi işle (Görev 1)" title="Yapıştırdığınız evrak metnini işle: tür, özet, birim, mevzuat, taslak"
              disabled={bekliyor || !girdi.trim()} onClick={() => belgeYukle()} {...focusRing}
              style={{
                cursor: bekliyor || !girdi.trim() ? "not-allowed" : "pointer", width: 36, height: 36, borderRadius: RAD.ctl,
                border: `1px solid ${PAL.inputLine}`, background: PAL.surf,
                color: bekliyor || !girdi.trim() ? PAL.mut2 : DERIN.T, display: "grid", placeItems: "center", flexShrink: 0,
                transition: "color .12s ease-out",
              }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 7 L9.5 15.5 a2.5 2.5 0 0 1-3.5-3.5 L14 4 a4 4 0 0 1 5.5 5.5 L11 18 a5.5 5.5 0 0 1-7.7-7.7 L11 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <input ref={inputRef} type="text" value={girdi} onChange={(e) => setGirdi(e.target.value)}
              placeholder="Evrak sorun, mevzuat arayın…" aria-label="Asistana mesaj yaz"
              maxLength={1000} {...focusRing}
              style={{ flex: 1, minWidth: 0, ...TYPE.ui, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", outline: "none" }} />
            {sttVar && (
              <button type="button" aria-label={dinliyor ? "Dinlemeyi durdur" : "Sesle konuş"}
                title={dinliyor ? "Dinliyor… bitirince otomatik gönderilir" : "Sesle konuş"}
                disabled={bekliyor} onClick={mikrofonBasildi} {...focusRing}
                style={{
                  cursor: bekliyor ? "not-allowed" : "pointer", width: 36, height: 36, borderRadius: RAD.ctl,
                  border: `1px solid ${dinliyor ? DERIN.kirmizi : PAL.inputLine}`,
                  background: dinliyor ? ALFA(BANT.kirmizi.c) : PAL.surf,
                  color: bekliyor ? PAL.mut2 : dinliyor ? DERIN.kirmizi : DERIN.T,
                  display: "grid", placeItems: "center", flexShrink: 0,
                  animation: dinliyor ? "nu-think 1.1s infinite" : "none",
                  transition: "color .12s ease-out, background .12s ease-out",
                }}>
                <Icon.mic width={17} height={17} />
              </button>
            )}
            <button type="submit" aria-label="Mesajı gönder" disabled={gonderPasif} {...focusRing}
              style={{
                cursor: gonderPasif ? "not-allowed" : "pointer", width: 40, height: 36, borderRadius: RAD.ctl, border: "none",
                background: gonderPasif ? PAL.press : DERIN.T,
                color: gonderPasif ? PAL.mut2 : PAL.onAccent, display: "grid", placeItems: "center", flexShrink: 0,
                transition: "background .12s ease-out",
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12 L20 4 L14 20 L11.5 13.5 L4 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            </button>
          </form>
        </section>
      )}

      {/* FAB — her görünümde sağ altta */}
      <button ref={fabRef} type="button" onClick={() => (acik ? kapat() : setAcik(true))}
        aria-label={acik ? "Evrak asistanını kapat" : "Evrak asistanını aç"} aria-expanded={acik} {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = DERIN.Th; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = DERIN.T; }}
        style={{
          position: "fixed", right: SP.xl, bottom: SP.xl, zIndex: 150, width: 58, height: 58,
          borderRadius: RAD.dot, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          background: DERIN.T, color: PAL.onAccent,
          boxShadow: SH.pop,
          // Kaydırma sırasında küçül+soluklaş: liste eylemlerinin üstünü örtmesin (panel
          // açıkken davranış devre dışı — konuşma sürerken FAB sabit kalır).
          opacity: kayiyor && !acik ? 0.3 : 1,
          transform: kayiyor && !acik ? "scale(.72)" : "scale(1)",
          transformOrigin: "bottom right",
          transition: "background .12s ease-out, opacity .2s ease, transform .25s var(--ke-ease-out)",
        }}>
        {acik ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="9" cy="9.5" r="1" fill="currentColor" /><circle cx="12.5" cy="9.5" r="1" fill="currentColor" /><circle cx="16" cy="9.5" r="1" fill="currentColor" /></svg>
        )}
      </button>
    </>
  );
}
