// collect.html의 commit()이 하는 핵심 로직을 그대로 뽑아서 테스트 가능하게 만든 순수 함수.
// 체크박스는 순번이 아니라 "원본 배열 인덱스"를 data-idx로 직접 들고 있어서, 중복이라 disabled된
// 행이나 사용자가 직접 체크 해제한 행이 중간에 껴 있어도 뒤 항목들이 밀리지 않는다 -
// checkedIdxList의 각 값은 항상 lastItems에서의 "진짜 자리"를 가리키기 때문.
function pairCheckedItems(lastItems, checkedIdxList, accountACheckedIdxSet) {
  return checkedIdxList.map((idx) => ({
    ...lastItems[idx],
    accountA: accountACheckedIdxSet.has(idx),
  }));
}

module.exports = { pairCheckedItems };
