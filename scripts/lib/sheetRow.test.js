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

test('account_id와 video_url을 지정하면 각각의 컬럼 위치에 들어간다', () => {
  const row = toSheetRow(
    {
      product_title: '테스트 상품',
      account_id: 'account_A',
      video_url: 'https://res.cloudinary.com/dqmdjn0o/video/upload/v1/test.mp4',
    },
    '2026-09-25T00:00:00.000Z',
  );
  assert.strictEqual(row.length, SHEET_COLUMNS.length);
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('account_id')], 'account_A');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('video_url')], 'https://res.cloudinary.com/dqmdjn0o/video/upload/v1/test.mp4');
});

test('account_id/video_url을 안 넘기면 빈 문자열로 채운다 (기존 4개 호출부 호환성)', () => {
  const row = toSheetRow({ product_title: '제목만' }, '2026-09-25T00:00:00.000Z');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('account_id')], '');
  assert.strictEqual(row[SHEET_COLUMNS.indexOf('video_url')], '');
  assert.strictEqual(row.length, 11);
});
