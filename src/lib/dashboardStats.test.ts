import { describe, it, expect } from 'vitest';
import { buildPipeline, countActiveCustomers, countInProgress, dailyVolume, greetingFor } from './dashboardStats';
import type { DispatchOrder, DispatchStatus } from '../types';

const order = (status: DispatchStatus, at = 0, customer = 'c1') =>
  ({ status, dispatched_at: at, customer_id: customer }) as DispatchOrder;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

describe('greetingFor', () => {
  it.each([[9, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening']])(
    'at %i:00 says %s',
    (hour, text) => expect(greetingFor(new Date(2026, 10, 9, hour))).toBe(text),
  );
});

describe('buildPipeline', () => {
  it('groups every status into exactly one stage', () => {
    const all: DispatchStatus[] = ['AWAITING_VEHICLE', 'PENDING', 'CONFIRMED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED'];
    const stages = buildPipeline(all.map(s => order(s)));
    expect(stages.map(s => s.count)).toEqual([2, 2, 1, 1, 2]);
  });
});

describe('countInProgress', () => {
  it('leaves out finished orders', () => {
    expect(countInProgress([order('PENDING'), order('IN_TRANSIT'), order('DELIVERED'), order('CANCELLED')])).toBe(2);
  });
});

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

describe('countActiveCustomers', () => {
  it('counts each recent customer once', () => {
    expect(countActiveCustomers([order('PENDING', 100, 'a'), order('PENDING', 200, 'a'), order('PENDING', 150, 'b'), order('PENDING', 10, 'c')], 100)).toBe(2);
  });
});
