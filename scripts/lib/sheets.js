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

async function appendRows(sheets, spreadsheetId, sheetName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

module.exports = { createSheetsClient, getExistingProductTitles, appendRows };
