const SHEET_COLUMNS = ['collected_at', 'product_title', 'price', 'product_desc', 'affiliate_link', 'image_url', 'posted'];

// epoch ms is timezone-independent, so shift by KST's fixed +9h offset and relabel - no reliance
// on the host machine's local timezone setting.
function nowKstIso() {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().replace('Z', '+09:00');
}

function toSheetRow(candidate, collectedAt) {
  return [
    collectedAt,
    candidate.product_title || '',
    candidate.price || '',
    candidate.product_desc || '',
    candidate.affiliate_link || '',
    candidate.image_url || '',
    '',
  ];
}

module.exports = { SHEET_COLUMNS, toSheetRow, nowKstIso };
