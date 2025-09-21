import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

const mockedApiFetch = vi.fn()
const mockedApiFetchJson = vi.fn()

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

const sessionActions = {
  addCode: vi.fn(),
  removeCode: vi.fn(),
  changeCodeCategory: vi.fn(),
  setSuggestionPanelOpen: vi.fn(),
  setLayout: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
}

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

vi.mock("../../components/Schedule", () => {
  const React = require("react") as typeof import("react")
  return {
    Schedule: ({ onUploadChart, uploadStatuses }: { onUploadChart?: (patientId: string) => void; uploadStatuses?: Record<string, unknown> }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => onUploadChart?.("PT-0001"),
          },
          "Upload Chart",
        ),
        React.createElement("pre", { "data-testid": "upload-status" }, JSON.stringify(uploadStatuses ?? {})),
      ),
  }
})

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: mockedApiFetch,
    apiFetchJson: mockedApiFetchJson,
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
  beforeAll(() => {
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
  })

  beforeEach(() => {
    mockedApiFetch.mockReset()
    mockedApiFetchJson.mockReset()
    Object.values(sessionActions).forEach((action) => action.mockReset?.())
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
      new Response(JSON.stringify({ filename: "chart.txt", size: 12 }), {
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
})
