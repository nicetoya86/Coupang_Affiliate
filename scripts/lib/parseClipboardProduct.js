const { parseDiscountRate } = require('./discount');

const PRICE_RE = /[\d][\d,]*\s*원/;
const PERCENT_RE = /^-?\d{1,3}\s*%$/;
const IGNORE_LINES = new Set(['상품정보', '링크 생성']);

function extractTitle(lines) {
  return lines.find((l) => l && !IGNORE_LINES.has(l) && !PRICE_RE.test(l) && !PERCENT_RE.test(l)) || '';
}

// ponytail: 할인가/원가 순서는 "먼저 나오는 원 표기 = 할인가, 마지막 = 원가" 추정.
// 카드 레이아웃이 다르면 어긋날 수 있어 항상 프롬프트에서 사람이 Enter로 확인/교정한다.
function extractPrices(lines) {
  const priceLines = lines.filter((l) => PRICE_RE.test(l));
  return {
    discountPrice: priceLines[0] || '',
    originalPrice: priceLines.length > 1 ? priceLines[priceLines.length - 1] : '',
  };
}

function parseProductText(raw) {
  const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const { discountPrice, originalPrice } = extractPrices(lines);
  return {
    title: extractTitle(lines),
    discountPrice,
    originalPrice,
    discountRate: parseDiscountRate(raw),
  };
}

// 북마클릿이 넣은 {raw, imageUrl} JSON이면 구조화 파싱, 아니면(그냥 Ctrl+C한 텍스트) raw 텍스트로 취급.
function parseClipboardPayload(clipboardText) {
  let raw = clipboardText || '';
  let imageUrl = '';
  try {
    const parsed = JSON.parse(clipboardText);
    if (parsed && typeof parsed.raw === 'string') {
      raw = parsed.raw;
      imageUrl = parsed.imageUrl || '';
    }
  } catch (e) {
    // 북마클릿 안 쓰고 그냥 텍스트만 복사한 경우 - raw 그대로 사용
  }
  return { ...parseProductText(raw), imageUrl };
}

module.exports = { parseProductText, parseClipboardPayload };
