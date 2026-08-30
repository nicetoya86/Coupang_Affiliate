# 쿠팡 상품 수집 서버가 안 떠있으면 띄우고, 바탕화면 수집 페이지를 연다.
$ErrorActionPreference = 'SilentlyContinue'
$ServerDir = 'D:\vibecording\Coupang_Affiliate\scripts'
$HtmlFile = 'C:\Users\nicet\Desktop\쿠팡상품등록.html'

function Test-ServerUp {
    return [bool](Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-ServerUp)) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run serve' -WorkingDirectory $ServerDir -WindowStyle Minimized

    # 고정 대기(예전엔 2초) 대신 실제로 포트가 열릴 때까지 폴링한다.
    # npm/node 기동 시간이 2초보다 오래 걸리면(디스크/백신 스캔 등) 서버가 뜨기 전에
    # 페이지가 열려서 미리보기/추가 버튼이 전부 연결 실패로 조용히 깨지는 문제가 있었음.
    $waited = 0
    while (-not (Test-ServerUp) -and $waited -lt 15) {
        Start-Sleep -Seconds 1
        $waited++
    }
}

Start-Process $HtmlFile
