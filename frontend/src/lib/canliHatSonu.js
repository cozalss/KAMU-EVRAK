/* Hat sonu künyesi — yalnız durum kaynağından (sahneDurumu) sayar (CLAUDE.md §9-10).
   "hat kapandı" ancak sırada ve çalışan masa kalmadığında basılır; çalışan masa varken
   kapanış beyanı yalan olur (tur 9 jüri gerilemesi). */
export function hatSonuMetni(durumlar, durdu) {
  const say = (...k) => durumlar.filter((x) => k.includes(x)).length;
  const bitti = say("calisti", "gerekmedi");
  if (durdu) return `${bitti} masa işledi · akış kesildi`;
  const isleyen = say("isleniyor");
  if (isleyen) return `${isleyen} masa çalışıyor`;
  const bekleyen = say("bekliyor");
  if (bekleyen) return `${bekleyen} masa sırada`;
  return `${bitti} masa işledi · hat kapandı`;
}
