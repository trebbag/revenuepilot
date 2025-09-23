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

const credentialProfiles = {
  'admin@exampleclinic.com': {
    password: 'Admin123!',
    user: {
      id: 'user-admin',
      name: 'System Administrator',
      fullName: 'System Administrator',
      email: 'admin@exampleclinic.com',
      role: 'admin',
      permissions: ['view:analytics', 'view:activity-log', 'manage:settings', 'manage:builder'],
      specialty: 'Administration',
      payer: 'Enterprise Plan',
    },
  },
  'analyst@exampleclinic.com': {
    password: 'Analyst123!',
    user: {
      id: 'user-analyst',
      name: 'Operations Analyst',
      fullName: 'Operations Analyst',
      email: 'analyst@exampleclinic.com',
      role: 'analyst',
      permissions: ['view:analytics', 'view:activity-log'],
      specialty: 'Operations',
      payer: 'Enterprise Plan',
    },
  },
  'clinician@exampleclinic.com': {
    password: 'Clinician123!',
    user: {
      id: 'user-clinician',
      name: 'Attending Clinician',
      fullName: 'Attending Clinician',
      email: 'clinician@exampleclinic.com',
      role: 'user',
      permissions: ['view:analytics', 'view:activity-log'],
      specialty: 'Family Medicine',
      payer: 'Aetna Premier',
    },
  },
};

let authState = {
  authenticated: false,
  user: { ...demoUser },
};

let activeTokens = {
  access: null,
  refresh: null,
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
      gaps: [
        'Preventive care context established',
        'Document shared decision-making conversation',
      ],
    },
    {
      id: 2,
      code: 'J1100',
      type: 'HCPCS',
      category: 'codes',
      description: 'Injection, dexamethasone sodium phosphate, 1 mg',
      rationale: 'Therapeutic injection administered in office',
      confidence: 0.88,
      gaps: ['Document injection site and lot number'],
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
  currentStep: 1,
  stepStates: [
    { step: 1, status: 'in_progress', progress: 50 },
    { step: 2, status: 'not_started', progress: 0 },
    { step: 3, status: 'not_started', progress: 0 },
    { step: 4, status: 'not_started', progress: 0 },
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
      gaps: [
        'Preventive care context established',
        'Document shared decision-making conversation',
      ],
    },
    {
      id: 2,
      code: 'J1100',
      type: 'HCPCS',
      category: 'codes',
      description: 'Injection, dexamethasone sodium phosphate, 1 mg',
      rationale: 'Therapeutic injection administered in office',
      confidence: 0.88,
      gaps: ['Document injection site and lot number'],
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

const workflowValidationTemplate = {
  codeVerification: {
    passed: true,
    confidence: 0.96,
    details: ['Coding context validated against documentation insights'],
    issues: [],
  },
  preventionItems: {
    passed: true,
    details: ['Preventive care context established for risk management'],
  },
  diagnosesConfirmation: {
    passed: true,
    details: ['Diagnoses confirmed against latest chart review'],
  },
  differentialsReview: {
    passed: true,
    details: ['Differential diagnoses reviewed for completeness'],
  },
  contentReview: {
    passed: true,
    confidence: 0.9,
    details: ['Clinical documentation meets export standards'],
  },
  complianceChecks: {
    passed: true,
    details: ['Compliance checks passed for billing & attestation'],
  },
};

const buildPreFinalizePayload = (contentOverride) => {
  const reimbursementSummary =
    workflowSession.reimbursementSummary ?? {
      total: 185.5,
      codes: workflowSession.selectedCodes?.map((entry) => ({
        code: entry.code,
        amount: entry.reimbursement ?? 0,
      })) ?? [],
    };

  const noteContent =
    typeof contentOverride === 'string' && contentOverride.trim().length > 0
      ? contentOverride
      : workflowSession.noteContent;

  workflowSession = {
    ...workflowSession,
    noteContent,
    currentStep: Number(workflowSession.currentStep) || 1,
    stepStates: Array.isArray(workflowSession.stepStates)
      ? workflowSession.stepStates.map((state) => {
          if (!state || typeof state !== 'object') {
            return state;
          }
          const stepId = Number(state.step);
          if (!Number.isFinite(stepId)) {
            return state;
          }
          if (stepId === 1) {
            return {
              ...state,
              status: 'in_progress',
              progress: Math.max(Number(state.progress) || 0, 60),
            };
          }
          if (stepId === 4) {
            return {
              ...state,
              status: 'in_progress',
              progress: Math.max(Number(state.progress) || 0, 40),
            };
          }
          return state;
        })
      : workflowSession.stepStates,
    blockingIssues: [],
    reimbursementSummary,
  };

  const stepValidation = Object.fromEntries(
    Object.entries(workflowValidationTemplate).map(([key, value]) => [
      key,
      {
        ...value,
        ...(Array.isArray(value.details) ? { details: [...value.details] } : {}),
        ...(Array.isArray(value.issues) ? { issues: [...value.issues] } : {}),
      },
    ]),
  );

  return {
    canFinalize: true,
    issues: {},
    requiredFields: [],
    missingDocumentation: [],
    stepValidation,
    complianceIssues: [],
    estimatedReimbursement: reimbursementSummary.total,
    reimbursementSummary,
  };
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

const codeDetailCatalog = {
  '99213': {
    code: '99213',
    type: 'CPT',
    category: 'codes',
    description: 'Established patient visit, 20 minutes',
    rationale: 'Follow-up evaluation for chronic condition',
    confidence: 0.92,
    reimbursement: 125.0,
    rvu: 2.1,
  },
  J1100: {
    code: 'J1100',
    type: 'HCPCS',
    category: 'prevention',
    description: 'Injection, dexamethasone sodium phosphate, 1 mg',
    rationale: 'Therapeutic injection administered in office',
    confidence: 0.88,
    reimbursement: 60.5,
    rvu: 1.4,
  },
};

const documentationCatalog = {
  '99213': {
    code: '99213',
    required: [
      'Chief complaint documented',
      'History of present illness updated',
      'Review of systems or exam performed',
    ],
    recommended: ['Medication reconciliation complete', 'Plan includes follow-up instructions'],
    examples: ['Documented 20 minute follow-up for hypertension management.'],
  },
  J1100: {
    code: 'J1100',
    required: ['Drug name and dosage recorded', 'Route of administration documented'],
    recommended: ['Indication for injection noted in assessment'],
    examples: ['Administered 4mg dexamethasone IM for acute asthma flare.'],
  },
};

const categorizationRulesPayload = {
  autoCategories: {
    codes: {
      '99213': 'codes',
      J1100: 'prevention',
    },
  },
  userOverrides: {},
  rules: [
    {
      id: 'rule-99213-followup',
      type: 'cpt',
      category: 'codes',
      priority: 1,
      match: {
        codes: ['99213'],
        descriptionKeywords: ['follow-up'],
      },
    },
    {
      id: 'rule-j1100-injection',
      type: 'hcpcs',
      category: 'prevention',
      priority: 2,
      match: {
        codes: ['J1100'],
        descriptionKeywords: ['injection'],
      },
    },
  ],
};

const scheduleAppointments = [
  {
    id: 'apt-1001',
    patient: 'Jane Doe',
    patientId: '1000001',
    encounterId: '67890',
    reason: 'Chronic condition follow-up',
    start: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    provider: demoUser.fullName,
    status: 'Scheduled',
    location: 'Exam Room 4',
  },
  {
    id: 'apt-1002',
    patient: 'Samuel Lee',
    patientId: '1000002',
    encounterId: '67891',
    reason: 'New patient intake',
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
    provider: demoUser.fullName,
    status: 'Scheduled',
    location: 'Exam Room 2',
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

app.get('/auth/policy', (_req, res) => {
  res.json({ lockoutThreshold: 5, lockoutDurationSeconds: 15 * 60 });
});

app.post('/__mock__/auth/state', (req, res) => {
  const { authenticated, user } = req.body || {};
  if (typeof authenticated === 'boolean') {
    authState.authenticated = authenticated;
    if (!authenticated) {
      activeTokens.access = null;
      activeTokens.refresh = null;
    }
  }
  if (user && typeof user === 'object') {
    authState.user = { ...authState.user, ...user };
  }
  res.json({ status: 'ok', state: { authenticated: authState.authenticated } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password, rememberMe } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const normalized = username.trim().toLowerCase();
  const record = credentialProfiles[normalized];
  if (!record || record.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const timestamp = Date.now();
  activeTokens.access = `mock-access-${timestamp}`;
  activeTokens.refresh = `mock-refresh-${timestamp}`;
  authState.authenticated = true;
  authState.user = { ...demoUser, ...record.user };

  const settings = {
    theme: 'modern',
    lang: 'en',
    specialty: record.user.specialty || 'General Medicine',
    payer: record.user.payer || 'Aetna Premier',
    rememberMe: Boolean(rememberMe),
  };

  const sessionPayload = {
    ...sessionState,
    finalizationSessions: {
      [workflowSession.sessionId]: workflowSession,
    },
  };

  return res.json({
    access_token: activeTokens.access,
    refresh_token: activeTokens.refresh,
    expires_in: 3600,
    user: authState.user,
    settings,
    session: sessionPayload,
  });
});

app.post('/api/auth/verify-mfa', (_req, res) => {
  if (!authState.authenticated || !activeTokens.access) {
    const timestamp = Date.now();
    activeTokens.access = `mock-access-${timestamp}`;
    activeTokens.refresh = `mock-refresh-${timestamp}`;
  }
  res.json({ access_token: activeTokens.access, refresh_token: activeTokens.refresh, expires_in: 3600 });
});

app.post('/api/auth/resend-mfa', (_req, res) => {
  res.json({ status: 'resent' });
});

app.get('/api/auth/status', (req, res) => {
  const header = req.get('authorization') || '';
  const expected = activeTokens.access ? `Bearer ${activeTokens.access}` : null;
  if (authState.authenticated && expected && header === expected) {
    return res.json({ authenticated: true, user: authState.user });
  }
  return res.json({ authenticated: false });
});

app.post('/api/auth/logout', (_req, res) => {
  authState.authenticated = false;
  activeTokens.access = null;
  activeTokens.refresh = null;
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

app.put('/api/user/profile', (req, res) => {
  const updates = req.body ?? {};
  authState = {
    ...authState,
    user: {
      ...authState.user,
      ...updates,
    },
  };
  res.json({ status: 'ok', user: authState.user });
});

app.get('/api/user/ui-preferences', (_req, res) => {
  res.json({ uiPreferences: layoutPreferences });
});

app.put('/api/user/ui-preferences', (req, res) => {
  layoutPreferences = {
    ...layoutPreferences,
    ...(req.body?.uiPreferences || req.body || {}),
  };
  res.json({ status: 'ok', uiPreferences: layoutPreferences });
});

app.get('/api/user/current-view', (_req, res) => {
  res.json({ currentView: 'home' });
});

app.get('/api/notifications/count', (_req, res) => {
  res.json({ notifications: 3, drafts: 2, count: 3 });
});

app.get('/api/notifications', (_req, res) => {
  res.json({
    items: [
      {
        id: 'notif-1',
        title: 'Compliance alert resolved',
        message: 'AI compliance assistant cleared all blocking items.',
        severity: 'info',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        isRead: false,
      },
      {
        id: 'notif-2',
        title: 'Patient chart uploaded',
        message: 'Lab results for Jane Doe are ready for review.',
        severity: 'success',
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        isRead: true,
        readAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
    total: 2,
    unreadCount: 1,
    limit: 20,
    offset: 0,
    nextOffset: null,
  });
});

app.post('/api/notifications/read-all', (_req, res) => {
  res.json({ unreadCount: 0 });
});

app.post('/api/notifications/:id/read', (_req, res) => {
  res.json({ unreadCount: 0 });
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

const activityLogItems = [
  {
    id: 'evt-1',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    username: 'Dr. Demo Clinician',
    action: 'note.finalized',
    details: {
      description: 'Finalized SOAP note for patient Jane Doe',
      status: 'success',
      patientName: 'Jane Doe',
      noteId: 'note-123',
    },
  },
  {
    id: 'evt-2',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    username: 'Dr. Demo Clinician',
    action: 'codes.added',
    details: {
      description: 'Added CPT 99213 based on AI suggestion',
      status: 'success',
      patientName: 'Jane Doe',
      code: '99213',
    },
  },
];

app.get('/api/dashboard/activity', (_req, res) => {
  res.json(
    activityLogItems.map((entry) => ({
      id: entry.id,
      type: entry.action,
      timestamp: entry.timestamp,
      description: entry.details.description,
      userId: demoUser.id,
    })),
  );
});

app.get('/api/activity/log', (_req, res) => {
  res.json({
    entries: activityLogItems,
    next: null,
    count: activityLogItems.length,
  });
});

app.get('/api/codes/categorization/rules', (_req, res) => {
  res.json(categorizationRulesPayload);
});

app.post('/api/codes/details/batch', (req, res) => {
  const codes = Array.isArray(req.body?.codes) ? req.body.codes : [];
  const details = codes.map((rawCode) => {
    const normalized = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    if (normalized && codeDetailCatalog[normalized]) {
      return { ...codeDetailCatalog[normalized], code: normalized };
    }
    if (!normalized) {
      return {
        code: String(rawCode ?? ''),
        type: 'unknown',
        category: 'codes',
        description: 'Unknown code',
        rationale: 'Mock server fallback',
        confidence: 50,
        reimbursement: 0,
        rvu: 0,
      };
    }
    return {
      code: normalized,
      type: 'unknown',
      category: 'codes',
      description: 'Unknown code',
      rationale: 'Mock server fallback',
      confidence: 50,
      reimbursement: 0,
      rvu: 0,
    };
  });
  res.json({ data: details });
});

app.post('/api/billing/calculate', (req, res) => {
  const codes = Array.isArray(req.body?.codes)
    ? req.body.codes.map((code) => (typeof code === 'string' ? code.trim().toUpperCase() : '')).filter(Boolean)
    : [];

  let total = 0;
  let totalRvu = 0;
  const breakdown = {};

  codes.forEach((code) => {
    const detail = codeDetailCatalog[code];
    if (!detail) {
      return;
    }
    const amount = Number(detail.reimbursement ?? 0);
    const rvu = Number(detail.rvu ?? 0);
    total += amount;
    totalRvu += rvu;
    breakdown[code] = {
      amount,
      amountFormatted: `$${amount.toFixed(2)}`,
      rvu,
    };
  });

  res.json({
    data: {
      totalEstimated: total,
      totalEstimatedFormatted: `$${total.toFixed(2)}`,
      totalRvu,
      currency: 'USD',
      breakdown,
      payerSpecific: { payer: authState.user?.payer ?? 'Commercial' },
      issues: [],
    },
  });
});

app.post('/api/codes/validate/combination', (req, res) => {
  const codes = Array.isArray(req.body?.codes) ? req.body.codes : [];
  res.json({
    data: {
      validCombinations: true,
      conflicts: [],
      contextIssues: [],
      warnings: codes.length > 4 ? ['Large number of codes selected'] : [],
    },
  });
});

app.get('/api/codes/documentation/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const doc = documentationCatalog[code] || {
    code,
    required: [],
    recommended: [],
    examples: [],
  };
  res.json({ data: doc });
});

app.post('/api/encounters/validate', (req, res) => {
  const encounterId = req.body?.encounterId ?? req.body?.encounter_id ?? '67890';
  const patientId = req.body?.patientId ?? req.body?.patient_id ?? '1000001';
  const encounter = {
    id: String(encounterId),
    encounterId: String(encounterId),
    patientId: String(patientId),
    patient: {
      patientId: String(patientId),
      name: 'Jane Doe',
    },
    date: new Date().toISOString().split('T')[0],
    type: 'Follow-up Visit',
    provider: demoUser.fullName,
    location: 'Riverbend Medical Group',
  };
  res.json({ valid: true, encounter, errors: [] });
});

app.get('/api/schedule/appointments', (_req, res) => {
  res.json({
    appointments: scheduleAppointments,
    visitSummaries: {
      'apt-1001': {
        lastVisit: '2024-02-12',
        notes: 'Patient responded well to therapy.',
      },
      'apt-1002': {
        lastVisit: null,
        notes: 'Initial consult scheduled by referral.',
      },
    },
  });
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

app.post('/api/notes/drafts', (req, res) => {
  console.log('[mock] create draft', req.body);
  const noteId = '5001';
  workflowSession = {
    ...workflowSession,
    noteId,
    noteContent: req.body?.content || workflowSession.noteContent,
  };
  res.json({
    draftId: noteId,
    noteId,
    encounterId: req.body?.encounterId ?? null,
    patientId: req.body?.patientId ?? null,
    createdAt: new Date().toISOString(),
    version: 1,
    content: req.body?.content || '',
  });
});

app.patch('/api/notes/drafts/:id', (req, res) => {
  workflowSession = {
    ...workflowSession,
    noteId: req.params.id,
    noteContent: req.body?.content || workflowSession.noteContent,
  };
  res.json({
    status: 'saved',
    draftId: req.params.id,
    version: typeof req.body?.version === 'number' ? req.body.version + 1 : 2,
    updatedAt: new Date().toISOString(),
  });
});

app.post('/api/notes/pre-finalize-check', (req, res) => {
  const response = buildPreFinalizePayload(req.body?.content);
  const timestamp = new Date().toISOString();
  workflowSession = {
    ...workflowSession,
    lastValidation: response,
    auditTrail: [
      ...workflowSession.auditTrail,
      {
        actor: authState.user?.fullName ?? demoUser.fullName,
        action: 'workflow.pre_finalize',
        timestamp,
        description: 'Pre-finalization validation completed',
      },
    ],
  };
  res.json(response);
});

app.post('/api/notes/finalize', (req, res) => {
  const content =
    typeof req.body?.content === 'string' && req.body.content.trim().length > 0
      ? req.body.content.trim()
      : workflowSession.noteContent;
  const payload = buildPreFinalizePayload(content);
  const finalizedContent = `${content}\n\nFinalized via RevenuePilot on ${new Date().toLocaleString()}.`;
  const complianceCertification = {
    status: 'pass',
    attestedBy: authState.user?.fullName ?? demoUser.fullName,
    attestedAt: new Date().toISOString(),
    summary: 'All compliance checks passed.',
    pendingActions: payload.missingDocumentation,
    issuesReviewed: payload.complianceIssues,
    stepValidation: payload.stepValidation,
  };

  workflowSession = {
    ...workflowSession,
    noteContent: content,
    currentStep: 6,
    stepStates: Array.isArray(workflowSession.stepStates)
      ? workflowSession.stepStates.map((state) => {
          if (!state || typeof state !== 'object') {
            return state;
          }
          const stepId = Number(state.step);
          if (!Number.isFinite(stepId)) {
            return state;
          }
          if (stepId >= 4) {
            return { ...state, status: 'completed', progress: 100 };
          }
          return { ...state, status: 'completed', progress: 100 };
        })
      : workflowSession.stepStates,
    auditTrail: [
      ...workflowSession.auditTrail,
      {
        actor: authState.user?.fullName ?? demoUser.fullName,
        action: 'workflow.finalized',
        timestamp: new Date().toISOString(),
        description: 'Note finalized and ready for dispatch.',
      },
    ],
    lastValidation: payload,
    blockingIssues: [],
  };

  res.json({
    ...payload,
    finalizedContent,
    codesSummary: Array.isArray(payload.reimbursementSummary?.codes)
      ? payload.reimbursementSummary.codes.map((entry) => ({
          code: entry.code,
          amount: entry.amount ?? entry.total ?? 0,
        }))
      : [],
    exportReady: true,
    exportStatus: 'complete',
    complianceCertification,
    finalizedNoteId: 'finalized-5001',
  });
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
        rationale: 'Hypertension follow-up with medication review',
        reasoning: 'Documented follow-up visit for hypertension management',
        confidence: includesHypertension ? 96 : 82,
        whatItIs: 'ICD-10 code for essential hypertension',
        usageRules: ['Confirm chronic hypertension diagnosis'],
        reasonsSuggested: ['Recent BP readings elevated'],
        potentialConcerns: ['Ensure hypertension is addressed in assessment'],
      },
      {
        code: '99214',
        type: 'CPT',
        description: 'Office visit, established patient, 25 minutes',
        rationale: 'Visit involved moderate complexity decision making',
        reasoning: 'Encounter includes medication management and chronic condition counseling',
        confidence: 74,
        whatItIs: 'Level 4 established patient visit',
        usageRules: ['Document total time or medical decision making'],
        reasonsSuggested: ['Chronic condition counseling performed'],
        potentialConcerns: ['Ensure history and exam elements are documented'],
      },
    ],
  });
});

app.post('/api/ai/compliance/check', (_req, res) => {
  res.json({ alerts: [] });
});

app.post('/api/ai/differentials/generate', (_req, res) => {
  res.json({
    differentials: [
      {
        diagnosis: 'Hypertensive heart disease',
        icdCode: 'I11.9',
        icdDescription: 'Hypertensive heart disease without heart failure',
        confidence: 63,
        reasoning: 'Consider when long-standing hypertension and cardiac findings are present',
        supportingFactors: ['Chronic hypertension', 'EKG changes'],
        contradictingFactors: ['No evidence of heart failure'],
        testsToConfirm: ['Echocardiogram'],
        testsToExclude: ['BNP to assess for HF'],
        whatItIs: 'Cardiac changes secondary to hypertension',
        details: 'Monitor for evidence of end-organ damage',
        confidenceFactors: 'Supported by chronic hypertension history',
        learnMoreUrl: 'https://www.cdc.gov/bloodpressure/',
      },
      {
        diagnosis: 'Secondary hypertension',
        icdCode: 'I15.9',
        icdDescription: 'Secondary hypertension, unspecified',
        confidence: 41,
        reasoning: 'Rule out secondary causes when blood pressure remains uncontrolled',
        supportingFactors: ['Uncontrolled BP on therapy'],
        contradictingFactors: ['No symptoms suggesting secondary cause'],
        testsToConfirm: ['Renal ultrasound'],
        testsToExclude: ['TSH'],
        whatItIs: 'Hypertension due to secondary cause',
        details: 'Consider endocrine and renal etiologies',
        confidenceFactors: 'Limited supporting data currently',
        learnMoreUrl: 'https://www.cdc.gov/bloodpressure/secondary.htm',
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
        type: 'PREVENTION',
        category: 'prevention',
        recommendation: 'Document blood pressure goals and follow-up plan.',
        priority: 'routine',
        source: 'USPSTF',
        confidence: 85,
        reasoning: 'Hypertension diagnosis without documented goal in chart',
        ageRelevant: true,
        description: 'Record BP targets and arrange follow-up per guidelines.',
        rationale: 'Supports chronic disease management documentation standards.',
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
    durationSeconds: 0,
    lastResumedAt: new Date().toISOString(),
    encounterId,
  };
  res.json(activeVisit);
});

app.put('/api/visits/session', (req, res) => {
  const action = req.body?.action;
  const now = new Date().toISOString();
  if (action === 'resume') {
    activeVisit = {
      ...activeVisit,
      status: 'active',
      lastResumedAt: now,
    };
  } else if (action === 'pause') {
    activeVisit = {
      ...activeVisit,
      status: 'paused',
      lastResumedAt: null,
    };
  } else if (action === 'stop') {
    activeVisit = {
      ...activeVisit,
      status: 'completed',
      endTime: now,
      lastResumedAt: null,
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
