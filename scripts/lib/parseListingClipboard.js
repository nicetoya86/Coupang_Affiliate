const { parseDiscountRate } = require('./discount');

const PRICE_RE = /[\d][\d,]*\s*원/;
const PERCENT_RE = /-?\d{1,3}\s*%/;
const ETA_RE = /도착/;
const PAREN_ONLY_RE = /^\(.*\)$/;
const DISCOUNT_LABEL_RE = /할인$/;
// ponytail: 배송 뱃지 문구는 실제 페이지 기준 유한 집합으로 추정 - 새 뱃지 문구 나오면 여기 추가.
const BADGE_RE = /^(무료배송|로켓배송|로켓프레시|오늘출발|내일도착|판매자로켓|당일배송|로켓와우)/;
// "최저4,050원"(중고/리퍼 최저가), "최대 45원 적립" 처럼 "원"을 포함하지만 판매가/원가가 아닌 줄 제외용.
const PRICE_EXCLUDE_RE = /적립|최저/;
// 가격 줄 바로 다음 줄이 이 패턴이면(예: "와우회원 추가 쿠폰") 그 가격은 별도 쿠폰 적용 시에만
// 보이는 조건부 특가라 기본 판매가로 안 씀 (2026-08-30 제주삼다수/큐원 설탕 카드로 확인).
const COUPON_FOLLOWUP_RE = /쿠폰/;
const MIN_TITLE_LENGTH = 6;
// campaigns 페이지 카드는 "최대 N원 적립" 줄로 항상 끝남 (2026-08-30 실제 복사 결과로 확인) - 카드 경계로 사용.
const CARD_END_RE = /^최대\s*[\d,]+원\s*적립$/;

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

// "23%5,900원", "와우할인9%18,500원" 처럼 할인율 라벨이 가격에 붙어 나오는 줄에서 "...%" 부분을 떼고
// 순수 가격("5,900원")만 남긴다. %가 없는 줄은 그대로 반환.
function cleanPriceLine(line) {
  return line.replace(/^.*\d{1,3}\s*%/, '').trim();
}

// campaigns 페이지 카드 레이아웃(2026-08-30 실제 복사 결과 기준): [할인율%+원가]?, 판매가,
// (단위가격)?, 배송/평점/적립 정보 순. 순수 가격("...원")줄 중 "적립"/"최저"가 섞이거나 바로 다음
// 줄이 "쿠폰" 조건부 표기인 건 제외하고, 남은 줄이 2개면 [원가, 판매가](원가가 먼저), 1개면 그게 판매가.
function extractCardPrice(lines) {
  const priceLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PRICE_RE.test(line) || PAREN_ONLY_RE.test(line) || PRICE_EXCLUDE_RE.test(line)) continue;
    if (COUPON_FOLLOWUP_RE.test(lines[i + 1] || '')) continue;
    priceLines.push(cleanPriceLine(line));
  }
  if (priceLines.length >= 2) {
    return { originalPrice: priceLines[0], discountPrice: priceLines[priceLines.length - 1] };
  }
  return { originalPrice: '', discountPrice: priceLines[0] || '' };
}

function extractTitle(lines) {
  return lines.find((l) => isTitleCandidate(l)) || '';
}

// 화면에 안 보이는 접근성용 텍스트가 상품명/적립 문구를 바로 옆줄에 그대로 중복시키는 경우가 있어
// (2026-08-30 campaigns 페이지 복사 결과로 확인) 연속으로 똑같은 줄은 하나로 합친다.
function dedupeConsecutive(lines) {
  const out = [];
  for (const line of lines) {
    if (out.length && out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}

// ponytail: 목록 페이지에서 여러 카드를 한번에 드래그+복사한 텍스트를, 각 카드 맨 끝에 항상 나오는
// "최대 N원 적립" 줄을 경계로 블록 단위로 쪼갠 뒤 블록별로 제목/가격/할인율을 추출한다.
// 카드 레이아웃이 바뀌면 어긋날 수 있음 - 실제 복사 결과로 검증 필요.
function parseListingClipboard(raw) {
  const lines = dedupeConsecutive(
    String(raw || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );

  const blocks = [];
  let current = [];
  for (const line of lines) {
    current.push(line);
    if (CARD_END_RE.test(line)) {
      blocks.push(current);
      current = [];
    }
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

// 카드 하나당 실제 상품사진 말고도 로켓뱃지/내일도착뱃지/캐시백아이콘 등 공용 UI 아이콘까지
// cover_box로 잡혀서 images 배열에 4개씩 들어오는 경우가 있음(2026-08-30 campaigns 페이지 실제
// 확인). 이런 공용 아이콘은 매번 URL이 완전히 똑같은 정적 리소스라 "image/coupang/"(로고류)나
// "image/badges/"(뱃지류) 경로에 있고, 실제 상품사진은 "image/retail/" 또는 "image/vendor_inventory/"
// 경로에 있음 - 화이트리스트로 실제 상품사진만 남긴다.
function isProductPhotoUrl(url) {
  return /\/image\/(retail|vendor_inventory)\//.test(String(url || ''));
}

// 북마클릿(bookmarklet-listing.js)이 넣은 {raw, urls, images} JSON이면 텍스트+URL+이미지를
// 순서대로 매칭하고, 아니면(그냥 드래그+Ctrl+C만 한 경우) URL/이미지 없이 텍스트만 파싱한다.
// urls/images는 선택 영역 안에서 DOM 순서대로 모은 것이라 items와 같은 순서라고 가정 - 카드
// 개수와 어긋나면(선택 범위가 틀어졌거나 마크업이 바뀌면) 뒤쪽부터 밀릴 수 있음.
function parseListingPayload(clipboardText) {
  let raw = clipboardText || '';
  let urls = [];
  let images = [];
  try {
    const parsed = JSON.parse(clipboardText);
    if (parsed && typeof parsed.raw === 'string') {
      raw = parsed.raw;
      urls = Array.isArray(parsed.urls) ? parsed.urls : [];
      images = Array.isArray(parsed.images) ? parsed.images.filter(isProductPhotoUrl) : [];
    }
  } catch (e) {
    // JSON이 아니면 순수 텍스트로 취급
  }
  const items = parseListingClipboard(raw);
  return items.map((item, i) => ({ ...item, productUrl: urls[i] || '', imageUrl: images[i] || '' }));
}

module.exports = { parseListingClipboard, parseListingPayload, isTitleCandidate };
