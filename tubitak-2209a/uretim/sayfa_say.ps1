# Word COM ile gercek sayfa sayisini olcer ve PDF onizleme uretir.
# Kullanim: powershell -File sayfa_say.ps1 -Docx <yol> [-Pdf <yol>]
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$Pdf = ""
)

$wdStatisticPages = 2
$wdFormatPDF = 17

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Resolve-Path $Docx).Path, $false, $true)
  $doc.Repaginate()
  $sayfa = $doc.ComputeStatistics($wdStatisticPages)
  $kelime = $doc.ComputeStatistics(0)
  $karakter = $doc.ComputeStatistics(3)
  Write-Output "SAYFA=$sayfa"
  Write-Output "KELIME=$kelime"
  Write-Output "KARAKTER=$karakter"
  if ($Pdf -ne "") {
    $doc.SaveAs([ref]$Pdf, [ref]$wdFormatPDF)
    Write-Output "PDF=$Pdf"
  }
  $doc.Close($false)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
