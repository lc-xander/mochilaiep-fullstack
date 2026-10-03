const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeActivationCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 5 && normalized.length <= 12 ? normalized : null;
}

export function generateActivationCode(): string {
  const values = new Uint8Array(12);
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let code = '';
  while (code.length < 12) {
    crypto.getRandomValues(values);
    for (const value of values) {
      if (value >= limit) continue;
      code += alphabet[value % alphabet.length];
      if (code.length === 12) break;
    }
  }
  return code;
}

export async function hashActivationCode(normalizedCode: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedCode));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
