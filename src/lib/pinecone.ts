import { Pinecone } from '@pinecone-database/pinecone';
import type { DangerLevel } from '../types.js';

export interface SearchResult {
  slug: string;
  name: string;
  description: string;
  score: number;
  dangerLevel: DangerLevel;
  language: string | null;
  stars: number;
}

let _pc: Pinecone | null = null;
let _index: ReturnType<Pinecone['index']> | null = null;

function getIndex() {
  if (!_index) {
    if (!process.env.PINECONE_API_KEY) throw new Error('PINECONE_API_KEY is not set');
    _pc = _pc ?? new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    _index = _pc.index(process.env.PINECONE_INDEX ?? 'skills-marketplace');
  }
  return _index;
}

export async function semanticSearch(query: string, topK = 10): Promise<SearchResult[]> {
  const idx = getIndex();
  const response = await idx.searchRecords({
    query: { inputs: { text: query }, topK },
  });
  return response.result.hits.map((hit) => {
    const f = hit.fields as Record<string, unknown>;
    return {
      slug: hit._id,
      name: f.name as string,
      description: f.description as string,
      score: hit._score,
      dangerLevel: f.dangerLevel as DangerLevel,
      language: (f.language as string) || null,
      stars: f.stars as number,
    };
  });
}
