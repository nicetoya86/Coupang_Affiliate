const { parseDiscountRate } = require('./discount');

const PRICE_RE = /[\d][\d,]*\s*원/;
const PERCENT_RE = /-?\d{1,3}\s*%/;
const ETA_RE = /도착/;
const PAREN_ONLY_RE = /^\(.*\)$/;
const DISCOUNT_LABEL_RE = /할인$/;
// ponytail: 배송 뱃지 문구는 실제 페이지 기준 유한 집합으로 추정 - 새 뱃지 문구 나오면 여기 추가.
const BADGE_RE = /^(무료배송|로켓배송|로켓프레시|오늘출발|내일도착|판매자로켓|당일배송|로켓와우)/;
const MIN_TITLE_LENGTH = 6;

function isNoiseLine(line) {
  return (
    PRICE_RE.test(line) ||
    PERCENT_RE.test(line) ||
    BADGE_RE.test(line) ||
    ETA_RE.test(line) ||
    PAREN_ONLY_RE.test(line) ||
    DISCOUNT_LABEL_RE.test(line)
  );
}

function isTitleCandidate(line) {
  if (!line || line.length < MIN_TITLE_LENGTH) return false;
  return !isNoiseLine(line);
}

// 목록 카드 레이아웃 전용 가격 추출: "할인" 라벨 / "NN%" / 원가 / 판매가가 각각 별도 줄로 나오고,
// 순수 가격("...원")줄은 [원가, 판매가] 순서(원가가 먼저)로 등장한다고 전제.
// "(1개7,670원)" 같은 완전히 괄호로 감싼 보조 표기는 노이즈로 제외.
function extractCardPrice(lines) {
  const priceLines = lines.filter((l) => PRICE_RE.test(l) && !PAREN_ONLY_RE.test(l));
  if (priceLines.length >= 2) {
    return { originalPrice: priceLines[0], discountPrice: priceLines[priceLines.length - 1] };
  }
  return { originalPrice: '', discountPrice: priceLines[0] || '' };
}

function extractTitle(lines) {
  return lines.find((l) => isTitleCandidate(l)) || '';
}

// ponytail: 목록 페이지에서 여러 카드를 한번에 드래그+복사한 텍스트를, 각 카드 맨 위에 항상 나오는
// 배송 뱃지 줄("무료배송" 등)을 경계로 블록 단위로 쪼갠 뒤 블록별로 제목/가격/할인율을 추출한다.
// 카드 레이아웃이 바뀌면 어긋날 수 있음 - 실제 복사 결과로 검증 필요.
function parseListingClipboard(raw) {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (BADGE_RE.test(line) && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);

  return blocks
    .map((block) => ({
      title: extractTitle(block),
      ...extractCardPrice(block),
      discountRate: parseDiscountRate(block.join('\n')),
    }))
    .filter((p) => p.title && (p.discountPrice || p.originalPrice));
}

// 북마클릿(bookmarklet-listing.js)이 넣은 {raw, urls} JSON이면 텍스트+URL을 순서대로 매칭하고,
// 아니면(그냥 드래그+Ctrl+C만 한 경우) URL 없이 텍스트만 파싱한다.
// urls는 선택 영역 안의 상품 링크를 DOM 순서대로 모은 것이라 items와 같은 순서라고 가정 - 카드
// 개수와 URL 개수가 어긋나면(선택 범위가 틀어졌거나 링크 구조가 바뀌면) 뒤쪽부터 밀릴 수 있음.
function parseListingPayload(clipboardText) {
  let raw = clipboardText || '';
  let urls = [];
  try {
    const parsed = JSON.parse(clipboardText);
    if (parsed && typeof parsed.raw === 'string') {
      raw = parsed.raw;
      urls = Array.isArray(parsed.urls) ? parsed.urls : [];
    }
  } catch (e) {
    // JSON이 아니면 순수 텍스트로 취급
  }
  const items = parseListingClipboard(raw);
  return items.map((item, i) => ({ ...item, productUrl: urls[i] || '' }));
}

module.exports = { parseListingClipboard, parseListingPayload, isTitleCandidate };
