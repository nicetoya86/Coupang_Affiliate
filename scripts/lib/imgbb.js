// imgbb(https://api.imgbb.com) 무료 이미지 호스팅 업로드.
// 구글 드라이브는 서비스 계정에 저장공간이 없어(개인 구글 계정 한정) 업로드 자체가 막혀있어 대체함.
async function uploadToImgbb(buffer, apiKey) {
  const body = new URLSearchParams();
  body.set('key', apiKey);
  body.set('image', buffer.toString('base64'));

  const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
  const json = await res.json();
  if (!json.success) {
    throw new Error('imgbb 업로드 실패: ' + JSON.stringify(json));
  }
  return json.data.url;
}

module.exports = { uploadToImgbb };
