import "@testing-library/jest-dom/vitest"
import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest"

import type { FinalizeResult } from "../../features/finalization"

const wizardRenderSpy = vi.fn()
const storeSessionSpy = vi.fn()

vi.mock("../../contexts/SessionContext", () => ({
  useSession: () => ({
    state: { finalizationSessions: {} },
    actions: { storeFinalizationSession: storeSessionSpy },
  }),
}))

vi.mock("../../features/finalization", () => ({
  FinalizationWizard: (props: any) => {
    wizardRenderSpy(props)
    return <div data-testid="wizard-mock" />
  },
}))

let FinalizationWizardAdapter: typeof import("../FinalizationWizardAdapter").FinalizationWizardAdapter

beforeAll(async () => {
  ;({ FinalizationWizardAdapter } = await import("../FinalizationWizardAdapter"))
})

type FetchWithAuth = (input: RequestInfo | URL, init?: (RequestInit & { json?: boolean; jsonBody?: unknown }) | undefined) => Promise<Response>

const buildResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("FinalizationWizardAdapter finalize & dispatch", () => {
  beforeEach(() => {
    wizardRenderSpy.mockClear()
    storeSessionSpy.mockClear()
  })

  it("runs pre-finalize, finalize, and dispatch in order and stores the finalized note id", async () => {
    const fetchCalls: string[] = []
    const fetchWithAuthMock = vi.fn<Parameters<FetchWithAuth>, ReturnType<FetchWithAuth>>(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
      fetchCalls.push(url)

      if (url.endsWith("/api/notes/pre-finalize-check")) {
        return buildResponse({
          canFinalize: true,
          issues: {},
          reimbursementSummary: { total: 120, codes: [] },
        })
      }

      if (url.endsWith("/api/notes/finalize")) {
        return buildResponse({
          finalizedContent: "Finalized note",
          codesSummary: [],
          reimbursementSummary: { total: 120, codes: [] },
          exportReady: true,
          issues: {},
          canFinalize: true,
          finalizedNoteId: "note-final",
        })
      }

      if (url.includes("/api/v1/workflow/") && url.endsWith("/step6/dispatch")) {
        return buildResponse({
          session: {
            sessionId: "session-123",
            encounterId: "enc-1",
            dispatch: { destination: "ehr" },
            lastValidation: {
              canFinalize: true,
              issues: {},
              reimbursementSummary: { total: 120, codes: [] },
            },
            lastFinalizeResult: {
              finalizedContent: "Finalized note",
              codesSummary: [],
              reimbursementSummary: { total: 120, codes: [] },
              exportReady: true,
              issues: {},
              canFinalize: true,
            },
          },
          result: {
            finalizedContent: "Finalized note",
            codesSummary: [],
            reimbursementSummary: { total: 120, codes: [] },
            exportReady: true,
            issues: {},
          } satisfies FinalizeResult,
        })
      }

      return buildResponse({})
    }) as unknown as FetchWithAuth

    render(
      <FinalizationWizardAdapter
        isOpen
        onClose={vi.fn()}
        selectedCodesList={[]}
        complianceIssues={[]}
        noteContent="Test content"
        patientInfo={{ patientId: "pat-1" }}
        transcriptEntries={[]}
        stepOverrides={[]}
        noteId={null}
        fetchWithAuth={fetchWithAuthMock}
        onError={vi.fn()}
        displayMode="embedded"
        initialPreFinalizeResult={null}
        initialSessionSnapshot={{ sessionId: "session-123", encounterId: "enc-1" } as any}
      />,
    )

    await waitFor(() => {
      expect(wizardRenderSpy).toHaveBeenCalled()
    })

    const latestProps = wizardRenderSpy.mock.lastCall?.[0]
    expect(latestProps?.onFinalizeAndDispatch).toBeInstanceOf(Function)

    const finalizeRequest = {
      content: "Finalized note",
      codes: [],
      prevention: [],
      diagnoses: [],
      differentials: [],
      compliance: [],
    }

    const initialCallCount = fetchCalls.length
    const result = await latestProps.onFinalizeAndDispatch(finalizeRequest, { destination: "ehr" })
    expect(result?.finalizedNoteId).toBe("note-final")

    const newCalls = fetchCalls.slice(initialCallCount)
    expect(newCalls).toHaveLength(3)
    expect(newCalls[0]).toContain("/api/notes/pre-finalize-check")
    expect(newCalls[1]).toContain("/api/notes/finalize")
    expect(newCalls[2]).toContain("/api/v1/workflow/session-123/step6/dispatch")

    await waitFor(() => {
      expect(storeSessionSpy).toHaveBeenCalled()
    })
    const lastStoreCall = storeSessionSpy.mock.calls.at(-1)
    expect(lastStoreCall?.[0]).toBe("session-123")
    expect(lastStoreCall?.[1].noteId).toBe("note-final")
    expect(lastStoreCall?.[1].dispatch).toMatchObject({ destination: "ehr" })
  })
})
