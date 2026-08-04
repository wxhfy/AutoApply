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
    gender: string;
    birthDate: string;
    ethnicity: string;
    politicalStatus: string;
    nativePlace: string;
  };
  links: {
    github: string;
    linkedin: string;
    website: string;
  };
  education: Array<{
    school: string;
    college: string;
    major: string;
    degree: string;
    gpa: string;
    courses: string;
    startDate: string;
    endDate: string;
  }>;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  internships: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  projects: Array<{
    name: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  awards: Array<{
    name: string;
    date: string;
    level: string;
    description: string;
  }>;
  skills: string[];
  selfIntroduction: string;
}
