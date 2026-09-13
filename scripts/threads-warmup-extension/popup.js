const QUEUE_KEY = 'threadsWarmupQueue';
const DONE_KEY = 'threadsWarmupDone';
const COUNTS_KEY = 'threadsWarmupCounts';
const AUTO_OPEN_KEY = 'threadsWarmupAutoOpen';

const SOURCE_ICON = { replied: '💬', topic: '🏷️', browse: '' };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadCounts(cb) {
  chrome.storage.local.get([COUNTS_KEY], (data) => {
    const counts = data[COUNTS_KEY] || {};
    if (counts.date !== todayKey()) {
      counts.date = todayKey();
      counts.follow = 0;
      counts.comment = 0;
      chrome.storage.local.set({ [COUNTS_KEY]: counts });
    }
    cb(counts);
  });
}

function renderCounts() {
  loadCounts((counts) => {
    document.getElementById('followCount').textContent = counts.follow || 0;
    document.getElementById('commentCount').textContent = counts.comment || 0;
  });
}

function bumpCount(field) {
  loadCounts((counts) => {
    counts[field] = (counts[field] || 0) + 1;
    chrome.storage.local.set({ [COUNTS_KEY]: counts }, renderCounts);
  });
}

function markDone(handle) {
  chrome.storage.sync.get([QUEUE_KEY], (syncData) => {
    chrome.storage.local.get([DONE_KEY], (localData) => {
      const queue = syncData[QUEUE_KEY] || {};
      const done = localData[DONE_KEY] || {};
      delete queue[handle];
      done[handle] = Date.now();
      chrome.storage.sync.set({ [QUEUE_KEY]: queue });
      chrome.storage.local.set({ [DONE_KEY]: done }, () => {
        bumpCount('follow');
        renderQueue();
      });
    });
  });
}

function openHandle(handle) {
  chrome.tabs.create({ url: `https://www.threads.com/@${handle}` }, (tab) => {
    chrome.runtime.sendMessage({ type: 'registerOpenedTab', tabId: tab.id, handle });
  });
}

function renderQueue() {
  chrome.storage.sync.get([QUEUE_KEY], (data) => {
    const queue = data[QUEUE_KEY] || {};
    const list = document.getElementById('queueList');
    list.innerHTML = '';
    // 방어용: content.js 쪽 경쟁 상태로 done인데 큐에 남아있는 경우 화면엔 안 보이게
    chrome.storage.local.get([DONE_KEY], (localData) => {
      const done = localData[DONE_KEY] || {};
      const entries = Object.entries(queue).filter(([h]) => !done[h]);
      renderQueueEntries(entries);
    });
  });
}

function renderQueueEntries(entries) {
    const list = document.getElementById('queueList');
    if (entries.length === 0) {
      list.innerHTML = '<li class="empty">threads.net 둘러보면 자동으로 쌓임</li>';
      return;
    }
    entries.sort((a, b) => (b[1].priority - a[1].priority) || (a[1].addedAt - b[1].addedAt));
    entries.slice(0, 50).forEach(([handle, info]) => {
      const li = document.createElement('li');

      const span = document.createElement('span');
      span.textContent = `${SOURCE_ICON[info.source] || ''} @${handle}`;

      const btnWrap = document.createElement('span');

      const openBtn = document.createElement('button');
      openBtn.className = 'small';
      openBtn.textContent = '열기';
      openBtn.onclick = () => openHandle(handle);

      const doneBtn = document.createElement('button');
      doneBtn.className = 'small';
      doneBtn.textContent = '완료';
      doneBtn.onclick = () => markDone(handle);

      btnWrap.appendChild(openBtn);
      btnWrap.appendChild(doneBtn);
      li.appendChild(span);
      li.appendChild(btnWrap);
      list.appendChild(li);
    });
}

function renderAutoOpen() {
  chrome.storage.local.get([AUTO_OPEN_KEY], (data) => {
    document.getElementById('autoOpenToggle').checked = !!data[AUTO_OPEN_KEY];
  });
}

document.getElementById('commentPlus').onclick = () => bumpCount('comment');
document.getElementById('clearQueue').onclick = () => {
  chrome.storage.sync.set({ [QUEUE_KEY]: {} }, renderQueue);
};
document.getElementById('resetDay').onclick = () => {
  chrome.storage.local.set(
    { [COUNTS_KEY]: { date: todayKey(), follow: 0, comment: 0 } },
    renderCounts
  );
};
document.getElementById('autoOpenToggle').onchange = (e) => {
  chrome.storage.local.set({ [AUTO_OPEN_KEY]: e.target.checked });
};

renderCounts();
renderQueue();
renderAutoOpen();
