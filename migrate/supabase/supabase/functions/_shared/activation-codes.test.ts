import { generateActivationCode, hashActivationCode, normalizeActivationCode } from './activation-codes.ts';

Deno.test('normalizes legacy separators and letter case before hashing', () => {
  if (normalizeActivationCode(' ab-cd 2345 ') !== 'ABCD2345') {
    throw new Error('activation-code normalization changed');
  }
  if (normalizeActivationCode('bad') !== null || normalizeActivationCode(null) !== null) {
    throw new Error('invalid activation codes must be rejected');
  }
});

Deno.test('generates twelve-character codes without separators', () => {
  const code = generateActivationCode();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code)) {
    throw new Error('generated code has an invalid format');
  }
});

Deno.test('hashes normalized codes to lowercase SHA-256 hex', async () => {
  const hash = await hashActivationCode('ABCD2345');
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('activation code hash is not a SHA-256 hex digest');
  }
});
