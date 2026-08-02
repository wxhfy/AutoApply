export interface ExtractedResume {
  text: string;
  pageCount: number;
}

/** Raw LLM output for resume parsing — matches the prompt's expected JSON shape */
export interface ParsedResume {
  basic: {
    name: string;
    phone: string;
    email: string;
    location: string;
  };
  education: {
    school: string;
    major: string;
    degree: string;
    graduation: string;
  };
  experience: Array<{
    company: string;
    role: string;
    description: string;
    startDate: string;
    endDate: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    achievements: string[];
  }>;
  skills: string[];
  answers: Record<string, string>;
}
