import type { UserProfile } from '../types';
import type { ParsedResume } from './types';

/** Map LLM-parsed resume to UserProfile for storage + form-filling */
export function mapToProfile(parsed: ParsedResume): UserProfile {
  return {
    basic: {
      name: parsed.basic?.name || '',
      phone: parsed.basic?.phone || '',
      email: parsed.basic?.email || '',
      location: parsed.basic?.location || '',
    },
    education: {
      school: parsed.education?.school || '',
      major: parsed.education?.major || '',
      degree: parsed.education?.degree || '',
      graduation: parsed.education?.graduation || '',
    },
    experience: (parsed.experience || []).map(e => ({
      company: e.company || '',
      role: e.role || '',
      description: e.description || '',
      startDate: e.startDate || '',
      endDate: e.endDate || '',
    })),
    projects: (parsed.projects || []).map(p => ({
      name: p.name || '',
      description: p.description || '',
      technologies: (p.technologies || []).join(', '),
      achievement: (p.achievements || []).join('；'),
    })),
    skills: parsed.skills || [],
    answers: parsed.answers || {},
  };
}
