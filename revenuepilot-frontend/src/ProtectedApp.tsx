import { useCallback, useEffect, useMemo, useState } from "react"
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { TooltipProvider } from "./components/ui/tooltip"
import { NavigationSidebar } from "./components/NavigationSidebar"
import { Dashboard } from "./components/Dashboard"
import { Analytics } from "./components/Analytics"
import { Settings } from "./components/Settings"
import { ActivityLog } from "./components/ActivityLog"
import { Drafts } from "./components/Drafts"
import { Schedule } from "./components/Schedule"
import { Builder } from "./components/Builder"
import { NoteEditor } from "./components/NoteEditor"
import { SuggestionPanel } from "./components/SuggestionPanel"
import { SelectedCodesBar } from "./components/SelectedCodesBar"
import { StyleGuide } from "./components/StyleGuide"
import { FigmaComponentLibrary } from "./components/FigmaComponentLibrary"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable"
import { Button } from "./components/ui/button"
import { Badge } from "./components/ui/badge"
import { useAuth } from "./contexts/AuthContext"
import { useSession } from "./contexts/SessionContext"
import type { SessionCode, SuggestionCodeInput } from "./contexts/SessionContext"

type ViewKey =
  | "home"
  | "app"
  | "analytics"
  | "settings"
  | "activity"
  | "drafts"
  | "schedule"
  | "builder"
  | "style-guide"
  | "figma-library"

const VIEW_PERMISSIONS: Partial<Record<ViewKey, string>> = {
  analytics: "view:analytics",
  settings: "manage:settings",
  activity: "view:activity-log",
  drafts: "view:drafts",
  schedule: "view:schedule",
  builder: "manage:builder",
  "figma-library": "view:design-library"
}

const VIEW_LABELS: Record<ViewKey, string> = {
  home: "Home",
  app: "Documentation",
  analytics: "Analytics",
  settings: "Settings",
  activity: "Activity Log",
  drafts: "Drafts",
  schedule: "Schedule",
  builder: "Builder",
  "style-guide": "Style Guide",
  "figma-library": "Figma Library"
}

export function ProtectedApp() {
  const auth = useAuth()
  const {
    state: sessionState,
    actions: sessionActions,
    hydrated: sessionHydrated,
    syncing: sessionSyncing
  } = useSession()

  const [currentView, setCurrentView] = useState<ViewKey>('home')
  const [prePopulatedPatient, setPrePopulatedPatient] = useState<{
    patientId: string
    encounterId: string
  } | null>(null)
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null)

  const userRole = (auth.user?.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user'

  const currentUser = useMemo(
    () => ({
      id: auth.user?.id ?? 'user-unknown',
      name:
        typeof auth.user?.name === 'string' && auth.user.name.trim().length > 0
          ? auth.user.name
          : typeof auth.user?.fullName === 'string' && auth.user.fullName.trim().length > 0
            ? auth.user.fullName
            : 'Clinician',
      fullName:
        typeof auth.user?.fullName === 'string' && auth.user.fullName.trim().length > 0
          ? auth.user.fullName
          : typeof auth.user?.name === 'string' && auth.user.name.trim().length > 0
            ? auth.user.name
            : 'Clinician',
      role: userRole,
      specialty:
        typeof auth.user?.specialty === 'string' && auth.user.specialty.trim().length > 0
          ? auth.user.specialty
          : 'General Medicine'
    }),
    [auth.user, userRole]
  )

  const { selectedCodes, selectedCodesList, addedCodes, isSuggestionPanelOpen, layout } = sessionState

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

  const canAccessView = useCallback(
    (view: ViewKey) => {
      const permission = VIEW_PERMISSIONS[view]
      if (!permission) return true
      return auth.hasPermission(permission)
    },
    [auth]
  )

  useEffect(() => {
    if (!canAccessView(currentView)) {
      setCurrentView('home')
    }
  }, [currentView, canAccessView])

  useEffect(() => {
    if (!accessDeniedMessage) {
      return
    }
    const timer = window.setTimeout(() => setAccessDeniedMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [accessDeniedMessage])

  const handleNavigate = useCallback(
    (view: ViewKey) => {
      if (!canAccessView(view)) {
        setAccessDeniedMessage(`You do not have permission to access ${VIEW_LABELS[view] ?? view}.`)
        return
      }
      setCurrentView(view)
    },
    [canAccessView]
  )

  const accessMessage = accessDeniedMessage ? (
    <div className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      {accessDeniedMessage}
    </div>
  ) : null

  const handleAddCode = useCallback(
    (code: SuggestionCodeInput | SessionCode) => {
      sessionActions.addCode(code)
    },
    [sessionActions]
  )

  const handleRemoveCode = useCallback(
    (code: SessionCode, action: 'clear' | 'return', reasoning?: string) => {
      sessionActions.removeCode(code, {
        returnToSuggestions: action === 'return',
        reasoning
      })
    },
    [sessionActions]
  )

  const handleChangeCategoryCode = useCallback(
    (code: SessionCode, newCategory: 'diagnoses' | 'differentials') => {
      sessionActions.changeCodeCategory(code, newCategory)
    },
    [sessionActions]
  )

  const handleLayoutChange = useCallback(
    (sizes: number[]) => {
      if (!Array.isArray(sizes) || sizes.length === 0) {
        return
      }
      sessionActions.setLayout({
        noteEditor: typeof sizes[0] === 'number' ? sizes[0] : layout.noteEditor,
        suggestionPanel: typeof sizes[1] === 'number' ? sizes[1] : layout.suggestionPanel
      })
    },
    [sessionActions, layout.noteEditor, layout.suggestionPanel]
  )

  if (!sessionHydrated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    )
  }

  const handleEditDraft = (draftId: string) => {
    console.log(`Editing draft: ${draftId}`)
    // In a real app, this would load the draft data and navigate to the editor
    handleNavigate('app')
  }

  const handleStartVisit = (patientId: string, encounterId: string) => {
    console.log(`Starting visit for patient ${patientId}, encounter ${encounterId}`)
    // Set the patient information to pre-populate in the note editor
    setPrePopulatedPatient({ patientId, encounterId })
    // Navigate to the documentation screen
    handleNavigate('app')
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
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                    View Style Guide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>
              
              {accessMessage}

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
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

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
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('analytics')}>
                    Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('settings')}>
                    Settings
                  </Button>
                </div>
              </div>
              
              {accessMessage}

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
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

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
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    New Note
                  </Button>
                </div>
              </div>
              
              {accessMessage}

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

  // Schedule View
  if (currentView === 'schedule') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="schedule" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Patient Schedule</h1>
                  <Badge variant="outline" className="ml-2">
                    Today's Appointments
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('drafts')}>
                    Drafts
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('activity')}>
                    Activity Log
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Schedule
                  currentUser={currentUser}
                  onStartVisit={handleStartVisit}
                  onUploadChart={handleUploadChart}
                  appointments={sharedAppointments}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Builder View
  if (currentView === 'builder') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="builder" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Schedule Builder</h1>
                  <Badge variant="outline" className="ml-2">
                    Template Creator
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('schedule')}>
                    Schedule
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Builder
                  currentUser={currentUser}
                  appointments={sharedAppointments}
                  onAppointmentsChange={setSharedAppointments}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Style Guide View
  if (currentView === 'style-guide') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="style-guide" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">RevenuePilot Design System</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Back to Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <StyleGuide />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Figma Library View
  if (currentView === 'figma-library') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="figma-library" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Figma Component Library</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Back to Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                    Style Guide
                  </Button>
                </div>
              </div>
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <FigmaComponentLibrary />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Main App View (Documentation Editor)
  return (
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
                <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                  Dashboard
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('analytics')}>
                  Analytics
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('settings')}>
                  Settings
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('drafts')}>
                  Drafts
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('schedule')}>
                  Schedule
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('activity')}>
                  Activity Log
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                  Style Guide
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                  Figma Library
                </Button>
                {sessionSyncing && (
                  <Badge variant="outline" className="text-xs">
                    Syncing…
                  </Badge>
                )}
              </div>
            </div>

            {accessMessage}

            <ResizablePanelGroup
              direction="horizontal"
              className="flex-1"
              onLayout={handleLayoutChange}
            >
              <ResizablePanel defaultSize={layout.noteEditor} minSize={50}>
                <div className="flex flex-col h-full">
                  <NoteEditor
                    prePopulatedPatient={prePopulatedPatient}
                    selectedCodes={selectedCodes}
                    selectedCodesList={selectedCodesList}
                  />
                  <SelectedCodesBar
                    selectedCodes={selectedCodes}
                    onUpdateCodes={() => undefined}
                    selectedCodesList={selectedCodesList}
                    onRemoveCode={handleRemoveCode}
                    onChangeCategoryCode={handleChangeCategoryCode}
                  />
                </div>
              </ResizablePanel>

              {isSuggestionPanelOpen && (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={layout.suggestionPanel} minSize={25} maxSize={40}>
                    <SuggestionPanel
                      onClose={() => sessionActions.setSuggestionPanelOpen(false)}
                      selectedCodes={selectedCodes}
                      onUpdateCodes={() => undefined}
                      onAddCode={handleAddCode}
                      addedCodes={addedCodes}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>

            {!isSuggestionPanelOpen && (
              <button
                onClick={() => sessionActions.setSuggestionPanelOpen(true)}
                className="fixed right-4 top-4 p-2 bg-primary text-primary-foreground rounded-md shadow-md"
              >
                Show Suggestions
              </button>
            )}
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  )
}