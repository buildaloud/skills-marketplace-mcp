#!/usr/bin/env npx tsx
/**
 * Index all skills into Pinecone for semantic search.
 *
 * Usage:
 *   npx tsx src/scripts/index-skills.ts            # incremental (skip already indexed)
 *   npx tsx src/scripts/index-skills.ts --reindex  # force re-index everything
 *
 * Env vars:
 *   PINECONE_API_KEY     (required)
 *   PINECONE_INDEX       (default: skills-marketplace)
 *   MARKETPLACE_API_URL  (default: https://marketplace.buildaloud.ai)
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { fetchSkills, fetchSkill } from '../lib/skills-api.js';
import { getDangerLevel } from '../lib/danger-level.js';
import type { SkillWithAudit } from '../types.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX   = process.env.PINECONE_INDEX ?? 'skills-marketplace';
const EMBEDDING_MODEL  = 'multilingual-e5-large';
const BATCH_SIZE       = 96; // stay under Pinecone's 100-record limit
const REINDEX          = process.argv.includes('--reindex');

if (!PINECONE_API_KEY) {
  console.error('PINECONE_API_KEY is required');
  process.exit(1);
}

function buildEmbedText(skill: SkillWithAudit): string {
  const { metadata, audit } = skill;
  const parts = [
    `${metadata.name} — ${metadata.description}`,
    '',
    'Capabilities:',
    ...audit.capabilities.map((c) => `- ${c}`),
  ];
  if (audit.findings.length > 0) {
    parts.push('', 'Security findings:');
    for (const f of audit.findings) {
      parts.push(`- ${f.type} (${f.severity}): ${f.description}`);
    }
  }
  parts.push('', `Language: ${metadata.language ?? 'unknown'} | Author: ${metadata.author} | Stars: ${metadata.stars}`);
  return parts.join('\n');
}

async function main() {
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });

  // Create index if it doesn't exist
  const existing = await pc.listIndexes();
  const indexExists = existing.indexes?.some((i) => i.name === PINECONE_INDEX);
  if (!indexExists) {
    console.log(`Creating Pinecone index "${PINECONE_INDEX}" with model ${EMBEDDING_MODEL}...`);
    await pc.createIndexForModel({
      name: PINECONE_INDEX,
      cloud: 'aws',
      region: 'us-east-1',
      embed: {
        model: EMBEDDING_MODEL,
        fieldMap: { text: 'embed_text' },
      },
      waitUntilReady: true,
    });
    console.log('Index created.');
  }

  const index = pc.index(PINECONE_INDEX);

  // Load all skill summaries to get slugs
  console.log('Fetching skill list from marketplace API...');
  const { skills: summaries, total } = await fetchSkills({ limit: 500 });
  console.log(`Found ${total} skills.`);

  // Determine which are already indexed
  let existingSlugs = new Set<string>();
  if (!REINDEX) {
    const allSlugs = summaries.map((s) => s.slug);
    for (let i = 0; i < allSlugs.length; i += BATCH_SIZE) {
      const batch = allSlugs.slice(i, i + BATCH_SIZE);
      const fetched = await index.fetch({ ids: batch });
      for (const id of Object.keys(fetched.records ?? {})) {
        existingSlugs.add(id);
      }
    }
    console.log(`${existingSlugs.size} already indexed. Skipping those.`);
  }

  const toIndex = summaries.filter((s) => REINDEX || !existingSlugs.has(s.slug));
  console.log(`Indexing ${toIndex.length} skills...`);

  let indexed = 0;
  for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
    const batch = toIndex.slice(i, i + BATCH_SIZE);

    // Fetch full audit for each skill in the batch
    const records: Array<Record<string, unknown>> = [];
    for (const summary of batch) {
      const skill = await fetchSkill(summary.slug);
      if (!skill) {
        console.warn(`  Skipping ${summary.slug} — not found in API`);
        continue;
      }
      records.push({
        id: skill.metadata.slug,
        embed_text: buildEmbedText(skill),
        name: skill.metadata.name,
        author: skill.metadata.author,
        description: skill.metadata.description.slice(0, 300),
        language: skill.metadata.language ?? '',
        stars: skill.metadata.stars,
        category: skill.metadata.category ?? '',
        overallExposure: skill.audit.scores.overallExposure,
        maliciousIntent: skill.audit.scores.maliciousIntent,
        dangerLevel: getDangerLevel(skill.audit.scores.overallExposure),
      });
    }

    if (records.length > 0) {
      await index.upsertRecords({ records } as any);
      indexed += records.length;
      console.log(`[${indexed}/${toIndex.length}] Indexed up to ${batch[batch.length - 1].slug}`);
    }
  }

  console.log(`\nDone. ${indexed} skills indexed into "${PINECONE_INDEX}".`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
