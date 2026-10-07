/* CanliBaslik — canlı/sonuç görünümünün yapışkan buzlu-cam başlığı (tur 6'da CanliAjanAkisi'nden
   ayrıldı). Belge kimliği · durum · işaret cetveli · İptal / yeni evrak.
   Tur 6 telefon bulgusu: sağ yuvanın minWidth'i "İptal"i tek başına ikinci satıra düşürüyor,
   başlık ~165px (ekranın %20'si) oluyor, belge adı 9 karaktere kırpılıyordu. Telefonda artık:
   1. satır = başlık + 44px ikon düğmesi (İptal ya da "Yeni evrak" menüsü) · 2. satır = durum ·
   meta · 3. satır = cetvel. Masaüstü düzeni korunur; sağ yuva yalnız orada sabit genişliktedir
   (koşum biterken İptal → iki düğme geçişinde sol kenar kaymasın — tur 4 CLS). */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { PAL, BANT, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, MONO, focusRing, Btn, Icon } from "./neonUi.jsx";
import { Chip } from "./NeonDetayParts.jsx";
import { IsaretCetveli } from "./CanliMetro.jsx";

function IptalDugme({ onCancel, dar }) {
  return (
    <button onClick={onCancel} aria-label="İşlemi iptal et" title="İşlemi iptal et" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: SP.s, padding: dar ? 0 : "8px 12px", width: dar ? 44 : undefined, height: dar ? 44 : undefined, flexShrink: 0, borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: DERIN.kirmizi, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
      <Icon.x width={dar ? 16 : 13} height={dar ? 16 : 13} />{!dar && " İptal"}
    </button>
  );
}

/* Telefonda iki yükleme düğmesi tek "Yeni evrak" menüsünde toplanır (Radix: ok tuşları,
   dış-tık, odak iadesi). "Telefonla yükle" telefondan bakan kişi için anlamsız → yok. */
function YeniEvrakMenu({ onUpload }) {
  const oge = { display: "flex", alignItems: "center", gap: SP.s, padding: "10px 12px", minHeight: 44, borderRadius: RAD.ctl, ...TYPE.ui, color: PAL.ink, cursor: "pointer", outline: "none" };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="Yeni evrak" {...focusRing} data-press=""
          style={{ cursor: "pointer", width: 44, height: 44, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.ink }}>
          <Icon.plus width={16} height={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12}
          style={{ zIndex: 60, minWidth: 200, padding: SP.xs, background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.pop }}>
          <DropdownMenu.Item onSelect={onUpload} style={oge}
            onFocus={(e) => { e.currentTarget.style.background = PAL.hov; }} onBlur={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <Icon.upload width={14} height={14} /> Yeni evrak yükle
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* Durdu hâlinde sağ yuva tek ikincil düğmeye iner (tur 8): görünümün tek primary'si sahnedeki
   "Tekrar dene"dir; yanında iki eşit yükleme düğmesi gözü dağıtıyordu. */
function SagYuva({ busy, dar, durdu, onCancel, onUpload, onTelefon, onSonucAc }) {
  if (onSonucAc) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: dar ? 0 : 320, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <Btn primary onClick={onSonucAc} style={dar ? { minHeight: 44 } : null}>Sonucu aç <Icon.arrow width={14} height={14} /></Btn>
    </div>
  );
  if (dar) return busy ? <IptalDugme onCancel={onCancel} dar /> : <YeniEvrakMenu onUpload={onUpload} />;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: SP.s, minWidth: 320 }}>
      {busy ? <IptalDugme onCancel={onCancel} /> : (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
          {!durdu && <Btn onClick={onTelefon}><Icon.phone width={14} height={14} /> Telefonla yükle</Btn>}
          <Btn onClick={onUpload}><Icon.upload width={14} height={14} /> Yeni evrak yükle</Btn>
        </div>
      )}
    </div>
  );
}

function DurumIkon({ d }) {
  if (d.hata) return <Icon.alert width={12} height={12} />;
  if (d.allDone) return <Icon.check width={12} height={12} />;
  if (d.kosumda) return <Icon.spin width={12} height={12} />;
  return <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.mut2 }} />;
}

/* Sonuç durumunda çip kalkar (büyük hüküm aşağıda — çip tekrarı yasak); tamamlanma bilgisi
   meta satırında sakin bir segment olarak yaşar. Bu segment kapanış geçişinde pusulanın
   "oturduğu" yerdir (view-transition-name: ke-pusula). */
function MetaSatiri({ metaLine, d, dar }) {
  const ayrac = <span style={{ color: PAL.mut3 }}>·</span>;
  return (
    <span style={{ display: "flex", alignItems: "center", flexWrap: dar && !d.sonucGoster ? "nowrap" : "wrap", columnGap: SP.xs, marginTop: SP.xs, ...TYPE.data, color: PAL.mut2, ...TNUM, minWidth: 0, overflow: "hidden" }}>
      {dar && !d.sonucGoster && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap", color: d.chipDerin, fontWeight: 500, flexShrink: 0 }}>
          <DurumIkon d={d} />{d.statusText}{metaLine ? <>&nbsp;{ayrac}</> : null}
        </span>
      )}
      {/* Sonuçta telefonda tür kırpılmaz (tur 6: "Bilgi Edinme Başvur…"): meta satırı kırılır. */}
      {metaLine && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: dar && d.sonucGoster ? "normal" : "nowrap" }}>{metaLine}</span>}
      {d.sonucGoster && d.onayBekliyor && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap", color: DERIN.sari }}>
          {ayrac}<span aria-hidden="true" style={{ display: "flex" }}><Icon.alert width={12} height={12} /></span>Memur onayı bekliyor
        </span>
      )}
      {d.sonucGoster && d.allDone && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap", viewTransitionName: "ke-pusula" }}>
          {ayrac}<span aria-hidden="true" style={{ display: "flex", color: DERIN.yesil }}><Icon.check width={12} height={12} /></span>
          İşlem tamamlandı{d.toplamSn ? ` · ${d.toplamSn}` : ""}
        </span>
      )}
    </span>
  );
}

export default function CanliBaslik({ baslikRef = null, fileLabel, metaLine, d, busy, takili, dar, display, durdu, pct, onCancel, onUpload, onTelefon, onSonucAc = null }) {
  return (
    <header ref={baslikRef} style={{
      padding: dar ? `${SP.s}px ${SP.l}px ${SP.m}px` : `${SP.l}px clamp(${SP.l}px, 2.4vw, ${SP.xxl}px)`,
      position: "sticky", top: 0, zIndex: 20,
      /* OPAK (tur 8): buzlu camın arkasından 96 px rakam ve masa adı gri leke olarak sızıyordu.
         Yükselme yalnız alt hairline + SH.card ile anlatılır. */
      background: PAL.bg,
      borderBottom: `1px solid ${takili ? PAL.lineHi : PAL.line}`,
      boxShadow: takili ? SH.card : "none",
      transition: "box-shadow .16s ease, border-color .16s ease",
    }}>
      <div style={{ maxWidth: 1540, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: dar ? SP.s : SP.l, minHeight: dar ? 44 : 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0, flex: "1 1 0" }}>
            {!dar && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.doc width={18} height={18} /></span>}
            <span style={{ minWidth: 0, flex: dar ? 1 : "0 1 auto" }}>
              <h2 style={{ margin: 0, ...TYPE.h2, fontSize: dar ? 17 : 20, lineHeight: dar ? "22px" : "26px", color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: dar ? "100%" : "min(52vw, 680px)" }}>{fileLabel}</h2>
              <MetaSatiri metaLine={metaLine} d={d} dar={dar} />
            </span>
            {/* Koşum sırasında çip yok (tur 8): canlılık pusula künyesinde ("CANLI · N SN") ve
                cetvelde söyleniyor; beş yerde aynı söz hiyerarşiyi dağıtıyordu. */}
            {!dar && !d.sonucGoster && !d.kosumda && (
              <span style={{ marginLeft: SP.s, flexShrink: 0 }}>
                <Chip c={d.chipRenk} label={`Durum: ${d.statusText}`}><DurumIkon d={d} />{d.statusText}</Chip>
              </span>
            )}
          </div>
          <SagYuva busy={busy} dar={dar} durdu={!!durdu} onCancel={onCancel} onUpload={onUpload} onTelefon={onTelefon} onSonucAc={onSonucAc} />
        </div>
        {/* İŞARET CETVELİ — adım başına bir çentik (graf sırası); sonuçta da durur (kalkınca
            başlık kısalıp sayfa zıplıyordu — tur 4 CLS). Yüzde nötr: kırmızı yalnız hatalı
            masanın çentiğinde (tur 6: üç kırmızı sinyal yan yana hatanın yerini bulanıklaştırıyordu). */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: dar ? SP.s : SP.m }}>
          <IsaretCetveli display={display} durdu={durdu} />
          {/* Düz metin (tnum): NumberFlow geçişinde "%" taban çizgisinden kayıyordu; her adımda dönen
              rakam da sahnenin asıl hareketiyle yarışan gürültüydü. */}
          <span style={{ fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 500, color: PAL.ink2, flexShrink: 0, minWidth: 44, textAlign: "right", whiteSpace: "nowrap", ...TNUM }}>%{pct}</span>
        </div>
      </div>
    </header>
  );
}

