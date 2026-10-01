import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse, cleanCaption, isValidCaption, fallbackCaption } from './nvidia-hook.js';

test('프롬프트에 상품명/설명과 한 줄 캡션 JSON 지시가 들어간다', () => {
  const p = buildNvidiaPrompt('테스트 상품명', '테스트 상품 설명');
  assert.ok(p.includes('테스트 상품명') && p.includes('테스트 상품 설명') && p.includes('"caption"'));
});

test('요청 바디: 같은 모델, 짧은 max_tokens', () => {
  const b = buildNvidiaRequestBody('제목', '설명');
  assert.equal(b.model, 'nvidia/nemotron-3-ultra-550b-a55b');
  assert.equal(b.max_tokens, 300);
  assert.ok(b.messages[1].content.includes('제목'));
});

test('parseNvidiaResponse: 앞뒤 설명이 있어도 caption 추출 + 이모지/줄바꿈 정리', () => {
  const r = parseNvidiaResponse({ choices: [{ message: { content: '결과:\n{"caption": "약통 때문에 가방 무거웠던 적 있지? 🤔\n"}' } }] });
  assert.equal(r.caption, '약통 때문에 가방 무거웠던 적 있지?');
});

test('parseNvidiaResponse: 내용 없음/JSON 아님/caption 없음은 명확한 에러', () => {
  assert.throws(() => parseNvidiaResponse({ choices: [] }), /텍스트를 찾을 수 없습니다/);
  assert.throws(() => parseNvidiaResponse({ choices: [{ message: { content: 'JSON 아님' } }] }), /유효한 JSON이 아닙니다/);
  assert.throws(() => parseNvidiaResponse({ choices: [{ message: { content: '{"post_text":"x"}' } }] }), /caption을 추출하지 못했습니다/);
});

test('isValidCaption: 길이, 말줄임, 금지어 검사', () => {
  assert.ok(isValidCaption('이어폰 줄 엉킬 때마다 짜증났지?'));
  assert.ok(!isValidCaption('가'.repeat(29)));
  assert.ok(!isValidCaption('이거 아직 모르는 사람 많을걸…'));
  assert.ok(!isValidCaption('너는 어떻게 생각해?'));
  assert.ok(isValidCaption('너무 편하다던데 써봤어?') === true);
  assert.ok(!isValidCaption('써보니 진짜 좋더라'));
});

test('fallbackCaption: 첫 문장만, 길면 단어 경계에서 자름', () => {
  assert.equal(fallbackCaption('짧은 질문이야? 그리고 뒤에 말이 더 있음'), '짧은 질문이야?');
  const out = fallbackCaption('이것은 아주 아주 길어서 한 줄에 도저히 들어가지 않는 정말 긴 자막 문장입니다 계속 이어짐');
  assert.ok(Array.from(out).length <= 28 && !out.endsWith(' '));
});

test('cleanCaption: 이모지/따옴표 제거', () => {
  assert.equal(cleanCaption('"안녕 😊 반가워"'), '안녕 반가워');
});
