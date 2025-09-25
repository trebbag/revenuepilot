import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ContextStageState } from "../../../hooks/useContextStage"
import type { ChartContextFacts } from "../useChartContext"
import { ChartContextPanel } from "../ChartContextPanel"

const indexedStageState: ContextStageState = {
  correlationId: null,
  stages: {
    superficial: { state: "completed" },
    deep: { state: "completed" },
    indexed: { state: "completed" },
  },
  profile: null,
  lastUpdated: null,
  bestStage: "indexed",
  availableStages: ["superficial", "deep", "indexed"],
  snapshotUrl: "/snapshot",
  contextGeneratedAt: "2024-02-01T00:00:00Z",
}

const runningStageState: ContextStageState = {
  correlationId: null,
  stages: {
    superficial: { state: "completed" },
    deep: { state: "running" },
  },
  profile: null,
  lastUpdated: null,
  bestStage: null,
  availableStages: ["superficial"],
  snapshotUrl: null,
  contextGeneratedAt: null,
}

const facts: ChartContextFacts = {
  pmh: [
    {
      label: "Hypertension",
      code: "I10",
      date: "2023-12-15",
      evidence: [
        {
          sourceDocId: "doc-1",
          page: 2,
          offset: 120,
        },
      ],
    },
  ],
  meds: [],
  allergies: [],
  labs: [],
  vitals: [],
  superficialSummary: null,
}

describe("ChartContextPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-02-10T00:00:00Z"))
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("renders chart facts and toggles provenance details", () => {
    const handleSearch = vi.fn()

    render(
      <ChartContextPanel
        patientId="PT-001"
        patientName="Pat Taylor"
        facts={facts}
        filteredFacts={null}
        documents={{ "doc-1": { docId: "doc-1", name: "Intake.pdf", pages: 5 } }}
        loading={false}
        error={null}
        searchQuery=""
        onSearchQueryChange={handleSearch}
        searching={false}
        searchError={null}
        stageState={indexedStageState}
        generatedAt="2024-02-01T00:00:00Z"
      />,
    )

    expect(screen.getByText("Readable chart")).toBeInTheDocument()
    expect(screen.getByText("Indexed context ready")).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText("Search chart facts"), { target: { value: "hyp" } })
    expect(handleSearch).toHaveBeenCalledWith("hyp")

    expect(screen.getByText("Hypertension")).toBeInTheDocument()
    expect(screen.getByText("I10")).toBeInTheDocument()
    expect(screen.getByText("Sources (1)")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Sources \(1\)/i }))
    expect(screen.getByText(/Intake.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/Page 2/)).toBeInTheDocument()
    expect(screen.getByText(/Offset 120/)).toBeInTheDocument()
  })

  it("shows pending stage messaging and search errors", () => {
    render(
      <ChartContextPanel
        patientId="PT-002"
        patientName=""
        facts={{ ...facts, pmh: [] }}
        filteredFacts={null}
        documents={{}}
        loading={false}
        error={null}
        searchQuery=""
        onSearchQueryChange={() => {}}
        searching={true}
        searchError="Search failed"
        stageState={runningStageState}
        generatedAt={null}
      />,
    )

    expect(screen.getByText("Patient ID: PT-002")).toBeInTheDocument()
    expect(screen.getByText("Search failed")).toBeInTheDocument()
    expect(screen.getByText(/Deep context is processing/i)).toBeInTheDocument()
    expect(screen.getByText(/No pmh details available/i)).toBeInTheDocument()
  })
})
