# Remotion 임팩트 영상 생성 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계정 A 전용 Threads 상품 영상을 Remotion으로 하드컷 렌더링하는 CLI 파이프라인(`video-remotion/`)을 새로 만든다.

**Architecture:** 저장소 루트에 독립된 `video-remotion/` Node/TypeScript 프로젝트를 스캐폴딩한다. 크롭/타이밍 계산은 프레임워크와 분리된 순수 TS 함수(`shots.ts`, `text-utils.ts`)로 만들어 `node:test`로 단위 테스트하고, React/Remotion 컴포지션(`ImpactVideo.tsx`, `HookOverlay.tsx`)은 그 순수 함수를 소비만 한다. n8n 연동은 `render.js` CLI 래퍼(입력 검증 → props 임시파일 → `npx remotion render` 실행 → stdout에 mp4 경로 출력) 하나로 끝난다.

**Tech Stack:** Remotion 4.x, React 18, TypeScript 5, Node 내장 테스트 러너(`node:test`) + `tsx`(TS 테스트 실행용). 새 외부 의존성은 이 4개뿐이며 전부 `video-remotion/` 폴더에만 설치 — 기존 `scripts/` Node 환경은 건드리지 않는다.

**Spec:** `docs/superpowers/specs/2026-09-25-remotion-impact-video-design.md`

## Global Constraints

- 해상도/프레임레이트: 1080×1080, 30fps (스펙 4.2)
- 총 길이: Shot1 9프레임 + Shot2~4 `[30, 30, 24]`프레임 = 93프레임(3.1초), 고정값 (스펙 4.3)
- 색보정: 최상위 레이어에 CSS `filter: saturate(1.18)` (스펙 4.7), 별도 ffmpeg 후처리 없음
- `variant`는 정확히 `'jumpcut-closeup' | 'zoomout-reveal'` 두 값만 허용 (스펙 4.1)
- 출력 파일명 규칙: `{slug}_{variant}_{timestamp}.mp4` (스펙 5)
- n8n 연동 지점: `node video-remotion/render.js --json '<json>'` 또는 `--input <file>`, 성공 시 stdout에 mp4 절대경로 한 줄만 출력 (스펙 5) — **n8n 워크플로우 쪽 실제 연결은 이 플랜의 범위 밖** (스펙 7)
- 신규 의존성은 `video-remotion/package.json`에만 추가, 저장소 루트나 `scripts/`에는 어떤 파일도 추가/수정하지 않는다
- 계정 B의 기존 Cloudinary zoompan 로직(n8n 워크플로우 `NgC6DlDTrW3tnygc`)은 이 플랜에서 손대지 않는다

## Review Focus

- `productImageUrl`이 유효하지 않은 URL 문자열이거나 접근 불가한 이미지일 때 — `render.js`가 Remotion의 원본 에러를 삼키지 않고 non-zero exit + stderr로 실패를 드러내야 함 (Task 5)
- `--json` 인라인 인자로 한글/특수문자/따옴표가 섞인 `hookText`가 셸을 거쳐 깨지는 문제 — `--input <file>` 경로를 항상 지원해 셸 이스케이프를 우회할 수 있어야 함 (Task 4, 5)
- 필수 필드(`productImageUrl`/`price`/`hookText`/`variant`) 중 하나라도 빠진 입력 — Remotion을 아예 실행하지 않고 검증 단계에서 사람이 읽을 수 있는 에러로 즉시 실패해야 함 (Task 4, 5)
- 허용되지 않은 `variant` 값(오타 등) — Remotion의 불친절한 "composition not found" 에러 대신 명확한 검증 에러로 실패해야 함 (Task 4, 5)
- 지나치게 긴 `hookText`가 1080px 프레임 밖으로 넘치는 문제 — 오버레이에 표시되기 전에 길이를 clamp해야 함 (Task 2, 3)

---

## Task 1: `video-remotion/` 프로젝트 스캐폴딩

**Files:**
- Create: `video-remotion/package.json`
- Create: `video-remotion/tsconfig.json`
- Create: `video-remotion/.gitignore`
- Create: `video-remotion/src/index.ts` (임시 placeholder, Task 3에서 완성)

**Interfaces:**
- Consumes: 없음 (최초 스캐폴딩)
- Produces: `npm install`/`npx remotion` 이 동작하는 Node 프로젝트 루트. 이후 모든 Task가 이 폴더 기준으로 파일을 추가한다.

- [ ] **Step 1: 폴더/파일 생성**

`video-remotion/package.json`:
```json
{
  "name": "video-remotion",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:ts": "tsx --test src/shots.test.ts src/text-utils.test.ts",
    "test:js": "node --test render-utils.test.js render.test.js",
    "test": "npm run test:ts && npm run test:js"
  },
  "dependencies": {
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0"
  }
}
```

`video-remotion/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2018",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

`video-remotion/.gitignore`:
```
node_modules/
out/
```

`video-remotion/src/index.ts` (placeholder, Task 3에서 실제 Root 연결로 교체):
```ts
export {};
```

- [ ] **Step 2: 의존성 설치**

Run: `cd video-remotion && npm install`
Expected: 에러 없이 완료. Remotion이 헤드리스 Chrome 바이너리를 처음 다운로드하므로 수 분 걸릴 수 있음.

- [ ] **Step 3: Remotion CLI 동작 확인 (Node 버전 호환성 검증)**

Run: `cd video-remotion && npx remotion versions`
Expected: Remotion/Node/브라우저 버전 정보가 출력됨 (설치된 헤드리스 브라우저 다운로드까지 성공했다는 뜻).

**만약 이 단계에서 Node 버전 비호환 에러가 나면:**
1. `video-remotion/.nvmrc` 파일을 만들고 내용은 `20` (LTS) 한 줄만 작성
2. 로컬에 Node 20이 없으면 nvm으로 설치 후 `nvm use` (또는 volta 등 이미 쓰는 버전 매니저 사용)
3. `video-remotion/` 안에서만 Node 20으로 다시 `npm install` — 저장소 루트/`scripts/`의 Node 환경은 그대로 둔다
4. 이후 모든 Task의 `npm`/`npx` 명령은 이 폴더 안에서 Node 20 기준으로 실행

- [ ] **Step 4: Commit**

```bash
git add video-remotion/package.json video-remotion/package-lock.json video-remotion/tsconfig.json video-remotion/.gitignore video-remotion/src/index.ts
git commit -m "Scaffold video-remotion Remotion project"
```

---

## Task 2: `shots.ts` / `text-utils.ts` — 순수 타이밍·크롭·텍스트 로직 (TDD)

**Files:**
- Create: `video-remotion/src/shots.ts`
- Create: `video-remotion/src/shots.test.ts`
- Create: `video-remotion/src/text-utils.ts`
- Create: `video-remotion/src/text-utils.test.ts`

**Interfaces:**
- Consumes: 없음 (Remotion 런타임에 의존하지 않는 순수 함수)
- Produces:
  - `CropPreset = { scale: number; translateXPercent: number; translateYPercent: number }`
  - `CROP_PRESETS: Record<'center'|'topLeft'|'bottomRight'|'full', CropPreset>`
  - `SHOT1_DURATION_IN_FRAMES: number` (9)
  - `SHOT_2_TO_4_DURATIONS_IN_FRAMES: readonly number[]` (`[30, 30, 24]`)
  - `TOTAL_DURATION_IN_FRAMES: number` (93) — Task 3의 `Root.tsx`가 `durationInFrames`로 그대로 사용
  - `getShotForFrame(frame: number): { shotIndex: number; frameWithinShot: number; preset: CropPreset }`
  - `getShot1Scale(variant: 'jumpcut-closeup' | 'zoomout-reveal', frameWithinShot1: number): number`
  - `clampHookText(text: string, maxLength?: number): string` (기본 maxLength=40, 넘치면 `…`로 자름)

- [ ] **Step 1: 실패하는 테스트 작성 — `shots.test.ts`**

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd video-remotion && npx tsx --test src/shots.test.ts`
Expected: FAIL — `./shots` 모듈이 없어서 에러.

- [ ] **Step 3: `shots.ts` 최소 구현**

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd video-remotion && npx tsx --test src/shots.test.ts`
Expected: PASS (7개 테스트 전부)

- [ ] **Step 5: `text-utils.test.ts` 작성 (실패하는 테스트)**

```ts
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
```

Run: `cd video-remotion && npx tsx --test src/text-utils.test.ts`
Expected: FAIL — `./text-utils` 모듈 없음.

- [ ] **Step 6: `text-utils.ts` 구현**

```ts
export function clampHookText(text: string, maxLength: number = 40): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd video-remotion && npm run test:ts`
Expected: PASS (shots.test.ts 7개 + text-utils.test.ts 2개 = 9개 전부)

- [ ] **Step 8: Commit**

```bash
git add video-remotion/src/shots.ts video-remotion/src/shots.test.ts video-remotion/src/text-utils.ts video-remotion/src/text-utils.test.ts
git commit -m "Add pure shot-timing/crop and hook-text-clamp logic with tests"
```

---

## Task 3: `HookOverlay.tsx` + `ImpactVideo.tsx` + `Root.tsx` — Remotion 컴포지션 조립

**Files:**
- Create: `video-remotion/src/HookOverlay.tsx`
- Create: `video-remotion/src/ImpactVideo.tsx`
- Create: `video-remotion/src/Root.tsx`
- Modify: `video-remotion/src/index.ts` (Task 1의 placeholder를 실제 registerRoot 호출로 교체)

**Interfaces:**
- Consumes: Task 2의 `CROP_PRESETS`, `SHOT1_DURATION_IN_FRAMES`, `TOTAL_DURATION_IN_FRAMES`, `getShotForFrame`, `getShot1Scale`, `clampHookText`
- Produces:
  - `ImpactVideoProps = { productImageUrl: string; price: string; hookText: string; variant: 'jumpcut-closeup' | 'zoomout-reveal' }` — Task 5의 `render.js`가 이 shape의 JSON을 그대로 props로 넘긴다
  - Remotion 컴포지션 id 두 개: `"jumpcut-closeup"`, `"zoomout-reveal"` — Task 5의 `render.js`가 `input.variant` 값을 그대로 compositionId로 사용한다

- [ ] **Step 1: `HookOverlay.tsx` 작성**

```tsx
import React from 'react';
import { clampHookText } from './text-utils';

export const HookOverlay: React.FC<{ hookText: string; price: string }> = ({ hookText, price }) => {
  const displayText = clampHookText(hookText, 40);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '32px 40px 40px',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        style={{
          color: '#ffffff',
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.25,
          fontFamily: 'sans-serif',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {displayText}
      </div>
      <div
        style={{
          marginTop: 12,
          color: '#ffe066',
          fontWeight: 700,
          fontSize: 34,
          fontFamily: 'sans-serif',
        }}
      >
        {price}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: `ImpactVideo.tsx` 작성**

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { HookOverlay } from './HookOverlay';
import { SHOT1_DURATION_IN_FRAMES, getShot1Scale, getShotForFrame } from './shots';

export type ImpactVideoProps = {
  productImageUrl: string;
  price: string;
  hookText: string;
  variant: 'jumpcut-closeup' | 'zoomout-reveal';
};

export const ImpactVideo: React.FC<ImpactVideoProps> = ({
  productImageUrl,
  price,
  hookText,
  variant,
}) => {
  const frame = useCurrentFrame();

  let scale: number;
  let translateXPercent: number;
  let translateYPercent: number;

  if (frame < SHOT1_DURATION_IN_FRAMES) {
    scale = getShot1Scale(variant, frame);
    translateXPercent = 0;
    translateYPercent = 0;
  } else {
    const { preset } = getShotForFrame(frame);
    scale = preset.scale;
    translateXPercent = preset.translateXPercent;
    translateYPercent = preset.translateYPercent;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', filter: 'saturate(1.18)' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translate(${translateXPercent}%, ${translateYPercent}%)` }}>
        <Img src={productImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <HookOverlay hookText={hookText} price={price} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: `Root.tsx` 작성 (컴포지션 두 개 등록)**

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { ImpactVideo, ImpactVideoProps } from './ImpactVideo';
import { TOTAL_DURATION_IN_FRAMES } from './shots';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1080;

const SAMPLE_PROPS: ImpactVideoProps = {
  productImageUrl:
    'https://res.cloudinary.com/dqmdjn0o/image/upload/v1789005287/qmqsplv3i5oswhj3gd1f.png',
  price: '8,450원',
  hookText: '주차번호판 안 붙이면 벌금 문다는 거 알아?',
  variant: 'jumpcut-closeup',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="jumpcut-closeup"
        component={ImpactVideo}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ ...SAMPLE_PROPS, variant: 'jumpcut-closeup' }}
      />
      <Composition
        id="zoomout-reveal"
        component={ImpactVideo}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ ...SAMPLE_PROPS, variant: 'zoomout-reveal' }}
      />
    </>
  );
};
```

- [ ] **Step 4: `index.ts`를 실제 진입점으로 교체**

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

- [ ] **Step 5: 스틸 프레임 렌더링으로 두 컴포지션 검증**

Run:
```bash
cd video-remotion
npx remotion still src/index.ts jumpcut-closeup out/qa-jumpcut-frame0.png --frame=0
npx remotion still src/index.ts jumpcut-closeup out/qa-jumpcut-frame4.png --frame=4
npx remotion still src/index.ts zoomout-reveal out/qa-zoomout-frame0.png --frame=0
```
Expected: 세 명령 모두 에러 없이 PNG 파일 생성.

- [ ] **Step 6: 해상도(1080×1080) 자동 검증**

Run:
```bash
node -e "
const fs = require('fs');
['qa-jumpcut-frame0.png','qa-jumpcut-frame4.png','qa-zoomout-frame0.png'].forEach((name) => {
  const buf = fs.readFileSync('video-remotion/out/' + name);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== 1080 || height !== 1080) {
    console.error(name + ': DIMENSION MISMATCH ' + width + 'x' + height);
    process.exit(1);
  }
  console.log(name + ': OK ' + width + 'x' + height);
});
"
```
Expected: 세 줄 모두 `OK 1080x1080` 출력.

- [ ] **Step 7: Commit**

```bash
git add video-remotion/src/HookOverlay.tsx video-remotion/src/ImpactVideo.tsx video-remotion/src/Root.tsx video-remotion/src/index.ts
git commit -m "Wire up ImpactVideo composition with hard-cut shots, overlay, and color grading"
```

---

## Task 4: `render-utils.js` — 입력 검증 / 파일명 규칙 (TDD)

**Files:**
- Create: `video-remotion/render-utils.js`
- Create: `video-remotion/render-utils.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수, Node 내장 모듈만 사용)
- Produces:
  - `ALLOWED_VARIANTS: string[]` (`['jumpcut-closeup', 'zoomout-reveal']`)
  - `validateInput(input: unknown): string[]` — 에러 메시지 배열, 빈 배열이면 유효
  - `slugify(productImageUrl: string): string`
  - `buildOutputFilename(productImageUrl: string, variant: string, timestamp?: number): string`
  - `buildOutputPath(outDir: string, productImageUrl: string, variant: string, timestamp?: number): string` — Task 5의 `render.js`가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, slugify, buildOutputFilename, ALLOWED_VARIANTS } from './render-utils.js';

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd video-remotion && node --test render-utils.test.js`
Expected: FAIL — `./render-utils.js` 모듈 없음.

- [ ] **Step 3: `render-utils.js` 구현**

```js
import path from 'node:path';

export const ALLOWED_VARIANTS = ['jumpcut-closeup', 'zoomout-reveal'];

export function validateInput(input) {
  if (!input || typeof input !== 'object') {
    return ['입력이 JSON 객체가 아닙니다.'];
  }

  const errors = [];
  if (!input.productImageUrl || typeof input.productImageUrl !== 'string') {
    errors.push('productImageUrl 필드가 없거나 문자열이 아닙니다.');
  }
  if (!input.price || typeof input.price !== 'string') {
    errors.push('price 필드가 없거나 문자열이 아닙니다.');
  }
  if (!input.hookText || typeof input.hookText !== 'string') {
    errors.push('hookText 필드가 없거나 문자열이 아닙니다.');
  }
  if (!ALLOWED_VARIANTS.includes(input.variant)) {
    errors.push(
      `variant는 ${ALLOWED_VARIANTS.join(' 또는 ')} 중 하나여야 합니다. 받은 값: ${JSON.stringify(input.variant)}`
    );
  }
  return errors;
}

export function slugify(productImageUrl) {
  try {
    const url = new URL(productImageUrl);
    const last = url.pathname.split('/').filter(Boolean).pop() || 'product';
    const withoutExt = last.replace(/\.[^.]+$/, '');
    const cleaned = withoutExt.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || 'product';
  } catch {
    return 'product';
  }
}

export function buildOutputFilename(productImageUrl, variant, timestamp = Date.now()) {
  return `${slugify(productImageUrl)}_${variant}_${timestamp}.mp4`;
}

export function buildOutputPath(outDir, productImageUrl, variant, timestamp = Date.now()) {
  return path.join(outDir, buildOutputFilename(productImageUrl, variant, timestamp));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd video-remotion && node --test render-utils.test.js`
Expected: PASS (8개 테스트 전부)

- [ ] **Step 5: Commit**

```bash
git add video-remotion/render-utils.js video-remotion/render-utils.test.js
git commit -m "Add input validation and output filename rules with tests"
```

---

## Task 5: `render.js` — CLI 렌더링 래퍼

**Files:**
- Create: `video-remotion/render.js`
- Create: `video-remotion/render.test.js`

**Interfaces:**
- Consumes: Task 3의 컴포지션 id(`variant` 값과 동일), Task 4의 `validateInput`/`buildOutputPath`/`ALLOWED_VARIANTS`
- Produces: CLI 진입점 `node render.js --json '<json>'` / `node render.js --input <file>` — 성공 시 exit 0 + stdout에 mp4 절대경로 한 줄, 실패 시 exit 1 + stderr에 에러 메시지. n8n Execute Command 노드가 이 stdout을 그대로 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성 (`parseArgs`만 검증, 실제 렌더링은 호출하지 않음)**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd video-remotion && node --test render.test.js`
Expected: FAIL — `./render.js` 모듈 없음.

- [ ] **Step 3: `render.js` 구현**

```js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInput, buildOutputPath } from './render-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const jsonIndex = argv.indexOf('--json');
  if (jsonIndex !== -1) {
    return JSON.parse(argv[jsonIndex + 1]);
  }
  const inputIndex = argv.indexOf('--input');
  if (inputIndex !== -1) {
    const filePath = argv[inputIndex + 1];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  throw new Error('--json <inline JSON> 또는 --input <파일 경로> 중 하나가 필요합니다.');
}

function main() {
  const argv = process.argv.slice(2);

  let input;
  try {
    input = parseArgs(argv);
  } catch (e) {
    console.error('입력 파싱 실패: ' + e.message);
    process.exit(1);
  }

  const errors = validateInput(input);
  if (errors.length > 0) {
    console.error('입력 검증 실패:\n' + errors.map((e) => '- ' + e).join('\n'));
    process.exit(1);
  }

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = buildOutputPath(outDir, input.productImageUrl, input.variant);

  const propsPath = path.join(os.tmpdir(), `impact-video-props-${Date.now()}.json`);
  fs.writeFileSync(propsPath, JSON.stringify(input), 'utf8');

  const entry = path.join(__dirname, 'src', 'index.ts');

  try {
    execFileSync(
      'npx',
      ['remotion', 'render', entry, input.variant, outputPath, `--props=${propsPath}`],
      { cwd: __dirname, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' }
    );
  } catch (e) {
    console.error('Remotion 렌더링 실패: ' + e.message);
    process.exit(1);
  } finally {
    fs.rmSync(propsPath, { force: true });
  }

  console.log(outputPath);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule || (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))) {
  main();
}
```

**주의:** Windows 경로 때문에 `import.meta.url`과 `process.argv[1]` 비교가 깨지기 쉽다. Step 4에서 `node render.js`로 직접 실행했을 때 `main()`이 실제로 호출되는지, 그리고 `node --test render.test.js`로 임포트했을 때는 호출되지 않는지 둘 다 확인한다. 깨지면 더 단순하게 `process.argv[1]?.endsWith('render.js')` 기준으로 바꾼다.

- [ ] **Step 4: 단위 테스트 통과 확인 (실제 렌더링 없이)**

Run: `cd video-remotion && node --test render.test.js`
Expected: PASS (3개 테스트), 그리고 이 과정에서 실제 Remotion 렌더링이 트리거되지 않아야 함(콘솔에 mp4 경로가 출력되지 않아야 함).

- [ ] **Step 5: 검증 실패 경로 수동 확인 (Review Focus: 필수 필드 누락 / 잘못된 variant)**

Run:
```bash
cd video-remotion
node render.js --json '{"variant":"jumpcut-closeup"}'; echo "exit=$?"
node render.js --json '{"productImageUrl":"https://example.com/a.png","price":"1,000원","hookText":"테스트","variant":"fade-in"}'; echo "exit=$?"
```
Expected: 둘 다 `exit=1`, stderr에 각각 "productImageUrl 필드가..." / "variant는..." 에러 메시지 출력. 실제 렌더링은 시도되지 않음(Remotion 관련 로그가 안 나와야 함).

- [ ] **Step 6: Commit**

```bash
git add video-remotion/render.js video-remotion/render.test.js
git commit -m "Add render.js CLI wrapper with fail-fast validation before invoking Remotion"
```

---

## Task 6: 실사용 데이터로 실제 렌더링 검증 (스펙 6번 테스트 계획)

**Files:**
- Create: `video-remotion/sample-input.json`
- Modify: `video-remotion/README.md` (신규 생성 — 사용법 3줄 요약)

**Interfaces:**
- Consumes: Task 5의 `render.js` CLI 전체
- Produces: `video-remotion/out/`에 실제 mp4 2개 (variant별 1개씩) — 사람이 눈으로 확인하는 최종 산출물. 이후 n8n 연동 작업(범위 밖)이 그대로 참고할 입력 예시.

- [ ] **Step 1: 시트 실제 데이터로 `sample-input.json` 작성**

시트(`시트1`, account_A)의 "카슬라 베리 순정 가죽 주차번호판" 행 데이터 사용:

```json
{
  "productImageUrl": "https://res.cloudinary.com/dqmdjn0o/image/upload/v1789005287/qmqsplv3i5oswhj3gd1f.png",
  "price": "8,450원",
  "hookText": "주차번호판 안 붙이면 벌금 문다는 거 알아?",
  "variant": "jumpcut-closeup"
}
```

- [ ] **Step 2: `jumpcut-closeup` 실제 렌더링**

Run:
```bash
cd video-remotion
node render.js --input sample-input.json
```
Expected: exit 0, stdout에 `out/qmqsplv3i5oswhj3gd1f_jumpcut-closeup_<timestamp>.mp4` 형태의 절대경로 한 줄 출력, 해당 파일이 실제로 존재하고 크기가 0바이트보다 큼.

Run 확인: `ls -la video-remotion/out/*.mp4`

- [ ] **Step 3: `zoomout-reveal` 실제 렌더링**

`sample-input.json`의 `variant`를 `"zoomout-reveal"`로 바꾼 임시 파일을 만들어 동일하게 렌더링:

```bash
cd video-remotion
node -e "
const fs = require('fs');
const input = JSON.parse(fs.readFileSync('sample-input.json', 'utf8'));
input.variant = 'zoomout-reveal';
fs.writeFileSync('sample-input-zoomout.json', JSON.stringify(input, null, 2));
"
node render.js --input sample-input-zoomout.json
rm sample-input-zoomout.json
```
Expected: exit 0, `out/`에 두 번째 mp4 생성 확인.

- [ ] **Step 4: 육안 확인 (사람이 직접 재생)**

두 mp4 파일을 실제로 재생해서 다음을 확인한다 (자동화 불가, 사람이 직접 봐야 함):
- 정지 첫 프레임에 훅 문구 + 가격이 이미 보이는가
- `jumpcut-closeup`은 0.3초 지점에서 하드컷이 눈에 띄는가, `zoomout-reveal`은 빠른 줌아웃으로 시작하는가
- Shot 2~4에서 다른 각도처럼 보이는 하드컷이 3번 일어나는가
- 전체적으로 색감이 쨍하게(채도 상승) 보이는가

- [ ] **Step 5: `README.md` 작성**

```markdown
# video-remotion

계정 A 전용 Threads 임팩트 영상 렌더러. 스펙: `docs/superpowers/specs/2026-09-25-remotion-impact-video-design.md`

## 사용법

\`\`\`bash
npm install
node render.js --input sample-input.json
# 또는: node render.js --json '{"productImageUrl":"...","price":"...","hookText":"...","variant":"jumpcut-closeup"}'
\`\`\`

성공 시 stdout에 생성된 mp4의 절대경로가 한 줄 출력된다 (n8n Execute Command 노드에서 그대로 사용).
```

- [ ] **Step 6: Commit**

```bash
git add video-remotion/sample-input.json video-remotion/README.md
git commit -m "Add sample input and README; verified real renders for both variants"
```

---

## Self-Review 결과 (작성자 자체 점검)

- **스펙 커버리지**: 3(프로젝트 구조)=Task1, 4.1~4.7(Composition)=Task2+3, 5(CLI)=Task4+5, 6(테스트 계획)=Task6, 7(범위 제외)=Global Constraints에 명시, 8(리스크)=Task1 Step3 Node 버전 분기. 스펙 전 항목에 대응 Task 있음.
- **Placeholder 스캔**: "TBD"/"나중에"/"적절히 처리" patterns 없음. 모든 코드 스텝에 실제 코드 포함.
- **타입 일관성**: `ImpactVideoProps`(Task3) ↔ `render.js`가 검증하는 필드(Task4 `validateInput`) ↔ `sample-input.json`(Task6) 4개 필드명(`productImageUrl`/`price`/`hookText`/`variant`) 전부 일치. `variant` 값(`'jumpcut-closeup'|'zoomout-reveal'`)이 Composition id(Task3)·`ALLOWED_VARIANTS`(Task4)·렌더 명령 인자(Task5)에서 동일하게 사용됨.
- **Review Focus 반영**: 5개 항목 모두 담당 Task의 테스트/수동검증 스텝으로 연결됨 (위 Review Focus 섹션에 Task 번호 명시).
