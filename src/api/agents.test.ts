import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './client';
import {
  approveAgentAction,
  getAgentSettings,
  listAgentActions,
  listAgentRuns,
  rejectAgentAction,
  runAgentsNow,
  updateAgentSettings,
} from './agents';

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

const envelope = <T,>(data: T) => ({ data: { success: true, message: '', data } });

describe('agents api client', () => {
  beforeEach(() => vi.resetAllMocks());

  it('getAgentSettings GETs the org settings and unwraps', async () => {
    vi.mocked(api.get).mockResolvedValue(envelope({ mode: 'OFF' }));
    const res = await getAgentSettings('o1');
    expect(api.get).toHaveBeenCalledWith('/orgs/o1/agents/settings');
    expect(res.data).toEqual({ mode: 'OFF' });
  });

  it('updateAgentSettings PUTs the mode', async () => {
    vi.mocked(api.put).mockResolvedValue(envelope({ mode: 'SHADOW' }));
    await updateAgentSettings('o1', 'SHADOW');
    expect(api.put).toHaveBeenCalledWith('/orgs/o1/agents/settings', { mode: 'SHADOW' });
  });

  it('runAgentsNow POSTs to the org run route', async () => {
    vi.mocked(api.post).mockResolvedValue(envelope({ id: 'r1' }));
    const res = await runAgentsNow('o1');
    expect(api.post).toHaveBeenCalledWith('/orgs/o1/agents/run');
    expect(res.data).toEqual({ id: 'r1' });
  });

  it('listAgentRuns GETs the org runs', async () => {
    vi.mocked(api.get).mockResolvedValue(envelope([]));
    await listAgentRuns('o1');
    expect(api.get).toHaveBeenCalledWith('/orgs/o1/agents/runs');
  });

  it('listAgentActions passes a status filter only when given one', async () => {
    vi.mocked(api.get).mockResolvedValue(envelope([]));
    await listAgentActions('o1');
    expect(api.get).toHaveBeenCalledWith('/orgs/o1/agents/actions', undefined);
    await listAgentActions('o1', 'PENDING_APPROVAL');
    expect(api.get).toHaveBeenCalledWith('/orgs/o1/agents/actions', { params: { status: 'PENDING_APPROVAL' } });
  });

  it('approve and reject POST to the action routes', async () => {
    vi.mocked(api.post).mockResolvedValue(envelope({ id: 'a1' }));
    await approveAgentAction('a1');
    expect(api.post).toHaveBeenCalledWith('/agent-actions/a1/approve');
    await rejectAgentAction('a1');
    expect(api.post).toHaveBeenCalledWith('/agent-actions/a1/reject');
  });
});
