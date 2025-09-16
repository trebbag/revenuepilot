import { useState } from "react"
import { motion } from "motion/react"
import { 
  Settings as SettingsIcon,
  Sliders,
  Palette,
  Globe,
  FileText,
  Code,
  Key,
  Download,
  Wifi,
  WifiOff,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  Upload,
  Brain,
  Shield,
  Stethoscope,
  Save,
  RotateCcw
} from "lucide-react"
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

interface SettingsProps {
  userRole?: 'admin' | 'user'
}

interface Template {
  id: string
  name: string
  type: 'SOAP' | 'Wellness' | 'Follow-up' | 'Custom'
  content: string
  lastModified: string
}

interface ClinicalRule {
  id: string
  name: string
  description: string
  condition: string
  action: string
  enabled: boolean
}

function SuggestionSettings() {
  const [suggestions, setSuggestions] = useState({
    codes: true,
    compliance: true,
    publicHealth: false,
    differentials: true,
    followUp: true
  })

  const handleToggle = (key: keyof typeof suggestions) => {
    setSuggestions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-blue-600" />
          AI Suggestion Categories
        </CardTitle>
        <CardDescription>
          Control which types of suggestions the AI assistant provides during documentation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-50/50">
            <div>
              <Label className="font-medium text-blue-900">Coding Suggestions</Label>
              <p className="text-xs text-blue-700 mt-1">CPT, ICD-10, and billing codes</p>
            </div>
            <Switch 
              checked={suggestions.codes} 
              onCheckedChange={() => handleToggle('codes')}
            />
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg border bg-red-50/50">
            <div>
              <Label className="font-medium text-red-900">Compliance Alerts</Label>
              <p className="text-xs text-red-700 mt-1">Regulatory and billing compliance</p>
            </div>
            <Switch 
              checked={suggestions.compliance} 
              onCheckedChange={() => handleToggle('compliance')}
            />
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg border bg-green-50/50">
            <div>
              <Label className="font-medium text-green-900">Public Health</Label>
              <p className="text-xs text-green-700 mt-1">Preventive care and screenings</p>
            </div>
            <Switch 
              checked={suggestions.publicHealth} 
              onCheckedChange={() => handleToggle('publicHealth')}
            />
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg border bg-purple-50/50">
            <div>
              <Label className="font-medium text-purple-900">Differential Diagnoses</Label>
              <p className="text-xs text-purple-700 mt-1">Alternative diagnosis considerations</p>
            </div>
            <Switch 
              checked={suggestions.differentials} 
              onCheckedChange={() => handleToggle('differentials')}
            />
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg border bg-orange-50/50 md:col-span-2">
            <div>
              <Label className="font-medium text-orange-900">Follow-up Recommendations</Label>
              <p className="text-xs text-orange-700 mt-1">Next steps and care coordination</p>
            </div>
            <Switch 
              checked={suggestions.followUp} 
              onCheckedChange={() => handleToggle('followUp')}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AppearanceSettings() {
  const [theme, setTheme] = useState('modern')
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-purple-600" />
          Appearance & Theme
        </CardTitle>
        <CardDescription>
          Customize the visual appearance of the application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Interface Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
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
            <p className="text-xs text-muted-foreground">
              Choose the overall visual style for the interface
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Color Mode</Label>
            <Select defaultValue="system">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System Preference</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Automatically adapts to your system setting
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ClinicalSettings() {
  const [specialty, setSpecialty] = useState('family-medicine')
  const [payer, setPayer] = useState('medicare')
  const [region, setRegion] = useState('us-east')
  const [guidelines, setGuidelines] = useState(['cms', 'aafp'])
  
  const availableGuidelines = [
    { id: 'cms', name: 'CMS', color: 'blue' },
    { id: 'aafp', name: 'AAFP', color: 'green' },
    { id: 'ama', name: 'AMA', color: 'purple' },
    { id: 'uspstf', name: 'USPSTF', color: 'orange' },
    { id: 'cdc', name: 'CDC', color: 'red' }
  ]
  
  const toggleGuideline = (id: string) => {
    setGuidelines(prev => 
      prev.includes(id) 
        ? prev.filter(g => g !== id)
        : [...prev, id]
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-green-600" />
          Clinical Configuration
        </CardTitle>
        <CardDescription>
          Configure specialty-specific settings for more accurate suggestions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Medical Specialty</Label>
            <Select value={specialty} onValueChange={setSpecialty}>
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
            <Select value={payer} onValueChange={setPayer}>
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
            <Select value={region} onValueChange={setRegion}>
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
          <p className="text-xs text-muted-foreground">
            Select which clinical guidelines to reference for suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {availableGuidelines.map(guideline => (
              <button
                key={guideline.id}
                onClick={() => toggleGuideline(guideline.id)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  guidelines.includes(guideline.id)
                    ? `bg-${guideline.color}-100 border-${guideline.color}-300 text-${guideline.color}-700`
                    : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {guideline.name}
                {guidelines.includes(guideline.id) && (
                  <Check className="w-3 h-3 ml-1 inline" />
                )}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LanguageSettings() {
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [summaryLanguage, setSummaryLanguage] = useState('en')
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-orange-600" />
          Language & Localization
        </CardTitle>
        <CardDescription>
          Configure language preferences for interface and clinical output
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Interface Language</Label>
            <Select value={interfaceLanguage} onValueChange={setInterfaceLanguage}>
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
            <p className="text-xs text-muted-foreground">
              Language for menus, buttons, and interface elements
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Summary Output Language</Label>
            <Select value={summaryLanguage} onValueChange={setSummaryLanguage}>
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
            <p className="text-xs text-muted-foreground">
              Language for generated summaries and clinical text
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: '1',
      name: 'Standard SOAP Note',
      type: 'SOAP',
      content: 'S: \nO: \nA: \nP: ',
      lastModified: '2 days ago'
    },
    {
      id: '2',
      name: 'Annual Wellness Visit',
      type: 'Wellness',
      content: 'Chief Complaint:\nHistory of Present Illness:\nReview of Systems:\nPhysical Examination:\nAssessment and Plan:',
      lastModified: '1 week ago'
    },
    {
      id: '3',
      name: 'Follow-up Visit',
      type: 'Follow-up',
      content: 'Interval History:\nCompliance with Treatment:\nCurrent Symptoms:\nPhysical Exam:\nPlan:',
      lastModified: '3 days ago'
    }
  ])
  
  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [newTemplate, setNewTemplate] = useState({ name: '', type: 'SOAP' as Template['type'], content: '' })

  const handleSaveTemplate = () => {
    if (editingTemplate) {
      setTemplates(prev => prev.map(t => 
        t.id === editingTemplate.id 
          ? { ...editingTemplate, lastModified: 'Just now' }
          : t
      ))
      setEditingTemplate(null)
    } else {
      const template: Template = {
        id: Date.now().toString(),
        name: newTemplate.name,
        type: newTemplate.type,
        content: newTemplate.content,
        lastModified: 'Just now'
      }
      setTemplates(prev => [...prev, template])
      setNewTemplate({ name: '', type: 'SOAP', content: '' })
      setIsNewTemplateOpen(false)
    }
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Note Templates
        </CardTitle>
        <CardDescription>
          Manage templates for different types of clinical documentation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {templates.length} templates configured
          </p>
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
                <DialogDescription>
                  Design a template for consistent note structure
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input 
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Cardiology Consultation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Template Type</Label>
                    <Select 
                      value={newTemplate.type} 
                      onValueChange={(value: Template['type']) => setNewTemplate(prev => ({ ...prev, type: value }))}
                    >
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
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Last modified {template.lastModified}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setEditingTemplate(template)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleDeleteTemplate(template.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {editingTemplate && (
          <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Template</DialogTitle>
                <DialogDescription>
                  Modify the template structure and content
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input 
                      value={editingTemplate.name}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Template Type</Label>
                    <Select 
                      value={editingTemplate.type} 
                      onValueChange={(value: Template['type']) => setEditingTemplate(prev => prev ? { ...prev, type: value } : null)}
                    >
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
                    value={editingTemplate.content}
                    onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, content: e.target.value } : null)}
                    className="min-h-40"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate}>
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  )
}

function AdvancedSettings() {
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
  const [apiKey, setApiKey] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [localModelsDownloaded, setLocalModelsDownloaded] = useState(false)

  const handleSavePromptOverrides = () => {
    try {
      JSON.parse(promptOverrides)
      // In real app, save to backend
      console.log('Saved prompt overrides:', promptOverrides)
    } catch (error) {
      console.error('Invalid JSON format')
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.startsWith('sk-')) {
      setApiKeyStatus('invalid')
      return
    }
    
    setApiKeyStatus('validating')
    // Simulate API key validation
    setTimeout(() => {
      setApiKeyStatus('valid')
    }, 1500)
  }

  const handleDownloadLocalModels = () => {
    // Simulate download process
    setLocalModelsDownloaded(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="w-5 h-5 text-purple-600" />
          Advanced Configuration
        </CardTitle>
        <CardDescription>
          Advanced settings for customization and offline capabilities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Prompt Overrides */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Prompt Overrides (JSON)</Label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPromptOverrides('')}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button size="sm" onClick={handleSavePromptOverrides}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
          <Textarea 
            value={promptOverrides}
            onChange={(e) => setPromptOverrides(e.target.value)}
            className="font-mono text-sm min-h-32"
            placeholder="Enter JSON configuration..."
          />
          <p className="text-xs text-muted-foreground">
            Advanced prompt configuration in JSON format. Changes require validation.
          </p>
        </div>

        <Separator />

        {/* API Key Management */}
        <div className="space-y-3">
          <Label>OpenAI API Key</Label>
          <div className="flex gap-2">
            <Input 
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setApiKeyStatus('idle')
              }}
              placeholder="sk-..."
              className="flex-1"
            />
            <Button 
              onClick={handleSaveApiKey} 
              disabled={!apiKey || apiKeyStatus === 'validating'}
            >
              {apiKeyStatus === 'validating' ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Save Key
            </Button>
          </div>
          
          {apiKeyStatus === 'invalid' && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Invalid API key format. Please check and try again.
              </AlertDescription>
            </Alert>
          )}
          
          {apiKeyStatus === 'valid' && (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                API key validated and saved successfully.
              </AlertDescription>
            </Alert>
          )}
          
          <p className="text-xs text-muted-foreground">
            Your API key is encrypted and stored securely. Required for AI suggestions.
          </p>
        </div>

        <Separator />

        {/* Offline Mode */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Offline Mode</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Use local models when internet is unavailable
              </p>
            </div>
            <Switch 
              checked={isOfflineMode} 
              onCheckedChange={setIsOfflineMode}
              disabled={!localModelsDownloaded}
            />
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {localModelsDownloaded ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <Download className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <span className="font-medium">Local AI Models</span>
                <p className="text-xs text-muted-foreground">
                  {localModelsDownloaded ? 'Downloaded (2.1 GB)' : 'Not downloaded'}
                </p>
              </div>
            </div>
            <Button 
              variant={localModelsDownloaded ? "outline" : "default"}
              size="sm"
              onClick={handleDownloadLocalModels}
              disabled={localModelsDownloaded}
            >
              {localModelsDownloaded ? (
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
  )
}

function ClinicalRulesManagement() {
  const [rules, setRules] = useState<ClinicalRule[]>([
    {
      id: '1',
      name: 'Diabetes Annual Eye Exam',
      description: 'Remind for annual eye exam for diabetic patients',
      condition: 'diagnosis:diabetes AND last_eye_exam > 365_days',
      action: 'suggest_eye_exam_referral',
      enabled: true
    },
    {
      id: '2',
      name: 'High Blood Pressure Follow-up',
      description: 'Schedule follow-up for uncontrolled hypertension',
      condition: 'bp_systolic > 140 OR bp_diastolic > 90',
      action: 'suggest_followup_2weeks',
      enabled: true
    },
    {
      id: '3',
      name: 'Mammography Screening',
      description: 'Annual mammography for women 40+',
      condition: 'age >= 40 AND gender:female AND last_mammogram > 365_days',
      action: 'suggest_mammography',
      enabled: false
    }
  ])

  const [isNewRuleOpen, setIsNewRuleOpen] = useState(false)
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    condition: '',
    action: ''
  })

  const handleSaveRule = () => {
    const rule: ClinicalRule = {
      id: Date.now().toString(),
      ...newRule,
      enabled: true
    }
    setRules(prev => [...prev, rule])
    setNewRule({ name: '', description: '', condition: '', action: '' })
    setIsNewRuleOpen(false)
  }

  const handleDeleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const handleToggleRule = (id: string) => {
    setRules(prev => prev.map(rule => 
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    ))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-green-600" />
          Custom Clinical Rules
        </CardTitle>
        <CardDescription>
          Create custom rules for clinical decision support and reminders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {rules.filter(r => r.enabled).length} of {rules.length} rules active
          </p>
          <Dialog open={isNewRuleOpen} onOpenChange={setIsNewRuleOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Clinical Rule</DialogTitle>
                <DialogDescription>
                  Define conditions and actions for clinical decision support
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input 
                    value={newRule.name}
                    onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Cholesterol Screening Reminder"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={newRule.description}
                    onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of what this rule does"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Textarea 
                    value={newRule.condition}
                    onChange={(e) => setNewRule(prev => ({ ...prev, condition: e.target.value }))}
                    placeholder="age >= 45 AND last_cholesterol > 1825_days"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Define when this rule should trigger using logical expressions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Input 
                    value={newRule.action}
                    onChange={(e) => setNewRule(prev => ({ ...prev, action: e.target.value }))}
                    placeholder="suggest_cholesterol_test"
                  />
                  <p className="text-xs text-muted-foreground">
                    What action should be taken when the condition is met
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewRuleOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveRule} disabled={!newRule.name || !newRule.condition || !newRule.action}>
                  Create Rule
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  <Badge variant={rule.enabled ? "default" : "secondary"} className="text-xs">
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {rule.description}
                </p>
                <div className="text-xs text-muted-foreground mt-2 font-mono bg-muted p-2 rounded">
                  IF {rule.condition} THEN {rule.action}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={rule.enabled}
                  onCheckedChange={() => handleToggleRule(rule.id)}
                />
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function Settings({ userRole = 'user' }: SettingsProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure RevenuePilot to match your clinical workflow and preferences
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {userRole === 'admin' ? 'Administrator' : 'User'} Settings
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
          <SuggestionSettings />
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6">
          <ClinicalSettings />
          <LanguageSettings />
          <ClinicalRulesManagement />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <TemplateManagement />
        </TabsContent>

        <TabsContent value="interface" className="space-y-6">
          <AppearanceSettings />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <AdvancedSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}