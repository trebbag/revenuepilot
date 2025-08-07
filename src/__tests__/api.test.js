import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('api helper error handling', () => {
  it('throws detailed error on failed login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'bad credentials' })
    }));
    const { login } = await import('../api.js');
    await expect(login('user', 'pass')).rejects.toThrow('bad credentials');
  });

  it('throws detailed error on failed password reset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'nope' })
    }));
    const { resetPassword } = await import('../api.js');
    await expect(resetPassword('user', 'pass', 'newpass')).rejects.toThrow('nope');
  });
});
