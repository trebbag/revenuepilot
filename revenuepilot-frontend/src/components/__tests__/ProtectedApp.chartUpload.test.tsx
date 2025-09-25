import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import React from "react"

const {
  mockedApiFetch,
  mockedApiFetchJson,
  mockCreateAppointment,
  sessionActions,
  toastInfo,
  toastSuccess,
  toastError,
} = vi.hoisted(() => {
  const actions = {
    addCode: vi.fn(),
    removeCode: vi.fn(),
    changeCodeCategory: vi.fn(),
    setSuggestionPanelOpen: vi.fn(),
    setLayout: vi.fn(),
    refresh: vi.fn(),
    reset: vi.fn(),
  }

  return {
    mockedApiFetch: vi.fn(),
    mockedApiFetchJson: vi.fn(),
    mockCreateAppointment: vi.fn(),
    sessionActions: actions,
    toastInfo: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }
})

vi.mock("sonner", () => ({
  toast: {
    info: toastInfo,
    success: toastSuccess,
    error: toastError,
  },
}))

let resetUploadStatuses: (() => void) | null = null

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      name: "Test Clinician",
      role: "user",
    },
    hasPermission: () => true,
  }),
}))

vi.mock("../../contexts/SessionContext", () => ({
  useSession: () => ({
    state: {
      selectedCodes: { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
      selectedCodesList: [],
      addedCodes: [],
      isSuggestionPanelOpen: false,
      layout: { noteEditor: 70, suggestionPanel: 30 },
    },
    hydrated: true,
    syncing: false,
    actions: sessionActions,
  }),
}))

vi.mock("../../components/FinalizationWizardAdapter", () => ({
  FinalizationWizardAdapter: () => null,
}))

vi.mock("../../components/Schedule", () => ({
  Schedule: ({ onUploadChart, uploadStatuses }: { onUploadChart?: (patientId: string) => void; uploadStatuses?: Record<string, unknown> }) => (
    <div>
      <button type="button" onClick={() => onUploadChart?.("PT-0001")}>Upload Chart</button>
      <pre data-testid="upload-status">{JSON.stringify(uploadStatuses ?? {})}</pre>
    </div>
  ),
}))

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: mockedApiFetch,
    apiFetchJson: mockedApiFetchJson,
  }
})

vi.mock("@core/api-client", async () => {
  const actual = await vi.importActual<typeof import("@core/api-client")>("@core/api-client")
  return {
    ...actual,
    createAppointment: mockCreateAppointment,
  }
})

function resolveUrl(input: unknown): string {
  if (typeof input === "string") {
    return input
  }
  if (typeof URL !== "undefined" && input instanceof URL) {
    return input.toString()
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url
  }
  return String(input)
}

describe("ProtectedApp chart upload flow", () => {
  beforeAll(async () => {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserver)

    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          media: "",
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
    }

    if (!resetUploadStatuses) {
      const mod = await import("../../hooks/useChartUpload")
      resetUploadStatuses = mod.__resetUploadStatusesForTests
    }
  })

  beforeEach(() => {
    mockedApiFetch.mockReset()
    mockedApiFetchJson.mockReset()
    mockCreateAppointment.mockReset()
    Object.values(sessionActions).forEach((action) => action.mockReset?.())
    toastInfo.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    resetUploadStatuses?.()
  })

  it("uploads a chart, logs the activity, and refreshes the schedule", async () => {
    const { ProtectedApp } = await import("../../ProtectedApp")
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const scheduleResponses = [
      {
        appointments: [
          {
            id: 1,
            patient: "Test Patient",
            reason: "Follow-up visit",
            start: start.toISOString(),
            end: end.toISOString(),
            provider: "Test Clinician",
            status: "Scheduled",
          },
        ],
      },
      {
        appointments: [
          {
            id: 1,
            patient: "Test Patient",
            reason: "Follow-up visit",
            start: start.toISOString(),
            end: end.toISOString(),
            provider: "Test Clinician",
            status: "Completed",
          },
        ],
      },
    ]

    let scheduleFetchCount = 0

    mockedApiFetchJson.mockImplementation(async (input, options) => {
      const url = resolveUrl(input)
      if (url === "/api/user/current-view") {
        return { currentView: "schedule" }
      }
      if (url === "/api/schedule/appointments") {
        const response = scheduleResponses[Math.min(scheduleFetchCount, scheduleResponses.length - 1)]
        scheduleFetchCount += 1
        return response
      }
      if (url === "/api/analytics/drafts") {
        return { drafts: 0 }
      }
      if (url === "/api/activity/log" && options?.method === "POST") {
        return { status: "logged" }
      }
      return null
    })

    mockedApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ files: [{ name: "chart.txt" }], correlation_id: "ctx_test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const createdInputs: HTMLInputElement[] = []
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName) as HTMLElement
      if (tagName === "input") {
        createdInputs.push(element as HTMLInputElement)
      }
      return element
    })

    render(<ProtectedApp />)

    await screen.findByRole("heading", { name: /patient schedule/i })
    const uploadButton = await screen.findByRole("button", { name: /upload chart/i })
    fireEvent.click(uploadButton)

    expect(createdInputs.length).toBeGreaterThan(0)
    const input = createdInputs.find((element) => element.accept?.includes(".pdf")) ?? createdInputs[createdInputs.length - 1]
    expect(input).toBeTruthy()
    const file = new File(["chart data"], "chart.txt", { type: "text/plain" })
    const inputElement = input as HTMLInputElement
    Object.defineProperty(file, "stream", {
      writable: true,
      value: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("chart data"))
            controller.close()
          },
        }),
    })
    Object.defineProperty(inputElement, "files", {
      value: [file],
      writable: false,
    })
    inputElement.dispatchEvent(new Event("change", { bubbles: true }))

    await waitFor(() => {
      const status = JSON.parse(screen.getByTestId("upload-status").textContent ?? "{}") as Record<string, { status: string }>
      expect(status["PT-0001"]).toBeTruthy()
      expect(status["PT-0001"].status).toBe("uploading")
    })

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining("/api/charts/upload"), expect.objectContaining({ method: "POST" }))
    })

    await waitFor(() => {
      const status = JSON.parse(screen.getByTestId("upload-status").textContent ?? "{}") as Record<string, { status: string; progress: number }>
      expect(status["PT-0001"].status).toBe("success")
      expect(status["PT-0001"].progress).toBe(100)
    })

    await waitFor(() => {
      expect(scheduleFetchCount).toBeGreaterThanOrEqual(2)
    })

    await waitFor(() => {
      const logCall = mockedApiFetchJson.mock.calls.find(([request]) => resolveUrl(request) === "/api/activity/log")
      expect(logCall).toBeTruthy()
      expect(logCall?.[1]).toMatchObject({
        method: "POST",
        jsonBody: expect.objectContaining({
          action: "chart.upload",
          details: expect.objectContaining({
            patientId: "PT-0001",
            fileName: "chart.txt",
          }),
        }),
      })
    })

    createElementSpy.mockRestore()
  })

  it("creates an appointment from the builder and triggers a schedule refresh", async () => {
    const { ProtectedApp } = await import("../../ProtectedApp")
    mockCreateAppointment.mockResolvedValue({
      id: 2001,
      patient: "John Doe",
      reason: "Checkup",
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })

    let scheduleFetchCount = 0

    mockedApiFetchJson.mockImplementation(async (input, options) => {
      const url = resolveUrl(input)
      if (url === "/api/user/current-view") {
        return { currentView: "builder" }
      }
      if (url === "/api/schedule/appointments") {
        scheduleFetchCount += 1
        return { appointments: [], visitSummaries: {} }
      }
      if (url === "/api/analytics/drafts") {
        return { drafts: 0 }
      }
      if (url === "/api/activity/log" && options?.method === "POST") {
        return { status: "logged" }
      }
      return null
    })

    mockedApiFetch.mockResolvedValue(new Response(null, { status: 200 }))

    render(<ProtectedApp />)

    await screen.findByText(/schedule builder/i)

    fireEvent.click(await screen.findByRole("button", { name: /new appointment/i }))

    const dialog = await screen.findByRole("dialog")

    fireEvent.change(within(dialog).getByLabelText(/patient name/i), { target: { value: "John Doe" } })
    fireEvent.change(within(dialog).getByLabelText(/patient id/i), { target: { value: "PT-1001" } })

    const appointmentDateInput = within(dialog).getByLabelText(/appointment date/i)
    fireEvent.change(appointmentDateInput, { target: { value: "2024-01-01T09:00" } })
    fireEvent.change(within(dialog).getByLabelText(/chief complaint/i), { target: { value: "Checkup" } })

    fireEvent.click(within(dialog).getByRole("button", { name: /create appointment/i }))

    await waitFor(() => {
      expect(mockCreateAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          patient: "John Doe",
          patientId: "PT-1001",
          reason: "Checkup",
        }),
      )
    })

    await waitFor(() => {
      expect(scheduleFetchCount).toBeGreaterThan(1)
    })
  })
})
