import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
  apiFetchMock: vi.fn<[
    RequestInfo | URL,
    (RequestInit & { jsonBody?: unknown }) | undefined,
  ], Promise<Response>>(),
  apiFetchJsonMock: vi.fn<[
    RequestInfo | URL,
    (RequestInit & { returnNullOnEmpty?: boolean; fallbackValue?: unknown }) | undefined,
  ], Promise<unknown>>(),
}))

const downloadPdfWithFallbackMock = vi.hoisted(() =>
  vi.fn<
    [
      {
        finalizedNoteId: string
        variant: "note" | "summary"
        patientName?: string | null
        noteHtml?: string | null
        summaryHtml?: string | null
        requestUrl?: string | null
      },
    ],
    Promise<void>
  >(),
)

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: apiMocks.apiFetchMock,
    apiFetchJson: apiMocks.apiFetchJsonMock,
  }
})

vi.mock("../../utils/pdfFallback", () => ({
  downloadPdfWithFallback: downloadPdfWithFallbackMock,
}))

vi.mock("../ui/tabs", async () => {
  const actual = await vi.importActual<typeof import("../ui/tabs")>("../ui/tabs")
  const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Trigger = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  )
  return {
    ...actual,
    Tabs: PassThrough,
    TabsList: PassThrough,
    TabsTrigger: Trigger,
    TabsContent: PassThrough,
  }
})

describe("Analytics dashboard export", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: ResizeObserver,
    })
    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserver
  })

  beforeEach(() => {
    apiMocks.apiFetchMock.mockReset()
    apiMocks.apiFetchJsonMock.mockReset()
    downloadPdfWithFallbackMock.mockReset()
    downloadPdfWithFallbackMock.mockResolvedValue(undefined)
    apiMocks.apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const usage = {
      total_notes: 10,
      beautify: 4,
      suggest: 3,
      summary: 2,
      chart_upload: 1,
      audio: 0,
      avg_note_length: 120,
      daily_trends: [
        {
          day: "2024-01-01",
          total_notes: 10,
          beautify: 4,
          suggest: 3,
          summary: 2,
          chart_upload: 1,
          audio: 0,
        },
      ],
      projected_totals: {},
      event_distribution: {},
    }

    const coding = {
      total_notes: 15,
      denials: 2,
      deficiencies: 1,
      accuracy: 0.9,
      coding_distribution: {},
      outcome_distribution: {},
      accuracy_trend: [
        { day: "2024-01-01", total_notes: 15, denials: 2, deficiencies: 1, accuracy: 0.9 },
      ],
      projections: {},
    }

    const revenue = {
      total_revenue: 25000,
      average_revenue: 5000,
      revenue_by_code: { "99213": 10000, "99214": 15000 },
      revenue_trend: [
        { day: "2024-01-01", total_revenue: 25000, average_revenue: 5000 },
      ],
      projections: {},
      revenue_distribution: {},
    }

    const compliance = {
      compliance_counts: {},
      notes_with_flags: 1,
      total_flags: 1,
      flagged_rate: 0.1,
      compliance_trend: [
        { day: "2024-01-01", notes_with_flags: 1, total_flags: 1 },
      ],
      projections: {},
      compliance_distribution: {},
    }

    const drafts = { drafts: 2 }

    apiMocks.apiFetchJsonMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.startsWith("/api/analytics/usage")) {
        return usage
      }
      if (url.startsWith("/api/analytics/coding-accuracy")) {
        return coding
      }
      if (url.startsWith("/api/analytics/revenue")) {
        return revenue
      }
      if (url.startsWith("/api/analytics/compliance")) {
        return compliance
      }
      if (url === "/api/analytics/drafts") {
        return drafts
      }
      if (url === "/api/user/session") {
        return { analyticsPreferences: {} }
      }
      return null
    })
  })

  it("invokes the PDF exporter for each dashboard", async () => {
    const { Analytics } = await import("../Analytics")

    render(<Analytics userRole="admin" />)

    const triggerExport = async (dashboardId: string, expectedName: string) => {
      const container = document.querySelector<HTMLElement>(`[data-dashboard-id='${dashboardId}']`)
      if (!container) {
        throw new Error(`Missing dashboard container for ${dashboardId}`)
      }
      const exportButton = within(container).getByRole("button", { name: /export pdf/i })
      fireEvent.pointerDown(exportButton)
      fireEvent.pointerUp(exportButton)
      fireEvent.click(exportButton)
      await waitFor(() => expect(downloadPdfWithFallbackMock).toHaveBeenCalledTimes(1))
      const args = downloadPdfWithFallbackMock.mock.calls[0][0]
      expect(args.requestUrl).toBeNull()
      expect(args.noteHtml).toContain(`data-dashboard-id="${dashboardId}"`)
      expect(args.patientName).toBe(expectedName)
      downloadPdfWithFallbackMock.mockClear()
    }

    await triggerExport("billing", "Billing & Coding Dashboard")
    await triggerExport("outcomes", "Health Outcomes Dashboard")
    await triggerExport("quality", "Note Quality Dashboard")
    await triggerExport("staff", "Staff Performance Dashboard")
  })
})

