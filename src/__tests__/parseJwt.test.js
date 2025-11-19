import { describe, it, expect } from 'vitest';
import { parseJwt } from '../utils/jwt.js';

const toBase64Url = (payload) =>
  Buffer.from(JSON.stringify(payload), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('parseJwt', () => {
  it('decodes base64url-encoded payloads that include - and _ characters', () => {
    const payload = { role: 'admin', scope: 'edit-all', note: 'handles -_ ok' };
    const base64urlPayload = toBase64Url(payload);
    const token = `aaa.${base64urlPayload}.bbb`;

    expect(parseJwt(token)).toEqual(payload);
  });

  it('returns null for malformed tokens', () => {
    expect(parseJwt('not-a-token')).toBeNull();
  });
});
