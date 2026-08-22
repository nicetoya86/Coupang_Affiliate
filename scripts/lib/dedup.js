function selectNewCandidates(candidates, existingProductTitles) {
  const seen = new Set(existingProductTitles);
  return candidates.filter((c) => c.product_title && !seen.has(c.product_title));
}

module.exports = { selectNewCandidates };
