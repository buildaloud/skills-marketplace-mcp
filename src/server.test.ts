import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock dependencies before importing server
vi.mock('./lib/skills-api.js', () => ({
  fetchSkills: vi.fn(),
  fetchSkill: vi.fn(),
}));

vi.mock('./lib/pinecone.js', () => ({
  semanticSearch: vi.fn(),
}));

import { createMcpServer } from './server.js';
import { fetchSkills, fetchSkill } from './lib/skills-api.js';
import { semanticSearch } from './lib/pinecone.js';
import type { SkillWithAudit, SkillSummary, SkillListResponse } from './types.js';

// Helper: spin up a real McpServer in-process with InMemoryTransport
async function createTestClient(): Promise<Client> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0' });
  await client.connect(clientTransport);
  return client;
}

// Minimal SkillSummary fixture
function makeSkillSummary(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    slug: 'test-author--test-skill',
    name: 'Test Skill',
    author: 'test-author',
    description: 'A test skill for testing purposes.',
    language: 'TypeScript',
    stars: 10,
    license: 'MIT',
    category: 'testing',
    auditedAt: '2025-01-15T12:00:00Z',
    lastUpdated: '2025-01-10T00:00:00Z',
    scores: {
      maliciousIntent: 0,
      inherentCapability: 8,
      misuseSurface: 5,
      overallExposure: 4,
    },
    dangerLevel: 'low',
    findingsCount: 0,
    capabilitiesCount: 2,
    capabilities: ['read files', 'make HTTP requests'],
    summary: 'A safe test skill.',
    ...overrides,
  };
}

// Minimal SkillWithAudit fixture
function makeSkillWithAudit(overrides: Partial<SkillWithAudit['metadata']> = {}): SkillWithAudit {
  return {
    metadata: {
      name: 'Test Skill',
      slug: 'test-author--test-skill',
      description: 'A test skill for testing purposes.',
      sourceRepo: 'test-author/test-skill',
      githubUrl: 'https://github.com/test-author/test-skill',
      auditedCommit: 'abc1234defghij',
      version: '1.0.0',
      language: 'TypeScript',
      stars: 10,
      license: 'MIT',
      category: 'testing',
      author: 'test-author',
      auditedAt: '2025-01-15T12:00:00Z',
      lastUpdated: '2025-01-10T00:00:00Z',
      ...overrides,
    },
    audit: {
      taxonomyVersion: '1.0',
      commit: 'abc1234defghij',
      auditedAt: '2025-01-15T12:00:00Z',
      auditor: 'gpt-4o',
      summary: 'This skill is safe for general use.',
      capabilities: ['read files', 'make HTTP requests'],
      scores: {
        maliciousIntent: 0,
        inherentCapability: 8,
        misuseSurface: 5,
        overallExposure: 4,
      },
      findings: [],
      notDetected: ['data exfiltration'],
    },
  };
}

describe('tools/list', () => {
  it('returns all 4 tools with correct names', async () => {
    const client = await createTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('search_skills');
    expect(names).toContain('list_skills');
    expect(names).toContain('get_skill');
    expect(names).toContain('install_skill');
    expect(tools.length).toBe(4);
  });
});

describe('list_skills', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns both skill names and "2 of 2" when 2 skills exist', async () => {
    const skill1 = makeSkillSummary({ name: 'Alpha Skill', slug: 'author--alpha-skill' });
    const skill2 = makeSkillSummary({ name: 'Beta Skill', slug: 'author--beta-skill' });
    vi.mocked(fetchSkills).mockResolvedValue({ skills: [skill1, skill2], total: 2 });

    const client = await createTestClient();
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('Alpha Skill');
    expect(text).toContain('Beta Skill');
    expect(text).toContain('2 of 2');
  });

  it('returns "No skills match" when fetchSkills returns empty array', async () => {
    vi.mocked(fetchSkills).mockResolvedValue({ skills: [], total: 0 });

    const client = await createTestClient();
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('No skills match');
  });
});

describe('get_skill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns name, danger level label, and scores table when skill is found', async () => {
    vi.mocked(fetchSkill).mockResolvedValue(makeSkillWithAudit());

    const client = await createTestClient();
    const result = await client.callTool({ name: 'get_skill', arguments: { slug: 'test-author--test-skill' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('Test Skill');
    expect(text).toContain('LOW');
    expect(text).toContain('Malicious Intent');
    expect(text).toContain('Overall Exposure');
  });

  it('returns "No skill found" when fetchSkill returns null', async () => {
    vi.mocked(fetchSkill).mockResolvedValue(null);

    const client = await createTestClient();
    const result = await client.callTool({ name: 'get_skill', arguments: { slug: 'nonexistent--skill' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('No skill found');
  });
});

describe('install_skill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns valid JSON with slug and githubUrl', async () => {
    vi.mocked(fetchSkill).mockResolvedValue(makeSkillWithAudit());

    const client = await createTestClient();
    const result = await client.callTool({ name: 'install_skill', arguments: { slug: 'test-author--test-skill' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    const parsed = JSON.parse(text);
    expect(parsed.slug).toBe('test-author--test-skill');
    expect(parsed.githubUrl).toBe('https://github.com/test-author/test-skill');
  });
});

describe('search_skills', () => {
  const originalKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.PINECONE_API_KEY;
    } else {
      process.env.PINECONE_API_KEY = originalKey;
    }
  });

  it('returns "unavailable" when PINECONE_API_KEY is not set', async () => {
    delete process.env.PINECONE_API_KEY;

    const client = await createTestClient();
    const result = await client.callTool({ name: 'search_skills', arguments: { query: 'fetch web pages' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('unavailable');
  });

  it('returns skill names and relevance percentages when Pinecone returns results', async () => {
    process.env.PINECONE_API_KEY = 'test-key';
    vi.mocked(semanticSearch).mockResolvedValue([
      {
        slug: 'author--fetch-skill',
        name: 'Fetch Skill',
        description: 'Fetches web pages.',
        score: 0.92,
        dangerLevel: 'low',
        language: 'TypeScript',
        stars: 5,
      },
      {
        slug: 'author--scraper-skill',
        name: 'Scraper Skill',
        description: 'Scrapes websites.',
        score: 0.85,
        dangerLevel: 'medium',
        language: 'Python',
        stars: 12,
      },
    ]);

    const client = await createTestClient();
    const result = await client.callTool({ name: 'search_skills', arguments: { query: 'fetch web pages' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    expect(text).toContain('Fetch Skill');
    expect(text).toContain('Scraper Skill');
    expect(text).toContain('92.0%');
    expect(text).toContain('85.0%');
  });
});
