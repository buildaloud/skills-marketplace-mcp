import type { SkillFilters, SkillListResponse, SkillWithAudit } from '../types.js';

const BASE = (process.env.MARKETPLACE_API_URL ?? 'https://marketplace.buildaloud.ai').replace(/\/$/, '');

export async function fetchSkills(filters: SkillFilters = {}): Promise<SkillListResponse> {
  const params = new URLSearchParams();
  if (filters.dangerLevel) params.set('dangerLevel', filters.dangerLevel);
  if (filters.language)    params.set('language', filters.language);
  if (filters.minStars !== undefined) params.set('minStars', String(filters.minStars));
  if (filters.category)    params.set('category', filters.category);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));

  const url = `${BASE}/api/skills${params.size ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Skills API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<SkillListResponse>;
}

// Full catalog in one shot, straight off the static bulk asset (no Function, no
// per-slug 503). Used by the offline indexer — never the request path.
export async function fetchAllSkills(): Promise<SkillWithAudit[]> {
  const url = `${BASE}/_data/skills.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bulk skills fetch error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { skills: SkillWithAudit[] };
  return data.skills;
}

export async function fetchSkill(slug: string): Promise<SkillWithAudit | null> {
  const url = `${BASE}/api/skills/${encodeURIComponent(slug)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Skills API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<SkillWithAudit>;
}
