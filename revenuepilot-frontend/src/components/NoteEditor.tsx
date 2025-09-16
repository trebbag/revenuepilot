import { useState, useEffect } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Badge } from "./ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { 
  CheckCircle, 
  Save, 
  Play, 
  Square, 
  Clock, 
  Undo, 
  Redo,
  X,
  Mic,
  MicOff,
  AlertTriangle
} from "lucide-react"
import { RichTextEditor } from "./RichTextEditor"
import { BeautifiedView } from "./BeautifiedView"
import { FinalizationWizard } from "./FinalizationWizard"

interface ComplianceIssue {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  category: 'documentation' | 'coding' | 'billing' | 'quality'
  details: string
  suggestion: string
  learnMoreUrl?: string
  dismissed?: boolean
}

interface NoteEditorProps {
  prePopulatedPatient?: {
    patientId: string
    encounterId: string
  } | null
  selectedCodes?: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  selectedCodesList?: any[]
  onNoteContentChange?: (content: string) => void
}

export function NoteEditor({
  prePopulatedPatient,
  selectedCodes = { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
  selectedCodesList = [],
  onNoteContentChange
}: NoteEditorProps) {
  const [patientId, setPatientId] = useState(prePopulatedPatient?.patientId || "")
  const [encounterId, setEncounterId] = useState(prePopulatedPatient?.encounterId || "")
  const [noteContent, setNoteContent] = useState("")

  const [isRecording, setIsRecording] = useState(false)
  const [visitStarted, setVisitStarted] = useState(false)
  const [hasEverStarted, setHasEverStarted] = useState(false)
  const [currentSessionTime, setCurrentSessionTime] = useState(0)
  const [pausedTime, setPausedTime] = useState(0)
  const [transcriptionIndex, setTranscriptionIndex] = useState(0)
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [showFinalizationWizard, setShowFinalizationWizard] = useState(false)

  // Mock compliance issues data
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([
    {
      id: "mdm-1",
      severity: "critical",
      title: "Medical Decision Making complexity not documented",
      description: "The note lacks specific documentation of medical decision making complexity required for E/M coding.",
      category: "documentation",
      details: "For CPT 99214, you must document moderate level medical decision making. Include number of diagnoses/management options, amount of data reviewed, and risk assessment.",
      suggestion: "Add a Medical Decision Making section with: 1) Problem complexity assessment, 2) Data reviewed, 3) Risk stratification table showing moderate complexity.",
      learnMoreUrl: "https://www.cms.gov/outreach-and-education/medicare-learning-network-mln/mlnproducts/downloads/eval-mgmt-serv-guide-icn006764.pdf",
      dismissed: false
    },
    {
      id: "ros-1", 
      severity: "warning",
      title: "Review of Systems incomplete",
      description: "Extended Review of Systems (ROS) documentation is missing or incomplete for this level of service.",
      category: "documentation",
      details: "E/M level 4 visits require extended ROS covering 2-9 systems or complete ROS covering 10+ systems to support the level of service billed.",
      suggestion: "Document a systematic review of systems including respiratory, cardiovascular, gastrointestinal, and other relevant systems. Include both positive and negative findings.",
      learnMoreUrl: "https://www.cms.gov/medicare/physician-fee-schedule/physician-fee-schedule",
      dismissed: false
    },
    {
      id: "icd-specificity-1",
      severity: "info", 
      title: "ICD-10 code specificity can be improved",
      description: "Some diagnosis codes could be more specific to improve clinical accuracy and billing precision.",
      category: "coding",
      details: "Using more specific ICD-10 codes when clinical information supports it can improve care coordination and reduce the need for additional documentation requests.",
      suggestion: "Review selected diagnosis codes and consider if more specific codes are appropriate based on documented clinical findings.",
      dismissed: false
    }
  ])

  const handleDismissIssue = (issueId: string) => {
    setComplianceIssues(prev => 
      prev.map(issue => 
        issue.id === issueId ? { ...issue, dismissed: true } : issue
      )
    )
  }

  const handleRestoreIssue = (issueId: string) => {
    setComplianceIssues(prev => 
      prev.map(issue => 
        issue.id === issueId ? { ...issue, dismissed: false } : issue
      )
    )
  }

  // Calculate active issues for button state
  const activeIssues = complianceIssues.filter(issue => !issue.dismissed)
  const criticalIssues = activeIssues.filter(issue => issue.severity === 'critical')
  const hasActiveIssues = activeIssues.length > 0
  const hasCriticalIssues = criticalIssues.length > 0

  // Mock transcription lines that simulate a live medical conversation
  const mockTranscriptionLines = [
    "Patient: I've been having this persistent cough for about two weeks now.",
    "Doctor: Can you describe the cough? Is it dry or productive?",
    "Patient: It's mostly dry, but sometimes I bring up a little clear mucus.",
    "Doctor: Any fever or shortness of breath with the cough?",
    "Patient: No fever, but I do feel a bit winded when I climb stairs.",
    "Doctor: Let me listen to your lungs. Take a deep breath for me.",
    "Patient: Should I be concerned about this lasting so long?",
    "Doctor: Your lungs sound clear. When did you first notice the symptoms?",
    "Patient: It started right after I got over that cold everyone had.",
    "Doctor: That's helpful context. Any family history of respiratory issues?",
    "Patient: My father had asthma, but I've never been diagnosed with it.",
    "Doctor: Let's check your oxygen saturation and peak flow.",
    "Patient: Is this something that could be related to allergies?",
    "Doctor: Possibly. Have you noticed any environmental triggers?",
    "Patient: Now that you mention it, it does seem worse in the mornings."
  ]

  // Timer effect for recording
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isRecording && visitStarted) {
      interval = setInterval(() => {
        setCurrentSessionTime(time => time + 1)
        // Update transcription every 3 seconds to simulate live transcription
        if (currentSessionTime % 3 === 0) {
          setTranscriptionIndex(prev => (prev + 1) % mockTranscriptionLines.length)
        }
      }, 1000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRecording, visitStarted, currentSessionTime, mockTranscriptionLines.length])

  // Get the last 3 lines of transcription for tooltip
  const getRecentTranscription = () => {
    const lines = []
    for (let i = 2; i >= 0; i--) {
      const index = (transcriptionIndex - i + mockTranscriptionLines.length) % mockTranscriptionLines.length
      lines.push(mockTranscriptionLines[index])
    }
    return lines
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleFinalize = () => {
    setShowFinalizationWizard(true)
  }

  const handleSaveDraft = () => {
    // TODO: Save draft and navigate to drafts page
    console.log("Saving draft and exiting...")
  }

  const handleVisitToggle = () => {
    if (!visitStarted) {
      // Starting or resuming visit
      setVisitStarted(true)
      setIsRecording(true)
      if (!hasEverStarted) {
        // First time starting - reset everything
        setHasEverStarted(true)
        setCurrentSessionTime(0)
        setPausedTime(0)
      } else {
        // Resuming - continue from paused time
        setCurrentSessionTime(pausedTime)
      }
    } else {
      // Pausing visit
      setVisitStarted(false)
      setIsRecording(false)
      setPausedTime(currentSessionTime)
    }
  }

  const totalDisplayTime = visitStarted ? currentSessionTime : pausedTime
  const isEditorDisabled = !visitStarted
  const hasRecordedTime = totalDisplayTime > 0
  const canStartVisit = patientId.trim() !== "" && encounterId.trim() !== ""

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div className="border-b bg-background p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="patient-id">Patient ID</Label>
            <Input
              id="patient-id"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter Patient ID"
            />
          </div>
          
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="encounter-id">Encounter ID</Label>
            <Input
              id="encounter-id"
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              placeholder="Enter Encounter ID"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          {/* Primary Actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={handleFinalize}
                  disabled={!hasRecordedTime || hasActiveIssues}
                  className={`shadow-sm ${
                    hasActiveIssues 
                      ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                >
                  {hasActiveIssues ? (
                    <AlertTriangle className="w-4 h-4 mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {hasActiveIssues ? 'Issues Must Be Resolved' : 'Save & Finalize Note'}
                </Button>
              </TooltipTrigger>
              {hasActiveIssues && (
                <TooltipContent>
                  <div className="space-y-1">
                    <div className="font-medium text-sm">
                      {activeIssues.length} compliance issue{activeIssues.length !== 1 ? 's' : ''} must be resolved
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {hasCriticalIssues && `${criticalIssues.length} critical issue${criticalIssues.length !== 1 ? 's' : ''} requiring attention`}
                    </div>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          
          <Button 
            variant="outline"
            onClick={handleSaveDraft}
            disabled={!hasRecordedTime}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Draft & Exit
          </Button>
          
          {/* Start Visit with Recording Indicator */}
          <div className="flex items-center gap-3">
            <Button 
              onClick={handleVisitToggle}
              disabled={!canStartVisit && !visitStarted}
              variant={visitStarted ? "destructive" : "default"}
              className={!visitStarted ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm" : ""}
            >
              {!visitStarted ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Visit
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Stop Visit
                </>
              )}
            </Button>
            
            {/* Show indicators when visit has ever been started */}
            {hasEverStarted && (
              <div className="flex items-center gap-3 text-destructive">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono font-medium min-w-[3rem] tabular-nums">
                    {formatTime(totalDisplayTime)}
                  </span>
                </div>
                
                {/* Audio Wave Animation - show when visit has ever been started */}
                {hasEverStarted && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="flex items-center gap-0.5 h-6 cursor-pointer"
                          onClick={() => setShowFullTranscript(true)}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div
                              key={i}
                              className={`w-0.5 rounded-full ${isRecording ? 'bg-destructive' : 'bg-muted-foreground'}`}
                              style={{
                                height: isRecording ? `${8 + (i % 4) * 3}px` : `${6 + (i % 3) * 2}px`,
                                animation: isRecording ? `audioWave${i} ${1.2 + (i % 3) * 0.3}s ease-in-out infinite` : 'none',
                                animationDelay: isRecording ? `${i * 0.1}s` : '0s'
                              }}
                            />
                          ))}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="bottom" 
                        align="center"
                        className="max-w-sm p-3 bg-popover border-border"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-destructive animate-pulse' : 'bg-muted-foreground'}`}></div>
                            {isRecording ? 'Live Transcription Preview' : 'Transcription Preview (Paused)'}
                          </div>
                          <div className="bg-muted/50 rounded-md p-2 border-l-2 border-destructive space-y-1">
                            {getRecentTranscription().map((line, index) => (
                              <div 
                                key={index} 
                                className={`text-xs leading-relaxed ${
                                  index === 2 
                                    ? 'text-foreground font-medium' 
                                    : 'text-muted-foreground'
                                }`}
                                style={{
                                  opacity: index === 2 ? 1 : 0.7 - (index * 0.2)
                                }}
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                            Click audio wave to view full transcript
                            {!isRecording && (
                              <div className="mt-1 text-muted-foreground/80">
                                Recording paused - transcript available
                              </div>
                            )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Rich Text Editor */}
      <div className="flex-1">
        <RichTextEditor
          disabled={isEditorDisabled}
          complianceIssues={complianceIssues}
          onDismissIssue={handleDismissIssue}
          onRestoreIssue={handleRestoreIssue}
          onContentChange={(content) => {
            setNoteContent(content)
            if (onNoteContentChange) {
              onNoteContentChange(content)
            }
          }}
        />
      </div>

      {/* Full Transcript Modal */}
      <Dialog open={showFullTranscript} onOpenChange={setShowFullTranscript}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 bg-background border-border">
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
                </div>
                <div className={`flex items-center gap-1 text-sm ${isRecording ? 'text-destructive' : 'text-muted-foreground'}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-mono tabular-nums">
                    {formatTime(totalDisplayTime)}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                {isRecording 
                  ? "Real-time transcription of your patient encounter. The transcript updates automatically as the conversation continues."
                  : "Transcription of your patient encounter. Recording is currently paused - click 'Start Visit' to resume recording and live transcription."
                }
              </div>
              
              <div className="space-y-3">
                {mockTranscriptionLines.map((line, index) => {
                  const isRecent = index >= Math.max(0, transcriptionIndex - 2) && index <= transcriptionIndex
                  const isCurrent = index === transcriptionIndex && isRecording
                  const speaker = line.split(':')[0]
                  const content = line.split(':').slice(1).join(':').trim()
                  
                  return (
                    <div 
                      key={index}
                      className={`flex gap-3 p-3 rounded-lg transition-all duration-300 ${
                        isCurrent 
                          ? 'bg-destructive/10 border border-destructive/20 shadow-sm' 
                          : isRecent 
                            ? 'bg-accent/50' 
                            : 'bg-muted/30'
                      }`}
                      style={{
                        opacity: index <= transcriptionIndex ? 1 : 0.4
                      }}
                    >
                      <div className={`font-medium text-sm min-w-16 ${
                        speaker === 'Doctor' ? 'text-primary' : 'text-blue-600'
                      }`}>
                        {speaker}:
                      </div>
                      <div className={`text-sm leading-relaxed flex-1 ${
                        isCurrent ? 'font-medium' : ''
                      }`}>
                        {content}
                        {isCurrent && isRecording && (
                          <span className="inline-block w-2 h-4 bg-destructive ml-1 animate-pulse"></span>
                        )}
                      </div>
                    </div>
                  )
                })}
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
                {transcriptionIndex + 1} of {mockTranscriptionLines.length} lines transcribed
              </div>
              <div className="flex items-center gap-4">
                <div>Words: ~{(transcriptionIndex + 1) * 12}</div>
                <div>Confidence: 94%</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {showFinalizationWizard && (
        <FinalizationWizard
          isOpen={showFinalizationWizard}
          onClose={() => setShowFinalizationWizard(false)}
          selectedCodes={selectedCodes}
          selectedCodesList={selectedCodesList}
          complianceIssues={complianceIssues}
          noteContent={noteContent}
          patientInfo={{
            patientId,
            encounterId
          }}
        />
      )}

    </div>
  )
}