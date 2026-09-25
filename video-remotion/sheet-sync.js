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
