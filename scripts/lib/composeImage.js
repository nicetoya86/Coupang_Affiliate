const sharp = require('sharp');

const CANVAS_SIZE = 800;

// ponytail: 가격/할인율 배지 제거, 상품 사진만 사용. "가격은 댓글에 있음" CTA 문구와
// 이미지가 서로 모순되지 않도록(2026-09-08 CTR 개선 결정) 텍스트 오버레이 없이 리사이즈만 한다.
async function composeProductImage({ imageBuffer }) {
  return sharp(imageBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
}

module.exports = { composeProductImage };
