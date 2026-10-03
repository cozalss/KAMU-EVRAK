/* HataSiniri — React hata sınırı (error boundary). Sarılan ağaçta render hatası olursa
   (örn. backend'den beklenmedik şekilde bozuk veri) tüm görünümü düşürmek yerine yalnız
   o bölümü bir "iade fişi" ile değiştirir — demo sigortası. Hata konsola yazılır (sessiz
   yutma yok); sınıf bileşeni zorunlu (React error boundary API'si hook desteklemez).

   Tur 3 (2026-10): tek satırlık gri uyarı → tasarlanmış durum. Fiş antet dilini taşır (mono
   künye + saat), ne olduğunu ve NE YAPILACAĞINI söyler, iki eylem verir: "Yeniden dene"
   (yalnız bu bölümü sıfırlar — veri geçici bozulduysa sayfayı kaybetmeden döner) ve
   "Sayfayı yenile". Teknik ayrıntı mono ve gizlenebilir (<details>, BENCHMARK §4).
   tam: görünüm düzeyinde sarıldığında (DashboardApp) fiş sayfa ortasında, daha geniş. */
import { Component } from "react";
import { PAL, DERIN, BANT, ALFA, MONO, TYPE, TNUM, RAD, SP, SH, Icon, Btn } from "./neonUi.jsx";

const saat = () => new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default class HataSiniri extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null, zaman: "" };
    this.sifirla = () => this.setState({ hata: null, zaman: "" });
  }

  static getDerivedStateFromError(hata) {
    return { hata, zaman: saat() };
  }

  componentDidCatch(hata, bilgi) {
    console.warn("Bölüm render hatası — sınırda yakalandı", hata, bilgi?.componentStack);
  }

  render() {
    const { hata, zaman } = this.state;
    if (!hata) return this.props.children;
    const { baslik = "Bu bölüm gösterilemedi", tam = false } = this.props;
    const teknik = `${hata?.name || "Error"}: ${String(hata?.message || hata).slice(0, 400)}`;
    return (
      <div style={tam ? { display: "grid", placeItems: "center", minHeight: "70vh", padding: SP.xl } : { margin: SP.xl }}>
        <section role="alert" aria-labelledby="ke-hata-baslik"
          style={{ position: "relative", width: "100%", maxWidth: tam ? 560 : 720, background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${BANT.sari.c}`, borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.l}px ${SP.xl}px ${SP.xl}px`, animation: "nu-rise .24s var(--ke-ease-out) both" }}>
          <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.m, textTransform: "uppercase" }}>
            <span>Hata kaydı</span>
            <span style={{ flex: 1, height: 1, background: PAL.line }} />
            <span style={TNUM}>{zaman}</span>
          </div>
          <div style={{ display: "flex", gap: SP.m, alignItems: "flex-start", marginTop: SP.m }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0, width: 32, height: 32, borderRadius: RAD.ctl, background: ALFA(BANT.sari.c), color: DERIN.sari }}>
              <Icon.alert width={16} height={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 id="ke-hata-baslik" style={{ margin: 0, ...TYPE.h2, fontSize: 18, lineHeight: "24px", color: PAL.ink }}>{baslik}</h2>
              <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.ui, color: PAL.mut2, maxWidth: 520 }}>
                Beklenmedik bir veri biçimi bu bölümün çizilmesini durdurdu. Kayıtlarınız ve
                sayfanın geri kalanı etkilenmedi. Önce bölümü yeniden deneyin; sürerse sayfayı yenileyin.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: SP.l, paddingLeft: "clamp(0px, calc((100vw - 480px) * .5), 44px)" }}>
            <Btn onClick={this.sifirla}><Icon.undo />Yeniden dene</Btn>
            <Btn onClick={() => window.location.reload()}>Sayfayı yenile</Btn>
          </div>
          <details style={{ marginTop: SP.l, paddingLeft: "clamp(0px, calc((100vw - 480px) * .5), 44px)" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: SP.xs, borderRadius: RAD.chip, padding: "2px 4px", margin: "0 -4px", ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" className="mev-chevron" style={{ display: "flex", transition: "transform .14s ease-out" }}><Icon.okSag width={12} height={12} /></span>Teknik ayrıntı
            </summary>
            <code style={{ display: "block", marginTop: SP.s, padding: "8px 10px", borderRadius: RAD.ctl, background: PAL.surf2, border: `1px solid ${PAL.line}`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.ink2, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{teknik}</code>
          </details>
        </section>
      </div>
    );
  }
}
