"""PDF sayfalarini PNG'ye cevirir (gorsel dogrulama icin)."""
import sys, os
sys.stdout.reconfigure(encoding="utf-8")
import pypdfium2 as pdfium

pdf_yolu = sys.argv[1]
sayfalar = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else [1]
olcek = float(sys.argv[3]) if len(sys.argv) > 3 else 1.6

doc = pdfium.PdfDocument(pdf_yolu)
kok = os.path.splitext(pdf_yolu)[0]
for n in sayfalar:
    if n > len(doc):
        continue
    img = doc[n - 1].render(scale=olcek).to_pil()
    yol = f"{kok}_s{n:02d}.png"
    img.save(yol)
    print(yol, img.size)
