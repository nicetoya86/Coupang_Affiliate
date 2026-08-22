const test = require('node:test');
const assert = require('node:assert');
const { parseListingClipboard, parseListingPayload } = require('./parseListingClipboard');

// 2026-08-18 실제 사용자가 쿠팡 목록 페이지에서 드래그+복사한 텍스트 그대로 (검증된 실제 포맷).
const REAL_SAMPLE = `
무료배송
FOOI 양면점화 원터치 전기라이터 USB충전식 캠핑낚시 전자라이터
할인
75%
31,800원
7,740원
모레(목) 도착 예정
(379)
무료배송 ∙ 오늘출발
[손끝에서 터지는 바삭 ASMR] 구쯔야 비누 크런치 말랑이 슬랑이, 화이트 비누, 110g, 1개
할인
84%
48,580원
7,670원

(1개7,670원)
내일(수) 도착 보장
(161)
무료배송
달팽이 수태 파충류 사슴벌레 장수풍뎅이 바닥재, 뉴질랜드 4A수태, 1개
할인
71%
16,520원
4,650원
(1개4,650원)
모레(목) 도착 예정
(21)
무료배송 ∙ 오늘출발
14K 금도금 싱글 지르콘 귀걸이 심플 기하학 디자인 고급 광택 오래 착용 편안함 럭셔리 분위기 데일리 출근 데이트 선물 추천 고급 쇼핑백 패키징 한국 발송
할인
88%
78,800원
9,450원

내일(수) 도착 보장
(14)
`;

test('실제 복사 포맷: 상품 4개로 정확히 쪼개고 제목/가격이 올바르다', () => {
  const products = parseListingClipboard(REAL_SAMPLE);
  assert.strictEqual(products.length, 4);

  assert.strictEqual(products[0].title, 'FOOI 양면점화 원터치 전기라이터 USB충전식 캠핑낚시 전자라이터');
  assert.strictEqual(products[0].originalPrice, '31,800원');
  assert.strictEqual(products[0].discountPrice, '7,740원');
  assert.strictEqual(products[0].discountRate, 75);

  assert.strictEqual(
    products[1].title,
    '[손끝에서 터지는 바삭 ASMR] 구쯔야 비누 크런치 말랑이 슬랑이, 화이트 비누, 110g, 1개',
  );
  assert.strictEqual(products[1].originalPrice, '48,580원');
  assert.strictEqual(products[1].discountPrice, '7,670원');
  assert.strictEqual(products[1].discountRate, 84);

  assert.strictEqual(products[2].title, '달팽이 수태 파충류 사슴벌레 장수풍뎅이 바닥재, 뉴질랜드 4A수태, 1개');
  assert.strictEqual(products[2].discountPrice, '4,650원');

  assert.strictEqual(
    products[3].title,
    '14K 금도금 싱글 지르콘 귀걸이 심플 기하학 디자인 고급 광택 오래 착용 편안함 럭셔리 분위기 데일리 출근 데이트 선물 추천 고급 쇼핑백 패키징 한국 발송',
  );
  assert.strictEqual(products[3].discountPrice, '9,450원');
});

test('가격/할인율 정보가 없는 줄은 무시하고 빈 배열이 될 수 있다', () => {
  assert.deepStrictEqual(parseListingClipboard(''), []);
  assert.deepStrictEqual(parseListingClipboard('그냥 아무 텍스트'), []);
});

test('북마클릿 {raw,urls} JSON이면 상품과 URL을 순서대로 매칭한다', () => {
  const payload = JSON.stringify({
    raw: REAL_SAMPLE,
    urls: [
      'https://www.coupang.com/vp/products/1111',
      'https://www.coupang.com/vp/products/2222',
      'https://www.coupang.com/vp/products/3333',
      'https://www.coupang.com/vp/products/4444',
    ],
  });
  const items = parseListingPayload(payload);
  assert.strictEqual(items.length, 4);
  assert.strictEqual(items[0].productUrl, 'https://www.coupang.com/vp/products/1111');
  assert.strictEqual(items[3].productUrl, 'https://www.coupang.com/vp/products/4444');
});

test('일반 텍스트(북마클릿 안 씀)면 productUrl은 빈 값이다', () => {
  const items = parseListingPayload(REAL_SAMPLE);
  assert.strictEqual(items.length, 4);
  assert.strictEqual(items[0].productUrl, '');
});
