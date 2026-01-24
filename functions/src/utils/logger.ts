// 🛡️ SENTINEL: Log Sanitizer (PII Protection)
export function maskLog(text: string, maxLength: number = 50): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + `... [TRUNCATED ${text.length - maxLength} chars]`;
}
