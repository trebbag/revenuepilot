import { useEffect, useState } from "react"
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
  Key,
  Loader2,
  RefreshCcw,
} from "lucide-react"
import { DateRange } from "react-day-picker"

import { useActivityLog } from "../hooks/useActivityLog"
import type { ActivityEntry } from "../hooks/useActivityLog"

interface ActivityLogProps {
  currentUser: {
    id: string
    name: string
    fullName: string
    role: "admin" | "user"
    specialty: string
  }
  userRole: "admin" | "user"
}

export function ActivityLog({ currentUser, userRole }: ActivityLogProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!showAdvanced && selectedCategory === "backend") {
      setSelectedCategory("all")
    }
  }, [showAdvanced, selectedCategory])

  const { entries, rawEntries, loading, error, refresh } = useActivityLog({
    dateRange,
    category: selectedCategory,
    severity: selectedSeverity,
    search: searchQuery,
    includeBackend: showAdvanced,
  })

  const getCategoryIcon = (category: ActivityEntry["category"]) => {
    switch (category) {
      case "documentation":
        return <FileText className="w-4 h-4" />
      case "schedule":
        return <Calendar className="w-4 h-4" />
      case "settings":
        return <Settings className="w-4 h-4" />
      case "auth":
        return <Shield className="w-4 h-4" />
      case "system":
        return <Activity className="w-4 h-4" />
      case "backend":
        return <Server className="w-4 h-4" />
      default:
        return <Activity className="w-4 h-4" />
    }
  }

  const getCategoryColor = (category: ActivityEntry["category"]) => {
    switch (category) {
      case "documentation":
        return "text-blue-600 bg-blue-50 border-blue-200"
      case "schedule":
        return "text-purple-600 bg-purple-50 border-purple-200"
      case "settings":
        return "text-gray-600 bg-gray-50 border-gray-200"
      case "auth":
        return "text-green-600 bg-green-50 border-green-200"
      case "system":
        return "text-orange-600 bg-orange-50 border-orange-200"
      case "backend":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getSeverityIcon = (severity: ActivityEntry["severity"]) => {
    switch (severity) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-600" />
      default:
        return <Activity className="w-4 h-4 text-blue-600" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return "Just now"
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
          {userRole === "admin" && (
            <Button variant={showAdvanced ? "default" : "outline"} size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2">
              {showAdvanced ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showAdvanced ? "Hide Backend Activity" : "Show Backend Activity"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => {
              void refresh()
            }}
            disabled={loading}
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
                <Input placeholder="Search activities..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
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
              <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
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
              <Badge variant="secondary">{entries.length} entries</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-600">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Auto-refreshes every 60 seconds
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-stone-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Refreshing</span>
                </div>
              )}
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
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div className="space-y-3">
                      <p className="text-sm text-red-700">{error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void refresh()
                        }}
                        className="flex items-center gap-2"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Retry
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {loading && rawEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-stone-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>Loading activity log...</p>
                </div>
              )}

              {!loading && !error && rawEntries.length === 0 && (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-500">No activity has been recorded yet.</p>
                </div>
              )}

              {!loading && !error && rawEntries.length > 0 && entries.length === 0 && (
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
              )}

              {entries.length > 0 && (
                <div className="space-y-1">
                  {loading && (
                    <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Refreshing activity…</span>
                    </div>
                  )}
                  {entries.map((activity, index) => (
                    <div key={activity.id}>
                      <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-stone-50 transition-colors">
                        <div className="flex-shrink-0">{getSeverityIcon(activity.severity)}</div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <h4 className="font-medium text-stone-900">{activity.action}</h4>
                              <Badge variant="outline" className={`text-xs px-2 py-1 border ${getCategoryColor(activity.category)}`}>
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
                              {activity.userId === currentUser.id && (
                                <Badge variant="outline" className="ml-2 bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
                                  You
                                </Badge>
                              )}
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
                      {index < entries.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
