import { type ReactNode } from "react"

import { cn } from "../../../components/ui/utils"

interface BadgeProps {
  tone: "info" | "warning"
  children: ReactNode
  className?: string
}

const toneClasses: Record<BadgeProps["tone"], string> = {
  info:
    "bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  warning:
    "bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800"
}

export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center px-3 py-1.5 text-sm font-medium border rounded-full",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </div>
  )
}