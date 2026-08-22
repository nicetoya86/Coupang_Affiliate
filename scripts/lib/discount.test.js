const test = require('node:test');
const assert = require('node:assert');
const { parseDiscountRate } = require('./discount');

test('할인율 % 텍스트에서 숫자를 추출한다', () => {
  assert.strictEqual(parseDiscountRate('90% 할인'), 90);
  assert.strictEqual(parseDiscountRate('-72%'), 72);
  assert.strictEqual(parseDiscountRate('상품명\n90%\n1,000원'), 90);
});

test('퍼센트 표기가 없으면 null을 반환한다', () => {
  assert.strictEqual(parseDiscountRate('1,000원'), null);
  assert.strictEqual(parseDiscountRate(''), null);
  assert.strictEqual(parseDiscountRate(null), null);
});

test('100%를 넘는 비정상 값은 null을 반환한다', () => {
  assert.strictEqual(parseDiscountRate('150%'), null);
});
