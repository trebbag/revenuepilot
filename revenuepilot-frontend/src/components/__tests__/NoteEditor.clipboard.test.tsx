import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  BookOpen: () => null,
  Copy: () => null,
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
      selectedCodes: { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
      selectedCodesList: [],
      addedCodes: [],
      isSuggestionPanelOpen: false,
      layout: "default",
    },
    hydrated: true,
    syncing: false,
    actions: {},
  }),
}))

import { NoteEditor, buildNoteWorkspaceClipboardText } from "../NoteEditor"

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
    return new Response(JSON.stringify({ alerts: [] }), { status: 200 })
  }

  if (url === "/api/notes/drafts" && method === "POST") {
    return new Response(JSON.stringify({ noteId: "note-123" }), { status: 200 })
  }

  if (url.startsWith("/api/notes/drafts/") && method === "GET") {
    return new Response(JSON.stringify({ note: { content: "<p>server note</p>" } }), { status: 200 })
  }

  if (url === "/api/activity/log" && method === "POST") {
    return new Response(null, { status: 204 })
  }

  if (url === "/api/visits/session" && method === "POST") {
    return new Response(JSON.stringify({ sessionId: "session-1", status: "active" }), { status: 200 })
  }

  if (url === "/api/visits/session" && method === "PATCH") {
    return new Response(JSON.stringify({ status: init.jsonBody?.action === "pause" ? "paused" : "active" }), { status: 200 })
  }

  if (url === "/api/visits/session" && method === "GET") {
    return new Response(JSON.stringify({ status: "inactive" }), { status: 200 })
  }

  if (url === "/api/visits/session/preferences" && method === "GET") {
    return new Response(JSON.stringify({ speakerPreference: "balanced" }), { status: 200 })
  }

  if (url === "/api/notes/auto-save" && method === "POST") {
    return new Response(JSON.stringify({ success: true, version: 2 }), { status: 200 })
  }

  return new Response(JSON.stringify({}), { status: 200 })
}

const defaultFetchJsonImplementation = async (input: RequestInfo | URL, init: Record<string, any> = {}) => {
  const response = await defaultFetchImplementation(input, init)
  return response.json()
}

beforeEach(() => {
  fetchMock.mockImplementation(defaultFetchImplementation)
  fetchJsonMock.mockImplementation(defaultFetchJsonImplementation)
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  fetchJsonMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  toastInfo.mockReset()
})

describe("buildNoteWorkspaceClipboardText", () => {
  it("serializes note content and codes", () => {
    const result = buildNoteWorkspaceClipboardText({
      noteContent: "<p>Chief Complaint</p><p>Plan</p>",
      selectedCodes: [
        { code: "99213", description: "Office visit", category: "codes" },
        { code: "E11.9", title: "Type 2 diabetes", classification: "diagnosis" },
      ],
    })

    expect(result).toBe(
      [
        "Note Content:\nChief Complaint\nPlan",
        "Selected Codes:\n- [Codes] 99213 — Office visit\n- [Diagnoses] E11.9 — Type 2 diabetes",
      ].join("\n\n"),
    )
  })

  it("returns empty string when nothing to copy", () => {
    expect(buildNoteWorkspaceClipboardText({ noteContent: "", selectedCodes: [] })).toBe("")
  })
})

describe("NoteEditor clipboard action", () => {
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    })
  })

  it("copies workspace content and shows success toast", async () => {
    const noteContent = "<p>Chief Complaint</p><p>Plan</p>"
    const selectedCodes = [
      { code: "99213", description: "Office visit", category: "codes" },
      { code: "E11.9", title: "Type 2 diabetes", classification: "diagnosis" },
    ]

    render(
      <NoteEditor
        initialNoteData={{ noteId: "note-1", content: noteContent }}
        selectedCodes={{ codes: 1, prevention: 0, diagnoses: 1, differentials: 0 }}
        selectedCodesList={selectedCodes as any[]}
        testOverrides={{ initialRecordedSeconds: 120 }}
      />,
    )

    const copyButton = await screen.findByRole("button", { name: /copy workspace/i })
    expect(copyButton).toBeEnabled()

    await userEvent.click(copyButton)

    const expectedText = buildNoteWorkspaceClipboardText({ noteContent, selectedCodes })

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expectedText)
      expect(toastSuccess).toHaveBeenCalledWith("Note workspace copied to clipboard")
    })
  })

  it("shows error toast when clipboard write fails", async () => {
    const error = new Error("copy failed")
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const writeTextFailure = vi.fn().mockRejectedValue(error)

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextFailure },
      configurable: true,
    })

    render(
      <NoteEditor
        initialNoteData={{ noteId: "note-2", content: "<p>Only Note</p>" }}
        selectedCodes={{ codes: 0, prevention: 0, diagnoses: 0, differentials: 0 }}
        selectedCodesList={[]}
        testOverrides={{ initialRecordedSeconds: 120 }}
      />,
    )

    const copyButton = await screen.findByRole("button", { name: /copy workspace/i })
    expect(copyButton).toBeEnabled()

    await userEvent.click(copyButton)

    await waitFor(() => {
      expect(writeTextFailure).toHaveBeenCalled()
      expect(toastError).toHaveBeenCalledWith("Unable to copy note workspace")
    })

    consoleSpy.mockRestore()
  })
})
