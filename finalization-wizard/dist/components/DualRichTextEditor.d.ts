import type { PatientMetadata, VisitTranscriptEntry, WizardCodeItem } from './WorkflowWizard';
interface DualRichTextEditorProps {
    originalContent: string;
    aiEnhancedContent: string;
    patientSummaryContent: string;
    patientMetadata?: PatientMetadata;
    transcriptEntries?: VisitTranscriptEntry[];
    selectedCodes?: WizardCodeItem[];
    suggestedCodes?: WizardCodeItem[];
    reimbursementSummary?: {
        total?: number;
        codes?: Array<Record<string, unknown>>;
    };
    onAcceptAllChanges?: () => void;
    onReBeautify?: () => void;
    onContentChange?: (content: string, version: 'original' | 'enhanced' | 'summary') => void;
    onNavigateNext?: () => void;
    onNavigatePrevious?: () => void;
}
export declare function DualRichTextEditor({ originalContent, aiEnhancedContent, patientSummaryContent, patientMetadata, transcriptEntries, selectedCodes, suggestedCodes, reimbursementSummary, onAcceptAllChanges, onReBeautify, onContentChange, onNavigateNext, onNavigatePrevious }: DualRichTextEditorProps): import("react/jsx-runtime").JSX.Element;
export {};
