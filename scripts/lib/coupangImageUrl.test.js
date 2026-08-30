const test = require('node:test');
const assert = require('node:assert');
const { upsizeCoupangThumbnail } = require('./coupangImageUrl');

test('썸네일 CDN URL의 크기를 1024x1024로 키운다', () => {
  const url = 'https://thumbnail.coupangcdn.com/thumbnails/remote/230x230ex/image/retail/images/abc.jpg';
  assert.strictEqual(
    upsizeCoupangThumbnail(url),
    'https://thumbnail.coupangcdn.com/thumbnails/remote/1024x1024ex/image/retail/images/abc.jpg',
  );
});

test('원하는 크기를 지정할 수 있다', () => {
  const url = 'https://thumbnail6.coupangcdn.com/thumbnails/remote/292x292q65ex/image/vendor_inventory/a.png';
  // "292x292q65ex"처럼 뒤에 화질 파라미터(q65)가 더 붙는 변형은 숫자xNN 부분만 안 맞아 패턴 밖 - 그대로 통과.
  assert.strictEqual(upsizeCoupangThumbnail(url, 500), url);
});

test('썸네일 패턴이 없는 URL(사람이 직접 복사한 원본 이미지 등)은 그대로 둔다', () => {
  const url = 'https://example.com/some/product-photo.jpg';
  assert.strictEqual(upsizeCoupangThumbnail(url), url);
});

test('빈 값/undefined는 빈 문자열을 반환한다', () => {
  assert.strictEqual(upsizeCoupangThumbnail(''), '');
  assert.strictEqual(upsizeCoupangThumbnail(undefined), '');
});
