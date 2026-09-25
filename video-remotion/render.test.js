import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './render.js';

test('parseArgs reads inline JSON from --json', () => {
  const input = parseArgs(['--json', '{"variant":"jumpcut-closeup"}']);
  assert.equal(input.variant, 'jumpcut-closeup');
});

test('parseArgs reads JSON from a file with --input', () => {
  const filePath = path.join(os.tmpdir(), `render-test-input-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ variant: 'zoomout-reveal' }), 'utf8');
  try {
    const input = parseArgs(['--input', filePath]);
    assert.equal(input.variant, 'zoomout-reveal');
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

test('parseArgs throws when neither --json nor --input is given', () => {
  assert.throws(() => parseArgs([]), /--json.*--input/);
});
