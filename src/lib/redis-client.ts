// skills-marketplace-mcp/src/lib/redis-client.ts
// Upstash Redis REST client for Railway broker

export interface ApiKeyRecord {
  tier: 'pro';
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  active: boolean;
  createdAt: string;
}

export async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', `apikey:${key}`]),
    });
    if (!res.ok) return null;
    const { result } = await res.json() as { result: string | null };
    if (!result) return null;
    const record = JSON.parse(result) as ApiKeyRecord;
    return record.active ? record : null;
  } catch {
    return null;
  }
}
