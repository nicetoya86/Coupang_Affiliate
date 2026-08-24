/**
 * 쿠팡 목록 페이지 다건 수집 북마클릿 (소스)
 *
 * bookmarklet.js(단일 상품용)의 목록 페이지 버전. 여러 상품 카드를 한번에 드래그 선택하면
 * 텍스트뿐 아니라 선택 영역 안의 상품 상세 URL(`/vp/products/...`)과 상품 이미지 URL도
 * 순서대로 같이 담아 클립보드에 JSON으로 복사한다 - 드래그 선택만으로는 텍스트만 잡히고
 * 링크/이미지는 못 잡히기 때문에 필요함(URL은 <a href> 속성, 이미지는 <img src> 또는 CSS
 * background-image라 Ctrl+C로 안 딸려옴).
 *
 * 이미지 추출은 클래스명에 "cover_box"가 들어간 요소(실제 확인된 구조:
 * `<div class="styles_cover_box__..." style="background: url(...)">`, 2026-08-25 실제
 * outerHTML로 확정)의 background-image를 라이브 DOM에서 직접 읽는 방식이 기본이다.
 * <img> 태그 스캔은 cover_box를 하나도 못 찾았을 때만 쓰는 최후 폴백이다 (다른 페이지가
 * 실제 <img> 태그로 사진을 넣는 경우 대비) - 처음엔 <img>를 먼저 봤었는데, 목록 페이지의
 * 배송 배지 아이콘(예: "내일 도착" 배지)도 <img>라서 그게 먼저 잡혀 상품 사진 대신
 * 배지 아이콘 URL이 들어가는 실사용 버그가 있었음 (2026-08-25 실제 발견).
 *
 * 드래그 선택은 보통 사진 다음(배지/제목 줄)부터 시작하고 사진 자체는 선택 밖이라, 선택
 * 범위와 "겹치는" cover_box만 모으면 각 카드의 첫 이미지가 통째로 하나씩 밀린다. 그래서
 * 선택과 처음 겹치는 cover_box 바로 앞(문서 순서상 직전)의 cover_box 1개를 자동으로
 * 앞에 끼워 넣어 보정한다 - 카드1 이미지가 카드1 텍스트보다 앞서 나오는 문서 순서를 이용.
 *
 * 사용법: 압축된 javascript: 한 줄을 브라우저 북마크 바에 "쿠팡 목록 수집"이라는 이름으로
 * 등록한다 (scripts/README.md에 압축된 한 줄 있음 - 복사해서 새 북마크 URL에 붙여넣으면 됨).
 *
 * 사용 순서:
 * 1. 쿠팡 목록 페이지에서 상품 카드 여러 개를 마우스로 드래그해 선택
 * 2. 북마크 바의 "쿠팡 목록 수집" 클릭 → 텍스트+URL+이미지가 JSON으로 클립보드에 복사됨
 * 3. collect.html(또는 npm run collect)에 붙여넣고 미리보기
 *
 * 자동화 클릭/탐색이 아니라 사람이 직접 선택+클릭하는 것이라 쿠팡 WAF와 무관하다.
 * ponytail: 카드 개수와 인식된 이미지 개수가 다르면(선택 범위가 카드 경계와 안 맞았거나
 * class명이 바뀐 경우) 뒤쪽 상품부터 이미지가 밀릴 수 있음 - 실제 페이지에서 검증 필요.
 */
(function () {
  var sel = window.getSelection();
  var text = sel.toString().trim();
  if (!sel.rangeCount || !text) {
    alert('먼저 상품 목록을 마우스로 드래그해 선택한 후 다시 클릭하세요.');
    return;
  }
  var range = sel.getRangeAt(0);

  // ponytail: 선택 범위를 복제해서 그 안의 상품 링크만 추출 - 선택 밖 링크는 안 잡힘.
  var frag = range.cloneContents();
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

  function bgUrl(el) {
    var bg = getComputedStyle(el).backgroundImage;
    var m = bg && bg.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : '';
  }

  var allCover = document.querySelectorAll('[class*="cover_box"], [class*="cover-box"]');
  var images = [];
  var precedingCandidate = null;
  var started = false;
  for (var k = 0; k < allCover.length; k++) {
    var el = allCover[k];
    if (range.intersectsNode(el)) {
      if (!started && precedingCandidate) {
        var pUrl = bgUrl(precedingCandidate);
        if (pUrl) images.push(pUrl);
      }
      started = true;
      var url = bgUrl(el);
      if (url) images.push(url);
    } else if (!started) {
      precedingCandidate = el;
    }
  }

  if (!images.length) {
    var imgs = frag.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      var src = imgs[j].getAttribute('src') || imgs[j].getAttribute('data-src') || '';
      if (src && src.indexOf('http') !== 0) src = location.origin + src;
      if (src) images.push(src);
    }
  }

  var payload = JSON.stringify({ raw: text, urls: urls, images: images });

  navigator.clipboard.writeText(payload).then(
    function () {
      alert('복사됨! (URL ' + urls.length + '개, 이미지 ' + images.length + '개 포함) collect 페이지로 돌아가 붙여넣으세요.');
    },
    function () {
      alert('클립보드 복사 실패 - 브라우저 권한을 확인하세요.');
    },
  );
})();
