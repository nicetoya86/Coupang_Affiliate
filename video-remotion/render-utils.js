import path from 'node:path';

export const ALLOWED_VARIANTS = ['jumpcut-closeup', 'zoomout-reveal'];

export function validateInput(input) {
  if (!input || typeof input !== 'object') {
    return ['입력이 JSON 객체가 아닙니다.'];
  }

  const errors = [];
  if (!input.productImageUrl || typeof input.productImageUrl !== 'string') {
    errors.push('productImageUrl 필드가 없거나 문자열이 아닙니다.');
  }
  if (!input.price || typeof input.price !== 'string') {
    errors.push('price 필드가 없거나 문자열이 아닙니다.');
  }
  if (!input.hookText || typeof input.hookText !== 'string') {
    errors.push('hookText 필드가 없거나 문자열이 아닙니다.');
  }
  if (!ALLOWED_VARIANTS.includes(input.variant)) {
    errors.push(
      `variant는 ${ALLOWED_VARIANTS.join(' 또는 ')} 중 하나여야 합니다. 받은 값: ${JSON.stringify(input.variant)}`
    );
  }
  return errors;
}

export function slugify(productImageUrl) {
  try {
    const url = new URL(productImageUrl);
    const last = url.pathname.split('/').filter(Boolean).pop() || 'product';
    const withoutExt = last.replace(/\.[^.]+$/, '');
    const cleaned = withoutExt.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || 'product';
  } catch {
    return 'product';
  }
}

export function buildOutputFilename(productImageUrl, variant, timestamp = Date.now()) {
  return `${slugify(productImageUrl)}_${variant}_${timestamp}.mp4`;
}

export function buildOutputPath(outDir, productImageUrl, variant, timestamp = Date.now()) {
  return path.join(outDir, buildOutputFilename(productImageUrl, variant, timestamp));
}
