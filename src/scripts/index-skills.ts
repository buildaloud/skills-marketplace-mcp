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
import { fetchAllSkills } from '../lib/skills-api.js';
import { getDangerLevel } from '../lib/danger-level.js';
import type { SkillWithAudit } from '../types.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX   = process.env.PINECONE_INDEX ?? 'skills-marketplace';
const EMBEDDING_MODEL  = 'multilingual-e5-large';
const BATCH_SIZE       = 96; // stay under Pinecone's 100-record limit
const BATCH_DELAY_MS   = 12_000; // pace under the 250k tokens/min embedding limit
const REINDEX          = process.argv.includes('--reindex');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry upserts on Pinecone's 429 (rate limit) with a wait past the 1-min window.
async function upsertWithRetry(index: any, records: unknown[], attempt = 1): Promise<void> {
  try {
    await index.upsertRecords({ records } as any);
  } catch (err: any) {
    const is429 = err?.status === 429 || String(err?.message ?? '').includes('RESOURCE_EXHAUSTED');
    if (is429 && attempt <= 5) {
      const wait = 65_000;
      console.log(`  rate-limited (429), waiting ${wait / 1000}s then retrying (attempt ${attempt})...`);
      await sleep(wait);
      return upsertWithRetry(index, records, attempt + 1);
    }
    throw err;
  }
}

if (!PINECONE_API_KEY) {
  console.error('PINECONE_API_KEY is required');
  process.exit(1);
}

function buildEmbedText(skill: SkillWithAudit): string {
  const { metadata, audit } = skill;

  // Lead with name + full description
  const parts = [
    metadata.name,
    metadata.description,
  ];

  // useCases: imperative "use when" phrases — primary search signal when present.
  // These are action-verb-first and name specific services/protocols directly.
  if (audit.useCases && audit.useCases.length > 0) {
    parts.push('', 'Use when you need to: ' + audit.useCases.join(' | '));
  }

  // Fallback: first 4 capabilities truncated (audit prose, less precise but better than nothing)
  const caps = audit.capabilities.slice(0, 4).map((c) => c.slice(0, 80));
  if (caps.length > 0) {
    parts.push('', caps.join(' | '));
  }

  // Language is a useful discriminator (agents often query by stack)
  if (metadata.language) {
    parts.push('', `Language: ${metadata.language}`);
  }

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

  // One bulk read off the static asset — full audit detail for every skill, no
  // per-slug fetches (which 503 on CF's CPU limit), no 500-row cap.
  console.log('Fetching full skill catalog from marketplace bulk asset...');
  const all = await fetchAllSkills();
  console.log(`Found ${all.length} skills.`);

  // Determine which are already indexed
  const existingSlugs = new Set<string>();
  if (!REINDEX) {
    const allSlugs = all.map((s) => s.metadata.slug);
    for (let i = 0; i < allSlugs.length; i += BATCH_SIZE) {
      const batch = allSlugs.slice(i, i + BATCH_SIZE);
      const fetched = await index.fetch({ ids: batch });
      for (const id of Object.keys(fetched.records ?? {})) {
        existingSlugs.add(id);
      }
    }
    console.log(`${existingSlugs.size} already indexed. Skipping those.`);
  }

  const toIndex = all.filter((s) => REINDEX || !existingSlugs.has(s.metadata.slug));
  console.log(`Indexing ${toIndex.length} skills...`);

  let indexed = 0;
  for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
    const batch = toIndex.slice(i, i + BATCH_SIZE);

    const records = batch.map((skill) => ({
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
    }));

    await upsertWithRetry(index, records);
    indexed += records.length;
    console.log(`[${indexed}/${toIndex.length}] Indexed up to ${batch[batch.length - 1].metadata.slug}`);

    // Pace under Pinecone's integrated-embedding rate limit (free tier: 250k
    // tokens/min for multilingual-e5-large). ~12s/batch keeps us well under.
    if (i + BATCH_SIZE < toIndex.length) await sleep(BATCH_DELAY_MS);
  }

  console.log(`\nDone. ${indexed} skills indexed into "${PINECONE_INDEX}".`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
