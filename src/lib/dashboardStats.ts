import type { DispatchOrder, DispatchStatus } from '../types';

/** Greeting for the viewer's local time of day. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface PipelineStage {
  key: string;
  label: string;
  /** Status token name from index.css; the same colour the status tags use. */
  color: 'amber' | 'blue' | 'purple' | 'green' | 'red';
  statuses: DispatchStatus[];
  count: number;
}

// Follows STATUS_TAG_CLASS, so a stage is the same colour as its status tags.
const STAGES: Omit<PipelineStage, 'count'>[] = [
  { key: 'waiting', label: 'Waiting', color: 'amber', statuses: ['AWAITING_VEHICLE', 'PENDING'] },
  { key: 'preparing', label: 'Preparing', color: 'blue', statuses: ['CONFIRMED', 'LOADED'] },
  { key: 'transit', label: 'On the road', color: 'purple', statuses: ['IN_TRANSIT'] },
  { key: 'delivered', label: 'Completed', color: 'green', statuses: ['DELIVERED'] },
  { key: 'closed', label: 'Returned or cancelled', color: 'red', statuses: ['RETURNED', 'CANCELLED'] },
];

export function buildPipeline(orders: DispatchOrder[]): PipelineStage[] {
  return STAGES.map(stage => ({
    ...stage,
    count: orders.filter(o => stage.statuses.includes(o.status)).length,
  }));
}

/** Orders that have been raised but have not reached a final status. */
export function countInProgress(orders: DispatchOrder[]): number {
  const open: DispatchStatus[] = ['AWAITING_VEHICLE', 'PENDING', 'CONFIRMED', 'LOADED', 'IN_TRANSIT'];
  return orders.filter(o => open.includes(o.status)).length;
}

export interface DayBucket {
  /** Local midnight of the day. */
  date: Date;
  count: number;
}

/** Orders per local calendar day for the `days` days ending today. */
export function dailyVolume(orders: DispatchOrder[], now: Date, days = 14): DayBucket[] {
  const buckets: DayBucket[] = Array.from({ length: days }, (_, i) => ({
    // Built from calendar parts, so a daylight-saving day still lines up.
    date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i)),
    count: 0,
  }));
  const indexByDay = new Map(buckets.map((b, i) => [b.date.getTime(), i]));
  for (const order of orders) {
    const at = new Date(order.dispatched_at * 1000);
    const index = indexByDay.get(new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime());
    if (index !== undefined) buckets[index].count += 1;
  }
  return buckets;
}

/** Customers with at least one order since `since` (unix seconds). */
export function countActiveCustomers(orders: DispatchOrder[], since: number): number {
  return new Set(orders.filter(o => o.dispatched_at >= since).map(o => o.customer_id)).size;
}
