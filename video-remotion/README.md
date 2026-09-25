# video-remotion

계정 A 전용 Threads 임팩트 영상 렌더러. 스펙: `docs/superpowers/specs/2026-09-25-remotion-impact-video-design.md`

## 사용법

```bash
npm install
cp .env.example .env   # CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET 채우기
node render.js --input sample-input.json
# 또는: node render.js --json '{"productImageUrl":"...","price":"...","hookText":"...","variant":"jumpcut-closeup"}'
```

Windows/PowerShell에서는 `--json` 인라인 대신 `--input <파일>`을 권장한다. 한글과 따옴표가 섞인 JSON을 인라인으로 넘기면 셸 이스케이프 문제가 나기 쉬운데, `--input`은 이 문제를 아예 피해간다.

첫 렌더/still 실행 시 헤드리스 Chrome 바이너리(~200MB)가 자동으로 한 번 다운로드된다. 몇 분 걸릴 수 있다.

## Cloudinary 업로드

렌더가 끝나면 결과 mp4를 Cloudinary(unsigned upload preset)에 자동 업로드하고, 공개 재생 URL을 받아온다. Threads Graph API의 `video_url` 파라미터는 공개 접근 가능한 URL을 요구하기 때문 — 로컬 파일 경로로는 게시할 수 없다. `.env`에 `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_UPLOAD_PRESET`이 없으면 렌더를 시도하지 않고 즉시 에러로 종료한다 (기존 이미지 파이프라인인 `scripts/lib/cloudinary.js`와 같은 Cloudinary 계정/프리셋을 그대로 재사용하면 된다).

로컬 mp4는 업로드 후에도 `out/`에 그대로 남는다 (디버깅용, git에는 커밋 안 됨).

성공 시 stdout에 Cloudinary 공개 URL이 한 줄 출력된다 (n8n Execute Command 노드에서 `video_url`로 그대로 사용). 실패 시 exit code 1과 함께 사람이 읽을 수 있는 에러 메시지가 stderr에 출력된다.

## 테스트

```bash
npm test
```
