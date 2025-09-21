import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Filter,
  Users,
  FileText,
  DollarSign,
  Target,
  Clock,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Activity,
  Stethoscope,
  Award,
  Zap,
  Brain,
  Shield,
  Building2,
  CreditCard,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { DatePickerWithRange } from "./ui/date-picker-with-range"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Skeleton } from "./ui/skeleton"
import { apiFetch, apiFetchJson } from "../lib/api"

interface UsageTrendPoint {
  day: string
  total_notes: number
  beautify: number
  suggest: number
  summary: number
  chart_upload: number
  audio: number
}

interface UsageAnalyticsResponse {
  total_notes: number
  beautify: number
  suggest: number
  summary: number
  chart_upload: number
  audio: number
  avg_note_length: number
  daily_trends: UsageTrendPoint[]
  projected_totals: Record<string, number>
  event_distribution: Record<string, number>
}

interface CodingAccuracyTrendPoint {
  day: string
  total_notes: number
  denials: number
  deficiencies: number
  accuracy: number
}

interface CodingAccuracyAnalyticsResponse {
  total_notes: number
  denials: number
  deficiencies: number
  accuracy: number
  coding_distribution: Record<string, number>
  outcome_distribution: Record<string, number>
  accuracy_trend: CodingAccuracyTrendPoint[]
  projections: Record<string, number>
}

interface RevenueTrendPoint {
  day: string
  total_revenue: number
  average_revenue: number
}

interface RevenueAnalyticsResponse {
  total_revenue: number
  average_revenue: number
  revenue_by_code: Record<string, number>
  revenue_trend: RevenueTrendPoint[]
  projections: Record<string, number>
  revenue_distribution: Record<string, number>
}

interface ComplianceTrendPoint {
  day: string
  notes_with_flags: number
  total_flags: number
}

interface ComplianceAnalyticsResponse {
  compliance_counts: Record<string, number>
  notes_with_flags: number
  total_flags: number
  flagged_rate: number
  compliance_trend: ComplianceTrendPoint[]
  projections: Record<string, number>
  compliance_distribution: Record<string, number>
}

interface DraftAnalyticsResponse {
  drafts: number
}

interface DataState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

type DatePreset = "7days" | "30days" | "90days" | "custom"

interface AnalyticsFilters {
  datePreset: DatePreset
  customRange: DateRange | null
  clinician: string | null
  clinic: string | null
  payer: string | null
}

interface StoredAnalyticsFilters {
  datePreset?: DatePreset
  customRange?: {
    from?: string | null
    to?: string | null
  }
  clinician?: string | null
  clinic?: string | null
  payer?: string | null
}

function createDefaultFilters(): AnalyticsFilters {
  return {
    datePreset: "30days",
    customRange: null,
    clinician: null,
    clinic: null,
    payer: null,
  }
}

function normalizeFilterValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value).trim()
  if (!text) {
    return null
  }
  const lowered = text.toLowerCase()
  if (lowered === "all" || lowered === "any" || lowered === "*") {
    return null
  }
  return text
}

function isValidDate(value: Date | undefined | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function serializeFilters(filters: AnalyticsFilters): StoredAnalyticsFilters {
  const payload: StoredAnalyticsFilters = {
    datePreset: filters.datePreset,
    clinician: filters.clinician,
    clinic: filters.clinic,
    payer: filters.payer,
  }

  if (filters.datePreset === "custom" && filters.customRange) {
    const from = filters.customRange.from
    const to = filters.customRange.to
    if (isValidDate(from) || isValidDate(to)) {
      payload.customRange = {
        from: isValidDate(from) ? from.toISOString() : null,
        to: isValidDate(to) ? to.toISOString() : null,
      }
    }
  }

  return payload
}

function deserializeFilters(raw: unknown): AnalyticsFilters {
  const base = createDefaultFilters()
  if (!raw || typeof raw !== "object") {
    return base
  }

  const record = raw as Record<string, unknown>
  const preset = normalizeFilterValue(record.datePreset)
  if (preset === "7days" || preset === "30days" || preset === "90days" || preset === "custom") {
    base.datePreset = preset
  }

  base.clinician = normalizeFilterValue(record.clinician)
  base.clinic = normalizeFilterValue(record.clinic)
  base.payer = normalizeFilterValue(record.payer)

  if (base.datePreset === "custom") {
    const custom = record.customRange
    if (custom && typeof custom === "object") {
      const customRecord = custom as Record<string, unknown>
      const parseDate = (value: unknown): Date | undefined => {
        const parsed = normalizeFilterValue(value)
        if (!parsed) {
          return undefined
        }
        const dt = new Date(parsed)
        return Number.isNaN(dt.getTime()) ? undefined : dt
      }

      const from = parseDate(customRecord.from)
      const to = parseDate(customRecord.to)
      if (from) {
        base.customRange = { from, to: to ?? from }
      }
    }
  } else {
    base.customRange = null
  }

  return base
}

function resolveDateRange(filters: AnalyticsFilters): { start?: Date; end?: Date } {
  if (filters.datePreset === "custom") {
    const from = filters.customRange?.from
    if (!isValidDate(from)) {
      return {}
    }
    const toValue = filters.customRange?.to
    const start = new Date(from)
    const end = isValidDate(toValue) ? new Date(toValue) : new Date(from)
    end.setHours(23, 59, 59, 999)
    start.setHours(0, 0, 0, 0)
    return { start, end }
  }

  const end = new Date()
  const start = new Date(end)
  start.setHours(0, 0, 0, 0)
  switch (filters.datePreset) {
    case "7days":
      start.setDate(start.getDate() - 6)
      break
    case "30days":
      start.setDate(start.getDate() - 29)
      break
    case "90days":
      start.setDate(start.getDate() - 89)
      break
    default:
      break
  }
  return { start, end }
}

function buildAnalyticsQuery(filters: AnalyticsFilters): string {
  const params = new URLSearchParams()
  const { start, end } = resolveDateRange(filters)
  if (isValidDate(start)) {
    params.set("start", start.toISOString())
  }
  if (isValidDate(end)) {
    params.set("end", end.toISOString())
  }
  if (filters.clinician) {
    params.set("clinician", filters.clinician)
  }
  if (filters.clinic) {
    params.set("clinic", filters.clinic)
  }
  if (filters.payer) {
    params.set("payer", filters.payer)
  }
  return params.toString()
}

interface MetricCardProps {
  title: string
  value: string | number
  baseline: string | number
  change: number
  changeType: "increase" | "decrease"
  trend: "up" | "down"
  icon: any
  description?: string
  color?: string
}

interface BillingCodingDashboardProps {
  revenueState: DataState<RevenueAnalyticsResponse>
  codingState: DataState<CodingAccuracyAnalyticsResponse>
  usageState: DataState<UsageAnalyticsResponse>
  currencyFormatter: Intl.NumberFormat
  filters: AnalyticsFilters
  onFiltersChange: (updates: Partial<AnalyticsFilters>) => void
  onRefresh: () => void
}

interface NoteQualityDashboardProps {
  usageState: DataState<UsageAnalyticsResponse>
  complianceState: DataState<ComplianceAnalyticsResponse>
  codingState: DataState<CodingAccuracyAnalyticsResponse>
  draftState: DataState<DraftAnalyticsResponse>
  filters: AnalyticsFilters
  onFiltersChange: (updates: Partial<AnalyticsFilters>) => void
  onRefresh: () => void
}

function MetricCard({ title, value, baseline, change, changeType, trend, icon: Icon, description, color = "blue" }: MetricCardProps) {
  const isPositive = (changeType === "increase" && trend === "up") || (changeType === "decrease" && trend === "down")

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            color === "blue"
              ? "bg-blue-100 text-blue-600"
              : color === "green"
                ? "bg-emerald-100 text-emerald-600"
                : color === "purple"
                  ? "bg-purple-100 text-purple-600"
                  : color === "orange"
                    ? "bg-orange-100 text-orange-600"
                    : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-semibold">{value}</div>
            <p className="text-xs text-muted-foreground">Baseline: {baseline}</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        </div>
        {description && <p className="text-xs text-muted-foreground mt-2">{description}</p>}
      </CardContent>
    </Card>
  )
}

interface DashboardFiltersProps {
  filters: AnalyticsFilters
  onFiltersChange: (updates: Partial<AnalyticsFilters>) => void
  onExport: () => void
}

function DashboardFilters({ filters, onFiltersChange, onExport }: DashboardFiltersProps) {
  const handleDatePresetChange = (value: string) => {
    const preset = value as DatePreset
    onFiltersChange({
      datePreset: preset,
      customRange: preset === "custom" ? filters.customRange : null,
    })
  }

  const handleRangeChange = (range: DateRange | undefined) => {
    onFiltersChange({ customRange: range ?? null })
  }

  const handleClinicianChange = (value: string) => {
    onFiltersChange({ clinician: value === "all" ? null : value })
  }

  const handleClinicChange = (value: string) => {
    onFiltersChange({ clinic: value === "all" ? null : value })
  }

  const handlePayerChange = (value: string) => {
    onFiltersChange({ payer: value === "all" ? null : value })
  }

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.datePreset} onValueChange={handleDatePresetChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 days</SelectItem>
            <SelectItem value="30days">Last 30 days</SelectItem>
            <SelectItem value="90days">Last 90 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filters.datePreset === "custom" && <DatePickerWithRange className="w-[280px]" date={filters.customRange ?? undefined} onDateChange={handleRangeChange} />}

      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.clinician ?? "all"} onValueChange={handleClinicianChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select clinician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinicians</SelectItem>
            <SelectItem value="alice">Dr. Alice</SelectItem>
            <SelectItem value="bob">Dr. Bob</SelectItem>
            <SelectItem value="carol">NP Carol</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.clinic ?? "all"} onValueChange={handleClinicChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinics</SelectItem>
            <SelectItem value="north-clinic">North Clinic</SelectItem>
            <SelectItem value="uptown-clinic">Uptown Clinic</SelectItem>
            <SelectItem value="southside-clinic">Southside Clinic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.payer ?? "all"} onValueChange={handlePayerChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select payer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payers</SelectItem>
            <SelectItem value="acme-health">Acme Health</SelectItem>
            <SelectItem value="northcare">NorthCare</SelectItem>
            <SelectItem value="mediplus">MediPlus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={onExport} variant="outline" size="sm" className="ml-auto">
        <Download className="w-4 h-4 mr-2" />
        Export PDF
      </Button>
    </div>
  )
}

function BillingCodingDashboard({ revenueState, codingState, usageState, currencyFormatter, filters, onFiltersChange, onRefresh }: BillingCodingDashboardProps) {
  const palette = useMemo(() => ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#6b7280", "#0ea5e9", "#f97316"], [])

  const revenueLineData = useMemo(() => {
    return (revenueState.data?.revenue_trend ?? []).map((point) => ({
      name: new Date(point.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Number(point.total_revenue ?? 0),
      baseline: Number(point.average_revenue ?? 0),
    }))
  }, [revenueState.data?.revenue_trend])

  const codeDistribution = useMemo(() => {
    const entries = Object.entries(revenueState.data?.revenue_by_code ?? {})
    if (entries.length === 0) {
      return [] as Array<{ name: string; value: number; color: string }>
    }
    return entries.map(([code, amount], index) => ({
      name: code,
      value: Number(amount ?? 0),
      color: palette[index % palette.length],
    }))
  }, [palette, revenueState.data?.revenue_by_code])

  const denialData = useMemo(() => {
    return (codingState.data?.accuracy_trend ?? []).map((point) => ({
      name: new Date(point.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      denials: point.denials,
      total: point.total_notes,
    }))
  }, [codingState.data?.accuracy_trend])

  const latestRevenue = revenueLineData.length > 0 ? revenueLineData[revenueLineData.length - 1].value : 0
  const previousRevenue = revenueLineData.length > 1 ? revenueLineData[revenueLineData.length - 2].value : latestRevenue
  const revenueChange = previousRevenue ? ((latestRevenue - previousRevenue) / Math.max(previousRevenue, 1)) * 100 : 0
  const revenueTrendDirection: "up" | "down" = revenueChange >= 0 ? "up" : "down"

  const claimsTrend = codingState.data?.accuracy_trend ?? []
  const latestClaims = claimsTrend.length > 0 ? claimsTrend[claimsTrend.length - 1].total_notes : (codingState.data?.total_notes ?? 0)
  const previousClaims = claimsTrend.length > 1 ? claimsTrend[claimsTrend.length - 2].total_notes : latestClaims
  const claimsChange = previousClaims ? ((latestClaims - previousClaims) / Math.max(previousClaims, 1)) * 100 : 0
  const claimsTrendDirection: "up" | "down" = claimsChange >= 0 ? "up" : "down"

  const latestDenialRatePoint = claimsTrend.length > 0 ? claimsTrend[claimsTrend.length - 1] : null
  const previousDenialRatePoint = claimsTrend.length > 1 ? claimsTrend[claimsTrend.length - 2] : latestDenialRatePoint
  const latestDenialRate =
    latestDenialRatePoint && latestDenialRatePoint.total_notes
      ? (latestDenialRatePoint.denials / Math.max(latestDenialRatePoint.total_notes, 1)) * 100
      : ((codingState.data?.denials ?? 0) / Math.max(codingState.data?.total_notes ?? 1, 1)) * 100
  const previousDenialRate =
    previousDenialRatePoint && previousDenialRatePoint.total_notes ? (previousDenialRatePoint.denials / Math.max(previousDenialRatePoint.total_notes, 1)) * 100 : latestDenialRate
  const denialChange = previousDenialRate ? ((latestDenialRate - previousDenialRate) / Math.max(Math.abs(previousDenialRate), 1)) * 100 : 0
  const denialTrendDirection: "up" | "down" = denialChange >= 0 ? "up" : "down"

  const usageTrend = usageState.data?.daily_trends ?? []
  const latestUsageNotes = usageTrend.length > 0 ? usageTrend[usageTrend.length - 1].total_notes : (usageState.data?.total_notes ?? 0)
  const previousUsageNotes = usageTrend.length > 1 ? usageTrend[usageTrend.length - 2].total_notes : latestUsageNotes
  const latestRevenuePerVisit = latestUsageNotes ? latestRevenue / Math.max(latestUsageNotes, 1) : 0
  const previousRevenuePerVisit = previousUsageNotes ? previousRevenue / Math.max(previousUsageNotes, 1) : latestRevenuePerVisit
  const revenuePerVisitChange = previousRevenuePerVisit ? ((latestRevenuePerVisit - previousRevenuePerVisit) / Math.max(previousRevenuePerVisit, 1)) * 100 : 0
  const revenuePerVisitTrend: "up" | "down" = revenuePerVisitChange >= 0 ? "up" : "down"

  const revenuePerVisitDescription = usageState.data?.avg_note_length ? `Avg note length ${Math.round(usageState.data.avg_note_length)} words` : "Average note length unavailable"

  const showEmptyRevenueChart = revenueLineData.length === 0
  const showEmptyDistribution = codeDistribution.length === 0
  const showEmptyDenialChart = denialData.length === 0

  return (
    <div className="space-y-6">
      <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} onExport={() => console.log("Export billing dashboard")} />

      {(revenueState.error || codingState.error || usageState.error) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-700">{revenueState.error || codingState.error || usageState.error}</div>
      )}

      {(revenueState.loading || codingState.loading || usageState.loading) && (
        <Badge variant="outline" className="text-xs">
          Loading analytics…
        </Badge>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Daily Revenue"
          value={currencyFormatter.format(latestRevenue)}
          baseline={currencyFormatter.format(previousRevenue)}
          change={Math.round(Math.abs(revenueChange))}
          changeType="increase"
          trend={revenueTrendDirection}
          icon={DollarSign}
          color="green"
          description={`Period total: ${currencyFormatter.format(revenueState.data?.total_revenue ?? 0)}`}
        />
        <MetricCard
          title="Claims Processed"
          value={latestClaims.toLocaleString()}
          baseline={previousClaims.toLocaleString()}
          change={Math.round(Math.abs(claimsChange))}
          changeType="increase"
          trend={claimsTrendDirection}
          icon={FileText}
          color="blue"
          description="Latest documented day"
        />
        <MetricCard
          title="Denial Rate"
          value={`${latestDenialRate.toFixed(1)}%`}
          baseline={`${previousDenialRate.toFixed(1)}%`}
          change={Math.round(Math.abs(denialChange))}
          changeType="decrease"
          trend={denialTrendDirection}
          icon={AlertTriangle}
          color="orange"
          description="Lower is better"
        />
        <MetricCard
          title="Revenue Per Visit"
          value={currencyFormatter.format(latestRevenuePerVisit)}
          baseline={currencyFormatter.format(previousRevenuePerVisit)}
          change={Math.round(Math.abs(revenuePerVisitChange))}
          changeType="increase"
          trend={revenuePerVisitTrend}
          icon={Target}
          color="purple"
          description={revenuePerVisitDescription}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Revenue Trend</CardTitle>
            <CardDescription>Current vs average performance</CardDescription>
          </CardHeader>
          <CardContent>
            {showEmptyRevenueChart ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No revenue data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueLineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => currencyFormatter.format(value)} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="baseline" stroke="#94a3b8" strokeDasharray="5 5" name="Average" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Code Revenue Distribution</CardTitle>
            <CardDescription>Revenue contribution by code</CardDescription>
          </CardHeader>
          <CardContent>
            {showEmptyDistribution ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No billing data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={codeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${currencyFormatter.format(value)}`}
                  >
                    {codeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => currencyFormatter.format(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Claims Denial Analysis</CardTitle>
                <CardDescription>Daily denials versus total claims</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showEmptyDenialChart ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No claims data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={denialData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="right" dataKey="total" fill="#94a3b8" name="Total Claims" />
                  <Bar yAxisId="left" dataKey="denials" fill="#ef4444" name="Denials" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface HealthOutcomesDashboardProps {
  filters: AnalyticsFilters
  onFiltersChange: (updates: Partial<AnalyticsFilters>) => void
}

function HealthOutcomesDashboard({ filters, onFiltersChange }: HealthOutcomesDashboardProps) {
  const outcomeData = [
    { name: "Jan", satisfaction: 4.2, readmissions: 8, outcomes: 87 },
    { name: "Feb", satisfaction: 4.4, readmissions: 6, outcomes: 89 },
    { name: "Mar", satisfaction: 4.3, readmissions: 7, outcomes: 88 },
    { name: "Apr", satisfaction: 4.6, readmissions: 5, outcomes: 91 },
    { name: "May", satisfaction: 4.5, readmissions: 4, outcomes: 92 },
    { name: "Jun", satisfaction: 4.7, readmissions: 3, outcomes: 94 },
  ]

  return (
    <div className="space-y-6">
      <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} onExport={() => console.log("Export health outcomes dashboard")} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Patient Satisfaction" value="4.7/5.0" baseline="4.2/5.0" change={11.9} changeType="increase" trend="up" icon={Stethoscope} color="green" description="Above national avg" />
        <MetricCard title="Readmission Rate" value="3.2%" baseline="8.1%" change={60.5} changeType="decrease" trend="down" icon={Activity} color="blue" description="Target: <5%" />
        <MetricCard title="Care Quality Score" value="94.2" baseline="87.3" change={7.9} changeType="increase" trend="up" icon={Award} color="purple" description="Industry avg: 88.5" />
        <MetricCard title="Preventive Care %" value="86.7%" baseline="78.2%" change={10.9} changeType="increase" trend="up" icon={Shield} color="orange" description="Target: 90%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Patient Satisfaction Trend</CardTitle>
            <CardDescription>Monthly satisfaction scores</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={outcomeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[3.8, 5.0]} />
                <Tooltip />
                <Line type="monotone" dataKey="satisfaction" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health Outcomes Index</CardTitle>
            <CardDescription>Composite quality score over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={outcomeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[80, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="outcomes" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NoteQualityDashboard({ usageState, complianceState, codingState, draftState, filters, onFiltersChange, onRefresh }: NoteQualityDashboardProps) {
  const usageTrend = usageState.data?.daily_trends ?? []
  const complianceTrendMap = useMemo(() => {
    const map = new Map<string, ComplianceTrendPoint>()
    for (const point of complianceState.data?.compliance_trend ?? []) {
      map.set(point.day, point)
    }
    return map
  }, [complianceState.data?.compliance_trend])

  const accuracyTrendMap = useMemo(() => {
    const map = new Map<string, CodingAccuracyTrendPoint>()
    for (const point of codingState.data?.accuracy_trend ?? []) {
      map.set(point.day, point)
    }
    return map
  }, [codingState.data?.accuracy_trend])

  const qualityData = useMemo(() => {
    return usageTrend.map((point) => {
      const compliancePoint = complianceTrendMap.get(point.day)
      const accuracyPoint = accuracyTrendMap.get(point.day)
      const completeness = compliancePoint
        ? 100 - Math.min(100, (compliancePoint.notes_with_flags / Math.max(point.total_notes, 1)) * 100)
        : 100 - Math.min(100, (complianceState.data?.flagged_rate ?? 0) * 100)
      const accuracy = accuracyPoint ? Math.max(0, Math.round(accuracyPoint.accuracy * 100)) : Math.max(0, Math.round((codingState.data?.accuracy ?? 0) * 100))
      return {
        name: new Date(point.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        completeness: Number(completeness.toFixed(1)),
        accuracy,
        beauty: point.beautify,
      }
    })
  }, [accuracyTrendMap, codingState.data?.accuracy, complianceState.data?.flagged_rate, complianceTrendMap, usageTrend])

  const totalNotes = usageState.data?.total_notes ?? 0
  const previousNotes = usageTrend.length > 1 ? usageTrend[usageTrend.length - 2].total_notes : totalNotes
  const notesChange = previousNotes ? ((totalNotes - previousNotes) / Math.max(previousNotes, 1)) * 100 : 0
  const notesTrend: "up" | "down" = notesChange >= 0 ? "up" : "down"

  const beautifyTotal = usageState.data?.beautify ?? 0
  const previousBeautify = usageTrend.length > 1 ? usageTrend[usageTrend.length - 2].beautify : beautifyTotal
  const beautifyChange = previousBeautify ? ((beautifyTotal - previousBeautify) / Math.max(previousBeautify, 1)) * 100 : 0
  const beautifyTrend: "up" | "down" = beautifyChange >= 0 ? "up" : "down"

  const completenessRate = complianceState.data ? 100 - Math.min(100, (complianceState.data.notes_with_flags / Math.max(totalNotes, 1)) * 100) : 100
  const latestCompleteness = qualityData.length > 0 ? qualityData[qualityData.length - 1].completeness : completenessRate
  const previousCompleteness = qualityData.length > 1 ? qualityData[qualityData.length - 2].completeness : latestCompleteness
  const completenessChange = previousCompleteness ? ((latestCompleteness - previousCompleteness) / Math.max(previousCompleteness, 1)) * 100 : 0
  const completenessTrend: "up" | "down" = completenessChange >= 0 ? "up" : "down"

  const avgNoteLength = usageState.data?.avg_note_length ?? 0
  const projectedAvg = usageState.data?.projected_totals?.expected_avg_note_length ?? avgNoteLength
  const avgChange = projectedAvg ? ((avgNoteLength - projectedAvg) / Math.max(projectedAvg, 1)) * 100 : 0
  const avgTrend: "up" | "down" = avgChange >= 0 ? "up" : "down"

  const draftsCount = draftState.data?.drafts ?? 0
  const showQualityChart = qualityData.length > 0

  return (
    <div className="space-y-6">
      <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} onExport={() => console.log("Export note quality dashboard")} />

      {(usageState.error || complianceState.error || draftState.error) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-700">{usageState.error || complianceState.error || draftState.error}</div>
      )}

      {(usageState.loading || complianceState.loading || draftState.loading) && (
        <Badge variant="outline" className="text-xs">
          Loading note metrics…
        </Badge>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Notes"
          value={totalNotes.toLocaleString()}
          baseline={previousNotes.toLocaleString()}
          change={Math.round(Math.abs(notesChange))}
          changeType="increase"
          trend={notesTrend}
          icon={FileText}
          color="blue"
          description={draftsCount ? `${draftsCount} active drafts` : "Draft analytics unavailable"}
        />
        <MetricCard
          title="Beautify Actions"
          value={beautifyTotal.toLocaleString()}
          baseline={previousBeautify.toLocaleString()}
          change={Math.round(Math.abs(beautifyChange))}
          changeType="increase"
          trend={beautifyTrend}
          icon={Zap}
          color="green"
          description={totalNotes ? `${Math.round((beautifyTotal / Math.max(totalNotes, 1)) * 100)}% of notes` : "Usage data unavailable"}
        />
        <MetricCard
          title="Note Completeness"
          value={`${latestCompleteness.toFixed(1)}%`}
          baseline={`${previousCompleteness.toFixed(1)}%`}
          change={Math.round(Math.abs(completenessChange))}
          changeType="increase"
          trend={completenessTrend}
          icon={CheckCircle}
          color="purple"
          description="Target: ≥95%"
        />
        <MetricCard
          title="Avg Note Length"
          value={`${Math.round(avgNoteLength)} words`}
          baseline={`${Math.round(projectedAvg)} words`}
          change={Math.round(Math.abs(avgChange))}
          changeType="increase"
          trend={avgTrend}
          icon={Brain}
          color="orange"
          description="Projected average based on recent usage"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Note Quality Metrics</CardTitle>
                <CardDescription>Daily completeness and accuracy</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!showQualityChart ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No quality trend data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={qualityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="completeness" stroke="#3b82f6" strokeWidth={2} name="Completeness %" />
                  <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} name="Accuracy %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Beautify Usage</CardTitle>
            <CardDescription>Daily beautify actions performed</CardDescription>
          </CardHeader>
          <CardContent>
            {!showQualityChart ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No usage data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={qualityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="beauty" fill="#8b5cf6" name="Beautify Actions" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface StaffPerformanceDashboardProps {
  filters: AnalyticsFilters
  onFiltersChange: (updates: Partial<AnalyticsFilters>) => void
}

function StaffPerformanceDashboard({ filters, onFiltersChange }: StaffPerformanceDashboardProps) {
  const staffData = [
    { name: "Dr. Johnson", notes: 145, accuracy: 94, efficiency: 87, revenue: 28450 },
    { name: "Dr. Smith", notes: 132, accuracy: 91, efficiency: 92, revenue: 25680 },
    { name: "NP Williams", notes: 98, accuracy: 89, efficiency: 88, revenue: 18920 },
    { name: "Dr. Brown", notes: 156, accuracy: 96, efficiency: 85, revenue: 31200 },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-600" />
          <span className="font-medium text-amber-800">Admin Access Required</span>
        </div>
        <p className="text-sm text-amber-700 mt-1">This dashboard contains sensitive staff performance data and is only accessible to administrators.</p>
      </div>

      <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} onExport={() => console.log("Export staff performance dashboard")} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Team Productivity" value="127%" baseline="100%" change={27.0} changeType="increase" trend="up" icon={TrendingUp} color="green" description="Above target" />
        <MetricCard title="Avg Coding Accuracy" value="92.5%" baseline="88.1%" change={5.0} changeType="increase" trend="up" icon={Target} color="blue" description="Target: 95%" />
        <MetricCard
          title="Documentation Speed"
          value="8.3 min/note"
          baseline="11.2 min/note"
          change={25.9}
          changeType="decrease"
          trend="down"
          icon={Clock}
          color="purple"
          description="Industry avg: 12 min"
        />
        <MetricCard title="Compliance Score" value="96.8%" baseline="92.4%" change={4.8} changeType="increase" trend="up" icon={Award} color="orange" description="Target: 98%" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Performance Comparison</CardTitle>
          <CardDescription>Individual clinician metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={staffData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Bar yAxisId="left" dataKey="accuracy" fill="#3b82f6" name="Accuracy %" />
              <Bar yAxisId="left" dataKey="efficiency" fill="#10b981" name="Efficiency %" />
              <Bar yAxisId="right" dataKey="notes" fill="#8b5cf6" name="Notes Count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

interface AnalyticsProps {
  userRole?: "admin" | "user"
}

export function Analytics({ userRole = "user" }: AnalyticsProps) {
  const [activeTab, setActiveTab] = useState("billing")
  const [usageState, setUsageState] = useState<DataState<UsageAnalyticsResponse>>({ data: null, loading: true, error: null })
  const [codingAccuracyState, setCodingAccuracyState] = useState<DataState<CodingAccuracyAnalyticsResponse>>({
    data: null,
    loading: true,
    error: null,
  })
  const [revenueState, setRevenueState] = useState<DataState<RevenueAnalyticsResponse>>({ data: null, loading: true, error: null })
  const [complianceState, setComplianceState] = useState<DataState<ComplianceAnalyticsResponse>>({
    data: null,
    loading: true,
    error: null,
  })
  const [draftAnalyticsState, setDraftAnalyticsState] = useState<DataState<DraftAnalyticsResponse>>({
    data: null,
    loading: true,
    error: null,
  })
  const [sessionHydrated, setSessionHydrated] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [filters, setFilters] = useState<AnalyticsFilters>(() => createDefaultFilters())
  const serializedFilters = useMemo(() => serializeFilters(filters), [filters])

  const handleFiltersChange = useCallback((updates: Partial<AnalyticsFilters>) => {
    setFilters((prev) => {
      const next: AnalyticsFilters = {
        ...prev,
        customRange: updates.customRange !== undefined ? updates.customRange : prev.customRange,
      }

      if (updates.datePreset) {
        next.datePreset = updates.datePreset
      }

      if (next.datePreset !== "custom") {
        next.customRange = null
      }

      if (updates.clinician !== undefined) {
        next.clinician = normalizeFilterValue(updates.clinician)
      }

      if (updates.clinic !== undefined) {
        next.clinic = normalizeFilterValue(updates.clinic)
      }

      if (updates.payer !== undefined) {
        next.payer = normalizeFilterValue(updates.payer)
      }

      return next
    })
  }, [])

  const loadAnalyticsData = useCallback(
    async (signal?: AbortSignal) => {
      setUsageState((prev) => ({ ...prev, loading: true, error: null }))
      setCodingAccuracyState((prev) => ({ ...prev, loading: true, error: null }))
      setRevenueState((prev) => ({ ...prev, loading: true, error: null }))
      setComplianceState((prev) => ({ ...prev, loading: true, error: null }))
      setDraftAnalyticsState((prev) => ({ ...prev, loading: true, error: null }))

      const toMessage = (reason: unknown): string => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return ""
        }
        if (reason instanceof Error) {
          return reason.message || "Unable to load analytics."
        }
        return "Unable to load analytics."
      }

      const query = buildAnalyticsQuery(filters)
      const suffix = query ? `?${query}` : ""

      const [usageResult, codingResult, revenueResult, complianceResult, draftsResult] = await Promise.allSettled([
        apiFetchJson<UsageAnalyticsResponse>(`/api/analytics/usage${suffix}`, { signal }),
        apiFetchJson<CodingAccuracyAnalyticsResponse>(`/api/analytics/coding-accuracy${suffix}`, { signal }),
        apiFetchJson<RevenueAnalyticsResponse>(`/api/analytics/revenue${suffix}`, { signal }),
        apiFetchJson<ComplianceAnalyticsResponse>(`/api/analytics/compliance${suffix}`, { signal }),
        apiFetchJson<DraftAnalyticsResponse>("/api/analytics/drafts", { signal }),
      ])

      if (signal?.aborted) {
        return
      }

      if (usageResult.status === "fulfilled") {
        setUsageState({ data: usageResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(usageResult.reason)
        if (message) {
          console.error("Failed to load usage analytics", usageResult.reason)
        }
        setUsageState((prev) => ({ data: prev.data, loading: false, error: message || prev.error || "Unable to load usage analytics." }))
      }

      if (codingResult.status === "fulfilled") {
        setCodingAccuracyState({ data: codingResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(codingResult.reason)
        if (message) {
          console.error("Failed to load coding accuracy analytics", codingResult.reason)
        }
        setCodingAccuracyState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load coding analytics.",
        }))
      }

      if (revenueResult.status === "fulfilled") {
        setRevenueState({ data: revenueResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(revenueResult.reason)
        if (message) {
          console.error("Failed to load revenue analytics", revenueResult.reason)
        }
        setRevenueState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load revenue analytics.",
        }))
      }

      if (complianceResult.status === "fulfilled") {
        setComplianceState({ data: complianceResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(complianceResult.reason)
        if (message) {
          console.error("Failed to load compliance analytics", complianceResult.reason)
        }
        setComplianceState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load compliance analytics.",
        }))
      }

      if (draftsResult.status === "fulfilled") {
        setDraftAnalyticsState({ data: draftsResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(draftsResult.reason)
        if (message) {
          console.error("Failed to load draft analytics", draftsResult.reason)
        }
        setDraftAnalyticsState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load draft analytics.",
        }))
      }
    },
    [filters],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadAnalyticsData(controller.signal).catch((error) => {
      if ((error as DOMException)?.name !== "AbortError") {
        console.error("Unexpected analytics load error", error)
      }
    })
    return () => controller.abort()
  }, [loadAnalyticsData, refreshCounter])

  const handleRefresh = useCallback(() => {
    setRefreshCounter((prev) => prev + 1)
  }, [])

  const currencyFormatter = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }), [])

  useEffect(() => {
    const controller = new AbortController()
    let mounted = true

    apiFetchJson<{ analyticsPreferences?: { activeTab?: string; filters?: StoredAnalyticsFilters } }>("/api/user/session", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data?.analyticsPreferences) {
          return
        }
        const prefs = data.analyticsPreferences
        if (prefs.activeTab) {
          setActiveTab(prefs.activeTab)
        }
        if (prefs.filters !== undefined) {
          setFilters(deserializeFilters(prefs.filters))
        }
      })
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Failed to load analytics preferences", error)
        }
      })
      .finally(() => {
        if (mounted) {
          setSessionHydrated(true)
        }
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!sessionHydrated) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      apiFetch("/api/user/session", {
        method: "PUT",
        jsonBody: {
          analyticsPreferences: { activeTab, filters: serializedFilters },
        },
        signal: controller.signal,
      }).catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Failed to persist analytics preferences", error)
        }
      })
    }, 400)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activeTab, serializedFilters, sessionHydrated])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">Comprehensive insights into your clinical documentation and billing performance</p>
        </div>
        <Badge variant="outline" className="text-xs">
          Last updated: {new Date().toLocaleDateString()}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Billing & Coding
          </TabsTrigger>
          <TabsTrigger value="outcomes" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Health Outcomes
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Note Quality
          </TabsTrigger>
          <TabsTrigger value="staff" disabled={userRole !== "admin"} className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Staff Performance
            {userRole !== "admin" && <Shield className="w-3 h-3 ml-1" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="space-y-6">
          <BillingCodingDashboard
            revenueState={revenueState}
            codingState={codingAccuracyState}
            usageState={usageState}
            currencyFormatter={currencyFormatter}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="outcomes" className="space-y-6">
          <HealthOutcomesDashboard filters={filters} onFiltersChange={handleFiltersChange} />
        </TabsContent>

        <TabsContent value="quality" className="space-y-6">
          <NoteQualityDashboard
            usageState={usageState}
            complianceState={complianceState}
            codingState={codingAccuracyState}
            draftState={draftAnalyticsState}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
          <StaffPerformanceDashboard filters={filters} onFiltersChange={handleFiltersChange} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
