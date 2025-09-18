import { useState } from "react"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

import { Badge } from "./ui/badge"
import { FinalizationWizard } from "./FinalizationWizard"

import type { FinalizeNoteResponse } from "./FinalizationWizard"
import {
  Shield,
  FileText,
  Code2,
  Heart,
  Activity,
  Stethoscope
} from "lucide-react"
import { defaultFinalizationSteps } from "./finalizationSteps"

import {
  FinalizationWizard,
  type FinalizeResult,
  type PatientMetadata,
  type WizardCodeItem,
  type WizardComplianceItem
} from "finalization-wizard"
import { Activity, Code2, FileText, Heart, Shield, Stethoscope } from "lucide-react"


type CodeCategory = "codes" | "prevention" | "diagnoses" | "differentials"

type SessionCodeLike = {
  id?: string
  code: string
  type: string
  category: CodeCategory
  description: string
  rationale?: string
  confidence?: number
  reimbursement?: string
  rvu?: string
}

type ComplianceLike = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  category: string
  details: string
  suggestion: string
  learnMoreUrl?: string
  dismissed?: boolean
}

const CODE_CLASSIFICATION_MAP: Record<CodeCategory, string> = {
  codes: "code",
  prevention: "prevention",
  diagnoses: "diagnosis",
  differentials: "differential"
}

const COMPLIANCE_SEVERITY_MAP: Record<string, WizardComplianceItem["severity"]> = {
  critical: "high",
  warning: "medium",
  info: "low"
}

const sanitizeString = (value?: string | null): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const toWizardCodeItems = (
  list: SessionCodeLike[],
  defaultStatus: WizardCodeItem["status"]
): WizardCodeItem[] => {
  return list.map((item, index) => {
    const classification = CODE_CLASSIFICATION_MAP[item.category]

    const base: WizardCodeItem = {
      id: item.id ?? `${item.code}-${index}`,
      code: item.code,
      title: item.description,
      description: item.description,
      details: item.rationale,
      status: defaultStatus,
      codeType: item.type,
      classification,
      category: item.category,
      confidence: item.confidence,
      reimbursement: item.reimbursement,
      rvu: item.rvu
    }

    base.tags = [classification]
    return base
  })
}

const toWizardComplianceItems = (list: ComplianceLike[]): WizardComplianceItem[] => {
  return list
    .filter(issue => !issue.dismissed)
    .map(issue => ({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: "pending",
      severity: COMPLIANCE_SEVERITY_MAP[issue.severity] ?? "medium",
      category: issue.category
    }))
}

const toPatientMetadata = (info: { patientId: string; encounterId: string }): PatientMetadata => {
  const metadata: PatientMetadata = {}
  const patientId = sanitizeString(info.patientId)
  const encounterId = sanitizeString(info.encounterId)
  if (patientId) metadata.patientId = patientId
  if (encounterId) metadata.encounterId = encounterId
  return metadata
}

const mockSelectedCodesCounts = {
  codes: 2,
  prevention: 1,
  diagnoses: 3,
  differentials: 1
}

const mockSelectedCodesList: SessionCodeLike[] = [
  {
    id: "code-1",
    code: "99213",
    type: "CPT",
    category: "codes",
    description: "Office visit, established patient",
    rationale: "Moderate complexity medical decision making with established patient visit",
    confidence: 87,
    reimbursement: "$127.42",
    rvu: "1.92"
  },
  {
    id: "code-2",
    code: "99214",
    type: "CPT",
    category: "codes",
    description: "Office visit, established patient (moderate complexity)",
    rationale: "High complexity decision making documented with comprehensive assessment",
    confidence: 78,
    reimbursement: "$184.93",
    rvu: "2.80"
  },
  {
    id: "code-3",
    code: "J06.9",
    type: "ICD-10",
    category: "diagnoses",
    description: "Acute upper respiratory infection, unspecified",
    rationale: "Primary diagnosis based on presenting symptoms and clinical findings",
    confidence: 92
  },
  {
    id: "code-4",
    code: "J02.9",
    type: "ICD-10",
    category: "diagnoses",
    description: "Acute pharyngitis, unspecified",
    rationale: "Secondary diagnosis from physical examination findings",
    confidence: 84
  },
  {
    id: "code-5",
    code: "Z23",
    type: "ICD-10",
    category: "diagnoses",
    description: "Encounter for immunization",
    rationale: "Patient received influenza vaccination during visit",
    confidence: 95
  },
  {
    id: "code-6",
    code: "Annual Wellness Visit",
    type: "PREVENTION",
    category: "prevention",
    description: "Annual wellness visit counseling",
    rationale: "Patient counseled on preventive care measures",
    confidence: 88
  },
  {
    id: "code-7",
    code: "Viral URI vs Bacterial Sinusitis",
    type: "DIFFERENTIAL",
    category: "differentials",
    description: "Primary differential diagnosis consideration",
    rationale: "85% confidence viral, 35% bacterial based on symptom pattern",
    confidence: 85
  }
]

const mockSuggestedCodesList: SessionCodeLike[] = [
  {
    id: "suggest-1",
    code: "Z13.6",
    type: "ICD-10",
    category: "prevention",
    description: "Encounter for screening for cardiovascular disorders",
    rationale: "AI identified risk factors that support preventive screening",
    confidence: 82
  },
  {
    id: "suggest-2",
    code: "93000",
    type: "CPT",
    category: "codes",
    description: "Electrocardiogram, routine ECG with interpretation",
    rationale: "Plan includes ECG order that should be captured for billing",
    confidence: 85
  }
]

const mockComplianceIssues: ComplianceLike[] = [
  {
    id: "mdm-1",
    severity: "critical",
    title: "Medical Decision Making complexity not documented",
    description: "The note lacks specific documentation of medical decision making complexity required for E/M coding.",
    category: "documentation",
    details: "For CPT 99214, you must document moderate level medical decision making.",
    suggestion: "Add a Medical Decision Making section with problem complexity, data reviewed, and risk assessment.",
    learnMoreUrl: "https://www.cms.gov/outreach-and-education/medicare-learning-network-mln/mlnproducts/downloads/eval-mgmt-serv-guide-icn006764.pdf",
    dismissed: false
  },
  {
    id: "ros-1",
    severity: "warning",
    title: "Review of Systems incomplete",
    description: "Extended Review of Systems (ROS) documentation is missing or incomplete for this level of service.",
    category: "documentation",
    details: "E/M level 4 visits require extended ROS covering 2-9 systems.",
    suggestion: "Document a systematic review of systems including respiratory, cardiovascular, and other relevant systems.",
    learnMoreUrl: "https://www.cms.gov/medicare/physician-fee-schedule/physician-fee-schedule",
    dismissed: true
  }
]

const mockNoteContent = `
CHIEF COMPLAINT: Persistent cough for 2 weeks

HISTORY OF PRESENT ILLNESS:
The patient is a 45-year-old established patient who presents with a chief complaint of persistent dry cough lasting approximately 2 weeks. The cough is mostly nonproductive but occasionally brings up small amounts of clear mucus. Patient reports mild dyspnea on exertion, particularly when climbing stairs. Denies fever, chills, or weight loss. Cough seems worse in the morning hours.

REVIEW OF SYSTEMS:
Respiratory: Positive for cough and mild dyspnea on exertion. Negative for chest pain, wheezing, or hemoptysis.
Cardiovascular: Negative for chest pain, palpitations, or syncope.
Constitutional: Negative for fever, chills, night sweats, or unintentional weight loss.

PHYSICAL EXAMINATION:
Vital Signs: BP 118/76, HR 72, RR 16, Temp 98.6°F, O2 Sat 98% on room air
General: Alert, oriented, in no acute distress
Respiratory: Lungs clear to auscultation bilaterally, no wheezes, rales, or rhonchi
Cardiovascular: Regular rate and rhythm, no murmurs
ENT: Mild erythema of posterior pharynx

ASSESSMENT AND PLAN:
1. Acute upper respiratory infection (J06.9) - likely viral etiology given clear lungs and absence of fever
2. Acute pharyngitis (J02.9) - mild erythema noted on examination
3. Immunization encounter (Z23) - administered influenza vaccine per patient request

The patient was counseled on supportive care measures including rest, hydration, and symptomatic treatment. Return if symptoms worsen or persist beyond 7-10 days.
`

const mockPatientInfo = {
  patientId: "PAT-12345",
  encounterId: "ENC-67890"
}

const wizardSelectedCodes = toWizardCodeItems(mockSelectedCodesList, "confirmed")
const wizardSuggestedCodes = toWizardCodeItems(mockSuggestedCodesList, "pending")
const wizardComplianceItems = toWizardComplianceItems(mockComplianceIssues)
const wizardPatientMetadata = toPatientMetadata(mockPatientInfo)

export function FinalizationWizardDemo() {
  const [showWizard, setShowWizard] = useState(false)

  const handleWizardClose = (result?: FinalizeResult) => {
    setShowWizard(false)
    if (result) {
      console.log("Finalized note data:", result)
    }
  }

  const activeComplianceCount = mockComplianceIssues.filter(issue => !issue.dismissed).length
  const criticalComplianceCount = mockComplianceIssues.filter(
    issue => issue.severity === "critical" && !issue.dismissed
  ).length

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium">Finalization Wizard Demo</h1>
          <p className="text-muted-foreground">
            This demo showcases the shared <code>finalization-wizard</code> package. It mirrors how the adapter integrates the
            workflow inside the main note editor experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Selected Code Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Badge variant="secondary" className="justify-start gap-2">
                  <Code2 className="h-3.5 w-3.5" />
                  {mockSelectedCodesCounts.codes} CPT Codes
                </Badge>
                <Badge variant="secondary" className="justify-start gap-2">
                  <Heart className="h-3.5 w-3.5" />
                  {mockSelectedCodesCounts.prevention} Prevention Items
                </Badge>
                <Badge variant="secondary" className="justify-start gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  {mockSelectedCodesCounts.diagnoses} Diagnoses
                </Badge>
                <Badge variant="secondary" className="justify-start gap-2">
                  <Stethoscope className="h-3.5 w-3.5" />
                  {mockSelectedCodesCounts.differentials} Differentials
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Confidence scores range from 78% to 95% across confirmed codes. Suggested additions focus on preventive care and
                capturing procedures noted in the plan.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Compliance Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {activeComplianceCount} active issue{activeComplianceCount === 1 ? "" : "s"} ({criticalComplianceCount} critical)
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Documentation gaps are converted to wizard compliance cards.</li>
                <li>Resolved items stay dismissed and are excluded from finalization payloads.</li>
                <li>Pre-finalization checks update this list before dispatching.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Note Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>{mockNoteContent.length} characters (~{Math.ceil(mockNoteContent.length / 5)} words)</div>
              <div>Patient ID: {mockPatientInfo.patientId}</div>
              <div>Encounter ID: {mockPatientInfo.encounterId}</div>
              <div>Suggested codes available: {mockSuggestedCodesList.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Package Highlights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>The shared wizard provides:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Rich multi-step workflow with animated progress indicators.</li>
                <li>Dual editor comparison and AI beautification previews.</li>
                <li>Built-in request shaping for finalize API calls.</li>
                <li>Composable step overrides for bespoke flows.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-center py-8">
          <Button onClick={() => setShowWizard(true)} size="lg" className="bg-primary hover:bg-primary/90">
            <Shield className="mr-2 h-4 w-4" />
            Launch Finalization Wizard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Integration Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-medium text-foreground">Using the shared package:</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li>Install <code>finalization-wizard</code> as a workspace dependency.</li>
                <li>Import <code>FinalizationWizard</code> and supporting types from the package.</li>
                <li>Pass normalized code, suggestion, and compliance items.</li>
                <li>Handle <code>onFinalize</code> to call backend endpoints, then close via <code>onClose</code>.</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-foreground">Adapter reminders:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Use the adapter to translate session state into wizard-friendly structures.</li>
                <li>Hook the pre-finalization API to refresh compliance feedback.</li>
                <li>Forward the finalization result to persist the beautified note.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {showWizard && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowWizard(false)}
          />
          <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
            <FinalizationWizard
              selectedCodes={wizardSelectedCodes}
              suggestedCodes={wizardSuggestedCodes}
              complianceItems={wizardComplianceItems}
              noteContent={mockNoteContent}
              patientMetadata={wizardPatientMetadata}
              onClose={handleWizardClose}
            />
          </div>
        </div>
      )}
    </div>
  )
}
