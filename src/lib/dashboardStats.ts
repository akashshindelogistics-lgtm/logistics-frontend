import type { DispatchOrder } from '../types';

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
