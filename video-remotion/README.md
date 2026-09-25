# video-remotion

계정 A 전용 Threads 임팩트 영상 렌더러. 스펙: `docs/superpowers/specs/2026-09-25-remotion-impact-video-design.md`

## 사용법

```bash
npm install
node render.js --input sample-input.json
# 또는: node render.js --json '{"productImageUrl":"...","price":"...","hookText":"...","variant":"jumpcut-closeup"}'
```

성공 시 stdout에 생성된 mp4의 절대경로가 한 줄 출력된다 (n8n Execute Command 노드에서 그대로 사용).
