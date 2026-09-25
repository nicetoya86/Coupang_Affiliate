# 임팩트 영상 생성 시스템 (Remotion 기반) — 설계 스펙

> 작성일: 2026-09-25. 계정 A 전용 Threads 상품 영상을 기존 Cloudinary zoompan(부드러운 줌인) 방식에서 하드컷 기반 "임팩트 영상"으로 교체하기 위한 신규 서브시스템. 계정 B는 기존 zoompan 방식을 그대로 유지한다.

## 1. 목표

Threads 피드에서 스크롤을 멈추게 하는 힘이 부드러운 연속 줌인보다 급격한 컷/전환에서 나온다는 전제 하에, 코드로 제어 가능한 짧은 하드컷 영상을 Remotion으로 생성하는 렌더링 파이프라인을 만든다. n8n Execute Command 노드에서 CLI로 그대로 호출 가능해야 한다.

## 2. 배경 / 기존 자산과의 관계

- 기존 파이프라인: `응답 파싱 및 댓글 텍스트 구성` 노드(n8n, 워크플로우 `NgC6DlDTrW3tnygc`)의 `toZoompanVideoUrl()`이 Cloudinary `e_zoompan` 트랜스폼으로 이미지→영상 변환. 이 방식은 계정 B에 그대로 유지, 건드리지 않는다.
- 계정 A는 이번에 새로 만드는 Remotion 렌더러로 영상을 생성한다. **n8n 워크플로우에 계정 A/B 분기를 연결하는 작업은 이번 스펙의 범위가 아니다** — 최신 워크플로우 JSON을 받아 확인한 뒤 별도 스펙/작업으로 진행한다.
- 상품 이미지는 시트(`GOOGLE_SHEET_ID` = `1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA`, `시트1`)의 `image_url` 컬럼 값(Cloudinary 정적 이미지 URL) 하나만 존재 — 여러 각도 사진은 없다.

## 3. 프로젝트 구조

저장소 루트에 독립 폴더로 신설, 기존 `scripts/`의 Node 환경과 완전히 분리:

```
video-remotion/
  package.json          # remotion, react, @remotion/cli 등 이 폴더에만 설치
  .nvmrc                # Remotion-Node 호환성 문제 시에만 LTS 버전 고정 (리스크 항목 참고)
  src/
    Root.tsx             # registerRoot, Composition 등록 (jumpcut-closeup / zoomout-reveal 두 개)
    ImpactVideo.tsx       # 메인 Composition 컴포넌트 (타임라인/오버레이/색보정 총괄)
    shots.ts              # 크롭 프리셋, 샷 타이밍 계산 유틸
    HookOverlay.tsx        # 텍스트 오버레이 컴포넌트
  render.js              # CLI 렌더링 래퍼 (npx remotion render 호출)
  sample-input.json      # 샘플 상품 데이터 (시트 실제 값)
  out/                    # 렌더링 결과 mp4 (git ignore)
```

n8n에서는 `node video-remotion/render.js --json '<입력 JSON>'` 형태로 Execute Command 노드가 이 폴더를 직접 호출하는 것을 전제로 한다.

## 4. Composition 설계

### 4.1 Props 인터페이스

```ts
type ImpactVideoProps = {
  productImageUrl: string;
  price: string;
  hookText: string;
  variant: 'jumpcut-closeup' | 'zoomout-reveal';
};
```

### 4.2 해상도 / 프레임레이트

1080×1080, 30fps. 쿠팡 썸네일 원본이 정사각형에 가까워(292×292 등) 크롭 프리셋과의 호환이 좋다.

### 4.3 타임라인 (총 3~4초, 프레임 단위는 30fps 기준)

| 구간 | 길이 | 내용 |
|---|---|---|
| Shot 1 | 9프레임 (0.3초) | 오프닝 컷. variant에 따라 아래 4.4 참고 |
| Shot 2~4 | 각 24~36프레임 (0.8~1.2초, 상품별로 고정값 사용 — 4.5 참고) | 같은 이미지의 다른 크롭 프리셋을 하드컷으로 순환 |

Shot 2~4의 개별 길이는 상품마다 랜덤화하지 않고 **고정 시퀀스** `[30, 30, 24]`프레임(1.0s, 1.0s, 0.8s)을 기본값으로 사용한다 — 총 길이 9+30+30+24 = 93프레임 = 3.1초, 스펙의 3~4초 범위 안. (근거: 매 렌더마다 랜덤 길이를 줄 근거 있는 이점이 없음 — YAGNI. variant A/B 테스트는 오프닝 컷 스타일로 충분히 커버됨.)

### 4.4 오프닝 컷 (Shot 1, 9프레임)

- **`jumpcut-closeup`**: 프레임 0~3(전체 상품 크롭, 즉 원본 비율 그대로 contain) → 프레임 4~8(디테일 클로즈업 크롭, 중앙 확대 2.2배)로 **하드컷** (트랜지션 없이 프레임 경계에서 즉시 전환).
- **`zoomout-reveal`**: 프레임 0에 2.4배 확대 상태로 시작, 9프레임에 걸쳐 `Easing.out(Easing.cubic)`로 scale 2.4→1.0 애니메이션. 유일하게 모션이 있는 구간이지만 0.3초로 압축되어 있어 "부드러운 AI 줌"으로 인식되지 않는 스냅 동작으로 읽힌다.

### 4.5 앵글 전환 (Shot 2~4)

이미지가 1장뿐이므로 크롭 프리셋 배열을 순환시켜 "다른 각도"처럼 보이게 한다. `shots.ts`에 프리셋 4종 정의(중앙, 좌상단 확대, 우하단 확대, 원본 비율) 후 `[중앙, 좌상단, 우하단]` 순서로 Shot 2~4에 배정. 프리셋마다 `object-fit: cover` + `transform: scale(n) translate(x%, y%)` 값만 다르고 크로스페이드 없이 프레임 경계에서 즉시 전환(하드컷).

### 4.6 텍스트 오버레이

`hookText`, `price`를 프레임 0부터 마지막 프레임까지 항상 표시 (재생 전 정지 썸네일에도 보여야 함). 반투명 검정 플레이트(`rgba(0,0,0,0.55)`) 위에 굵은 폰트(흰색, `font-weight: 800`)로 하단 1/4 영역에 배치 — hookText 위, price 아래(작은 글씨). 별도 애니메이션 없음(항상 고정 표시가 요구사항).

### 4.7 색보정

`ImpactVideo.tsx` 최상위 래퍼 div에 CSS `filter: saturate(1.18)` 적용 (1.15~1.2 범위 내 고정값). 별도 ffmpeg 후처리 스테이지 없이 Remotion 렌더 자체에 포함 — 파이프라인 단순화.

## 5. CLI 렌더링 (`render.js`)

- 입력: `--json '<inline JSON>'` 또는 `--input <file.json>` (스펙 3.5 인터페이스 그대로)
- 동작: 입력 검증(4개 필드 존재 확인) → variant별 compositionId 매핑 → `npx remotion render src/Root.tsx <compositionId> out/<slug>_<variant>_<timestamp>.mp4 --props=<임시 props json 파일>` 을 `child_process.execFileSync`로 실행
- 파일명 규칙: `productImageUrl`의 마지막 경로 세그먼트(확장자 제거)를 slug로 사용, 없으면 `product`. 예: `out/dbxinqhycctk4kdemuv0_jumpcut-closeup_1758700000000.mp4`
- 출력: stdout에 최종 mp4 절대경로 1줄 출력 (n8n Execute Command가 stdout 파싱해서 다음 노드로 넘기기 쉽게)

## 6. 테스트 계획

시트의 `account_A` 게시물 중 하나(예: `카슬라 베리 순정 가죽 주차번호판`, 가격 `8,450원`, `image_url`은 시트에서 조회)를 `sample-input.json`으로 만들어 두 variant 각각 실제 렌더링 1회씩 총 2회 실행, `out/`에 mp4가 정상 생성되는지 확인한다. 이 스펙 범위 내 "산출물 4"에 해당.

## 7. 범위 제외

- n8n 워크플로우 내 계정 A/B 분기 로직 연결 — 별도 작업, 최신 워크플로우 JSON 확인 후 진행
- 여러 각도의 실제 상품 사진을 사용하는 방식 (현재 이미지 소스가 1장뿐이라 크롭 시뮬레이션으로 대체)
- 뷰 수 기반 A/B 승자 자동 선택 로직 (파일명에 variant만 남기고, 실제 비교/집계는 후속 작업)

## 8. 리스크 / 가정

- **Node 버전**: 로컬 Node는 v24.21.0. Remotion 최신 버전이 공식 지원하는 Node 범위와 다를 수 있음. `video-remotion/` 설치 단계에서 실제 확인, 문제 발생 시 이 폴더에만 `.nvmrc`로 LTS(예: 20.x) 고정 — 기존 `scripts/` Node 환경에는 영향 없음.
- **폰트**: 시스템 기본 sans-serif로 시작. 가독성 문제 있으면 Remotion `@remotion/google-fonts`로 교체 (이번 스펙에서 폰트 파일 직접 번들링은 하지 않음).
- **크롭 프리셋 좌표**: 실제 렌더링 결과를 보고 4.5의 프리셋 수치(배율/이동값)를 미세조정할 가능성 있음 — 테스트 렌더 결과 확인 후 조정.
