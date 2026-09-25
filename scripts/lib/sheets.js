const { google } = require('googleapis');
const { SHEET_COLUMNS } = require('./sheetRow');

const PRODUCT_TITLE_COL_INDEX = SHEET_COLUMNS.indexOf('product_title');

function createSheetsClient(keyFile) {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getExistingProductTitles(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:H`,
  });
  const rows = res.data.values || [];
  return rows.map((row) => row[PRODUCT_TITLE_COL_INDEX]).filter(Boolean);
}

// "'시트1'!A143:K147" 같은 Sheets API 응답의 updatedRange에서 맨 앞 행 번호(143)만 뽑아낸다.
// 배치로 여러 행을 append해도 항상 순서대로 붙으므로, 이 값 + 배치 내 인덱스로 각 행의 실제 행 번호를 알 수 있다.
function parseFirstRowNumber(updatedRange) {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

// 반환값: 방금 append된 첫 번째 행의 실제 시트 행 번호(1-based). 이후 행은 +1씩 하면 됨.
// 알 수 없으면(응답 형식이 예상과 다르면) null.
async function appendRows(sheets, spreadsheetId, sheetName, rows) {
  if (rows.length === 0) return null;
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
  return parseFirstRowNumber(res.data.updates && res.data.updates.updatedRange);
}

module.exports = { createSheetsClient, getExistingProductTitles, appendRows, parseFirstRowNumber };
