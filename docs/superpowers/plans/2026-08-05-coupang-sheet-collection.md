# 쿠팡 제휴상품 수집 → 구글시트 → n8n 자동 포스팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/generate-coupang-link.js`를 개편해 (로그인 자동입력 대신 수동 로그인 + 세션 재사용) 쿠팡 파트너스 간편링크 페이지의 상품을 순회하며 제목/가격/상세설명/제휴링크를 구글시트에 큐로 적재하고, n8n에 새 브랜치를 추가해 3시간마다 그 큐를 읽어 기존 AI 스토리텔링·Threads 게시 체인으로 자동 게시한다.

**Architecture:** 로컬 Node.js + Playwright 스크립트가 수동 로그인 세션을 `storageState.json`으로 재사용하며 상품을 수집, `googleapis`로 구글시트에 append. n8n 라이브 워크플로우(`NgC6DlDTrW3tnygc`)에 Schedule Trigger + Google Sheets 노드로 구성된 새 브랜치를 추가해 기존 공유 체인(`현재 토큰 불러오기` 이후)에 합류시키고, 게시 성공 후 시트 행을 `posted=Y`로 업데이트.

**Tech Stack:** Node.js 22 (내장 `node:test`/`node:assert`), Playwright, googleapis, n8n (n8n-mcp 도구로 라이브 워크플로우 직접 수정)

## Global Constraints

- 새 외부 라이브러리는 `googleapis` 하나만 추가 (Sheets API 호출에 불가피, 그 외 신규 의존성 금지)
- 계정 자격증명(쿠팡 ID/PW)을 코드/`.env`/커밋에 저장하지 않음 — 로그인은 항상 사용자가 직접 브라우저에서 수행
- `.env`, `.storage-state.json`, 구글 서비스계정 JSON 키는 절대 커밋하지 않음 (`.gitignore` 확인 필수)
- 쿠팡 파트너스 정책 준수 문구(경제적 이해관계 표시)는 기존처럼 코드가 강제 삽입 — 이번 작업에서 그 로직 변경 안 함
- n8n 라이브 워크플로우는 현재 `active: false` 상태 — 이 작업 중 활성화하지 않음 (사용자가 검증 후 직접 활성화)
- 기존 파일 구조/네이밍 컨벤션 유지: 로그 메시지 `[진행]/[완료]/[오류]/[경고]/[치명적 오류]` 접두어, `screenshotOnFailure` 패턴, 노드 이름 한글 네이밍

---

### Task 1: dedup 순수 함수 + 테스트

**Files:**
- Create: `scripts/lib/dedup.js`
- Test: `scripts/lib/dedup.test.js`

**Interfaces:**
- Produces: `selectNewCandidates(candidates: Array<{product_url?: string}>, existingProductUrls: string[]): Array<T>` — `product_url`이 없거나 `existingProductUrls`에 이미 있는 후보를 제외한 배열 반환. Task 6에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```javascript
// scripts/lib/dedup.test.js
const test = require('node:test');
const assert = require('node:assert');
const { selectNewCandidates } = require('./dedup');

test('시트에 이미 있는 product_url은 걸러진다', () => {
  const candidates = [
    { product_url: 'https://coupang.com/vp/products/1', product_title: 'A' },
    { product_url: 'https://coupang.com/vp/products/2', product_title: 'B' },
  ];
  const existing = ['https://coupang.com/vp/products/1'];
  const result = selectNewCandidates(candidates, existing);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].product_url, 'https://coupang.com/vp/products/2');
});

test('product_url이 없는 후보는 항상 제외된다', () => {
  const candidates = [{ product_title: '제목만 있음' }];
  const result = selectNewCandidates(candidates, []);
  assert.strictEqual(result.length, 0);
});

test('existingProductUrls가 비어있으면 전부 통과한다', () => {
  const candidates = [{ product_url: 'https://coupang.com/vp/products/3' }];
  const result = selectNewCandidates(candidates, []);
  assert.strictEqual(result.length, 1);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd scripts && node --test lib/dedup.test.js`
Expected: FAIL — `Cannot find module './dedup'`

- [ ] **Step 3: 최소 구현 작성**

```javascript
// scripts/lib/dedup.js
function selectNewCandidates(candidates, existingProductUrls) {
  const seen = new Set(existingProductUrls);
  return candidates.filter((c) => c.product_url && !seen.has(c.product_url));
}

module.exports = { selectNewCandidates };
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd scripts && node --test lib/dedup.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/dedup.js scripts/lib/dedup.test.js
git commit -m "feat: add dedup helper for sheet-based product collection"
```

---

### Task 2: 시트 행 스키마 순수 함수 + 테스트

**Files:**
- Create: `scripts/lib/sheetRow.js`
- Test: `scripts/lib/sheetRow.test.js`

**Interfaces:**
- Produces: `SHEET_COLUMNS: string[]` (컬럼 순서: `collected_at, product_title, price, product_desc, product_url, affiliate_link, posted`), `toSheetRow(candidate, collectedAt: string): string[]` — Task 3(구글시트 append/조회)과 Task 6(메인 스크립트)에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```javascript
// scripts/lib/sheetRow.test.js
const test = require('node:test');
const assert = require('node:assert');
const { toSheetRow, SHEET_COLUMNS } = require('./sheetRow');

test('컬럼 순서대로 배열을 만든다', () => {
  const row = toSheetRow(
    {
      product_title: '3in1 무선 핸디 청소기',
      price: '29,900원',
      product_desc: '강력한 흡입력',
      product_url: 'https://www.coupang.com/vp/products/1234567890',
      affiliate_link: 'https://link.coupang.com/a/example',
    },
    '2026-08-05T00:00:00.000Z',
  );

  assert.strictEqual(row.length, SHEET_COLUMNS.length);
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('collected_at')], '2026-08-05T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('product_title')], '3in1 무선 핸디 청소기');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('affiliate_link')], 'https://link.coupang.com/a/example');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('posted')], '');
});

test('빠진 필드는 빈 문자열로 채운다', () => {
  const row = toSheetRow({ product_title: '제목만' }, '2026-08-05T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('price')], '');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('product_desc')], '');
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd scripts && node --test lib/sheetRow.test.js`
Expected: FAIL — `Cannot find module './sheetRow'`

- [ ] **Step 3: 최소 구현 작성**

```javascript
// scripts/lib/sheetRow.js
const SHEET_COLUMNS = ['collected_at', 'product_title', 'price', 'product_desc', 'product_url', 'affiliate_link', 'posted'];

function toSheetRow(candidate, collectedAt) {
  return [
    collectedAt,
    candidate.product_title || '',
    candidate.price || '',
    candidate.product_desc || '',
    candidate.product_url || '',
    candidate.affiliate_link || '',
    '',
  ];
}

module.exports = { SHEET_COLUMNS, toSheetRow };
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd scripts && node --test lib/sheetRow.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/sheetRow.js scripts/lib/sheetRow.test.js
git commit -m "feat: add sheet row schema helper"
```

---

### Task 3: 구글시트 I/O 모듈

**Files:**
- Create: `scripts/lib/sheets.js`
- Modify: `scripts/package.json` (`googleapis` 의존성 추가)

**Interfaces:**
- Consumes: `SHEET_COLUMNS` from `./sheetRow` (Task 2)
- Produces: `createSheetsClient(keyFile: string): sheets_v4.Sheets`, `getExistingProductUrls(sheets, spreadsheetId: string, sheetName: string): Promise<string[]>`, `appendRows(sheets, spreadsheetId: string, sheetName: string, rows: string[][]): Promise<void>` — Task 6에서 사용.

이 모듈은 실제 Google API를 호출하므로 자동 단위테스트 대신, 구현 직후 실제 시트로 수동 검증한다 (Step 4).

- [ ] **Step 1: `googleapis` 의존성 추가**

`scripts/package.json`의 `dependencies`에 추가:

```json
"googleapis": "^144.0.0"
```

Run: `cd scripts && npm install`

- [ ] **Step 2: 구현 작성**

```javascript
// scripts/lib/sheets.js
const { google } = require('googleapis');
const { SHEET_COLUMNS } = require('./sheetRow');

const PRODUCT_URL_COL_INDEX = SHEET_COLUMNS.indexOf('product_url');

function createSheetsClient(keyFile) {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getExistingProductUrls(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:G`,
  });
  const rows = res.data.values || [];
  return rows.map((row) => row[PRODUCT_URL_COL_INDEX]).filter(Boolean);
}

async function appendRows(sheets, spreadsheetId, sheetName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

module.exports = { createSheetsClient, getExistingProductUrls, appendRows };
```

- [ ] **Step 3: 구글시트 헤더 준비 확인**

대상 구글시트(사용자가 이미 서비스계정 설정 완료한 시트) 1행에 정확히 이 순서로 헤더가 있는지 확인, 없으면 채우기:
`collected_at | product_title | price | product_desc | product_url | affiliate_link | posted`

- [ ] **Step 4: 수동 연결 확인**

```bash
cd scripts
node -e "
require('dotenv').config();
const { createSheetsClient, getExistingProductUrls, appendRows } = require('./lib/sheets');
const sheets = createSheetsClient(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
const sheetId = process.env.GOOGLE_SHEET_ID;
const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
(async () => {
  const before = await getExistingProductUrls(sheets, sheetId, sheetName);
  console.log('기존 product_url 개수:', before.length);
  await appendRows(sheets, sheetId, sheetName, [['2026-08-05T00:00:00.000Z','테스트 상품','1,000원','테스트 설명','https://coupang.com/vp/products/test-row','https://link.coupang.com/a/test','']]);
  const after = await getExistingProductUrls(sheets, sheetId, sheetName);
  console.log('추가 후 개수:', after.length, '(1 늘어나야 정상)');
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
"
```

Expected: `추가 후 개수`가 `기존 product_url 개수 + 1`. 시트를 직접 열어 "테스트 상품" 행이 보이면 확인 완료 — **확인 후 이 테스트 행은 시트에서 수동으로 삭제**.

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/sheets.js scripts/package.json scripts/package-lock.json
git commit -m "feat: add google sheets read/append helper"
```

(`.env`에 실제 키 경로/시트ID가 채워져 있는지는 이번 Step에서 커밋 대상 아님 — `.gitignore`에 이미 등록되어 있는지 Task 7에서 재확인)

---

### Task 4: 로그인 수동화 + 세션 재사용

**Files:**
- Modify: `scripts/generate-coupang-link.js` (전체 재작성 — 이 Task는 로그인부만, Task 5·6에서 나머지 이어감)
- Modify: `scripts/.gitignore`

**Interfaces:**
- Consumes: 없음 (독립적인 Playwright 로직)
- Produces: `ensureLoggedIn(context, page): Promise<void>` — 로그인 폼이 보이면 사용자가 직접 로그인할 때까지 대기 후 세션 저장, 이미 로그인되어 있으면 즉시 반환. Task 6의 `main()`에서 호출.

Playwright 브라우저 자동화라 자동 테스트 불가 — 실제 브라우저로 눈으로 확인하는 것이 이 Task의 검증 방법이다 (Step 3).

- [ ] **Step 1: `.gitignore`에 세션 파일 추가**

`scripts/.gitignore`의 `.state.json`을 `.storage-state.json`으로 교체:

```
.env
node_modules/
.storage-state.json
screenshots/
```

- [ ] **Step 2: `generate-coupang-link.js`를 아래 내용으로 교체 (로그인부)**

```javascript
/**
 * 쿠팡 파트너스 자동 링크 수집 스크립트
 *
 * 수동 로그인 -> 간편링크 페이지 상품 목록 순회 -> 신규 상품만 "링크 생성" 클릭 ->
 * 상세페이지 방문해 설명 텍스트 추출 -> 구글시트에 큐로 append
 *
 * !! 중요 !!
 * 로그인 폼, 썸네일 목록, "링크 생성" 버튼, 단축 URL 필드, 상세페이지 설명 셀렉터 —
 * 전부 실제 페이지 구조를 직접 보지 못한 상태로 작성됨. 첫 실행은 반드시 브라우저 창을
 * 보면서 확인하고, 실패하는 지점이 있으면 에러 메시지 + screenshots/ 폴더의 스크린샷을
 * 보고 SELECTORS를 함께 수정해야 한다.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createSheetsClient, getExistingProductUrls, appendRows } = require('./lib/sheets');
const { selectNewCandidates } = require('./lib/dedup');
const { toSheetRow } = require('./lib/sheetRow');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

const PARTNERS_URL = 'https://partners.coupang.com/#affiliate/ws/link';
const STORAGE_STATE_FILE = path.join(__dirname, '.storage-state.json');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

const SELECTORS = {
  loginIdInput: 'input[name="login"], input#login, input[type="text"][name*="id" i]',
  thumbnailList: '[class*="product"], [class*="thumbnail"], [class*="goods"]',
  generateLinkButton: 'button:has-text("링크 생성"), a:has-text("링크 생성")',
  shortUrlField: 'input[readonly], input[value*="link.coupang.com"], [class*="short-url"]',
  priceText: '[class*="price"]',
  detailDescription: '[class*="detail"] [class*="description"], [class*="product-detail"]',
};

async function screenshotOnFailure(page, label) {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);
    const file = path.join(SCREENSHOT_DIR, `${Date.now()}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.error(`[디버그] 스크린샷 저장: ${file}`);
  } catch (e) {
    console.error('[디버그] 스크린샷 저장 실패:', e.message);
  }
}

async function ensureLoggedIn(context, page) {
  await page.goto(PARTNERS_URL, { waitUntil: 'domcontentloaded' });

  const idInput = page.locator(SELECTORS.loginIdInput).first();
  const hasLoginForm = await idInput.count().then((c) => c > 0).catch(() => false);

  if (hasLoginForm) {
    console.log('[대기] 브라우저 창에서 직접 쿠팡에 로그인해주세요 (최대 5분 대기)...');
    await page.waitForSelector(SELECTORS.thumbnailList, { timeout: LOGIN_WAIT_TIMEOUT_MS });
    console.log('[진행] 로그인 확인됨 - 세션 저장');
    await context.storageState({ path: STORAGE_STATE_FILE });
  } else {
    console.log('[진행] 저장된 세션으로 이미 로그인됨');
  }

  if (!page.url().includes('partners.coupang.com')) {
    await page.goto(PARTNERS_URL, { waitUntil: 'domcontentloaded' });
  }
}

module.exports = { ensureLoggedIn, screenshotOnFailure, SELECTORS, STORAGE_STATE_FILE, PARTNERS_URL };
```

(Task 6에서 `main()`을 이어붙여 `module.exports` 줄은 제거하고 실행 스크립트로 완성한다 — 지금은 로그인부만 독립적으로 눈으로 확인하기 위해 잠시 모듈로 내보낸다.)

- [ ] **Step 3: 로그인 흐름 직접 확인**

```bash
cd scripts
node -e "
const { chromium } = require('playwright');
const { ensureLoggedIn, STORAGE_STATE_FILE } = require('./generate-coupang-link');
const fs = require('fs');
(async () => {
  const hasSession = fs.existsSync(STORAGE_STATE_FILE);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(hasSession ? { storageState: STORAGE_STATE_FILE } : {});
  const page = await context.newPage();
  await ensureLoggedIn(context, page);
  console.log('로그인 확인 완료, 현재 URL:', page.url());
  await browser.close();
})();
"
```

Expected: 브라우저 창이 뜨고, 로그인 폼이 보이면 직접 로그인 — 로그인 완료 후 콘솔에 `로그인 확인 완료`가 뜨고 `scripts/.storage-state.json` 파일이 생성됨. 스크립트를 한 번 더 실행하면 로그인 폼 없이 바로 `[진행] 저장된 세션으로 이미 로그인됨`이 떠야 정상.

셀렉터가 실제 페이지와 안 맞으면(예: 로그인 폼 셀렉터가 안 잡히거나 `thumbnailList`가 안 뜸) 스크린샷/에러 메시지 보고 `SELECTORS` 값을 수정한다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/generate-coupang-link.js scripts/.gitignore
git commit -m "feat: switch coupang login to manual with session reuse"
```

---

### Task 5: 상품 정보 수집 (제목/가격/상세설명/제휴링크)

**Files:**
- Modify: `scripts/generate-coupang-link.js`

**Interfaces:**
- Consumes: `SELECTORS`, `screenshotOnFailure` (Task 4)
- Produces: `collectCandidate(context, page, item, index): Promise<{product_title, price, product_desc, product_url, affiliate_link}>` — Task 6의 `main()`에서 사용.

- [ ] **Step 1: `module.exports` 줄 아래에 후보 수집 함수 추가**

`scripts/generate-coupang-link.js`의 `module.exports` 줄을 아래로 교체(수집 함수 추가 + export 갱신):

```javascript
async function extractDescription(context, productUrl) {
  if (!productUrl) return '';
  const detailPage = await context.newPage();
  try {
    await detailPage.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const desc = await detailPage
      .locator(SELECTORS.detailDescription)
      .first()
      .innerText()
      .catch(() => '');
    return desc.trim();
  } catch (e) {
    console.error(`[경고] 상세페이지 설명 추출 실패 (${productUrl}): ${e.message}`);
    return '';
  } finally {
    await detailPage.close();
  }
}

async function collectCandidate(context, page, item, index) {
  await item.scrollIntoViewIfNeeded();
  await item.hover();

  const productTitle = await item
    .innerText()
    .then((t) => t.trim().split('\n')[0])
    .catch(() => `쿠팡 추천 상품 #${index}`);
  const price = await item.locator(SELECTORS.priceText).first().innerText().catch(() => '');
  const productUrl = (await item.locator('a').first().getAttribute('href').catch(() => null)) || '';

  const generateBtn = item.locator(SELECTORS.generateLinkButton).first();
  const hasButton = await generateBtn.count().then((c) => c > 0).catch(() => false);
  if (!hasButton) {
    throw new Error(`후보 #${index}: "링크 생성" 버튼을 찾지 못했습니다. SELECTORS.generateLinkButton을 확인해주세요.`);
  }

  await generateBtn.click();
  await page.waitForTimeout(1500);

  const shortUrlField = page.locator(SELECTORS.shortUrlField).first();
  await shortUrlField.waitFor({ timeout: 10000 });
  const affiliateLink = (await shortUrlField.getAttribute('value')) || (await shortUrlField.innerText()).trim();

  if (!affiliateLink || !affiliateLink.includes('link.coupang.com')) {
    throw new Error(`후보 #${index}: 제휴 링크를 확인하지 못했습니다 (얻은 값: "${affiliateLink}"). SELECTORS.shortUrlField를 확인해주세요.`);
  }

  const productDesc = await extractDescription(context, productUrl);

  return {
    product_title: productTitle,
    price: price.trim(),
    product_desc: productDesc,
    product_url: productUrl,
    affiliate_link: affiliateLink,
  };
}

module.exports = {
  ensureLoggedIn,
  screenshotOnFailure,
  collectCandidate,
  SELECTORS,
  STORAGE_STATE_FILE,
  PARTNERS_URL,
};
```

- [ ] **Step 2: 후보 수집 함수 직접 확인**

Task 4의 Step 3와 비슷한 방식으로, 로그인 후 `items.nth(0)`에 대해 `collectCandidate`를 호출해 콘솔에 결과를 찍어보고 `product_title`/`price`/`product_desc`/`affiliate_link`가 그럴듯한 값인지 눈으로 확인한다:

```bash
cd scripts
node -e "
const { chromium } = require('playwright');
const { ensureLoggedIn, collectCandidate, SELECTORS, STORAGE_STATE_FILE } = require('./generate-coupang-link');
const fs = require('fs');
(async () => {
  const hasSession = fs.existsSync(STORAGE_STATE_FILE);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(hasSession ? { storageState: STORAGE_STATE_FILE } : {});
  const page = await context.newPage();
  await ensureLoggedIn(context, page);
  await page.waitForSelector(SELECTORS.thumbnailList, { timeout: 20000 });
  const items = page.locator(SELECTORS.thumbnailList);
  const result = await collectCandidate(context, page, items.nth(0), 0);
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
"
```

Expected: `product_title`, `price`, `product_desc`, `affiliate_link`(=`link.coupang.com` 포함)가 채워진 JSON 출력. 값이 비어있거나 이상하면 해당 `SELECTORS` 항목을 실제 페이지 구조에 맞게 수정.

- [ ] **Step 3: 커밋**

```bash
git add scripts/generate-coupang-link.js
git commit -m "feat: collect product title, price, description and affiliate link"
```

---

### Task 6: 메인 루프 연결 (dedup + 시트 append)

**Files:**
- Modify: `scripts/generate-coupang-link.js`

**Interfaces:**
- Consumes: `ensureLoggedIn`, `collectCandidate`, `screenshotOnFailure`, `SELECTORS` (Task 4·5), `selectNewCandidates` (Task 1), `toSheetRow` (Task 2), `createSheetsClient`/`getExistingProductUrls`/`appendRows` (Task 3)
- Produces: 실행 진입점 (`main()`) — 더 이상 다른 Task가 이 함수를 소비하지 않음 (최종 조립)

- [ ] **Step 1: `module.exports` 줄을 지우고 `main()`으로 교체**

`scripts/generate-coupang-link.js` 맨 끝의 `module.exports = {...}` 줄을 아래 코드로 교체:

```javascript
async function main() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE || !GOOGLE_SHEET_ID) {
    throw new Error('.env에 GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SHEET_ID를 채워주세요.');
  }

  const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const existingUrls = await getExistingProductUrls(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
  console.log(`[진행] 시트에 이미 있는 상품 ${existingUrls.length}개 확인`);

  const hasStoredSession = fs.existsSync(STORAGE_STATE_FILE);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(hasStoredSession ? { storageState: STORAGE_STATE_FILE } : {});
  const page = await context.newPage();

  let collected = 0;
  let failed = 0;

  try {
    await ensureLoggedIn(context, page);

    await page.waitForSelector(SELECTORS.thumbnailList, { timeout: 20000 });
    const items = page.locator(SELECTORS.thumbnailList);
    const total = await items.count();
    console.log(`[진행] 상품 썸네일 ${total}개 발견`);

    if (total === 0) {
      throw new Error('상품 썸네일을 하나도 찾지 못했습니다. 로그인 상태와 페이지 구조를 확인해주세요.');
    }

    const lightCandidates = [];
    for (let index = 0; index < total; index += 1) {
      const productUrl = (await items.nth(index).locator('a').first().getAttribute('href').catch(() => null)) || '';
      lightCandidates.push({ index, product_url: productUrl });
    }

    const newCandidates = selectNewCandidates(lightCandidates, existingUrls);
    const skipped = lightCandidates.length - newCandidates.length;
    console.log(`[진행] 신규 후보 ${newCandidates.length}개 (중복 ${skipped}개 제외)`);

    for (const { index } of newCandidates) {
      try {
        const item = items.nth(index);
        const candidate = await collectCandidate(context, page, item, index);
        await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, [
          toSheetRow(candidate, new Date().toISOString()),
        ]);
        collected += 1;
        console.log(`[완료] 시트에 추가: ${candidate.product_title}`);
      } catch (candidateError) {
        failed += 1;
        console.error(`[오류] 후보 #${index} 처리 실패: ${candidateError.message}`);
        await screenshotOnFailure(page, `candidate-${index}`);
      }
    }

    console.log(`[종료] 신규 ${collected}건 추가, 중복 ${skipped}건 제외, 실패 ${failed}건`);
  } catch (err) {
    console.error('[치명적 오류]', err.message);
    await screenshotOnFailure(page, 'fatal');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
```

- [ ] **Step 2: 전체 실행으로 확인**

```bash
cd scripts
npm run run
```

Expected: 로그인(또는 세션 재사용) → `[진행] 신규 후보 N개` → 신규 상품마다 `[완료] 시트에 추가: ...` 출력 → `[종료] 신규 N건 추가...`. 구글시트를 열어 새 행들이 정확한 컬럼에 들어갔는지 확인. 스크립트를 바로 한 번 더 실행했을 때 `[진행] 신규 후보 0개`가 나오면 dedup이 정상 동작하는 것.

- [ ] **Step 3: 커밋**

```bash
git add scripts/generate-coupang-link.js
git commit -m "feat: wire dedup and sheet append into main collection loop"
```

---

### Task 7: 설정 파일 정리 (package.json / .env.example / README)

**Files:**
- Modify: `scripts/package.json`
- Modify: `scripts/.env.example`
- Modify: `scripts/README.md`

**Interfaces:** 없음 (설정/문서 전용)

- [ ] **Step 1: `package.json` 정리**

`scripts/package.json`을 아래 내용으로 교체 (기존 `run:headed` 스크립트와 `cross-env` 의존성 제거 — 항상 headed로만 실행하므로 더 이상 필요 없음):

```json
{
  "name": "coupang-partners-link-automation",
  "version": "0.2.0",
  "private": true,
  "description": "Logs into Coupang Partners (manual login), collects new product thumbnails, generates affiliate links, and appends them to a Google Sheet queue.",
  "type": "commonjs",
  "scripts": {
    "install-browser": "playwright install chromium",
    "run": "node generate-coupang-link.js",
    "test": "node --test lib/*.test.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "googleapis": "^144.0.0",
    "playwright": "^1.48.0"
  }
}
```

Run: `cd scripts && npm install` (lockfile 갱신 확인)

- [ ] **Step 2: `.env.example` 교체**

```
# 이 파일을 복사해서 .env로 저장한 뒤, 실제 값으로 채워주세요.
# .env는 절대 커밋/공유/채팅에 붙여넣지 마세요 (.gitignore에 이미 등록됨).

# 구글 서비스계정 JSON 키 파일 경로 (Sheets API 사용)
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json

# 상품 큐로 쓸 구글시트 ID와 탭 이름
# 시트 URL .../d/{여기}/edit 에서 확인
GOOGLE_SHEET_ID=여기에_시트ID_입력
GOOGLE_SHEET_NAME=Sheet1
```

- [ ] **Step 3: `README.md` 교체**

```markdown
# 쿠팡 파트너스 상품 수집 — 설정 가이드

로그인(수동) → 간편링크 페이지 상품 순회 → 제목/가격/상세설명/제휴링크 수집 →
구글시트 큐에 append까지 자동화하는 로컬 스크립트입니다.
**사용자 PC에서 직접 실행**되어야 합니다 (n8n Cloud에는 브라우저 자동화 노드가 없습니다).

## ⚠️ 먼저 알아야 할 것

- **셀렉터 미검증**: `SELECTORS` 값은 실제 페이지를 보지 못한 상태로 추정 작성했습니다. 첫 실행에서 반드시 눈으로 확인하고, 실패하면 콘솔 에러 + `screenshots/` 폴더 스크린샷을 보고 셀렉터를 함께 고쳐야 합니다.
- **로그인은 항상 수동**: 브라우저 창이 뜨면 직접 로그인합니다. 로그인 정보는 코드/`.env`/커밋 어디에도 저장되지 않습니다. 로그인 성공 시 세션이 `.storage-state.json`에 저장되어 다음 실행부터는 로그인 단계를 건너뜁니다 (세션 만료 시 다시 로그인 창이 뜸).
- **구글 서비스계정 키 보안**: `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`이 가리키는 JSON 파일은 절대 커밋/공유하지 마세요.
- **ToS 리스크**: 쿠팡 파트너스는 자동화를 제한할 수 있습니다. 계정 정지 리스크를 인지하고 진행해주세요.
- **n8n 연동은 별도**: 이 스크립트는 시트에 쓰는 것까지만 합니다. 시트를 읽어 Threads에 자동 게시하는 것은 n8n 워크플로우(`쿠팡 파트너스 - Threads 자동 포스팅`)의 별도 브랜치가 담당합니다.

## 1. 설치

```bash
cd scripts
npm install
npm run install-browser   # Playwright용 Chromium 다운로드
```

## 2. 구글 서비스계정 준비 (최초 1회)

1. console.cloud.google.com → 프로젝트 생성/선택
2. "API 및 서비스" → "라이브러리" → "Google Sheets API" 사용 설정
3. "사용자 인증 정보" → "사용자 인증 정보 만들기" → "서비스 계정" 생성
4. 서비스계정 → "키" → "키 추가" → JSON 다운로드
5. JSON 안의 `client_email`을 대상 구글시트에 "편집자"로 공유
6. 시트 1행에 헤더 작성: `collected_at | product_title | price | product_desc | product_url | affiliate_link | posted`

## 3. 환경변수 설정

```bash
copy .env.example .env
```

`.env`를 열어 `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`을 실제 값으로 채웁니다.

## 4. 단위 테스트 (선택)

```bash
npm test
```

dedup/시트 행 스키마 같은 순수 로직만 검증합니다 (실제 브라우저/구글 API 호출은 포함 안 됨).

## 5. 실행

```bash
npm run run
```

- 브라우저 창이 뜹니다. 로그인 폼이 보이면 직접 로그인하세요 (최대 5분 대기).
- 로그인 후 자동으로 간편링크 페이지의 상품을 순회하며, 시트에 없는 신규 상품만 "링크 생성" → 상세설명 수집 → 시트에 append합니다.
- 실패한 후보는 건너뛰고 계속 진행하며, 실패 지점은 `screenshots/` 폴더에 스크린샷으로 남습니다.

## 6. 반복 실행 (선택, Windows 작업 스케줄러)

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "generate-coupang-link.js" -WorkingDirectory "D:\vibecording\Coupang_Affiliate\scripts"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "CoupangSheetCollect" -Action $action -Trigger $trigger -Description "쿠팡 파트너스 상품 수집 (3시간마다)"
```

**주의**: 세션이 만료된 상태에서 스케줄로 실행되면 로그인 대기 중 타임아웃(5분) 후 실패합니다 — PC 앞에 없을 때 세션이 만료되지 않도록 주기적으로 직접 한 번씩 실행해 세션을 갱신해주세요.

작업 확인/삭제:
```powershell
Get-ScheduledTask -TaskName "CoupangSheetCollect"
Unregister-ScheduledTask -TaskName "CoupangSheetCollect" -Confirm:$false
```

## 알려진 한계

- 상세페이지 설명 셀렉터(`SELECTORS.detailDescription`)는 미검증 상태입니다.
- 제외 카테고리(기프트카드, 의료기기 등) 자동 필터링 없음 — 목록에 섞여 있으면 그대로 수집됩니다.
- 상세페이지 방문이 추가되어 수집 속도가 느리고 페이지 구조 변경에 취약합니다.
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/package.json scripts/package-lock.json scripts/.env.example scripts/README.md
git commit -m "docs: update scripts config and setup guide for sheet-based collection"
```

---

### Task 8: n8n Branch C — 시트 기반 자동 포스팅

**Files:**
- Modify: 라이브 n8n 워크플로우 `NgC6DlDTrW3tnygc` (n8n-mcp 도구로 직접 수정)
- Modify: `coupang_threads_workflow.json` (라이브와 재동기화)

**Interfaces:** 없음 (n8n 워크플로우 노드/연결 추가, 코드 레벨 인터페이스 아님)

**사전 확인**: 이 Task 실행 전, n8n에 Google Sheets 인증정보가 있어야 한다.

- [ ] **Step 1: n8n Google Sheets Credential 확인/생성**

`list_credentials`로 `googleApi` 또는 `googleSheetsOAuth2Api` 타입 credential이 있는지 확인. 없으면 사용자가 n8n UI에서 직접 생성해야 함 (이 Task를 진행하는 에이전트는 사용자에게 아래를 요청):

> n8n UI → Credentials → New → "Google Sheets Account" 검색 → **Service Account** 방식 선택 → Task 3에서 만든 서비스계정 JSON 키 내용(또는 파일)을 붙여넣기 → 저장. 저장 후 그 credential의 이름/ID를 알려주세요.

`list_credentials`를 다시 호출해 새 credential의 `id`를 확보한다 (이후 Step들에서 `<SHEETS_CREDENTIAL_ID>`, `<SHEETS_CREDENTIAL_NAME>`로 표기한 자리에 실제 값을 채워 넣는다).

- [ ] **Step 2: 시트 ID/탭 이름 확보**

`scripts/.env`를 읽어 `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME` 값을 확인한다 (파일이 없거나 아직 채워지지 않았으면 사용자에게 직접 물어본다). 이후 Step들의 `<GOOGLE_SHEET_ID>`, `<GOOGLE_SHEET_NAME>` 자리에 실제 값을 채운다.

- [ ] **Step 3: 현재 라이브 워크플로우 재조회**

`get_workflow_details({ workflowId: "NgC6DlDTrW3tnygc" })`로 최신 노드/연결 상태를 다시 가져온다 (이전 조회 이후 사용자가 캔버스를 직접 건드렸을 수 있음 — 프로젝트 스펙 문서의 "라이브가 최신" 원칙).

- [ ] **Step 4: 새 노드 8개 추가**

기존 노드는 건드리지 않고 아래 노드들을 새로 추가한다 (`typeVersion`은 괄호 안 버전 사용):

1. **`3시간마다 시트 확인`** (`n8n-nodes-base.scheduleTrigger`, v1.3)
```json
{ "rule": { "interval": [{ "field": "hours", "hoursInterval": 3 }] } }
```

2. **`미게시 상품 조회 (시트)`** (`n8n-nodes-base.googleSheets`, v4.7)
```json
{
  "resource": "sheet",
  "operation": "read",
  "authentication": "serviceAccount",
  "documentId": { "__rl": true, "mode": "id", "value": "<GOOGLE_SHEET_ID>" },
  "sheetName": { "__rl": true, "mode": "name", "value": "<GOOGLE_SHEET_NAME>" },
  "returnAllMatches": "returnAllMatches"
}
```
credentials: `{ "googleApi": { "id": "<SHEETS_CREDENTIAL_ID>", "name": "<SHEETS_CREDENTIAL_NAME>" } }`

3. **`다음 미게시 상품 선택`** (`n8n-nodes-base.code`, v2, mode `runOnceForAllItems`)
```javascript
const rows = $input.all().map((item) => item.json);
const next = rows.find((row) => !row.posted || String(row.posted).trim() === '');

if (!next) {
  return [{ json: { found: false } }];
}

return [{
  json: {
    found: true,
    product_title: next.product_title,
    product_desc: next.product_desc,
    product_url: next.product_url,
    affiliate_link: next.affiliate_link,
  },
}];
```

4. **`다음 미게시 상품 있음?`** (`n8n-nodes-base.if`, v2.3)
조건: `{{ $json.found }}` equals (boolean) `true`

5. **`상품 정보 입력 (자동 - 시트)`** (`n8n-nodes-base.set`, v3.4) — IF의 true 출력에 연결
```json
{
  "assignments": {
    "assignments": [
      { "id": "sheet-0", "name": "product_title", "value": "={{ $json.product_title }}", "type": "string" },
      { "id": "sheet-1", "name": "product_desc", "value": "={{ $json.product_desc }}", "type": "string" },
      { "id": "sheet-2", "name": "product_url", "value": "={{ $json.product_url }}", "type": "string" },
      { "id": "sheet-3", "name": "affiliate_link", "value": "={{ $json.affiliate_link }}", "type": "string" },
      { "id": "sheet-4", "name": "threads_user_id", "value": "27629464336738548", "type": "string" }
    ]
  }
}
```

6. **`시트 업데이트 필요 확인`** (`n8n-nodes-base.code`, v2, mode `runOnceForAllItems`)
```javascript
let productUrl = null;
try {
  productUrl = $('상품 정보 입력 (자동 - 시트)').first().json.product_url;
} catch (e) {
  productUrl = null;
}

return [{ json: { needs_sheet_update: !!productUrl, product_url: productUrl } }];
```

7. **`시트 업데이트 필요?`** (`n8n-nodes-base.if`, v2.3)
조건: `{{ $json.needs_sheet_update }}` equals (boolean) `true`

8. **`시트 게시완료 표시`** (`n8n-nodes-base.googleSheets`, v4.7) — IF의 true 출력에 연결
```json
{
  "resource": "sheet",
  "operation": "update",
  "authentication": "serviceAccount",
  "documentId": { "__rl": true, "mode": "id", "value": "<GOOGLE_SHEET_ID>" },
  "sheetName": { "__rl": true, "mode": "name", "value": "<GOOGLE_SHEET_NAME>" },
  "columns": {
    "mappingMode": "defineBelow",
    "matchingColumns": ["product_url"],
    "value": { "product_url": "={{ $json.product_url }}", "posted": "Y" },
    "schema": [
      { "id": "product_url", "displayName": "product_url", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true },
      { "id": "posted", "displayName": "posted", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": false }
    ]
  }
}
```
credentials: 노드 2와 동일

- [ ] **Step 5: 연결(connections) 추가/수정**

새 연결:
- `3시간마다 시트 확인` → `미게시 상품 조회 (시트)`
- `미게시 상품 조회 (시트)` → `다음 미게시 상품 선택`
- `다음 미게시 상품 선택` → `다음 미게시 상품 있음?`
- `다음 미게시 상품 있음?` true(index 0) → `상품 정보 입력 (자동 - 시트)` / false(index 1) → 연결 없음
- `상품 정보 입력 (자동 - 시트)` → `현재 토큰 불러오기` (기존 공유 노드 — 이미 `상품 정보 입력`, `상품 정보 입력 (자동)`도 연결되어 있으므로 세 번째 입력으로 추가)
- `시트 업데이트 필요 확인` → `시트 업데이트 필요?`
- `시트 업데이트 필요?` true(index 0) → `시트 게시완료 표시` / false(index 1) → 연결 없음

기존 연결 수정 (덮어쓰기 아니라 같은 output에 노드 하나 추가):
- `댓글 게시 (제휴링크)`의 `main[0]`을 `[{"node":"게시 기록 저장 (중복방지)","type":"main","index":0}]`에서 `[{"node":"게시 기록 저장 (중복방지)","type":"main","index":0},{"node":"시트 업데이트 필요 확인","type":"main","index":0}]`로 변경 (기존 연결 유지 + 병렬로 추가)

- [ ] **Step 6: `응답 파싱 및 댓글 텍스트 구성` 노드 코드 수정**

이 노드는 현재 `상품 정보 입력` → 실패 시 `상품 정보 입력 (자동)`만 시도하는 2단계 try/catch다. Branch C(시트 소스)에서도 동작하도록 3단계로 확장한다.

기존 코드에서 이 부분을 찾아:
```javascript
let productInfo;
try {
  productInfo = $('상품 정보 입력').first().json;
} catch (e) {
  productInfo = $('상품 정보 입력 (자동)').first().json;
}
```

아래로 교체:
```javascript
let productInfo;
try {
  productInfo = $('상품 정보 입력').first().json;
} catch (e1) {
  try {
    productInfo = $('상품 정보 입력 (자동)').first().json;
  } catch (e2) {
    productInfo = $('상품 정보 입력 (자동 - 시트)').first().json;
  }
}
```

노드의 나머지 코드(댓글/본문 텍스트 조립, `DISCLOSURE` 삽입 등)는 그대로 둔다.

- [ ] **Step 7: 검증**

`validate_workflow`로 변경된 워크플로우 전체를 검증한다. 에러가 있으면(자주 발생하는 것: `matchingColumns` 누락, resource locator가 plain string인 경우, credential 미연결) 고쳐서 재검증.

- [ ] **Step 8: 사용자 확인 후 적용**

검증 통과한 노드/연결 diff 요약을 사용자에게 보여주고 승인받은 뒤 `update_workflow`로 라이브에 반영한다 (워크플로우는 현재 `active: false`라 반영해도 즉시 실행되지 않음 — 사용자가 검토 후 직접 활성화).

- [ ] **Step 9: 로컬 JSON 파일 재동기화**

`get_workflow_details`로 반영된 최종 상태를 다시 조회해 `coupang_threads_workflow.json`을 그 내용으로 덮어쓴다 (시크릿 값은 기존 파일처럼 플레이스홀더 유지).

- [ ] **Step 10: `coupang_threads_project_spec.md` 갱신**

"2. 아키텍처" 섹션에 Branch C 설명 추가, "10. TODO" 섹션에서 "상품 소싱 수동 입력 → API 연동" 항목을 이번 작업으로 대체됐다고 갱신. (스펙 문서 자체 업데이트 — 별도 커밋 불필요, 파일 편집만)

- [ ] **Step 11: 커밋**

```bash
git add coupang_threads_workflow.json coupang_threads_project_spec.md
git commit -m "feat: add sheet-driven auto-posting branch to n8n workflow"
```

---

## Self-Review 결과

- **스펙 커버리지**: 스펙 3.1(로그인/dedup/시트append) → Task 1,2,3,4,5,6. 스펙 3.2(시트 스키마) → Task 2,3,7. 스펙 3.3(Branch C) → Task 8. 스펙 6(준비물) → Task 3 Step3, Task 7 Step2, Task 8 Step1. 사용자 추가 요청(제목+가격+상세설명 수집, n8n이 읽어서 게시) → Task 5, Task 8. 누락 없음.
- **플레이스홀더 스캔**: Task 8의 `<GOOGLE_SHEET_ID>`, `<SHEETS_CREDENTIAL_ID>` 등은 실행 시점에 사용자 환경에서만 확정 가능한 값이라 남겨둠 — 각 자리마다 "어떻게 채우는지"(Step 1, 2에서 조회/질문 절차) 명시했으므로 금지된 막연한 TODO와는 다름.
- **타입/이름 일관성**: `SHEET_COLUMNS`/`toSheetRow`(Task 2)를 `sheets.js`(Task 3)와 `generate-coupang-link.js`(Task 6)가 동일하게 참조. 노드 이름(`상품 정보 입력 (자동 - 시트)` 등)이 Task 8 전체에서 일관되게 사용됨. `selectNewCandidates`의 인자 형태(`{product_url}` 배열)가 Task 1 테스트와 Task 6 사용처(`lightCandidates`)에서 일치.
