import { useCallback } from "react"

import {
  FinalizationWizard,
  type FinalizationWizardProps,
  type FinalizeNotePayload,
  type FinalizeNoteResponse
} from "./FinalizationWizard"

type FetchWithAuth = (
  input: RequestInfo | URL,
  init?: (RequestInit & { json?: boolean }) | undefined
) => Promise<Response>

type ComplianceLike = {
  id?: string | null
  title?: string | null
  dismissed?: boolean | null
  [key: string]: unknown
}

export interface PreFinalizeCheckResponse {
  canFinalize: boolean
  issues?: Record<string, unknown>
  estimatedReimbursement?: number
  reimbursementSummary?: {
    total: number
    codes: Array<Record<string, unknown>>
  }
  [key: string]: unknown
}

interface FinalizationWizardAdapterProps
  extends Pick<
    FinalizationWizardProps,
    | "isOpen"
    | "onClose"
    | "selectedCodes"
    | "selectedCodesList"
    | "complianceIssues"
    | "noteContent"
    | "patientInfo"
    | "steps"
  > {
  noteId: string | null
  fetchWithAuth: FetchWithAuth
  onPreFinalizeResult?: (result: PreFinalizeCheckResponse) => void
  onError?: (message: string, error?: unknown) => void
}

const extractCodesByCategory = (list: any[], category: string) => {
  const sanitized = Array.isArray(list) ? list : []
  const matches = sanitized
    .filter(code => {
      if (!code) return false
      if (category === "codes") {
        return code.category === "codes" || code.type === "CPT" || code.type === "HCPCS"
      }
      return code.category === category
    })
    .map(code => (typeof code.code === "string" ? code.code.trim() : ""))
    .filter((code): code is string => code.length > 0)

  return Array.from(new Set(matches))
}

export function FinalizationWizardAdapter({
  isOpen,
  onClose,
  selectedCodes,
  selectedCodesList,
  complianceIssues,
  noteContent,
  patientInfo,
  steps,
  noteId,
  fetchWithAuth,
  onPreFinalizeResult,
  onError
}: FinalizationWizardAdapterProps) {
  const buildFinalizePayload = useCallback((): FinalizeNotePayload => {
    const compliance = (Array.isArray(complianceIssues) ? complianceIssues : [])
      .filter((issue: ComplianceLike) => issue && !issue.dismissed)
      .map(issue => {
        if (!issue) return null
        if (typeof issue.id === "string" && issue.id.trim().length > 0) {
          return issue.id.trim()
        }
        if (typeof issue.title === "string" && issue.title.trim().length > 0) {
          return issue.title.trim()
        }
        return null
      })
      .filter((value): value is string => Boolean(value))

    return {
      content: noteContent,
      codes: extractCodesByCategory(selectedCodesList, "codes"),
      prevention: extractCodesByCategory(selectedCodesList, "prevention"),
      diagnoses: extractCodesByCategory(selectedCodesList, "diagnoses"),
      differentials: extractCodesByCategory(selectedCodesList, "differentials"),
      compliance
    }
  }, [complianceIssues, noteContent, selectedCodesList])

  const handleFinalize = useCallback(
    async (payload?: FinalizeNotePayload): Promise<FinalizeNoteResponse> => {
      const basePayload = payload ?? buildFinalizePayload()
      const payloadWithContext =
        noteId && noteId.trim().length > 0
          ? { ...basePayload, noteId }
          : basePayload

      try {
        const response = await fetchWithAuth("/api/notes/pre-finalize-check", {
          method: "POST",
          body: JSON.stringify(payloadWithContext),
          json: true
        })
        if (!response.ok) {
          throw new Error(`Pre-finalization check failed (${response.status})`)
        }
        const data = (await response.json()) as PreFinalizeCheckResponse
        onPreFinalizeResult?.(data)

        if (!data?.canFinalize) {
          const issueMessages: string[] = []
          if (data?.issues && typeof data.issues === "object") {
            for (const value of Object.values(data.issues)) {
              if (!Array.isArray(value)) continue
              for (const entry of value) {
                if (typeof entry === "string" && entry.trim().length > 0) {
                  issueMessages.push(entry.trim())
                }
              }
            }
          }
          const message = issueMessages.length
            ? `Finalization blocked: ${issueMessages.slice(0, 3).join("; ")}`
            : "Finalization cannot proceed until outstanding issues are resolved."
          throw new Error(message)
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to validate the note before finalization."
        onError?.(message, error)
        throw error
      }

      try {
        const response = await fetchWithAuth("/api/notes/finalize", {
          method: "POST",
          body: JSON.stringify(payloadWithContext),
          json: true
        })
        if (!response.ok) {
          let errorMessage = `Finalization failed (${response.status})`
          try {
            const errorBody = await response.json()
            if (
              typeof errorBody?.detail === "string" &&
              errorBody.detail.trim().length > 0
            ) {
              errorMessage = errorBody.detail
            }
          } catch {
            // Ignore JSON parse errors and fall back to generic message
          }
          throw new Error(errorMessage)
        }
        const data = (await response.json()) as FinalizeNoteResponse
        return data
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to finalize the note."
        onError?.(message, error)
        throw error
      }
    },
    [buildFinalizePayload, fetchWithAuth, noteId, onError, onPreFinalizeResult]
  )

  return (
    <FinalizationWizard
      isOpen={isOpen}
      onClose={onClose}
      selectedCodes={selectedCodes}
      selectedCodesList={selectedCodesList}
      complianceIssues={complianceIssues}
      noteContent={noteContent}
      patientInfo={patientInfo}
      steps={steps}
      onFinalize={handleFinalize}
      onError={onError}
    />
  )
}

