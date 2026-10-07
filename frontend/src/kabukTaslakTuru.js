/* kabukTaslakTuru — canlı akıştaki yazı türü seçimi + dayanak (mevzuat kutucuğu) kurgusu.
   DashboardApp'ten ayrıldı (tur 8, dosya < 800 satır kuralı); davranış BİREBİR aynı — yalnız
   kapsam değişti. Girdi: usePipeline'ın result/evrakText/applyTaslak'ı + showToast. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createSekans, sonrakiSecim } from "./lib/dayanakSecim.js";

export function useTaslakTuru({ result, evrakText, applyTaslak, showToast }) {
  // ---- Yazı türü seçimi (resmî yazı türleri: üst yazı / cevabi / bilgilendirme / alternatif tür) ----
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
          bilgi_unsurlari: result.bilgi_unsurlari || {}, hedef_birim: result.hedef_birim || "", evrak_turu: result.evrak_turu || "",
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
          hedef_birim: altTalep.birim || "", evrak_turu: result?.evrak_turu || "",
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

  return { turUretiliyor, taslakOnerilenRef, altDraftRef, seciliMevzuat, dayanakUretiliyor, secMevzuat, secTaslakTuru, uretAltTaslakTuru };
}
