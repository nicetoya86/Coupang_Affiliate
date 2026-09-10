// 쿠팡 파트너스 대시보드에서 수동으로 다운받은 "성과 리포트" CSV를 시트의 clicks 컬럼에 병합.
// 쿠팡은 도메인 레벨에서 자동화 브라우징을 차단하므로(2026-08-18/19 조사 결과) 리포트 자동 다운로드는 시도하지 않음 —
// 사용자가 파트너스 대시보드에서 CSV를 수동으로 내려받아 이 스크립트에 넘기는 방식.
require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error('usage: node merge-click-report.js <csv-path> [--commit]');
  process.exit(1);
}
const COMMIT = process.argv.includes('--commit');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || '시트1';
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

if (!SPREADSHEET_ID || !KEY_FILE) {
  console.error('Missing environment variables:');
  if (!SPREADSHEET_ID) console.error('  - GOOGLE_SHEET_ID');
  if (!KEY_FILE) console.error('  - GOOGLE_SERVICE_ACCOUNT_KEY_FILE');
  process.exit(1);
}

const LINK_CODE_RE = /\/a\/([A-Za-z0-9]+)/;
const LINK_HEADER_RE = /(링크|url|link)/i;
const CLICK_HEADER_RE = /(클릭|click)/i;

function colLetter(index) {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

// 따옴표로 감싼 콤마(예: "1,234")를 다루는 최소 CSV 라인 파서. 라이브러리 추가 없이 처리 가능한 범위만 지원.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function extractLinkCode(value) {
  const m = String(value || '').match(LINK_CODE_RE);
  return m ? m[1] : null;
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV에 헤더 + 데이터 행이 없습니다: ' + CSV_PATH);

  const header = parseCsvLine(lines[0]);
  const linkColIdx = header.findIndex((h) => LINK_HEADER_RE.test(h));
  const clickColIdx = header.findIndex((h) => CLICK_HEADER_RE.test(h));
  if (linkColIdx === -1 || clickColIdx === -1) {
    console.error('CSV 헤더:', header);
    throw new Error(
      `링크/클릭 컬럼을 못 찾음 (링크 매치: ${linkColIdx !== -1}, 클릭 매치: ${clickColIdx !== -1}). ` +
      '실제 쿠팡 파트너스 리포트 헤더명에 맞게 LINK_HEADER_RE/CLICK_HEADER_RE 정규식을 조정해야 함 — 첫 실행 시 반드시 확인 필요.'
    );
  }

  const clicksByCode = {};
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const code = extractLinkCode(cells[linkColIdx]);
    if (!code) continue;
    const clicks = parseInt(String(cells[clickColIdx]).replace(/[^0-9-]/g, ''), 10);
    if (Number.isNaN(clicks)) continue;
    clicksByCode[code] = (clicksByCode[code] || 0) + clicks;
  }
  console.log(`CSV에서 ${Object.keys(clicksByCode).length}개 링크의 클릭 데이터 추출`);

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
  const sheetHeader = rows[0];
  const idx = {};
  sheetHeader.forEach((h, i) => { idx[h] = i; });

  let clicksColIndex = idx.clicks;
  if (clicksColIndex === undefined) {
    clicksColIndex = sheetHeader.length;
    console.log(`'clicks' 헤더 없음, ${colLetter(clicksColIndex)} 열에 추가`);
    if (COMMIT) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${colLetter(clicksColIndex)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['clicks']] },
      });
    }
  }

  const updates = [];
  rows.slice(1).forEach((row, i) => {
    const code = extractLinkCode(row[idx.affiliate_link]);
    if (code && clicksByCode[code] !== undefined) {
      updates.push({ rowNumber: i + 2, title: row[idx.product_title], code, clicks: clicksByCode[code] });
    }
  });

  console.log(`시트 매칭된 행: ${updates.length}`);
  updates.forEach((u) => console.log(`row ${u.rowNumber} (${u.title}) ${u.code} -> clicks=${u.clicks}`));

  if (COMMIT) {
    const col = colLetter(clicksColIndex);
    for (const u of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${col}${u.rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[u.clicks]] },
      });
    }
    console.log(`\ncommitted ${updates.length} clicks updates`);
  } else {
    console.log('\ndry run — pass --commit to actually write to the sheet');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
