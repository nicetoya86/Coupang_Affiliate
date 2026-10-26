// 시트1의 B 제휴글을 variant(끝맺음/안내문구/댓글형태)별로 조회·반응 집계해 출력. 읽기 전용.
// 사용: node variant-report.js [since=2026-10-01]
require('dotenv').config();
const { createSheetsClient } = require('./lib/sheets');
const { variantStats } = require('./lib/variantStats');

const f = (x) => (x == null ? '-' : Number(x).toFixed(1));
const line = (label, s) => `${label.padEnd(16)} n=${String(s.n).padEnd(4)} 평균 ${f(s.mean).padEnd(6)} 중앙값 ${f(s.median).padEnd(6)} 최대 ${String(s.max ?? '-').padEnd(5)} 반응/100뷰 ${f(s.reactPer100)}`;

(async () => {
  const sheets = createSheetsClient(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.GOOGLE_SHEET_NAME || '시트1'}!A1:Z`,
  });
  const [header, ...values] = res.data.values;
  const rows = values.map((v) => Object.fromEntries(header.map((h, i) => [h.trim(), v[i] ?? ''])));
  const s = variantStats(rows, { since: process.argv[2] });
  console.log(line('기준선(변주 전)', s.baseline));
  console.log(line('변주 적용 전체', s.total));
  for (const [dim, vals] of Object.entries(s.byDim)) {
    console.log(`\n[${dim}]`);
    for (const [v, st] of Object.entries(vals)) console.log(line(v, st));
  }
  console.log('\n※ views 열이 채워진 글만 집계됨. 그룹당 n<15면 차이는 우연일 수 있음');
})().catch((e) => { console.error(e.message); process.exit(1); });
