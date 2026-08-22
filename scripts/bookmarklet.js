/**
 * 쿠팡 상품 카드 정보 클립보드 복사 북마클릿 (소스)
 *
 * 사용법: 아래 코드를 압축해 "javascript:(function(){...})();" 한 줄로 만들어
 * 브라우저 북마크 바에 "쿠팡 정보 복사"라는 이름으로 등록한다 (scripts/README.md 참고,
 * 압축된 javascript: 한 줄이 README에 그대로 들어있음 - 복사해서 새 북마크 URL에 붙여넣으면 됨).
 *
 * 사용 순서:
 * 1. 쿠팡에서 상품 카드를 찾아 마우스로 제목/가격/할인율 텍스트 전체를 드래그해 선택
 * 2. 북마크 바의 "쿠팡 정보 복사" 클릭 → 클립보드에 JSON으로 복사됨
 * 3. 터미널에서 npm run add 실행 → 자동으로 인식된 값이 채워짐
 *
 * 자동화 클릭이 아니라 사람이 직접 선택+클릭하는 것이라 쿠팡 WAF와 무관하다.
 */
(function () {
  var sel = window.getSelection().toString().trim();
  if (!sel) {
    alert('상품 카드 텍스트를 먼저 마우스로 드래그해 선택한 후 다시 클릭하세요.');
    return;
  }

  var node = window.getSelection().anchorNode;
  var el = node && node.nodeType === 3 ? node.parentElement : node;
  // ponytail: 선택 범위를 감싸는 가장 가까운 li/div/article 안의 첫 img를 상품 이미지로 추정.
  // 선택 범위가 너무 넓어 다른 상품 이미지가 잡히면 add-product.js 프롬프트에서 직접 교체하면 됨.
  var container = el && el.closest ? el.closest('li,div,article') : null;
  var img = container ? container.querySelector('img') : null;
  var imageUrl = img ? (img.currentSrc || img.src || '') : '';

  var payload = JSON.stringify({ raw: sel, imageUrl: imageUrl });

  navigator.clipboard.writeText(payload).then(
    function () {
      alert('복사됨! 터미널로 돌아가 npm run add 를 실행하세요.');
    },
    function () {
      alert('클립보드 복사 실패 - 브라우저 권한을 확인하세요.');
    },
  );
})();
