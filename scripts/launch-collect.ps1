# 쿠팡 상품 수집 서버가 안 떠있으면 띄우고, 서버가 직접 서빙하는 수집 페이지를 연다.
# (바탕화면에 collect.html 정적 복사본을 따로 두지 않음 — scripts/collect.html이 바뀌어도
#  항상 최신 버전이 뜨도록. 포트도 .env의 COLLECT_PORT를 그대로 읽어서 하드코딩 불일치를 막는다.)
$ErrorActionPreference = 'SilentlyContinue'
$ServerDir = 'D:\vibecording\Coupang_Affiliate\scripts'
$EnvFile = Join-Path $ServerDir '.env'

$Port = 5175
if (Test-Path $EnvFile) {
    $line = Get-Content $EnvFile | Where-Object { $_ -match '^COLLECT_PORT=' }
    if ($line) {
        $Port = ($line -split '=', 2)[1].Trim()
    }
}

function Test-ServerUp {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-ServerUp)) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'node collect-server.js' -WorkingDirectory $ServerDir -WindowStyle Minimized

    # 고정 대기(예전엔 2초) 대신 실제로 포트가 열릴 때까지 폴링한다.
    # npm/node 기동 시간이 2초보다 오래 걸리면(디스크/백신 스캔 등) 서버가 뜨기 전에
    # 페이지가 열려서 미리보기/추가 버튼이 전부 연결 실패로 조용히 깨지는 문제가 있었음.
    $waited = 0
    while (-not (Test-ServerUp) -and $waited -lt 15) {
        Start-Sleep -Seconds 1
        $waited++
    }
}

Start-Process "http://localhost:$Port/"
