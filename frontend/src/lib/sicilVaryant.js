/* sicilVaryant — aynı koşum tespiti + yazı türü varyant birikimi. DashboardApp'in
   result-effect'i ve İşlenen evrak sicil gruplaması bu çekirdeği paylaşır: belge başına
   TEK sicil satırı, denenen yazı türleri satırın İÇİNDE seçenek olarak birikir. */

/* usePipeline shallow-merge iç nesne referanslarını korur; farklı koşumlar taze JSON.parse
   nesneleri taşıdığından referans eşitliği koşumlar arası imkânsız. islem_id KOŞUL DEĞİL —
   persist gecikirken (~20-27 sn) tür değiştiren memur her seçimde yeni satır açıyordu.
   İki tarafta da iç nesne yoksa undefined===undefined yanlış birleşmesin diye truthiness şartı. */
export const ayniKosumMu = (onceki, res) =>
  !!(onceki && res && (onceki.denetim_izi || onceki.bilgi_unsurlari)
    && res.denetim_izi === onceki.denetim_izi
    && res.bilgi_unsurlari === onceki.bilgi_unsurlari);

export const varyantOf = (res) => (res?.yazi_taslak_md
  ? { yazi_turu: res.yazi_turu, yazi_taslak_md: res.yazi_taslak_md, format_uyumlu: res.format_uyumlu }
  : null);

/* Sicil satırına yeni sonucun taslağını işle: liste boşsa satırın özgün taslağı tohumlanır;
   aynı tür yerinde güncellenir (dayanak eklemesi seçenek sayısını artırmaz), yeni tür eklenir. */
export const varyantBirlestir = (satir, res) => {
  const tohum = varyantOf(satir.result);
  const taban = satir.varyantlar?.length ? satir.varyantlar : (tohum ? [tohum] : []);
  const yeni = varyantOf(res);
  if (!yeni) return taban;
  const i = taban.findIndex((v) => v.yazi_turu === yeni.yazi_turu);
  return i >= 0 ? taban.map((v, j) => (j === i ? yeni : v)) : [...taban, yeni];
};

/* Geçmişi belge başına TEK sicil satırına indir: aynı koşumun kayıtları islem_id YA DA
   denetim hash'i üzerinden eşleşir — persist ile zenginleşen en yeni satır islem_id
   taşırken eski yinelenenler yalnız hash taşıyabilir, iki anahtar da temsilciye bağlanır.
   history en-yeni-önce gelir → temsilci = en güncel karar durumunu taşıyan satır; yinelenen
   satırların taslakları temsilcinin varyant listesine katılır (tür zaten varsa en yenisi kalır). */
export const sicilGrupla = (history) => {
  // Denetim hash'i İÇERİKTEN türer: aynı evrak iki kez işlenince iki AYRI işlem aynı son_hash'i
  // taşır. Hash yalnız islem_id'si olmayan (persist öncesi) satırı bağlamak içindir — iki farklı
  // islem_id hash'te çakışsa da ayrı sicil kaydıdır (tur4 bulgusu: 7 işlem 3 satıra iniyor,
  // Panel "7" / İşlenen "3 kayıt" çelişiyordu).
  const islemRep = new Map();
  const hashRep = new Map();
  const out = [];
  for (const h of history) {
    const id = h.result?.islem_id || null;
    const hash = h.result?.denetim_izi?.son_hash || null;
    const varyant = varyantOf(h.result);
    const adayHash = hash ? hashRep.get(hash) : null;
    const rep = (id && islemRep.get(id))
      || (adayHash && (!id || !adayHash.result?.islem_id) ? adayHash : null);
    if (rep) {
      if (varyant && !rep.varyantlar.some((v) => v.yazi_turu === varyant.yazi_turu)) rep.varyantlar.push(varyant);
      if (id) islemRep.set(id, rep);
      continue;
    }
    const satir = { ...h, varyantlar: h.varyantlar?.length ? [...h.varyantlar] : (varyant ? [varyant] : []) };
    if (id) islemRep.set(id, satir);
    if (hash && !hashRep.has(hash)) hashRep.set(hash, satir);
    out.push(satir);
  }
  return out;
};
