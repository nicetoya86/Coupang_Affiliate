import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_FRAMES, INTRO_SCALE, TOTAL_DURATION_IN_FRAMES, getCamera } from './shots';

test('첫 프레임은 초근접+블러, 인트로 끝에는 선명하게 안착', () => {
  const first = getCamera('jumpcut-closeup', 0);
  assert.ok(Math.abs(first.scale - INTRO_SCALE) < 1e-9);
  assert.ok(first.blurPx > 2);
  const settled = getCamera('jumpcut-closeup', INTRO_FRAMES);
  assert.ok(settled.blurPx < 1e-9);
  assert.ok(settled.scale < 1.1);
});

test('인트로는 빠르게 시작해 감속(첫 6프레임 변화량 > 다음 6프레임)', () => {
  const s = (f: number) => getCamera('jumpcut-closeup', f).scale;
  assert.ok(s(0) - s(6) > (s(6) - s(12)) * 1.5);
});

test('프레임 간 급점프 없음: 인트로 이후엔 scale 변화 작고 펀치도 한 프레임 0.1 미만', () => {
  for (const v of ['jumpcut-closeup', 'zoomout-reveal'] as const) {
    for (let f = 1; f < TOTAL_DURATION_IN_FRAMES; f++) {
      const d = Math.abs(getCamera(v, f).scale - getCamera(v, f - 1).scale);
      assert.ok(d < (f <= INTRO_FRAMES ? 0.3 : 0.1), `${v} f${f} d=${d}`);
    }
  }
});

test('펀치 이후 배율이 증가하고 zoomout-reveal엔 펀치 없음', () => {
  assert.ok(getCamera('jumpcut-closeup', 100).scale > getCamera('zoomout-reveal', 100).scale + 0.1);
});
