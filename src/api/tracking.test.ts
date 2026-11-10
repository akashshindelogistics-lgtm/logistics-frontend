import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './client';
import { getPublicTracking } from './tracking';

vi.mock('./client', () => ({ default: { get: vi.fn() } }));

describe('tracking api client', () => {
  beforeEach(() => vi.resetAllMocks());

  it('getPublicTracking GETs /public/track/{token} and unwraps', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, message: '', data: { reference: 'abcd1234' } } });
    const res = await getPublicTracking('tok-1');
    expect(api.get).toHaveBeenCalledWith('/public/track/tok-1');
    expect(res.data).toEqual({ reference: 'abcd1234' });
  });

  it('encodes the token so it cannot change the path', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, message: '', data: null } });
    await getPublicTracking('../orgs');
    expect(api.get).toHaveBeenCalledWith('/public/track/..%2Forgs');
  });
});
