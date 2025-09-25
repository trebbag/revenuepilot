import { formatDistanceToNow } from "date-fns"
import { Loader2, Search, FileText, AlertCircle, Calendar, Activity, Stethoscope } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { ContextStageState } from "../../hooks/useContextStage"
import type { ChartContextDocument, ChartContextFacts, ChartFactHistoryEntry } from "./useChartContext"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { ScrollArea } from "../../components/ui/scroll-area"
import { Badge } from "../../components/ui/badge"
import { Skeleton } from "../../components/ui/skeleton"
import { cn } from "../../components/ui/utils"

interface ChartContextPanelProps {
  patientId?: string | null
  patientName?: string | null
  facts: ChartContextFacts | null
  filteredFacts: ChartContextFacts | null
  documents: Record<string, ChartContextDocument>
  loading: boolean
  error: string | null
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  searching: boolean
  searchError: string | null
  stageState: ContextStageState
  generatedAt: string | null
}

const CATEGORY_CONFIG: Array<{
  key: keyof ChartContextFacts
  label: string
  icon: React.ReactNode
}> = [
  { key: "pmh", label: "PMH", icon: <Stethoscope className="w-4 h-4" /> },
  { key: "meds", label: "Meds", icon: <Activity className="w-4 h-4" /> },
  { key: "allergies", label: "Allergies", icon: <AlertCircle className="w-4 h-4" /> },
  { key: "labs", label: "Labs", icon: <FileText className="w-4 h-4" /> },
  { key: "vitals", label: "Vitals", icon: <Activity className="w-4 h-4" /> },
]

const STAGE_LABEL: Record<string, string> = {
  superficial: "Superficial",
  deep: "Deep",
  indexed: "Indexed",
}

const EMPTY_FACTS: ChartContextFacts = {
  pmh: [],
  meds: [],
  allergies: [],
  labs: [],
  vitals: [],
  superficialSummary: null,
}

function formatValue(value: unknown, unit?: string | null): string | null {
  if (value == null) {
    return null
  }
  if (typeof value === "number") {
    const formatted = Number.isFinite(value) ? value.toString() : String(value)
    return unit ? `${formatted} ${unit}` : formatted
  }
  if (typeof value === "string") {
    const text = value.trim()
    if (!text) {
      return null
    }
    return unit ? `${text} ${unit}` : text
  }
  return String(value)
}

function formatHistory(history: ChartFactHistoryEntry[] | undefined): Array<{ id: string; text: string }> {
  if (!history || history.length === 0) {
    return []
  }
  return history
    .map((entry, index) => {
      const date = entry?.date || entry?.context || ""
      const value = formatValue(entry?.value, entry?.unit)
      const parts = [date, value, entry?.notes, entry?.detail].filter(
        (part): part is string => typeof part === "string" && part.trim().length > 0,
      )
      if (parts.length === 0) {
        return null
      }
      return {
        id: `${date}-${value}-${index}`,
        text: parts.join(" • "),
      }
    })
    .filter((item): item is { id: string; text: string } => Boolean(item))
}

function deriveStageStatus(stageState: ContextStageState): { text: string; tone: "ready" | "running" | "pending" } {
  const order: Array<"indexed" | "deep" | "superficial"> = ["indexed", "deep", "superficial"]
  const best = stageState.bestStage && (stageState.bestStage as "indexed" | "deep" | "superficial")
  const fallback = best || order.find((stage) => stageState.stages[stage]) || null
  if (!fallback) {
    return { text: "Context unavailable", tone: "pending" }
  }
  const stageInfo = stageState.stages[fallback]
  const stageLabel = STAGE_LABEL[fallback] || fallback
  if (stageInfo?.state === "completed") {
    return { text: `${stageLabel} context ready`, tone: "ready" }
  }
  if (stageInfo?.state === "running") {
    return { text: `${stageLabel} parsing…`, tone: "running" }
  }
  return { text: `${stageLabel} stage`, tone: "pending" }
}

export function ChartContextPanel({
  patientId,
  patientName,
  facts,
  filteredFacts,
  documents,
  loading,
  error,
  searchQuery,
  onSearchQueryChange,
  searching,
  searchError,
  stageState,
  generatedAt,
}: ChartContextPanelProps) {
  const stageStatus = useMemo(() => deriveStageStatus(stageState), [stageState])
  const displayFacts = filteredFacts ?? facts ?? EMPTY_FACTS
  const [activeTab, setActiveTab] = useState<keyof ChartContextFacts>("pmh")
  const [expandedFact, setExpandedFact] = useState<string | null>(null)

  useEffect(() => {
    const nextTab = CATEGORY_CONFIG.find((category) => displayFacts[category.key]?.length)
    if (nextTab && nextTab.key !== activeTab) {
      setActiveTab(nextTab.key)
      setExpandedFact(null)
    }
  }, [displayFacts, activeTab])

  const pendingStage = useMemo(() => {
    const running = Object.entries(stageState.stages).find(([, info]) => info?.state === "running")
    if (!running) {
      return null
    }
    const [stage] = running
    return STAGE_LABEL[stage] || stage
  }, [stageState.stages])

  const handleToggleFact = (factId: string) => {
    setExpandedFact((current) => (current === factId ? null : factId))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Readable chart</h2>
          <p className="text-sm text-muted-foreground">
            {patientName?.trim()
              ? `Patient: ${patientName.trim()}`
              : patientId?.trim()
                ? `Patient ID: ${patientId.trim()}`
                : "Select a patient to review chart context."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={stageStatus.tone === "ready" ? "default" : stageStatus.tone === "running" ? "secondary" : "outline"}
            className="text-xs"
          >
            {stageStatus.text}
          </Badge>
          {generatedAt && (
            <span className="text-xs text-muted-foreground">
              Generated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search chart facts"
              className="pl-9"
            />
          </div>
          {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {searchError && <p className="text-xs text-destructive">{searchError}</p>}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {pendingStage && stageStatus.tone !== "ready" && !error && (
        <div className="rounded-md border border-dashed border-muted px-3 py-2 text-xs text-muted-foreground">
          {pendingStage} context is processing. Structured facts will appear automatically when ready.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as keyof ChartContextFacts)} className="space-y-4">
        <TabsList className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CATEGORY_CONFIG.map((category) => {
            const count = displayFacts[category.key]?.length ?? 0
            return (
              <TabsTrigger
                key={category.key}
                value={category.key}
                className={cn("flex items-center justify-center gap-2 text-xs", count === 0 && "text-muted-foreground")}
              >
                {category.icon}
                <span>{category.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {count}
                </Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {CATEGORY_CONFIG.map((category) => {
          const entries = displayFacts[category.key] ?? []
          const loadingSkeleton = loading && entries.length === 0
          return (
            <TabsContent key={category.key} value={category.key} className="mt-0">
              <ScrollArea className="h-[60vh] pr-4">
                <div className="space-y-3">
                  {loadingSkeleton && (
                    <>
                      {[0, 1, 2].map((index) => (
                        <Card key={index} className="border-muted">
                          <CardHeader className="pb-3">
                            <Skeleton className="h-4 w-32" />
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-1/2" />
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )}

                  {!loadingSkeleton && entries.length === 0 && (
                    <div className="rounded-md border border-dashed border-muted px-3 py-8 text-center text-sm text-muted-foreground">
                      No {category.label.toLowerCase()} details available.
                    </div>
                  )}

                  {entries.map((fact, index) => {
                    const factId = `${category.key}-${fact.code || fact.rxnorm || fact.label || index}`
                    const value = formatValue(fact.value, fact.unit)
                    const history = formatHistory(fact.history)
                    const isExpanded = expandedFact === factId
                    const anchors = fact.evidence ?? []
                    return (
                      <Card key={factId} className="border-muted">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            {fact.label || fact.code || fact.rxnorm || "Unknown entry"}
                          </CardTitle>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {fact.code && <Badge variant="outline">{fact.code}</Badge>}
                            {fact.rxnorm && <Badge variant="outline">RxNorm {fact.rxnorm}</Badge>}
                            {fact.snomed && <Badge variant="outline">SNOMED {fact.snomed}</Badge>}
                            {fact.status && <Badge variant="secondary">{fact.status}</Badge>}
                            {fact.date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {fact.date}
                              </span>
                            )}
                            {value && <span>{value}</span>}
                            {fact.frequency && <span>{fact.frequency}</span>}
                            {fact.route && <span>{fact.route}</span>}
                            {fact.dose_text && <span>{fact.dose_text}</span>}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {history.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">History</p>
                              <ul className="space-y-1 text-xs text-muted-foreground">
                                {history.map((item) => (
                                  <li key={item.id}>{item.text}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {anchors.length > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-2 px-2 text-xs"
                              onClick={() => handleToggleFact(factId)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Sources ({anchors.length})
                            </Button>
                          )}

                          {isExpanded && anchors.length > 0 && (
                            <div className="rounded-md bg-muted/40 p-3 text-xs">
                              <p className="mb-2 font-medium text-muted-foreground">Source documents</p>
                              <ul className="space-y-1">
                                {anchors.map((anchor, anchorIndex) => {
                                  const doc = anchor.sourceDocId ? documents[anchor.sourceDocId] : null
                                  const name = doc?.name || anchor.sourceName || anchor.sourceDocId || "Document"
                                  const page = anchor.page ? ` · Page ${anchor.page}` : ""
                                  return (
                                    <li key={`${factId}-anchor-${anchorIndex}`}>
                                      {name}
                                      {page}
                                      {typeof anchor.offset === "number" && (
                                        <span className="text-muted-foreground"> · Offset {anchor.offset}</span>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

export default ChartContextPanel
