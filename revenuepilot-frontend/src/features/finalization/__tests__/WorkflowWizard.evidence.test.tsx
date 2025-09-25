import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

import "../../../../../src/i18n.js"

import * as api from "@/lib/api"
import { FinalizationWizard } from "../WorkflowWizard"

const MOCK_NOTE = [
  "Chief Complaint: Hypertension follow-up.",
  "History: Hypertension noted with elevated blood pressure despite medication.",
  "Assessment: Hypertension remains uncontrolled; medication management discussed.",
].join("\n")

describe("FinalizationWizard evidence anchors", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "apiFetchJson").mockResolvedValue(null as never)
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it("loads anchors and clears highlights when the card is hidden", async () => {
    const start = MOCK_NOTE.toLowerCase().indexOf("hypertension")
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (typeof input === "string" && input.includes("/api/ai/explain/anchors")) {
        return {
          anchors: [
            { start, end: start + "hypertension".length, phrase: "Hypertension", confidence: 0.9 },
          ],
        } as any
      }
      return null as any
    })

    render(
      <FinalizationWizard
        selectedCodes={[
          {
            id: 1,
            code: "I10",
            title: "Essential (primary) hypertension",
            description: "Essential (primary) hypertension",
            status: "pending",
            evidence: ["hypertension"],
            codeType: "ICD-10",
            confidence: 90,
          },
        ]}
        suggestedCodes={[]}
        complianceItems={[]}
        noteContent={MOCK_NOTE}
        transcriptEntries={[]}
        initialStep={1}
      />,
    )

    const whyTrigger = await screen.findByText(/Why was this suggested/i)
    fireEvent.mouseEnter(whyTrigger)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/ai/explain/anchors"), expect.anything()))

    await waitFor(() => expect(screen.getAllByTestId("note-highlight").length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole("button", { name: /^Keep$/i }))
    fireEvent.click(screen.getByRole("button", { name: /Hide Done/i }))

    await waitFor(() => expect(screen.queryAllByTestId("note-highlight")).toHaveLength(0))
  })

  it("renders suggested codes in stable order", async () => {
    const suggestions = [
      {
        id: 21,
        code: "I10",
        title: "Hypertension follow-up",
        description: "Chronic hypertension with management plan",
        status: "pending",
        confidence: 92,
        codeType: "ICD-10",
      },
      {
        id: 22,
        code: "99214",
        title: "Medication management visit",
        description: "Established patient visit with moderate complexity",
        status: "pending",
        confidence: 78,
        codeType: "CPT",
      },
    ]

    const { container } = render(
      <FinalizationWizard
        selectedCodes={[]}
        suggestedCodes={suggestions}
        complianceItems={[]}
        noteContent={MOCK_NOTE}
        transcriptEntries={[]}
        initialStep={2}
      />,
    )

    const cardHeadings = Array.from(container.querySelectorAll(".card-floating-focus h4"))
    expect(cardHeadings).toHaveLength(2)
    expect(cardHeadings[0].textContent).toContain("Hypertension follow-up")
    expect(cardHeadings[1].textContent).toContain("Medication management visit")
  })

  it("moves kept suggestions into the selected list immediately", async () => {
    render(
      <FinalizationWizard
        selectedCodes={[]}
        suggestedCodes={[
          {
            id: 99,
            code: "I10",
            title: "Hypertension suggestion",
            description: "Suggested hypertension code",
            status: "pending",
            confidence: 90,
            codeType: "ICD-10",
          },
        ]}
        complianceItems={[]}
        noteContent={MOCK_NOTE}
        transcriptEntries={[]}
        initialStep={2}
      />,
    )

    const [keepButton] = await screen.findAllByRole("button", { name: /^Keep$/i })
    fireEvent.click(keepButton)

    await waitFor(() => expect(screen.getAllByText(/All items completed/i).length).toBeGreaterThan(0))

    const previousStepButton = screen
      .getAllByRole("button", { name: /Previous Step/i })
      .find((button) => !button.hasAttribute("disabled")) ??
      screen.getAllByRole("button", { name: /Previous Step/i })[0]
    fireEvent.click(previousStepButton)

    await waitFor(() => expect(screen.getAllByText(/Hypertension suggestion/i).length).toBeGreaterThan(0))
  })
})
