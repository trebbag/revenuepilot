const express = require('express');
const cors = require('cors');

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  process.env.FRONTEND_BASE_URL ||
  `http://127.0.0.1:${process.env.FRONTEND_DEV_PORT || 4173}`;

const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.options('*', cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

const PORT = Number(process.env.FRONTEND_API_PORT || 4010);

const demoUser = {
  id: 'user-100',
  name: 'Dr. Ava Mitchell',
  fullName: 'Dr. Ava Mitchell',
  email: 'ava.mitchell@exampleclinic.com',
  role: 'admin',
  permissions: [
    'view:analytics',
    'view:activity-log',
    'manage:settings',
    'manage:builder',
  ],
  specialty: 'Family Medicine',
  payer: 'Aetna Premier',
};

let sessionState = {
  selectedCodes: {
    codes: 2,
    prevention: 0,
    diagnoses: 0,
    differentials: 0,
  },
  selectedCodesList: [
    {
      id: 1,
      code: '99213',
      type: 'CPT',
      category: 'codes',
      description: 'Established patient visit, 20 minutes',
      rationale: 'Follow-up evaluation for chronic condition',
      confidence: 0.92,
    },
    {
      id: 2,
      code: 'J1100',
      type: 'HCPCS',
      category: 'codes',
      description: 'Injection, dexamethasone sodium phosphate, 1 mg',
      rationale: 'Therapeutic injection administered in office',
      confidence: 0.88,
    },
  ],
  addedCodes: ['99213', 'J1100'],
  isSuggestionPanelOpen: false,
  analyticsPreferences: {
    activeTab: 'billing',
  },
};

let layoutPreferences = {
  noteEditor: 68,
  suggestionPanel: 32,
};

let activeVisit = {
  sessionId: 'visit-2001',
  status: 'inactive',
  startTime: null,
  endTime: null,
  encounterId: null,
};

let workflowSession = {
  sessionId: 'wf-3001',
  encounterId: '67890',
  patientId: '1000001',
  noteId: '5001',
  currentStep: 4,
  stepStates: [
    { step: 1, status: 'completed', progress: 100 },
    { step: 2, status: 'completed', progress: 100 },
    { step: 3, status: 'completed', progress: 100 },
    { step: 4, status: 'in_progress', progress: 60 },
    { step: 5, status: 'not_started', progress: 0 },
    { step: 6, status: 'not_started', progress: 0 },
  ],
  selectedCodes: [
    {
      id: 1,
      code: '99213',
      type: 'CPT',
      category: 'codes',
      description: 'Established patient visit, 20 minutes',
      rationale: 'Follow-up evaluation for chronic condition',
      confidence: 0.92,
    },
    {
      id: 2,
      code: 'J1100',
      type: 'HCPCS',
      category: 'codes',
      description: 'Injection, dexamethasone sodium phosphate, 1 mg',
      rationale: 'Therapeutic injection administered in office',
      confidence: 0.88,
    },
  ],
  complianceIssues: [],
  patientMetadata: {
    patientId: '1000001',
    encounterId: '67890',
    name: 'Jane Doe',
    age: 34,
    sex: 'Female',
    encounterDate: '2024-03-15',
    providerName: demoUser.fullName,
  },
  noteContent:
    'SUBJECTIVE:\nPatient presents with stable hypertension follow-up.\n\nOBJECTIVE:\nBlood pressure 124/78.\n\nASSESSMENT:\nHypertension, well controlled.\n\nPLAN:\nContinue current medications and schedule labs.',
  reimbursementSummary: {
    total: 185.5,
    codes: [
      { code: '99213', amount: 125.0 },
      { code: 'J1100', amount: 60.5 },
    ],
  },
  auditTrail: [
    {
      actor: demoUser.fullName,
      action: 'session.created',
      timestamp: new Date().toISOString(),
      description: 'Workflow session initialized for encounter 67890',
    },
  ],
  blockingIssues: [],
};

const patients = [
  {
    patientId: '1000001',
    name: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    dob: '1990-05-12',
    age: 34,
    gender: 'Female',
    mrn: 'MRN-2048',
    insurance: 'Aetna Premier',
    lastVisit: '2024-02-27',
    allergies: ['Penicillin'],
    medications: ['Atorvastatin 20mg daily'],
  },
  {
    patientId: '1000002',
    name: 'Michael Rivera',
    firstName: 'Michael',
    lastName: 'Rivera',
    dob: '1982-11-03',
    age: 41,
    gender: 'Male',
    mrn: 'MRN-2088',
    insurance: 'Blue Shield Gold',
    lastVisit: '2024-02-15',
    allergies: ['None'],
    medications: ['Lisinopril 10mg daily'],
  },
];

const analyticsStub = {
  usage: {
    total_notes: 128,
    beautify: 54,
    suggest: 42,
    summary: 64,
    chart_upload: 12,
    audio: 28,
    avg_note_length: 512,
    daily_trends: Array.from({ length: 7 }).map((_, idx) => ({
      day: `2024-03-${10 + idx}`,
      total_notes: 14 + idx,
      beautify: 5 + (idx % 3),
      suggest: 4 + (idx % 2),
      summary: 6 + (idx % 4),
      chart_upload: 2 + (idx % 2),
      audio: 3 + (idx % 3),
    })),
    projected_totals: {
      month: 240,
      quarter: 720,
      year: 2880,
    },
    event_distribution: {
      beautify: 32,
      suggest: 26,
      summary: 18,
      transcription: 14,
      export: 10,
    },
  },
  coding: {
    total_notes: 96,
    denials: 4,
    deficiencies: 7,
    accuracy: 93,
    coding_distribution: {
      'Level 3': 42,
      'Level 4': 38,
      'Level 5': 16,
    },
    outcome_distribution: {
      approved: 88,
      appealed: 5,
      denied: 3,
    },
    accuracy_trend: Array.from({ length: 7 }).map((_, idx) => ({
      day: `2024-03-${10 + idx}`,
      total_notes: 12 + idx,
      denials: idx % 2,
      deficiencies: idx % 3,
      accuracy: 90 + (idx % 5),
    })),
    projections: {
      month: 275,
      quarter: 810,
      year: 3240,
    },
  },
  revenue: {
    total_revenue: 48250,
    average_revenue: 378,
    revenue_by_code: {
      '99213': 16250,
      '99214': 12400,
      'J1100': 5200,
      '93000': 4800,
    },
    revenue_trend: Array.from({ length: 7 }).map((_, idx) => ({
      day: `2024-03-${10 + idx}`,
      total_revenue: 5400 + idx * 320,
      average_revenue: 360 + idx * 5,
    })),
    projections: {
      month: 146000,
      quarter: 438000,
      year: 1752000,
    },
    revenue_distribution: {
      Professional: 60,
      Facility: 25,
      Pharmacy: 15,
    },
  },
  compliance: {
    compliance_counts: {
      documentation: 12,
      coding: 8,
      billing: 5,
    },
    notes_with_flags: 14,
    total_flags: 26,
    flagged_rate: 11,
    compliance_trend: Array.from({ length: 7 }).map((_, idx) => ({
      day: `2024-03-${10 + idx}`,
      notes_with_flags: 2 + (idx % 3),
      total_flags: 4 + (idx % 4),
    })),
    projections: {
      month: 38,
      quarter: 108,
      year: 432,
    },
    compliance_distribution: {
      critical: 3,
      warning: 7,
      info: 16,
    },
  },
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/auth/status', (_req, res) => {
  res.json({ authenticated: true, user: demoUser });
});

app.post('/api/auth/logout', (_req, res) => {
  res.status(204).end();
});

app.get('/api/user/session', (_req, res) => {
  res.json({ ...sessionState });
});

app.put('/api/user/session', (req, res) => {
  sessionState = {
    ...sessionState,
    ...req.body,
  };
  res.json({ status: 'ok' });
});

app.get('/api/user/layout-preferences', (_req, res) => {
  res.json({ ...layoutPreferences });
});

app.put('/api/user/layout-preferences', (req, res) => {
  layoutPreferences = {
    ...layoutPreferences,
    ...req.body,
  };
  res.json({ status: 'ok' });
});

app.get('/api/user/profile', (_req, res) => {
  res.json({
    currentView: 'home',
    clinic: 'Riverbend Medical Group',
    preferences: {
      language: 'en',
      timezone: 'America/New_York',
    },
    uiPreferences: layoutPreferences,
  });
});

app.get('/api/user/ui-preferences', (_req, res) => {
  res.json({ uiPreferences: layoutPreferences });
});

app.get('/api/user/current-view', (_req, res) => {
  res.json({ currentView: 'home' });
});

app.get('/api/notifications/count', (_req, res) => {
  res.json({ count: 3 });
});

app.get('/api/dashboard/daily-overview', (_req, res) => {
  res.json({
    todaysNotes: 18,
    completedVisits: 12,
    pendingReviews: 4,
    complianceScore: 97,
    revenueToday: 14580,
  });
});

app.get('/api/dashboard/quick-actions', (_req, res) => {
  res.json({
    draftCount: 3,
    upcomingAppointments: 6,
    urgentReviews: 1,
    systemAlerts: [
      { type: 'info', message: 'FHIR export schema updated overnight' },
    ],
  });
});

app.get('/api/dashboard/activity', (_req, res) => {
  res.json([
    {
      id: 1,
      type: 'note.finalized',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      description: 'Finalized SOAP note for patient Jane Doe',
      userId: demoUser.id,
    },
    {
      id: 2,
      type: 'codes.added',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      description: 'Added CPT 99213 based on AI suggestion',
      userId: demoUser.id,
    },
  ]);
});

app.get('/api/system/status', (_req, res) => {
  res.json({
    aiServicesStatus: 'online',
    ehrConnectionStatus: 'online',
    lastSyncTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  });
});

app.get('/api/analytics/usage', (_req, res) => {
  res.json(analyticsStub.usage);
});

app.get('/api/analytics/coding-accuracy', (_req, res) => {
  res.json(analyticsStub.coding);
});

app.get('/api/analytics/revenue', (_req, res) => {
  res.json(analyticsStub.revenue);
});

app.get('/api/analytics/compliance', (_req, res) => {
  res.json(analyticsStub.compliance);
});

app.get('/api/analytics/drafts', (_req, res) => {
  res.json({ drafts: 3 });
});

app.get('/api/templates/list', (_req, res) => {
  res.json([
    {
      id: 'soap-template',
      name: 'SOAP Follow-up Template',
      description: 'Standard follow-up SOAP note structure',
      content:
        'SUBJECTIVE:\nChief Complaint:\nHistory of Present Illness:\nReview of Systems:\n\nOBJECTIVE:\nVital Signs:\nPhysical Examination:\n\nASSESSMENT:\nPrimary Diagnosis:\nSecondary Diagnoses:\n\nPLAN:\nTreatment:\nFollow-up:',
    },
    {
      id: 'consult-template',
      name: 'Consultation Template',
      description: 'Detailed consultation note format',
      content:
        'CONSULTATION NOTE:\nReason for Consultation:\nHistory of Present Illness:\nPast Medical History:\nMedications:\nAllergies:\nFamily History:\nSocial History:\n\nASSESSMENT AND PLAN:\n',
    },
  ]);
});

app.get('/api/notes/versions/:id', (req, res) => {
  res.json([
    {
      version: 1,
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      content: workflowSession.noteContent,
    },
  ]);
});

app.get('/api/patients/search', (req, res) => {
  const query = String(req.query.q || '').toLowerCase();
  const matches = patients.filter(patient => {
    const haystack = [
      patient.patientId,
      patient.name,
      patient.firstName,
      patient.lastName,
      patient.mrn,
    ]
      .filter(Boolean)
      .map(value => String(value).toLowerCase());
    return haystack.some(value => value.includes(query));
  });
  res.json({
    patients: matches,
    externalPatients: [],
  });
});

app.get('/api/patients/:id', (req, res) => {
  const patient = patients.find(p => p.patientId === req.params.id);
  if (!patient) {
    res.status(404).json({ detail: 'Patient not found' });
    return;
  }
  res.json({
    demographics: {
      patientId: patient.patientId,
      name: patient.name,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dob: patient.dob,
      age: patient.age,
      gender: patient.gender,
      mrn: patient.mrn,
      insurance: patient.insurance,
      lastVisit: patient.lastVisit,
    },
    allergies: patient.allergies,
    medications: patient.medications,
    encounters: [
      {
        encounterId: 67890,
        date: '2024-03-15',
        type: 'Follow-up',
        provider: demoUser.fullName,
      },
    ],
  });
});

app.get('/api/encounters/validate/:id', (req, res) => {
  const encounterId = Number(req.params.id);
  if (!Number.isFinite(encounterId)) {
    res.status(400).json({ errors: ['Encounter ID must be numeric'] });
    return;
  }
  res.json({
    valid: true,
    encounter: {
      encounterId,
      patientId: '1000001',
      date: '2024-03-15',
      type: 'Follow-up',
      provider: demoUser.fullName,
      description: 'Post-operative follow-up and medication review',
      patient: {
        patientId: '1000001',
        insurance: 'Aetna Premier',
      },
    },
  });
});

app.post('/api/notes/create', (req, res) => {
  console.log('[mock] create note', req.body);
  const noteId = '5001';
  workflowSession = {
    ...workflowSession,
    noteId,
    noteContent: req.body?.content || workflowSession.noteContent,
  };
  res.json({ noteId });
});

app.put('/api/notes/auto-save', (req, res) => {
  workflowSession = {
    ...workflowSession,
    noteContent: req.body?.content || workflowSession.noteContent,
  };
  res.json({ status: 'ok' });
});

app.post('/api/compliance/analyze', (req, res) => {
  res.json({ compliance: [] });
});

app.post('/api/ai/codes/suggest', (req, res) => {
  const baseContent = typeof req.body?.content === 'string' ? req.body.content : '';
  const includesHypertension = baseContent.toLowerCase().includes('hypertension');
  res.json({
    suggestions: [
      {
        code: 'I10',
        type: 'ICD-10',
        description: 'Essential (primary) hypertension',
        reasoning: 'Documented follow-up visit for hypertension management',
        confidence: includesHypertension ? 0.96 : 0.82,
      },
      {
        code: '99214',
        type: 'CPT',
        description: 'Office visit, established patient, 25 minutes',
        reasoning: 'Encounter includes medication management and chronic condition counseling',
        confidence: 0.74,
      },
    ],
  });
});

app.post('/api/ai/compliance/check', (_req, res) => {
  res.json({
    alerts: [
      {
        text: 'Document patient counseling on lifestyle modifications for hypertension.',
        category: 'documentation',
        priority: 'medium',
        confidence: 0.78,
      },
    ],
  });
});

app.post('/api/ai/differentials/generate', (_req, res) => {
  res.json({
    differentials: [
      {
        diagnosis: 'Hypertensive heart disease',
        icdCode: 'I11.9',
        confidence: 0.63,
        reasoning: 'Consider when long-standing hypertension and cardiac findings are present',
      },
      {
        diagnosis: 'Secondary hypertension',
        icdCode: 'I15.9',
        confidence: 0.41,
        reasoning: 'Rule out secondary causes when blood pressure remains uncontrolled',
      },
    ],
  });
});

app.post('/api/ai/prevention/suggest', (_req, res) => {
  res.json({
    recommendations: [
      {
        id: 'prevent-01',
        code: '3078F',
        type: 'CPT II',
        category: 'preventive',
        recommendation: 'Document blood pressure goals and follow-up plan.',
        priority: 'medium',
        source: 'USPSTF',
      },
    ],
  });
});

app.post('/api/visits/session', (req, res) => {
  const encounterId = req.body?.encounter_id ?? req.body?.encounterId;
  activeVisit = {
    sessionId: 'visit-2001',
    status: 'active',
    startTime: new Date().toISOString(),
    endTime: null,
    encounterId,
  };
  res.json(activeVisit);
});

app.put('/api/visits/session', (req, res) => {
  const action = req.body?.action;
  if (action === 'active') {
    activeVisit = {
      ...activeVisit,
      status: 'active',
    };
  } else if (action === 'paused') {
    activeVisit = {
      ...activeVisit,
      status: 'paused',
      endTime: new Date().toISOString(),
    };
  }
  res.json(activeVisit);
});

app.post('/api/v1/workflow/sessions', (req, res) => {
  console.log('[mock] initialise workflow session', req.body);
  workflowSession = {
    ...workflowSession,
    encounterId: String(req.body?.encounterId ?? workflowSession.encounterId ?? ''),
    patientId: String(req.body?.patientId ?? workflowSession.patientId ?? ''),
    noteId: req.body?.noteId ?? workflowSession.noteId,
    noteContent: typeof req.body?.noteContent === 'string' && req.body.noteContent.trim().length > 0
      ? req.body.noteContent
      : workflowSession.noteContent,
    reimbursementSummary: workflowSession.reimbursementSummary,
    blockingIssues: [],
  };
  res.json(workflowSession);
});

app.put('/api/v1/notes/:encounterId/content', (req, res) => {
  workflowSession = {
    ...workflowSession,
    noteContent: req.body?.content ?? workflowSession.noteContent,
    reimbursementSummary: {
      total: workflowSession.reimbursementSummary.total,
      codes: workflowSession.reimbursementSummary.codes,
    },
    stepStates: workflowSession.stepStates.map(state =>
      state.step === 4 ? { ...state, status: 'completed', progress: 100 } : state
    ),
  };
  const validation = {
    canFinalize: true,
    issues: {},
    estimatedReimbursement: workflowSession.reimbursementSummary.total,
    reimbursementSummary: workflowSession.reimbursementSummary,
  };
  res.json({
    encounterId: req.params.encounterId,
    sessionId: workflowSession.sessionId,
    noteContent: workflowSession.noteContent,
    reimbursementSummary: workflowSession.reimbursementSummary,
    validation,
    session: workflowSession,
  });
});

app.post('/api/v1/workflow/:sessionId/step5/attest', (req, res) => {
  workflowSession = {
    ...workflowSession,
    stepStates: workflowSession.stepStates.map(state =>
      state.step === 5
        ? { ...state, status: 'completed', progress: 100 }
        : state
    ),
    auditTrail: [
      ...workflowSession.auditTrail,
      {
        actor: demoUser.fullName,
        action: 'workflow.attested',
        timestamp: new Date().toISOString(),
        description: `Attestation confirmed by ${demoUser.fullName}`,
      },
    ],
  };
  res.json({ session: workflowSession });
});

app.post('/api/v1/workflow/:sessionId/step6/dispatch', (req, res) => {
  workflowSession = {
    ...workflowSession,
    stepStates: workflowSession.stepStates.map(state =>
      state.step === 6
        ? { ...state, status: 'completed', progress: 100 }
        : state
    ),
    currentStep: 6,
    auditTrail: [
      ...workflowSession.auditTrail,
      {
        actor: demoUser.fullName,
        action: 'workflow.dispatched',
        timestamp: new Date().toISOString(),
        description: 'Finalized note dispatched to EHR.',
      },
    ],
  };

  const finalizedContent = `${workflowSession.noteContent}\n\nFinalized via RevenuePilot on ${new Date().toLocaleString()}.`;

  res.json({
    session: workflowSession,
    result: {
      finalizedContent,
      reimbursementSummary: workflowSession.reimbursementSummary,
      codesSummary: workflowSession.reimbursementSummary.codes.map(item => ({
        code: item.code,
        amount: item.amount,
      })),
      exportReady: true,
      issues: {},
    },
  });
});

app.use((req, res) => {
  console.warn(`Unhandled mock endpoint: ${req.method} ${req.path}`);
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Mock frontend API listening on http://127.0.0.1:${PORT}`);
});
