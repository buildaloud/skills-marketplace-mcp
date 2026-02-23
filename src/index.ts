#!/usr/bin/env node
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const app = express();
app.use(express.json());

// Session registry — each MCP session gets its own server + transport pair
const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Resume existing session
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — create server + transport, register them
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    onsessioninitialized: (sid) => {
      sessions.set(sid, { server, transport });
    },
    onsessionclosed: (sid) => {
      sessions.delete(sid);
    },
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skills-marketplace-mcp', sessions: sessions.size });
});

const port = parseInt(process.env.PORT ?? '3000', 10);
app.listen(port, () => {
  console.log(`Skills Marketplace MCP broker running on port ${port}`);
  console.log(`Marketplace API: ${process.env.MARKETPLACE_API_URL ?? 'https://marketplace.buildaloud.ai'}`);
  console.log(`Pinecone index: ${process.env.PINECONE_INDEX ?? 'skills-marketplace'}`);
});
