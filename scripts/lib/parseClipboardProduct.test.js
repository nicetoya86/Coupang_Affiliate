const test = require('node:test');
const assert = require('node:assert');
const { parseProductText, parseClipboardPayload } = require('./parseClipboardProduct');

test('평문 카드 텍스트에서 제목/가격/할인율을 추출한다', () => {
  const raw = '3in1 무선 핸디 청소기\n98%\n39,800원\n1,890,000원';
  const result = parseProductText(raw);
  assert.strictEqual(result.title, '3in1 무선 핸디 청소기');
  assert.strictEqual(result.discountPrice, '39,800원');
  assert.strictEqual(result.originalPrice, '1,890,000원');
  assert.strictEqual(result.discountRate, 98);
});

test('가격 줄이 하나뿐이면 원가는 빈 문자열이다', () => {
  const result = parseProductText('상품명\n39,800원');
  assert.strictEqual(result.discountPrice, '39,800원');
  assert.strictEqual(result.originalPrice, '');
});

test('북마클릿 JSON 페이로드는 raw+imageUrl로 구조화 파싱한다', () => {
  const payload = JSON.stringify({ raw: '상품명\n90%\n1,000원', imageUrl: 'https://img.example/a.jpg' });
  const result = parseClipboardPayload(payload);
  assert.strictEqual(result.title, '상품명');
  assert.strictEqual(result.discountRate, 90);
  assert.strictEqual(result.imageUrl, 'https://img.example/a.jpg');
});

test('JSON이 아니면(그냥 텍스트 복사) raw 텍스트로 취급하고 imageUrl은 빈 값이다', () => {
  const result = parseClipboardPayload('상품명\n50%\n5,000원');
  assert.strictEqual(result.title, '상품명');
  assert.strictEqual(result.imageUrl, '');
});

test('클립보드가 비어있으면 전부 빈 값을 반환한다', () => {
  const result = parseClipboardPayload('');
  assert.strictEqual(result.title, '');
  assert.strictEqual(result.discountRate, null);
});
