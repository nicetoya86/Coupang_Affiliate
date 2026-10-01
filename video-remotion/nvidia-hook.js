// 영상 자막용 한 줄 훅 생성. 게시물 본문(n8n 'NVIDIA 요청 만들기')과 달리 짧은 한 문장만 만든다.
const MAX_CAPTION_CHARS = 28;
const MAX_ATTEMPTS = 3;
const EMOJI_RE = /[\p{Extended_Pictographic}️‍]/gu;
const BANNED_RE = /(^|\s)너(는|가|도|를|한테|랑)?(\s|$)|써보니|사용해보니|하더라/;

function buildNvidiaPrompt(productTitle, productDesc) {
  return `다음 쿠팡 상품을 소개하는 짧은 영상의 "자막 한 줄"을 써줘. 스크롤하던 사람이 첫 0.5초에 멈추게 만드는 문장이어야 해.

[규칙]
1. 한국어 반말, 친구한테 말하듯 다정하게. 공백 포함 ${MAX_CAPTION_CHARS}자 이내의 문장 딱 하나. 반드시 완결된 문장으로 끝낼 것(말줄임표 금지).
2. 상황 공감 질문("~할 때마다 ~했던 적 있지?"), 손해회피 질문, 짧은 반전 리액션 중 하나로. 물음표로 끝나는 질문형을 우선.
3. 이모지, 해시태그, 따옴표 금지.
4. '너'라는 표현 금지(필요하면 '스치니'). 직접 써봤다는 단정("써보니", "사용해보니", "~하더라") 금지. 가격 숫자, "최고/최저가/1등/무조건" 금지.
5. 상품명이나 핵심 쓰임새는 숨기지 말고 자연스럽게 드러낼 것.
6. 응답은 JSON 객체 하나만, 첫 글자부터 { 로 시작: {"caption": "자막 한 줄"}

[상품명]
${productTitle}

[상품 설명]
${productDesc}`;
}

function buildNvidiaRequestBody(productTitle, productDesc) {
  return {
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    messages: [
      { role: 'system', content: 'detailed thinking off. Never output reasoning, explanation, or markdown code fences. Output must start with { and be valid JSON only.' },
      { role: 'user', content: buildNvidiaPrompt(productTitle, productDesc) },
    ],
    max_tokens: 300,
    temperature: 0.9,
    chat_template_kwargs: { enable_thinking: false },
  };
}

// 이모지/따옴표/줄바꿈을 정리해 한 줄로 만든다.
function cleanCaption(raw) {
  return String(raw || '')
    .replace(EMOJI_RE, '')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCaption(caption) {
  return !!caption && Array.from(caption).length <= MAX_CAPTION_CHARS && !/…|\.{3}$/.test(caption) && !BANNED_RE.test(caption);
}

// 마지막 수단: 첫 문장(?, !, . 기준)만 쓰고, 그래도 길면 단어 경계에서 자른다.
function fallbackCaption(caption) {
  const first = (caption.match(/^.*?[?!.](?=\s|$)/) || [caption])[0].trim();
  const chars = Array.from(first);
  if (chars.length <= MAX_CAPTION_CHARS) return first;
  const cut = chars.slice(0, MAX_CAPTION_CHARS).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trim();
}

function parseNvidiaResponse(aiResponse) {
  const choice = aiResponse.choices && aiResponse.choices[0];
  const content = choice && choice.message ? choice.message.content : null;
  if (!content) {
    throw new Error('NVIDIA API 응답에서 텍스트를 찾을 수 없습니다. 응답: ' + JSON.stringify(aiResponse));
  }
  let slice = content.trim();
  const a = slice.indexOf('{');
  const b = slice.lastIndexOf('}');
  if (a !== -1 && b > a) slice = slice.slice(a, b + 1);
  slice = slice.replace(/[\r\n\t]+/g, ' '); // raw newline in model string
  let parsed;
  try {
    parsed = JSON.parse(slice);
  } catch (e) {
    throw new Error('NVIDIA 응답이 유효한 JSON이 아닙니다 (finish_reason=' + choice.finish_reason + '). 원문(300자): ' + content.slice(0, 300));
  }
  if (!parsed.caption) {
    throw new Error('caption을 추출하지 못했습니다. 원문: ' + slice.slice(0, 300));
  }
  return { caption: cleanCaption(parsed.caption) };
}

async function requestCaption(productTitle, productDesc, apiKey) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildNvidiaRequestBody(productTitle, productDesc)),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error('NVIDIA API 호출 실패 (' + res.status + '): ' + JSON.stringify(json));
  }
  return parseNvidiaResponse(json).caption;
}

// 규칙(길이/금지어)을 어기면 재요청하고, 끝까지 어기면 첫 문장 폴백. 금지어가 남으면 에러.
async function generateHookText(productTitle, productDesc, apiKey) {
  let last = '';
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      last = await requestCaption(productTitle, productDesc, apiKey);
    } catch (e) {
      if (i === MAX_ATTEMPTS - 1) throw e; // 503 등 일시 오류는 재시도
      continue;
    }
    if (isValidCaption(last)) return last;
  }
  const fb = fallbackCaption(last);
  if (!fb || BANNED_RE.test(fb)) {
    throw new Error('자막 생성 규칙을 만족하는 결과를 얻지 못했습니다: ' + last);
  }
  return fb;
}

export { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse, cleanCaption, isValidCaption, fallbackCaption, generateHookText, MAX_CAPTION_CHARS };
