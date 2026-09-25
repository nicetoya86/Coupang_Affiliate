import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-video-props-'));
  const propsPath = path.join(tmpDir, 'props.json');
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
