import { Fragment } from "react"

import { cn } from "../../../components/ui/utils"
import { Button } from "./Button"

interface FooterLinksProps {
  className?: string
}

const FOOTER_LINKS = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "HIPAA Notice", href: "#" },
]

export function FooterLinks({ className }: FooterLinksProps) {
  const handleOpen = (href: string) => {
    window.open(href, "_blank", "noopener")
  }

  return (
    <div className={cn("text-center space-y-2", className)}>
      <div className="flex flex-wrap justify-center items-center gap-1 text-sm">
        {FOOTER_LINKS.map((link, index) => (
          <Fragment key={link.label}>
            <Button variant="link" onClick={() => handleOpen(link.href)} className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto">
              {link.label}
            </Button>
            {index < FOOTER_LINKS.length - 1 && <span className="text-muted-foreground">•</span>}
          </Fragment>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Protected by industry-standard encryption</p>
    </div>
  )
}
