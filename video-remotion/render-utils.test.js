import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, slugify, buildOutputFilename, ALLOWED_VARIANTS } from './render-utils.js';

test('validateInput passes for a well-formed input', () => {
  const errors = validateInput({
    productImageUrl: 'https://example.com/a/b/c.png',
    price: '8,450원',
    hookText: '이거 안 하면 손해래',
    variant: 'jumpcut-closeup',
  });
  assert.deepEqual(errors, []);
});

test('validateInput reports missing required fields', () => {
  const errors = validateInput({ variant: 'jumpcut-closeup' });
  assert.ok(errors.some((e) => e.includes('productImageUrl')));
  assert.ok(errors.some((e) => e.includes('price')));
  assert.ok(errors.some((e) => e.includes('hookText')));
});

test('validateInput rejects an unsupported variant value', () => {
  const errors = validateInput({
    productImageUrl: 'https://example.com/a.png',
    price: '1,000원',
    hookText: '테스트',
    variant: 'fade-in',
  });
  assert.ok(errors.some((e) => e.includes('variant')));
});

test('validateInput rejects non-object input', () => {
  const errors = validateInput(null);
  assert.equal(errors.length, 1);
});

test('slugify extracts filename without extension from a URL', () => {
  assert.equal(
    slugify('https://res.cloudinary.com/dqmdjn0o/image/upload/v1/qmqsplv3i5oswhj3gd1f.png'),
    'qmqsplv3i5oswhj3gd1f'
  );
});

test('slugify falls back to "product" for an invalid URL', () => {
  assert.equal(slugify('not-a-url'), 'product');
});

test('buildOutputFilename embeds slug, variant and timestamp', () => {
  const name = buildOutputFilename('https://example.com/x/abc.png', 'zoomout-reveal', 123);
  assert.equal(name, 'abc_zoomout-reveal_123.mp4');
});

test('ALLOWED_VARIANTS contains exactly the two spec variants', () => {
  assert.deepEqual(ALLOWED_VARIANTS, ['jumpcut-closeup', 'zoomout-reveal']);
});
