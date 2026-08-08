"""2209-A on-inceleme kapisi — YAPIDAN BAGIMSIZ surum.

Onceki surum tablolari INDEKSLE buluyordu. Icerik kutulari govde akisina cevrilince
indeksler kaydi ve kapi yanlis yeri olcmeye baslardi. Bu surum tablolari BASLIK
METNIYLE bulur; bolum uzunluklarini ise kaynak icerik dosyasindan alir (yazilan sey
odur). Boylece belge yapisi degisse de kapi dogru olcer.
"""
import sys, os, re, json
sys.stdout.reconfigure(encoding="utf-8")
from docx import Document

YASAK = [
    "teknofest", "t3 vakfı", "deepseek", "openai", "gpt-4", "chatgpt", "claude",
    "anthropic", "gemini", "llama", "mistral", "cohere", "ollama", "huggingface",
    "hugging face", "azure", "aws", "google cloud", "nvidia", "cuda",
    "fastapi", "langgraph", "langchain", "react", "vite", "supabase", "postgresql",
    "postgres", "pydantic", "uvicorn", "playwright", "pypdfium", "tesseract",
    "python", "javascript", "typescript", "node.js", "npm", "docker", "github",
    "sqlite", "redis", "elasticsearch", "microsoft", "google", "meta", "amazon",
    "apple", "ibm", "2224-a", "2224-b", "2209-b",
]
KELIME_SINIRI = {"react", "meta", "apple", "python", "claude", "postgres", "google"}
INGILIZCE = [" the ", " and ", " with ", " for the ", " we propose", " in this study",
             " results show", " state-of-the-art"]


def tablo_bul(doc, *basliklar):
    """Ilk satirinda verilen basliklari GECEN tabloyu dondurur (indeksten bagimsiz)."""
    for t in doc.tables:
        if not t.rows:
            continue
        ilk = " ".join(c.text for c in t.rows[0].cells).lower()
        if all(b.lower() in ilk for b in basliklar):
            return t
    return None


def kelime_say(s):
    return len([w for w in re.split(r"\s+", s.strip()) if w])


def kontrol(docx_yolu, icerik_yolu, sayfa_bilgisi=None):
    doc = Document(docx_yolu)
    ic = json.load(open(icerik_yolu, encoding="utf-8"))
    sonuc = []

    def ekle(ad, gecti, olculen, beklenen, siddet="ELEME"):
        sonuc.append({"kontrol": ad, "gecti": bool(gecti), "olculen": olculen,
                      "beklenen": beklenen, "siddet": siddet})

    # --- metin havuzlari
    kaynakca_p = [p.text for p in doc.paragraphs if re.match(r"^\s*\[\d{1,3}\]", p.text)]
    kaynakca = "\n".join(kaynakca_p)
    govde_p = [p.text for p in doc.paragraphs if not re.match(r"^\s*\[\d{1,3}\]", p.text)]
    tablo_metni = "\n".join(c.text for t in doc.tables for r in t.rows for c in r.cells)
    govde = ("\n".join(govde_p) + "\n" + tablo_metni)
    govde_k = govde.lower()
    tam = govde + "\n" + kaynakca

    # --- 1) ozet + anahtar kelime (hala tablo icinde)
    ozet_t = tablo_bul(doc, "özet")
    if ozet_t:
        ozet = re.sub(r"^\s*Özet\s*", "", ozet_t.rows[0].cells[0].text).strip()
        n = kelime_say(ozet)
        ekle("Özet kelime sayısı", 25 <= n <= 450, n, "25–450")
        ak = re.sub(r"^\s*Anahtar Kelimeler\s*:", "", ozet_t.rows[1].cells[0].text).strip()
        kelimeler = [k.strip() for k in ak.split(",") if k.strip()]
        ekle("Anahtar kelime sayısı", 3 <= len(kelimeler) <= 5, len(kelimeler), "3–5")
    else:
        ekle("Özet tablosu bulundu", False, "yok", "bulunmalı")

    # --- 2) bolum uzunluklari (kaynak icerikten; yazilan sey odur)
    for anahtar, ad in (("bolum_1_1", "1.1 Bilimsel nitelik"),
                        ("bolum_1_2", "1.2 Amaç ve hedefler"),
                        ("bolum_2", "2. Yöntem"),
                        ("bolum_5_diger", "5. Diğer konular")):
        k = len(ic.get(anahtar, "").strip())
        ekle(f"{ad} — karakter", k >= 350, k, "≥350")
    for k2, ad in (("bilimsel_akademik", "Bilimsel/Akademik"),
                   ("ekonomik_ticari_sosyal", "Ekonomik/Ticari/Sosyal"),
                   ("yeni_projeler", "Yeni projeler")):
        n = len(ic["yaygin_etki"].get(k2, ""))
        ekle(f"4. Yaygın etki — {ad}", n > 0, n, ">0", "KRİTİK")

    # --- 3) bolum metinleri belgede GERCEKTEN var mi (akisa cevrildi, dogrula)
    for anahtar, ad in (("bolum_1_1", "1.1"), ("bolum_1_2", "1.2"), ("bolum_2", "2. Yöntem"),
                        ("bolum_5_diger", "5.")):
        ilk = ic.get(anahtar, "").strip().split("\n")[0][:60]
        ekle(f"{ad} metni belgede", ilk and ilk in govde, "var" if ilk in govde else "YOK",
             "belgede bulunmalı", "KRİTİK")

    # --- 4) calisma takvimi
    tak = tablo_bul(doc, "tarih aralığı", "faaliyetler")
    if tak:
        katkilar = []
        for r in tak.rows[1:]:
            m = re.findall(r"Katkı:\s*%\s*(\d+(?:[.,]\d+)?)", r.cells[3].text)
            if m:
                katkilar.append(float(m[0].replace(",", ".")))
        toplam = round(sum(katkilar), 2)
        ekle("Çalışma takvimi katkı toplamı", abs(toplam - 100) < 0.01, toplam, "tam 100")
        ekle("İş paketi sayısı", len(katkilar) >= 4, len(katkilar), "≥4", "ÖNEMLİ")
        yasak_adim = ["literatür taraması", "sonuç raporu hazırlama", "malzeme alımı",
                      "araştırma sonuçlarının paylaşımı"]
        ihlal = []
        for r in tak.rows[1:]:
            ilk = r.cells[1].text.strip().lower().split("\n")[0]
            ihlal += [y for y in yasak_adim if ilk.startswith(y)]
        ekle("Yasak iş adımı ayrı İP değil", not ihlal, ihlal or "yok", "boş")
    else:
        ekle("Çalışma takvimi tablosu bulundu", False, "yok", "bulunmalı")

    # --- 5) madde 4.1.8 + dil (govde; kaynakca ayri)
    def tara(kaynak):
        return [y for y in YASAK
                if (re.search(r"\b" + re.escape(y) + r"\b", kaynak) if y in KELIME_SINIRI
                    else y in kaynak)]
    b = tara(govde_k)
    ekle("Madde 4.1.8 marka/kurum taraması (gövde)", not b, b or "temiz", "0 bulgu")
    kb = tara(kaynakca.lower())
    ekle("Kaynakça marka geçişi (bilgi)", not kb, kb or "temiz", "atıf künyesinde kabul edilebilir",
         "ÖNEMLİ")
    ing = [i.strip() for i in INGILIZCE if i in govde_k]
    ekle("Gövde metni Türkçe", not ing, ing or "temiz", "0 İngilizce kalıntı", "KRİTİK")
    ekle("Türkçe karakter bütünlüğü", not re.findall(r"[ÃÄÅÂ][\x80-\xbf]", tam),
         len(re.findall(r"[ÃÄÅÂ][\x80-\xbf]", tam)), "0 bozuk", "KRİTİK")

    # --- 6) atif butunlugu
    atif = set(int(x) for x in re.findall(r"\[(\d{1,3})\]", govde))
    kaynak_no = set(int(re.match(r"^\s*\[(\d{1,3})\]", s).group(1)) for s in kaynakca_p)
    ekle("Metindeki her atıf kaynakçada var", not (atif - kaynak_no),
         sorted(atif - kaynak_no) or "tam", "boş", "KRİTİK")
    ekle("Kaynakçadaki her kayıt kullanılmış", not (kaynak_no - atif),
         sorted(kaynak_no - atif) or "tam", "boş", "ÖNEMLİ")
    ekle("Kaynak sayısı", len(kaynak_no) >= 15, len(kaynak_no), "≥15", "ÖNEMLİ")
    ekle("Doğrulanmamış atıf etiketi", tam.count("[DOĞRULA") == 0,
         tam.count("[DOĞRULA"), "0", "ÖNEMLİ")

    # --- 7) butce
    butce = ic.get("butce", [])
    tut = sum(x.get("tutar_tl", 0) or 0 for x in butce)
    ekle("Bütçe toplamı", tut <= 12000, tut, "≤12.000 TL", "KRİTİK")
    yasak_gider = [x["kalem"] for x in butce
                   if any(y in (str(x.get("kalem", "")) + str(x.get("aciklama", ""))).lower()
                          for y in ("konferans", "yayın ücret", "patent başvuru", "makale ücret"))]
    ekle("Yasak gider kalemi yok", not yasak_gider, yasak_gider or "temiz", "boş", "KRİTİK")

    # --- 8) bicim
    kotu = sum(1 for p in doc.paragraphs for r in p.runs
               if r.text.strip() and r.font.name not in (None, "Arial"))
    kotu += sum(1 for t in doc.tables for row in t.rows for c in row.cells
                for p in c.paragraphs for r in p.runs
                if r.text.strip() and r.font.name not in (None, "Arial"))
    ekle("Yazı tipi Arial", kotu == 0, kotu, "0 sapma", "ÖNEMLİ")

    # --- 9) sayfa
    if sayfa_bilgisi:
        # Kullanici sinirini "her sey dahil 20 sayfa" olarak belirledi (8 Agu).
        # TUBITAK'in kendi kurali "ekler haric 20"; bu daha siki olan sinirdir.
        toplam_s = sayfa_bilgisi.get("toplam")
        ekle("Toplam sayfa (ekler dâhil)", toplam_s <= 20, toplam_s, "≤20", "KRİTİK")
        govde_s = sayfa_bilgisi.get("govde")
        ekle("Gövde sayfa (ekler hariç)", govde_s <= 20, govde_s, "≤20")

    return sonuc


def rapor(sonuc):
    gen = max(len(s["kontrol"]) for s in sonuc) + 2
    print("=" * 82)
    print("2209-A ÖN İNCELEME KAPISI")
    print("=" * 82)
    for s in sonuc:
        isaret = "GEÇTİ" if s["gecti"] else f"KALDI({s['siddet']})"
        print(f"  [{isaret:>13}] {s['kontrol']:<{gen}} ölçülen={s['olculen']}  beklenen={s['beklenen']}")
    e = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "ELEME")
    k = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "KRİTİK")
    o = sum(1 for s in sonuc if not s["gecti"] and s["siddet"] == "ÖNEMLİ")
    print("-" * 82)
    print(f"ELEME: {e}   KRİTİK: {k}   ÖNEMLİ: {o}")
    print("=" * 82)
    return e + k


if __name__ == "__main__":
    sayfa = None
    if len(sys.argv) > 4:
        sayfa = {"toplam": int(sys.argv[3]), "govde": int(sys.argv[4])}
    s = kontrol(sys.argv[1], sys.argv[2], sayfa)
    sys.exit(1 if rapor(s) else 0)
