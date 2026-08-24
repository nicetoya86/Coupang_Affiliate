const test = require('node:test');
const assert = require('node:assert');
const { toSheetRow, SHEET_COLUMNS } = require('./sheetRow');

test('컬럼 순서대로 배열을 만든다', () => {
  const row = toSheetRow(
    {
      product_title: '3in1 무선 핸디 청소기',
      price: '29,900원',
      product_desc: '강력한 흡입력',
      affiliate_link: 'https://link.coupang.com/a/example',
    },
    '2026-08-05T00:00:00.000Z',
  );

  assert.strictEqual(row.length, SHEET_COLUMNS.length);
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('collected_at')], '2026-08-05T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('product_title')], '3in1 무선 핸디 청소기');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('affiliate_link')], 'https://link.coupang.com/a/example');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('posted')], '');
});

test('빠진 필드는 빈 문자열로 채운다', () => {
  const row = toSheetRow({ product_title: '제목만' }, '2026-08-05T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('price')], '');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('product_desc')], '');
});
