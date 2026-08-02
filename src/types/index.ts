// ─── Resume Field Semantic Layer ───

export enum ResumeFieldType {
  NAME = 'NAME',
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  LOCATION = 'LOCATION',
  SCHOOL = 'SCHOOL',
  MAJOR = 'MAJOR',
  DEGREE = 'DEGREE',
  GRADUATION_DATE = 'GRADUATION_DATE',
  WORK_EXPERIENCE = 'WORK_EXPERIENCE',
  INTERNSHIP_EXPERIENCE = 'INTERNSHIP_EXPERIENCE',
  PROJECT_EXPERIENCE = 'PROJECT_EXPERIENCE',
  SKILLS = 'SKILLS',
  SELF_INTRODUCTION = 'SELF_INTRODUCTION',
  CAREER_GOAL = 'CAREER_GOAL',
  SALARY_EXPECTATION = 'SALARY_EXPECTATION',
  OTHER = 'OTHER',
}

// ─── User Profile ───

export interface BasicInfo {
  name: string;
  phone: string;
  email: string;
  location: string;
}

export interface Education {
  school: string;
  major: string;
  degree: string;
  graduation: string;
}

export interface Experience {
  company: string;
  role: string;
  description: string;
  startDate?: string;
  endDate?: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string;
  achievement: string;
}

export interface UserProfile {
  basic: BasicInfo;
  education: Education;
  experience: Experience[];
  projects: Project[];
  skills: string[];
  answers: Record<string, string>;
}

export const EMPTY_PROFILE: UserProfile = {
  basic: { name: '', phone: '', email: '', location: '' },
  education: { school: '', major: '', degree: '', graduation: '' },
  experience: [],
  projects: [],
  skills: [],
  answers: {},
};

// ─── DOM Analysis ───

export interface DOMField {
  id: string;
  tag: string;
  type: string;
  label: string;
  placeholder: string;
  name: string;
  ariaLabel: string;
  nearbyText: string;
  options?: string[];
}

// ─── Fill Proposal ───

export type FillAction = 'auto_fill' | 'confirm' | 'skip';

export interface FillProposal {
  fieldId: string;
  originalLabel: string;
  fieldType: ResumeFieldType;
  value: string | null;
  confidence: number;
  reason: string;
  action: FillAction;
}

/** Derive action from confidence threshold */
export function classifyAction(confidence: number): FillAction {
  if (confidence >= 0.9) return 'auto_fill';
  if (confidence >= 0.6) return 'confirm';
  return 'skip';
}

// ─── Fill History ───

export interface FillHistory {
  url: string;
  company?: string;
  position?: string;
  timestamp: number;
  filledCount: number;
  skippedCount: number;
}

// ─── Resume Import ───

export interface ResumeImportRecord {
  filename: string;
  timestamp: number;
  success: boolean;
}

// ─── API Config ───

export interface ApiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

// ─── LLM Client Interface ───

export interface LLMClient {
  matchFields(fields: DOMField[], profile: UserProfile): Promise<FillProposal[]>;
}

// ─── Content Script Messages ───

export type ContentMessage =
  | { type: 'ANALYZE' }
  | { type: 'FILL'; proposals: FillProposal[] };

export type ContentResponse =
  | { type: 'ANALYZE_RESULT'; fields: DOMField[] }
  | { type: 'FILL_RESULT'; success: boolean; filled: number }
  | { type: 'ERROR'; message: string };
