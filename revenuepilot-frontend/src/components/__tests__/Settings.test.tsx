import "../../test/setupDom"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  toastSuccess,
  toastError,
  fetchJsonMock
} = vi.hoisted(() => {
  return {
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    fetchJsonMock: vi.fn<
      [RequestInfo | URL, Record<string, any> | undefined],
      Promise<any>
    >()
  }
})

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError
  }
}))

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    apiFetchJson: (input: RequestInfo | URL, init?: Record<string, any>) => fetchJsonMock(input, init)
  }
})

import { Settings } from "../Settings"

describe("Settings", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("loads user preferences and updates suggestion toggles through the API", async () => {
    const preferencesResponse = {
      theme: "modern",
      categories: {
        codes: true,
        compliance: true,
        publicHealth: true,
        differentials: true
      },
      rules: [],
      lang: "en",
      summaryLang: "en",
      specialty: "family-medicine",
      payer: "medicare",
      region: "us-east",
      template: null,
      useLocalModels: false,
      useOfflineMode: false,
      agencies: ["CDC"],
      beautifyModel: null,
      suggestModel: null,
      summarizeModel: null,
      deidEngine: "regex"
    }

    const updatedPreferences = {
      ...preferencesResponse,
      categories: {
        ...preferencesResponse.categories,
        compliance: false
      }
    }

    fetchJsonMock.mockImplementation((input, init) => {
      if (input === "/api/user/preferences" && (!init || !("method" in init))) {
        return Promise.resolve(preferencesResponse)
      }
      if (input === "/api/user/preferences" && init?.method === "PUT") {
        return Promise.resolve(updatedPreferences)
      }
      return Promise.resolve({})
    })

    render(<Settings userRole="user" />)

    const toggle = await screen.findByTestId("suggestion-toggle-compliance")
    expect(toggle).toHaveAttribute("data-state", "checked")

    fireEvent.click(toggle)

    await waitFor(() => {
      const putCall = fetchJsonMock.mock.calls.find(([path, options]) =>
        path === "/api/user/preferences" && options?.method === "PUT"
      )
      expect(putCall).toBeTruthy()
      expect(putCall?.[1]?.jsonBody?.categories?.compliance).toBe(false)
    })

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Compliance Alerts disabled")
    })
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(toggle).toHaveAttribute("data-state", "unchecked"))
  })

  it("allows admins to save security configuration changes", async () => {
    const preferencesResponse = {
      theme: "modern",
      categories: {
        codes: true,
        compliance: true,
        publicHealth: true,
        differentials: true
      },
      rules: [],
      lang: "en",
      summaryLang: "en",
      specialty: "family-medicine",
      payer: "medicare",
      region: "us-east",
      template: null,
      useLocalModels: true,
      useOfflineMode: false,
      agencies: ["CDC"],
      beautifyModel: null,
      suggestModel: null,
      summarizeModel: null,
      deidEngine: "regex"
    }

    const securityResponse = {
      encryptionEnabled: true,
      auditLogEnabled: true
    }

    const updatedSecurity = {
      ...securityResponse,
      sessionTimeout: 30
    }

    fetchJsonMock.mockImplementation((input, init) => {
      if (input === "/api/user/preferences" && (!init || !("method" in init))) {
        return Promise.resolve(preferencesResponse)
      }
      if (input === "/api/user/preferences" && init?.method === "PUT") {
        return Promise.resolve(preferencesResponse)
      }
      if (input === "/api/integrations/ehr/config") {
        if (init?.method === "PUT") {
          return Promise.resolve(init.jsonBody)
        }
        return Promise.resolve({})
      }
      if (input === "/api/organization/settings") {
        if (init?.method === "PUT") {
          return Promise.resolve(init.jsonBody)
        }
        return Promise.resolve({})
      }
      if (input === "/api/security/config") {
        if (init?.method === "PUT") {
          expect(init.jsonBody).toEqual(updatedSecurity)
          return Promise.resolve(updatedSecurity)
        }
        return Promise.resolve(securityResponse)
      }
      return Promise.resolve({})
    })

    render(<Settings userRole="admin" />)

    const advancedTab = await screen.findByRole("tab", { name: /advanced/i })
    fireEvent.pointerDown(advancedTab)
    fireEvent.pointerUp(advancedTab)
    fireEvent.click(advancedTab)

    const editor = await screen.findByTestId("security-config-editor")
    await waitFor(() => expect(editor).toHaveValue(JSON.stringify(securityResponse, null, 2)))

    fireEvent.change(editor, {
      target: { value: JSON.stringify(updatedSecurity, null, 2) }
    })

    const saveButton = screen.getByTestId("security-config-save")
    fireEvent.click(saveButton)

    await waitFor(() => {
      const putCall = fetchJsonMock.mock.calls.find(([path, options]) =>
        path === "/api/security/config" && options?.method === "PUT"
      )
      expect(putCall?.[1]?.jsonBody).toEqual(updatedSecurity)
    })

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Security configuration saved")
    })
    expect(toastError).not.toHaveBeenCalled()
  })
})
