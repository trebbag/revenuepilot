import { AlertCircle, Info, CheckCircle, AlertTriangle, X } from "lucide-react"
import { type ReactNode } from "react"

import { cn } from "../../../components/ui/utils"

interface AlertProps {
  tone: "error" | "warning" | "info" | "success"
  dismissible?: boolean
  onDismiss?: () => void
  children: ReactNode
  className?: string
}

const iconMap = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
} as const

const toneClasses: Record<AlertProps["tone"], string> = {
  error: "bg-destructive/10 border-destructive/20 text-destructive",
  warning: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-200",
  info: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30 text-blue-800 dark:text-blue-200",
  success: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30 text-green-800 dark:text-green-200",
}

export function Alert({ tone, dismissible = false, onDismiss, children, className }: AlertProps) {
  const Icon = iconMap[tone]

  return (
    <div role="alert" className={cn("flex items-start gap-3 p-4 border rounded-lg", toneClasses[tone], className)}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />

      <div className="flex-1 text-sm leading-relaxed">{children}</div>

      {dismissible && onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors" aria-label="Dismiss alert">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
