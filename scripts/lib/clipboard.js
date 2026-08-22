const { execSync } = require('node:child_process');

// ponytail: Windows 전용(사용자 PC가 Windows). 다른 OS에서 돌릴 일 생기면 pbpaste/xclip 분기 추가.
function readClipboardText() {
  try {
    return execSync(
      'powershell -NoProfile -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard"',
      { encoding: 'utf8' },
    ).trim();
  } catch (e) {
    return '';
  }
}

module.exports = { readClipboardText };
