import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import "../../../../../src/i18n.js"

import { FinalizationWizard } from "../WorkflowWizard"
import type { AttestationFormPayload, AttestationSubmitResult } from "../WorkflowWizard"

describe("FinalizationWizard attestation step", () => {
  it("submits attestation payload and renders recap", async () => {
    const submitSpy = vi.fn(
      async (payload: AttestationFormPayload): Promise<AttestationSubmitResult> => ({
        recap: {
          attestation: {
            attestedBy: payload.attestedBy,
            attestationText: payload.statement,
          },
          billingValidation: {
            estimatedReimbursement: 150,
          },
          payerChecklist: payload.payerChecklist ?? [],
        },
        canFinalize: true,
      }),
    )

    render(
      <FinalizationWizard
        selectedCodes={[]}
        suggestedCodes={[]}
        complianceItems={[]}
        noteContent="Draft note"
        reimbursementSummary={{
          total: 150,
          codes: [{ code: "99213", description: "Office visit", amount: 150 }],
        }}
        blockingIssues={["Document plan details for hypertension"]}
        transcriptEntries={[]}
        initialStep={5}
        canFinalize
        onSubmitAttestation={submitSpy}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Attested by/i), { target: { value: " Dr. Example " } })
    fireEvent.change(screen.getByLabelText(/Statement/i), { target: { value: " Reviewed and verified " } })
    fireEvent.change(screen.getByLabelText(/IP address/i), { target: { value: "203.0.113.1" } })
    fireEvent.change(screen.getByLabelText(/Digital signature/i), { target: { value: "sig-42" } })

    fireEvent.click(screen.getByRole("button", { name: /submit attestation/i }))

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1))
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attestedBy: "Dr. Example",
        statement: "Reviewed and verified",
        ipAddress: "203.0.113.1",
        signature: "sig-42",
      }),
    )

    const payloadArg = submitSpy.mock.calls[0]?.[0] as AttestationFormPayload
    expect(Array.isArray(payloadArg.payerChecklist)).toBe(true)
    const checklistStatuses = payloadArg.payerChecklist?.map((item) => item.status) ?? []
    expect(checklistStatuses.length).toBeGreaterThan(0)
    expect(checklistStatuses.every((status) => ["ready", "warning", "blocker"].includes(status ?? ""))).toBe(true)

    await waitFor(() => {
      expect(screen.getAllByText(/Recorded attestation/i).length).toBeGreaterThan(0)
    })

    const attestedByRow = screen.getByText(/Attested by:/i).closest("li")
    expect(attestedByRow).not.toBeNull()
    expect(attestedByRow).toHaveTextContent("Attested by: Dr. Example")

    const estimatedRow = screen.getByText(/Estimated reimbursement:/i).closest("li")
    expect(estimatedRow).not.toBeNull()
    expect(estimatedRow).toHaveTextContent("Estimated reimbursement: $150.00")

    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /Next Step/i })
      expect(nextButton).toBeEnabled()
    })
  })
})

