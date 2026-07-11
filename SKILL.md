# Skills Marketplace MCP Broker

Discover and evaluate audited MCP skills from the Skills Marketplace catalog.

## What this skill does

Connects your Claude session to the Skills Marketplace — a catalog of MCP skills that have been security-audited using the AST v1.0 taxonomy. Use it to find new skills, check their safety ratings, and get installation instructions.

## Tools available

- **search_skills(query)** — Semantic search. Describe what you need in natural language and get back the most relevant audited skills ranked by relevance and safety.
- **list_skills(filters)** — Browse skills filtered by danger level, language, star count, or category.
- **get_skill(slug)** — Full details on a specific skill: description, capabilities, security scores, and all findings.
- **install_skill(slug)** — Installation instructions and audit summary for a skill.

## How to add this skill to your Claude session

```bash
claude mcp add skills-marketplace --url https://mcp.marketplace.buildaloud.ai/mcp
```

Or add to your MCP config manually:
```json
{
  "mcpServers": {
    "skills-marketplace": {
      "url": "https://mcp.marketplace.buildaloud.ai/mcp"
    }
  }
}
```

## Security model

All skills in the catalog have been audited against the AST v1.0 taxonomy (10 risk types). Danger levels:
- **low** — overallExposure ≤ 5
- **medium** — overallExposure ≤ 20
- **high** — overallExposure ≤ 50
- **critical** — overallExposure > 50

Always review the audit findings before installing a skill, especially those with non-zero `maliciousIntent` scores.
