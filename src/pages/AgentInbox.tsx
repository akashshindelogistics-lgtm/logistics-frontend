import { useCallback, useEffect, useState } from 'react';
import {
  approveAgentAction,
  getAgentSettings,
  listAgentActions,
  listAgentRuns,
  rejectAgentAction,
  runAgentsNow,
  updateAgentSettings,
} from '../api/agents';
import { getOrgId, getRole, isAdmin } from '../api/auth';
import { listCustomers } from '../api/customers';
import { listDispatches } from '../api/dispatches';
import { useListAnimation } from '../lib/motion';
import { notifyAgentInboxChanged } from '../lib/agentInbox';
import type {
  AgentAction,
  AgentActionStatus,
  AgentRisk,
  AgentRun,
  AutonomyMode,
  Customer,
  DispatchOrder,
} from '../types';
import './page.css';
import './AgentInbox.css';

const MODES: { value: AutonomyMode; label: string; help: string }[] = [
  { value: 'OFF', label: 'Off', help: "Agents don't run." },
  { value: 'SHADOW', label: 'Shadow', help: 'Agents only record what they would do. Nothing changes.' },
  { value: 'SUPERVISED', label: 'Supervised', help: 'Agents can raise alerts. Everything else waits for your approval here.' },
  { value: 'AUTONOMOUS', label: 'Autonomous', help: 'Agents carry out routine work on their own. Cancellations still wait for your approval.' },
];

const ACTION_LABELS: Record<string, string> = {
  confirm_dispatch: 'Confirm dispatch',
  cancel_dispatch: 'Cancel dispatch',
  raise_alert: 'Raise alert',
};

const RISK: Record<AgentRisk, { label: string; tag: string }> = {
  READ: { label: 'Read only', tag: '' },
  INTERNAL: { label: 'Internal', tag: 'tag-blue' },
  OPERATIONAL: { label: 'Routine', tag: 'tag-amber' },
  SENSITIVE: { label: 'Hard to undo', tag: 'tag-red' },
};

const STATUS: Record<AgentActionStatus, { label: string; tag: string }> = {
  SHADOWED: { label: 'Would have done', tag: 'tag-purple' },
  PENDING_APPROVAL: { label: 'Waiting', tag: 'tag-amber' },
  EXECUTING: { label: 'In progress', tag: 'tag-blue' },
  EXECUTED: { label: 'Done', tag: 'tag-green' },
  REJECTED: { label: 'Rejected', tag: '' },
  FAILED: { label: 'Failed', tag: 'tag-red' },
};

const RUN_STATUS: Record<string, { label: string; tag: string }> = {
  RUNNING: { label: 'Running', tag: 'tag-blue' },
  COMPLETED: { label: 'Completed', tag: 'tag-green' },
  FAILED: { label: 'Failed', tag: 'tag-red' },
  REFUSED: { label: 'Declined', tag: 'tag-amber' },
  HALTED: { label: 'Stopped', tag: 'tag-amber' },
};

const SEVERITY_TAG: Record<string, string> = { HIGH: 'tag-red', MEDIUM: 'tag-amber', LOW: 'tag-blue' };

const formatTime = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString();

function parseInput(action: AgentAction): Record<string, string> {
  try {
    return JSON.parse(action.input) as Record<string, string>;
  } catch {
    return {};
  }
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** What an action is about, in the words staff would use. */
function subjectOf(action: AgentAction, dispatches: DispatchOrder[], customers: Customer[]): string {
  const input = parseInput(action);
  if (action.tool === 'raise_alert') return input.subject ?? '';
  const id = input.dispatch_id;
  if (!id) return '';
  const dispatch = dispatches.find(d => d.id === id);
  if (!dispatch) return `Dispatch ${id.slice(0, 8)}`;
  const customer = customers.find(c => c.id === dispatch.customer_id)?.name;
  const items = dispatch.line_items.map(li => `${li.quantity} × ${li.stock_description}`).join(', ');
  return [`Dispatch ${id.slice(0, 8)}`, items, customer && `to ${customer}`, `currently ${dispatch.status}`]
    .filter(Boolean)
    .join(' · ');
}

function PendingCard({ action, subject, canDecide, busy, onApprove, onReject }: {
  action: AgentAction;
  subject: string;
  canDecide: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const label = ACTION_LABELS[action.tool] ?? action.tool;
  return (
    <article className="agent-card" aria-label={`${label}: ${subject}`}>
      <div className="agent-card-main">
        <div className="agent-card-title">
          <h3>{label}</h3>
          <span className={`badge ${RISK[action.risk].tag}`}>{RISK[action.risk].label}</span>
        </div>
        <p className="agent-card-subject">{subject}</p>
        <p className="agent-card-reason"><strong>Why:</strong> {action.reason}</p>
        <p className="agent-card-meta">Dispatch desk agent · {formatTime(action.created_at)}</p>
      </div>
      {canDecide && (
        <div className="agent-card-actions">
          <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy}>Approve</button>
          <button className="btn btn-ghost btn-sm" onClick={onReject} disabled={busy}>Reject</button>
        </div>
      )}
    </article>
  );
}

export default function AgentInbox() {
  const pendingRef = useListAnimation();
  const orgId = getOrgId();
  const canDecide = getRole() !== 'WAREHOUSE_STAFF';
  const admin = isAdmin();

  const [mode, setMode] = useState<AutonomyMode>('OFF');
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [dispatches, setDispatches] = useState<DispatchOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    const [settings, actionList, runList, dispatchList, customerList] = await Promise.all([
      getAgentSettings(orgId),
      listAgentActions(orgId),
      listAgentRuns(orgId),
      // Only context for the reviewer, so the inbox still works without them.
      listDispatches().catch(() => ({ data: [] as DispatchOrder[] })),
      listCustomers().catch(() => ({ data: [] as Customer[] })),
    ]);
    setMode(settings.data?.mode ?? 'OFF');
    setActions(actionList.data ?? []);
    setRuns(runList.data ?? []);
    setDispatches(dispatchList.data ?? []);
    setCustomers(customerList.data ?? []);
    notifyAgentInboxChanged();
  }, [orgId]);

  useEffect(() => {
    load()
      .catch(err => setError(errorMessage(err, 'Could not load the agent inbox.')))
      .finally(() => setLoading(false));
  }, [load]);

  const changeMode = async (next: AutonomyMode) => {
    if (!orgId) return;
    if (next === 'AUTONOMOUS' && !window.confirm('Let agents carry out routine work without asking?')) return;
    setError('');
    setNotice('');
    try {
      const res = await updateAgentSettings(orgId, next);
      setMode(res.data?.mode ?? next);
    } catch (err) {
      setError(errorMessage(err, 'Could not change the mode.'));
    }
  };

  const runNow = async () => {
    if (!orgId) return;
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const res = await runAgentsNow(orgId);
      if (res.data?.status === 'FAILED') {
        setError(`The agent run failed: ${res.data.summary ?? 'no details'}`);
      } else {
        setNotice(res.data?.summary ?? 'The agent run finished.');
      }
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not run the agents.'));
    } finally {
      setRunning(false);
    }
  };

  const approve = async (action: AgentAction) => {
    if (action.risk === 'SENSITIVE' && !window.confirm(`${ACTION_LABELS[action.tool] ?? action.tool}? This is hard to undo.`)) return;
    setBusyId(action.id);
    setError('');
    setNotice('');
    try {
      const res = await approveAgentAction(action.id);
      if (res.data?.status === 'FAILED') {
        setError(`That couldn't be carried out: ${res.data.result ?? 'no details'}`);
      } else {
        setNotice(res.data?.result ?? 'Approved.');
      }
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not approve this.'));
      await load().catch(() => { /* the error above is the one to show */ });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (action: AgentAction) => {
    setBusyId(action.id);
    setError('');
    setNotice('');
    try {
      await rejectAgentAction(action.id);
      setNotice("Rejected. Nothing changed, and the agent won't ask again.");
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not reject this.'));
      await load().catch(() => { /* the error above is the one to show */ });
    } finally {
      setBusyId(null);
    }
  };

  const pending = actions.filter(a => a.status === 'PENDING_APPROVAL');
  const alerts = actions.filter(a => a.tool === 'raise_alert' && a.status === 'EXECUTED');
  const activity = actions.filter(a => a.status !== 'PENDING_APPROVAL' && !alerts.includes(a));
  const currentMode = MODES.find(m => m.value === mode) ?? MODES[0];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Agent Inbox</h1>
          <p>What agents want to do, what they've done, and what needs you</p>
        </div>
        {canDecide && (
          <button className="btn btn-primary" onClick={runNow} disabled={running || mode === 'OFF'}>
            {running ? 'Running…' : 'Run now'}
          </button>
        )}
      </div>

      {error && <div className="errortxt agent-message" role="alert">{error}</div>}
      {notice && <div className="successtxt agent-message" role="status">{notice}</div>}

      <section className="section-card agent-section">
        <div className="agent-mode">
          <div className="field agent-mode-field">
            <label htmlFor="agent-mode">Autonomy</label>
            {admin ? (
              <select id="agent-mode" value={mode} onChange={e => changeMode(e.target.value as AutonomyMode)} disabled={loading}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            ) : (
              <span id="agent-mode" className="badge">{currentMode.label}</span>
            )}
          </div>
          <p className="agent-mode-help">
            {currentMode.help}
            {!admin && ' Only an admin can change this.'}
          </p>
        </div>
      </section>

      <section className="table-card agent-section" aria-labelledby="agent-pending-title">
        <div className="table-toolbar">
          <h2 id="agent-pending-title" className="table-toolbar-title">Waiting for approval</h2>
          {!loading && <span className="badge">{pending.length}</span>}
        </div>
        {loading ? (
          <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 20 }} /></div>
        ) : pending.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing is waiting for you</h3>
            <p>
              {mode === 'OFF'
                ? 'Agents are off. Turn them on with Autonomy above; Shadow is the safe place to start.'
                : mode === 'SHADOW'
                  ? 'In Shadow mode agents only record what they would do. See Recent activity below.'
                  : 'When an agent needs a decision, it appears here with its reason.'}
            </p>
          </div>
        ) : (
          <div className="agent-card-list" ref={pendingRef}>
            {pending.map(action => (
              <PendingCard
                key={action.id}
                action={action}
                subject={subjectOf(action, dispatches, customers)}
                canDecide={canDecide}
                busy={busyId === action.id}
                onApprove={() => approve(action)}
                onReject={() => reject(action)}
              />
            ))}
          </div>
        )}
      </section>

      {alerts.length > 0 && (
        <section className="table-card agent-section" aria-labelledby="agent-alerts-title">
          <div className="table-toolbar">
            <h2 id="agent-alerts-title" className="table-toolbar-title">Alerts</h2>
            <span className="badge">{alerts.length}</span>
          </div>
          <div className="agent-card-list">
            {alerts.map(alert => {
              const input = parseInput(alert);
              return (
                <article className="agent-card" key={alert.id}>
                  <div className="agent-card-main">
                    <div className="agent-card-title">
                      <h3>{input.subject}</h3>
                      {input.severity && (
                        <span className={`badge ${SEVERITY_TAG[input.severity] ?? ''}`}>{input.severity}</span>
                      )}
                    </div>
                    <p className="agent-card-reason">{alert.reason}</p>
                    <p className="agent-card-meta">{formatTime(alert.created_at)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="table-card agent-section" aria-labelledby="agent-activity-title">
        <div className="table-toolbar">
          <h2 id="agent-activity-title" className="table-toolbar-title">Recent activity</h2>
        </div>
        {!loading && activity.length === 0 ? (
          <div className="empty-state"><p>No agent activity yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Action</th><th>About</th><th>Why</th><th>Outcome</th><th>When</th></tr>
              </thead>
              <tbody>
                {activity.map(action => (
                  <tr key={action.id}>
                    <td>{ACTION_LABELS[action.tool] ?? action.tool}</td>
                    <td>{subjectOf(action, dispatches, customers)}</td>
                    <td>{action.reason}</td>
                    <td>
                      <span className={`badge ${STATUS[action.status].tag}`}>{STATUS[action.status].label}</span>
                      {action.status === 'FAILED' && action.result && (
                        <div className="agent-card-meta">{action.result}</div>
                      )}
                    </td>
                    <td className="agent-nowrap">{formatTime(action.decided_at ?? action.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="table-card agent-section" aria-labelledby="agent-runs-title">
        <div className="table-toolbar">
          <h2 id="agent-runs-title" className="table-toolbar-title">Recent runs</h2>
        </div>
        {!loading && runs.length === 0 ? (
          <div className="empty-state"><p>Agents haven't run yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Started</th><th>Started by</th><th>Status</th><th>Summary</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const status = RUN_STATUS[run.status] ?? { label: run.status, tag: '' };
                  return (
                    <tr key={run.id}>
                      <td className="agent-nowrap">{formatTime(run.started_at)}</td>
                      <td>{run.trigger_source === 'manual' ? 'Run now' : 'Schedule'}</td>
                      <td><span className={`badge ${status.tag}`}>{status.label}</span></td>
                      <td>{run.summary}</td>
                      <td>{(run.input_tokens + run.output_tokens).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
