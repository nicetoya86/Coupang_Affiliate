export function clampHookText(text: string, maxLength: number = 40): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
}
