import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Sınıf birleştirici — shadcn/ui deseninin standart yardımcısı.
 *
 * İKİ İŞ YAPAR:
 *  1. `clsx`: koşullu sınıfları düzleştirir (`cn("a", kosul && "b", {c: kosul2})`).
 *  2. `twMerge`: ÇAKIŞAN Tailwind utility'lerinden SONUNCUYU tutar. Bu olmadan
 *     `cn("p-l", "p-xl")` her ikisini de bırakır ve hangisinin kazandığı CSS sırasına
 *     kalır — bileşene dışarıdan `className` geçirmek işe yaramaz hâle gelirdi.
 *
 * NOT: bu proje çoğunlukla SATIR-İÇİ stil kullanır (neonUi atomları). `cn` yalnız
 * sınıf tabanlı (shadcn/Aceternity kökenli) bileşenler için; satır-içi stilli bir
 * bileşeni sınıfa çevirmek için bahane DEĞİLDİR.
 *
 * @param {...any} girdiler
 * @returns {string}
 */
export function cn(...girdiler) {
  return twMerge(clsx(girdiler));
}
