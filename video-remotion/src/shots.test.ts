import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROP_PRESETS,
  SHOT1_DURATION_IN_FRAMES,
  SHOT_2_TO_4_DURATIONS_IN_FRAMES,
  TOTAL_DURATION_IN_FRAMES,
  getShotForFrame,
  getShot1Scale,
} from './shots';

test('TOTAL_DURATION_IN_FRAMES matches spec (93 frames / 3.1s at 30fps)', () => {
  assert.equal(SHOT1_DURATION_IN_FRAMES, 9);
  assert.deepEqual(SHOT_2_TO_4_DURATIONS_IN_FRAMES, [30, 30, 24]);
  assert.equal(TOTAL_DURATION_IN_FRAMES, 93);
});

test('getShotForFrame returns shot 1 (full preset) for frames before shot1 ends', () => {
  const result = getShotForFrame(5);
  assert.equal(result.shotIndex, 0);
  assert.deepEqual(result.preset, CROP_PRESETS.full);
});

test('getShotForFrame cycles center -> topLeft -> bottomRight across shots 2-4', () => {
  assert.deepEqual(getShotForFrame(9).preset, CROP_PRESETS.center);
  assert.deepEqual(getShotForFrame(39).preset, CROP_PRESETS.topLeft);
  assert.deepEqual(getShotForFrame(69).preset, CROP_PRESETS.bottomRight);
});

test('getShotForFrame clamps a frame past the end to the last shot', () => {
  const result = getShotForFrame(999);
  assert.deepEqual(result.preset, CROP_PRESETS.bottomRight);
});

test('getShot1Scale for jumpcut-closeup hard-cuts at frame 4', () => {
  assert.equal(getShot1Scale('jumpcut-closeup', 0), 1);
  assert.equal(getShot1Scale('jumpcut-closeup', 3), 1);
  assert.equal(getShot1Scale('jumpcut-closeup', 4), 2.2);
  assert.equal(getShot1Scale('jumpcut-closeup', 8), 2.2);
});

test('getShot1Scale for zoomout-reveal eases from 2.4 down to 1.0', () => {
  const first = getShot1Scale('zoomout-reveal', 0);
  const last = getShot1Scale('zoomout-reveal', SHOT1_DURATION_IN_FRAMES - 1);
  assert.equal(first, 2.4);
  assert.ok(Math.abs(last - 1.0) < 0.001);
  const mid = getShot1Scale('zoomout-reveal', 4);
  assert.ok(mid < first && mid > last);
});
