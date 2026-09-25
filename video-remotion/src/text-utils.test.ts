import test from 'node:test';
import assert from 'node:assert/strict';
import { clampHookText } from './text-utils';

test('clampHookText returns short text unchanged (trimmed)', () => {
  assert.equal(clampHookText('  짧은 훅 문구  '), '짧은 훅 문구');
});

test('clampHookText truncates long text with an ellipsis, staying within maxLength', () => {
  const long = '이거 안 사면 진짜 손해 보는 거 나만 몰랐던 건가 진지하게 궁금하다';
  const result = clampHookText(long, 20);
  assert.ok(result.length <= 20);
  assert.ok(result.endsWith('…'));
});

test('clampHookText does not split a surrogate pair (emoji) when truncating', () => {
  const withEmoji = '이거 정말 대박인데 진짜 안 사면 후회할듯🎉 완전 강추함';
  const result = clampHookText(withEmoji, 15);
  assert.ok(result.length <= 16); // allows for the trailing ellipsis
  // A broken surrogate half serializes as the U+FFFD-adjacent lone surrogate;
  // Array.from + join never produces one, so round-tripping through
  // encodeURIComponent should never throw.
  assert.doesNotThrow(() => encodeURIComponent(result));
});
