const CHANGED_EVENT = 'agent-inbox-changed';

/** Tell the sidebar's waiting count to refresh, right after a decision. */
export const notifyAgentInboxChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT));

/** Call `listener` on every change. Returns the function that stops listening. */
export function onAgentInboxChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}
