/* gonderimTarihi — yazının tarihi ile gönderim günü aynı mı? TEK yüklem.

   Jüri tur 8 (yüksek): karar fişi "Gönderim kontrolü" tarih satırını yalnız doluluğa göre ✓
   sayıyor, onay fişi aynı tarihi "bugünden farklı" diye boş halkayla işaretliyordu — aynı künyeye
   iki yüzey iki hüküm. Artık ikisi de bu modülü okur (TaslakKararFisi · GonderimOnayFisi).
   Saf işlev; DOM/React yok. */

/** Bugünün tarihi, tr-TR gg.aa.yyyy. */
export const bugunTarihi = (simdi = new Date()) =>
  simdi.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** "3.10.2026" / "03.10.2026" / "03/10/2026" aynı gün sayılsın — yalnız rakam üçlüsü. */
export const gunAnahtari = (s) => {
  const m = String(s || "").match(/(\d{1,2})\D(\d{1,2})\D(\d{4})/);
  return m ? `${+m[1]}.${+m[2]}.${m[3]}` : "";
};

/** Yazının tarihi okunabiliyor VE bugünden farklıysa true; tarih yok/okunamıyorsa false. */
export function tarihFarkli(tarih, simdi = new Date()) {
  const a = gunAnahtari(tarih);
  return !!a && a !== gunAnahtari(bugunTarihi(simdi));
}

/** Künye tarih satırının hükmü: "tamam" | "eksik" (yok) | "farkli" (bugünden farklı). */
export function tarihHukmu(tarih, simdi = new Date()) {
  if (!String(tarih || "").trim()) return "eksik";
  return tarihFarkli(tarih, simdi) ? "farkli" : "tamam";
}
