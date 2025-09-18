import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Settings, X, Loader2 } from 'lucide-react';
import { ProgressIndicator } from './ProgressIndicator';
import { NoteEditor } from './NoteEditor';
import { StepContent } from './StepContent';
import { DualRichTextEditor } from './DualRichTextEditor';

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

export type WizardStepType =
  | 'selected-codes'
  | 'suggested-codes'
  | 'loading'
  | 'dual-editor'
  | 'placeholder'
  | 'dispatch';

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

interface NormalizedComplianceItem extends WizardComplianceItem {
  id: number;
  title: string;
  description: string;
  status: CodeStatus;
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
  stepOverrides?: WizardStepOverride[];
  onClose?: (result?: FinalizeResult) => void;
  onFinalize?: (
    request: FinalizeRequest
  ) => Promise<FinalizeResult | void> | FinalizeResult | void;
  onStepChange?: (stepId: number, step: WizardStepData) => void;
}

const composeProgressSteps: WizardProgressStep[] = [
  { id: 1, title: 'Analyzing Content', status: 'completed' },
  { id: 2, title: 'Enhancing Structure', status: 'completed' },
  { id: 3, title: 'Beautifying Language', status: 'in-progress' },
  { id: 4, title: 'Final Review', status: 'pending' },
];

const STATUS_ORDER: CodeStatus[] = ['pending', 'in-progress', 'confirmed', 'completed'];

function toNumberId(value: number | string | undefined, index: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return index + 1;
}

function inferCodeType(code?: string, explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit;
  }

  if (!code) {
    return 'ICD-10';
  }

  if (/^\d{4,5}$/.test(code)) {
    return 'CPT';
  }

  if (/^[A-Z][0-9A-Z]/i.test(code)) {
    return 'ICD-10';
  }

  return 'ICD-10';
}

function normalizeClassificationValue(value: string | undefined): CodeClassification | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes('differential')) return 'differential';
  if (normalized.includes('prevent')) return 'prevention';
  if (normalized.includes('diagn')) return 'diagnosis';
  if (normalized.includes('code') || normalized.includes('procedure')) return 'code';
  return undefined;
}

function normalizeClassifications(item: WizardCodeItem): CodeClassification[] {
  const values = new Set<CodeClassification>();

  const raw = item.classification;
  if (Array.isArray(raw)) {
    raw.forEach(entry => {
      if (typeof entry === 'string') {
        const normalized = normalizeClassificationValue(entry);
        if (normalized) values.add(normalized);
      }
    });
  } else if (typeof raw === 'string') {
    const normalized = normalizeClassificationValue(raw);
    if (normalized) values.add(normalized);
  }

  const category = typeof item.category === 'string' ? item.category.toLowerCase() : '';
  const categoryClassification = normalizeClassificationValue(category);
  if (categoryClassification) {
    values.add(categoryClassification);
  }

  if (Array.isArray(item.tags)) {
    item.tags.forEach(tag => {
      if (typeof tag === 'string') {
        const normalized = normalizeClassificationValue(tag);
        if (normalized) values.add(normalized);
      }
    });
  }

  if (item.codeType === 'CPT') {
    values.add('code');
  } else if ((item.codeType || '').toUpperCase() === 'ICD-10') {
    values.add('diagnosis');
  }

  if (item.code && /^\d{4,5}$/.test(item.code)) {
    values.add('code');
  }

  if (!values.size) {
    values.add('diagnosis');
  }

  return Array.from(values.values());
}

function normalizeStatus(status?: string): CodeStatus {
  if (status && STATUS_ORDER.includes(status as CodeStatus)) {
    return status as CodeStatus;
  }
  return 'pending';
}

function normalizeCodeItems(items?: WizardCodeItem[]): NormalizedWizardCodeItem[] {
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const id = toNumberId(item.id, index);
    const title = item.title || (item.code ? `${item.code}` : `Item ${index + 1}`);
    const status = normalizeStatus(item.status as string | undefined);
    const details = item.details || item.description || '';
    const codeType = inferCodeType(item.code, item.codeType);
    const category = codeType === 'CPT' ? 'CPT' : 'ICD-10';
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    const gaps = Array.isArray(item.gaps) ? item.gaps : [];
    const classifications = normalizeClassifications(item);

    return {
      ...item,
      id,
      title,
      status,
      details,
      codeType,
      category,
      evidence,
      gaps,
      classifications,
    };
  });
}

function normalizeComplianceItems(items?: WizardComplianceItem[]): NormalizedComplianceItem[] {
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const id = toNumberId(item.id, index);
    const title = item.title || item.code || `Compliance ${index + 1}`;
    const description = item.description || '';
    const status = normalizeStatus(item.status as string | undefined);

    return {
      ...item,
      id,
      title,
      description,
      status,
    };
  });
}

function createOverridesMap(overrides?: WizardStepOverride[]): Map<number, WizardStepOverride> {
  const map = new Map<number, WizardStepOverride>();
  if (!overrides) return map;
  overrides.forEach(entry => {
    if (entry && typeof entry.id === 'number') {
      map.set(entry.id, entry);
    }
  });
  return map;
}

function getPatientName(metadata?: PatientMetadata): string {
  return metadata?.name || 'Patient';
}

function getDefaultNoteContent(metadata?: PatientMetadata): string {
  const name = getPatientName(metadata);
  const date = metadata?.encounterDate || new Date().toLocaleDateString();
  return `PATIENT: ${name}\nDATE: ${date}\n\nCHIEF COMPLAINT:\nChest pain for 2 days.\n\nHISTORY OF PRESENT ILLNESS:\nPatient reports chest pain. Started 2 days ago. Pain is sharp. Located in precordial region. Intermittent. Worsens with activity. Smoking history 1 pack per day for 30 years.\n\nPHYSICAL EXAMINATION:\nGENERAL: Alert, oriented, comfortable at rest\nCARDIOVASCULAR: Regular rate and rhythm, no murmurs, no peripheral edema\nRESPIRATORY: Clear to auscultation bilaterally\nEXTREMITIES: No cyanosis, clubbing, or edema\n\nASSESSMENT:\nChest pain, likely musculoskeletal. Given smoking history and age, cardiac evaluation warranted.\n\nPLAN:\n1. EKG to rule out cardiac abnormalities\n2. Basic metabolic panel and lipid profile\n3. Consider stress testing if symptoms persist\n4. Smoking cessation counseling provided`;
}

function buildBeautifiedContent(note: string, metadata?: PatientMetadata): string {
  const content = note && note.trim() ? note : getDefaultNoteContent(metadata);
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.charAt(0).toUpperCase() + line.slice(1))
    .join('\n');
}

function buildPatientSummary(note: string, metadata?: PatientMetadata): string {
  const name = getPatientName(metadata);
  const date = metadata?.encounterDate || new Date().toLocaleDateString();
  const lines = note
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  const summary = lines.length
    ? lines.map(line => `• ${line}`).join('\n')
    : '• Documentation not yet available. Please review the clinical note for details.';

  return `VISIT SUMMARY FOR: ${name}\nDATE: ${date}\n\nKEY POINTS:\n${summary}`;
}

function formatComplianceSummary(count: number): string {
  if (!count) {
    return 'Final review, billing verification, and attestation';
  }

  if (count === 1) {
    return 'Review 1 compliance item prior to attestation';
  }

  return `Review ${count} compliance items prior to attestation`;
}

export function FinalizationWizard({
  selectedCodes = [],
  suggestedCodes = [],
  complianceItems = [],
  noteContent: incomingNoteContent = '',
  patientMetadata,
  stepOverrides,
  onClose,
  onFinalize,
  onStepChange,
}: FinalizationWizardProps) {
  const normalizedSelected = React.useMemo(
    () => normalizeCodeItems(selectedCodes),
    [selectedCodes],
  );
  const normalizedSuggested = React.useMemo(
    () => normalizeCodeItems(suggestedCodes),
    [suggestedCodes],
  );
  const normalizedCompliance = React.useMemo(
    () => normalizeComplianceItems(complianceItems),
    [complianceItems],
  );
  const overridesMap = React.useMemo(
    () => createOverridesMap(stepOverrides),
    [stepOverrides],
  );

  const defaultNoteRef = React.useRef(
    incomingNoteContent || getDefaultNoteContent(patientMetadata),
  );
  const [noteContent, setNoteContent] = React.useState<string>(
    defaultNoteRef.current,
  );
  const [beautifiedContent, setBeautifiedContent] = React.useState<string>(() =>
    buildBeautifiedContent(defaultNoteRef.current, patientMetadata),
  );
  const [summaryContent, setSummaryContent] = React.useState<string>(() =>
    buildPatientSummary(defaultNoteRef.current, patientMetadata),
  );
  const [currentStep, setCurrentStep] = React.useState<number>(1);
  const [activeItemData, setActiveItemData] = React.useState<
    NormalizedWizardCodeItem | null
  >(null);
  const [isShowingEvidence, setIsShowingEvidence] = React.useState(false);
  const [patientQuestions, setPatientQuestions] = React.useState<
    WizardPatientQuestion[]
  >([]);
  const [showPatientQuestions, setShowPatientQuestions] = React.useState(false);
  const [isFinalizing, setIsFinalizing] = React.useState(false);
  const [finalizeError, setFinalizeError] = React.useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = React.useState<
    FinalizeResult | null
  >(null);

  React.useEffect(() => {
    setFinalizeResult(null);
    setFinalizeError(null);
  }, [normalizedSelected, normalizedSuggested, normalizedCompliance, noteContent]);

  React.useEffect(() => {
    const nextDefault = incomingNoteContent || getDefaultNoteContent(patientMetadata);
    if (incomingNoteContent && incomingNoteContent !== noteContent) {
      setNoteContent(incomingNoteContent);
      setBeautifiedContent(
        buildBeautifiedContent(incomingNoteContent, patientMetadata),
      );
      setSummaryContent(
        buildPatientSummary(incomingNoteContent, patientMetadata),
      );
    } else if (!incomingNoteContent && noteContent === defaultNoteRef.current) {
      setNoteContent(nextDefault);
      setBeautifiedContent(buildBeautifiedContent(nextDefault, patientMetadata));
      setSummaryContent(buildPatientSummary(nextDefault, patientMetadata));
    }
    defaultNoteRef.current = nextDefault;
  }, [incomingNoteContent, patientMetadata, noteContent]);

  React.useEffect(() => {
    if (!normalizedSelected.length && !normalizedSuggested.length) {
      setCurrentStep(3);
    }
  }, [normalizedSelected.length, normalizedSuggested.length]);

  const steps = React.useMemo<WizardStepData[]>(() => {
    const complianceDescription = formatComplianceSummary(
      normalizedCompliance.length,
    );
    const finalizeDescription = isFinalizing
      ? 'Finalizing note and preparing export package...'
      : finalizeResult
      ? finalizeResult.exportReady
        ? 'Note finalized and ready for export'
        : 'Finalized with outstanding issues that need review'
      : 'Final confirmation and submission';

    const baseSteps: WizardStepData[] = [
      {
        id: 1,
        title: 'Code Review',
        description: 'Review and validate your selected diagnostic codes',
        type: 'selected-codes',
        stepType: 'selected',
        totalSelected: normalizedSelected.length,
        totalSuggestions: normalizedSuggested.length,
        items: normalizedSelected,
      },
      {
        id: 2,
        title: 'Suggestion Review',
        description: 'Evaluate AI-recommended diagnostic codes',
        type: 'suggested-codes',
        stepType: 'suggested',
        totalSelected: normalizedSelected.length,
        totalSuggestions: normalizedSuggested.length,
        items: normalizedSuggested,
      },
      {
        id: 3,
        title: 'Compose',
        description: 'AI beautification and enhancement',
        type: 'loading',
        progressSteps: composeProgressSteps,
      },
      {
        id: 4,
        title: 'Compare & Edit',
        description: 'Compare original draft with beautified version',
        type: 'dual-editor',
        originalContent: noteContent,
        beautifiedContent,
        patientSummaryContent: summaryContent,
      },
      {
        id: 5,
        title: 'Billing & Attest',
        description: complianceDescription,
        type: 'placeholder',
      },
      {
        id: 6,
        title: 'Sign & Dispatch',
        description: finalizeDescription,
        type: 'dispatch',
      },
    ];

    if (!overridesMap.size) {
      return baseSteps;
    }

    return baseSteps.map(step => {
      const override = overridesMap.get(step.id);
      return override ? { ...step, ...override } : step;
    });
  }, [
    normalizedSelected,
    normalizedSuggested,
    normalizedCompliance.length,
    noteContent,
    beautifiedContent,
    summaryContent,
    overridesMap,
    isFinalizing,
    finalizeResult,
  ]);

  React.useEffect(() => {
    if (!steps.length) return;
    const hasCurrent = steps.some(step => step.id === currentStep);
    if (!hasCurrent) {
      setCurrentStep(steps[0].id);
    }
  }, [steps, currentStep]);

  const currentStepData = React.useMemo(
    () => steps.find(step => step.id === currentStep) ?? steps[0],
    [steps, currentStep],
  );

  const goToStep = React.useCallback(
    (stepId: number) => {
      if (!steps.length) return;
      const fallback = steps[0];
      const target = steps.find(step => step.id === stepId) || fallback;
      setCurrentStep(target.id);
    },
    [steps],
  );

  React.useEffect(() => {
    if (!currentStepData) return;
    onStepChange?.(currentStepData.id, currentStepData);
  }, [currentStepData, onStepChange]);

  const generatePatientQuestions = React.useCallback(
    (stepsData: WizardStepData[]): WizardPatientQuestion[] => {
      const questions: WizardPatientQuestion[] = [];
      const selectedStep = stepsData.find(step => step.id === 1);
      selectedStep?.items?.forEach((item, itemIndex) => {
        item.gaps.forEach((gap, gapIndex) => {
          const idBase = item.id || itemIndex + 1;
          const questionId = Number.isFinite(idBase)
            ? Number(`${idBase}${gapIndex}`)
            : Date.now() + gapIndex;
          const lowerGap = gap.toLowerCase();
          const priority: WizardPatientQuestion['priority'] = lowerGap.includes('smok')
            ? 'high'
            : lowerGap.includes('lab') || lowerGap.includes('lipid')
            ? 'medium'
            : 'medium';
          questions.push({
            id: Number.isFinite(questionId) ? questionId : itemIndex * 100 + gapIndex,
            question: gap.endsWith('?') ? gap : `Can you clarify: ${gap}?`,
            source: `Code Gap: ${item.title}`,
            priority,
            codeRelated: item.code || item.title,
            category: 'clinical',
          });
        });
      });

      const suggestedStep = stepsData.find(step => step.id === 2);
      suggestedStep?.items?.forEach((item, itemIndex) => {
        if (item.classifications.includes('prevention')) {
          const idBase = item.id || itemIndex + 1;
          const questionId = Number.isFinite(idBase)
            ? Number(`${idBase}90`)
            : Date.now() + itemIndex;
          questions.push({
            id: Number.isFinite(questionId) ? questionId : itemIndex * 200,
            question: `What preventive documentation supports ${item.title}?`,
            source: `Prevention Opportunity: ${item.title}`,
            priority: 'low',
            codeRelated: item.code || item.title,
            category: 'clinical',
          });
        }
      });

      return questions;
    },
    [],
  );

  React.useEffect(() => {
    if (!steps.length) return;
    if (currentStep === 1 || currentStep === 2) {
      setPatientQuestions(generatePatientQuestions(steps));
    }
  }, [currentStep, steps, generatePatientQuestions]);

  const handleNoteChange = React.useCallback(
    (value: string) => {
      setNoteContent(value);
      setBeautifiedContent(buildBeautifiedContent(value, patientMetadata));
      setSummaryContent(buildPatientSummary(value, patientMetadata));
    },
    [patientMetadata],
  );

  const handleInsertTextToNote = React.useCallback(
    (text: string) => {
      if (!text) return;
      let insertPosition = noteContent.length;

      const lowerText = text.toLowerCase();
      if (lowerText.includes('smoking') || lowerText.includes('cigarette')) {
        const historyIndex = noteContent.indexOf('HISTORY OF PRESENT ILLNESS:');
        if (historyIndex !== -1) {
          const sectionEnd = noteContent.indexOf('\n\n', historyIndex);
          insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length;
        }
      } else if (lowerText.includes('weight') || lowerText.includes('bmi')) {
        const examIndex = noteContent.indexOf('PHYSICAL EXAMINATION:');
        if (examIndex !== -1) {
          const sectionEnd = noteContent.indexOf('\n\n', examIndex);
          insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length;
        }
      } else if (lowerText.includes('family history')) {
        const assessmentIndex = noteContent.indexOf('ASSESSMENT:');
        if (assessmentIndex !== -1) {
          insertPosition = assessmentIndex;
        }
      }

      const formattedText = `\n\nADDITIONAL INFORMATION:\n${text}`;
      const newContent =
        noteContent.slice(0, insertPosition) + formattedText + noteContent.slice(insertPosition);
      handleNoteChange(newContent);
    },
    [noteContent, handleNoteChange],
  );

  const highlightRanges = React.useMemo(() => {
    if (!activeItemData || !noteContent || !isShowingEvidence) return [];

    const evidenceTexts = Array.isArray(activeItemData.evidence)
      ? activeItemData.evidence
      : [];

    return evidenceTexts.reduce<
      Array<{
        start: number;
        end: number;
        className: string;
        label: string;
        text: string;
      }>
    >((acc, evidenceText, index) => {
      const startIndex = noteContent.toLowerCase().indexOf(evidenceText.toLowerCase());
      if (startIndex !== -1) {
        acc.push({
          start: startIndex,
          end: startIndex + evidenceText.length,
          className:
            index % 3 === 0
              ? 'highlight-blue'
              : index % 3 === 1
              ? 'highlight-emerald'
              : 'highlight-amber',
          label: `Evidence ${index + 1}`,
          text: evidenceText,
        });
      }
      return acc;
    }, []);
  }, [activeItemData, noteContent, isShowingEvidence]);

  const buildFinalizeRequest = React.useCallback((): FinalizeRequest => {
    const codes = new Set<string>();
    const prevention = new Set<string>();
    const diagnoses = new Set<string>();
    const differentials = new Set<string>();
    const complianceSet = new Set<string>();

    const assignCodes = (item: NormalizedWizardCodeItem) => {
      const identifier = item.code || item.title;
      if (!identifier) return;
      if (!item.classifications.length) {
        if (item.codeType === 'CPT') {
          codes.add(identifier);
        } else {
          diagnoses.add(identifier);
        }
        return;
      }

      item.classifications.forEach(classification => {
        switch (classification) {
          case 'code':
            codes.add(identifier);
            break;
          case 'prevention':
            prevention.add(identifier);
            break;
          case 'diagnosis':
            diagnoses.add(identifier);
            break;
          case 'differential':
            differentials.add(identifier);
            break;
        }
      });
    };

    normalizedSelected.forEach(assignCodes);
    normalizedSuggested.forEach(assignCodes);
    normalizedCompliance.forEach(item => {
      const identifier = item.code || item.title;
      if (identifier) {
        complianceSet.add(identifier);
      }
    });

    return {
      content: noteContent,
      codes: Array.from(codes),
      prevention: Array.from(prevention),
      diagnoses: Array.from(diagnoses),
      differentials: Array.from(differentials),
      compliance: Array.from(complianceSet),
      patient: patientMetadata,
    };
  }, [
    noteContent,
    normalizedSelected,
    normalizedSuggested,
    normalizedCompliance,
    patientMetadata,
  ]);

  const handleFinalize = React.useCallback(async () => {
    const request = buildFinalizeRequest();
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const result = await Promise.resolve(onFinalize?.(request));
      if (result) {
        setFinalizeResult(result);
      } else {
        setFinalizeResult({
          finalizedContent: request.content.trim(),
          codesSummary: request.codes.map(code => ({ code })),
          reimbursementSummary: { total: 0, codes: [] },
          exportReady: true,
          issues: {},
        });
      }
    } catch (error) {
      setFinalizeError(
        error instanceof Error
          ? error.message
          : 'Failed to finalize note. Please try again.',
      );
    } finally {
      setIsFinalizing(false);
    }
  }, [buildFinalizeRequest, onFinalize]);

  const dispatchButtonLabel = isFinalizing
    ? 'Finalizing...'
    : finalizeResult
    ? 'Dispatch Finalized Note'
    : 'Finalize & Dispatch';

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden relative">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.8 }}
        style={{
          background:
            'linear-gradient(135deg, #fdfdff 0%, #fcfcff 25%, #fafaff 50%, #f9f9ff 75%, #fdfdff 100%)',
        }}
      />
      <motion.div
        className="relative z-10 h-full flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <motion.div
          className="border-b border-white/20 shadow-sm relative"
          style={{
            background: 'linear-gradient(135deg, #fefefe 0%, #fdfdfd 50%, #fcfcfc 100%)',
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
        >
          <ProgressIndicator
            steps={steps}
            currentStep={currentStepData?.id ?? 1}
            onStepClick={goToStep}
          />
          {onClose && (
            <button
              type="button"
              onClick={() => onClose(finalizeResult ?? undefined)}
              className="absolute top-6 right-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            >
              <X size={16} />
              Close
            </button>
          )}
        </motion.div>

        <motion.div
          className="flex-1 flex overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
        >
          {currentStepData?.type === 'loading' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)',
              }}
            >
              <div className="text-center max-w-md">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Settings size={32} className="text-white" />
                  </motion.div>
                </div>
                <h2 className="text-xl font-semibold text-slate-800 mb-2">
                  AI Enhancement in Progress
                </h2>
                <p className="text-slate-600 mb-8">
                  Analyzing and beautifying your medical documentation...
                </p>

                <div className="space-y-4">
                  {currentStepData.progressSteps?.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.2 }}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        step.status === 'completed'
                          ? 'bg-emerald-50 border border-emerald-200'
                          : step.status === 'in-progress'
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          step.status === 'completed'
                            ? 'bg-emerald-500'
                            : step.status === 'in-progress'
                            ? 'bg-blue-500'
                            : 'bg-slate-300'
                        }`}
                      >
                        {step.status === 'completed' ? (
                          <Check size={14} className="text-white" />
                        ) : step.status === 'in-progress' ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                            className="w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                          />
                        ) : (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                      <span
                        className={`font-medium ${
                          step.status === 'completed'
                            ? 'text-emerald-700'
                            : step.status === 'in-progress'
                            ? 'text-blue-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {step.title}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <motion.button
                  onClick={() => goToStep(4)}
                  className="mt-8 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Continue to Compare & Edit
                </motion.button>
              </div>
            </motion.div>
          ) : currentStepData?.type === 'dual-editor' ? (
            <DualRichTextEditor
              originalContent={currentStepData.originalContent || ''}
              aiEnhancedContent={currentStepData.beautifiedContent || ''}
              patientSummaryContent={currentStepData.patientSummaryContent || ''}
              onAcceptAllChanges={() => {
                handleNoteChange(beautifiedContent);
              }}
              onReBeautify={() => {
                const refreshed = buildBeautifiedContent(noteContent, patientMetadata);
                setBeautifiedContent(refreshed);
                setSummaryContent(buildPatientSummary(noteContent, patientMetadata));
              }}
              onContentChange={(content, version) => {
                if (version === 'original') {
                  handleNoteChange(content);
                } else if (version === 'enhanced') {
                  setBeautifiedContent(content);
                } else {
                  setSummaryContent(content);
                }
              }}
              onNavigateNext={() => {
                goToStep(5);
              }}
              onNavigatePrevious={() => {
                goToStep(3);
              }}
            />
          ) : currentStepData?.type === 'placeholder' || currentStepData?.type === 'dispatch' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)',
              }}
            >
              <div className="text-center max-w-md space-y-6">
                <div className="w-24 h-24 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-2xl font-bold">
                  {currentStepData.id}
                </div>

                <div className="space-y-3">
                  <h2 className="text-xl font-semibold text-slate-800">
                    {currentStepData.title}
                  </h2>
                  <p className="text-slate-600">{currentStepData.description}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
                  {currentStepData.type === 'dispatch' ? (
                    <>
                      {isFinalizing ? (
                        <div className="flex items-center justify-center gap-3 text-slate-600">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Finalizing note...</span>
                        </div>
                      ) : finalizeError ? (
                        <p className="text-sm text-red-600">{finalizeError}</p>
                      ) : finalizeResult ? (
                        <div className="text-left space-y-2">
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Status:</span>{' '}
                            {finalizeResult.exportReady
                              ? 'Ready for export'
                              : 'Review outstanding issues'}
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Codes Finalized:</span>{' '}
                            {finalizeResult.codesSummary?.length ?? 0}
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Estimated Reimbursement:</span>{' '}
                            ${
                              (finalizeResult.reimbursementSummary?.total ?? 0).toFixed(2)
                            }
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">
                          This step is under construction.
                        </p>
                      )}
                    </>
                  ) : normalizedCompliance.length ? (
                    <div className="space-y-2 text-left">
                      <p className="text-sm text-slate-600">
                        Outstanding compliance items:
                      </p>
                      <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                        {normalizedCompliance.slice(0, 5).map(item => (
                          <li key={item.id}>{item.title}</li>
                        ))}
                        {normalizedCompliance.length > 5 && (
                          <li className="italic text-slate-500">
                            +{normalizedCompliance.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">
                      This step is under construction.
                    </p>
                  )}
                </div>

                <div className="flex justify-center gap-4">
                  <motion.button
                    onClick={() => goToStep(Math.max(currentStepData.id - 1, 1))}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-all disabled:opacity-60"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={currentStepData.id <= 1 || isFinalizing}
                  >
                    Back
                  </motion.button>

                  {currentStepData.type === 'dispatch' ? (
                    <motion.button
                      onClick={handleFinalize}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={isFinalizing}
                    >
                      {dispatchButtonLabel}
                    </motion.button>
                  ) : (
                    <motion.button
                      onClick={() => goToStep(currentStepData.id + 1)}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={currentStepData.id >= steps.length}
                    >
                      Next
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                className="w-1/2 bg-white border-r border-slate-200/50 shadow-sm"
              >
                <NoteEditor
                  content={noteContent}
                  onChange={handleNoteChange}
                  highlightRanges={highlightRanges}
                  disabled={isShowingEvidence}
                  questionsCount={currentStepData?.id === 1 || currentStepData?.id === 2 ? patientQuestions.length : 0}
                  onShowQuestions={() => setShowPatientQuestions(true)}
                  onInsertText={handleInsertTextToNote}
                />
              </motion.div>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                className="w-1/2 relative overflow-hidden flex flex-col bg-white"
              >
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 1.0 }}
                  style={{
                    background:
                      activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0
                        ? 'linear-gradient(135deg, #fffef9 0%, #fffcf5 25%, #fffaf0 50%, #fef9ec 75%, #fffef9 100%)'
                        : 'linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)',
                  }}
                >
                  <motion.div
                    className="absolute inset-0"
                    animate={{
                      background:
                        activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0
                          ? [
                              'radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)',
                              'radial-gradient(circle at 60% 40%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)',
                              'radial-gradient(circle at 45% 60%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)',
                              'radial-gradient(circle at 70% 30%, rgba(161, 98, 7, 0.1) 0%, transparent 50%)',
                              'radial-gradient(circle at 50% 80%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)',
                              'radial-gradient(circle at 30% 70%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)',
                              'radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)',
                            ]
                          : [
                              'radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)',
                              'radial-gradient(circle at 60% 40%, rgba(79, 70, 229, 0.06) 0%, transparent 50%)',
                              'radial-gradient(circle at 40% 60%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)',
                              'radial-gradient(circle at 70% 30%, rgba(147, 51, 234, 0.06) 0%, transparent 50%)',
                              'radial-gradient(circle at 50% 80%, rgba(126, 34, 206, 0.04) 0%, transparent 50%)',
                              'radial-gradient(circle at 25% 45%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)',
                              'radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)',
                            ],
                      backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                    }}
                    transition={{
                      background: {
                        duration: 14,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1],
                      },
                      backgroundPosition: {
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      },
                    }}
                    style={{
                      backgroundSize: '300% 300%',
                    }}
                  />
                </motion.div>

                <motion.div
                  className="relative z-20 flex-1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}
                >
                  <AnimatePresence mode="wait">
                    {currentStepData && (
                      <StepContent
                        key={currentStepData.id}
                        step={currentStepData}
                        onNext={() => goToStep(currentStepData.id + 1)}
                        onPrevious={() => goToStep(currentStepData.id - 1)}
                        onActiveItemChange={item =>
                          setActiveItemData(item as unknown as NormalizedWizardCodeItem)
                        }
                        onShowEvidence={setIsShowingEvidence}
                        patientQuestions={patientQuestions}
                        onUpdatePatientQuestions={setPatientQuestions}
                        showPatientTray={showPatientQuestions}
                        onShowPatientTray={setShowPatientQuestions}
                        onInsertToNote={handleInsertTextToNote}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

export const WorkflowWizard = FinalizationWizard;
