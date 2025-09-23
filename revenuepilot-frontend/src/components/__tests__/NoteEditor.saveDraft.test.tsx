import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

const { toastSuccess, toastError, toastInfo, fetchMock, fetchJsonMock } = vi.hoisted(() => {
  return {
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    fetchMock: vi.fn<[RequestInfo | URL, Record<string, any> | undefined], Promise<Response>>(),
    fetchJsonMock: vi.fn<[RequestInfo | URL, Record<string, any> | undefined], Promise<any>>(),
  }
})

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
  },
}))

vi.mock("../RichTextEditor", () => ({
  RichTextEditor: () => <div data-testid="rich-text-editor" />,
}))

vi.mock("../BeautifiedView", () => ({
  BeautifiedView: () => <div data-testid="beautified-view" />,
}))

vi.mock("../FinalizationWizardAdapter", () => ({
  FinalizationWizardAdapter: () => null,
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
  XIcon: () => null,
}))

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", specialty: "Cardiology" },
    status: "authenticated",
    checking: false,
    hasPermission: () => true,
  }),
}))

vi.mock("../../contexts/SessionContext", () => ({
  useSession: () => ({
    state: {
      finalizationSessions: {},
    },
    hydrated: true,
    syncing: false,
    actions: {},
  }),
}))

import { NoteEditor } from "../NoteEditor"

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: (input: RequestInfo | URL, init?: Record<string, any>) => fetchMock(input, init),
    apiFetchJson: (input: RequestInfo | URL, init?: Record<string, any>) => fetchJsonMock(input, init),
    resolveWebsocketUrl: () => "ws://localhost/api/transcribe/stream",
    getStoredToken: () => "test-token",
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
    getTracks: () => [],
  })),
}

Object.defineProperty(globalThis.navigator, "mediaDevices", {
  value: mediaDevices,
  configurable: true,
})

Object.defineProperty(globalThis, "MediaRecorder", {
  value: MockMediaRecorder,
  configurable: true,
})

Object.defineProperty(globalThis, "WebSocket", {
  value: MockWebSocket,
  configurable: true,
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

  if (url === "/api/encounters/validate" && method === "POST") {
    return new Response(
      JSON.stringify({
        valid: true,
        encounter: {
          encounterId: init.jsonBody?.encounterId ?? init.jsonBody?.encounter_id ?? 1001,
          patientId: init.jsonBody?.patientId ?? init.jsonBody?.patient_id ?? "PT-42",
          patient: { patientId: init.jsonBody?.patientId ?? "PT-42" },
          date: "2024-03-14",
          type: "Consult",
          provider: "Dr. Example",
        },
      }),
      { status: 200 },
    )
  }

  if (url === "/api/ai/compliance/check" && method === "POST") {
    return new Response(
      JSON.stringify({
        alerts: [
          {
            id: "alert-1",
            text: "Document review required for risk adjustment.",
            category: "documentation",
            priority: "medium",
            confidence: 0.82,
            reasoning: "Missing history of present illness section.",
            ruleReferences: [
              {
                ruleId: "CMS-HCC",
                citations: [
                  {
                    title: "CMS Risk Adjustment Guidelines",
                    url: "https://example.org/cms/hcc",
                    citation: "Section 3.1",
                  },
                ],
              },
            ],
          },
        ],
      }),
      { status: 200 },
    )
  }

  if (url === "/api/visits/session" && method === "POST") {
    return new Response(JSON.stringify({ sessionId: 42, status: "started", startTime: "2024-03-14T10:00:00Z" }), { status: 200 })
  }

  if (url === "/api/visits/session" && method === "PUT") {
    return new Response(JSON.stringify({ sessionId: 42, status: init.jsonBody?.action ?? "complete", endTime: "2024-03-14T10:10:00Z" }), { status: 200 })
  }

  if (url.endsWith("/stop") && url.startsWith("/api/visits/") && method === "POST") {
    const encounter = url.split("/")[3]
    return new Response(
      JSON.stringify({
        encounterId: encounter,
        visitStatus: "paused",
        duration: 300,
        documentationComplete: false,
      }),
      { status: 200 },
    )
  }

  if (url === "/api/notes/drafts" && method === "POST") {
    return new Response(
      JSON.stringify({
        draftId: "note-123",
        encounterId: init?.jsonBody?.encounterId ?? null,
        createdAt: "2024-03-14T10:00:00Z",
        version: 1,
        content: typeof init?.jsonBody?.content === "string" ? init.jsonBody.content : "",
      }),
      { status: 200 },
    )
  }

  if (url.startsWith("/api/notes/versions/")) {
    const id = url.split("/").pop() ?? ""
    const content = id === "42" ? "Patient ID: PT-42\nEncounter ID: 42\nExisting content" : "Seed content"
    return new Response(JSON.stringify([{ content, timestamp: "2024-01-01T00:00:00Z" }]), { status: 200 })
  }

  if (url.startsWith("/api/notes/drafts/") && method === "PATCH") {
    if (autoSaveShouldFail) {
      return new Response(JSON.stringify({ message: "Manual save failed" }), { status: 500 })
    }
    return new Response(
      JSON.stringify({ status: "saved", version: 2, updatedAt: "2024-03-14T10:05:00Z" }),
      { status: 200 },
    )
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
      />,
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
      ([input, init]) =>
        resolveUrl(input).startsWith("/api/notes/drafts/") && (init?.method ?? "GET").toUpperCase() === "PATCH",
    )
    expect(autoSaveCall?.[1]?.jsonBody).toMatchObject({ content: expect.any(String) })

    const activityCall = fetchMock.mock.calls.find(([input, init]) => resolveUrl(input) === "/api/activity/log" && (init?.method ?? "GET").toUpperCase() === "POST")
    expect(activityCall?.[1]?.jsonBody).toMatchObject({
      eventType: "draft_saved",
      details: expect.objectContaining({ manual: true, patientId: "PT-1001", source: "note-editor" }),
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
    expect(alert).toHaveTextContent("Unable to auto-save note")

    expect(onNavigate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it("continues saving to the provided noteId when a draft is seeded", async () => {
    const onNavigate = vi.fn()
    render(
      <NoteEditor
        prePopulatedPatient={null}
        initialNoteData={{
          noteId: "42",
          content: "Patient ID: PT-42\nEncounter ID: 42\nExisting content",
          patientId: "PT-42",
          encounterId: "42",
          patientName: "John Doe",
        }}
        selectedCodes={{ codes: 0, prevention: 0, diagnoses: 0, differentials: 0 }}
        selectedCodesList={[]}
        onNavigateToDrafts={onNavigate}
        testOverrides={{ initialRecordedSeconds: 120 }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/patient id/i)).toHaveValue("PT-42")
    })

    const saveButton = await screen.findByRole("button", { name: /save draft/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledTimes(1)
    })

    const createCall = fetchMock.mock.calls.find(([input]) => resolveUrl(input) === "/api/notes/drafts")
    expect(createCall).toBeUndefined()

    const autoSaveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        resolveUrl(input).startsWith("/api/notes/drafts/") && (init?.method ?? "GET").toUpperCase() === "PATCH",
    )
    expect(autoSaveCall?.[0]).toContain("/api/notes/drafts/42")
  })
})
