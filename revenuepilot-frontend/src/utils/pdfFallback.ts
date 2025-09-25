import html2pdf from "html2pdf.js"
import { toast } from "sonner"

type PdfVariant = "note" | "summary"

export interface PdfFallbackOptions {
  finalizedNoteId: string
  variant: PdfVariant
  patientName?: string | null
  noteHtml?: string | null
  summaryHtml?: string | null
  offlineMessage?: string
}

const getElectronApi = () =>
  typeof window !== "undefined"
    ? (window as { electronAPI?: { invoke?: (...args: unknown[]) => Promise<unknown> } }).electronAPI
    : undefined

const sanitizeFilename = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) {
    return "document"
  }
  return trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

const buildFilename = (patientName: string | undefined | null, variant: PdfVariant) => {
  const base = patientName ? sanitizeFilename(patientName) : "note"
  return `${base || "note"}-${variant}.pdf`
}

const createDownloadFromBlob = (blob: Blob, filename: string) => {
  const blobUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = blobUrl
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(blobUrl)
}

const getHtmlForVariant = (variant: PdfVariant, noteHtml?: string | null, summaryHtml?: string | null) => {
  if (variant === "note") {
    return noteHtml ?? null
  }
  return summaryHtml ?? null
}

export async function downloadPdfWithFallback(options: PdfFallbackOptions): Promise<void> {
  const { finalizedNoteId, variant, patientName, noteHtml, summaryHtml, offlineMessage = "PDF unavailable offline." } = options

  const filename = buildFilename(patientName ?? undefined, variant)
  const requestUrl = `/api/notes/${encodeURIComponent(finalizedNoteId)}/pdf?variant=${variant}`

  if (typeof window !== "undefined" && window.navigator?.onLine !== false) {
    try {
      const response = await fetch(requestUrl, { credentials: "include" })
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`)
      }
      const blob = await response.blob()
      if (blob.size <= 0) {
        throw new Error("Empty PDF response")
      }
      createDownloadFromBlob(blob, filename)
      return
    } catch (error) {
      console.error("Primary PDF download failed", error)
    }
  }

  const electronAPI = getElectronApi()
  const htmlForVariant = getHtmlForVariant(variant, noteHtml, summaryHtml)

  if (electronAPI?.invoke && htmlForVariant) {
    try {
      await electronAPI.invoke("export-note", {
        beautified: noteHtml ?? htmlForVariant,
        summary: summaryHtml ?? htmlForVariant,
        variant,
      })
      return
    } catch (error) {
      console.error("Electron PDF fallback failed", error)
    }
  }

  if (htmlForVariant) {
    try {
      const element = document.createElement("div")
      element.innerHTML = htmlForVariant
      await html2pdf()
        .set({ filename, margin: 12, html2canvas: { scale: 2 } })
        .from(element)
        .save()
      return
    } catch (error) {
      console.error("html2pdf fallback failed", error)
    }
  }

  toast.error(offlineMessage)
}
