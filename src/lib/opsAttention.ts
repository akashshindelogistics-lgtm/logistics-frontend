import type { DispatchOrder, VehicleMaintenance } from '../types';

export interface AttentionItem {
  key: string;
  severity: 'urgent' | 'watch';
  title: string;
  detail: string;
  to: string;
}

const HOUR = 3600;
// shortcut: fixed thresholds because dispatches carry no promised delivery time; replace with real due times if added.
const PENDING_LIMIT = 24 * HOUR;
const IN_TRANSIT_LIMIT = 48 * HOUR;

export function timeAgo(seconds: number, now: number): string {
  const s = Math.max(0, now - seconds);
  if (s < 60) return 'just now';
  if (s < HOUR) return `${Math.floor(s / 60)}m ago`;
  if (s < 24 * HOUR) return `${Math.floor(s / HOUR)}h ago`;
  return `${Math.floor(s / (24 * HOUR))}d ago`;
}

/** When the dispatch entered its current status. */
function enteredStatusAt(d: DispatchOrder): number {
  const events = d.status_history.filter(e => e.status === d.status);
  return events.length ? Math.max(...events.map(e => e.changed_at)) : d.dispatched_at;
}

/** Everything a dispatcher should act on now, most urgent first. */
export function attentionItems(
  dispatches: DispatchOrder[],
  maintenance: VehicleMaintenance[],
  now: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const d of dispatches) {
    const ref = d.id.slice(0, 8);
    const since = enteredStatusAt(d);
    const base = { key: d.id, to: '/dispatches' };
    if (d.status === 'AWAITING_VEHICLE') {
      items.push({ ...base, severity: 'urgent', title: 'Needs a truck', detail: `Order ${ref} · waiting since ${timeAgo(since, now)}` });
    } else if (d.status === 'PENDING' && now - since > PENDING_LIMIT) {
      items.push({ ...base, severity: 'watch', title: 'Not confirmed', detail: `Order ${ref} · created ${timeAgo(since, now)}` });
    } else if (d.status === 'IN_TRANSIT' && now - since > IN_TRANSIT_LIMIT) {
      items.push({ ...base, severity: 'watch', title: 'Long time on the road', detail: `${d.vehicle_registration_number ?? ref} · left ${timeAgo(since, now)}` });
    }
  }
  for (const m of maintenance) {
    if (m.status === 'Overdue') {
      items.push({
        key: m.id,
        severity: 'urgent',
        title: 'Service overdue',
        detail: `${m.vehicle_registration} · ${m.description}`,
        to: `/vehicles/${encodeURIComponent(m.vehicle_registration)}`,
      });
    }
  }
  return items.sort((a, b) => Number(b.severity === 'urgent') - Number(a.severity === 'urgent'));
}
