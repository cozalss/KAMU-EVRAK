/* HataSiniri — React hata sınırı (error boundary). Sarılan ağaçta render hatası olursa
   (örn. backend'den beklenmedik şekilde bozuk veri) tüm görünümü düşürmek yerine yalnız
   o bölümü sakin bir uyarıyla değiştirir — demo sigortası. Hata konsola yazılır (sessiz
   yutma yok); sınıf bileşeni zorunlu (React error boundary API'si hook desteklemez). */
import { Component } from "react";
import { PAL, DERIN, TYPE, RAD, SP, Icon } from "./neonUi.jsx";

export default class HataSiniri extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null };
  }

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  componentDidCatch(hata, bilgi) {
    console.warn("Bölüm render hatası — sınırda yakalandı", hata, bilgi?.componentStack);
  }

  render() {
    if (this.state.hata) {
      return (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: SP.s, margin: SP.xl, padding: SP.l, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>
          <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: DERIN.sari }}><Icon.alert width={16} height={16} /></span>
          <span style={{ ...TYPE.data, color: PAL.mut2 }}>
            <strong style={{ color: PAL.ink2, fontWeight: 600 }}>{this.props.baslik || "Bu bölüm gösterilemedi"}</strong>
            {": "}beklenmedik veri nedeniyle görselleştirme atlandı. İşlem sonucu ve sayfanın geri kalanı etkilenmez; ayrıntı tarayıcı konsolunda.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
