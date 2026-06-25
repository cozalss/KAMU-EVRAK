/* ADALET /sor — repo-ilhamı paneller (özgün uyarlama).

   - AgentTrace:  vercel/ai-chatbot reasoning.tsx + morphic collapsible-message
                  → ADALET'in 7-ajan + Doğrulama farkını gösteren açılır şeffaflık
                  paneli (claims + debate notes). Kimsede yok; jüri/yarışma "wow".
   - PredictionCard: 8. ajan (Tahmin) — geçmiş Yargıtay'a dayalı istatistiksel
                  tahmin. Disclaimer ZORUNLU (mahkeme garantisi değil).
   - ThinkingSkeleton: vercel shimmer — draft hazırlanırken cevabın yerini tutar. */
import React, { useState, useId } from "react";
import { Icon } from "./icons.jsx";

/* ---------- Cevap altı sade bağlantı satırı (Kaynaklar / İlgili Kararlar) ----------
   deep-research: kalibre-olmayan "%X güven" stat-kartı KALDIRILDI (net zararlı). Yerine
   düşük-gürültülü, tıklanınca yan paneli açan sade metin-bağlantıları (Perplexity-vari
   "toplu kaynak"). Kaynak/karar yoksa hiç render etmez. */
export function AnswerFooter({ sourceCount = 0, onOpenSources, caseCount = 0, onOpenCases }) {
  if (sourceCount <= 0 && caseCount <= 0) return null;
  return (
    <div className="answer-footer" role="group" aria-label="Kaynaklar ve ilgili kararlar">
      {sourceCount > 0 && (onOpenSources ? (
        <button type="button" className="af-link" onClick={onOpenSources}
          aria-label={`${sourceCount} kaynak — yan panelde göster`}>
          <Icon.book aria-hidden="true" /> Kaynaklar <span className="af-n">{sourceCount}</span>
        </button>
      ) : (
        // callback yoksa düz metin (pill/buton görünümü VERME → yanıltıcı etkileşim sinyali yok, WCAG 4.1.2)
        <span className="af-static"><Icon.book aria-hidden="true" /> Kaynaklar: {sourceCount}</span>
      ))}
      {caseCount > 0 && (onOpenCases ? (
        <button type="button" className="af-link" onClick={onOpenCases}
          aria-label={`${caseCount} ilgili karar — yan panelde göster`}>
          <Icon.scale aria-hidden="true" /> İlgili Kararlar <span className="af-n">{caseCount}</span>
        </button>
      ) : (
        <span className="af-static"><Icon.scale aria-hidden="true" /> İlgili Kararlar: {caseCount}</span>
      ))}
    </div>
  );
}

/* ---------- Ajan-izi / doğrulama şeffaflık paneli (açılır) ---------- */
export function AgentTrace({ claims, debateNotes, retryCount, sourceCount, domain, prediction }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();  // a11y (#37): toggle ↔ açılan bölge ilişkilendirmesi (aria-controls)
  const list = claims || [];
  const total = list.length;
  const okCount = list.filter((c) => c.verified).length;

  // Gösterilecek bir şey yoksa render etme (DRY/temizlik). Tahmin de progressive-disclosure
  // içine alındı (deep-research: kalibre-olmayan tahmin/güven HER ZAMAN gösterilince aşırı-güven
  // üretir → varsayılan gizli, tıkla-aç).
  if (!total && !debateNotes && !prediction) return null;

  const summary = total > 0
    ? `${okCount}/${total} iddia kaynakla doğrulandı`
    : `${sourceCount || 0} kaynak incelendi`;

  // daisyUI timeline + Lucide ayırt edici ikonlar → 7-ajan pipeline'ı.
  const stages = [
    { label: "Triaj Ajanı", icon: "tag", detail: domain ? `Alan belirlendi: ${domain}` : "Soru sınıflandırıldı" },
    { label: "Mevzuat + Emsal", icon: "book", detail: `${sourceCount || 0} kaynak getirildi (kanun + Yargıtay)` },
    total > 0 && { label: "Doğrulama Ajanı", icon: "shield", detail: `${okCount}/${total} iddia kaynakla eşleşti` },
    debateNotes && { label: "Tartışma Ajanı", icon: "users", detail: "Ajan görüşleri karşılaştırıldı" },
    { label: "Sonuç", icon: "circleCheck", detail: retryCount > 0 ? `Cevap üretildi (${retryCount} yineleme sonrası)` : "Cevap üretildi" },
  ].filter(Boolean);

  return (
    <div className={"agent-trace" + (open ? " open" : "")}>
      <button
        className="at-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Ajan ekibi doğrulama dökümü"
      >
        <span className="at-ic"><Icon.scale /></span>
        <span className="at-title">Ajan ekibi nasıl doğruladı</span>
        <span className="at-meta">
          {summary}{retryCount > 0 ? ` · ${retryCount} yineleme` : ""}
        </span>
        <span className="at-chev"><Icon.chevron /></span>
      </button>

      {open && (
        <div className="at-body" id={panelId} role="region" aria-label="Ajan doğrulama dökümü">
          {/* Pipeline timeline — hangi ajanların çalıştığı (daisyUI timeline) */}
          <ol className="at-timeline" aria-label="Ajan hattı">
            {stages.map((s, i) => {
              const StageIcon = Icon[s.icon] || Icon.check;
              return (
              <li className="at-tl-item" key={i}>
                <span className="at-tl-marker" aria-hidden="true"><StageIcon /></span>
                <div className="at-tl-tx">
                  <span className="at-tl-label">{s.label}</span>
                  <span className="at-tl-detail">{s.detail}</span>
                </div>
              </li>
              );
            })}
          </ol>

          <div className="at-claims-head">İddia doğrulama dökümü · kaynak-eşleşme (NLI) skoru</div>
          {list.map((c, i) => {
            const score = c.score || 0;
            // 3-kademe GÖRÜNÜR durum (mevcut veriden, backend gerekmez): doğrulandı /
            // zayıf eşleşme / nötr. verified=true → kalkanı geçti (yeşil); false ama NLI
            // skoru orta → kanıt sınırda (amber); düşük → nötr (gri). 'Sıfır halüsinasyon'
            // soyut iddiasını cümle-düzeyinde ölçülen bir skora bağlar (jüri-wow + dürüstlük).
            const tier = c.verified ? "ok" : (score >= 40 ? "weak" : "neutral");
            const statusLabel = c.verified
              ? "Kaynakla doğrulandı"
              : (tier === "weak" ? "Zayıf eşleşme — kanıt sınırda" : "Nötr — kaynakta doğrulanmadı");
            return (
              <div className={"at-claim tier-" + tier} key={i}>
                <span className={"at-badge " + tier} aria-hidden="true">
                  {c.verified ? <Icon.check /> : <Icon.help />}
                </span>
                <div className="at-claim-tx">
                  <p>{c.text}</p>
                  <div className="at-claim-meta">
                    <span className={"at-status " + tier}>{statusLabel}</span>
                    {(c.citeNums ?? []).length > 0 && (
                      <span className="at-cites">Kaynak {c.citeNums.join(", ")}</span>
                    )}
                  </div>
                  {/* Kaynak-eşleşme (NLI entailment) skoru — "iddia ↔ kaynak metni" güç
                      göstergesi. Doğrulama soyut değil, ÖLÇÜLEN bir skora dayanır; ama bu
                      kalibre bir doğruluk olasılığı DEĞİLDİR (tooltip+aria ile işaretli). */}
                  <div
                    className="at-nli"
                    title={`Kaynak-eşleşme (NLI) skoru: %${score} — kalibre doğruluk olasılığı değildir`}
                  >
                    <span className="at-nli-track" aria-hidden="true">
                      <span className={"at-nli-fill " + tier} style={{ width: score + "%" }} />
                    </span>
                    <span className="at-nli-num" aria-label={`Kaynak eşleşme skoru yüzde ${score}`}>%{score}</span>
                  </div>
                  {c.reason && <p className="at-reason">{c.reason}</p>}
                </div>
              </div>
            );
          })}
          {debateNotes && (
            <div className="at-debate">
              <span className="at-debate-lbl">Tartışma Ajanı notu</span>
              <p>{debateNotes}</p>
            </div>
          )}
          {/* Tahmin (8. ajan) — artık ayrı her-zaman-görünür kart DEĞİL, doğrulama dökümünün
              içinde (progressive-disclosure). Kalibre-olmayan "%X aleyhe" ana akışı kalabalıklaştırmaz. */}
          {prediction && <PredictionCard prediction={prediction} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Tahmin kartı (8. ajan) ---------- */
const PRED_LABEL = {
  kazandi: "Geçmiş kararlarda benzer davalar çoğunlukla LEHE sonuçlanmış",
  kaybetti: "Geçmiş kararlarda benzer davalar çoğunlukla ALEYHE sonuçlanmış",
  kismi: "Benzer davalar kısmen lehe sonuçlanmış",
  belirsiz: "Yeterli/uyumlu emsal sinyali yok — tahmin belirsiz",
};
const PRED_SHORT = { kazandi: "Lehe eğilim", kaybetti: "Aleyhe eğilim", kismi: "Kısmi", belirsiz: "Belirsiz" };
const PRED_TONE = { kazandi: "ok", kaybetti: "no", kismi: "warn", belirsiz: "neutral" };

export function PredictionCard({ prediction: p }) {
  if (!p) return null;
  const tone = PRED_TONE[p.verdictClass] || "neutral";
  const pct = p.confidence;
  const caseIds = p.similarCaseIds ?? [];  // backend alanı atlarsa TypeError → guard (ECC)
  return (
    <div className={"pred-card tone-" + tone}>
      <div className="pred-head">
        <span className="pred-ic"><Icon.scale /></span>
        <div className="pred-head-tx">
          <div className="pred-tag">Tahmini sonuç · {PRED_SHORT[p.verdictClass] || "—"}</div>
          <div className="pred-label">{PRED_LABEL[p.verdictClass] || "Tahmini sonuç"}</div>
        </div>
        {p.verdictClass !== "belirsiz" && <div className="pred-pct">%{pct}</div>}
      </div>

      {p.verdictClass !== "belirsiz" && (
        <div className="pred-bar"><span style={{ width: pct + "%" }}></span></div>
      )}

      {p.reasoning && <p className="pred-reason">{p.reasoning}</p>}

      {caseIds.length > 0 && (
        <div className="pred-cases">
          <span className="pred-cases-lbl">Benzer kararlar</span>
          <div className="pred-cases-list">
            {/* Çip sayısı oylanan emsal sayısıyla eşleşsin (reasoning "8 emsal" derken
                6 çip göstermek tutarsız görünüyordu). Backend ≤8 benzersiz karar verir;
                8'i göster, fazlası olursa "+N" ile dürüstçe belirt. */}
            {caseIds.slice(0, 8).map((id, i) => (
              <span className="pred-case" key={i}>{id}</span>
            ))}
            {caseIds.length > 8 && (
              <span className="pred-case more">+{caseIds.length - 8}</span>
            )}
          </div>
        </div>
      )}

      {/* ZORUNLU — tahmin mahkeme garantisi değildir (CLAUDE.md kırmızı çizgi). */}
      <div className="pred-disc"><Icon.info /><span>{p.disclaimer}</span></div>
    </div>
  );
}

/* ---------- Anında "düşünüyor/yazıyor" (ChatGPT-feel hafif gösterge) ----------
   Token gelmeden önceki kısa boşluğu doldurur; ağır 4-adım stepper yerine ilk anlarda. */
export function QuickTyping({ label = "Düşünüyor" }) {
  return (
    <div className="quick-typing" role="status" aria-live="polite">
      <span className="qt-dots" aria-hidden="true">
        <span className="qt-dot"></span><span className="qt-dot"></span><span className="qt-dot"></span>
      </span>
      <span className="qt-label">{label}…</span>
    </div>
  );
}
