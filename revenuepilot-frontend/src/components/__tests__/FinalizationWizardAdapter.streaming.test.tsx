import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, beforeEach, vi } from "vitest"

import { FinalizationWizardAdapter } from "../FinalizationWizardAdapter"
import type { StreamConnectionState } from "../NoteEditor"

type FetchWithAuth = (
  input: RequestInfo | URL,
  init?: (RequestInit & { json?: boolean; jsonBody?: unknown }) | undefined
) => Promise<Response>

const wizardRenderSpy = vi.fn()

const fetchWithAuthSpy = vi.fn<
  [RequestInfo | URL, (RequestInit & { json?: boolean; jsonBody?: unknown })?],
  Promise<Response>
>(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  if (url.includes("/api/v1/workflow/sessions")) {
    return new Response(
      JSON.stringify({
        sessionId: "session-1",
        encounterId: "enc-1",
        patientId: "patient-1",
        noteContent: "",
        selectedCodes: [],
        complianceIssues: [],
        reimbursementSummary: {}
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }
  if (url.includes("/api/ai/codes/suggest")) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })
})

const fetchWithAuthMock = fetchWithAuthSpy as unknown as FetchWithAuth

vi.mock("../../contexts/SessionContext", () => ({
  useSession: () => ({
    state: { finalizationSessions: {} },
    actions: { storeFinalizationSession: vi.fn() }
  })
}))

vi.mock("../../features/finalization", () => ({
  FinalizationWizard: (props: any) => {
    wizardRenderSpy(props)
    return <div data-testid="wizard-mock">{props.suggestedCodes?.length ?? 0} suggestions</div>
  }
}))

const defaultConnection = (status: StreamConnectionState["status"], overrides?: Partial<StreamConnectionState>) => ({
  status,
  attempts: 0,
  lastError: null,
  lastConnectedAt: null,
  nextRetryDelayMs: null,
  ...(overrides ?? {})
}) satisfies StreamConnectionState

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  selectedCodesList: [] as any[],
  complianceIssues: [] as any[],
  noteContent: "Example note content",
  patientInfo: undefined,
  transcriptEntries: [] as any[],
  stepOverrides: undefined,
  noteId: "note-1",
  fetchWithAuth: fetchWithAuthMock,
  onPreFinalizeResult: undefined,
  onError: vi.fn(),
  displayMode: "embedded" as const,
  initialPreFinalizeResult: null,
  initialSessionSnapshot: null
}

describe("FinalizationWizardAdapter streaming behaviour", () => {
  beforeEach(() => {
    wizardRenderSpy.mockClear()
    fetchWithAuthSpy.mockClear()
  })

  it("uses streaming suggestions without triggering REST fallbacks", async () => {
    render(
      <FinalizationWizardAdapter
        {...baseProps}
        streamingCodeSuggestions={[
          { id: "live-1", code: "99213", description: "Office visit", receivedAt: Date.now() }
        ]}
        codesConnection={defaultConnection("open")}
        complianceConnection={defaultConnection("open")}
      />
    )

    await waitFor(() => {
      expect(wizardRenderSpy).toHaveBeenCalled()
    })

    const latestCall = wizardRenderSpy.mock.lastCall
    expect(latestCall?.[0].suggestedCodes).toHaveLength(1)

    const suggestionCall = fetchWithAuthSpy.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url).includes(
        "/api/ai/codes/suggest"
      )
    )
    expect(suggestionCall).toBeUndefined()
    const liveBadges = screen.getAllByText(
      (_, element) =>
        element?.textContent === "Live" && element.parentElement?.getAttribute("data-slot") === "badge"
    )
    expect(liveBadges).toHaveLength(2)
  })

  it("falls back to REST when live suggestions are unavailable", async () => {
    render(
      <FinalizationWizardAdapter
        {...baseProps}
        streamingCodeSuggestions={[]}
        codesConnection={defaultConnection("error", { lastError: "Stream offline" })}
        complianceConnection={defaultConnection("closed")}
      />
    )

    await waitFor(() => {
      const hasFallbackCall = fetchWithAuthSpy.mock.calls.some(([input]) =>
        (typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url).includes(
          "/api/ai/codes/suggest"
        )
      )
      expect(hasFallbackCall).toBe(true)
    })

    const offlineBadges = screen.getAllByText(
      (_, element) =>
        element?.textContent === "Offline" && element.parentElement?.getAttribute("data-slot") === "badge"
    )
    const retryingBadges = screen.getAllByText(
      (_, element) =>
        element?.textContent === "Retrying" && element.parentElement?.getAttribute("data-slot") === "badge"
    )
    expect(offlineBadges).toHaveLength(1)
    expect(retryingBadges).toHaveLength(1)
  })
})
