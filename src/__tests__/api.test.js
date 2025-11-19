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

  it('searchPatients uses token header and caches results', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          patients: [{ patientId: '1', name: 'Anna' }],
          externalPatients: [],
          pagination: { query: 'ann', limit: 25, offset: 0, returned: 1, total: 1, hasMore: false },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { searchPatients } = await import('../api.js');
    localStorage.setItem('token', 'abc');
    const promise = searchPatients('Ann');
    await vi.advanceTimersByTimeAsync(220);
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
    expect(result.patients).toHaveLength(1);
    await searchPatients('Ann');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    localStorage.clear();
  });

  it('validateEncounter posts payload and reuses cached response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ valid: false, encounterId: 7, errors: ['Encounter not found'] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { validateEncounter } = await import('../api.js');
    localStorage.setItem('token', 'tok');
    const promise = validateEncounter('7', '55');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toMatchObject({ encounterId: '7', patientId: '55' });
    expect(result.valid).toBe(false);
    await validateEncounter('7', '55');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    localStorage.clear();
  });

  it('uses localhost backend when running from a file:// origin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ beautified: 'Beautified Text' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            codes: [],
            compliance: [],
            publicHealth: [],
            differentials: [],
          }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({ summary: 'Summary', recommendations: [], warnings: [] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({}),
      });
    vi.stubGlobal('fetch', fetchMock);
    const originalWindow = globalThis.window;
    const stubWindow = Object.create(originalWindow || {});
    stubWindow.location = { origin: 'file://unit-test' };
    if (originalWindow?.addEventListener) {
      stubWindow.addEventListener = originalWindow.addEventListener.bind(originalWindow);
    } else {
      stubWindow.addEventListener = vi.fn();
    }
    if (originalWindow?.removeEventListener) {
      stubWindow.removeEventListener = originalWindow.removeEventListener.bind(originalWindow);
    }
    vi.stubGlobal('window', stubWindow);

    const { beautifyNote, getSuggestions, summarizeNote, submitSurvey } = await import('../api.js');

    await beautifyNote('note text');
    await getSuggestions('note text');
    await summarizeNote('note text');
    await submitSurvey(5, 'Great job');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8000/beautify',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8000/suggest',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:8000/summarize',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:8000/survey',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
