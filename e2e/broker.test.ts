import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BROKER_URL = 'https://mcp.buildaloud.ai';
const MCP_URL = `${BROKER_URL}/mcp`;

async function createLiveClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'e2e-test', version: '1.0' });
  await client.connect(transport);
  return client;
}

describe('E2E — live broker at https://mcp.buildaloud.ai', () => {
  it('health endpoint returns ok: true', async () => {
    const res = await fetch(`${BROKER_URL}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('initialize — createLiveClient() succeeds without throwing', async () => {
    await expect(createLiveClient()).resolves.toBeDefined();
  });

  it('tools/list returns exactly 4 tools with expected names', async () => {
    const client = await createLiveClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(tools.length).toBe(4);
    expect(names).toContain('search_skills');
    expect(names).toContain('list_skills');
    expect(names).toContain('get_skill');
    expect(names).toContain('install_skill');
  });

  it('list_skills returns text with at least one skill and total > 0', async () => {
    const client = await createLiveClient();
    const result = await client.callTool({ name: 'list_skills', arguments: { limit: 5 } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    // Expect format "Showing X of Y matching skills:"
    const match = text.match(/Showing (\d+) of (\d+)/);
    expect(match).not.toBeNull();
    const total = parseInt(match![2], 10);
    expect(total).toBeGreaterThan(0);
  });

  it('get_skill with known slug returns skill details', async () => {
    const client = await createLiveClient();
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { slug: 'muratcankoylan--agent-skills-for-context-engineering' },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('context-engineering-collection');
  });

  it('get_skill with unknown slug returns upsell message', async () => {
    const client = await createLiveClient();
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { slug: 'this-does-not-exist--fake' },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("hasn't been audited yet");
  });

  it('search_skills returns at least one result for "fetch web pages"', async () => {
    const client = await createLiveClient();
    const result = await client.callTool({
      name: 'search_skills',
      arguments: { query: 'fetch web pages', topK: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    // Either returns results or is unavailable (if Pinecone key not configured on server)
    // We assert it's non-empty text and if it has results, check format
    expect(text.length).toBeGreaterThan(0);
    if (!text.includes('unavailable')) {
      // Pinecone is configured — expect at least one result with a relevance percentage
      expect(text).toMatch(/\d+\.\d+%/);
    }
  });

  it('install_skill returns parseable JSON with githubUrl for a known slug', async () => {
    const client = await createLiveClient();
    const result = await client.callTool({
      name: 'install_skill',
      arguments: { slug: 'muratcankoylan--agent-skills-for-context-engineering' },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('githubUrl');
    expect(typeof parsed.githubUrl).toBe('string');
    expect(parsed.githubUrl).toMatch(/^https:\/\/github\.com\//);
  });
});
