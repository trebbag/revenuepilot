export const VIEW_KEYS = ["home", "app", "finalization", "analytics", "settings", "activity", "drafts", "schedule", "builder", "style-guide", "figma-library"] as const

export type ViewKey = (typeof VIEW_KEYS)[number]

const viewKeySet = new Set<string>(VIEW_KEYS)

const SERVER_ALIAS_MAP: Record<string, ViewKey> = {
  dashboard: "home",
  home: "home",
  documentation: "app",
  document: "app",
  documents: "app",
  doc: "app",
  note: "app",
  notes: "app",
  app: "app",
  analytics: "analytics",
  insights: "analytics",
  settings: "settings",
  configuration: "settings",
  config: "settings",
  profile: "settings",
  activity: "activity",
  "activity-log": "activity",
  audit: "activity",
  drafts: "drafts",
  draft: "drafts",
  schedule: "schedule",
  calendar: "schedule",
  builder: "builder",
  "style-guide": "style-guide",
  styleguide: "style-guide",
  style: "style-guide",
  "figma-library": "figma-library",
  figma: "figma-library",
  library: "figma-library",
  finalization: "finalization",
}

export function isViewKey(value: unknown): value is ViewKey {
  return typeof value === "string" && viewKeySet.has(value)
}

export function resolveViewKey(raw: string | null | undefined): ViewKey | undefined {
  if (typeof raw !== "string") {
    return undefined
  }
  const normalized = raw.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (isViewKey(normalized)) {
    return normalized
  }
  return SERVER_ALIAS_MAP[normalized]
}

export function mapServerViewToViewKey(raw: string | null | undefined, fallback: ViewKey = "app"): ViewKey {
  return resolveViewKey(raw) ?? fallback
}

export function mapViewKeyToServerView(view: ViewKey): string {
  switch (view) {
    case "home":
      return "dashboard"
    case "app":
      return "documentation"
    case "finalization":
      return "finalization"
    case "activity":
      return "activity-log"
    default:
      return view
  }
}
