const test = require('node:test');
const assert = require('node:assert');
const { pairCheckedItems } = require('./pairCheckedItems');

const ITEMS = [
  { title: 'A상품' },
  { title: 'B상품(중복)' },
  { title: 'C상품' },
  { title: 'D상품' },
];

test('중복 상품이 껴 있어도 뒤 항목이 밀리지 않는다 (B는 disabled라 체크 목록에 아예 없음)', () => {
  // checkedIdxList는 실제 체크된(:checked) 체크박스들의 data-idx만 순서대로 들어옴 —
  // B(idx=1)는 중복이라 disabled+체크 해제 상태이므로 여기 안 들어있다.
  const checkedIdxList = [0, 2, 3];
  const result = pairCheckedItems(ITEMS, checkedIdxList, new Set());
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].title, 'A상품');
  assert.strictEqual(result[1].title, 'C상품');
  assert.strictEqual(result[2].title, 'D상품');
});

test('중복 아닌 상품도 사용자가 직접 체크 해제하면 건너뛰고, 그 뒤 항목은 안 밀린다', () => {
  // 사용자가 C(idx=2)를 직접 체크 해제한 경우 - checkedIdxList에서 2만 빠짐.
  const checkedIdxList = [0, 1, 3];
  const result = pairCheckedItems(ITEMS, checkedIdxList, new Set());
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].title, 'A상품');
  assert.strictEqual(result[1].title, 'B상품(중복)');
  assert.strictEqual(result[2].title, 'D상품');
});

test('중간 여러 개를 건너뛰어도 각 항목은 자기 원래 idx로 정확히 찾아간다', () => {
  const checkedIdxList = [3, 0]; // 순서도 뒤죽박죽으로 와도 idx 기준이라 안전함
  const result = pairCheckedItems(ITEMS, checkedIdxList, new Set());
  assert.strictEqual(result[0].title, 'D상품');
  assert.strictEqual(result[1].title, 'A상품');
});

test('계정A 체크 여부도 idx로 정확히 매칭되고, 건너뛴 항목의 계정A 체크 상태는 무시된다', () => {
  // B(idx=1)는 계정A를 체크했더라도 disabled라 애초에 checkedIdxList에 없으므로 결과에 안 나타남.
  const checkedIdxList = [0, 2, 3];
  const accountACheckedIdxSet = new Set([0, 1, 3]); // 0,1,3번 계정A 체크됨 (1번은 어차피 제외 대상)
  const result = pairCheckedItems(ITEMS, checkedIdxList, accountACheckedIdxSet);
  assert.strictEqual(result[0].title, 'A상품');
  assert.strictEqual(result[0].accountA, true);
  assert.strictEqual(result[1].title, 'C상품');
  assert.strictEqual(result[1].accountA, false);
  assert.strictEqual(result[2].title, 'D상품');
  assert.strictEqual(result[2].accountA, true);
});
