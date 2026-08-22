# 쿠팡 파트너스 × Threads 자동 포스팅 — 프로젝트 스펙

> VS Code / Claude Code에서 이어서 작업하기 위한 핸드오프 문서입니다.
> 마지막 업데이트 시점: 2026-07-23, `/pdca analyze` 갭 분석(`docs/03-analysis/coupang-threads-auto-posting.analysis.md`) 결과를 바탕으로 n8n-mcp를 통해 라이브 워크플로우에 직접 수정 적용 완료. reply_to_id 버그는 `.first()` 수정 적용 완료(실전 확인 대기), 오류 알림 워크플로우는 실제로 새로 만들었음(텔레그램 Credential 연결 전까지는 게시 불가).

---

## 1. 프로젝트 목표

쿠팡 파트너스 제휴 마케팅을 위한 Threads(구 인스타그램 스레드) 자동 포스팅 파이프라인.

**운영 방식**: 본문에 스토리텔링(후킹 + 공감 + 상품 소개)을 자연어로 작성해 게시하고, 댓글에 쿠팡 파트너스 제휴 링크를 삽입해 클릭을 유도.

**현재 단계**: 계정 1개로 운영 (볼륨 확장은 추후 검토), 상품 소싱은 수동(추후 파트너스 API 연동 예정).

**핵심 제약사항**:
- 쿠팡 파트너스 운영정책 준수 (경제적 이해관계 표시 필수)
- 완전 무인 자동화보다 최소한의 검수 단계 유지 권장 (저품질 양산 콘텐츠 조항 리스크)

---

## 2. 아키텍처 — n8n 워크플로우 2개

### 워크플로우 A: `쿠팡 파트너스 - Threads 자동 포스팅` (메인)
파일: `coupang_threads_workflow.json`

두 개의 독립된 브랜치가 한 워크플로우 안에 있고, `$getWorkflowStaticData('global')`을 통해 Threads 액세스 토큰을 공유합니다 (별도 DB 없이 워크플로우 자체 저장소 사용).

```
[Branch A: 포스팅]
포스팅 실행 (테스트-수동)
  → 설정값 (필수 입력)
  → 상품 정보 입력
  → 현재 토큰 불러오기
  → NVIDIA 요청 만들기
  → 스토리텔링 생성 (NVIDIA API)
  → 응답 파싱 및 댓글 텍스트 구성
  → 본문 컨테이너 생성
  → 대기 30초 (본문)
  → 본문 게시
  → 대기 30초 (게시 확인)   ← 2026-07-23 라이브에서 추가된 노드 (전파 지연 대응)
  → 댓글 컨테이너 생성
  → 대기 30초 (댓글)
  → 댓글 게시 (제휴링크)

[Branch B: 토큰 자동 갱신]
50일마다 자동 실행
  → 현재 토큰 불러오기 (갱신용)
  → 토큰 갱신 요청
  → 새 토큰 저장
```

### 워크플로우 B: `쿠팡 파트너스 - 오류 알림 (텔레그램)` (별도 워크플로우)
파일: `coupang_threads_error_alert.json` / 라이브 n8n 워크플로우 id `j8NT6Clw2sGilnnx`

> ⚠️ 2026-07-23 갭 분석에서 발견: 이 문서는 원래 이 워크플로우가 이미 만들어진 것처럼 서술했지만, 실제로는 **라이브 n8n 인스턴스에도 로컬 파일로도 존재하지 않았음** (설계만 있고 구현되지 않은 상태). 갭 분석 직후 실제로 새로 생성함. 다만 **텔레그램 Bot Credential이 계정에 없어 아직 게시(publish) 불가** — n8n은 Credential 미설정 노드가 있으면 워크플로우 게시를 거부함. 텔레그램 봇 토큰 + Chat ID를 발급받아 연결해야 메인 워크플로우의 Error Workflow로 연동 완료됨.

메인 워크플로우의 **Settings → Error Workflow**에 연결될 예정(현재는 미연결)이며, 연결되면 자동/스케줄 실행이 실패할 때 트리거됨 (수동 테스트 실행 실패는 감지 안 됨 — n8n의 의도된 동작).

```
오류 발생 감지 (Error Trigger)
  → 에러를 쉬운 말로 변환 (패턴 매칭, AI 호출 없음 — 이중 실패 방지)
  → 텔레그램으로 알림 보내기
```

---

## 3. Branch A 노드 상세

### `설정값 (필수 입력)` (Set)
| 필드 | 값 |
|---|---|
| `threads_user_id` | 사용자가 직접 입력함 (실제 값은 n8n 캔버스에서 확인 — `me?fields=id,name`으로 조회한 값) |

### `상품 정보 입력` (Set)
현재 테스트용 예시 데이터가 채워져 있음 (실전 사용 시 매번 교체 필요, 추후 API 연동 시 이 노드를 API 호출 노드로 교체 예정):
| 필드 | 예시값 |
|---|---|
| `product_title` | 3in1 무선 핸디 청소기 |
| `product_desc` | 강력한 흡입력과... (상품 상세 설명) |
| `product_url` | 원본 쿠팡 상품 URL (참고용) |
| `affiliate_link` | 파트너스 간편링크로 변환된 실제 값 |

### `현재 토큰 불러오기` (Code, mode: `runOnceForAllItems`)
```javascript
const staticData = $getWorkflowStaticData('global');
const SEED_TOKEN = 'PASTE_YOUR_60DAY_TOKEN_HERE_ONCE';

if (!staticData.access_token) {
  if (!SEED_TOKEN || SEED_TOKEN.indexOf('PASTE_') === 0) {
    throw new Error('토큰이 없습니다. 이 노드 코드 안의 SEED_TOKEN 값을 실제 60일 토큰으로 한 번만 바꿔주세요.');
  }
  staticData.access_token = SEED_TOKEN;
}

return [{ json: { access_token: staticData.access_token } }];
```
> `SEED_TOKEN`은 최초 1회만 실제 토큰으로 교체. 이후엔 static data가 값을 유지/갱신함.

### `NVIDIA 요청 만들기` (Code, mode: `runOnceForAllItems`)
- `$('상품 정보 입력').first().json`에서 상품 정보를 읽어 프롬프트 구성
- **핵심 설계**: 경제적 이해관계 문구는 AI에게 절대 쓰지 말라고 명시 (다음 노드에서 코드로 강제 삽입하기 위함, LLM 출력 신뢰 안 함)
- 모델: `meta/llama-3.3-70b-instruct` (원래 `nvidia/nemotron-3-ultra-550b-a55b`였으나 무료 티어 혼잡/503 에러로 `meta/llama-3.1-8b-instruct`로 교체 → 이후 라이브에서 다시 `meta/llama-3.3-70b-instruct`로 교체, 톤앤매너도 반말/친구체+전언형 표현+이모지 1~2개 필수+200바이트 제한으로 전면 재작성됨. 이 문서는 2026-07-23 갭 분석 시점 기준으로 갱신)
- 요청 형식: OpenAI 호환 (`messages`, `max_tokens`, `temperature`)

### `스토리텔링 생성 (NVIDIA API)` (HTTP Request)
- `POST https://integrate.api.nvidia.com/v1/chat/completions`
- 인증: Generic Credential → Header Auth → Credential명 `NVIDIA API Key` (Header Name: `Authorization`, Value: `Bearer nvapi-...`)
- Body: `{{ JSON.stringify($json.ai_request) }}`

### `응답 파싱 및 댓글 텍스트 구성` (Code, mode: `runOnceForAllItems`)
```javascript
// 쿠팡 파트너스 운영정책 61p 권장 문구 - 절대 변형하지 않음 (조건부/불확실 표현 금지 조항 대응)
const DISCLOSURE = '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

const aiResponse = $input.first().json;
const productInfo = $('상품 정보 입력').first().json;
const tokenInfo = $('현재 토큰 불러오기').first().json;
const config = $('설정값 (필수 입력)').first().json;

// NVIDIA API는 OpenAI 호환 형식: choices[0].message.content 에 텍스트가 들어있음
const messageContent = aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message
  ? aiResponse.choices[0].message.content
  : null;

if (!messageContent) {
  throw new Error('NVIDIA API 응답에서 텍스트를 찾을 수 없습니다. 응답: ' + JSON.stringify(aiResponse));
}

let storyText;
try {
  const parsed = JSON.parse(messageContent);
  storyText = parsed.post_text;
} catch (e) {
  storyText = messageContent;
}

if (!storyText) {
  throw new Error('post_text를 추출하지 못했습니다.');
}

// 안전장치: LLM이 문구를 스스로 넣었다면 중복 제거 후 코드가 한 번만 배치
storyText = storyText.split(DISCLOSURE).join('').trim();

// 문구를 게시물 가장 첫 줄에 단독 배치 (운영정책 61p 요건)
const postText = `${DISCLOSURE}\n\n${storyText}`;

// 댓글도 문구를 링크보다 먼저 배치
const commentText = `${DISCLOSURE}\n\n자세한 정보와 구매는 아래 링크에서 확인하세요\n${productInfo.affiliate_link}`;

return [{
  json: {
    post_text: postText,
    comment_text: commentText,
    access_token: tokenInfo.access_token,
    threads_user_id: config.threads_user_id
  }
}];
```

### `본문 컨테이너 생성` (HTTP Request)
- `POST https://graph.threads.net/v1.0/{{ $json.threads_user_id }}/threads`
- Query: `media_type=TEXT`, `text={{ $json.post_text }}`, `access_token={{ $json.access_token }}`

### `대기 15초 (본문)` (Wait) — 컨테이너 처리 시간 확보

### `본문 게시` (HTTP Request)
- `POST .../threads_publish`
- Query: `creation_id={{ $json.id }}` (직전 Wait 노드가 그대로 전달한 컨테이너 응답), `access_token={{ $('응답 파싱 및 댓글 텍스트 구성').first().json.access_token }}`

### `댓글 컨테이너 생성` (HTTP Request)
- `POST .../threads`
- Query: `media_type=TEXT`, `text={{ ...comment_text }}`, **`reply_to_id={{ $('본문 게시').first().json.id }}`**, `access_token=...`
- ⚠️ **현재 디버깅 중인 지점** — 아래 6번 섹션 참고

### `대기 15초 (댓글)` (Wait)

### `댓글 게시 (제휴링크)` (HTTP Request)
- `POST .../threads_publish`
- Query: `creation_id={{ $json.id }}`, `access_token=...`

---

## 4. Branch B 노드 상세

### `50일마다 자동 실행` (Schedule Trigger)
- `rule.interval`: `{field: "days", daysInterval: 50}`

### `현재 토큰 불러오기 (갱신용)` (Code) — Branch A와 동일 로직, SEED_TOKEN도 동일 값 입력 필요

### `토큰 갱신 요청` (HTTP Request)
- `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token={{ $json.access_token }}`

### `새 토큰 저장` (Code)
```javascript
const staticData = $getWorkflowStaticData('global');
const response = $input.first().json;

if (!response.access_token) {
  throw new Error('토큰 갱신 응답에 access_token이 없습니다. 응답: ' + JSON.stringify(response));
}

staticData.access_token = response.access_token;
staticData.refreshed_at = new Date().toISOString();
staticData.expires_at = new Date(Date.now() + (response.expires_in || 0) * 1000).toISOString();

return [{
  json: {
    message: '토큰 갱신 완료',
    new_expires_at: staticData.expires_at
  }
}];
```

---

## 5. 오류 알림 워크플로우 상세

### `오류 발생 감지` (Error Trigger)
n8n 표준 노드. 입력 데이터 형태:
```json
{
  "execution": {
    "id": "...",
    "url": "...",
    "error": { "message": "...", "stack": "..." },
    "lastNodeExecuted": "실패한 노드 이름",
    "mode": "..."
  },
  "workflow": { "id": "...", "name": "..." }
}
```

### `에러를 쉬운 말로 변환` (Code)
- 노드 이름 → 비개발자용 친근한 단계명 매핑 딕셔너리 포함
- 에러 메시지 키워드 패턴 매칭 (`authorization`, `resourceexhausted`/`503`, `access_token`+`expired`, `json' property isn't an object`, `creation_id`/`threads_publish` 등) → 친절한 설명 + 대처법 생성
- **의도적으로 AI API를 다시 호출하지 않음** (에러 핸들러 자체가 실패하면 알림이 영영 안 오므로, 최대한 단순/독립적으로 설계)

### `텔레그램으로 알림 보내기` (n8n-nodes-base.telegram)
- Credential: `telegramApi` 타입, Access Token = Bot Token
- `chatId`, `text={{ $json.telegram_message }}`

---

## 6. 리플라이 버그 — 수정 적용 완료, 실전 확인 대기 (2026-07-23 업데이트)

**증상**: 워크플로우 정상 실행되어 본문은 게시되지만, `댓글 게시 (제휴링크)`가 **본문에 대한 답글이 아니라 새로운 독립 피드 게시물**로 올라감.

**2026-07-23 갭 분석에서 새로 확인된 사실**: 이 문서는 원래 ".first() 수정을 JSON 파일에는 반영, 라이브 캔버스 반영은 미확인"이라고 서술했지만, `n8n-mcp`로 라이브 워크플로우를 직접 조회한 결과 **라이브 캔버스는 여전히 `.item`을 쓰고 있었음** — 로컬 파일의 수정이 실제로는 라이브에 전혀 반영되지 않았던 것. 대신 라이브 캔버스에는 전혀 다른, 문서화되지 않은 수정이 이미 적용되어 있었음: `본문 게시` 직후에 "대기 30초 (게시 확인)" 노드가 추가되어 있고, 그 노드에 "Threads 백엔드에 아직 전파되지 않아 답글이 아닌 독립 피드 게시물로 처리될 수 있어 추가된 지연"이라는 메모가 달려 있었음 (pairedItem 단절이 아니라 **전파 지연**이 원인이라는 별도 가설).

**적용한 수정** (2026-07-23, `n8n-mcp`의 `update_workflow`로 라이브 워크플로우에 직접 적용):
1. `응답 파싱 및 댓글 텍스트 구성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)` 4개 노드 전체를 `.item` → `.first()`로 통일 (라이브 캔버스 기준)
2. 기존에 추가되어 있던 "대기 30초 (게시 확인)" 노드는 그대로 유지 — 두 가설(pairedItem 단절 / 전파 지연) 모두에 대한 대응을 동시에 적용
3. 로컬 `coupang_threads_workflow.json`도 라이브와 동일하게 재동기화 완료

**다음 확인할 것 (아직 미완료)**:
1. 실제로 워크플로우를 한 번 실행해서 Threads 앱에서 댓글이 진짜 답글로 붙는지 직접 확인 — **주의: 이건 실제 공개 게시물을 만드는 행위라서 사용자 승인 없이 실행하지 않음**
2. n8n **Executions** 탭에서 `본문 게시` 노드 Output의 실제 `id` 값과, `댓글 컨테이너 생성`에 전달된 `reply_to_id` 실제 값 확인 (실행 성공 여부만으로는 답글 여부를 알 수 없음 — Threads API는 `reply_to_id`가 비어도 에러를 내지 않음)

---

## 7. 지금까지 겪은 이슈 히스토리 (해결됨)

| # | 증상 | 원인 | 해결 |
|---|---|---|---|
| 1 | Code 노드에서 `A 'json' property isn't an object` | Code 노드 mode가 `runOnceForEachItem`인데 `return [{json:...}]`(배열)로 반환 | 모든 Code 노드 mode를 `runOnceForAllItems`로 통일 |
| 2 | NVIDIA 노드에서 `Missing request extension: Authorization` | Credential Value에 `Bearer ` 접두사 누락 | Value를 `Bearer nvapi-...` 형식으로 수정 |
| 3 | NVIDIA에서 `ResourceExhausted 503` | `nemotron-3-ultra-550b-a55b`(550B 초대형 모델) 무료 티어 혼잡 | `meta/llama-3.1-8b-instruct`(경량 모델)로 교체 |
| 4 | Threads 게시 시 `code 1, unknown error (OAuthException)` | 원인 규명 중 발견: 토큰이 실제로 만료된 상태였음 (`Session has expired`) | 토큰 재발급 + 60일 교환 재수행 |
| 5 | 그래프 API 탐색기에서 `Received Invalid JSON reply` | 탐색기 자체의 알려진 버그성 이슈로 추정 (curl로 우회하여 진단) | curl 직접 테스트로 원인 특정 (문제 4로 귀결) |
| 6 | 댓글이 답글이 아닌 새 피드로 게시 | `.item` 참조의 pairedItem 연결 끊김 추정 (+ Threads 백엔드 전파 지연 가설도 병행) | `.first()`로 전면 교체 + 30초 대기 노드 추가, 2026-07-23 라이브 워크플로우에 직접 적용 완료 (**실전 답글 확인 대기 중**) |
| 7 | 갭 분석 결과 오류 알림 워크플로우가 실제로는 미구현 상태였음 | 문서에는 구현된 것처럼 서술했지만 라이브/로컬 어디에도 존재하지 않았음 | 2026-07-23 실제로 신규 생성 (`j8NT6Clw2sGilnnx`). 텔레그램 Credential 미보유로 게시(publish) 불가 상태 |
| 8 | Branch B 토큰 갱신 Code 노드가 `runOnceForEachItem`으로 되어 있었음 | 이슈 #1과 동일한 패턴의 잠재적 버그 (라이브에서 발생, 원인 불명) | 2026-07-23 `runOnceForAllItems`로 재수정 |

---

## 8. 외부 서비스 설정 정보

### Threads / Meta
- Meta 개발자 앱에 "Access the Threads API" Use Case 추가, 본인 계정을 Threads Tester로 등록 (앱 심사 불필요, 개인 계정 운용 한정)
- OAuth Scope: `threads_basic`, `threads_content_publish`, `threads_manage_replies`
- 토큰 발급: 그래프 API 탐색기 "Generate Threads Access Token" → 단기 토큰 → `th_exchange_token`으로 60일 장기 토큰 교환
- 갱신: `th_refresh_token` (Branch B가 50일마다 자동 수행)
- User ID 조회: `me?fields=id,name`

### NVIDIA
- build.nvidia.com에서 API 키(`nvapi-...`) 발급
- 엔드포인트: `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI 호환)

### Telegram
- `@BotFather`로 봇 생성 → Bot Token 발급
- 본인 Chat ID: 봇에게 메시지 전송 후 `https://api.telegram.org/bot<TOKEN>/getUpdates`에서 확인

---

## 9. 쿠팡 파트너스 정책 준수 설계 원칙

1. **경제적 이해관계 문구는 LLM이 아니라 코드가 강제 삽입** — 매 실행 100% 동일 위치(첫 줄)·동일 문구 보장
2. **문구는 본문과 댓글 양쪽 모두에 삽입**
3. **실제 체험 단정 표현 금지** — AI 프롬프트에 "제가 써보니" 같은 1인칭 체험 단정 대신 공감형 표현만 쓰도록 명시
4. **과장 표현 금지** — "최고", "최저가", "1등", "무조건" 등
5. **간편링크만 사용** — 원본 URL 그대로 쓰면 수익 미집계되므로 반드시 파트너스 간편링크 변환값 사용
6. 제외 카테고리 유의: 기프트카드, 유상 보증서비스, 삼성/애플 스마트폰(요율 1%), 의료기기/조제유류/건강기능식품(체험담 표현 금지 영역)

---

## 10. TODO / 다음 단계

- [x] ~~n8n MCP(쓰기 권한 있는 것) + Claude Code 연동 검토~~ — 이미 연동 완료 (`.mcp.json`에 `n8n-mcp` 서버 설정됨, 이번 갭 분석과 라이브 수정에 실제로 사용함)
- [x] `.first()` 수정을 **라이브 워크플로우에 직접** 적용 (2026-07-23) — 기존에 로컬 파일에만 반영되어 있던 것을 발견하고 실제 라이브에도 적용함
- [x] Branch B 토큰 갱신 Code 노드 모드 버그 수정 (`runOnceForEachItem` → `runOnceForAllItems`)
- [x] 오류 알림 워크플로우(Telegram) 실제 생성 (`j8NT6Clw2sGilnnx`) — 구조/로직 완성
- [ ] **최우선**: 댓글이 정상적으로 답글로 붙는지 실전 재검증 (Threads 앱에서 직접 확인 필요 — 실제 게시물을 만드는 행위라 사용자 승인 필요)
- [ ] **최우선**: 텔레그램 봇 토큰 + Chat ID 발급받아 Credential 연결 → 오류 알림 워크플로우 게시(publish) → 메인 워크플로우 Error Workflow로 연동
- [ ] `.mcp.json`에 평문으로 저장된 n8n MCP Bearer 토큰 처리 방침 결정 (로테이션 vs 별도 보관)
- [ ] Branch A 트리거를 Manual → Schedule로 전환할지 결정 (전환 시 최소한의 게시 전 검수 단계 유지 권장)
- [ ] 상품 소싱 수동 입력 → 쿠팡 파트너스 API(상품 API/딥링크 API) 연동으로 교체
- [ ] 60일 토큰 만료 전 자동 갱신 워크플로우(Branch B) 실제 1회 이상 정상 작동 확인될 때까지 모니터링 (현재 `active: false`라 스케줄 트리거가 실제로 발동한 적 없음)
- [ ] (보류) 여러 Threads 계정으로 볼륨 확장 — 계정 1개 안정화 후 재검토. Meta 스팸 탐지·쿠팡 저품질 양산 콘텐츠 정책 리스크 고려 필요

---

## 11. 관련 파일 목록

| 파일명 | 내용 |
|---|---|
| `coupang_threads_workflow.json` | 메인 워크플로우 (n8n 임포트용). 2026-07-23 기준 라이브 워크플로우와 재동기화 완료 (모델/프롬프트/대기시간/노드 구성 일치, 단 시크릿은 플레이스홀더 유지) |
| `coupang_threads_error_alert.json` | 오류 알림 워크플로우 (n8n 임포트용). **2026-07-23 이전에는 실제로 존재하지 않았음** — 갭 분석에서 발견되어 이번에 처음 생성됨. 라이브 워크플로우 id: `j8NT6Clw2sGilnnx` |
| `coupang_threads_guide.html` | 파이프라인 다이어그램 + 설정 가이드 (브라우저로 열람용, 임포트 대상 아님). **현재 프로젝트 폴더에 실제로 존재하지 않음 — 아직 만들어진 적 없는 것으로 보임** |
| `coupang_threads_project_spec.md` | 본 문서 |
| `docs/01-plan/features/coupang-threads-auto-posting.plan.md` | PDCA Plan 문서 |
| `docs/03-analysis/coupang-threads-auto-posting.analysis.md` | PDCA 갭 분석 문서 (Match Rate 44% → 라이브 수정 반영 후 재평가 필요) |

> ⚠️ 주의: 위 JSON 파일들은 "구조 스펙" 기준이며, 사용자가 n8n 라이브 캔버스에서 직접 입력한 값(Threads User ID, SEED_TOKEN, NVIDIA/Telegram Credential 연결, 상품 정보 등)은 파일에 반영되어 있지 않습니다. 라이브 캔버스가 최신 실제 상태입니다. 2026-07-23 갭 분석에서 로컬 파일과 라이브 캔버스가 상당히 어긋나 있던 것이 실제로 확인되었으니, 앞으로도 중요한 판단 전에는 `n8n-mcp`로 라이브 상태를 직접 조회해서 확인하는 것을 권장합니다.
