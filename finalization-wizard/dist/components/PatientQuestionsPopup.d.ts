interface PatientQuestion {
    id: number;
    question: string;
    source: string;
    priority: 'high' | 'medium' | 'low';
    codeRelated: string;
    category: 'clinical' | 'administrative' | 'documentation';
    explanation?: string;
}
interface PatientQuestionsPopupProps {
    questions: PatientQuestion[];
    isOpen: boolean;
    onClose: () => void;
    onUpdateQuestions: (questions: PatientQuestion[]) => void;
    onInsertToNote?: (text: string, questionId: number) => void;
}
export declare function PatientQuestionsPopup({ questions, isOpen, onClose, onUpdateQuestions, onInsertToNote }: PatientQuestionsPopupProps): import("react/jsx-runtime").JSX.Element;
export {};
