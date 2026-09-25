import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateHookText } from './nvidia-hook.js';
import { createSheetsClient, findReadyRow, writeVideoUrl } from './sheet-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 60; // 30초 * 60 = 30분

function loadEnvIfPresent() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export function parseArgs(argv) {
  const jsonIndex = argv.indexOf('--json');
  if (jsonIndex !== -1) {
    return JSON.parse(argv[jsonIndex + 1]);
  }
  const inputIndex = argv.indexOf('--input');
  if (inputIndex !== -1) {
    return JSON.parse(fs.readFileSync(argv[inputIndex + 1], 'utf8'));
  }
  throw new Error('--json <inline JSON> 또는 --input <파일 경로> 중 하나가 필요합니다.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForReadyRow(sheets, spreadsheetId, sheetName, productTitle, {
  intervalMs = POLL_INTERVAL_MS,
  maxAttempts = POLL_MAX_ATTEMPTS,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const found = await findReadyRow(sheets, spreadsheetId, sheetName, productTitle);
    if (found) return found;
    console.log(`[${attempt}/${maxAttempts}] "${productTitle}" 제휴링크 대기 중...`);
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return null;
}

async function main() {
  loadEnvIfPresent();

  const argv = process.argv.slice(2);
  let input;
  try {
    input = parseArgs(argv);
  } catch (e) {
    console.error('입력 파싱 실패: ' + e.message);
    process.exit(1);
  }

  if (!input.productTitle || !input.imageUrl) {
    console.error('입력 검증 실패: productTitle과 imageUrl은 필수입니다.');
    process.exit(1);
  }

  const nvidiaApiKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaApiKey) {
    console.error('입력 검증 실패: NVIDIA_API_KEY 환경변수가 필요합니다 (video-remotion/.env 확인).');
    process.exit(1);
  }

  console.log(`[${input.productTitle}] 훅 문구 생성 중...`);
  let hookText;
  try {
    hookText = await generateHookText(input.productTitle, input.productDesc || input.productTitle, nvidiaApiKey);
  } catch (e) {
    console.error('훅 문구 생성 실패: ' + e.message);
    process.exit(1);
  }
  console.log(`[${input.productTitle}] 훅 문구: ${hookText}`);

  console.log(`[${input.productTitle}] 영상 렌더링 중...`);
  let videoUrl;
  try {
    const renderInput = JSON.stringify({
      productImageUrl: input.imageUrl,
      price: input.price || '',
      hookText,
      variant: 'jumpcut-closeup',
    });
    videoUrl = execFileSync(process.execPath, ['render.js', '--json', renderInput], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    console.error('영상 렌더링/업로드 실패: ' + (e.stderr || e.message));
    process.exit(1);
  }
  console.log(`[${input.productTitle}] 영상 URL: ${videoUrl}`);

  let sheets;
  try {
    sheets = createSheetsClient(path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE));
  } catch (e) {
    console.error('구글시트 인증 실패: ' + e.message);
    process.exit(1);
  }
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || '시트1';

  // rowNumber를 이미 알고 있으면(collect-server.js가 방금 추가한 행 번호를 넘겨준 경우)
  // 제휴링크를 기다릴 필요 없이 바로 그 행에 기록한다 — 시트 등록 시점에 video_url까지 채워짐.
  // rowNumber가 없으면(수동 복구 실행 등) 예전처럼 제휴링크가 채워질 때까지 폴링한다.
  const targetRowNumber = input.rowNumber;

  if (targetRowNumber) {
    try {
      await writeVideoUrl(sheets, spreadsheetId, sheetName, targetRowNumber, videoUrl);
    } catch (e) {
      console.error(`[${input.productTitle}] video_url 기록 실패: ${e.message}. 렌더링된 영상: ${videoUrl}, 대상 행: ${targetRowNumber}`);
      process.exit(1);
    }
    console.log(`[${input.productTitle}] 완료: ${targetRowNumber}행에 video_url 기록함 (즉시 기록).`);
    return;
  }

  console.log(`[${input.productTitle}] rowNumber 없음 — 제휴링크 대기 모드로 전환 (최대 30분)...`);
  let ready;
  try {
    ready = await pollForReadyRow(sheets, spreadsheetId, sheetName, input.productTitle);
  } catch (e) {
    console.error(`[${input.productTitle}] 시트 조회 실패: ${e.message}. 영상은 이미 업로드됨: ${videoUrl}`);
    process.exit(1);
  }
  if (!ready) {
    console.error(`[${input.productTitle}] 30분 동안 제휴링크가 채워지지 않았습니다. video_url을 시트에 기록하지 못했습니다: ${videoUrl}`);
    process.exit(1);
  }

  try {
    await writeVideoUrl(sheets, spreadsheetId, sheetName, ready.rowNumber, videoUrl);
  } catch (e) {
    console.error(`[${input.productTitle}] video_url 기록 실패: ${e.message}. 렌더링된 영상: ${videoUrl}, 대상 행: ${ready.rowNumber}`);
    process.exit(1);
  }
  console.log(`[${input.productTitle}] 완료: ${ready.rowNumber}행에 video_url 기록함.`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
