declare global {
    interface Window {
        noteEditorInsertText?: (value: string) => void;
    }
}
interface HighlightRange {
    start: number;
    end: number;
    className?: string;
    label?: string;
}
interface NoteEditorProps {
    content: string;
    onChange: (content: string) => void;
    highlightRanges?: HighlightRange[];
    disabled?: boolean;
    questionsCount?: number;
    onShowQuestions?: () => void;
    onInsertText?: (text: string) => void;
}
export declare function NoteEditor({ content, onChange, highlightRanges, disabled, questionsCount, onShowQuestions, onInsertText }: NoteEditorProps): import("react/jsx-runtime").JSX.Element;
export {};
