import test from 'node:test';
import assert from 'node:assert/strict';
import { findColumnIndex, columnIndexToLetter } from './sheet-sync.js';

test('findColumnIndex finds the column by exact header name', () => {
  const headers = ['collected_at', 'product_title', 'price', 'account_id', 'video_url'];
  assert.equal(findColumnIndex(headers, 'video_url'), 4);
  assert.equal(findColumnIndex(headers, 'account_id'), 3);
});

test('findColumnIndex returns -1 when the header is missing', () => {
  const headers = ['collected_at', 'product_title'];
  assert.equal(findColumnIndex(headers, 'video_url'), -1);
});

test('columnIndexToLetter converts a 0-based index to a spreadsheet column letter', () => {
  assert.equal(columnIndexToLetter(0), 'A');
  assert.equal(columnIndexToLetter(9), 'J');
  assert.equal(columnIndexToLetter(10), 'K');
});
