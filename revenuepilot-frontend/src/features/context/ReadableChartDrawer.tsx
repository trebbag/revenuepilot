import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "../../components/ui/drawer"
import { ChartContextPanel } from "./ChartContextPanel"
import { useChartContext } from "./useChartContext"

interface ReadableChartDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId?: string | null
  patientName?: string | null
}

export function ReadableChartDrawer({ open, onOpenChange, patientId, patientName }: ReadableChartDrawerProps) {
  const state = useChartContext(patientId, { enabled: open })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Readable chart</DrawerTitle>
        </DrawerHeader>
        <div className="mx-auto w-full max-w-5xl px-6 pb-10 pt-4">
          <ChartContextPanel
            patientId={patientId}
            patientName={patientName}
            facts={state.facts}
            filteredFacts={state.filteredFacts}
            documents={state.documents}
            loading={state.loading}
            error={state.error}
            searchQuery={state.searchQuery}
            onSearchQueryChange={state.setSearchQuery}
            searching={state.searching}
            searchError={state.searchError}
            stageState={state.stageState}
            generatedAt={state.generatedAt}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export default ReadableChartDrawer
