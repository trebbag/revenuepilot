# Medical Note-Taking Workflow: Backend Data Specification

## Overview

This document comprehensively outlines every data element, relationship, and integration point required for the backend to support a professional 6-step medical note-taking workflow. The system is designed for healthcare providers to efficiently create, enhance, and finalize medical documentation with AI assistance while maintaining compliance and accuracy.

## Core Architecture Principles

1. **Medical Compliance**: All data handling must support HIPAA compliance and medical record standards
2. **Audit Trail**: Every action must be traceable for legal and quality assurance purposes
3. **Real-time Collaboration**: Support for multiple users working on the same case
4. **AI Integration**: Seamless integration with AI services for code suggestions and content enhancement
5. **Workflow State Management**: Robust state persistence across all 6 workflow steps

---

## 1. USER & SESSION MANAGEMENT

### 1.1 User Entity
```typescript
interface User {
  id: string;                          // Primary key
  email: string;                       // Login credential
  name: string;                        // Display name
  role: 'physician' | 'coder' | 'admin'; // Access control
  license_number?: string;             // Medical license (for physicians)
  specialty?: string;                  // Medical specialty
  organization_id: string;             // Multi-tenant support
  preferences: UserPreferences;        // UI/workflow preferences
  created_at: Date;
  updated_at: Date;
  last_login: Date;
}

interface UserPreferences {
  default_templates: string[];         // Preferred note templates
  ai_assistance_level: 'minimal' | 'standard' | 'aggressive';
  code_suggestion_threshold: number;   // Confidence threshold for showing suggestions
  auto_save_interval: number;          // Seconds between auto-saves
  highlight_evidence: boolean;         // Default evidence highlighting preference
}
```

### 1.2 Session Management
```typescript
interface WorkflowSession {
  id: string;                          // Primary key
  user_id: string;                     // Foreign key to User
  patient_id: string;                  // Foreign key to Patient
  encounter_id: string;                // Foreign key to Encounter
  current_step: 1 | 2 | 3 | 4 | 5 | 6; // Current workflow position
  step_completion_status: {            // Track completion of each step
    step_1: boolean;
    step_2: boolean;
    step_3: boolean;
    step_4: boolean;
    step_5: boolean;
    step_6: boolean;
  };
  session_data: WorkflowSessionData;   // All workflow state data
  created_at: Date;
  updated_at: Date;
  expires_at: Date;                    // Session timeout
}
```

---

## 2. PATIENT & ENCOUNTER DATA

### 2.1 Patient Entity
```typescript
interface Patient {
  id: string;                          // Primary key
  mrn: string;                         // Medical Record Number
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  gender: 'M' | 'F' | 'O' | 'U';      // Male/Female/Other/Unknown
  demographics: PatientDemographics;
  medical_history: MedicalHistory[];
  created_at: Date;
  updated_at: Date;
}

interface PatientDemographics {
  address: Address;
  phone: string;
  email?: string;
  emergency_contact: EmergencyContact;
  insurance: InsuranceInfo[];
  race?: string;
  ethnicity?: string;
  language_preference?: string;
}

interface MedicalHistory {
  condition: string;
  icd10_code: string;
  onset_date?: Date;
  status: 'active' | 'inactive' | 'resolved';
  notes?: string;
}
```

### 2.2 Encounter Entity
```typescript
interface Encounter {
  id: string;                          // Primary key
  patient_id: string;                  // Foreign key
  provider_id: string;                 // Primary physician
  encounter_date: Date;
  encounter_type: 'office_visit' | 'telehealth' | 'hospital' | 'emergency';
  chief_complaint: string;             // Primary reason for visit
  vital_signs: VitalSigns;
  visit_details: VisitDetails;
  status: 'in_progress' | 'completed' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

interface VitalSigns {
  height?: number;                     // cm
  weight?: number;                     // kg
  bmi?: number;                        // calculated
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;                 // bpm
  temperature?: number;                // celsius
  respiratory_rate?: number;
  oxygen_saturation?: number;          // percentage
  pain_scale?: number;                 // 1-10
}

interface VisitDetails {
  duration_minutes: number;
  complexity_level: 'low' | 'moderate' | 'high';
  decision_making_complexity: 'straightforward' | 'low' | 'moderate' | 'high';
  counseling_time_minutes?: number;
  coordination_time_minutes?: number;
}
```

---

## 3. MEDICAL CODING SYSTEM

### 3.1 Code Entities
```typescript
interface MedicalCode {
  id: string;                          // Primary key
  code: string;                        // ICD-10, CPT, etc.
  code_type: 'ICD-10' | 'CPT' | 'HCPCS' | 'SNOMED';
  description: string;                 // Human readable description
  category: string;                    // Diagnosis, procedure, etc.
  valid_from: Date;
  valid_to?: Date;
  is_billable: boolean;
  requires_modifier: boolean;
  documentation_requirements: string[];
}

interface SelectedCode {
  id: string;                          // Primary key
  encounter_id: string;                // Foreign key
  medical_code_id: string;             // Foreign key to MedicalCode
  code: string;                        // Denormalized for performance
  description: string;                 // Denormalized for performance
  code_type: 'ICD-10' | 'CPT' | 'HCPCS';
  category: 'diagnosis' | 'procedure' | 'screening' | 'evaluation';
  status: 'pending' | 'confirmed' | 'rejected' | 'under_review';
  confidence_score: number;            // 0-100, provider confidence
  documentation_support: 'weak' | 'moderate' | 'strong';
  evidence_text: string[];             // Text snippets supporting this code
  gaps: string[];                      // Missing documentation elements
  position: number;                    // Order in diagnosis list (for ICD-10)
  selected_by: 'provider' | 'ai' | 'coder';
  selected_at: Date;
  reviewed_at?: Date;
  reviewed_by?: string;                // User ID
  notes?: string;                      // Provider notes about this code
}

interface SuggestedCode {
  id: string;                          // Primary key
  encounter_id: string;                // Foreign key
  medical_code_id: string;             // Foreign key to MedicalCode
  code: string;
  description: string;
  code_type: 'ICD-10' | 'CPT' | 'HCPCS';
  category: 'diagnosis' | 'procedure' | 'screening' | 'evaluation';
  ai_confidence: number;               // 0-100, AI confidence in suggestion
  suggestion_reason: string;           // Why AI suggested this code
  evidence_text: string[];             // Supporting evidence from note
  documentation_support: 'weak' | 'moderate' | 'strong';
  suggested_by: 'ai_clinical' | 'ai_billing' | 'ai_documentation' | 'ai_procedure';
  suggested_at: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
  provider_feedback?: string;          // Why accepted/rejected
  reviewed_at?: Date;
  reviewed_by?: string;                // User ID
}
```

### 3.2 Code Relationships & Validation
```typescript
interface CodeRelationship {
  id: string;
  primary_code: string;                // Primary diagnosis/procedure
  related_code: string;                // Related/dependent code
  relationship_type: 'requires' | 'excludes' | 'suggests' | 'modifies';
  description: string;
}

interface CodeValidation {
  encounter_id: string;
  validation_rules: ValidationRule[];
  validation_errors: ValidationError[];
  validation_warnings: ValidationWarning[];
  is_valid: boolean;
  validated_at: Date;
  validated_by: string;               // AI system or user ID
}

interface ValidationRule {
  rule_id: string;
  rule_type: 'medical_necessity' | 'code_combination' | 'documentation' | 'billing';
  description: string;
  severity: 'error' | 'warning' | 'info';
}
```

---

## 4. NOTE CONTENT MANAGEMENT

### 4.1 Note Content Entity
```typescript
interface NoteContent {
  id: string;                          // Primary key
  encounter_id: string;                // Foreign key
  version: number;                     // Version control for notes
  content_type: 'original' | 'ai_enhanced' | 'patient_summary' | 'final';
  content: string;                     // Rich text content
  structured_content: StructuredNote; // Parsed sections
  ai_enhancement_metadata?: AIEnhancementMetadata;
  created_at: Date;
  created_by: string;                  // User ID or 'ai_system'
  word_count: number;
  character_count: number;
  estimated_read_time_minutes: number;
}

interface StructuredNote {
  sections: NoteSection[];
  extracted_entities: ExtractedEntity[];
  clinical_concepts: ClinicalConcept[];
}

interface NoteSection {
  section_type: 'chief_complaint' | 'hpi' | 'physical_exam' | 'assessment' | 'plan' | 'ros' | 'pmh' | 'medications' | 'allergies' | 'social_history' | 'family_history';
  content: string;
  start_position: number;              // Character position in full note
  end_position: number;
  confidence_score?: number;           // AI confidence in section identification
  is_complete: boolean;                // Whether section has all required elements
  missing_elements: string[];         // What's missing for completeness
}

interface ExtractedEntity {
  entity_type: 'medication' | 'dosage' | 'symptom' | 'diagnosis' | 'procedure' | 'lab_value' | 'vital_sign';
  text: string;                        // Original text
  normalized_value: string;            // Standardized representation
  start_position: number;
  end_position: number;
  confidence_score: number;
  linked_code?: string;                // Associated medical code if applicable
}

interface ClinicalConcept {
  concept_id: string;                  // SNOMED or similar
  concept_name: string;
  category: string;
  text_references: TextReference[];   // Where mentioned in note
  relevance_score: number;             // How relevant to this encounter
}

interface AIEnhancementMetadata {
  enhancement_type: 'grammar' | 'medical_terminology' | 'structure' | 'completeness';
  changes_made: Change[];
  enhancement_quality_score: number;  // 0-100
  processing_time_ms: number;
  ai_model_version: string;
  enhancement_timestamp: Date;
}

interface Change {
  change_type: 'addition' | 'modification' | 'deletion' | 'restructure';
  original_text: string;
  enhanced_text: string;
  position: number;
  rationale: string;                   // Why change was made
  confidence: number;                  // AI confidence in this change
}
```

### 4.2 Note Versioning & History
```typescript
interface NoteVersion {
  id: string;
  note_content_id: string;             // Foreign key
  version_number: number;
  changes: VersionChange[];
  created_by: string;                  // User ID
  created_at: Date;
  change_summary: string;
  approval_status: 'draft' | 'pending_review' | 'approved' | 'superseded';
}

interface VersionChange {
  change_type: 'text_edit' | 'code_addition' | 'code_removal' | 'section_restructure';
  description: string;
  affected_positions: number[];        // Character positions affected
  before_content?: string;
  after_content?: string;
}
```

---

## 5. PATIENT QUESTIONS & GAPS

### 5.1 Patient Questions System
```typescript
interface PatientQuestion {
  id: string;                          // Primary key
  encounter_id: string;                // Foreign key
  question_text: string;
  source: 'code_gap' | 'ai_analysis' | 'provider_request' | 'protocol_requirement';
  priority: 'high' | 'medium' | 'low';
  category: 'clinical' | 'administrative' | 'documentation' | 'billing';
  related_code?: string;               // Associated medical code
  related_section?: string;            // Note section this relates to
  question_type: 'yes_no' | 'multiple_choice' | 'text_input' | 'numeric' | 'date';
  possible_answers?: string[];         // For multiple choice
  expected_data_type?: 'string' | 'number' | 'date' | 'boolean';
  is_required: boolean;
  auto_generated: boolean;             // Whether AI generated this question
  created_at: Date;
  status: 'pending' | 'answered' | 'skipped' | 'not_applicable';
  answered_at?: Date;
  answered_by?: string;                // User ID
  answer?: PatientQuestionAnswer;
}

interface PatientQuestionAnswer {
  answer_text?: string;
  answer_numeric?: number;
  answer_date?: Date;
  answer_boolean?: boolean;
  confidence_level: 'certain' | 'probable' | 'uncertain';
  notes?: string;                      // Additional context
  verification_needed: boolean;        // Whether answer needs verification
}

interface DocumentationGap {
  id: string;
  encounter_id: string;
  gap_type: 'missing_section' | 'incomplete_data' | 'unclear_documentation' | 'coding_support_needed';
  description: string;
  affected_codes: string[];           // Codes that depend on this information
  section_affected: string;           // Note section with the gap
  severity: 'critical' | 'moderate' | 'minor';
  suggested_questions: string[];      // Auto-generated questions to fill gap
  resolution_status: 'open' | 'in_progress' | 'resolved' | 'deferred';
  identified_by: 'ai_analysis' | 'provider_review' | 'coding_review';
  identified_at: Date;
  resolved_at?: Date;
  resolution_method?: string;
}
```

---

## 6. WORKFLOW STATE MANAGEMENT

### 6.1 Workflow Progress Tracking
```typescript
interface WorkflowState {
  id: string;
  session_id: string;                  // Foreign key to WorkflowSession
  current_step: 1 | 2 | 3 | 4 | 5 | 6;
  step_states: {
    [stepNumber: number]: StepState;
  };
  global_state: GlobalWorkflowState;
  created_at: Date;
  updated_at: Date;
}

interface StepState {
  step_number: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  progress_percentage: number;         // 0-100
  items_total: number;
  items_completed: number;
  time_spent_seconds: number;
  errors: StepError[];
  warnings: StepWarning[];
  user_notes?: string;
  completed_at?: Date;
  step_data: any;                      // Step-specific data
}

interface GlobalWorkflowState {
  total_codes_selected: number;
  total_codes_suggested: number;
  ai_enhancement_status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  note_completeness_score: number;     // 0-100
  billing_readiness_score: number;     // 0-100
  estimated_completion_time_minutes: number;
  requires_physician_review: boolean;
  requires_coding_review: boolean;
  quality_flags: QualityFlag[];
}

interface QualityFlag {
  flag_type: 'missing_documentation' | 'code_conflict' | 'billing_issue' | 'compliance_concern';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommended_action: string;
  auto_resolvable: boolean;
}
```

### 6.2 Step-Specific Data Structures

#### Step 1: Code Review
```typescript
interface Step1Data {
  selected_codes: SelectedCode[];
  code_review_status: {
    [codeId: string]: {
      reviewed: boolean;
      approved: boolean;
      needs_modification: boolean;
      provider_notes?: string;
    };
  };
  evidence_highlighting_enabled: boolean;
  active_code_id?: string;             // Currently focused code
}
```

#### Step 2: Suggestion Review
```typescript
interface Step2Data {
  suggested_codes: SuggestedCode[];
  suggestion_review_status: {
    [suggestionId: string]: {
      reviewed: boolean;
      decision: 'accepted' | 'rejected' | 'modified' | 'pending';
      modification_notes?: string;
      provider_rationale?: string;
    };
  };
  ai_suggestion_settings: {
    confidence_threshold: number;
    suggestion_categories: string[];
    auto_accept_high_confidence: boolean;
  };
}
```

#### Step 3: AI Compose
```typescript
interface Step3Data {
  enhancement_request: {
    enhancement_types: ('grammar' | 'medical_terminology' | 'structure' | 'completeness')[];
    target_audience: 'physician' | 'patient' | 'insurance' | 'legal';
    preserve_provider_voice: boolean;
    enhancement_aggressiveness: 'conservative' | 'moderate' | 'aggressive';
  };
  enhancement_progress: {
    current_stage: 'analyzing' | 'enhancing_structure' | 'improving_language' | 'final_review';
    progress_percentage: number;
    estimated_completion_seconds: number;
    stages_completed: string[];
  };
  enhancement_results?: {
    original_word_count: number;
    enhanced_word_count: number;
    readability_improvement: number;
    completeness_improvement: number;
    changes_summary: string;
  };
}
```

#### Step 4: Compare & Edit
```typescript
interface Step4Data {
  comparison_mode: 'side_by_side' | 'inline_changes' | 'patient_summary';
  editor_states: {
    original_content: EditorState;
    enhanced_content: EditorState;
    patient_summary: EditorState;
    final_content: EditorState;
  };
  accepted_changes: string[];          // Change IDs that have been accepted
  rejected_changes: string[];          // Change IDs that have been rejected
  custom_edits: CustomEdit[];
  content_approval_status: 'draft' | 'ready_for_review' | 'approved';
}

interface EditorState {
  content: string;
  cursor_position: number;
  selection_start?: number;
  selection_end?: number;
  undo_stack: string[];
  redo_stack: string[];
  last_modified: Date;
}

interface CustomEdit {
  edit_id: string;
  edit_type: 'insertion' | 'deletion' | 'modification';
  position: number;
  original_text?: string;
  new_text: string;
  rationale?: string;
  made_by: string;                     // User ID
  made_at: Date;
}
```

#### Step 5: Billing & Attest
```typescript
interface Step5Data {
  billing_validation: {
    codes_validated: boolean;
    documentation_level_verified: boolean;
    medical_necessity_confirmed: boolean;
    billing_compliance_checked: boolean;
    estimated_reimbursement: number;
    payer_specific_requirements: PayerRequirement[];
  };
  attestation: {
    physician_attestation: boolean;
    attestation_text: string;
    attestation_timestamp?: Date;
    digital_signature?: string;
    attestation_ip_address?: string;
  };
  compliance_checks: ComplianceCheck[];
  billing_summary: BillingSummary;
}

interface PayerRequirement {
  payer_name: string;
  requirement_type: 'documentation' | 'authorization' | 'modifier' | 'diagnosis_order';
  description: string;
  is_met: boolean;
  missing_elements: string[];
}

interface ComplianceCheck {
  check_type: 'hipaa' | 'billing_compliance' | 'medical_necessity' | 'documentation_standards';
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  description: string;
  required_actions: string[];
}

interface BillingSummary {
  primary_diagnosis: string;
  secondary_diagnoses: string[];
  procedures: string[];
  evaluation_management_level: string;
  total_rvu: number;
  estimated_payment: number;
  modifier_codes: string[];
}
```

#### Step 6: Sign & Dispatch
```typescript
interface Step6Data {
  final_review: {
    all_steps_completed: boolean;
    physician_final_approval: boolean;
    quality_review_passed: boolean;
    compliance_verified: boolean;
    ready_for_dispatch: boolean;
  };
  dispatch_options: {
    send_to_emr: boolean;
    generate_patient_summary: boolean;
    schedule_followup: boolean;
    send_to_billing: boolean;
    notify_referrals: boolean;
  };
  dispatch_status: {
    dispatch_initiated: boolean;
    dispatch_completed: boolean;
    dispatch_timestamp?: Date;
    dispatch_confirmation_number?: string;
    dispatch_errors: string[];
  };
  post_dispatch_actions: PostDispatchAction[];
}

interface PostDispatchAction {
  action_type: 'patient_portal_update' | 'billing_submission' | 'insurance_notification' | 'referral_notification' | 'follow_up_scheduling';
  status: 'pending' | 'completed' | 'failed';
  scheduled_time?: Date;
  completion_time?: Date;
  error_message?: string;
  retry_count: number;
}
```

---

## 7. AI INTEGRATION POINTS

### 7.1 AI Service Integration
```typescript
interface AIService {
  service_id: string;
  service_name: string;
  service_type: 'nlp' | 'coding_assistance' | 'content_enhancement' | 'quality_review';
  endpoint_url: string;
  api_version: string;
  authentication: AIServiceAuth;
  rate_limits: RateLimit;
  response_time_sla_ms: number;
  confidence_threshold: number;
  is_active: boolean;
}

interface AIServiceAuth {
  auth_type: 'api_key' | 'oauth' | 'certificate';
  credentials: any;                    // Encrypted credentials
  token_refresh_endpoint?: string;
  token_expiry?: Date;
}

interface AIRequest {
  id: string;
  service_id: string;
  request_type: 'code_suggestion' | 'content_enhancement' | 'gap_analysis' | 'quality_review';
  input_data: any;
  request_timestamp: Date;
  response_timestamp?: Date;
  response_data?: any;
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  error_message?: string;
  processing_time_ms?: number;
  confidence_scores?: { [key: string]: number };
  usage_tokens?: number;               // For token-based billing
}

interface AIModelConfiguration {
  model_id: string;
  model_name: string;
  model_version: string;
  specialty_focus: string[];           // Medical specialties this model is trained for
  performance_metrics: {
    accuracy_percentage: number;
    precision_percentage: number;
    recall_percentage: number;
    f1_score: number;
  };
  update_frequency: string;
  last_training_date: Date;
  supported_languages: string[];
  max_input_length: number;
  typical_response_time_ms: number;
}
```

### 7.2 AI-Generated Content Tracking
```typescript
interface AIGeneratedContent {
  id: string;
  content_id: string;                  // Foreign key to NoteContent
  generation_type: 'enhancement' | 'suggestion' | 'completion' | 'translation';
  ai_model_used: string;
  generation_prompt: string;
  original_content: string;
  generated_content: string;
  confidence_score: number;
  human_review_required: boolean;
  human_reviewed: boolean;
  human_reviewer_id?: string;
  review_feedback?: string;
  approval_status: 'approved' | 'rejected' | 'modified' | 'pending';
  generated_at: Date;
  reviewed_at?: Date;
  usage_metrics: {
    input_tokens: number;
    output_tokens: number;
    processing_time_ms: number;
    cost_usd?: number;
  };
}
```

---

## 8. AUDIT TRAIL & COMPLIANCE

### 8.1 Audit Logging
```typescript
interface AuditLog {
  id: string;
  user_id: string;
  session_id?: string;
  encounter_id?: string;
  action: string;                      // What action was performed
  resource_type: string;               // What type of resource was affected
  resource_id: string;                 // Specific resource ID
  before_state?: any;                  // State before the action
  after_state?: any;                   // State after the action
  ip_address: string;
  user_agent: string;
  timestamp: Date;
  success: boolean;
  error_message?: string;
  session_duration_ms?: number;
  additional_metadata?: any;
}

interface ComplianceEvent {
  id: string;
  event_type: 'access' | 'modification' | 'export' | 'delete' | 'share';
  resource_type: 'patient_data' | 'medical_code' | 'note_content' | 'ai_generated_content';
  user_id: string;
  patient_id?: string;
  encounter_id?: string;
  compliance_status: 'compliant' | 'violation' | 'warning' | 'review_required';
  details: string;
  automatic_detection: boolean;
  resolution_required: boolean;
  resolved: boolean;
  resolution_notes?: string;
  timestamp: Date;
}
```

### 8.2 Data Retention & Privacy
```typescript
interface DataRetentionPolicy {
  id: string;
  resource_type: string;
  retention_period_days: number;
  deletion_method: 'soft_delete' | 'hard_delete' | 'anonymize';
  compliance_basis: 'hipaa' | 'gdpr' | 'organization_policy' | 'legal_requirement';
  automatic_enforcement: boolean;
  exceptions: RetentionException[];
  created_at: Date;
  last_updated: Date;
}

interface PrivacyControl {
  id: string;
  user_id: string;
  patient_id?: string;
  access_level: 'full' | 'limited' | 'read_only' | 'no_access';
  restrictions: string[];              // Specific restrictions on access
  expiry_date?: Date;
  reason: string;                      // Why this control was put in place
  applied_by: string;                  // User ID who applied the control
  applied_at: Date;
}
```

---

## 9. INTEGRATION REQUIREMENTS

### 9.1 EMR Integration
```typescript
interface EMRIntegration {
  id: string;
  emr_system: string;                  // Epic, Cerner, AllScripts, etc.
  integration_type: 'hl7_fhir' | 'api' | 'file_export' | 'direct_connect';
  endpoint_config: {
    base_url: string;
    authentication: any;
    supported_versions: string[];
    rate_limits: RateLimit;
  };
  data_mapping: DataMapping[];
  sync_frequency: string;              // How often to sync data
  last_sync: Date;
  sync_status: 'active' | 'inactive' | 'error' | 'maintenance';
  error_handling: ErrorHandlingConfig;
}

interface DataMapping {
  local_field: string;
  external_field: string;
  transformation_rules: string[];      // How to transform data between systems
  validation_rules: string[];
  is_required: boolean;
  default_value?: any;
}

interface ErrorHandlingConfig {
  retry_attempts: number;
  retry_delay_seconds: number;
  fallback_behavior: 'queue' | 'alert' | 'manual_intervention';
  notification_recipients: string[];
}
```

### 9.2 Billing System Integration
```typescript
interface BillingIntegration {
  id: string;
  billing_system: string;
  claim_submission_method: 'electronic' | 'paper' | 'clearinghouse';
  payer_configurations: PayerConfig[];
  fee_schedules: FeeSchedule[];
  submission_rules: SubmissionRule[];
  auto_submission_enabled: boolean;
  quality_checks_required: boolean;
}

interface PayerConfig {
  payer_id: string;
  payer_name: string;
  submission_requirements: string[];
  turnaround_time_days: number;
  specific_form_requirements: string[];
  prior_authorization_rules: string[];
}

interface FeeSchedule {
  code: string;
  payer_id: string;
  fee_amount: number;
  effective_date: Date;
  expiry_date?: Date;
  geographic_modifier?: string;
}
```

---

## 10. PERFORMANCE & SCALABILITY REQUIREMENTS

### 10.1 Performance Metrics
```typescript
interface PerformanceMetrics {
  metric_name: string;
  target_value: number;
  current_value: number;
  measurement_unit: string;
  measurement_timestamp: Date;
  status: 'within_target' | 'warning' | 'critical';
}

// Key Performance Indicators:
// - Workflow completion time: < 15 minutes average
// - AI response time: < 3 seconds for code suggestions
// - Note enhancement time: < 30 seconds for standard note
// - System availability: > 99.9%
// - Data accuracy: > 99.5%
// - User satisfaction: > 4.5/5
```

### 10.2 Scalability Considerations
```typescript
interface ScalabilityConfig {
  concurrent_users_supported: number;
  database_sharding_strategy: string;
  caching_layers: CachingConfig[];
  load_balancing_strategy: string;
  auto_scaling_rules: AutoScalingRule[];
  backup_strategy: BackupConfig;
  disaster_recovery_plan: DisasterRecoveryConfig;
}
```

---

## 11. SECURITY REQUIREMENTS

### 11.1 Security Controls
```typescript
interface SecurityControl {
  control_type: 'authentication' | 'authorization' | 'encryption' | 'audit' | 'network';
  implementation_level: 'required' | 'recommended' | 'optional';
  compliance_frameworks: string[];     // HIPAA, SOC2, etc.
  technical_specifications: any;
  monitoring_required: boolean;
  automated_enforcement: boolean;
}

// Security Requirements:
// - End-to-end encryption for all PHI
// - Multi-factor authentication required
// - Role-based access control
// - Audit logging of all actions
// - Regular security assessments
// - Incident response procedures
// - Data breach notification processes
```

---

## 12. API SPECIFICATIONS

### 12.1 Core API Endpoints

```typescript
// Workflow Management
POST   /api/v1/workflow/sessions                    // Create new workflow session
GET    /api/v1/workflow/sessions/{sessionId}        // Get session state
PUT    /api/v1/workflow/sessions/{sessionId}/step   // Update current step
DELETE /api/v1/workflow/sessions/{sessionId}        // End session

// Code Management
GET    /api/v1/codes/selected/{encounterId}         // Get selected codes
POST   /api/v1/codes/selected                       // Add selected code
PUT    /api/v1/codes/selected/{codeId}              // Update code status
DELETE /api/v1/codes/selected/{codeId}              // Remove selected code

GET    /api/v1/codes/suggestions/{encounterId}      // Get AI suggestions
POST   /api/v1/codes/suggestions/request            // Request new suggestions
PUT    /api/v1/codes/suggestions/{suggestionId}     // Accept/reject suggestion

// Note Management
GET    /api/v1/notes/{encounterId}/versions         // Get all note versions
POST   /api/v1/notes/{encounterId}/enhance          // Request AI enhancement
PUT    /api/v1/notes/{encounterId}/content          // Update note content
POST   /api/v1/notes/{encounterId}/finalize         // Finalize note

// Patient Questions
GET    /api/v1/questions/{encounterId}              // Get patient questions
POST   /api/v1/questions/{questionId}/answer        // Submit answer
PUT    /api/v1/questions/{questionId}/status        // Update question status

// Workflow Steps
POST   /api/v1/workflow/{sessionId}/step1/complete  // Complete step 1
POST   /api/v1/workflow/{sessionId}/step2/complete  // Complete step 2
POST   /api/v1/workflow/{sessionId}/step3/start     // Start AI enhancement
POST   /api/v1/workflow/{sessionId}/step4/compare   // Get comparison data
POST   /api/v1/workflow/{sessionId}/step5/attest    // Submit attestation
POST   /api/v1/workflow/{sessionId}/step6/dispatch  // Final dispatch
```

---

## CONCLUSION

This specification provides a comprehensive foundation for implementing the backend systems required to support the 6-step medical note-taking workflow. The data structures and relationships outlined here ensure:

1. **Comprehensive Coverage**: Every UI element and user interaction is supported by appropriate backend data structures
2. **Medical Compliance**: All data handling supports HIPAA and other healthcare compliance requirements
3. **Audit Trail**: Complete traceability of all actions and changes
4. **AI Integration**: Robust support for AI-powered features while maintaining human oversight
5. **Scalability**: Architecture designed to handle multiple concurrent users and large data volumes
6. **Integration**: Support for EMR, billing, and other healthcare system integrations

The backend implementation should prioritize data integrity, security, and performance while providing the flexibility to adapt to changing medical coding standards and AI capabilities.