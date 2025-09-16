import type { ComponentType } from "react"
import {
  FileText,
  Code2,
  Heart,
  Activity,
  Stethoscope,
  Shield
} from "lucide-react"

export interface FinalizationStepConfig {
  id: string
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  color: string
  bgColor: string
  required: boolean
}

export const contentReviewStep: FinalizationStepConfig = {
  id: "content-review",
  title: "Content Review",
  description: "Review and verify note documentation completeness",
  icon: FileText,
  color: "text-blue-600",
  bgColor: "bg-blue-50",
  required: true
}

export const codeVerificationStep: FinalizationStepConfig = {
  id: "code-verification",
  title: "Code Verification",
  description: "Validate selected CPT and procedure codes",
  icon: Code2,
  color: "text-blue-600",
  bgColor: "bg-blue-50",
  required: true
}

export const preventionItemsStep: FinalizationStepConfig = {
  id: "prevention-items",
  title: "Prevention Items",
  description: "Review preventive care recommendations",
  icon: Heart,
  color: "text-red-600",
  bgColor: "bg-red-50",
  required: false
}

export const diagnosesConfirmationStep: FinalizationStepConfig = {
  id: "diagnoses-confirmation",
  title: "Diagnoses Confirmation",
  description: "Confirm primary and secondary diagnoses",
  icon: Activity,
  color: "text-purple-600",
  bgColor: "bg-purple-50",
  required: true
}

export const differentialsReviewStep: FinalizationStepConfig = {
  id: "differentials-review",
  title: "Differentials Review",
  description: "Review differential diagnosis considerations",
  icon: Stethoscope,
  color: "text-green-600",
  bgColor: "bg-green-50",
  required: false
}

export const complianceChecksStep: FinalizationStepConfig = {
  id: "compliance-checks",
  title: "Compliance Checks",
  description: "Final compliance and billing validation",
  icon: Shield,
  color: "text-amber-600",
  bgColor: "bg-amber-50",
  required: true
}

export const defaultFinalizationSteps: FinalizationStepConfig[] = [
  contentReviewStep,
  codeVerificationStep,
  preventionItemsStep,
  diagnosesConfirmationStep,
  differentialsReviewStep,
  complianceChecksStep
]
