import type { SkillWithAudit } from '../types.js';
import { getDangerLevel } from './danger-level.js';

export function buildInstallConfig(skill: SkillWithAudit) {
  const { metadata, audit } = skill;
  const shortCommit = metadata.auditedCommit.slice(0, 7);
  const dangerLevel = getDangerLevel(audit.scores.overallExposure);

  const installNote = [
    `To install ${metadata.name}:`,
    `1. Clone or add the skill from: ${metadata.githubUrl}`,
    `2. Follow the README instructions in that repository.`,
    `3. This skill was audited at commit ${shortCommit} on ${metadata.auditedAt.split('T')[0]}.`,
    `4. Danger level: ${dangerLevel} (overallExposure: ${audit.scores.overallExposure})`,
    audit.scores.maliciousIntent > 0
      ? `\nWARNING: Non-zero malicious intent score (${audit.scores.maliciousIntent}/100). Review carefully before installing.`
      : `No malicious intent detected.`,
  ].join('\n');

  return {
    slug: metadata.slug,
    name: metadata.name,
    author: metadata.author,
    githubUrl: metadata.githubUrl,
    auditedCommit: shortCommit,
    dangerLevel,
    scores: audit.scores,
    auditSummary: audit.summary,
    installNote,
    findings: audit.findings.map((f) => ({
      type: f.type,
      severity: f.severity,
      description: f.description,
    })),
  };
}
