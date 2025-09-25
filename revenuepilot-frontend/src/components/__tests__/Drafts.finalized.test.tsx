import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import "../../../../src/i18n.js"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { apiFetchMock, apiFetchJsonMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn<[
    RequestInfo | URL,
    (RequestInit & { jsonBody?: unknown; returnNullOnEmpty?: boolean; fallbackValue?: unknown }) | undefined,
  ], Promise<Response>>(),
  apiFetchJsonMock: vi.fn<
    [RequestInfo | URL, (RequestInit & { returnNullOnEmpty?: boolean; fallbackValue?: unknown }) | undefined],
    Promise<unknown>
  >(),
}))

const downloadPdfWithFallbackMock = vi.hoisted(() => vi.fn<
  [
    {
      finalizedNoteId: string
      variant: "note" | "summary"
      patientName?: string | null
    },
  ],
  Promise<void>
>())

vi.mock("../ui/dropdown-menu", async () => {
  const actual = await vi.importActual<typeof import("../ui/dropdown-menu")>("../ui/dropdown-menu")
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    ...actual,
    DropdownMenu: ({ children }: { children?: ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
      <div role="menu" data-testid="dropdown-menu-content">
        {children}
      </div>
    ),
    DropdownMenuItem: ({ children, ...props }: { children?: ReactNode }) => (
      <div role="menuitem" {...props}>
        {children}
      </div>
    ),
  }
})

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: apiFetchMock,
    apiFetchJson: apiFetchJsonMock,
  }
})

vi.mock("../../utils/pdfFallback", () => ({
  downloadPdfWithFallback: downloadPdfWithFallbackMock,
}))

describe("Drafts finalized items", () => {
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
  })

  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchJsonMock.mockReset()
    downloadPdfWithFallbackMock.mockReset()
    downloadPdfWithFallbackMock.mockResolvedValue(undefined)
    apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    apiFetchJsonMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url === "/api/notes/drafts") {
        return [
          {
            id: 1,
            content: "Patient ID: PT-001\nEncounter ID: ENC-001\nProvider: Dr. Final\nDraft body",
            status: "finalized",
            finalized_note_id: "fn-123",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          },
        ]
      }
      if (url === "/api/analytics/drafts") {
        return { drafts: 1 }
      }
      if (url === "/api/user/session") {
        return { draftsPreferences: {} }
      }
      return []
    })
  })

  it("renders a final badge and removes editing affordances for finalized notes", async () => {
    const { Drafts } = await import("../Drafts")

    render(<Drafts currentUser={{ id: "clin-1", name: "Dr. Final", fullName: "Dr. Final", role: "user", specialty: "IM" }} />)

    const finalBadge = await screen.findByText("Final")
    expect(finalBadge).toBeInTheDocument()

    const summaryButtons = await screen.findAllByRole("button", {
      name: /download summary pdf for/i,
    })
    expect(summaryButtons[0]).toBeInTheDocument()

    const noteButtons = await screen.findAllByRole("button", {
      name: /download note pdf for/i,
    })
    expect(noteButtons[0]).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/preview/i)).toBeInTheDocument()
    })

    const menuItems = screen.getAllByRole("menuitem")
    expect(menuItems.every((item) => !/edit/i.test(item.textContent ?? ""))).toBe(true)
  })

  it("invokes the PDF download helper when finalized download buttons are clicked", async () => {
    const { Drafts } = await import("../Drafts")

    render(<Drafts currentUser={{ id: "clin-1", name: "Dr. Final", fullName: "Dr. Final", role: "user", specialty: "IM" }} />)

    const summaryButtons = await screen.findAllByRole("button", {
      name: /download summary pdf for/i,
    })

    fireEvent.click(summaryButtons[0])

    await waitFor(() => {
      expect(downloadPdfWithFallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ finalizedNoteId: "fn-123", variant: "summary" }),
      )
    })

    downloadPdfWithFallbackMock.mockClear()

    const noteButtons = await screen.findAllByRole("button", {
      name: /download note pdf for/i,
    })

    fireEvent.click(noteButtons[0])

    await waitFor(() => {
      expect(downloadPdfWithFallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ finalizedNoteId: "fn-123", variant: "note" }),
      )
    })
  })
})
