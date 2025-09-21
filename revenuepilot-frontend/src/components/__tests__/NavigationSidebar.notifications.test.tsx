import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { NavigationSidebar } from "../NavigationSidebar"
import { SidebarProvider } from "../ui/sidebar"
import * as api from "../../lib/api"

declare global {
  interface Window {
    WebSocket: typeof WebSocket
  }
}

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetchJson: vi.fn(),
    apiFetch: vi.fn(),
    resolveWebsocketUrl: vi.fn(),
  }
})

const mockedApiFetchJson = vi.mocked(api.apiFetchJson)
const mockedApiFetch = vi.mocked(api.apiFetch)
const mockedResolveWebsocketUrl = vi.mocked(api.resolveWebsocketUrl)

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: Event) => void) | null = null

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new Event("close"))
  }
}

describe("NavigationSidebar notifications", () => {
  const notificationsEndpoint = `/api/notifications?limit=20&offset=0`

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    )

    mockedApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response)

    const baseNotifications = [
      {
        id: "notif-1",
        title: "Compliance alert",
        message: "Review required",
        severity: "high",
        timestamp: "2024-03-14T08:30:00Z",
        isRead: false,
      },
      {
        id: "notif-2",
        title: "Reminder",
        message: "Team standup at 4pm",
        severity: "info",
        timestamp: "2024-03-13T08:30:00Z",
        isRead: true,
      },
    ]

    let currentNotifications = [...baseNotifications]

    mockedApiFetchJson.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url.startsWith("/api/user/current-view")) {
        return { currentView: null }
      }
      if (url === notificationsEndpoint) {
        return {
          items: currentNotifications,
          total: currentNotifications.length,
          limit: 20,
          offset: 0,
          unreadCount: currentNotifications.filter((item) => !item.isRead).length,
        }
      }
      if (url.startsWith("/api/user/profile")) {
        return { currentView: null, clinic: null, preferences: {}, uiPreferences: {} }
      }
      if (url.startsWith("/api/user/ui-preferences")) {
        return { uiPreferences: {} }
      }
      if (url.startsWith("/api/notifications/") && url.endsWith("/read") && options?.method === "POST") {
        const id = decodeURIComponent(url.split("/").slice(-2)[0] ?? "")
        currentNotifications = currentNotifications.map((item) => (item.id === id ? { ...item, isRead: true } : item))
        return { unreadCount: currentNotifications.filter((item) => !item.isRead).length }
      }
      if (url === "/api/notifications/read-all" && options?.method === "POST") {
        currentNotifications = currentNotifications.map((item) => ({ ...item, isRead: true }))
        return { unreadCount: 0 }
      }

      throw new Error(`Unexpected apiFetchJson call: ${url}`)
    })

    mockedResolveWebsocketUrl.mockReturnValue("ws://localhost/ws/notifications")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  function renderSidebar() {
    return render(
      <SidebarProvider>
        <NavigationSidebar currentView="dashboard" userDraftCount={0} />
      </SidebarProvider>,
    )
  }

  it("loads notifications and displays unread count", async () => {
    renderSidebar()

    await waitFor(() => {
      expect(mockedApiFetchJson.mock.calls.some((call) => call[0] === notificationsEndpoint)).toBe(true)
    })

    const navTriggers = await screen.findAllByText("Notifications", { selector: "span.font-medium" })
    const navTrigger = navTriggers[navTriggers.length - 1]
    expect(navTrigger).toBeInTheDocument()

    const badges = await screen.findAllByText("1", { selector: '[data-slot="badge"]' })
    expect(badges.length).toBeGreaterThan(0)

    fireEvent.click(navTrigger)

    expect(await screen.findByText("Compliance alert")).toBeInTheDocument()
    expect(screen.getByText("Review required")).toBeInTheDocument()
  })

  it("marks a notification as read via the API", async () => {
    renderSidebar()

    await waitFor(() => {
      expect(mockedApiFetchJson.mock.calls.some((call) => call[0] === notificationsEndpoint)).toBe(true)
    })

    const navTriggers = await screen.findAllByText("Notifications", { selector: "span.font-medium" })
    const navTrigger = navTriggers[navTriggers.length - 1]
    fireEvent.click(navTrigger)

    const cards = await screen.findAllByText("Compliance alert", { selector: "h4", timeout: 2000 })
    fireEvent.click(cards[0])

    await waitFor(() => {
      expect(mockedApiFetchJson).toHaveBeenCalledWith("/api/notifications/notif-1/read", expect.objectContaining({ method: "POST" }))
    })

    await waitFor(() => {
      const calls = mockedApiFetchJson.mock.calls.filter((call) => call[0] === notificationsEndpoint)
      expect(calls.length).toBeGreaterThan(1)
    })
  })

  it("adds websocket notifications to the feed", async () => {
    renderSidebar()

    await waitFor(() => {
      expect(mockedApiFetchJson.mock.calls.some((call) => call[0] === notificationsEndpoint)).toBe(true)
    })

    const navTriggers = await screen.findAllByText("Notifications", { selector: "span.font-medium" })
    const navTrigger = navTriggers[navTriggers.length - 1]
    fireEvent.click(navTrigger)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const socket = MockWebSocket.instances[0]
    socket.onopen?.()

    socket.onmessage?.({
      data: JSON.stringify({
        channel: "notifications",
        event: "notification",
        id: "notif-3",
        title: "New task",
        message: "Review the latest submission",
        severity: "warning",
        timestamp: "2024-03-15T10:00:00Z",
        unreadCount: 2,
      }),
    } as MessageEvent)

    expect(await screen.findByText("New task", undefined, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText("Review the latest submission")).toBeInTheDocument()
  })
})

describe("NavigationSidebar websocket authentication", () => {
  const matchMediaMock = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  beforeEach(() => {
    matchMediaMock.mockClear()
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMediaMock,
    })
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    })
  })

  afterEach(() => {
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
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
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url === "/api/user/current-view") {
        return { currentView: null }
      }
      if (url === "/api/notifications/count") {
        return { count: 0 }
      }
      if (url === "/api/notifications?limit=20&offset=0") {
        return { items: [], total: 0, limit: 20, offset: 0, unreadCount: 0 }
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
        },
      }
      wsInstances.push(instance)
      return instance as unknown as WebSocket
    })
    vi.stubGlobal("WebSocket", WebSocketMock)

    render(
      <SidebarProvider>
        <NavigationSidebar userDraftCount={0} />
      </SidebarProvider>,
    )

    await waitFor(() => {
      expect(WebSocketMock).toHaveBeenCalledTimes(1)
    })

    expect(getStoredTokenSpy).toHaveBeenCalled()
    const [url, protocols] = WebSocketMock.mock.calls[0]
    expect(url).toBe("ws://example.test/ws/notifications?token=abc123-token")
    expect(protocols).toEqual(["authorization", "Bearer abc123-token"])

    wsInstances.forEach((instance) => instance.onclose?.())
  })
})
