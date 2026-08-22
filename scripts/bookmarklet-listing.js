/**
 * 쿠팡 목록 페이지 다건 수집 북마클릿 (소스)
 *
 * bookmarklet.js(단일 상품용)의 목록 페이지 버전. 여러 상품 카드를 한번에 드래그 선택하면
 * 텍스트뿐 아니라 선택 영역 안의 상품 상세 URL(`/vp/products/...`)도 순서대로 같이 담아
 * 클립보드에 JSON으로 복사한다 - 드래그 선택만으로는 텍스트만 잡히고 링크(URL)는 못 잡히기
 * 때문에 필요함(URL은 화면에 보이는 텍스트가 아니라 <a href> 속성이라 Ctrl+C로 안 딸려옴).
 *
 * 사용법: 압축된 javascript: 한 줄을 브라우저 북마크 바에 "쿠팡 목록 수집"이라는 이름으로
 * 등록한다 (scripts/README.md에 압축된 한 줄 있음 - 복사해서 새 북마크 URL에 붙여넣으면 됨).
 *
 * 사용 순서:
 * 1. 쿠팡 목록 페이지에서 상품 카드 여러 개를 마우스로 드래그해 선택
 * 2. 북마크 바의 "쿠팡 목록 수집" 클릭 → 텍스트+URL이 JSON으로 클립보드에 복사됨
 * 3. collect.html(또는 npm run collect)에 붙여넣고 미리보기
 *
 * 자동화 클릭/탐색이 아니라 사람이 직접 선택+클릭하는 것이라 쿠팡 WAF와 무관하다.
 */
(function () {
  var sel = window.getSelection();
  var text = sel.toString().trim();
  if (!sel.rangeCount || !text) {
    alert('먼저 상품 목록을 마우스로 드래그해 선택한 후 다시 클릭하세요.');
    return;
  }

  // ponytail: 선택 범위를 복제해서 그 안의 상품 링크만 추출 - 선택 밖 링크는 안 잡힘.
  var frag = sel.getRangeAt(0).cloneContents();
  var anchors = frag.querySelectorAll('a[href*="/vp/products/"]');
  var seen = {};
  var urls = [];
  for (var i = 0; i < anchors.length; i++) {
    var href = anchors[i].getAttribute('href') || '';
    if (href.indexOf('http') !== 0) href = location.origin + href;
    if (href && !seen[href]) {
      seen[href] = true;
      urls.push(href);
    }
  }

  var payload = JSON.stringify({ raw: text, urls: urls });

  navigator.clipboard.writeText(payload).then(
    function () {
      alert('복사됨! (상품 URL ' + urls.length + '개 포함) collect 페이지로 돌아가 붙여넣으세요.');
    },
    function () {
      alert('클립보드 복사 실패 - 브라우저 권한을 확인하세요.');
    },
  );
})();
