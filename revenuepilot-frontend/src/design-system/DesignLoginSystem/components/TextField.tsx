import { useState } from "react"
import { Eye, EyeOff, User, Lock, Mail } from "lucide-react"

import { cn } from "../../../components/ui/utils"

interface TextFieldProps {
  type?: "text" | "email" | "password" | "code"
  state?: "default" | "focus" | "error" | "disabled"
  size?: "md" | "lg"
  iconLeft?: "none" | "user" | "lock" | "mail"
  iconRight?: "none" | "visibility" | "visibility_off"
  label?: string
  placeholder?: string
  helperText?: string
  errorMessage?: string
  value?: string
  onChange?: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  maxLength?: number
  pattern?: string
  autoComplete?: string
  className?: string
}

const iconMap = {
  user: User,
  lock: Lock,
  mail: Mail,
} as const

export function TextField({
  type = "text",
  state = "default",
  size = "md",
  iconLeft = "none",
  iconRight = "none",
  label,
  placeholder,
  helperText,
  errorMessage,
  value,
  onChange,
  onFocus,
  onBlur,
  disabled = false,
  required = false,
  id,
  name,
  maxLength,
  pattern,
  autoComplete,
  className,
}: TextFieldProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const LeftIcon = iconLeft !== "none" ? iconMap[iconLeft] : null
  const isPassword = type === "password"
  const inputType = isPassword && showPassword ? "text" : type

  const hasError = state === "error" || Boolean(errorMessage)
  const isDisabled = disabled || state === "disabled"

  const containerClasses = cn("relative w-full", size === "lg" ? "mb-6" : "mb-4", className)

  const inputClasses = cn(
    "w-full border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2",
    "bg-input-background text-foreground placeholder:text-muted-foreground",
    "shadow-sm hover:shadow-md focus:shadow-lg",
    size === "lg" ? "px-4 py-3.5" : "px-3.5 py-3",
    LeftIcon && (size === "lg" ? "pl-11" : "pl-10"),
    (isPassword || iconRight !== "none") && (size === "lg" ? "pr-11" : "pr-10"),
    hasError && "border-destructive bg-destructive/5 focus:ring-destructive/20",
    !hasError && isFocused && "border-primary/60 bg-background focus:ring-primary/20 ring-1 ring-primary/10",
    !hasError && !isFocused && "border-border/60 hover:border-border",
    isDisabled && "opacity-50 cursor-not-allowed bg-muted",
    type === "code" && "text-center tracking-wider font-mono",
  )

  const iconClasses = cn(
    "absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-colors",
    size === "lg" ? "w-5 h-5" : "w-4 h-4",
    hasError && "text-destructive",
    isFocused && !hasError && "text-primary",
  )

  const handleFocus = () => {
    setIsFocused(true)
    onFocus?.()
  }

  const handleBlur = () => {
    setIsFocused(false)
    onBlur?.()
  }

  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={id} className={cn("block mb-2 text-foreground", required && "after:content-['*'] after:text-destructive after:ml-1")}>
          {label}
        </label>
      )}

      <div className="relative">
        {LeftIcon && <LeftIcon className={cn(iconClasses, size === "lg" ? "left-3.5" : "left-3")} />}

        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={isDisabled}
          required={required}
          maxLength={maxLength}
          pattern={pattern}
          autoComplete={autoComplete}
          className={inputClasses}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className={cn(iconClasses, size === "lg" ? "right-3.5" : "right-3", "hover:text-foreground focus:text-foreground")}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>

      {hasError && errorMessage && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      {!hasError && helperText && (
        <p id={`${id}-helper`} className="mt-1.5 text-sm text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  )
}
