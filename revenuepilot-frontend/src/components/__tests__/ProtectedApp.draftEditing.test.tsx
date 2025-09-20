import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const {
  noteEditorPropsSpy,
  sessionResetSpy,
  apiFetchMock,
  apiFetchJsonMock
} = vi.hoisted(() => ({
  noteEditorPropsSpy: vi.fn(),
  sessionResetSpy: vi.fn(),
  apiFetchMock: vi.fn<[
    RequestInfo | URL,
    Record<string, any> | undefined
  ], Promise<Response>>(),
  apiFetchJsonMock: vi.fn<[
    RequestInfo | URL,
    Record<string, any> | undefined
  ], Promise<any>>()
}))

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Test User", role: "user" },
    status: "authenticated",
    checking: false,
    hasPermission: () => true
  })
}))

vi.mock("../../contexts/SessionContext", () => ({
  useSession: () => ({
    state: {
      selectedCodes: { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
      selectedCodesList: [],
      addedCodes: [],
      isSuggestionPanelOpen: false,
      layout: { noteEditor: 70, suggestionPanel: 30 }
    },
    hydrated: true,
    syncing: false,
    actions: {
      addCode: vi.fn(),
      removeCode: vi.fn(),
      changeCodeCategory: vi.fn(),
      setSuggestionPanelOpen: vi.fn(),
      setLayout: vi.fn(),
      refresh: vi.fn(),
      reset: sessionResetSpy
    }
  })
}))

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetch: apiFetchMock,
    apiFetchJson: apiFetchJsonMock
  }
})

vi.mock("../NavigationSidebar", () => ({
  NavigationSidebar: ({ onNavigate }: { onNavigate: (view: string) => void }) => (
    <div>
      <button data-testid="nav-drafts" onClick={() => onNavigate("drafts")}>Drafts</button>
      <button data-testid="nav-app" onClick={() => onNavigate("app")}>Editor</button>
    </div>
  )
}))

vi.mock("../Drafts", () => ({
  Drafts: ({ onEditDraft }: { onEditDraft?: (id: string) => void }) => (
    <div>
      <button data-testid="load-draft" onClick={() => onEditDraft?.("draft-42")}>Load Draft</button>
    </div>
  )
}))

vi.mock("../NoteEditor", () => ({
  NoteEditor: (props: any) => {
    noteEditorPropsSpy(props)
    return <div data-testid="note-editor" data-note-id={props.initialNoteData?.noteId ?? "none"} />
  }
}))

vi.mock("../SelectedCodesBar", () => ({
  SelectedCodesBar: () => <div data-testid="selected-codes" />
}))

vi.mock("../SuggestionPanel", () => ({
  SuggestionPanel: () => <div data-testid="suggestion-panel" />
}))

vi.mock("../Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard" />
}))

vi.mock("../Analytics", () => ({
  Analytics: () => <div data-testid="analytics" />
}))

vi.mock("../Settings", () => ({
  Settings: () => <div data-testid="settings" />
}))

vi.mock("../ActivityLog", () => ({
  ActivityLog: () => <div data-testid="activity-log" />
}))

vi.mock("../Schedule", () => ({
  Schedule: () => <div data-testid="schedule" />
}))

vi.mock("../Builder", () => ({
  Builder: () => <div data-testid="builder" />
}))

vi.mock("../StyleGuide", () => ({
  StyleGuide: () => <div data-testid="style-guide" />
}))

vi.mock("../FigmaComponentLibrary", () => ({
  FigmaComponentLibrary: () => <div data-testid="figma-library" />
}))

vi.mock("../ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Sidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarTrigger: ({ onClick }: { onClick?: () => void }) => (
    <button data-testid="sidebar-trigger" onClick={onClick}>Toggle</button>
  )
}))

vi.mock("../ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock("../ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />
}))

import { ProtectedApp } from "../../ProtectedApp"

const resolveUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  return (input as Request).url
}

describe("ProtectedApp draft editing", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  beforeEach(() => {
    noteEditorPropsSpy.mockClear()
    sessionResetSpy.mockClear()
    apiFetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }))
    apiFetchJsonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveUrl(input)
      if (url.startsWith("/api/notes/versions/")) {
        return [
          {
            content: "Patient ID: PT-42\nEncounter ID: ENC-42\nDraft body",
            timestamp: "2024-01-01T00:00:00Z"
          }
        ]
      }
      if (url === "/api/notes/drafts") {
        return [
          { id: 42, content: "Patient ID: PT-42\nEncounter ID: ENC-42\nDraft body" }
        ]
      }
      if (url === "/api/analytics/drafts") {
        return { drafts: 1 }
      }
      if (url === "/api/user/session") {
        return {}
      }
      return []
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("loads the selected draft and forwards it to the editor", async () => {
    render(<ProtectedApp />)

    fireEvent.click(await screen.findByTestId("nav-drafts"))

    fireEvent.click(await screen.findByTestId("load-draft"))

    await waitFor(() => {
      expect(noteEditorPropsSpy.mock.calls.some(([props]) => props?.initialNoteData?.noteId === "42" && props.initialNoteData.content.includes("Draft body"))).toBe(true)
    })

    expect(sessionResetSpy).toHaveBeenCalled()
    expect(apiFetchJsonMock).toHaveBeenCalledWith("/api/notes/versions/42", expect.any(Object))

    const lastCall = noteEditorPropsSpy.mock.calls.find(([props]) => props?.initialNoteData?.noteId === "42")
    expect(lastCall?.[0]?.prePopulatedPatient).toMatchObject({ patientId: "PT-42", encounterId: "ENC-42" })
  })
})
