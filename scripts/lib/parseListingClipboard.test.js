const test = require('node:test');
const assert = require('node:assert');
const { parseListingClipboard, parseListingPayload } = require('./parseListingClipboard');

// 2026-08-30 실제 사용자가 campaigns/82 목록 페이지에서 드래그+복사한 텍스트 그대로 (검증된 실제 포맷).
// 상품명이 접근성 텍스트로 한 번 더 중복되고("에이블팩토리..." x2), 카드가 "최대 N원 적립"(x2)으로 끝난다.
const REAL_SAMPLE = `
에이블팩토리 아동용 EVA 학교 실내화
에이블팩토리 아동용 EVA 학교 실내화
23%5,900원
4,500원

내일(월) 도착 보장
무료배송 ∙ 무료반품
새 상품, 반품 (6)
최저4,050원
5
(28964)
최대 45원 적립
최대 45원 적립
신라면 120g, 40개
신라면 120g, 40개
29,570원

(100g당 616원)
내일(월) 도착 보장
무료배송 ∙ 무료반품
5
(918046)
최대 296원 적립
최대 296원 적립
해피홈 블랙에디션 파워매트S 살충제 리필 156p, 228g, 1개
해피홈 블랙에디션 파워매트S 살충제 리필 156p, 228g, 1개
와우할인9%18,500원
16,730원

(100g당 7,338원)
내일(월) 도착 보장
무료배송 ∙ 무료반품
4.5
(14336)
최대 167원 적립
최대 167원 적립
신지모루 신지글래스 2.5D 강화유리 휴대폰 액정보호필름 4p, 1세트
신지모루 신지글래스 2.5D 강화유리 휴대폰 액정보호필름 4p, 1세트
8,080원

(1세트당 8,080원)
내일(월) 도착 보장
무료배송 ∙ 무료반품
5
(191727)
최대 81원 적립
최대 81원 적립
`;

test('실제 복사 포맷: 상품 4개로 정확히 쪼개고 제목/가격이 올바르다', () => {
  const products = parseListingClipboard(REAL_SAMPLE);
  assert.strictEqual(products.length, 4);

  assert.strictEqual(products[0].title, '에이블팩토리 아동용 EVA 학교 실내화');
  assert.strictEqual(products[0].originalPrice, '5,900원');
  assert.strictEqual(products[0].discountPrice, '4,500원');
  assert.strictEqual(products[0].discountRate, 23);

  assert.strictEqual(products[1].title, '신라면 120g, 40개');
  assert.strictEqual(products[1].originalPrice, '');
  assert.strictEqual(products[1].discountPrice, '29,570원');
  assert.strictEqual(products[1].discountRate, null);

  assert.strictEqual(products[2].title, '해피홈 블랙에디션 파워매트S 살충제 리필 156p, 228g, 1개');
  assert.strictEqual(products[2].originalPrice, '18,500원');
  assert.strictEqual(products[2].discountPrice, '16,730원');
  assert.strictEqual(products[2].discountRate, 9);

  assert.strictEqual(products[3].title, '신지모루 신지글래스 2.5D 강화유리 휴대폰 액정보호필름 4p, 1세트');
  assert.strictEqual(products[3].originalPrice, '');
  assert.strictEqual(products[3].discountPrice, '8,080원');
  assert.strictEqual(products[3].discountRate, null);
});

// 2026-08-30 실제 복사 결과 - "와우회원 추가 쿠폰" 조건부 특가가 붙어 가격 줄이 3개까지 나오는 케이스.
const COUPON_SAMPLE = `
제주삼다수 그린 무라벨, 2L, 12개
제주삼다수 그린 무라벨, 2L, 12개
와우쿠폰할인2%12,960원
12,670원

(100ml당 53원)
290원
와우회원 추가 쿠폰
내일(월) 도착 보장
무료배송 ∙ 무료반품
5
(1239889)
최대 127원 적립
최대 127원 적립
큐원 하얀 설탕, 15kg, 1개
큐원 하얀 설탕, 15kg, 1개
20,150원

(10g당 13원)
150원
와우회원 추가 쿠폰
내일(월) 도착 보장
무료배송 ∙ 무료반품
5
(31260)
최대 202원 적립
최대 202원 적립
`;

test('쿠폰 조건부 특가 줄("와우회원 추가 쿠폰" 바로 앞 가격)은 기본 판매가에서 제외한다', () => {
  const products = parseListingClipboard(COUPON_SAMPLE);
  assert.strictEqual(products.length, 2);

  assert.strictEqual(products[0].title, '제주삼다수 그린 무라벨, 2L, 12개');
  assert.strictEqual(products[0].originalPrice, '12,960원');
  assert.strictEqual(products[0].discountPrice, '12,670원');
  assert.strictEqual(products[0].discountRate, 2);

  assert.strictEqual(products[1].title, '큐원 하얀 설탕, 15kg, 1개');
  assert.strictEqual(products[1].originalPrice, '');
  assert.strictEqual(products[1].discountPrice, '20,150원');
  assert.strictEqual(products[1].discountRate, null);
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

test('일반 텍스트(북마클릿 안 씀)면 productUrl/imageUrl은 빈 값이다', () => {
  const items = parseListingPayload(REAL_SAMPLE);
  assert.strictEqual(items.length, 4);
  assert.strictEqual(items[0].productUrl, '');
  assert.strictEqual(items[0].imageUrl, '');
});

test('북마클릿 {raw,urls,images} JSON이면 이미지도 순서대로 매칭한다', () => {
  const payload = JSON.stringify({
    raw: REAL_SAMPLE,
    urls: [],
    images: [
      'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/1111.jpg',
      'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/2222.jpg',
      'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/3333.jpg',
      'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/4444.jpg',
    ],
  });
  const items = parseListingPayload(payload);
  assert.strictEqual(items.length, 4);
  assert.strictEqual(items[0].imageUrl, 'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/1111.jpg');
  assert.strictEqual(items[3].imageUrl, 'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/4444.jpg');
});

test('images 배열이 카드 수보다 적으면 뒤쪽은 빈 값으로 채워진다', () => {
  const payload = JSON.stringify({
    raw: REAL_SAMPLE,
    urls: [],
    images: ['https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/1111.jpg'],
  });
  const items = parseListingPayload(payload);
  assert.strictEqual(items[0].imageUrl, 'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/1111.jpg');
  assert.strictEqual(items[1].imageUrl, '');
});

// 2026-08-30 실제 북마클릿 결과 - 카드당 상품사진 1개 + 로켓/내일도착/캐시백 공용 아이콘 3개(총 16개)가
// images에 섞여 들어와, 필터링 없이 그대로 index 매칭하면 사진이 아이콘으로 밀렸던 실제 버그 재현.
const REAL_BOOKMARKLET_PAYLOAD = JSON.stringify({
  raw:
    '제주삼다수 그린 무라벨, 2L, 12개\n와우쿠폰할인2%12,960원\n12,670원\n\n(100ml당 53원)\n290원\n와우회원 추가 쿠폰\n내일(월) 도착 보장\n무료배송 ∙ 무료반품\n5\n(1239889)\n\n최대 127원 적립\n\n에이블팩토리 아동용 EVA 학교 실내화\n23%5,900원\n4,500원\n\n내일(월) 도착 보장\n무료배송 ∙ 무료반품\n새 상품, 반품 (6)\n최저4,050원\n5\n(28966)\n\n최대 45원 적립\n\n신라면 120g, 40개\n29,570원\n\n(100g당 616원)\n내일(월) 도착 보장\n무료배송 ∙ 무료반품\n5\n(918089)\n\n최대 296원 적립\n\n큐원 하얀 설탕, 15kg, 1개\n20,150원\n\n(10g당 13원)\n150원\n와우회원 추가 쿠폰\n내일(월) 도착 보장\n무료배송 ∙ 무료반품\n5\n(31260)\n\n최대 202원 적립',
  urls: [
    'https://www.coupang.com/vp/products/7666070794?itemId=23361506529&vendorItemId=86478559145&sourceType=CAMPAIGN&campaignId=82&categoryId=0',
    'https://www.coupang.com/vp/products/8421621380?itemId=29058245259&vendorItemId=82515357202&sourceType=CAMPAIGN&campaignId=82&categoryId=0',
    'https://www.coupang.com/vp/products/7958974?itemId=19421766393&vendorItemId=3058658009&sourceType=CAMPAIGN&campaignId=82&categoryId=0',
    'https://www.coupang.com/vp/products/9374602118?itemId=16584760&vendorItemId=3005825349&sourceType=CAMPAIGN&campaignId=82&categoryId=0',
  ],
  images: [
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/71398552289343-b41a602e-f62c-4f23-99f5-0a31785c8c32.jpg',
    'https://image.coupangcdn.com/image/coupang/rds/logo/xxxhdpi/logo_rocket_filter_medium.png',
    'https://image.coupangcdn.com/image/coupang/rds/logo_v2/rds_logo_pdd_tomorrow_md/badge_199cd481e67.png',
    'https://image.coupangcdn.com/image/badges/cashback/web/list-cash-icon@2x.png',
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/6102418928810302-5e249d2b-7cba-4ad5-93c0-61e6707032a7.jpg',
    'https://image.coupangcdn.com/image/coupang/rds/logo/xxxhdpi/logo_rocket_filter_medium.png',
    'https://image.coupangcdn.com/image/coupang/rds/logo_v2/rds_logo_pdd_tomorrow_md/badge_199cd481e67.png',
    'https://image.coupangcdn.com/image/badges/cashback/web/list-cash-icon@2x.png',
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/102429119420093-c3b77e10-fe3f-4bae-8a5c-08e5ee655b49.jpg',
    'https://image.coupangcdn.com/image/coupang/rds/logo/xxxhdpi/logo_rocket_filter_medium.png',
    'https://image.coupangcdn.com/image/coupang/rds/logo_v2/rds_logo_pdd_tomorrow_md/badge_199cd481e67.png',
    'https://image.coupangcdn.com/image/badges/cashback/web/list-cash-icon@2x.png',
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/297139095290024-b3f2237a-80a7-4402-9f65-3f4e2e4c74b3.jpg',
    'https://image.coupangcdn.com/image/coupang/rds/logo/xxxhdpi/logo_rocket_filter_medium.png',
    'https://image.coupangcdn.com/image/coupang/rds/logo_v2/rds_logo_pdd_tomorrow_md/badge_199cd481e67.png',
    'https://image.coupangcdn.com/image/badges/cashback/web/list-cash-icon@2x.png',
  ],
});

test('실제 북마클릿 결과: 공용 뱃지/로고 아이콘은 걸러내고 진짜 상품사진만 순서대로 매칭한다', () => {
  const items = parseListingPayload(REAL_BOOKMARKLET_PAYLOAD);
  assert.strictEqual(items.length, 4);
  assert.strictEqual(
    items[0].imageUrl,
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/71398552289343-b41a602e-f62c-4f23-99f5-0a31785c8c32.jpg',
  );
  assert.strictEqual(
    items[1].imageUrl,
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/6102418928810302-5e249d2b-7cba-4ad5-93c0-61e6707032a7.jpg',
  );
  assert.strictEqual(
    items[2].imageUrl,
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/102429119420093-c3b77e10-fe3f-4bae-8a5c-08e5ee655b49.jpg',
  );
  assert.strictEqual(
    items[3].imageUrl,
    'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/297139095290024-b3f2237a-80a7-4402-9f65-3f4e2e4c74b3.jpg',
  );
  // 로고/뱃지 아이콘 URL은 절대 어느 상품에도 안 붙어야 함
  items.forEach((it) => {
    assert.ok(!it.imageUrl.includes('rds/logo'));
    assert.ok(!it.imageUrl.includes('badges/cashback'));
  });
});
