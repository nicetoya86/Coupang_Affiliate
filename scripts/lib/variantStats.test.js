const test = require('node:test');
const assert = require('node:assert');
const { variantStats } = require('./variantStats');

const row = (variant, views, extra = {}) => ({ account_id: 'account_B', media_id: 'm', posted_at: '2026-10-26 9:00:00', variant, views: String(views), likes: '', reposts: '', replies: '', ...extra });

test('variant별 평균·중앙값, 기준선 분리, 미집계 행 제외', () => {
  const rows = [
    row('end:Q|ptr:none|cmt:disc-A-t1', 10),
    row('end:Q|ptr:para|cmt:disc-A-t1', 30),
    row('end:R|ptr:none|cmt:plain-B-t0', 100, { likes: '5' }),
    row('', 12, { posted_at: '2026-10-20 9:00:00' }),
    row('end:I|ptr:none|cmt:plain-A-t0', ''),
    row('없음', 50, { account_id: 'account_A' }),
  ];
  const s = variantStats(rows);
  assert.equal(s.baseline.n, 1);
  assert.equal(s.baseline.mean, 12);
  assert.equal(s.total.n, 3);
  assert.equal(s.byDim.end.Q.mean, 20);
  assert.equal(s.byDim.end.R.max, 100);
  assert.equal(s.byDim.ptr.none.n, 2);
  assert.equal(s.byDim.end.I.n, 0);
});
