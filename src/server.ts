import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchSkill, fetchSkills } from './lib/skills-api.js';
import { semanticSearch } from './lib/pinecone.js';
import { getDangerLevel } from './lib/danger-level.js';
import { buildInstallConfig } from './lib/install-config.js';
import { triggerAudit } from './lib/audit-trigger.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'skills-marketplace',
    version: '0.1.0',
  });

  // ── search_skills ──────────────────────────────────────────────────────────
  server.tool(
    'search_skills',
    'Semantic search across audited MCP skills using natural language. Returns ranked results with danger levels.',
    {
      query: z.string().describe('Natural language query, e.g. "fetch web pages" or "send email with attachment"'),
      topK: z.number().min(1).max(50).optional().default(10).describe('Number of results (default 10)'),
    },
    async ({ query, topK }) => {
      if (!process.env.PINECONE_API_KEY) {
        return { content: [{ type: 'text', text: 'search_skills unavailable: PINECONE_API_KEY not configured. Use list_skills instead.' }] };
      }
      try {
        const results = await semanticSearch(query, topK ?? 10);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: 'No skills found matching that query.' }] };
        }
        const text = results.map((r, i) =>
          `${i + 1}. **${r.name}** (\`${r.slug}\`)\n   Danger: ${r.dangerLevel} | Stars: ${r.stars} | Language: ${r.language ?? 'unknown'}\n   ${r.description}\n   Relevance: ${(r.score * 100).toFixed(1)}%`
        ).join('\n\n');
        return { content: [{ type: 'text', text }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Search error: ${err.message}` }] };
      }
    },
  );

  // ── get_skill ──────────────────────────────────────────────────────────────
  server.tool(
    'get_skill',
    'Get full details for a skill by slug, including its complete security audit report.',
    {
      slug: z.string().describe('Skill slug, e.g. "lucent-snow--style-extractor"'),
    },
    async ({ slug }) => {
      const skill = await fetchSkill(slug);
      if (!skill) {
        const trigger = await triggerAudit(slug);
        return { content: [{ type: 'text', text: trigger.message }] };
      }
      const { metadata, audit } = skill;
      const dangerLevel = getDangerLevel(audit.scores.overallExposure);
      const lines = [
        `# ${metadata.name}`,
        `**Slug:** ${metadata.slug}`,
        `**Author:** ${metadata.author}  |  **GitHub:** ${metadata.githubUrl}`,
        `**Stars:** ${metadata.stars}  |  **Language:** ${metadata.language ?? 'unknown'}  |  **License:** ${metadata.license ?? 'unknown'}`,
        `**Audited:** ${metadata.auditedAt.split('T')[0]} at commit \`${metadata.auditedCommit.slice(0, 7)}\``,
        '',
        `## Description`,
        metadata.description,
        '',
        `## Security Assessment — ${dangerLevel.toUpperCase()}`,
        `| Score | Value |`,
        `|---|---|`,
        `| Malicious Intent | ${audit.scores.maliciousIntent}/100 |`,
        `| Inherent Capability | ${audit.scores.inherentCapability}/100 |`,
        `| Misuse Surface | ${audit.scores.misuseSurface}/100 |`,
        `| Overall Exposure | ${audit.scores.overallExposure}/100 |`,
        '',
        `## Summary`,
        audit.summary,
        '',
        `## Capabilities`,
        ...audit.capabilities.map((c) => `- ${c}`),
      ];
      if (audit.findings.length > 0) {
        lines.push('', `## Findings (${audit.findings.length})`);
        for (const f of audit.findings) {
          lines.push(`- **${f.type}** [${f.severity.toUpperCase()}] *${f.intentClassification}* — ${f.description}`);
        }
      } else {
        lines.push('', `## Findings`, `No security findings detected.`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  // ── list_skills ────────────────────────────────────────────────────────────
  server.tool(
    'list_skills',
    'Browse audited skills with optional filters. Sorted by stars descending.',
    {
      dangerLevel: z.enum(['low', 'medium', 'high', 'critical']).optional()
        .describe('Filter by danger level (low=exposure≤5, medium≤20, high≤50, critical>50)'),
      language: z.string().optional().describe('Filter by language, e.g. "TypeScript" or "Python"'),
      minStars: z.number().optional().describe('Minimum GitHub star count'),
      category: z.string().optional().describe('Filter by category (most skills have no category yet)'),
      limit: z.number().min(1).max(200).optional().default(50).describe('Max results (default 50)'),
    },
    async ({ dangerLevel, language, minStars, category, limit }) => {
      try {
        const { skills, total } = await fetchSkills({ dangerLevel, language, minStars, category, limit });
        if (skills.length === 0) {
          return { content: [{ type: 'text', text: 'No skills match the given filters.' }] };
        }
        const lines = [
          `Showing ${skills.length} of ${total} matching skills:`,
          '',
          ...skills.map((s) =>
            `- **${s.name}** (\`${s.slug}\`) [${s.dangerLevel}] ★${s.stars}${s.language ? ` · ${s.language}` : ''}\n  ${s.description.slice(0, 100)}${s.description.length > 100 ? '…' : ''}`
          ),
        ];
        if (total > (limit ?? 50)) {
          lines.push(`\n…and ${total - (limit ?? 50)} more. Use filters or increase limit.`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error fetching skills: ${err.message}` }] };
      }
    },
  );

  // ── install_skill ──────────────────────────────────────────────────────────
  server.tool(
    'install_skill',
    'Get installation instructions and audit summary for a skill.',
    {
      slug: z.string().describe('Skill slug to install'),
    },
    async ({ slug }) => {
      const skill = await fetchSkill(slug);
      if (!skill) {
        const trigger = await triggerAudit(slug);
        return { content: [{ type: 'text', text: trigger.message }] };
      }
      const config = buildInstallConfig(skill);
      return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
    },
  );

  return server;
}
