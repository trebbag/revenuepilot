// Typed API client wrappers around existing JS functions in api.js
// Provides debounced-friendly helpers and TypeScript interfaces for the new
// NoteEditor implementation.

import { beautifyNote as beautifyNoteRaw, getSuggestions as getSuggestionsRaw } from '../api.js';

export interface BeautifyContext {
  lang?: string;
  specialty?: string;
  payer?: string;
  useLocalModels?: boolean;
  beautifyModel?: string;
}

export interface SuggestContext {
  lang?: string;
  chart?: string;
  rules?: string[];
  audio?: string;
  age?: number;
  sex?: string;
  region?: string;
  specialty?: string;
  payer?: string;
  template?: string | number | null;
  agencies?: string[];
  useLocalModels?: boolean;
  suggestModel?: string;
}

export interface CodeSuggestion {
  code: string;
  rationale?: string;
  upgrade_to?: string;
  upgradePath?: string;
}
export interface PublicHealthSuggestion {
  recommendation: string;
  reason?: string;
  source?: string;
  evidenceLevel?: string;
  regions?: string[];
  region?: string;
}
export interface DifferentialSuggestion {
  diagnosis: string;
  score?: number;
}
export interface FollowUpSuggestion {
  interval: string;
  reason?: string;
  ics?: string;
}

export interface SuggestionsResult {
  codes: CodeSuggestion[];
  compliance: string[];
  publicHealth: PublicHealthSuggestion[];
  differentials: DifferentialSuggestion[];
  followUp?: FollowUpSuggestion | null;
}

export async function beautifyNote(text: string, context: BeautifyContext = {}): Promise<string> {
  return beautifyNoteRaw(text, context.lang, context);
}

export async function getSuggestions(text: string, context: SuggestContext = {}): Promise<SuggestionsResult> {
  return getSuggestionsRaw(text, context);
}
