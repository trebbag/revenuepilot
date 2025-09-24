import { useCallback } from "react"
import { useSyncExternalStore } from "react"

import { apiFetch, apiFetchJson } from "../lib/api"

export interface ChartUploadStatus {
  status: "idle" | "uploading" | "success" | "error"
  progress: number
  error?: string
  fileName?: string
}

interface UploadStatusStore {
  getSnapshot: () => Record<string, ChartUploadStatus>
  subscribe: (listener: () => void) => () => void
  setStatus: (patientId: string, status: ChartUploadStatus) => void
  reset: () => void
}

const uploadStatusStore = (() => {
  let statuses: Record<string, ChartUploadStatus> = {}
  const listeners = new Set<() => void>()

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener()
      } catch (error) {
        console.error("uploadStatus listener failed", error)
      }
    })
  }

  const setStatus = (patientId: string, status: ChartUploadStatus) => {
    statuses = {
      ...statuses,
      [patientId]: status,
    }
    notify()
  }

  return {
    getSnapshot: () => statuses,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setStatus,
    reset: () => {
      statuses = {}
      notify()
    },
  }
})()

export function useUploadStatuses(): Record<string, ChartUploadStatus> {
  return useSyncExternalStore(uploadStatusStore.subscribe, uploadStatusStore.getSnapshot, uploadStatusStore.getSnapshot)
}

export interface OpenChartUploadOptions {
  patientId: string
  onProgress?: (progress: number) => void
}

export interface UploadedChartFile {
  doc_id?: string
  name?: string
  hash?: string
  reused?: boolean
  [key: string]: unknown
}

export interface ChartUploadResult {
  correlationId: string | null
  files: UploadedChartFile[]
}

async function logChartUpload(patientId: string, file: File) {
  try {
    await apiFetchJson("/api/activity/log", {
      method: "POST",
      jsonBody: {
        action: "chart.upload",
        category: "chart",
        details: {
          patientId,
          fileName: file.name,
          size: file.size,
        },
      },
    })
  } catch (error) {
    console.error("Failed to log chart upload", error)
  }
}

export function useChartUpload() {
  const openFilePickerAndUpload = useCallback(
    async ({ patientId, onProgress }: OpenChartUploadOptions): Promise<ChartUploadResult | null> => {
      const normalizedPatientId = patientId.trim()
      if (!normalizedPatientId) {
        return null
      }

      if (typeof document === "undefined" || typeof window === "undefined") {
        throw new Error("File uploads are only supported in a browser environment.")
      }

      return new Promise<ChartUploadResult | null>((resolve, reject) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = ".pdf,.txt,.rtf,.doc,.docx,.png,.jpg,.jpeg"
        input.multiple = true
        input.style.position = "fixed"
        input.style.opacity = "0"
        input.style.pointerEvents = "none"
        document.body.appendChild(input)

        const cleanup = () => {
          input.value = ""
          input.remove()
        }

        const handleChange = async () => {
          const files = Array.from(input.files ?? [])
          cleanup()

          if (files.length === 0) {
            resolve(null)
            return
          }

          const totalFiles = files.length
          const aggregatedFiles: UploadedChartFile[] = []
          let lastCorrelationId: string | null = null

          try {
            for (let index = 0; index < files.length; index += 1) {
              const file = files[index]
              const startProgress = Math.round((index / totalFiles) * 100)
              uploadStatusStore.setStatus(normalizedPatientId, {
                status: "uploading",
                progress: startProgress,
                fileName: file.name,
              })
              onProgress?.(startProgress)

              try {
                const formData = new FormData()
                formData.append("file", file)
                const response = await apiFetch(`/api/charts/upload?patient_id=${encodeURIComponent(normalizedPatientId)}`, {
                  method: "POST",
                  body: formData,
                })

                if (!response.ok) {
                  const message = await response.text()
                  throw new Error(message || "Unable to upload chart.")
                }

                let payload: any = null
                try {
                  payload = await response.json()
                } catch {
                  payload = null
                }

                const correlation =
                  (payload && typeof payload.correlation_id === "string" && payload.correlation_id) ||
                  (payload && typeof payload.correlationId === "string" && payload.correlationId) ||
                  null
                if (correlation) {
                  lastCorrelationId = correlation
                }

                const filesFromPayload: UploadedChartFile[] = Array.isArray(payload?.files)
                  ? payload.files
                  : [{ name: file.name }]

                aggregatedFiles.push(...filesFromPayload)

                const progress = Math.round(((index + 1) / totalFiles) * 100)
                uploadStatusStore.setStatus(normalizedPatientId, {
                  status: "success",
                  progress,
                  fileName: file.name,
                })
                onProgress?.(progress)

                await logChartUpload(normalizedPatientId, file)
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to upload chart."
                uploadStatusStore.setStatus(normalizedPatientId, {
                  status: "error",
                  progress: 0,
                  error: message,
                  fileName: file.name,
                })
                onProgress?.(0)
                throw error
              }
            }

            resolve({
              correlationId: lastCorrelationId,
              files: aggregatedFiles,
            })
          } catch (error) {
            reject(error)
          }
        }

        input.addEventListener("change", () => {
          void handleChange()
        }, { once: true })

        input.click()
      })
    },
    [],
  )

  return { openFilePickerAndUpload }
}

export function __resetUploadStatusesForTests() {
  uploadStatusStore.reset()
}

