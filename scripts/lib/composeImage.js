const sharp = require('sharp');

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWon(value) {
  const digits = String(value == null ? '' : value).replace(/[^0-9]/g, '');
  if (!digits) return '';
  return `${Number(digits).toLocaleString('ko-KR')}원`;
}

const BANNER_HEIGHT = 200;
const CANVAS_SIZE = 800;

async function composeProductImage({ imageBuffer, title, originalPrice, discountPrice, discountRate }) {
  const resizedBuffer = await sharp(imageBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();

  const safeTitle = escapeXml(String(title || '').slice(0, 26));
  const original = formatWon(originalPrice);
  const discounted = formatWon(discountPrice);
  const rateText = discountRate != null && discountRate !== '' ? `${discountRate}%` : '';

  const svg = `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE + BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${BANNER_HEIGHT}" fill="#ffffff"/>
      <text x="24" y="${CANVAS_SIZE + 38}" font-size="26" font-family="sans-serif" font-weight="700" fill="#111111">${safeTitle}</text>
      <text x="24" y="${CANVAS_SIZE + 78}" font-size="20" font-family="sans-serif" fill="#999999" text-decoration="line-through">${original}</text>
      <text x="24" y="${CANVAS_SIZE + 130}" font-size="34" font-family="sans-serif" font-weight="800" fill="#ff3b30">${discounted}</text>
      ${rateText ? `
      <circle cx="${CANVAS_SIZE - 90}" cy="${CANVAS_SIZE + 100}" r="58" fill="#ff3b30"/>
      <text x="${CANVAS_SIZE - 90}" y="${CANVAS_SIZE + 108}" font-size="26" font-family="sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${rateText}</text>
      ` : ''}
    </svg>
  `;

  return sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE + BANNER_HEIGHT, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: resizedBuffer, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

module.exports = { composeProductImage, formatWon, escapeXml };
