function parseBoolean(value?: string | null): boolean | null {
  if (value == null) {
    return null
  }
  const normalised = value.trim().toLowerCase()
  if (!normalised) {
    return null
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
    return false
  }
  return null
}

function resolveBooleanWithDefault(
  envName: string,
  fallback: boolean,
): { value: boolean; explicit: boolean } {
  const parsed = parseBoolean(process.env[envName])
  if (parsed == null) {
    return { value: fallback, explicit: false }
  }
  return { value: parsed, explicit: true }
}

const mockResolution = resolveBooleanWithDefault('E2E_MOCK_WS', true)
const realTranscribeResolution = resolveBooleanWithDefault(
  'USE_REAL_TRANSCRIBE_SOCKET',
  !mockResolution.value,
)

export const USE_MOCK_VISIT_STREAMS = mockResolution.value
export const USE_MOCK_VISIT_STREAMS_EXPLICIT = mockResolution.explicit

export const USE_REAL_TRANSCRIBE_SOCKET = realTranscribeResolution.value
export const USE_REAL_TRANSCRIBE_SOCKET_EXPLICIT = realTranscribeResolution.explicit

export function describeVisitStreamMode(): string {
  if (USE_MOCK_VISIT_STREAMS) {
    return 'mock'
  }
  return 'real'
}
