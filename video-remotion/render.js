import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateInput, buildOutputPath } from './render-utils.js';
import { uploadVideoToCloudinary } from './cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const filePath = argv[inputIndex + 1];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  throw new Error('--json <inline JSON> 또는 --input <파일 경로> 중 하나가 필요합니다.');
}

// npx/shell 기동 오버헤드를 피하려고 remotion CLI를 node로 직접 실행한다.
const REMOTION_CLI = path.join(__dirname, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const BUNDLE_DIR = path.join(__dirname, '.bundle');

function newestMtimeMs(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtimeMs(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

// 렌더마다 webpack 번들링(~7초)을 다시 하지 않도록 번들을 캐시한다. src가 바뀌면 자동 재생성.
function ensureBundle() {
  const entry = path.join(__dirname, 'src', 'index.ts');
  const marker = path.join(BUNDLE_DIR, 'index.html');
  if (fs.existsSync(marker) && fs.statSync(marker).mtimeMs > newestMtimeMs(path.join(__dirname, 'src'))) return;
  execFileSync(process.execPath, [REMOTION_CLI, 'bundle', entry, `--out-dir=${BUNDLE_DIR}`], {
    cwd: __dirname,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
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

  const errors = validateInput(input);
  if (errors.length > 0) {
    console.error('입력 검증 실패:\n' + errors.map((e) => '- ' + e).join('\n'));
    process.exit(1);
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    console.error(
      '입력 검증 실패:\n- CLOUDINARY_CLOUD_NAME/CLOUDINARY_UPLOAD_PRESET 환경변수가 필요합니다 (video-remotion/.env 확인, .env.example 참고).'
    );
    process.exit(1);
  }

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = buildOutputPath(outDir, input.productImageUrl, input.variant);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-video-props-'));
  const propsPath = path.join(tmpDir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(input), 'utf8');

  try {
    ensureBundle();
    // 측정(4코어): 25.5s -> 11.9s. crf 23/veryfast는 정지 이미지 위주라 화질 손실 거의 없이 파일도 3.5MB -> 1MB.
    execFileSync(
      process.execPath,
      [
        REMOTION_CLI, 'render', BUNDLE_DIR, input.variant, outputPath, `--props=${propsPath}`,
        `--concurrency=${os.cpus().length}`, '--x264-preset=veryfast', '--crf=23',
      ],
      { cwd: __dirname, stdio: ['ignore', 'pipe', 'inherit'] }
    );
  } catch (e) {
    console.error('Remotion 렌더링 실패: ' + e.message);
    process.exit(1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  try {
    const videoBuffer = fs.readFileSync(outputPath);
    const videoUrl = await uploadVideoToCloudinary(videoBuffer, cloudName, uploadPreset);
    console.log(videoUrl);
  } catch (e) {
    console.error('Cloudinary 업로드 실패: ' + e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
