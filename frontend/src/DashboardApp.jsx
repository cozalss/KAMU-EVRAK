/* DashboardApp — kamu-evrak neon çalışma alanı kabuğu + oturum kurgusu.
   Sidebar (işlevsel nav) + görünüm anahtarlama (Panel/İşlenen/Gelen/İşleniyor/Taslaklar/Giden/Mevzuat/Denetim).
   usePipeline tek evrak işler; sonuçlar OTURUM GEÇMİŞİNE eklenir → Panel/İşlenen/Taslaklar/Denetim beslenir.
   Akış: Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç geçmişe → Panel'de özet.
   Kurgu ayrımı: İşlenen = tüm işlemlerin arşivi (karar durumuyla) · Taslaklar = yalnız karar
   bekleyen taslak çalışma kuyruğu · Giden = gönderilmiş arşiv.
   Eski açık-tema App.jsx korunur (geri dönüş: main.jsx). */
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { usePipeline, ACCEPT } from "./lib/usePipeline.js";
import { useAktifKurum } from "./hooks/useAktifKurum.js";
import { createSekans, mevzuatAnahtar, mevzuatOzet, sonrakiSecim } from "./lib/dayanakSecim.js";
import { apiDelete, apiGet, apiPatch, apiPost, cachedDashboard } from "./lib/authApi.js";
import { useAuth } from "./lib/useAuth.jsx";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { sampleAdIndex, kuyrukDurumuTuret } from "./lib/kuyrukDurumu.js";
import { ayniKosumMu, varyantBirlestir } from "./lib/sicilVaryant.js";
import { PAL, DERIN, SANS, TYPE, RAD, SP, SH, ALFA, BANT, Icon, focusRing, SR_ONLY, NEON_KEYFRAMES } from "./components/neonUi.jsx";
import NeonSidebar from "./components/NeonSidebar.jsx";
// PanelView VARSAYILAN açılış görünümü → EAGER: her refresh'te lazy chunk beklemesi
// ("yükleniyor…" flash) yaşanmasın, panel anında görünsün. Bağımlılıkları (neonUi +
// result-cards) zaten usePipeline→nodeMeta zinciriyle ana bundle'da olduğundan ilk yük
// indirmesine pratikte ağırlık eklemez.
import PanelView from "./components/PanelView.jsx";
// Mevzuat okuma modalı ("kağıt") — global overlay: ayrıntılı sonuç ekranı + sohbet çipi
// mevzuata tıklayınca SAYFA DEĞİŞTİRMEDEN üstte açılır. Hafif (yalnız neonUi bağımlı) → eager.
import { OkumaModal } from "./components/MevzuatOkuma.jsx";
// Diğer görünümler TEMBEL yüklenir (kod bölme) → ilk yük bundle'ı küçülür; görünümler birebir
// aynı kalır, yalnız ilgili görünüme ilk geçişte küçük bir chunk indirilir. NeonSidebar
// her zaman görünür (nav) olduğundan eager kalır.
const CanliAjanAkisi = lazy(() => import("./components/CanliAjanAkisi.jsx"));
const IslenenEvrakView = lazy(() => import("./components/IslenenEvrakView.jsx"));
const GelenEvrakView = lazy(() => import("./components/GelenEvrakView.jsx"));
const GidenEvrakView = lazy(() => import("./components/GidenEvrakView.jsx"));
const TaslaklarView = lazy(() => import("./components/TaslaklarView.jsx"));
const MevzuatView = lazy(() => import("./components/MevzuatView.jsx"));
const DenetimView = lazy(() => import("./components/DenetimView.jsx"));
// AI Bürokrasi Kurulu artık ayrı sekme değil — Taslaklar'da taslak-başına modal
// (TaslaklarView → KurulModal). Eski "kurul" hash'i VIEWS dışına düşer → panel'e döner.
// Sohbet asistanı (FAB + panel) — her görünümde sağ altta; tembel: yalnız kabuk yüklendikten
// sonra iner, ilk yük bundle'ına ağırlık eklemez. Spec: docs/09-sohbet-asistani.md
const ChatbotWidget = lazy(() => import("./components/ChatbotWidget.jsx"));
// Telefonla evrak çekme (QR eşleme) — yalnız açılınca iner (react-qr-code ana bundle'a girmez).
const TelefonYukleModal = lazy(() => import("./components/TelefonYukle.jsx"));

// Görünüm ↔ URL hash eşlemesi (app.html#gelen). Görünüm geçişleri tarayıcı geçmişine yazılır →
// fare/tarayıcı "geri" tuşu landing'e fırlatmak yerine ÖNCEKİ GÖRÜNÜME döner; yenilemede
// görünüm korunur. Router bağımlılığı yok (tek kabuk, altı görünüm — hash yeterli).
const VIEWS = new Set(["panel", "islenen", "gelen", "giden", "taslaklar", "mevzuat", "denetim", "isleniyor"]);
const hashView = () => window.location.hash.slice(1);

// DB geçmişinden taslak listesi türet: taslağı ÜRETİLMİŞ ve henüz KARAR VERİLMEMİŞ işlemler
// (onaylanmış/reddedilmiş işlemler Giden Evrak'a düşer — burada tekrar taslak sayılmaz;
// Panel'deki "karar bekleyen" tanımıyla birebir aynı süzgeç). Hem açılış hidrasyonunda
// hem de DB reconcile'ında aynı eşleme → iki yol tutarlı kalsın.
// Oturumluk satır id'si sentetiktir (`${Date.now()}-${sıra}-${ad}`) — önbellekten hidre
// edilince db-taslak- öneki bu sentetik id'yi DB islem id'si sanıp yanlış uca gönderiyordu
// (bug avı bulgusu: PATCH/DELETE 404, silinen taslak refresh'te diriliyordu). Önek daima
// GERÇEK islem id'siyle kurulur: result.islem_id (persist merge'i) varsa o, yoksa satır id.
const draftsFromHistory = (items) =>
  (items || []).filter((x) => x.result?.yazi_taslak_md && !x.result?.onay_durumu).map((x) => ({
    ...x,
    id: `db-taslak-${x.result?.islem_id || x.id}`,
    name: x.name || "Kalıcı taslak",
  }));

// Sentetik oturum id deseni (13 hane epoch + sıra + ad) — db-taslak- önekinden ayıklanan
// kısım buna uyuyorsa DB islem id'si DEĞİLDİR; islem_id çözümü result üzerinden yapılır.
const SENTETIK_ID = /^\d{13}-\d+-/;
const islemIdCoz = (id, draft) => {
  const ek = String(id).startsWith("db-taslak-") ? String(id).slice("db-taslak-".length) : null;
  return draft?.result?.islem_id || (ek && !SENTETIK_ID.test(ek) ? ek : null);
};

// Frontend seçimi → DB onay kararı etiketi (karar_repo._KARAR ile birebir; duzenle
// nihai karar DEĞİLDİR — evrak "karar bekleyen"de kalır, damgalanmaz).
const KARAR_ETIKET = { onayla: "onaylandi", reddet: "reddedildi" };

// Örnek evrak (dosya adı `${id}.txt` / etiket) → id — kuyruk durumunu DB geçmişinden
// türetmek için (bkz. lib/kuyrukDurumu): gönderilmiş örnek refresh'te kuyruğa GERİ DÜŞMEZ.
const SAMPLE_AD_ID = sampleAdIndex(SAMPLE_DOCS);

// Görünüm geçişini View Transitions API ile sar: destekleyen tarayıcıda yumuşak
// çapraz-erime; destek yoksa ya da kullanıcı hareket azaltmışsa DÜZ geçiş (birebir eski
// davranış). flushSync: React güncellemesi geçiş kare-yakalaması içinde senkron uygulanmalı.
const gecisle = (fn) => {
  const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!document.startViewTransition || az) { fn(); return; }
  const t = document.startViewTransition(() => { flushSync(fn); });
  // Hızlı ard arda geçişte (sunucu görünümler arası hızlı tıklarsa) önceki geçiş SKIP edilir
  // ve .ready/.finished promise'leri "Transition was skipped" ile REJECT olur — yakalanmazsa
  // unhandled rejection (uncaught exception) olarak konsola düşer. Geçiş görsel; reddi yut.
  t?.ready?.catch(() => {});
  t?.finished?.catch(() => {});
  t?.updateCallbackDone?.catch(() => {});
};

export default function DashboardApp({ tema, onTemaDegistir }) {
  const {
    nodes, result, busy, error, toast, fileMeta, pendingOnay, evrakText, downloading, fileUrl,
    runFile, runSample, resume, cancelRun, download, showToast, dismissError, canRetry, retry, runBase, applyTaslak,
  } = usePipeline();
  const [aktifKurum, setAktifKurum] = useAktifKurum();

  const { user, logout } = useAuth();
  const queryClient = useQueryClient();   // karar sonrası DB gerçeğiyle tazeleme (invalidate)
  // Telefonla çek (QR) modalı — dosya telefondan gelince runFile mevcut SSE akışını başlatır.
  const [telefonAcik, setTelefonAcik] = useState(false);
  // Optimistik açılış: son bilinen panel verisini (history/outbox) localStorage'dan ANINDA kur
  // → refresh'te boş→dolu ("Henüz evrak işlenmedi") flash'ı yok. Arka plandaki DB fetch (aşağıdaki
  // effect) uzak Supabase'ten tazeleyip günceller; değişince persist effect önbelleği yeniler.
  const [cachedDash] = useState(() => cachedDashboard.get(user?.id));
  // Açılış görünümü URL hash'inden (yenilemede görünüm korunur); geçersiz/boş → panel.
  const [activeView, setActiveView] = useState(() => (VIEWS.has(hashView()) ? hashView() : "panel"));
  const [history, setHistory] = useState(() => cachedDash?.history || []);
  // Kuyruk durumu KALICI kayıttan türetilir (lib/kuyrukDurumu): açılışta önbellekten
  // (hem türetim hem doğrudan kaydedilmiş set'ler — /islemler limit=100 penceresinden
  // düşen eski kararlar da korunur; verify bulgusu), arkada DB fetch'inden (islemlerQ).
  const [processedIds, setProcessedIds] = useState(() => new Set([
    ...(cachedDash?.processedSamples || []),
    ...kuyrukDurumuTuret(cachedDash?.history, SAMPLE_AD_ID).processed,
  ]));
  // Onaylanıp/reddedilip Giden Evrak'a düşen örnekler (id) → artık işlenmiş VE gitmiş
  // sayılır, Gelen Evrak kuyruğunda görünmez ("Düzenle" ile taslağa alınanlar hariç,
  // onlar henüz gönderilmediği için kuyrukta kalır).
  const [sentSampleIds, setSentSampleIds] = useState(() => new Set([
    ...(cachedDash?.sentSamples || []),
    ...kuyrukDurumuTuret(cachedDash?.history, SAMPLE_AD_ID).sent,
  ]));
  const [outbox, setOutbox] = useState(() => cachedDash?.outbox || []);
  const [drafts, setDrafts] = useState(() => draftsFromHistory(cachedDash?.history));   // DB/önbellek taslakları + "Düzenle" ile eklenenler
  // Mevzuat okuma modalı hedefi ({dosya, maddeNo, maddeTur} | null). Ayrıntılı sonuç kartından
  // ya da sohbet çipinden set edilir → global OkumaModal açılır (sayfa değişmez, üstte "kağıt").
  const [okumaHedef, setOkumaHedef] = useState(null);
  // Panel SLA satırı "İşle" → Gelen Evrak'ta o evrakı vurgula+kaydır (aynı hedef deseni).
  const [gelenHedef, setGelenHedef] = useState(null);
  // Onay kartı "Düzenle" → Taslaklar'da o taslağı doğrudan düzenleme modunda aç (aynı hedef deseni).
  const [taslakHedef, setTaslakHedef] = useState(null);
  // Kuyruk SLA önizlemesi: id → sla_metadata (backend compute_sla — süre tablosu tek kaynak).
  const [slaMap, setSlaMap] = useState(null);
  const fileRef = useRef(null);
  const lastResultRef = useRef(null);
  const pendingApprovalRef = useRef(null);   // HITL kararı damgası (resume async)
  const sentRef = useRef(new Set());          // aynı sonuç iki kez gönderilmesin
  const draftedRef = useRef(new Set());       // aynı sonuç iki kez taslağa eklenmesin

  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const draftCount = drafts.length;
  const inboxCount = Math.max(0, SAMPLE_DOCS.length - sentSampleIds.size);
  const gidenCount = outbox.filter((o) => o.durum === "gonderildi").length;

  // Onaylanan/gönderilen evrakı Giden Evrak'a yaz (durum: gonderildi|duzenlendi|reddedildi).
  // Aynı sonuç iki kez gönderilmez (sentRef). SHA frontend'de üretilmez — backend son_hash taşınır.
  const pushOutbox = (res, fm, secim) => {
    if (!res || sentRef.current.has(res)) return false;
    sentRef.current.add(res);
    // Örnek eşleme İKİ yoldan: canlı koşumda fm.id (kind=sample), DB'den hidre edilmiş
    // taslakta ise kind "yukleme"dir — dosya adı/etiket üzerinden geri eşlenir; aksi halde
    // DB taslağı gönderilen örnek Gelen kuyruğunda kalmaya devam ediyordu.
    const sampleId = (fm?.kind === "sample" && fm.id) || SAMPLE_AD_ID.get(fm?.name || "") || null;
    if (sampleId) setSentSampleIds((s) => new Set(s).add(sampleId));
    const name = fm?.kind === "sample" ? (fm.label || fm.name) : (fm?.name || "evrak");
    const durum = secim === "reddet" ? "reddedildi" : secim === "duzenle" ? "duzenlendi" : "gonderildi";
    setOutbox((o) => [{
      // GEÇİCİ numara — gerçek giden_no backend /onayla yanıtından gelir ve persistDecision
      // satırı islem_id ile eşleyip günceller (eskiden oturum sayacından üretilen numara
      // DB'deki resmî numaradan SAPABİLİYORDU ve refresh'e dek ekranda kalıyordu — denetim bulgusu).
      id: `E-G-${new Date().getFullYear()}/${String(o.length + 1).padStart(4, "0")}`,
      islem_id: res.islem_id || null,
      kaynak_evrak_adi: name, gonderim_tarihi: Date.now(),
      evrak_turu: res.evrak_turu, tur: res.yazi_turu,
      konu: res.bilgi_unsurlari?.konu || res.alt_talepler?.[0]?.ozet || "—",
      alici_birim: res.hedef_birim, risk: res.risk_metadata?.bant || "yesil",
      durum, taslak: res.yazi_taslak_md || "",
      memor_adi: user?.ad_soyad || "Memur", memor_unvan: user?.unvan || "",
      // Liste zenginleştirme (kategori filtresi + satır): güven / evrak tarihi / SLA durumu.
      guven: typeof res.tur_confidence === "number" ? res.tur_confidence : null,
      evrak_tarihi: res.bilgi_unsurlari?.tarih || "",
      sla_durum: res.sla_metadata?.durum || "",
      ...(res.denetim_izi?.son_hash ? { son_hash: res.denetim_izi.son_hash } : {}),
    }, ...o]);
    return true;
  };

  // "Düzenle" → taslağı Taslaklar kuyruğuna ekle (YALNIZ kullanıcı Düzenle dediğinde;
  // aynı sonuç iki kez eklenmez, ikinci basışta mevcut taslağın id'si döner). Taslak yoksa
  // (yazi_taslak_md boş) eklenmez. Dönüş: taslak id (hedefli açılış için) ya da false.
  const pushDraft = (res, fm) => {
    if (!res || !res.yazi_taslak_md) return false;
    if (draftedRef.current.has(res)) {
      const mevcut = drafts.find((x) => x.result === res);
      if (mevcut) return mevcut.id;
      // Kuyruktan silinmiş (deleteDraft ref'i temizlemez) → yeniden eklenebilir olmalı;
      // aksi hâlde İşlenen'den ikinci "Düzenle" sessiz no-op kalıyordu.
      draftedRef.current.delete(res);
    }
    draftedRef.current.add(res);
    const name = fm?.kind === "sample" ? (fm.label || fm.name) : (fm?.name || "evrak");
    const id = `T-${Date.now()}-${name}`;
    setDrafts((d) => [{
      id, name, kind: fm?.kind, ts: Date.now(),
      evrak_turu: res.evrak_turu, hedef_birim: res.hedef_birim,
      bant: res.risk_metadata?.bant, result: res,
    }, ...d]);
    return id;
  };

  // done→persist arası (~20-27 sn soğuk Supabase) islem_id henüz yok — bu pencerede verilen
  // karar eskiden SESSİZCE DB'siz kalıyordu (adversarial-verify bulgusu: 2. refresh'te evrak
  // kuyruğa geri düşüyordu). Artık karar beklemeye alınır; persist merge'i gelince yazılır.
  const bekleyenKararRef = useRef(new Map());   // result → secim
  // Seçilen tür + metin de gönderilir: memur tür kutucuğuyla taslağı değiştirdiyse
  // DB'deki taslak karar anında güncellenir → kalıcı kayıt gönderilen içeriği yansıtır.
  const persistDecision = useCallback(async (res, secim) => {
    if (!res) return;
    if (!res.islem_id) { bekleyenKararRef.current.set(res, secim); return; }
    try {
      const yanit = await apiPost(`/islem/${encodeURIComponent(res.islem_id)}/onayla`, {
        secim, yazi_turu: res.yazi_turu || "", metin: res.yazi_taslak_md || "",
      });
      // Gerçek resmî numara: optimistik satırın geçici numarasını DB'nin giden_no'suyla
      // değiştir (islem_id eşleşmesi; persist-penceresi akışında islem_id'siz açılan satır
      // için en yeni numarasız satıra düşülür). Ardından giden listesi DB gerçeğiyle tazelenir.
      if (yanit?.giden_no) {
        setOutbox((o) => {
          const hedef = o.find((x) => x.islem_id === res.islem_id)
            || o.find((x) => !x.islem_id);
          return hedef ? o.map((x) => (x === hedef
            ? { ...x, id: yanit.giden_no, islem_id: res.islem_id } : x)) : o;
        });
        queryClient.invalidateQueries({ queryKey: ["giden-evrak"] });
      }
    } catch (err) {
      console.warn("Onay/giden evrak DB'ye yazılamadı", err);
      showToast("Evrak oturumda görünüyor; DB onay kaydı yazılamadı.");
    }
  }, [queryClient, showToast]);

  // Çok-konulu alt-talep kararı için persist — ana akıştaki persistDecision ile AYNI
  // done→persist yarışı koruması. islem_id henüz yoksa (~20-27 sn Supabase gecikmesi) karar
  // beklemeye alınır, persist merge'i gelince yazılır. Eskiden alt-talep yolu bu ağa BAĞLI
  // DEĞİLDİ: islem_id null'ken apiPost hiç denenmiyor ama başarı toast'ı + outbox commit
  // yapılıyordu → karar sessizce DB'siz kalıyor, refresh'te audit izinden düşüyordu (bug avı).
  const bekleyenAltKararRef = useRef(new Map());   // result → [{secim, sira, tur, metin}]
  const persistAltKarar = useCallback((res, karar) => {
    if (!res) return;
    if (!res.islem_id) {
      const liste = bekleyenAltKararRef.current.get(res) || [];
      liste.push(karar);
      bekleyenAltKararRef.current.set(res, liste);
      return;
    }
    apiPost(`/islem/${encodeURIComponent(res.islem_id)}/alt-talep/${karar.sira}/onayla`, {
      secim: karar.secim, yazi_turu: karar.tur || "", metin: karar.metin || "",
    }).then(() => queryClient.invalidateQueries({ queryKey: ["giden-evrak"] }))
      .catch((err) => {
        console.warn("Birim kararı DB'ye yazılamadı", err);
        showToast("Evrak oturumda görünüyor; birim kararı DB'ye yazılamadı.");
      });
  }, [queryClient, showToast]);

  // Sayfa yenilendiğinde kalıcı DB geçmişini yeniden kur (react-query: 3 deneme + üstel
  // geri çekilme — uzak Supabase'in DNS düşmelerine dayanıklı; provider varsayılanları
  // main.jsx'te). Pipeline sonucu yine canlı state'e eklenir; bu yükleme açılışta bir kez
  // koşar (staleTime: Infinity + odak-refetch kapalı → canlı eklemeler ezilmez).
  const islemlerQ = useQuery({
    queryKey: ["islemler", user?.id],
    queryFn: () => apiGet("/islemler?limit=100"),
    enabled: !!user,
  });
  useEffect(() => {
    if (islemlerQ.error) { console.warn("Kalıcı işlem geçmişi alınamadı", islemlerQ.error); return; }
    if (!islemlerQ.data) return;
    const items = Array.isArray(islemlerQ.data.kayitlar) ? islemlerQ.data.kayitlar : [];
    setHistory(items);
    setDrafts(draftsFromHistory(items));
    // Kuyruk durumunu DB gerçeğiyle BİRLEŞTİR (union): canlı oturumda işaretlenenler
    // korunur, geçmiş oturumların kararları da yansır → gönderilmiş örnek geri düşmez.
    const { processed, sent } = kuyrukDurumuTuret(items, SAMPLE_AD_ID);
    if (processed.size) setProcessedIds((p) => new Set([...p, ...processed]));
    if (sent.size) setSentSampleIds((s) => new Set([...s, ...sent]));
  }, [islemlerQ.data, islemlerQ.error]);

  const gidenQ = useQuery({
    queryKey: ["giden-evrak", user?.id],
    queryFn: () => apiGet("/giden-evrak?limit=100"),
    enabled: !!user,
  });
  useEffect(() => {
    if (gidenQ.error) { console.warn("Kalıcı giden evrak alınamadı", gidenQ.error); return; }
    if (!gidenQ.data || !user) return;
    const rows = Array.isArray(gidenQ.data.kayitlar) ? gidenQ.data.kayitlar : [];
    setOutbox(rows.map((r) => ({
      id: r.giden_no || r.id,
      kaynak_evrak_adi: r.kaynak_evrak_adi || "Kalıcı kayıt",
      gonderim_tarihi: Date.parse(r.gonderim_tarihi || "") || Date.now(),
      evrak_turu: r.evrak_turu || "",
      tur: r.yazi_turu_kod || r.tur || "",
      konu: r.konu || "—",
      alici_birim: r.alici_birim || "",
      risk: r.risk || "yesil",
      durum: r.durum || "gonderildi",
      taslak: r.taslak || "",
      memor_adi: user.ad_soyad || "Memur",
      memor_unvan: user.unvan || "",
      son_hash: r.son_hash || "",
    })));
  }, [gidenQ.data, gidenQ.error, user]);

  // history/outbox her değiştiğinde (DB reconcile VEYA canlı işlem sonucu eklenince) optimistik
  // önbelleği tazele → bir sonraki refresh son veriyi ANINDA gösterir. Yazma seyrek (kesikli
  // olaylar), stream sırasında tetiklenmez.
  useEffect(() => {
    if (user?.id) cachedDashboard.set(user.id, {
      history, outbox,
      // Kuyruk set'leri de saklanır: /islemler limit penceresinden düşmüş eski kararlar
      // (aynı tarayıcıda) kaybolmaz — türetim + saklama birlikte kullanılır.
      processedSamples: [...processedIds], sentSamples: [...sentSampleIds],
    });
  }, [history, outbox, processedIds, sentSampleIds, user]);

  // Sonuç kesinleşince oturum geçmişine ekle (Panel/Taslaklar/Denetim/Mevzuat bundan beslenir).
  // HITL kararı damgalanmışsa (resume sonrası) Giden Evrak kaydını burada kur (resume async).
  useEffect(() => {
    if (result && result !== lastResultRef.current) {
      const onceki = lastResultRef.current;
      // AYNI koşumun zenginleşmesi (SSE `persist` islem_id'si, yazı türü değişimi, dayanak
      // eklemesi) — ayniKosumMu iç nesne referans eşitliğine bakar, islem_id ŞART DEĞİL:
      // persist gecikirken (~20-27 sn) tür değiştiren memur her seçimde İşlenen evrak'a
      // YENİ satır açıyordu (kullanıcı bulgusu). Bu yeni koşum DEĞİL: geçmişe ikinci kayıt
      // açma; mevcut kaydı tazele + denenen türü satırın varyant listesine işle.
      if (ayniKosumMu(onceki, result)) {
        lastResultRef.current = result;
        setHistory((h) => h.map((x) => (x.result === onceki
          ? { ...x, result, varyantlar: varyantBirlestir(x, result) } : x)));
        // Taslaklar da tazelenir — persist'ten ÖNCE "Düzenle" ile ayrılan taslak eskiden
        // islem_id'siz kalıyordu (deleteDraft sessiz no-op → refresh'te dirilme; verify bulgusu).
        setDrafts((d) => d.map((x) => (x.result === onceki ? { ...x, result } : x)));
        // Dedup ref'leri yeni referansı da tanısın (çift gönderim/çift taslak koruması sürsün).
        if (draftedRef.current.has(onceki)) draftedRef.current.add(result);
        if (sentRef.current.has(onceki)) sentRef.current.add(result);
        // Persist penceresinde verilmiş bekleyen karar varsa ŞİMDİ DB'ye yaz.
        const bekleyenSecim = bekleyenKararRef.current.get(onceki);
        if (bekleyenSecim) {
          bekleyenKararRef.current.delete(onceki);
          persistDecision(result, bekleyenSecim);
        }
        // Aynı pencere: çok-konulu alt-talep kararları (birim kartları) de şimdi yazılır.
        const bekleyenAlt = bekleyenAltKararRef.current.get(onceki);
        if (bekleyenAlt && bekleyenAlt.length) {
          bekleyenAltKararRef.current.delete(onceki);
          bekleyenAlt.forEach((karar) => persistAltKarar(result, karar));
        }
        return;
      }
      lastResultRef.current = result;
      const pa = pendingApprovalRef.current;
      // HITL resume ile gelen sonuç: karar zaten verilmiş → geçmişe damgalı yaz ("Karar
      // bekleyen" sayacı bu alandan okur; duzenle nihai karar değildir, damgalanmaz).
      const karar = pa ? KARAR_ETIKET[pa.secim] || "" : "";
      const name = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
      setHistory((h) => [{
        id: `${Date.now()}-${h.length}-${name}`, name, kind: fileMeta?.kind, ts: Date.now(),
        evrak_turu: result.evrak_turu, hedef_birim: result.hedef_birim,
        bant: result.risk_metadata?.bant,
        result: karar ? { ...result, onay_durumu: result.onay_durumu || karar } : result,
      }, ...h]);
      if (pa) {
        pendingApprovalRef.current = null;
        if (pa.secim === "duzenle") {
          const taslakId = pushDraft(result, fileMeta);
          if (taslakId) setTaslakHedef(taslakId);
          showToast("Taslak düzenlemeye alındı — Taslaklar'a eklendi.");
          goView("taslaklar");
        } else {
          pushOutbox(result, fileMeta, pa.secim);
          persistDecision(result, pa.secim);
          showToast(pa.secim === "reddet" ? "Reddedildi — Giden evraka kaydedildi." : "Evrak gönderildi — Giden evraka eklendi.");
        }
      }
    }
  }, [result, fileMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  // useCallback: NeonSidebar (React.memo) için kararlı referans → akış sırasında (busy/counts
  // sabitken nodes saniyede onlarca kez değişir) sidebar gereksiz yere yeniden render olmaz.
  // Hash ataması geçmişe KAYIT ekler → geri/ileri tuşu görünümler arasında gezinir.
  const goView = useCallback((v) => {
    gecisle(() => setActiveView(v));
    if (hashView() !== v) window.location.hash = v;
  }, []);

  // Geri/ileri tuşu (popstate→hashchange): hash'teki görünüme dön. Görünüm-dışı hash'ler
  // (ör. skip-link "#nu-main") yok sayılır; boş hash = geçmişin ilk kaydı → panel.
  // Görünüm zaten aktifse hash olayını atla → goView'un tetiklediği hashchange ikinci bir
  // view-transition başlatmasın (çift geçiş görünmezdi ama gereksiz kare yakalamaydı).
  const activeViewRef = useRef(activeView);
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);
  useEffect(() => {
    if (!VIEWS.has(hashView())) window.history.replaceState(null, "", "#panel");
    const onHash = () => {
      const h = hashView();
      const hedefView = VIEWS.has(h) ? h : (!h ? "panel" : null);
      if (hedefView && hedefView !== activeViewRef.current) gecisle(() => setActiveView(hedefView));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Mevzuata tıklanınca Mevzuat sayfasına GİTMEZ — bulunduğun ekranın üstünde okuma modalı açar.
  const mevzuatAc = useCallback((hedef) => setOkumaHedef(hedef), []);
  // Kararlı referans (GidenEvrakView.DetayModal ile aynı desen) — inline arrow her render'da
  // yeni referans olurdu; OkumaModal'ın [onClose] efekti bu yüzden canlı akış sırasında
  // (SSE node event'leri DashboardApp'i sık render ettirir) defalarca tetiklenip odağı
  // sürekli kapat düğmesine geri çekiyordu (regresyon bulgusu — modal klavye/SR ile kullanılamaz).
  const okumaKapat = useCallback(() => setOkumaHedef(null), []);
  // Panel'den evrak-hedefli geçiş: id string ise vurgu hedefi kur (buton onClick'in event
  // nesnesi geçirmesine karşı tip koruması), her durumda Gelen Evrak'a git.
  const goInbox = useCallback((hedefId) => {
    if (typeof hedefId === "string") setGelenHedef(hedefId);
    goView("gelen");
  }, [goView]);

  // İşlenen evrak listesinden "Taslaklar'da düzenle": eşleşen kuyruk taslağı varsa hedefle;
  // yoksa (canlı oturum kaydı — kuyruk yalnız açık "Düzenle" kararı ya da DB hidrasyonuyla
  // dolar) taslağı ŞİMDİ kuyruğa ekle. Eskiden düz geçiliyordu ve Taslaklar BOŞ açılıyordu
  // (kullanıcı bulgusu). DB tarafında taslak zaten islem kaydında — refresh aynı kuyruğu türetir.
  // Plain fonksiyon (useCallback değil): pushDraft her render tazelenir, bayat closure riski olmasın.
  const goIslenenDuzenle = (h) => {
    const d = drafts.find((x) => x.result === h.result
      || (h.result?.islem_id && x.result?.islem_id === h.result.islem_id));
    const id = d ? d.id : pushDraft(h.result, { kind: h.kind, name: h.name, label: h.name });
    if (id) {
      setTaslakHedef(id);
      if (!d) showToast("Taslak düzenleme kuyruğuna alındı.");
    }
    goView("taslaklar");
  };

  // Oturum geçmişinde HITL kararını damgala (Panel "Karar bekleyen" düşsün; DB zaten
  // persistDecision ile yazıldı — refresh'te islem_listele aynı alanı döndürür).
  const stampDecision = useCallback((res, secim) => {
    const karar = KARAR_ETIKET[secim];
    if (!karar || !res) return;
    setHistory((h) => h.map((x) => (
      x.result === res || (res.islem_id && x.result?.islem_id === res.islem_id)
        ? { ...x, result: { ...x.result, onay_durumu: karar } } : x)));
  }, []);

  // İşlenmemiş kuyruk için SLA rozetleri — statik örnek seti için BİR kez hesaplanır
  // (react-query: geçici ağ hatasında kendini toparlar). Backend yoksa sessizce atlanır
  // (rozetler görünmez, kuyruk aynen çalışır).
  const slaQ = useQuery({
    queryKey: ["sla-onizleme"],
    queryFn: async () => {
      const r = await fetch("/sla/onizleme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ogeler: SAMPLE_DOCS.map((s) => ({ id: s.id, tur: s.tur || s.id, metin: s.text })) }),
      });
      if (!r.ok) throw new Error(`İstek başarısız (${r.status})`);
      return r.json();
    },
  });
  useEffect(() => {
    if (!slaQ.data) return;
    setSlaMap(Object.fromEntries((slaQ.data.sonuclar || []).map((x) => [x.id, x.sla_metadata])));
  }, [slaQ.data]);

  // Panel "süresi yaklaşan" kartı: kuyruktaki (henüz gönderilmemiş) örneklerin SLA'sı.
  const kuyrukSla = slaMap
    ? SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))
        .map((s) => ({ id: s.id, label: s.konu || s.label, sla: slaMap[s.id] }))
        .filter((x) => x.sla)
    : [];

  // Taslak düzenle (metni güncelle) / sil — Taslaklar görünümünden çağrılır.
  // Güncelleme KALICIDIR: oturum state'i anında (optimistik), DB PATCH arkada — eskiden
  // "Kaydet ve kapat" yalnız state'e yazıyordu, refresh'te memurun düzenlemesi kayboluyordu
  // (denetim bulgusu). islem_id çözümü deleteDraft ile aynı; çok-konuluda _altSira iletilir.
  const updateDraft = useCallback((id, md) => {
    const draft = drafts.find((x) => x.id === id);
    setDrafts((d) => d.map((x) => (x.id === id ? { ...x, result: { ...x.result, yazi_taslak_md: md } } : x)));
    const islemId = islemIdCoz(id, draft);
    if (!islemId) return;
    apiPatch(`/islem/${encodeURIComponent(islemId)}/taslak`, {
      metin: md, yazi_turu: draft?.result?.yazi_turu || "",
      ...(draft?.result?._altSira ? { sira: draft.result._altSira } : {}),
    }).then(() => {
      // history reconcile'ı eski metni geri getirmesin: ilgili kaydı da tazele.
      setHistory((h) => h.map((x) =>
        (x.id === islemId || x.result?.islem_id === islemId
          ? { ...x, result: { ...x.result, yazi_taslak_md: md } } : x)));
    }).catch((err) => {
      console.warn("Taslak DB'ye kaydedilemedi", err);
      showToast("Değişiklik oturumda kaldı — DB'ye kaydedilemedi, göndermeden önce tekrar deneyin.");
    });
  }, [drafts, showToast]);
  // Taslak silme KALICIDIR: islem_id'si bilinen HER taslak (DB'den hidre edilen
  // db-taslak-<islem_id> VEYA oturumda "Düzenle" ile ayrılan — persist event'i islem_id
  // taşır) backend'de de silinir — sayfa yenilenince geri gelmez. Eskiden yalnız db-taslak-
  // öneki siliniyordu; oturumluk taslağın DB kaydı duruyor, refresh'te geri diriliyordu.
  const deleteDraft = useCallback(async (id) => {
    const draft = drafts.find((x) => x.id === id);
    const islemId = islemIdCoz(id, draft);
    // Çok-konulu birim taslağı (_altSira): backend'de YALNIZ o birimin taslağı silinir —
    // sira'sız çağrı işlemin tüm taslaklarını imha ederdi (kardeş kartlar sessizce giderdi).
    const altSira = draft?.result?._altSira || null;
    setDrafts((d) => d.filter((x) => x.id !== id));   // optimistik kaldır
    if (!islemId) return;
    try {
      await apiDelete(`/islem/${encodeURIComponent(islemId)}/taslak${altSira ? `?sira=${altSira}` : ""}`);
      // history reconcile'ında geri dirilmesin: ilgili kaydın taslağını da düşür (yalnız
      // TAM silmede — birim taslağı silmede işlemin temsilci metni durur, refresh netleştirir).
      // İki id biçimi de kapsanır: DB kaydı (x.id = islem uuid) + oturum kaydı (result.islem_id).
      if (!altSira) {
        setHistory((h) => h.map((x) =>
          (x.id === islemId || x.result?.islem_id === islemId
            ? { ...x, result: { ...x.result, yazi_taslak_md: "" } } : x)));
      }
    } catch (err) {
      console.warn("Taslak DB'den silinemedi", err);
      showToast("Taslak kalıcı silinemedi — sayfa yenilenince geri gelebilir.");
    }
  }, [drafts, showToast]);
  // Yeni koşum, persist'i bekleyen eski akışı ABORT eder — bu pencerede verilen karar
  // (bekleyenKararRef) artık hiç yazılamaz. Sessiz veri kaybı yerine memura açıkça söyle
  // (bug avı bulgusu: onay toast'ı "gönderildi" demişti ama DB'ye hiç yazılmamıştı).
  const bekleyenKararUyar = useCallback(() => {
    // Hem tek-karar (bekleyenKararRef) hem çok-konulu alt-talep (bekleyenAltKararRef)
    // kuyruklarını kontrol et — yeni koşum eski akışı abort ettiğinde ikisi de bir daha
    // flush edilemez; alt-talep kuyruğu atlanırsa birim kararı sessizce kaybolurdu.
    if (!bekleyenKararRef.current.size && !bekleyenAltKararRef.current.size) return;
    bekleyenKararRef.current.clear();
    bekleyenAltKararRef.current.clear();
    showToast("Önceki evrakın kararı kalıcı kayda yazılamadan yeni işlem başladı — kararı İşlenen evrak'tan yineleyin.");
  }, [showToast]);
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { bekleyenKararUyar(); runFile(f, aktifKurum); } };
  const triggerUpload = useCallback(() => { goView("isleniyor"); if (!busy) fileRef.current?.click(); }, [busy, goView]);
  // "İşlendi" damgası YALNIZ koşum gerçekten başlarsa basılır — busy'de damga + kalıcı
  // processedSamples yazımı, evrak hiç işlenmeden refresh'ler boyu "İşlendi" gösteriyordu
  // (bug avı bulgusu). Navigasyon korunur: memur süren akışı görür.
  const processSample = useCallback((s) => {
    goView("isleniyor");
    if (busy) return;
    bekleyenKararUyar();
    setProcessedIds((p) => new Set(p).add(s.id));
    runSample(s, aktifKurum);
  }, [busy, runSample, goView, bekleyenKararUyar, aktifKurum]);

  // HITL açık → kararı damgala + resume (outbox kaydı result-effect'te). HITL kapalı → mevcut
  // sonuçtan senkron Giden Evrak kaydı (onayla/reddet; düzenle yalnız bilgilendirir).
  // HITL kararı: ref'i damgala + resume. resume BAŞARISIZ olursa (backend 500/kopuk bağlantı)
  // ref'i HEMEN temizle — yoksa bayat karar bir sonraki ilgisiz koşumun result-effect'ine
  // sızıp o (onaylanmamış) evrakı sahte "onaylandı" ile Giden Evrak'a gönderir (workflow bulgusu).
  const onApprove = async () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "onayla", fileMeta }; if (!(await resume("onayla"))) pendingApprovalRef.current = null; }
    else if (pushOutbox(result, fileMeta, "onayla")) { persistDecision(result, "onayla"); stampDecision(result, "onayla"); showToast("Evrak onaylandı — Giden Evrak'a gönderildi."); goView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onReject = async () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "reddet", fileMeta }; if (!(await resume("reddet"))) pendingApprovalRef.current = null; }
    else if (pushOutbox(result, fileMeta, "reddet")) { persistDecision(result, "reddet"); stampDecision(result, "reddet"); showToast("Reddedildi — Giden evraka kaydedildi (denetim izi)."); goView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onEdit = async () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "duzenle", fileMeta }; if (!(await resume("duzenle"))) pendingApprovalRef.current = null; return; }
    const taslakId = pushDraft(result, fileMeta);
    if (taslakId) { setTaslakHedef(taslakId); showToast("Taslak düzenlemeye alındı — Taslaklar'a eklendi."); goView("taslaklar"); }
    else showToast("Önce taslak üreten bir evrak işleyin.");
  };
  // Taslaklar kuyruğundaki bir taslağı SON METNİYLE Giden Evrak'a yolla (durum "duzenlendi" →
  // GidenEvrakView'da "Düzenlenerek gönderildi"). karar_repo._KARAR bunu backend'de zaten
  // destekliyordu, yalnız frontend'den hiç tetiklenmiyordu (Taslaklar'da tek eylemler
  // Kaydet/İndir/Sil'di — düzenlemenin gönderilecek bir sonu yoktu).
  // NOT: KARAR_ETIKET/stampDecision'daki "duzenle" BAŞKA bir anlam taşır (onay kartında
  // "Düzenle" = henüz karar verilmedi, damgalanmaz) — o yüzden history damgası burada
  // KARAR_ETIKET'e dokunmadan doğrudan yazılır, iki anlam birbirine karışmasın.
  // /yazi/dogrula ortak çağrısı — hem sendDraft (talimatsız, yalnız doğrulama) hem de
  // BelgeModal'daki "AI ile revize et" akışı (talimatlı) AYNI uç noktayı, aynı kaynak
  // bağlamıyla (evrak_text/yazi_turu/bilgi_unsurlari) çağırır. kaynak = draft.result.
  const dogrulaTaslak = useCallback((kaynak, taslakMd, talimat = "") => apiPost("/yazi/dogrula", {
    taslak_md: taslakMd,
    evrak_text: kaynak?.kanit_metadata?.metin || "",  // maskeli kaynak metin (KVKK)
    yazi_turu: kaynak?.yazi_turu || "",
    evrak_turu: kaynak?.evrak_turu || "",
    hedef_birim: kaynak?.hedef_birim || "",
    bilgi_unsurlari: kaynak?.bilgi_unsurlari || {},
    // NOT: dayanak bloğu taslak metnindedir; grounding onu sunucuda gövde-dışı tutar
    // (verify.dayanak_blogunu_cikar) → istemci ayrıca "seçili mevzuat" GÖNDERMEZ (güvenli).
    talimat,
  }), []);

  // Elle düzenlenmiş taslak Giden Evrak'a yazılmadan ÖNCE /yazi/dogrula'dan geçirilir —
  // önceden metinGuncel doğrudan pushOutbox'a gidiyordu, uydurma-veto/2646-lint/risk-bandı
  // kapılarını hiç görmüyordu (memur elle "09.09.2099" gibi kaynakta olmayan bir tarih
  // yazsa bile fark edilmeden gönderiliyordu). Doğrulama başarısız olursa GÖNDERİLMEZ —
  // sessizce eski (doğrulanmamış) davranışa düşülmez.
  // Dönüş değeri (bool): çağıran (BelgeModal/DraftCard) modalı/kartı ANCAK başarıda
  // kapatır/serbest bırakır — doğrulama veya gönderim başarısız olursa taslak açık kalır,
  // memur toast'ı görüp tekrar dener (fire-and-forget geçmişte modalı sessizce kapatıyordu).
  const sendDraft = async (draft, metinGuncel) => {
    const kaynak = draft.result || {};
    let dogrulanan;
    try {
      dogrulanan = await dogrulaTaslak(kaynak, metinGuncel);
    } catch (err) {
      console.warn("Taslak doğrulanamadı", err);
      showToast("Taslak doğrulanamadı — bağlantıyı kontrol edip tekrar deneyin.");
      return false;
    }
    const res = {
      ...kaynak,
      yazi_taslak_md: dogrulanan.taslak_md,
      verify_uyari: dogrulanan.verify_uyari,
      verify_notes: dogrulanan.verify_notes,
      tutarlilik_uyari: dogrulanan.tutarlilik_uyari,
      format_uyumlu: dogrulanan.format_uyumlu,
      lint_2646: dogrulanan.lint_2646,
      risk_metadata: dogrulanan.risk_metadata || kaynak.risk_metadata,
    };
    const fm = { kind: draft.kind, name: draft.name, label: draft.name };
    if (!pushOutbox(res, fm, "duzenle")) { showToast("Gönderilemedi — taslak zaten gönderilmiş olabilir."); return false; }
    setDrafts((d) => d.filter((x) => x.id !== draft.id));
    if (res._altSira) {
      // Alt-talep kökenli: birimin KENDİ onayla uç noktasına gider — ana işlemin karar
      // damgası (aşağıdaki dal) burada DEĞİŞMEZ, o birimin kararı diğerlerini etkilemez.
      apiPost(`/islem/${encodeURIComponent(res.islem_id)}/alt-talep/${res._altSira}/onayla`, {
        secim: "duzenle", yazi_turu: res.yazi_turu || "", metin: res.yazi_taslak_md || "",
      }).then(() => queryClient.invalidateQueries({ queryKey: ["giden-evrak"] }))
        .catch((err) => {
          console.warn("Birim kararı DB'ye yazılamadı", err);
          showToast("Evrak oturumda görünüyor; birim kararı DB'ye yazılamadı.");
        });
    } else {
      const islemId = res.islem_id || (String(draft.id).startsWith("db-taslak-") ? String(draft.id).slice("db-taslak-".length) : null);
      if (islemId) {
        persistDecision({ ...res, islem_id: islemId }, "duzenle");
        setHistory((h) => h.map((x) => (
          x.result === res || x.result?.islem_id === islemId ? { ...x, result: { ...x.result, onay_durumu: "duzenlendi" } } : x)));
      } else {
        // islem_id çözülemedi (persist penceresinde düzenlenmiş oturum taslağı: updateDraft
        // result nesnesini fork'layıp kimlik bağını kırdığından persist merge islem_id'yi hiç
        // enjekte edemiyor). Karar DB'ye YAZILAMAZ → sessiz kayıp + sahte "gönderildi" yerine
        // memuru DÜRÜSTÇE uyar (kök redesign follow-up). Taslak yine oturumda/outbox'ta durur.
        showToast("Taslak oturumda gönderildi ancak kalıcı kayda yazılamadı — kararı İşlenen evrak'tan yineleyin.");
        return true;
      }
    }
    const yeniUyari = (dogrulanan.verify_uyari || []).length;
    showToast(yeniUyari
      ? `Taslak gönderildi — doğrulama ${yeniUyari} uyarı buldu, Giden Evrak'ta inceleyin.`
      : "Taslak düzenlenerek gönderildi — Giden evraka eklendi.");
    // Giden'e navigasyon YOK (2026-07-17 triyaj tasarımı): kullanıcı kuyrukta kalır,
    // seçim otomatik sıradakine geçer — 61 kararlık oturumda her gönderimde Giden'e
    // ışınlanıp geri dönmek momentum kırıyordu. Toast zaten Giden'i işaret eder.
    return true;
  };
  const onResend = () => showToast("Tekrar gönderme üretim entegrasyonunda etkinleşir.");

  // ---- Yazı türü seçimi (şartname: üst yazı / cevabi / bilgilendirme / alternatif tür) ----
  // Pipeline'ın önerdiği tür + tür başına üretilen taslaklar koşum-içi önbelleğe alınır
  // (chip'ler arası anında geçiş; aynı tür için LLM'e ikinci kez gidilmez). Yeni koşum
  // sinyali = denetim_izi referansının değişmesi (applyTaslak/persist merge'i onu korur).
  const taslakCacheRef = useRef({});
  const taslakOnerilenRef = useRef("");
  const taslakDenetimRef = useRef(null);
  const altDraftRef = useRef({});   // birim kartı "Düzenle" → sira başına TEK sanal sonuç (dedup)
  const [turUretiliyor, setTurUretiliyor] = useState("");
  // Dayanak kutucuk kurgusu: seçili mevzuat (state + ref eşzamanlı — updater'da yan etki yok),
  // "yeniden yazılıyor" bayrağı ve yarış-guard sırası. taslakCacheRef her tür için DAYANAKSIZ
  // base'i tutar → boş seçim base'e bire bir döner (undo). seq: hızlı toggle'da yalnız en son yanıt uygulanır.
  const [seciliMevzuat, setSeciliMevzuat] = useState([]);
  const seciliMevzuatRef = useRef([]);
  const [dayanakUretiliyor, setDayanakUretiliyor] = useState(false);
  const dayanakSekansRef = useRef(createSekans());
  useEffect(() => {
    const iz = result?.denetim_izi || null;
    if (!result || iz === taslakDenetimRef.current) return;
    taslakDenetimRef.current = iz;
    taslakOnerilenRef.current = result.yazi_turu || "";
    taslakCacheRef.current = result.yazi_taslak_md
      ? { [result.yazi_turu]: { yazi_taslak_md: result.yazi_taslak_md, format_uyumlu: result.format_uyumlu } }
      : {};
    altDraftRef.current = {};
    setTurUretiliyor("");
    // Yeni koşum → dayanak seçimi sıfırlanır (eski evrakın maddeleri yeni taslağa taşınmasın).
    seciliMevzuatRef.current = [];
    setSeciliMevzuat([]);
    setDayanakUretiliyor(false);
  }, [result]);

  // Seçili mevzuatı taslağa DETERMİNİSTİK dayanak olarak işle (/yazi/dayanak; LLM yok, anlık).
  // Base (dayanaksız) taslak taslakCacheRef'te tür bazında tutulur → boş seçim base'e bire bir döner.
  const uygulaDayanak = useCallback(async (secili, turOverride = null) => {
    if (!result) return;
    const tur = turOverride || result.yazi_turu;
    const onbellek = taslakCacheRef.current[tur];
    const base = onbellek?.yazi_taslak_md;
    if (!base) return;
    // Yarış guard'ı: HER çağrı (undo/boş seçim DÂHİL) sıra alır → uçuştaki eski /yazi/dayanak
    // yanıtı, arada seçim boşaltılsa/değişse bile geçersiz olur (stale yanıt kaldırılan atfı
    // geri getirmesin — bkz. dayanakSecim.test.js "YARIŞ REGRESYONU"). token'ı boş dalından ÖNCE al.
    const token = dayanakSekansRef.current.al();
    if (!secili.length) {
      // "çıkarırsa geri alsın": base'e bire bir dön (fetch yok, anlık undo). token undo'yu da
      // en-son yaptığından uçuştaki eski fetch stale olur; solma bayrağını BURADA temizle —
      // stale fetch'in finally'si (artık güncel değil) temizlemez, aksi halde taslak kalıcı solar.
      setDayanakUretiliyor(false);
      applyTaslak({ yazi_turu: tur, yazi_taslak_md: base,
        format_uyumlu: onbellek?.format_uyumlu ?? result.format_uyumlu });
      return;
    }
    const izAtStart = taslakDenetimRef.current;
    setDayanakUretiliyor(true);
    try {
      const res = await fetch("/yazi/dayanak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taslak_md: base, secili_mevzuat: secili, yazi_turu: tur }),
      });
      if (!res.ok) throw new Error(`Dayanak işlenemedi (${res.status})`);
      const data = await res.json();
      if (!data?.yazi_taslak_md) throw new Error("Dayanak işlenemedi — boş yanıt");
      // Yalnız EN SON istek + hâlâ aynı koşum uygulanır (hızlı toggle/undo yarışı + evrak değişimi guard'ı).
      if (!dayanakSekansRef.current.guncelMi(token) || taslakDenetimRef.current !== izAtStart) return;
      applyTaslak({ yazi_turu: tur, yazi_taslak_md: data.yazi_taslak_md,
        format_uyumlu: data.format_uyumlu });
    } catch (err) {
      showToast(err?.message || "Dayanak işlenemedi — backend çalışıyor mu?");
    } finally {
      if (dayanakSekansRef.current.guncelMi(token)) setDayanakUretiliyor(false);
    }
  }, [result, applyTaslak, showToast]);

  // Kutucuk toggle: seçime ekle/çıkar (ref + state eşzamanlı; updater'da yan etki yok) → taslağı yeniden kur.
  const secMevzuat = useCallback((m, checked) => {
    const prev = seciliMevzuatRef.current;
    const next = sonrakiSecim(prev, m, checked);
    if (next === prev) return;   // no-op (aynı referans) → gereksiz istek yok
    seciliMevzuatRef.current = next;
    setSeciliMevzuat(next);
    uygulaDayanak(next);
  }, [uygulaDayanak]);

  const secTaslakTuru = useCallback(async (tur) => {
    if (!result || tur === result.yazi_turu || turUretiliyor) return;
    const onbellek = taslakCacheRef.current;
    if (onbellek[tur]) {
      applyTaslak({ yazi_turu: tur, ...onbellek[tur] });
      // Tür değişince mevcut dayanak seçimini yeni türün base'ine yeniden uygula (seçim korunur).
      if (seciliMevzuatRef.current.length) uygulaDayanak(seciliMevzuatRef.current, tur);
      return;
    }
    // Dosya yolunda ham metin sunucuda tutulmaz → maskeli kanıt metni yeterli girdi.
    const metin = evrakText || result.kanit_metadata?.metin || "";
    if (!metin) { showToast("Tür değiştirmek için evrak metni gerekli — evrakı yeniden işleyin."); return; }
    // Bu fetch dönene kadar kullanıcı YENİ bir evrak yükleyebilir (yükleme butonu
    // kilitlenmiyor) — hangi koşuma ait olduğunu işaretle, dönüşte hâlâ aynı koşumda
    // mıyız kontrol et; değilse eski sonucu yeni evrakın üstüne YAZMA.
    const izAtStart = taslakDenetimRef.current;
    setTurUretiliyor(tur);
    try {
      const res = await fetch("/yazi/taslak-turu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evrak_text: metin, yazi_turu: tur,
          bilgi_unsurlari: result.bilgi_unsurlari || {}, hedef_birim: result.hedef_birim || "",
        }),
      });
      if (!res.ok) throw new Error(`Taslak üretilemedi (${res.status})`);
      const data = await res.json();
      if (!data?.yazi_taslak_md) throw new Error("Taslak üretilemedi — boş yanıt");
      if (taslakDenetimRef.current !== izAtStart) return;   // bu arada yeni evrak yüklendi
      onbellek[tur] = { yazi_taslak_md: data.yazi_taslak_md, format_uyumlu: data.format_uyumlu };
      applyTaslak(data);
      // Tür değişince mevcut dayanak seçimini yeni türün base'ine yeniden uygula (seçim korunur).
      if (seciliMevzuatRef.current.length) uygulaDayanak(seciliMevzuatRef.current, tur);
    } catch (err) {
      showToast(err?.message || "Taslak üretilemedi — backend çalışıyor mu?");
    } finally {
      if (taslakDenetimRef.current === izAtStart) setTurUretiliyor("");
    }
  }, [result, evrakText, turUretiliyor, applyTaslak, showToast, uygulaDayanak]);

  // Çok-konulu evrakta HER birim kartının kendi Onayla&Gönder/Reddet kararı — ana sonuçtan
  // o birime özgü alanlarla (hedef/tür/metin) türetilmiş TEK KULLANIMLIK bir "sanal sonuç"
  // Giden Evrak'a yazılır. `sira` (1-tabanlı, alt_talepler listesindeki konum) backend'in
  // /islem/{id}/alt-talep/{sira}/onayla'sına gider — o birimin KENDİ taslak/onay/giden_evrak
  // zincirini bağımsız günceller (bkz. karar_repo.onayla_ve_gonder_alt_talep). `tur` kartta
  // kutucuklardan seçilen yazı türüdür (kart taslağı o türe göre yeniden üretilmiş olabilir).
  const onAltKarar = (altTalep, metinGuncel, secim, sira, tur) => {
    const sanalSonuc = {
      ...result,
      hedef_birim: altTalep.birim_tr || altTalep.birim || result?.hedef_birim,
      yazi_turu: tur || altTalep.yazi_turu || "ust_yazi",
      yazi_taslak_md: metinGuncel,
      format_uyumlu: altTalep.format_uyumlu,
      bilgi_unsurlari: { ...(result?.bilgi_unsurlari || {}), konu: altTalep.ozet },
    };
    if (!pushOutbox(sanalSonuc, fileMeta, secim)) return false;
    // "duzenle" gönderim değildir → persist edilmez; onay/red islem_id yoksa kuyruğa alınır.
    if (secim !== "duzenle") {
      persistAltKarar(result, { secim, sira, tur: sanalSonuc.yazi_turu, metin: metinGuncel });
    }
    const etiket = altTalep.birim_tr || "İlgili birim";
    showToast(secim === "reddet" ? `${etiket} — reddedildi, Giden evraka kaydedildi.` : `${etiket} — gönderildi, Giden evraka eklendi.`);
    return true;
  };

  // Birim kartında tür kutucuğu seçildi → o birimin taslağını SEÇİLEN türle yeniden üret.
  // Girdi = alt-talebin kendi özeti (segment); muhatap birimi backend belirler (Yön. m.14).
  // Dönüş: taslak verisi ya da null (hata toast'la bildirilir; kart eski taslağında kalır).
  const uretAltTaslakTuru = useCallback(async (altTalep, tur) => {
    const metin = altTalep.ozet || evrakText || result?.kanit_metadata?.metin || "";
    if (!metin) { showToast("Tür değiştirmek için talep metni gerekli — evrakı yeniden işleyin."); return null; }
    try {
      const res = await fetch("/yazi/taslak-turu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evrak_text: metin, yazi_turu: tur,
          bilgi_unsurlari: { ...(result?.bilgi_unsurlari || {}), konu: altTalep.ozet || "" },
          hedef_birim: altTalep.birim || "",
        }),
      });
      if (!res.ok) throw new Error(`Taslak üretilemedi (${res.status})`);
      const data = await res.json();
      if (!data?.yazi_taslak_md) throw new Error("Taslak üretilemedi — boş yanıt");
      return data;
    } catch (err) {
      showToast(err?.message || "Taslak üretilemedi — backend çalışıyor mu?");
      return null;
    }
  }, [result, evrakText, showToast]);

  // Birim kartı "Düzenle" → ana karttaki onEdit ile aynı davranış: taslağı Taslaklar
  // kuyruğuna ekle ve oraya git (yerinde düzenleme yok — düzenleme tek yerde yapılır).
  // sira başına TEK sanal sonuç (altDraftRef) → ikinci basış mevcut taslağa götürür.
  const onAltDuzenle = (altTalep, metin, tur, sira) => {
    const ref = altDraftRef.current;
    if (!ref[sira]) {
      ref[sira] = {
        ...result,
        hedef_birim: altTalep.birim_tr || altTalep.birim || result?.hedef_birim,
        yazi_turu: tur || altTalep.yazi_turu || "ust_yazi",
        yazi_taslak_md: metin,
        format_uyumlu: altTalep.format_uyumlu,
        bilgi_unsurlari: { ...(result?.bilgi_unsurlari || {}), konu: altTalep.ozet },
        // Taslaklar'dan gönderilirken HANGİ birimin alt-talebi olduğunu bilelim (bkz. sendDraft) —
        // aksi hâlde ana işlemin taslağıymış gibi yanlış uç noktaya/duruma gönderilir.
        _altSira: sira,
      };
    }
    const taslakId = pushDraft(ref[sira], fileMeta);
    if (taslakId) {
      setTaslakHedef(taslakId);
      showToast(`${altTalep.birim_tr || "İlgili birim"} taslağı düzenlemeye alındı — Taslaklar'a eklendi.`);
      goView("taslaklar");
    }
  };

  let view;
  if (activeView === "panel") view = <PanelView history={history} outbox={outbox} inboxCount={inboxCount} kuyrukSla={kuyrukSla} onGoInbox={goInbox} onIsle={(id) => { const sec = SAMPLE_DOCS.find((x) => x.id === id); if (sec) processSample(sec); }} onGoIslenen={() => goView("islenen")} onGoGiden={() => goView("giden")} onGoTaslaklar={() => goView("taslaklar")} onUpload={triggerUpload} user={user} />;
  else if (activeView === "islenen") view = <IslenenEvrakView history={history} onGoInbox={() => goView("gelen")} onUpload={triggerUpload} onDuzenle={goIslenenDuzenle} onMevzuatAc={mevzuatAc} />;
  else if (activeView === "gelen") view = <GelenEvrakView samples={SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))} processedIds={processedIds} slaMap={slaMap} onProcess={processSample} onUpload={triggerUpload} busy={busy} hedef={gelenHedef} onHedefAcildi={() => setGelenHedef(null)} uid={user?.id} />;
  else if (activeView === "giden") view = <GidenEvrakView outbox={outbox} onUpload={triggerUpload} onGoInbox={() => goView("gelen")} onResend={onResend} />;
  else if (activeView === "taslaklar") view = <TaslaklarView drafts={drafts} onGoInbox={() => goView("gelen")} onGoOutbox={() => goView("giden")} onUpdate={updateDraft} onDelete={deleteDraft} onSend={sendDraft} onRevize={dogrulaTaslak} onToast={showToast} hedef={taslakHedef} onHedefAcildi={() => setTaslakHedef(null)} />;
  else if (activeView === "mevzuat") view = <MevzuatView history={history} />;
  else if (activeView === "denetim") view = <DenetimView history={history} onGoInbox={() => goView("gelen")} />;
  else view = (
    <CanliAjanAkisi
      nodes={nodes} result={data} busy={busy} started={started} runBase={runBase}
      fileMeta={fileMeta} pendingOnay={pendingOnay}
      onApprove={onApprove} onEdit={onEdit} onReject={onReject} onAltKarar={onAltKarar}
      onAltTurUret={uretAltTaslakTuru} onAltDuzenle={onAltDuzenle}
      onTurSec={secTaslakTuru} turUretiliyor={turUretiliyor} onerilenTur={taslakOnerilenRef.current}
      onDownload={download} downloading={downloading} canDownload={!!evrakText || !!data?.yazi_taslak_md}
      onUpload={triggerUpload} onGoInbox={() => goView("gelen")} onCancel={cancelRun}
      fileUrl={fileUrl} onFileDrop={(f) => runFile(f, aktifKurum)} onTelefon={() => setTelefonAcik(true)}
      onMevzuatAc={mevzuatAc}
      onMevzuatSec={secMevzuat} seciliMevzuat={seciliMevzuat} dayanakUretiliyor={dayanakUretiliyor}
    />
  );

  return (
    <>
      <style>{NEON_KEYFRAMES}</style>

      <div style={{
        display: "flex", minHeight: "100vh", background: PAL.bg, color: PAL.ink, fontFamily: SANS,
      }}>
        <a href="#nu-main" style={{ position: "absolute", left: -9999, top: 0, zIndex: 100, background: DERIN.T, color: PAL.onAccent, padding: "8px 14px", borderRadius: `0 0 ${RAD.card}px 0`, ...TYPE.ui, fontWeight: 600 }} onFocus={(e) => (e.currentTarget.style.left = "0")} onBlur={(e) => (e.currentTarget.style.left = "-9999px")}>Ana içeriğe geç</a>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} tabIndex={-1} aria-hidden="true" />

        <NeonSidebar activeView={activeView} onNavigate={goView} onUpload={triggerUpload} samples={SAMPLE_DOCS} onPickSample={processSample} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} user={user} onLogout={logout} tema={tema} onTemaDegistir={onTemaDegistir} aktifKurum={aktifKurum} onAktifKurumDegistir={setAktifKurum} />

        <main id="nu-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Suspense fallback={<ViewFallback />}>{view}</Suspense>
        </main>

        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{toast}</div>
        {/* sonner: katmanlı/istiflenen bildirimler — eski tek-toast görünümüyle aynı dil (koyu yüzey). */}
        <Toaster position="bottom-center" duration={3200} gap={8} visibleToasts={3}
          toastOptions={{ style: { background: PAL.inkSurf, color: PAL.onInk, border: "none", borderRadius: RAD.pop, boxShadow: SH.modal, fontFamily: SANS, fontSize: 14, lineHeight: "20px", fontWeight: 500, padding: "12px 16px" } }} />
        {error && !busy && <ErrorBar msg={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />}

        {user && <Suspense fallback={null}><ChatbotWidget onNavigate={goView} onMevzuatAc={mevzuatAc} /></Suspense>}

        {/* Global mevzuat okuma modalı — hangi görünümde olursan ol üstte açılır (view değişmez). */}
        {okumaHedef && (
          <OkumaModal dosya={okumaHedef.dosya} maddeNo={okumaHedef.maddeNo}
            maddeTur={okumaHedef.maddeTur} onClose={okumaKapat} />
        )}

        {telefonAcik && (
          <Suspense fallback={null}>
            <TelefonYukleModal
              onClose={() => setTelefonAcik(false)}
              onFile={(f) => { setTelefonAcik(false); goView("isleniyor"); bekleyenKararUyar(); runFile(f, aktifKurum); }}
              showToast={showToast}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}

// Tembel görünüm chunk'ı inerken (yalnız ilk geçişte, çok kısa) gösterilen sade, tema-uyumlu
// yer tutucu — görünüm tasarımını değiştirmez, layout çökmesini önler.
function ViewFallback() {
  return (
    <div aria-hidden="true" style={{ flex: 1, display: "grid", placeItems: "center", minHeight: "60vh", ...TYPE.data, color: PAL.mut2 }}>
      yükleniyor…
    </div>
  );
}

function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  return (
    <div role="alert" style={{ position: "fixed", bottom: SP.xl, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop, boxShadow: SH.modal, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, background: ALFA(BANT.kirmizi.c), color: DERIN.kirmizi, padding: "12px 16px", ...TYPE.data }}>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s }}><Icon.alert /> {msg}</span>
        {canRetry && <button onClick={onRetry} {...focusRing} style={{ cursor: "pointer", padding: "4px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: DERIN.kirmizi, ...TYPE.data, fontWeight: 500 }}>Tekrar dene</button>}
        <button onClick={onDismiss} aria-label="Kapat" {...focusRing} style={{ cursor: "pointer", display: "flex", alignItems: "center", padding: "4px 8px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "transparent", color: DERIN.kirmizi }}><Icon.x /></button>
      </div>
    </div>
  );
}
