const { google } = require('googleapis');

const ACCESS_TOKEN = process.argv[2];
if (!ACCESS_TOKEN) {
  console.error('usage: node backfill-media-id.js <access_token> [--commit]');
  process.exit(1);
}
const COMMIT = process.argv.includes('--commit');

const SPREADSHEET_ID = '1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA';
const SHEET_NAME = '시트1';
const KEY_FILE = 'D:\\vibecording\\Coupang_Affiliate\\scripts\\service-account.json';

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
  console.log('header:', header);

  const dataRows = rows.slice(1).map((row, i) => ({ rowNumber: i + 2, row }));
  const candidates = dataRows.filter(({ row }) => {
    const posted = row[idx.posted];
    const link = row[idx.affiliate_link];
    const mediaId = row[idx.media_id];
    return posted === 'TRUE' && link && !mediaId;
  });

  console.log(`\ncandidates needing media_id: ${candidates.length}`);
  candidates.forEach(c => console.log(' -', c.rowNumber, c.row[idx.affiliate_link]));

  let allReplies = [];
  let url = `https://graph.threads.net/v1.0/me/replies?fields=id,text,root_post,replied_to,timestamp&limit=100&access_token=${ACCESS_TOKEN}`;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error('Threads API error: ' + JSON.stringify(j.error));
    allReplies = allReplies.concat(j.data || []);
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  console.log(`\ntotal replies fetched: ${allReplies.length}`);

  const updates = [];
  for (const c of candidates) {
    const link = c.row[idx.affiliate_link];
    const match = allReplies.find(rep => rep.text && rep.text.includes(link));
    if (match) {
      const mediaId = typeof match.root_post === 'object' ? match.root_post.id : match.root_post;
      updates.push({ rowNumber: c.rowNumber, mediaId, replyId: match.id, title: c.row[idx.product_title] });
    } else {
      console.log('NO MATCH for row', c.rowNumber, link);
    }
  }

  console.log('\nmatches:');
  console.log(JSON.stringify(updates, null, 2));

  if (COMMIT) {
    const col = colLetter(idx.media_id);
    for (const u of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${col}${u.rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[u.mediaId]] },
      });
      console.log('wrote row', u.rowNumber, '->', u.mediaId);
    }
    console.log(`\ncommitted ${updates.length} updates`);
  } else {
    console.log('\ndry run — pass --commit to actually write to the sheet');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
