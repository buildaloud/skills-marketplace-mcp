# Skills Marketplace MCP

An MCP server that lets AI agents semantically search, inspect, and install
security-audited skills from the [Skills Marketplace](https://marketplace.buildaloud.ai)
catalog.

Hosted broker: `https://mcp.marketplace.buildaloud.ai/mcp`

## Install

Install as a plugin (recommended — you get version updates). Same repo works in
both Claude Code and Codex:

**Claude Code:**

```
/plugin marketplace add buildaloud/skills-marketplace-mcp
/plugin install skills-marketplace@skills-marketplace
```

**Codex:**

```bash
codex plugin marketplace add buildaloud/skills-marketplace-mcp
codex plugin add skills-marketplace@skills-marketplace
```

To update later: `/plugin marketplace update skills-marketplace` (Claude) or
`codex plugin marketplace upgrade` (Codex).

### Or add the MCP server directly

The broker is standard MCP over streamable HTTP, so you can skip the plugin and
point any client at the URL:

```bash
claude mcp add --transport http skills-marketplace https://mcp.marketplace.buildaloud.ai/mcp
codex mcp add skills-marketplace --url https://mcp.marketplace.buildaloud.ai/mcp
```

Codex manual config (`~/.codex/config.toml`):

```toml
[mcp_servers.skills-marketplace]
url = "https://mcp.marketplace.buildaloud.ai/mcp"
```

The endpoint speaks the MCP streamable-HTTP transport. A client must send an
`initialize` request before calling `tools/list` or any tool — a raw
`tools/list` call with no prior handshake gets rejected with 400. Use an MCP
client library rather than a bare curl.

Health check: `GET https://mcp.marketplace.buildaloud.ai/health`

## Tools

| Tool | What it does | Key params |
|---|---|---|
| `search_skills` | Semantic search over the audited catalog (Pinecone) | `query` (string), `topK` (1-50, default 10) |
| `get_skill` | Full detail and security audit for one skill | `slug` |
| `list_skills` | Browse the catalog, sorted by stars descending | `dangerLevel`, `language`, `minStars`, `category`, `limit` (default 50) |
| `install_skill` | Install config and audit summary for a skill | `slug` |

`dangerLevel` filters/labels map to `overallExposure`: low ≤5, medium ≤20,
high ≤50, critical >50.

## Free vs Pro

Send `Authorization: Bearer <key>` to get the Pro tier. No header, or a key
that doesn't validate, gets the Free tier. Both tiers can search, browse, and
get details on already-audited skills.

The difference shows up when `get_skill` or `install_skill` is called on a
slug that hasn't been audited yet:

- **Free** — returns an upsell message pointing to the marketplace pricing page.
- **Pro** — queues an on-demand audit (a GitHub Actions workflow dispatch) and
  tells the agent to check back in a few minutes.

## Self-hosting

Requires Node 22+.

```bash
npm install
cp .env.example .env   # fill in the values below
npm run dev
```

### Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `PINECONE_API_KEY` | for `search_skills` | — | Pinecone auth |
| `PINECONE_INDEX` | no | `skills-marketplace` | Pinecone index name |
| `MARKETPLACE_API_URL` | no | `https://marketplace.buildaloud.ai` | source of skill data |
| `UPSTASH_REDIS_REST_URL` | for Pro tier | — | API key lookup |
| `UPSTASH_REDIS_REST_TOKEN` | for Pro tier | — | API key lookup |
| `PORT` | no | `3000` | HTTP port |
| `GITHUB_TOKEN` | for on-demand audits | — | dispatches the audit workflow |
| `GITHUB_REPO` | no | `buildaloud/skills-marketplace` | repo the audit workflow lives in |

### Indexing

`npm run index-skills` pulls the full catalog from the marketplace's bulk
asset and upserts it into Pinecone. It's incremental by default (skips
already-indexed slugs); pass `--reindex` to force a full rebuild. Batched and
throttled to stay under Pinecone's free-tier embedding rate limit.

### Tests

`npm test` runs the unit suite. `npm run test:e2e` runs against a live broker
URL hardcoded in `e2e/broker.test.ts`, not your local instance.

## How it works

The indexer reads the marketplace's bulk skill data, builds an embedding text
per skill, and upserts it into Pinecone (integrated embedding, model
`multilingual-e5-large`) — this backs `search_skills`. At request time, the
other tools read live skill data straight from the marketplace REST API.
Upstash Redis holds Pro API keys for the auth check.
