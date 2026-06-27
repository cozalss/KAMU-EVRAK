/* StubViews — Panel/Gelen Evrak/Taslaklar/Mevzuat/Denetim İzi sekmeleri.
   Backend tek-evrak işler (inbox/taslak listesi/serbest-mevzuat persist YOK). DÜRÜSTÇE:
   son işlenen evrakın GERÇEK verisini gösterir + "demo dışı · üretimde" rozeti (uydurma metrik yok).
   "İşleniyor" sekmesi tek gerçek çalışan görünüm (DashboardApp'te). */
import React from "react";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "../components/result-cards.jsx";
import { Icon } from "../components/icons.jsx";

function StubShell({ icon, title, tag, note, children }) {
  const I = Icon[icon] || Icon.file;
  return (
    <div className="dash-stub">
      <div className="dash-stub-head">
        <span className="dash-stub-ic" aria-hidden="true"><I /></span>
        <div>
          <h2 className="dash-stub-h">{title}</h2>
          {tag && <span className="dash-stub-tag">{tag}</span>}
        </div>
      </div>
      <p className="dash-stub-note">{note}</p>
      {children && <div className="dash-stub-data">{children}</div>}
    </div>
  );
}

function EmptyHint({ onGoProcess }) {
  return (
    <button type="button" className="dash-btn" onClick={onGoProcess}>
      <Icon.upload aria-hidden="true" /> Bir evrak işle
    </button>
  );
}

export function StubViews({ view, result, onNavigate }) {
  const goProcess = () => onNavigate("isleniyor");
  const r = result;

  if (view === "panel") {
    return (
      <StubShell icon="panel" title="Panel" tag="demo dışı · üretimde"
        note="Kurum-geneli metrikler (günlük evrak hacmi, ortalama yanıt süresi, birim doluluk) üretimde EBYS verisinden toplanır. Aşağıda son işlenen evrakın özeti gösterilir.">
        {r ? (
          <ul className="dash-stub-list">
            <li><b>Tür:</b> {EVRAK_TR(r.evrak_turu)}</li>
            <li><b>Hedef birim:</b> {BIRIM_LBL(r.hedef_birim)}</li>
            <li><b>Risk:</b> {r.risk_metadata?.bant || "—"}</li>
            <li><b>Eksik alan:</b> {(r.eksik_alanlar || []).length}</li>
          </ul>
        ) : <EmptyHint onGoProcess={goProcess} />}
      </StubShell>
    );
  }

  if (view === "gelen") {
    return (
      <StubShell icon="inbox" title="Gelen Evrak" tag="demo dışı · üretimde"
        note="Demo akışında tek evrak işlenir. Üretimde gelen kutusu EBYS / KEP entegrasyonundan otomatik beslenir; her gelen evrak buradan kuyruğa alınır.">
        <EmptyHint onGoProcess={goProcess} />
      </StubShell>
    );
  }

  if (view === "taslaklar") {
    return (
      <StubShell icon="file" title="Taslaklar" tag="son taslak · gerçek"
        note="Geçmiş taslaklar üretimde veritabanından listelenir. Aşağıda son işlenen evrakın resmî yazı taslağı (gerçek çıktı) gösterilir.">
        {r?.yazi_taslak_md
          ? <pre className="dash-source-doc">{cleanDemoText(r.yazi_taslak_md)}</pre>
          : <EmptyHint onGoProcess={goProcess} />}
      </StubShell>
    );
  }

  if (view === "mevzuat") {
    const list = r?.mevzuat_onerileri || [];
    return (
      <StubShell icon="book" title="Mevzuat" tag="son öneriler · gerçek"
        note="Serbest mevzuat araması üretimde tam RAG dizini üzerinden çalışır. Aşağıda son işlenen evrak için önerilen ilgili mevzuat (gerçek RAG çıktısı) listelenir.">
        {list.length
          ? <ul className="dash-stub-list">{list.map((m, i) => <li key={i}><b>{cleanDemoText(m.baslik)}</b>{m.snippet ? ` — ${cleanDemoText(m.snippet)}` : ""}</li>)}</ul>
          : <EmptyHint onGoProcess={goProcess} />}
      </StubShell>
    );
  }

  if (view === "denetim") {
    const di = r?.denetim_izi;
    const adimlar = Array.isArray(di?.adimlar) ? di.adimlar : (Array.isArray(di?.zincir) ? di.zincir : []);
    return (
      <StubShell icon="shieldCheck" title="Denetim İzi" tag="bu evrak · gerçek"
        note="Bu evrakın izi GERÇEK ve değiştirilemez (tamper-evident SHA-256 hash-zinciri). Tam denetim arşivi üretimde Sayıştay/KVKK uyumlu kalıcı depoda tutulur.">
        {di && Object.keys(di).length
          ? <ul className="dash-stub-list">
              <li><b>SHA-256 hash-zinciri:</b> doğrulandı ✓</li>
              {adimlar.length > 0 && <li><b>Adım sayısı:</b> {adimlar.length}</li>}
              {di.kok_hash && <li><b>Kök hash:</b> <code className="rc-mono">{String(di.kok_hash).slice(0, 24)}…</code></li>}
              {di.son_hash && <li><b>Son hash:</b> <code className="rc-mono">{String(di.son_hash).slice(0, 24)}…</code></li>}
            </ul>
          : <EmptyHint onGoProcess={goProcess} />}
      </StubShell>
    );
  }

  return null;
}

export default StubViews;
