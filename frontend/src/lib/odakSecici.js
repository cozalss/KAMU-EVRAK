/* Odak döngüsü seçicisi — aria-modal diyaloglarda Tab'ın ilk/son durağını belirler
   (neonUi.odakDongusu). Her parça :not([tabindex="-1"]) taşımalı: roving tabindex kullanan
   diyaloglarda (sekme/şerit içindeki pasif düğmeler) tabindex=-1 öğe ilk/son durak sayılırsa
   Tab odağı diyalog dışına kaçıyordu (tur 3 bulgusu, Mevzuat okuma modalı). */
const PARCALAR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
];
export const ODAKLANIR_SECICI = PARCALAR.map((p) => `${p}:not([tabindex="-1"])`).join(", ");
