import { Button } from "./components/ui/button"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { SessionProvider, useSession } from "./contexts/SessionContext"
import { ProtectedApp } from "./ProtectedApp"

interface FullscreenMessageProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

function FullscreenMessage({ title, description, actionLabel, onAction }: FullscreenMessageProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
        {actionLabel && onAction && (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

import { Badge } from "./components/ui/badge"

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'app' | 'analytics' | 'settings' | 'activity' | 'drafts' | 'schedule' | 'builder' | 'style-guide' | 'figma-library' | 'finalization-demo'>('home')
  const [isSuggestionPanelOpen, setIsSuggestionPanelOpen] = useState(true)
  const [userRole] = useState<'admin' | 'user'>('admin') // For demo purposes, set as admin
  
  // Current logged-in user context
  const [currentUser] = useState({
    id: 'user-001',
    name: 'Dr. Johnson',
    fullName: 'Dr. Sarah Johnson',
    role: 'admin' as 'admin' | 'user',
    specialty: 'Family Medicine'
  })

  // State for pre-populating patient information when starting a visit
  const [prePopulatedPatient, setPrePopulatedPatient] = useState<{
    patientId: string
    encounterId: string
  } | null>(null)

  // Shared appointment state between Builder and Schedule components
  const [sharedAppointments, setSharedAppointments] = useState([
    {
      id: 'apt-001',
      patientId: 'PT-2024-0156',
      encounterId: 'ENC-240314-001',
      patientName: 'Sarah Chen',
      patientPhone: '(555) 123-4567',
      patientEmail: 'sarah.chen@email.com',
      appointmentTime: '2024-03-14T09:00:00Z',
      duration: 30,
      appointmentType: 'Wellness',
      provider: 'Dr. Johnson',
      location: 'Room 101',
      status: 'Scheduled',
      notes: 'Annual wellness visit',
      fileUpToDate: true,
      priority: 'medium',
      isVirtual: false
    },
    {
      id: 'apt-002',
      patientId: 'PT-2024-0143',
      encounterId: 'ENC-240314-002',
      patientName: 'Michael Rodriguez',
      patientPhone: '(555) 987-6543',
      patientEmail: 'michael.r@email.com',
      appointmentTime: '2024-03-14T09:30:00Z',
      duration: 45,
      appointmentType: 'Follow-up',
      provider: 'Dr. Johnson',
      location: 'Room 101',
      status: 'Checked In',
      notes: 'Diabetes follow-up',
      fileUpToDate: false,
      priority: 'high',
      isVirtual: false
    },
    {
      id: 'apt-003',
      patientId: 'PT-2024-0089',
      encounterId: 'ENC-240314-003',
      patientName: 'Emily Johnson',
      patientPhone: '(555) 456-7890',
      patientEmail: 'emily.j@email.com',
      appointmentTime: '2024-03-14T10:15:00Z',
      duration: 60,
      appointmentType: 'New Patient',
      provider: 'Dr. Johnson',
      location: 'Room 102',
      status: 'Scheduled',
      notes: 'Initial consultation',
      fileUpToDate: false,
      priority: 'medium',
      isVirtual: false
    },
    {
      id: 'apt-004',
      patientId: 'PT-2024-0067',
      encounterId: 'ENC-240314-004',
      patientName: 'Robert Davis',
      patientPhone: '(555) 234-5678',
      patientEmail: 'robert.davis@email.com',
      appointmentTime: '2024-03-14T11:30:00Z',
      duration: 30,
      appointmentType: 'Urgent',
      provider: 'Dr. Johnson',
      location: 'Virtual',
      status: 'Scheduled',
      notes: 'Urgent care - chest pain',
      fileUpToDate: true,
      priority: 'high',
      isVirtual: true
    },
    {
      id: 'apt-005',
      patientId: 'PT-2024-0234',
      encounterId: 'ENC-240314-005',
      patientName: 'Lisa Thompson',
      patientPhone: '(555) 345-6789',
      patientEmail: 'lisa.t@email.com',
      appointmentTime: '2024-03-14T14:00:00Z',
      duration: 45,
      appointmentType: 'Consultation',
      provider: 'Dr. Smith',
      location: 'Room 201',
      status: 'Scheduled',
      notes: 'Cardiology consultation',
      fileUpToDate: true,
      priority: 'medium',
      isVirtual: false
    }
  ])

  const [selectedCodes, setSelectedCodes] = useState({
    codes: 2,
    prevention: 0,
    diagnoses: 4,
    differentials: 1
  })
  const [addedCodes, setAddedCodes] = useState<string[]>([])
  const [selectedCodesList, setSelectedCodesList] = useState<any[]>([
    // Initial codes to match the starting counts
    {
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
      code: "J06.9",
      type: "ICD-10",
      category: "diagnoses",
      description: "Acute upper respiratory infection, unspecified",
      rationale: "Primary diagnosis based on presenting symptoms and clinical findings",
      confidence: 92
    },
    {
      code: "J02.9",
      type: "ICD-10",
      category: "diagnoses",
      description: "Acute pharyngitis, unspecified",
      rationale: "Secondary diagnosis from physical examination findings",
      confidence: 84
    },
    {
      code: "Z23",
      type: "ICD-10",
      category: "diagnoses",
      description: "Encounter for immunization",
      rationale: "Patient received influenza vaccination during visit",
      confidence: 95
    },
    {
      code: "M25.50",
      type: "ICD-10",
      category: "diagnoses",
      description: "Pain in unspecified joint",
      rationale: "Patient reports joint discomfort as secondary concern",
      confidence: 78
    },
    {
      code: "Viral URI vs Bacterial Sinusitis",
      type: "DIFFERENTIAL",
      category: "differentials", 
      description: "Primary differential diagnosis consideration",
      rationale: "85% confidence viral, 35% bacterial based on symptom pattern",
      confidence: 85
    }
  ])
  const [noteContent, setNoteContent] = useState("")

  const handleAddCode = (code: any) => {
    // Add to the addedCodes array for filtering suggestions
    setAddedCodes(prev => [...prev, code.code])
    
    // Use the category from the code if it exists, otherwise determine based on type
    let category = code.category || "codes"
    let updatedCodes = { ...selectedCodes }
    
    if (code.category) {
      // Code already has a category (from differentials)
      updatedCodes[code.category] = selectedCodes[code.category] + 1
    } else if (code.type === "CPT") {
      // CPT codes go to "codes" category
      category = "codes"
      updatedCodes.codes = selectedCodes.codes + 1
    } else if (code.type === "ICD-10") {
      // ICD-10 codes go to "diagnoses" category
      category = "diagnoses" 
      updatedCodes.diagnoses = selectedCodes.diagnoses + 1
    } else if (code.type === "PREVENTION") {
      // Prevention items go to "prevention" category
      category = "prevention"
      updatedCodes.prevention = selectedCodes.prevention + 1
    }
    
    // Update the selected codes count
    setSelectedCodes(updatedCodes)
    
    // Add to the selectedCodesList for displaying tiles
    const newCodeItem = {
      code: code.code,
      type: code.type,
      category: category,
      description: code.description,
      rationale: code.rationale,
      confidence: code.confidence,
      reimbursement: code.reimbursement || "N/A",
      rvu: code.rvu
    }
    
    setSelectedCodesList(prev => [...prev, newCodeItem])
  }

  const handleRemoveCode = (code: any, action: 'clear' | 'return', reasoning?: string) => {
    // Remove from selectedCodesList
    setSelectedCodesList(prev => prev.filter(item => item.code !== code.code))
    
    // Update counts when removing codes
    const updatedCodes = { ...selectedCodes }
    if (code.category && updatedCodes[code.category] > 0) {
      updatedCodes[code.category] = updatedCodes[code.category] - 1
    }
    setSelectedCodes(updatedCodes)
    
    if (action === 'return') {
      // Remove from addedCodes so it shows up in suggestions again
      setAddedCodes(prev => prev.filter(addedCode => addedCode !== code.code))
    }
    
    // Log the reasoning for AI learning (in a real app, this would be sent to a service)
    if (reasoning) {
      console.log(`Code ${code.code} removed with reasoning: ${reasoning}`)
    }
  }

  const handleChangeCategoryCode = (code: any, newCategory: 'diagnoses' | 'differentials') => {
    // Update the code's category in selectedCodesList
    setSelectedCodesList(prev => 
      prev.map(item => 
        item.code === code.code 
          ? { ...item, category: newCategory }
          : item
      )
    )
    
    // Update counts
    const updatedCodes = { ...selectedCodes }
    
    // Decrease count from old category
    if (code.category && updatedCodes[code.category] > 0) {
      updatedCodes[code.category] = updatedCodes[code.category] - 1
    }
    
    // Increase count for new category
    updatedCodes[newCategory] = updatedCodes[newCategory] + 1
    
    setSelectedCodes(updatedCodes)
  }

  const handleNavigate = (view: string) => {
    switch(view) {
      case 'home':
        setCurrentView('home')
        break
      case 'app':
        setCurrentView('app')
        break
      case 'analytics':
        setCurrentView('analytics')
        break
      case 'settings':
        setCurrentView('settings')
        break
      case 'activity':
        setCurrentView('activity')
        break
      case 'drafts':
        setCurrentView('drafts')
        break
      case 'schedule':
        setCurrentView('schedule')
        break
      case 'builder':
        setCurrentView('builder')
        break
      case 'style-guide':
        setCurrentView('style-guide')
        break
      case 'figma-library':
        setCurrentView('figma-library')
        break
      case 'finalization-demo':
        setCurrentView('finalization-demo')
        break
      default:
        console.log(`Navigate to ${view}`)
    }
  }

  const handleEditDraft = (draftId: string) => {
    console.log(`Editing draft: ${draftId}`)
    // In a real app, this would load the draft data and navigate to the editor
    setCurrentView('app')
  }

  const handleStartVisit = (patientId: string, encounterId: string) => {
    console.log(`Starting visit for patient ${patientId}, encounter ${encounterId}`)
    // Set the patient information to pre-populate in the note editor
    setPrePopulatedPatient({ patientId, encounterId })
    // Navigate to the documentation screen
    setCurrentView('app')
  }

  const handleUploadChart = (patientId: string) => {
    console.log(`Uploading chart for patient ${patientId}`)
    // In a real app, this would open the chart upload wizard
    // For now, we'll just log it - the wizard will be built later
    alert(`Chart upload wizard for patient ${patientId} will be implemented in the next phase.`)
  }

  // Calculate user's draft count for navigation badge
  const getUserDraftCount = () => {
    // This would typically come from an API call or state management
    // For demo purposes, using mock data from Drafts component
    const mockDrafts = [
      { provider: 'Dr. Johnson' },
      { provider: 'Dr. Smith' },
      { provider: 'NP Williams' },
      { provider: 'Dr. Johnson' },
      { provider: 'Dr. Brown' },
      { provider: 'NP Williams' },
      { provider: 'Dr. Smith' },
      { provider: 'Dr. Johnson' }
    ]
    return mockDrafts.filter(draft => draft.provider === currentUser.name).length
  }

  // Home Dashboard View
  if (currentView === 'home') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="home" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">RevenuePilot Dashboard</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('style-guide')}>
                    View Style Guide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <Dashboard onNavigate={handleNavigate} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Analytics View
  if (currentView === 'analytics') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="analytics" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Analytics Dashboard</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Admin Access' : 'User Access'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <Analytics userRole={userRole} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Activity Log View
  if (currentView === 'activity') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="activity" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Activity Log</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Administrator' : 'User'} Access
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('analytics')}>
                    Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('settings')}>
                    Settings
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <ActivityLog 
                  currentUser={currentUser}
                  userRole={userRole}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Settings View
  if (currentView === 'settings') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="settings" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Settings & Configuration</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Administrator' : 'User'} Access
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <Settings userRole={userRole} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Drafts View
  if (currentView === 'drafts') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="drafts" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Draft Notes Management</h1>
                  <Badge variant="outline" className="ml-2">
                    {getUserDraftCount()} My Drafts
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('app')}>
                    New Note
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <Drafts 
                  onEditDraft={handleEditDraft} 
                  currentUser={currentUser}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }


function AppShell() {
  const { status, checking, refresh } = useAuth()
  const { hydrated, actions } = useSession()

  if (checking) {
    return (
      <FullscreenMessage
        title="Signing you in"
        description="Checking your authentication status."
      />
    )
  }

  if (status !== "authenticated") {
    return (
      <FullscreenMessage
        title="Authentication required"
        description="Your session has ended. Please sign in again to continue."
        actionLabel="Retry"
        onAction={() => refresh()}
      />
    )
  }

  if (!hydrated) {
    return (
      <FullscreenMessage
        title="Preparing your workspace"
        description="Loading your session data and layout preferences."
        actionLabel="Reload"
        onAction={() => actions.refresh()}
      />
    )
  }

  return <ProtectedApp />
}

  return (
    <>
      <AuthProvider>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </AuthProvider>

      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar
              currentView="app"
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />

            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Clinical Documentation Assistant</h1>
                  <Badge variant="outline" className="ml-2">
                    Active Session
                  </Badge>
                  {prePopulatedPatient && (
                    <Badge variant="secondary" className="ml-2">
                      Patient: {prePopulatedPatient.patientId}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('analytics')}>
                    Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('settings')}>
                    Settings
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('drafts')}>
                    Drafts
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('schedule')}>
                    Schedule
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('activity')}>
                    Activity Log
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('style-guide')}>
                    Style Guide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>

              <ResizablePanelGroup direction="horizontal" className="flex-1">
                <ResizablePanel defaultSize={70} minSize={50}>
                  <div className="flex flex-col h-full">
                    <NoteEditor
                      prePopulatedPatient={prePopulatedPatient}
                      selectedCodes={selectedCodes}
                      selectedCodesList={selectedCodesList}
                      onNoteContentChange={setNoteContent}
                    />
                    <SelectedCodesBar
                      selectedCodes={selectedCodes}
                      onUpdateCodes={setSelectedCodes}
                      selectedCodesList={selectedCodesList}
                      onRemoveCode={handleRemoveCode}
                      onChangeCategoryCode={handleChangeCategoryCode}
                    />
                  </div>
                </ResizablePanel>

                {isSuggestionPanelOpen && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={30} minSize={25} maxSize={40}>
                      <SuggestionPanel
                        onClose={() => setIsSuggestionPanelOpen(false)}
                        selectedCodes={selectedCodes}
                        onUpdateCodes={setSelectedCodes}
                        onAddCode={handleAddCode}
                        addedCodes={addedCodes}
                        noteContent={noteContent}
                        selectedCodesList={selectedCodesList}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>

              {!isSuggestionPanelOpen && (
                <button
                  onClick={() => setIsSuggestionPanelOpen(true)}
                  className="fixed right-4 top-4 p-2 bg-primary text-primary-foreground rounded-md shadow-md"
                >
                  Show Suggestions
                </button>
              )}
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </>
  )
}
