# 자동화 롤아웃 실행 계획

> Claude Code + n8n-mcp로 라이브 워크플로우에 직접 적용하기 위한 작업 지시서입니다.
> 목표: 수기 입력 최소화, 완전 자동 게시(검수 단계 없음), 4단계(Phase)로 순서대로 진행.
> 각 Phase는 이전 Phase가 끝난 뒤 진행 권장 (의존성 있음).

---

## Phase 1: 토큰 자동 갱신 활성화 (선행 조건 없음, 최우선)

**목적**: Branch B(50일마다 자동 실행)가 지금 `active: false`라 한 번도 실제로 작동한 적이 없음. 이걸 켜지 않으면 아무리 다른 걸 자동화해도 60일 뒤 토큰 만료로 전체가 멈춤.

**작업**:
1. n8n-mcp로 라이브 워크플로우(`쿠팡 파트너스 - Threads 자동 포스팅`) 조회
2. `active: true`로 변경 (workflow-level activation)
3. 활성화 전, `현재 토큰 불러오기 (갱신용)` 노드의 `SEED_TOKEN`이 아직 유효한 토큰인지(60일 이내 발급분인지) 확인 — 만료된 상태로 켜면 첫 갱신 시도부터 실패

**완료 기준**: 워크플로우 Active 상태, Executions 탭에서 향후 스케줄 실행 예정 시각 확인 가능

---

## Phase 2: 상품 정보 큐 — 구글 시트 연동

**목적**: 지금 `상품 정보 입력` Set 노드에 하드코딩된 예시 데이터를 없애고, 사람은 "상품 URL 나열"만 하면 나머지(링크 생성, 게시, 사용 표시)가 전부 자동으로 돌게 함.

**시트 스키마** (새 구글 시트 생성, 헤더 행):

| product_title | product_desc | product_url | affiliate_link | status |
|---|---|---|---|---|
| (사람이 입력) | (사람이 입력) | (사람이 입력) | (자동 채워짐) | (자동 관리) |

`status` 값 3가지:
- `new` — 사람이 방금 입력, 아직 링크 생성 안 됨
- `ready` — 링크 생성 완료, 게시 대기 중
- `used` — 게시 완료

**사람이 할 일**: 시트에 상품 발굴해서 `product_title`, `product_desc`, `product_url` 3개 컬럼만 채우고 `status`를 `new`로 표시 (또는 빈 칸 = new로 간주). **이게 앞으로 유일하게 남는 수기 작업**입니다.

**n8n 작업**:
1. Google Sheets OAuth2 Credential 생성 (n8n Credentials → Google Sheets → Sign in with Google)
2. 메인 워크플로우의 `상품 정보 입력`(Set 노드) 삭제
3. 대체 노드 `다음 상품 가져오기` 추가 (Google Sheets, Get Row(s), 필터: `status = ready`, Return All 끔 — 즉 게시 파이프라인은 `ready` 상태만 가져감)
4. `NVIDIA 요청 만들기`, `응답 파싱 및 댓글 텍스트 구성` 두 노드 안의 `$('상품 정보 입력')` 참조를 전부 `$('다음 상품 가져오기')`로 변경
5. 파이프라인 맨 끝(`댓글 게시 (제휴링크)` 다음)에 `사용한 상품 표시` 노드 추가 (Google Sheets, Update Row, match on `row_number`, `status` 컬럼을 `used`로 변경)

**완료 기준**: 시트에 테스트 행 하나(`status=ready`, 임시 affiliate_link) 넣고 워크플로우 실행 → 게시 후 해당 행 `status`가 `used`로 자동 변경되는지 확인

---

## Phase 3: Apify 제휴링크 자동 생성 완성 (사람 협조 필요한 유일한 Phase)

**목적**: `status=new`인 행(링크 없음)을 찾아서 Apify로 제휴링크 자동 생성 → 시트에 `affiliate_link` 채우고 `status`를 `ready`로 변경. 이게 완성되면 Phase 2의 "사람 입력"이 진짜로 URL만 넣으면 끝나는 수준이 됨.

**⚠️ 선행 필요**: `apify-actor-main.js`의 TODO 4곳(로그인 세션 판별, URL 입력창, 생성 버튼, 결과 추출)이 아직 실제 페이지 구조를 모르는 상태의 추정값입니다. 이 Phase를 완성하려면:
1. 사람이 쿠팡 파트너스 간편링크 페이지에서 개발자도구(F12) → Elements 탭 열고
2. URL 입력창, 생성 버튼, 결과 표시 영역 각각 우클릭 → "검사" → 보이는 HTML 태그/속성(id, class, placeholder 등) 캡처해서 공유
3. 이 정보를 받아야 Actor 코드의 TODO를 실제 값으로 확정 가능 (Claude가 이 페이지에 직접 접속 불가하므로 이 단계는 대행 불가능)

**추가 필요 작업**:
1. `capture-coupang-session.js`를 로컬에서 1회 실행 → `coupang-session.json` 생성 → Apify Secret Input으로 등록
2. Apify Actor 배포 (Actor 코드는 TODO 확정 후 완성)
3. n8n에 새 서브 워크플로우 `제휴링크 자동 생성` 추가:
   ```
   [Schedule: 1시간마다]
     → [Google Sheets: status=new 행 전체 가져오기]
     → [반복(Loop): 각 행마다]
         → [Apify: Run Actor] (productUrl 전달)
         → [Apify: Get Dataset Items] (결과 받기)
         → [Google Sheets: Update Row] (affiliate_link 채우고 status=ready로 변경)
   ```
4. Apify Actor가 `SESSION_EXPIRED` 반환 시 → 이 서브 워크플로우도 실패 처리되도록 해서 오류 알림(Phase 완료 후)이 텔레그램으로 가게 함

**완료 기준**: 시트에 URL만 있는 새 행 추가 → 1시간 내(또는 수동 실행 시 즉시) `affiliate_link`가 자동으로 채워지고 `status=ready`로 바뀜

---

## Phase 4: 게시 스케줄 완전 자동화 (검수 단계 없음)

**목적**: 하루 3번(9시/13시/21시) 사람 개입 없이 자동 게시.

**작업**:
1. 메인 워크플로우에 Schedule Trigger 추가 (기존 Manual Trigger는 테스트용으로 유지, 삭제하지 않음)
   - Trigger Rule 3개: Days / Hour 9,Minute 0 · Hour 13,Minute 0 · Hour 21,Minute 0
2. 이 Schedule Trigger를 Phase 2에서 만든 `다음 상품 가져오기` 노드로 연결 (Manual Trigger와 같은 지점)
3. n8n 인스턴스 시간대가 `Asia/Seoul`인지 확인
4. 검수 단계 없음 — Phase 2/3이 끝난 상태라면 이 시점부터 별도 승인 로직 추가할 필요 없이 그대로 자동 게시됨
5. 워크플로우 `active: true` 확인 (Phase 1에서 이미 켰다면 유지)

**완료 기준**: 다음 스케줄 시각에 실제로 게시물이 자동으로 올라가는지, Executions 탭에서 자동 실행 기록 확인

---

## 전체 완료 후 최종 상태

```
[사람이 하는 일]
  구글 시트에 상품 URL/제목/설명만 입력 (하루 몇 번이든, 여유 있을 때)

[전부 자동]
  1시간마다: 새 URL → 제휴링크 자동 생성 (Apify)
  9시/13시/21시: 큐에서 상품 하나 꺼내 → AI 콘텐츠 생성 → Threads 게시 → 댓글에 링크 게시 → 사용 표시
  50일마다: Threads 토큰 자동 갱신
  실패 시: 텔레그램으로 즉시 알림 (비개발자용 쉬운 설명 포함)
```

---

## 진행 순서 요약

| Phase | 선행조건 | 사람 개입 필요 여부 |
|---|---|---|
| 1. 토큰 갱신 활성화 | 없음 | 없음 (SEED_TOKEN 유효성만 확인) |
| 2. 구글시트 큐 연동 | Phase 1 권장 | Google 계정 로그인 1회 |
| 3. Apify 링크 생성 완성 | Phase 2 | **개발자도구 셀렉터 정보 제공 필수** |
| 4. 게시 스케줄 자동화 | Phase 2, 3 | 없음 |

Phase 3만 사람 협조가 필수이고, 나머지는 Claude Code + n8n-mcp로 순서대로 진행 가능합니다.
