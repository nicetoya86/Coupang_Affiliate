const test = require('node:test');
const assert = require('node:assert');
const { parseFirstRowNumber } = require('./sheets');

test('여러 행이 붙은 updatedRange에서 첫 행 번호를 뽑는다', () => {
  assert.strictEqual(parseFirstRowNumber("'시트1'!A143:K147"), 143);
});

test('한 행만 붙은 updatedRange도 동일하게 동작한다', () => {
  assert.strictEqual(parseFirstRowNumber("'시트1'!A143:K143"), 143);
});

test('updatedRange가 없으면 null을 반환한다', () => {
  assert.strictEqual(parseFirstRowNumber(undefined), null);
  assert.strictEqual(parseFirstRowNumber(''), null);
});

test('형식이 예상과 다르면 null을 반환한다', () => {
  assert.strictEqual(parseFirstRowNumber('이상한값'), null);
});
