export function clampHookText(text: string, maxLength: number = 40): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const chars = Array.from(trimmed);
  return chars.slice(0, maxLength - 1).join('').trimEnd() + '…';
}
