# 계정 A 영상 파이프라인 — n8n 연동 설계 스펙

> 작성일: 2026-09-25. `video-remotion/`(Remotion 하드컷 영상 생성 + Cloudinary 업로드, 이미 구현·머지 완료)을 실제 운영 중인 n8n 워크플로우(`NgC6DlDTrW3tnygc`, n8n Cloud)에 연결한다. 계정 B는 기존 Cloudinary zoompan 방식을 그대로 유지하며 이 작업에서 전혀 건드리지 않는다.

## 1. 배경 — 왜 처음 계획(Execute Command)이 무효화됐는가

`2026-09-25-remotion-impact-video-design.md`는 "n8n Execute Command 노드에서 `render.js`를 직접 호출"을 전제로 했다. 실제 확인 결과:

- 워크플로우 `NgC6DlDTrW3tnygc`는 **n8n Cloud**(`fastlane12.app.n8n.cloud`)에서 실행된다.
- 86개 노드 전체를 확인했지만 Execute Command(로컬 명령 실행) 노드가 **하나도 없다**.
- 기존에 로컬 작업 결과를 n8n에 반영하는 유일한 패턴은 **Webhook으로 로컬이 결과를 n8n에 밀어넣는 방식**(`쿠팡 상품 자동 수집 (Webhook)`)뿐이다.

즉 n8n Cloud는 사용자의 로컬 PC(D:\vibecording\...)에 접근할 방법이 없다. `render.js`는 로컬에서만 실행 가능하므로, 통합 방향을 "로컬이 준비되면 n8n이 기존 스케줄대로 집어가는" 방식으로 바꾼다.

## 2. 사용자 확인 사항 요약

- **영상 대상 선정**: 완전 자동 규칙이 아니라 **수동 지정**. 상품 수집 화면(`collect.html`)에서 체크박스로 "계정A 영상용"을 표시한다.
- **로컬 제휴링크 워크플로우**: 사용자가 실제로 하는 작업은 "쿠팡에서 상품 정보 복붙 → `collect.html`로 구글시트에 추가(제휴링크 없음) → 이후 쿠팡 파트너스 사이트에서 제휴링크를 직접 생성해서 시트 해당 행에 수동으로 채워넣음"이다. `collect.html` 자체에도 "제휴 링크는 시트에서 직접 채워넣으세요" 안내 문구가 이미 있다 (`collect.html:112`).
- **자동 실행 시점**: `collect.html`에서 시트로 상품 정보를 옮기는 바로 그 순간(제휴링크가 아직 없는 시점)에 영상 파이프라인이 **바로 시작**해야 한다.
- **게시 시점**: 영상+제휴링크가 모두 준비돼도 **즉시 게시하지 않는다.** 계정A는 기존에 이미 동작 중인 게시 스케줄(3시간마다 시트 확인 → 라운드로빈)에 자연스럽게 편입되어, 그 스케줄 순번이 왔을 때 게시된다.

이 네 가지를 조합하면: 로컬은 "영상까지만 미리 만들어서 시트에 꽂아두는" 역할만 하고, 실제 게시 여부/타이밍 결정은 100% 기존 n8n 스케줄이 담당한다. **새 웹훅이나 새 게시 로직이 전혀 필요 없다.**

## 3. 기존 워크플로우의 숨은 동작 (설계에 직접 영향을 준 사실들)

`3시간마다 시트 확인` 브랜치의 실제 실행 순서 (전부 n8n에서 직접 확인함):

```
3시간마다 시트 확인 (Schedule)
  → 시트 큐에서 미게시 상품 조회 (Google Sheets: posted가 빈 행 전체 조회, account_id 필터 없음)
  → 제휴링크 있는 상품만 선택 (Code: affiliate_link 있는 첫 행 1개 선택)
  → 계정 목록 조회 (시트큐) (Data Table: 전체 계정 목록, account_id ASC 정렬)
  → 계정 순번 배정 (시트큐) (Code: accounts[row.row_number % accounts.length] — ⚠️ 시트에 이미 적힌 account_id를 무시하고 row_number 기반 라운드로빈으로 재계산함)
  → 상품 정보 입력 (시트) (Set: product_title/price/... 필드 매핑, account_id는 위에서 재계산된 값이 그대로 들어옴)
  → 현재 토큰 불러오기 (Data Table: account_id로 access_token 조회)
  → NVIDIA 요청 만들기 → 스토리텔링 생성 (NVIDIA API)
  → 응답 파싱 및 댓글 텍스트 구성 (Code: storyText 조립 + toZoompanVideoUrl(image_url)로 영상 URL 계산 — ⚠️ 항상 이미지→zoompan 변환만 하고, 미리 만들어진 video_url을 받아들이는 경로가 없음)
  → 본문 컨테이너 생성 → 대기 → 본문 게시 → 대기 → 댓글 컨테이너 생성 → 대기 → 댓글 게시 (제휴링크)
  → 시트 소스 판단 → 시트에 게시완료 표시 (affiliate_link로 행 매칭, posted/media_id/account_id 기록)
```

**중요**: `본문 컨테이너 생성` 이후의 모든 노드(`본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)`, `시트에 게시완료 표시`, `게시 기록 저장 (중복방지)`)는 전부 `$('응답 파싱 및 댓글 텍스트 구성').first().json.X` 형태로 **그 노드 이름을 직접 참조**한다 (`$json`이 아님 — HTTP Request 노드가 실행되면 `$json`은 API 응답으로 대체되기 때문에 원본 데이터를 유지하려면 노드 이름 참조가 필수였던 것으로 보임). 따라서 **`응답 파싱 및 댓글 텍스트 구성` 노드가 실제로 이 실행에서 실행되기만 하면, 그 아래 체인은 손댈 필요가 전혀 없다.**

## 4. 설계

### 4.1 구글시트 변경

시트(`1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA`, `시트1`)의 헤더 행에 새 컬럼 **`video_url`**을 추가한다 (기존 10개 컬럼: `collected_at, product_title, price, product_desc, affiliate_link, image_url, posted, media_id, views, account_id` 뒤에 11번째로 추가). 기존 데이터/컬럼은 전혀 건드리지 않는다 — 헤더 셀 1개 추가만으로 끝나는 순수 추가 작업.

### 4.2 `scripts/lib/sheetRow.js` — 공용 행 생성 함수 확장

`toSheetRow()`는 `add-product.js`, `collect-from-clipboard.js`, `collect-server.js`, `generate-coupang-link.js` 4곳에서 공유해서 쓴다. `SHEET_COLUMNS`를 실제 시트와 동일한 11개로 맞추고, `candidate.account_id`/`candidate.video_url`이 없으면 빈 문자열로 채운다 (기존 4개 호출부는 이 두 필드를 안 넘기므로 동작 100% 그대로 유지, 그저 명시적으로 빈칸을 채워 넣는 차이만 생김).

```js
const SHEET_COLUMNS = ['collected_at', 'product_title', 'price', 'product_desc', 'affiliate_link', 'image_url', 'posted', 'media_id', 'views', 'account_id', 'video_url'];

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
```

`lib/sheetRow.test.js`의 두 테스트는 `SHEET_COLUMNS.length`를 동적으로 참조하므로 수정 없이 그대로 통과해야 한다 (구현 시 실제로 돌려서 확인).

### 4.3 `collect.html` — "계정A 영상용" 체크박스

상품 미리보기 테이블에 컬럼 하나 추가 (`renderTable()` 함수, `collect.html:50-78`). 기본값은 **체크 해제**(선택 안 함 = 기존 동작 그대로 = zoompan 대상). `commit()`이 서버로 보내는 각 아이템에 `accountA: true/false`를 포함시킨다.

### 4.4 `scripts/collect-server.js` — 시트 저장 + 백그라운드 트리거

`/api/commit` 핸들러(`collect-server.js:108-139`)에서:
1. 기존과 동일하게 이미지 합성/업로드 → `toSheetRow`로 행 생성 (이제 `account_id: p.accountA ? 'account_A' : ''` 포함) → `appendRows`.
2. 응답을 브라우저에 먼저 돌려준 뒤(기존과 동일), `accountA === true`인 아이템에 한해 **비동기로(응답을 기다리지 않고)** `video-remotion/process-account-a.js`를 별도 프로세스로 실행한다:

```js
const { spawn } = require('node:child_process');
// ... appendRows 성공 후, accountA 체크된 아이템마다:
const child = spawn('node', ['process-account-a.js', '--json', JSON.stringify({
  productTitle: p.title,
  productDesc: p.title,
  price: p.discountPrice,
  imageUrl: imageUrl, // 위에서 이미 Cloudinary에 업로드된 이미지 URL 재사용
})], {
  cwd: path.join(__dirname, '..', 'video-remotion'),
  detached: true,
  stdio: 'ignore',
});
child.unref();
```

이렇게 하면 브라우저는 평소처럼 "완료: N개 추가됨"을 바로 보고, 영상 생성은 백그라운드에서 진행된다. 진행 상황/에러는 `npm run serve`를 실행 중인 터미널 콘솔에 그대로 찍힌다 (기존 프로젝트의 로그 확인 관례와 동일, 별도 알림 시스템은 이번 범위에 넣지 않음 — YAGNI).

### 4.5 `video-remotion/process-account-a.js` (신규)

입력: `--json '{"productTitle","productDesc","price","imageUrl"}'` (render.js의 `--json`/`--input` 관례를 그대로 따름).

```
1. .env 로드 (NVIDIA_API_KEY, CLOUDINARY_*, GOOGLE_SERVICE_ACCOUNT_KEY_FILE, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME)
2. NVIDIA API 직접 호출 — n8n "NVIDIA 요청 만들기" 노드와 동일한 프롬프트를 재사용해 post_text(=훅 문구)를 얻음.
   이 훅 문구는 영상 오버레이 전용이며, 실제 게시글 본문(n8n이 나중에 별도로 생성)과 토씨까지 일치하지는
   않을 수 있음 — 둘 다 같은 상품 정보로 만든 AI 훅이라 톤은 비슷하되, 완전 동일한 문장을 보장하진 않음
   (허용된 트레이드오프, 4.6 참고).
3. render.js를 자식 프로세스로 호출: execFileSync('node', ['render.js', '--json', JSON.stringify({
     productImageUrl: imageUrl, price, hookText: <2번 결과>, variant: 'jumpcut-closeup'
   })]) → stdout로 Cloudinary video_url 받음.
4. 구글시트 폴링: productTitle과 일치하고 affiliate_link가 비어있지 않은 행을 찾을 때까지
   30초 간격으로 재조회 (최대 60회 = 30분). 찾으면 그 행의 row_number를 기록.
5. 찾은 행의 video_url 셀에 3번 결과를 기록 (values.update, 헤더에서 'video_url' 컬럼 위치를
   동적으로 찾아서 사용 — 컬럼 순서가 바뀌어도 안전하도록).
6. 30분 안에 못 찾으면: 콘솔에 에러 로그 남기고 종료 (게시 요청은 어차피 보내지 않으므로 실패해도
   게시 로직에는 영향 없음 — 다음에 사용자가 직접 재시도하거나 확인 가능).
```

**variant 선택**: 이번 구현은 `jumpcut-closeup` 고정. A/B 테스트로 `zoomout-reveal`도 섞고 싶으면 이후 별도 작업(범위 밖).

### 4.6 n8n 워크플로우 수정 — 정확히 4곳, 전부 기존 노드의 소규모 추가/변경 (새 노드 없음)

**① `제휴링크 있는 상품만 선택` (Code)** — account_A 행은 video_url까지 준비됐을 때만 "준비됨"으로 인정:

```js
const rows = $input.all();
const ready = rows.find(r => {
  const hasLink = r.json.affiliate_link && String(r.json.affiliate_link).trim();
  if (!hasLink) return false;
  if (r.json.account_id === 'account_A') {
    return !!(r.json.video_url && String(r.json.video_url).trim());
  }
  return true;
});
return ready ? [ready] : [];
```

**② `계정 순번 배정 (시트큐)` (Code)** — account_A로 이미 지정된 행은 라운드로빈을 건너뛰고 반드시 account_A 토큰 사용:

```js
const accounts = $input.all().map(i => ({ account_id: i.json.account_id, threads_user_id: i.json.threads_user_id }));
const row = $('제휴링크 있는 상품만 선택').first().json;

let account;
if (row.account_id === 'account_A') {
  account = accounts.find(a => a.account_id === 'account_A');
  if (!account) {
    throw new Error('account_A 계정이 계정 목록(Data Table)에 없습니다.');
  }
} else {
  account = accounts[(row.row_number || 0) % accounts.length];
}

return [{
  json: {
    ...row,
    account_id: account.account_id,
    threads_user_id: account.threads_user_id
  }
}];
```

**③ `상품 정보 입력 (시트)` (Set)** — `video_url` 필드 하나 추가로 통과시킴:

기존 assignments 배열에 `{ id: "s1-8", name: "video_url", value: "={{ $json.video_url }}", type: "string" }` 추가.

**④ `응답 파싱 및 댓글 텍스트 구성` (Code)** — 미리 준비된 video_url이 있으면 그걸 쓰고, 없으면 기존 zoompan 그대로 (한 줄):

```js
// 기존: const videoUrl = toZoompanVideoUrl(productInfo.image_url || '');
const videoUrl = productInfo.video_url || toZoompanVideoUrl(productInfo.image_url || '');
```

이 4개 수정 모두 **기존 브랜치(계정 B 등)의 동작을 조건 없이 그대로 보존**한다 — `account_id !== 'account_A'`인 모든 경로는 수정 전후 완전히 동일하게 동작함 (①②는 `if (r.json.account_id === 'account_A')`/`if (row.account_id === 'account_A')`로 분기, ③은 필드 추가만, ④는 `||` fallback).

## 5. 데이터 흐름 요약

```
[사용자] 쿠팡 화면에서 상품 정보 복사
  → collect.html에 붙여넣기 → 미리보기 → "계정A 영상용" 체크 → "시트에 추가"
  → collect-server.js: 시트에 행 추가(account_id=account_A, affiliate_link 아직 없음)
                        + process-account-a.js 백그라운드 실행
       [로컬, 병렬] process-account-a.js: NVIDIA 훅 문구 → render.js 영상+업로드
                     → 제휴링크 채워질 때까지 폴링 (사용자가 그동안 쿠팡 파트너스에서
                       직접 링크 생성해서 시트에 채워넣음, 기존 수동 프로세스 그대로)
                     → 채워지면 그 행의 video_url 셀에 기록하고 종료
  → [n8n, 3시간마다] 시트 큐 확인 → account_A 행은 video_url 있어야 선택됨
                     → 준비 안 됐으면 이번 턴 skip, 다음 3시간 턴에 재확인
                     → 준비되면: 라운드로빈 무시하고 account_A 토큰으로 게시
                     → 게시 완료 → 시트에 posted=TRUE 기록
```

## 6. 테스트 계획

1. `scripts/lib/sheetRow.test.js` 재실행 — 기존 테스트 그대로 통과 확인 (컬럼 확장 후 회귀 없는지)
2. n8n `test_workflow`(또는 수동 트리거)로 4곳 수정 후 **합성 데이터**로 두 경로 모두 검증:
   - account_id가 없는(또는 account_B인) 일반 행 → 기존과 동일하게 zoompan으로 처리되는지 (회귀 없음 확인)
   - account_id='account_A' + video_url 없음 → 이번 턴에 skip되는지 (게시 시도 자체가 안 일어나는지)
   - account_id='account_A' + video_url 있음 → 해당 video_url로, account_A 토큰으로 게시되는지
3. `process-account-a.js` 로컬 단독 실행(실제 상품 1개, `--json`으로 직접 호출) → NVIDIA 호출·영상 렌더·업로드·폴링·시트 기록까지 실제로 동작하는지 end-to-end 확인 — 이때 시트의 실제 대상 행은 테스트용으로 미리 제휴링크까지 채워둔 행을 사용해 폴링 대기 없이 즉시 검증
4. `collect.html` + `collect-server.js` 통합: 브라우저에서 실제로 "계정A 영상용" 체크 후 추가 → 콘솔에 process-account-a.js 로그가 뜨는지, 시트에 account_id가 정확히 기록되는지 확인

## 7. 리스크 / 가정

- **훅 문구 불일치**: 영상 오버레이 문구(로컬 NVIDIA 호출)와 실제 게시글 본문(n8n NVIDIA 호출)이 서로 다른 AI 호출 결과라 문장이 완전히 같지 않을 수 있음. 둘 다 같은 상품 정보 기반이라 톤/주제는 일치하지만, 정확히 같은 문장을 원하면 후속 작업 필요 (허용된 트레이드오프로 명시).
- **폴링 타임아웃(30분)**: 사용자가 제휴링크를 30분 안에 안 채우면 process-account-a.js가 조용히 종료됨. 영상은 이미 Cloudinary에 업로드돼 있지만 시트에는 기록 안 됨 — 이 경우 사용자가 콘솔 로그를 보고 수동 재시도해야 함 (v1 한계, 자동 재시도 큐는 범위 밖).
- **product_title 매칭**: 폴링 시 상품명으로 행을 찾음 — 같은 이름의 상품을 짧은 시간 내 중복 수집하면 잘못된 행을 찾을 위험이 이론상 있음. `collect.html`이 이미 제목 기준 중복 감지를 하고 있어 (`getExistingProductTitles`) 실제 발생 가능성은 낮음.
- **NVIDIA API 키 필요**: 사용자가 직접 https://build.nvidia.com 에서 발급해 `video-remotion/.env`에 넣어야 함 (n8n에 저장된 키는 보안상 재사용 불가).
- **n8n 4개 노드 수정은 실운영 워크플로우에 대한 직접 변경**임 — 스펙 6번의 합성 데이터 테스트를 실제 스케줄이 다음에 돌기 전에 반드시 먼저 통과시킨다.

## 8. 범위 제외

- 폴링 타임아웃 시 자동 재시도/알림(Telegram 등) — 이번엔 콘솔 로그만
- `zoomout-reveal` variant를 활용한 A/B 테스트 — variant는 `jumpcut-closeup` 고정
- `add-product.js`/`generate-coupang-link.js`/`collect-from-clipboard.js`에 동일한 체크박스 기능 추가 — 이번엔 `collect.html`/`collect-server.js` 경로만
- 계정 A/B 외 추가 계정(`acc_general` 등)에 대한 영상 파이프라인 확장
