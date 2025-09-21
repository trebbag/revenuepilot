import { type ReactNode } from "react"

import { cn } from "../../../components/ui/utils"

interface CardProps {
  size?: "md" | "lg"
  children: ReactNode
  className?: string
}

export function Card({ size = "md", children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl shadow-primary/5",
        "ring-1 ring-border/20",
        size === "lg" ? "p-8" : "p-6",
        "w-full max-w-md mx-auto",
        className
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  logo?: ReactNode
  title: string
  subtitle?: string
  className?: string
}

export function CardHeader({ logo, title, subtitle, className }: CardHeaderProps) {
  return (
    <div className={cn("text-center mb-6", className)}>
      {logo && (
        <div className="flex justify-center mb-4">
          {logo}
        </div>
      )}

      <h1 className="text-card-foreground mb-2">
        {title}
      </h1>

      {subtitle && (
        <p className="text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("mt-6 pt-6 border-t border-border", className)}>
      {children}
    </div>
  )
}