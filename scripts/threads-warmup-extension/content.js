// 지금 보고 있는 Threads 페이지에서 계정 프로필 링크(/@handle)만 긁어서
// 큐에 쌓아둔다. 팔로우/댓글 등 실제 액션은 절대 하지 않음 - 사람이 직접 클릭.
(function () {
  const SELF_HANDLES = ['daily.pick.diary'];
  const QUEUE_KEY = 'threadsWarmupQueue';
  const DONE_KEY = 'threadsWarmupDone';
  const MAX_QUEUE = 100; // sync storage 8KB/아이템 한도 대비 안전선

  // ponytail: Threads엔 공식 카테고리 필드가 없음. 링크 주변 텍스트(바이오/소개)에
  // 카테고리 키워드가 보이는지로 근사 판정. 답글 목록처럼 바이오가 안 보이는 곳에선
  // 매칭 안 될 수 있음 - 한계 있는 휴리스틱. 정확도 필요하면 프로필 페이지 방문 후
  // 판정하는 방식으로 승급.
  const ALLOWED_CATEGORY_KEYWORDS = ['쇼핑', '라이프스타일', '상품', '제품', 'shopping', 'lifestyle', 'product'];

  function nearbyText(anchor) {
    const post = anchor.closest('article, [role="article"]');
    if (post) return post.innerText || '';
    // article 컨테이너 못 찾으면 텍스트 좀 모일 때까지 위로 올라감 (게시글 본문 캡션까지 닿게)
    let el = anchor;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      el = el.parentElement;
      if ((el.innerText || '').length > 30) break;
    }
    return el.innerText || '';
  }

  function matchesAllowedCategory(anchor) {
    const text = nearbyText(anchor).toLowerCase();
    return ALLOWED_CATEGORY_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  }

  function extractHandle(href) {
    try {
      const url = new URL(href, location.origin);
      if (!/threads\.(net|com)$/.test(url.hostname.replace(/^www\./, ''))) return null;
      const m = url.pathname.match(/^\/@([a-zA-Z0-9._]+)\/?$/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  // ponytail: 진짜 "누가 댓글 달았는지"는 공식 API 없이는 정확히 못 가림.
  // 대신 지금 보는 페이지 성격으로 근사치를 매김:
  // 내 게시물 상세(답글 목록) 페이지에서 스캔된 계정 = 반응자일 확률 높음 (우선순위 최고)
  // 검색 결과 페이지 = 관심사 겹치는 계정 (중간)
  // 그 외 일반 브라우징 = 그냥 발견 (낮음)
  function currentSourceInfo() {
    const path = location.pathname;
    const isOwnPost = SELF_HANDLES.some((h) => path.startsWith(`/@${h}/post/`));
    if (isOwnPost) return { source: 'replied', priority: 3 };
    if (path.startsWith('/search')) return { source: 'topic', priority: 2 };
    return { source: 'browse', priority: 1 };
  }

  function scan() {
    const handles = new Set();
    let candidateCount = 0;
    document.querySelectorAll('a[href*="/@"]').forEach((a) => {
      const h = extractHandle(a.getAttribute('href'));
      if (!h || SELF_HANDLES.includes(h)) return;
      candidateCount++;
      if (matchesAllowedCategory(a)) handles.add(h);
    });
    console.debug(`[웜업 필터] 후보 링크 ${candidateCount}개 중 ${handles.size}개 매칭`);
    if (handles.size === 0) return;

    const { source, priority } = currentSourceInfo();

    chrome.storage.sync.get([QUEUE_KEY], (syncData) => {
      chrome.storage.local.get([DONE_KEY], (localData) => {
        const queue = syncData[QUEUE_KEY] || {};
        const done = localData[DONE_KEY] || {};
        let changed = false;

        handles.forEach((h) => {
          if (done[h]) return;
          const existing = queue[h];
          if (!existing) {
            queue[h] = { addedAt: Date.now(), source, priority };
            changed = true;
          } else if (priority > (existing.priority || 1)) {
            existing.priority = priority;
            existing.source = source;
            changed = true;
          }
        });
        if (!changed) return;

        // 커밋 직전에 done 다시 확인 (팝업에서 방금 완료 처리한 계정이 옛 스냅샷 때문에
        // 큐에 되살아나는 경쟁 상태 방지)
        chrome.storage.local.get([DONE_KEY], (freshLocalData) => {
          const freshDone = freshLocalData[DONE_KEY] || {};
          Object.keys(queue).forEach((h) => {
            if (freshDone[h]) delete queue[h];
          });

          let entries = Object.entries(queue);
          if (entries.length > MAX_QUEUE) {
            entries.sort((a, b) => (b[1].priority - a[1].priority) || (b[1].addedAt - a[1].addedAt));
            entries = entries.slice(0, MAX_QUEUE);
          }
          chrome.storage.sync.set({ [QUEUE_KEY]: Object.fromEntries(entries) });
        });
      });
    });
  }

  // Threads는 SPA + 무한스크롤이라 DOM이 계속 바뀜 -> 변화 감지해서 재스캔
  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
