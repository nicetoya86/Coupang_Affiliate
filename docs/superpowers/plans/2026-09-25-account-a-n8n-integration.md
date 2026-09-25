# 계정 A 영상 파이프라인 n8n 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬에서 만든 계정A 영상(Remotion+Cloudinary)이, 새 웹훅 없이 기존 n8n 3시간 게시 스케줄에 자연스럽게 편입되어 게시되도록 연결한다.

**Architecture:** 구글시트에 `video_url` 컬럼을 추가하고, `collect.html`에서 "계정A 영상용" 체크 시 로컬 신규 스크립트(`process-account-a.js`)가 백그라운드로 NVIDIA 훅문구 생성 → `render.js` 실행 → 제휴링크가 채워질 때까지 폴링 → 채워지면 그 행의 `video_url`만 기록한다. n8n 쪽은 기존 3시간 스케줄 체인의 정확히 4개 기존 노드에 조건부(`account_id === 'account_A'`) 분기를 추가해 이 준비된 영상을 집어가게 만든다 — 새 노드/새 웹훅은 만들지 않는다.

**Tech Stack:** Node.js(ESM, `video-remotion/`), Node.js(CommonJS, `scripts/`), googleapis, n8n Cloud(MCP로 원격 워크플로우 수정).

**Spec:** `docs/superpowers/specs/2026-09-25-account-a-n8n-integration-design.md`

## Global Constraints

- 계정 B 등 `account_id !== 'account_A'`인 모든 기존 경로는 이번 변경 전후로 **완전히 동일하게** 동작해야 한다 (조건부 분기만 추가, 기존 로직 대체 금지)
- n8n 워크플로우 `NgC6DlDTrW3tnygc`의 다음 4개 기존 노드만 수정한다: `제휴링크 있는 상품만 선택`, `계정 순번 배정 (시트큐)`, `상품 정보 입력 (시트)`, `응답 파싱 및 댓글 텍스트 구성`. 새 노드/새 웹훅 추가 금지 (스펙 §4.6)
- 구글시트: `1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA`, 시트명 `시트1`. 새 컬럼 `video_url`은 11번째(K열)로 추가 (스펙 §4.1)
- `process-account-a.js`의 폴링: 30초 간격, 최대 60회(30분) (스펙 §4.5)
- variant는 `jumpcut-closeup` 고정 (스펙 §4.5)
- `video-remotion/`은 독립 Node/ESM 프로젝트 — `scripts/`의 CommonJS 환경과 분리 유지, 새 의존성(`googleapis`)은 `video-remotion/package.json`에만 추가
- n8n 워크플로우 수정은 실제 게시(Threads API 호출)를 발생시키지 않는 `test_workflow`(pin data)로 먼저 검증한 뒤에만 "완료"로 간주한다

## Review Focus

- **n8n 4개 노드 수정이 회귀를 일으키는 경우**: `account_id`가 빈 문자열이거나 `account_B`인 기존 행이 수정 후에도 zoompan+라운드로빈으로 예전과 똑같이 처리되는지 — Task 8에서 시나리오 1로 명시적으로 검증
- **account_A 행인데 video_url이 아직 없는 경우**: 게시 시도 자체가 발생하지 않고 조용히 이번 턴을 건너뛰는지 (빈 배열 반환 후 하위 노드 미실행) — Task 8 시나리오 2
- **`시트에 게시완료 표시` 노드가 테스트 중 실제로 프로덕션 시트에 쓰기를 하는 경우**: `test_workflow`는 credentials 있는 노드를 자동으로는 안전하게 처리해주지 않으므로, 이 노드를 명시적으로 pin하지 않으면 실제 시트에 쓰기가 발생할 위험이 있음 — Task 8에서 반드시 이 노드도 pin 목록에 포함
- **제휴링크가 영영 안 채워지는 경우**: `process-account-a.js`가 무한 대기하지 않고 30분 뒤 타임아웃으로 종료하는지 — Task 5에서 타임아웃 로직 자체를 짧은 간격/횟수로 오버라이드해 실제로 타임아웃 경로가 도는지 테스트
- **같은 상품명이 시트에 중복 존재하는 경우**: 폴링이 엉뚱한 행을 찾아 video_url을 잘못된 행에 쓰는 위험 — Task 4에서 "제휴링크 있는" 조건까지 같이 확인하는 매칭 로직으로 테스트

---

## Task 1: `scripts/lib/sheetRow.js` — 컬럼 확장 (TDD)

**Files:**
- Modify: `scripts/lib/sheetRow.js`
- Test: `scripts/lib/sheetRow.test.js` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `SHEET_COLUMNS`(11개 문자열 배열), `toSheetRow(candidate, collectedAt)` — `candidate.account_id`/`candidate.video_url`을 선택적으로 받아 각각 없으면 빈 문자열로 채움. Task 7(`collect-server.js`)이 `candidate.account_id`를 채워서 호출한다.

- [ ] **Step 1: 기존 테스트가 여전히 통과하는지 먼저 확인 (베이스라인)**

Run: `cd scripts && node --test lib/sheetRow.test.js`
Expected: 기존 2개 테스트 PASS (수정 전 베이스라인 확인용)

- [ ] **Step 2: 새 컬럼을 검증하는 실패하는 테스트 추가**

`scripts/lib/sheetRow.test.js`에 아래 테스트를 추가한다 (기존 2개 테스트는 그대로 둔다):

```js
test('account_id와 video_url을 지정하면 각각의 컬럼 위치에 들어간다', () => {
  const row = toSheetRow(
    {
      product_title: '테스트 상품',
      account_id: 'account_A',
      video_url: 'https://res.cloudinary.com/dqmdjn0o/video/upload/v1/test.mp4',
    },
    '2026-09-25T00:00:00.000Z',
  );
  assert.strictEqual(row.length, SHEET_COLUMNS.length);
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('account_id')], 'account_A');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('video_url')], 'https://res.cloudinary.com/dqmdjn0o/video/upload/v1/test.mp4');
});

test('account_id/video_url을 안 넘기면 빈 문자열로 채운다 (기존 4개 호출부 호환성)', () => {
  const row = toSheetRow({ product_title: '제목만' }, '2026-09-25T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('account_id')], '');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('video_url')], '');
  assert.strictEqual(row.length, 11);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd scripts && node --test lib/sheetRow.test.js`
Expected: 새로 추가한 2개 테스트가 FAIL (`SHEET_COLUMNS.indexOf('account_id')`가 `-1`이라 `row[-1]`이 `undefined`라서 실패, 또는 `row.length`가 7이라 실패)

- [ ] **Step 4: `sheetRow.js` 수정**

```js
const SHEET_COLUMNS = ['collected_at', 'product_title', 'price', 'product_desc', 'affiliate_link', 'image_url', 'posted', 'media_id', 'views', 'account_id', 'video_url'];

function nowKstIso() {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().replace('Z', '+09:00');
}

function toSheetRow(candidate, collectedAt) {
  return [
    collectedAt,
    candidate.product_title || '',
    candidate.price || '',
    candidate.product_desc || '',
    candidate.affiliate_link || '',
    candidate.image_url || '',
    '',
    '',
    '',
    candidate.account_id || '',
    candidate.video_url || '',
  ];
}

module.exports = { SHEET_COLUMNS, toSheetRow, nowKstIso };
```

- [ ] **Step 5: 전체 테스트 통과 확인 (기존 2개 + 신규 2개 = 4개)**

Run: `cd scripts && node --test lib/sheetRow.test.js`
Expected: PASS (4개 전부)

- [ ] **Step 6: 이 함수를 실제로 쓰는 4개 스크립트가 문법적으로 안전한지 확인**

Run: `cd scripts && node -c add-product.js && node -c collect-from-clipboard.js && node -c collect-server.js && node -c generate-coupang-link.js`
Expected: 에러 없음 (구문 체크만, 실제 실행은 아님 — 이 4개는 `toSheetRow`에 `account_id`/`video_url`을 안 넘기므로 동작 변화 없음)

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sheetRow.js scripts/lib/sheetRow.test.js
git commit -m "Extend sheetRow to carry account_id/video_url columns"
```

---

## Task 2: 실제 구글시트에 `video_url` 헤더 컬럼 추가 (1회성, 검증 포함)

**Files:**
- Create (임시, 실행 후 삭제): `scripts/add-video-url-header-tmp.js`

**Interfaces:**
- Consumes: 없음
- Produces: 실제 시트 `시트1`의 K1 셀에 `video_url` 텍스트. Task 4/5/8이 이 컬럼의 존재를 전제로 한다.

- [ ] **Step 1: 현재 헤더 행 확인 (변경 전 상태 기록)**

`scripts/add-video-url-header-tmp.js` 작성:

```js
require('dotenv').config();
const { createSheetsClient } = require('./lib/sheets');

const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || '시트1';

async function main() {
  const sheets = createSheetsClient(KEY_FILE);
  const before = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:Z1`,
  });
  console.log('변경 전 헤더:', JSON.stringify(before.data.values[0]));

  const headers = before.data.values[0];
  if (headers.includes('video_url')) {
    console.log('video_url 컬럼이 이미 존재합니다. 종료.');
    return;
  }

  const nextColIndex = headers.length; // 0-based
  const colLetter = String.fromCharCode('A'.charCodeAt(0) + nextColIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!${colLetter}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['video_url']] },
  });

  const after = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:Z1`,
  });
  console.log('변경 후 헤더:', JSON.stringify(after.data.values[0]));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

Run: `cd scripts && node add-video-url-header-tmp.js`
Expected: "변경 전 헤더"가 10개 컬럼(`...,"account_id"`)으로 끝나고, "변경 후 헤더"가 11번째로 `"video_url"`을 포함해서 출력됨.

- [ ] **Step 2: 헤더 컬럼 인덱스가 정확히 K(11번째)인지 확인**

`변경 후 헤더` 배열의 길이가 11이고 `arr[10] === 'video_url'`인지 위 콘솔 출력으로 직접 확인 (스펙 §4.1: 11번째 컬럼이어야 함).

- [ ] **Step 3: 임시 스크립트 삭제 (1회성 작업이므로 저장소에 남기지 않음)**

```bash
rm scripts/add-video-url-header-tmp.js
```

- [ ] **Step 4: 확인 커밋 없음 (이 태스크는 로컬 파일 변경이 없음 — 실제 프로덕션 시트만 변경됨)**

이 태스크는 git에 커밋할 파일이 없다 (임시 스크립트는 삭제됨, 시트 자체는 git 대상이 아님). 다음 태스크로 진행한다.

---

## Task 3: `video-remotion/nvidia-hook.js` — 훅 문구 생성 (TDD)

**Files:**
- Create: `video-remotion/nvidia-hook.js`
- Create: `video-remotion/nvidia-hook.test.js`

**Interfaces:**
- Consumes: 없음 (파싱/프롬프트 함수는 순수 함수, 네트워크 호출 함수만 fetch 사용)
- Produces:
  - `buildNvidiaPrompt(productTitle: string, productDesc: string): string`
  - `buildNvidiaRequestBody(productTitle: string, productDesc: string): object` (NVIDIA chat completions 요청 바디)
  - `parseNvidiaResponse(aiResponse: object): { postText: string, topicTag: string }`
  - `generateHookText(productTitle: string, productDesc: string, apiKey: string): Promise<string>` — Task 5가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse } from './nvidia-hook.js';

test('buildNvidiaPrompt embeds product title and description', () => {
  const prompt = buildNvidiaPrompt('테스트 상품명', '테스트 상품 설명');
  assert.ok(prompt.includes('테스트 상품명'));
  assert.ok(prompt.includes('테스트 상품 설명'));
  assert.ok(prompt.includes('JSON'));
});

test('buildNvidiaRequestBody uses the same model/params as the n8n prompt node', () => {
  const body = buildNvidiaRequestBody('제목', '설명');
  assert.equal(body.model, 'nvidia/nemotron-3-ultra-550b-a55b');
  assert.equal(body.max_tokens, 900);
  assert.equal(body.temperature, 0.9);
  assert.equal(body.messages[1].role, 'user');
  assert.ok(body.messages[1].content.includes('제목'));
});

test('parseNvidiaResponse extracts post_text and topic_tag from a clean JSON response', () => {
  const aiResponse = {
    choices: [{ message: { content: '{"post_text": "훅 문구 예시", "topic_tag": "생활"}' }, finish_reason: 'stop' }],
  };
  const result = parseNvidiaResponse(aiResponse);
  assert.equal(result.postText, '훅 문구 예시');
  assert.equal(result.topicTag, '생활');
});

test('parseNvidiaResponse strips a leading explanation before the JSON object', () => {
  const aiResponse = {
    choices: [{ message: { content: '여기 결과입니다:\n{"post_text": "정리된 훅", "topic_tag": "주방"}' }, finish_reason: 'stop' }],
  };
  const result = parseNvidiaResponse(aiResponse);
  assert.equal(result.postText, '정리된 훅');
});

test('parseNvidiaResponse throws a clear error when no message content exists', () => {
  const aiResponse = { choices: [] };
  assert.throws(() => parseNvidiaResponse(aiResponse), /텍스트를 찾을 수 없습니다/);
});

test('parseNvidiaResponse throws a clear error when the content is not valid JSON', () => {
  const aiResponse = { choices: [{ message: { content: '이건 JSON이 아님' }, finish_reason: 'stop' }] };
  assert.throws(() => parseNvidiaResponse(aiResponse), /유효한 JSON이 아닙니다/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd video-remotion && node --test nvidia-hook.test.js`
Expected: FAIL — `./nvidia-hook.js` 모듈 없음

- [ ] **Step 3: `nvidia-hook.js` 구현**

n8n의 `NVIDIA 요청 만들기`/`응답 파싱 및 댓글 텍스트 구성` 노드와 동일한 프롬프트·파싱 로직을 사용한다 (이번 세션 초반에 이미 배포한 최신 버전 — 5가지 훅 패턴 + 3줄 이모지 구조).

```js
function buildNvidiaPrompt(productTitle, productDesc) {
  return `다음 쿠팡 상품 정보를 바탕으로 스레드(Threads)에 올릴 후킹형 게시물 본문을 작성해줘.

[중요] 경제적 이해관계 표시 문구("이 게시물은 쿠팡 파트너스...")는 네가 쓰지 마. 그 문구는 별도 시스템이 게시물 맨 앞에 자동으로 붙인다. 너는 오직 후킹 본문만 작성한다.

[톤앤매너 - 가장 중요]
1. 반드시 반말로 작성할 것. 단, 무례하거나 건방지게 들리지 않고 친한 친구에게 다정하게 알려주듯 부드럽고 다정한 반말 톤으로 쓸 것 (하대하는 명령조 금지)
2. 광고 카피처럼 상품을 나열식으로 설명하지 말고, 친한 친구/지인한테만 살짝 귀홍해주는 듯한 편안한 대화체로 쓸 것 (예시: "있지,", "나만 알기 아깝워서 알려주는거든", "이거 아직 모르는 사람 많을걸" 같은 친밀한 표현 활용)
3. [매우 중요] 첫 문장을 문맥 없이 뜬금없는 감탄사나 표현(예: "역시나", "그거 알아?" 단독 사용 등)으로 시작하지 말 것. 대신 상대방이 공감할 만한 구체적인 상황이나 질문으로 자연스럽게 시작할 것 (예시: "~할 때마다 불편했던 적 있지?", "~때마다 귀찮았던 거 있지 않아?")
3-1. [스레드 알고리즘 대응 - 첫 줄이 가장 중요] 첫 문장은 가능한 한 물음표로 끝나는 질문형으로 작성할 것. 스레드 알고리즘은 첫 줄에서 스크롤을 멈추는 비율을 가장 먼저 보기 때문에, 공감형 상황 제시 + 질문형 어미 조합을 최우선으로 할 것.
3-2. [다양성 - 반복 패턴 회피] 도입부는 아래 5가지 패턴 중 매번 무작위로 하나를 골라 쓸 것 (같은 패턴을 연달아 반복하지 말 것):
   - 상황 공감형: "~할 때마다 ~했던 적 있지?"
   - 대비/반전형: "~인 줄 알았는데 아니었대"
   - 직접 질문형: "~ 어떻게 해결해?" / "~ 어떻게 골라?"
   - 손해회피 질문형: "~하면 손해 보는 거 아는 사람 있어?"
   - 반전 코멘트형: "가격 보고 두 번 확인함" 처럼 질문형이 아닌 짧고 임팩트 있는 리액션 한 줄로 시작 (감탄사 단독 사용 금지 규칙과는 별개로, 구체적 반응이라 허용됨)
4. [매우 중요] 절대 1인칭으로 상품을 직접 체험한 것처럼 단정하지 말 것. 아래 표현은 절대 사용 금지:
   - "~써보니", "~써봐는데", "~써본 결과", "~사용해보니" (직접 체험 단정)
   - "~하더라", "~하더라고" (회상형 어미 - 직접 목격/경험했다는 뉴앙스라 마찬가지로 금지)
   대신 "~하대", "~한다던데", "~하다던데" 같은 전언(hearsay)형 표현이나, "이런 고민 있지 않았어?", "~한 사람 많을걸" 같은 공감형/추측형 표현만 사용할 것
5. "나만 모르면 손해 볼 것 같은" 느낌을 주는 후킹 요소를 포함할 것
5-1. [선택 - 가격 힌트] 구체적인 가격 숫자는 언급하지 말되, "가격 보고 좀 놀람다던데", "생각보다 부담 없다던데" 같은 hearsay형 상대적 가성비 힌트를 자연스럽게 1개 포함하면 좋음 (필수는 아님, 문맥에 안 맞으면 생략할 것)

[작성 규칙]
6. 제휴 링크 상품에 대한 관심을 자연스럽게 유도하는 내용으로 작성할 것. 상품명이나 핵심 기능/장점은 숨기지 말고 자연스럽게 드러낼 것 — 정체를 의도적으로 숨기는 클릭베이트 방식은 스레드 알고리즘이 노출 억제 대상으로 분류할 위험이 있으므로 쓰지 말 것.
6-1. 대신 "이런 상황에 이게 왜 좋은지", "어떤 점이 편한지" 같은 공감 포인트로 흥미를 끌 것 (정체 은폐가 아니라 공감/후킹으로 관심 유도).
6-2. [필수] 마지막 문장은 읽는 사람의 진짜 의견이나 비슷한 경험을 묻는 질문형 한 문장으로 작성할 것 (예: 비슷한 고민 있었는지, 어떻게 해결했는지, 써본 적 있는지 등 직접적인 질문). "팔로우해줘", "팔로우 해두면 편함" 같은 팔로우 언급이나 "구매는 댓글 링크 클릭" 같은 직접적 상업적 문구는 절대 쓰지 말 것 — 팔로우 유도나 상업적 문구는 스레드 알고리즘이 follow-bait·광고성 콘텐츠로 감지해 노출을 억제함. 매번 다른 질문으로 자연스럽게 쓸 것 (특정 예문을 그대로 반복하지 말 것).
7. "최고", "최저가", "1등", "무조건" 등 객관적으로 입증하기 어려운 과장 표현은 쓰지 말 것
8. 문장이 자연스럽고 문법적으로 말이 되도록 작성할 것 (어색하거나 의미가 불분명한 표현 금지). 반드시 완결된 문장으로 끝낼 것 (문장이 중간에 끊기지 않도록 주의)
9. [필수 - 스크롤 후킹 구조 및 이모지] 본문을 줄바꿈으로 구분된 3줄 구조로 작성할 것 — ①훅 문장 ②공감/정보 문장 ③마지막 질문 문장. 각 줄 끝마다 이모지를 정확히 1개씩, 총 3개 배치할 것 (한 줄에 몰아 쓰지 말 것). 이모지는 그 줄의 감정·상황에 맞는 것으로 줄마다 다르게 고를 것 (예: 공감/놀람/궁금 계열). 하트·별 등 의미 없는 장식성 이모지 반복 남발 금지. 짧은 줄 + 줄마다 다른 이모지로 피드를 스크롤하는 사용자의 시선이 멈추도록 시각적 리듬을 만들 것
10. 전체 내용은 공백 포함 330바이트 이내로 작성할 것 (한글 기준 약 95~105자, 이모지 3개·줄바꿈 2개 포함해서 계산)
11. [필수] 응답은 오직 JSON 객체 하나만 출력할 것. 사고 과정, 풀이 설명, 코드블록 표시(백틱) 등 그 어떤 부가 텍스트도 절대 출력하지 말 것. 첫 글자부터 반드시 { 로 시작해야 함:
{"post_text": "여기에 후킹 본문만, 경제적 이해관계 문구는 절대 포함하지 않음", "topic_tag": "이 상품을 대표하는 카테고리 단어 1개 (예: 청소, 주방, 뷰티, 인테리어 등). 반드시 띄어쓰기·마침표·특수문자 없이 한글 또는 영문 단어 하나로, #은 붙이지 말 것"}

[상품명]
${productTitle}

[상품 설명]
${productDesc}`;
}

function buildNvidiaRequestBody(productTitle, productDesc) {
  return {
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    messages: [
      { role: 'system', content: 'detailed thinking off. Never output reasoning, explanation, or markdown code fences. Output must start with { and be valid JSON only.' },
      { role: 'user', content: buildNvidiaPrompt(productTitle, productDesc) },
    ],
    max_tokens: 900,
    temperature: 0.9,
    chat_template_kwargs: { enable_thinking: false },
  };
}

function sanitizeTopicTag(raw) {
  if (!raw) return '생활꿀템';
  let t = String(raw).trim().replace(/^#/, '').replace(/[\s.&]/g, '');
  if (!t) return '생활꿀템';
  return t.slice(0, 50);
}

function parseNvidiaResponse(aiResponse) {
  const messageContent = aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message
    ? aiResponse.choices[0].message.content
    : null;
  const finishReason = aiResponse.choices && aiResponse.choices[0] ? aiResponse.choices[0].finish_reason : null;

  if (!messageContent) {
    throw new Error('NVIDIA API 응답에서 텍스트를 찾을 수 없습니다. 응답: ' + JSON.stringify(aiResponse));
  }

  let jsonSlice = messageContent.trim();
  const firstBrace = jsonSlice.indexOf('{');
  const lastBrace = jsonSlice.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonSlice = jsonSlice.slice(firstBrace, lastBrace + 1);
  }

  jsonSlice = jsonSlice.replace(/\\\s+([nrtbf"\\/])/g, '\\\\$1');
  jsonSlice = jsonSlice.replace(/\\(?!["\\/bfnrtu])/g, '');

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error('NVIDIA 응답이 유효한 JSON이 아닙니다 (finish_reason=' + finishReason + '). 원문(300자): ' + messageContent.slice(0, 300));
  }

  if (!parsed.post_text) {
    throw new Error('post_text를 추출하지 못했습니다. 원문: ' + jsonSlice.slice(0, 300));
  }

  return { postText: parsed.post_text, topicTag: sanitizeTopicTag(parsed.topic_tag) };
}

async function generateHookText(productTitle, productDesc, apiKey) {
  const body = buildNvidiaRequestBody(productTitle, productDesc);
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error('NVIDIA API 호출 실패 (' + res.status + '): ' + JSON.stringify(json));
  }
  const { postText } = parseNvidiaResponse(json);
  return postText;
}

export { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse, generateHookText };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd video-remotion && node --test nvidia-hook.test.js`
Expected: PASS (6개 테스트 전부)

- [ ] **Step 5: Commit**

```bash
git add video-remotion/nvidia-hook.js video-remotion/nvidia-hook.test.js
git commit -m "Add local NVIDIA hook-text generator matching the n8n prompt/parser"
```

---

## Task 4: `video-remotion/sheet-sync.js` — 시트 폴링/업데이트 (TDD + 실제 연동 확인)

**Files:**
- Modify: `video-remotion/package.json` (`googleapis` 의존성 추가)
- Create: `video-remotion/sheet-sync.js`
- Create: `video-remotion/sheet-sync.test.js`

**Interfaces:**
- Consumes: 없음 (googleapis만 사용)
- Produces:
  - `createSheetsClient(keyFile: string): object`
  - `findColumnIndex(headerRow: string[], columnName: string): number` — 못 찾으면 -1
  - `columnIndexToLetter(index: number): string` (0→'A', 10→'K', ...)
  - `findReadyRow(sheets, spreadsheetId, sheetName, productTitle): Promise<{ rowNumber: number, row: object } | null>` — `product_title`이 일치하고 `affiliate_link`가 채워진 행을 찾음
  - `writeVideoUrl(sheets, spreadsheetId, sheetName, rowNumber, videoUrl): Promise<void>` — Task 5가 사용

- [ ] **Step 1: `package.json`에 `googleapis` 추가**

`video-remotion/package.json`의 `dependencies`에 `"googleapis": "^144.0.0"` 추가 후:

Run: `cd video-remotion && npm install`
Expected: 에러 없이 설치 완료

- [ ] **Step 2: 순수 함수(컬럼 인덱스 계산) 실패하는 테스트 작성**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { findColumnIndex, columnIndexToLetter } from './sheet-sync.js';

test('findColumnIndex finds the column by exact header name', () => {
  const headers = ['collected_at', 'product_title', 'price', 'account_id', 'video_url'];
  assert.equal(findColumnIndex(headers, 'video_url'), 4);
  assert.equal(findColumnIndex(headers, 'account_id'), 3);
});

test('findColumnIndex returns -1 when the header is missing', () => {
  const headers = ['collected_at', 'product_title'];
  assert.equal(findColumnIndex(headers, 'video_url'), -1);
});

test('columnIndexToLetter converts a 0-based index to a spreadsheet column letter', () => {
  assert.equal(columnIndexToLetter(0), 'A');
  assert.equal(columnIndexToLetter(9), 'J');
  assert.equal(columnIndexToLetter(10), 'K');
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd video-remotion && node --test sheet-sync.test.js`
Expected: FAIL — `./sheet-sync.js` 모듈 없음

- [ ] **Step 4: `sheet-sync.js` 구현**

```js
import { google } from 'googleapis';

function createSheetsClient(keyFile) {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function findColumnIndex(headerRow, columnName) {
  return headerRow.indexOf(columnName);
}

function columnIndexToLetter(index) {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

async function findReadyRow(sheets, spreadsheetId, sheetName, productTitle) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z`,
  });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const titleIdx = findColumnIndex(headers, 'product_title');
  const linkIdx = findColumnIndex(headers, 'affiliate_link');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[titleIdx];
    const link = row[linkIdx];
    if (title === productTitle && link && String(link).trim()) {
      const rowObject = {};
      headers.forEach((h, idx) => { rowObject[h] = row[idx] || ''; });
      return { rowNumber: i + 1, row: rowObject }; // 1-based, 헤더가 1행이므로 i=1 -> 2행
    }
  }
  return null;
}

async function writeVideoUrl(sheets, spreadsheetId, sheetName, rowNumber, videoUrl) {
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });
  const headers = headerRes.data.values[0];
  const colIdx = findColumnIndex(headers, 'video_url');
  if (colIdx === -1) {
    throw new Error('시트에 video_url 컬럼이 없습니다. Task 2를 먼저 실행하세요.');
  }
  const colLetter = columnIndexToLetter(colIdx);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${colLetter}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[videoUrl]] },
  });
}

export { createSheetsClient, findColumnIndex, columnIndexToLetter, findReadyRow, writeVideoUrl };
```

- [ ] **Step 5: 순수 함수 테스트 통과 확인**

Run: `cd video-remotion && node --test sheet-sync.test.js`
Expected: PASS (3개)

- [ ] **Step 6: 실제 시트 연동 수동 확인 (네트워크 필요, 자동화된 테스트 아님)**

`.env`에 `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=../scripts/service-account.json`, `GOOGLE_SHEET_ID=1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA`, `GOOGLE_SHEET_NAME=시트1`을 추가한다.

임시 확인 스크립트 `video-remotion/verify-sheet-sync-tmp.js` 작성:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSheetsClient, findReadyRow } from './sheet-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(__dirname, '.env'))) {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const sheets = createSheetsClient(path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE));
const result = await findReadyRow(sheets, process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_NAME, '존재하지_않는_상품명_테스트');
console.log('찾은 결과 (null이어야 정상):', result);
```

Run: `cd video-remotion && node verify-sheet-sync-tmp.js`
Expected: 에러 없이 실행되고 `찾은 결과 (null이어야 정상): null` 출력 (실제 시트에 접근은 성공했지만 해당 이름의 상품이 없어서 못 찾았다는 뜻 — 인증/연결 자체가 정상 작동함을 확인하는 것이 목적)

확인 후 임시 파일 삭제: `rm video-remotion/verify-sheet-sync-tmp.js`

- [ ] **Step 7: Commit**

```bash
git add video-remotion/package.json video-remotion/package-lock.json video-remotion/sheet-sync.js video-remotion/sheet-sync.test.js video-remotion/.env.example
git commit -m "Add Google Sheets polling/update helper for the account-A pipeline"
```

(`.env.example`에 `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`/`GOOGLE_SHEET_ID`/`GOOGLE_SHEET_NAME` 3줄을 Step 6에서 쓴 값 그대로 추가해서 커밋에 포함시킨다.)

---

## Task 5: `video-remotion/process-account-a.js` — 오케스트레이터 (실제 end-to-end 검증)

**Files:**
- Create: `video-remotion/process-account-a.js`

**Interfaces:**
- Consumes: Task 3의 `generateHookText`, Task 4의 `createSheetsClient`/`findReadyRow`/`writeVideoUrl`
- Produces: CLI `node process-account-a.js --json '{"productTitle","productDesc","price","imageUrl"}'` — 성공 시 시트에 `video_url` 기록 후 exit 0, 실패/타임아웃 시 exit 1 + stderr 메시지. Task 7(`collect-server.js`)이 이 CLI를 그대로 spawn한다.

- [ ] **Step 1: 구현**

```js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateHookText } from './nvidia-hook.js';
import { createSheetsClient, findReadyRow, writeVideoUrl } from './sheet-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 60; // 30초 * 60 = 30분

function loadEnvIfPresent() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export function parseArgs(argv) {
  const jsonIndex = argv.indexOf('--json');
  if (jsonIndex !== -1) {
    return JSON.parse(argv[jsonIndex + 1]);
  }
  const inputIndex = argv.indexOf('--input');
  if (inputIndex !== -1) {
    return JSON.parse(fs.readFileSync(argv[inputIndex + 1], 'utf8'));
  }
  throw new Error('--json <inline JSON> 또는 --input <파일 경로> 중 하나가 필요합니다.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForReadyRow(sheets, spreadsheetId, sheetName, productTitle, {
  intervalMs = POLL_INTERVAL_MS,
  maxAttempts = POLL_MAX_ATTEMPTS,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const found = await findReadyRow(sheets, spreadsheetId, sheetName, productTitle);
    if (found) return found;
    console.log(`[${attempt}/${maxAttempts}] "${productTitle}" 제휴링크 대기 중...`);
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return null;
}

async function main() {
  loadEnvIfPresent();

  const argv = process.argv.slice(2);
  let input;
  try {
    input = parseArgs(argv);
  } catch (e) {
    console.error('입력 파싱 실패: ' + e.message);
    process.exit(1);
  }

  if (!input.productTitle || !input.imageUrl) {
    console.error('입력 검증 실패: productTitle과 imageUrl은 필수입니다.');
    process.exit(1);
  }

  const nvidiaApiKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaApiKey) {
    console.error('입력 검증 실패: NVIDIA_API_KEY 환경변수가 필요합니다 (video-remotion/.env 확인).');
    process.exit(1);
  }

  console.log(`[${input.productTitle}] 훅 문구 생성 중...`);
  let hookText;
  try {
    hookText = await generateHookText(input.productTitle, input.productDesc || input.productTitle, nvidiaApiKey);
  } catch (e) {
    console.error('훅 문구 생성 실패: ' + e.message);
    process.exit(1);
  }
  console.log(`[${input.productTitle}] 훅 문구: ${hookText}`);

  console.log(`[${input.productTitle}] 영상 렌더링 중...`);
  let videoUrl;
  try {
    const renderInput = JSON.stringify({
      productImageUrl: input.imageUrl,
      price: input.price || '',
      hookText,
      variant: 'jumpcut-closeup',
    });
    videoUrl = execFileSync('node', ['render.js', '--json', renderInput], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    console.error('영상 렌더링/업로드 실패: ' + (e.stderr || e.message));
    process.exit(1);
  }
  console.log(`[${input.productTitle}] 영상 URL: ${videoUrl}`);

  const sheets = createSheetsClient(path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE));
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || '시트1';

  console.log(`[${input.productTitle}] 제휴링크 대기 시작 (최대 30분)...`);
  const ready = await pollForReadyRow(sheets, spreadsheetId, sheetName, input.productTitle);
  if (!ready) {
    console.error(`[${input.productTitle}] 30분 동안 제휴링크가 채워지지 않았습니다. video_url을 시트에 기록하지 못했습니다: ${videoUrl}`);
    process.exit(1);
  }

  await writeVideoUrl(sheets, spreadsheetId, sheetName, ready.rowNumber, videoUrl);
  console.log(`[${input.productTitle}] 완료: ${ready.rowNumber}행에 video_url 기록함.`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
```

- [ ] **Step 2: 타임아웃 경로를 짧은 시간에 실제로 검증**

`pollForReadyRow`를 짧은 파라미터로 직접 호출해서 "찾을 수 없을 때" 경로가 실제로 동작하는지 확인한다.

임시 확인 스크립트 `video-remotion/verify-poll-timeout-tmp.js` 작성:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSheetsClient } from './sheet-sync.js';
import { pollForReadyRow } from './process-account-a.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(__dirname, '.env'))) {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const sheets = createSheetsClient(path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE));
const result = await pollForReadyRow(
  sheets, process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_NAME,
  '절대로_존재하지_않을_상품명_' + Date.now(),
  { intervalMs: 500, maxAttempts: 3 }
);
console.log('결과 (null이어야 정상, 타임아웃 경로 확인):', result);
```

Run: `cd video-remotion && node verify-poll-timeout-tmp.js`
Expected: 콘솔에 `[1/3]`, `[2/3]`, `[3/3]` 대기 로그가 찍히고 최종 `결과 (null이어야 정상, 타임아웃 경로 확인): null` 출력 (실제 타임아웃 후 포기 경로가 동작함을 확인)

확인 후 임시 파일 삭제: `rm video-remotion/verify-poll-timeout-tmp.js`

- [ ] **Step 3: 실제 end-to-end 1회 실행 (제휴링크가 이미 있는 실제 상품으로)**

시트에서 이미 `posted=TRUE`이고 `affiliate_link`가 채워진 실제 행 하나를 골라 (예: 이미 게시 완료된 기존 상품), **그 상품명과 이미지 URL을 그대로 재사용**해서 (실제로 새 시트 행을 만들지 않고 기존 행을 그대로 폴링 대상으로 삼는다) 전체 파이프라인을 1회 실행:

```bash
cd video-remotion
node process-account-a.js --json '{"productTitle":"<기존 게시완료 행의 정확한 product_title 값>","productDesc":"<같은 행의 product_desc>","price":"<같은 행의 price>","imageUrl":"<같은 행의 image_url>"}'
```
Expected: NVIDIA 훅 문구 생성 → render.js 실행(1~2분 소요) → 폴링 즉시 성공(이미 affiliate_link가 있으므로 첫 시도에 찾음) → 해당 행의 `video_url` 컬럼에 실제 값이 기록됨. 시트를 직접 열어 K열에 값이 들어갔는지 육안 확인.

**주의**: 이 테스트는 이미 게시 완료된 행의 `video_url`만 채우는 것이라 재게시를 유발하지 않는다 (`posted=TRUE`이므로 n8n의 `posted`가 빈 값인 행만 조회하는 필터에 애초에 안 걸림). 순수하게 파이프라인 자체의 end-to-end 동작 확인용.

- [ ] **Step 4: Commit**

```bash
git add video-remotion/process-account-a.js
git commit -m "Add process-account-a.js orchestrator: hook text -> render -> poll -> write video_url"
```

---

## Task 6: `scripts/collect.html` — "계정A 영상용" 체크박스

**Files:**
- Modify: `scripts/collect.html`

**Interfaces:**
- Consumes: 없음
- Produces: `/api/commit` 요청 바디의 각 아이템에 `accountA: boolean` 필드 추가. Task 7이 이 필드를 읽는다.

- [ ] **Step 1: 테이블 렌더링에 체크박스 컬럼 추가**

`collect.html`의 `renderTable()` 함수(현재 55-78행)를 다음으로 교체:

```js
function renderTable(items) {
  lastItems = items;
  const freshCount = items.filter((i) => !i.isDuplicate).length;
  const dupCount = items.length - freshCount;

  const rows = items.map((it, idx) => `
    <tr class="${it.isDuplicate ? 'dup' : ''}">
      <td><input type="checkbox" data-idx="${idx}" ${it.isDuplicate ? 'disabled' : 'checked'}></td>
      <td class="thumb">${it.thumbnailPreview ? `<img src="${it.thumbnailPreview}" alt="">` : (it.imageUrl ? '이미지있음(합성실패)' : '❌')}</td>
      <td>${it.title}</td>
      <td>${it.discountPrice || '-'}</td>
      <td>${it.originalPrice || '-'}</td>
      <td>${it.discountRate != null ? it.discountRate + '%' : '-'}</td>
      <td>${it.productUrl ? '✅' : '❌'}</td>
      <td>${it.isDuplicate ? '중복' : '신규'}</td>
      <td><input type="checkbox" data-account-a-idx="${idx}" ${it.isDuplicate ? 'disabled' : ''}></td>
    </tr>
  `).join('');

  resultArea.innerHTML = `
    <div class="status">총 ${items.length}개 인식됨 (신규 ${freshCount} / 중복 ${dupCount})</div>
    <table>
      <thead><tr><th>추가</th><th>썸네일 미리보기</th><th>상품명</th><th>판매가</th><th>원가</th><th>할인율</th><th>URL</th><th>상태</th><th>계정A 영상용</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button id="commitBtn">체크된 상품 구글 시트에 추가</button>
  `;

  document.getElementById('commitBtn').addEventListener('click', commit);
}
```

- [ ] **Step 2: `commit()`이 각 아이템에 `accountA` 값을 담아 보내도록 수정**

`commit()` 함수(현재 99-117행)의 첫 두 줄을 다음으로 교체:

```js
async function commit() {
  const checked = Array.from(document.querySelectorAll('#resultArea input[type=checkbox][data-idx]:checked'))
    .map((el) => {
      const idx = Number(el.dataset.idx);
      const accountACheckbox = document.querySelector(`input[data-account-a-idx="${idx}"]`);
      return { ...lastItems[idx], accountA: !!(accountACheckbox && accountACheckbox.checked) };
    });
```

(이후 나머지 `commit()` 본문은 그대로 둔다.)

- [ ] **Step 3: 브라우저에서 수동 확인**

```bash
cd scripts && npm run serve
```
브라우저로 `http://localhost:5175` 접속 → 쿠팡 상품 목록 복사한 텍스트 아무거나 붙여넣고 "미리보기" → 테이블에 "계정A 영상용" 컬럼이 새로 보이는지, 체크박스가 기본적으로 **비어있는 상태**(선택 안 됨)로 뜨는지 육안 확인.

- [ ] **Step 4: Commit**

```bash
git add scripts/collect.html
git commit -m "Add account-A video checkbox to the collection UI"
```

---

## Task 7: `scripts/collect-server.js` — account_id 전달 + 백그라운드 트리거

**Files:**
- Modify: `scripts/collect-server.js`

**Interfaces:**
- Consumes: Task 6의 `accountA` 필드, Task 1의 확장된 `toSheetRow`
- Produces: 없음 (최종 소비자, 이 태스크가 파이프라인의 마지막 연결점)

- [ ] **Step 1: `/api/commit` 핸들러 수정**

`collect-server.js`의 `/api/commit` 블록(현재 108-139행)을 다음으로 교체:

```js
    if (req.method === 'POST' && req.url === '/api/commit') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        sendJson(res, 400, { error: '추가할 상품이 없습니다.' });
        return;
      }
      const now = nowKstIso();
      const rows = [];
      const accountAJobs = [];
      for (const p of items) {
        const imageUrl = await composeAndUploadImage(
          p.imageUrl,
          { title: p.title, originalPrice: p.originalPrice, discountPrice: p.discountPrice, discountRate: p.discountRate },
          CLOUDINARY_CONFIG,
        );
        rows.push(
          toSheetRow(
            {
              product_title: p.title,
              price: p.discountPrice,
              product_desc: p.title,
              affiliate_link: '',
              image_url: imageUrl,
              account_id: p.accountA ? 'account_A' : '',
            },
            now,
          ),
        );
        if (p.accountA) {
          accountAJobs.push({ productTitle: p.title, productDesc: p.title, price: p.discountPrice, imageUrl });
        }
      }
      await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, rows);
      sendJson(res, 200, { added: rows.length });

      for (const job of accountAJobs) {
        const child = spawn('node', ['process-account-a.js', '--json', JSON.stringify(job)], {
          cwd: path.join(__dirname, '..', 'video-remotion'),
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        console.log(`[계정A] "${job.productTitle}" 영상 파이프라인 백그라운드 시작`);
      }
      return;
    }
```

- [ ] **Step 2: `spawn` import 추가**

파일 상단 `require` 목록(현재 11-20행)에 다음 한 줄 추가:

```js
const { spawn } = require('node:child_process');
```

- [ ] **Step 3: 구문 확인**

Run: `cd scripts && node -c collect-server.js`
Expected: 에러 없음

- [ ] **Step 4: 실행해서 실제로 백그라운드 프로세스가 뜨는지 확인**

```bash
cd scripts && npm run serve
```
다른 터미널에서:
```bash
curl -X POST http://localhost:5175/api/commit \
  -H "Content-Type: application/json" \
  -d '{"items":[{"title":"통합테스트상품_'"$(date +%s)"'","discountPrice":"1,000원","imageUrl":"","accountA":true}]}'
```
Expected: `{"added":1}` 즉시 응답 오고, `npm run serve`를 실행 중인 터미널에 `[계정A] "통합테스트상품_..." 영상 파이프라인 백그라운드 시작` 로그가 뜸. 잠시 후 같은 터미널에 `process-account-a.js`의 진행 로그(훅 문구 생성 중... 등)도 이어서 찍히는지 확인 (실제 렌더링까지 끝까지 기다릴 필요는 없음, 프로세스가 실제로 시작됐다는 것만 확인하면 됨 — 확인 후 `Ctrl+C`로 정리).

- [ ] **Step 5: Commit**

```bash
git add scripts/collect-server.js
git commit -m "Trigger process-account-a.js in the background when the account-A checkbox is set"
```

---

## Task 8: n8n 워크플로우 4개 노드 수정 + 합성 데이터로 검증

**Files:**
- 없음 (n8n MCP `update_workflow`/`test_workflow`로 원격 워크플로우만 수정)

**Interfaces:**
- Consumes: Task 1~7에서 정의한 `video_url` 컬럼과 그 의미
- Produces: 없음 (최종 프로덕션 워크플로우 변경)

- [ ] **Step 1: 수정 전 워크플로우 버전 기록**

```
mcp__n8n-mcp__get_workflow_details(workflowId: "NgC6DlDTrW3tnygc", detailLevel: "execution")
```
결과의 `versionId`를 기록해둔다 (문제 생기면 `mcp__n8n-mcp__restore_workflow_version`으로 되돌릴 수 있음).

- [ ] **Step 2: 4개 노드 수정 — `update_workflow` 한 번에 적용**

```
mcp__n8n-mcp__update_workflow({
  workflowId: "NgC6DlDTrW3tnygc",
  versionName: "계정A 영상 파이프라인 연동 (video_url 우선 사용 + account_A 라운드로빈 예외)",
  versionDescription: "제휴링크 있는 상품만 선택/계정 순번 배정/상품 정보 입력 (시트)/응답 파싱 4개 기존 노드에 account_id==='account_A' 조건부 분기 추가. 다른 계정 경로는 완전히 동일하게 유지.",
  operations: [
    {
      type: "setNodeParameter",
      nodeName: "제휴링크 있는 상품만 선택",
      path: "/jsCode",
      value: "const rows = $input.all();\nconst ready = rows.find(r => {\n  const hasLink = r.json.affiliate_link && String(r.json.affiliate_link).trim();\n  if (!hasLink) return false;\n  if (r.json.account_id === 'account_A') {\n    return !!(r.json.video_url && String(r.json.video_url).trim());\n  }\n  return true;\n});\nreturn ready ? [ready] : [];"
    },
    {
      type: "setNodeParameter",
      nodeName: "계정 순번 배정 (시트큐)",
      path: "/jsCode",
      value: "const accounts = $input.all().map(i => ({ account_id: i.json.account_id, threads_user_id: i.json.threads_user_id }));\nconst row = $('제휴링크 있는 상품만 선택').first().json;\n\nlet account;\nif (row.account_id === 'account_A') {\n  account = accounts.find(a => a.account_id === 'account_A');\n  if (!account) {\n    throw new Error('account_A 계정이 계정 목록(Data Table)에 없습니다.');\n  }\n} else {\n  account = accounts[(row.row_number || 0) % accounts.length];\n}\n\nreturn [{\n  json: {\n    ...row,\n    account_id: account.account_id,\n    threads_user_id: account.threads_user_id\n  }\n}];"
    },
    {
      type: "updateNodeParameters",
      nodeName: "상품 정보 입력 (시트)",
      replace: false,
      parameters: {
        assignments: {
          assignments: [
            { id: "s1-0", name: "product_title", value: "={{ $json.product_title }}", type: "string" },
            { id: "s1-1", name: "product_desc", value: "={{ $json.product_desc }}", type: "string" },
            { id: "s1-2", name: "product_url", value: "={{ $json.product_url }}", type: "string" },
            { id: "s1-3", name: "affiliate_link", value: "={{ $json.affiliate_link }}", type: "string" },
            { id: "s1-4", name: "threads_user_id", value: "={{ $json.threads_user_id || '27629464336738548' }}", type: "string" },
            { id: "s1-5", name: "image_url", value: "={{ $json.image_url }}", type: "string" },
            { id: "s1-6", name: "price", value: "={{ $json.price }}", type: "string" },
            { id: "s1-7", name: "account_id", value: "={{ $json.account_id || 'account_A' }}", type: "string" },
            { id: "s1-8", name: "video_url", value: "={{ $json.video_url }}", type: "string" }
          ]
        }
      }
    }
  ]
})
```

이어서 별도 `update_workflow` 호출로 `응답 파싱 및 댓글 텍스트 구성`의 `jsCode`를 다음 전체 코드로 교체한다 (기존 코드와 **딱 한 줄**, `videoUrl` 계산 부분만 다르다 — `productInfo.video_url || `가 앞에 추가됨):

```js
const DISCLOSURE = '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

const PRICE_POINTER_POOL = [
  '가격이랑 링크는 댓글에 있음',
  '정확한 가격이랑 링크는 댓글 확인',
  '가격은 댓글에 적어둠',
  '자세한 가격이랑 링크는 댓글에',
  '가격이랑 구매 링크는 댓글에 있음'
];

const LINK_ONLY_POINTER_POOL = [
  '링크는 댓글에 있음',
  '구매 링크는 댓글 확인',
  '자세한 건 댓글 링크에서',
  '링크는 댓글에 따로 적어둠'
];

const PRICE_TEASE_POOL = [
  '가격 보고 나도 좀 놀람',
  '이 가격에 이 정도면 나쁘지 않은 듯',
  '가격표 보면 왜 인기인지 알 듯',
  '혹시 몰라서 가격도 같이 적어둠',
  '가격 확인하고 필요하면 링크 눌러봐'
];

const GENERIC_TEASE_POOL = [
  '궁금하면 링크 눌러봐',
  '필요하면 아래 링크로 확인해봐',
  '관심있으면 링크로 구경해봐',
  '자세한 건 링크에서 볼 수 있음'
];

function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function sanitizeTopicTag(raw) {
  if (!raw) return '생활꿀템';
  let t = String(raw).trim().replace(/^#/, '').replace(/[\s.&]/g, '');
  if (!t) return '생활꿀템';
  return t.slice(0, 50);
}

function toZoompanVideoUrl(imgUrl) {
  if (!imgUrl || !imgUrl.includes('res.cloudinary.com') || !imgUrl.includes('/image/upload/')) return '';
  const withEffect = imgUrl.replace('/image/upload/', '/image/upload/e_zoompan:mode_ofc;maxzoom_1.6;du_4;fps_30/');
  return withEffect.replace(/\.(png|jpe?g|webp)(\?.*)?$/i, '.mp4');
}

let productInfo;
let isSheetSource = false;
try {
  productInfo = $('상품 정보 입력').first().json;
} catch (e) {
  try {
    productInfo = $('상품 정보 입력 (자동)').first().json;
  } catch (e2) {
    productInfo = $('상품 정보 입력 (시트)').first().json;
    isSheetSource = true;
  }
}
const tokenInfo = $('현재 토큰 불러오기').first().json;

let config;
try {
  config = $('설정값 (필수 입력)').first().json;
} catch (e) {
  config = null;
}
const threadsUserId = (config && config.threads_user_id) || productInfo.threads_user_id;
const accountId = (config && config.account_id) || productInfo.account_id || '';

let storyText;
let rawTopicTag = null;
if (productInfo.fixed_post_text) {
  storyText = productInfo.fixed_post_text;
} else {
  let aiResponse;
  try {
    aiResponse = $('스토리텔링 생성 (재시도)').first().json;
  } catch (e) {
    aiResponse = $('스토리텔링 생성 (NVIDIA API)').first().json;
  }
  const messageContent = aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message
    ? aiResponse.choices[0].message.content
    : null;
  const finishReason = aiResponse.choices && aiResponse.choices[0] ? aiResponse.choices[0].finish_reason : null;

  if (!messageContent) {
    throw new Error('NVIDIA API 응답에서 텍스트를 찾을 수 없습니다. 응답: ' + JSON.stringify(aiResponse));
  }

  let jsonSlice = messageContent.trim();
  const firstBrace = jsonSlice.indexOf('{');
  const lastBrace = jsonSlice.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonSlice = jsonSlice.slice(firstBrace, lastBrace + 1);
  }

  jsonSlice = jsonSlice.replace(/\\\s+([nrtbf"\\\/])/g, '\\\\$1');
  jsonSlice = jsonSlice.replace(/\\(?!["\\\/bfnrtu])/g, '');

  try {
    const parsed = JSON.parse(jsonSlice);
    storyText = parsed.post_text;
    rawTopicTag = parsed.topic_tag;
  } catch (e) {
    throw new Error('NVIDIA 응답이 유효한 JSON이 아닙니다 (finish_reason=' + finishReason + '). 모델이 사고 과정을 출력했거나 응답이 잘렸을 가능성이 큽니다. 원문(300자): ' + messageContent.slice(0, 300));
  }

  if (!storyText) {
    throw new Error('post_text를 추출하지 못했습니다. 원문: ' + jsonSlice.slice(0, 300));
  }
}

storyText = storyText.split(DISCLOSURE).join('').trim();

const hasPrice = !!productInfo.price;
const pointer = hasPrice ? pick(PRICE_POINTER_POOL) : pick(LINK_ONLY_POINTER_POOL);
const postText = `${storyText}\n\n${pointer}`;

if (postText.length > 480) {
  throw new Error('생성된 post_text가 너무 깁니다 (' + postText.length + '자). Threads 500자 제한 초과 위험으로 게시를 중단합니다: ' + postText.slice(0, 200));
}

const priceLine = hasPrice ? `현재 가격: ${productInfo.price}\n` : '';
const tease = hasPrice ? pick(PRICE_TEASE_POOL) : pick(GENERIC_TEASE_POOL);
const commentText = `${DISCLOSURE}\n\n${priceLine}${tease}\n${productInfo.affiliate_link}`;
const topicTag = sanitizeTopicTag(rawTopicTag);
const videoUrl = productInfo.video_url || toZoompanVideoUrl(productInfo.image_url || '');

return [{
  json: {
    post_text: postText,
    comment_text: commentText,
    access_token: tokenInfo.access_token,
    threads_user_id: threadsUserId,
    account_id: accountId,
    affiliate_link: productInfo.affiliate_link,
    image_url: productInfo.image_url || '',
    video_url: videoUrl,
    is_sheet_source: isSheetSource,
    topic_tag: topicTag
  }
}];
```

**주의**: Task 8 실행 시점에 `get_workflow_details`로 이 노드의 **현재** `jsCode`를 먼저 읽어서, 위 코드와 실제로 `videoUrl` 계산 줄 하나만 다른지 diff로 확인한 뒤 적용한다 (혹시 이 세션 이후 다른 변경이 있었을 경우를 대비 — 있다면 그 최신 코드를 기준으로 이 한 줄만 바꿔서 적용하고, 이 계획 문서의 나머지 부분과 다르다는 점을 리뷰어에게 보고한다).

- [ ] **Step 3: 수정 결과를 다시 읽어 4곳 모두 정확히 반영됐는지 확인**

```
mcp__n8n-mcp__get_workflow_details(workflowId: "NgC6DlDTrW3tnygc", detailLevel: "full")
```
결과 파일에서 4개 노드의 `parameters`를 각각 확인해 Step 2에서 넣은 내용과 문자 그대로 일치하는지 확인.

- [ ] **Step 4: 합성 데이터 시나리오 준비**

```
mcp__n8n-mcp__prepare_workflow_pin_data(workflowId: "NgC6DlDTrW3tnygc")
```
반환된 스키마를 기준으로 아래 8개 노드에 pin data를 채운다 (스키마는 이미 확인해뒀음 — 정확히 이 8개 노드가 credentials/HTTP Request라서 시뮬레이션이 필요하고, 나머지 `현재 토큰 불러오기`/`계정 목록 조회 (시트큐)`/`제휴링크 있는 상품만 선택`/`계정 순번 배정 (시트큐)`/`상품 정보 입력 (시트)`/`NVIDIA 요청 만들기`/`응답 파싱 및 댓글 텍스트 구성`/`시트 소스 판단`은 실제 코드/Data Table로 그대로 실행됨):

- `3시간마다 시트 확인`, `시트 큐에서 미게시 상품 조회`, `스토리텔링 생성 (NVIDIA API)`, `본문 컨테이너 생성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)`, **`시트에 게시완료 표시`**(⚠️ 이 노드를 pin에서 빠뜨리면 테스트 중 실제 프로덕션 시트에 게시완료 표시가 기록될 위험이 있음 — 반드시 포함).

- [ ] **Step 5: 시나리오 1 — 일반 상품(회귀 테스트, account_id 없음) → 기존과 동일하게 zoompan 처리되는지**

```
mcp__n8n-mcp__test_workflow({
  workflowId: "NgC6DlDTrW3tnygc",
  triggerNodeName: "3시간마다 시트 확인",
  pinData: {
    "3시간마다 시트 확인": [{ "json": { "timestamp": "2026-09-25T10:00:00.000Z", "Readable date": "September 25th 2026, 10:00:00 am", "Readable time": "10:00:00 am", "Day of week": "Friday", "Year": "2026", "Month": "September", "Day of month": "25th", "Hour": "10", "Minute": "00", "Second": "00", "Timezone": "Asia/Seoul" } }],
    "시트 큐에서 미게시 상품 조회": [{ "json": { "row_number": 999, "collected_at": "2026-09-25T00:00:00+09:00", "product_title": "PLAN시나리오1_일반상품", "price": "9,900원", "product_desc": "테스트 설명", "affiliate_link": "https://link.coupang.com/a/plan-test-1", "image_url": "https://res.cloudinary.com/dqmdjn0o/image/upload/v1/plan-test-1.png", "posted": "", "media_id": "", "views": "", "account_id": "" } }],
    "스토리텔링 생성 (NVIDIA API)": [{ "json": { "id": "chatcmpl-test1", "choices": [{ "index": 0, "message": { "content": "{\"post_text\": \"테스트 훅 문구\", \"topic_tag\": \"생활\"}", "role": "assistant", "reasoning_content": null }, "finish_reason": "stop", "logprobs": null }], "created": 1790000000, "model": "nvidia/nemotron-3-ultra-550b-a55b", "service_tier": null, "system_fingerprint": null, "object": "chat.completion", "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 } } }],
    "본문 컨테이너 생성": [{ "json": { "id": "test-container-1" } }],
    "본문 게시": [{ "json": { "id": "test-post-1" } }],
    "댓글 컨테이너 생성": [{ "json": { "id": "test-comment-container-1" } }],
    "댓글 게시 (제휴링크)": [{ "json": { "id": "test-comment-post-1" } }],
    "시트에 게시완료 표시": [{ "json": { "affiliate_link": "https://link.coupang.com/a/plan-test-1", "posted": "TRUE", "media_id": "test-post-1", "account_id": "account_B" } }]
  }
})
```
Expected: 실행 성공. `응답 파싱 및 댓글 텍스트 구성` 노드의 실제 출력(`video_url` 필드)이 `toZoompanVideoUrl`로 변환된 URL(`e_zoompan:...` 포함)인지 실행 결과에서 확인 — **account_id가 없는 행은 수정 전과 똑같이 zoompan을 쓴다**는 회귀 없음 확인.

- [ ] **Step 6: 시나리오 2 — account_A인데 video_url 없음 → 이번 턴 skip**

Step 5와 동일한 pinData에서 `"시트 큐에서 미게시 상품 조회"`만 다음으로 교체 (video_url 필드 자체를 안 넣음):

```json
"시트 큐에서 미게시 상품 조회": [{ "json": { "row_number": 998, "collected_at": "2026-09-25T00:00:00+09:00", "product_title": "PLAN시나리오2_계정A대기중", "price": "12,000원", "product_desc": "테스트 설명", "affiliate_link": "https://link.coupang.com/a/plan-test-2", "image_url": "https://res.cloudinary.com/dqmdjn0o/image/upload/v1/plan-test-2.png", "posted": "", "media_id": "", "views": "", "account_id": "account_A" } }]
```
Expected: `제휴링크 있는 상품만 선택` 노드의 실제 출력이 **빈 배열**이고, 그 아래(`계정 목록 조회 (시트큐)`부터 `댓글 게시` 등)로는 아무 아이템도 흘러가지 않음 (n8n 실행 결과에서 해당 노드들이 0 items로 표시되거나 아예 실행 안 됨을 확인). **게시 시도 자체가 발생하지 않아야 함.**

- [ ] **Step 7: 시나리오 3 — account_A + video_url 있음 → account_A 토큰으로 그 video_url을 써서 게시 경로까지 도달**

Step 5의 pinData에서 `"시트 큐에서 미게시 상품 조회"`만 교체:

```json
"시트 큐에서 미게시 상품 조회": [{ "json": { "row_number": 997, "collected_at": "2026-09-25T00:00:00+09:00", "product_title": "PLAN시나리오3_계정A준비완료", "price": "15,000원", "product_desc": "테스트 설명", "affiliate_link": "https://link.coupang.com/a/plan-test-3", "image_url": "https://res.cloudinary.com/dqmdjn0o/image/upload/v1/plan-test-3.png", "posted": "", "media_id": "", "views": "", "account_id": "account_A", "video_url": "https://res.cloudinary.com/dqmdjn0o/video/upload/v1/plan-test-3.mp4" } }]
```
Expected: 실행이 `댓글 게시 (제휴링크)`까지 정상 도달. `응답 파싱 및 댓글 텍스트 구성`의 실제 출력에서:
- `video_url` === `https://res.cloudinary.com/dqmdjn0o/video/upload/v1/plan-test-3.mp4` (zoompan으로 변환되지 않고 그대로 사용됨)
- `account_id` === `'account_A'`
- `threads_user_id`가 (다른 계정이 아닌) 실제 account_A의 threads_user_id 값과 일치 (`계정 목록 조회 (시트큐)`의 실제 실행 결과에서 account_A 항목의 threads_user_id를 대조)
- `access_token`이 비어있지 않음 (실제 account_A 토큰이 조회됐다는 뜻 — 값 자체를 로그/문서에 남기지 않는다)

- [ ] **Step 8: 세 시나리오 결과를 표로 정리해서 기록**

각 시나리오의 최종 판정(회귀 없음 / skip 확인됨 / account_A 경로 확인됨)을 커밋 메시지 또는 PDCA 리포트에 남긴다 (아래 Step 9의 커밋 메시지에 요약 포함).

- [ ] **Step 9: 이 태스크는 로컬 git 커밋 대상 파일이 없음 (n8n 원격 워크플로우 변경) — 변경 이력은 n8n의 버전 히스토리(Step 1에서 기록한 `versionId`와 대조 가능)로 남는다.**

---

## Task 9: 전체 파이프라인 실사용 리허설

**Files:**
- 없음 (기존 파일들의 end-to-end 동작 확인)

**Interfaces:**
- Consumes: Task 1~8 전체
- Produces: 없음 (검증 전용)

- [ ] **Step 1: 실제 쿠팡 상품 1개로 전체 흐름 리허설**

```bash
cd scripts && npm run serve
```
1. 실제 쿠팡 목록 페이지에서 상품 1개 정보를 복사해 `collect.html`에 붙여넣기
2. 미리보기 → 해당 상품의 "계정A 영상용" 체크
3. "체크된 상품 구글 시트에 추가" 클릭
4. `npm run serve` 콘솔에 `[계정A] "..." 영상 파이프라인 백그라운드 시작` 로그 확인
5. 이어지는 로그로 훅 문구 생성 → 영상 렌더링 → "제휴링크 대기 중..." 폴링 로그가 찍히는지 확인
6. 실제로 쿠팡 파트너스 사이트에서 그 상품의 제휴링크를 생성해 구글시트의 해당 행 `affiliate_link` 셀에 직접 채워넣기 (기존에 하던 수동 작업 그대로)
7. 다음 폴링 주기(최대 30초 이내)에 콘솔에 "완료: N행에 video_url 기록함" 로그가 뜨는지 확인
8. 구글시트를 열어 해당 행의 `video_url` 컬럼에 실제 Cloudinary 영상 URL이 들어갔는지 육안 확인

- [ ] **Step 2: 게시는 다음 3시간 스케줄을 기다리거나, Task 8 Step 7과 동일한 방식으로 이 실제 행 데이터를 `test_workflow`에 pin해서 앞당겨 검증 (실제 Threads 게시 없이)**

이 리허설 상품의 실제 `product_title`/`image_url`/`price`/`affiliate_link`/`video_url` 값으로 Task 8 Step 7과 동일한 형태의 pinData를 구성해 `test_workflow` 1회 실행 → `응답 파싱 및 댓글 텍스트 구성`의 출력에서 `video_url`이 이 리허설 상품의 실제 영상 URL과 일치하는지 최종 확인.

- [ ] **Step 3: 리허설용으로 만든 시트 행 정리 여부 결정**

리허설 상품을 실제로 게시할 계획이면 그대로 두고(다음 3시간 스케줄에 정상 게시됨), 테스트 목적이었으면 시트에서 해당 행의 `posted`를 수동으로 `TRUE`로 표시하거나 행을 삭제해 다음 스케줄이 집어가지 않게 정리한다. **이 결정은 사용자에게 확인받는다** (실제 프로덕션 게시로 이어질 수 있는 선택이므로).

---

## Self-Review 결과 (작성자 자체 점검)

- **스펙 커버리지**: §4.1(시트 컬럼)=Task2, §4.2(sheetRow.js)=Task1, §4.3(collect.html)=Task6, §4.4(collect-server.js)=Task7, §4.5(process-account-a.js)=Task3+4+5, §4.6(n8n 4개 노드)=Task8, §6(테스트 계획)=Task5 Step3, Task7 Step4, Task8 Step5-7, Task9. §7(리스크)은 각 태스크의 스텝에서 직접 다룸(타임아웃=Task5 Step2, product_title 매칭=Task4 findReadyRow). 스펙 전 항목 대응 확인.
- **Placeholder 스캔**: "TBD"/"적절히" 패턴 없음. 모든 코드 스텝에 실제 코드 포함, n8n pin data도 실제 스키마 기반 실값으로 작성함.
- **타입 일관성**: `toSheetRow`의 `account_id`/`video_url` 필드명(Task1) ↔ `collect-server.js`가 넘기는 필드명(Task7) 일치. `sheet-sync.js`의 `findReadyRow`/`writeVideoUrl` 시그니처(Task4) ↔ `process-account-a.js`의 호출부(Task5) 일치. `generateHookText`의 시그니처(Task3) ↔ `process-account-a.js`의 호출부(Task5) 일치. n8n `video_url` 필드명이 Task2(시트 헤더)→Task8 노드 4곳 전부에서 동일하게 `video_url`로 일관됨.
- **Review Focus 반영**: 5개 항목 모두 담당 태스크의 스텝으로 연결됨 (위 Review Focus 섹션에 태스크 번호 명시, 특히 "시트에 게시완료 표시 노드를 pin 안 하면 실제 프로덕션 쓰기 위험"은 Task8 Step4에 명시적 경고로 반영함).
