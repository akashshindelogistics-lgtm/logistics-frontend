import api from './client';
import type {
  AgentAction,
  AgentActionStatus,
  AgentRun,
  AgentSettings,
  ApiResponse,
  AutonomyMode,
} from '../types';

/** The org's autonomy mode. New orgs start at OFF. */
export const getAgentSettings = (orgId: string) =>
  api.get<ApiResponse<AgentSettings>>(`/orgs/${orgId}/agents/settings`).then(r => r.data);

/** Change the autonomy mode. Admins only. */
export const updateAgentSettings = (orgId: string, mode: AutonomyMode) =>
  api.put<ApiResponse<AgentSettings>>(`/orgs/${orgId}/agents/settings`, { mode }).then(r => r.data);

/** Run the dispatch desk agent now. Resolves once the run has finished. */
export const runAgentsNow = (orgId: string) =>
  api.post<ApiResponse<AgentRun>>(`/orgs/${orgId}/agents/run`).then(r => r.data);

/** The org's 100 most recent agent runs, newest first. */
export const listAgentRuns = (orgId: string) =>
  api.get<ApiResponse<AgentRun[]>>(`/orgs/${orgId}/agents/runs`).then(r => r.data);

/** The org's 100 most recent agent actions, newest first, optionally for one status. */
export const listAgentActions = (orgId: string, status?: AgentActionStatus) =>
  api
    .get<ApiResponse<AgentAction[]>>(`/orgs/${orgId}/agents/actions`, status ? { params: { status } } : undefined)
    .then(r => r.data);

/** Approve a pending action. The result's status is FAILED if it's no longer valid. */
export const approveAgentAction = (actionId: string) =>
  api.post<ApiResponse<AgentAction>>(`/agent-actions/${actionId}/approve`).then(r => r.data);

/** Reject a pending action. Nothing happens, and the agent won't ask again. */
export const rejectAgentAction = (actionId: string) =>
  api.post<ApiResponse<AgentAction>>(`/agent-actions/${actionId}/reject`).then(r => r.data);
