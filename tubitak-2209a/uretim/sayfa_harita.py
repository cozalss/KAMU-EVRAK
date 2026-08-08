import sys
sys.stdout.reconfigure(encoding="utf-8")
import pypdfium2 as pdfium
doc = pdfium.PdfDocument(sys.argv[1])
isaret = ["A. GENEL BİLGİLER","ÇALIŞMA TAKVİMİ","RİSK YÖNETİMİ","ARAŞTIRMA OLANAKLARI TABLOSU",
          "YAYGIN ETKİSİ","BELİRTMEK İSTEDİĞİNİZ","EK-1","Şekil 1.","HİPOTEZ-TEST"]
for i in range(len(doc)):
    t = doc[i].get_textpage().get_text_range()
    vur = [k for k in isaret if k in t]
    print(f"s{i+1:>2}: {len(t):>5} karakter  {vur if vur else ''}")
