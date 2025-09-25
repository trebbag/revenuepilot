import { useCallback, useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Plus,
  Users,
  User,
  Clock,
  MapPin,
  Phone,
  Mail,
  FileText,
  Upload,
  Search,
  Grid3x3,
  List,
  Edit3,
  Trash2,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  Copy,
  Settings,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Avatar, AvatarFallback } from "./ui/avatar"
import { Separator } from "./ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Switch } from "./ui/switch"
import { Alert, AlertDescription } from "./ui/alert"
import { useChartUpload, useUploadStatuses } from "../hooks/useChartUpload"
import { useContextStage } from "../hooks/useContextStage"
import { createAppointment } from "@core/api-client"

interface CurrentUser {
  id: string
  name: string
  fullName: string
  role: "admin" | "user"
  specialty: string
}

interface AppointmentTemplate {
  id: string
  patientId: string
  encounterId: string
  patientName: string
  patientPhone: string
  patientEmail: string
  appointmentTime: string
  duration: number
  appointmentType: "Wellness" | "Follow-up" | "New Patient" | "Urgent" | "Consultation"
  provider: string
  location: string
  status: "Scheduled" | "Checked In" | "In Progress" | "Completed" | "No Show" | "Cancelled"
  notes?: string
  priority: "low" | "medium" | "high"
  isVirtual: boolean
  fileUpToDate: boolean
  // Extended fields for builder
  patientDOB?: string
  patientAddress?: string
  hasChart?: boolean
  chartFiles?: string[]
  chartCorrelationId?: string | null
  medicalHistory?: string
  currentMedications?: string
  allergies?: string
  chiefComplaint?: string
  insuranceInfo?: string
  referralNotes?: string
}

interface BuilderProps {
  currentUser?: CurrentUser
  appointments?: AppointmentTemplate[]
  onAppointmentsChange?: (appointments: AppointmentTemplate[]) => void
  onScheduleRefresh?: () => void
  onOpenChartContext?: (patientId: string, options?: { patientName?: string | null }) => void
}

export function Builder({ currentUser, appointments: propAppointments, onAppointmentsChange, onScheduleRefresh, onOpenChartContext }: BuilderProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"day" | "week">("day")
  const [selectedProvider, setSelectedProvider] = useState(currentUser?.name || "Dr. Johnson")
  const [calendarView, setCalendarView] = useState<"grid" | "list">("grid")
  const [showNewAppointmentDialog, setShowNewAppointmentDialog] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<AppointmentTemplate | null>(null)
  const uploadStatuses = useUploadStatuses()
  const { openFilePickerAndUpload } = useChartUpload()
  const [creatingAppointment, setCreatingAppointment] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Available providers
  const providers = ["Dr. Johnson", "Dr. Smith", "NP Williams", "Dr. Brown"]

  // Use appointments from props or empty array, convert to AppointmentTemplate format
  const appointmentTemplates = propAppointments || []

  const setAppointmentTemplates = (appointments: AppointmentTemplate[]) => {
    onAppointmentsChange?.(appointments)
  }

  const buildDefaultAppointment = useCallback(
    (): Partial<AppointmentTemplate> => ({
      patientId: "",
      encounterId: "",
      patientName: "",
      patientPhone: "",
      patientEmail: "",
      patientDOB: "",
      patientAddress: "",
      appointmentTime: "",
      duration: 30,
      appointmentType: "New Patient",
      provider: selectedProvider,
      location: "Room 101",
      status: "Scheduled",
      notes: "",
      priority: "medium",
      isVirtual: false,
      hasChart: false,
      chartFiles: [],
      chartCorrelationId: null,
      medicalHistory: "",
      currentMedications: "",
      allergies: "",
      chiefComplaint: "",
      insuranceInfo: "",
      referralNotes: "",
    }),
    [selectedProvider],
  )

  const [newAppointment, setNewAppointment] = useState<Partial<AppointmentTemplate>>(() => buildDefaultAppointment())

  const patientIdForContext = (editingAppointment?.patientId || newAppointment.patientId || "").trim()
  const contextStageState = useContextStage(null, { patientId: patientIdForContext || undefined })
  const contextStageDisplay = useMemo(() => {
    const stages: Record<string, string> = {}
    ;(["superficial", "deep", "indexed"] as const).forEach((stage) => {
      const info = contextStageState.stages[stage]
      if (!info || !info.state) {
        stages[stage] = "⧗"
      } else if (info.state === "completed") {
        stages[stage] = "✓"
      } else if (info.state === "running") {
        const pct = Number.isFinite(info.percent) ? Math.round((info.percent ?? 0) as number) : null
        stages[stage] = pct != null ? `${pct}%` : "…"
      } else if (info.state === "failed") {
        stages[stage] = "⚠"
      } else {
        stages[stage] = "⧗"
      }
    })
    return stages
  }, [contextStageState.stages])

  const uploadStatusForPatient = patientIdForContext ? uploadStatuses[patientIdForContext] : undefined
  const currentChartFiles = editingAppointment?.chartFiles ?? newAppointment.chartFiles ?? []
  const uploadStatusMessage = useMemo(() => {
    if (!uploadStatusForPatient) {
      return null
    }
    if (uploadStatusForPatient.status === "uploading") {
      return uploadStatusForPatient.progress != null
        ? `Uploading ${uploadStatusForPatient.progress}%…`
        : "Uploading…"
    }
    if (uploadStatusForPatient.status === "error") {
      return uploadStatusForPatient.error ?? "Upload failed"
    }
    if (uploadStatusForPatient.status === "success") {
      return `Uploaded ${uploadStatusForPatient.fileName ?? "chart"}.`
    }
    return null
  }, [uploadStatusForPatient])

  // New appointment form state
  // Filter appointments based on current filters and view mode
  const filteredAppointments = useMemo(() => {
    return appointmentTemplates.filter((apt) => {
      const matchesProvider = selectedProvider === "All Providers" || apt.provider === selectedProvider

      // Date filtering based on view mode
      const aptDate = new Date(apt.appointmentTime)
      const today = new Date(currentDate)

      let matchesDateRange = true
      if (viewMode === "day") {
        matchesDateRange = aptDate.toDateString() === today.toDateString()
      } else if (viewMode === "week") {
        const startOfWeek = new Date(today)
        const dayOfWeek = startOfWeek.getDay()
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        matchesDateRange = aptDate >= startOfWeek && aptDate <= endOfWeek
      }

      return matchesProvider && matchesDateRange
    })
  }, [appointmentTemplates, selectedProvider, currentDate, viewMode])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Scheduled":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "Checked In":
        return "bg-green-100 text-green-700 border-green-200"
      case "In Progress":
        return "bg-purple-100 text-purple-700 border-purple-200"
      case "Completed":
        return "bg-slate-100 text-slate-700 border-slate-200"
      case "No Show":
        return "bg-red-100 text-red-700 border-red-200"
      case "Cancelled":
        return "bg-orange-100 text-orange-700 border-orange-200"
      default:
        return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const getAppointmentTypeColor = (type: string) => {
    switch (type) {
      case "Wellness":
        return "bg-green-50 text-green-700 border-green-200"
      case "Follow-up":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "New Patient":
        return "bg-purple-50 text-purple-700 border-purple-200"
      case "Urgent":
        return "bg-red-50 text-red-700 border-red-200"
      case "Consultation":
        return "bg-orange-50 text-orange-700 border-orange-200"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-l-red-500"
      case "medium":
        return "border-l-yellow-500"
      case "low":
        return "border-l-green-500"
      default:
        return "border-l-slate-300"
    }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Navigation functions
  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate)
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1))
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7))
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const handleCreateAppointment = useCallback(async () => {
    setCreateError(null)

    if (editingAppointment) {
      setAppointmentTemplates((prev) => prev.map((apt) => (apt.id === editingAppointment.id ? editingAppointment : apt)))
      setEditingAppointment(null)
      setShowNewAppointmentDialog(false)
      return
    }

    const patientName = newAppointment.patientName?.trim()
    if (!patientName) {
      setCreateError("Patient name is required.")
      return
    }

    const appointmentTime = newAppointment.appointmentTime
    if (!appointmentTime) {
      setCreateError("Appointment date and time are required.")
      return
    }

    const start = new Date(appointmentTime)
    if (Number.isNaN(start.getTime())) {
      setCreateError("Invalid appointment date or time.")
      return
    }

    const durationMinutes = Number.isFinite(newAppointment.duration) ? Number(newAppointment.duration) : 30
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
    const patientId = (newAppointment.patientId || "").trim() || patientName
    const encounterId = newAppointment.encounterId?.trim() || undefined
    const reason =
      newAppointment.chiefComplaint?.trim() || newAppointment.notes?.trim() || newAppointment.appointmentType || "Scheduled visit"
    const chartCorrelationId = newAppointment.chartCorrelationId || null

    setCreatingAppointment(true)
    try {
      await createAppointment({
        patient: patientName,
        patientId,
        encounterId,
        reason,
        start: start.toISOString(),
        end: end.toISOString(),
        provider: (newAppointment.provider || selectedProvider || "").trim() || undefined,
        location: newAppointment.location?.trim() || undefined,
        notes: newAppointment.notes?.trim() || reason,
        type: newAppointment.appointmentType,
        chart: chartCorrelationId ? { correlationId: chartCorrelationId } : undefined,
      })

      setNewAppointment(buildDefaultAppointment())
      setShowNewAppointmentDialog(false)
      setCreateError(null)
      setCreatingAppointment(false)
      setEditingAppointment(null)
      onScheduleRefresh?.()
    } catch (error) {
      setCreatingAppointment(false)
      setCreateError(error instanceof Error ? error.message : "Unable to create appointment.")
    }
  }, [
    buildDefaultAppointment,
    editingAppointment,
    newAppointment.appointmentTime,
    newAppointment.appointmentType,
    newAppointment.chartCorrelationId,
    newAppointment.chiefComplaint,
    newAppointment.encounterId,
    newAppointment.location,
    newAppointment.notes,
    newAppointment.patientId,
    newAppointment.patientName,
    newAppointment.duration,
    newAppointment.provider,
    onScheduleRefresh,
    selectedProvider,
    setAppointmentTemplates,
  ])

  const handleDeleteAppointment = (appointmentId: string) => {
    setAppointmentTemplates((prev) => prev.filter((apt) => apt.id !== appointmentId))
  }

  const handleDuplicateAppointment = (appointment: AppointmentTemplate) => {
    const newId = `template-${Date.now()}`
    const newAppointment = {
      ...appointment,
      id: newId,
      patientName: `${appointment.patientName} (Copy)`,
      appointmentTime: new Date(new Date(appointment.appointmentTime).getTime() + 60 * 60 * 1000).toISOString(), // Add 1 hour
    }
    setAppointmentTemplates((prev) => [...prev, newAppointment])
  }

  const generateTimeSlots = () => {
    const slots = []
    for (let hour = 8; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
        slots.push(time)
      }
    }
    return slots
  }

  const generateWeekDays = () => {
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    const diff = startOfWeek.getDate() - day
    startOfWeek.setDate(diff)

    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      days.push(date)
    }
    return days
  }

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toDateString()
    return filteredAppointments.filter((apt) => {
      const aptDate = new Date(apt.appointmentTime)
      return aptDate.toDateString() === dateStr
    })
  }

  const getAppointmentsForTimeSlot = (date: Date, timeSlot: string) => {
    const [hour, minute] = timeSlot.split(":").map(Number)
    return getAppointmentsForDate(date).filter((apt) => {
      const aptDate = new Date(apt.appointmentTime)
      const aptHour = aptDate.getHours()
      const aptMinute = aptDate.getMinutes()
      return aptHour === hour && aptMinute === minute
    })
  }

  // Appointment Card Component
  const AppointmentCard = ({ appointment, compact = false }: { appointment: AppointmentTemplate; compact?: boolean }) => {
    const uploadState = appointment.patientId ? uploadStatuses[appointment.patientId] : undefined
    const isUploading = uploadState?.status === "uploading"
    const uploadStatusLabel = uploadState
      ? uploadState.status === "uploading"
        ? `Uploading ${uploadState.progress ?? 0}%…`
        : uploadState.status === "error"
          ? uploadState.error ?? "Upload failed"
          : uploadState.status === "success"
            ? `Uploaded ${uploadState.fileName ?? "chart"}.`
            : null
      : null

    return (
      <Card
        className={`hover:shadow-lg transition-all duration-300 cursor-pointer bg-white border-2 border-stone-100/50 hover:border-stone-200/70 shadow-md hover:bg-stone-50/30 border-l-4 ${getPriorityColor(appointment.priority)} ${compact ? "p-2" : ""}`}
      >
        <CardContent className={compact ? "p-3" : "p-6"}>
          <div className={`flex items-center ${compact ? "gap-2" : "gap-4"} ${compact ? "flex-col sm:flex-row" : ""}`}>
          <div className="flex items-center gap-2">
            <Avatar className={`${compact ? "w-8 h-8" : "w-12 h-12"} ring-2 ring-white shadow-sm`}>
              <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-medium text-xs">
                {appointment.patientName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            {appointment.priority === "high" && <div className={`absolute ${compact ? "-top-0.5 -right-0.5 w-3 h-3" : "-top-1 -right-1 w-4 h-4"} bg-red-500 rounded-full border-2 border-white`} />}
          </div>

          <div className={`flex-1 ${compact ? "text-center sm:text-left" : ""}`}>
            <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : "text-lg"}`}>{appointment.patientName}</h3>
            <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"} text-muted-foreground ${compact ? "flex-col sm:flex-row" : ""}`}>
              <div className="flex items-center gap-1">
                <Clock className={`${compact ? "w-3 h-3" : "w-4 h-4"}`} />
                <span>{formatTime(appointment.appointmentTime)}</span>
                <span>({appointment.duration} min)</span>
              </div>
              {appointment.isVirtual && (
                <Badge variant="outline" className="text-xs">
                  Virtual
                </Badge>
              )}
              {appointment.fileUpToDate && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                  <FileText className="w-3 h-3 mr-1" />
                  Chart
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs ${compact ? "text-xs" : "text-sm"} text-muted-foreground`}>
                {appointment.patientPhone} • {appointment.patientEmail}
              </span>
            </div>
          </div>

          <div className={`flex gap-1 ${compact ? "flex-col" : "flex-wrap"}`}>
            <Badge className={`text-xs font-medium ${getStatusColor(appointment.status)}`}>{appointment.status}</Badge>
            <Badge className={`text-xs font-medium ${getAppointmentTypeColor(appointment.appointmentType)}`}>{appointment.appointmentType}</Badge>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!appointment.patientId || isUploading}
              onClick={() => {
                if (!appointment.patientId) {
                  return
                }
                void openFilePickerAndUpload({ patientId: appointment.patientId }).then((result) => {
                  if (result) {
                    onScheduleRefresh?.()
                  }
                })
              }}
            >
              <Upload className="w-4 h-4" />
            </Button>

            {uploadStatusLabel && (
              <span className={`text-xs ${uploadState?.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {uploadStatusLabel}
              </span>
            )}

            <Button variant="ghost" size="sm" onClick={() => setEditingAppointment(appointment)}>
              <Edit3 className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="sm" onClick={() => handleDuplicateAppointment(appointment)}>
              <Copy className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="sm" onClick={() => handleDeleteAppointment(appointment.id)} className="text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    )
  }

  // Day View Component
  const DayView = () => {
    const timeSlots = generateTimeSlots()
    const dayAppointments = getAppointmentsForDate(currentDate)

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{currentDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{dayAppointments.length} appointments</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Time Grid */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Available Time Slots</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {timeSlots.map((time) => {
                  const hasAppointment = getAppointmentsForTimeSlot(currentDate, time).length > 0

                  return (
                    <div
                      key={time}
                      className={`p-2 rounded border cursor-pointer transition-colors ${
                        hasAppointment ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200 hover:bg-blue-25 hover:border-blue-100"
                      }`}
                      onClick={() => {
                        if (!hasAppointment) {
                          const selectedDateTime = new Date(currentDate)
                          const [hour, minute] = time.split(":").map(Number)
                          selectedDateTime.setHours(hour, minute, 0, 0)
                          setNewAppointment((prev) => ({
                            ...prev,
                            appointmentTime: selectedDateTime.toISOString(),
                          }))
                          setShowNewAppointmentDialog(true)
                        }
                      }}
                    >
                      <span className="text-sm font-medium">{time}</span>
                      {hasAppointment ? (
                        <div className="text-xs text-blue-600 mt-1">{getAppointmentsForTimeSlot(currentDate, time).length} appointment(s)</div>
                      ) : (
                        <div className="text-xs text-green-600 mt-1">Available</div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Appointments */}
          <div className="lg:col-span-3 space-y-4">
            {dayAppointments.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No appointments scheduled</h3>
                  <p className="text-muted-foreground mb-4">Click on a time slot to create a new appointment.</p>
                </CardContent>
              </Card>
            ) : (
              dayAppointments
                .sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime())
                .map((appointment, index) => (
                  <motion.div key={appointment.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}>
                    <AppointmentCard appointment={appointment} />
                  </motion.div>
                ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // Week View Component
  const WeekView = () => {
    const weekDays = generateWeekDays()

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Week of {weekDays[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} - {weekDays[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{weekDays.reduce((total, day) => total + getAppointmentsForDate(day).length, 0)} appointments this week</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {weekDays.map((day, index) => {
            const dayAppointments = getAppointmentsForDate(day)
            const isToday = day.toDateString() === new Date().toDateString()

            return (
              <Card key={day.toISOString()} className={`${isToday ? "ring-2 ring-blue-500" : ""} min-h-[300px]`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-center">
                    <div className={`font-medium ${isToday ? "text-blue-600" : ""}`}>{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                    <div className={`text-lg ${isToday ? "text-blue-600 font-bold" : ""}`}>{day.getDate()}</div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {dayAppointments.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-sm text-muted-foreground mb-2">No appointments</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const selectedDateTime = new Date(day)
                          selectedDateTime.setHours(9, 0, 0, 0) // Default to 9 AM
                          setNewAppointment((prev) => ({
                            ...prev,
                            appointmentTime: selectedDateTime.toISOString(),
                          }))
                          setShowNewAppointmentDialog(true)
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  ) : (
                    dayAppointments
                      .sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime())
                      .map((appointment) => (
                        <motion.div key={appointment.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}>
                          <AppointmentCard appointment={appointment} compact={true} />
                        </motion.div>
                      ))
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with controls */}
      <div className="flex flex-col space-y-4">
        {/* Top row - Date navigation and view controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateDate("prev")}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateDate("next")}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-lg font-medium">Schedule Builder</div>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "day" | "week")}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="outline" size="sm" onClick={() => setCalendarView(calendarView === "grid" ? "list" : "grid")}>
              {calendarView === "grid" ? <List className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Second row - Provider and actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-48">
                <User className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Providers">All Providers</SelectItem>
                <Separator />
                {providers.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="outline" className="px-3 py-1">
              {filteredAppointments.length} templates
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setShowNewAppointmentDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="min-h-[600px]">
        {viewMode === "day" && <DayView />}
        {viewMode === "week" && <WeekView />}
      </div>

      {/* New/Edit Appointment Dialog */}
      <Dialog
        open={showNewAppointmentDialog || editingAppointment !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewAppointmentDialog(false)
            setEditingAppointment(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAppointment ? "Edit Appointment Template" : "Create New Appointment Template"}</DialogTitle>
            <DialogDescription>Fill in the patient and appointment details. This will create a template that can be used to schedule actual appointments.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="appointment">Appointment</TabsTrigger>
                <TabsTrigger value="medical">Medical Info</TabsTrigger>
                <TabsTrigger value="notes">Notes & Files</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientName">Patient Name *</Label>
                    <Input
                      id="patientName"
                      value={editingAppointment?.patientName || newAppointment.patientName}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientName: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, patientName: e.target.value })
                        }
                      }}
                      placeholder="Enter patient full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patientId">Patient ID / MRN</Label>
                    <Input
                      id="patientId"
                      value={editingAppointment?.patientId || newAppointment.patientId || ""}
                      onChange={(e) => {
                        const value = e.target.value
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientId: value })
                        } else {
                          setNewAppointment((prev) => ({ ...prev, patientId: value }))
                        }
                      }}
                      placeholder="PT-1001"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appointmentTime">Appointment Date &amp; Time *</Label>
                    <Input
                      id="appointmentTime"
                      type="datetime-local"
                      value={
                        editingAppointment?.appointmentTime
                          ? new Date(editingAppointment.appointmentTime).toISOString().slice(0, 16)
                          : newAppointment.appointmentTime
                              ? new Date(newAppointment.appointmentTime).toISOString().slice(0, 16)
                              : ""
                      }
                      onChange={(e) => {
                        const isoString = new Date(e.target.value).toISOString()
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, appointmentTime: isoString })
                        } else {
                          setNewAppointment({ ...newAppointment, appointmentTime: isoString })
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="chiefComplaint">Chief Complaint</Label>
                    <Textarea
                      id="chiefComplaint"
                      value={editingAppointment?.chiefComplaint || newAppointment.chiefComplaint}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, chiefComplaint: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, chiefComplaint: e.target.value })
                        }
                      }}
                      placeholder="Patient's primary concern or reason for visit"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patientDOB">Date of Birth</Label>
                    <Input
                      id="patientDOB"
                      type="date"
                      value={editingAppointment?.patientDOB || newAppointment.patientDOB}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientDOB: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, patientDOB: e.target.value })
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patientPhone">Phone Number</Label>
                    <Input
                      id="patientPhone"
                      value={editingAppointment?.patientPhone || newAppointment.patientPhone}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientPhone: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, patientPhone: e.target.value })
                        }
                      }}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patientEmail">Email Address</Label>
                    <Input
                      id="patientEmail"
                      type="email"
                      value={editingAppointment?.patientEmail || newAppointment.patientEmail}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientEmail: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, patientEmail: e.target.value })
                        }
                      }}
                      placeholder="patient@email.com"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="patientAddress">Address</Label>
                    <Input
                      id="patientAddress"
                      value={editingAppointment?.patientAddress || newAppointment.patientAddress}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, patientAddress: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, patientAddress: e.target.value })
                        }
                      }}
                      placeholder="123 Main St, City, State 12345"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="insuranceInfo">Insurance Information</Label>
                    <Input
                      id="insuranceInfo"
                      value={editingAppointment?.insuranceInfo || newAppointment.insuranceInfo}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, insuranceInfo: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, insuranceInfo: e.target.value })
                        }
                      }}
                      placeholder="Insurance provider and plan"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="appointment" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Select
                      value={(editingAppointment?.duration || newAppointment.duration || 30).toString()}
                      onValueChange={(value) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, duration: parseInt(value) })
                        } else {
                          setNewAppointment({ ...newAppointment, duration: parseInt(value) })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                        <SelectItem value="90">90 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>

                  <div className="space-y-2">
                    <Label htmlFor="appointmentType">Appointment Type</Label>
                    <Select
                      value={editingAppointment?.appointmentType || newAppointment.appointmentType || "New Patient"}
                      onValueChange={(value) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, appointmentType: value as any })
                        } else {
                          setNewAppointment({ ...newAppointment, appointmentType: value as any })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Wellness">Wellness</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                        <SelectItem value="New Patient">New Patient</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                        <SelectItem value="Consultation">Consultation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={editingAppointment?.priority || newAppointment.priority || "medium"}
                      onValueChange={(value) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, priority: value as any })
                        } else {
                          setNewAppointment({ ...newAppointment, priority: value as any })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={editingAppointment?.provider || newAppointment.provider || selectedProvider}
                      onValueChange={(value) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, provider: value })
                        } else {
                          setNewAppointment({ ...newAppointment, provider: value })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="encounterId">Encounter ID</Label>
                    <Input
                      id="encounterId"
                      value={editingAppointment?.encounterId || newAppointment.encounterId || ""}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, encounterId: e.target.value })
                        } else {
                          setNewAppointment((prev) => ({ ...prev, encounterId: e.target.value }))
                        }
                      }}
                      placeholder="ENC-2024-001"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={editingAppointment?.location || newAppointment.location}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, location: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, location: e.target.value })
                        }
                      }}
                      placeholder="Room 101 or Virtual"
                    />
                  </div>

                  <div className="flex items-center space-x-2 md:col-span-2">
                    <Switch
                      id="isVirtual"
                      checked={editingAppointment?.isVirtual || newAppointment.isVirtual || false}
                      onCheckedChange={(checked) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, isVirtual: checked })
                        } else {
                          setNewAppointment({ ...newAppointment, isVirtual: checked })
                        }
                      }}
                    />
                    <Label htmlFor="isVirtual">Virtual Appointment</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="medical" className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="medicalHistory">Medical History</Label>
                    <Textarea
                      id="medicalHistory"
                      value={editingAppointment?.medicalHistory || newAppointment.medicalHistory}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, medicalHistory: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, medicalHistory: e.target.value })
                        }
                      }}
                      placeholder="Past medical history, surgeries, chronic conditions"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currentMedications">Current Medications</Label>
                    <Textarea
                      id="currentMedications"
                      value={editingAppointment?.currentMedications || newAppointment.currentMedications}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, currentMedications: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, currentMedications: e.target.value })
                        }
                      }}
                      placeholder="List current medications with dosages"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Textarea
                      id="allergies"
                      value={editingAppointment?.allergies || newAppointment.allergies}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, allergies: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, allergies: e.target.value })
                        }
                      }}
                      placeholder="Known allergies and reactions"
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">Appointment Notes</Label>
                    <Textarea
                      id="notes"
                      value={editingAppointment?.notes || newAppointment.notes}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, notes: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, notes: e.target.value })
                        }
                      }}
                      placeholder="Additional notes about the appointment"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="referralNotes">Referral Notes</Label>
                    <Textarea
                      id="referralNotes"
                      value={editingAppointment?.referralNotes || newAppointment.referralNotes}
                      onChange={(e) => {
                        if (editingAppointment) {
                          setEditingAppointment({ ...editingAppointment, referralNotes: e.target.value })
                        } else {
                          setNewAppointment({ ...newAppointment, referralNotes: e.target.value })
                        }
                      }}
                      placeholder="Referral information and notes"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Medical Chart Files</Label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <span className="text-sm">
                            {currentChartFiles.length === 0 ? "No files uploaded" : `${currentChartFiles.length} file(s) uploaded`}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const activePatientId = (editingAppointment?.patientId || newAppointment.patientId || "").trim()
                            if (!activePatientId) {
                              setUploadError("Enter a patient ID before uploading chart files.")
                              return
                            }
                            setUploadError(null)
                            void openFilePickerAndUpload({ patientId: activePatientId })
                              .then((result) => {
                                if (!result) {
                                  return
                                }
                                const uploadedFiles = (result.files || [])
                                  .map((entry) => (entry?.name ? String(entry.name) : null))
                                  .filter((name): name is string => Boolean(name))

                                if (editingAppointment) {
                                  setEditingAppointment((prev) => {
                                    if (!prev) {
                                      return prev
                                    }
                                    const nextCorrelation = result.correlationId ?? prev.chartCorrelationId ?? null
                                    const hasChart = uploadedFiles.length > 0 || Boolean(nextCorrelation)
                                    return {
                                      ...prev,
                                      hasChart,
                                      chartFiles: uploadedFiles,
                                      chartCorrelationId: nextCorrelation,
                                    }
                                  })
                                } else {
                                  setNewAppointment((prev) => {
                                    const nextCorrelation = result.correlationId ?? null
                                    const hasChart = uploadedFiles.length > 0 || Boolean(nextCorrelation)
                                    return {
                                      ...prev,
                                      hasChart,
                                      chartFiles: uploadedFiles,
                                      chartCorrelationId: nextCorrelation,
                                    }
                                  })
                                }
                              })
                              .catch((error) => {
                                console.error("Failed to upload chart", error)
                                setUploadError(error instanceof Error ? error.message : "Unable to upload chart.")
                              })
                          }}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Files
                        </Button>
                      </div>
                      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                      {uploadStatusMessage && <p className="text-xs text-muted-foreground">{uploadStatusMessage}</p>}
                      {patientIdForContext && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            Chart: {contextStageDisplay.superficial} superficial · {contextStageDisplay.deep} deep · {contextStageDisplay.indexed} indexed
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() =>
                              onOpenChartContext?.(patientIdForContext, {
                                patientName: editingAppointment?.patientName || newAppointment.patientName || null,
                              })
                            }
                          >
                            <BookOpen className="w-3.5 h-3.5 mr-1" />
                            Readable chart
                          </Button>
                        </div>
                      )}
                    </div>

                    {currentChartFiles.length > 0 && (
                      <div className="space-y-2">
                        {currentChartFiles.map((file, index) => (
                          <div key={file + index} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-600" />
                              <span className="text-sm">{file}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (editingAppointment) {
                                  setEditingAppointment((prev) => {
                                    if (!prev) {
                                      return prev
                                    }
                                    const nextFiles = (prev.chartFiles || []).filter((_, i) => i !== index)
                                    return {
                                      ...prev,
                                      chartFiles: nextFiles,
                                      hasChart: nextFiles.length > 0,
                                      chartCorrelationId: nextFiles.length > 0 ? prev.chartCorrelationId ?? null : null,
                                    }
                                  })
                                } else {
                                  setNewAppointment((prev) => {
                                    const nextFiles = (prev.chartFiles || []).filter((_, i) => i !== index)
                                    return {
                                      ...prev,
                                      chartFiles: nextFiles,
                                      hasChart: nextFiles.length > 0,
                                      chartCorrelationId: nextFiles.length > 0 ? prev.chartCorrelationId ?? null : null,
                                    }
                                  })
                                }
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {createError && (
            <Alert variant="destructive">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewAppointmentDialog(false)
                setEditingAppointment(null)
                setCreateError(null)
                setUploadError(null)
                setNewAppointment(buildDefaultAppointment())
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateAppointment} disabled={creatingAppointment}>
              <Save className="w-4 h-4 mr-2" />
              {creatingAppointment ? "Creating..." : editingAppointment ? "Update" : "Create"} Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
