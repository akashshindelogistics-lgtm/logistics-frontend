import { describe, it, expect } from 'vitest';
import { attentionItems, timeAgo } from './opsAttention';
import type { DispatchOrder, DispatchStatus, VehicleMaintenance } from '../types';

const NOW = 1_000_000;
const HOUR = 3600;

const order = (status: DispatchStatus, agoHours: number, id = 'abcdefgh-1'): DispatchOrder => ({
  id, org_id: 'o', customer_id: 'c', vehicle_registration_number: 'MH01', line_items: [],
  status, dispatched_at: NOW - 999 * HOUR, proof_of_delivery: null,
  status_history: [{ status, changed_at: NOW - agoHours * HOUR }],
});

describe('attentionItems', () => {
  it('flags only pending and in-transit orders past their limits', () => {
    expect(attentionItems([order('PENDING', 23), order('IN_TRANSIT', 47), order('DELIVERED', 900)], [], NOW)).toEqual([]);
    expect(attentionItems([order('PENDING', 25)], [], NOW)[0].title).toBe('Not confirmed');
    expect(attentionItems([order('IN_TRANSIT', 49)], [], NOW)[0].title).toBe('Long time on the road');
  });

  it('puts urgent items first and links overdue service to its vehicle', () => {
    const service = { id: 'm', vehicle_registration: 'MH 02', description: 'Oil', status: 'Overdue' } as VehicleMaintenance;
    const items = attentionItems([order('PENDING', 30), order('AWAITING_VEHICLE', 1, 'b')], [service], NOW);
    expect(items.map(i => i.severity)).toEqual(['urgent', 'urgent', 'watch']);
    expect(items.find(i => i.key === 'm')?.to).toBe('/vehicles/MH%2002');
  });

  it('formats ages', () => {
    expect(timeAgo(NOW - 5, NOW)).toBe('just now');
    expect(timeAgo(NOW - 2 * HOUR, NOW)).toBe('2h ago');
    expect(timeAgo(NOW - 49 * HOUR, NOW)).toBe('2d ago');
  });
});
