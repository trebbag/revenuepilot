import { Loader2 } from "lucide-react"
import { type ReactNode } from "react"

import { cn } from "../../../components/ui/utils"

interface ButtonProps {
  variant?: "primary" | "secondary" | "link" | "ghost"
  state?: "default" | "hover" | "pressed" | "loading" | "disabled"
  size?: "sm" | "md" | "lg"
  iconLeft?: ReactNode
  iconRight?: ReactNode
  children: ReactNode
  onClick?: () => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  loading?: boolean
  className?: string
  fullWidth?: boolean
}

export function Button({
  variant = "primary",
  state = "default",
  size = "md",
  iconLeft,
  iconRight,
  children,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  className,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || state === "disabled" || loading
  const isLoading = loading || state === "loading"

  const baseClasses = cn(
    "inline-flex items-center justify-center font-medium transition-all duration-200",
    "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    fullWidth && "w-full",
  )

  const sizeClasses = cn(size === "sm" && "px-3 py-2 text-sm rounded-md gap-1.5", size === "md" && "px-4 py-2.5 text-sm rounded-lg gap-2", size === "lg" && "px-6 py-3.5 text-base rounded-lg gap-2")

  const variantClasses = cn(
    variant === "primary" && [
      "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border border-primary/20 shadow-lg shadow-primary/25",
      "hover:from-primary/90 hover:to-primary/80 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5",
      "active:from-primary/80 active:to-primary/70 active:translate-y-0 active:shadow-md",
      "focus:ring-primary/30",
    ],
    variant === "secondary" && [
      "bg-gradient-to-r from-secondary to-secondary/95 text-secondary-foreground border border-border/50 shadow-sm",
      "hover:from-secondary/90 hover:to-secondary/85 hover:border-border/70 hover:shadow-md",
      "active:from-secondary/80 active:to-secondary/75",
      "focus:ring-secondary/20",
    ],
    variant === "ghost" && [
      "bg-transparent text-foreground border border-transparent",
      "hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/40 active:from-accent/60 active:to-accent/50",
      "focus:ring-accent/20",
    ],
    variant === "link" && [
      "bg-transparent text-primary border-none p-0 h-auto",
      "hover:text-primary/80 active:text-primary/60 underline-offset-4 hover:underline",
      "focus:ring-primary/20 focus:ring-offset-0",
    ],
  )

  return (
    <button type={type} onClick={onClick} disabled={isDisabled} className={cn(baseClasses, variant !== "link" && sizeClasses, variantClasses, className)}>
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {variant !== "link" && children}
        </>
      ) : (
        <>
          {iconLeft && <span className="flex-shrink-0">{iconLeft}</span>}
          {children}
          {iconRight && <span className="flex-shrink-0">{iconRight}</span>}
        </>
      )}
    </button>
  )
}
