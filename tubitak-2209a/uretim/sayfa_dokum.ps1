# Her sayfanin ilk/son satirini ve karakter sayisini dokerek TASMANIN NEREDE
# oldugunu gosterir. Sayfa sayisi sinirdayken "hangi paragraf tasiyor" sorusunun
# tahminle degil olcumle yanitlanmasi icin.
# Kullanim: powershell -ExecutionPolicy Bypass -File sayfa_dokum.ps1 -Docx <yol>
param([Parameter(Mandatory = $true)][string]$Docx)

$wdStatisticPages = 2
$wdGoToPage = 1
$wdGoToAbsolute = 1

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Resolve-Path $Docx).Path, $false, $true)
  $doc.Repaginate()
  $sayfa = $doc.ComputeStatistics($wdStatisticPages)
  Write-Output "TOPLAM SAYFA=$sayfa"
  for ($i = 1; $i -le $sayfa; $i++) {
    $bas = $doc.GoTo($wdGoToPage, $wdGoToAbsolute, $i)
    if ($i -lt $sayfa) {
      $son = $doc.GoTo($wdGoToPage, $wdGoToAbsolute, ($i + 1))
      $aralik = $doc.Range($bas.Start, $son.Start)
    } else {
      $aralik = $doc.Range($bas.Start, $doc.Content.End)
    }
    $metin = ($aralik.Text -replace '\s+', ' ').Trim()
    $uz = $metin.Length
    $ilk = if ($uz -gt 52) { $metin.Substring(0, 52) } else { $metin }
    # Sayfanin SONU da yazilir: bir sayfa baslikla bitiyorsa o baslik yetim
    # kalmis demektir (keepNext calismamis). Bas kadar son da olculmeli.
    $son = if ($uz -gt 52) { $metin.Substring($uz - 52) } else { "" }
    Write-Output ("s{0,2} | {1,5} krk | BAS: {2}" -f $i, $uz, $ilk)
    Write-Output ("     |       | SON: {0}" -f $son)
  }
  $doc.Close($false)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
