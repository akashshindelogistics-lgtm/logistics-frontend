import { describe, it, expect } from 'vitest';
import { dailyVolume } from './dashboardStats';
import type { DispatchOrder, DispatchStatus } from '../types';

const order = (status: DispatchStatus, at = 0) => ({ status, dispatched_at: at }) as DispatchOrder;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

describe('dailyVolume', () => {
  const now = new Date(2026, 10, 9, 16, 0);

  it('returns one bucket per day, oldest first, ending today', () => {
    const days = dailyVolume([], now, 14);
    expect(days).toHaveLength(14);
    expect(days[0].date).toEqual(new Date(2026, 9, 27));
    expect(days[13].date).toEqual(new Date(2026, 10, 9));
  });

  it('counts orders on their local day and ignores older ones', () => {
    const days = dailyVolume(
      [order('PENDING', unix(new Date(2026, 10, 9, 0, 5))), order('PENDING', unix(new Date(2026, 10, 9, 23, 55))),
       order('PENDING', unix(new Date(2026, 10, 8, 23, 55))), order('PENDING', unix(new Date(2026, 9, 1)))],
      now,
    );
    expect(days[13].count).toBe(2);
    expect(days[12].count).toBe(1);
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });
});
