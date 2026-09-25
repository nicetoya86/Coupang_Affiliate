import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInput, slugify, buildOutputFilename, ALLOWED_VARIANTS } from './render-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test('ALLOWED_VARIANTS values each have a matching Composition id in Root.tsx', () => {
  const rootTsx = fs.readFileSync(path.join(__dirname, 'src', 'Root.tsx'), 'utf8');
  for (const variant of ALLOWED_VARIANTS) {
    assert.ok(
      rootTsx.includes(`id="${variant}"`),
      `Root.tsx is missing a Composition with id="${variant}"`
    );
  }
});
