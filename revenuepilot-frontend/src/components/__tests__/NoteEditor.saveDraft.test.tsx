import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

const {
  toastSuccess,
  toastError,
  toastInfo,
  fetchMock,
  fetchJsonMock
} = vi.hoisted(() => {
  return {
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    fetchMock: vi.fn<
      [RequestInfo | URL, Record<string, any> | undefined],
      Promise<Response>
    >(),
    fetchJsonMock: vi.fn<
      [RequestInfo | URL, Record<string, any> | undefined],
      Promise<any>
    >()
  }
})

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    info: toastInfo
  }
}))

vi.mock("../RichTextEditor", () => ({
  RichTextEditor: () => <div data-testid="rich-text-editor" />
}))

vi.mock("../BeautifiedView", () => ({
  BeautifiedView: () => <div data-testid="beautified-view" />
}))

vi.mock("../FinalizationWizardAdapter", () => ({
  FinalizationWizardAdapter: () => null
}))

vi.mock("lucide-react", () => ({
  CheckCircle: () => null,
  Save: () => null,
  Play: () => null,
  Square: () => null,
  Clock: () => null,
  Mic: () => null,
  MicOff: () => null,
  AlertTriangle: () => null,
  Loader2: () => null,
  XIcon: () => null
}))

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", specialty: "Cardiology" },
    status: "authenticated",
    checking: false,
    hasPermission: () => true
  })
}))

import { NoteEditor } from "../NoteEditor"

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: (input: RequestInfo | URL, init?: Record<string, any>) => fetchMock(input, init),
    apiFetchJson: (input: RequestInfo | URL, init?: Record<string, any>) => fetchJsonMock(input, init),
    resolveWebsocketUrl: () => "ws://localhost/api/transcribe/stream",
    getStoredToken: () => "test-token"
  }
})

class MockMediaRecorder {
  public ondataavailable: ((event: any) => void) | null = null
  public onstop: (() => void) | null = null
  public state: "inactive" | "recording" = "inactive"
  constructor(private readonly stream: any) {
    this.stream = stream
  }
  start() {
    this.state = "recording"
  }
  stop() {
    this.state = "inactive"
    this.onstop?.()
  }
}

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: any) => void) | null = null
  constructor() {
    setTimeout(() => {
      this.onopen?.()
    }, 0)
  }
  send() {}
  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

const mediaDevices = {
  getUserMedia: vi.fn(async () => ({
    getTracks: () => []
  }))
}

Object.defineProperty(globalThis.navigator, "mediaDevices", {
  value: mediaDevices,
  configurable: true
})

Object.defineProperty(globalThis, "MediaRecorder", {
  value: MockMediaRecorder,
  configurable: true
})

Object.defineProperty(globalThis, "WebSocket", {
  value: MockWebSocket,
  configurable: true
})

let autoSaveShouldFail = false

const resolveUrl = (input: RequestInfo | URL): string => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  if (!raw) return ""
  return raw.replace(/^https?:\/\/[^/]+/i, "")
}

const defaultFetchImplementation = async (input: RequestInfo | URL, init: Record<string, any> = {}) => {
  const url = resolveUrl(input)
  const method = (init.method ?? "GET").toUpperCase()

  if (url.startsWith("/api/patients/search")) {
    return new Response(JSON.stringify({ patients: [], externalPatients: [] }), { status: 200 })
  }

  if (url.startsWith("/api/patients/")) {
    return new Response(JSON.stringify({ demographics: {} }), { status: 200 })
  }

  if (url.startsWith("/api/encounters/validate/")) {
    return new Response(
      JSON.stringify({
        valid: true,
        encounter: {
          encounterId: 1001,
          patientId: "PT-1001",
          patient: { patientId: "PT-1001" },
          date: "2024-03-14",
          type: "Consult",
          provider: "Dr. Example"
        }
      }),
      { status: 200 }
    )
  }

  if (url === "/api/visits/session" && method === "POST") {
    return new Response(
      JSON.stringify({ sessionId: 42, status: "started", startTime: "2024-03-14T10:00:00Z" }),
      { status: 200 }
    )
  }

  if (url === "/api/visits/session" && method === "PUT") {
    return new Response(
      JSON.stringify({ sessionId: 42, status: init.jsonBody?.action ?? "complete", endTime: "2024-03-14T10:10:00Z" }),
      { status: 200 }
    )
  }

  if (url === "/api/notes/create") {
    return new Response(JSON.stringify({ noteId: "note-123" }), { status: 200 })
  }

  if (url === "/api/notes/auto-save") {
    if (autoSaveShouldFail) {
      return new Response(JSON.stringify({ message: "Manual save failed" }), { status: 500 })
    }
    return new Response(JSON.stringify({ status: "saved", version: 2 }), { status: 200 })
  }

  if (url === "/api/activity/log" && method === "POST") {
    return new Response(JSON.stringify({ status: "logged" }), { status: 200 })
  }

  return new Response(JSON.stringify({}), { status: 200 })
}

fetchMock.mockImplementation(defaultFetchImplementation)
fetchJsonMock.mockImplementation(async (input: RequestInfo | URL, init?: Record<string, any>) => {
  const response = await fetchMock(input, init)
  const text = await response.text()
  return text ? JSON.parse(text) : null
})

describe("NoteEditor manual draft save", () => {
  beforeEach(() => {
    autoSaveShouldFail = false
    fetchMock.mockClear()
    fetchMock.mockImplementation(defaultFetchImplementation)
    fetchJsonMock.mockClear()
    fetchJsonMock.mockImplementation(async (input: RequestInfo | URL, init?: Record<string, any>) => {
      const response = await fetchMock(input, init)
      const text = await response.text()
      return text ? JSON.parse(text) : null
    })
    toastSuccess.mockReset()
    toastError.mockReset()
    toastInfo.mockReset()
    mediaDevices.getUserMedia.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  const renderComponent = (navigateSpy = vi.fn()) =>
    render(
      <NoteEditor
        prePopulatedPatient={{ patientId: "PT-1001", encounterId: "1001" }}
        selectedCodes={{ codes: 0, prevention: 0, diagnoses: 0, differentials: 0 }}
        selectedCodesList={[]}
        onNavigateToDrafts={navigateSpy}
        testOverrides={{ initialRecordedSeconds: 120 }}
      />
    )

  it("saves the draft, logs activity and navigates on success", async () => {
    const onNavigate = vi.fn()
    renderComponent(onNavigate)

    const saveButton = await screen.findByRole("button", { name: /save draft/i })
    expect(saveButton).toBeEnabled()

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(saveButton).toBeDisabled()
    })

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledTimes(1)
    })

    const autoSaveCall = fetchMock.mock.calls.find(
      ([input, init]) => resolveUrl(input).includes("/api/notes/auto-save") && (init?.method ?? "GET").toUpperCase() === "PUT"
    )
    expect(autoSaveCall?.[1]?.jsonBody).toMatchObject({ content: expect.any(String), note_id: expect.anything() })

    const activityCall = fetchMock.mock.calls.find(
      ([input, init]) => resolveUrl(input) === "/api/activity/log" && (init?.method ?? "GET").toUpperCase() === "POST"
    )
    expect(activityCall?.[1]?.jsonBody).toMatchObject({
      eventType: "draft_saved",
      details: expect.objectContaining({ manual: true, patientId: "PT-1001", source: "note-editor" })
    })

    expect(toastSuccess).toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("surfaces an error when the draft save fails", async () => {
    autoSaveShouldFail = true
    const onNavigate = vi.fn()
    renderComponent(onNavigate)

    const saveButton = await screen.findByRole("button", { name: /save draft/i })
    fireEvent.click(saveButton)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Manual save failed")

    expect(onNavigate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })
})
