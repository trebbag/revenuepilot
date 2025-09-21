import { Check } from "lucide-react"
import { type MouseEvent } from "react"

import { cn } from "../../../components/ui/utils"

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  id?: string
  className?: string
}

export function Checkbox({ checked, onChange, label, disabled = false, id, className }: CheckboxProps) {
  const handleToggle = (event?: MouseEvent<HTMLButtonElement | HTMLLabelElement>) => {
    event?.preventDefault()
    if (!disabled) {
      onChange(!checked)
    }
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center w-4 h-4 border rounded transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-2",
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border bg-background hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {checked && <Check className="w-3 h-3" />}
      </button>

      <label
        id={`${id}-label`}
        className={cn(
          "text-sm text-foreground cursor-pointer select-none",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={handleToggle}
      >
        {label}
      </label>
    </div>
  )
}