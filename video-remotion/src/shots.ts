export type CropPreset = {
  scale: number;
  translateXPercent: number;
  translateYPercent: number;
};

type PresetKey = 'center' | 'topLeft' | 'bottomRight' | 'full';

export const CROP_PRESETS: Record<PresetKey, CropPreset> = {
  full: { scale: 1, translateXPercent: 0, translateYPercent: 0 },
  center: { scale: 1.6, translateXPercent: 0, translateYPercent: 0 },
  topLeft: { scale: 2.0, translateXPercent: -18, translateYPercent: -18 },
  bottomRight: { scale: 2.0, translateXPercent: 18, translateYPercent: 18 },
};

export const SHOT1_DURATION_IN_FRAMES = 9;
export const SHOT_2_TO_4_DURATIONS_IN_FRAMES: readonly number[] = [30, 30, 24];
export const SHOT_2_TO_4_PRESET_SEQUENCE: readonly PresetKey[] = ['center', 'topLeft', 'bottomRight'];

export const TOTAL_DURATION_IN_FRAMES =
  SHOT1_DURATION_IN_FRAMES + SHOT_2_TO_4_DURATIONS_IN_FRAMES.reduce((a, b) => a + b, 0);

export const JUMPCUT_SPLIT_FRAME = 4;
export const JUMPCUT_CLOSEUP_SCALE = 2.2;
export const ZOOMOUT_START_SCALE = 2.4;
export const ZOOMOUT_END_SCALE = 1.0;

export function getShotForFrame(frame: number): {
  shotIndex: number;
  frameWithinShot: number;
  preset: CropPreset;
} {
  if (frame < SHOT1_DURATION_IN_FRAMES) {
    return { shotIndex: 0, frameWithinShot: frame, preset: CROP_PRESETS.full };
  }

  let cursor = SHOT1_DURATION_IN_FRAMES;
  for (let i = 0; i < SHOT_2_TO_4_DURATIONS_IN_FRAMES.length; i++) {
    const duration = SHOT_2_TO_4_DURATIONS_IN_FRAMES[i];
    if (frame < cursor + duration) {
      const presetKey = SHOT_2_TO_4_PRESET_SEQUENCE[i];
      return { shotIndex: i + 1, frameWithinShot: frame - cursor, preset: CROP_PRESETS[presetKey] };
    }
    cursor += duration;
  }

  const lastIndex = SHOT_2_TO_4_DURATIONS_IN_FRAMES.length - 1;
  const presetKey = SHOT_2_TO_4_PRESET_SEQUENCE[lastIndex];
  return {
    shotIndex: lastIndex + 1,
    frameWithinShot: SHOT_2_TO_4_DURATIONS_IN_FRAMES[lastIndex] - 1,
    preset: CROP_PRESETS[presetKey],
  };
}

export function getShot1Scale(
  variant: 'jumpcut-closeup' | 'zoomout-reveal',
  frameWithinShot1: number
): number {
  if (variant === 'jumpcut-closeup') {
    return frameWithinShot1 < JUMPCUT_SPLIT_FRAME ? 1 : JUMPCUT_CLOSEUP_SCALE;
  }
  const progress = Math.min(frameWithinShot1 / (SHOT1_DURATION_IN_FRAMES - 1), 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  return ZOOMOUT_START_SCALE + (ZOOMOUT_END_SCALE - ZOOMOUT_START_SCALE) * eased;
}
