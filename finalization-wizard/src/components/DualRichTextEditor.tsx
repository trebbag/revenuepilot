import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wand2, 
  RefreshCw, 
  Check, 
  ToggleLeft, 
  ToggleRight,
  User,
  Sparkles,
  FileText,
  ChevronDown,
  Eye,
  Edit3,
  Info,
  Brain,
  X,
  Plus,
  Stethoscope
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import type {
  PatientMetadata,
  VisitTranscriptEntry,
  WizardCodeItem,
} from './WorkflowWizard';

interface DualRichTextEditorProps {
  originalContent: string;
  aiEnhancedContent: string;
  patientSummaryContent: string;
  patientMetadata?: PatientMetadata;
  transcriptEntries?: VisitTranscriptEntry[];
  selectedCodes?: WizardCodeItem[];
  suggestedCodes?: WizardCodeItem[];
  reimbursementSummary?: { total?: number; codes?: Array<Record<string, unknown>> };
  onAcceptAllChanges?: () => void;
  onReBeautify?: () => void;
  onContentChange?: (content: string, version: 'original' | 'enhanced' | 'summary') => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
}

type EditorVersion = 'enhanced' | 'summary';

export function DualRichTextEditor({
  originalContent,
  aiEnhancedContent,
  patientSummaryContent,
  patientMetadata,
  transcriptEntries,
  selectedCodes,
  suggestedCodes,
  reimbursementSummary,
  onAcceptAllChanges,
  onReBeautify,
  onContentChange,
  onNavigateNext,
  onNavigatePrevious
}: DualRichTextEditorProps) {
  const [rightVersion, setRightVersion] = useState<EditorVersion>('enhanced');
  const [originalText, setOriginalText] = useState(originalContent);
  const [enhancedText, setEnhancedText] = useState(aiEnhancedContent);
  const [summaryText, setSummaryText] = useState(patientSummaryContent);
  
  // Track acceptance status for both versions
  const [acceptedVersions, setAcceptedVersions] = useState<{
    enhanced: boolean;
    summary: boolean;
  }>({
    enhanced: false,
    summary: false
  });

  // Dialog states
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showPlanningPanel, setShowPlanningPanel] = useState(false);
  const [showPatientReviewPanel, setShowPatientReviewPanel] = useState(false);

  // Planning panel state
  const [nextSteps, setNextSteps] = useState([
    { id: 1, text: 'Follow-up appointment in 2 weeks', checked: false },
    { id: 2, text: 'Lab work - CBC and comprehensive metabolic panel', checked: false },
    { id: 3, text: 'Patient education on medication compliance', checked: false },
    { id: 4, text: 'Order ECG and cardiac enzymes', checked: false },
    { id: 5, text: 'Schedule cardiology consultation', checked: false },
    { id: 6, text: 'Order chest X-ray', checked: false },
  ]);
  const [customStep, setCustomStep] = useState('');
  
  const originalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const rightTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOriginalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setOriginalText(newContent);
    onContentChange?.(newContent, 'original');
  };

  const handleRightChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    if (rightVersion === 'enhanced') {
      setEnhancedText(newContent);
      onContentChange?.(newContent, 'enhanced');
    } else {
      setSummaryText(newContent);
      onContentChange?.(newContent, 'summary');
    }
  };

  const getCurrentRightContent = () => {
    return rightVersion === 'enhanced' ? enhancedText : summaryText;
  };

  const getRightEditorStyles = () => {
    if (rightVersion === 'enhanced') {
      return {
        background: 'linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)',
        headerClass: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
        headerTextClass: 'text-blue-800',
        footerClass: 'border-blue-200 bg-blue-50/50'
      };
    } else {
      return {
        background: 'linear-gradient(135deg, #fafaff 0%, #f8f8fd 25%, #f6f6fb 50%, #f4f4f9 75%, #fafaff 100%)',
        headerClass: 'bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200',
        headerTextClass: 'text-violet-800',
        footerClass: 'border-violet-200 bg-violet-50/50'
      };
    }
  };

  const styles = getRightEditorStyles();

  const handleAcceptVersion = () => {
    setAcceptedVersions(prev => ({
      ...prev,
      [rightVersion]: !prev[rightVersion] // Toggle acceptance
    }));
  };

  const isCurrentVersionAccepted = acceptedVersions[rightVersion];
  const areBothVersionsAccepted = acceptedVersions.enhanced && acceptedVersions.summary;

  // Helper functions for planning panel
  const handleStepToggle = (id: number) => {
    setNextSteps(prev => prev.map(step => 
      step.id === id ? { ...step, checked: !step.checked } : step
    ));
  };

  const handleAddCustomStep = () => {
    if (customStep.trim()) {
      const newStep = {
        id: Date.now(),
        text: customStep.trim(),
        checked: false
      };
      setNextSteps(prev => [...prev, newStep]);
      setCustomStep('');
    }
  };

  const formatTimestamp = (value?: number | string) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const totalSeconds = Math.max(0, Math.round(value));
      const minutes = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  };

  const patientName = useMemo(() => {
    if (patientMetadata?.name && String(patientMetadata.name).trim().length > 0) {
      return String(patientMetadata.name).trim();
    }
    return 'Patient';
  }, [patientMetadata?.name]);

  const patientSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (patientMetadata?.patientId && String(patientMetadata.patientId).trim().length > 0) {
      parts.push(`ID ${String(patientMetadata.patientId).trim()}`);
    }
    if (patientMetadata?.encounterDate && String(patientMetadata.encounterDate).trim().length > 0) {
      parts.push(new Date(String(patientMetadata.encounterDate)).toLocaleDateString());
    }
    return parts.length ? parts.join(' • ') : 'Encounter details pending';
  }, [patientMetadata?.patientId, patientMetadata?.encounterDate]);

  const providerName = useMemo(() => {
    if (patientMetadata?.providerName && String(patientMetadata.providerName).trim().length > 0) {
      return String(patientMetadata.providerName).trim();
    }
    return 'Assigned Provider';
  }, [patientMetadata?.providerName]);

  const transcriptTimeline = useMemo(() => {
    const entries = Array.isArray(transcriptEntries) ? transcriptEntries : [];
    return entries
      .filter(entry => typeof entry?.text === 'string' && entry.text.trim().length > 0)
      .slice(-8)
      .map((entry, index) => {
        const speaker =
          typeof entry?.speaker === 'string' && entry.speaker.trim().length > 0
            ? entry.speaker.trim()
            : index % 2 === 0
            ? 'Provider'
            : 'Patient';
        const timestampLabel = formatTimestamp(entry?.timestamp);
        const text = String(entry?.text ?? '').trim();
        const confidence =
          typeof entry?.confidence === 'number' && Number.isFinite(entry.confidence)
            ? Math.round(Math.max(0, Math.min(1, entry.confidence)) * 100)
            : null;
        return {
          id: entry?.id ?? index,
          speaker,
          text,
          timestamp: timestampLabel,
          confidence,
          isProvider: speaker.toLowerCase().includes('doctor') || speaker.toLowerCase().includes('provider'),
        };
      });
  }, [transcriptEntries]);

  const selectedCodeList = useMemo(() => {
    if (!Array.isArray(selectedCodes)) return [] as WizardCodeItem[];
    return selectedCodes.filter(item => (item?.code || item?.title));
  }, [selectedCodes]);

  const reimbursementDetails = useMemo(() => {
    const total =
      typeof reimbursementSummary?.total === 'number'
        ? reimbursementSummary.total
        : selectedCodeList.length * 0;
    const codes = Array.isArray(reimbursementSummary?.codes)
      ? reimbursementSummary!.codes
      : [];
    return {
      total,
      codes,
      formattedTotal: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(Math.max(0, total || 0)),
    };
  }, [reimbursementSummary, selectedCodeList.length]);

  const primaryCode = useMemo(() => {
    if (!selectedCodeList.length) return 'N/A';
    return selectedCodeList[0]?.code || selectedCodeList[0]?.title || 'Code';
  }, [selectedCodeList]);

  const primaryCodeDisplayLabel = useMemo(() => {
    if (!selectedCodeList.length) {
      return 'Primary Code';
    }
    const type = getCodeTypeLabel(selectedCodeList[0]);
    if (type === 'CPT') {
      return 'Primary CPT Code';
    }
    if (type === 'ICD-10') {
      return 'Primary Diagnosis Code';
    }
    return 'Primary Code';
  }, [selectedCodeList]);

  const selectedCodeSet = useMemo(() => {
    return new Set(
      selectedCodeList
        .map(item => (item?.code || item?.title || '').toString().toUpperCase())
        .filter(Boolean),
    );
  }, [selectedCodeList]);

  const suggestionGroups = useMemo(() => {
    const result = { high: [] as WizardCodeItem[], medium: [] as WizardCodeItem[], low: [] as WizardCodeItem[] };
    if (!Array.isArray(suggestedCodes)) {
      return result;
    }
    suggestedCodes.forEach(item => {
      const identifier = (item?.code || item?.title || '').toString().toUpperCase();
      if (!identifier || selectedCodeSet.has(identifier)) {
        return;
      }
      const rawConfidence = typeof item?.confidence === 'number' ? item.confidence : 0;
      const percent = rawConfidence > 1 ? rawConfidence : rawConfidence * 100;
      if (percent >= 80) {
        result.high.push(item);
      } else if (percent >= 50) {
        result.medium.push(item);
      } else {
        result.low.push(item);
      }
    });
    return result;
  }, [suggestedCodes, selectedCodeSet]);

  const icdCodeList = useMemo(() => {
    return selectedCodeList.filter(
      item => (item?.codeType || item?.category || '').toString().toUpperCase() !== 'CPT',
    );
  }, [selectedCodeList]);

  const cptCodeList = useMemo(() => {
    return selectedCodeList.filter(
      item => (item?.codeType || item?.category || '').toString().toUpperCase() === 'CPT',
    );
  }, [selectedCodeList]);

  type SuggestionPriority = 'high' | 'medium' | 'low';

  function formatConfidence(value?: number | null): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    const percent = value > 1 ? value : value * 100;
    const normalized = Math.max(0, Math.min(100, Math.round(percent)));
    return `${normalized}%`;
  }

  function getCodeTypeLabel(item?: WizardCodeItem): string {
    const explicit = typeof item?.codeType === 'string' ? item.codeType.trim() : '';
    if (explicit) {
      return explicit.toUpperCase();
    }
    const rawCode = typeof item?.code === 'string' ? item.code.trim() : '';
    if (/^\d{4,5}$/.test(rawCode)) {
      return 'CPT';
    }
    if (rawCode) {
      return 'ICD-10';
    }
    return 'CODE';
  }

  function getCodeTypeBadgeClass(codeType: string): string {
    if (codeType.toUpperCase() === 'CPT') {
      return 'bg-green-50 text-green-700 border border-green-200 text-xs flex-shrink-0';
    }
    return 'bg-blue-50 text-blue-700 border border-blue-200 text-xs flex-shrink-0';
  }

  function getCodeBadgeProps(item: WizardCodeItem, index: number) {
    if (item.stillValid === false) {
      return { text: 'Needs Update', className: 'bg-red-100 text-red-700 text-xs' };
    }
    const status = typeof item.status === 'string' ? item.status.toLowerCase() : '';
    if (status === 'completed' || status === 'confirmed') {
      return {
        text: index === 0 ? 'Primary' : 'Confirmed',
        className: 'bg-emerald-100 text-emerald-700 text-xs',
      };
    }
    if (status === 'in-progress') {
      return { text: 'In Progress', className: 'bg-amber-100 text-amber-700 text-xs' };
    }
    return {
      text: index === 0 ? 'Primary' : 'Pending Review',
      className: index === 0 ? 'bg-green-100 text-green-800 text-xs' : 'bg-slate-100 text-slate-700 text-xs',
    };
  }

  function formatTagLabel(value: string): string {
    const cleaned = value.replace(/[\-_]+/g, ' ').trim();
    if (!cleaned) {
      return value;
    }
    return cleaned.replace(/\b\w/g, char => char.toUpperCase());
  }

  function getCodeTagList(item: WizardCodeItem): string[] {
    const tags = new Set<string>();
    const addTag = (value?: string | null) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          tags.add(trimmed);
        }
      }
    };

    if (Array.isArray(item.tags)) {
      item.tags.forEach(entry => addTag(typeof entry === 'string' ? entry : String(entry)));
    }

    if (Array.isArray(item.classification)) {
      item.classification.forEach(entry => addTag(typeof entry === 'string' ? entry : String(entry)));
    } else if (typeof item.classification === 'string') {
      addTag(item.classification);
    }

    addTag(typeof item.category === 'string' ? item.category : undefined);

    return Array.from(tags.values()).slice(0, 4);
  }

  function getSupportingText(item: WizardCodeItem): string | undefined {
    const candidates = [item.docSupport, item.details, item.aiReasoning];
    for (const entry of candidates) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }

    if (Array.isArray(item.evidence)) {
      const evidence = item.evidence
        .filter(value => typeof value === 'string' && value.trim().length > 0)
        .map(value => value.trim());
      if (evidence.length) {
        return `Evidence: ${evidence.slice(0, 2).join('; ')}`;
      }
    }

    if (Array.isArray(item.gaps)) {
      const gaps = item.gaps
        .filter(value => typeof value === 'string' && value.trim().length > 0)
        .map(value => value.trim());
      if (gaps.length) {
        return `Gaps: ${gaps.slice(0, 2).join('; ')}`;
      }
    }

    return undefined;
  }

  const getCodeMetaLine = (item: WizardCodeItem): string[] => {
    const parts: string[] = [];
    const confidence = formatConfidence(item.confidence);
    if (confidence) {
      parts.push(`Confidence ${confidence}`);
    }

    if (typeof item.reimbursement === 'number' && Number.isFinite(item.reimbursement)) {
      parts.push(`Est. reimbursement $${item.reimbursement.toLocaleString()}`);
    } else if (typeof item.reimbursement === 'string') {
      const numeric = Number(item.reimbursement.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(numeric) && numeric !== 0) {
        parts.push(`Est. reimbursement $${Math.abs(numeric).toLocaleString()}`);
      }
    }

    if (typeof item.rvu === 'number' && Number.isFinite(item.rvu)) {
      parts.push(`RVU ${item.rvu.toFixed(2)}`);
    } else if (typeof item.rvu === 'string') {
      const trimmed = item.rvu.trim();
      if (trimmed) {
        parts.push(`RVU ${trimmed}`);
      }
    }

    return parts;
  };

  const renderSelectedCodeEntry = (item: WizardCodeItem, index: number) => {
    const codeLabel = (item.code || item.title || `Code ${index + 1}`).toString();
    const description = item.title || item.description || 'No description provided.';
    const supportingText = getSupportingText(item);
    const badge = getCodeBadgeProps(item, index);
    const codeType = getCodeTypeLabel(item);
    const tagList = getCodeTagList(item);
    const metaLine = getCodeMetaLine(item);

    return (
      <div key={`${item.id ?? codeLabel}-${index}`} className="bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2 gap-3">
          <span className="font-medium text-sm text-slate-800">{codeLabel}</span>
          <div className="flex items-center gap-2">
            <Badge className={badge.className}>{badge.text}</Badge>
            <Badge className={`${getCodeTypeBadgeClass(codeType)} text-xs`}>{codeType}</Badge>
          </div>
        </div>
        <p className="text-sm text-slate-700 mb-1">{description}</p>
        {supportingText && <p className="text-xs text-slate-600">{supportingText}</p>}
        {tagList.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {tagList.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-wide">
                {formatTagLabel(tag)}
              </Badge>
            ))}
          </div>
        )}
        {metaLine.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 text-[11px] text-slate-500">
            {metaLine.map(entry => (
              <span key={entry} className="bg-slate-100 px-2 py-1 rounded-full">
                {entry}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const suggestionStats = useMemo(() => {
    const allGroups: SuggestionPriority[] = ['high', 'medium', 'low'];
    let total = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let revenueTotal = 0;
    let hasRevenue = false;

    allGroups.forEach(priority => {
      const list = suggestionGroups[priority];
      total += list.length;
      list.forEach(item => {
        if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
          const normalized = item.confidence > 1 ? item.confidence : item.confidence * 100;
          totalConfidence += Math.max(0, Math.min(100, normalized));
          confidenceCount += 1;
        }

        if (typeof item.reimbursement === 'number' && Number.isFinite(item.reimbursement)) {
          revenueTotal += item.reimbursement;
          hasRevenue = true;
        } else if (typeof item.reimbursement === 'string') {
          const numeric = Number(item.reimbursement.replace(/[^0-9.-]/g, ''));
          if (Number.isFinite(numeric) && numeric !== 0) {
            revenueTotal += numeric;
            hasRevenue = true;
          }
        }
      });
    });

    return {
      total,
      high: suggestionGroups.high.length,
      medium: suggestionGroups.medium.length,
      low: suggestionGroups.low.length,
      averageConfidence: confidenceCount ? totalConfidence / confidenceCount : null,
      revenueTotal,
      hasRevenue,
    };
  }, [suggestionGroups]);

  const formattedSuggestionRevenue = useMemo(() => {
    if (!suggestionStats.hasRevenue) {
      return '—';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.max(0, suggestionStats.revenueTotal));
  }, [suggestionStats.hasRevenue, suggestionStats.revenueTotal]);

  const averageSuggestionConfidence = useMemo(() => {
    if (suggestionStats.averageConfidence === null) {
      return '—';
    }
    return `${Math.round(suggestionStats.averageConfidence)}%`;
  }, [suggestionStats.averageConfidence]);

  const renderSuggestionCard = (item: WizardCodeItem, priority: SuggestionPriority, index: number) => {
    const codeLabel = (item.code || item.title || `Suggestion ${index + 1}`).toString();
    const title = item.title || item.description || codeLabel;
    const description = item.details || item.aiReasoning || item.description;
    const supportingText = getSupportingText(item);
    const codeType = getCodeTypeLabel(item);
    const confidence = formatConfidence(item.confidence);
    const cardKey = `${priority}-${item.id ?? codeLabel}-${index}`;

    if (priority === 'low') {
      return (
        <Card
          key={cardKey}
          className="group hover:shadow-md transition-all duration-300 border border-slate-200 bg-white hover:bg-slate-50/50"
        >
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="font-bold text-slate-800 font-mono">{codeLabel}</span>
              <Badge className={`${getCodeTypeBadgeClass(codeType)} text-xs`}>{codeType}</Badge>
            </div>
            <div className="flex-1 space-y-2 mb-4">
              <h6 className="font-semibold text-slate-800">{title}</h6>
              {description && <p className="text-sm text-slate-600 leading-relaxed">{description}</p>}
              {supportingText && <p className="text-xs text-slate-500">{supportingText}</p>}
            </div>
            <div className="flex gap-3 mt-auto">
              <Button size="sm" variant="outline" className="flex-1" type="button">
                Apply Code
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" type="button">
                Dismiss
              </Button>
            </div>
            {confidence && (
              <div className="text-xs text-slate-500 mt-3 text-right">
                AI Confidence: {confidence}
              </div>
            )}
          </div>
        </Card>
      );
    }

    const cardClassName =
      priority === 'high'
        ? 'group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-white via-red-50/20 to-rose-50/30 shadow-lg shadow-red-500/5 hover:shadow-red-500/10'
        : index % 2 === 0
        ? 'group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-white via-amber-50/20 to-yellow-50/30 shadow-md shadow-amber-500/5 hover:shadow-amber-500/10'
        : 'group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-white via-orange-50/20 to-red-50/30 shadow-md shadow-orange-500/5 hover:shadow-orange-500/10';

    const iconWrapperClass =
      priority === 'high'
        ? 'w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/25 group-hover:scale-105 transition-transform duration-200'
        : 'w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/25';

    const primaryButtonClass =
      priority === 'high'
        ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white border-0 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200'
        : codeType === 'CPT'
        ? 'border-orange-300 text-orange-700 hover:bg-orange-50'
        : 'border-amber-300 text-amber-700 hover:bg-amber-50';

    return (
      <Card key={cardKey} className={cardClassName}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={iconWrapperClass}>
              <Plus size={priority === 'high' ? 16 : 14} className={priority === 'high' ? 'text-white' : 'text-white'} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg text-slate-800 font-mono">{codeLabel}</span>
                    {priority === 'high' && (
                      <Badge className="bg-gradient-to-r from-red-500 to-rose-600 text-white border-0 shadow-sm">
                        High Priority
                      </Badge>
                    )}
                  </div>
                  <h5 className="font-semibold text-slate-800">{title}</h5>
                </div>
                <Badge className={`${getCodeTypeBadgeClass(codeType)} whitespace-nowrap text-xs`}>{codeType}</Badge>
              </div>

              {description && <p className="text-slate-600 leading-relaxed">{description}</p>}
              {supportingText && <p className="text-xs text-slate-600 bg-white/70 px-3 py-2 rounded-lg border border-slate-200/60">
                {supportingText}
              </p>}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  className={priority === 'high' ? primaryButtonClass : undefined}
                  variant={priority === 'high' ? 'default' : 'outline'}
                  size={priority === 'high' ? 'default' : 'sm'}
                  type="button"
                >
                  {priority === 'high' ? 'Apply Code' : codeType === 'CPT' ? 'Order Test' : 'Apply'}
                </Button>
                <Button variant="outline" className="border-slate-300 hover:bg-slate-50" size={priority === 'high' ? 'default' : 'sm'} type="button">
                  Dismiss
                </Button>
                <div className="flex-1" />
                {confidence && (
                  <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    AI Confidence: {confidence}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderSuggestionSection = (priority: SuggestionPriority) => {
    const sectionConfig: Record<SuggestionPriority, { title: string; badgeText: string; badgeClass: string; dotClass: string; lineClass: string; gridClass: string; emptyText: string; }> = {
      high: {
        title: 'High Priority Recommendations',
        badgeText: 'Requires Review',
        badgeClass: 'bg-red-50 text-red-700 border border-red-200',
        dotClass: 'bg-gradient-to-r from-red-500 to-rose-600',
        lineClass: 'bg-gradient-to-r from-red-200 to-transparent',
        gridClass: 'grid gap-4',
        emptyText: 'No high priority recommendations available.',
      },
      medium: {
        title: 'Worth Considering',
        badgeText: 'Consider',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
        dotClass: 'bg-gradient-to-r from-amber-500 to-yellow-600',
        lineClass: 'bg-gradient-to-r from-amber-200 to-transparent',
        gridClass: 'grid gap-4 lg:grid-cols-2',
        emptyText: 'No medium priority recommendations available.',
      },
      low: {
        title: 'Additional Opportunities',
        badgeText: 'Optional',
        badgeClass: 'bg-slate-50 text-slate-700 border border-slate-200',
        dotClass: 'bg-gradient-to-r from-slate-400 to-slate-500',
        lineClass: 'bg-gradient-to-r from-slate-200 to-transparent',
        gridClass: 'grid gap-6 lg:grid-cols-2 max-w-4xl',
        emptyText: 'No additional opportunities detected.',
      },
    };

    const items = suggestionGroups[priority];
    const config = sectionConfig[priority];

    return (
      <div className="space-y-4" key={priority}>
        <div className="flex items-center gap-3 px-1">
          <div className={`w-2 h-2 ${config.dotClass} rounded-full shadow-sm`} />
          <h4 className="font-semibold text-slate-800">{config.title}</h4>
          <div className={`flex-1 h-px ${config.lineClass}`} />
          <Badge className={config.badgeClass}>{config.badgeText}</Badge>
        </div>

        <div className={config.gridClass}>
          {items.length > 0 ? (
            items.map((item, index) => renderSuggestionCard(item, priority, index))
          ) : (
            <Card className="border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-none">
              {config.emptyText}
            </Card>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="flex h-full w-full">
      {/* Left Editor - Original Draft */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="flex-1 bg-white border-r border-slate-200/50 shadow-sm"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="bg-slate-50/80 border-b border-slate-200/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                  <Edit3 size={14} className="text-slate-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Original Draft</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Your initial medical note</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Patient Information */}
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-100/60 rounded-lg border border-slate-200/60">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <User size={12} className="text-white" />
                  </div>
                  <div className="text-xs">
                    <div className="font-medium text-slate-800">{patientName}</div>
                    <div className="text-slate-600 flex items-center gap-2">
                      <span>{patientSubtitle}</span>
                    </div>
                  </div>
                </div>
                
                {/* Info Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    console.log('Info button clicked!');
                    setShowInfoPanel(true);
                  }}
                  className="h-8 w-8 p-0 hover:bg-slate-200 text-slate-600 hover:text-slate-800"
                  title="View patient information and visit details"
                >
                  <Info size={16} />
                </Button>
              </div>
            </div>
          </div>

          {/* Editor Content */}
          <div className="flex-1 p-4 bg-white min-h-0">
            <textarea
              ref={originalTextareaRef}
              value={originalText}
              onChange={handleOriginalChange}
              className="w-full h-full resize-none border-none outline-none bg-transparent text-sm leading-relaxed text-slate-900"
              placeholder="Enter your original medical note here..."
              style={{ 
                minHeight: '100%',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
              }}
            />
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200/60 bg-slate-50/50">
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>Original content</span>
              <span>{originalText.length} characters</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right Editor - Switchable Versions */}
      <motion.div
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="flex-1"
        style={{ background: styles.background }}
      >
        <div className="h-full flex flex-col">
          {/* Header with Version Switch */}
          <div className={`${styles.headerClass} border-b p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
                  animate={{
                    background: rightVersion === 'enhanced' 
                      ? 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)' 
                      : 'linear-gradient(135deg, #8b5cf6, #a855f7, #d946ef)',
                    boxShadow: rightVersion === 'enhanced'
                      ? '0 4px 20px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      : '0 4px 20px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                  whileHover={{ 
                    scale: 1.05,
                    boxShadow: rightVersion === 'enhanced'
                      ? '0 6px 25px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                      : '0 6px 25px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Background shimmer effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{
                      x: ['-100%', '100%'],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatType: 'loop',
                      ease: 'linear',
                    }}
                  />
                  
                  <motion.div
                    animate={{ 
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
                  >
                    {rightVersion === 'enhanced' ? (
                      <Sparkles size={18} className="text-white drop-shadow-sm" />
                    ) : (
                      <User size={18} className="text-white drop-shadow-sm" />
                    )}
                  </motion.div>
                </motion.div>
                <div>
                  <h3 className={`font-semibold ${styles.headerTextClass}`}>
                    {rightVersion === 'enhanced' ? 'AI Enhanced Version' : 'Patient Summary Version'}
                  </h3>
                  <p className="text-xs opacity-70 mt-0.5">
                    {rightVersion === 'enhanced' 
                      ? 'Professionally enhanced medical documentation'
                      : 'Patient-friendly summary format'
                    }
                  </p>
                </div>
              </div>

              {/* Right Panel Buttons */}
              <div className="flex items-center gap-2">
                {/* Planning Assistant Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    console.log('Planning Assistant button clicked!');
                    setShowPlanningPanel(true);
                  }}
                  className="h-8 w-8 p-0 hover:bg-blue-100 text-blue-600 hover:text-blue-800"
                  title="AI Planning Assistant"
                >
                  <Brain size={16} />
                </Button>
                
                {/* Patient Review Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    console.log('Patient Review button clicked!');
                    setShowPatientReviewPanel(true);
                  }}
                  className="h-8 w-8 p-0 hover:bg-violet-100 text-violet-600 hover:text-violet-800"
                  title="Patient Review Panel"
                >
                  <Eye size={16} />
                </Button>
                
                {/* Version Toggle */}
                <motion.button
                  onClick={() => setRightVersion(rightVersion === 'enhanced' ? 'summary' : 'enhanced')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    rightVersion === 'enhanced'
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    animate={{ rotate: rightVersion === 'enhanced' ? 0 : 180 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ToggleRight size={14} />
                  </motion.div>
                  Switch to {rightVersion === 'enhanced' ? 'Summary' : 'Enhanced'}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Editor Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={rightVersion}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 p-4 min-h-0"
            >
              <textarea
                ref={rightTextareaRef}
                value={getCurrentRightContent()}
                onChange={handleRightChange}
                className="w-full h-full resize-none border-none outline-none bg-white/80 rounded-lg p-4 text-sm leading-relaxed shadow-sm text-slate-900"
                placeholder={rightVersion === 'enhanced' 
                  ? "AI-enhanced medical documentation will appear here..."
                  : "Patient-friendly summary will appear here..."
                }
                style={{ 
                  minHeight: '100%',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
                }}
              />
            </motion.div>
          </AnimatePresence>

          {/* Footer with Actions */}
          <div className={`p-4 border-t ${styles.footerClass}`}>
            <div className="space-y-3">
              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleAcceptVersion}
                  className={`flex-1 font-medium transition-all ${
                    isCurrentVersionAccepted
                      ? 'bg-emerald-600 hover:bg-orange-500 text-white'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  }`}
                  size="sm"
                >
                  <Check size={14} className="mr-2" />
                  {isCurrentVersionAccepted 
                    ? `${rightVersion === 'enhanced' ? 'Enhanced' : 'Summary'} Accepted - Click to Unaccept` 
                    : `Accept ${rightVersion === 'enhanced' ? 'Enhanced' : 'Summary'} Version`
                  }
                </Button>
                <Button
                  onClick={onReBeautify}
                  variant="outline"
                  size="sm"
                  disabled={isCurrentVersionAccepted}
                  className={`px-4 ${
                    rightVersion === 'enhanced'
                      ? 'border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  <RefreshCw size={14} className="mr-2" />
                  Re-beautify
                </Button>
              </div>

              {/* Stats */}
              <div className="flex justify-between items-center text-xs opacity-70">
                <span>
                  {rightVersion === 'enhanced' ? 'Enhanced content' : 'Summary content'}
                </span>
                <span>{getCurrentRightContent().length} characters</span>
              </div>

              {/* Version Indicator & Acceptance Status */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${ 
                    rightVersion === 'enhanced' ? 'bg-blue-500' : 'bg-violet-500'
                  }`} />
                  <span className="opacity-70">
                    Currently viewing: {rightVersion === 'enhanced' ? 'AI Enhanced' : 'Patient Summary'} version
                  </span>
                </div>
                
                {/* Acceptance indicators */}
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                    acceptedVersions.enhanced 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Check size={10} />
                    Enhanced
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                    acceptedVersions.summary 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Check size={10} />
                    Summary
                  </div>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between items-center pt-2 border-t border-current/10">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={onNavigatePrevious}
                >
                  ← Back to Compose
                </Button>
                <Button
                  size="sm"
                  disabled={!areBothVersionsAccepted}
                  className={`text-xs transition-all ${
                    areBothVersionsAccepted
                      ? 'bg-slate-700 hover:bg-slate-800 text-white'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (areBothVersionsAccepted && onNavigateNext) {
                      onNavigateNext();
                    }
                  }}
                >
                  {areBothVersionsAccepted ? 'Continue to Billing →' : 'Accept Both Versions to Continue'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>

    {/* Info Panel Dialog */}
    <Dialog open={showInfoPanel} onOpenChange={setShowInfoPanel}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white">
        <DialogHeader className="px-6 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-slate-50 via-blue-50 to-indigo-50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Info size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Patient Information & Visit Details</h2>
              <p className="text-sm text-slate-600 mt-1">Comprehensive patient data and visit documentation</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="patient-summary" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-3 border-b-2 border-slate-200/40 bg-gradient-to-r from-slate-50/80 via-blue-50/60 to-indigo-50/60 flex-shrink-0">
            <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-white via-blue-50/30 to-indigo-50/30 shadow-md border border-slate-200/60 h-12">
              <TabsTrigger value="patient-summary" className="flex items-center gap-2 px-3 text-sm">
                <User size={14} />
                <span className="hidden sm:inline">Patient</span>
                <span className="sm:hidden">Summary</span>
              </TabsTrigger>
              <TabsTrigger value="transcript" className="flex items-center gap-2 px-3 text-sm">
                <FileText size={14} />
                <span className="hidden sm:inline">Visit</span>
                <span className="sm:hidden">Transcript</span>
              </TabsTrigger>
              <TabsTrigger value="codes" className="flex items-center gap-2 px-3 text-sm">
                <Eye size={14} />
                <span className="hidden sm:inline">Codes</span>
                <span className="sm:hidden">Details</span>
              </TabsTrigger>
              <TabsTrigger value="unused-suggestions" className="flex items-center gap-2 px-3 text-sm">
                <Brain size={14} />
                <span className="hidden sm:inline">Unused</span>
                <span className="sm:hidden">AI</span>
              </TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6">
                <TabsContent value="patient-summary" className="mt-0 space-y-6">
              {/* Patient Header */}
              <div className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 text-white p-6 rounded-xl shadow-lg border border-slate-200/40">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <User size={28} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold">{patientName}</h1>
                    <p className="text-blue-100">{patientSubtitle}</p>
                  </div>
                </div>
              </div>

              {/* Vital Signs */}
              <Card className="p-6 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Stethoscope size={16} className="text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Visit Snapshot</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xl font-bold text-blue-800">{selectedCodeList.length}</div>
                    <div className="text-xs text-blue-600 mt-1">Codes Reviewed</div>
                    <div className="text-xs text-blue-500">Selected</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-800">{suggestionGroups.high.length + suggestionGroups.medium.length + suggestionGroups.low.length}</div>
                    <div className="text-xs text-green-600 mt-1">AI Suggestions</div>
                    <div className="text-xs text-green-500">Unused</div>
                  </div>
                  <div className="text-center p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div className="text-2xl font-bold text-indigo-800">{reimbursementDetails.formattedTotal}</div>
                    <div className="text-xs text-indigo-600 mt-1">Estimated Reimbursement</div>
                    <div className="text-xs text-indigo-500">USD</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-2xl font-bold text-purple-800">{primaryCode}</div>
                    <div className="text-xs text-purple-600 mt-1">Primary Focus</div>
                    <div className="text-xs text-purple-500">Provider: {providerName}</div>
                  </div>
                </div>
              </Card>

              {/* Allergies */}
              <Card className="p-6 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-100 to-yellow-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Plus size={16} className="text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Allergies & Reactions</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="bg-red-100 text-red-800 flex-shrink-0 text-xs px-2 py-1">HIGH ALERT</Badge>
                      <p className="font-medium text-sm text-slate-800">Penicillin</p>
                    </div>
                    <p className="text-xs text-slate-600 ml-0">Severe rash, documented 2019</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800 flex-shrink-0 text-xs px-2 py-1">MODERATE</Badge>
                      <p className="font-medium text-sm text-slate-800">Shellfish</p>
                    </div>
                    <p className="text-xs text-slate-600 ml-0">Gastrointestinal upset</p>
                  </div>
                </div>
              </Card>
                </TabsContent>
                
                <TabsContent value="transcript" className="mt-0 space-y-6">
                  {/* Visit Transcript */}
                  <Card className="p-6 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm">
                        <FileText size={16} className="text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-slate-800">Visit Transcript</h3>
                      <Badge className="bg-blue-100 text-blue-800 text-xs">{`${transcriptTimeline.length} entries captured`}</Badge>
                    </div>
                    <div className="space-y-3">
                      {transcriptTimeline.length ? (
                        transcriptTimeline.map(entry => {
                          const isProvider = entry.isProvider;
                          const wrapperClass = isProvider
                            ? 'bg-white p-4 rounded-lg border border-slate-200'
                            : 'bg-blue-50 p-4 rounded-lg border border-blue-200';
                          const iconWrapper = isProvider
                            ? 'w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5'
                            : 'w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5';
                          const icon = isProvider ? (
                            <Stethoscope size={12} className="text-blue-600" />
                          ) : (
                            <User size={12} className="text-white" />
                          );
                          return (
                            <div key={entry.id} className={wrapperClass}>
                              <div className="flex items-start gap-3">
                                <div className={iconWrapper}>{icon}</div>
                                <div className="flex-1 space-y-1">
                                  <div className={`text-xs ${isProvider ? 'text-slate-500' : 'text-blue-600'} flex items-center gap-2`}>
                                    <span>
                                      {entry.timestamp ? `${entry.timestamp} • ${entry.speaker}` : entry.speaker}
                                    </span>
                                    {entry.confidence !== null && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        Confidence {entry.confidence}%
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-700">{entry.text}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-sm text-slate-600">
                          No transcript entries captured during this visit.
                        </div>
                      )}
                    </div>
                  </Card>
                </TabsContent>
                
                <TabsContent value="codes" className="mt-0 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/60 via-emerald-50/40 to-white shadow-sm border border-slate-200/50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center shadow-sm">
                          <Check size={16} className="text-green-600" />
                        </div>
                        <h3 className="font-semibold text-slate-800">Applied ICD-10 Codes</h3>
                        <Badge className="bg-green-100 text-green-800 text-xs">Billable</Badge>
                      </div>
                      <div className="space-y-3">
                        {icdCodeList.length > 0 ? (
                          icdCodeList.map((item, index) => renderSelectedCodeEntry(item, index))
                        ) : (
                          <div className="bg-white p-4 rounded-lg border border-dashed border-slate-200 text-sm text-slate-600 text-center">
                            No ICD-10 codes have been applied yet.
                          </div>
                        )}
                      </div>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm">
                          <Eye size={16} className="text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-slate-800">Applied CPT Codes</h3>
                        <Badge className="bg-blue-100 text-blue-800 text-xs">Billable</Badge>
                      </div>
                      <div className="space-y-3">
                        {cptCodeList.length > 0 ? (
                          cptCodeList.map((item, index) => renderSelectedCodeEntry(item, index))
                        ) : (
                          <div className="bg-white p-4 rounded-lg border border-dashed border-slate-200 text-sm text-slate-600 text-center">
                            No CPT codes have been applied yet.
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  <Card className="p-6 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm">
                        <Plus size={16} className="text-emerald-600" />
                      </div>
                      <h3 className="font-semibold text-slate-800">Billing Summary</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-emerald-700">{selectedCodeList.length}</div>
                        <p className="text-sm text-slate-600 mt-1">Total Codes Applied</p>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-blue-700">{reimbursementDetails.formattedTotal}</div>
                        <p className="text-sm text-slate-600 mt-1">Estimated Charges</p>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-purple-700">{primaryCode}</div>
                        <p className="text-sm text-slate-600 mt-1">{primaryCodeDisplayLabel}</p>
                      </div>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="unused-suggestions" className="mt-0 space-y-6">
                  <div className="space-y-8">
                    <div className="text-center space-y-3">
                      <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-slate-50 via-blue-50/50 to-purple-50/30 border border-slate-200/60 rounded-2xl shadow-sm">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                          <Brain size={18} className="text-white" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-slate-800">AI-Suggested Unused Codes</h3>
                          <p className="text-xs text-slate-600">
                            Additional opportunities identified by clinical AI • {suggestionStats.total}{' '}
                            {suggestionStats.total === 1 ? 'suggestion' : 'suggestions'} pending review
                          </p>
                        </div>
                        <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 shadow-lg shadow-blue-500/25 px-3 py-1">
                          AI Insights
                        </Badge>
                      </div>
                    </div>

                    {renderSuggestionSection('high')}
                    {renderSuggestionSection('medium')}
                    {renderSuggestionSection('low')}

                    <div className="text-center pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-600">
                        Total unused opportunities: <span className="font-semibold text-slate-800">{suggestionStats.total}</span>{' '}
                        {suggestionStats.total === 1 ? 'code' : 'codes'} • Potential additional revenue:{' '}
                        <span className="font-semibold text-emerald-700">{formattedSuggestionRevenue}</span>
                        {averageSuggestionConfidence !== '—' && (
                          <>
                            {' '}
                            • Average confidence:{' '}
                            <span className="font-semibold text-blue-700">{averageSuggestionConfidence}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <Card className="p-6 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm">
                        <Sparkles size={16} className="text-purple-600" />
                      </div>
                      <h3 className="font-semibold text-slate-800">Unused Codes Summary</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-amber-700">{suggestionStats.total}</div>
                        <p className="text-sm text-slate-600 mt-1">Total Unused Codes</p>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-orange-700">{formattedSuggestionRevenue}</div>
                        <p className="text-sm text-slate-600 mt-1">Potential Additional Revenue</p>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-purple-700">{suggestionStats.high}</div>
                        <p className="text-sm text-slate-600 mt-1">High Priority Suggestions</p>
                      </div>
                    </div>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* AI Planning Assistant Dialog */}
    <Dialog open={showPlanningPanel} onOpenChange={setShowPlanningPanel}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white">
        <DialogHeader className="px-6 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Brain size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800">AI Planning Assistant</h2>
              <p className="text-sm text-slate-600 mt-1">Intelligent care planning with comprehensive recommendations</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Risk Assessment Banner */}
              <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Eye size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="font-semibold text-yellow-900">MODERATE RISK PATIENT</span>
                      </div>
                      <p className="text-sm text-yellow-800">Chest pain presentation + diabetes/hypertension comorbidities</p>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-yellow-700 font-medium">Risk Factors:</div>
                    <div className="text-xs text-yellow-600">• Cardiac symptoms • DM/HTN • Age 49</div>
                  </div>
                </div>
              </div>

              {/* Current Plan from Note */}
              <Card className="p-6 border-l-4 border-l-slate-500 bg-gradient-to-r from-slate-50/60 via-gray-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-slate-100 to-gray-100 rounded-lg flex items-center justify-center shadow-sm">
                    <FileText size={16} className="text-slate-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Current Plan from Note</h3>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="space-y-3 text-sm text-slate-700">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Follow-up appointment in 2 weeks</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Lab work - CBC and comprehensive metabolic panel</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                      <span>Patient education on medication compliance</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* AI Recommendations */}
              <Card className="p-6 border-l-4 border-l-indigo-500 bg-gradient-to-r from-indigo-50/60 via-blue-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">AI Clinical Recommendations</h3>
                    <p className="text-sm text-slate-600 mt-1">Evidence-based suggestions for optimal patient care</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Immediate Actions */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center">
                        <Plus size={12} className="text-red-600" />
                      </div>
                      <h4 className="font-semibold text-slate-800">Immediate Diagnostic Workup</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">12-Lead ECG + Cardiac Enzymes</div>
                            <div className="text-xs text-slate-600 mt-1">Rule out acute coronary syndrome, obtain troponin I/T, CK-MB</div>
                            <div className="text-xs text-red-600 mt-1 font-medium">Priority: STAT</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">Chest X-ray PA & Lateral</div>
                            <div className="text-xs text-slate-600 mt-1">Evaluate for pulmonary edema, pneumothorax, or other thoracic pathology</div>
                            <div className="text-xs text-orange-600 mt-1 font-medium">Priority: Urgent</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">Enhanced Laboratory Panel</div>
                            <div className="text-xs text-slate-600 mt-1">Add lipid panel, HbA1c, BNP/NT-proBNP, D-dimer</div>
                            <div className="text-xs text-blue-600 mt-1 font-medium">Priority: Today</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Follow-up Care */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
                        <Sparkles size={12} className="text-green-600" />
                      </div>
                      <h4 className="font-semibold text-slate-800">Specialist Consultation & Follow-up</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">Cardiology Consultation</div>
                            <div className="text-xs text-slate-600 mt-1">Schedule within 1-2 weeks for specialist evaluation and risk stratification</div>
                            <div className="text-xs text-green-600 mt-1 font-medium">Timeline: 1-2 weeks</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">Accelerated Follow-up</div>
                            <div className="text-xs text-slate-600 mt-1">Consider 1-week follow-up instead of 2 weeks given symptom severity</div>
                            <div className="text-xs text-purple-600 mt-1 font-medium">Recommended: 1 week</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div className="font-medium text-slate-800 text-sm">Enhanced Patient Education</div>
                            <div className="text-xs text-slate-600 mt-1">Provide chest pain warning signs, when to seek emergency care</div>
                            <div className="text-xs text-indigo-600 mt-1 font-medium">Include: Emergency protocols</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Next Steps Checklist */}
              <Card className="p-6 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Check size={16} className="text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Complete Action Plan Checklist</h3>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                    {nextSteps.filter(step => step.checked).length} of {nextSteps.length} completed
                  </Badge>
                </div>
                <div className="space-y-3">
                  {nextSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                      <Checkbox
                        checked={step.checked}
                        onCheckedChange={() => handleStepToggle(step.id)}
                        className="flex-shrink-0"
                      />
                      <span className={`text-sm flex-1 ${step.checked ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                        {step.text}
                      </span>
                      {step.checked && (
                        <div className="text-green-600">
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 flex gap-2">
                  <Textarea
                    placeholder="Add a custom action item..."
                    value={customStep}
                    onChange={(e) => setCustomStep(e.target.value)}
                    className="flex-1"
                    rows={2}
                  />
                  <Button onClick={handleAddCustomStep} size="sm" className="self-end bg-purple-600 hover:bg-purple-700">
                    <Plus size={14} className="mr-1" />
                    Add Step
                  </Button>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>

    {/* Patient Review Panel Dialog */}
    <Dialog open={showPatientReviewPanel} onOpenChange={setShowPatientReviewPanel}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white">
        <DialogHeader className="px-8 py-6 border-b-2 border-slate-200/60 bg-gradient-to-r from-violet-50 via-purple-50 to-pink-50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Eye size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">Patient Care Summary</h2>
              <p className="text-base text-slate-600 mt-1">Your visit overview - what we found and what's next</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8 space-y-8">
              {/* Patient Summary Banner */}
              <div className="bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600 text-white p-8 rounded-xl shadow-lg">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                    <User size={32} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-3xl font-semibold mb-2">Hello Mr. Smith!</h1>
                    <p className="text-lg text-violet-100 mb-1">Here's what happened during your visit today</p>
                    <p className="text-violet-200">March 15, 2024 • 45-minute appointment • Dr. Johnson</p>
                  </div>
                  <div className="text-right bg-white/10 p-4 rounded-lg">
                    <div className="text-sm font-medium text-violet-200">Your Health Status</div>
                    <div className="text-3xl font-bold text-white">Good</div>
                    <div className="text-sm text-violet-200">Monitoring needed</div>
                  </div>
                </div>
              </div>

              {/* What We Discovered Today */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm">
                      <Stethoscope size={20} className="text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800">What We Found</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="font-medium text-slate-800 mb-2">Your main concern:</div>
                      <p className="text-slate-700">Chest pain and shortness of breath for the past 3 days</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="font-medium text-slate-800 mb-2">What this could be:</div>
                      <p className="text-slate-700">We're checking if this is related to your heart, given your diabetes and blood pressure history</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="font-medium text-slate-800 mb-2">Risk level:</div>
                      <p className="text-slate-700">Moderate - we want to be thorough and make sure everything is okay</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-8 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/60 via-emerald-50/40 to-white shadow-sm border border-slate-200/50">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center shadow-sm">
                      <Check size={20} className="text-green-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800">Tests We're Doing</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <div className="font-medium text-slate-800">Heart tracing (ECG)</div>
                          <p className="text-sm text-slate-600">To check your heart rhythm and activity</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <div className="font-medium text-slate-800">Blood tests</div>
                          <p className="text-sm text-slate-600">To check for heart damage and general health</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <div className="font-medium text-slate-800">Chest X-ray</div>
                          <p className="text-sm text-slate-600">To look at your lungs and heart</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Your Care Plan */}
              <Card className="p-8 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Brain size={20} className="text-purple-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800">Your Care Plan - What Happens Next</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium text-lg text-slate-800 mb-4">This Week</h4>
                      <div className="space-y-3">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">Get your test results</div>
                              <p className="text-sm text-slate-600">We'll call you within 1-2 days with results</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-green-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">See a heart specialist</div>
                              <p className="text-sm text-slate-600">Cardiology appointment within 1-2 weeks</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-purple-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">Follow-up with me</div>
                              <p className="text-sm text-slate-600">Return visit in 1 week to review everything</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium text-lg text-slate-800 mb-4">Keep Taking Care of Yourself</h4>
                      <div className="space-y-3">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">Continue your medications</div>
                              <p className="text-sm text-slate-600">Keep taking metformin and lisinopril as usual</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-orange-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">Watch for warning signs</div>
                              <p className="text-sm text-slate-600">Call 911 if chest pain gets worse or spreads to your jaw/back</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-indigo-500 rounded-full flex-shrink-0"></div>
                            <div>
                              <div className="font-medium text-slate-800">Take it easy</div>
                              <p className="text-sm text-slate-600">Avoid heavy exercise until we know more</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Important Contact Information */}
              <Card className="p-8 border-l-4 border-l-red-500 bg-gradient-to-r from-red-50/60 via-rose-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-100 to-rose-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Eye size={20} className="text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800">Important - When to Call for Help</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="bg-red-100 p-6 rounded-lg border border-red-200">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-red-800 mb-2">Call 911</div>
                        <div className="font-medium text-red-800 mb-3">If you have:</div>
                        <div className="space-y-2 text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                            <span className="text-red-800">Severe chest pain that won't go away</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                            <span className="text-red-800">Pain spreading to jaw, neck, or back</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                            <span className="text-red-800">Severe shortness of breath</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                            <span className="text-red-800">Nausea with chest pain</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-blue-100 p-6 rounded-lg border border-blue-200">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-800 mb-2">Call Our Office</div>
                        <div className="text-xl font-bold text-blue-800 mb-3">(555) 123-4567</div>
                        <div className="font-medium text-blue-800 mb-3">If you have questions or concerns about:</div>
                        <div className="space-y-2 text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            <span className="text-blue-800">Your test results</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            <span className="text-blue-800">Your medications</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            <span className="text-blue-800">Appointment scheduling</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            <span className="text-blue-800">Any other questions</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Your Health Team */}
              <Card className="p-8 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm">
                    <Check size={20} className="text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800">Your Health Team</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg border border-slate-200 text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <User size={24} className="text-blue-600" />
                    </div>
                    <div className="font-semibold text-slate-800 mb-1">Dr. Johnson</div>
                    <div className="text-sm text-slate-600 mb-2">Your Primary Care Doctor</div>
                    <div className="text-xs text-slate-500">(555) 123-4567</div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg border border-slate-200 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Stethoscope size={24} className="text-red-600" />
                    </div>
                    <div className="font-semibold text-slate-800 mb-1">Dr. Rodriguez</div>
                    <div className="text-sm text-slate-600 mb-2">Heart Specialist (Cardiologist)</div>
                    <div className="text-xs text-slate-500">Appointment scheduled</div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg border border-slate-200 text-center">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain size={24} className="text-purple-600" />
                    </div>
                    <div className="font-semibold text-slate-800 mb-1">Sarah Wilson, RN</div>
                    <div className="text-sm text-slate-600 mb-2">Care Coordinator</div>
                    <div className="text-xs text-slate-500">(555) 123-4568</div>
                  </div>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Patient Review Panel Dialog - GENIUS REDESIGN */}
    <Dialog open={showPatientReviewPanel} onOpenChange={setShowPatientReviewPanel}>
      <DialogContent className="max-w-[96vw] w-[96vw] max-h-[96vh] h-[96vh] p-0 flex flex-col border-0 shadow-2xl bg-gradient-to-br from-slate-50 via-white to-violet-50/30 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Neural Patient Analysis Dashboard</DialogTitle>
          <DialogDescription>
            AI-powered clinical intelligence dashboard displaying comprehensive patient data, predictive insights, and real-time health monitoring for enhanced medical decision making.
          </DialogDescription>
        </DialogHeader>
        
        {/* Floating Header with Glass Morphism */}
        <div className="relative px-12 py-8 bg-gradient-to-r from-violet-600/10 via-purple-600/5 to-pink-600/10 backdrop-blur-xl border-b border-white/20">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-pink-500/5 backdrop-blur-sm"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #a855f7, #d946ef)',
                  boxShadow: '0 8px 32px rgba(139, 92, 246, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.2)'
                }}
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <motion.div
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: [0, 10, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Eye size={24} className="text-white drop-shadow-lg" />
                </motion.div>
              </motion.div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                  Neural Patient Analysis
                </h2>
                <p className="text-slate-600 mt-1">AI-Powered Clinical Intelligence & Predictive Insights</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-full bg-emerald-100 border border-emerald-200">
                <span className="text-sm font-semibold text-emerald-700">🟢 Analysis Complete</span>
              </div>
              <div className="px-4 py-2 rounded-full bg-blue-100 border border-blue-200">
                <span className="text-sm font-semibold text-blue-700">⚡ Real-time</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content Grid */}
        <div className="flex-1 min-h-0 p-12 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <div className="grid grid-cols-12 gap-12 h-full max-w-[1800px] mx-auto">
            
            {/* Left Column - Metrics Dashboard */}
            <div className="col-span-4 space-y-8">
              
              {/* Patient Health Score */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="relative p-8 rounded-3xl bg-gradient-to-br from-white via-blue-50/30 to-violet-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-3xl"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800">Health Intelligence Score</h3>
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
                  </div>
                  
                  {/* Circular Progress */}
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        stroke="#e2e8f0"
                        strokeWidth="8"
                        fill="none"
                        className="opacity-20"
                      />
                      <motion.circle
                        cx="60"
                        cy="60"
                        r="45"
                        stroke="url(#healthGradient)"
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        initial={{ strokeDasharray: 0 }}
                        animate={{ strokeDasharray: "240 283" }}
                        transition={{ duration: 2, ease: "easeOut" }}
                      />
                      <defs>
                        <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="50%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-slate-800">94</div>
                        <div className="text-sm text-slate-600">/ 100</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-emerald-600 font-semibold mb-2">Excellent Health Profile</p>
                    <p className="text-sm text-slate-600">Based on 47 clinical markers</p>
                  </div>
                </div>
              </motion.div>
              
              {/* Risk Factors */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-white via-amber-50/30 to-orange-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <h3 className="font-bold text-slate-800 mb-4">Risk Assessment Matrix</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="text-sm font-medium text-slate-700">Cardiovascular</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">Low Risk</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-50 border border-yellow-100">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                      <span className="text-sm font-medium text-slate-700">Hypertension</span>
                    </div>
                    <span className="text-sm font-bold text-yellow-600">Monitor</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="text-sm font-medium text-slate-700">Diabetes</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">Low Risk</span>
                  </div>
                </div>
              </motion.div>

            </div>
            
            {/* Center Column - AI Insights & Recommendations */}
            <div className="col-span-5 space-y-8">
              
              {/* AI Neural Network Visualization */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-white via-violet-50/30 to-purple-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800">Neural Analysis Pathways</h3>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 border border-violet-200">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></div>
                    <span className="text-xs font-semibold text-violet-700">Processing</span>
                  </div>
                </div>
                
                <div className="relative h-48 bg-gradient-to-r from-violet-100/50 to-purple-100/50 rounded-2xl p-6 overflow-hidden">
                  {/* Neural Network Nodes */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid grid-cols-4 gap-8 w-full h-full items-center">
                      {/* Input Layer */}
                      <div className="flex flex-col gap-3 items-center">
                        {[1,2,3,4].map((i) => (
                          <motion.div
                            key={`input-${i}`}
                            className="w-3 h-3 rounded-full bg-blue-400"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 2, delay: i * 0.1, repeat: Infinity }}
                          />
                        ))}
                      </div>
                      
                      {/* Hidden Layer 1 */}
                      <div className="flex flex-col gap-2 items-center">
                        {[1,2,3,4,5,6].map((i) => (
                          <motion.div
                            key={`hidden1-${i}`}
                            className="w-2.5 h-2.5 rounded-full bg-violet-400"
                            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 2.5, delay: i * 0.05, repeat: Infinity }}
                          />
                        ))}
                      </div>
                      
                      {/* Hidden Layer 2 */}
                      <div className="flex flex-col gap-2 items-center">
                        {[1,2,3,4,5,6].map((i) => (
                          <motion.div
                            key={`hidden2-${i}`}
                            className="w-2.5 h-2.5 rounded-full bg-purple-400"
                            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 2.2, delay: i * 0.07, repeat: Infinity }}
                          />
                        ))}
                      </div>
                      
                      {/* Output Layer */}
                      <div className="flex flex-col gap-4 items-center">
                        {[1,2,3].map((i) => (
                          <motion.div
                            key={`output-${i}`}
                            className="w-4 h-4 rounded-full bg-emerald-400"
                            animate={{ scale: [1, 1.4, 1], opacity: [0.8, 1, 0.8] }}
                            transition={{ duration: 3, delay: i * 0.2, repeat: Infinity }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-2 left-4 right-4 flex justify-between text-xs text-slate-600">
                    <span>Symptoms</span>
                    <span>Processing</span>
                    <span>Analysis</span>
                    <span>Insights</span>
                  </div>
                </div>
              </motion.div>
              
              {/* Predictive Insights */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-white via-emerald-50/30 to-blue-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <h3 className="font-bold text-slate-800 mb-4">Predictive Clinical Insights</h3>
                <div className="space-y-4">
                  
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-200/50">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800 mb-2">Hypertension Risk Analysis</h4>
                        <p className="text-sm text-slate-600 mb-3">Current BP readings (142/88) indicate Stage 1 hypertension. AI models predict 73% likelihood of sustained elevation without intervention.</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Lifestyle Modifications</span>
                          <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">2-Week Follow-up</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <Check size={16} className="text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800 mb-2">Treatment Compliance Prediction</h4>
                        <p className="text-sm text-slate-600 mb-3">Based on patient profile and demographics, AI predicts 89% medication adherence likelihood with proper education.</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">High Adherence</span>
                          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Patient Education</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </motion.div>

            </div>
            
            {/* Right Column - Real-time Monitoring */}
            <div className="col-span-3 space-y-8">
              
              {/* Live Health Metrics */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-white via-slate-50/30 to-gray-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Live Vitals Monitor</h3>
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
                </div>
                
                <div className="space-y-4">
                  {/* Blood Pressure */}
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Blood Pressure</span>
                      <span className="text-xs text-red-600 font-semibold">⚠ Elevated</span>
                    </div>
                    <div className="text-2xl font-bold text-red-700">142/88</div>
                    <div className="text-xs text-slate-600 mt-1">mmHg • Stage 1 HTN</div>
                  </div>
                  
                  {/* Heart Rate */}
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Heart Rate</span>
                      <span className="text-xs text-emerald-600 font-semibold">✓ Normal</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-700">78</div>
                    <div className="text-xs text-slate-600 mt-1">bpm • Resting</div>
                  </div>
                  
                  {/* O2 Saturation */}
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">O₂ Saturation</span>
                      <span className="text-xs text-blue-600 font-semibold">✓ Optimal</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-700">97%</div>
                    <div className="text-xs text-slate-600 mt-1">SpO₂</div>
                  </div>
                </div>
              </motion.div>
              
              {/* Action Items */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-white via-orange-50/30 to-yellow-50/20 border border-white/40 shadow-xl backdrop-blur-sm"
              >
                <h3 className="font-bold text-slate-800 mb-4">Priority Action Items</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">BP Monitoring Protocol</p>
                      <p className="text-xs text-slate-600">Schedule 2-week follow-up</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Patient Education</p>
                      <p className="text-xs text-slate-600">Lifestyle modifications</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
                    <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Lab Workup</p>
                      <p className="text-xs text-slate-600">CBC, CMP panels</p>
                    </div>
                  </div>
                </div>
              </motion.div>

            </div>
            
          </div>
        </div>
        
        {/* Floating Action Bar */}
        <div className="px-12 py-6 bg-gradient-to-r from-white/80 to-violet-50/80 backdrop-blur-xl border-t border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-100 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-sm font-semibold text-emerald-700">Analysis Complete</span>
              </div>
              <span className="text-sm text-slate-600">Generated in 0.847s using 12 AI models</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-full">
                Export Report
              </Button>
              <Button size="sm" className="rounded-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                Apply Recommendations
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    </>
  );
}