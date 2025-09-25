import "../../test/setupDom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const html2pdfMocks = vi.hoisted(() => {
  const chain: {
    set: ReturnType<typeof vi.fn>
    from: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  } & Record<string, unknown> = {} as never
  chain.set = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.save = vi.fn(async () => undefined)
  const factory = vi.fn(() => chain)
  return { chain, factory }
})

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}))

global.fetch = vi.fn()

vi.mock("html2pdf.js", () => ({
  default: html2pdfMocks.factory,
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastMocks.error,
    info: vi.fn(),
    success: vi.fn(),
  },
}))

const { downloadPdfWithFallback } = await import("../pdfFallback")

describe("downloadPdfWithFallback", () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("network"))
    html2pdfMocks.factory.mockClear()
    html2pdfMocks.chain.set.mockClear()
    html2pdfMocks.chain.from.mockClear()
    html2pdfMocks.chain.save.mockClear()
    toastMocks.error.mockClear()
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).electronAPI = undefined
  })

  it("uses html2pdf when server download fails and HTML is available", async () => {
    await downloadPdfWithFallback({
      finalizedNoteId: "fn-001",
      variant: "summary",
      summaryHtml: "<p>Summary</p>",
      offlineMessage: "offline",
    })

    expect(html2pdfMocks.factory).toHaveBeenCalledTimes(1)
    expect(html2pdfMocks.chain.set).toHaveBeenCalled()
    expect(html2pdfMocks.chain.from).toHaveBeenCalled()
    expect(html2pdfMocks.chain.save).toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it("invokes the electron exporter when available", async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).electronAPI = { invoke: invokeMock }

    await downloadPdfWithFallback({
      finalizedNoteId: "fn-002",
      variant: "note",
      noteHtml: "<p>Note</p>",
      offlineMessage: "offline",
    })

    expect(invokeMock).toHaveBeenCalledWith(
      "export-note",
      expect.objectContaining({ variant: "note" }),
    )
    expect(html2pdfMocks.chain.save).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it("shows a toast when no fallback can run", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true })

    await downloadPdfWithFallback({
      finalizedNoteId: "fn-003",
      variant: "note",
      offlineMessage: "PDF offline",
    })

    expect(toastMocks.error).toHaveBeenCalledWith("PDF offline")
  })
})
