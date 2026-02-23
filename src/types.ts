export interface AuditScores {
  maliciousIntent: number;
  inherentCapability: number;
  misuseSurface: number;
  overallExposure: number;
}

export interface AuditFinding {
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  intentClassification: 'malicious' | 'negligent' | 'accidental';
  description: string;
  location: string;
  evidence: string;
}

export interface SkillSummary {
  slug: string;
  name: string;
  author: string;
  description: string;
  language: string | null;
  stars: number;
  license: string | null;
  category: string | null;
  auditedAt: string;
  lastUpdated: string | null;
  scores: AuditScores;
  dangerLevel: DangerLevel;
  findingsCount: number;
  capabilitiesCount: number;
  capabilities: string[];
  summary: string;
}

export interface SkillMetadata {
  name: string;
  slug: string;
  description: string;
  sourceRepo: string;
  githubUrl: string;
  auditedCommit: string;
  version: string | null;
  language: string | null;
  stars: number;
  license: string | null;
  category: string | null;
  author: string;
  auditedAt: string;
  lastUpdated: string | null;
}

export interface AuditResult {
  taxonomyVersion: string;
  commit: string;
  auditedAt: string;
  auditor: string;
  summary: string;
  capabilities: string[];
  scores: AuditScores;
  findings: AuditFinding[];
  notDetected: string[];
}

export interface SkillWithAudit {
  metadata: SkillMetadata;
  audit: AuditResult;
}

export interface SkillListResponse {
  skills: SkillSummary[];
  total: number;
}

export type DangerLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SkillFilters {
  dangerLevel?: DangerLevel;
  language?: string;
  minStars?: number;
  category?: string;
  limit?: number;
}
