// Cloudinary(https://cloudinary.com) unsigned upload preset을 통한 영상 업로드.
// scripts/lib/cloudinary.js(이미지 업로드)의 ESM/영상 버전.
export async function uploadVideoToCloudinary(buffer, cloudName, uploadPreset) {
  const body = new FormData();
  body.set('file', new Blob([buffer]));
  body.set('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error('Cloudinary 업로드 실패: ' + JSON.stringify(json));
  }
  return json.secure_url;
}
