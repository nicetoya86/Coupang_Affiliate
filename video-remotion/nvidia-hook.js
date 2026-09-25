function buildNvidiaPrompt(productTitle, productDesc) {
  return `다음 쿠팡 상품 정보를 바탕으로 스레드(Threads)에 올릴 후킹형 게시물 본문을 작성해줘.

[중요] 경제적 이해관계 표시 문구("이 게시물은 쿠팡 파트너스...")는 네가 쓰지 마. 그 문구는 별도 시스템이 게시물 맨 앞에 자동으로 붙인다. 너는 오직 후킹 본문만 작성한다.

[톤앤매너 - 가장 중요]
1. 반드시 반말로 작성할 것. 단, 무례하거나 건방지게 들리지 않고 친한 친구에게 다정하게 알려주듯 부드럽고 다정한 반말 톤으로 쓸 것 (하대하는 명령조 금지)
2. 광고 카피처럼 상품을 나열식으로 설명하지 말고, 친한 친구/지인한테만 살짝 귀홍해주는 듯한 편안한 대화체로 쓸 것 (예시: "있지,", "나만 알기 아깝워서 알려주는거든", "이거 아직 모르는 사람 많을걸" 같은 친밀한 표현 활용)
3. [매우 중요] 첫 문장을 문맥 없이 뜬금없는 감탄사나 표현(예: "역시나", "그거 알아?" 단독 사용 등)으로 시작하지 말 것. 대신 상대방이 공감할 만한 구체적인 상황이나 질문으로 자연스럽게 시작할 것 (예시: "~할 때마다 불편했던 적 있지?", "~때마다 귀찮았던 거 있지 않아?")
3-1. [스레드 알고리즘 대응 - 첫 줄이 가장 중요] 첫 문장은 가능한 한 물음표로 끝나는 질문형으로 작성할 것. 스레드 알고리즘은 첫 줄에서 스크롤을 멈추는 비율을 가장 먼저 보기 때문에, 공감형 상황 제시 + 질문형 어미 조합을 최우선으로 할 것.
3-2. [다양성 - 반복 패턴 회피] 도입부는 아래 5가지 패턴 중 매번 무작위로 하나를 골라 쓸 것 (같은 패턴을 연달아 반복하지 말 것):
   - 상황 공감형: "~할 때마다 ~했던 적 있지?"
   - 대비/반전형: "~인 줄 알았는데 아니었대"
   - 직접 질문형: "~ 어떻게 해결해?" / "~ 어떻게 골라?"
   - 손해회피 질문형: "~하면 손해 보는 거 아는 사람 있어?"
   - 반전 코멘트형: "가격 보고 두 번 확인함" 처럼 질문형이 아닌 짧고 임팩트 있는 리액션 한 줄로 시작 (감탄사 단독 사용 금지 규칙과는 별개로, 구체적 반응이라 허용됨)
4. [매우 중요] 절대 1인칭으로 상품을 직접 체험한 것처럼 단정하지 말 것. 아래 표현은 절대 사용 금지:
   - "~써보니", "~써봐는데", "~써본 결과", "~사용해보니" (직접 체험 단정)
   - "~하더라", "~하더라고" (회상형 어미 - 직접 목격/경험했다는 뉴앙스라 마찬가지로 금지)
   대신 "~하대", "~한다던데", "~하다던데" 같은 전언(hearsay)형 표현이나, "이런 고민 있지 않았어?", "~한 사람 많을걸" 같은 공감형/추측형 표현만 사용할 것
5. "나만 모르면 손해 볼 것 같은" 느낌을 주는 후킹 요소를 포함할 것
5-1. [선택 - 가격 힌트] 구체적인 가격 숫자는 언급하지 말되, "가격 보고 좀 놀람다던데", "생각보다 부담 없다던데" 같은 hearsay형 상대적 가성비 힌트를 자연스럽게 1개 포함하면 좋음 (필수는 아님, 문맥에 안 맞으면 생략할 것)

[작성 규칙]
6. 제휴 링크 상품에 대한 관심을 자연스럽게 유도하는 내용으로 작성할 것. 상품명이나 핵심 기능/장점은 숨기지 말고 자연스럽게 드러낼 것 — 정체를 의도적으로 숨기는 클릭베이트 방식은 스레드 알고리즘이 노출 억제 대상으로 분류할 위험이 있으므로 쓰지 말 것.
6-1. 대신 "이런 상황에 이게 왜 좋은지", "어떤 점이 편한지" 같은 공감 포인트로 흥미를 끌 것 (정체 은폐가 아니라 공감/후킹으로 관심 유도).
6-2. [필수] 마지막 문장은 읽는 사람의 진짜 의견이나 비슷한 경험을 묻는 질문형 한 문장으로 작성할 것 (예: 비슷한 고민 있었는지, 어떻게 해결했는지, 써본 적 있는지 등 직접적인 질문). "팔로우해줘", "팔로우 해두면 편함" 같은 팔로우 언급이나 "구매는 댓글 링크 클릭" 같은 직접적 상업적 문구는 절대 쓰지 말 것 — 팔로우 유도나 상업적 문구는 스레드 알고리즘이 follow-bait·광고성 콘텐츠로 감지해 노출을 억제함. 매번 다른 질문으로 자연스럽게 쓸 것 (특정 예문을 그대로 반복하지 말 것).
7. "최고", "최저가", "1등", "무조건" 등 객관적으로 입증하기 어려운 과장 표현은 쓰지 말 것
8. 문장이 자연스럽고 문법적으로 말이 되도록 작성할 것 (어색하거나 의미가 불분명한 표현 금지). 반드시 완결된 문장으로 끝낼 것 (문장이 중간에 끊기지 않도록 주의)
9. [필수 - 스크롤 후킹 구조 및 이모지] 본문을 줄바꿈으로 구분된 3줄 구조로 작성할 것 — ①훅 문장 ②공감/정보 문장 ③마지막 질문 문장. 각 줄 끝마다 이모지를 정확히 1개씩, 총 3개 배치할 것 (한 줄에 몰아 쓰지 말 것). 이모지는 그 줄의 감정·상황에 맞는 것으로 줄마다 다르게 고를 것 (예: 공감/놀람/궁금 계열). 하트·별 등 의미 없는 장식성 이모지 반복 남발 금지. 짧은 줄 + 줄마다 다른 이모지로 피드를 스크롤하는 사용자의 시선이 멈추도록 시각적 리듬을 만들 것
10. 전체 내용은 공백 포함 330바이트 이내로 작성할 것 (한글 기준 약 95~105자, 이모지 3개·줄바꿈 2개 포함해서 계산)
11. [필수] 응답은 오직 JSON 객체 하나만 출력할 것. 사고 과정, 풀이 설명, 코드블록 표시(백틱) 등 그 어떤 부가 텍스트도 절대 출력하지 말 것. 첫 글자부터 반드시 { 로 시작해야 함:
{"post_text": "여기에 후킹 본문만, 경제적 이해관계 문구는 절대 포함하지 않음", "topic_tag": "이 상품을 대표하는 카테고리 단어 1개 (예: 청소, 주방, 뷰티, 인테리어 등). 반드시 띄어쓰기·마침표·특수문자 없이 한글 또는 영문 단어 하나로, #은 붙이지 말 것"}

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
    max_tokens: 900,
    temperature: 0.9,
    chat_template_kwargs: { enable_thinking: false },
  };
}

function sanitizeTopicTag(raw) {
  if (!raw) return '생활꿀템';
  let t = String(raw).trim().replace(/^#/, '').replace(/[\s.&]/g, '');
  if (!t) return '생활꿀템';
  return t.slice(0, 50);
}

function parseNvidiaResponse(aiResponse) {
  const messageContent = aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message
    ? aiResponse.choices[0].message.content
    : null;
  const finishReason = aiResponse.choices && aiResponse.choices[0] ? aiResponse.choices[0].finish_reason : null;

  if (!messageContent) {
    throw new Error('NVIDIA API 응답에서 텍스트를 찾을 수 없습니다. 응답: ' + JSON.stringify(aiResponse));
  }

  let jsonSlice = messageContent.trim();
  const firstBrace = jsonSlice.indexOf('{');
  const lastBrace = jsonSlice.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonSlice = jsonSlice.slice(firstBrace, lastBrace + 1);
  }

  jsonSlice = jsonSlice.replace(/\\\s+([nrtbf"\\/])/g, '\\\\$1');
  jsonSlice = jsonSlice.replace(/\\(?!["\\/bfnrtu])/g, '');

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error('NVIDIA 응답이 유효한 JSON이 아닙니다 (finish_reason=' + finishReason + '). 원문(300자): ' + messageContent.slice(0, 300));
  }

  if (!parsed.post_text) {
    throw new Error('post_text를 추출하지 못했습니다. 원문: ' + jsonSlice.slice(0, 300));
  }

  return { postText: parsed.post_text, topicTag: sanitizeTopicTag(parsed.topic_tag) };
}

async function generateHookText(productTitle, productDesc, apiKey) {
  const body = buildNvidiaRequestBody(productTitle, productDesc);
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error('NVIDIA API 호출 실패 (' + res.status + '): ' + JSON.stringify(json));
  }
  const { postText } = parseNvidiaResponse(json);
  return postText;
}

export { buildNvidiaPrompt, buildNvidiaRequestBody, parseNvidiaResponse, generateHookText };
