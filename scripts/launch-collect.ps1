# 쿠팡 상품 수집 서버가 안 떠있으면 띄우고, 바탕화면 수집 페이지를 연다.
$ErrorActionPreference = 'SilentlyContinue'
$ServerDir = 'D:\vibecording\Coupang_Affiliate\scripts'
$HtmlFile = 'C:\Users\nicet\Desktop\쿠팡상품등록.html'

$alreadyRunning = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue

if (-not $alreadyRunning) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run serve' -WorkingDirectory $ServerDir -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

Start-Process $HtmlFile
