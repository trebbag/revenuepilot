import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { apiFetch, apiFetchJson } from "../lib/api"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { Textarea } from "./ui/textarea"
import { ComplianceAlert } from "./ComplianceAlert"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Plus, ChevronDown, Info, Undo, Redo, Loader2 } from "lucide-react"

interface ComplianceIssue {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  category: "documentation" | "coding" | "billing" | "quality"
  details: string
  suggestion: string
  learnMoreUrl?: string
  confidence?: number | null
  ruleReferences?: {
    ruleId?: string
    citations?: { title?: string; url?: string; citation?: string }[]
  }[]
  dismissed?: boolean
}

interface TemplateOption {
  id: number | string
  name: string
  content: string
  specialty?: string | null
  payer?: string | null
  description?: string | null
}

interface NoteVersion {
  content: string
  timestamp: string | null
  version: number
}

interface RichTextEditorProps {
  disabled?: boolean
  complianceIssues?: ComplianceIssue[]
  onDismissIssue?: (issueId: string) => void
  onRestoreIssue?: (issueId: string) => void
  onContentChange?: (content: string) => void
  noteId?: string
  autoSaveDelayMs?: number
  initialContent?: string
}

const DEFAULT_NOTE_CONTENT = `SUBJECTIVE:
Patient presents with...

OBJECTIVE:
Vital signs: BP 120/80, HR 72, Temp 98.6°F
Physical exam:

ASSESSMENT:
Primary diagnosis:
Secondary diagnosis:

PLAN:
Treatment plan:
Follow-up:`

const FALLBACK_TEMPLATES: TemplateOption[] = [
  {
    id: "soap",
    name: "SOAP Note",
    description: "Structured note format: Subjective, Objective, Assessment, Plan. Ideal for most clinical encounters and problem-focused visits.",
    content: `SUBJECTIVE:
Chief Complaint:
History of Present Illness:
Review of Systems:
Past Medical History:
Medications:
Allergies:
Social History:

OBJECTIVE:
Vital Signs:
Physical Examination:
Laboratory/Diagnostic Results:

ASSESSMENT:
Primary Diagnosis:
Secondary Diagnoses:
Differential Diagnoses:

PLAN:
Treatment:
Follow-up:
Patient Education:
Return Precautions:`,
  },
  {
    id: "history-physical",
    name: "History & Physical",
    description: "Comprehensive H&P format for new patients, consultations, or detailed evaluations. Includes comprehensive history and thorough physical examination.",
    content: `HISTORY OF PRESENT ILLNESS:

PAST MEDICAL HISTORY:

PAST SURGICAL HISTORY:

MEDICATIONS:

ALLERGIES:

FAMILY HISTORY:

SOCIAL HISTORY:

REVIEW OF SYSTEMS:
Constitutional:
HEENT:
Cardiovascular:
Respiratory:
Gastrointestinal:
Genitourinary:
Musculoskeletal:
Neurological:
Psychiatric:
Endocrine:
Hematologic/Lymphatic:
Allergic/Immunologic:

PHYSICAL EXAMINATION:
General Appearance:
Vital Signs:
HEENT:
Neck:
Cardiovascular:
Respiratory:
Abdomen:
Extremities:
Neurological:

ASSESSMENT AND PLAN:`,
  },
  {
    id: "followup",
    name: "Follow-up Visit",
    description: "Streamlined format for established patients returning for routine follow-up or chronic disease management visits.",
    content: `INTERVAL HISTORY:
Since last visit:
Current symptoms:
Medication compliance:
Side effects:

REVIEW OF SYSTEMS:
Pertinent positives:
Pertinent negatives:

OBJECTIVE:
Vital Signs:
Physical Examination:
Recent Tests/Labs:

ASSESSMENT:
1. [Condition] - [Status: improved/stable/worsened]
2.

PLAN:
Continue current management:
Medication adjustments:
New orders:
Follow-up:
Patient counseling:`,
  },
  {
    id: "wellness",
    name: "Wellness/Preventive",
    description: "Annual wellness visit or preventive care template. Focuses on health maintenance, screening, and prevention strategies.",
    content: `HEALTH MAINTENANCE REVIEW:
Immunizations:
Cancer Screening:
Cardiovascular Risk Assessment:
Lifestyle Factors:

REVIEW OF SYSTEMS:
Constitutional:
Cardiovascular:
Respiratory:
Other systems as indicated:

OBJECTIVE:
Vital Signs including BMI:
Physical Examination:
Screening Tests Reviewed:

ASSESSMENT:
Overall Health Status:
Risk Factors Identified:
Screening Recommendations:

PLAN:
Health Maintenance:
Immunizations Due:
Screening Schedule:
Lifestyle Counseling:
Follow-up Recommendations:`,
  },
  {
    id: "procedure",
    name: "Procedure Note",
    description: "Template for documenting minor office procedures, injections, or therapeutic interventions with pre/post care details.",
    content: `PROCEDURE: [Procedure Name]

INDICATION:

CONSENT:
Risks, benefits, and alternatives discussed with patient.
Patient verbalized understanding and consented to procedure.

PRE-PROCEDURE:
Patient positioned:
Area prepped with:
Local anesthesia:

PROCEDURE DETAILS:
Technique:
Findings:
Complications: None

POST-PROCEDURE:
Hemostasis achieved:
Dressing applied:
Patient tolerated procedure well:

PLAN:
Post-procedure care instructions:
Follow-up:
Return precautions:`,
  },
]

function createGeneratedNoteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getTemplateDescription(template: TemplateOption) {
  if (template.description && template.description.trim().length > 0) {
    return template.description
  }
  const metadata: string[] = []
  if (template.specialty) metadata.push(`Specialty: ${template.specialty}`)
  if (template.payer) metadata.push(`Payer: ${template.payer}`)
  const snippet = (template.content || "").replace(/\s+/g, " ").trim()
  if (snippet) {
    metadata.push(snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet)
  }
  return metadata.join(" • ") || "Template"
}

function formatRelativeTime(date: Date) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleString()
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return "Unknown"
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp
  return parsed.toLocaleString()
}

export function RichTextEditor({ disabled = false, complianceIssues = [], onDismissIssue, onRestoreIssue, onContentChange, noteId, autoSaveDelayMs = 3000, initialContent }: RichTextEditorProps) {
  const [content, setContent] = useState(initialContent ?? DEFAULT_NOTE_CONTENT)
  const [templates, setTemplates] = useState<TemplateOption[]>(FALLBACK_TEMPLATES)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [versionHistory, setVersionHistory] = useState<NoteVersion[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noteIdRef = useRef<string>(noteId ?? createGeneratedNoteId())
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipAutoSaveRef = useRef(false)
  const lastSavedContentRef = useRef<string>(initialContent ?? "")
  const isMountedRef = useRef(true)
  const lastInitialContentRef = useRef<string | undefined>(initialContent)

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined
    }

    const highlightEvidence = (event: Event) => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      const detail = (event as CustomEvent<{ evidence?: unknown }>).detail
      const segments = Array.isArray(detail?.evidence)
        ? detail.evidence
            .map((entry) => {
              if (typeof entry === "string") {
                return entry.trim()
              }
              if (entry == null) {
                return ""
              }
              return String(entry).trim()
            })
            .filter((entry) => entry.length > 0)
        : []

      if (segments.length === 0) {
        return
      }

      const value = textarea.value ?? ""
      if (!value) {
        return
      }

      const lowerValue = value.toLowerCase()
      let selectionStart: number | null = null
      let selectionEnd: number | null = null

      for (const segment of segments) {
        let startIndex = value.indexOf(segment)
        if (startIndex === -1) {
          startIndex = lowerValue.indexOf(segment.toLowerCase())
        }
        if (startIndex === -1) {
          continue
        }
        const endIndex = startIndex + segment.length
        if (selectionStart === null || startIndex < selectionStart) {
          selectionStart = startIndex
        }
        if (selectionEnd === null || endIndex > selectionEnd) {
          selectionEnd = endIndex
        }
      }

      if (selectionStart === null || selectionEnd === null) {
        return
      }

      const highlightStart = selectionStart
      const highlightEnd = selectionEnd

      const focusAndSelect = () => {
        const target = textareaRef.current
        if (!target) {
          return
        }

        const targetValue = target.value ?? ""
        const targetLength = targetValue.length
        const clampedStart = Math.max(0, Math.min(highlightStart, targetLength))
        const clampedEnd = Math.max(clampedStart, Math.min(highlightEnd, targetLength))

        target.focus({ preventScroll: true })
        target.setSelectionRange(clampedStart, clampedEnd, "forward")

        const totalLines = targetValue.length > 0 ? targetValue.split(/\n/).length : 1
        const averageLineHeight = totalLines > 0 ? target.scrollHeight / totalLines : target.scrollHeight
        if (Number.isFinite(averageLineHeight)) {
          const precedingText = targetValue.slice(0, clampedStart)
          const newlineCount = (precedingText.match(/\n/g) ?? []).length
          const scrollPosition = Math.max(0, newlineCount * averageLineHeight - target.clientHeight / 2)
          if (!Number.isNaN(scrollPosition)) {
            target.scrollTop = scrollPosition
          }
        }

        window.requestAnimationFrame(() => {
          const activeTarget = textareaRef.current
          if (!activeTarget) {
            return
          }
          activeTarget.setSelectionRange(clampedStart, clampedEnd, "forward")
        })
      }

      window.requestAnimationFrame(focusAndSelect)
    }

    window.addEventListener("note-evidence-highlight", highlightEvidence as EventListener)

    return () => {
      window.removeEventListener("note-evidence-highlight", highlightEvidence as EventListener)
    }
  }, [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [])

  const handleContentChange = useCallback(
    (newContent: string, options: { skipAutoSave?: boolean } = {}) => {
      if (options.skipAutoSave) {
        skipAutoSaveRef.current = true
      }
      setContent(newContent)
      if (onContentChange) {
        onContentChange(newContent)
      }
    },
    [onContentChange],
  )

  useEffect(() => {
    if (noteId && noteId !== noteIdRef.current) {
      noteIdRef.current = noteId
      lastSavedContentRef.current = initialContent ?? ""
      lastInitialContentRef.current = initialContent
      setVersionHistory([])
      setHistoryIndex(-1)
      setHasLoadedHistory(false)
      setLastSavedTime(null)
      setSaveError(null)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      handleContentChange(initialContent ?? DEFAULT_NOTE_CONTENT, { skipAutoSave: true })
    } else if (!noteId && noteIdRef.current) {
      noteIdRef.current = createGeneratedNoteId()
      lastSavedContentRef.current = initialContent ?? ""
      lastInitialContentRef.current = initialContent
      setVersionHistory([])
      setHistoryIndex(-1)
      setHasLoadedHistory(false)
      setLastSavedTime(null)
      setSaveError(null)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      handleContentChange(initialContent ?? DEFAULT_NOTE_CONTENT, { skipAutoSave: true })
    }
  }, [noteId, initialContent, handleContentChange])

  useEffect(() => {
    if (initialContent === undefined) {
      return
    }
    if (lastInitialContentRef.current === initialContent) {
      return
    }
    lastInitialContentRef.current = initialContent
    lastSavedContentRef.current = initialContent
    handleContentChange(initialContent, { skipAutoSave: true })
  }, [initialContent, handleContentChange])

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true)
        setTemplatesError(null)
        const data =
          (await apiFetchJson<any[]>("/api/templates/list", {
            signal: controller.signal,
            fallbackValue: [],
          })) ?? []
        if (!isActive || !isMountedRef.current) return
        const mapped: TemplateOption[] = Array.isArray(data)
          ? data.map((tpl: any, index: number) => ({
              id: tpl?.id ?? `tpl-${index}`,
              name: typeof tpl?.name === "string" && tpl.name ? tpl.name : `Template ${index + 1}`,
              content: typeof tpl?.content === "string" ? tpl.content : "",
              specialty: tpl?.specialty ?? null,
              payer: tpl?.payer ?? null,
              description: typeof tpl?.description === "string" ? tpl.description : null,
            }))
          : []
        if (mapped.length) {
          setTemplates(mapped)
        } else {
          setTemplates(FALLBACK_TEMPLATES)
        }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        console.error("Failed to load templates", error)
        if (!isActive || !isMountedRef.current) return
        setTemplates(FALLBACK_TEMPLATES)
        setTemplatesError("Unable to load templates")
      } finally {
        if (isActive && isMountedRef.current) {
          setTemplatesLoading(false)
        }
      }
    }

    loadTemplates()
    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  const refreshVersions = useCallback(
    async ({ initialLoad = false, moveToLatest = false, signal }: { initialLoad?: boolean; moveToLatest?: boolean; signal?: AbortSignal } = {}) => {
      const currentNoteId = noteIdRef.current
      if (!currentNoteId) return
      try {
        const payload =
          (await apiFetchJson<any[]>(`/api/notes/versions/${encodeURIComponent(currentNoteId)}`, {
            signal,
            fallbackValue: [],
          })) ?? []
        if (!isMountedRef.current) return
        const normalized: NoteVersion[] = Array.isArray(payload)
          ? payload.map((entry: any, index: number) => ({
              content: typeof entry?.content === "string" ? entry.content : "",
              timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : null,
              version: index + 1,
            }))
          : []
        setVersionHistory(normalized)
        if (normalized.length) {
          lastSavedContentRef.current = normalized[normalized.length - 1]?.content ?? ""
        } else if (initialLoad) {
          lastSavedContentRef.current = ""
        }
        if (initialLoad) {
          if (normalized.length) {
            const latestContent = normalized[normalized.length - 1]?.content ?? ""
            handleContentChange(latestContent, { skipAutoSave: true })
            setHistoryIndex(normalized.length - 1)
          } else {
            setHistoryIndex(-1)
          }
        } else if (moveToLatest) {
          setHistoryIndex(normalized.length ? normalized.length - 1 : -1)
        } else {
          const latestIndex = normalized.length ? normalized.length - 1 : -1
          setHistoryIndex((prev) => (prev > latestIndex ? latestIndex : prev))
        }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        console.error("Failed to load note versions", error)
        if (initialLoad) {
          setVersionHistory([])
          setHistoryIndex(-1)
          lastSavedContentRef.current = ""
        }
      } finally {
        if (isMountedRef.current) {
          setHasLoadedHistory(true)
        }
      }
    },
    [handleContentChange],
  )

  useEffect(() => {
    const controller = new AbortController()
    refreshVersions({ initialLoad: true, signal: controller.signal })
    return () => {
      controller.abort()
    }
  }, [refreshVersions, noteId])

  const saveContent = useCallback(
    async (text: string) => {
      const currentNoteId = noteIdRef.current
      if (!currentNoteId) return
      if (text === lastSavedContentRef.current) return

      if (isMountedRef.current) {
        setIsSaving(true)
        setSaveError(null)
      }

      try {
        const response = await apiFetch(`/api/notes/drafts/${encodeURIComponent(String(currentNoteId))}`, {
          method: "PATCH",
          jsonBody: { content: text },
        })
        if (!response.ok) {
          let message = `Failed to auto-save note (${response.status})`
          try {
            const err = await response.json()
            const detail = typeof err?.message === "string" && err.message.trim().length > 0 ? err.message : typeof err?.detail === "string" && err.detail.trim().length > 0 ? err.detail : ""
            if (detail) {
              message = detail
            }
          } catch {
            // ignore body parsing issues
          }
          throw new Error(message)
        }
        await response.json().catch(() => ({}))
        if (!isMountedRef.current) return
        lastSavedContentRef.current = text
        setIsSaving(false)
        setLastSavedTime(new Date())
        setSaveError(null)
        await refreshVersions({ moveToLatest: true })
      } catch (error) {
        if (!isMountedRef.current) return
        console.error("Auto-save failed", error)
        setIsSaving(false)
        setSaveError("Auto-save failed")
      }
    },
    [refreshVersions],
  )

  useEffect(() => {
    if (!hasLoadedHistory) return
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false
      return
    }
    if (content === lastSavedContentRef.current) return
    if (!noteIdRef.current) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(
      () => {
        void saveContent(content)
      },
      Math.max(500, autoSaveDelayMs),
    )

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [content, autoSaveDelayMs, hasLoadedHistory, saveContent])

  const formatButtons = useMemo(
    () => [
      { icon: Bold, label: "Bold" },
      { icon: Italic, label: "Italic" },
      { icon: Underline, label: "Underline" },
      { icon: List, label: "Bullet List" },
      { icon: ListOrdered, label: "Numbered List" },
      { icon: AlignLeft, label: "Align Left" },
      { icon: AlignCenter, label: "Align Center" },
      { icon: AlignRight, label: "Align Right" },
    ],
    [],
  )

  const insertTextAtCursor = (beforeText: string, afterText: string = "") => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    const newText = content.substring(0, start) + beforeText + selectedText + afterText + content.substring(end)
    handleContentChange(newText)

    setTimeout(() => {
      const newCursorPos = start + beforeText.length + selectedText.length + afterText.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }

  const insertBulletList = () => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    if (selectedText.trim()) {
      const lines = selectedText.split("\n")
      const bulletLines = lines.map((line) => (line.trim() ? `• ${line.trim()}` : line)).join("\n")
      const newText = content.substring(0, start) + bulletLines + content.substring(end)
      handleContentChange(newText)
    } else {
      insertTextAtCursor("• ", "")
    }
  }

  const insertNumberedList = () => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    if (selectedText.trim()) {
      const lines = selectedText.split("\n")
      const numberedLines = lines.map((line, index) => (line.trim() ? `${index + 1}. ${line.trim()}` : line)).join("\n")
      const newText = content.substring(0, start) + numberedLines + content.substring(end)
      handleContentChange(newText)
    } else {
      insertTextAtCursor("1. ", "")
    }
  }

  const handleFormat = (type: string) => {
    if (disabled) return

    switch (type) {
      case "Bold":
        insertTextAtCursor("**", "**")
        break
      case "Italic":
        insertTextAtCursor("*", "*")
        break
      case "Underline":
        insertTextAtCursor("_", "_")
        break
      case "Bullet List":
        insertBulletList()
        break
      case "Numbered List":
        insertNumberedList()
        break
      case "Align Left":
      case "Align Center":
      case "Align Right":
      default:
        break
    }
  }

  const insertSection = () => {
    if (disabled) return
    const sectionText = "\n\nNEW SECTION:\n\n"
    insertTextAtCursor(sectionText, "")
  }

  const handleTemplateSelect = (template: TemplateOption) => {
    handleContentChange(template.content)
  }

  const canUndo = historyIndex > 0
  const canRedo = historyIndex >= 0 && historyIndex < versionHistory.length - 1

  const handleUndo = () => {
    if (!canUndo) return
    const newIndex = Math.max(0, historyIndex - 1)
    const targetVersion = versionHistory[newIndex]
    if (!targetVersion) return
    lastSavedContentRef.current = targetVersion.content
    setHistoryIndex(newIndex)
    handleContentChange(targetVersion.content, { skipAutoSave: true })
  }

  const handleRedo = () => {
    if (!canRedo) return
    const newIndex = Math.min(versionHistory.length - 1, historyIndex + 1)
    const targetVersion = versionHistory[newIndex]
    if (!targetVersion) return
    lastSavedContentRef.current = targetVersion.content
    setHistoryIndex(newIndex)
    handleContentChange(targetVersion.content, { skipAutoSave: true })
  }

  const latestVersions = useMemo(() => {
    return versionHistory.slice(-5).reverse()
  }, [versionHistory])

  const autoSaveStatus = useMemo(() => {
    if (saveError) {
      return <span className="text-destructive">{saveError}</span>
    }
    if (isSaving) {
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving...
        </span>
      )
    }
    if (lastSavedTime) {
      return <span className="text-muted-foreground">Saved {formatRelativeTime(lastSavedTime)}</span>
    }
    if (!hasLoadedHistory) {
      return <span className="text-muted-foreground">Loading history...</span>
    }
    return <span className="text-muted-foreground">No auto-saves yet</span>
  }, [isSaving, lastSavedTime, saveError, hasLoadedHistory])

  return (
    <div className="flex flex-col h-full relative">
      {complianceIssues.length > 0 && (
        <div className="absolute top-3 right-3 z-50 bg-background rounded-md">
          <div className="p-1">
            <ComplianceAlert issues={complianceIssues} onDismissIssue={onDismissIssue || (() => {})} onRestoreIssue={onRestoreIssue || (() => {})} compact={true} />
          </div>
        </div>
      )}

      <div className={`flex flex-col h-full ${disabled ? "opacity-50" : ""}`}>
        <div className="border-b p-3 bg-background">
          <div className="flex items-center gap-1 justify-between">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Undo" disabled={disabled || !canUndo} onClick={handleUndo}>
                <Undo className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Redo" disabled={disabled || !canRedo} onClick={handleRedo}>
                <Redo className="h-4 w-4" />
              </Button>
              <Separator orientation="vertical" className="mx-2 h-6" />
              {formatButtons.map((button) => (
                <Button key={button.label} variant="ghost" size="sm" className="h-8 w-8 p-0" title={button.label} disabled={disabled} onClick={() => handleFormat(button.label)}>
                  <button.icon className="h-4 w-4" />
                </Button>
              ))}
              <Separator orientation="vertical" className="mx-2 h-6" />
              <Button variant="ghost" size="sm" title="Insert Template Section" disabled={disabled} onClick={insertSection}>
                <Plus className="h-4 w-4 mr-1" />
                Section
              </Button>
              <Separator orientation="vertical" className="mx-2 h-6" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8" disabled={disabled}>
                    Templates
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  {templatesLoading && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      Loading templates...
                    </DropdownMenuItem>
                  )}
                  {!templatesLoading && templates.length === 0 && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      No templates available
                    </DropdownMenuItem>
                  )}
                  {!templatesLoading &&
                    templates.map((template) => (
                      <DropdownMenuItem key={template.id} className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => handleTemplateSelect(template)}>
                        <div className="flex-1">
                          <div className="font-medium text-sm mb-1">{template.name}</div>
                          <div className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{getTemplateDescription(template)}</div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  {templatesError && (
                    <DropdownMenuItem disabled className="text-xs text-destructive">
                      {templatesError}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {autoSaveStatus}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!versionHistory.length}>
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-xs font-medium mb-2">Version history</div>
                  {latestVersions.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No versions yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {latestVersions.map((version) => (
                        <div key={version.version} className="space-y-0.5">
                          <div className="font-medium text-xs">Version {version.version}</div>
                          <div className="text-[11px] text-muted-foreground">{formatTimestamp(version.timestamp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-full resize-none border-none shadow-none focus-visible:ring-0"
            placeholder={disabled ? "Start a visit to begin documenting..." : "Start typing your clinical note here..."}
            disabled={disabled}
          />
          {disabled && (
            <div className="absolute inset-0 bg-muted/20 flex items-center justify-center pointer-events-none">
              <div className="text-muted-foreground text-center">
                <p className="font-medium">Visit Not Active</p>
                <p className="text-sm">Start a visit to begin documenting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
