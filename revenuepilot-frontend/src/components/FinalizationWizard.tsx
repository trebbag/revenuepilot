import React, { useState, useEffect, useCallback } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import { Progress } from "./ui/progress"
import { Checkbox } from "./ui/checkbox"
import { Alert, AlertDescription } from "./ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { Separator } from "./ui/separator"
import { toast } from "sonner"
import { defaultFinalizationSteps, type FinalizationStepConfig } from "./finalizationSteps"
import {
  FileText,
  Code2,
  Heart,
  Activity,
  Stethoscope,
  Shield,
  CheckCircle,
  AlertTriangle,
  X,
  ArrowLeft,
  ArrowRight,
  Download,
  Send,
  Clock,
  DollarSign,
  Info,
  Loader2
} from "lucide-react"

export interface FinalizeNoteResponse {
  finalizedContent: string
  codesSummary: Array<Record<string, unknown>>
  reimbursementSummary: {
    total: number
    codes: Array<Record<string, unknown>>
  }
  exportReady: boolean
  issues: Record<string, string[]>
  [key: string]: unknown
}

export interface FinalizeNotePayload {
  content: string
  codes: string[]
  prevention: string[]
  diagnoses: string[]
  differentials: string[]
  compliance: string[]
  noteId?: string | null
}

export interface FinalizationWizardProps {
  isOpen: boolean
  onClose: (result?: FinalizeNoteResponse) => void
  selectedCodes: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  selectedCodesList: any[]
  complianceIssues: any[]
  noteContent?: string
  patientInfo?: {
    patientId: string
    encounterId: string
  }
  steps?: FinalizationStepConfig[]
  onFinalize?: (payload: FinalizeNotePayload) => Promise<FinalizeNoteResponse>
  onError?: (message: string, error?: unknown) => void
}

interface WizardStep extends FinalizationStepConfig {
  completed: boolean
  hasIssues: boolean
}

export function FinalizationWizard({
  isOpen,
  onClose,
  selectedCodes = { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
  selectedCodesList = [],
  complianceIssues = [],
  noteContent = "",
  patientInfo,
  steps: customSteps,
  onFinalize,
  onError
}: FinalizationWizardProps) {
  const stepConfigs = customSteps ?? defaultFinalizationSteps
  const stepsCount = stepConfigs.length

  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>(() =>
    Array.from({ length: stepsCount }, () => false)
  )
  const [stepValidation, setStepValidation] = useState<{[key: number]: { valid: boolean, issues: string[] }}>({})
  const [isFinalizationComplete, setIsFinalizationComplete] = useState(false)
  const [estimatedReimbursement, setEstimatedReimbursement] = useState(0)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [finalizeResult, setFinalizeResult] = useState<FinalizeNoteResponse | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setIsFinalizationComplete(false)
      setFinalizeError(null)
      setFinalizeResult(null)
      setIsFinalizing(false)
    }
  }, [isOpen])

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    setCompletedSteps(prev => {
      if (prev.length === stepsCount) {
        return prev
      }

      return Array.from({ length: stepsCount }, (_, index) => prev[index] ?? false)
    })

    setCurrentStep(prev => {
      if (stepsCount === 0) {
        return 0
      }

      return Math.min(prev, stepsCount - 1)
    })
  }, [stepsCount])

  const activeComplianceIssues = (complianceIssues || []).filter(issue => !issue.dismissed)

  const steps: WizardStep[] = stepConfigs.map((stepConfig, index) => ({
    ...stepConfig,
    completed: completedSteps[index] || false,
    hasIssues:
      stepConfig.id === "compliance-checks" ? activeComplianceIssues.length > 0 : false
  }))

  const currentStepData = steps[currentStep]
  const CurrentStepIcon = currentStepData?.icon

  // Calculate progress percentage
  const totalSteps = steps.length
  const progress = totalSteps > 0
    ? (completedSteps.filter(Boolean).length / totalSteps) * 100
    : 0

  // Calculate estimated reimbursement from selected codes
  useEffect(() => {
    if (!selectedCodesList || !Array.isArray(selectedCodesList)) {
      setEstimatedReimbursement(0)
      return
    }
    
    const total = selectedCodesList.reduce((sum, code) => {
      if (code && code.reimbursement && code.reimbursement !== "N/A") {
        const amount = parseFloat(code.reimbursement.replace(/[$,]/g, ''))
        return sum + (isNaN(amount) ? 0 : amount)
      }
      return sum
    }, 0)
    setEstimatedReimbursement(total)
  }, [selectedCodesList])

  // Validate current step
  const validateStep = (stepIndex: number) => {
    const step = steps[stepIndex]
    if (!step) {
      return true
    }

    const stepId = step.id
    const issues: string[] = []
    let valid = true

    switch (stepId) {
      case "content-review":
        if (!noteContent || noteContent.trim().length < 50) {
          issues.push("Note content appears too brief for documentation requirements")
          valid = false
        }
        if (!patientInfo?.patientId) {
          issues.push("Patient ID is required")
          valid = false
        }
        break

      case "code-verification":
        if (!selectedCodes || selectedCodes.codes === 0) {
          issues.push("At least one CPT code is required")
          valid = false
        }
        break

      case "diagnoses-confirmation":
        if (!selectedCodes || selectedCodes.diagnoses === 0) {
          issues.push("At least one diagnosis code is required")
          valid = false
        }
        break

      case "compliance-checks":
        const activeIssues = complianceIssues.filter(issue => !issue.dismissed && issue.severity === "critical")
        if (activeIssues.length > 0) {
          issues.push(`${activeIssues.length} critical compliance issue(s) must be resolved`)
          valid = false
        }
        break

      default:
        valid = true
    }

    setStepValidation(prev => ({
      ...prev,
      [stepIndex]: { valid, issues }
    }))

    return valid
  }

  const handleStepComplete = (stepIndex: number) => {
    const isValid = validateStep(stepIndex)

    if (isValid && steps[stepIndex]) {
      setCompletedSteps(prev => {
        const updated = [...prev]
        updated[stepIndex] = true
        return updated
      })
    }
  }

  const canProceedToNext = () => {
    if (!currentStepData) {
      return true
    }
    if (currentStepData.required) {
      return completedSteps[currentStep]
    }
    return true // Optional steps can be skipped
  }

  const canFinalize = () => {
    const requiredSteps = steps.map((step, index) => ({ step, index })).filter(s => s.step.required)
    return requiredSteps.every(({ index }) => completedSteps[index])
  }

  const handleFinalize = async () => {
    if (!canFinalize() || isFinalizing) {
      return
    }

    setFinalizeError(null)
    setIsFinalizing(true)

    const sanitizedCodes = Array.isArray(selectedCodesList) ? selectedCodesList : []
    const extractCodes = (category: string) => {
      const matches = sanitizedCodes
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

    const payload: FinalizeNotePayload = {
      content: noteContent,
      codes: extractCodes("codes"),
      prevention: extractCodes("prevention"),
      diagnoses: extractCodes("diagnoses"),
      differentials: extractCodes("differentials"),
      compliance: (Array.isArray(complianceIssues) ? complianceIssues : [])
        .filter(issue => issue && !issue.dismissed)
        .map(issue => {
          const identifier = typeof issue.id === "string" && issue.id.trim().length > 0 ? issue.id.trim() : null
          const fallback = typeof issue.title === "string" && issue.title.trim().length > 0 ? issue.title.trim() : null
          return identifier ?? fallback
        })
        .filter((value): value is string => Boolean(value))
    }

    let result: FinalizeNoteResponse | null = null

    try {
      if (onFinalize) {
        result = await onFinalize(payload)
      } else {
        const response = await fetch("/api/notes/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          let errorMessage = "Failed to finalize the note."
          try {
            const errorData = await response.json()
            errorMessage =
              (typeof errorData?.detail === "string" && errorData.detail.length > 0)
                ? errorData.detail
                : errorMessage
          } catch {
            // Ignore JSON parsing errors and fall back to default message
          }
          throw new Error(errorMessage)
        }

        const data: FinalizeNoteResponse = await response.json()
        result = data
      }
      if (result) {
        setFinalizeResult(result)
        setIsFinalizationComplete(true)
        if (!onFinalize) {
          toast.success("Note finalized", {
            description: result.exportReady
              ? "The note has been finalized and is ready for export."
              : "The note was finalized, but some items still require review."
          })
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while finalizing the note."
      setFinalizeError(message)
      if (!onFinalize) {
        toast.error("Finalization failed", {
          description: message
        })
      }
      if (onError) {
        onError(message, error)
      }
      console.error("Failed to finalize note:", error)
    } finally {
      setIsFinalizing(false)
    }

    if (result) {
      onClose(result)
    }
  }

  const getCurrentStepContent = () => {
    const step = steps[currentStep]
    if (!step) {
      return <div>Step content not available</div>
    }
    const validation = stepValidation[currentStep]

    switch (step.id) {
      case "content-review":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Patient Information</label>
                <div className="p-3 bg-muted/30 rounded-lg text-sm">
                  <div>Patient ID: {patientInfo?.patientId || "Not specified"}</div>
                  <div>Encounter ID: {patientInfo?.encounterId || "Not specified"}</div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Documentation Stats</label>
                <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                  <div>Character count: {noteContent.length}</div>
                  <div>Word count: ~{Math.ceil(noteContent.length / 5)}</div>
                  <div>Status: {noteContent.length > 200 ? "✅ Adequate" : "⚠️ Brief"}</div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Required Documentation Elements</label>
              <div className="space-y-2">
                {[
                  { item: "Chief complaint documented", checked: noteContent.includes("Chief") || noteContent.length > 100 },
                  { item: "History of present illness", checked: noteContent.length > 150 },
                  { item: "Physical examination findings", checked: noteContent.length > 200 },
                  { item: "Assessment and plan", checked: noteContent.length > 100 }
                ].map((req, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Checkbox checked={req.checked} disabled />
                    <span className={`text-sm ${req.checked ? "text-foreground" : "text-muted-foreground"}`}>
                      {req.item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {validation?.issues && validation.issues.length > 0 && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <ul className="list-disc list-inside space-y-1">
                    {validation.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )

      case "code-verification":
        const cptCodes = (selectedCodesList || []).filter(code => code && code.type === "CPT")
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {cptCodes.length > 0 ? (
                cptCodes.map((code, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-blue-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Code2 className="h-4 w-4 text-blue-600" />
                        <div>
                          <div className="font-medium text-sm">{code.code} - {code.description}</div>
                          <div className="text-xs text-muted-foreground">{code.rationale}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">{code.reimbursement}</div>
                        <div className="text-xs text-muted-foreground">RVU: {code.rvu}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    No CPT codes selected. At least one procedure or E/M code is required for billing.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Estimated Total Reimbursement:</span>
                <span className="font-bold text-lg text-green-600">
                  ${estimatedReimbursement.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )

      case "prevention-items":
        const preventionCodes = (selectedCodesList || []).filter(code => code && code.category === "prevention")
        return (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Review preventive care items and recommendations for this encounter.
            </div>
            
            {preventionCodes.length > 0 ? (
              <div className="space-y-3">
                {preventionCodes.map((code, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-red-50/50">
                    <div className="flex items-center gap-3">
                      <Heart className="h-4 w-4 text-red-600" />
                      <div>
                        <div className="font-medium text-sm">{code.description}</div>
                        <div className="text-xs text-muted-foreground">{code.rationale}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                No prevention items selected for this encounter.
                <br />
                <span className="text-xs">This step can be skipped if no preventive care was provided.</span>
              </div>
            )}
          </div>
        )

      case "diagnoses-confirmation":
        const diagnosisCodes = (selectedCodesList || []).filter(code => code && code.category === "diagnoses")
        return (
          <div className="space-y-4">
            {diagnosisCodes.length > 0 ? (
              <div className="space-y-3">
                {diagnosisCodes.map((code, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-purple-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Activity className="h-4 w-4 text-purple-600" />
                        <div>
                          <div className="font-medium text-sm">{code.code} - {code.description}</div>
                          <div className="text-xs text-muted-foreground">{code.rationale}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {code.confidence}% confidence
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  No diagnosis codes selected. At least one ICD-10 diagnosis code is required.
                </AlertDescription>
              </Alert>
            )}

            <div className="p-3 bg-muted/30 rounded-lg text-sm">
              <div className="font-medium mb-2">Diagnosis Coding Guidelines:</div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Primary diagnosis should reflect the main reason for the encounter</li>
                <li>Secondary diagnoses should be listed in order of clinical significance</li>
                <li>All documented conditions affecting patient care should be coded</li>
              </ul>
            </div>
          </div>
        )

      case "differentials-review":
        const differentialCodes = (selectedCodesList || []).filter(code => code && code.category === "differentials")
        return (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Review differential diagnoses that were considered but not confirmed.
            </div>

            {differentialCodes.length > 0 ? (
              <div className="space-y-3">
                {differentialCodes.map((code, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-green-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Stethoscope className="h-4 w-4 text-green-600" />
                        <div>
                          <div className="font-medium text-sm">{code.description}</div>
                          <div className="text-xs text-muted-foreground">{code.rationale}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {code.confidence}% likelihood
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                No differential diagnoses documented for this encounter.
                <br />
                <span className="text-xs">This step can be skipped if no differentials were considered.</span>
              </div>
            )}
          </div>
        )

      case "compliance-checks":
        const activeIssues = (complianceIssues || []).filter(issue => !issue.dismissed)
        const criticalIssues = activeIssues.filter(issue => issue.severity === "critical")
        
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium mb-1">Total Issues</div>
                <div className="text-2xl font-bold">{activeIssues.length}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium mb-1">Critical Issues</div>
                <div className="text-2xl font-bold text-red-600">{criticalIssues.length}</div>
              </div>
            </div>

            {activeIssues.length > 0 ? (
              <div className="space-y-3">
                {activeIssues.map((issue, index) => (
                  <Alert key={index} className={`
                    ${issue.severity === "critical" ? "border-red-200 bg-red-50" : 
                      issue.severity === "warning" ? "border-amber-200 bg-amber-50" : 
                      "border-blue-200 bg-blue-50"}
                  `}>
                    <AlertTriangle className={`h-4 w-4 ${
                      issue.severity === "critical" ? "text-red-600" :
                      issue.severity === "warning" ? "text-amber-600" :
                      "text-blue-600"
                    }`} />
                    <AlertDescription className="space-y-1">
                      <div className="font-medium">{issue.title}</div>
                      <div className="text-sm">{issue.description}</div>
                      <div className="text-xs text-muted-foreground">{issue.suggestion}</div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  All compliance checks passed. Note is ready for finalization.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )

      default:
        return <div>Step content not implemented</div>
    }
  }

  if (isFinalizationComplete) {
    const totalFinalizedCodes = finalizeResult?.codesSummary?.length ?? (selectedCodesList || []).length
    const totalFinalizedReimbursement =
      typeof finalizeResult?.reimbursementSummary?.total === "number"
        ? finalizeResult.reimbursementSummary.total
        : estimatedReimbursement
    const exportStatusText = finalizeResult
      ? finalizeResult.exportReady
        ? "✅ Approved"
        : "⚠️ Requires Review"
      : "✅ Approved"
    const exportStatusClass = finalizeResult && !finalizeResult.exportReady ? "text-amber-600" : "text-green-600"

    return (
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Note Finalized Successfully
            </DialogTitle>
            <DialogDescription>
              Your clinical note has been finalized and is ready for submission.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Codes:</span>
                  <span className="font-medium">{totalFinalizedCodes}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Estimated Reimbursement:</span>
                  <span className="font-bold text-green-600">${totalFinalizedReimbursement.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Compliance Status:</span>
                  <span className={`font-medium ${exportStatusClass}`}>{exportStatusText}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full" onClick={() => console.log("Export to EHR")}>
                <Send className="h-4 w-4 mr-2" />
                Export to EHR System
              </Button>
              <Button variant="outline" className="w-full" onClick={() => console.log("Download PDF")}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF Copy
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onClose()}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Note Finalization Wizard
          </DialogTitle>
          <DialogDescription>
            Complete the 6-step finalization process to validate and submit your clinical note.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Step Navigation Sidebar */}
          <div className="w-80 border-r bg-muted/30 p-4 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Progress</div>
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {completedSteps.filter(Boolean).length} of {totalSteps} steps completed
              </div>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => {
                const StepIcon = step.icon
                const isActive = index === currentStep
                const isCompleted = completedSteps[index]
                const hasValidationIssues = stepValidation[index]?.valid === false

                return (
                  <div
                    key={step.id}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-all
                      ${isActive 
                        ? `${step.bgColor} border-current/30 shadow-sm` 
                        : isCompleted 
                          ? 'bg-green-50 border-green-200 hover:bg-green-100'
                          : 'bg-background border-border hover:bg-muted/50'
                      }
                    `}
                    onClick={() => setCurrentStep(index)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-md flex-shrink-0
                        ${isActive 
                          ? step.color.replace('text-', 'bg-').replace('-600', '-100') + ' ' + step.color
                          : isCompleted
                            ? 'bg-green-100 text-green-600'
                            : 'bg-muted text-muted-foreground'
                        }
                      `}>
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : hasValidationIssues ? (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        ) : (
                          (() => {
                            const StepIcon = step.icon
                            return <StepIcon className="h-4 w-4" />
                          })()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {step.description}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {step.required && (
                            <Badge variant="outline" className="text-xs px-1">
                              Required
                            </Badge>
                          )}
                          {hasValidationIssues && (
                            <Badge variant="destructive" className="text-xs px-1">
                              Issues
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-6 border-b shrink-0">
              <div className="flex items-center gap-3">
                {CurrentStepIcon && (
                  <CurrentStepIcon className={`h-5 w-5 ${currentStepData?.color ?? ""}`} />
                )}
                <div>
                  <h3 className="font-medium">{currentStepData?.title}</h3>
                  <p className="text-sm text-muted-foreground">{currentStepData?.description}</p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              {getCurrentStepContent()}
            </ScrollArea>

            {/* Navigation Footer */}
            <div className="border-t p-6 bg-muted/20 shrink-0">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  disabled={currentStep === 0}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {currentStep < steps.length - 1 ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleStepComplete(currentStep)}
                        disabled={stepValidation[currentStep]?.valid === false}
                      >
                        {completedSteps[currentStep] ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Completed
                          </>
                        ) : (
                          <>
                            Mark Complete
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                        disabled={!!currentStepData?.required && !canProceedToNext()}
                      >
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleFinalize}
                      disabled={!canFinalize() || isFinalizing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isFinalizing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      {isFinalizing ? "Finalizing..." : "Finalize Note"}
                    </Button>
                  )}
                </div>
              </div>

              {finalizeError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{finalizeError}</AlertDescription>
                </Alert>
              )}

              {!canFinalize() && currentStep === steps.length - 1 && (
                <div className="mt-3 text-sm text-amber-600 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Complete all required steps before finalizing the note.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}