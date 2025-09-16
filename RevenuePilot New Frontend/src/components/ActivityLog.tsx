import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { DatePickerWithRange } from "./ui/date-picker-with-range"
import { ScrollArea } from "./ui/scroll-area"
import { Separator } from "./ui/separator"
import { 
  Activity, 
  FileText, 
  Calendar, 
  Settings, 
  User, 
  Database, 
  Shield, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Download,
  Search,
  Eye,
  EyeOff,
  Server,
  Key
} from "lucide-react"
import { DateRange } from "react-day-picker"

interface ActivityLogProps {
  currentUser: {
    id: string
    name: string
    fullName: string
    role: 'admin' | 'user'
    specialty: string
  }
  userRole: 'admin' | 'user'
}

interface ActivityEntry {
  id: string
  timestamp: string
  action: string
  category: 'documentation' | 'schedule' | 'settings' | 'auth' | 'system' | 'backend'
  description: string
  userId: string
  userName: string
  severity: 'info' | 'warning' | 'error' | 'success'
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
}

export function ActivityLog({ currentUser, userRole }: ActivityLogProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Mock activity data - in a real app, this would come from an API
  const generateMockActivity = (): ActivityEntry[] => {
    const baseActivities: ActivityEntry[] = [
      {
        id: "act-001",
        timestamp: "2024-03-14T15:30:22Z",
        action: "Note Created",
        category: "documentation",
        description: "Created new SOAP note for patient PT-2024-0156",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "success",
        details: { patientId: "PT-2024-0156", noteType: "SOAP", template: "Wellness Visit" }
      },
      {
        id: "act-002",
        timestamp: "2024-03-14T15:28:15Z",
        action: "Code Added",
        category: "documentation", 
        description: "Added CPT code 99213 to active note",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "info",
        details: { code: "99213", codeType: "CPT", confidence: 87 }
      },
      {
        id: "act-003",
        timestamp: "2024-03-14T15:25:44Z",
        action: "Visit Started",
        category: "schedule",
        description: "Started documentation for scheduled appointment",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "info",
        details: { appointmentId: "apt-001", patientId: "PT-2024-0156" }
      },
      {
        id: "act-004",
        timestamp: "2024-03-14T14:45:33Z",
        action: "Settings Updated",
        category: "settings",
        description: "Updated AI suggestion preferences",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "info",
        details: { section: "AI Preferences", changes: ["Auto-suggest enabled", "Confidence threshold: 80%"] }
      },
      {
        id: "act-005",
        timestamp: "2024-03-14T14:22:17Z",
        action: "Draft Saved",
        category: "documentation",
        description: "Auto-saved draft note for patient PT-2024-0143",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "success",
        details: { draftId: "draft-015", patientId: "PT-2024-0143", autoSave: true }
      },
      {
        id: "act-006",
        timestamp: "2024-03-14T13:55:28Z",
        action: "Login",
        category: "auth",
        description: "User successfully logged into the system",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "success",
        details: { loginMethod: "password", sessionId: "sess-abc123" },
        ipAddress: "192.168.1.45",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      {
        id: "act-007",
        timestamp: "2024-03-14T13:18:45Z",
        action: "Schedule Updated",
        category: "schedule",
        description: "Modified appointment time for patient PT-2024-0089",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "info",
        details: { appointmentId: "apt-003", oldTime: "10:00", newTime: "10:15" }
      },
      {
        id: "act-008",
        timestamp: "2024-03-14T12:35:12Z",
        action: "Analytics Viewed",
        category: "system",
        description: "Accessed performance analytics dashboard",
        userId: currentUser.id,
        userName: currentUser.name,
        severity: "info",
        details: { section: "Performance Metrics", duration: "5 minutes" }
      }
    ]

    // Add backend activities for admin view
    const backendActivities: ActivityEntry[] = [
      {
        id: "back-001",
        timestamp: "2024-03-14T15:30:25Z",
        action: "Database Write",
        category: "backend",
        description: "Note data persisted to primary database",
        userId: "system",
        userName: "System",
        severity: "success",
        details: { operation: "INSERT", table: "clinical_notes", rows: 1, duration: "45ms" }
      },
      {
        id: "back-002",
        timestamp: "2024-03-14T15:28:18Z",
        action: "AI API Call",
        category: "backend",
        description: "Code suggestion request processed",
        userId: "system",
        userName: "AI Service",
        severity: "success",
        details: { endpoint: "/api/codes/suggest", responseTime: "234ms", tokens: 1250 }
      },
      {
        id: "back-003",
        timestamp: "2024-03-14T15:25:47Z",
        action: "Cache Update",
        category: "backend",
        description: "Patient data cache refreshed",
        userId: "system",
        userName: "Cache Service",
        severity: "info",
        details: { cacheKey: "patient:PT-2024-0156", ttl: "30 minutes" }
      },
      {
        id: "back-004",
        timestamp: "2024-03-14T14:45:36Z",
        action: "Config Update",
        category: "backend",
        description: "User preferences updated in configuration store",
        userId: "system",
        userName: "Config Service",
        severity: "success",
        details: { configPath: "/users/user-001/preferences", changeCount: 2 }
      },
      {
        id: "back-005",
        timestamp: "2024-03-14T14:22:20Z",
        action: "Backup Created",
        category: "backend",
        description: "Automated backup of draft note data",
        userId: "system",
        userName: "Backup Service",
        severity: "success",
        details: { backupId: "bk-20240314-142220", size: "2.3MB", location: "s3://backups/" }
      },
      {
        id: "back-006",
        timestamp: "2024-03-14T13:55:31Z",
        action: "Auth Token",
        category: "backend",
        description: "JWT token generated and stored",
        userId: "system",
        userName: "Auth Service", 
        severity: "success",
        details: { tokenType: "access", expiresIn: "8 hours", algorithm: "RS256" }
      },
      {
        id: "back-007",
        timestamp: "2024-03-14T13:18:48Z",
        action: "Queue Message",
        category: "backend",
        description: "Schedule update event queued for processing",
        userId: "system",
        userName: "Message Queue",
        severity: "info",
        details: { queue: "schedule-updates", messageId: "msg-789", delay: "0ms" }
      },
      {
        id: "back-008",
        timestamp: "2024-03-14T12:35:15Z",
        action: "Metrics Export",
        category: "backend",
        description: "Analytics data exported to metrics collector",
        userId: "system",
        userName: "Metrics Service",
        severity: "info",
        details: { metricsCount: 47, exportFormat: "JSON", destination: "monitoring" }
      }
    ]

    return showAdvanced ? [...baseActivities, ...backendActivities] : baseActivities
  }

  const mockActivities = generateMockActivity()

  // Filter activities based on current filters
  const filteredActivities = mockActivities.filter(activity => {
    if (selectedCategory !== "all" && activity.category !== selectedCategory) {
      return false
    }
    if (selectedSeverity !== "all" && activity.severity !== selectedSeverity) {
      return false
    }
    if (searchQuery && !activity.description.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !activity.action.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'documentation': return <FileText className="w-4 h-4" />
      case 'schedule': return <Calendar className="w-4 h-4" />
      case 'settings': return <Settings className="w-4 h-4" />
      case 'auth': return <Shield className="w-4 h-4" />
      case 'system': return <Activity className="w-4 h-4" />
      case 'backend': return <Server className="w-4 h-4" />
      default: return <Activity className="w-4 h-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'documentation': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'schedule': return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'settings': return 'text-gray-600 bg-gray-50 border-gray-200'
      case 'auth': return 'text-green-600 bg-green-50 border-green-200'
      case 'system': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'backend': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-600" />
      default: return <Activity className="w-4 h-4 text-blue-600" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return "Just now"
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-stone-900">Activity Log</h1>
          <p className="text-stone-600 mt-1">Track system activity and user actions</p>
        </div>
        <div className="flex items-center gap-3">
          {userRole === 'admin' && (
            <Button
              variant={showAdvanced ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2"
            >
              {showAdvanced ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showAdvanced ? "Hide Backend Activity" : "Show Backend Activity"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Log
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <CardTitle className="text-lg">Filters</CardTitle>
          </div>
          <CardDescription>Filter activity log entries by date, category, or severity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="documentation">Documentation</SelectItem>
                  <SelectItem value="schedule">Schedule</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="auth">Authentication</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  {showAdvanced && <SelectItem value="backend">Backend</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Severity</label>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger>
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Date Range</label>
              <DatePickerWithRange
                date={dateRange}
                onDateChange={setDateRange}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <Badge variant="secondary">{filteredActivities.length} entries</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <Clock className="w-4 h-4" />
              Auto-refreshes every 30 seconds
            </div>
          </div>
          {showAdvanced && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <Key className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700 font-medium">Admin Mode Active</span>
              <span className="text-sm text-red-600">- Backend system activities are now visible</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="space-y-1 p-6 pt-0">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-500">No activities match your current filters</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => {
                      setSelectedCategory("all")
                      setSelectedSeverity("all")
                      setSearchQuery("")
                      setDateRange(undefined)
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              ) : (
                filteredActivities.map((activity, index) => (
                  <div key={activity.id}>
                    <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-stone-50 transition-colors">
                      <div className="flex-shrink-0">
                        {getSeverityIcon(activity.severity)}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <h4 className="font-medium text-stone-900">{activity.action}</h4>
                            <Badge 
                              variant="outline" 
                              className={`text-xs px-2 py-1 border ${getCategoryColor(activity.category)}`}
                            >
                              <span className="flex items-center gap-1">
                                {getCategoryIcon(activity.category)}
                                {activity.category}
                              </span>
                            </Badge>
                            {activity.userId === "system" && (
                              <Badge variant="outline" className="text-xs px-2 py-1 bg-gray-100 border-gray-200">
                                System
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-stone-500 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(activity.timestamp)}
                          </div>
                        </div>
                        
                        <p className="text-stone-600 text-sm leading-relaxed">{activity.description}</p>
                        
                        <div className="flex items-center gap-4 text-xs text-stone-500">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {activity.userName}
                          </div>
                          {activity.ipAddress && (
                            <div className="flex items-center gap-1">
                              <span>IP:</span>
                              <code className="bg-stone-100 px-1 rounded text-xs">{activity.ipAddress}</code>
                            </div>
                          )}
                          {activity.details && (
                            <div className="flex items-center gap-1">
                              <span>•</span>
                              <span>{Object.keys(activity.details).length} details</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {index < filteredActivities.length - 1 && <Separator className="my-1" />}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}