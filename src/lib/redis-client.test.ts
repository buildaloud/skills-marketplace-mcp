// skills-marketplace-mcp/src/lib/redis-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApiKeyRecord } from './redis-client.js';

const ACTIVE_RECORD: ApiKeyRecord = {
  tier: 'pro',
  stripeCustomerId: 'cus_test123',
  stripeSubscriptionId: 'sub_test456',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const INACTIVE_RECORD: ApiKeyRecord = {
  ...ACTIVE_RECORD,
  active: false,
};

function mockFetch(result: string | null, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve({ result }),
  });
}

describe('validateApiKey', () => {
  const ENV = {
    UPSTASH_REDIS_REST_URL: 'https://redis.example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  };

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = ENV.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = ENV.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.restoreAllMocks();
  });

  it('returns the record for a valid active key', async () => {
    vi.stubGlobal('fetch', mockFetch(JSON.stringify(ACTIVE_RECORD)));

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_abc123');
    expect(result).toEqual(ACTIVE_RECORD);
  });

  it('returns null for an inactive key', async () => {
    vi.stubGlobal('fetch', mockFetch(JSON.stringify(INACTIVE_RECORD)));

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_cancelled');
    expect(result).toBeNull();
  });

  it('returns null when the key does not exist in Redis', async () => {
    vi.stubGlobal('fetch', mockFetch(null));

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_notfound');
    expect(result).toBeNull();
  });

  it('calls Redis with the correct key pattern', async () => {
    const fetchSpy = mockFetch(JSON.stringify(ACTIVE_RECORD));
    vi.stubGlobal('fetch', fetchSpy);

    const { validateApiKey } = await import('./redis-client.js');
    await validateApiKey('ba_live_mykey');

    expect(fetchSpy).toHaveBeenCalledWith(
      ENV.UPSTASH_REDIS_REST_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(['GET', 'apikey:ba_live_mykey']),
      }),
    );
  });

  it('returns null when Redis returns a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(null, false));

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_servererr');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_neterr');
    expect(result).toBeNull();
  });

  it('returns null when UPSTASH_REDIS_REST_URL is missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_any');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when UPSTASH_REDIS_REST_TOKEN is missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { validateApiKey } = await import('./redis-client.js');
    const result = await validateApiKey('ba_live_any');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
