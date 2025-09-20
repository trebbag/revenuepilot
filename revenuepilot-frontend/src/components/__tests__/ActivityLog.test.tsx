import { describe, expect, it, beforeEach, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { ActivityLog } from "../ActivityLog"
import { apiFetchJson } from "../../lib/api"

vi.mock("../../lib/api", () => ({
  apiFetchJson: vi.fn()
}))

const mockedApiFetchJson = vi.mocked(apiFetchJson)

const baseProps = {
  currentUser: {
    id: "demo",
    name: "Demo",
    fullName: "Demo User",
    role: "admin" as const,
    specialty: "General"
  },
  userRole: "admin" as const
}

describe("ActivityLog", () => {
  beforeEach(() => {
    mockedApiFetchJson.mockReset()
  })

  it("renders activity entries returned by the API", async () => {
    mockedApiFetchJson.mockResolvedValueOnce({
      entries: [
        {
          id: 101,
          timestamp: "2024-03-14T15:30:22Z",
          username: "demo",
          action: "POST /api/notes",
          details: {
            description: "Created new note",
            category: "documentation",
            severity: "success",
            client: "10.0.0.1"
          }
        },
        {
          id: 102,
          timestamp: "2024-03-14T15:35:10Z",
          username: "demo",
          action: "PATCH /api/settings",
          details: {
            description: "Updated preferences",
            category: "settings",
            severity: "info"
          }
        }
      ],
      next: null,
      count: 2
    })

    render(<ActivityLog {...baseProps} />)

    expect(await screen.findByText("Created new note")).toBeInTheDocument()
    expect(screen.getByText("Updated preferences")).toBeInTheDocument()
    expect(screen.getByText("2 entries")).toBeInTheDocument()
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument()
  })

  it("shows an empty state when the API returns no entries", async () => {
    mockedApiFetchJson.mockResolvedValueOnce({ entries: [], next: null, count: 0 })

    render(<ActivityLog {...baseProps} />)

    expect(await screen.findByText("No activity has been recorded yet.")).toBeInTheDocument()
  })

  it("surfaces error state and allows retry", async () => {
    mockedApiFetchJson.mockRejectedValueOnce(new Error("Server offline"))
    mockedApiFetchJson.mockResolvedValueOnce({
      entries: [
        {
          id: 301,
          timestamp: "2024-03-15T09:00:00Z",
          username: "demo",
          action: "GET /api/activity/log",
          details: {
            description: "Manual refresh",
            category: "system",
            severity: "info"
          }
        }
      ],
      next: null,
      count: 1
    })

    render(<ActivityLog {...baseProps} />)

    expect(await screen.findByText("Server offline")).toBeInTheDocument()

    const retryButton = screen.getByRole("button", { name: /retry/i })
    fireEvent.click(retryButton)

    expect(await screen.findByText("Manual refresh")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText("Server offline")).not.toBeInTheDocument()
    })
  })
})

