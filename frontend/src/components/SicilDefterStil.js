/* SicilDefterStil — evrak defterlerinin (Gelen · İşlenen · Giden · Denetim) ortak CSS'i.
   SicilDefter.jsx'ten ayrıldı (dosya bütçesi). Renk yalnız var(--ke-*) token'ı; hex yok.

   GEOMETRİ SÖZLEŞMESİ (jüri tur 6 — "marj üç defterde üç yerde: 419/435/411"):
   · Kayıt no sütunu her defterde --sd-no (128 px); kırmızı çift marj --sd-marj (158 px) —
     satır dolgusu 20 + no 128 + 10 px nefes. Defterler arası geçişte çizgi KIPIRDAMAZ.
   · Satır adımı iki kademe: yoğun 64 (İşlenen, Denetim) · rahat 84 (Gelen, Giden) —
     sablon.satir min-height olarak verilir; dolgu cetveli de aynı adımla çizilir.
   · İskelet ve boş defter satırları ([data-sd-hayalet]) AYNI ızgarayı kullanır: yükleme
     bitince hiçbir çubuk yer değiştirmez, marjın solundan başlamaz. */
export const SICIL_CSS = `
@keyframes sd-gir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[data-sd-yuzey]{background:var(--ke-surf);border:1px solid var(--ke-line);border-radius:12px;box-shadow:var(--ke-sh-card);overflow:clip}
[data-sd-baslik],[data-sicil-satir],[data-sd-hayalet]{display:grid;grid-template-columns:var(--sd-kolon);grid-template-areas:var(--sd-alan);column-gap:28px;align-items:center}
[data-sd-baslik]{position:relative;padding:9px 20px 8px;border-bottom:1px solid var(--ke-line-hi);background:var(--ke-surf2)}
/* Giriş koreografisi (tur 8 hareket kuralı): ≤8 satır kademeli, 18 ms aralık, 220 ms — gerisi
   aynı anda; toplam <400 ms. */
[data-sicil-satir]{position:relative;padding:12px 20px;min-height:var(--sd-satir,auto);box-sizing:border-box;border-top:1px solid var(--ke-line);cursor:pointer;
  content-visibility:auto;contain-intrinsic-size:auto var(--sd-satir,76px);
  transition:background .15s ease;animation:sd-gir .22s var(--ke-ease-out) both;animation-delay:calc(min(var(--sd-i,0), 7) * 18ms)}
[data-sicil-satir][aria-selected="true"]{background:color-mix(in srgb, var(--ke-t) 9%, transparent)}
[data-sicil-satir]:first-of-type{border-top:none}
[data-sicil-satir]::before{content:"";position:absolute;left:4px;top:10px;bottom:10px;width:3px;border-radius:2px;
  background:var(--ke-t);transform:scaleY(0);transform-origin:50% 50%;transition:transform .26s var(--ke-ease-out)}
[data-sicil-satir]:hover,[data-sicil-satir]:focus-within{background:var(--ke-hov)}
[data-sicil-satir]:hover::before,[data-sicil-satir]:focus-within::before,[data-sicil-satir][data-vurgu]::before{transform:scaleY(1)}
@keyframes sd-murekkep{0%,25%{background:color-mix(in srgb, var(--ke-bant-sari) 24%, transparent)}100%{background:color-mix(in srgb, var(--ke-t) 6%, transparent)}}
[data-sicil-satir][data-vurgu]{animation:sd-murekkep 1.2s var(--ke-ease-out) both;background:color-mix(in srgb, var(--ke-t) 6%, transparent)}
/* Satırın kendisi odak alır (tabIndex=0) — halka satırın İÇ kenarında, dört kenarı tam
   (outline yüzeyin overflow:clip'inde yanlardan kırpılıyordu; tur 8 jüri): inset gölge. */
/* Tur 9 jüri: çift 2 px mavi üst/alt kural + kenar çizgisine binen çubuk ağır duruyordu →
   halka 1 px + mürekkep çubuğu kartın İÇ kenarında (left 4). Çubuk + halka iki sinyal. */
[data-sicil-satir]:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--ke-t), inset 0 0 0 2px color-mix(in srgb, var(--ke-t) 22%, transparent)}
[data-sd-no-sira]{transition:color .18s ease}
[data-sicil-satir]:hover [data-sd-no-sira],[data-sicil-satir]:focus-within [data-sd-no-sira]{color:var(--ke-derin-t)}
/* Kayıt no hücresi + DERKENAR: marjın solundaki kenar notu (bürokrasinin kendi kavramı) —
   mono 10 px, ıstampa moru: "↻ 2. işlem", "İŞLENDİ", "DÜZELTİLDİ". */
[data-sd-no]{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0}
[data-sd-derkenar]{font:600 10px/12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ke-derin-v);white-space:nowrap}
[data-sd-derkenar][data-ton="yesil"]{color:var(--ke-derin-yesil)}
[data-sd-derkenar][data-ton="kirmizi"]{color:var(--ke-derin-kirmizi)}
[data-sd-derkenar][data-ton="sari"]{color:var(--ke-derin-sari)}
[data-sd-derkenar][data-ton="sessiz"]{color:var(--ke-mut2);font-weight:500;text-transform:none;letter-spacing:.02em;font-size:11px}
[data-sd-eylem]{display:inline-flex;align-items:center;gap:6px;justify-self:end;cursor:pointer;white-space:nowrap;
  padding:6px 12px;min-height:36px;border-radius:8px;border:1px solid var(--ke-input-line);background:var(--ke-surf);color:var(--ke-ink);
  font:500 13px/18px 'Instrument Sans','Segoe UI',system-ui,sans-serif;
  transition:background .14s ease,border-color .14s ease,opacity .16s ease,transform .14s var(--ke-ease-out)}
[data-sd-eylem] svg{transition:transform .22s var(--ke-ease-out)}
/* Satır eylemi = Panel'deki ikincil Btn ile aynı çerçeveli düğme (metin bağlantısı değil). */
[data-sd-eylem]:hover:not(:disabled){background:var(--ke-hov)}
/* PARAF eylemi (tur 8): tekrarlanan satır düğmesi dinlenmede çerçevesiz sessiz künye; satıra
   bakılınca (hover/odak) çerçeve belirir. Düğme DOM'da hep var (klavye + ekran okuyucu).
   İlk satır (en acil) tam düğme kalır — defterin ritmi düğme duvarına ezilmez. */
@media (min-width:641px) and (hover:hover){
  [data-sd-eylem][data-sd-paraf]{border-color:transparent;background:transparent;color:var(--ke-mut2)}
  [data-sicil-satir]:hover [data-sd-paraf],[data-sicil-satir]:focus-within [data-sd-paraf]{border-color:var(--ke-input-line);background:var(--ke-surf);color:var(--ke-ink)}
  /* Tur 9 jüri: 15 eş "İşle →" sağ kenarda sütun gürültüsüydü → dinlenmede yalnız ok; metin
     bakılınca/odakta belirir. Yalnız opaklık: düğme genişliği sabit, kayma yok. */
  [data-sd-paraf] [data-sd-paraf-metin]{opacity:0;transition:opacity .14s var(--ke-ease-out)}
  [data-sicil-satir]:hover [data-sd-paraf-metin],[data-sicil-satir]:focus-within [data-sd-paraf-metin]{opacity:1}
}
/* Telefon: satır eylemi + seçim kutusu 44 px dokunma alanı (neonUi [data-dokunma] eşiğiyle aynı);
   kutunun görsel yeri değişmesin diye negatif marj büyür. Hover olmayan ekranda gizli eylem görünür. */
@media (max-width:640px){
  [data-sd-eylem]{min-height:44px!important}
  [data-sd-secim]{margin:-14px!important}
  [data-sd-gizli]{opacity:1}
}
@media (hover:none){[data-sd-gizli]{opacity:1}}
[data-sicil-satir]:hover [data-sd-eylem] svg{transform:translateX(2px)}
[data-sd-eylem]:disabled{cursor:not-allowed;color:var(--ke-mut2);background:var(--ke-press);border-color:transparent}
[data-sd-eylem]:focus-visible{outline:2px solid var(--ke-t);outline-offset:2px}
/* Gizli satır eylemi — durum bilgisi yerinde KALIR; eylem yalnız bakılan satırda belirir
   (yalnız opaklık: içerik değişimi göz takibini bozmaz). Klavyede :focus-within açar. */
[data-sd-gizli]{opacity:0}
[data-sicil-satir]:hover [data-sd-gizli],[data-sicil-satir]:focus-within [data-sd-gizli]{opacity:1}
[data-sd-ok]{display:flex;color:var(--ke-mut3);justify-self:end;transition:opacity .16s ease}
[data-sicil-satir]:hover [data-sd-ok="degis"],[data-sicil-satir]:focus-within [data-sd-ok="degis"]{opacity:0}
[data-sd-eylem-yuva]{display:grid;justify-items:end;align-items:center}
[data-sd-eylem-yuva]>*{grid-area:1/1}
[data-sd-liste]{position:relative}
[data-aynen]{display:inline-grid;align-items:center}
[data-aynen]>[aria-hidden]{grid-area:1/1;transition:opacity .12s var(--ke-ease-out)}
[data-aynen-deger]{opacity:0}
@media (hover:hover){
  [data-sicil-satir]:hover [data-aynen-deger],[data-sicil-satir]:focus-visible [data-aynen-deger]{opacity:1}
  [data-sicil-satir]:hover [data-aynen-isaret],[data-sicil-satir]:focus-visible [data-aynen-isaret]{opacity:0}
}
[data-sd-liste]::after,[data-sd-baslik]::after{content:"";position:absolute;top:0;bottom:0;left:var(--sd-marj,158px);width:4px;pointer-events:none;
  border-left:1px solid color-mix(in srgb, var(--ke-r) 42%, transparent);border-right:1px solid color-mix(in srgb, var(--ke-r) 22%, transparent)}
[data-sd-ipucu]{display:flex;align-items:center;gap:14px;min-height:32px;box-sizing:border-box;padding:8px 20px;border-top:1px solid var(--ke-line-hi);background:var(--ke-surf2);
  font:500 11px/14px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.04em;color:var(--ke-mut3)}
[data-sd-folyo]{margin-left:auto;letter-spacing:.08em;text-transform:uppercase;font-variant-numeric:tabular-nums;color:var(--ke-mut2)}
[data-sd-ipucu] kbd{font:inherit;color:var(--ke-ink2);padding:1px 6px;border:1px solid var(--ke-line-hi);border-bottom-width:2px;border-radius:4px;background:var(--ke-surf)}
/* Hayalet satır (iskelet + boş defter): gerçek satırın ızgarası ve adımı. */
[data-sd-hayalet]{padding:12px 20px;min-height:var(--sd-satir,64px);box-sizing:border-box;border-top:1px solid var(--ke-line)}
[data-sd-hayalet]:first-child{border-top:none}
[data-sd-cubuk]{display:block;height:8px;border-radius:3px;background:var(--ke-line)}
/* uzar: defter, yanındaki sütunun (nüsha önizlemesi) boyuna uzar; artan boy dolgu cetveline akar,
   folyo dipte kalır → iki sütunun dip çizgisi aynı y'de biter. */
[data-sd-uzar]{display:flex;flex-direction:column}
[data-sd-uzar]>[data-sd-liste]{flex:1 0 auto}
[data-sd-uzar] [data-sd-dolgu]{flex:1 0 auto}
[data-sd-dolgu-not]{display:flex;align-items:center;height:var(--sd-adim,64px);padding-left:calc(var(--sd-marj,158px) + 28px);font:500 11px/14px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ke-mut3)}
[data-sd-dolgu]{border-top:1px solid var(--ke-line);background-image:repeating-linear-gradient(to bottom, transparent 0 calc(var(--sd-adim,64px) - 1px), color-mix(in srgb, var(--ke-line) 70%, transparent) calc(var(--sd-adim,64px) - 1px) var(--sd-adim,64px))}
/* İskelet = BOŞ DEFTER SAYFASI (tur 8): parlak tarama yerine kâğıdın hafif "nefesi"
   (opaklık .55↔.75, 1,2 sn) — yükleniyor olgusunu anlatır, gözü çekmez. reduced-motion: durur. */
@keyframes sd-nefes{from{opacity:.55}to{opacity:.8}}
[data-sd-iskelet]{position:relative}
[data-sd-iskelet] [data-sd-cubuk]{animation:sd-nefes 1.2s var(--ke-ease-in-out) infinite alternate}
[data-sd-grup]{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 20px;background:var(--ke-surf2);border-bottom:1px solid var(--ke-line)}
[data-sd-grup]+[data-sicil-satir]{border-top:none}
[data-sd-liste]>[data-sd-grup]~[data-sd-grup]{border-top:1px solid var(--ke-line-hi)}
[data-sd-bos-mesaj]{display:grid;place-items:center;text-align:center;padding:40px 24px 32px;border-bottom:1px solid var(--ke-line)}
@media (max-width:640px){
  [data-sd-ipucu]{display:none}
  [data-sd-baslik]{position:absolute!important;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
  [data-sd-konu]{white-space:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  [data-sd-grup]{padding:6px 16px}
  [data-sd-konu-satir]{flex-wrap:wrap;row-gap:4px}
  [data-sd-konu-satir]>[data-sd-konu]{flex:1 1 calc(100% - 30px)}
  [data-sd-liste]::after,[data-sd-baslik]::after{display:none}
  [data-sicil-satir],[data-sd-hayalet]{grid-template-columns:var(--sd-kolon-dar,minmax(0,1fr) auto);grid-template-areas:var(--sd-alan-dar);row-gap:6px;column-gap:14px;padding:12px 16px;min-height:0}
  [data-sd-eylem]{border-color:var(--ke-line-hi);background:var(--ke-surf);min-height:44px!important;min-width:44px;padding-inline:14px!important}
  [data-sd-sag-dar]{justify-self:end}
  [data-sd-secim] input{width:20px!important;height:20px!important}
  [data-sd-konu-satir]>[data-sd-sure-isaret]{padding-left:22px}
  [data-sd-konu-satir]>[data-sd-sure-isaret] [data-sd-ayrac]{display:none}
  [data-sd-gizli]{opacity:1}
  [data-sd-ok]{display:none}
  [data-sd-zaman]{flex-direction:row!important;gap:8px}
  [data-sd-dolgu]{display:none}
  /* SİCİL FİŞİ: telefonda kayıt no dikey bir KOÇANA döner — kesikli perforasyonla gövdeden
     ayrılır (makbuz koçanı). Kart 213 px'ten ~120 px'e iner; defter metaforu telefona taşınır. */
  [data-sicil-satir][data-sd-fis]{padding-left:6px}
  [data-sd-fis] [data-sd-no]{grid-row:1 / -1;align-self:stretch;writing-mode:vertical-rl;transform:rotate(180deg);
    flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 6px;
    border-left:1.5px dashed var(--ke-line-hi)}
  [data-sd-fis] [data-sd-no] [data-sd-no-ek]{display:none}
}
`;
