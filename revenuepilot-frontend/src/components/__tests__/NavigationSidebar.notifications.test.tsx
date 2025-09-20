import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

import { NavigationSidebar } from "../NavigationSidebar"
import { SidebarProvider } from "../ui/sidebar"
import * as api from "../../lib/api"

describe("NavigationSidebar websocket authentication", () => {
  const matchMediaMock = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })

  beforeEach(() => {
    matchMediaMock.mockClear()
    vi.stubGlobal("matchMedia", matchMediaMock)
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("appends the stored token when connecting to the notifications websocket", async () => {
    const token = "abc123-token"
    const getStoredTokenSpy = vi.spyOn(api, "getStoredToken").mockReturnValue(token)
    vi.spyOn(api, "resolveWebsocketUrl").mockImplementation((path: string) => {
      const relative = path.startsWith("/") ? path : `/${path}`
      return `ws://example.test${relative}`
    })
    vi.spyOn(api, "apiFetchJson").mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (url === "/api/user/current-view") {
        return { currentView: null }
      }
      if (url === "/api/notifications/count") {
        return { count: 0 }
      }
      if (url === "/api/user/profile") {
        return { currentView: null, clinic: null, preferences: {}, uiPreferences: {} }
      }
      if (url === "/api/user/ui-preferences") {
        return { uiPreferences: {} }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.spyOn(api, "apiFetch").mockResolvedValue(new Response(null, { status: 200 }))

    const wsInstances: Array<{ onclose: ((event?: any) => void) | null }> = []
    const WebSocketMock = vi.fn().mockImplementation((url: string, protocols?: string[]) => {
      const instance = {
        readyState: 1,
        url,
        protocols,
        onopen: null as ((event?: any) => void) | null,
        onclose: null as ((event?: any) => void) | null,
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event?: any) => void) | null,
        send: vi.fn(),
        close(this: any) {
          this.readyState = 3
          this.onclose?.()
        }
      }
      wsInstances.push(instance)
      return instance as unknown as WebSocket
    })
    vi.stubGlobal("WebSocket", WebSocketMock)

    render(
      <SidebarProvider>
        <NavigationSidebar userDraftCount={0} />
      </SidebarProvider>
    )

    await waitFor(() => {
      expect(WebSocketMock).toHaveBeenCalledTimes(1)
    })

    expect(getStoredTokenSpy).toHaveBeenCalled()
    const [url, protocols] = WebSocketMock.mock.calls[0]
    expect(url).toBe("ws://example.test/ws/notifications?token=abc123-token")
    expect(protocols).toEqual(["authorization", "Bearer abc123-token"])

    // ensure cleanup does not throw when the component unmounts
    wsInstances.forEach(instance => instance.onclose?.())
  })
})
