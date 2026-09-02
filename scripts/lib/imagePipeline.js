const { composeProductImage } = require('./composeImage');
const { uploadToCloudinary } = require('./cloudinary');
const { upsizeCoupangThumbnail } = require('./coupangImageUrl');

// 이미지 다운로드 + 할인율/가격 배지 합성 + Cloudinary 업로드. imageSrc 없으면 빈 값 반환.
async function composeAndUploadImage(imageSrc, { title, originalPrice, discountPrice, discountRate }, cloudinaryConfig) {
  if (!imageSrc) return '';
  try {
    const res = await fetch(upsizeCoupangThumbnail(imageSrc));
    if (!res.ok) {
      console.error(`[경고] 이미지 다운로드 실패 (status ${res.status}) - 이미지 없이 진행합니다.`);
      return '';
    }
    const imageBuffer = Buffer.from(await res.arrayBuffer());
    const composed = await composeProductImage({ imageBuffer, title, originalPrice, discountPrice, discountRate });
    return await uploadToCloudinary(composed, cloudinaryConfig.cloudName, cloudinaryConfig.uploadPreset);
  } catch (e) {
    console.error(`[경고] 이미지 합성/업로드 실패: ${e.message} - 이미지 없이 진행합니다.`);
    return '';
  }
}

module.exports = { composeAndUploadImage };
