# demo-mobil.ps1 — Telefonla Evrak Yükleme demo başlatıcı (yalnız AYNI AĞ modu).
#
# KURAL: Telefonlar ve bilgisayar AYNI ağda olmalı (kurum Wi-Fi'ı ya da telefondan
# açılan hotspot). İnternete tünel YOK — kamu senaryosunda backend dışarı açılmaz.
#
# KULLANIM
#   .\scripts\demo-mobil.ps1
#     1) Önce ağa bağlan (hotspot kullanacaksan hotspota BAĞLANDIKTAN SONRA çalıştır —
#        QR IP'si her oturum açılışında taze tespit edilir, ama backend'in dinlediği
#        ağın var olması gerekir).
#     2) Script, Windows Güvenlik Duvarı'nda 8000 portu için gelen-izin kuralını
#        denetler; yoksa eklemeyi dener (yönetici gerektirir — değilse komutu gösterir).
#     3) Backend 0.0.0.0:8000'de başlar; masaüstünde "Telefonla çek" ile QR aç.
#   Ağ ortasında değişirse: QR modalını kapatıp yeniden aç yeter (IP taze alınır);
#   birden çok ağ arayüzü varsa modaldaki "Ağ:" seçicisinden doğru IP seçilir.

$ErrorActionPreference = "Stop"
$backendDizin = Join-Path $PSScriptRoot "..\backend"
$kuralAdi = "kamu-evrak mobil 8000"

# --- Güvenlik duvarı: 8000 gelen-izin kuralı (telefonların erişimi için şart) ---
$mevcut = netsh advfirewall firewall show rule name="$kuralAdi" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Guvenlik duvari kurali ekleniyor: $kuralAdi" -ForegroundColor Yellow
    netsh advfirewall firewall add rule name="$kuralAdi" dir=in action=allow protocol=TCP localport=8000 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  UYARI: Kural eklenemedi (yonetici yetkisi gerekir)." -ForegroundColor Red
        Write-Host "  Telefonlar baglanamazsa su komutu YONETICI PowerShell'de calistir:" -ForegroundColor Red
        Write-Host "    netsh advfirewall firewall add rule name=`"$kuralAdi`" dir=in action=allow protocol=TCP localport=8000"
        Write-Host ""
    } else {
        Write-Host "Kural eklendi." -ForegroundColor Green
    }
} else {
    Write-Host "Guvenlik duvari kurali mevcut: $kuralAdi" -ForegroundColor Green
}

# --- LAN modu garantisi: olasi eski tunel kalintisi ortami temizle ---
Remove-Item Env:MOBIL_BASE_URL -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  AYNI-AG MODU" -ForegroundColor Green
Write-Host "  Telefonlar bilgisayarla AYNI Wi-Fi/hotspot aginda olmali."
Write-Host "  QR IP'si her acilista taze tespit edilir; coklu agda modaldan 'Ag:' secilir."
Write-Host ""

Set-Location $backendDizin
uv run uvicorn main:app --host 0.0.0.0 --port 8000
