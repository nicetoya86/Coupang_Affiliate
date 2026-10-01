// 스크롤 하이재킹용: 첫 0.7초에 강하게 줌아웃(+모션블러)으로 시선을 잡고, 이후 느린 푸시인 + 중반 펀치인 한 번.
// 모든 구간이 이징으로 이어져 속도 불연속(뚝 끊김)이 없다.
export const FPS = 30;
export const TOTAL_DURATION_IN_FRAMES = 150; // 5s

export const INTRO_FRAMES = 22;
export const INTRO_SCALE = 2.0; // 첫 프레임 배율 (초근접)
export const DRIFT_SCALE = 0.2;
export const PUNCH_AT = 70;
export const PUNCH_FRAMES = 9;
export const PUNCH_SCALE = 0.16;

type Variant = 'jumpcut-closeup' | 'zoomout-reveal';
export type Camera = { scale: number; translateXPercent: number; translateYPercent: number; blurPx: number };

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function getCamera(variant: Variant, frame: number): Camera {
  const intro = easeOutQuart(clamp01(frame / INTRO_FRAMES)); // 0 → 1, 시작은 빠르고 끝은 부드럽게 멈춤
  const drift = easeInOutSine(clamp01((frame - INTRO_FRAMES) / (TOTAL_DURATION_IN_FRAMES - 1 - INTRO_FRAMES)));
  const punch = variant === 'jumpcut-closeup' ? PUNCH_SCALE * easeOutQuart(clamp01((frame - PUNCH_AT) / PUNCH_FRAMES)) : 0;
  const settle = 1 - intro;
  return {
    scale: 1 + (INTRO_SCALE - 1) * settle + DRIFT_SCALE * drift + punch,
    translateXPercent: 5 * settle - 1.2 * drift,
    translateYPercent: 3.5 * settle - 0.8 * drift,
    blurPx: 4 * settle * settle,
  };
}
