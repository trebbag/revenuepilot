function normalizeBase64Url(segment) {
  if (typeof segment !== 'string') return '';
  let normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) {
    normalized += '='.repeat(4 - padding);
  }
  return normalized;
}

export function parseJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadSegment = parts[1];
  try {
    const normalizedPayload = normalizeBase64Url(payloadSegment);
    const decoded = atob(normalizedPayload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
