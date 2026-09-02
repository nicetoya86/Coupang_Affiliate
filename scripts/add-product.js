/**
 * 상품 등록 CLI
 *
 * 쿠팡 자동화(WAF 차단)를 전혀 쓰지 않고, 사람 또는 브라우저에서 직접 읽은 정보를
 * 입력받아 이미지 합성 + Cloudinary 업로드 + 시트 append까지 자동으로 처리한다.
 * 링크 생성("링크 생성" 버튼 클릭)만은 여전히 쿠팡 파트너스 UI에서 직접 해야 한다.
 *
 * 대화형: node add-product.js  (클립보드 인식값 기반으로 질문/답변)
 * 비대화형(예: 크롬 확장이 페이지에서 읽은 값 전달):
 *   node add-product.js --title "..." --price "..." --desc "..." --image "https://..." [--link "https://link.coupang.com/..."] [--force]
 */

require('dotenv').config();
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { createSheetsClient, getExistingProductTitles, appendRows } = require('./lib/sheets');
const { composeAndUploadImage } = require('./lib/imagePipeline');
const { toSheetRow, nowKstIso } = require('./lib/sheetRow');
const { readClipboardText } = require('./lib/clipboard');
const { parseClipboardPayload } = require('./lib/parseClipboardProduct');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

// 이미지 다운로드 + 배지 합성 + Cloudinary 업로드. imageSrc 없으면 빈 값 반환.
function processImage(imageSrc, meta) {
  return composeAndUploadImage(imageSrc, meta, CLOUDINARY_CONFIG);
}

async function runNonInteractive(sheets, cliArgs) {
  const productTitle = String(cliArgs.title).trim();
  if (!productTitle) throw new Error('상품명(--title)은 필수입니다.');

  const existingTitles = await getExistingProductTitles(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
  if (existingTitles.includes(productTitle) && !cliArgs.force) {
    console.log(`[건너뜀] 이미 시트에 있는 상품명입니다: ${productTitle} (강제로 추가하려면 --force)`);
    return;
  }

  const discountPrice = cliArgs.price || '';
  const originalPrice = cliArgs.original || '';
  const discountRate = cliArgs.rate ? Number(cliArgs.rate) : null;
  const productDesc = cliArgs.desc || productTitle;
  const affiliateLink = cliArgs.link || '';
  if (affiliateLink && !affiliateLink.includes('link.coupang.com')) {
    throw new Error('제휴 링크가 link.coupang.com 형식이 아닙니다.');
  }

  const imageUrl = await processImage(cliArgs.image || '', {
    title: productTitle,
    originalPrice,
    discountPrice,
    discountRate,
  });

  const candidate = {
    product_title: productTitle,
    price: discountPrice,
    product_desc: productDesc,
    affiliate_link: affiliateLink,
    image_url: imageUrl,
  };

  await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, [toSheetRow(candidate, nowKstIso())]);

  console.log('[완료] 시트에 추가됨:');
  console.log(`  상품명: ${candidate.product_title}`);
  console.log(`  할인가: ${candidate.price}`);
  console.log(`  이미지: ${candidate.image_url || '(없음)'}`);
  console.log(`  제휴링크: ${candidate.affiliate_link || '(없음 - 시트에서 직접 채워넣을 것)'}`);
}

async function runInteractive(sheets) {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const guess = parseClipboardPayload(readClipboardText());
    if (guess.title) {
      console.log(
        `[클립보드 인식] 상품명: ${guess.title} / 할인가: ${guess.discountPrice || '-'} / 원가: ${guess.originalPrice || '-'} / 할인율: ${guess.discountRate ?? '-'}${guess.discountRate != null ? '%' : ''}${guess.imageUrl ? ' / 이미지 있음' : ''}`,
      );
      console.log('맞으면 각 질문에 그냥 Enter, 다르면 새 값을 입력하세요.\n');
    }

    const productTitle = (await rl.question(`상품명${guess.title ? ` (Enter=${guess.title})` : ''}: `)).trim() || guess.title;
    if (!productTitle) throw new Error('상품명은 필수입니다.');

    const existingTitles = await getExistingProductTitles(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
    if (existingTitles.includes(productTitle)) {
      const proceed = (await rl.question('[경고] 이미 시트에 있는 상품명입니다. 그래도 추가할까요? (y/N): ')).trim().toLowerCase();
      if (proceed !== 'y') {
        console.log('취소했습니다.');
        return;
      }
    }

    const discountPrice = (await rl.question(`할인가 (예: 39,800원)${guess.discountPrice ? ` (Enter=${guess.discountPrice})` : ''}: `)).trim() || guess.discountPrice;
    const originalPrice = (await rl.question(`원가 (예: 1,890,000원, 없으면 엔터)${guess.originalPrice ? ` (Enter=${guess.originalPrice})` : ''}: `)).trim() || guess.originalPrice;
    const discountRateInput = (await rl.question(`할인율 % (숫자만, 예: 98, 없으면 엔터)${guess.discountRate != null ? ` (Enter=${guess.discountRate})` : ''}: `)).trim() || (guess.discountRate != null ? String(guess.discountRate) : '');
    const discountRate = discountRateInput ? Number(discountRateInput) : null;
    const productDesc = (await rl.question(`상품 설명 (없으면 상품명 그대로): `)).trim() || productTitle;
    const affiliateLink = (await rl.question('제휴 링크 (link.coupang.com/... , 없으면 엔터 - 나중에 시트에서 직접 채워넣기): ')).trim();
    if (affiliateLink && !affiliateLink.includes('link.coupang.com')) {
      throw new Error('제휴 링크가 link.coupang.com 형식이 아닙니다. 쿠팡 파트너스에서 생성한 링크를 붙여넣어주세요.');
    }

    const suffix = guess.imageUrl ? ' (Enter=북마클릿에서 인식된 이미지 사용)' : '';
    const imageSrc = (await rl.question(`상품 이미지 URL (우클릭 > 이미지 주소 복사, 없으면 엔터)${suffix}: `)).trim() || guess.imageUrl || '';
    const imageUrl = await processImage(imageSrc, {
      title: productTitle,
      originalPrice,
      discountPrice,
      discountRate,
    });

    const candidate = {
      product_title: productTitle,
      price: discountPrice,
      product_desc: productDesc,
      affiliate_link: affiliateLink,
      image_url: imageUrl,
    };

    await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, [toSheetRow(candidate, nowKstIso())]);

    console.log('\n[완료] 시트에 추가됨:');
    console.log(`  상품명: ${candidate.product_title}`);
    console.log(`  할인가: ${candidate.price}`);
    console.log(`  이미지: ${candidate.image_url || '(없음)'}`);
    console.log(`  제휴링크: ${candidate.affiliate_link || '(없음 - 시트에서 직접 채워넣을 것)'}`);
  } finally {
    rl.close();
  }
}

async function main() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE || !GOOGLE_SHEET_ID) {
    throw new Error('.env에 GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SHEET_ID를 채워주세요.');
  }

  const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const cliArgs = parseArgs(process.argv.slice(2));

  if (cliArgs.title) {
    await runNonInteractive(sheets, cliArgs);
  } else {
    await runInteractive(sheets);
  }
}

main().catch((e) => {
  console.error('[오류]', e.message);
  process.exitCode = 1;
});
