function parseDiscountRate(text) {
  if (!text) return null;
  const match = text.match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const rate = Number(match[1]);
  return rate >= 0 && rate <= 100 ? rate : null;
}

module.exports = { parseDiscountRate };
