import type { UserProfile, ApiConfig, FillHistory, ResumeImportRecord } from '../types';
import { EMPTY_PROFILE } from '../types';

const PROFILE_KEY = 'profile';
const API_CONFIG_KEY = 'apiConfig';
const HISTORY_KEY = 'fillHistory';
const IMPORT_HISTORY_KEY = 'importHistory';

// ─── Profile ───

export async function getProfile(): Promise<UserProfile> {
  const result = await chrome.storage.local.get(PROFILE_KEY);
  const raw = result[PROFILE_KEY];
  if (!raw) return { ...EMPTY_PROFILE };
  return migrateProfile(raw);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

// ─── API Config ───

export async function getApiConfig(): Promise<ApiConfig | null> {
  const result = await chrome.storage.local.get(API_CONFIG_KEY);
  return result[API_CONFIG_KEY] ?? null;
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  await chrome.storage.local.set({ [API_CONFIG_KEY]: config });
}

// ─── Fill History ───

export async function getHistory(): Promise<FillHistory[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] ?? [];
}

export async function addHistory(entry: FillHistory): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  // Keep last 100 entries
  if (history.length > 100) history.length = 100;
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

// ─── Resume Import History ───

export async function getImportHistory(): Promise<ResumeImportRecord[]> {
  const result = await chrome.storage.local.get(IMPORT_HISTORY_KEY);
  return result[IMPORT_HISTORY_KEY] ?? [];
}

export async function addImportHistory(record: ResumeImportRecord): Promise<void> {
  const history = await getImportHistory();
  history.unshift(record);
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ [IMPORT_HISTORY_KEY]: history });
}

// ─── Migration (old flat Profile → new UserProfile) ───

interface OldProfile {
  name: string;
  school: string;
  major: string;
  degree: string;
  phone: string;
  email: string;
  projects: string;
}

function migrateProfile(raw: unknown): UserProfile {
  // Already migrated — has "basic" field
  if (typeof raw === 'object' && raw !== null && 'basic' in raw) {
    return raw as UserProfile;
  }

  // Old flat format
  const old = raw as OldProfile;
  return {
    basic: {
      name: old.name || '',
      phone: old.phone || '',
      email: old.email || '',
      location: '',
    },
    education: {
      school: old.school || '',
      major: old.major || '',
      degree: old.degree || '',
      graduation: '',
    },
    experience: old.projects ? [{ company: '', role: '', description: old.projects }] : [],
    projects: [],
    skills: [],
    answers: {},
  };
}

