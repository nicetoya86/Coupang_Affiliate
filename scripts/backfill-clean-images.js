// 기존에 배지(가격/할인율) 합성된 image_url을 배지 없는 깔끔한 상품사진으로 재생성.
// composeProductImage가 만드는 이미지는 항상 상단 800x800이 순수 리사이즈된 사진이고
// 배지 SVG는 그 아래 200px 배너 영역에만 그려지므로, 원본 쿠팡 URL 없이도
// 기존 Cloudinary 이미지 상단을 크롭하는 것만으로 배지 없는 사진을 복원할 수 있다.
require('dotenv').config();
const sharp = require('sharp');
const { google } = require('googleapis');
const { uploadToCloudinary } = require('./lib/cloudinary');

const COMMIT = process.argv.includes('--commit');
const CANVAS_SIZE = 800;

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME;
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

function colLetter(index) {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:Z`,
  });
  const rows = res.data.values || [];
  const header = rows[0];
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });

  const targets = rows.slice(1)
    .map((row, i) => ({ rowNumber: i + 2, row }))
    .filter(({ row }) => (!row[idx.posted] || row[idx.posted].trim() === '') && row[idx.image_url] && row[idx.image_url].trim() !== '');

  console.log(`대상(미게시 + image_url 있음): ${targets.length}개`);

  const results = [];
  for (const t of targets) {
    const title = t.row[idx.product_title];
    const oldUrl = t.row[idx.image_url];
    try {
      const r = await fetch(oldUrl);
      if (!r.ok) throw new Error(`다운로드 실패 status ${r.status}`);
      const buffer = Buffer.from(await r.arrayBuffer());
      const cropped = await sharp(buffer)
        .extract({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE })
        .png()
        .toBuffer();
      const newUrl = await uploadToCloudinary(cropped, CLOUD_NAME, UPLOAD_PRESET);
      results.push({ rowNumber: t.rowNumber, title, oldUrl, newUrl });
      console.log(`row ${t.rowNumber} (${title}) OK -> ${newUrl}`);
    } catch (e) {
      console.error(`row ${t.rowNumber} (${title}) 실패: ${e.message}`);
    }
  }

  if (COMMIT) {
    const col = colLetter(idx.image_url);
    for (const r of results) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${col}${r.rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[r.newUrl]] },
      });
    }
    console.log(`\ncommitted ${results.length}/${targets.length} image_url updates`);
  } else {
    console.log(`\ndry run (${results.length}/${targets.length} 성공) — pass --commit to actually write to the sheet`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
