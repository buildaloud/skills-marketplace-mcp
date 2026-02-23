#!/usr/bin/env npx tsx
/**
 * Integration test — runs the full MCP handshake against a live broker.
 * Usage: npx tsx src/scripts/test-tools.ts [broker-url]
 */

const BASE = process.argv[2] ?? 'http://localhost:3001/mcp';
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
};

let sessionId: string | null = null;

async function rpc(method: string, params: unknown, id = 1) {
  const headers: Record<string, string> = { ...HEADERS };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  // Capture session ID from first response
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  const text = await res.text();
  // SSE response: parse the first data line
  if (text.startsWith('event:') || text.startsWith('data:')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    return dataLine ? JSON.parse(dataLine.slice(5)) : null;
  }
  return JSON.parse(text);
}

async function callTool(name: string, args: unknown) {
  return rpc('tools/call', { name, arguments: args }, Math.floor(Math.random() * 10000));
}

async function main() {
  console.log(`Testing MCP broker at ${BASE}\n`);

  // 1. Initialize
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  });
  console.log('✓ initialize:', init?.result?.serverInfo ?? init?.error ?? init);

  // Notify initialized
  await rpc('notifications/initialized', {});

  // 2. List tools
  const tools = await rpc('tools/list', {});
  const toolNames = tools?.result?.tools?.map((t: any) => t.name) ?? [];
  console.log('✓ tools/list:', toolNames.join(', '));

  // 3. list_skills
  console.log('\n--- list_skills (limit: 3) ---');
  const list = await callTool('list_skills', { limit: 3 });
  console.log(list?.result?.content?.[0]?.text ?? list?.error);

  // 4. get_skill
  console.log('\n--- get_skill ---');
  const get = await callTool('get_skill', { slug: 'lucent-snow--style-extractor' });
  console.log(get?.result?.content?.[0]?.text?.slice(0, 500) ?? get?.error);

  // 5. install_skill
  console.log('\n--- install_skill ---');
  const install = await callTool('install_skill', { slug: 'lucent-snow--style-extractor' });
  const installData = JSON.parse(install?.result?.content?.[0]?.text ?? '{}');
  console.log('slug:', installData.slug);
  console.log('dangerLevel:', installData.dangerLevel);
  console.log('installNote:', installData.installNote?.split('\n')[0]);

  // 6. search_skills (will fail gracefully without Pinecone key)
  console.log('\n--- search_skills ---');
  const search = await callTool('search_skills', { query: 'fetch web pages' });
  console.log(search?.result?.content?.[0]?.text?.slice(0, 200) ?? search?.error);

  console.log('\n✓ All tests complete');
}

main().catch((err) => { console.error(err); process.exit(1); });
