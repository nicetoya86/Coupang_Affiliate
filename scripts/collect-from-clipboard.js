/**
 * 목록 페이지 일괄 수집 CLI
 *
 * 쿠팡 할인 목록 페이지에서 여러 상품 카드를 한번에 드래그 선택 + Ctrl+C 복사한 뒤
 * 실행하면, 클립보드 텍스트를 상품 단위로 쪼개 파싱하고 신규 상품만 시트에 append한다.
 * 기본은 미리보기(dry-run)이고, --commit을 붙여야 실제로 시트에 씀.
 *
 * 사용법:
 *   node collect-from-clipboard.js          (미리보기만)
 *   node collect-from-clipboard.js --commit (실제 추가)
 */

require('dotenv').config();
const { createSheetsClient, getExistingProductTitles, appendRows } = require('./lib/sheets');
const { composeAndUploadImage } = require('./lib/imagePipeline');
const { toSheetRow, nowKstIso } = require('./lib/sheetRow');
const { readClipboardText } = require('./lib/clipboard');
const { parseListingPayload } = require('./lib/parseListingClipboard');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
};

async function main() {
  const commit = process.argv.includes('--commit');
  if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE || !GOOGLE_SHEET_ID) {
    throw new Error('.env에 GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SHEET_ID를 채워주세요.');
  }

  const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const raw = readClipboardText();
  const parsed = parseListingPayload(raw);

  if (!parsed.length) {
    console.log('클립보드에서 상품을 하나도 못 찾았습니다. 목록 영역을 다시 드래그+복사해보세요.');
    return;
  }

  const existingTitles = await getExistingProductTitles(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
  const fresh = parsed.filter((p) => !existingTitles.includes(p.title));
  const dupCount = parsed.length - fresh.length;

  console.log(`[인식됨] 총 ${parsed.length}개 (신규 ${fresh.length} / 중복 ${dupCount})\n`);
  fresh.forEach((p, i) => {
    console.log(`${i + 1}. ${p.title}`);
    console.log(`   판매가: ${p.discountPrice || '-'}  원가: ${p.originalPrice || '-'}  할인율: ${p.discountRate ?? '-'}%  이미지: ${p.imageUrl ? '있음' : '-'}`);
  });

  if (!commit) {
    console.log('\n(미리보기 모드입니다. 이대로 시트에 추가하려면: node collect-from-clipboard.js --commit)');
    return;
  }

  if (!fresh.length) {
    console.log('\n추가할 신규 상품이 없습니다.');
    return;
  }

  const now = nowKstIso();
  const rows = [];
  for (const p of fresh) {
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
        },
        now,
      ),
    );
  }

  await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, rows);
  console.log(`\n[완료] ${rows.length}개 시트에 추가됨. 제휴 링크는 나중에 시트에서 직접 채워넣으세요.`);
}

main().catch((e) => {
  console.error('[오류]', e.message);
  process.exitCode = 1;
});
