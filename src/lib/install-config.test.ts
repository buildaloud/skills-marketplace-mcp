import { describe, it, expect } from 'vitest';
import { buildInstallConfig } from './install-config.js';
import type { SkillWithAudit } from '../types.js';

function makeSkill(overrides: Partial<{
  maliciousIntent: number;
  overallExposure: number;
  auditedCommit: string;
}>): SkillWithAudit {
  const {
    maliciousIntent = 0,
    overallExposure = 3,
    auditedCommit = 'abc1234defghij',
  } = overrides;

  return {
    metadata: {
      name: 'Test Skill',
      slug: 'test-author--test-skill',
      description: 'A test skill for unit testing.',
      sourceRepo: 'test-author/test-skill',
      githubUrl: 'https://github.com/test-author/test-skill',
      auditedCommit,
      version: '1.0.0',
      language: 'TypeScript',
      stars: 42,
      license: 'MIT',
      category: 'testing',
      author: 'test-author',
      auditedAt: '2025-01-15T12:00:00Z',
      lastUpdated: '2025-01-10T00:00:00Z',
    },
    audit: {
      taxonomyVersion: '1.0',
      commit: auditedCommit,
      auditedAt: '2025-01-15T12:00:00Z',
      auditor: 'gpt-4o',
      summary: 'This skill is safe for general use.',
      capabilities: ['read files', 'make HTTP requests'],
      scores: {
        maliciousIntent,
        inherentCapability: 10,
        misuseSurface: 8,
        overallExposure,
      },
      findings: [],
      notDetected: ['data exfiltration', 'privilege escalation'],
    },
  };
}

describe('buildInstallConfig — clean skill (maliciousIntent=0)', () => {
  const skill = makeSkill({});
  const config = buildInstallConfig(skill);

  it('has the correct slug', () => {
    expect(config.slug).toBe('test-author--test-skill');
  });

  it('has the correct name', () => {
    expect(config.name).toBe('Test Skill');
  });

  it('has the correct author', () => {
    expect(config.author).toBe('test-author');
  });

  it('has the correct githubUrl', () => {
    expect(config.githubUrl).toBe('https://github.com/test-author/test-skill');
  });

  it('truncates auditedCommit to 7 characters', () => {
    expect(config.auditedCommit).toBe('abc1234');
    expect(config.auditedCommit.length).toBe(7);
  });

  it('dangerLevel matches the overallExposure score', () => {
    // overallExposure=3 → low
    expect(config.dangerLevel).toBe('low');
  });

  it('installNote contains the GitHub URL', () => {
    expect(config.installNote).toContain('https://github.com/test-author/test-skill');
  });

  it('installNote says no malicious intent detected', () => {
    expect(config.installNote).toContain('No malicious intent detected');
  });
});

describe('buildInstallConfig — dangerous skill (maliciousIntent=50)', () => {
  const skill = makeSkill({ maliciousIntent: 50, overallExposure: 75 });
  const config = buildInstallConfig(skill);

  it('installNote contains WARNING', () => {
    expect(config.installNote).toContain('WARNING');
  });

  it('dangerLevel is critical for overallExposure=75', () => {
    expect(config.dangerLevel).toBe('critical');
  });
});
