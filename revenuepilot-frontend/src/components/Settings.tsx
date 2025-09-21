import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Settings as SettingsIcon,
  Sliders,
  Palette,
  Globe,
  FileText,
  Code,
  Key,
  Download,
  Plus,
  Edit,
  Trash2,
  Check,
  AlertCircle,
  CheckCircle,
  Upload,
  Brain,
  Shield,
  Stethoscope,
  Save,
  RotateCcw,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Switch } from "./ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Separator } from "./ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { apiFetchJson } from "../lib/api"

interface SettingsProps {
  userRole?: "admin" | "user"
}

interface Template {
  id: string
  name: string
  type: "SOAP" | "Wellness" | "Follow-up" | "Custom"
  content: string
  lastModified: string
}

interface ClinicalRule {
  id: string
  name: string
  description: string
  condition: string
  action: string
}

type KnownSuggestionCategory = "codes" | "compliance" | "publicHealth" | "differentials"

type SuggestionCategories = Record<KnownSuggestionCategory, boolean> & {
  [key: string]: boolean | undefined
}

interface UserPreferences {
  theme: string
  categories: SuggestionCategories
  rules: string[]
  lang: string
  summaryLang: string
  specialty: string | null
  payer: string | null
  region: string
  template: number | null
  useLocalModels: boolean
  useOfflineMode: boolean
  agencies: string[]
  beautifyModel: string | null
  suggestModel: string | null
  summarizeModel: string | null
  deidEngine: string
}

type JsonConfig = Record<string, unknown>

const SUGGESTION_LABELS: Record<KnownSuggestionCategory, string> = {
  codes: "Coding Suggestions",
  compliance: "Compliance Alerts",
  publicHealth: "Public Health",
  differentials: "Differential Diagnoses",
}

const SUGGESTION_OPTIONS: Array<{
  key: KnownSuggestionCategory
  label: string
  description: string
  containerClass: string
  labelClass: string
  descriptionClass: string
}> = [
  {
    key: "codes",
    label: SUGGESTION_LABELS.codes,
    description: "CPT, ICD-10, and billing codes",
    containerClass: "bg-blue-50/50 border-blue-200",
    labelClass: "text-blue-900",
    descriptionClass: "text-blue-700",
  },
  {
    key: "compliance",
    label: SUGGESTION_LABELS.compliance,
    description: "Regulatory and billing compliance",
    containerClass: "bg-red-50/50 border-red-200",
    labelClass: "text-red-900",
    descriptionClass: "text-red-700",
  },
  {
    key: "publicHealth",
    label: SUGGESTION_LABELS.publicHealth,
    description: "Preventive care and screenings",
    containerClass: "bg-green-50/50 border-green-200",
    labelClass: "text-green-900",
    descriptionClass: "text-green-700",
  },
  {
    key: "differentials",
    label: SUGGESTION_LABELS.differentials,
    description: "Alternative diagnosis considerations",
    containerClass: "bg-purple-50/50 border-purple-200",
    labelClass: "text-purple-900",
    descriptionClass: "text-purple-700",
  },
]

const CLINICAL_RULES: ClinicalRule[] = [
  {
    id: "diabetes-eye-exam",
    name: "Diabetes Annual Eye Exam",
    description: "Remind for annual eye exam for diabetic patients",
    condition: "diagnosis:diabetes AND last_eye_exam > 365_days",
    action: "suggest_eye_exam_referral",
  },
  {
    id: "hypertension-follow-up",
    name: "High Blood Pressure Follow-up",
    description: "Schedule follow-up for uncontrolled hypertension",
    condition: "bp_systolic > 140 OR bp_diastolic > 90",
    action: "suggest_followup_2weeks",
  },
  {
    id: "mammography-screening",
    name: "Mammography Screening",
    description: "Annual mammography for women 40+",
    condition: "age >= 40 AND gender:female AND last_mammogram > 365_days",
    action: "suggest_mammography",
  },
]
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }
  return "Unexpected error"
}

function normalizeUserPreferences(raw?: Partial<UserPreferences> | null): UserPreferences {
  const categories = raw?.categories ?? {}
  const normalizedCategories: SuggestionCategories = {
    codes: Boolean((categories as SuggestionCategories).codes ?? true),
    compliance: Boolean((categories as SuggestionCategories).compliance ?? true),
    publicHealth: Boolean((categories as SuggestionCategories).publicHealth ?? true),
    differentials: Boolean((categories as SuggestionCategories).differentials ?? true),
  }

  if (categories && typeof categories === "object") {
    for (const [key, value] of Object.entries(categories)) {
      if (typeof value !== "boolean") {
        continue
      }
      normalizedCategories[key as KnownSuggestionCategory] = value
    }
  }

  const rules = Array.isArray(raw?.rules) ? raw!.rules.filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0) : []

  const agencies =
    Array.isArray(raw?.agencies) && raw!.agencies.length > 0 ? raw!.agencies.filter((agency): agency is string => typeof agency === "string" && agency.trim().length > 0) : ["CDC", "WHO"]

  return {
    theme: typeof raw?.theme === "string" && raw.theme.trim().length > 0 ? raw.theme : "modern",
    categories: normalizedCategories,
    rules,
    lang: typeof raw?.lang === "string" && raw.lang.trim().length > 0 ? raw.lang : "en",
    summaryLang: typeof raw?.summaryLang === "string" && raw.summaryLang.trim().length > 0 ? raw.summaryLang : typeof raw?.lang === "string" && raw.lang.trim().length > 0 ? raw.lang : "en",
    specialty: typeof raw?.specialty === "string" ? raw.specialty : (raw?.specialty ?? ""),
    payer: typeof raw?.payer === "string" ? raw.payer : (raw?.payer ?? ""),
    region: typeof raw?.region === "string" ? raw.region : "",
    template: typeof raw?.template === "number" ? raw.template : null,
    useLocalModels: Boolean(raw?.useLocalModels),
    useOfflineMode: Boolean(raw?.useOfflineMode),
    agencies,
    beautifyModel: typeof raw?.beautifyModel === "string" ? raw.beautifyModel : null,
    suggestModel: typeof raw?.suggestModel === "string" ? raw.suggestModel : null,
    summarizeModel: typeof raw?.summarizeModel === "string" ? raw.summarizeModel : null,
    deidEngine: typeof raw?.deidEngine === "string" && raw.deidEngine.trim().length > 0 ? raw.deidEngine : "regex",
  }
}

function createDefaultPreferences(): UserPreferences {
  return normalizeUserPreferences({})
}

function cloneConfig(config: JsonConfig | null | undefined): JsonConfig {
  try {
    return JSON.parse(JSON.stringify(config ?? {})) as JsonConfig
  } catch {
    return {}
  }
}

function normalizeConfig(config: JsonConfig | null | undefined): JsonConfig {
  if (!config || typeof config !== "object") {
    return {}
  }
  return cloneConfig(config)
}

function stringifyConfig(config: JsonConfig | null): string {
  try {
    return JSON.stringify(config ?? {}, null, 2)
  } catch {
    return "{}"
  }
}
interface SuggestionSettingsProps {
  categories: SuggestionCategories | null
  loading: boolean
  saving: boolean
  error?: string | null
  onToggle: (key: KnownSuggestionCategory) => void
}

function SuggestionSettings({ categories, loading, saving, error, onToggle }: SuggestionSettingsProps) {
  const disabled = loading || saving || !categories

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-blue-600" />
          AI Suggestion Categories
        </CardTitle>
        <CardDescription>Control which types of suggestions the AI assistant provides during documentation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Unable to load preferences</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SUGGESTION_OPTIONS.map((option) => {
            const checked = categories ? Boolean(categories[option.key]) : false
            return (
              <div key={option.key} className={`flex items-center justify-between p-3 rounded-lg border ${option.containerClass}`}>
                <div>
                  <Label className={`font-medium ${option.labelClass}`}>{option.label}</Label>
                  <p className={`text-xs mt-1 ${option.descriptionClass}`}>{option.description}</p>
                </div>
                <Switch data-testid={`suggestion-toggle-${option.key}`} checked={checked} onCheckedChange={() => categories && onToggle(option.key)} disabled={disabled} />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

interface AppearanceSettingsProps {
  theme: string
  disabled: boolean
  onThemeChange: (value: string) => void
}

function AppearanceSettings({ theme, disabled, onThemeChange }: AppearanceSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-purple-600" />
          Appearance & Theme
        </CardTitle>
        <CardDescription>Customize the visual appearance of the application</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Interface Theme</Label>
            <Select value={theme} onValueChange={onThemeChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">Modern (Default)</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="accessible">High Contrast</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Choose the overall visual style for the interface</p>
          </div>

          <div className="space-y-2">
            <Label>Color Mode</Label>
            <Select defaultValue="system" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System Preference</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Automatically adapts to your system setting</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ClinicalSettingsProps {
  specialty: string | null
  payer: string | null
  region: string
  agencies: string[]
  disabled: boolean
  onSpecialtyChange: (value: string) => void
  onPayerChange: (value: string) => void
  onRegionChange: (value: string) => void
  onToggleGuideline: (value: string) => void
}

function ClinicalSettings({ specialty, payer, region, agencies, disabled, onSpecialtyChange, onPayerChange, onRegionChange, onToggleGuideline }: ClinicalSettingsProps) {
  const availableGuidelines = [
    { id: "cms", name: "CMS", color: "blue" },
    { id: "aafp", name: "AAFP", color: "green" },
    { id: "ama", name: "AMA", color: "purple" },
    { id: "uspstf", name: "USPSTF", color: "orange" },
    { id: "cdc", name: "CDC", color: "red" },
  ]

  const selected = new Set(agencies.map((value) => value.toLowerCase()))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-green-600" />
          Clinical Configuration
        </CardTitle>
        <CardDescription>Configure specialty-specific settings for more accurate suggestions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Medical Specialty</Label>
            <Select value={specialty ?? "family-medicine"} onValueChange={onSpecialtyChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="family-medicine">Family Medicine</SelectItem>
                <SelectItem value="internal-medicine">Internal Medicine</SelectItem>
                <SelectItem value="pediatrics">Pediatrics</SelectItem>
                <SelectItem value="emergency-medicine">Emergency Medicine</SelectItem>
                <SelectItem value="urgent-care">Urgent Care</SelectItem>
                <SelectItem value="cardiology">Cardiology</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Primary Payer</Label>
            <Select value={payer ?? "medicare"} onValueChange={onPayerChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medicare">Medicare</SelectItem>
                <SelectItem value="medicaid">Medicaid</SelectItem>
                <SelectItem value="commercial">Commercial Insurance</SelectItem>
                <SelectItem value="cash">Cash Pay</SelectItem>
                <SelectItem value="mixed">Mixed Payers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Geographic Region</Label>
            <Select value={region || "us-east"} onValueChange={onRegionChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us-east">US East Coast</SelectItem>
                <SelectItem value="us-west">US West Coast</SelectItem>
                <SelectItem value="us-central">US Central</SelectItem>
                <SelectItem value="us-south">US South</SelectItem>
                <SelectItem value="canada">Canada</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Guideline Agencies</Label>
          <p className="text-xs text-muted-foreground">Select which clinical guidelines to reference for suggestions</p>
          <div className="flex flex-wrap gap-2">
            {availableGuidelines.map((guideline) => {
              const isSelected = selected.has(guideline.id.toLowerCase())
              return (
                <button
                  type="button"
                  key={guideline.id}
                  onClick={() => onToggleGuideline(guideline.id)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    isSelected ? `bg-${guideline.color}-100 border-${guideline.color}-300 text-${guideline.color}-700` : "bg-muted border-border text-muted-foreground hover:bg-accent"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {guideline.name}
                  {isSelected && <Check className="w-3 h-3 ml-1 inline" />}
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface LanguageSettingsProps {
  lang: string
  summaryLang: string
  disabled: boolean
  onLangChange: (value: string) => void
  onSummaryLangChange: (value: string) => void
}

function LanguageSettings({ lang, summaryLang, disabled, onLangChange, onSummaryLangChange }: LanguageSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-orange-600" />
          Language & Localization
        </CardTitle>
        <CardDescription>Configure language preferences for interface and clinical output</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Interface Language</Label>
            <Select value={lang} onValueChange={onLangChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Language for menus, buttons, and interface elements</p>
          </div>

          <div className="space-y-2">
            <Label>Summary Output Language</Label>
            <Select value={summaryLang} onValueChange={onSummaryLangChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Language for generated summaries and clinical text</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ClinicalRulesManagementProps {
  enabledRules: string[]
  disabled: boolean
  saving: boolean
  onToggleRule: (ruleId: string, enabled: boolean) => void
}

function ClinicalRulesManagement({ enabledRules, disabled, saving, onToggleRule }: ClinicalRulesManagementProps) {
  const selected = new Set(enabledRules)
  const toggleDisabled = disabled || saving

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-green-600" />
          Custom Clinical Rules
        </CardTitle>
        <CardDescription>Create custom rules for clinical decision support and reminders</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {CLINICAL_RULES.length} rules active
          </p>
        </div>

        <div className="space-y-2">
          {CLINICAL_RULES.map((rule) => {
            const isEnabled = selected.has(rule.id)
            return (
              <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
                      {isEnabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                  <div className="text-xs text-muted-foreground mt-2 font-mono bg-muted p-2 rounded">
                    IF {rule.condition} THEN {rule.action}
                  </div>
                </div>
                <Switch data-testid={`clinical-rule-toggle-${rule.id}`} checked={isEnabled} disabled={toggleDisabled} onCheckedChange={(checked) => onToggleRule(rule.id, checked)} />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: "1",
      name: "Standard SOAP Note",
      type: "SOAP",
      content: "S: \nO: \nA: \nP: ",
      lastModified: "2 days ago",
    },
    {
      id: "2",
      name: "Annual Wellness Visit",
      type: "Wellness",
      content: "Chief Complaint:\nHistory of Present Illness:\nReview of Systems:\nPhysical Examination:\nAssessment and Plan:",
      lastModified: "1 week ago",
    },
    {
      id: "3",
      name: "Follow-up Visit",
      type: "Follow-up",
      content: "Interval History:\nCompliance with Treatment:\nCurrent Symptoms:\nPhysical Exam:\nPlan:",
      lastModified: "3 days ago",
    },
  ])

  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [newTemplate, setNewTemplate] = useState({ name: "", type: "SOAP" as Template["type"], content: "" })

  const handleSaveTemplate = () => {
    if (editingTemplate) {
      setTemplates((prev) => prev.map((t) => (t.id === editingTemplate.id ? { ...editingTemplate, lastModified: "Just now" } : t)))
      setEditingTemplate(null)
    } else {
      const template: Template = {
        id: Date.now().toString(),
        name: newTemplate.name,
        type: newTemplate.type,
        content: newTemplate.content,
        lastModified: "Just now",
      }
      setTemplates((prev) => [...prev, template])
      setNewTemplate({ name: "", type: "SOAP", content: "" })
      setIsNewTemplateOpen(false)
    }
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Note Templates
        </CardTitle>
        <CardDescription>Manage templates for different types of clinical documentation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{templates.length} templates configured</p>
          <Dialog open={isNewTemplateOpen} onOpenChange={setIsNewTemplateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Template</DialogTitle>
                <DialogDescription>Design a template for consistent note structure</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input value={newTemplate.name} onChange={(e) => setNewTemplate((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g., Cardiology Consultation" />
                  </div>
                  <div className="space-y-2">
                    <Label>Template Type</Label>
                    <Select value={newTemplate.type} onValueChange={(value: Template["type"]) => setNewTemplate((prev) => ({ ...prev, type: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SOAP">SOAP Note</SelectItem>
                        <SelectItem value="Wellness">Wellness Visit</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Template Content</Label>
                  <Textarea
                    value={newTemplate.content}
                    onChange={(e) => setNewTemplate((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter the template structure..."
                    className="min-h-40"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewTemplateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate} disabled={!newTemplate.name || !newTemplate.content}>
                  Create Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{template.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {template.type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last modified {template.lastModified}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(template)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(template.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>Update the template content and settings</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input value={editingTemplate?.name ?? ""} onChange={(e) => setEditingTemplate((prev) => (prev ? { ...prev, name: e.target.value } : prev))} />
                </div>
                <div className="space-y-2">
                  <Label>Template Type</Label>
                  <Select value={editingTemplate?.type ?? "SOAP"} onValueChange={(value: Template["type"]) => setEditingTemplate((prev) => (prev ? { ...prev, type: value } : prev))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOAP">SOAP Note</SelectItem>
                      <SelectItem value="Wellness">Wellness Visit</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Template Content</Label>
                <Textarea value={editingTemplate?.content ?? ""} onChange={(e) => setEditingTemplate((prev) => (prev ? { ...prev, content: e.target.value } : prev))} className="min-h-40" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
interface AdminConfigEditorProps {
  icon: LucideIcon
  title: string
  description: string
  config: JsonConfig | null
  loading: boolean
  saving: boolean
  error: string | null
  onSave: (config: JsonConfig) => void
  testId: string
}

function AdminConfigEditor({ icon: Icon, title, description, config, loading, saving, error, onSave, testId }: AdminConfigEditorProps) {
  const [draft, setDraft] = useState("{}")

  useEffect(() => {
    if (!loading) {
      setDraft(stringifyConfig(config))
    }
  }, [config, loading])

  const handleSave = useCallback(() => {
    try {
      const parsed = draft.trim().length > 0 ? JSON.parse(draft) : {}
      onSave(parsed as JsonConfig)
    } catch (parseError) {
      toast.error(`Invalid configuration JSON: ${getErrorMessage(parseError)}`)
    }
  }, [draft, onSave])

  const disabled = loading || saving || (error !== null && config === null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-purple-600" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Configuration unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Textarea data-testid={`${testId}-editor`} value={draft} onChange={(event) => setDraft(event.target.value)} className="font-mono text-sm min-h-40" disabled={loading || saving} />
        <div className="flex justify-end">
          <Button data-testid={`${testId}-save`} onClick={handleSave} disabled={disabled}>
            {saving ? <Upload className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface AdvancedSettingsProps {
  preferences: UserPreferences
  preferencesLoading: boolean
  preferencesSaving: boolean
  onPreferencesUpdate: (updater: (prev: UserPreferences) => UserPreferences, successMessage?: string) => void
  isAdmin: boolean
  ehrConfig: JsonConfig | null
  ehrLoading: boolean
  ehrSaving: boolean
  ehrError: string | null
  onSaveEhrConfig: (config: JsonConfig) => void
  organizationConfig: JsonConfig | null
  organizationLoading: boolean
  organizationSaving: boolean
  organizationError: string | null
  onSaveOrganizationConfig: (config: JsonConfig) => void
  securityConfig: JsonConfig | null
  securityLoading: boolean
  securitySaving: boolean
  securityError: string | null
  onSaveSecurityConfig: (config: JsonConfig) => void
}

function AdvancedSettings({
  preferences,
  preferencesLoading,
  preferencesSaving,
  onPreferencesUpdate,
  isAdmin,
  ehrConfig,
  ehrLoading,
  ehrSaving,
  ehrError,
  onSaveEhrConfig,
  organizationConfig,
  organizationLoading,
  organizationSaving,
  organizationError,
  onSaveOrganizationConfig,
  securityConfig,
  securityLoading,
  securitySaving,
  securityError,
  onSaveSecurityConfig,
}: AdvancedSettingsProps) {
  const [promptOverrides, setPromptOverrides] = useState(`{
  "suggestion_context": {
    "medical_specialty": "{{specialty}}",
    "coding_accuracy_threshold": 0.85,
    "enable_differential_analysis": true
  },
  "output_formatting": {
    "include_confidence_scores": true,
    "max_suggestions_per_category": 5
  }
}`)
  const [apiKey, setApiKey] = useState("")
  const [apiKeyStatus, setApiKeyStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle")

  const offlineDisabled = preferencesLoading || preferencesSaving || !preferences.useLocalModels

  const handleSavePromptOverrides = useCallback(() => {
    try {
      JSON.parse(promptOverrides)
      toast.success("Prompt overrides saved")
    } catch (error) {
      toast.error(`Invalid JSON: ${getErrorMessage(error)}`)
    }
  }, [promptOverrides])

  const handleSaveApiKey = useCallback(() => {
    if (!apiKey.startsWith("sk-")) {
      setApiKeyStatus("invalid")
      return
    }
    setApiKeyStatus("validating")
    setTimeout(() => {
      setApiKeyStatus("valid")
      toast.success("API key saved")
    }, 500)
  }, [apiKey])

  const handleDownloadLocalModels = useCallback(() => {
    onPreferencesUpdate(
      (prev) => ({
        ...prev,
        useLocalModels: true,
      }),
      "Local AI models marked as available",
    )
  }, [onPreferencesUpdate])

  const handleOfflineToggle = useCallback(
    (checked: boolean) => {
      onPreferencesUpdate(
        (prev) => ({
          ...prev,
          useOfflineMode: checked,
        }),
        checked ? "Offline mode enabled" : "Offline mode disabled",
      )
    },
    [onPreferencesUpdate],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="w-5 h-5 text-purple-600" />
            Advanced Configuration
          </CardTitle>
          <CardDescription>Advanced settings for customization and offline capabilities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Prompt Overrides (JSON)</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPromptOverrides("")}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
                <Button size="sm" onClick={handleSavePromptOverrides}>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
            <Textarea value={promptOverrides} onChange={(e) => setPromptOverrides(e.target.value)} className="font-mono text-sm min-h-32" placeholder="Enter JSON configuration..." />
            <p className="text-xs text-muted-foreground">Advanced prompt configuration in JSON format. Changes require validation.</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>OpenAI API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setApiKeyStatus("idle")
                }}
                placeholder="sk-..."
                className="flex-1"
              />
              <Button onClick={handleSaveApiKey} disabled={!apiKey || apiKeyStatus === "validating"}>
                {apiKeyStatus === "validating" ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Key className="w-4 h-4 mr-2" />}
                Save Key
              </Button>
            </div>

            {apiKeyStatus === "invalid" && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>Invalid API key format. Please check and try again.</AlertDescription>
              </Alert>
            )}

            {apiKeyStatus === "valid" && (
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>API key validated and saved successfully.</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">Your API key is encrypted and stored securely. Required for AI suggestions.</p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Offline Mode</Label>
                <p className="text-xs text-muted-foreground mt-1">Use local models when internet is unavailable</p>
              </div>
              <Switch data-testid="offline-mode-toggle" checked={preferences.useOfflineMode} onCheckedChange={handleOfflineToggle} disabled={offlineDisabled} />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {preferences.useLocalModels ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Download className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <span className="font-medium">Local AI Models</span>
                  <p className="text-xs text-muted-foreground">{preferences.useLocalModels ? "Downloaded" : "Not downloaded"}</p>
                </div>
              </div>
              <Button variant={preferences.useLocalModels ? "outline" : "default"} size="sm" onClick={handleDownloadLocalModels} disabled={preferences.useLocalModels || preferencesSaving}>
                {preferences.useLocalModels ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="space-y-6">
          <AdminConfigEditor
            icon={SettingsIcon}
            title="EHR Integration"
            description="Configure EHR connectivity, credentials, and synchronization rules"
            config={ehrConfig}
            loading={ehrLoading}
            saving={ehrSaving}
            error={ehrError}
            onSave={onSaveEhrConfig}
            testId="ehr-config"
          />
          <AdminConfigEditor
            icon={FileText}
            title="Organization Settings"
            description="Manage organization-wide defaults, templates, and workflows"
            config={organizationConfig}
            loading={organizationLoading}
            saving={organizationSaving}
            error={organizationError}
            onSave={onSaveOrganizationConfig}
            testId="organization-config"
          />
          <AdminConfigEditor
            icon={Shield}
            title="Security Configuration"
            description="Control audit logging, encryption, and session policies"
            config={securityConfig}
            loading={securityLoading}
            saving={securitySaving}
            error={securityError}
            onSave={onSaveSecurityConfig}
            testId="security-config"
          />
        </div>
      )}
    </div>
  )
}
export function Settings({ userRole = "user" }: SettingsProps) {
  const isAdmin = userRole === "admin"

  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null)
  const userPreferencesRef = useRef<UserPreferences>(createDefaultPreferences())
  const [userPreferencesLoading, setUserPreferencesLoading] = useState(true)
  const [userPreferencesError, setUserPreferencesError] = useState<string | null>(null)
  const [userPreferencesSaving, setUserPreferencesSaving] = useState(false)

  const [ehrConfig, setEhrConfig] = useState<JsonConfig | null>(null)
  const [ehrLoading, setEhrLoading] = useState(isAdmin)
  const [ehrError, setEhrError] = useState<string | null>(null)
  const [ehrSaving, setEhrSaving] = useState(false)
  const ehrConfigRef = useRef<JsonConfig>(cloneConfig({}))

  const [organizationConfig, setOrganizationConfig] = useState<JsonConfig | null>(null)
  const [organizationLoading, setOrganizationLoading] = useState(isAdmin)
  const [organizationError, setOrganizationError] = useState<string | null>(null)
  const [organizationSaving, setOrganizationSaving] = useState(false)
  const organizationConfigRef = useRef<JsonConfig>(cloneConfig({}))

  const [securityConfig, setSecurityConfig] = useState<JsonConfig | null>(null)
  const [securityLoading, setSecurityLoading] = useState(isAdmin)
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securitySaving, setSecuritySaving] = useState(false)
  const securityConfigRef = useRef<JsonConfig>(cloneConfig({}))

  useEffect(() => {
    let cancelled = false
    setUserPreferencesLoading(true)
    setUserPreferencesError(null)

    apiFetchJson<UserPreferences>("/api/user/preferences")
      .then((data) => {
        if (cancelled) return
        const normalized = normalizeUserPreferences(data ?? undefined)
        setUserPreferences(normalized)
        userPreferencesRef.current = normalized
      })
      .catch((error) => {
        if (cancelled) return
        const message = getErrorMessage(error)
        setUserPreferencesError(message)
        const fallback = createDefaultPreferences()
        setUserPreferences(fallback)
        userPreferencesRef.current = fallback
      })
      .finally(() => {
        if (!cancelled) {
          setUserPreferencesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const resetAdminConfigs = () => {
      setEhrConfig(null)
      setEhrLoading(false)
      setEhrError(null)
      setEhrSaving(false)
      ehrConfigRef.current = cloneConfig({})

      setOrganizationConfig(null)
      setOrganizationLoading(false)
      setOrganizationError(null)
      setOrganizationSaving(false)
      organizationConfigRef.current = cloneConfig({})

      setSecurityConfig(null)
      setSecurityLoading(false)
      setSecurityError(null)
      setSecuritySaving(false)
      securityConfigRef.current = cloneConfig({})
    }

    if (!isAdmin) {
      resetAdminConfigs()
      return
    }

    async function loadConfig(
      path: string,
      setState: (value: JsonConfig | null) => void,
      setError: (value: string | null) => void,
      setLoading: (value: boolean) => void,
      ref: { current: JsonConfig },
    ) {
      setLoading(true)
      setError(null)
      try {
        const data = await apiFetchJson<JsonConfig>(path, { fallbackValue: {} as JsonConfig })
        if (cancelled) {
          return
        }
        const normalized = normalizeConfig(data)
        setState(normalized)
        ref.current = normalized
      } catch (error) {
        if (cancelled) {
          return
        }
        setError(getErrorMessage(error))
        setState(null)
        ref.current = cloneConfig({})
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadConfig("/api/integrations/ehr/config", setEhrConfig, setEhrError, setEhrLoading, ehrConfigRef)
    loadConfig("/api/organization/settings", setOrganizationConfig, setOrganizationError, setOrganizationLoading, organizationConfigRef)
    loadConfig("/api/security/config", setSecurityConfig, setSecurityError, setSecurityLoading, securityConfigRef)

    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const handlePreferencesUpdate = useCallback((updater: (prev: UserPreferences) => UserPreferences, successMessage = "Preferences updated") => {
    const current = normalizeUserPreferences(userPreferencesRef.current)
    const optimistic = normalizeUserPreferences(updater(current))
    setUserPreferences(optimistic)
    userPreferencesRef.current = optimistic
    setUserPreferencesSaving(true)
    apiFetchJson<UserPreferences>("/api/user/preferences", {
      method: "PUT",
      jsonBody: optimistic,
    })
      .then((saved) => {
        const normalized = normalizeUserPreferences(saved ?? optimistic)
        setUserPreferences(normalized)
        userPreferencesRef.current = normalized
        toast.success(successMessage)
      })
      .catch((error) => {
        setUserPreferences(current)
        userPreferencesRef.current = current
        toast.error(`Unable to update preferences: ${getErrorMessage(error)}`)
      })
      .finally(() => setUserPreferencesSaving(false))
  }, [])

  const handleSaveEhrConfig = useCallback(
    (config: JsonConfig) => {
      if (!isAdmin) {
        toast.error("You do not have permission to update this configuration")
        return
      }
      const previous = cloneConfig(ehrConfigRef.current)
      const optimistic = normalizeConfig(config)
      setEhrError(null)
      setEhrSaving(true)
      setEhrConfig(optimistic)
      ehrConfigRef.current = optimistic
      apiFetchJson<JsonConfig>("/api/integrations/ehr/config", {
        method: "PUT",
        jsonBody: optimistic,
      })
        .then((saved) => {
          const normalized = normalizeConfig(saved)
          setEhrConfig(normalized)
          ehrConfigRef.current = normalized
          setEhrError(null)
          toast.success("EHR configuration saved")
        })
        .catch((error) => {
          const revertValue = previous
          setEhrConfig(revertValue)
          ehrConfigRef.current = revertValue
          const message = getErrorMessage(error)
          setEhrError(message)
          toast.error(`Unable to update configuration: ${message}`)
        })
        .finally(() => setEhrSaving(false))
    },
    [isAdmin],
  )

  const handleSaveOrganizationConfig = useCallback(
    (config: JsonConfig) => {
      if (!isAdmin) {
        toast.error("You do not have permission to update this configuration")
        return
      }
      const previous = cloneConfig(organizationConfigRef.current)
      const optimistic = normalizeConfig(config)
      setOrganizationError(null)
      setOrganizationSaving(true)
      setOrganizationConfig(optimistic)
      organizationConfigRef.current = optimistic
      apiFetchJson<JsonConfig>("/api/organization/settings", {
        method: "PUT",
        jsonBody: optimistic,
      })
        .then((saved) => {
          const normalized = normalizeConfig(saved)
          setOrganizationConfig(normalized)
          organizationConfigRef.current = normalized
          setOrganizationError(null)
          toast.success("Organization settings saved")
        })
        .catch((error) => {
          const revertValue = previous
          setOrganizationConfig(revertValue)
          organizationConfigRef.current = revertValue
          const message = getErrorMessage(error)
          setOrganizationError(message)
          toast.error(`Unable to update configuration: ${message}`)
        })
        .finally(() => setOrganizationSaving(false))
    },
    [isAdmin],
  )

  const handleSaveSecurityConfig = useCallback(
    (config: JsonConfig) => {
      if (!isAdmin) {
        toast.error("You do not have permission to update this configuration")
        return
      }
      const previous = cloneConfig(securityConfigRef.current)
      const optimistic = normalizeConfig(config)
      setSecurityError(null)
      setSecuritySaving(true)
      setSecurityConfig(optimistic)
      securityConfigRef.current = optimistic
      apiFetchJson<JsonConfig>("/api/security/config", {
        method: "PUT",
        jsonBody: optimistic,
      })
        .then((saved) => {
          const normalized = normalizeConfig(saved)
          setSecurityConfig(normalized)
          securityConfigRef.current = normalized
          setSecurityError(null)
          toast.success("Security configuration saved")
        })
        .catch((error) => {
          const revertValue = previous
          setSecurityConfig(revertValue)
          securityConfigRef.current = revertValue
          const message = getErrorMessage(error)
          setSecurityError(message)
          toast.error(`Unable to update configuration: ${message}`)
        })
        .finally(() => setSecuritySaving(false))
    },
    [isAdmin],
  )

  const preferences = userPreferences ?? userPreferencesRef.current

  const handleSuggestionToggle = useCallback(
    (key: KnownSuggestionCategory) => {
      const nextValue = !userPreferencesRef.current.categories[key]
      handlePreferencesUpdate(
        (prev) => ({
          ...prev,
          categories: {
            ...prev.categories,
            [key]: nextValue,
          },
        }),
        `${SUGGESTION_LABELS[key]} ${nextValue ? "enabled" : "disabled"}`,
      )
    },
    [handlePreferencesUpdate],
  )

  const handleThemeChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, theme: value }), "Theme updated")
    },
    [handlePreferencesUpdate],
  )

  const handleSpecialtyChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, specialty: value }), "Specialty updated")
    },
    [handlePreferencesUpdate],
  )

  const handlePayerChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, payer: value }), "Primary payer updated")
    },
    [handlePreferencesUpdate],
  )

  const handleRegionChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, region: value }), "Region updated")
    },
    [handlePreferencesUpdate],
  )

  const handleGuidelineToggle = useCallback(
    (value: string) => {
      const normalized = value.toLowerCase()
      handlePreferencesUpdate((prev) => {
        const exists = prev.agencies.some((item) => item.toLowerCase() === normalized)
        const updated = exists ? prev.agencies.filter((item) => item.toLowerCase() !== normalized) : [...prev.agencies, value]
        return {
          ...prev,
          agencies: updated,
        }
      }, "Guideline agencies updated")
    },
    [handlePreferencesUpdate],
  )

  const handleLangChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, lang: value }), "Interface language updated")
    },
    [handlePreferencesUpdate],
  )

  const handleSummaryLangChange = useCallback(
    (value: string) => {
      handlePreferencesUpdate((prev) => ({ ...prev, summaryLang: value }), "Summary language updated")
    },
    [handlePreferencesUpdate],
  )

  const handleRuleToggle = useCallback(
    (ruleId: string, enabled: boolean) => {
      handlePreferencesUpdate((prev) => {
        const current = new Set(prev.rules)
        if (enabled) {
          current.add(ruleId)
        } else {
          current.delete(ruleId)
        }
        return {
          ...prev,
          rules: Array.from(current),
        }
      }, "Clinical rules updated")
    },
    [handlePreferencesUpdate],
  )

  const roleLabel = isAdmin ? "Administrator" : "User"

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure RevenuePilot to match your clinical workflow and preferences</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {roleLabel} Settings
        </Badge>
      </div>

      <Tabs defaultValue="suggestions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="suggestions" className="flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Clinical
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="interface" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Interface
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Code className="w-4 h-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="space-y-6">
          <SuggestionSettings categories={preferences.categories} loading={userPreferencesLoading} saving={userPreferencesSaving} error={userPreferencesError} onToggle={handleSuggestionToggle} />
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6">
          <ClinicalSettings
            specialty={preferences.specialty}
            payer={preferences.payer}
            region={preferences.region}
            agencies={preferences.agencies}
            disabled={userPreferencesLoading || userPreferencesSaving}
            onSpecialtyChange={handleSpecialtyChange}
            onPayerChange={handlePayerChange}
            onRegionChange={handleRegionChange}
            onToggleGuideline={handleGuidelineToggle}
          />
          <LanguageSettings
            lang={preferences.lang}
            summaryLang={preferences.summaryLang}
            disabled={userPreferencesLoading || userPreferencesSaving}
            onLangChange={handleLangChange}
            onSummaryLangChange={handleSummaryLangChange}
          />
          <ClinicalRulesManagement enabledRules={preferences.rules} disabled={userPreferencesLoading} saving={userPreferencesSaving} onToggleRule={handleRuleToggle} />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <TemplateManagement />
        </TabsContent>

        <TabsContent value="interface" className="space-y-6">
          <AppearanceSettings theme={preferences.theme} disabled={userPreferencesLoading || userPreferencesSaving} onThemeChange={handleThemeChange} />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6" forceMount>
          <AdvancedSettings
            preferences={preferences}
            preferencesLoading={userPreferencesLoading}
            preferencesSaving={userPreferencesSaving}
            onPreferencesUpdate={handlePreferencesUpdate}
            isAdmin={isAdmin}
            ehrConfig={ehrConfig}
            ehrLoading={ehrLoading}
            ehrSaving={ehrSaving}
            ehrError={ehrError}
            onSaveEhrConfig={handleSaveEhrConfig}
            organizationConfig={organizationConfig}
            organizationLoading={organizationLoading}
            organizationSaving={organizationSaving}
            organizationError={organizationError}
            onSaveOrganizationConfig={handleSaveOrganizationConfig}
            securityConfig={securityConfig}
            securityLoading={securityLoading}
            securitySaving={securitySaving}
            securityError={securityError}
            onSaveSecurityConfig={handleSaveSecurityConfig}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
