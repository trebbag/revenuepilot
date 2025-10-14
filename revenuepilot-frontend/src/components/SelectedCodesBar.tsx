import { useCallback, useEffect, useMemo, useState } from "react"
import type { DemotionNotice, SelectedCodeMetadata } from "./NoteEditor"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import { Textarea } from "./ui/textarea"
import { FileText, Activity, Pill, Stethoscope, X, ArrowUpDown, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"
import { apiFetchJson } from "../lib/api"

interface ApiCodeDetail {
  code: string
  type?: string
  category?: string
  description?: string
  rationale?: string
  confidence?: number
  reimbursement?: string | number | null
  rvu?: string | number | null
}

interface BillingBreakdownEntry {
  amount?: number
  amountFormatted?: string
  rvu?: number
}

interface BillingSummary {
  totalEstimated?: number
  totalEstimatedFormatted?: string
  totalRvu?: number
  currency?: string
  breakdown?: Record<string, BillingBreakdownEntry>
  payerSpecific?: Record<string, string | undefined>
  issues?: string[]
}

interface CombinationConflict {
  code1?: string
  code2?: string
  reason?: string
}

interface CombinationContextIssue {
  code?: string
  issue?: string
}

interface CombinationValidationResult {
  validCombinations?: boolean
  conflicts?: CombinationConflict[]
  contextIssues?: CombinationContextIssue[]
  warnings?: string[]
}

interface DocumentationInfo {
  code: string
  required?: string[]
  recommended?: string[]
  examples?: string[]
}

interface CategorizationRule {
  id?: string
  type?: string
  category?: string
  priority?: number
  match?: {
    prefix?: string[]
    codes?: string[]
    descriptionKeywords?: string[]
  }
}

interface CategorizationRules {
  autoCategories?: Record<string, Record<string, string>>
  userOverrides?: Record<string, Record<string, string>>
  rules?: CategorizationRule[]
}

const formatDemotionNotice = (notice: DemotionNotice): string => {
  const details: string[] = []
  if (typeof notice.reason === "string" && notice.reason.trim().length > 0) {
    details.push(notice.reason.trim())
  }
  if (typeof notice.confidence === "number" && Number.isFinite(notice.confidence)) {
    details.push(`Confidence ${Math.round(Math.max(0, Math.min(1, notice.confidence)) * 100)}%`)
  }
  if (notice.negatingEvidence) {
    details.push("Negating evidence detected")
  }
  if (typeof notice.source === "string" && notice.source.trim().length > 0) {
    details.push(`Source ${notice.source.trim()}`)
  }
  if (details.length === 0) {
    return "Review required"
  }
  return details.join(" • ")
}

const demotionNoticeKey = (notice: DemotionNotice, index: number): string => {
  const parts = [notice.code ?? "", notice.reason ?? "", notice.source ?? "", String(notice.confidence ?? ""), notice.negatingEvidence ? "neg" : "", String(index)]
  return parts.join("|")
}

interface SelectedCodesBarProps {
  selectedCodes: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  onUpdateCodes: (codes: { codes: number; prevention: number; diagnoses: number; differentials: number }) => void
  selectedCodesList: any[]
  onRemoveCode?: (code: any, action: "clear" | "return", reasoning?: string) => void
  onChangeCategoryCode?: (code: any, newCategory: "diagnoses" | "differentials") => void
  codeMeta?: Map<string, SelectedCodeMetadata> | null
}

export function SelectedCodesBar({
  selectedCodes,
  onUpdateCodes,
  selectedCodesList,
  onRemoveCode,
  onChangeCategoryCode,
  codeMeta = null,
}: SelectedCodesBarProps) {
  const [activeCategories, setActiveCategories] = useState({
    codes: true,
    prevention: true,
    diagnoses: true,
    differentials: true,
  })

  const [codeDetails, setCodeDetails] = useState<Record<string, ApiCodeDetail>>({})
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null)
  const [combinationResult, setCombinationResult] = useState<CombinationValidationResult | null>(null)
  const [documentationMap, setDocumentationMap] = useState<Record<string, DocumentationInfo>>({})
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRules | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const overrideMap = useMemo(() => {
    if (!categorizationRules?.userOverrides) {
      return {}
    }

    const aggregated: Record<string, string> = {}
    Object.values(categorizationRules.userOverrides).forEach((overrides) => {
      if (!overrides) {
        return
      }
      Object.entries(overrides).forEach(([code, category]) => {
        if (typeof code !== "string" || typeof category !== "string") {
          return
        }
        const normalized = code.trim().toUpperCase()
        if (normalized.length > 0) {
          aggregated[normalized] = category
        }
      })
    })

    return aggregated
  }, [categorizationRules])

  const autoCategoryMap = useMemo(() => {
    if (!categorizationRules?.autoCategories) {
      return {}
    }

    const map: Record<string, Record<string, string>> = {}
    Object.entries(categorizationRules.autoCategories).forEach(([type, codes]) => {
      if (!type || !codes) {
        return
      }
      const typeKey = type.trim().toUpperCase()
      if (!typeKey) {
        return
      }
      map[typeKey] = {}
      Object.entries(codes).forEach(([code, category]) => {
        if (typeof code !== "string" || typeof category !== "string") {
          return
        }
        const normalized = code.trim().toUpperCase()
        if (normalized.length > 0) {
          map[typeKey][normalized] = category
        }
      })
    })

    return map
  }, [categorizationRules])

  const sortedCategorizationRules = useMemo(() => {
    const rules = categorizationRules?.rules ?? []
    return [...rules].sort((a, b) => (b?.priority ?? 0) - (a?.priority ?? 0))
  }, [categorizationRules])

  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [selectedCodeToRemove, setSelectedCodeToRemove] = useState<any>(null)
  const [removeReasoning, setRemoveReasoning] = useState("")

  useEffect(() => {
    let isCancelled = false

    const loadCategorizationRules = async () => {
      try {
        const data = await apiFetchJson<CategorizationRules>("/api/codes/categorization/rules", {
          unwrapData: true,
        })
        if (!isCancelled && data) {
          setCategorizationRules(data)
        }
      } catch (error) {
        console.error("Failed to load categorization rules", error)
      }
    }

    loadCategorizationRules()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const entries = (Array.isArray(selectedCodesList) ? selectedCodesList : [])
      .map((item) => {
        const rawCode = typeof item?.code === "string" ? item.code.trim() : ""
        if (!rawCode) {
          return null
        }
        const type = typeof item?.type === "string" ? item.type.trim().toUpperCase() : ""
        return { code: rawCode.trim().toUpperCase(), type }
      })
      .filter((entry): entry is { code: string; type: string } => Boolean(entry && entry.code.length > 0))

    const uniqueCodes = Array.from(new Set(entries.map((entry) => entry.code)))

    if (uniqueCodes.length === 0) {
      setCodeDetails({})
      setBillingSummary(null)
      setCombinationResult(null)
      setDocumentationMap({})
      setFetchError(null)
      setIsLoadingDetails(false)
      return
    }

    const cptCodes = Array.from(new Set(entries.filter((entry) => entry.type === "CPT" || entry.type === "HCPCS" || /^[0-9]/.test(entry.code)).map((entry) => entry.code)))

    let isCancelled = false

    const loadDetails = async () => {
      setIsLoadingDetails(true)
      setFetchError(null)

      const detailsPromise = apiFetchJson<ApiCodeDetail[]>("/api/codes/details/batch", {
        method: "POST",
        jsonBody: { codes: uniqueCodes },
        unwrapData: true,
      }).catch((error) => {
        console.error("Failed to fetch code details", error)
        return [] as ApiCodeDetail[]
      })

      const billingPromise = cptCodes.length
        ? apiFetchJson<BillingSummary>("/api/billing/calculate", {
            method: "POST",
            jsonBody: { codes: cptCodes },
            unwrapData: true,
          }).catch((error) => {
            console.error("Failed to calculate billing summary", error)
            return null
          })
        : Promise.resolve<BillingSummary | null>(null)

      const combinationPromise = apiFetchJson<CombinationValidationResult>("/api/codes/validate/combination", {
        method: "POST",
        jsonBody: { codes: uniqueCodes },
        unwrapData: true,
      }).catch((error) => {
        console.error("Failed to validate code combination", error)
        return null
      })

      const documentationPromise = Promise.all(
        uniqueCodes.map(async (code) => {
          try {
            const documentation = (await apiFetchJson<DocumentationInfo>(`/api/codes/documentation/${encodeURIComponent(code)}`, {
              unwrapData: true,
            })) ?? {
              code,
              required: [],
              recommended: [],
              examples: [],
            }
            return [code, documentation] as const
          } catch (error) {
            console.error(`Failed to fetch documentation for code ${code}`, error)
            return [
              code,
              {
                code,
                required: [],
                recommended: [],
                examples: [],
              },
            ] as const
          }
        }),
      ).catch((error) => {
        console.error("Failed to load documentation requirements", error)
        return uniqueCodes.map(
          (code) =>
            [
              code,
              {
                code,
                required: [],
                recommended: [],
                examples: [],
              },
            ] as const,
        )
      })

      try {
        const [detailsData, billingData, combinationData, documentationEntries] = await Promise.all([detailsPromise, billingPromise, combinationPromise, documentationPromise])

        if (isCancelled) {
          return
        }

        const detailMap: Record<string, ApiCodeDetail> = {}
        if (Array.isArray(detailsData)) {
          detailsData.forEach((detail) => {
            if (!detail || typeof detail.code !== "string") {
              return
            }
            const normalized = detail.code.trim().toUpperCase()
            if (!normalized) {
              return
            }
            detailMap[normalized] = detail
          })
        }

        const documentation: Record<string, DocumentationInfo> = {}
        documentationEntries.forEach(([code, doc]) => {
          const normalized = typeof code === "string" ? code.trim().toUpperCase() : ""
          if (!normalized) {
            return
          }
          documentation[normalized] = doc
        })

        setCodeDetails(detailMap)
        setDocumentationMap(documentation)
        setBillingSummary(billingData)
        setCombinationResult(combinationData)
      } catch (error) {
        if (isCancelled) {
          return
        }
        console.error("Failed to load selected code details", error)
        const message = error instanceof Error && error.message.length > 0 ? error.message : "Unable to load code insights."
        setFetchError(message)
        setCodeDetails({})
        setDocumentationMap({})
        setBillingSummary(null)
        setCombinationResult(null)
      } finally {
        if (!isCancelled) {
          setIsLoadingDetails(false)
        }
      }
    }

    loadDetails()

    return () => {
      isCancelled = true
    }
  }, [selectedCodesList])

  const doesRuleApply = useCallback((rule: CategorizationRule | undefined, code: string, type: string, description: string) => {
    if (!rule) {
      return false
    }

    const expectedType = typeof rule.type === "string" ? rule.type.trim().toUpperCase() : ""
    if (expectedType && expectedType !== type) {
      return false
    }

    const match = rule.match ?? {}
    const normalizedCode = code.trim().toUpperCase()

    if (Array.isArray(match.codes) && match.codes.some((candidate) => typeof candidate === "string" && candidate.trim().toUpperCase() === normalizedCode)) {
      return true
    }

    if (Array.isArray(match.prefix) && match.prefix.some((prefix) => typeof prefix === "string" && normalizedCode.startsWith(prefix.trim().toUpperCase()))) {
      return true
    }

    if (Array.isArray(match.descriptionKeywords) && description) {
      const descriptionLower = description.toLowerCase()
      if (match.descriptionKeywords.some((keyword) => typeof keyword === "string" && descriptionLower.includes(keyword.toLowerCase()))) {
        return true
      }
    }

    return false
  }, [])

  const determineCategory = useCallback(
    (codeItem: any, detail?: ApiCodeDetail) => {
      const resolvedType = (detail?.type || codeItem?.type || "").toString().trim().toUpperCase()
      const normalizedCode = (detail?.code || codeItem?.code || "").toString().trim().toUpperCase()

      const fallbackCategory =
        detail?.category ||
        codeItem?.category ||
        (resolvedType === "ICD-10"
          ? "diagnoses"
          : resolvedType === "CPT" || resolvedType === "HCPCS"
            ? "codes"
            : resolvedType === "PREVENTION"
              ? "prevention"
              : resolvedType === "DIFFERENTIAL"
                ? "differentials"
                : "codes")

      if (!normalizedCode) {
        return fallbackCategory
      }

      if (overrideMap[normalizedCode]) {
        return overrideMap[normalizedCode]
      }

      const byType = autoCategoryMap[resolvedType]
      if (byType && byType[normalizedCode]) {
        return byType[normalizedCode]
      }

      const description = (detail?.description || codeItem?.description || "").toString()
      for (const rule of sortedCategorizationRules) {
        if (doesRuleApply(rule, normalizedCode, resolvedType, description)) {
          if (typeof rule?.category === "string" && rule.category.trim().length > 0) {
            return rule.category
          }
        }
      }

      return fallbackCategory
    },
    [autoCategoryMap, doesRuleApply, overrideMap, sortedCategorizationRules],
  )

  const sanitizeConfidence = useCallback((value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(100, Math.max(0, Math.round(value)))
    }

    if (typeof value === "string") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return Math.min(100, Math.max(0, Math.round(parsed)))
      }
    }

    return 0
  }, [])

  const ensureCurrency = useCallback((value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed) {
        return null
      }

      if (trimmed.startsWith("$")) {
        return trimmed
      }

      const numeric = Number(trimmed)
      if (Number.isFinite(numeric)) {
        try {
          return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric)
        } catch {
          return `$${numeric.toFixed(2)}`
        }
      }

      return trimmed
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
      } catch {
        return `$${value.toFixed(2)}`
      }
    }

    return null
  }, [])

  const formatDocumentationSummary = useCallback((documentation?: DocumentationInfo) => {
    if (!documentation) {
      return "No additional documentation requirements."
    }

    const segments: string[] = []

    if (Array.isArray(documentation.required) && documentation.required.length > 0) {
      segments.push(`Required: ${documentation.required.join(", ")}`)
    }

    if (Array.isArray(documentation.recommended) && documentation.recommended.length > 0) {
      segments.push(`Recommended: ${documentation.recommended.join(", ")}`)
    }

    if (Array.isArray(documentation.examples) && documentation.examples.length > 0) {
      segments.push(`Examples: ${documentation.examples.join(", ")}`)
    }

    if (segments.length === 0) {
      return "No additional documentation requirements."
    }

    return segments.join(" • ")
  }, [])

  const buildBillingConsiderations = useCallback(
    (codeItem: any, breakdown?: BillingBreakdownEntry) => {
      const type = (codeItem?.type || "").toString().trim().toUpperCase()
      const messages: string[] = []

      if (breakdown) {
        if (typeof breakdown.amountFormatted === "string" && breakdown.amountFormatted.trim()) {
          messages.push(`Estimated reimbursement ${breakdown.amountFormatted}`)
        } else if (typeof breakdown.amount === "number" && Number.isFinite(breakdown.amount)) {
          const formatted = ensureCurrency(breakdown.amount)
          if (formatted) {
            messages.push(`Estimated reimbursement ${formatted}`)
          }
        }

        if (typeof breakdown.rvu === "number" && Number.isFinite(breakdown.rvu)) {
          messages.push(`RVU ${breakdown.rvu.toFixed(2)}`)
        }
      }

      if (messages.length > 0) {
        return messages.join(" • ")
      }

      if (type === "CPT" || type === "HCPCS") {
        return "Ensure documentation supports billed service and medical necessity."
      }

      if (type === "ICD-10") {
        return "Verify diagnosis specificity aligns with billing requirements."
      }

      return "Standard billing requirements apply."
    },
    [ensureCurrency],
  )

  const billingBreakdown = useMemo(() => billingSummary?.breakdown ?? {}, [billingSummary])

  const conflictDetailsMap = useMemo(() => {
    const map: Record<string, { conflicts: string[]; contextIssues: string[] }> = {}

    if (!combinationResult) {
      return map
    }

    const conflicts = Array.isArray(combinationResult.conflicts) ? combinationResult.conflicts : []
    conflicts.forEach((conflict) => {
      if (!conflict) {
        return
      }

      const reason = typeof conflict.reason === "string" && conflict.reason.trim().length > 0 ? conflict.reason : "Medical necessity conflict detected"

      const code1 = typeof conflict.code1 === "string" ? conflict.code1.trim().toUpperCase() : ""
      if (code1) {
        map[code1] = map[code1] || { conflicts: [], contextIssues: [] }
        map[code1].conflicts.push(reason)
      }

      if (typeof conflict.code2 === "string" && conflict.code2.trim().length > 0) {
        conflict.code2.split(",").forEach((raw) => {
          const normalized = raw.trim().toUpperCase()
          if (!normalized) {
            return
          }
          map[normalized] = map[normalized] || { conflicts: [], contextIssues: [] }
          map[normalized].conflicts.push(reason)
        })
      }
    })

    const contextIssues = Array.isArray(combinationResult.contextIssues) ? combinationResult.contextIssues : []
    contextIssues.forEach((issue) => {
      if (!issue) {
        return
      }

      const code = typeof issue.code === "string" ? issue.code.trim().toUpperCase() : ""
      if (!code) {
        return
      }

      map[code] = map[code] || { conflicts: [], contextIssues: [] }
      if (typeof issue.issue === "string" && issue.issue.trim().length > 0) {
        map[code].contextIssues.push(issue.issue)
      }
    })

    return map
  }, [combinationResult])

  const selectedCodesDetails = useMemo(() => {
    const categoryInfo = {
      codes: {
        icon: FileText,
        color: "bg-blue-500",
        lightColor: "bg-blue-50",
        textColor: "text-blue-700",
      },
      prevention: {
        icon: Stethoscope,
        color: "bg-red-500",
        lightColor: "bg-red-50",
        textColor: "text-red-700",
      },
      diagnoses: {
        icon: Activity,
        color: "bg-purple-500",
        lightColor: "bg-purple-50",
        textColor: "text-purple-700",
      },
      differentials: {
        icon: Pill,
        color: "bg-green-500",
        lightColor: "bg-green-50",
        textColor: "text-green-700",
      },
    }

    const globalWarnings = Array.isArray(combinationResult?.warnings) ? combinationResult.warnings.filter((warning) => typeof warning === "string" && warning.trim().length > 0) : []

    return (Array.isArray(selectedCodesList) ? selectedCodesList : []).map((codeItem) => {
      const normalized = typeof codeItem?.code === "string" ? codeItem.code.trim().toUpperCase() : ""
      const detail = normalized ? codeDetails[normalized] : undefined
      const documentation = normalized ? documentationMap[normalized] : undefined
      const breakdown = normalized ? billingBreakdown?.[normalized] : undefined
      const conflicts = normalized ? conflictDetailsMap[normalized] : undefined
      const resolvedCategory = determineCategory(codeItem, detail)
      const categoryStyle = categoryInfo[(resolvedCategory as keyof typeof categoryInfo) || "diagnoses"] || categoryInfo.diagnoses
      const resolvedType = detail?.type || codeItem?.type
      const metadata = normalized && codeMeta ? codeMeta.get(normalized) ?? null : null
      const confidenceSource = (() => {
        if (typeof metadata?.confidence === "number" && Number.isFinite(metadata.confidence)) {
          return metadata.confidence
        }
        return detail?.confidence ?? codeItem?.confidence
      })()
      const confidence = sanitizeConfidence(confidenceSource)
      const reimbursement =
        breakdown?.amountFormatted && breakdown.amountFormatted.trim()
          ? breakdown.amountFormatted
          : (ensureCurrency(detail?.reimbursement) ?? ensureCurrency(codeItem?.reimbursement) ?? (resolvedType === "ICD-10" ? "N/A (Diagnosis code)" : "N/A"))

      const rvuValue = (() => {
        if (typeof breakdown?.rvu === "number" && Number.isFinite(breakdown.rvu)) {
          return breakdown.rvu.toFixed(2)
        }
        if (typeof detail?.rvu === "number" && Number.isFinite(detail.rvu)) {
          return detail.rvu.toFixed(2)
        }
        return detail?.rvu ?? codeItem?.rvu
      })()

      const conflictInfo = {
        conflicts: conflicts?.conflicts ?? [],
        contextIssues: conflicts?.contextIssues ?? [],
      }

      const hasConflict = conflictInfo.conflicts.length > 0 || conflictInfo.contextIssues.length > 0

      return {
        ...codeItem,
        ...detail,
        code: detail?.code ?? codeItem.code,
        type: detail?.type ?? codeItem.type,
        category: resolvedCategory,
        description: detail?.description ?? codeItem.description,
        rationale: detail?.rationale ?? codeItem.rationale,
        confidence,
        reimbursement,
        rvu: rvuValue,
        icon: categoryStyle.icon,
        color: categoryStyle.color,
        lightColor: categoryStyle.lightColor,
        textColor: categoryStyle.textColor,
        billingConsiderations: buildBillingConsiderations({ ...codeItem, ...detail, type: resolvedType }, breakdown),
        treatmentNotes: detail?.rationale ?? codeItem?.rationale ?? "Clinical assessment and appropriate treatment plan documented.",
        documentationRequirements: formatDocumentationSummary(documentation),
        documentation,
        documentationNeeds: {
          required: Array.isArray(documentation?.required) ? documentation.required : [],
          recommended: Array.isArray(documentation?.recommended) ? documentation.recommended : [],
          examples: Array.isArray(documentation?.examples) ? documentation.examples : [],
          summary: formatDocumentationSummary(documentation),
        },
        hasConflict,
        conflictDetails: conflictInfo,
        billingBreakdown: breakdown,
        billingInfo: {
          reimbursement,
          rvu: rvuValue,
          breakdown,
        },
        validationFlags: {
          hasConflicts: hasConflict,
          conflicts: conflictInfo.conflicts,
          contextIssues: conflictInfo.contextIssues,
          warnings: globalWarnings,
        },
        flaggedForReview: Boolean(metadata?.flaggedForReview),
        acceptedByUser: Boolean(metadata?.acceptedByUser),
        accepted: Boolean(metadata?.accepted),
        supportingSpans: metadata?.supportingSpans ?? [],
        demotions: metadata?.demotions ?? [],
      }
    })
  }, [
    billingBreakdown,
    buildBillingConsiderations,
    codeDetails,
    conflictDetailsMap,
    determineCategory,
    documentationMap,
    ensureCurrency,
    formatDocumentationSummary,
    sanitizeConfidence,
    selectedCodesList,
    combinationResult,
    codeMeta,
  ])

  const computedCounts = useMemo(() => {
    const counts = {
      codes: 0,
      prevention: 0,
      diagnoses: 0,
      differentials: 0,
    }

    selectedCodesDetails.forEach((detail) => {
      const category = (detail?.category || "") as keyof typeof counts
      if (category && typeof counts[category] === "number") {
        counts[category] += 1
      }
    })

    return counts
  }, [selectedCodesDetails])

  useEffect(() => {
    const categories: (keyof typeof computedCounts)[] = ["codes", "prevention", "diagnoses", "differentials"]
    const hasDifference = categories.some((category) => (selectedCodes?.[category] ?? 0) !== (computedCounts?.[category] ?? 0))

    if (hasDifference) {
      onUpdateCodes(computedCounts)
    }
  }, [computedCounts, onUpdateCodes, selectedCodes])

  const conflictSummary = useMemo(() => {
    if (!combinationResult) {
      return null
    }

    const conflicts = Array.isArray(combinationResult.conflicts) ? combinationResult.conflicts : []
    const contextIssues = Array.isArray(combinationResult.contextIssues) ? combinationResult.contextIssues : []

    if (conflicts.length === 0 && contextIssues.length === 0) {
      return { hasConflicts: false, messages: [] as string[] }
    }

    const messages: string[] = []

    conflicts.forEach((conflict) => {
      if (!conflict) {
        return
      }
      const code1 = typeof conflict.code1 === "string" && conflict.code1.trim().length > 0 ? conflict.code1.trim() : "CPT code"
      const code2 = typeof conflict.code2 === "string" && conflict.code2.trim().length > 0 ? conflict.code2.trim() : ""
      const reason = typeof conflict.reason === "string" && conflict.reason.trim().length > 0 ? conflict.reason.trim() : "Medical necessity conflict"
      messages.push(code2 ? `${code1} ↔ ${code2}: ${reason}` : `${code1}: ${reason}`)
    })

    contextIssues.forEach((issue) => {
      if (!issue) {
        return
      }
      const code = typeof issue.code === "string" && issue.code.trim().length > 0 ? issue.code.trim() : "Code"
      const description = typeof issue.issue === "string" && issue.issue.trim().length > 0 ? issue.issue.trim() : "Requires review"
      messages.push(`${code}: ${description}`)
    })

    return { hasConflicts: true, messages }
  }, [combinationResult])

  const toggleCategory = (category: string) => {
    setActiveCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }))
  }

  const handleRemoveCode = (code: any) => {
    setSelectedCodeToRemove(code)
    setRemoveReasoning("")
    setShowRemoveDialog(true)
  }

  const confirmRemoval = (action: "clear" | "return") => {
    if (selectedCodeToRemove && onRemoveCode) {
      onRemoveCode(selectedCodeToRemove, action, removeReasoning || undefined)
    }
    setShowRemoveDialog(false)
    setSelectedCodeToRemove(null)
    setRemoveReasoning("")
  }

  // Filter codes based on active categories
  const filteredCodes = selectedCodesDetails.filter((code) => activeCategories[code.category])

  // Category configurations
  const categoryConfigs = [
    {
      key: "codes",
      title: "Codes",
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      borderColor: "border-blue-200",
      count: computedCounts.codes,
    },
    {
      key: "prevention",
      title: "Prevention",
      icon: Stethoscope,
      color: "text-red-600",
      bgColor: "bg-red-100",
      borderColor: "border-red-200",
      count: computedCounts.prevention,
    },
    {
      key: "diagnoses",
      title: "Diagnoses",
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      borderColor: "border-purple-200",
      count: computedCounts.diagnoses,
    },
    {
      key: "differentials",
      title: "Differentials",
      icon: Pill,
      color: "text-green-600",
      bgColor: "bg-green-100",
      borderColor: "border-green-200",
      count: computedCounts.differentials,
    },
  ]

  // Calculate total codes
  const totalCodes = computedCounts.codes + computedCounts.prevention + computedCounts.diagnoses + computedCounts.differentials
  const visibleCodes = filteredCodes.length

  // Circular confidence indicator component
  const ConfidenceGauge = ({ confidence, size = 20 }: { confidence: number; size?: number }) => {
    const radius = (size - 4) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (confidence / 100) * circumference

    const getColor = (conf: number) => {
      if (conf >= 80) return "#10b981" // green-500
      if (conf >= 60) return "#eab308" // yellow-500
      return "#ef4444" // red-500
    }

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth="2" fill="none" />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor(confidence)}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
          />
        </svg>
        {/* Confidence percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">{confidence}</span>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="border-b bg-muted/10 px-4 py-4">
        <div className="space-y-3">
          {/* Header with Category Toggle Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Selected Codes</span>
              <div className="flex items-center gap-2">
                {categoryConfigs.map((category) => {
                  const CategoryIcon = category.icon
                  const isActive = activeCategories[category.key]
                  return (
                    <Button
                      key={category.key}
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategory(category.key)}
                      className={`
                        h-8 px-3 gap-2 text-xs transition-all
                        ${isActive ? `${category.bgColor} ${category.color} ${category.borderColor} border` : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"}
                      `}
                    >
                      <CategoryIcon className="h-3.5 w-3.5" />
                      <span className="font-medium">{category.title}</span>
                      <Badge variant="secondary" className={`text-xs px-1.5 py-0 h-4 ${isActive ? "bg-white/80" : "bg-muted-foreground/20"}`}>
                        {category.count}
                      </Badge>
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {visibleCodes} of {totalCodes} codes
            </div>
          </div>

          {(isLoadingDetails || billingSummary || (conflictSummary && selectedCodesDetails.length > 0) || fetchError) && (
            <div className="flex flex-col gap-2 text-xs">
              {isLoadingDetails && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading code insights...</span>
                </div>
              )}

              {billingSummary && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                  <span className="font-medium">Estimated reimbursement:</span>
                  <Badge variant="secondary" className="h-5 rounded-sm border border-emerald-200 bg-white/80 px-2 text-emerald-700">
                    {billingSummary.totalEstimatedFormatted ?? ensureCurrency(billingSummary.totalEstimated) ?? "Not available"}
                  </Badge>
                  <span className="font-medium">Total RVU:</span>
                  <Badge variant="secondary" className="h-5 rounded-sm border border-emerald-200 bg-white/80 px-2 text-emerald-700">
                    {typeof billingSummary.totalRvu === "number" && Number.isFinite(billingSummary.totalRvu) ? billingSummary.totalRvu.toFixed(2) : "N/A"}
                  </Badge>
                </div>
              )}

              {billingSummary?.issues && billingSummary.issues.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">{billingSummary.issues.join(" ")}</div>
              )}

              {conflictSummary && selectedCodesDetails.length > 0 && (
                <div
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                    conflictSummary.hasConflicts ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {conflictSummary.hasConflicts ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
                  <div className="space-y-1">
                    <div className="text-xs font-medium">{conflictSummary.hasConflicts ? "Review code conflicts" : "No conflicts detected"}</div>
                    {conflictSummary.messages.length > 0 && (
                      <ul className="space-y-0.5 text-xs">
                        {conflictSummary.messages.slice(0, 3).map((message, index) => (
                          <li key={`${message}-${index}`} className="leading-snug">
                            {message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {conflictSummary.hasConflicts && conflictSummary.messages.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        Showing {Math.min(3, conflictSummary.messages.length)} of {conflictSummary.messages.length} findings.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {fetchError && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fetchError}</div>}
            </div>
          )}

          {/* Horizontally Scrollable Code Boxes */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted-foreground/20">
              {filteredCodes.map((codeDetail, index) => {
                const IconComponent = codeDetail.icon
                return (
                  <div
                    key={codeDetail.code ?? index}
                    className={`
                      relative p-3 pb-8 rounded-lg border cursor-pointer flex-shrink-0 min-w-[160px] group
                      ${codeDetail.lightColor} hover:scale-105 transition-all duration-200
                      ${codeDetail.hasConflict ? "border-red-300 ring-1 ring-red-200/80" : "border-current/20"}
                      hover:shadow-md
                    `}
                  >
                    {codeDetail.flaggedForReview && (
                      <Badge variant="outline" className="absolute left-3 top-2 h-4 rounded-sm px-2 text-[10px] bg-amber-50 border-amber-200 text-amber-700">
                        Needs review
                      </Badge>
                    )}
                    {codeDetail.hasConflict && (
                      <Badge variant="destructive" className="absolute right-3 top-2 h-4 rounded-sm px-2 text-[10px]">
                        Conflict
                      </Badge>
                    )}
                    {codeDetail.accepted && (
                      <Badge
                        variant="outline"
                        className={`absolute bottom-2 left-3 h-4 rounded-sm px-2 text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700 ${codeDetail.acceptedByUser ? "opacity-80" : ""}`}
                      >
                        AI accepted
                      </Badge>
                    )}
                    {codeDetail.acceptedByUser && (
                      <Badge
                        variant="outline"
                        className="absolute bottom-2 right-3 h-4 rounded-sm px-2 text-[10px] bg-blue-50 border-blue-200 text-blue-700"
                      >
                        Clinician accepted
                      </Badge>
                    )}
                    {/* Remove button - only visible on hover */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveCode(codeDetail)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>

                    {/* Category switch button for diagnoses/differentials - only visible on hover */}
                    {(codeDetail.category === "diagnoses" || codeDetail.category === "differentials") && codeDetail.type === "ICD-10" && onChangeCategoryCode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-6 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-100 hover:text-blue-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          const newCategory = codeDetail.category === "diagnoses" ? "differentials" : "diagnoses"
                          onChangeCategoryCode(codeDetail, newCategory)
                        }}
                        title={`Change to ${codeDetail.category === "diagnoses" ? "Differential" : "Diagnosis"}`}
                      >
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-md ${codeDetail.color}`}>
                            <IconComponent className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className={`text-sm font-mono font-medium ${codeDetail.textColor}`}>{codeDetail.code}</div>
                            <div className="text-xs text-muted-foreground">{codeDetail.type}</div>
                          </div>
                          {/* Circular Confidence Gauge */}
                          <div className="flex-shrink-0">
                            <ConfidenceGauge confidence={codeDetail.confidence} size={24} />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm p-4" side="top">
                        <div className="space-y-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">
                              {codeDetail.code} - {codeDetail.description}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{codeDetail.type}</div>
                          </div>
                          {codeDetail.rationale && (
                            <div>
                              <span className="font-medium">Reason:</span> {codeDetail.rationale}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Estimated reimbursement:</span> {codeDetail.reimbursement}
                          </div>
                          {codeDetail.rvu && (
                            <div>
                              <span className="font-medium">RVU:</span> {codeDetail.rvu}
                            </div>
                          )}
                          {codeDetail.billingConsiderations && (
                            <div>
                              <span className="font-medium">Billing:</span> {codeDetail.billingConsiderations}
                            </div>
                          )}
                          {codeDetail.supportingSpans && codeDetail.supportingSpans.length > 0 && (
                            <div className="space-y-1">
                              <div className="font-medium">Supporting evidence</div>
                              <ul className="space-y-1">
                                {codeDetail.supportingSpans.slice(0, 3).map((span, spanIndex) => {
                                  const start =
                                    typeof span?.start === "number" && Number.isFinite(span.start) ? Math.trunc(span.start) : null
                                  const end =
                                    typeof span?.end === "number" && Number.isFinite(span.end) ? Math.trunc(span.end) : null
                                  const text =
                                    typeof span?.text === "string" && span.text.trim().length > 0
                                      ? span.text.trim()
                                      : `Evidence ${spanIndex + 1}`
                                  const confidence =
                                    typeof span?.confidence === "number" && Number.isFinite(span.confidence)
                                      ? Math.round(Math.max(0, Math.min(1, span.confidence)) * 100)
                                      : null
                                  return (
                                    <li
                                      key={`${codeDetail.code}-span-${spanIndex}`}
                                      className="rounded-md border border-muted-foreground/20 bg-muted/30 px-2 py-1"
                                    >
                                      <div className="text-xs font-medium text-foreground">{text}</div>
                                      {(start !== null || end !== null || confidence !== null) && (
                                        <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                          {start !== null && end !== null && (
                                            <span>
                                              Offsets {start}–{end}
                                            </span>
                                          )}
                                          {confidence !== null && <span>Confidence {confidence}%</span>}
                                        </div>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                              {codeDetail.supportingSpans.length > 3 && (
                                <div className="text-[10px] text-muted-foreground">
                                  Showing first 3 of {codeDetail.supportingSpans.length} supporting spans.
                                </div>
                              )}
                            </div>
                          )}
                          {codeDetail.demotions && codeDetail.demotions.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-amber-700 flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5" /> Pushback detected
                              </div>
                              <ul className="list-disc list-inside text-[11px] text-amber-600 space-y-0.5">
                                {codeDetail.demotions.map((notice, index) => (
                                  <li key={demotionNoticeKey(notice, index)}>{formatDemotionNotice(notice)}</li>
                                ))}
                              </ul>
                              <p className="text-[11px] text-amber-600">
                                Review supporting documentation before finalizing this code.
                              </p>
                            </div>
                          )}
                          {codeDetail.treatmentNotes && (
                            <div>
                              <span className="font-medium">Treatment:</span> {codeDetail.treatmentNotes}
                            </div>
                          )}
                          {codeDetail.documentation ? (
                            <div className="space-y-1">
                              <div className="font-medium">Documentation</div>
                              {codeDetail.documentation.required?.length ? <div>Required: {codeDetail.documentation.required.join(", ")}</div> : null}
                              {codeDetail.documentation.recommended?.length ? <div>Recommended: {codeDetail.documentation.recommended.join(", ")}</div> : null}
                              {codeDetail.documentation.examples?.length ? <div>Examples: {codeDetail.documentation.examples.join(", ")}</div> : null}
                              {!codeDetail.documentation.required?.length && !codeDetail.documentation.recommended?.length && !codeDetail.documentation.examples?.length && (
                                <div>{codeDetail.documentationRequirements}</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium">Documentation:</span> {codeDetail.documentationRequirements}
                            </div>
                          )}
                          {codeDetail.hasConflict && (
                            <div className="space-y-1 rounded-md border border-red-200 bg-red-50/70 px-2 py-1 text-red-700">
                              {codeDetail.conflictDetails?.conflicts?.length ? (
                                <div>
                                  <span className="font-medium">Conflicts:</span>
                                  <ul className="ml-4 list-disc">
                                    {codeDetail.conflictDetails.conflicts.map((conflict, conflictIndex) => (
                                      <li key={`conflict-${conflictIndex}`}>{conflict}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {codeDetail.conflictDetails?.contextIssues?.length ? (
                                <div>
                                  <span className="font-medium">Context issues:</span>
                                  <ul className="ml-4 list-disc">
                                    {codeDetail.conflictDetails.contextIssues.map((issue, issueIndex) => (
                                      <li key={`context-${issueIndex}`}>{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          )}
                          <div className="border-t pt-1">
                            <span className="font-medium">Confidence:</span>
                            <span className={`ml-1 ${codeDetail.confidence >= 80 ? "text-green-600" : codeDetail.confidence >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                              {codeDetail.confidence}%
                            </span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Remove Code Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Code</AlertDialogTitle>
            <AlertDialogDescription>
              What would you like to do with code <span className="font-mono font-medium">{selectedCodeToRemove?.code}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">Code:</span> {selectedCodeToRemove?.code} - {selectedCodeToRemove?.description}
              </div>

              <div className="space-y-2">
                <label htmlFor="reasoning" className="text-sm font-medium">
                  Reasoning (Optional)
                </label>
                <Textarea
                  id="reasoning"
                  placeholder="Explain why you're removing this code. This helps the AI learn from your clinical decisions..."
                  value={removeReasoning}
                  onChange={(e) => setRemoveReasoning(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Your feedback helps improve future AI suggestions and clinical decision support.</p>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmRemoval("return")} className="hover:bg-blue-50 hover:text-blue-700">
              Return to Suggestions
            </Button>
            <AlertDialogAction onClick={() => confirmRemoval("clear")} className="bg-red-600 hover:bg-red-700">
              Remove Completely
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
