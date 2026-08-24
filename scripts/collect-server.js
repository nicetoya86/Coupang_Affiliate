/**
 * 목록 페이지 일괄 수집 - 로컬 웹 UI
 *
 * collect-from-clipboard.js(CLI)와 같은 로직을 브라우저 화면으로 감싼 것.
 * 터미널 명령 대신, 붙여넣기 → 미리보기 → 체크박스 선택 → 시트 추가를 웹페이지에서 처리한다.
 *
 * 실행: node collect-server.js  (또는 npm run serve)
 * 이후 브라우저에서 http://localhost:5175 접속.
 */

require('dotenv').config();
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createSheetsClient, getExistingProductTitles, appendRows } = require('./lib/sheets');
const { toSheetRow, nowKstIso } = require('./lib/sheetRow');
const { parseListingPayload } = require('./lib/parseListingClipboard');

const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const PORT = process.env.COLLECT_PORT || 5175;

if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE || !GOOGLE_SHEET_ID) {
  throw new Error('.env에 GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SHEET_ID를 채워주세요.');
}

const sheets = createSheetsClient(GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
const htmlPath = path.join(__dirname, 'collect.html');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    // 바탕화면 등에서 파일 직접 열면 file:// 출처라 CORS 프리플라이트가 붙는다.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/collect.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath, 'utf8'));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/preview') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const parsed = parseListingPayload(body.text || '');
      const existingTitles = await getExistingProductTitles(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME);
      const items = parsed.map((p) => ({ ...p, isDuplicate: existingTitles.includes(p.title) }));
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/commit') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        sendJson(res, 400, { error: '추가할 상품이 없습니다.' });
        return;
      }
      const now = nowKstIso();
      const rows = items.map((p) =>
        toSheetRow(
          {
            product_title: p.title,
            price: p.discountPrice,
            product_desc: p.title,
            affiliate_link: '',
            image_url: p.imageUrl || '',
          },
          now,
        ),
      );
      await appendRows(sheets, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME, rows);
      sendJson(res, 200, { added: rows.length });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`쿠팡 상품 수집 페이지: http://localhost:${PORT}`);
});
