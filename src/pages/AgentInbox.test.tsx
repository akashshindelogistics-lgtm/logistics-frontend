import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentInbox from './AgentInbox';
import * as agentsApi from '../api/agents';
import * as authApi from '../api/auth';
import * as customersApi from '../api/customers';
import * as dispatchesApi from '../api/dispatches';
import type { AgentAction, AgentRun, AutonomyMode, Customer, DispatchOrder } from '../types';

vi.mock('../api/agents');
vi.mock('../api/auth');
vi.mock('../api/customers');
vi.mock('../api/dispatches');

const ok = <T,>(data: T) => ({ success: true, message: '', data });

const DISPATCH_ID = 'aaaaaaaa-1111-2222-3333-444444444444';

function action(o: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 'a1',
    run_id: 'r1',
    org_id: 'o1',
    agent: 'dispatch_desk',
    tool: 'confirm_dispatch',
    input: JSON.stringify({ dispatch_id: DISPATCH_ID, reason: 'Nothing in the way' }),
    reason: 'Nothing in the way',
    risk: 'OPERATIONAL',
    status: 'PENDING_APPROVAL',
    result: null,
    created_at: 1_790_000_000,
    decided_at: null,
    decided_by: null,
    ...o,
  };
}

function run(o: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'r1',
    org_id: 'o1',
    agent: 'dispatch_desk',
    trigger_source: 'manual',
    status: 'COMPLETED',
    summary: 'Reviewed the open work.',
    input_tokens: 1000,
    output_tokens: 200,
    started_at: 1_790_000_000,
    finished_at: 1_790_000_010,
    ...o,
  };
}

function setup({ mode = 'SUPERVISED', actions = [], runs = [] }: {
  mode?: AutonomyMode;
  actions?: AgentAction[];
  runs?: AgentRun[];
} = {}) {
  vi.mocked(agentsApi.getAgentSettings).mockResolvedValue(ok({ mode }));
  vi.mocked(agentsApi.listAgentActions).mockResolvedValue(ok(actions));
  vi.mocked(agentsApi.listAgentRuns).mockResolvedValue(ok(runs));
}

describe('AgentInbox page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.getOrgId).mockReturnValue('o1');
    vi.mocked(authApi.getRole).mockReturnValue('ADMIN');
    vi.mocked(authApi.isAdmin).mockReturnValue(true);
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(ok([{
      id: DISPATCH_ID,
      customer_id: 'c1',
      status: 'PENDING',
      line_items: [{ stock_description: 'Cement', quantity: 30, volume_in_size: 1, category: '' }],
    } as unknown as DispatchOrder]));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([{ id: 'c1', name: 'Asha Rao' } as unknown as Customer]));
  });
  afterEach(() => vi.restoreAllMocks());

  it('explains itself when agents are off, and Run now is disabled', async () => {
    setup({ mode: 'OFF' });
    render(<AgentInbox />);
    expect(await screen.findByText(/agents are off/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run now/i })).toBeDisabled();
  });

  it('shows a pending action with what it is about and why', async () => {
    setup({ actions: [action()] });
    render(<AgentInbox />);

    const card = await screen.findByRole('article', { name: /confirm dispatch/i });
    expect(within(card).getByText(/30 × cement/i)).toBeInTheDocument();
    expect(within(card).getByText(/to asha rao/i)).toBeInTheDocument();
    expect(within(card).getByText(/nothing in the way/i)).toBeInTheDocument();
    expect(within(card).getByText('Routine')).toBeInTheDocument();
  });

  it('approves a routine action without asking again and reports the result', async () => {
    const u = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    setup({ actions: [action()] });
    vi.mocked(agentsApi.approveAgentAction).mockResolvedValue(
      ok(action({ status: 'EXECUTED', result: 'Dispatch is now CONFIRMED' })),
    );
    render(<AgentInbox />);

    const card = await screen.findByRole('article', { name: /confirm dispatch/i });
    setup({ actions: [action({ status: 'EXECUTED', result: 'Dispatch is now CONFIRMED' })] });
    await u.click(within(card).getByRole('button', { name: /approve/i }));

    expect(agentsApi.approveAgentAction).toHaveBeenCalledWith('a1');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/now confirmed/i);
    await waitFor(() => expect(screen.queryByRole('article', { name: /confirm dispatch/i })).not.toBeInTheDocument());
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('asks before approving a sensitive action, and does nothing if told no', async () => {
    const u = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ actions: [action({ tool: 'cancel_dispatch', risk: 'SENSITIVE' })] });
    render(<AgentInbox />);

    const card = await screen.findByRole('article', { name: /cancel dispatch/i });
    expect(within(card).getByText('Hard to undo')).toBeInTheDocument();
    await u.click(within(card).getByRole('button', { name: /approve/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(agentsApi.approveAgentAction).not.toHaveBeenCalled();
  });

  it("shows why when an approved action couldn't be carried out", async () => {
    const u = userEvent.setup();
    setup({ actions: [action()] });
    vi.mocked(agentsApi.approveAgentAction).mockResolvedValue(
      ok(action({ status: 'FAILED', result: "Dispatch is CANCELLED, can't confirm it" })),
    );
    render(<AgentInbox />);

    await u.click(await screen.findByRole('button', { name: /approve/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/can't confirm it/i);
  });

  it('rejects an action', async () => {
    const u = userEvent.setup();
    setup({ actions: [action()] });
    vi.mocked(agentsApi.rejectAgentAction).mockResolvedValue(ok(action({ status: 'REJECTED' })));
    render(<AgentInbox />);

    await u.click(await screen.findByRole('button', { name: /reject/i }));

    expect(agentsApi.rejectAgentAction).toHaveBeenCalledWith('a1');
    expect(await screen.findByRole('status')).toHaveTextContent(/won't ask again/i);
  });

  it('shows the error when someone else already decided, and reloads', async () => {
    const u = userEvent.setup();
    setup({ actions: [action()] });
    vi.mocked(agentsApi.approveAgentAction).mockRejectedValue({
      response: { data: { message: "This action isn't waiting for approval" } },
    });
    render(<AgentInbox />);

    const listCalls = () => vi.mocked(agentsApi.listAgentActions).mock.calls.length;
    await screen.findByRole('button', { name: /approve/i });
    const before = listCalls();
    await u.click(screen.getByRole('button', { name: /approve/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't waiting for approval/i);
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it('warehouse staff can see the inbox but not decide, run or change the mode', async () => {
    vi.mocked(authApi.getRole).mockReturnValue('WAREHOUSE_STAFF');
    vi.mocked(authApi.isAdmin).mockReturnValue(false);
    setup({ actions: [action()] });
    render(<AgentInbox />);

    await screen.findByRole('article', { name: /confirm dispatch/i });
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/only an admin can change this/i)).toBeInTheDocument();
  });

  it('a dispatcher can decide but not change the mode', async () => {
    vi.mocked(authApi.getRole).mockReturnValue('DISPATCHER');
    vi.mocked(authApi.isAdmin).mockReturnValue(false);
    setup({ actions: [action()] });
    render(<AgentInbox />);

    expect(await screen.findByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('an admin changes the mode, and going autonomous asks first', async () => {
    const u = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ mode: 'OFF' });
    vi.mocked(agentsApi.updateAgentSettings).mockResolvedValue(ok({ mode: 'SHADOW' }));
    render(<AgentInbox />);

    const select = await screen.findByLabelText(/autonomy/i);
    await waitFor(() => expect(select).toBeEnabled());
    await u.selectOptions(select, 'SHADOW');
    expect(agentsApi.updateAgentSettings).toHaveBeenCalledWith('o1', 'SHADOW');
    await waitFor(() => expect(select).toHaveValue('SHADOW'));

    vi.mocked(agentsApi.updateAgentSettings).mockClear();
    await u.selectOptions(select, 'AUTONOMOUS');
    expect(confirmSpy).toHaveBeenCalled();
    expect(agentsApi.updateAgentSettings).not.toHaveBeenCalled();
    expect(select).toHaveValue('SHADOW');
  });

  it('Run now reports the summary and reloads', async () => {
    const u = userEvent.setup();
    setup();
    vi.mocked(agentsApi.runAgentsNow).mockResolvedValue(ok(run()));
    render(<AgentInbox />);

    const button = await screen.findByRole('button', { name: /run now/i });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);

    expect(agentsApi.runAgentsNow).toHaveBeenCalledWith('o1');
    expect(await screen.findByRole('status')).toHaveTextContent(/reviewed the open work/i);
  });

  it('a failed run shows its reason as an error', async () => {
    const u = userEvent.setup();
    setup();
    vi.mocked(agentsApi.runAgentsNow).mockResolvedValue(
      ok(run({ status: 'FAILED', summary: 'Your credit balance is too low' })),
    );
    render(<AgentInbox />);

    const button = await screen.findByRole('button', { name: /run now/i });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(/credit balance is too low/i);
  });

  it('shows alerts, activity and runs in their own sections', async () => {
    setup({
      actions: [
        action({
          id: 'alert',
          tool: 'raise_alert',
          risk: 'INTERNAL',
          status: 'EXECUTED',
          input: JSON.stringify({ severity: 'HIGH', subject: 'Vehicle MH12 insurance', reason: 'Expired' }),
          reason: 'Insurance has expired, renew it',
        }),
        action({ id: 'shadow', status: 'SHADOWED' }),
      ],
      runs: [run()],
    });
    render(<AgentInbox />);

    expect(await screen.findByText('Vehicle MH12 insurance')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('Would have done')).toBeInTheDocument();
    expect(screen.getByText('Reviewed the open work.')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
  });

  it('survives a malformed action input', async () => {
    setup({ actions: [action({ input: 'not json' })] });
    render(<AgentInbox />);
    expect(await screen.findByRole('article', { name: /confirm dispatch/i })).toBeInTheDocument();
  });
});
