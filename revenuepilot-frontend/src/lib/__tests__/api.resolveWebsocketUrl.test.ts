import { afterEach, describe, expect, it, vi } from "vitest"

describe("resolveWebsocketUrl", () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, "window")
    Reflect.deleteProperty(globalThis, "location")
  })

  it("resolves websocket URL relative to API base origin without duplicating path segments", async () => {
    vi.resetModules()
    const fakeWindow = {
      __BACKEND_URL__: "http://localhost:8000/api",
      location: { origin: "http://localhost:3000", protocol: "http:" },
    } as unknown as Window & typeof globalThis

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: fakeWindow,
    })
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: fakeWindow.location,
    })

    const { resolveWebsocketUrl } = await import("../api")

    expect(resolveWebsocketUrl("/api/transcribe/stream")).toBe("ws://localhost:8000/api/transcribe/stream")
  })

  it("uses secure websocket protocol when API base is https", async () => {
    vi.resetModules()
    const fakeWindow = {
      __BACKEND_URL__: "https://api.example.com/v1",
      location: { origin: "https://app.example.com", protocol: "https:" },
    } as unknown as Window & typeof globalThis

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: fakeWindow,
    })
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: fakeWindow.location,
    })

    const { resolveWebsocketUrl } = await import("../api")

    expect(resolveWebsocketUrl("/ws/notifications")).toBe("wss://api.example.com/ws/notifications")
  })

  it("returns absolute websocket URLs unchanged while upgrading http(s)", async () => {
    vi.resetModules()
    const fakeWindow = {
      __BACKEND_URL__: "http://localhost:8000",
      location: { origin: "http://localhost:8000", protocol: "http:" },
    } as unknown as Window & typeof globalThis

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: fakeWindow,
    })
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: fakeWindow.location,
    })

    const { resolveWebsocketUrl } = await import("../api")

    expect(resolveWebsocketUrl("ws://other.example.com/socket")).toBe("ws://other.example.com/socket")
    expect(resolveWebsocketUrl("https://other.example.com/socket")).toBe("wss://other.example.com/socket")
  })
})
