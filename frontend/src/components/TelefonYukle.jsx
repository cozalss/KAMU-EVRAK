/* TelefonYukle — QR ile telefondan evrak alma modalı (demo yıldızı ek kanalı).
   Akış: aç → POST /mobil/oturum → QR göster → /durum poll (1.5 sn) → yuklendi olunca
   /dosya blob'unu TEK SEFERLİK çek → File olarak onFile'a ver (usePipeline.runFile →
   mevcut /process_doc/stream SSE akışı; pipeline büyük ekranda canlı yanar) → kapan.
   Tasarım: yalnız neonUi token'ları. QR her temada beyaz kart + koyu modül (okunabilirlik
   istisnası). Kabuk: vaul (Drawer) — telefon eşleme akışı olduğundan alttan-açılan panel
   dokunsal olarak "telefon" hissini güçlendirir; masaüstünde de merkezi/dar kalır (aşırı
   geniş açılmaz). a11y: vaul (Radix Dialog üzerine kurulu) — odak tuzağı, Esc, dış-tık,
   gövde kaydırma kilidi ve odak yakala/iade kütüphaneden; elle doküman dinleyicileri kalktı.
   Poll: setTimeout zinciri; await sonrası iptal kontrolü (yarış kapalı). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import QRCode from "react-qr-code";
import { PAL, T, TYPE, RAD, SP, SH, MONO, BANT, DERIN, ALFA, SR_ONLY, Btn, Icon, focusRing } from "./neonUi.jsx";

const POLL_MS = 1500;
const MAKS_ARDISIK_HATA = 8;   // ~12 sn sunucu sessizliği → kullanıcıya söyle, sessiz dönme

export default function TelefonYukleModal({ onClose, onFile, showToast }) {
  const [oturum, setOturum] = useState(null);    // {oturum_id, mobil_url, aday_urller}
  const [durum, setDurum] = useState("kurulum"); // kurulum|bekliyor|aliniyor|suresi_doldu|indirme_hatasi|hata
  // Çoklu ağ arayüzü (Ethernet+Wi-Fi): seçilen aday URL — QR bunu kodlar, değişince anında yenilenir.
  const [urlIdx, setUrlIdx] = useState(0);
  // Sunucu 4xx/5xx dönerse `detail` mesajı BURADA gösterilir — eskiden HER hata (oturum
  // tavanı/hız sınırı/gerçek bağlantı kopması fark etmeksizin) aynı "--host 0.0.0.0" ipucunu
  // gösteriyordu; asıl neden farklıyken (ör. 429 "Aktif eşleme oturumu tavanına ulaşıldı")
  // yanlış reçete veriyordu (kullanıcı bulgusu). Boşsa (fetch hiç yanıt vermedi) genel mesaja düşülür.
  const [hataMsg, setHataMsg] = useState("");
  const kapatRef = useRef(null);
  const zamanRef = useRef(null);
  const bittiRef = useRef(false);                // unmount/tamamlanma sonrası işlem yapma
  // Parent her render'da inline arrow üretir → poll effect'i sabit tutmak için ref aynası
  // (BelgeModal.kapatIstegiRef deseni). Böylece effect deps = [durum, oturum] kalır.
  const onFileRef = useRef(onFile);     onFileRef.current = onFile;
  const onCloseRef = useRef(onClose);   onCloseRef.current = onClose;
  const toastRef = useRef(showToast);   toastRef.current = showToast;

  // signal opsiyonel: yalnız mount effect'i verir (StrictMode/unmount iptali için — aşağıya
  // bkz). "Tekrar dene"/"Yeni QR oluştur" gibi elle tetiklenen çağrılarda signal yok, normal
  // fetch davranışı sürer.
  const oturumKur = useCallback(async (signal) => {
    setDurum("kurulum");
    setHataMsg("");
    try {
      const r = await fetch("/mobil/oturum", { method: "POST", signal });
      if (!r.ok) {
        // Backend zaten doğru Türkçe mesajı üretiyor (ör. 429 "Aktif eşleme oturumu tavanına
        // ulaşıldı; biraz sonra deneyin.") — gövde JSON değilse ya da detail yoksa sessizce
        // genel mesaja düşülür (aşağıdaki render'daki fallback).
        let msg = "";
        try { msg = (await r.json())?.detail || ""; } catch { /* JSON değil — yut */ }
        if (bittiRef.current) return;
        setHataMsg(msg);
        setDurum("hata");
        return;
      }
      const j = await r.json();
      if (bittiRef.current) return;
      setOturum(j);
      setUrlIdx(0);
      setDurum("bekliyor");
    } catch (err) {
      if (err?.name === "AbortError") return;   // StrictMode çift-mount / erken kapanış — sessiz
      if (!bittiRef.current) setDurum("hata");
    }
  }, []);

  /* Tek-seferlik indirme + pipeline'a teslim. Poll'dan da, indirme_hatasi "tekrar dene"den
     de çağrılır. Başarısızsa DÜRÜST duruma geçer: eşleme koptu değil, İNDİRME koptu. */
  const dosyayiAl = useCallback(async (oid, dosyaAdi) => {
    setDurum("aliniyor");
    try {
      const dr = await fetch(`/mobil/${oid}/dosya`);
      if (bittiRef.current) return;
      if (!dr.ok) { setDurum("indirme_hatasi"); return; }
      const blob = await dr.blob();
      if (bittiRef.current) return;
      const ad = dosyaAdi || "telefon-evrak.jpg";
      const dosya = new File([blob], ad, { type: blob.type || "image/jpeg" });
      toastRef.current?.(`Telefondan alındı: ${ad} — ajanlar işliyor.`);
      onFileRef.current?.(dosya);
      onCloseRef.current?.();
    } catch {
      if (!bittiRef.current) setDurum("indirme_hatasi");
    }
  }, []);

  // Açılışta: oturum kur. Odak yakalama/iade + Esc + arka plan scroll kilidi artık vaul'un
  // (Radix Dialog üzerine kurulu) Drawer.Content'inden geliyor — elle doküman dinleyicisi yok.
  // AbortController ŞART: React StrictMode dev'de bu effect'i mount→cleanup→mount olarak İKİ
  // KEZ çalıştırır — eskiden ilk çağrının fetch'i `bittiRef` bayrağıyla yalnız SONUCU yok
  // sayılıyordu, isteğin KENDİSİ backend'e zaten gitmiş oluyordu → her panel açılışında
  // BACKEND'DE İKİ oturum açılıyor, biri hep öksüz kalıyordu (10 dk TTL dolana kadar).
  // Sonuç: MAX_AKTIF_OTURUM (20) tavanı normal test kullanımında bile hızla doluyordu
  // (kullanıcı bulgusu, 2026-07-20). abort() isteği GERÇEKTEN iptal eder — backend'e hiç gitmez.
  useEffect(() => {
    bittiRef.current = false;
    const denetci = new AbortController();
    oturumKur(denetci.signal);
    return () => {
      bittiRef.current = true;
      denetci.abort();
      clearTimeout(zamanRef.current);
    };
  }, [oturumKur]);

  // Poll döngüsü — üst üste binmeyen setTimeout zinciri; her await SONRASI iptal kontrolü
  // (efekt yeniden kurulursa eski zincir one-shot /dosya'ya dokunamaz).
  useEffect(() => {
    if (durum !== "bekliyor" || !oturum) return undefined;
    let iptal = false;
    let ardisikHata = 0;
    const bak = async () => {
      if (iptal || bittiRef.current) return;
      try {
        const r = await fetch(`/mobil/${oturum.oturum_id}/durum`);
        if (iptal || bittiRef.current) return;
        if (r.status === 404) { setDurum("suresi_doldu"); return; }
        const j = await r.json();
        if (iptal || bittiRef.current) return;
        ardisikHata = 0;
        if (j.durum === "yuklendi") { dosyayiAl(oturum.oturum_id, j.dosya_adi); return; }
      } catch {
        // Geçici ağ hatası bir-iki turda düzelir; sürekli sessizlik kullanıcıya söylenir.
        if (++ardisikHata >= MAKS_ARDISIK_HATA) { if (!iptal && !bittiRef.current) setDurum("hata"); return; }
      }
      zamanRef.current = setTimeout(bak, POLL_MS);
    };
    zamanRef.current = setTimeout(bak, POLL_MS);
    return () => { iptal = true; clearTimeout(zamanRef.current); };
  }, [durum, oturum, dosyayiAl]);

  return (
    // Kontrollü open: bileşen yalnız telefonAcik true iken mount edilir (DashboardApp), o
    // yüzden open her zaman true — kapanış onOpenChange(false) → onClose (BelgeModal/Kip deseni).
    <Drawer.Root open onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={{ position: "fixed", inset: 0, zIndex: 320, background: PAL.scrim }} />
        <Drawer.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); kapatRef.current?.focus(); }}
          // Yatay ortalama left+right+margin ile (transform DEĞİL) — vaul sürükleme/açılma
          // animasyonu için Content'in transform'unu kendi JS'iyle yönetiyor; elle translateX
          // eklemek onunla çakışıp panel açılışta yana kayıyordu (kök neden — bug avı bulgusu).
          // willChange: vaul sürükleme/açılma her karede transform'u ELLE (JS) yazıyor; gölgeli
          // (boxShadow) bir öğeye bunu layer'a ALMADAN yapmak her karede yeniden boyama
          // (repaint) tetikler → "takılıyor/akmıyor" hissi. willChange Content'i AÇILIŞTAN
          // ÖNCE kendi compositor katmanına yükseltir, transform artık ucuz (yalnız GPU).
          style={{ position: "fixed", left: 0, right: 0, bottom: 0, margin: "0 auto", zIndex: 320, width: "min(440px, 100vw)", maxWidth: "100vw", maxHeight: "88vh", display: "flex", flexDirection: "column", background: PAL.bg, border: `1px solid ${PAL.line}`, borderBottom: "none", borderTopLeftRadius: RAD.pop, borderTopRightRadius: RAD.pop, boxShadow: SH.modal, outline: "none", overflow: "hidden", willChange: "transform" }}>
          <Drawer.Description style={SR_ONLY}>Telefonla evrak yükleme — QR eşleme penceresi.</Drawer.Description>
          {/* Üst şerit — bu kanalın "canlı" / demo-yıldızı kimliği (NavBtn'in aktif-şerit
              dilinin aynısı: ince T-renkli çizgi = özel/canlı durum, gradyan değil). */}
          <div aria-hidden="true" style={{ height: 2, background: T, flexShrink: 0 }} />
          {/* Sürükleme tutamacı — vaul'un alttan-açılan panel dili (aşağı sürükleyerek de kapatılabilir). */}
          <Drawer.Handle style={{ margin: "12px auto 0", width: 36, height: 4, background: PAL.lineHi, borderRadius: RAD.dot, flexShrink: 0 }} />
          {/* minHeight: "kurulum" (oturum kurulurken, ~birkaç yüz ms) → "bekliyor" (QR + masa
              zemini dolu) geçişi İÇERİK YÜKSEKLİĞİNİ değiştiriyordu — panel açılış animasyonu
              SÜRERKEN ya da biter bitmez boyu ANİDEN büyüyordu, "akmıyor/takılıyor" hissinin
              asıl kaynağı buydu (kayma bug'ından ayrı, ikinci kök neden). "bekliyor" durumunun
              tipik yüksekliği baştan ayrılır → geçiş görünmez olur. */}
          <div style={{ padding: SP.xl, overflowY: "auto", display: "flex", flexDirection: "column", gap: SP.l, textAlign: "center", minHeight: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
          <span aria-hidden="true" style={{ color: DERIN.T, display: "grid", placeItems: "center" }}><Icon.phone /></span>
          <Drawer.Title asChild>
            <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink, flex: 1, textAlign: "left" }}>
              Telefonla evrak yükle
            </h2>
          </Drawer.Title>
          <button ref={kapatRef} type="button" onClick={onClose} aria-label="Pencereyi kapat" {...focusRing}
            style={{ cursor: "pointer", border: `1px solid ${PAL.line}`, background: PAL.surf,
                     color: PAL.mut, borderRadius: RAD.ctl, width: 30, height: 30, lineHeight: 1,
                     fontSize: 16 }}>×</button>
        </div>

        {durum === "kurulum" && (
          <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut }}>Eşleme oturumu açılıyor…</p>
        )}

        {(durum === "bekliyor" || durum === "aliniyor") && oturum && (() => {
          const adaylar = oturum.aday_urller?.length ? oturum.aday_urller : [oturum.mobil_url];
          const seciliUrl = adaylar[Math.min(urlIdx, adaylar.length - 1)];
          return (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut2, textAlign: "left" }}>
              Telefonunuzla QR'ı okutun, fotoğraf çekin veya dosya seçin —
              bu ekranda ajanların canlı işleyişini izleyin.{" "}
              <b>Telefon, bilgisayarla aynı Wi-Fi ağında olmalı.</b>
            </p>
            {/* Backend self-test: sunucu kendi LAN IP'sinden kendine bağlanamadıysa telefonlar
                da bağlanamaz. erisim_tanisi nedeni AYIRIR → doğru reçete: "dinlemiyor" =
                127.0.0.1'e bağlı (eski süreç / --host'suz uvicorn CLI), "engelleniyor" =
                güvenlik duvarı. Arızayı jüri anında değil QR açılırken göster. */}
            {oturum.erisilebilir === false && (
              <p role="alert" style={{ margin: 0, padding: SP.m, borderRadius: RAD.card, textAlign: "left",
                                       border: `1px solid ${BANT.kirmizi.c}`, background: ALFA(BANT.kirmizi.c),
                                       ...TYPE.data, color: DERIN.kirmizi }}>
                {oturum.erisim_tanisi === "dinlemiyor" ? (
                  <>
                    <b>Backend LAN'da dinlemiyor</b> — büyük olasılıkla kapatılmamış eski bir
                    backend 127.0.0.1'de çalışıyor. Port 8000'deki süreci kapatın
                    (<code style={{ fontFamily: MONO }}>netstat -ano | findstr :8000</code>) ve{" "}
                    <code style={{ fontFamily: MONO }}>backend</code> klasöründe{" "}
                    <code style={{ fontFamily: MONO }}>uv run main.py</code> ile yeniden başlatın.
                  </>
                ) : oturum.erisim_tanisi === "engelleniyor" ? (
                  <>
                    <b>Güvenlik duvarı bağlantıyı engelliyor görünüyor</b> — backend LAN'da
                    dinliyor ama erişim kesiliyor. Bir kez yönetici PowerShell'de{" "}
                    <code style={{ fontFamily: MONO }}>scripts\demo-mobil.ps1</code> çalıştırın
                    (8000 için kalıcı izin kuralı ekler); Windows izin penceresi çıkarsa
                    "İzin Ver" deyin.
                  </>
                ) : (
                  <>
                    <b>Telefonlar bu sunucuya erişemeyebilir</b> — backend yalnız bu
                    bilgisayardan erişilebilir görünüyor.{" "}
                    <code style={{ fontFamily: MONO }}>scripts\demo-mobil.ps1</code> ile
                    (0.0.0.0) başlatın.
                  </>
                )}
              </p>
            )}
            {/* "Masa" zemini — KaynakBelge'nin kağıt-üstünde-masa motifiyle aynı dil (CanliAjanAkisi.jsx):
                QR + bağlantı bilgisi tek tinted zeminde toplanır, ayrı ayrı yüzen öğeler değil. */}
            <div style={{ background: PAL.surf2, borderRadius: RAD.card, padding: SP.l, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.m }}>
              {/* QR: her temada beyaz zemin + koyu modül — tarayıcı kameraları için en garantili kontrast. */}
              <div style={{ background: "#fff", padding: 14, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, boxShadow: SH.pop }}>
                {/* level="M": orta hata düzeltme — uzaktan/parlamada okutmada L'den toleranslı
                    (resmî react-qr-code önerisi); kısa URL'de yoğunluk artışı ihmal edilebilir. */}
                <QRCode value={seciliUrl} size={196} bgColor="#ffffff" fgColor="#161616" level="M" />
              </div>
              {/* Çoklu ağ arayüzü: telefon bağlanamıyorsa büyük olasılıkla QR yanlış arayüzün
                  IP'sini kodladı — seçici ile diğer ağ denenir, QR anında yenilenir. */}
              {adaylar.length > 1 && (
                <label style={{ display: "flex", alignItems: "center", gap: SP.s, justifyContent: "center", ...TYPE.meta, color: PAL.mut }}>
                  Ağ:
                  <select value={urlIdx} onChange={(e) => setUrlIdx(Number(e.target.value))} {...focusRing}
                    style={{ fontFamily: MONO, ...TYPE.meta, color: PAL.ink2, background: PAL.surf,
                             border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "5px 8px", cursor: "pointer" }}>
                    {adaylar.map((u, i) => (
                      <option key={u} value={i}>
                        {u.replace(/^https?:\/\//, "").replace(/\/mobil\/.*$/, "")}{i === 0 ? " (önerilen)" : ""}
                      </option>
                    ))}
                  </select>
                  <span>— telefon bağlanamazsa diğerini deneyin</span>
                </label>
              )}
              <code style={{ fontFamily: MONO, ...TYPE.meta, color: PAL.mut, wordBreak: "break-all" }}>
                {seciliUrl}
              </code>
            </div>
            {/* Canlı durum satırı — bekliyorken nabız atan nokta ("hareket=bilgi", nu-think);
                fotoğraf alınınca tek seferlik yeşil onay (nu-pop) — ikisi de globalde tanımlı
                keyframe'ler, yeni CSS yok. */}
            <p role="status" aria-live="polite" style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, ...TYPE.meta, fontWeight: durum === "aliniyor" ? 600 : 400, color: durum === "aliniyor" ? DERIN.yesil : PAL.mut }}>
              {durum === "aliniyor" ? (
                <span aria-hidden="true" style={{ display: "flex", color: DERIN.yesil, animation: "nu-pop .3s var(--ke-ease-out) both" }}><Icon.check width={13} height={13} /></span>
              ) : (
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: T, animation: "nu-think 1.3s ease-in-out infinite" }} />
              )}
              {durum === "aliniyor" ? "Fotoğraf alındı — işlemeye veriliyor…" : "Telefondan yükleme bekleniyor…"}
            </p>
          </>
          );
        })()}

        {durum === "suresi_doldu" && (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut }}>QR kodun süresi doldu.</p>
            <Btn primary onClick={() => oturumKur()}>Yeni QR oluştur</Btn>
          </>
        )}

        {durum === "indirme_hatasi" && (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut, textAlign: "left" }}>
              Fotoğraf telefondan gönderildi ama bu ekrana <b>indirilemedi</b>.
              İndirmeyi tekrar deneyin; olmazsa yeni QR oluşturup telefondan yeniden gönderin.
            </p>
            <div style={{ display: "flex", gap: SP.s, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn primary onClick={() => oturum && dosyayiAl(oturum.oturum_id, "")}>İndirmeyi tekrar dene</Btn>
              <Btn onClick={() => oturumKur()}>Yeni QR oluştur</Btn>
            </div>
          </>
        )}

        {durum === "hata" && (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut }}>
              {hataMsg || (
                <>Sunucuya ulaşılamıyor. (Telefon erişimi için{" "}
                  <code style={{ fontFamily: MONO }}>--host 0.0.0.0</code>)</>
              )}
            </p>
            <Btn onClick={() => oturumKur()}>Tekrar dene</Btn>
          </>
        )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
