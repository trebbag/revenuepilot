import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Settings } from 'lucide-react';
import { ProgressIndicator } from './ProgressIndicator';
import { NoteEditor } from './NoteEditor';
import { StepContent } from './StepContent';
import { DualRichTextEditor } from './DualRichTextEditor';

const steps = [
  {
    id: 1,
    title: 'Code Review',
    description: 'Review and validate your selected diagnostic codes',
    type: 'selected-codes',
    stepType: 'selected',
    totalSelected: 4,
    totalSuggestions: 6, // For comparison display
    items: [
      { 
        id: 1, 
        title: 'I25.10 - Atherosclerotic heart disease', 
        status: 'confirmed', 
        details: 'Primary diagnosis confirmed with supporting documentation',
        codeType: 'ICD-10',
        category: 'diagnosis',
        confidence: 95,
        docSupport: 'strong',
        stillValid: true,
        gaps: [],
        evidence: ['chest pain', 'cardiac evaluation warranted', 'smoking history', 'age']
      },
      { 
        id: 2, 
        title: 'Z87.891 - Personal history of nicotine dependence', 
        status: 'pending', 
        details: 'Review patient history and confirm current status',
        codeType: 'ICD-10',
        category: 'history',
        confidence: 78,
        docSupport: 'moderate',
        stillValid: true,
        gaps: ['Current smoking status unclear', 'Pack-year history incomplete'],
        evidence: ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling']
      },
      { 
        id: 3, 
        title: 'E78.5 - Hyperlipidemia, unspecified', 
        status: 'confirmed', 
        details: 'Lab values support this diagnosis',
        codeType: 'ICD-10',
        category: 'diagnosis',
        confidence: 88,
        docSupport: 'strong',
        stillValid: true,
        gaps: ['Specific lipid values not documented'],
        evidence: ['lipid profile', 'Basic metabolic panel']
      },
      { 
        id: 4, 
        title: 'I10 - Essential hypertension', 
        status: 'confirmed', 
        details: 'Documented with current BP readings',
        codeType: 'ICD-10',
        category: 'diagnosis',
        confidence: 92,
        docSupport: 'strong',
        stillValid: true,
        gaps: [],
        evidence: ['CARDIOVASCULAR:', 'Regular rate and rhythm']
      }
    ],
    patientQuestions: []
  },
  {
    id: 2,
    title: 'Suggestion Review',
    description: 'Evaluate AI-recommended diagnostic codes',
    type: 'suggested-codes',
    stepType: 'suggested',
    totalSelected: 4, // For comparison display
    totalSuggestions: 6,
    items: [
      { 
        id: 1, 
        title: 'Z13.6 - Encounter for screening for cardiovascular disorders', 
        status: 'pending', 
        details: 'AI suggests adding this screening code for completeness',
        codeType: 'ICD-10',
        category: 'screening',
        confidence: 82,
        docSupport: 'moderate',
        aiReasoning: 'Patient age and risk factors indicate appropriate cardiovascular screening',
        evidence: ['EKG to rule out cardiac abnormalities', 'stress testing'],
        suggestedBy: 'Clinical Decision Support'
      },
      { 
        id: 2, 
        title: 'F17.210 - Nicotine dependence, cigarettes, uncomplicated', 
        status: 'pending', 
        details: 'More specific than current history code - consider upgrading',
        codeType: 'ICD-10',
        category: 'diagnosis',
        confidence: 91,
        docSupport: 'strong',
        aiReasoning: 'Current smoking documented with specific frequency and duration',
        evidence: ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling'],
        suggestedBy: 'Coding Optimization'
      },
      { 
        id: 3, 
        title: 'Z68.36 - Body mass index 36.0-36.9, adult', 
        status: 'pending', 
        details: 'BMI documentation supports billing and care coordination',
        codeType: 'ICD-10',
        category: 'screening',
        confidence: 94,
        docSupport: 'strong',
        aiReasoning: 'BMI calculated from documented height/weight measurements',
        evidence: ['PHYSICAL EXAMINATION:', 'GENERAL:'],
        suggestedBy: 'Documentation Enhancement'
      },
      { 
        id: 4, 
        title: '99213 - Office visit, established patient, low complexity', 
        status: 'pending', 
        details: 'Appropriate E/M level based on documentation complexity',
        codeType: 'CPT',
        category: 'evaluation',
        confidence: 87,
        docSupport: 'strong',
        aiReasoning: 'Documentation supports this level of medical decision making',
        evidence: ['PLAN:', 'Consider stress testing'],
        suggestedBy: 'Billing Optimization'
      },
      { 
        id: 5, 
        title: '80061 - Lipid panel', 
        status: 'pending', 
        details: 'Lab work mentioned in plan should be coded',
        codeType: 'CPT',
        category: 'procedure',
        confidence: 76,
        docSupport: 'moderate',
        aiReasoning: 'Lab orders documented in assessment and plan',
        evidence: ['lipid profile', 'Basic metabolic panel'],
        suggestedBy: 'Procedure Capture'
      },
      { 
        id: 6, 
        title: '93000 - Electrocardiogram, routine ECG with interpretation', 
        status: 'pending', 
        details: 'ECG mentioned in plan should be captured for billing',
        codeType: 'CPT',
        category: 'procedure',
        confidence: 85,
        docSupport: 'strong',
        aiReasoning: 'ECG explicitly mentioned in treatment plan',
        evidence: ['EKG to rule out cardiac abnormalities'],
        suggestedBy: 'Procedure Capture'
      }
    ],
    patientQuestions: []
  },
  {
    id: 3,
    title: 'Compose',
    description: 'AI beautification and enhancement',
    type: 'loading',
    progressSteps: [
      { id: 1, title: 'Analyzing Content', status: 'completed' },
      { id: 2, title: 'Enhancing Structure', status: 'completed' },
      { id: 3, title: 'Beautifying Language', status: 'in-progress' },
      { id: 4, title: 'Final Review', status: 'pending' }
    ]
  },
  {
    id: 4,
    title: 'Compare & Edit',
    description: 'Compare original draft with beautified version',
    type: 'dual-editor',
    originalContent: `PATIENT: John Smith
DATE: ${new Date().toLocaleDateString()}

CHIEF COMPLAINT:
Chest pain for 2 days.

HISTORY OF PRESENT ILLNESS:
Patient reports chest pain. Started 2 days ago. Pain is sharp. Located in precordial region. Intermittent. Worsens with activity. Smoking history 1 pack per day for 30 years.

PHYSICAL EXAMINATION:
GENERAL: Alert, oriented, comfortable at rest
CARDIOVASCULAR: Regular rate and rhythm, no murmurs, no peripheral edema
RESPIRATORY: Clear to auscultation bilaterally
EXTREMITIES: No cyanosis, clubbing, or edema

ASSESSMENT:
Chest pain, likely musculoskeletal. Given smoking history and age, cardiac evaluation warranted.

PLAN:
1. EKG to rule out cardiac abnormalities
2. Basic metabolic panel and lipid profile
3. Consider stress testing if symptoms persist
4. Smoking cessation counseling provided`,
    beautifiedContent: `PATIENT: John Smith, 65-year-old male
DATE: ${new Date().toLocaleDateString()}

CHIEF COMPLAINT:
Acute chest pain with onset 48 hours prior to presentation, characterized as sharp and localized to the precordial region.

HISTORY OF PRESENT ILLNESS:
The patient presents with a chief complaint of chest pain that began approximately 48 hours prior to this encounter. He describes the pain as sharp in character, localized to the precordial region. The pain is intermittent in nature and worsens with physical activity. The patient has a significant tobacco use history, consuming one pack of cigarettes daily for the past 30 years. He denies associated shortness of breath, nausea, or diaphoresis.

PHYSICAL EXAMINATION:
GENERAL APPEARANCE: Patient is alert, oriented, and appears comfortable at rest
CARDIOVASCULAR: Regular rate and rhythm with no murmurs appreciated, no peripheral edema noted
RESPIRATORY: Clear to auscultation bilaterally without adventitious sounds
EXTREMITIES: No cyanosis, clubbing, or edema observed

ASSESSMENT AND PLAN:
Primary concern is chest pain, most likely musculoskeletal in nature given the characteristics and absence of associated symptoms. However, considering the patient's extensive smoking history and age, cardiac evaluation is clinically warranted.

DIAGNOSTIC WORKUP:
1. Electrocardiogram to rule out cardiac abnormalities and arrhythmias
2. Comprehensive metabolic panel and lipid profile for cardiovascular risk assessment
3. Consider cardiac stress testing if symptoms persist or worsen
4. Smoking cessation counseling provided with resources and follow-up recommendations`,
    patientSummaryContent: `VISIT SUMMARY FOR: John Smith
DATE: ${new Date().toLocaleDateString()}

WHY YOU CAME IN TODAY:
You visited us because you've been having chest pain for the past 2 days.

WHAT WE FOUND:
• Your chest pain seems to be sharp and located in the front of your chest
• The pain gets worse when you're active and comes and goes throughout the day
• Your physical exam looked normal - your heart sounds good and your lungs are clear
• We know you've been smoking about a pack of cigarettes a day for 30 years

WHAT THIS MEANS:
The chest pain you're experiencing is most likely from your muscles or chest wall (not your heart). However, because you've been smoking for a long time and you're 65 years old, we want to make sure your heart is okay.

WHAT WE'RE DOING NEXT:
1. Heart test (EKG) - This will check your heart rhythm and look for any problems
2. Blood tests - These will check your cholesterol and other important levels
3. Possible stress test - If your pain continues, we may have you do a test where you walk on a treadmill while we monitor your heart
4. Help with quitting smoking - We talked about resources to help you quit smoking, which will greatly improve your health

WHAT YOU SHOULD DO:
• Take it easy and avoid heavy physical activity until we get your test results
• Call us right away if your chest pain gets worse or if you have trouble breathing
• Consider the smoking cessation resources we discussed
• Follow up with us in 1-2 weeks to review your test results

IMPORTANT: If you have severe chest pain, trouble breathing, or feel like something is seriously wrong, go to the emergency room right away.`
  },
  {
    id: 5,
    title: 'Billing & Attest',
    description: 'Final review, billing verification, and attestation',
    type: 'placeholder',
    items: []
  },
  {
    id: 6,
    title: 'Sign & Dispatch',
    description: 'Final confirmation and submission',
    type: 'dispatch',
    items: []
  }
];

export function WorkflowWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [activeItemData, setActiveItemData] = useState<any>(null);
  const [isShowingEvidence, setIsShowingEvidence] = useState(false);
  const [patientQuestions, setPatientQuestions] = useState<Array<{
    id: number;
    question: string;
    source: string;
    priority: 'high' | 'medium' | 'low';
    codeRelated: string;
    category: 'clinical' | 'administrative' | 'documentation';
  }>>([]);
  const [showPatientQuestions, setShowPatientQuestions] = useState(false);
  const [noteContent, setNoteContent] = useState(`PATIENT: John Smith, 65-year-old male
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
4. Smoking cessation counseling provided`);

  const handleInsertTextToNote = (text: string) => {
    // Find the best place to insert the text based on content
    let insertPosition = noteContent.length;
    
    // Try to insert in appropriate sections
    if (text.toLowerCase().includes('smoking') || text.toLowerCase().includes('cigarette')) {
      // Insert in History of Present Illness or Social History
      const historyIndex = noteContent.indexOf('HISTORY OF PRESENT ILLNESS:');
      if (historyIndex !== -1) {
        const sectionEnd = noteContent.indexOf('\n\n', historyIndex);
        insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length;
      }
    } else if (text.toLowerCase().includes('weight') || text.toLowerCase().includes('bmi')) {
      // Insert in Physical Examination
      const examIndex = noteContent.indexOf('PHYSICAL EXAMINATION:');
      if (examIndex !== -1) {
        const sectionEnd = noteContent.indexOf('\n\n', examIndex);
        insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length;
      }
    } else if (text.toLowerCase().includes('family history')) {
      // Insert new section or in existing family history
      const assessmentIndex = noteContent.indexOf('ASSESSMENT:');
      if (assessmentIndex !== -1) {
        insertPosition = assessmentIndex;
      }
    }
    
    // Insert with proper formatting
    const formattedText = `\n\nADDITIONAL INFORMATION:\n${text}`;
    const newContent = noteContent.slice(0, insertPosition) + formattedText + noteContent.slice(insertPosition);
    setNoteContent(newContent);
  };

  const handleStepChange = (stepId: number) => {
    setCurrentStep(stepId);
  };

  // Generate patient questions based on code gaps
  const generatePatientQuestions = () => {
    const questions: Array<{
      id: number;
      question: string;
      source: string;
      priority: 'high' | 'medium' | 'low';
      codeRelated: string;
      category: 'clinical' | 'administrative' | 'documentation';
    }> = [];

    // Check selected codes (step 1) for gaps
    const selectedCodesStep = steps.find(step => step.id === 1);
    if (selectedCodesStep?.items) {
      selectedCodesStep.items.forEach((item: any) => {
        if (item.gaps && item.gaps.length > 0) {
          item.gaps.forEach((gap: string, index: number) => {
            const questionId = parseInt(`0${item.id}${index}`);
            let questionText = '';
            let priority: 'high' | 'medium' | 'low' = 'medium';
            
            if (gap.includes('smoking status')) {
              questionText = 'How many cigarettes do you currently smoke per day? When did you start smoking?';
              priority = 'high';
            } else if (gap.includes('lipid values')) {
              questionText = 'When was your last cholesterol test? Do you remember any of the specific numbers?';
              priority = 'medium';
            } else if (gap.includes('Pack-year')) {
              questionText = 'For how many years have you been smoking at your current rate?';
              priority = 'high';
            } else {
              questionText = `Please provide more details about: ${gap}`;
            }
            
            questions.push({
              id: questionId,
              question: questionText,
              source: `Code Gap: ${item.title}`,
              priority,
              codeRelated: item.title,
              category: 'clinical'
            });
          });
        }
      });
    }

    // Check suggested codes (step 2) for additional questions
    const suggestedCodesStep = steps.find(step => step.id === 2);
    if (suggestedCodesStep?.items) {
      suggestedCodesStep.items.forEach((item: any) => {
        if (item.category === 'screening') {
          const questionId = parseInt(`1${item.id}99`);
          let questionText = '';
          
          if (item.title.includes('cardiovascular screening')) {
            questionText = 'Do you have any family history of heart disease? Any chest pain with exertion?';
          } else if (item.title.includes('BMI')) {
            questionText = 'What is your current weight? Any recent weight changes?';
          }
          
          if (questionText) {
            questions.push({
              id: questionId,
              question: questionText,
              source: `Screening Opportunity: ${item.title}`,
              priority: 'low',
              codeRelated: item.title,
              category: 'clinical'
            });
          }
        }
      });
    }

    return questions;
  };

  // Generate questions when steps 1 or 2 are active
  React.useEffect(() => {
    if (currentStep === 1 || currentStep === 2) {
      const newQuestions = generatePatientQuestions();
      setPatientQuestions(newQuestions);
    }
  }, [currentStep]);

  const currentStepData = steps.find(step => step.id === currentStep);

  // Generate highlight ranges only when explicitly showing evidence
  const getHighlightRanges = () => {
    if (!activeItemData || !noteContent || !isShowingEvidence) return [];

    const ranges: any[] = [];
    
    // Define evidence text that relates to each type of item
    const evidenceMap: { [key: string]: string[] } = {
      'Missing Chief Complaint Details': ['Chest pain for 2 days', 'sharp', 'precordial region'],
      'Incomplete Social History': ['smoking 1 pack per day for 30 years', 'smoking history'],
      'Medication Reconciliation': ['PLAN:', 'Consider stress testing'],
      'Follow-up Questions': ['No associated shortness of breath', 'cardiac evaluation warranted'],
      'Review of Systems Gap': ['CARDIOVASCULAR:', 'RESPIRATORY:', 'no murmurs'],
      'Physical Exam Addition': ['Regular rate and rhythm', 'no murmurs appreciated'],
      'I25.10 - Atherosclerotic heart disease': ['cardiac evaluation warranted', 'smoking history', 'age'],
      'Z87.891 - Personal history of nicotine dependence': ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling'],
      'E78.5 - Hyperlipidemia, unspecified': ['lipid profile', 'Basic metabolic panel'],
      'I10 - Essential hypertension': ['CARDIOVASCULAR:', 'Regular rate and rhythm'],
      'Z13.6 - Encounter for screening for cardiovascular disorders': ['EKG to rule out cardiac abnormalities', 'stress testing'],
      'F17.210 - Nicotine dependence, cigarettes, uncomplicated': ['smoking 1 pack per day for 30 years', 'Smoking cessation counseling'],
      'Z68.36 - Body mass index 36.0-36.9, adult': ['PHYSICAL EXAMINATION:', 'GENERAL:'],
      'Z51.81 - Encounter for therapeutic drug level monitoring': ['PLAN:', 'Consider stress testing']
    };

    const evidenceTexts = evidenceMap[activeItemData.title] || [];
    
    evidenceTexts.forEach((evidenceText, index) => {
      const startIndex = noteContent.toLowerCase().indexOf(evidenceText.toLowerCase());
      if (startIndex !== -1) {
        ranges.push({
          start: startIndex,
          end: startIndex + evidenceText.length,
          className: index % 3 === 0 ? 'highlight-blue' : index % 3 === 1 ? 'highlight-emerald' : 'highlight-amber',
          label: `Evidence ${index + 1}`,
          text: evidenceText
        });
      }
    });

    return ranges;
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden relative">
      {/* Background Layer - Very Subtle Base */}
      <motion.div 
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.8 }}
        style={{
          background: "linear-gradient(135deg, #fdfdff 0%, #fcfcff 25%, #fafaff 50%, #f9f9ff 75%, #fdfdff 100%)"
        }}
      />
      {/* Main UI Content Container - Loads First */}
      <motion.div
        className="relative z-10 h-full flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Header with Progress */}
        <motion.div 
          className="border-b border-white/20 shadow-sm"
          style={{
            background: "linear-gradient(135deg, #fefefe 0%, #fdfdfd 50%, #fcfcfc 100%)"
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
        >
        <ProgressIndicator 
          steps={steps} 
          currentStep={currentStep} 
          onStepClick={handleStepChange}
        />
        </motion.div>

        {/* Main Content */}
        <motion.div 
          className="flex-1 flex overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
        >
        {currentStepData?.type === 'loading' ? (
          // Loading Screen for AI Compose
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)"
            }}
          >
            <div className="text-center max-w-md">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Settings size={32} className="text-white" />
                </motion.div>
              </div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">AI Enhancement in Progress</h2>
              <p className="text-slate-600 mb-8">Analyzing and beautifying your medical documentation...</p>
              
              <div className="space-y-4">
                {currentStepData.progressSteps?.map((step, index) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.2 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      step.status === 'completed' ? 'bg-emerald-50 border border-emerald-200' :
                      step.status === 'in-progress' ? 'bg-blue-50 border border-blue-200' :
                      'bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      step.status === 'completed' ? 'bg-emerald-500' :
                      step.status === 'in-progress' ? 'bg-blue-500' : 'bg-slate-300'
                    }`}>
                      {step.status === 'completed' ? 
                        <Check size={14} className="text-white" /> :
                        step.status === 'in-progress' ?
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                        /> :
                        <div className="w-2 h-2 bg-white rounded-full" />
                      }
                    </div>
                    <span className={`font-medium ${
                      step.status === 'completed' ? 'text-emerald-700' :
                      step.status === 'in-progress' ? 'text-blue-700' : 'text-slate-600'
                    }`}>
                      {step.title}
                    </span>
                  </motion.div>
                ))}
              </div>
              
              <motion.button
                onClick={() => setCurrentStep(4)}
                className="mt-8 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Continue to Compare & Edit
              </motion.button>
            </div>
          </motion.div>
        ) : currentStepData?.type === 'dual-editor' ? (
          // Dual Rich Text Editor for Compare & Edit
          <DualRichTextEditor
            originalContent={currentStepData.originalContent || ''}
            aiEnhancedContent={currentStepData.beautifiedContent || ''}
            patientSummaryContent={currentStepData.patientSummaryContent || ''}
            onAcceptAllChanges={() => {
              // Accept all changes - could merge enhanced version back to main note
              console.log('Accepting all changes');
              // You could update the main noteContent here
            }}
            onReBeautify={() => {
              // Re-run AI beautification
              console.log('Re-beautifying content');
              // You could trigger AI enhancement again here
            }}
            onContentChange={(content, version) => {
              console.log('Content changed:', version, content);
              // Handle content changes for each version
            }}
            onNavigateNext={() => {
              // Navigate to next step (Billing & Attest)
              setCurrentStep(5);
            }}
            onNavigatePrevious={() => {
              // Navigate to previous step (Compose)
              setCurrentStep(3);
            }}
          />
        ) : currentStepData?.type === 'placeholder' || currentStepData?.type === 'dispatch' ? (
          // Placeholder screens for steps 5 and 6
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)"
            }}
          >
            <div className="text-center max-w-md">
              <div className="w-24 h-24 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">{currentStep}</span>
              </div>
              
              <h2 className="text-xl font-semibold text-slate-800 mb-2">{currentStepData.title}</h2>
              <p className="text-slate-600 mb-8">{currentStepData.description}</p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-8">
                <p className="text-slate-500 italic">This step is under construction</p>
              </div>
              
              {/* Navigation Buttons */}
              <div className="flex justify-center gap-4">
                <motion.button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={currentStep <= 1}
                >
                  Back
                </motion.button>
                
                {currentStepData.type === 'dispatch' ? (
                  <motion.button
                    onClick={() => {
                      console.log('Dispatching...');
                      // Handle dispatch logic here
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Dispatch
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={() => setCurrentStep(currentStep + 1)}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={currentStep >= steps.length}
                  >
                    Next
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          // Standard Layout for Cards, Summary, and Confirmation steps
          <>
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
              className="w-1/2 bg-white border-r border-slate-200/50 shadow-sm"
            >
              <NoteEditor 
                content={noteContent} 
                onChange={setNoteContent}
                highlightRanges={getHighlightRanges()}
                disabled={isShowingEvidence}
                questionsCount={(currentStep === 1 || currentStep === 2) ? patientQuestions.length : 0}
                onShowQuestions={() => setShowPatientQuestions(true)}
                onInsertText={handleInsertTextToNote}
              />
            </motion.div>

            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
              className="w-1/2 relative overflow-hidden flex flex-col bg-white"
            >
              {/* Adaptive Background - Responds to Gap Cards */}
              <motion.div 
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 1.0 }}
                style={{
                  background: activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0 
                    ? "linear-gradient(135deg, #fffef9 0%, #fffcf5 25%, #fffaf0 50%, #fef9ec 75%, #fffef9 100%)"  // Soft cream base for gap cards
                    : "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)", // Cool base for regular cards
                }}
              >
                {/* Enhanced Pulsing Overlay - Reactive to Gap Cards */}
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    background: activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0 ? [
                      // Soft cream gradients for gap cards - much lighter with white tones
                      "linear-gradient(135deg, rgba(255, 248, 220, 0.08) 0%, rgba(255, 253, 235, 0.04) 100%)",     // Very light cream start
                      "linear-gradient(135deg, rgba(254, 240, 190, 0.10) 0%, rgba(255, 248, 220, 0.06) 100%)",     // Light cream blend
                      "linear-gradient(135deg, rgba(253, 230, 138, 0.08) 0%, rgba(254, 240, 190, 0.06) 100%)",     // Soft yellow cream
                      "linear-gradient(135deg, rgba(252, 211, 77, 0.06) 0%, rgba(253, 230, 138, 0.08) 100%)",      // Medium cream blend
                      "linear-gradient(135deg, rgba(253, 230, 138, 0.06) 0%, rgba(252, 211, 77, 0.04) 100%)",      // Return to medium
                      "linear-gradient(135deg, rgba(254, 240, 190, 0.08) 0%, rgba(255, 248, 220, 0.05) 100%)",     // Light return blend
                      "linear-gradient(135deg, rgba(255, 248, 220, 0.08) 0%, rgba(255, 253, 235, 0.04) 100%)"      // Back to cream
                    ] : [
                      // Original blue-purple gradients for regular cards
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%)",     // Pure blue start
                      "linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(129, 140, 248, 0.08) 100%)",     // Blue-indigo blend
                      "linear-gradient(135deg, rgba(99, 102, 241, 0.10) 0%, rgba(147, 51, 234, 0.08) 100%)",     // Indigo-purple blend
                      "linear-gradient(135deg, rgba(126, 34, 206, 0.08) 0%, rgba(147, 51, 234, 0.10) 100%)",     // Purple-violet blend
                      "linear-gradient(135deg, rgba(147, 51, 234, 0.06) 0%, rgba(126, 34, 206, 0.04) 100%)",     // Pure purple end
                      "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(79, 70, 229, 0.06) 100%)",      // Return blend
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%)"      // Back to blue
                    ]
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.15, 0.35, 0.55, 0.7, 0.85, 1]
                  }}
                />

                {/* Enhanced Wave Effect - Reactive to Gap Cards */}
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
                    background: activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0 ? [
                      // Bright yellow wave effects for gap cards
                      "linear-gradient(45deg, transparent 0%, rgba(250, 204, 21, 0.08) 50%, transparent 100%)",    // Yellow wave
                      "linear-gradient(45deg, transparent 0%, rgba(234, 179, 8, 0.08) 50%, transparent 100%)",     // Deep yellow wave  
                      "linear-gradient(45deg, transparent 0%, rgba(202, 138, 4, 0.08) 50%, transparent 100%)",     // Rich yellow wave
                      "linear-gradient(45deg, transparent 0%, rgba(234, 179, 8, 0.08) 50%, transparent 100%)",     // Back to deep yellow
                      "linear-gradient(45deg, transparent 0%, rgba(250, 204, 21, 0.08) 50%, transparent 100%)"     // Back to yellow
                    ] : [
                      // Original blue-purple wave effects for regular cards
                      "linear-gradient(45deg, transparent 0%, rgba(59, 130, 246, 0.05) 50%, transparent 100%)",    // Blue wave
                      "linear-gradient(45deg, transparent 0%, rgba(99, 102, 241, 0.05) 50%, transparent 100%)",    // Indigo wave  
                      "linear-gradient(45deg, transparent 0%, rgba(139, 92, 246, 0.05) 50%, transparent 100%)",    // Purple wave
                      "linear-gradient(45deg, transparent 0%, rgba(99, 102, 241, 0.05) 50%, transparent 100%)",    // Back to indigo
                      "linear-gradient(45deg, transparent 0%, rgba(59, 130, 246, 0.05) 50%, transparent 100%)"     // Back to blue
                    ]
                  }}
                  transition={{
                    backgroundPosition: {
                      duration: 18,
                      repeat: Infinity,
                      ease: "easeInOut"
                    },
                    background: {
                      duration: 12,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.25, 0.5, 0.75, 1]
                    }
                  }}
                  style={{
                    backgroundSize: "200% 200%"
                  }}
                />

                {/* Radial Pulse - Reactive to Gap Cards */}
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    background: activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0 ? [
                      // Bright yellow radial pulses for gap cards 
                      "radial-gradient(circle at 30% 70%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)",       // Yellow at bottom left
                      "radial-gradient(circle at 60% 40%, rgba(234, 179, 8, 0.10) 0%, transparent 50%)",        // Deep yellow center-right  
                      "radial-gradient(circle at 40% 60%, rgba(202, 138, 4, 0.08) 0%, transparent 50%)",        // Rich yellow center-left
                      "radial-gradient(circle at 70% 30%, rgba(161, 98, 7, 0.10) 0%, transparent 50%)",         // Dark yellow top right
                      "radial-gradient(circle at 50% 80%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)",        // Rich yellow bottom
                      "radial-gradient(circle at 25% 45%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)",        // Return deep yellow left
                      "radial-gradient(circle at 30% 70%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)"        // Back to yellow
                    ] : [
                      // Original blue-purple radial pulses for regular cards
                      "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)",       // Blue at bottom left
                      "radial-gradient(circle at 60% 40%, rgba(79, 70, 229, 0.06) 0%, transparent 50%)",        // Indigo center-right  
                      "radial-gradient(circle at 40% 60%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",       // Violet center-left
                      "radial-gradient(circle at 70% 30%, rgba(147, 51, 234, 0.06) 0%, transparent 50%)",       // Purple top right
                      "radial-gradient(circle at 50% 80%, rgba(126, 34, 206, 0.04) 0%, transparent 50%)",       // Deep purple bottom
                      "radial-gradient(circle at 25% 45%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",       // Return violet left
                      "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)"        // Back to blue
                    ]
                  }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]
                  }}
                />

                {/* Accent Shimmer Layer - Adaptive Colors */}
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    background: activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0 ? [
                      // Bright yellow shimmer for gap cards
                      "linear-gradient(120deg, transparent 0%, rgba(250, 204, 21, 0.03) 25%, transparent 50%, rgba(234, 179, 8, 0.025) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(234, 179, 8, 0.03) 25%, transparent 50%, rgba(202, 138, 4, 0.03) 75%, transparent 100%)", 
                      "linear-gradient(120deg, transparent 0%, rgba(202, 138, 4, 0.035) 25%, transparent 50%, rgba(161, 98, 7, 0.03) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(161, 98, 7, 0.03) 25%, transparent 50%, rgba(202, 138, 4, 0.025) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(202, 138, 4, 0.025) 25%, transparent 50%, rgba(234, 179, 8, 0.03) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(234, 179, 8, 0.03) 25%, transparent 50%, rgba(250, 204, 21, 0.03) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(250, 204, 21, 0.03) 25%, transparent 50%, rgba(234, 179, 8, 0.025) 75%, transparent 100%)"
                    ] : [
                      // Original blue shimmer for regular cards
                      "linear-gradient(120deg, transparent 0%, rgba(59, 130, 246, 0.02) 25%, transparent 50%, rgba(79, 70, 229, 0.015) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(79, 70, 229, 0.02) 25%, transparent 50%, rgba(99, 102, 241, 0.02) 75%, transparent 100%)", 
                      "linear-gradient(120deg, transparent 0%, rgba(99, 102, 241, 0.025) 25%, transparent 50%, rgba(147, 51, 234, 0.02) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(147, 51, 234, 0.02) 25%, transparent 50%, rgba(126, 34, 206, 0.015) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(126, 34, 206, 0.015) 25%, transparent 50%, rgba(99, 102, 241, 0.02) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(99, 102, 241, 0.02) 25%, transparent 50%, rgba(79, 70, 229, 0.02) 75%, transparent 100%)",
                      "linear-gradient(120deg, transparent 0%, rgba(59, 130, 246, 0.02) 25%, transparent 50%, rgba(79, 70, 229, 0.015) 75%, transparent 100%)"
                    ],
                    backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"]
                  }}
                  transition={{
                    background: {
                      duration: 14,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]
                    },
                    backgroundPosition: {
                      duration: 20,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  style={{
                    backgroundSize: "300% 300%"
                  }}
                />
              </motion.div>
              
              {/* Content wrapper */}
              <motion.div 
                className="relative z-20 flex-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
              >
                <AnimatePresence mode="wait">
                  <StepContent 
                    key={currentStep}
                    step={currentStepData!} 
                    onNext={() => currentStep < 6 && setCurrentStep(currentStep + 1)}
                    onPrevious={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
                    onActiveItemChange={setActiveItemData}
                    onShowEvidence={setIsShowingEvidence}
                    patientQuestions={patientQuestions}
                    onUpdatePatientQuestions={setPatientQuestions}
                    showPatientTray={showPatientQuestions}
                    onShowPatientTray={setShowPatientQuestions}
                    onInsertToNote={handleInsertTextToNote}
                  />
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