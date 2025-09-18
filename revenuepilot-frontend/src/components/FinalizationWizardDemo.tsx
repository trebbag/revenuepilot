import { useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "./ui/dialog"
import { FinalizationWizard } from "./finalization/FinalizationWizard"

import { Shield, FileText, Code2, Heart, Activity } from "lucide-react"

export function FinalizationWizardDemo() {
  const [showWizard, setShowWizard] = useState(false)

  // Mock data that would typically come from the actual note editor
  const mockSelectedCodes = {
    codes: 2,
    prevention: 1,
    diagnoses: 3,
    differentials: 1
  }

  const mockComplianceIssues = [
    {
      id: "mdm-1",
      severity: "critical" as const,
      title: "Medical Decision Making complexity not documented",
      description: "The note lacks specific documentation of medical decision making complexity required for E/M coding.",
      category: "documentation" as const,
      details: "For CPT 99214, you must document moderate level medical decision making. Include number of diagnoses/management options, amount of data reviewed, and risk assessment.",
      suggestion: "Add a Medical Decision Making section with: 1) Problem complexity assessment, 2) Data reviewed, 3) Risk stratification table showing moderate complexity.",
      learnMoreUrl: "https://www.cms.gov/outreach-and-education/medicare-learning-network-mln/mlnproducts/downloads/eval-mgmt-serv-guide-icn006764.pdf",
      dismissed: false
    },
    {
      id: "ros-1", 
      severity: "warning" as const,
      title: "Review of Systems incomplete",
      description: "Extended Review of Systems (ROS) documentation is missing or incomplete for this level of service.",
      category: "documentation" as const,
      details: "E/M level 4 visits require extended ROS covering 2-9 systems or complete ROS covering 10+ systems to support the level of service billed.",
      suggestion: "Document a systematic review of systems including respiratory, cardiovascular, gastrointestinal, and other relevant systems. Include both positive and negative findings.",
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

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium">Finalization Wizard Demo</h1>
          <p className="text-muted-foreground">
            The finalization wizard is now isolated as a separate component. This demo shows how it can be used independently of the main note editor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Mock Data Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Mock Note Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Selected Codes Summary</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                    {mockSelectedCodes.codes} CPT Codes
                  </Badge>
                  <Badge variant="secondary" className="bg-red-50 text-red-700">
                    {mockSelectedCodes.prevention} Prevention
                  </Badge>
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700">
                    {mockSelectedCodes.diagnoses} Diagnoses
                  </Badge>
                  <Badge variant="secondary" className="bg-green-50 text-green-700">
                    {mockSelectedCodes.differentials} Differentials
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Compliance Issues</div>
                <div className="text-sm text-muted-foreground">
                  {mockComplianceIssues.filter(issue => !issue.dismissed).length} active issues
                  ({mockComplianceIssues.filter(issue => issue.severity === 'critical' && !issue.dismissed).length} critical)
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Note Content</div>
                <div className="text-sm text-muted-foreground">
                  {mockNoteContent.length} characters, ~{Math.ceil(mockNoteContent.length / 5)} words
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Why teams love the finalization wizard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-1.5">
                  <Code2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-foreground">AI-assisted coding review</div>
                  <p>
                    Track AI and human selections side-by-side with contextual evidence links and patient question prompts.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-1.5">
                  <Heart className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Patient-ready narratives</div>
                  <p>
                    Generate beautifully formatted summaries while preserving access to the original note content for compliance review.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-1.5">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Shared workflow intelligence</div>
                  <p>
                    Leverage the same production-ready wizard used across RevenuePilot properties for consistent experiences.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Launch Wizard Button */}
        <div className="flex items-center justify-center py-8">
          <Button 
            onClick={() => setShowWizard(true)}
            size="lg"
            className="bg-primary hover:bg-primary/90"
          >
            <Shield className="h-4 w-4 mr-2" />
            Launch Finalization Wizard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Component Benefits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Explore the shared finalization experience used across RevenuePilot products.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Rich visual workflow optimized for coding and compliance review</li>
              <li>Interactive AI-assisted note comparison with evidence highlighting</li>
              <li>Shared component sourced directly from the <code>finalization-wizard</code> package</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-[calc(100vw-3rem)] w-full max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border bg-background px-6 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold">Finalization Wizard</DialogTitle>
              <DialogDescription>
                Review AI workflows, compliance insights, and patient-ready summaries.
              </DialogDescription>
            </div>
            <Button variant="ghost" onClick={() => setShowWizard(false)}>
              Close
            </Button>
          </DialogHeader>
          <div className="h-full overflow-y-auto">
            <FinalizationWizard />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}