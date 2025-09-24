import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest"

import { WorkflowWizard } from "../WorkflowWizard"

vi.mock("motion/react", () => {
  const React = require("react")

  const sanitizeProps = (props: Record<string, unknown>) => {
    const clone: Record<string, unknown> = {}
    Object.entries(props).forEach(([key, value]) => {
      if (
        key === "animate" ||
        key === "initial" ||
        key === "transition" ||
        key === "exit" ||
        key === "whileHover" ||
        key === "whileTap" ||
        key === "layout" ||
        key === "variants"
      ) {
        return
      }
      clone[key] = value
    })
    return clone
  }

  const createComponent = (tag: string) =>
    React.forwardRef<HTMLElement, any>(({ children, ...props }, ref) =>
      React.createElement(tag, { ref, ...sanitizeProps(props) }, children),
    )

  const motion = new Proxy(
    {},
    {
      get: (_target, key: string) => {
        switch (key) {
          case "button":
            return createComponent("button")
          case "span":
            return createComponent("span")
          default:
            return createComponent("div")
        }
      },
    },
  )

  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

class ResizeObserver {
  observe() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}

vi.stubGlobal("ResizeObserver", ResizeObserver)

const baseSelectedCodes = [
  {
    id: "code-1",
    code: "99213",
    title: "Established patient visit",
    description: "Established patient office visit",
    classification: ["code"],
    status: "pending",
  },
]

const basePatient = {
  name: "Rivka Doe",
  patientId: "patient-1",
  encounterId: "enc-1",
  encounterDate: "2024-03-01",
}

const composeJobInProgress = {
  composeId: 42,
  status: "in_progress",
  stage: "beautifying_language",
  progress: 0.85,
  steps: [
    { id: 1, stage: "analyzing", status: "completed", progress: 0.15 },
    { id: 2, stage: "enhancing_structure", status: "completed", progress: 0.35 },
    { id: 3, stage: "beautifying_language", status: "in_progress", progress: 0.85 },
    { id: 4, stage: "final_review", status: "pending", progress: 0.0 },
  ],
  result: null,
  validation: null,
}

const composeJobCompleted = {
  composeId: 42,
  status: "completed",
  stage: "final_review",
  progress: 1.0,
  steps: [
    { id: 1, stage: "analyzing", status: "completed", progress: 0.15 },
    { id: 2, stage: "enhancing_structure", status: "completed", progress: 0.35 },
    { id: 3, stage: "beautifying_language", status: "completed", progress: 0.85 },
    { id: 4, stage: "final_review", status: "completed", progress: 1.0 },
  ],
  result: {
    beautifiedNote: "Server enhanced documentation",
    patientSummary: "Patient-friendly summary content",
    mode: "remote",
  },
  validation: { ok: true, issues: {} },
}

describe("WorkflowWizard compose integration", () => {
  const baseProps = {
    selectedCodes: baseSelectedCodes,
    suggestedCodes: [],
    complianceItems: [],
    noteContent: "Comprehensive visit note covering diagnosis and plan.",
    patientMetadata: basePatient,
    transcriptEntries: [],
    reimbursementSummary: { total: 0, codes: [] },
    blockingIssues: [],
    onClose: vi.fn(),
    onFinalize: vi.fn(),
    onStepChange: vi.fn(),
    onRequestCompose: vi.fn(),
  }

  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterAll(() => {
    consoleSpy.mockRestore()
  })

  it("displays compose progress and enables continue once validation passes", async () => {
    const { rerender } = render(
      <WorkflowWizard
        {...baseProps}
        initialStep={3}
        composeJob={composeJobInProgress}
        composeError={null}
      />,
    )

    expect(screen.getByText("Analyzing Content")).toBeInTheDocument()
    expect(screen.getByText("Enhancing Structure")).toBeInTheDocument()
    expect(screen.getByText("Beautifying Language")).toBeInTheDocument()
    expect(screen.getByText("Final Review")).toBeInTheDocument()

    let continueButton = screen.getByRole("button", { name: /Continue to Compare & Edit/i })
    expect(continueButton).toBeDisabled()

    rerender(
      <WorkflowWizard
        {...baseProps}
        initialStep={3}
        composeJob={composeJobCompleted}
        composeError={null}
      />,
    )

    await waitFor(() => {
      continueButton = screen.getByRole("button", { name: /Continue to Compare & Edit/i })
      expect(continueButton).toBeEnabled()
    })
  })

  it("surfaces enhanced previews after compose completion", async () => {
    const { rerender } = render(
      <WorkflowWizard
        {...baseProps}
        initialStep={3}
        composeJob={composeJobInProgress}
        composeError={null}
      />,
    )

    rerender(
      <WorkflowWizard
        {...baseProps}
        initialStep={3}
        composeJob={composeJobCompleted}
        composeError={null}
      />,
    )

    const [continueButton] = screen.getAllByRole("button", { name: /Continue to Compare & Edit/i })
    expect(continueButton).toBeEnabled()
    fireEvent.click(continueButton)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Server enhanced documentation")).toBeInTheDocument()
    })

    const toggleButton = screen.getByRole("button", { name: /Switch to Summary/i })
    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Patient-friendly summary content")).toBeInTheDocument()
    })
  })
})
