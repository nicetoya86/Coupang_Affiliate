const SHEET_COLUMNS = ['collected_at', 'product_title', 'price', 'product_desc', 'product_url', 'affiliate_link', 'image_url', 'posted'];

function toSheetRow(candidate, collectedAt) {
  return [
    collectedAt,
    candidate.product_title || '',
    candidate.price || '',
    candidate.product_desc || '',
    candidate.product_url || '',
    candidate.affiliate_link || '',
    candidate.image_url || '',
    '',
  ];
}

module.exports = { SHEET_COLUMNS, toSheetRow };
