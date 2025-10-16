import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import { SuggestionPanel } from "../SuggestionPanel"
import type { StreamConnectionState } from "../NoteEditor"

const apiFetchMock = vi.fn<
  [RequestInfo | URL, { method?: string; jsonBody?: unknown; signal?: AbortSignal }?],
  Promise<Response>
>()
const apiFetchJsonMock = vi.fn<[RequestInfo | URL, { method?: string; jsonBody?: unknown; signal?: AbortSignal }?], Promise<any>>()

vi.mock("../../lib/api", () => ({
  apiFetch: (input: RequestInfo | URL, options?: { method?: string; jsonBody?: unknown; signal?: AbortSignal }) =>
    apiFetchMock(input, options),
  apiFetchJson: (input: RequestInfo | URL, options?: { method?: string; jsonBody?: unknown; signal?: AbortSignal }) =>
    apiFetchJsonMock(input, options),
}))

const resolveUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  return (input as Request).url
}

const defaultConnectionState = (status: StreamConnectionState["status"], overrides?: Partial<StreamConnectionState>) =>
  ({
    status,
    attempts: 0,
    lastError: null,
    lastConnectedAt: null,
    nextRetryDelayMs: null,
    ...(overrides ?? {}),
  }) satisfies StreamConnectionState

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("SuggestionPanel streaming integration", () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchJsonMock.mockReset()
    apiFetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          model: "test",
          route: "auto",
          job: { jobId: "job-1", model: "test", route: "auto", queuedAt: new Date().toISOString() },
          detail: {},
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    )
    apiFetchJsonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveUrl(input)
      if (url.includes("/api/ai/differentials/generate")) {
        return { differentials: [] }
      }
      if (url.includes("/api/ai/prevention/suggest")) {
        return { recommendations: [] }
      }
      if (url.includes("/api/ai/codes/suggest")) {
        return { suggestions: [] }
      }
      if (url.includes("/api/ai/compliance/check")) {
        return { alerts: [] }
      }
      return {}
    })
  })

  afterEach(() => {
    apiFetchMock.mockReset()
    apiFetchJsonMock.mockReset()
  })

  const baseProps = {
    onClose: vi.fn(),
    selectedCodes: { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
    onUpdateCodes: vi.fn(),
    onAddCode: vi.fn(),
    addedCodes: [] as string[],
    noteContent: "Initial note content.",
    selectedCodesList: [] as any[],
  }

  it("skips REST fallbacks when websocket streams are live", async () => {
    render(
      <SuggestionPanel
        {...baseProps}
        streamingCodes={[{ id: "s1", code: "99213", description: "Office visit", receivedAt: Date.now() }]}
        streamingCompliance={[
          {
            id: "c1",
            severity: "warning",
            title: "Documentation gap",
            description: "Add ROS",
            category: "documentation",
            details: "Missing ROS",
            suggestion: "Capture ROS",
          },
        ]}
        codesConnection={defaultConnectionState("open")}
        complianceConnection={defaultConnectionState("open")}
      />,
    )

    await flushPromises()

    const requestedEndpoints = apiFetchJsonMock.mock.calls.map(([input]) => resolveUrl(input))

    expect(requestedEndpoints.some((url) => url.includes("/api/ai/codes/suggest"))).toBe(false)
    expect(requestedEndpoints.some((url) => url.includes("/api/ai/compliance/check"))).toBe(false)

    const liveBadges = screen.getAllByText((_, element) => element?.textContent === "Live" && element.parentElement?.getAttribute("data-slot") === "badge")
    expect(liveBadges).toHaveLength(2)
    expect(screen.getAllByText(/Live updates are streaming in real time\./)).not.toHaveLength(0)
  })

  it("falls back to REST when streams report errors", async () => {
    const endpoints: string[] = []
    apiFetchJsonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveUrl(input)
      endpoints.push(url)
      if (url.includes("/api/ai/codes/suggest")) {
        return { suggestions: [] }
      }
      if (url.includes("/api/ai/compliance/check")) {
        return { alerts: [] }
      }
      if (url.includes("/api/ai/differentials/generate")) {
        return { differentials: [] }
      }
      if (url.includes("/api/ai/prevention/suggest")) {
        return { recommendations: [] }
      }
      return {}
    })

    render(
      <SuggestionPanel
        {...baseProps}
        noteContent="Offline fallback note."
        streamingCodes={[]}
        streamingCompliance={[]}
        codesConnection={defaultConnectionState("error", { lastError: "Socket failed" })}
        complianceConnection={defaultConnectionState("closed")}
        transcriptCursor="cursor-token"
      />,
    )

    await flushPromises()
    await flushPromises()

    const offlineBadges = screen.getAllByText((_, element) => element?.textContent === "Offline" && element.parentElement?.getAttribute("data-slot") === "badge")
    const retryingBadges = screen.getAllByText((_, element) => element?.textContent === "Retrying" && element.parentElement?.getAttribute("data-slot") === "badge")

    expect(offlineBadges).toHaveLength(1)
    expect(retryingBadges).toHaveLength(1)
    expect(screen.getAllByText(/REST fallback active/)).toHaveLength(2)
    expect(screen.getByText(/Live stream error: Socket failed/)).toBeInTheDocument()
    expect(screen.getByText(/Live stream disconnected\. Retrying shortly\./)).toBeInTheDocument()

    const codesRequest = apiFetchJsonMock.mock.calls.find(([input]) =>
      resolveUrl(input).includes("/api/ai/codes/suggest"),
    )
    expect(codesRequest?.[1]).toBeDefined()
    expect((codesRequest?.[1]?.jsonBody as Record<string, unknown>)?.transcript_cursor).toBe("cursor-token")
  })

  it("renders gap questions from REST responses and dispatches highlight events", async () => {
    const questionEventSpy = vi.spyOn(window, "dispatchEvent")

    apiFetchJsonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveUrl(input)
      if (url.includes("/api/ai/codes/suggest")) {
        return {
          suggestions: [],
          questions: [
            {
              prompt: "Document medication list?",
              why: "No medication history found",
              confidence: 0.72,
              evidence: ["Medication list section"],
            },
          ],
        }
      }
      if (url.includes("/api/ai/compliance/check")) {
        return { alerts: [] }
      }
      if (url.includes("/api/ai/differentials/generate")) {
        return { differentials: [] }
      }
      if (url.includes("/api/ai/prevention/suggest")) {
        return { recommendations: [] }
      }
      return {}
    })

    try {
      render(
        <SuggestionPanel
          {...baseProps}
          streamingCodes={[]}
          streamingCompliance={[]}
          codesConnection={defaultConnectionState("error")}
          complianceConnection={defaultConnectionState("error")}
          transcriptCursor="cursor-questions"
        />,
      )

      await flushPromises()
      await flushPromises()

      await waitFor(() => {
        expect(screen.getByText("Document medication list?")).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText("Document medication list?"))

      const highlightEvent = questionEventSpy.mock.calls.find(([event]) => event.type === "note-evidence-highlight")?.[0]
      expect(highlightEvent).toBeDefined()
      expect((highlightEvent as CustomEvent<{ evidence?: string[] }>).detail?.evidence).toEqual([
        "Medication list section",
      ])
    } finally {
      questionEventSpy.mockRestore()
    }
  })

  it("treats 409 gating responses as silent blocks and proceeds on later 202", async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ blocked: true, reason: "BELOW_THRESHOLD" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const { rerender } = render(
      <SuggestionPanel
        {...baseProps}
        streamingCodes={[]}
        streamingCompliance={[]}
        codesConnection={defaultConnectionState("error")}
        complianceConnection={defaultConnectionState("error")}
      />,
    )

    await flushPromises()

    expect(apiFetchJsonMock).not.toHaveBeenCalled()

    apiFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          allowed: true,
          model: "test",
          route: "auto",
          job: { jobId: "job-2", model: "test", route: "auto", queuedAt: new Date().toISOString() },
          detail: {},
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    )

    rerender(
      <SuggestionPanel
        {...baseProps}
        noteContent={`${baseProps.noteContent}\nAdditional sentence.`}
        streamingCodes={[]}
        streamingCompliance={[]}
        codesConnection={defaultConnectionState("error")}
        complianceConnection={defaultConnectionState("error")}
      />,
    )

    await flushPromises()
    await waitFor(() => {
      expect(apiFetchJsonMock).toHaveBeenCalled()
    })
  })
})
