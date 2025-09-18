import { Button } from "./components/ui/button"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { SessionProvider, useSession } from "./contexts/SessionContext"
import { ProtectedApp } from "./ProtectedApp"

interface FullscreenMessageProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

function FullscreenMessage({ title, description, actionLabel, onAction }: FullscreenMessageProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
        {actionLabel && onAction && (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function AppShell() {
  const { status, checking, refresh } = useAuth()
  const { hydrated, actions } = useSession()

  if (checking) {
    return (
      <FullscreenMessage
        title="Signing you in"
        description="Checking your authentication status."
      />
    )
  }

  if (status !== "authenticated") {
    return (
      <FullscreenMessage
        title="Authentication required"
        description="Your session has ended. Please sign in again to continue."
        actionLabel="Retry"
        onAction={() => refresh()}
      />
    )
  }

  if (!hydrated) {
    return (
      <FullscreenMessage
        title="Preparing your workspace"
        description="Loading your session data and layout preferences."
        actionLabel="Reload"
        onAction={() => actions.refresh()}
      />
    )
  }

  return <ProtectedApp />
}

export default function App() {
  return (
    <AuthProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </AuthProvider>
  )
}
