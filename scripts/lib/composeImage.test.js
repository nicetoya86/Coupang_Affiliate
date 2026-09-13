const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const { composeProductImage } = require('./composeImage');

test('composeProductImage: 800x800 정사각형 PNG로 리사이즈, 가격/할인 배지 없음', async () => {
  const input = await sharp({ create: { width: 300, height: 150, channels: 3, background: '#ff0000' } })
    .png()
    .toBuffer();
  const output = await composeProductImage({
    imageBuffer: input,
    title: '무시되어야 함',
    discountPrice: '1,000원',
    discountRate: 50,
  });
  const meta = await sharp(output).metadata();
  assert.strictEqual(meta.width, 800);
  assert.strictEqual(meta.height, 800, '배지 배너(200px)가 더 이상 추가되지 않아야 함');
  assert.strictEqual(meta.format, 'png');
});
