import test from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_DURATION_IN_FRAMES, getCamera } from './shots';

test('push-in: 시작 ≈1.04, 끝 ≈1.28, 단조 증가', () => {
  const s = getCamera('jumpcut-closeup', 0).scale;
  const e = getCamera('jumpcut-closeup', TOTAL_DURATION_IN_FRAMES - 1).scale;
  assert.ok(Math.abs(s - 1.04) < 1e-9 && Math.abs(e - 1.28) < 1e-9);
  let prev = s;
  for (let f = 1; f < TOTAL_DURATION_IN_FRAMES; f++) {
    const cur = getCamera('jumpcut-closeup', f).scale;
    assert.ok(cur >= prev);
    prev = cur;
  }
});

test('프레임 간 점프 없음 (하드컷 회귀 방지): scale/translate 변화량 작음', () => {
  for (const v of ['jumpcut-closeup', 'zoomout-reveal'] as const) {
    for (let f = 1; f < TOTAL_DURATION_IN_FRAMES; f++) {
      const a = getCamera(v, f - 1);
      const b = getCamera(v, f);
      assert.ok(Math.abs(b.scale - a.scale) < 0.01);
      assert.ok(Math.abs(b.translateXPercent - a.translateXPercent) < 0.5);
      assert.ok(Math.abs(b.translateYPercent - a.translateYPercent) < 0.5);
    }
  }
});

test('zoomout-reveal: 당겨 나옴', () => {
  assert.ok(getCamera('zoomout-reveal', 0).scale > getCamera('zoomout-reveal', TOTAL_DURATION_IN_FRAMES - 1).scale);
});
