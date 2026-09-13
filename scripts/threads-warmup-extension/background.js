// 자동 다음 프로필 열기: 익스텐션이 연 탭을 사람이 닫으면(=다 봤다는 뜻) 랜덤 지연 후
// 큐의 다음 계정을 자동으로 새 탭에 연다. 팔로우/댓글 실행은 여기서 절대 하지 않음 - 탭 여는 것까지만.

// 툴바 아이콘 클릭 시 팝업 대신 사이드패널 열기 (다른 곳 클릭해도 안 닫힘)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error(e));

const QUEUE_KEY = 'threadsWarmupQueue';
const AUTO_OPEN_KEY = 'threadsWarmupAutoOpen';
const OPENED_TABS_KEY = 'threadsWarmupOpenedTabs'; // { [tabId]: handle }
const OPEN_COUNT_KEY = 'threadsWarmupOpenCount'; // { date, count }
const DAILY_OPEN_CAP = 40;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function randomDelayMs() {
  return 3000 + Math.floor(Math.random() * 5000); // 3~8초 - 기계적으로 규칙적인 간격 피함
}

function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}
function getSync(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

async function canOpenMore() {
  const data = await getLocal([OPEN_COUNT_KEY]);
  const rec = data[OPEN_COUNT_KEY];
  if (!rec || rec.date !== todayKey()) return true;
  return rec.count < DAILY_OPEN_CAP;
}

async function bumpOpenCount() {
  const data = await getLocal([OPEN_COUNT_KEY]);
  let rec = data[OPEN_COUNT_KEY];
  if (!rec || rec.date !== todayKey()) rec = { date: todayKey(), count: 0 };
  rec.count += 1;
  await setLocal({ [OPEN_COUNT_KEY]: rec });
}

async function openNextFromQueue() {
  const autoOpenData = await getLocal([AUTO_OPEN_KEY]);
  if (!autoOpenData[AUTO_OPEN_KEY]) return;
  if (!(await canOpenMore())) return;

  const queueData = await getSync([QUEUE_KEY]);
  const queue = queueData[QUEUE_KEY] || {};
  const entries = Object.entries(queue);
  if (entries.length === 0) return;
  entries.sort((a, b) => (b[1].priority - a[1].priority) || (a[1].addedAt - b[1].addedAt));
  const [handle] = entries[0];

  const tab = await chrome.tabs.create({ url: `https://www.threads.com/@${handle}`, active: false });
  const openedData = await getLocal([OPENED_TABS_KEY]);
  const opened = openedData[OPENED_TABS_KEY] || {};
  opened[tab.id] = handle;
  await setLocal({ [OPENED_TABS_KEY]: opened });
  await bumpOpenCount();
}

// 팝업에서 "열기" 눌러 수동으로 연 탭도 자동 이어가기 체인에 등록
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'registerOpenedTab' && msg.tabId) {
    getLocal([OPENED_TABS_KEY]).then(async (data) => {
      const opened = data[OPENED_TABS_KEY] || {};
      opened[msg.tabId] = msg.handle;
      await setLocal({ [OPENED_TABS_KEY]: opened });
    });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const openedData = await getLocal([OPENED_TABS_KEY]);
  const opened = openedData[OPENED_TABS_KEY] || {};
  if (!(tabId in opened)) return; // 익스텐션이 연 탭이 아니면 무시
  delete opened[tabId];
  await setLocal({ [OPENED_TABS_KEY]: opened });

  // ponytail: MV3 서비스워커는 idle 시 종료될 수 있어 setTimeout이 드물게 씹힐 수 있음.
  // chrome.alarms는 최소 단위가 1분이라 3~8초 지터에는 못 씀 - 이 기능은 편의 기능이라 감내.
  // 놓치면 다음 탭 닫힘 이벤트에서 다시 시도되므로 치명적이지 않음.
  setTimeout(() => {
    openNextFromQueue();
  }, randomDelayMs());
});
