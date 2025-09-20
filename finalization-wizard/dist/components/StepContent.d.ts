interface Item {
    id: number;
    title: string;
    status?: 'pending' | 'completed' | 'in-progress' | 'confirmed';
    details?: string;
    priority?: 'high' | 'medium' | 'low';
    category?: 'ICD-10' | 'CPT' | 'Public Health';
    codeType?: string;
    why?: string;
    how?: string;
    what?: string;
    gaps?: string[];
    evidence?: string[];
    [key: string]: unknown;
}
interface PatientQuestion {
    id: number;
    question: string;
    source: string;
    priority: 'high' | 'medium' | 'low';
    codeRelated: string;
    category: 'clinical' | 'administrative' | 'documentation';
}
interface Step {
    id: number;
    title: string;
    description: string;
    type?: string;
    stepType?: 'selected' | 'suggested';
    totalSelected?: number;
    totalSuggestions?: number;
    items?: Item[];
    existingCodes?: any[];
    suggestedCodes?: any[];
    patientQuestions?: PatientQuestion[];
}
interface StepContentProps {
    step: Step;
    onNext: () => void;
    onPrevious: () => void;
    onActiveItemChange?: (item: Item | null) => void;
    onShowEvidence?: (show: boolean) => void;
    patientQuestions?: PatientQuestion[];
    onUpdatePatientQuestions?: (questions: PatientQuestion[]) => void;
    showPatientTray?: boolean;
    onShowPatientTray?: (show: boolean) => void;
    onInsertToNote?: (text: string) => void;
}
export declare function StepContent({ step, onNext, onPrevious, onActiveItemChange, onShowEvidence, patientQuestions, onUpdatePatientQuestions, showPatientTray: externalShowPatientTray, onShowPatientTray, onInsertToNote }: StepContentProps): import("react/jsx-runtime").JSX.Element;
export {};
