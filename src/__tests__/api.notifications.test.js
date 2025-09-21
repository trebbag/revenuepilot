/* @vitest-environment jsdom */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { connectNotificationsStream } from '../api.js';

class MockSocket {
  constructor() {
    this.readyState = WebSocket.OPEN;
    this.listeners = {};
    this.close = vi.fn(() => {
      this.readyState = WebSocket.CLOSED;
    });
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((handler) => handler(payload));
  }
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('connectNotificationsStream', () => {
  test('reconnects after the socket closes unexpectedly', () => {
    vi.useFakeTimers();
    const sockets = [];
    const factory = vi.fn(() => {
      const socket = new MockSocket();
      sockets.push(socket);
      return socket;
    });
    const counts = [];
    const subscription = connectNotificationsStream({
      onCount: (payload) => counts.push(payload),
      reconnectDelayMs: 1000,
      websocketFactory: factory,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);

    const first = sockets[0];
    first.emit('open');
    first.emit('message', { data: JSON.stringify({ notifications: 4, drafts: 1 }) });
    expect(counts[0].notifications).toBe(4);
    expect(counts[0].drafts).toBe(1);

    first.emit('close', { code: 1006 });
    vi.advanceTimersByTime(1000);
    expect(factory).toHaveBeenCalledTimes(2);

    const second = sockets[1];
    second.emit('open');
    subscription.close();
    expect(second.close).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
