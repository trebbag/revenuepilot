import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { Input } from "./ui/input"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { ArrowLeftRight, Clock, Copy, FilePlus2, Mic, MicOff, Search } from "lucide-react"
import { toast } from "sonner"
import type { TranscriptEntry } from "./NoteEditor"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

interface TranscriptGroupItem {
  entry: TranscriptEntry
  originalIndex: number
  flatIndex: number
}

interface TranscriptGroup {
  key: string
  baseKey: string
  speaker: string
  speakerRole: TranscriptEntry["speakerRole"]
  timestampLabel: string
  items: TranscriptGroupItem[]
}

interface SpeakerStyle {
  badge: string
  dot: string
  text: string
}

interface FullTranscriptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: TranscriptEntry[]
  isRecording: boolean
  hasInterimTranscript: boolean
  transcriptionIndex: number
  visitDurationLabel: string
  totalTranscriptWords: number
  averageConfidencePercent: number | null
  currentTranscriptCount: number
  totalTranscribedLines: number
  onInsertEntry: (entry: TranscriptEntry) => void
  speakerStyles: Record<TranscriptEntry["speakerRole"], SpeakerStyle>
  swapSpeakers: boolean
  onToggleSpeakers: () => void
}

export function FullTranscriptModal({
  open,
  onOpenChange,
  entries,
  isRecording,
  hasInterimTranscript,
  transcriptionIndex,
  visitDurationLabel,
  totalTranscriptWords,
  averageConfidencePercent,
  currentTranscriptCount,
  totalTranscribedLines,
  onInsertEntry,
  speakerStyles,
  swapSpeakers,
  onToggleSpeakers,
}: FullTranscriptModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const hasQuery = normalizedQuery.length > 0

  const filteredEntries = useMemo(() => {
    const result: TranscriptGroupItem[] = []
    entries.forEach((entry, index) => {
      if (hasQuery) {
        const textValue = entry.text?.toLowerCase() ?? ""
        const speakerValue = entry.speaker?.toLowerCase() ?? ""
        if (!textValue.includes(normalizedQuery) && !speakerValue.includes(normalizedQuery)) {
          return
        }
      }

      result.push({ entry, originalIndex: index, flatIndex: result.length })
    })

    return result
  }, [entries, hasQuery, normalizedQuery])

  const groups = useMemo(() => {
    const result: TranscriptGroup[] = []
    let currentGroup: TranscriptGroup | null = null

    filteredEntries.forEach((item) => {
      const timestampLabel = Number.isFinite(item.entry.timestamp)
        ? new Date(item.entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : ""
      const baseKey = `${item.entry.speaker}|${timestampLabel}`
      if (!currentGroup || currentGroup.baseKey !== baseKey) {
        currentGroup = {
          key: `${baseKey}-${item.flatIndex}`,
          baseKey,
          speaker: item.entry.speaker,
          speakerRole: item.entry.speakerRole,
          timestampLabel,
          items: [],
        }
        result.push(currentGroup)
      }
      currentGroup.items.push(item)
    })

    return result
  }, [filteredEntries])

  const [activeIndex, setActiveIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const previousQueryRef = useRef<string>("")
  const previousLengthRef = useRef<number>(0)

  useEffect(() => {
    if (!open) {
      setSearchQuery("")
      setActiveIndex(-1)
      previousQueryRef.current = ""
      previousLengthRef.current = 0
      return
    }

    const nextIndex = hasQuery
      ? filteredEntries.length > 0
        ? 0
        : -1
      : filteredEntries.length - 1
    setActiveIndex(nextIndex)
    previousQueryRef.current = normalizedQuery
    previousLengthRef.current = filteredEntries.length
    const timeout = window.setTimeout(() => {
      if (hasQuery) {
        searchInputRef.current?.focus()
      }
    }, 50)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [open, filteredEntries.length, hasQuery, normalizedQuery])

  useEffect(() => {
    if (!open) {
      return
    }

    if (previousQueryRef.current !== normalizedQuery) {
      const nextIndex = hasQuery
        ? filteredEntries.length > 0
          ? 0
          : -1
        : filteredEntries.length - 1
      setActiveIndex(nextIndex)
      previousQueryRef.current = normalizedQuery
      previousLengthRef.current = filteredEntries.length
      return
    }

    if (!hasQuery && filteredEntries.length !== previousLengthRef.current) {
      setActiveIndex(filteredEntries.length - 1)
    } else if (activeIndex >= filteredEntries.length) {
      setActiveIndex(filteredEntries.length - 1)
    }

    previousLengthRef.current = filteredEntries.length
  }, [activeIndex, filteredEntries.length, hasQuery, normalizedQuery, open])

  useEffect(() => {
    if (!open) {
      return
    }

    if (activeIndex >= 0) {
      const node = itemRefs.current[activeIndex]
      if (node) {
        node.scrollIntoView({ block: "center" })
        return
      }
    }

    if (!hasQuery) {
      listEndRef.current?.scrollIntoView({ block: "end" })
    }
  }, [activeIndex, filteredEntries.length, hasQuery, open])

  const highlightMatches = useCallback(
    (text: string): ReactNode => {
      if (!hasQuery || !text) {
        return text
      }
      const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig")
      const parts = text.split(regex)
      return parts.map((part, index) =>
        part.toLowerCase() === normalizedQuery ? (
          <mark key={`${part}-${index}`} className="rounded-sm bg-amber-200 px-1 py-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )
    },
    [hasQuery, normalizedQuery],
  )

  const handleCopy = useCallback(async (entry: TranscriptEntry) => {
    const text = entry.text?.trim()
    if (!text) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      toast.success("Transcript line copied to clipboard")
    } catch (error) {
      console.error("Failed to copy transcript line", error)
      toast.error("Unable to copy transcript line")
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) {
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return
      }
      if (!filteredEntries.length) {
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((prev) => {
          if (prev < filteredEntries.length - 1) {
            return prev + 1
          }
          return hasQuery ? 0 : filteredEntries.length - 1
        })
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((prev) => {
          if (prev <= 0) {
            return hasQuery ? filteredEntries.length - 1 : 0
          }
          return prev - 1
        })
      } else if (event.key === "Enter") {
        if (activeIndex >= 0 && filteredEntries[activeIndex]) {
          event.preventDefault()
          onInsertEntry(filteredEntries[activeIndex].entry)
        }
      }
    },
    [activeIndex, filteredEntries, hasQuery, onInsertEntry, onOpenChange, open],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  useEffect(() => {
    itemRefs.current = []
  }, [filteredEntries.length])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 bg-background border-border"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="text-lg font-medium">Full Transcript</DialogTitle>
              <DialogDescription className="sr-only">
                Real-time transcription of your patient encounter showing the complete conversation history.
              </DialogDescription>
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <>
                    <Mic className="w-4 h-4 text-destructive" />
                    <Badge variant="destructive" className="text-xs">
                      <div className="w-1.5 h-1.5 bg-destructive-foreground rounded-full animate-pulse mr-1"></div>
                      Recording
                    </Badge>
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4 text-muted-foreground" />
                    <Badge variant="secondary" className="text-xs">
                      Paused
                    </Badge>
                  </>
                )}
                {hasInterimTranscript && (
                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border border-amber-200">
                    Live (interim)
                  </Badge>
                )}
              </div>
              <div className={`flex items-center gap-1 text-sm ${isRecording ? "text-destructive" : "text-muted-foreground"}`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono tabular-nums">{visitDurationLabel}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative sm:max-w-xs w-full">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search transcript..."
                    className="pl-9"
                  />
                </div>
                {hasQuery && (
                  <div className="text-xs text-muted-foreground">
                    {filteredEntries.length} match{filteredEntries.length === 1 ? "" : "es"}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant={swapSpeakers ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onToggleSpeakers}
                aria-pressed={swapSpeakers}
                disabled={entries.length === 0}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
                {swapSpeakers ? "Restore speakers" : "Swap speakers"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              {isRecording
                ? "Real-time transcription of your patient encounter. The transcript updates automatically as the conversation continues."
                : "Transcription of your patient encounter. Recording is currently paused - click 'Start Visit' to resume recording and live transcription."}
            </div>

            <div className="space-y-4">
              {hasQuery && entries.length > 0 && filteredEntries.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No transcript entries match “{searchQuery.trim()}”.
                </div>
              )}

              {groups.map((group) => {
                const styles = speakerStyles[group.speakerRole] ?? speakerStyles.other
                return (
                  <div key={group.key} className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className={`text-[11px] font-semibold uppercase tracking-wide ${styles.badge}`}>
                        {group.speaker}
                      </Badge>
                      {group.timestampLabel && (
                        <time className={`text-[11px] font-medium ${styles.text} opacity-80`}>{group.timestampLabel}</time>
                      )}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, itemIndex) => {
                        const isSelected = item.flatIndex === activeIndex
                        const isCurrent = item.originalIndex === transcriptionIndex && isRecording
                        const isInterim = Boolean(item.entry.isInterim)

                        return (
                          <div
                            key={`${item.entry.id}-${item.originalIndex}-${itemIndex}`}
                            ref={(element) => {
                              itemRefs.current[item.flatIndex] = element
                            }}
                            className={`rounded-md border p-3 transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : isCurrent
                                  ? "border-destructive/40 bg-destructive/10"
                                  : "border-border/40 bg-background"
                            }`}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className={`text-sm leading-relaxed flex-1 ${isCurrent ? "font-medium" : ""}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{highlightMatches(item.entry.text)}</span>
                                  {isInterim && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200"
                                    >
                                      Interim
                                    </Badge>
                                  )}
                                </div>
                                {isCurrent && isRecording && (
                                  <span className="inline-block w-2 h-4 bg-destructive ml-1 animate-pulse" aria-hidden="true"></span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="secondary"
                                        onClick={() => onInsertEntry(item.entry)}
                                      >
                                        <FilePlus2 className="w-4 h-4 mr-1" />
                                        Insert
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Insert into note at cursor</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="outline"
                                        onClick={() => handleCopy(item.entry)}
                                      >
                                        <Copy className="w-4 h-4 mr-1" />
                                        Copy
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy transcript line</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {!entries.length && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No transcript available yet. Start the visit to capture the conversation.
                </div>
              )}

              <div ref={listEndRef} />
            </div>

            {isRecording && (
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                  Listening and transcribing...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4 bg-muted/30 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              {currentTranscriptCount} of {totalTranscribedLines} lines transcribed
            </div>
            <div className="flex items-center gap-4">
              <div>Words: {totalTranscriptWords.toLocaleString()}</div>
              <div>Confidence: {averageConfidencePercent !== null ? `${averageConfidencePercent}%` : "N/A"}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
