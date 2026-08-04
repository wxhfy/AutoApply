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

function migrateProfile(raw: unknown): UserProfile {
  if (typeof raw !== 'object' || raw === null) {
    return { ...EMPTY_PROFILE };
  }

  // Old flat format (very old version)
  if (!('basic' in raw)) {
    const old = raw as { name?: string; school?: string; major?: string; degree?: string; phone?: string; email?: string; projects?: string };
    return {
      basic: {
        name: old.name || '',
        phone: old.phone || '',
        email: old.email || '',
        gender: '',
        birthDate: '',
        ethnicity: '',
        politicalStatus: '',
        nativePlace: '',
      },
      links: { github: '', linkedin: '', website: '' },
      education: old.school ? [{ school: old.school, college: '', major: old.major || '', degree: old.degree || '', gpa: '', courses: '', startDate: '', endDate: '' }] : [],
      experience: [],
      internships: [],
      projects: old.projects ? [{ name: '', startDate: '', endDate: '', description: old.projects }] : [],
      awards: [],
      skills: [],
      selfIntroduction: '',
    };
  }

  // Has "basic" but may be missing new fields — fill in defaults
  const p = raw as Record<string, any>;
  return {
    basic: {
      name: p.basic?.name || '',
      phone: p.basic?.phone || '',
      email: p.basic?.email || '',
      gender: p.basic?.gender || '',
      birthDate: p.basic?.birthDate || '',
      ethnicity: p.basic?.ethnicity || '',
      politicalStatus: p.basic?.politicalStatus || '',
      nativePlace: p.basic?.nativePlace || p.basic?.location || '',
    },
    links: {
      github: p.links?.github || '',
      linkedin: p.links?.linkedin || '',
      website: p.links?.website || '',
    },
    education: Array.isArray(p.education)
      ? p.education.map((e: any) => ({
          school: e.school || '',
          college: e.college || '',
          major: e.major || '',
          degree: e.degree || '',
          gpa: e.gpa || '',
          courses: e.courses || '',
          startDate: e.startDate || '',
          endDate: e.endDate || e.graduation || '',
        }))
      : p.education?.school
        ? [{ school: p.education.school, college: '', major: p.education.major || '', degree: p.education.degree || '', gpa: '', courses: '', startDate: '', endDate: p.education.graduation || '' }]
        : [],
    experience: Array.isArray(p.experience)
      ? p.experience.map((e: any) => ({
          company: e.company || '',
          role: e.role || '',
          startDate: e.startDate || '',
          endDate: e.endDate || '',
          description: e.description || '',
        }))
      : [],
    internships: Array.isArray(p.internships)
      ? p.internships.map((e: any) => ({
          company: e.company || '',
          role: e.role || '',
          startDate: e.startDate || '',
          endDate: e.endDate || '',
          description: e.description || '',
        }))
      : [],
    projects: Array.isArray(p.projects)
      ? p.projects.map((proj: any) => ({
          name: proj.name || '',
          startDate: proj.startDate || '',
          endDate: proj.endDate || '',
          description: proj.description || '',
        }))
      : [],
    awards: Array.isArray(p.awards)
      ? p.awards.map((a: any) => ({
          name: a.name || '',
          date: a.date || '',
          level: a.level || '',
          description: a.description || '',
        }))
      : [],
    skills: Array.isArray(p.skills) ? p.skills : [],
    selfIntroduction: p.selfIntroduction || '',
  };
}

