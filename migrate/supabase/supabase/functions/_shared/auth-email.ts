export function normalizedUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim();
  if (username.length < 3 || username.length > 40 || !/^[a-zA-Z0-9._-]+$/.test(username)) return null;
  return username.toLowerCase();
}

export function syntheticEmail(username: string, domain: string): string {
  const bytes = new TextEncoder().encode(username.toLowerCase());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `user-${encoded}@${domain.toLowerCase()}`;
}

export function configuredAuthDomain(): string | null {
  const domain = Deno.env.get('AUTH_EMAIL_DOMAIN')?.trim().toLowerCase();
  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/.test(domain) || domain.startsWith('.') || domain.endsWith('.')) return null;
  return domain;
}
