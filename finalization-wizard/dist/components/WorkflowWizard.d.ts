type CodeStatus = 'pending' | 'confirmed' | 'completed' | 'in-progress';
export type CodeClassification = 'code' | 'prevention' | 'diagnosis' | 'differential';
export interface WizardCodeItem extends Record<string, unknown> {
    id?: number | string;
    code?: string;
    title?: string;
    status?: CodeStatus;
    details?: string;
    description?: string;
    codeType?: string;
    docSupport?: string;
    stillValid?: boolean;
    confidence?: number;
    aiReasoning?: string;
    evidence?: string[];
    gaps?: string[];
    suggestedBy?: string;
    classification?: CodeClassification | CodeClassification[] | string | string[];
    category?: string;
    tags?: string[];
}
export interface WizardComplianceItem extends Record<string, unknown> {
    id?: number | string;
    code?: string;
    title?: string;
    description?: string;
    status?: CodeStatus;
    category?: string;
    severity?: 'low' | 'medium' | 'high';
}
export interface PatientMetadata extends Record<string, unknown> {
    patientId?: string;
    encounterId?: string;
    name?: string;
    age?: number;
    sex?: string;
    dob?: string;
    encounterDate?: string;
    providerName?: string;
}
export interface VisitTranscriptEntry extends Record<string, unknown> {
    id?: number | string;
    speaker?: string;
    text?: string;
    timestamp?: number | string;
    confidence?: number;
}
export interface WizardPatientQuestion {
    id: number;
    question: string;
    source: string;
    priority: 'high' | 'medium' | 'low';
    codeRelated: string;
    category: 'clinical' | 'administrative' | 'documentation';
}
export interface WizardProgressStep {
    id: number;
    title: string;
    status: 'pending' | 'in-progress' | 'completed';
}
export type WizardStepType = 'selected-codes' | 'suggested-codes' | 'loading' | 'dual-editor' | 'placeholder' | 'dispatch';
interface NormalizedWizardCodeItem extends WizardCodeItem {
    id: number;
    title: string;
    status: CodeStatus;
    details: string;
    codeType: string;
    category: 'ICD-10' | 'CPT' | 'Public Health';
    evidence: string[];
    gaps: string[];
    classifications: CodeClassification[];
}
export interface WizardStepData {
    id: number;
    title: string;
    description: string;
    type: WizardStepType;
    stepType?: 'selected' | 'suggested';
    totalSelected?: number;
    totalSuggestions?: number;
    items?: NormalizedWizardCodeItem[];
    progressSteps?: WizardProgressStep[];
    originalContent?: string;
    beautifiedContent?: string;
    patientSummaryContent?: string;
    patientQuestions?: WizardPatientQuestion[];
}
export interface WizardStepOverride extends Partial<Omit<WizardStepData, 'id'>> {
    id: number;
}
export interface FinalizeRequest {
    content: string;
    codes: string[];
    prevention: string[];
    diagnoses: string[];
    differentials: string[];
    compliance: string[];
    patient?: PatientMetadata;
}
export interface FinalizeResult {
    finalizedContent: string;
    codesSummary: Array<Record<string, unknown>>;
    reimbursementSummary: {
        total: number;
        codes: Array<Record<string, unknown>>;
    };
    exportReady: boolean;
    issues: Record<string, string[]>;
    [key: string]: unknown;
}
export interface FinalizationWizardProps {
    selectedCodes?: WizardCodeItem[];
    suggestedCodes?: WizardCodeItem[];
    complianceItems?: WizardComplianceItem[];
    noteContent?: string;
    patientMetadata?: PatientMetadata;
    reimbursementSummary?: {
        total?: number;
        codes?: Array<Record<string, unknown>>;
    };
    transcriptEntries?: VisitTranscriptEntry[];
    blockingIssues?: string[];
    stepOverrides?: WizardStepOverride[];
    onClose?: (result?: FinalizeResult) => void;
    onFinalize?: (request: FinalizeRequest) => Promise<FinalizeResult | void> | FinalizeResult | void;
    onStepChange?: (stepId: number, step: WizardStepData) => void;
}
export declare function FinalizationWizard({ selectedCodes, suggestedCodes, complianceItems, noteContent: incomingNoteContent, patientMetadata, reimbursementSummary, transcriptEntries, blockingIssues, stepOverrides, onClose, onFinalize, onStepChange, }: FinalizationWizardProps): import("react/jsx-runtime").JSX.Element;
export declare const WorkflowWizard: typeof FinalizationWizard;
export {};
