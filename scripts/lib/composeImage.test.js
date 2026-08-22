const test = require('node:test');
const assert = require('node:assert');
const { formatWon, escapeXml } = require('./composeImage');

test('formatWon: 숫자만 남겨 천단위 콤마 + 원 붙인다', () => {
  assert.strictEqual(formatWon('39,800원'), '39,800원');
  assert.strictEqual(formatWon(1890000), '1,890,000원');
});

test('formatWon: 값 없으면 빈 문자열', () => {
  assert.strictEqual(formatWon(''), '');
  assert.strictEqual(formatWon(null), '');
  assert.strictEqual(formatWon(undefined), '');
});

test('escapeXml: SVG 삽입용 특수문자 이스케이프', () => {
  assert.strictEqual(escapeXml('A&B <C> "D"'), 'A&amp;B &lt;C&gt; &quot;D&quot;');
});
