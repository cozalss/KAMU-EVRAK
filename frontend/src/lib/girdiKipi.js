/* girdiKipi — son kullanıcı girdisinin türü (tur 6, A-kabuk). Kip açılırken odak nereye gider
   kararı için: klavyeyle açıldıysa kapat düğmesine (halka görünür, gezinme oradan sürer); fare/
   dokunmayla açıldıysa diyalog kabının kendisine (tabindex=-1, halka çizilmez). Chrome,
   menü öğesinden programatik odak taşınınca :focus-visible'ı açık bırakıyordu — fare tıklaması
   sonrası kapat düğmesinde halka beliriyordu (jüri). Saf modül değişkeni; dinleyiciler yakalama
   evresinde, tek sefer kurulur. */
let son = "klavye";

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { son = "isaret"; }, true);
  window.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) son = "klavye"; }, true);
}

/** @returns {boolean} son girdi fare/dokunma mıydı */
export const sonGirdiIsaretMi = () => son === "isaret";
