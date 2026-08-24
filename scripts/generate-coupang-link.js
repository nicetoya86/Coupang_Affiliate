/**
 * 쿠팡 파트너스 자동 링크 수집 스크립트
 *
 * 수동 로그인 -> 간편링크 페이지 상품 목록 순회 -> 신규 상품만 "링크 생성" 클릭 ->
 * 구글시트에 큐로 append (product_desc는 product_title로 대체, 상세페이지 방문 없음)
 *
 * !! 중요 !!
 * 로그인 폼, 썸네일 목록, "링크 생성" 버튼, 단축 URL 필드 —
 * 전부 실제 페이지 구조를 직접 보지 못한 상태로 작성됨. 첫 실행은 반드시 브라우저 창을
 * 보면서 확인하고, 실패하는 지점이 있으면 에러 메시지 + screenshots/ 폴더의 스크린샷을
 * 보고 SELECTORS를 함께 수정해야 한다.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createSheetsClient, getExistingProductTitles, appendRows } = require('./lib/sheets');
const { createDriveClient, uploadPublicImage } = require('./lib/drive');
const { composeProductImage } = require('./lib/composeImage');
const { selectNewCandidates } = require('./lib/dedup');
const { toSheetRow } = require('./lib/sheetRow');
const { parseDiscountRate } = require('./lib/discount');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const MIN_DISCOUNT_RATE = Number(process.env.MIN_DISCOUNT_RATE || 90);
const LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

const PARTNERS_URL = 'https://partners.coupang.com/#affiliate/ws/link';
const STORAGE_STATE_FILE = path.join(__dirname, '.storage-state.json');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

const SELECTORS = {
  loginIdInput: 'input[name="login"], input#login, input[type="text"][name*="id" i], input[type="email"], input#login-email-input, input[name="email"]',
  thumbnailList: '.product-item',
  generateLinkButton: 'button:has-text("링크 생성"), a:has-text("링크 생성")',
  shortUrlField: 'input[readonly], input[value*="link.coupang.com"], .shorten-url-input',
  priceText: '[class*="price"]',
  // ponytail: 원가(취소선) 표시 위치는 실제 카드 구조 미확인 상태의 추정 셀렉터.
  // 못 찾으면 originalPrice는 빈 값으로 남고 합성 이미지에서 취소선 가격만 생략됨(치명적 실패 아님).
  originalPriceText: '[class*="original"], [class*="base-price"], s, del, strike',
  thumbnailImage: 'img',
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

async function readListingInfo(item, index) {
  await item.scrollIntoViewIfNeeded();
  await item.hover();

  const text = await item.innerText().catch(() => '');
  // 호버 시 나타나는 "상품정보"/"링크 생성" 오버레이 라벨, 가격(...원) 줄, 할인율(...%) 줄을 제외한 첫 줄이 실제 제목
  const titleLine = text
    .trim()
    .split('\n')
    .find((l) => l && l !== '상품정보' && l !== '링크 생성' && !/원$/.test(l) && !/%$/.test(l));

  return {
    product_title: titleLine || `쿠팡 추천 상품 #${index}`,
    discountRate: parseDiscountRate(text),
  };
}

async function buildProductImageUrl(drive, item, { title, originalPrice, discountPrice, discountRate }) {
  try {
    const imgSrc = await item.locator(SELECTORS.thumbnailImage).first().getAttribute('src');
    if (!imgSrc) return '';

    const imgResponse = await fetch(imgSrc);
    if (!imgResponse.ok) return '';
    const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());

    const composed = await composeProductImage({
      imageBuffer,
      title,
      originalPrice,
      discountPrice,
      discountRate,
    });

    return await uploadPublicImage(drive, composed, `coupang-${Date.now()}.png`, GOOGLE_DRIVE_FOLDER_ID || undefined);
  } catch (e) {
    // ponytail: 이미지 합성/업로드 실패해도 링크 수집 자체는 계속 진행 (image_url만 빈 값)
    console.error(`[경고] 이미지 합성/업로드 실패: ${e.message}`);
    return '';
  }
}

async function collectCandidate(context, page, drive, item, index) {
  const { product_title: productTitle, discountRate } = await readListingInfo(item, index);
  const price = await item.locator(SELECTORS.priceText).first().innerText().catch(() => '');
  const originalPrice = await item.locator(SELECTORS.originalPriceText).first().innerText().catch(() => '');

  const imageUrl = await buildProductImageUrl(drive, item, {
    title: productTitle,
    originalPrice,
    discountPrice: price,
    discountRate,
  });

  const generateBtn = item.locator(SELECTORS.generateLinkButton).first();
  const hasButton = await generateBtn.count().then((c) => c > 0).catch(() => false);
  if (!hasButton) {
    throw new Error(`후보 #${index}: "링크 생성" 버튼을 찾지 못했습니다. SELECTORS.generateLinkButton을 확인해주세요.`);
  }

  try {
    await generateBtn.click();
    await page.waitForTimeout(1500);

    const shortUrlField = page.locator(SELECTORS.shortUrlField).first();
    await shortUrlField.waitFor({ timeout: 10000 });
    const affiliateLink = (await shortUrlField.getAttribute('value')) || (await shortUrlField.innerText()).trim();

    if (!affiliateLink || !affiliateLink.includes('link.coupang.com')) {
      throw new Error(`후보 #${index}: 제휴 링크를 확인하지 못했습니다 (얻은 값: "${affiliateLink}"). SELECTORS.shortUrlField를 확인해주세요.`);
    }

    return {
      product_title: productTitle,
      price: price.trim(),
      product_desc: productTitle,
      affiliate_link: affiliateLink,
      image_url: imageUrl,
    };
  } finally {
    // "링크 생성" 클릭이 목록 페이지 전체를 단일 상품 결과 페이지로 이동시키므로,
    // 다음 후보를 items.nth(index)로 찾을 수 있도록 목록 페이지로 복귀
    await page.goto(PARTNERS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECTORS.thumbnailList, { timeout: 20000 }).catch(() => {});
  }
}

async function main() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE || !GOOGLE_SHEET_ID) {
    throw new Error('.env에 GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SHEET_ID를 채워주세요.');
  }

  const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const drive = createDriveClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const existingTitles = await getExistingProductTitles(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
  console.log(`[진행] 시트에 이미 있는 상품 ${existingTitles.length}개 확인`);

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
      const { product_title: productTitle, discountRate } = await readListingInfo(items.nth(index), index);
      lightCandidates.push({ index, product_title: productTitle, discountRate });
    }

    const newCandidates = selectNewCandidates(lightCandidates, existingTitles);
    const dedupSkipped = lightCandidates.length - newCandidates.length;

    const discountFiltered = newCandidates.filter((c) => c.discountRate !== null && c.discountRate >= MIN_DISCOUNT_RATE);
    const discountSkipped = newCandidates.length - discountFiltered.length;

    console.log(
      `[진행] 신규 후보 ${newCandidates.length}개 (중복 ${dedupSkipped}개 제외) 중 할인율 ${MIN_DISCOUNT_RATE}%+ ${discountFiltered.length}개 (할인율 미달/미확인 ${discountSkipped}개 제외)`,
    );

    for (const { index } of discountFiltered) {
      try {
        const item = items.nth(index);
        const candidate = await collectCandidate(context, page, drive, item, index);
        await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, [
          toSheetRow(candidate, nowKstIso()),
        ]);
        collected += 1;
        console.log(`[완료] 시트에 추가: ${candidate.product_title}`);
      } catch (candidateError) {
        failed += 1;
        console.error(`[오류] 후보 #${index} 처리 실패: ${candidateError.message}`);
        await screenshotOnFailure(page, `candidate-${index}`);
      }
    }

    console.log(
      `[종료] 신규 ${collected}건 추가, 중복 ${dedupSkipped}건 제외, 할인율 미달/미확인 ${discountSkipped}건 제외, 실패 ${failed}건`,
    );
  } catch (err) {
    console.error('[치명적 오류]', err.message);
    await screenshotOnFailure(page, 'fatal');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
