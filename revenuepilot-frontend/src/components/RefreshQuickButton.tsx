import { memo } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"

interface Props {
  enabled: boolean
  reason?: string
  busy?: boolean
  onClick: () => void
}

export default memo(function RefreshQuickButton({ enabled, reason, busy, onClick }: Props) {
  // Matches top-right action buttons: ghost, small, h-9, px-4
  const btn = (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 px-4"
      disabled={!enabled || busy}
      aria-disabled={!enabled || busy}
      aria-label="Refresh suggestions (quick)"
      data-testid="refresh-quick-btn"
      onClick={onClick}
    >
      <RotateCcw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      Refresh (quick)
    </Button>
  )

  // Mirror our UI’s tooltip pattern
  return reason ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-xs text-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    btn
  )
})
