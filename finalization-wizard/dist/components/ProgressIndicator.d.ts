interface Step {
    id: number;
    title: string;
    description: string;
}
interface ProgressIndicatorProps {
    steps: Step[];
    currentStep: number;
    onStepClick: (stepId: number) => void;
}
export declare function ProgressIndicator({ steps, currentStep, onStepClick }: ProgressIndicatorProps): import("react/jsx-runtime").JSX.Element;
export {};
