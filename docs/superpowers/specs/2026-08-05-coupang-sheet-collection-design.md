# 쿠팡 제휴상품 수집 → 구글시트 → n8n 자동 포스팅 — 설계 스펙

> 작성일: 2026-08-05. 기존 프로젝트(`coupang_threads_project_spec.md`)의 확장. 상품 소싱을 수동 입력/자동 웹훅에서 "로컬 스크립트 수집 → 구글시트 큐 → n8n 스케줄 포스팅" 구조로 전환한다.

## 1. 목표

기존 `scripts/generate-coupang-link.js`(자동 ID/PW 로그인 → n8n 웹훅으로 즉시 전달)를 다음과 같이 바꾼다:

1. 로그인을 자동 입력에서 **수동 로그인**으로 전환 (계정 자격증명을 코드/`.env`에 저장하지 않음)
2. 수집한 상품 정보(제목, 가격, 상세설명, 원본 URL, 제휴링크)를 n8n으로 즉시 전달하는 대신 **구글시트에 큐로 적재**
3. n8n에 새 브랜치를 추가해 **3시간마다 스케줄 실행**으로 시트에서 미게시 상품을 하나씩 읽어 기존 AI 스토리텔링 + Threads 게시 파이프라인에 흘려보내고, 성공 시 시트에 게시완료 표시

## 2. 배경 / 기존 자산 재사용

- `scripts/generate-coupang-link.js`: 로그인, 썸네일 순회, "링크 생성" 클릭, 단축URL 추출 로직 이미 존재 — 이 구조를 그대로 재사용하고 로그인부/출력부만 교체한다.
- n8n 라이브 워크플로우에 이미 "웹훅 자동 수집 → dedup → 상품 정보 입력(자동) → 기존 AI/게시 체인" 브랜치가 존재한다 (`coupang_threads_project_spec.md` 참고). 이번에 추가하는 Branch C는 **트리거만 다르고(Webhook → Schedule+Sheets), 이후 체인은 동일 패턴을 재사용**한다.
- 셀렉터(로그인 폼, 썸네일 목록, "링크 생성" 버튼, 단축URL 필드)는 기존 스크립트 작성 시점에도 실제 페이지로 검증되지 않은 상태였다. 이 스펙에서도 동일한 한계를 유지하며, 상세페이지 설명 텍스트용 신규 셀렉터도 첫 실행 시 눈으로 검증이 필요하다.

## 3. 아키텍처

### 3.1 로컬 스크립트 (`scripts/generate-coupang-link.js`)

```
브라우저 실행 (headed, 항상)
  → 간편링크 페이지 이동
  → 로그인 폼 있으면: "직접 로그인해주세요" 안내 후 상품 목록 뜰 때까지 대기 (최대 5분)
     로그인 완료 시 storageState.json 저장 (다음 실행에 재사용, 만료 시 다시 수동 로그인)
  → 시트에서 기존 product_url 전체 조회 (dedup 기준셋 구성)
  → 썸네일 목록 전체 순회:
      이미 시트에 있는 product_url → skip
      신규 상품 →
        제목, 가격: 썸네일에서 추출
        "링크 생성" 클릭 → affiliate_link 추출
        product_url로 이동 → 상세설명 텍스트 추출
        시트에 새 행 append
  → 종료 (성공/실패 건수 로그 출력)
```

**로그인 대기 로직**: 기존 `login()`의 자동 fill 코드 제거. `page.goto(PARTNERS_URL)` 후 로그인 폼 셀렉터 존재 여부 확인 → 있으면 콘솔에 안내 메시지 출력하고 `thumbnailList` 셀렉터가 나타날 때까지 `waitForSelector(timeout: 300000)`로 대기. 타임아웃 시 명확한 에러로 종료.

**세션 재사용**: 로그인 성공 직후 `context.storageState({ path: STATE_FILE })`로 저장. 다음 실행 시 `browser.newContext({ storageState: STATE_FILE })`로 컨텍스트 생성 시도 → 로그인 폼이 다시 뜨면 세션 만료로 간주하고 재로그인 대기 흐름 진행.

**dedup**: 실행 시작 시 Google Sheets API로 `product_url` 컬럼 전체를 읽어 `Set`으로 구성. 후보 처리 전에 먼저 이 Set으로 필터링 — 이미 있는 상품은 "링크 생성" 클릭 자체를 스킵한다(불필요한 클릭/API 호출 방지).

**출력**: `postToN8n()` 제거. `appendToSheet(rows)` 신규 함수 — `googleapis` 패키지로 Sheets API `spreadsheets.values.append` 호출.

### 3.2 구글시트 스키마

| 컬럼 | 설명 |
|---|---|
| `collected_at` | 수집 시각 (ISO 8601) |
| `product_title` | 상품명 (썸네일에서 추출) |
| `price` | 가격 (썸네일에서 추출, 문자열 그대로 저장) |
| `product_desc` | 상세페이지에서 추출한 설명 텍스트 |
| `product_url` | 원본 상품 URL (dedup 키) |
| `affiliate_link` | 파트너스 간편링크 |
| `posted` | 빈 값으로 시작. n8n이 게시 완료 후 `Y`로 업데이트 |

새 시트로 생성하며 1행에 위 헤더를 미리 채워둔다.

### 3.3 n8n 신규 브랜치 (Branch C: 시트 기반 자동 포스팅)

```
Schedule Trigger (3시간마다)
  → Google Sheets 노드: posted가 비어있는 행 중 가장 오래된 1건 조회
  → IF: 조회 결과 없음 → 종료 (Do nothing)
  → (있음) 기존 체인 재사용:
      현재 토큰 불러오기 → NVIDIA 요청 만들기 → 스토리텔링 생성 (NVIDIA API)
      → 응답 파싱 및 댓글 텍스트 구성 (상품 정보 소스만 시트 조회 결과로 매핑)
      → 본문 컨테이너 생성 → 대기 → 본문 게시 → 대기
      → 댓글 컨테이너 생성 → 대기 → 댓글 게시 (제휴링크)
  → Google Sheets 노드: 해당 행 posted=Y로 업데이트 (row_number 기준)
```

기존 "상품 정보 입력 (자동)" 노드가 하던 역할(product_title/product_desc/product_url/affiliate_link를 하위 노드에 공급)을 Google Sheets 조회 결과가 대신한다 — 웹훅 자동 브랜치와 동일한 패턴, 소스만 다르다.

**완전 무인 자동화**임을 명시: 기존 스펙 문서의 "저품질 양산 콘텐츠 정책 리스크 대응을 위한 최소 검수 단계 유지 권장"과 반대 방향이다. 사용자가 명시적으로 스케줄 자동화를 선택했으므로 이대로 진행하되, 리스크는 기존 문서에 이미 기록되어 있다.

## 4. 데이터 흐름 요약

```
[로컬 PC] Playwright 스크립트 (수동 로그인)
  ↓ (신규 상품만) Google Sheets API append
[구글시트] 큐 (posted 컬럼으로 상태 관리)
  ↓ (3시간마다) n8n Schedule Trigger + Google Sheets 조회
[n8n] 기존 AI 스토리텔링 → Threads 게시 체인
  ↓ 게시 성공
[구글시트] 해당 행 posted=Y 업데이트
```

## 5. 에러 처리

- 로컬 스크립트: 기존 `screenshotOnFailure` 패턴 유지 — 후보별 실패는 스크린샷 남기고 다음 후보로 계속 진행(전체 중단 아님). 로그인 대기 타임아웃, Sheets API 인증 실패는 즉시 중단 + 명확한 에러 메시지.
- n8n Branch C: 기존 Error Workflow(텔레그램 알림, 현재 Credential 미연결로 미게시 상태)가 연결되면 자동으로 실패 알림. 게시 성공 후 `posted=Y` 업데이트 실패 시 다음 스케줄에서 같은 행이 중복 게시될 수 있음 — 업데이트 노드 실패는 별도 재시도 없이 그대로 두되, Error Workflow 알림으로 사람이 인지하도록 함 (자동 재시도 로직은 범위 밖, YAGNI).

## 6. 준비물 / 설정 절차

1. **Google Cloud 서비스 계정** (로컬 스크립트용): Sheets API 활성화 → 서비스 계정 생성 → JSON 키 다운로드 → 시트에 `client_email`을 편집자로 공유
2. **구글시트 신규 생성**: 3.2 스키마대로 헤더 작성, 서비스계정과 공유
3. **로컬 `.env`**: `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GOOGLE_SHEET_ID` 추가. `COUPANG_ID`, `COUPANG_PW`, `N8N_WEBHOOK_URL` 제거
4. **패키지 추가**: `scripts/package.json`에 `googleapis` 의존성 추가
5. **n8n Google Sheets Credential**: n8n에서 별도로 Google Sheets 인증 연결 필요 (OAuth2 또는 동일 서비스계정 JSON 재사용) — n8n이 조회/업데이트하려면 필수

## 7. 범위 밖 (이번 작업에 포함 안 함)

- 제외 카테고리(기프트카드, 의료기기 등) 자동 필터링 — 기존 스크립트에도 없던 기능, 이번에도 추가 안 함
- 게시 실패 시 자동 재시도/백오프
- 여러 Threads 계정으로 확장

## 8. 알려진 한계 (기존 스펙에서 이어짐)

- 로그인 폼, 썸네일 목록, "링크 생성" 버튼, 단축URL 필드, 상세페이지 설명 셀렉터 — 전부 실제 페이지에서 검증 전. 첫 실행은 반드시 눈으로 지켜보며 셀렉터 조정 필요.
- 상세페이지 방문이 추가되어 수집 속도가 느려지고, 페이지 구조 변경에 더 취약해짐 (사용자가 명시적으로 선택한 트레이드오프).
