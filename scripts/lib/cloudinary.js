// Cloudinary(https://cloudinary.com) unsigned upload preset을 통한 이미지 업로드.
// imgbb가 Meta(Threads/Instagram) 크롤러 미디어 다운로드를 간헐적으로 거부해 교체함.
async function uploadToCloudinary(buffer, cloudName, uploadPreset) {
  const body = new FormData();
  body.set('file', new Blob([buffer]));
  body.set('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error('Cloudinary 업로드 실패: ' + JSON.stringify(json));
  }
  return json.secure_url;
}

module.exports = { uploadToCloudinary };
