import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse } from './nvidia-hook.js';

test('buildNvidiaPrompt embeds product title and description', () => {
  const prompt = buildNvidiaPrompt('테스트 상품명', '테스트 상품 설명');
  assert.ok(prompt.includes('테스트 상품명'));
  assert.ok(prompt.includes('테스트 상품 설명'));
  assert.ok(prompt.includes('JSON'));
});

test('buildNvidiaRequestBody uses the same model/params as the n8n prompt node', () => {
  const body = buildNvidiaRequestBody('제목', '설명');
  assert.equal(body.model, 'nvidia/nemotron-3-ultra-550b-a55b');
  assert.equal(body.max_tokens, 900);
  assert.equal(body.temperature, 0.9);
  assert.equal(body.messages[1].role, 'user');
  assert.ok(body.messages[1].content.includes('제목'));
});

test('parseNvidiaResponse extracts post_text and topic_tag from a clean JSON response', () => {
  const aiResponse = {
    choices: [{ message: { content: '{"post_text": "훅 문구 예시", "topic_tag": "생활"}' }, finish_reason: 'stop' }],
  };
  const result = parseNvidiaResponse(aiResponse);
  assert.equal(result.postText, '훅 문구 예시');
  assert.equal(result.topicTag, '생활');
});

test('parseNvidiaResponse strips a leading explanation before the JSON object', () => {
  const aiResponse = {
    choices: [{ message: { content: '여기 결과입니다:\n{"post_text": "정리된 훅", "topic_tag": "주방"}' }, finish_reason: 'stop' }],
  };
  const result = parseNvidiaResponse(aiResponse);
  assert.equal(result.postText, '정리된 훅');
});

test('parseNvidiaResponse throws a clear error when no message content exists', () => {
  const aiResponse = { choices: [] };
  assert.throws(() => parseNvidiaResponse(aiResponse), /텍스트를 찾을 수 없습니다/);
});

test('parseNvidiaResponse throws a clear error when the content is not valid JSON', () => {
  const aiResponse = { choices: [{ message: { content: '이건 JSON이 아님' }, finish_reason: 'stop' }] };
  assert.throws(() => parseNvidiaResponse(aiResponse), /유효한 JSON이 아닙니다/);
});
