/* KVKK onam kapısı — halka açık demoda gerçek kişisel veri yüklenmesini engelleyen kapı.

   NEDEN ENGELLEYİCİ (bilgi notu değil): demo Türkçe ve internete açık olunca kullanıcılar
   GERÇEK evrak yükler; içinde gerçek ad, TCKN, adres olur. Uyarıyı görmezden gelinebilir
   bir şerit olarak koymak, "uyardık" demenin ötesine geçmez. Kapı, onay verilmeden dosya
   seçicinin AÇILMAMASINI sağlar.

   Renk/ölçü/animasyon YALNIZ neonUi token'larından (CLAUDE.md: elle hex yasak).
   Kutucuk `NeonDetayParts.jsx`'teki role="checkbox" deseninin birebir kopyası —
   paylaşılan bir kutucuk atomu yok, desen kopyalanır.
   Odak tuzağı mevcut `odakDongusu` yardımcısıyla; ikinci bir tuzak YAZILMAZ.
   `prefers-reduced-motion` NEON_KEYFRAMES'te global olarak zaten kapatılıyor. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALFA, BANT, Btn, DERIN, EASE, Icon, PAL, RAD, SP, SH, TYPE,
  focusRing, odakDongusu,
} from "./neonUi.jsx";
import { DEMO_MODU, onamGerekli, onamOku, onamYaz } from "../lib/kvkkOnam.js";

/** Onam durumunu yöneten hook. Demo kapalıysa `gerekli` HER ZAMAN false → kapı ölü kod. */
export function useKvkkOnam() {
  const depo = typeof window !== "undefined" ? window.localStorage : null;
  const [onaylandi, setOnaylandi] = useState(() => onamOku(depo));
  const [acik, setAcik] = useState(false);
  // Onaydan sonra koşulacak dosya. Bu OLMAZSA kullanıcı dosyayı bırakır, onaylar ve
  // hiçbir şey olmaz — sessiz kayıp.
  const bekleyen = useRef(null);

  const gerekli = onamGerekli(DEMO_MODU, onaylandi);

  const onayla = useCallback(() => {
    onamYaz(depo);
    setOnaylandi(true);
    setAcik(false);
    const f = bekleyen.current;
    bekleyen.current = null;
    return f;                      // çağıran bekleyen dosyayı koşar
  }, [depo]);

  const vazgec = useCallback(() => {
    bekleyen.current = null;
    setAcik(false);
  }, []);

  /** Kapıyı aç; varsa dosyayı onay sonrasına sakla. */
  const iste = useCallback((dosya) => {
    bekleyen.current = dosya || null;
    setAcik(true);
  }, []);

  // useMemo ZORUNLU: bu nesne DashboardApp'te `triggerUpload`/`runFileOnamli`
  // useCallback bağımlılığıdır. Her render'da taze literal dönmek o callback'leri de
  // her render'da yeniler ve `React.memo(NeonSidebar)` KIRILIR → canlı akışın her SSE
  // tick'inde (belge başına 20+) kenar çubuğu yeniden render olurdu.
  return useMemo(
    () => ({ gerekli, acik, onayla, vazgec, iste }),
    [gerekli, acik, onayla, vazgec, iste],
  );
}

/** Yükleme ekranındaki kalıcı bilgi notu (kapı DEĞİL — yalnız görünürlük). */
export function KvkkOnamNotu() {
  if (!DEMO_MODU) return null;
  return (
    <div
      role="note"
      style={{
        display: "flex", alignItems: "flex-start", gap: SP.s,
        maxWidth: 560, margin: `0 auto ${SP.l}px`,
        padding: `${SP.s}px ${SP.m}px`,
        background: ALFA(BANT.sari.c), borderRadius: RAD.card,
        ...TYPE.meta, color: DERIN.sari,
      }}
    >
      <Icon.alert style={{ flex: "none", marginTop: 2 }} />
      <span>
        Bu bir <strong>kamuya açık demodur</strong>. Lütfen gerçek kişisel veri içeren belge
        yüklemeyin; örnek/sentetik evrak kullanın.
      </span>
    </div>
  );
}

/** Engelleyici onam modalı. */
export function KvkkOnamModal({ acik, onOnayla, onVazgec }) {
  const [kutucuk, setKutucuk] = useState(false);
  const kutuRef = useRef(null);
  const oncekiOdak = useRef(null);

  useEffect(() => {
    if (!acik) return undefined;
    oncekiOdak.current = document.activeElement;
    setKutucuk(false);
    kutuRef.current?.focus({ preventScroll: true });
    return () => {
      // Kapanışta odağı açtıran öğeye geri ver (klavye kullanıcısı kaybolmasın).
      try { oncekiOdak.current?.focus?.({ preventScroll: true }); } catch { /* öğe gitmiş */ }
    };
  }, [acik]);

  if (!acik) return null;

  const toggle = () => setKutucuk((v) => !v);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: SP.l,
        background: PAL.scrimKoyu,
        animation: "nu-sol .16s var(--ke-ease-out) both",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onVazgec(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kvkk-baslik"
        aria-describedby="kvkk-govde"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onVazgec(); return; }
          odakDongusu(e);
        }}
        style={{
          width: "100%", maxWidth: 520,
          background: PAL.surfPop, border: `1px solid ${PAL.line}`,
          borderRadius: RAD.pop, boxShadow: SH.modal, padding: SP.xl,
          display: "flex", flexDirection: "column", gap: SP.l,
          animation: "nu-rise .16s var(--ke-ease-out) both",
        }}
      >
        <h2 id="kvkk-baslik" style={{ ...TYPE.h2, color: PAL.ink, margin: 0 }}>
          Belge yüklemeden önce
        </h2>

        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: SP.s,
            padding: `${SP.m}px ${SP.l}px`,
            background: ALFA(BANT.sari.c), borderRadius: RAD.card,
            ...TYPE.data, color: DERIN.sari,
          }}
        >
          <Icon.alert style={{ flex: "none", marginTop: 2 }} />
          <span>
            Bu kamuya açık bir <strong>demodur</strong>. Gerçek kişisel veri içeren belge
            yüklemeyin.
          </span>
        </div>

        <div id="kvkk-govde" style={{ ...TYPE.ui, color: PAL.ink2, display: "flex", flexDirection: "column", gap: SP.s }}>
          <p style={{ margin: 0 }}>
            Yüklediğiniz belge yalnızca işlenmek için kullanılır; <strong>veri tabanına
            kaydedilmez</strong> ve işlem bitince bellekten silinir.
          </p>
          <p style={{ margin: 0, ...TYPE.meta, color: PAL.mut2 }}>
            Sistemi denemek için örnek evrakları kullanabilirsiniz. Günlük demo hakkı
            sınırlıdır.
          </p>
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={kutucuk}
          aria-labelledby="kvkk-onam-metin"
          ref={kutuRef}
          onClick={toggle}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
          {...focusRing}
          data-press=""
          style={{
            display: "flex", alignItems: "flex-start", gap: SP.m,
            background: "transparent", border: "none", padding: 0,
            cursor: "pointer", textAlign: "left",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: "none", marginTop: 1, width: 18, height: 18,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              borderRadius: RAD.chip,
              border: `1.5px solid ${kutucuk ? BANT.yesil.c : PAL.inputLine}`,
              background: kutucuk ? BANT.yesil.c : PAL.surf,
              color: PAL.onAccent,
              transition: `background .12s ease, border-color .12s ease, transform .14s ${EASE.out}`,
            }}
          >
            {kutucuk && <Icon.check width={12} height={12} />}
          </span>
          <span id="kvkk-onam-metin" style={{ ...TYPE.ui, color: PAL.ink }}>
            Yükleyeceğim belgede gerçek kişisel veri bulunmadığını onaylıyorum.
          </span>
        </button>

        <div style={{ display: "flex", gap: SP.s, justifyContent: "flex-end" }}>
          <Btn onClick={onVazgec}>Vazgeç</Btn>
          <Btn primary disabled={!kutucuk} onClick={onOnayla}>Devam et</Btn>
        </div>
      </div>
    </div>
  );
}
