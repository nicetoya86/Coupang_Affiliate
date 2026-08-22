const test = require('node:test');
const assert = require('node:assert');
const { selectNewCandidates } = require('./dedup');

test('시트에 이미 있는 product_title은 걸러진다', () => {
  const candidates = [
    { product_title: '카프리썬 오렌지, 200ml, 20개' },
    { product_title: '립톤 아이스티 믹스 복숭아맛' },
  ];
  const existing = ['카프리썬 오렌지, 200ml, 20개'];
  const result = selectNewCandidates(candidates, existing);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].product_title, '립톤 아이스티 믹스 복숭아맛');
});

test('product_title이 없는 후보는 항상 제외된다', () => {
  const candidates = [{ price: '10,000원' }];
  const result = selectNewCandidates(candidates, []);
  assert.strictEqual(result.length, 0);
});

test('existingProductTitles가 비어있으면 전부 통과한다', () => {
  const candidates = [{ product_title: '신규 상품' }];
  const result = selectNewCandidates(candidates, []);
  assert.strictEqual(result.length, 1);
});
