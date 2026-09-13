# 쿠팡 파트너스 – Threads 자동 포스팅: 멀티 계정 전환 작업지시서

> 작업 대상 파일: `쿠팡_파트너스_-_Threads_자동_포스팅__2_.json` (n8n export, 노드 73개, `active: true`)
> 이 문서는 실제 워크플로우 JSON을 직접 열어 코드/파라미터를 확인한 내용을 기준으로 작성했습니다.
> Claude Code에서 이 문서를 읽고 워크플로우 JSON을 직접 수정하는 용도로 사용하세요.

---

## 0. 왜 생각보다 쉬울 수 있는지 (먼저 알아야 할 것)

이 워크플로우는 이미 **계정 정보(threads_user_id, access_token)를 데이터로 취급**하고 있습니다. 모든 Threads API 호출 노드(`본문 컨테이너 생성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)`, `노출수 조회 (Threads Insights)`)는 n8n 자격증명이 아니라 `{{ $json.threads_user_id }}` / `{{ $json.access_token }}` 형태로 값을 **매번 상류 노드에서 받아 씀**니다.

즉 계정 판별 로직이 필요한 지점은 파이프라인 전체가 아니라 **입구(상품이 계정에 배정되는 지점)와 토큰 로딩 지점, 딱 두 군데**입니다. 나머지 8~9개 HTTP 요청 노드는 수정할 필요가 없습니다.

---

## 1. 현재 워크플로우 구조 (실물 확인)

### 1.1 5개 브랜치

| 브랜치 | 트리거 | 핵심 노드 |
|---|---|---|
| 수동 테스트 | `포스팅 실행 (테스트-수동)` | `설정값 (필수 입력)` → `상품 정보 입력` |
| 웹훅 자동 수집 | `쿠팡 상품 자동 수집 (Webhook)` (POST `/coupang-product-intake`) | `중복 상품 확인` → `중복이면 건너뛰기` → `상품 정보 입력 (자동)` |
| 6시간 큐 확인 | `6시간마다 시트 확인` | `시트 큐에서 미게시 상품 조회` → `제휴링크 있는 상품만 선택` → `상품 정보 입력 (시트)` |
| 50일 토큰 갱신 | `50일마다 자동 실행` | `현재 토큰 불러오기 (갱신용)` → `토큰 갱신 요청` → `새 토큰 저장` |
| 매일 조회수 갱신 | `매일 노출수 확인` | `게시완료 상품 조회 (노출수용)` → `media_id 있는 행만 필터링` → `Loop Over Items` → `노출수 조회 (Threads Insights)` |

3개 입력 브랜치(수동/웹훅/시트)는 각자 `상품 정보 입력*` 노드에서 끝나고, 전부 **하나의 공유 파이프라인**으로 합류합니다: `현재 토큰 불러오기` → NVIDIA 콘텐츠 생성 → `응답 파싱 및 댓글 텍스트 구성` → 본문 컨테이너/게시 → 댓글 컨테이너/게시 → `시트 소스 판단` → `게시 기록 저장 (중복방지)`.

각 취약 구간(NVIDIA 생성, 본문 생성, 시트조회, 게시완료표시, views기록)마다 재시도 카운트 → 재시도 가능 여부 IF → 대기 → 재시도 → 복구 시 텔레그램 알림, 소진 시 `stopAndError` 패턴이 반복 적용되어 있습니다. **새로 추가하는 노드도 이 패턴을 따라가는 게 일관성 있습니다** (특수히 계정 분류/토큰 로딩처럼 실패 가능 지점이면).

### 1.2 지금 이 순간 "계정"이 하드코딩된 정확히 3곳

| 노드 | 값 |
|---|---|
| `설정값 (필수 입력)` | `threads_user_id` = 고정 문자열 |
| `상품 정보 입력 (자동)` | `threads_user_id` = 동일한 고정 문자열 |
| `상품 정보 입력 (시트)` | `threads_user_id` = 동일한 고정 문자열 |

`응답 파싱 및 댓글 텍스트 구성` 코드에서 최종적으로 쓰는 값:
```js
const threadsUserId = (config && config.threads_user_id) || productInfo.threads_user_id;
```

### 1.3 액세스 토큰 로딩 구조

`현재 토큰 불러오기` 코드는 `$getWorkflowStaticData('global')`에 **단일 계정용 access_token 하나만** 저장합니다. 코드 안에 `SEED_TOKEN` 값이 실제 토큰 조각으로 하드코딩되어 있습니다 (여기서는 보안상 값을 옮겨 적지 않았습니다 — 이 자체가 그대로 남아있는 한 계정이 몇 개든 자격증명 이전이 먼저 필요합니다).

`매일 노출수 확인` 브랜치는 **루프 시작 전에 토큰을 한 번만 로딩**해서 모든 행에 재사용합니다 (`Loop Over Items` 이전에 `현재 토큰 불러오기 (조회수용)` 단일 실행). 멀티 계정에서는 이 위치가 반드시 고쳐야 할 지점입니다 — 지금 구조 그대로면 한 계정 토큰으로 다른 계정 media_id를 조회하게 됩니다.

### 1.4 중복 방지 로직 (예상과 다름 — 중요)

`중복 상품 확인` 코드는 Google Sheets가 아니라 **워크플로우 static data의 배열**(`staticData.posted_products`)로 중복을 판단합니다. `product_url`에서 정규식(`products/(\d+)`)으로 product_id를 뽑아 배열에 있는지만 확인합니다. Sheets 조회가 없어서 빠르고 실패 지점도 적습니다 — 이 방식은 유지하는 걸 권장합니다 (아래 3장 참고).

### 1.5 시트1 실제 컬럼

`affiliate_link`(매칭키), `posted`, `media_id`, 그리고 스키마 캐시에 남아있지만 현재 미매핑인 `product_title`, `price`, `product_desc`, `image_url`, `collected_at`, `row_number`.

---

## 2. 실물 확인된 기존 이슈 (멀티 계정과 별개로 선결 필요)

| 이슈 | 위치 | 확인 내용 |
|---|---|---|
| ~~광고 문구 본문 누락~~ | `응답 파싱 및 댓글 텍스트 구성` | **확정(2026-09-13)**: 공정위 문구는 `comment_text`에만 고지하는 것으로 결정. `post_text`에서 제거하는 현재 코드가 의도된 설계 — 수정 불필요 |
| ~~토큰 평문 하드코딩~~ | `현재 토큰 불러오기` | **해결됨**: `staticData.tokens[account_id]` 맵 구조로 전환 완료, `SEED_TOKEN` 리터럴 제거됨 |
| media_id 지수표기 | `시트에 게시완료 표시` / `views 값 파싱` | 이번 확인으로는 재현되지 않았으나, Sheets 컬럼 서식이 숫자로 되어 있다면 큰 media_id 값이 지수표기로 깨질 수 있음 — 시트1의 `media_id` 컬럼 서식을 "일반 텍스트"로 강제 지정했는지 확인 필요 |

**권장 순서**: 이 3가지는 계정이 1개든 5개든 반드시 고쳐야 하는 문제이므로, 멀티 계정 작업과 같은 세션에서 같이 처리하는 게 효율적입니다 (같은 노드들을 두 번 열게 되는 걸 피함).

---

## 3. 멀티 계정 전환에 필요한 변경사항

### 3.1 손댈 필요 없는 부분 (확인됨)

- 본문/댓글 생성·게시 HTTP 노드 8개 전부 — 이미 `$json.threads_user_id`, `$json.access_token` 참조라 계정 무관하게 동작
- `중복 상품 확인`의 product_id 추출 로직 — 계정 여부와 무관하게 전체 상품 대상 중복 체크로 그대로 유지 가능 (사용자 요구사항인 "계정 간에도 중복 없이"를 이미 만족)
- 재시도/알림 패턴 전체 — 그대로 재사용

### 3.2 계정 인식이 필요한 노드별 변경

| 노드 | 현재 | 변경 방향 |
|---|---|---|
| `설정값 (필수 입력)` / `상품 정보 입력 (자동)` / `상품 정보 입력 (시트)` | `threads_user_id` 하드코딩 | 값을 `={{ $json.account_id }}` 기반으로 계정 설정에서 조회한 실제 ID로 교체 (아래 3.4 계정설정 탭 참고) |
| `현재 토큰 불러오기` | `staticData.access_token` 단일값 | `staticData.tokens[account_id]` 객체로 확장. 입력 아이템의 `threads_user_id` 또는 `account_id`를 키로 사용 |
| `현재 토큰 불러오기 (갱신용)` / `토큰 갱신 요청` / `새 토큰 저장` | 계정 1개 전제 | 계정 리스트에 대해 Loop(Split In Batches)로 감싸서 계정별로 반복 갱신, `staticData.tokens[account_id]`에 개별 저장 |
| `현재 토큰 불러오기 (조회수용)` | 루프 시작 전 1회 로딩 | **Loop Over Items 안쪽으로 이동**, 각 행의 `account_id`로 토큰 선택 |
| `시트 큐에서 미게시 상품 조회` / `게시완료 상품 조회 (노출수용)` | account_id 없음 | 그대로 두되, 결과에 `account_id` 컬럼이 포함되도록 시트 스키마만 확장 (노드 파라미터 변경 불필요, 시트 자체에 컬럼 추가) |

### 3.3 신규 추가 노드

**웹훅 브랜치에 1개 추가**: `쿠팡 상품 자동 수집 (Webhook)` → **`상품 분류 및 계정 매핑` (신규 Code 노드)** → `중복 상품 확인`

```js
// 상품 분류 및 계정 매핑 (신규)
const ACCOUNT_MAP = [
  { account_id: 'acc_kitchen', threads_user_id: 'PASTE_ACTUAL_ID', keywords: ['주방', '조리', '냄비', '프라이팬', '청소기'] },
  { account_id: 'acc_camp',    threads_user_id: 'PASTE_ACTUAL_ID', keywords: ['캠핑', '텐트', '아웃도어', '등산'] },
  { account_id: 'acc_general', threads_user_id: 'PASTE_ACTUAL_ID', keywords: [] } // fallback, 항상 마지막
];

const body = $input.first().json.body || {};
const text = `${body.product_title || ''} ${body.product_desc || ''}`.toLowerCase();

let matched = ACCOUNT_MAP.find(a =>
  a.keywords.length && a.keywords.some(k => text.includes(k))
);
if (!matched) {
  matched = ACCOUNT_MAP.find(a => a.keywords.length === 0); // fallback 계정
}

return [{
  json: {
    ...$input.first().json,
    account_id: matched.account_id,
    threads_user_id: matched.threads_user_id
  }
}];
```

키워드 매칭에만 의존해서 **NVIDIA API를 호출하지 않습니다** — 서버사이드 장애 이력이 있는 NVIDIA 의존도를 늘리지 않기 위한 의도적 선택입니다. 애매한 상품은 전부 `acc_general`(예비 계정)로 자동 배정되어 사람 개입 없이 끝까지 처리됩니다.

계정/니치를 자주 바꾸실 계획이면, `ACCOUNT_MAP`을 Code에 박아두는 대신 시트의 `계정설정` 탭에서 읽어오는 방식으로 바꿀 수도 있습니다 (Google Sheets 노드 1개 추가, 대신 웹훅 경로에 API 호출이 하나 더 생김). 지금처럼 계정 수가 적을 때는 Code 노드 방식이 실패 지점이 적어 더 낫습니다.

### 3.4 시트1 스키마 추가

| 신규 컬럼 | 형식 | 용도 |
|---|---|---|
| `account_id` | 텍스트 | 배정된 계정 식별자 |
| `category` | 텍스트 (선택) | 분류 결과, 성과 분석용 |

`시트에 게시완료 표시` 노드의 매핑에 `account_id`를 추가로 기록하도록 columns.value에 한 줄만 더하면 됩니다 (`matchingColumns`는 `affiliate_link` 그대로 유지 — 계정이 늘어도 링크 자체는 여전히 유니크합니다).

**계정설정 탭 (신규, 별도 탭)** — 코드에 박아두지 않는 쪽을 택하실 경우:

| account_id | niche_keywords | threads_user_id | credential_name |
|---|---|---|---|
| acc_kitchen | 주방,조리,냄비 | (실제 ID) | Threads-Kitchen |
| acc_camp | 캠핑,텐트,아웃도어 | (실제 ID) | Threads-Camp |
| acc_general | (비움 = fallback) | (실제 ID) | Threads-General |

---

## 4. Claude Code 작업 순서 제안

1. **선결 과제 (계정 수 무관, 먼저)**
   - `응답 파싱 및 댓글 텍스트 구성`: `postText` 조합 시 앞에 광고 문구 추가
   - `현재 토큰 불러오기`: `SEED_TOKEN` 하드코딩 제거 → n8n Credential로 이전
   - 시트1 `media_id` 컬럼 서식을 텍스트로 강제 지정 확인
2. **계정 인프라**
   - `staticData.access_token` → `staticData.tokens[account_id]` 구조 변경 (`현재 토큰 불러오기`, `새 토큰 저장`, 50일 갱신 브랜치)
   - `현재 토큰 불러오기 (조회수용)`를 `Loop Over Items` 안쪽으로 재배치
3. **라우팅 로직**
   - `상품 분류 및 계정 매핑` 신규 Code 노드 추가 (웹훅 브랜치)
   - 3개 `상품 정보 입력*` 노드의 `threads_user_id` 하드코딩 제거
4. **시트 스키마**
   - `account_id`, `category` 컬럼 추가
   - `시트에 게시완료 표시` 매핑에 `account_id` 추가
5. **검증**
   - 계정 1개로 기존과 동일하게 동작하는지 회귀 테스트
   - 계정 2개로 확장 후 각각 다른 니치 상품으로 웹훅 테스트, 시트에 account_id가 정확히 분리되어 기록되는지 확인

---

## 5. 주의사항

- 이 워크플로우는 `active: true`인 라이브 워크플로우입니다. 전체 재임포트 대신 관련 노드만 캔버스에서 직접 수정하는 기존 원칙을 유지하세요.
- `SEED_TOKEN`, 실제 `threads_user_id` 등 자격증명 성격의 값은 이 문서와 이후 커밋/로그에 평문으로 남기지 않는 게 좋습니다.
- 계정을 추가할 때마다 반복해야 하는 작업은 최종적으로 "계정설정에 행 1개 추가 + Credential 1개 등록"만 남기는 게 목표입니다. 그 이상으로 코드 수정이 필요하다면 설계를 다시 점검하세요.
