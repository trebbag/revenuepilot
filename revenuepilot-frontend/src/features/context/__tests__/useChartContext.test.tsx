import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"

import type { ContextStageState } from "../../../hooks/useContextStage"
import { useChartContext } from "../useChartContext"

const stageState: ContextStageState = {
  correlationId: null,
  stages: {
    superficial: { state: "completed" },
    deep: { state: "completed" },
    indexed: { state: "completed" },
  },
  profile: null,
  lastUpdated: null,
  bestStage: "indexed",
  availableStages: ["superficial", "deep", "indexed"],
  snapshotUrl: "/snapshot",
  contextGeneratedAt: "2024-02-01T00:00:00Z",
}

const apiFetchJsonMock = vi.fn<[
  RequestInfo | URL,
  RequestInit | undefined,
], Promise<any>>()
const useContextStageMock = vi.fn<[
  string | null,
  { patientId?: string | null } | undefined,
], ContextStageState>(() => stageState)

vi.mock("../../../hooks/useContextStage", () => ({
  useContextStage: (...args: Parameters<typeof useContextStageMock>) => useContextStageMock(...args),
}))

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api")
  return {
    ...actual,
    apiFetchJson: (...args: Parameters<typeof apiFetchJsonMock>) => apiFetchJsonMock(...args),
  }
})

describe("useChartContext", () => {
  beforeEach(() => {
    apiFetchJsonMock.mockReset()
    useContextStageMock.mockClear()
    apiFetchJsonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url
      if (url === "/snapshot") {
        return {
          pmh: [
            {
              label: "Hypertension",
              code: "I10",
              evidence: [
                {
                  sourceDocId: "doc-1",
                  page: 2,
                },
              ],
            },
          ],
          meds: [
            {
              label: "Metformin",
              evidence: [],
            },
          ],
          allergies: [],
          labs: [],
          vitals: [],
          provenance: {
            generated_at: "2024-02-01T00:00:00Z",
            documents: [
              {
                doc_id: "doc-1",
                name: "Intake.pdf",
              },
            ],
          },
        }
      }
      if (typeof url === "string" && url.includes("/context/search")) {
        return {
          results: [
            {
              category: "meds",
              fact: { label: "Metformin" },
            },
          ],
        }
      }
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("loads chart facts when enabled", async () => {
    const { result } = renderHook(() => useChartContext("PT-123", { enabled: true }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(apiFetchJsonMock).toHaveBeenCalledWith("/snapshot", expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(result.current.facts?.pmh).toHaveLength(1)
    expect(result.current.documents).toHaveProperty("doc-1")
    expect(result.current.stageState).toBe(stageState)
    expect(result.current.generatedAt).toBe(stageState.contextGeneratedAt)
  })

  it("performs a search when the query changes", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useChartContext("PT-123", { enabled: true }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      result.current.setSearchQuery("metformin")
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(result.current.filteredFacts?.meds).toHaveLength(1)
    })

    expect(result.current.searching).toBe(false)
    expect(result.current.searchError).toBeNull()
    expect(result.current.filteredFacts?.pmh).toEqual([])
  })
})
