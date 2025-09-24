import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Circle,
  AlertCircle,
  Target,
  Lightbulb,
  Settings,
  Eye,
  EyeOff,
  Filter,
  FileText,
  ClipboardCheck,
  Highlighter,
  HelpCircle,
  MessageSquare,
  Shield,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PatientQuestionsPopup } from "./PatientQuestionsPopup"

interface Item {
  id: number
  title: string
  status?: "pending" | "completed" | "in-progress" | "confirmed"
  details?: string
  priority?: "high" | "medium" | "low"
  category?: "ICD-10" | "CPT" | "Public Health"
  codeType?: string
  why?: string
  how?: string
  what?: string
  gaps?: string[]
  evidence?: string[]
  [key: string]: unknown
}

interface PatientQuestion {
  id: number
  question: string
  source: string
  priority: "high" | "medium" | "low"
  codeRelated: string
  category: "clinical" | "administrative" | "documentation"
}

interface Step {
  id: number
  title: string
  description: string
  type?: string
  stepType?: "selected" | "suggested"
  totalSelected?: number
  totalSuggestions?: number
  items?: Item[]
  existingCodes?: any[]
  suggestedCodes?: any[]
  patientQuestions?: PatientQuestion[]
}

interface StepContentProps {
  step: Step
  onNext: () => void
  onPrevious: () => void
  onActiveItemChange?: (item: Item | null) => void
  onShowEvidence?: (show: boolean) => void
  patientQuestions?: PatientQuestion[]
  onUpdatePatientQuestions?: (questions: PatientQuestion[]) => void
  showPatientTray?: boolean
  onShowPatientTray?: (show: boolean) => void
  onInsertToNote?: (text: string) => void
}

const formatList = (values: string[], limit = 3): string | undefined => {
  if (!values || !values.length) return undefined
  const items = values.filter((value) => typeof value === "string" && value.trim().length > 0)
  if (!items.length) return undefined
  const slice = items.slice(0, limit)
  if (slice.length === 1) return slice[0]
  if (slice.length === 2) return `${slice[0]} and ${slice[1]}`
  const head = slice.slice(0, -1).join(", ")
  const tail = slice[slice.length - 1]
  return `${head}, and ${tail}`
}

const buildNarrative = (
  stepId: number,
  title: string,
  detailText: string | undefined,
  evidence: string[],
  gaps: string[],
): { why: string; how: string; what: string } => {
  const safeTitle = title || "This code"
  const safeDetail = detailText && detailText.length ? detailText : `Review documentation supporting ${safeTitle}.`
  const evidenceSummary = formatList(evidence)
  const gapSummary = formatList(gaps)

  if (stepId === 1) {
    return {
      why: safeDetail,
      how: evidenceSummary
        ? `Confirm the note references ${evidenceSummary} to justify ${safeTitle}.`
        : `Review the note to ensure it clearly supports ${safeTitle}.`,
      what: gapSummary
        ? `Plan to document ${gapSummary} before finalizing.`
        : `No outstanding documentation gaps identified for ${safeTitle}.`,
    }
  }

  if (stepId === 2) {
    return {
      why: detailText
        ? `Consider ${safeTitle}: ${safeDetail}`
        : `Consider whether ${safeTitle} applies to this encounter.`,
      how: evidenceSummary
        ? `Accept the code if documentation already includes ${evidenceSummary}.`
        : `Accept only when documentation clearly supports ${safeTitle}.`,
      what: gapSummary
        ? `If adopted, update the note to cover ${gapSummary}.`
        : `No additional documentation is required if you accept ${safeTitle}.`,
    }
  }

  return {
    why: safeDetail,
    how: evidenceSummary ? `Reference ${evidenceSummary}.` : `Review supporting documentation.`,
    what: gapSummary ? `Address: ${gapSummary}.` : `No outstanding actions required.`,
  }
}

// Enhanced items with step-specific properties
const enhancedItems = (originalItems: any[], stepId: number) => {
  if (!originalItems || !Array.isArray(originalItems)) return []

  return originalItems
    .map((item, index) => {
      if (!item || !item.id || !item.title) return null

      const priority = ["high", "medium", "low"][index % 3] as "high" | "medium" | "low"

      // New category system based on code types
      let category: "ICD-10" | "CPT" | "Public Health"
      if (item.codeType === "CPT") {
        category = "CPT"
      } else if (item.codeType === "Public Health") {
        category = "Public Health"
      } else {
        category = "ICD-10" // Default for ICD-10 and other diagnostic codes
      }

      const detailText = typeof item.details === "string" ? item.details.trim() : ""
      const evidence = Array.isArray(item.evidence) ? item.evidence : []
      const gaps = Array.isArray(item.gaps) ? item.gaps : []
      const narrative = buildNarrative(stepId, title, detailText || undefined, evidence, gaps)

      return {
        ...item,
        priority,
        category,
        codeType: item.codeType || "ICD-10", // Ensure codeType is preserved
        why: narrative.why,
        how: narrative.how,
        what: narrative.what,
      }
    })
    .filter(Boolean)
}

export function StepContent({
  step,
  onNext,
  onPrevious,
  onActiveItemChange,
  onShowEvidence,
  patientQuestions = [],
  onUpdatePatientQuestions,
  showPatientTray: externalShowPatientTray,
  onShowPatientTray,
  onInsertToNote,
}: StepContentProps) {
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [items, setItems] = useState(step.items ? enhancedItems(step.items, step.id) : [])
  const [hideCompleted, setHideCompleted] = useState(false)
  const [showItemsPanel, setShowItemsPanel] = useState(false)
  const [isCarouselHovered, setIsCarouselHovered] = useState(false)
  const [isEvidenceActive, setIsEvidenceActive] = useState(false)
  // Use external control for patient tray if provided, otherwise use internal state
  const showPatientTray = externalShowPatientTray !== undefined ? externalShowPatientTray : false
  const setShowPatientTray = onShowPatientTray || (() => {})

  // Simplified filtering state
  const [expandedSection, setExpandedSection] = useState<"priority" | "category" | "status" | null>(null)
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set())

  // Filter items based on hideCompleted state
  const filteredItems = hideCompleted ? items.filter((item) => item && item.status !== "completed") : items

  // Adjust activeItemIndex if current item is filtered out
  const adjustedActiveIndex = filteredItems.length > 0 ? Math.min(Math.max(0, activeItemIndex), filteredItems.length - 1) : 0
  const activeItem = filteredItems.length > 0 ? filteredItems[adjustedActiveIndex] : null
  const activeEvidence = useMemo(() => {
    if (!activeItem) return []
    const evidence = (activeItem as any).evidence
    if (!Array.isArray(evidence)) return []
    return evidence.filter((entry: unknown): entry is string => typeof entry === "string" && entry.trim().length > 0)
  }, [activeItem])
  const activeGaps = useMemo(() => {
    if (!activeItem) return []
    const gaps = (activeItem as any).gaps
    if (!Array.isArray(gaps)) return []
    return gaps.filter((entry: unknown): entry is string => typeof entry === "string" && entry.trim().length > 0)
  }, [activeItem])
  const activeClassifications = useMemo(() => {
    if (!activeItem) return []
    const classifications = (activeItem as any).classifications
    if (!Array.isArray(classifications)) return []
    return classifications.filter((entry: unknown): entry is string => typeof entry === "string" && entry.trim().length > 0)
  }, [activeItem])

  const hasContextEstablishedGap = Boolean(
    activeItem &&
      Array.isArray((activeItem as any).gaps) &&
      (activeItem as any).gaps.some((gap: unknown) => typeof gap === "string" && gap.toLowerCase().includes("context") && gap.toLowerCase().includes("established")),
  )

  const showContextEstablishedBanner = (typeof step?.id === "number" && step.id === 1) || hasContextEstablishedGap

  // Notify parent when active item changes
  useEffect(() => {
    if (onActiveItemChange) {
      onActiveItemChange(activeItem)
    }
  }, [activeItem, onActiveItemChange])

  useEffect(() => {
    setIsEvidenceActive(false)
  }, [activeItem?.id])

  useEffect(() => {
    if (onShowEvidence) {
      onShowEvidence(isEvidenceActive)
    }
    return () => {
      if (onShowEvidence) {
        onShowEvidence(false)
      }
    }
  }, [isEvidenceActive, onShowEvidence])

  const updateItemStatus = (itemId: number, status: Item["status"]) => {
    setItems((prev) => {
      if (!prev || !Array.isArray(prev)) return prev
      return prev.map((item) => (item && item.id === itemId ? { ...item, status } : item))
    })
  }

  const getStatusIcon = (status: Item["status"]) => {
    if (!status) return <Circle size={14} className="text-slate-400" />

    switch (status) {
      case "completed":
      case "confirmed":
        return <Check size={14} className="text-emerald-600" />
      case "in-progress":
        return <AlertCircle size={14} className="text-amber-500" />
      default:
        return <Circle size={14} className="text-slate-400" />
    }
  }

  const getCategoryColors = (category: Item["category"]) => {
    if (!category) return "bg-slate-50 border-slate-200 text-slate-700"

    switch (category) {
      case "ICD-10":
        return "bg-blue-50 border-blue-200 text-blue-700"
      case "CPT":
        return "bg-green-50 border-green-200 text-green-700"
      case "Public Health":
        return "bg-purple-50 border-purple-200 text-purple-700"
      default:
        return "bg-slate-50 border-slate-200 text-slate-700"
    }
  }

  const getPriorityIndicator = (priority: Item["priority"]) => {
    if (!priority) return <div className="w-2 h-2 bg-slate-500 rounded-full" />

    switch (priority) {
      case "high":
        return <div className="w-2 h-2 bg-red-500 rounded-full" />
      case "medium":
        return <div className="w-2 h-2 bg-amber-500 rounded-full" />
      case "low":
        return <div className="w-2 h-2 bg-green-500 rounded-full" />
      default:
        return <div className="w-2 h-2 bg-slate-500 rounded-full" />
    }
  }

  const getGroupedItems = (groupBy: "priority" | "category" | "status") => {
    const groups: { [key: string]: typeof filteredItems } = {}

    filteredItems.forEach((item) => {
      if (!item) return
      let groupKey: string

      switch (groupBy) {
        case "priority":
          groupKey = item.priority || "unknown"
          break
        case "category":
          groupKey = item.category || "unknown"
          break
        case "status":
          groupKey = item.status || "unknown"
          break
        default:
          groupKey = "unknown"
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
    })

    return groups
  }

  const toggleSection = (section: "priority" | "category" | "status") => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="h-full flex flex-col">
      {/* Step Header - Matched height with left panel */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-white/30 px-4 py-6 shadow-lg shadow-slate-900/10">
        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-medium ${
                  step.stepType === "selected"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                    : step.stepType === "suggested"
                      ? "bg-gradient-to-r from-violet-500 to-purple-600"
                      : "bg-gradient-to-r from-blue-500 to-indigo-600"
                }`}
              >
                {step.stepType === "selected" ? "✓" : step.stepType === "suggested" ? <Zap size={14} className="text-white" /> : step.id}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    className={`font-semibold ${
                      step.id === 1
                        ? "text-xl bg-gradient-to-r from-slate-800 to-emerald-700 bg-clip-text text-transparent"
                        : step.id === 2
                          ? "text-xl bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent"
                          : "text-slate-800"
                    }`}
                  >
                    {step.title}
                  </h2>
                  {step.stepType && (
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${step.stepType === "selected" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                      {step.stepType === "selected" ? "Your Codes" : "AI Suggestions"}
                    </span>
                  )}
                </div>
                {step.id !== 1 && <p className="text-sm text-slate-600">{step.description}</p>}
              </div>
            </div>

            {/* Selected/Suggested counter - clean text-based styling */}
            {(step.id === 1 || step.id === 2) && (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-emerald-600" />
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-emerald-700">Selected:</span>
                    <span className="text-sm font-bold text-emerald-800">{step.totalSelected || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-violet-600" />
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-violet-700">AI Suggested:</span>
                    <span className="text-sm font-bold text-violet-800">{step.totalSuggestions || 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Streamlined Progress Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Progress</span>
              <span className="text-slate-500">
                {items.filter((item) => item && item.status === "completed").length}/{items.length}
              </span>
            </div>

            {/* Main progress bar */}
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <motion.div
                className={`h-1.5 rounded-full ${
                  step.stepType === "selected"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : step.stepType === "suggested"
                      ? "bg-gradient-to-r from-violet-500 to-purple-500"
                      : "bg-gradient-to-r from-blue-500 to-indigo-500"
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${items.length > 0 ? (items.filter((item) => item && item.status === "completed").length / items.length) * 100 : 0}%`,
                }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Carousel Area - 30% of full screen height */}
      <div className="flex-none relative group" style={{ height: "30vh" }} onMouseEnter={() => setIsCarouselHovered(true)} onMouseLeave={() => setIsCarouselHovered(false)}>
        {/* Navigation Controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowItemsPanel(true)}
              className="font-medium text-slate-700 text-sm bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm hover:bg-white hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-200 flex items-center gap-1"
            >
              <Filter size={12} />
              Items ({filteredItems.length}
              {hideCompleted && items.length !== filteredItems.length ? ` of ${items.length}` : ""})
            </button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newHideCompleted = !hideCompleted
                setHideCompleted(newHideCompleted)
                setActiveItemIndex(0)
              }}
              className="h-7 px-2 bg-white/90 backdrop-blur-sm border-slate-200 hover:bg-white text-xs"
              title={hideCompleted ? "Show completed items" : "Hide completed items"}
            >
              {hideCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
              <span className="ml-1">{hideCompleted ? "Show" : "Hide"} Done</span>
            </Button>
          </div>

          {/* Top Right Arrow Controls */}
          {filteredItems.length > 1 && (
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200/50 p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newIndex = adjustedActiveIndex > 0 ? adjustedActiveIndex - 1 : filteredItems.length - 1
                  const originalIndex = items.findIndex((item) => item.id === filteredItems[newIndex].id)
                  setActiveItemIndex(originalIndex)
                }}
                className="h-6 w-6 p-0 hover:bg-slate-100"
                disabled={filteredItems.length <= 1}
              >
                <ChevronLeft size={14} />
              </Button>
              <div className="text-xs text-slate-600 px-2 font-medium min-w-[3rem] text-center">
                {adjustedActiveIndex + 1}/{filteredItems.length}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newIndex = adjustedActiveIndex < filteredItems.length - 1 ? adjustedActiveIndex + 1 : 0
                  const originalIndex = items.findIndex((item) => item.id === filteredItems[newIndex].id)
                  setActiveItemIndex(originalIndex)
                }}
                className="h-6 w-6 p-0 hover:bg-slate-100"
                disabled={filteredItems.length <= 1}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>

        {/* Side Arrow Controls - Only show on carousel hover */}
        <AnimatePresence>
          {filteredItems.length > 1 && isCarouselHovered && (
            <>
              {/* Left Arrow */}
              <motion.button
                onClick={() => {
                  const newIndex = adjustedActiveIndex > 0 ? adjustedActiveIndex - 1 : filteredItems.length - 1
                  const originalIndex = items.findIndex((item) => item.id === filteredItems[newIndex].id)
                  setActiveItemIndex(originalIndex)
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-slate-200/50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                disabled={filteredItems.length <= 1}
                initial={{ opacity: 0, x: -10, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronLeft size={18} className="text-slate-600 group-hover:text-slate-800 transition-colors" />
              </motion.button>

              {/* Right Arrow */}
              <motion.button
                onClick={() => {
                  const newIndex = adjustedActiveIndex < filteredItems.length - 1 ? adjustedActiveIndex + 1 : 0
                  const originalIndex = items.findIndex((item) => item.id === filteredItems[newIndex].id)
                  setActiveItemIndex(originalIndex)
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-slate-200/50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                disabled={filteredItems.length <= 1}
                initial={{ opacity: 0, x: 10, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                whileHover={{ scale: 1.05, x: 2 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronRight size={18} className="text-slate-600 group-hover:text-slate-800 transition-colors" />
              </motion.button>
            </>
          )}
        </AnimatePresence>

        {/* Card Carousel */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="h-full relative">
          {/* Bottom Right - Category Breakdown (30% shorter) */}
          {(step.id === 1 || step.id === 2) && items.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="absolute bottom-3 right-6 z-20">
              <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-white/50 px-2 py-1">
                <div className="flex items-center gap-2 text-xs">
                  {/* Standardized Code types display with category names */}
                  {(() => {
                    const icdCount = items.filter((item) => (item as any).codeType === "ICD-10").length
                    const cptCount = items.filter((item) => (item as any).codeType === "CPT").length

                    if (icdCount > 0 && cptCount > 0) {
                      return (
                        <>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></div>
                            <span className="text-xs text-blue-600 font-medium">ICD {icdCount}</span>
                          </div>
                          <div className="w-px h-3 bg-slate-200"></div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>
                            <span className="text-xs text-green-600 font-medium">CPT {cptCount}</span>
                          </div>
                        </>
                      )
                    } else if (icdCount > 0) {
                      return (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></div>
                          <span className="text-xs text-blue-600 font-medium">ICD {icdCount}</span>
                        </div>
                      )
                    } else if (cptCount > 0) {
                      return (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>
                          <span className="text-xs text-green-600 font-medium">CPT {cptCount}</span>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>
            </motion.div>
          )}

          {filteredItems.length > 0 ? (
            <div className="absolute inset-x-4 top-4 bottom-0 flex items-center justify-center overflow-visible rounded-xl">
              <div className="relative w-full h-full" style={{ padding: "0 140px" }}>
                {filteredItems.map((item, index) => {
                  if (!item || !item.id) return null

                  const offset = index - adjustedActiveIndex
                  const isActive = index === adjustedActiveIndex
                  const absOffset = Math.abs(offset)

                  // Improved scaling that respects container boundaries
                  const baseScale = 0.75
                  const activeScale = 1.0 // Reduced from 1.15 to prevent overflow
                  const scaleStep = 0.08 // Reduced step for smoother transitions
                  const currentScale = isActive ? activeScale : Math.max(baseScale, 1 - absOffset * scaleStep)

                  // Improved positioning with container awareness
                  const cardWidth = 308 // w-[308px] = 308px (7% bigger than 288px)
                  const maxOffset = 2.5 // Maximum cards to show on each side
                  const spacing = 200 // Reduced spacing to bring peripheral cards closer
                  const containerPadding = 140 // Reduced padding for closer edge fit
                  const maxXPosition = containerPadding + cardWidth * 0.25 // Tighter boundary for closer fit
                  const xPosition = Math.max(-maxXPosition, Math.min(maxXPosition, offset * spacing))

                  return (
                    <motion.div
                      key={item.id}
                      className="absolute cursor-pointer card-floating-focus"
                      style={{
                        zIndex: filteredItems.length - absOffset + (isActive ? 10 : 0), // Active card always on top
                        transformOrigin: "center center",
                        left: "50%",
                        top: "50%",
                      }}
                      animate={{
                        scale: currentScale,
                        x: xPosition - cardWidth / 2,
                        y: isActive ? -106 : -99, // Active card floats slightly higher (moved up 5mm more)
                        z: isActive ? 50 : 0, // Active card appears closer
                        opacity: absOffset > maxOffset ? 0 : Math.max(0.4, 1 - absOffset * 0.15),
                        rotateY: Math.min(Math.max(offset * 4, -15), 15), // Reduced rotation
                      }}
                      transition={{
                        duration: 0.5,
                        ease: "easeOut",
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                      onClick={() => {
                        if (filteredItems.length > 0 && index >= 0 && index < filteredItems.length) {
                          setActiveItemIndex(index)
                        }
                      }}
                      whileHover={{
                        scale: Math.min(activeScale + 0.02, currentScale + 0.02), // Constrained hover scale
                        y: isActive ? -109 : -102, // Slightly higher on hover (moved up 5mm more)
                      }}
                      initial={{ opacity: 0, scale: 0.8 }}
                    >
                      <Card
                        className={`
                        w-[308px] h-[188px] bg-white/98 backdrop-blur-xl relative overflow-hidden group
                        border border-slate-200/50
                        ${isActive ? "shadow-2xl shadow-slate-900/20 border-slate-300/60 bg-white" : "shadow-lg shadow-slate-900/15 hover:shadow-xl hover:shadow-slate-900/25"}
                        transition-all duration-300
                      `}
                      >
                        {/* Enhanced left edge indicator */}
                        <div
                          className={`absolute top-0 left-0 bottom-0 w-1 ${
                            item.category === "ICD-10" ? "bg-blue-500" : item.category === "CPT" ? "bg-green-500" : item.category === "Public Health" ? "bg-purple-500" : "bg-slate-500"
                          }`}
                        />

                        <div className="relative z-10 h-full p-5 flex flex-col">
                          {/* Enhanced header section - improved spacing and alignment */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${
                                  item.category === "ICD-10"
                                    ? "bg-blue-100 text-blue-600"
                                    : item.category === "CPT"
                                      ? "bg-green-100 text-green-600"
                                      : item.category === "Public Health"
                                        ? "bg-purple-100 text-purple-600"
                                        : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {step.stepType === "selected" ? <Shield size={14} /> : step.stepType === "suggested" ? <Zap size={14} /> : getStatusIcon(item.status)}
                              </div>

                              {/* Category title and selection status - better text hierarchy */}
                              <div className="flex flex-col gap-0.5">
                                <div
                                  className={`text-xs font-bold leading-none ${
                                    item.category === "ICD-10" ? "text-blue-700" : item.category === "CPT" ? "text-green-700" : item.category === "Public Health" ? "text-purple-700" : "text-slate-700"
                                  }`}
                                >
                                  {item.category}
                                </div>
                                <div
                                  className={`text-xs font-medium leading-none ${
                                    step.stepType === "selected" ? "text-emerald-600" : step.stepType === "suggested" ? "text-violet-600" : "text-slate-500"
                                  }`}
                                >
                                  {step.stepType === "selected" ? "Selected" : step.stepType === "suggested" ? "AI Suggested" : "Review Item"}
                                </div>
                              </div>
                            </div>

                            {/* Enhanced status indicators - improved alignment */}
                            <div className="flex flex-col items-end gap-1.5">
                              {/* Confidence indicator for codes with caution triangle */}
                              {(step.id === 1 || step.id === 2) && (item as any).confidence && (
                                <div className="flex items-center gap-2">
                                  {/* Triangle caution for cards with gaps */}
                                  {step.stepType === "selected" && (item as any).gaps?.length > 0 && (
                                    <motion.div
                                      animate={{
                                        color: [
                                          "rgb(146, 64, 14)", // dark yellow (amber-800)
                                          "rgb(217, 119, 6)", // medium yellow-orange (amber-600)
                                          "rgb(245, 158, 11)", // semi-bright yellow-orange (amber-500)
                                          "rgb(217, 119, 6)", // medium yellow-orange (amber-600)
                                          "rgb(146, 64, 14)", // dark yellow (amber-800)
                                        ],
                                      }}
                                      transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: "easeInOut",
                                      }}
                                    >
                                      <AlertTriangle size={14} />
                                    </motion.div>
                                  )}

                                  {/* Confidence badge */}
                                  <div
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${
                                      (item as any).confidence >= 90 ? "bg-emerald-100 text-emerald-700" : (item as any).confidence >= 75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    <TrendingUp size={9} />
                                    {(item as any).confidence}%
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Title - improved spacing and line height */}
                          <div className="mb-3" style={{ minHeight: "2.8rem" }}>
                            <h4 className="font-semibold text-slate-900 text-sm leading-[1.35] line-clamp-2">{item.title || "Untitled"}</h4>
                          </div>

                          {/* Details - flex-1 for perfect spacing */}
                          <div className="flex-1 mb-3" style={{ minHeight: "2.4rem" }}>
                            <p className="text-xs text-slate-600 leading-[1.4] line-clamp-2 h-full flex items-start">{item.details || "No details available"}</p>
                          </div>

                          {/* Footer section - perfect bottom alignment */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2.5 text-xs">
                              {/* Documentation support indicator */}
                              {step.stepType === "selected" && (item as any).docSupport && (
                                <div
                                  className={`flex items-center gap-1.5 ${
                                    (item as any).docSupport === "strong" ? "text-emerald-600" : (item as any).docSupport === "moderate" ? "text-amber-600" : "text-red-600"
                                  }`}
                                >
                                  <Activity size={11} />
                                  <span className="capitalize font-medium">{(item as any).docSupport}</span>
                                </div>
                              )}

                              {/* AI reasoning for suggestions */}
                              {step.stepType === "suggested" && (item as any).suggestedBy && (
                                <div className="text-violet-600 flex items-center gap-1.5">
                                  <Code size={11} />
                                  <span className="font-medium">{(item as any).suggestedBy}</span>
                                </div>
                              )}
                            </div>

                            {/* Status indicator - consistent sizing */}
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                                item.status === "completed" ? "bg-emerald-100 text-emerald-600" : item.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {getStatusIcon(item.status)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-8 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm">
                <Check size={32} className="text-emerald-500 mx-auto mb-3" />
                <h4 className="font-medium text-slate-800 mb-2">All items completed!</h4>
                <p className="text-sm text-slate-600 mb-3">Great job! All items in this step have been completed.</p>
                <Button variant="outline" size="sm" onClick={() => setHideCompleted(false)} className="text-xs">
                  <Eye size={12} className="mr-1" />
                  Show completed items
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Permanent Keep/Remove Controls - Bottom Center (Code Review Steps) */}
        {(step.id === 1 || step.id === 2) && activeItem && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="absolute bottom-[9px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-4"
          >
            <Button
              onClick={() => updateItemStatus(activeItem.id, "in-progress")}
              size="sm"
              className={`h-9 text-sm w-20 font-medium transition-all duration-200 shadow-lg ${
                activeItem.status === "in-progress" ? "bg-slate-700 hover:bg-slate-800 text-white" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400"
              }`}
            >
              {activeItem.status === "in-progress" ? "Removed" : "Remove"}
            </Button>
            <Button
              onClick={() => updateItemStatus(activeItem.id, "completed")}
              size="sm"
              className={`h-9 text-sm w-20 font-medium transition-all duration-200 shadow-lg ${
                activeItem.status === "completed" ? "bg-slate-800 hover:bg-slate-900 text-white" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400"
              }`}
            >
              {activeItem.status === "completed" ? "Kept" : "Keep"}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Details Section */}
      {activeItem && filteredItems.length > 0 && (
        <div
          className="bg-white/95 backdrop-blur-md border-t border-white/30 shadow-lg shadow-slate-900/10 flex flex-col"
          style={{
            height: `calc(70vh - ${step.id === 1 || step.id === 2 ? "180px" : "80px"})`,
            minHeight: "300px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Header with selected card context */}
              <div className="flex-shrink-0 p-4 pb-2.5 border-b border-slate-150">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColors(activeItem.category)}`}>{getStatusIcon(activeItem.status)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900 leading-tight">{activeItem.title || "Untitled"}</h4>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onMouseEnter={() => {
                          if (onShowEvidence) {
                            onShowEvidence(true)
                          }
                        }}
                        onMouseLeave={() => {
                          if (onShowEvidence) {
                            onShowEvidence(false)
                          }
                        }}
                        className="group relative flex items-center gap-1.5 cursor-pointer transition-all duration-200 hover:bg-slate-50/80 px-2 py-1 rounded-md"
                        whileHover={{ scale: 1.01 }}
                      >
                        <motion.div
                          animate={{
                            rotate: [0, 3, -3, 0],
                          }}
                          transition={{
                            rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                          }}
                        >
                          <HelpCircle size={12} className="text-slate-400 group-hover:text-blue-500 transition-colors duration-200" />
                        </motion.div>

                        <span className="text-xs text-slate-500 group-hover:text-blue-600 transition-colors duration-200 select-none">Why was this suggested?</span>

                        {/* Minimal tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-slate-800/90 text-white text-xs rounded whitespace-nowrap shadow-md pointer-events-none z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm">
                          Show evidence highlights
                          <div
                            className="absolute top-full left-1/2 -translate-x-1/2"
                            style={{
                              width: 0,
                              height: 0,
                              borderLeft: "3px solid transparent",
                              borderRight: "3px solid transparent",
                              borderTop: "3px solid rgba(30, 41, 59, 0.9)",
                            }}
                          />
                        </div>

                        {/* Very subtle hover indicator */}
                        <motion.div
                          className="absolute inset-0 rounded-md border border-blue-200/0 group-hover:border-blue-200/60 transition-colors duration-200 pointer-events-none"
                          animate={{
                            boxShadow: ["0 0 0 0 rgba(59, 130, 246, 0)", "0 0 0 1px rgba(59, 130, 246, 0.1)", "0 0 0 0 rgba(59, 130, 246, 0)"],
                          }}
                          transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      </motion.div>
                    </div>
                    {showContextEstablishedBanner && (
                      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        Preventive care context established for this encounter. Documentation supports preventive screening and risk management requirements.
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        {getPriorityIndicator(activeItem.priority)}
                        <span className="text-slate-600 capitalize">{activeItem.priority || "low"} Priority</span>
                      </div>
                      <span className="text-slate-300">•</span>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        {activeItem.category || "unknown"}
                      </Badge>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500 text-xs">{step.id === 0 ? "Documentation Gap" : step.id === 0 ? "Current Code" : step.id === 2 ? "AI Suggestion" : "Review Item"}</span>
                    </div>
                  </div>
                  {/* Hide Mark Done button for steps 1 and 2 */}
                  {!(step.id === 1 || step.id === 2) && (
                    <Button
                      onClick={() => updateItemStatus(activeItem.id, activeItem.status === "completed" ? "pending" : "completed")}
                      variant={activeItem.status === "completed" ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-shrink-0 text-xs px-3"
                    >
                      {activeItem.status === "completed" ? "✓ Done" : "Mark Done"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Enhanced Information Layout for Code Steps - Scrollable Container */}
              <div
                className={`overflow-y-auto px-4 ${
                  step.id === 1 || step.id === 2 ? "code-step-scroll pb-24" : "scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 pb-4"
                }`}
                style={{
                  height: `calc(70vh - 170px - ${step.id === 1 || step.id === 2 ? "180px" : "80px"})`,
                  minHeight: "180px",
                }}
              >
                <div className={`space-y-4 pr-2 ${step.id === 1 || step.id === 2 ? "pt-2" : ""}`}>
                  {(step.stepType === "selected" || step.stepType === "suggested") && activeItem && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-2">
                        {(activeItem as any).code && (
                          <Badge variant="outline" className="rounded-full border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {(activeItem as any).code}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {(activeItem as any).codeType || "ICD-10"}
                        </Badge>
                        {typeof (activeItem as any).confidence === "number" && (
                          <Badge
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              (activeItem as any).confidence >= 90
                                ? "bg-emerald-100 text-emerald-700"
                                : (activeItem as any).confidence >= 75
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            Confidence {(activeItem as any).confidence}%
                          </Badge>
                        )}
                        {(activeItem as any).docSupport && (
                          <Badge
                            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                              (activeItem as any).docSupport === "strong"
                                ? "bg-emerald-100 text-emerald-700"
                                : (activeItem as any).docSupport === "moderate"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {(activeItem as any).docSupport} support
                          </Badge>
                        )}
                        {activeClassifications.map((classification) => (
                          <Badge key={classification} variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs capitalize text-slate-600">
                            {classification}
                          </Badge>
                        ))}
                      </div>

                      {activeItem.details && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm text-slate-700 leading-relaxed">{activeItem.details}</p>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <Target size={14} className="text-emerald-600" />
                            Why it matters
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600">{activeItem.why || "Review this code to confirm it belongs on the chart."}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <ClipboardCheck size={14} className="text-blue-600" />
                            How to validate
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600">{activeItem.how || "Verify the documentation before finalizing."}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <Lightbulb size={14} className="text-amber-600" />
                            What to document
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600">{activeItem.what || "Document any remaining information needed."}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <FileText size={14} className="text-purple-600" />
                            Supporting evidence
                          </div>
                          {activeEvidence.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsEvidenceActive((prev) => !prev)}
                              className="h-8 border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Highlighter size={12} className="mr-2 text-slate-500" />
                              {isEvidenceActive ? "Hide note highlights" : "Highlight in note"}
                            </Button>
                          )}
                        </div>
                        {activeEvidence.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {activeEvidence.map((evidence, index) => (
                              <span
                                key={`${evidence}-${index}`}
                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                  isEvidenceActive ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 bg-white text-slate-600"
                                }`}
                                title={evidence}
                              >
                                {evidence}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No structured evidence provided for this code.</p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Shield size={14} className="text-emerald-600" />
                            Documentation gaps
                          </div>
                          {patientQuestions && patientQuestions.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowPatientTray(true)}
                              className="h-8 px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <MessageSquare size={12} className="mr-1" />
                              Patient questions
                            </Button>
                          )}
                        </div>
                        {activeGaps.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {activeGaps.map((gap, index) => (
                              <span key={`${gap}-${index}`} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700" title={gap}>
                                {gap}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No outstanding documentation gaps captured for this code.</p>
                        )}
                      </div>
                    </div>
                  )}

                    {/* Standard sections for non-code steps */}
                  {!step.stepType && (
                    <>
                      {/* Why Section */}
                      <div className="relative pl-5">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-400 to-rose-300 rounded-full"></div>
                        <div className="flex items-start gap-3">
                          <Target size={16} className="text-rose-500 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <h5 className="font-semibold text-slate-800 mb-1.5">Why This Matters</h5>
                            <p className="text-slate-600 leading-snug text-sm">{activeItem.why || "No information available"}</p>
                          </div>
                        </div>
                      </div>

                      {/* How Section */}
                      <div className="relative pl-5">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-300 rounded-full"></div>
                        <div className="flex items-start gap-3">
                          <Settings size={16} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <h5 className="font-semibold text-slate-800 mb-1.5">How to Address</h5>
                            <p className="text-slate-600 leading-snug text-sm">{activeItem.how || "No information available"}</p>
                          </div>
                        </div>
                      </div>

                      {/* What Section */}
                      <div className="relative pl-5">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-400 to-emerald-300 rounded-full"></div>
                        <div className="flex items-start gap-3">
                          <Lightbulb size={16} className="text-emerald-600 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <h5 className="font-semibold text-slate-800 mb-1.5">Details & Next Steps</h5>
                            <div className="space-y-1.5">
                              <p className="text-slate-700 font-medium text-sm">{activeItem.title || "Untitled"}</p>
                              <p className="text-slate-600 leading-snug text-sm italic">{activeItem.what || "No information available"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Empty state for details when no items visible */}
      {filteredItems.length === 0 && (
        <div
          className="bg-white/95 backdrop-blur-md border-t border-white/30 shadow-lg shadow-slate-900/10 flex items-center justify-center"
          style={{
            height: `calc(70vh - ${step.id === 1 || step.id === 2 ? "180px" : "80px"})`,
            minHeight: "300px",
          }}
        >
          <div className="text-center text-slate-500 p-4">
            <Check size={32} className="text-emerald-500 mx-auto mb-3" />
            <h4 className="font-semibold text-slate-800 mb-2">All items completed</h4>
            <p className="text-sm text-slate-600">Great job! All items in this step have been addressed.</p>
          </div>
        </div>
      )}

      {/* Fixed Full-Width Navigation for Steps 1 & 2 */}
      {(step.id === 1 || step.id === 2) && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="fixed bottom-0 left-1/2 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-white/30 p-4 shadow-lg shadow-slate-900/10"
          style={{
            boxShadow: "0 -4px 16px rgba(15, 23, 42, 0.08), 0 -1px 4px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={onPrevious} disabled={step.id <= 1} className="flex items-center gap-2 h-11 px-5" size="sm">
              <ChevronLeft size={16} />
              Previous Step
            </Button>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Step {step.id} of 6</span>
              <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
              <span>{step.title}</span>
            </div>

            <Button
              onClick={onNext}
              disabled={step.id >= 6}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white h-11 px-5"
              size="sm"
            >
              Next Step
              <ChevronRight size={16} />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Regular Navigation Footer for Other Steps */}
      {!(step.id === 1 || step.id === 2) && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md border border-white/30 rounded-xl p-3 shadow-lg shadow-slate-900/10 z-30"
        >
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={onPrevious} disabled={step.id <= 1} className="flex items-center gap-2 h-9 px-4" size="sm">
              <ChevronLeft size={16} />
              Previous Step
            </Button>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Step {step.id} of 6</span>
              <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
              <span>{step.title}</span>
            </div>

            <Button
              onClick={onNext}
              disabled={step.id >= 6}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white h-9 px-4"
              size="sm"
            >
              Next Step
              <ChevronRight size={16} />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Patient Questions Popup - Centered */}
      <PatientQuestionsPopup
        questions={patientQuestions}
        isOpen={showPatientTray}
        onClose={() => setShowPatientTray(false)}
        onUpdateQuestions={onUpdatePatientQuestions || (() => {})}
        onInsertToNote={(text, questionId) => {
          if (onInsertToNote) {
            onInsertToNote(text)
          }
          console.log("Inserting text to note:", text, "for question:", questionId)
        }}
      />

      {/* Unified Items Panel - Large and Centered */}
      <AnimatePresence>
        {showItemsPanel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50" onClick={() => setShowItemsPanel(false)}>
            <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />

            {/* Main Unified Panel - Centered in right panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-1/2 left-[75%] -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[60vh] bg-white rounded-xl shadow-2xl border border-slate-200/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-full">
                {/* Integrated Filter Sidebar */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="w-32 bg-slate-50/80 border-r border-slate-200/50 flex flex-col">
                  <div className="p-3 border-b border-slate-200/50">
                    <div className="text-xs font-medium text-slate-600 mb-3">Filter Items</div>
                    <div className="space-y-1">
                      <button
                        onClick={() => setExpandedSection(expandedSection === "priority" ? null : "priority")}
                        className={`w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${
                          expandedSection === "priority" ? "bg-red-100 text-red-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                        }`}
                      >
                        Priority
                      </button>

                      <button
                        onClick={() => setExpandedSection(expandedSection === "category" ? null : "category")}
                        className={`w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${
                          expandedSection === "category" ? "bg-blue-100 text-blue-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                        }`}
                      >
                        Category
                      </button>

                      <button
                        onClick={() => setExpandedSection(expandedSection === "status" ? null : "status")}
                        className={`w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${
                          expandedSection === "status" ? "bg-emerald-100 text-emerald-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                        }`}
                      >
                        Status
                      </button>
                    </div>
                  </div>

                  {/* Filter summary */}
                  <div className="flex-1 p-3 text-xs text-slate-500 space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Total Items</span>
                      <span className="font-medium text-slate-700">{items.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Filtered</span>
                      <span className="font-medium text-slate-700">{filteredItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Completed</span>
                      <span className="font-medium text-emerald-600">{items.filter((item) => item && item.status === "completed").length}</span>
                    </div>
                    {expandedSection && (
                      <button onClick={() => setExpandedSection(null)} className="w-full mt-3 text-xs text-slate-500 hover:text-slate-700 py-1 px-2 hover:bg-white rounded transition-colors">
                        Clear Filter
                      </button>
                    )}
                  </div>
                </motion.div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col">
                  {/* Header */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex items-center justify-between p-4 border-b border-slate-100/50 bg-white/80 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <Filter size={14} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Items Overview</h3>
                        <p className="text-sm text-slate-500">
                          {filteredItems.length} of {items.length} items
                          {expandedSection && ` • Grouped by ${expandedSection}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {expandedSection && (
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-medium ${
                            expandedSection === "priority" ? "bg-red-100 text-red-700" : expandedSection === "category" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {expandedSection}
                        </span>
                      )}
                      <button onClick={() => setShowItemsPanel(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                        <ChevronRight size={16} className="text-slate-400" />
                      </button>
                    </div>
                  </motion.div>

                  {/* List Content */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex-1 overflow-y-auto">
                    {expandedSection ? (
                      // Grouped view
                      <div className="p-4 space-y-4">
                        {Object.entries(getGroupedItems(expandedSection)).map(([subcategory, subcategoryItems], groupIndex) => (
                          <motion.div
                            key={subcategory}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: groupIndex * 0.1 }}
                            className="bg-gradient-to-r from-slate-50/50 to-white rounded-lg border border-slate-200/50 overflow-hidden"
                          >
                            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-200/30">
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  expandedSection === "priority"
                                    ? subcategory === "high"
                                      ? "bg-red-400"
                                      : subcategory === "medium"
                                        ? "bg-amber-400"
                                        : "bg-green-400"
                                    : expandedSection === "category"
                                      ? subcategory === "ICD-10"
                                        ? "bg-blue-400"
                                        : subcategory === "CPT"
                                          ? "bg-green-400"
                                          : subcategory === "Public Health"
                                            ? "bg-purple-400"
                                            : "bg-slate-400"
                                      : subcategory === "completed"
                                        ? "bg-emerald-400"
                                        : subcategory === "in-progress"
                                          ? "bg-amber-400"
                                          : "bg-slate-400"
                                }`}
                              />
                              <h4 className="font-medium text-slate-800 capitalize">{subcategory.replace("-", " ")}</h4>
                              <span className="text-sm text-slate-500">
                                ({subcategoryItems.length} item{subcategoryItems.length !== 1 ? "s" : ""})
                              </span>
                            </div>
                            <div className="p-2 space-y-1">
                              {subcategoryItems.map((item, index) => (
                                <motion.button
                                  key={item.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: groupIndex * 0.1 + index * 0.03 }}
                                  onClick={() => {
                                    const originalIndex = items.findIndex((originalItem) => originalItem.id === item.id)
                                    setActiveItemIndex(originalIndex)
                                    setHideCompleted(false)
                                    setShowItemsPanel(false)
                                  }}
                                  className="w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200/50"
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                        item.status === "completed" ? "bg-emerald-100 text-emerald-600" : item.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                                      }`}
                                    >
                                      {getStatusIcon(item.status)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h6 className="font-medium text-sm text-slate-800 mb-1 line-clamp-1">{item.title}</h6>
                                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{item.details}</p>
                                    </div>
                                    <ChevronRight size={12} className="text-slate-300 flex-shrink-0 mt-1" />
                                  </div>
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      // All items view
                      <div className="p-4">
                        <div className="grid gap-2">
                          {filteredItems.map((item, index) => (
                            <motion.button
                              key={item.id}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.02 }}
                              onClick={() => {
                                const originalIndex = items.findIndex((originalItem) => originalItem.id === item.id)
                                setActiveItemIndex(originalIndex)
                                setHideCompleted(false)
                                setShowItemsPanel(false)
                              }}
                              className="w-full text-left p-3 rounded-lg bg-white hover:bg-gradient-to-r hover:from-slate-50 hover:to-white border border-slate-200/50 hover:border-slate-300/50 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                    item.status === "completed" ? "bg-emerald-100 text-emerald-600" : item.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {getStatusIcon(item.status)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h6 className="font-medium text-sm text-slate-800 mb-2 line-clamp-1">{item.title}</h6>
                                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2">{item.details}</p>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                      <div className={`w-2 h-2 rounded-full ${item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-green-400"}`} />
                                      <span className="text-xs text-slate-500 capitalize">{item.priority}</span>
                                    </div>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-xs text-slate-500">{item.category}</span>
                                  </div>
                                </div>
                                <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
