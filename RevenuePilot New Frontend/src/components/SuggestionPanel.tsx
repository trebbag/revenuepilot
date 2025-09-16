import { useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import { Checkbox } from "./ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import { 
  X, 
  ChevronDown, 
  ChevronRight, 
  Code, 
  Shield, 
  Heart, 
  Stethoscope, 
  Calendar,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  TestTube,
  AlertTriangle
} from "lucide-react"

interface SuggestionPanelProps {
  onClose: () => void
  selectedCodes: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  onUpdateCodes: (codes: { codes: number; prevention: number; diagnoses: number; differentials: number }) => void
  onAddCode?: (code: any) => void
  addedCodes?: string[]
}

interface DifferentialItem {
  diagnosis: string
  icdCode?: string
  icdDescription?: string
  percentage: number
  reasoning: string
  supportingFactors: string[]
  contradictingFactors: string[]
  whatItIs: string
  details: string
  forFactors: string[]
  againstFactors: string[]
  confidenceFactors: string
  learnMoreUrl: string
  testsToConfirm: string[]
  testsToExclude: string[]
}

export function SuggestionPanel({ onClose, selectedCodes, onUpdateCodes, onAddCode, addedCodes = [] }: SuggestionPanelProps) {
  const [expandedCards, setExpandedCards] = useState({
    codes: true,
    prevention: false,
    differentials: true,
    followUp: false
  })

  const [showConfidenceWarning, setShowConfidenceWarning] = useState(false)
  const [selectedDifferential, setSelectedDifferential] = useState<DifferentialItem | null>(null)

  const toggleCard = (cardKey: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardKey]: !prev[cardKey]
    }))
  }

  const handleAddAsDiagnosis = (differential: DifferentialItem) => {
    if (differential.percentage < 70) {
      setSelectedDifferential(differential)
      setShowConfidenceWarning(true)
    } else {
      // Create ICD-10 code item and add as diagnosis (purple card)
      if (differential.icdCode && onAddCode) {
        const icdCodeItem = {
          code: differential.icdCode,
          type: "ICD-10",
          category: "diagnoses",
          description: differential.icdDescription || differential.diagnosis,
          rationale: `Added as diagnosis from differential: ${differential.diagnosis}. ${differential.reasoning}`,
          confidence: differential.percentage
        }
        onAddCode(icdCodeItem)
      }
    }
  }

  const handleAddAsDifferential = (differential: DifferentialItem) => {
    // Create ICD-10 code item and add as differential (green card)
    if (differential.icdCode && onAddCode) {
      const icdCodeItem = {
        code: differential.icdCode,
        type: "ICD-10", 
        category: "differentials",
        description: differential.icdDescription || differential.diagnosis,
        rationale: `Added as differential consideration: ${differential.diagnosis}. ${differential.reasoning}`,
        confidence: differential.percentage
      }
      onAddCode(icdCodeItem)
    }
  }

  const handleAddCode = (code: any) => {
    // Determine the correct category for the code
    let updatedCodes = { ...selectedCodes }
    
    // If the code has a specific category (from differentials), use that
    if (code.category) {
      updatedCodes[code.category] = selectedCodes[code.category] + 1
    } else if (code.type === "CPT") {
      // Categorize CPT codes based on code number
      if (code.code.startsWith("992") || code.code.startsWith("993")) {
        // E/M codes go to consultation
        updatedCodes.codes = selectedCodes.codes + 1
      } else if (code.code.startsWith("999")) {
        // Preventive codes also go to consultation  
        updatedCodes.codes = selectedCodes.codes + 1
      } else {
        // Other CPT codes might be procedures
        updatedCodes.diagnoses = selectedCodes.diagnoses + 1
      }
    } else if (code.type === "ICD-10") {
      updatedCodes.diagnoses = selectedCodes.diagnoses + 1
    }
    
    // Update the selected codes count
    onUpdateCodes(updatedCodes)
    
    // Call the optional onAddCode callback to track added codes
    if (onAddCode) {
      onAddCode(code)
    }
  }

  const suggestions = {
    codes: [
      { 
        code: "99213", 
        type: "CPT", 
        description: "Office visit, established patient", 
        rationale: "Based on complexity and time spent",
        confidence: 82,
        whatItIs: "Evaluation and Management (E/M) service for an established patient office or other outpatient visit requiring a medically appropriate history and/or examination and low level of medical decision making.",
        usageRules: [
          "Patient must be established (seen within past 3 years by same physician or same specialty group)",
          "Requires medically appropriate history and/or examination", 
          "Low level medical decision making required",
          "Typically 20-29 minutes of total time on date of service"
        ],
        reasonsSuggested: [
          "Patient is established with practice",
          "Current visit complexity matches low-moderate level",
          "Time spent falls within typical range for 99213",
          "Documentation supports required elements"
        ],
        potentialConcerns: [
          "May be under-coded if higher complexity work performed",
          "Time documentation must support level if time-based coding used",
          "Medical decision making may warrant higher level code"
        ]
      },
      { 
        code: "99214", 
        type: "CPT", 
        description: "Office visit, established patient (moderate complexity)", 
        rationale: "Higher complexity visit with moderate medical decision making",
        confidence: 67,
        whatItIs: "Evaluation and Management (E/M) service for an established patient office visit requiring a medically appropriate history and/or examination and moderate level of medical decision making.",
        usageRules: [
          "Patient must be established (seen within past 3 years)",
          "Requires medically appropriate history and/or examination",
          "Moderate level medical decision making required", 
          "Typically 30-39 minutes of total time on date of service"
        ],
        reasonsSuggested: [
          "Multiple chronic conditions being managed",
          "New problem with additional workup required", 
          "Moderate complexity of medical decision making documented",
          "Time and complexity support this level"
        ],
        potentialConcerns: [
          "Documentation must clearly support moderate MDM",
          "Higher reimbursement requires stronger documentation",
          "May be over-coded if visit was routine/straightforward"
        ]
      },
      { 
        code: "99395", 
        type: "CPT", 
        description: "Preventive medicine, established patient (18-39 years)", 
        rationale: "Patient age and visit type match preventive care criteria",
        confidence: 91,
        whatItIs: "Periodic comprehensive preventive medicine reevaluation and management of an individual including an age and gender appropriate history, examination, counseling/anticipatory guidance/risk factor reduction interventions, and the ordering of laboratory/diagnostic procedures, established patient; 18-39 years.",
        usageRules: [
          "Patient must be established and asymptomatic",
          "Must be comprehensive preventive service, not problem-focused",
          "Patient age must be 18-39 years",
          "Cannot bill same day as E/M visit for same provider without modifier"
        ],
        reasonsSuggested: [
          "Patient is due for annual preventive care",
          "Age falls within 18-39 year range",
          "Visit appears to be comprehensive preventive in nature",
          "No acute problems being addressed primarily"
        ],
        potentialConcerns: [
          "Cannot use if significant problems addressed (would need separate E/M)",
          "Insurance may not cover if done too frequently", 
          "Documentation must support comprehensive nature of visit"
        ]
      }
    ],
    publicHealth: [
      { 
        id: "flu-vaccine-2024",
        code: "90630",
        type: "PREVENTION",
        category: "prevention",
        text: "Influenza vaccination", 
        description: "Annual influenza vaccination for current flu season",
        reason: "Patient is due for annual flu vaccine - flu season approaching", 
        source: "CDC", 
        level: "Level A",
        importance: "Prevents seasonal influenza which causes 140,000-810,000 hospitalizations and 12,000-61,000 deaths annually in the US. Vaccination reduces risk by 40-60% when vaccine is well-matched to circulating viruses.",
        whatToDo: "Administer age-appropriate influenza vaccine (IIV4 or LAIV4). Document vaccine lot number, expiration date, administration site, and VIS date. Schedule follow-up if any adverse reactions occur.",
        patientFlagged: "Patient is 34 years old with no documented flu vaccine in the past 12 months. Has history of seasonal allergies which may increase complications from influenza infection.",
        recommendingBody: "CDC Advisory Committee on Immunization Practices (ACIP)",
        guidelines: "Annual vaccination recommended for all persons ≥6 months without contraindications. Preferentially recommend IIV4 for adults ≥65 years. Give by October 31st for optimal protection.",
        patientPercentage: 78,
        clinicAverage: 85,
        usAverage: 63,
        confidence: 95
      },
      { 
        id: "covid-booster-2024",
        code: "91301",
        type: "PREVENTION", 
        category: "prevention",
        text: "COVID-19 booster eligibility",
        description: "Updated COVID-19 vaccine booster for 2024-2025 season",
        reason: "Patient eligible for updated COVID-19 vaccine based on age and time since last dose", 
        source: "CDC", 
        level: "Level B",
        importance: "Updated COVID-19 vaccines target currently circulating variants and help restore waning immunity. Reduces risk of hospitalization by 50-80% and severe disease by 70-90% in the months following vaccination.",
        whatToDo: "Administer updated 2024-2025 COVID-19 vaccine (mRNA or protein subunit). Can be given simultaneously with other vaccines. Monitor for 15 minutes post-vaccination for immediate adverse reactions.",
        patientFlagged: "Patient received last COVID-19 vaccine >4 months ago. Age 34 puts them in recommended group for annual vaccination. No known contraindications to mRNA vaccines.",
        recommendingBody: "CDC Advisory Committee on Immunization Practices (ACIP) and FDA",
        guidelines: "Updated 2024-2025 COVID-19 vaccine recommended annually for persons ≥6 months. Can be given ≥2 months after previous COVID-19 vaccine. No minimum interval with other vaccines.",
        patientPercentage: 52,
        clinicAverage: 71,
        usAverage: 45,
        confidence: 88
      }
    ],
    differentials: [
      { 
        diagnosis: "Viral upper respiratory infection",
        icdCode: "J06.9",
        icdDescription: "Acute upper respiratory infection, unspecified",
        percentage: 85,
        reasoning: "Most common cause of URI symptoms, seasonal pattern, gradual onset",
        supportingFactors: ["Gradual onset", "Clear rhinorrhea", "Low-grade fever", "Seasonal timing"],
        contradictingFactors: ["No purulent discharge", "No high fever"],
        whatItIs: "A viral infection affecting the upper respiratory tract including nose, throat, and sinuses, typically self-limiting and lasting 7-10 days.",
        details: "Most commonly caused by rhinoviruses, coronaviruses, or adenoviruses. Presents with nasal congestion, rhinorrhea, sore throat, and mild systemic symptoms.",
        forFactors: ["Seasonal pattern matches viral epidemiology", "Gradual onset typical of viral infections", "Low-grade fever supports viral etiology", "Clear discharge suggests viral rather than bacterial"],
        againstFactors: ["Symptom duration >10 days might suggest bacterial superinfection", "Lack of myalgias somewhat atypical"],
        confidenceFactors: "High confidence based on symptom pattern, seasonal timing, physical exam findings, and epidemiological factors. Viral URI accounts for 90% of acute respiratory infections.",
        learnMoreUrl: "https://www.aafp.org/pubs/afp/issues/2012/0101/p46.html",
        testsToConfirm: ["Usually clinical diagnosis", "Rapid viral panel if high-risk patient", "CBC if bacterial superinfection suspected"],
        testsToExclude: ["Throat culture to rule out strep", "Sinus CT if sinusitis suspected", "Chest X-ray if pneumonia concern"]
      },
      { 
        diagnosis: "Acute bacterial sinusitis",
        icdCode: "J01.90", 
        icdDescription: "Acute sinusitis, unspecified",
        percentage: 35,
        reasoning: "Possible secondary bacterial infection, symptoms lasting >10 days",
        supportingFactors: ["Facial pressure", "Discolored discharge", "Symptom duration"],
        contradictingFactors: ["No high fever", "No severe facial pain"],
        whatItIs: "Bacterial infection of the paranasal sinuses, typically following a viral upper respiratory infection, characterized by purulent nasal discharge and facial pain.",
        details: "Usually caused by S. pneumoniae, H. influenzae, or M. catarrhalis. Requires specific criteria: symptoms >10 days, severe symptoms, or worsening after improvement.",
        forFactors: ["Symptom duration >7 days supports bacterial etiology", "Facial pressure classic for sinusitis", "Discolored discharge suggests bacterial infection"],
        againstFactors: ["Absence of high fever reduces likelihood", "No severe facial pain", "Gradual onset less typical for bacterial"],
        confidenceFactors: "Moderate confidence. Bacterial sinusitis only occurs in 0.5-2% of viral URI cases. Current symptoms don't fully meet IDSA criteria for bacterial sinusitis.",
        learnMoreUrl: "https://academic.oup.com/cid/article/54/8/e72/367144",
        testsToConfirm: ["Clinical diagnosis preferred", "Sinus CT if recurrent/chronic", "Nasal endoscopy if specialist referral"],
        testsToExclude: ["Routine sinus X-rays not recommended", "MRI only if intracranial complications suspected"]
      },
      { 
        diagnosis: "Allergic rhinitis",
        icdCode: "J30.9",
        icdDescription: "Allergic rhinitis, unspecified", 
        percentage: 15,
        reasoning: "Chronic symptoms with environmental triggers, but acute presentation less likely",
        supportingFactors: ["Clear discharge", "Nasal congestion", "Seasonal component"],
        contradictingFactors: ["Acute onset", "Fever present", "No known allergies"],
        whatItIs: "An inflammatory condition of the nasal mucosa caused by IgE-mediated reaction to environmental allergens, typically seasonal or perennial.",
        details: "Characterized by sneezing, clear rhinorrhea, nasal congestion, and itching. May be seasonal (pollen) or perennial (dust mites, pet dander).",
        forFactors: ["Clear rhinorrhea typical of allergic response", "Nasal congestion common symptom", "Seasonal timing could suggest environmental trigger"],
        againstFactors: ["Acute onset unusual for allergic rhinitis", "Fever not typical of allergic reaction", "No documented allergy history", "Lack of typical allergic symptoms (itching, sneezing)"],
        confidenceFactors: "Low confidence. Acute onset with fever makes allergic rhinitis unlikely. Patient would typically have history of allergies and seasonal pattern.",
        learnMoreUrl: "https://www.aaaai.org/tools-for-the-public/conditions-library/allergies/rhinitis",
        testsToConfirm: ["Skin prick tests for specific allergens", "Serum specific IgE levels", "Total IgE if indicated"],
        testsToExclude: ["CBC with eosinophil count", "Nasal smear for eosinophils", "CT scan to rule out structural abnormalities"]
      }
    ],
    followUp: [
      { interval: "2 weeks", condition: "if symptoms persist", priority: "routine" },
      { interval: "3-5 days", condition: "if symptoms worsen", priority: "urgent" }
    ]
  }

  const cardConfigs = [
    { key: 'codes', title: 'Codes', icon: Code, count: suggestions.codes.filter(code => !addedCodes.includes(code.code)).length, color: 'text-blue-600' },
    { key: 'prevention', title: 'Prevention', icon: Heart, count: suggestions.publicHealth.filter(item => !addedCodes.includes(item.id)).length, color: 'text-red-600' },
    { key: 'differentials', title: 'Differentials', icon: Stethoscope, count: suggestions.differentials.filter(differential => !addedCodes.includes(differential.icdCode || '')).length, color: 'text-purple-600' },
    { key: 'followUp', title: 'Follow-Up', icon: Calendar, count: suggestions.followUp.length, color: 'text-orange-600' }
  ]

  // Circular confidence indicator component
  const ConfidenceGauge = ({ confidence, size = 20 }: { confidence: number; size?: number }) => {
    const radius = (size - 4) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (confidence / 100) * circumference
    
    const getColor = (conf: number) => {
      if (conf >= 70) return '#10b981'
      if (conf >= 40) return '#eab308'
      return '#ef4444'
    }

    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="2"
            fill="none"
          />
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
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">
            {confidence}
          </span>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full border-l bg-sidebar">
        {/* Header */}
        <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
          <h2 className="font-medium">Suggestions</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Suggestion Cards - Now with proper scrolling */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {cardConfigs.map((config) => (
                <Card key={config.key} className="overflow-hidden">
                  <Collapsible
                    open={expandedCards[config.key]}
                    onOpenChange={() => toggleCard(config.key)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <config.icon className={`h-4 w-4 ${config.color}`} />
                            {config.title}
                            <Badge variant="secondary" className="text-xs">
                              {config.count}
                            </Badge>
                          </div>
                          {expandedCards[config.key] ? 
                            <ChevronDown className="h-4 w-4" /> : 
                            <ChevronRight className="h-4 w-4" />
                          }
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {/* Codes Section */}
                        {config.key === 'codes' && (
                          <div className="space-y-3">
                            {suggestions.codes.filter(code => !addedCodes.includes(code.code)).map((code, index) => {
                              const codeTypeColors = {
                                CPT: "bg-blue-50 border-blue-200 text-blue-700",
                                "ICD-10": "bg-purple-50 border-purple-200 text-purple-700"
                              }
                              return (
                                <Tooltip key={index}>
                                  <TooltipTrigger asChild>
                                    <div className="p-2.5 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                                      <div className="flex items-center gap-3">
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-8 w-8 p-0 flex items-center justify-center hover:bg-blue-100 hover:text-blue-700 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleAddCode(code)
                                          }}
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>
                                        
                                        <div className="flex-1 min-w-0 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Badge 
                                                variant="outline" 
                                                className={`text-xs ${codeTypeColors[code.type] || 'bg-gray-50 border-gray-200 text-gray-700'}`}
                                              >
                                                {code.type}
                                              </Badge>
                                              <span className="font-mono text-sm font-medium">{code.code}</span>
                                            </div>
                                            <ConfidenceGauge confidence={code.confidence} size={24} />
                                          </div>

                                          <p className="text-sm font-medium">{code.description}</p>
                                          
                                          <div className="text-xs text-muted-foreground">
                                            {code.rationale}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-lg p-0" side="left">
                                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                      {/* Header Section with Blue Theme */}
                                      <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <Code className="h-4 w-4 text-blue-600" />
                                            <span className="font-medium text-blue-900">{code.type} {code.code}</span>
                                          </div>
                                          <ConfidenceGauge confidence={code.confidence} size={24} />
                                        </div>
                                        <p className="text-sm text-blue-800 mt-1">{code.description}</p>
                                      </div>

                                      <div className="p-4 space-y-4">
                                        {/* Definition Section */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <Shield className="h-3 w-3 text-blue-600" />
                                            <h5 className="font-medium text-sm text-blue-700">Definition</h5>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed pl-5">{code.whatItIs}</p>
                                        </div>
                                        
                                        <div className="border-t border-gray-100 pt-4">
                                          <div className="flex items-center gap-2 mb-3">
                                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                                            <h5 className="font-medium text-sm text-amber-700">Usage Requirements</h5>
                                          </div>
                                          <ul className="space-y-1.5 pl-5">
                                            {code.usageRules.map((rule, ruleIndex) => (
                                              <li key={ruleIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                <div className="w-1 h-1 bg-amber-500 rounded-full mt-2 flex-shrink-0"></div>
                                                {rule}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>

                                        {/* Supporting vs Concerns - Side by Side */}
                                        <div className="border-t border-gray-100 pt-4">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                              <div className="flex items-center gap-2 mb-2">
                                                <TrendingUp className="h-3 w-3 text-green-600" />
                                                <h5 className="font-medium text-sm text-green-700">Supporting Evidence</h5>
                                              </div>
                                              <ul className="space-y-1">
                                                {code.reasonsSuggested.map((reason, reasonIndex) => (
                                                  <li key={reasonIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                    <div className="w-1 h-1 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                                                    {reason}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>

                                            <div>
                                              <div className="flex items-center gap-2 mb-2">
                                                <AlertTriangle className="h-3 w-3 text-red-600" />
                                                <h5 className="font-medium text-sm text-red-700">Potential Concerns</h5>
                                              </div>
                                              <ul className="space-y-1">
                                                {code.potentialConcerns.map((concern, concernIndex) => (
                                                  <li key={concernIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                    <div className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                                                    {concern}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Professional Tip - Only colored background section */}
                                        <div className="bg-blue-50 border-l-2 border-blue-400 pl-3 pr-3 py-2 rounded-r">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Heart className="h-3 w-3 text-blue-600" />
                                            <h5 className="font-medium text-sm text-blue-900">Coding Best Practice</h5>
                                          </div>
                                          <p className="text-xs text-blue-800 leading-relaxed">
                                            Always ensure documentation supports the level of service billed. Consider time-based coding if documentation is insufficient for medical decision making approach.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        )}

                        {/* Public Health Section */}
                        {config.key === 'prevention' && (
                          <div className="space-y-2">
                            {suggestions.publicHealth.filter(item => !addedCodes.includes(item.id)).map((item, index) => (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  <div className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors relative">
                                    <div className="flex items-center gap-3">
                                      <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="h-8 w-8 p-0 flex items-center justify-center hover:bg-red-100 hover:text-red-700 flex-shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleAddCode(item)
                                        }}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <p className="text-sm font-medium">{item.text}</p>
                                          <Badge variant="outline" className="text-xs bg-red-50 border-red-200 text-red-700">
                                            {item.level}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                                        <div className="flex items-center justify-between mt-2">
                                          <p className="text-xs text-muted-foreground">Source: {item.source}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-lg p-0" side="left">
                                  <div className="space-y-0 max-w-lg bg-white border border-gray-200 rounded-lg shadow-lg">
                                    {/* Header Section with Red Theme */}
                                    <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Heart className="h-4 w-4 text-red-600" />
                                          <span className="font-medium text-red-900">{item.text}</span>
                                        </div>
                                        <Badge variant="outline" className="text-xs bg-red-100 border-red-300 text-red-800">
                                          {item.level}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-red-800 mt-1">{item.description}</p>
                                    </div>

                                    <div className="p-4 space-y-4">
                                      {/* Clinical Importance */}
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Shield className="h-3 w-3 text-red-600" />
                                          <h5 className="font-medium text-sm text-red-700">Clinical Importance</h5>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.importance}</p>
                                      </div>

                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                          <TestTube className="h-3 w-3 text-gray-600" />
                                          <h5 className="font-medium text-sm text-gray-900">Recommended Action</h5>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.whatToDo}</p>
                                      </div>

                                      {/* Patient Context - Side by Side with Guidelines */}
                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                                              <h5 className="font-medium text-sm text-amber-700">Patient Context</h5>
                                            </div>
                                            <p className="text-xs text-gray-700 leading-relaxed">{item.patientFlagged}</p>
                                          </div>

                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <ExternalLink className="h-3 w-3 text-blue-600" />
                                              <h5 className="font-medium text-sm text-blue-700">Authority</h5>
                                            </div>
                                            <p className="text-xs text-blue-800 font-medium mb-1">{item.recommendingBody}</p>
                                            <p className="text-xs text-gray-700 leading-relaxed">{item.guidelines}</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Performance Metrics - Only colored background section */}
                                      <div className="bg-gray-50 border-l-2 border-gray-400 pl-3 pr-3 py-3 rounded-r">
                                        <div className="flex items-center gap-2 mb-3">
                                          <TrendingUp className="h-3 w-3 text-gray-600" />
                                          <h5 className="font-medium text-sm text-gray-900">Performance Metrics</h5>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                          <div className="text-center">
                                            <div className="text-xs text-gray-600 font-medium mb-1">Your Rate</div>
                                            <div className="text-lg font-semibold text-gray-900">{item.patientPercentage}%</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-xs text-gray-600 font-medium mb-1">Clinic Avg</div>
                                            <div className="text-lg font-semibold text-gray-900">{item.clinicAverage}%</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-xs text-gray-600 font-medium mb-1">US Avg</div>
                                            <div className="text-lg font-semibold text-gray-900">{item.usAverage}%</div>
                                          </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t">
                                          <p className="text-xs text-gray-600">
                                            {item.patientPercentage < item.clinicAverage 
                                              ? "Consider strategies to improve patient engagement for this measure."
                                              : item.patientPercentage < item.usAverage
                                              ? "Performance exceeds clinic average but trails national benchmarks."
                                              : "Excellent performance - maintain current protocols."
                                            }
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        )}

                        {/* Differentials Section */}
                        {config.key === 'differentials' && (
                          <div className="space-y-3">
                            {suggestions.differentials.filter(differential => !addedCodes.includes(differential.icdCode || '')).map((item, index) => (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  <div className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">{item.diagnosis}</p>
                                          {item.icdCode && (
                                            <div className="flex items-center gap-2 mt-1">
                                              <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
                                                ICD-10
                                              </Badge>
                                              <span className="font-mono text-xs text-muted-foreground">{item.icdCode}</span>
                                            </div>
                                          )}
                                        </div>
                                        <ConfidenceGauge confidence={item.percentage} size={24} />
                                      </div>

                                      <div className="text-xs text-muted-foreground">
                                        {item.reasoning}
                                      </div>

                                      <div className="grid grid-cols-1 gap-2 text-xs">
                                        <div>
                                          <span className="text-green-700 font-medium">Supporting:</span>
                                          <span className="text-muted-foreground ml-1">
                                            {item.supportingFactors.join(", ")}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-red-700 font-medium">Against:</span>
                                          <span className="text-muted-foreground ml-1">
                                            {item.contradictingFactors.join(", ")}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-xs flex-1"
                                          onClick={() => handleAddAsDifferential(item)}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add as Differential
                                        </Button>
                                        
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={`h-6 text-xs flex-1 ${item.percentage < 70 ? 'text-orange-600 hover:text-orange-700' : ''}`}
                                          onClick={() => handleAddAsDiagnosis(item)}
                                        >
                                          {item.percentage < 70 && <AlertTriangle className="h-3 w-3 mr-1" />}
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add as Diagnosis
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-lg p-0" side="left">
                                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                    {/* Header Section with Green Theme for Differentials */}
                                    <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Stethoscope className="h-4 w-4 text-green-600" />
                                          <span className="font-medium text-green-900">{item.diagnosis}</span>
                                        </div>
                                        <ConfidenceGauge confidence={item.percentage} size={24} />
                                      </div>
                                      <p className="text-sm text-green-800 mt-1">{item.icdCode} - {item.icdDescription}</p>
                                    </div>

                                    <div className="p-4 space-y-4">
                                      {/* Definition Section */}
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Shield className="h-3 w-3 text-green-600" />
                                          <h5 className="font-medium text-sm text-green-700">What It Is</h5>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.whatItIs}</p>
                                      </div>
                                      
                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                                          <h5 className="font-medium text-sm text-amber-700">Clinical Details</h5>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.details}</p>
                                      </div>

                                      {/* Supporting vs Against - Side by Side */}
                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <TrendingUp className="h-3 w-3 text-green-600" />
                                              <h5 className="font-medium text-sm text-green-700">Supporting Factors</h5>
                                            </div>
                                            <ul className="space-y-1">
                                              {item.forFactors.map((factor, factorIndex) => (
                                                <li key={factorIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                  <div className="w-1 h-1 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                                                  {factor}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>

                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <TrendingDown className="h-3 w-3 text-red-600" />
                                              <h5 className="font-medium text-sm text-red-700">Against Factors</h5>
                                            </div>
                                            <ul className="space-y-1">
                                              {item.againstFactors.map((factor, factorIndex) => (
                                                <li key={factorIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                  <div className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                                                  {factor}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Confidence Assessment */}
                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="flex items-center gap-2 mb-2">
                                          <TestTube className="h-3 w-3 text-purple-600" />
                                          <h5 className="font-medium text-sm text-purple-700">Confidence Assessment</h5>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.confidenceFactors}</p>
                                      </div>

                                      {/* Testing - Side by Side */}
                                      <div className="border-t border-gray-100 pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <TrendingUp className="h-3 w-3 text-blue-600" />
                                              <h5 className="font-medium text-sm text-blue-700">Tests to Confirm</h5>
                                            </div>
                                            <ul className="space-y-1">
                                              {item.testsToConfirm.map((test, testIndex) => (
                                                <li key={testIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                  <div className="w-1 h-1 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                                                  {test}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>

                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <Minus className="h-3 w-3 text-gray-600" />
                                              <h5 className="font-medium text-sm text-gray-700">Tests to Exclude</h5>
                                            </div>
                                            <ul className="space-y-1">
                                              {item.testsToExclude.map((test, testIndex) => (
                                                <li key={testIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                  <div className="w-1 h-1 bg-gray-600 rounded-full mt-2 flex-shrink-0"></div>
                                                  {test}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Clinical Best Practice - Only colored background section */}
                                      <div className="bg-green-50 border-l-2 border-green-400 pl-3 pr-3 py-2 rounded-r">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Stethoscope className="h-3 w-3 text-green-600" />
                                          <h5 className="font-medium text-sm text-green-900">Clinical Best Practice</h5>
                                        </div>
                                        <p className="text-xs text-green-800 leading-relaxed">
                                          Always consider differential diagnoses systematically. Document clinical reasoning for confidence levels below 70% before establishing primary diagnosis.
                                        </p>
                                      </div>

                                      {/* Learn More */}
                                      <div className="border-t border-gray-100 pt-4">
                                        <a 
                                          href={item.learnMoreUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Learn more about this condition
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        )}

                        {/* Follow-Up Section */}
                        {config.key === 'followUp' && (
                          <div className="space-y-2">
                            {suggestions.followUp.map((item, index) => (
                              <div key={index} className="p-2 rounded border space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm flex-1">{item.interval}</p>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${
                                      item.priority === 'urgent' 
                                        ? 'border-red-200 text-red-700 bg-red-50' 
                                        : 'border-gray-200 text-gray-700 bg-gray-50'
                                    }`}
                                  >
                                    {item.priority}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{item.condition}</p>
                                <Button size="sm" variant="ghost" className="h-6 text-xs">
                                  <Plus className="h-3 w-3 mr-1" />
                                  Schedule Follow-Up
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Confidence Warning Dialog - Fixed overflow issues */}
        <AlertDialog open={showConfidenceWarning} onOpenChange={setShowConfidenceWarning}>
          <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <AlertDialogHeader className="flex-shrink-0">
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Low Confidence Diagnosis Warning
              </AlertDialogTitle>
              <AlertDialogDescription>
                This diagnosis has a confidence level below 70%. Please review the clinical reasoning before adding it as a primary diagnosis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            {selectedDifferential && (
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-orange-900">{selectedDifferential.diagnosis}</h4>
                        <div className="flex items-center gap-2">
                          <ConfidenceGauge confidence={selectedDifferential.percentage} size={24} />
                          <span className="text-sm text-orange-700">{selectedDifferential.percentage}% confidence</span>
                        </div>
                      </div>
                      <p className="text-sm text-orange-800">{selectedDifferential.reasoning}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm text-green-700">Supporting Evidence</h5>
                        <ul className="space-y-1">
                          {selectedDifferential.forFactors.map((factor, index) => (
                            <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                              <TrendingUp className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-medium text-sm text-red-700">Contradicting Evidence</h5>
                        <ul className="space-y-1">
                          {selectedDifferential.againstFactors.map((factor, index) => (
                            <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                              <TrendingDown className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h5 className="font-medium text-sm mb-1">Clinical Reasoning</h5>
                        <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
                          {selectedDifferential.confidenceFactors}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                            <TestTube className="h-3 w-3" />
                            Recommended Tests to Confirm
                          </h5>
                          <ul className="space-y-1">
                            {selectedDifferential.testsToConfirm.map((test, index) => (
                              <li key={index} className="text-xs text-muted-foreground">• {test}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                            <Minus className="h-3 w-3" />
                            Tests to Rule Out Alternatives
                          </h5>
                          <ul className="space-y-1">
                            {selectedDifferential.testsToExclude.map((test, index) => (
                              <li key={index} className="text-xs text-muted-foreground">• {test}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h5 className="font-medium text-sm text-blue-900 mb-1">Educational Resource</h5>
                        <p className="text-xs text-blue-800 mb-2">{selectedDifferential.whatItIs}</p>
                        <a 
                          href={selectedDifferential.learnMoreUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Learn more about this condition
                        </a>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
            
            <AlertDialogFooter className="flex-shrink-0">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedDifferential) {
                    // Create ICD-10 code item and add as diagnosis (purple card)
                    if (selectedDifferential.icdCode && onAddCode) {
                      const icdCodeItem = {
                        code: selectedDifferential.icdCode,
                        type: "ICD-10",
                        category: "diagnoses",
                        description: selectedDifferential.icdDescription || selectedDifferential.diagnosis,
                        rationale: `Added as diagnosis from differential: ${selectedDifferential.diagnosis}. ${selectedDifferential.reasoning}`,
                        confidence: selectedDifferential.percentage
                      }
                      onAddCode(icdCodeItem)
                    }
                  }
                  setShowConfidenceWarning(false)
                  setSelectedDifferential(null)
                }}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Add as Diagnosis Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}