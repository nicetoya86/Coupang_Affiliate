# video-remotion

계정 A 전용 Threads 임팩트 영상 렌더러. 스펙: `docs/superpowers/specs/2026-09-25-remotion-impact-video-design.md`

## 사용법

```bash
npm install
node render.js --input sample-input.json
# 또는: node render.js --json '{"productImageUrl":"...","price":"...","hookText":"...","variant":"jumpcut-closeup"}'
```

Windows/PowerShell에서는 `--json` 인라인 대신 `--input <파일>`을 권장한다. 한글과 따옴표가 섞인 JSON을 인라인으로 넘기면 셸 이스케이프 문제가 나기 쉬운데, `--input`은 이 문제를 아예 피해간다.

첫 렌더/still 실행 시 헤드리스 Chrome 바이너리(~200MB)가 자동으로 한 번 다운로드된다. 몇 분 걸릴 수 있다.

성공 시 stdout에 생성된 mp4의 절대경로가 한 줄 출력된다 (n8n Execute Command 노드에서 그대로 사용). 실패 시 exit code 1과 함께 사람이 읽을 수 있는 에러 메시지가 stderr에 출력된다.

## 테스트

```bash
npm test
```
