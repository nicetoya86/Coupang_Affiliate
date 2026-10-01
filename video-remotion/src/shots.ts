// 점프컷(경직된 하드컷) 대신 하나의 연속된 카메라 무빙(ease-in-out) — 자연스러운 Ken Burns.
export const FPS = 30;
export const TOTAL_DURATION_IN_FRAMES = 150; // 5s

type Variant = 'jumpcut-closeup' | 'zoomout-reveal';
export type Camera = { scale: number; translateXPercent: number; translateYPercent: number };

// variant id는 n8n/오케스트레이터 호환 위해 유지. jumpcut-closeup = 서서히 밀고 들어감, zoomout-reveal = 당겨 나옴.
const PATHS: Record<Variant, { from: Camera; to: Camera }> = {
  'jumpcut-closeup': {
    from: { scale: 1.04, translateXPercent: 1.5, translateYPercent: 1 },
    to: { scale: 1.28, translateXPercent: -1.5, translateYPercent: -1 },
  },
  'zoomout-reveal': {
    from: { scale: 1.3, translateXPercent: -1.5, translateYPercent: -1 },
    to: { scale: 1.04, translateXPercent: 1, translateYPercent: 0.5 },
  },
};

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function getCamera(variant: Variant, frame: number): Camera {
  const { from, to } = PATHS[variant];
  const t = Math.min(Math.max(frame / (TOTAL_DURATION_IN_FRAMES - 1), 0), 1);
  const e = easeInOutSine(t);
  // 아주 약한 핸드헬드 흔들림: 시작/끝(t=0,1)에서 0이 되도록 sin(πt) 가중
  const sway = Math.sin(Math.PI * t) * 0.25;
  return {
    scale: from.scale + (to.scale - from.scale) * e,
    translateXPercent: from.translateXPercent + (to.translateXPercent - from.translateXPercent) * e + Math.sin(frame / 11) * sway,
    translateYPercent: from.translateYPercent + (to.translateYPercent - from.translateYPercent) * e + Math.cos(frame / 14) * sway,
  };
}
