// B 제휴글 variant("end:Q|ptr:para|cmt:disc-A-t1")별 조회·반응 집계. 시트 헤더 기준 객체 행을 받는다.
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(rows) {
  const views = rows.map((r) => num(r.views)).filter((v) => v !== null);
  if (!views.length) return { n: 0 };
  const react = rows.reduce((t, r) => t + (num(r.likes) || 0) + (num(r.reposts) || 0) + (num(r.replies) || 0), 0);
  const total = views.reduce((t, v) => t + v, 0);
  return { n: views.length, mean: total / views.length, median: median(views), max: Math.max(...views), reactPer100: total ? (react / total) * 100 : 0 };
}

// 반환: { baseline, byDim: { end: { Q: stat, ... }, ptr: {...}, cmt: {...} }, total }
function variantStats(rows, { since = '2026-10-01' } = {}) {
  const b = rows.filter((r) => r.account_id === 'account_B' && r.media_id && r.posted_at >= since);
  const tagged = b.filter((r) => /^end:/.test(r.variant || ''));
  const byDim = {};
  const groups = {};
  for (const r of tagged) {
    for (const part of r.variant.split('|')) {
      const [dim, val] = part.split(':');
      ((groups[dim] ||= {})[val] ||= []).push(r);
    }
  }
  for (const dim of Object.keys(groups)) {
    byDim[dim] = Object.fromEntries(Object.entries(groups[dim]).map(([v, rs]) => [v, summarize(rs)]));
  }
  return { baseline: summarize(b.filter((r) => !/^end:/.test(r.variant || ''))), total: summarize(tagged), byDim };
}

module.exports = { variantStats, summarize };
