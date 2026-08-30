// 쿠팡 썸네일 CDN URL(예: .../thumbnails/remote/230x230ex/image/retail/images/...)은 경로의
// 가로x세로 크기를 바꾸면 실제로 더 큰 해상도 원본을 돌려준다(실측 확인: 230x230=12KB, 1024x1024=58KB,
// 진짜 더 선명한 이미지). 합성 캔버스(800x800)보다 작은 저해상도 썸네일을 억지로 확대해서 생기던
// 화질 저하를 막기 위해, 합성/미리보기 전에 이 크기를 키워서 fetch한다. 패턴이 없는 URL(예:
// add-product.js에서 사람이 직접 복사한 상세페이지 원본 이미지 주소)은 그대로 통과.
function upsizeCoupangThumbnail(url, targetSize = 1024) {
  return String(url || '').replace(/\/thumbnails\/remote\/\d+x\d+ex\//, `/thumbnails/remote/${targetSize}x${targetSize}ex/`);
}

module.exports = { upsizeCoupangThumbnail };
