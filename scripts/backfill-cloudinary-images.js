/**
 * 일회성 백필: 시트에 남아있는 imgbb(i.ibb.co) image_url을 Cloudinary로 재업로드.
 * 이미 게시완료(posted=TRUE)된 행은 과거 게시물이라 건드리지 않음.
 * posted=FAILED인 행은 이미지 호스트 문제로 실패했던 것이므로 재업로드 후 posted를 비워 재시도 대상으로 되돌림.
 *
 * 기본은 dry-run. 실제 반영하려면: node backfill-cloudinary-images.js --commit
 */
require('dotenv').config();
const { createSheetsClient } = require('./lib/sheets');
const { uploadToCloudinary } = require('./lib/cloudinary');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

async function main() {
  const commit = process.argv.includes('--commit');
  const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${GOOGLE_SHEET_NAME}!A2:I`,
  });
  const rows = res.data.values || [];

  const targets = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const imageUrl = row[5] || '';
    const posted = row[6] || '';
    if (posted === 'TRUE') return;
    if (!imageUrl.includes('i.ibb.co')) return;
    targets.push({ rowNumber, imageUrl, posted, title: row[1] });
  });

  console.log(`재업로드 대상: ${targets.length}건\n`);
  targets.forEach((t) => console.log(`  행 ${t.rowNumber} [posted=${t.posted || '(빈값)'}] ${t.title}`));

  if (!commit) {
    console.log('\n(dry-run입니다. 실제 반영하려면: node backfill-cloudinary-images.js --commit)');
    return;
  }

  const data = [];
  for (const t of targets) {
    try {
      const res2 = await fetch(t.imageUrl);
      if (!res2.ok) throw new Error(`다운로드 실패 (status ${res2.status})`);
      const buffer = Buffer.from(await res2.arrayBuffer());
      const newUrl = await uploadToCloudinary(buffer, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET);
      data.push({ range: `${GOOGLE_SHEET_NAME}!F${t.rowNumber}`, values: [[newUrl]] });
      if (t.posted === 'FAILED') {
        data.push({ range: `${GOOGLE_SHEET_NAME}!G${t.rowNumber}`, values: [['']] });
      }
      console.log(`행 ${t.rowNumber} 완료: ${newUrl}`);
    } catch (e) {
      console.error(`행 ${t.rowNumber} 실패: ${e.message}`);
    }
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    console.log(`\n시트 반영 완료 (${data.length}개 셀).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
