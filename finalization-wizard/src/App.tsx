import React from 'react'
import {
  FinalizationWizard,
  type FinalizeResult,
  type FinalizationWizardProps
} from './components/WorkflowWizard'

type FinalizeRequestInput = Parameters<NonNullable<FinalizationWizardProps['onFinalize']>>[0]

type SessionCodeLike = Record<string, unknown>

type SessionStateResponse = {
  selectedCodesList?: SessionCodeLike[]
  addedCodes?: unknown[]
  currentNote?: Record<string, unknown> | null
  finalizationSessions?: Record<string, unknown>
}

type FinalizationSnapshot = Record<string, unknown>

const TOKEN_STORAGE_KEYS = ['token', 'accessToken', 'authToken'] as const

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storages: Array<Storage | undefined> = [
    typeof window.localStorage !== 'undefined' ? window.localStorage : undefined,
    typeof window.sessionStorage !== 'undefined' ? window.sessionStorage : undefined
  ]

  for (const storage of storages) {
    if (!storage) {
      continue
    }
    for (const key of TOKEN_STORAGE_KEYS) {
      try {
        const value = storage.getItem(key)
        if (typeof value === 'string' && value) {
          return value
        }
      } catch {
        /* ignore storage access errors */
      }
    }
  }

  return null
}

async function fetchSessionState(signal?: AbortSignal): Promise<SessionStateResponse | null> {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch('/api/user/session', {
    method: 'GET',
    headers,
    credentials: 'include',
    signal
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Failed to load session state (${response.status})`)
  }
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as SessionStateResponse
  } catch (error) {
    console.error('Unable to parse session payload', error)
    return null
  }
}

function getFirstFinalizationSession(session: SessionStateResponse | null): FinalizationSnapshot | null {
  if (!session?.finalizationSessions || typeof session.finalizationSessions !== 'object') {
    return null
  }
  for (const value of Object.values(session.finalizationSessions)) {
    if (value && typeof value === 'object') {
      return value as FinalizationSnapshot
    }
  }
  return null
}

function extractObjectArray(value: unknown): SessionCodeLike[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(item => item && typeof item === 'object') as SessionCodeLike[]
}

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function deriveNoteContent(
  session: SessionStateResponse | null,
  snapshot: FinalizationSnapshot | null
): string {
  const snapshotContent = snapshot?.noteContent
  if (typeof snapshotContent === 'string' && snapshotContent.trim().length > 0) {
    return snapshotContent
  }

  const note = session?.currentNote
  if (note && typeof note === 'object') {
    const candidate =
      (note as Record<string, unknown>).content ??
      (note as Record<string, unknown>).text ??
      (note as Record<string, unknown>).note
    if (typeof candidate === 'string') {
      return candidate
    }
  }

  return ''
}

function derivePatientMetadata(
  session: SessionStateResponse | null,
  snapshot: FinalizationSnapshot | null
): FinalizationWizardProps['patientMetadata'] | undefined {
  const snapshotMetadata = snapshot?.patientMetadata
  if (snapshotMetadata && typeof snapshotMetadata === 'object') {
    return snapshotMetadata as FinalizationWizardProps['patientMetadata']
  }

  const note = session?.currentNote
  if (!note || typeof note !== 'object') {
    return undefined
  }

  const patient = (note as Record<string, unknown>).patient
  const source = patient && typeof patient === 'object' ? (patient as Record<string, unknown>) : (note as Record<string, unknown>)

  const name =
    sanitizeString(source.name) ??
    sanitizeString(source.fullName) ??
    sanitizeString(source.displayName) ??
    [sanitizeString(source.firstName), sanitizeString(source.lastName)].filter(Boolean).join(' ')

  const patientId =
    sanitizeString(source.patientId) ??
    sanitizeString(source.id) ??
    sanitizeString((note as Record<string, unknown>).patientId)

  const encounterId =
    sanitizeString(source.encounterId) ??
    sanitizeString((note as Record<string, unknown>).encounterId)

  const encounterDate =
    sanitizeString(source.encounterDate) ??
    sanitizeString(source.date) ??
    sanitizeString((note as Record<string, unknown>).date)

  const sex = sanitizeString(source.sex) ?? sanitizeString(source.gender)
  const ageValue = (source.age ?? (note as Record<string, unknown>).age) as unknown
  const age = typeof ageValue === 'number' && Number.isFinite(ageValue) ? ageValue : undefined

  const metadata: Record<string, unknown> = {}
  if (name) metadata.name = name
  if (patientId) metadata.patientId = patientId
  if (encounterId) metadata.encounterId = encounterId
  if (encounterDate) metadata.encounterDate = encounterDate
  if (sex) metadata.sex = sex
  if (typeof age === 'number') metadata.age = age

  return Object.keys(metadata).length > 0 ? (metadata as FinalizationWizardProps['patientMetadata']) : undefined
}

function simulateFinalize(request: FinalizeRequestInput): FinalizeResult {
  return {
    finalizedContent: request.content.trim(),
    codesSummary: request.codes.map(code => ({ code })),
    reimbursementSummary: {
      total: request.codes.length * 85,
      codes: request.codes.map(code => ({ code, amount: 85 }))
    },
    exportReady: request.compliance.length === 0,
    issues: {
      content: request.content.trim().length < 50 ? ['Content appears too short'] : [],
      codes: request.codes.length ? [] : ['At least one billing code is required'],
      prevention: request.prevention.length ? [] : ['No preventive documentation captured'],
      diagnoses: request.diagnoses.length ? [] : ['At least one diagnosis must be confirmed'],
      differentials: request.differentials.length
        ? []
        : ['Consider documenting differential diagnoses for risk adjustment'],
      compliance: request.compliance
    }
  }
}

export default function App() {
  const [sessionState, setSessionState] = React.useState<SessionStateResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const controller = new AbortController()

    const loadSession = async () => {
      try {
        const data = await fetchSessionState(controller.signal)
        if (!active) {
          return
        }
        setSessionState(data)
        setError(null)
      } catch (err) {
        if (!active) {
          return
        }
        console.error('Failed to load session state for finalization wizard', err)
        setError(err instanceof Error ? err.message : 'Unable to load session state.')
      }
    }

    loadSession().catch(err => console.error('Unexpected session load error', err))

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const finalizationSnapshot = React.useMemo(() => getFirstFinalizationSession(sessionState), [sessionState])

  const selectedCodes = React.useMemo(() => {
    const primary = extractObjectArray(sessionState?.selectedCodesList)
    if (primary.length > 0) {
      return primary
    }
    return extractObjectArray(finalizationSnapshot?.selectedCodes)
  }, [sessionState?.selectedCodesList, finalizationSnapshot])

  const suggestedCodes = React.useMemo(
    () => extractObjectArray(finalizationSnapshot?.suggestedCodes),
    [finalizationSnapshot]
  )

  const complianceItems = React.useMemo(
    () => extractObjectArray(finalizationSnapshot?.complianceIssues),
    [finalizationSnapshot]
  )

  const noteContent = React.useMemo(
    () => deriveNoteContent(sessionState, finalizationSnapshot),
    [sessionState, finalizationSnapshot]
  )

  const patientMetadata = React.useMemo(
    () => derivePatientMetadata(sessionState, finalizationSnapshot),
    [sessionState, finalizationSnapshot]
  )

  React.useEffect(() => {
    if (error) {
      console.warn('Finalization wizard is running without session context:', error)
    }
  }, [error])

  const handleFinalize = React.useCallback(async (request: FinalizeRequestInput) => {
    return simulateFinalize(request)
  }, [])

  return (
    <FinalizationWizard
      selectedCodes={selectedCodes}
      suggestedCodes={suggestedCodes}
      complianceItems={complianceItems}
      noteContent={noteContent}
      patientMetadata={patientMetadata}
      onFinalize={handleFinalize}
    />
  )
}
