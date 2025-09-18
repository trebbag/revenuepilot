import React from 'react';
import {
  FinalizationWizard,
  type FinalizeResult,
  type FinalizationWizardProps,
} from './components/WorkflowWizard';

const selectedCodesSample = [
  {
    id: 1,
    code: 'I25.10',
    title: 'I25.10 - Atherosclerotic heart disease',
    status: 'confirmed',
    details: 'Primary diagnosis confirmed with supporting documentation',
    codeType: 'ICD-10',
    docSupport: 'strong',
    stillValid: true,
    confidence: 95,
    gaps: [],
    evidence: ['cardiac evaluation warranted', 'smoking history', 'age'],
    classification: 'diagnosis',
  },
  {
    id: 2,
    code: 'Z87.891',
    title: 'Z87.891 - Personal history of nicotine dependence',
    status: 'pending',
    details: 'Review patient history and confirm current status',
    codeType: 'ICD-10',
    docSupport: 'moderate',
    stillValid: true,
    confidence: 78,
    gaps: ['Current smoking status unclear', 'Pack-year history incomplete'],
    evidence: ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling'],
    classification: ['diagnosis', 'prevention'],
  },
  {
    id: 3,
    code: 'E78.5',
    title: 'E78.5 - Hyperlipidemia, unspecified',
    status: 'confirmed',
    details: 'Lab values support this diagnosis',
    codeType: 'ICD-10',
    docSupport: 'strong',
    stillValid: true,
    confidence: 88,
    gaps: ['Specific lipid values not documented'],
    evidence: ['lipid profile', 'Basic metabolic panel'],
    classification: 'diagnosis',
  },
  {
    id: 4,
    code: 'I10',
    title: 'I10 - Essential hypertension',
    status: 'confirmed',
    details: 'Documented with current BP readings',
    codeType: 'ICD-10',
    docSupport: 'strong',
    stillValid: true,
    confidence: 92,
    gaps: [],
    evidence: ['CARDIOVASCULAR:', 'Regular rate and rhythm'],
    classification: 'diagnosis',
  },
];

const suggestedCodesSample = [
  {
    id: 1,
    code: 'Z13.6',
    title: 'Z13.6 - Encounter for screening for cardiovascular disorders',
    status: 'pending',
    details: 'AI suggests adding this screening code for completeness',
    codeType: 'ICD-10',
    docSupport: 'moderate',
    confidence: 82,
    aiReasoning:
      'Patient age and risk factors indicate appropriate cardiovascular screening',
    evidence: ['EKG to rule out cardiac abnormalities', 'stress testing'],
    suggestedBy: 'Clinical Decision Support',
    classification: ['prevention', 'diagnosis'],
  },
  {
    id: 2,
    code: 'F17.210',
    title: 'F17.210 - Nicotine dependence, cigarettes, uncomplicated',
    status: 'pending',
    details: 'More specific than current history code - consider upgrading',
    codeType: 'ICD-10',
    docSupport: 'strong',
    confidence: 91,
    aiReasoning:
      'Current smoking documented with specific frequency and duration',
    evidence: ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling'],
    suggestedBy: 'Coding Optimization',
    classification: ['diagnosis', 'prevention'],
  },
  {
    id: 3,
    code: 'Z68.36',
    title: 'Z68.36 - Body mass index 36.0-36.9, adult',
    status: 'pending',
    details: 'BMI documentation supports billing and care coordination',
    codeType: 'ICD-10',
    docSupport: 'strong',
    confidence: 94,
    aiReasoning:
      'BMI calculated from documented height/weight measurements',
    evidence: ['PHYSICAL EXAMINATION:', 'GENERAL:'],
    suggestedBy: 'Documentation Enhancement',
    classification: ['diagnosis', 'prevention'],
  },
  {
    id: 4,
    code: '99213',
    title: '99213 - Office visit, established patient, low complexity',
    status: 'pending',
    details: 'Appropriate E/M level based on documentation complexity',
    codeType: 'CPT',
    docSupport: 'strong',
    confidence: 87,
    aiReasoning:
      'Documentation supports this level of medical decision making',
    evidence: ['PLAN:', 'Consider stress testing'],
    suggestedBy: 'Billing Optimization',
    classification: 'code',
  },
  {
    id: 5,
    code: '80061',
    title: '80061 - Lipid panel',
    status: 'pending',
    details: 'Lab work mentioned in plan should be coded',
    codeType: 'CPT',
    docSupport: 'moderate',
    confidence: 76,
    aiReasoning: 'Lab orders documented in assessment and plan',
    evidence: ['lipid profile', 'Basic metabolic panel'],
    suggestedBy: 'Procedure Capture',
    classification: ['code', 'prevention'],
  },
  {
    id: 6,
    code: '93000',
    title: '93000 - Electrocardiogram, routine ECG with interpretation',
    status: 'pending',
    details: 'ECG mentioned in plan should be captured for billing',
    codeType: 'CPT',
    docSupport: 'strong',
    confidence: 85,
    aiReasoning: 'ECG explicitly mentioned in treatment plan',
    evidence: ['EKG to rule out cardiac abnormalities'],
    suggestedBy: 'Procedure Capture',
    classification: 'code',
  },
];

const complianceItemsSample = [
  {
    id: 1,
    title: 'Attestation of patient counseling',
    description: 'Document smoking cessation counseling details',
    status: 'pending',
    severity: 'medium',
  },
  {
    id: 2,
    title: 'Follow-up scheduling',
    description: 'Ensure follow-up appointment within 2 weeks',
    status: 'pending',
    severity: 'low',
  },
  {
    id: 3,
    title: 'Quality measure: blood pressure control',
    description: 'Confirm most recent blood pressure reading',
    status: 'pending',
    severity: 'high',
  },
];

const patientMetadataSample = {
  name: 'John Smith',
  patientId: 'PT-789456',
  encounterId: 'E-2024-0315',
  age: 65,
  sex: 'male',
  encounterDate: new Date().toLocaleDateString(),
};

const sampleNote = `PATIENT: John Smith, 65-year-old male
DATE: ${new Date().toLocaleDateString()}

CHIEF COMPLAINT:
Chest pain for 2 days, described as sharp, located in the precordial region.

HISTORY OF PRESENT ILLNESS:
Patient reports chest pain that began approximately 48 hours prior to this encounter. He describes the pain as sharp in character, localized to the precordial region. The pain is intermittent and worsens with physical activity. Patient has a history of smoking 1 pack per day for 30 years. No associated shortness of breath, nausea, or diaphoresis reported.

PHYSICAL EXAMINATION:
GENERAL: Alert, oriented, appears comfortable at rest
CARDIOVASCULAR: Regular rate and rhythm, no murmurs appreciated, no peripheral edema
RESPIRATORY: Clear to auscultation bilaterally
EXTREMITIES: No cyanosis, clubbing, or edema

ASSESSMENT:
Chest pain, likely musculoskeletal in nature given characteristics and lack of associated symptoms. However, given patient's smoking history and age, cardiac evaluation warranted.

PLAN:
1. EKG to rule out cardiac abnormalities
2. Basic metabolic panel and lipid profile
3. Consider stress testing if symptoms persist
4. Smoking cessation counseling provided`;

function simulateFinalize(request: Parameters<NonNullable<FinalizationWizardProps['onFinalize']>>[0]): FinalizeResult {
  return {
    finalizedContent: request.content.trim(),
    codesSummary: request.codes.map(code => ({ code })),
    reimbursementSummary: {
      total: request.codes.length * 85,
      codes: request.codes.map(code => ({ code, amount: 85 })),
    },
    exportReady: request.compliance.length === 0,
    issues: {
      content: request.content.trim().length < 50 ? ['Content appears too short'] : [],
      codes: request.codes.length ? [] : ['At least one billing code is required'],
      prevention: request.prevention.length ? [] : ['No preventive documentation captured'],
      diagnoses: request.diagnoses.length ? [] : ['At least one diagnosis must be confirmed'],
      differentials: request.differentials.length
        ? []
        : ['Consider documenting differential diagnoses for risk adjustment'],
      compliance: request.compliance,
    },
  };
}

export default function App() {
  const handleFinalize = React.useCallback(async (request: Parameters<NonNullable<FinalizationWizardProps['onFinalize']>>[0]) => {
    return simulateFinalize(request);
  }, []);

  return (
    <FinalizationWizard
      selectedCodes={selectedCodesSample}
      suggestedCodes={suggestedCodesSample}
      complianceItems={complianceItemsSample}
      noteContent={sampleNote}
      patientMetadata={patientMetadataSample}
      onFinalize={handleFinalize}
    />
  );
}
