/* AltTaslakPager — çok-konulu evrakta N ayrı birim taslağını TEK TEK gösterir (grid'in yerini
   aldı, 2026-07-15: kullanıcı isteği — N kart alt alta/yan yana uzun scroll yaratıyordu).
   Sol/sağ ok butonları AYRI bir üst satırda DEĞİL — her AltTaslakKarti'nin KENDİ başlık
   satırında yaşar (kullanıcı isteği: kartın dış kutusu Kaynak belge/Hüküm kartıyla aynı y'de
   başlamalı — "hizasında olmalı"; ok satırı araya girince bu hizayı bozuyordu). ←/→ tuşu da
   aynı şekilde çalışır.

   Kritik karar: TÜM AltTaslakKarti'lar mounted KALIR (grid'deki gibi), yalnız aktif olmayanlar
   display:none ile gizlenir. key ile remount ETMEK karar/rozet durumunu kaybettirirdi — onay/red
   AltTaslakKarti'nin YEREL state'i (bkz. o dosyadaki durum useState); pager'da ileri-geri gidip
   gelince "gönderildi" rozetinin kaybolması ciddi bir regresyon olurdu. display:none ayrıca
   a11y ağacından/tab sırasından otomatik çıkar.

   DİKKAT — giriş animasyonu YOK (bilerek): `animation: nu-rise ... both` denendi ama `both`
   fill-mode'u animasyon bitince bile `transform: translateY(0)` bırakıyor — bu, position:fixed
   torunlar (BelgeModal A4 büyüteci) için YENİ bir containing-block yaratıp modalı bu sarmalayıcı
   div'in İÇİNE hapsediyordu (ekranın ortasına değil, sütunun içine açılıyordu — gerçek bulgu).
   CSS transform (animasyon üzerinden de olsa) position:fixed'i miras KESER; bu yüzden bu
   sarmalayıcıya ASLA transform/animation eklenmesin. */
import { useRef } from "react";
import AltTaslakKarti from "./AltTaslakKarti.jsx";

export default function AltTaslakPager({ altTaslaklar, idx, onIdx, onTurUret, onKarar, onDuzenle }) {
  const son = altTaslaklar.length - 1;
  const guvenliIdx = Math.min(Math.max(0, idx), Math.max(0, son));

  // ←/→ yalnız bu bölge (veya bir çocuğu) odaktaysa çalışır — document-geneli dinleyici DEĞİL
  // (bu bir modal değil, sayfa-içi bölge; başka yerdeki gezinmeyi ele geçirmemeli). Native
  // <select> (TurSecici) veya input/textarea odaktaysa ok tuşları kendi davranışına bırakılır.
  const canli = useRef({});
  canli.current = { guvenliIdx, son, onIdx };
  const tusla = (e) => {
    const etiket = e.target?.tagName;
    if (etiket === "SELECT" || etiket === "INPUT" || etiket === "TEXTAREA") return;
    const c = canli.current;
    if (e.key === "ArrowLeft" && c.guvenliIdx > 0) { e.preventDefault(); c.onIdx(c.guvenliIdx - 1); }
    else if (e.key === "ArrowRight" && c.guvenliIdx < c.son) { e.preventDefault(); c.onIdx(c.guvenliIdx + 1); }
  };

  if (son < 0) return null;

  return (
    <div role="group" aria-label={`Taslak gezinme — ${guvenliIdx + 1} / ${altTaslaklar.length}`} onKeyDown={tusla}>
      {altTaslaklar.map((x, i) => (
        <div key={x.sira} aria-hidden={i !== guvenliIdx} style={{ display: i === guvenliIdx ? "block" : "none" }}>
          <AltTaslakKarti altTalep={x.a} sira={i + 1}
            onPrev={() => onIdx(guvenliIdx - 1)} prevDisabled={guvenliIdx === 0}
            onNext={() => onIdx(guvenliIdx + 1)} nextDisabled={guvenliIdx === son}
            onTurUret={(tur) => onTurUret(x.a, tur)}
            onOnaylaGonder={(metin, tur) => onKarar(x.a, metin, "onayla", x.sira, tur)}
            onReddet={(metin, tur) => onKarar(x.a, metin, "reddet", x.sira, tur)}
            onDuzenle={(metin, tur) => onDuzenle(x.a, metin, tur, x.sira)} />
        </div>
      ))}
    </div>
  );
}
