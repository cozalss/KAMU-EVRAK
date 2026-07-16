/* TelefonYukle — QR ile telefondan evrak alma modalı (demo yıldızı ek kanalı).
   Akış: aç → POST /mobil/oturum → QR göster → /durum poll (1.5 sn) → yuklendi olunca
   /dosya blob'unu TEK SEFERLİK çek → File olarak onFile'a ver (usePipeline.runFile →
   mevcut /process_doc/stream SSE akışı; pipeline büyük ekranda canlı yanar) → kapan.
   Tasarım: yalnız neonUi token'ları. QR her temada beyaz kart + koyu modül (okunabilirlik
   istisnası). a11y: BelgeModal deseni — doküman-düzeyi Escape + odak iadesi + scroll kilidi
   + Tab tuzağı. Poll: setTimeout zinciri; await sonrası iptal kontrolü (yarış kapalı). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { PAL, T, TYPE, RAD, SP, SH, MONO, BANT, DERIN, ALFA, Btn, Icon, focusRing } from "./neonUi.jsx";

const POLL_MS = 1500;
const MAKS_ARDISIK_HATA = 8;   // ~12 sn sunucu sessizliği → kullanıcıya söyle, sessiz dönme

export default function TelefonYukleModal({ onClose, onFile, showToast }) {
  const [oturum, setOturum] = useState(null);    // {oturum_id, mobil_url, aday_urller}
  const [durum, setDurum] = useState("kurulum"); // kurulum|bekliyor|aliniyor|suresi_doldu|indirme_hatasi|hata
  // Çoklu ağ arayüzü (Ethernet+Wi-Fi): seçilen aday URL — QR bunu kodlar, değişince anında yenilenir.
  const [urlIdx, setUrlIdx] = useState(0);
  const kapatRef = useRef(null);
  const kutuRef = useRef(null);
  const oncekiOdak = useRef(null);
  const zamanRef = useRef(null);
  const bittiRef = useRef(false);                // unmount/tamamlanma sonrası işlem yapma
  // Parent her render'da inline arrow üretir → poll effect'i sabit tutmak için ref aynası
  // (BelgeModal.kapatIstegiRef deseni). Böylece effect deps = [durum, oturum] kalır.
  const onFileRef = useRef(onFile);     onFileRef.current = onFile;
  const onCloseRef = useRef(onClose);   onCloseRef.current = onClose;
  const toastRef = useRef(showToast);   toastRef.current = showToast;

  const oturumKur = useCallback(async () => {
    setDurum("kurulum");
    try {
      const r = await fetch("/mobil/oturum", { method: "POST" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      if (bittiRef.current) return;
      setOturum(j);
      setUrlIdx(0);
      setDurum("bekliyor");
    } catch {
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

  // Açılışta: oturum kur + odak yönetimi (BelgeModal deseni: önceki odağı sakla, kapanışta
  // iade et) + doküman-düzeyi Escape + arka plan scroll kilidi.
  useEffect(() => {
    bittiRef.current = false;
    oncekiOdak.current = document.activeElement;
    oturumKur();
    kapatRef.current?.focus();
    const tusla = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    document.addEventListener("keydown", tusla);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      bittiRef.current = true;
      clearTimeout(zamanRef.current);
      document.removeEventListener("keydown", tusla);
      document.body.style.overflow = eski;
      oncekiOdak.current?.focus?.();
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

  // Tab tuzağı — odak dialog içinde döner (HesapMenu klavye deseni; aria-modal sözünü tut).
  const onKey = (e) => {
    if (e.key !== "Tab" || !kutuRef.current) return;
    const odaklanir = kutuRef.current.querySelectorAll("button:not([disabled])");
    if (!odaklanir.length) return;
    const ilk = odaklanir[0], son = odaklanir[odaklanir.length - 1];
    if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ty-baslik" onKeyDown={onKey}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 320, display: "grid", placeItems: "center",
               background: PAL.scrim, padding: SP.l }}>
      <div ref={kutuRef} style={{ background: PAL.bg, border: `1px solid ${PAL.line}`, borderRadius: RAD.pop,
                    boxShadow: SH.modal, padding: SP.xl, width: "min(400px, 94vw)",
                    display: "flex", flexDirection: "column", gap: SP.l, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
          <span aria-hidden="true" style={{ color: T, display: "grid", placeItems: "center" }}><Icon.phone /></span>
          <h2 id="ty-baslik" style={{ margin: 0, ...TYPE.h2, color: PAL.ink, flex: 1, textAlign: "left" }}>
            Telefonla evrak yükle
          </h2>
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
            {/* QR: her temada beyaz zemin + koyu modül — tarayıcı kameraları için en garantili kontrast. */}
            <div style={{ alignSelf: "center", background: "#fff", padding: 14, borderRadius: RAD.card,
                          border: `1px solid ${PAL.line}` }}>
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
            <p role="status" aria-live="polite" style={{ margin: 0, ...TYPE.meta, color: durum === "aliniyor" ? PAL.ink : PAL.mut }}>
              {durum === "aliniyor" ? "Fotoğraf alındı — işlemeye veriliyor…" : "Telefondan yükleme bekleniyor…"}
            </p>
          </>
          );
        })()}

        {durum === "suresi_doldu" && (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut }}>QR kodun süresi doldu.</p>
            <Btn primary onClick={oturumKur}>Yeni QR oluştur</Btn>
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
              <Btn onClick={oturumKur}>Yeni QR oluştur</Btn>
            </div>
          </>
        )}

        {durum === "hata" && (
          <>
            <p style={{ margin: 0, ...TYPE.ui, color: PAL.mut }}>
              Sunucuya ulaşılamıyor. (Telefon erişimi için{" "}
              <code style={{ fontFamily: MONO }}>--host 0.0.0.0</code>)
            </p>
            <Btn onClick={oturumKur}>Tekrar dene</Btn>
          </>
        )}
      </div>
    </div>
  );
}
