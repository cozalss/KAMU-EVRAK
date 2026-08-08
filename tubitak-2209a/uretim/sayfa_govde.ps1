# Toplam sayfa + EKLERIN basladigi sayfa + GOVDE sayfa sayisini olcer.
# 2209-A: "ekler haric toplam 20 sayfayi gecmemesi beklenir" -> olculmesi gereken GOVDEDIR.
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$EkIsareti = "EK-1"
)

$wdStatisticPages = 2
$wdActiveEndPageNumber = 3

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Resolve-Path $Docx).Path, $false, $true)
  $doc.Repaginate()
  $toplam = $doc.ComputeStatistics($wdStatisticPages)

  $bul = $doc.Content.Find
  $bul.ClearFormatting()
  $bul.Text = $EkIsareti
  $bul.Forward = $true
  $bul.MatchCase = $true
  $bulundu = $bul.Execute()

  if ($bulundu) {
    $ekSayfa = $bul.Parent.Information($wdActiveEndPageNumber)
    Write-Output "TOPLAM=$toplam"
    Write-Output "EK_BASLANGIC_SAYFA=$ekSayfa"
    Write-Output "GOVDE_SAYFA=$ekSayfa"   # ekler bu sayfada basliyor => govde bu sayfaya kadar
    Write-Output "EK_SAYFA=$($toplam - $ekSayfa + 1)"
  } else {
    Write-Output "TOPLAM=$toplam"
    Write-Output "EK_BASLANGIC_SAYFA=BULUNAMADI"
    Write-Output "GOVDE_SAYFA=$toplam"
  }
  $doc.Close($false)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
