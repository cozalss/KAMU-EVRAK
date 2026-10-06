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
import { SP, Btn } from "./neonUi.jsx";
import { HataFisi } from "./kabukAtomlari.jsx";

/* Tur 6: fiş çizimi ortak HataFisi atomuna taşındı (sistemde tek hata lehçesi). Bu bileşen yalnız
   React hata sınırı mantığını taşır. Render hatası geçici veri bozulmasıdır → ton "uyarı" (sarı). */
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
        <HataFisi ton="uyari" baslik={baslik} zaman={zaman} onYenidenDene={this.sifirla} teknik={teknik}
          ikincil={<Btn onClick={() => window.location.reload()}>Sayfayı yenile</Btn>}
          style={{ maxWidth: tam ? 560 : 720 }}>
          Beklenmedik bir veri biçimi bu bölümün çizilmesini durdurdu. Kayıtlarınız ve sayfanın geri
          kalanı etkilenmedi. Önce bölümü yeniden deneyin; sürerse sayfayı yenileyin.
        </HataFisi>
      </div>
    );
  }
}
