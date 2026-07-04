/* DashboardApp — kamu-evrak neon çalışma alanı kabuğu + oturum kurgusu.
   Sidebar (işlevsel nav) + görünüm anahtarlama (Panel/Gelen/İşleniyor/Taslaklar/Mevzuat/Denetim).
   usePipeline tek evrak işler; sonuçlar OTURUM GEÇMİŞİNE eklenir → Panel/Taslaklar/Denetim beslenir.
   Akış: Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç geçmişe → Panel'de özet.
   Eski açık-tema App.jsx korunur (geri dönüş: main.jsx). */
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { usePipeline, ACCEPT } from "./lib/usePipeline.js";
import { apiDelete, apiGet, apiPost, cachedDashboard } from "./lib/authApi.js";
import { useAuth } from "./lib/useAuth.jsx";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { PAL, DERIN, SANS, TYPE, RAD, SP, SH, ALFA, BANT, Icon, focusRing, SR_ONLY, NEON_KEYFRAMES } from "./components/neonUi.jsx";
import NeonSidebar from "./components/NeonSidebar.jsx";
// PanelView VARSAYILAN açılış görünümü → EAGER: her refresh'te lazy chunk beklemesi
// ("yükleniyor…" flash) yaşanmasın, panel anında görünsün. Bağımlılıkları (neonUi +
// result-cards) zaten usePipeline→nodeMeta zinciriyle ana bundle'da olduğundan ilk yük
// indirmesine pratikte ağırlık eklemez.
import PanelView from "./components/PanelView.jsx";
// Komut paleti (cmdk) eager: Ctrl+K'ye ilk basışta gecikmesiz açılmalı; paket küçük (~10KB gz).
import KomutPaleti from "./components/KomutPaleti.jsx";
// Diğer görünümler TEMBEL yüklenir (kod bölme) → ilk yük bundle'ı küçülür; görünümler birebir
// aynı kalır, yalnız ilgili görünüme ilk geçişte küçük bir chunk indirilir. NeonSidebar
// her zaman görünür (nav) olduğundan eager kalır.
const CanliAjanAkisi = lazy(() => import("./components/CanliAjanAkisi.jsx"));
const GelenEvrakView = lazy(() => import("./components/GelenEvrakView.jsx"));
const GidenEvrakView = lazy(() => import("./components/GidenEvrakView.jsx"));
const TaslaklarView = lazy(() => import("./components/TaslaklarView.jsx"));
const MevzuatView = lazy(() => import("./components/MevzuatView.jsx"));
const DenetimView = lazy(() => import("./components/DenetimView.jsx"));
// Sohbet asistanı (FAB + panel) — her görünümde sağ altta; tembel: yalnız kabuk yüklendikten
// sonra iner, ilk yük bundle'ına ağırlık eklemez. Spec: docs/09-sohbet-asistani.md
const ChatbotWidget = lazy(() => import("./components/ChatbotWidget.jsx"));

// Görünüm ↔ URL hash eşlemesi (app.html#gelen). Görünüm geçişleri tarayıcı geçmişine yazılır →
// fare/tarayıcı "geri" tuşu landing'e fırlatmak yerine ÖNCEKİ GÖRÜNÜME döner; yenilemede
// görünüm korunur. Router bağımlılığı yok (tek kabuk, altı görünüm — hash yeterli).
const VIEWS = new Set(["panel", "gelen", "giden", "taslaklar", "mevzuat", "denetim", "isleniyor"]);
const hashView = () => window.location.hash.slice(1);

// DB geçmişinden taslak listesi türet: taslağı ÜRETİLMİŞ ve henüz KARAR VERİLMEMİŞ işlemler
// (onaylanmış/reddedilmiş işlemler Giden Evrak'a düşer — burada tekrar taslak sayılmaz;
// Panel'deki "karar bekleyen" tanımıyla birebir aynı süzgeç). Hem açılış hidrasyonunda
// hem de DB reconcile'ında aynı eşleme → iki yol tutarlı kalsın.
const draftsFromHistory = (items) =>
  (items || []).filter((x) => x.result?.yazi_taslak_md && !x.result?.onay_durumu).map((x) => ({
    ...x,
    id: `db-taslak-${x.id}`,
    name: x.name || "Kalıcı taslak",
  }));

// Frontend seçimi → DB onay kararı etiketi (karar_repo._KARAR ile birebir; duzenle
// nihai karar DEĞİLDİR — evrak "karar bekleyen"de kalır, damgalanmaz).
const KARAR_ETIKET = { onayla: "onaylandi", reddet: "reddedildi" };

// Görünüm geçişini View Transitions API ile sar: destekleyen tarayıcıda yumuşak
// çapraz-erime; destek yoksa ya da kullanıcı hareket azaltmışsa DÜZ geçiş (birebir eski
// davranış). flushSync: React güncellemesi geçiş kare-yakalaması içinde senkron uygulanmalı.
const gecisle = (fn) => {
  const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!document.startViewTransition || az) { fn(); return; }
  document.startViewTransition(() => { flushSync(fn); });
};

export default function DashboardApp() {
  const {
    nodes, result, busy, error, toast, fileMeta, pendingOnay, evrakText, downloading, fileUrl,
    runFile, runSample, resume, download, showToast, dismissError, canRetry, retry, runBase,
  } = usePipeline();

  const { user, logout } = useAuth();
  // Optimistik açılış: son bilinen panel verisini (history/outbox) localStorage'dan ANINDA kur
  // → refresh'te boş→dolu ("Henüz evrak işlenmedi") flash'ı yok. Arka plandaki DB fetch (aşağıdaki
  // effect) uzak Supabase'ten tazeleyip günceller; değişince persist effect önbelleği yeniler.
  const [cachedDash] = useState(() => cachedDashboard.get(user?.id));
  // Açılış görünümü URL hash'inden (yenilemede görünüm korunur); geçersiz/boş → panel.
  const [activeView, setActiveView] = useState(() => (VIEWS.has(hashView()) ? hashView() : "panel"));
  const [history, setHistory] = useState(() => cachedDash?.history || []);
  const [processedIds, setProcessedIds] = useState(() => new Set());
  // Onaylanıp/reddedilip Giden Evrak'a düşen örnekler (id) → artık işlenmiş VE gitmiş
  // sayılır, Gelen Evrak kuyruğunda görünmez ("Düzenle" ile taslağa alınanlar hariç,
  // onlar henüz gönderilmediği için kuyrukta kalır).
  const [sentSampleIds, setSentSampleIds] = useState(() => new Set());
  const [outbox, setOutbox] = useState(() => cachedDash?.outbox || []);
  const [drafts, setDrafts] = useState(() => draftsFromHistory(cachedDash?.history));   // DB/önbellek taslakları + "Düzenle" ile eklenenler
  // Sohbet kaynak çipi → Mevzuat görünümü + okuma modalı köprüsü. MevzuatView tembel
  // yüklendiğinden window-event yerine state taşınır; view mount olunca hedefi tüketir.
  const [mevzuatHedef, setMevzuatHedef] = useState(null);
  // Panel SLA satırı "İşle" → Gelen Evrak'ta o evrakı vurgula+kaydır (aynı hedef deseni).
  const [gelenHedef, setGelenHedef] = useState(null);
  // Onay kartı "Düzenle" → Taslaklar'da o taslağı doğrudan düzenleme modunda aç (aynı hedef deseni).
  const [taslakHedef, setTaslakHedef] = useState(null);
  // Komut paleti (Ctrl+K) — görünüm/eylem/örnek işleme tek kutudan.
  const [paletAcik, setPaletAcik] = useState(false);
  // Hesap menüsü tercihi: canlı ajan izi animasyonlarını azalt (CanliAjanAkisi glow'u).
  // Kalıcı (localStorage) — OS prefers-reduced-motion'dan bağımsız, kullanıcının site tercihi.
  const [hareketAzalt, setHareketAzalt] = useState(() => {
    try { return localStorage.getItem("ke-hareket-azalt") === "1"; } catch { return false; }
  });
  const toggleHareketAzalt = useCallback(() => setHareketAzalt((v) => {
    const yeni = !v;
    try { localStorage.setItem("ke-hareket-azalt", yeni ? "1" : "0"); } catch { /* özel mod — tercih oturumluk kalır */ }
    return yeni;
  }), []);
  // Kuyruk SLA önizlemesi: id → sla_metadata (backend compute_sla — süre tablosu tek kaynak).
  const [slaMap, setSlaMap] = useState(null);
  const fileRef = useRef(null);
  const lastResultRef = useRef(null);
  const pendingApprovalRef = useRef(null);   // HITL kararı damgası (resume async)
  const sentRef = useRef(new Set());          // aynı sonuç iki kez gönderilmesin
  const draftedRef = useRef(new Set());       // aynı sonuç iki kez taslağa eklenmesin

  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const riskOutcome = data?.risk_metadata?.bant || "yesil";
  const draftCount = drafts.length;
  const inboxCount = Math.max(0, SAMPLE_DOCS.length - sentSampleIds.size);
  const gidenCount = outbox.filter((o) => o.durum === "gonderildi").length;

  // Onaylanan/gönderilen evrakı Giden Evrak'a yaz (durum: gonderildi|duzenlendi|reddedildi).
  // Aynı sonuç iki kez gönderilmez (sentRef). SHA frontend'de üretilmez — backend son_hash taşınır.
  const pushOutbox = (res, fm, secim) => {
    if (!res || sentRef.current.has(res)) return false;
    sentRef.current.add(res);
    if (fm?.kind === "sample" && fm.id) setSentSampleIds((s) => new Set(s).add(fm.id));
    const name = fm?.kind === "sample" ? (fm.label || fm.name) : (fm?.name || "evrak");
    const durum = secim === "reddet" ? "reddedildi" : secim === "duzenle" ? "duzenlendi" : "gonderildi";
    setOutbox((o) => [{
      id: `E-G-${new Date().getFullYear()}/${String(o.length + 1).padStart(4, "0")}`,
      kaynak_evrak_adi: name, gonderim_tarihi: Date.now(),
      evrak_turu: res.evrak_turu, tur: res.yazi_turu,
      konu: res.bilgi_unsurlari?.konu || res.alt_talepler?.[0]?.ozet || "—",
      alici_birim: res.hedef_birim, risk: res.risk_metadata?.bant || "yesil",
      durum, taslak: res.yazi_taslak_md || "",
      memor_adi: "M. Yılmaz", memor_unvan: "Yetkili memur",
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
      return mevcut ? mevcut.id : false;
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

  const persistDecision = useCallback(async (res, secim) => {
    if (!res?.islem_id || secim === "duzenle") return;
    try {
      await apiPost(`/islem/${encodeURIComponent(res.islem_id)}/onayla`, { secim });
    } catch (err) {
      console.warn("Onay/giden evrak DB'ye yazılamadı", err);
      showToast("Evrak oturumda görünüyor; DB onay kaydı yazılamadı.");
    }
  }, [showToast]);

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
    if (user?.id) cachedDashboard.set(user.id, { history, outbox });
  }, [history, outbox, user]);

  // Sonuç kesinleşince oturum geçmişine ekle (Panel/Taslaklar/Denetim/Mevzuat bundan beslenir).
  // HITL kararı damgalanmışsa (resume sonrası) Giden Evrak kaydını burada kur (resume async).
  useEffect(() => {
    if (result && result !== lastResultRef.current) {
      const onceki = lastResultRef.current;
      // SSE `persist` event'i AYNI koşumu yalnız islem_id ile zenginleştirir (usePipeline
      // shallow-merge → iç nesneler referans-eş; farklı koşumlar taze JSON.parse nesneleri
      // taşıdığından referans eşitliği koşumlar arası imkânsız). Bu yeni koşum DEĞİL:
      // geçmişe ikinci kayıt açma; mevcut kaydı tazele ki stampDecision islem_id bulsun.
      // (onceki.islem_id koşulu YOK — tekrarlanan persist event'i de idempotent kalır.)
      if (onceki && result.islem_id
          && result.denetim_izi === onceki.denetim_izi
          && result.bilgi_unsurlari === onceki.bilgi_unsurlari) {
        lastResultRef.current = result;
        setHistory((h) => h.map((x) => (x.result === onceki ? { ...x, result } : x)));
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
          showToast(pa.secim === "reddet" ? "Reddedildi — Giden Evrak'a kaydedildi." : "Evrak gönderildi — Giden Evrak'a eklendi.");
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
  const mevzuatAc = useCallback((hedef) => { setMevzuatHedef(hedef); goView("mevzuat"); }, [goView]);
  // Panel'den evrak-hedefli geçiş: id string ise vurgu hedefi kur (buton onClick'in event
  // nesnesi geçirmesine karşı tip koruması), her durumda Gelen Evrak'a git.
  const goInbox = useCallback((hedefId) => {
    if (typeof hedefId === "string") setGelenHedef(hedefId);
    goView("gelen");
  }, [goView]);

  // Oturum geçmişinde HITL kararını damgala (Panel "Karar bekleyen" düşsün; DB zaten
  // persistDecision ile yazıldı — refresh'te islem_listele aynı alanı döndürür).
  const stampDecision = useCallback((res, secim) => {
    const karar = KARAR_ETIKET[secim];
    if (!karar || !res) return;
    setHistory((h) => h.map((x) => (
      x.result === res || (res.islem_id && x.result?.islem_id === res.islem_id)
        ? { ...x, result: { ...x.result, onay_durumu: karar } } : x)));
  }, []);

  // Ctrl+K / Cmd+K → komut paleti (input odaklıyken de çalışır; tarayıcı aramasını bastırır).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletAcik((v) => !v);
      } else if (e.key === "Escape") {
        setPaletAcik(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const paletAc = useCallback(() => setPaletAcik(true), []);

  // İşlenmemiş kuyruk için SLA rozetleri — statik örnek seti için BİR kez hesaplanır
  // (react-query: geçici ağ hatasında kendini toparlar). Backend yoksa sessizce atlanır
  // (rozetler görünmez, kuyruk aynen çalışır).
  const slaQ = useQuery({
    queryKey: ["sla-onizleme"],
    queryFn: async () => {
      const r = await fetch("/sla/onizleme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ogeler: SAMPLE_DOCS.map((s) => ({ id: s.id, tur: s.id, metin: s.text })) }),
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
        .map((s) => ({ id: s.id, label: s.label, sla: slaMap[s.id] }))
        .filter((x) => x.sla)
    : [];

  // Taslak düzenle (metni güncelle) / sil — Taslaklar görünümünden çağrılır.
  const updateDraft = useCallback((id, md) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, result: { ...x.result, yazi_taslak_md: md } } : x))), []);
  // Taslak silme KALICIDIR: DB taslakları (db-taslak-<islem_id>) backend'de de silinir —
  // sayfa yenilenince geri gelmez. Oturumluk ("Düzenle" ile eklenen) taslak yalnız state'ten düşer.
  const deleteDraft = useCallback(async (id) => {
    setDrafts((d) => d.filter((x) => x.id !== id));   // optimistik kaldır
    const islemId = String(id).startsWith("db-taslak-") ? String(id).slice("db-taslak-".length) : null;
    if (!islemId) return;
    try {
      await apiDelete(`/islem/${encodeURIComponent(islemId)}/taslak`);
      // history reconcile'ında geri dirilmesin: ilgili kaydın taslağını da düşür.
      setHistory((h) => h.map((x) =>
        (x.id === islemId ? { ...x, result: { ...x.result, yazi_taslak_md: "" } } : x)));
    } catch (err) {
      console.warn("Taslak DB'den silinemedi", err);
      showToast("Taslak kalıcı silinemedi — sayfa yenilenince geri gelebilir.");
    }
  }, [showToast]);
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const triggerUpload = useCallback(() => { goView("isleniyor"); if (!busy) fileRef.current?.click(); }, [busy, goView]);
  const processSample = useCallback((s) => { setProcessedIds((p) => new Set(p).add(s.id)); goView("isleniyor"); if (!busy) runSample(s); }, [busy, runSample, goView]);

  // HITL açık → kararı damgala + resume (outbox kaydı result-effect'te). HITL kapalı → mevcut
  // sonuçtan senkron Giden Evrak kaydı (onayla/reddet; düzenle yalnız bilgilendirir).
  const onApprove = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "onayla", fileMeta }; resume("onayla"); }
    else if (pushOutbox(result, fileMeta, "onayla")) { persistDecision(result, "onayla"); stampDecision(result, "onayla"); showToast("Evrak onaylandı — Giden Evrak'a gönderildi."); goView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onReject = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "reddet", fileMeta }; resume("reddet"); }
    else if (pushOutbox(result, fileMeta, "reddet")) { persistDecision(result, "reddet"); stampDecision(result, "reddet"); showToast("Reddedildi — Giden Evrak'a kaydedildi (denetim izi)."); goView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onEdit = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "duzenle", fileMeta }; resume("duzenle"); return; }
    const taslakId = pushDraft(result, fileMeta);
    if (taslakId) { setTaslakHedef(taslakId); showToast("Taslak düzenlemeye alındı — Taslaklar'a eklendi."); goView("taslaklar"); }
    else showToast("Önce taslak üreten bir evrak işleyin.");
  };
  const onResend = () => showToast("Tekrar gönderme üretim entegrasyonunda etkinleşir.");

  let view;
  if (activeView === "panel") view = <PanelView history={history} outbox={outbox} inboxCount={inboxCount} kuyrukSla={kuyrukSla} draftCount={draftCount} pendingOnay={!!pendingOnay} onGoInbox={goInbox} onUpload={triggerUpload} user={user} />;
  else if (activeView === "gelen") view = <GelenEvrakView samples={SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))} processedIds={processedIds} slaMap={slaMap} onProcess={processSample} onUpload={triggerUpload} busy={busy} hedef={gelenHedef} onHedefAcildi={() => setGelenHedef(null)} />;
  else if (activeView === "giden") view = <GidenEvrakView outbox={outbox} onUpload={triggerUpload} onGoInbox={() => goView("gelen")} onResend={onResend} />;
  else if (activeView === "taslaklar") view = <TaslaklarView drafts={drafts} onGoInbox={() => goView("gelen")} onUpdate={updateDraft} onDelete={deleteDraft} onToast={showToast} hedef={taslakHedef} onHedefAcildi={() => setTaslakHedef(null)} />;
  else if (activeView === "mevzuat") view = <MevzuatView history={history} hedef={mevzuatHedef} onHedefAcildi={() => setMevzuatHedef(null)} />;
  else if (activeView === "denetim") view = <DenetimView history={history} onGoInbox={() => goView("gelen")} />;
  else view = (
    <CanliAjanAkisi
      nodes={nodes} result={data} busy={busy} started={started} runBase={runBase}
      riskOutcome={riskOutcome} fileMeta={fileMeta} pendingOnay={pendingOnay}
      onApprove={onApprove} onEdit={onEdit} onReject={onReject}
      onDownload={download} downloading={downloading} canDownload={!!evrakText}
      onUpload={triggerUpload} onGoInbox={() => goView("gelen")}
      fileUrl={fileUrl} onFileDrop={runFile} glow={!hareketAzalt}
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

        <NeonSidebar activeView={activeView} onNavigate={goView} onUpload={triggerUpload} samples={SAMPLE_DOCS} onPickSample={processSample} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} user={user} onLogout={logout} onPalet={paletAc} hareketAzalt={hareketAzalt} onHareketAzalt={toggleHareketAzalt} />

        <main id="nu-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Suspense fallback={<ViewFallback />}>{view}</Suspense>
        </main>

        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{toast}</div>
        {/* sonner: katmanlı/istiflenen bildirimler — eski tek-toast görünümüyle aynı dil (koyu yüzey). */}
        <Toaster position="bottom-center" duration={3200} gap={8} visibleToasts={3}
          toastOptions={{ style: { background: PAL.inkSurf, color: PAL.onAccent, border: "none", borderRadius: RAD.pop, boxShadow: SH.modal, fontFamily: SANS, fontSize: 14, lineHeight: "20px", fontWeight: 500, padding: "12px 16px" } }} />
        {error && !busy && <ErrorBar msg={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />}

        <KomutPaleti acik={paletAcik} onKapat={() => setPaletAcik(false)} onNavigate={goView} onUpload={triggerUpload}
          samples={SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))} onPickSample={processSample} busy={busy} />

        {user && <Suspense fallback={null}><ChatbotWidget onNavigate={goView} onMevzuatAc={mevzuatAc} /></Suspense>}
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
