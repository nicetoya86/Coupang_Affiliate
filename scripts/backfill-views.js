const { google } = require('googleapis');

const ACCESS_TOKEN = process.argv[2];
if (!ACCESS_TOKEN) {
  console.error('usage: node backfill-views.js <access_token> [--commit]');
  process.exit(1);
}
const COMMIT = process.argv.includes('--commit');

const SPREADSHEET_ID = '1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA';
const SHEET_NAME = '시트1';
const KEY_FILE = 'D:\\vibecording\\Coupang_Affiliate\\scripts\\service-account.json';

function colLetter(index) {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

async function fetchViews(mediaId) {
  const url = `https://graph.threads.net/v1.0/${mediaId}/insights?metric=views&access_token=${ACCESS_TOKEN}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error('Threads API error: ' + JSON.stringify(j.error));
  const viewsMetric = (j.data || []).find(d => d.name === 'views');
  return viewsMetric && viewsMetric.values && viewsMetric.values[0] ? viewsMetric.values[0].value : null;
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

  let viewsColIndex = idx.views;
  if (viewsColIndex === undefined) {
    viewsColIndex = header.length;
    console.log(`'views' header missing, adding at column ${colLetter(viewsColIndex)}`);
    if (COMMIT) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${colLetter(viewsColIndex)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['views']] },
      });
    }
  }

  const dataRows = rows.slice(1).map((row, i) => ({ rowNumber: i + 2, row }));
  const candidates = dataRows.filter(({ row }) => row[idx.media_id] && row[idx.media_id].trim() !== '');

  console.log(`rows with media_id: ${candidates.length}`);

  const results = [];
  for (const c of candidates) {
    const mediaId = c.row[idx.media_id];
    const views = await fetchViews(mediaId);
    results.push({ rowNumber: c.rowNumber, mediaId, views, title: c.row[idx.product_title] });
    console.log(`row ${c.rowNumber} (${c.row[idx.product_title]}) media_id=${mediaId} -> views=${views}`);
  }

  if (COMMIT) {
    const col = colLetter(viewsColIndex);
    for (const r of results) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${col}${r.rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[r.views]] },
      });
    }
    console.log(`\ncommitted ${results.length} views updates`);
  } else {
    console.log('\ndry run — pass --commit to actually write to the sheet');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
