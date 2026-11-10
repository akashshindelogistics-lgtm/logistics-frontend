import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as vehiclesApi from '../api/vehicles';
import * as customersApi from '../api/customers';
import * as dispatchesApi from '../api/dispatches';
import type { DispatchOrder } from '../types';

vi.mock('../components/LocationMap', () => ({ default: ({ pins }: { pins: unknown[] }) => <div data-testid="map">{pins.length}</div> }));
vi.mock('../api/vehicles');
vi.mock('../api/customers');
vi.mock('../api/dispatches');

const ok = <T,>(data: T) => ({ success: true, message: '', data });

function order(overrides: Partial<DispatchOrder> = {}): DispatchOrder {
  return {
    id: 'order-0001-aaaa',
    org_id: 'o1',
    customer_id: 'c1',
    vehicle_registration_number: 'MH01AB1234',
    line_items: [{ stock_description: 'Cement', quantity: 20, volume_in_size: 1, category: 'General' }],
    status: 'PENDING',
    dispatched_at: 1_700_000_000,
    status_history: [],
    proof_of_delivery: null,
    ...overrides,
  };
}

function renderPage() {
  return render(<Dashboard />, { wrapper: MemoryRouter });
}

describe('Dashboard page', () => {
  beforeEach(() => vi.resetAllMocks());

  it('derives the KPIs, map pins and pipeline from live dispatches', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockResolvedValue(ok([
      { registration_number: 'MH01AB1234', location: { latitude: 18, longitude: 73, timestamp: 1 } },
      { registration_number: 'MH02' },
    ] as never));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([{ id: 'c1', name: 'Hinjewadi Site' }] as never));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(ok([order({ status: 'IN_TRANSIT' })]));

    renderPage();

    const road = (await screen.findByText('On the road')).closest('a')!;
    expect(await within(road).findByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Fleet in use').closest('a')!).getByText('1/2')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveTextContent('1');
    expect(screen.getByText('Hinjewadi Site')).toBeInTheDocument();
    expect(screen.getByText('Long time on the road')).toBeInTheDocument();
  });

  it('warns but keeps rendering when the data cannot be loaded', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockRejectedValue(new Error('down'));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([]));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(ok([]));

    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t refresh/i);
  });

  it('shows the five most recent dispatches, newest first', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockResolvedValue(ok([]));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([]));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(
      ok([
        order({ id: 'old-order-id', line_items: [{ stock_description: 'Older', quantity: 1, volume_in_size: 1, category: 'General' }], dispatched_at: 1000 }),
        order({ id: 'new-order-id', line_items: [{ stock_description: 'Newer', quantity: 1, volume_in_size: 1, category: 'General' }], dispatched_at: 2000 }),
      ]),
    );

    renderPage();

    const rows = await screen.findAllByRole('row');
    // rows[0] is the header; rows[1] is the newest dispatch
    expect(within(rows[1]).getByText('Newer')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Older')).toBeInTheDocument();
  });

  it('caps the recent list at five rows even when more dispatches exist', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockResolvedValue(ok([]));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([]));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(
      ok(Array.from({ length: 8 }, (_, n) => order({ id: `order-${n}`, dispatched_at: n }))),
    );

    renderPage();
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(1 + 5);
  });

  it('colors each recent dispatch status tag by its lifecycle stage', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockResolvedValue(ok([]));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([]));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(
      ok([
        order({ id: 'delivered-order', status: 'DELIVERED', dispatched_at: 3 }),
        order({ id: 'transit-order', status: 'IN_TRANSIT', dispatched_at: 2 }),
        order({ id: 'cancelled-order', status: 'CANCELLED', dispatched_at: 1 }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('DELIVERED')).toHaveClass('status-tag', 'tag-green');
    expect(screen.getByText('IN TRANSIT')).toHaveClass('status-tag', 'tag-purple');
    expect(screen.getByText('CANCELLED')).toHaveClass('status-tag', 'tag-red');
  });

  it('shows the "no dispatches yet" empty state when there are none', async () => {
    vi.mocked(vehiclesApi.listVehicles).mockResolvedValue(ok([]));
    vi.mocked(customersApi.listCustomers).mockResolvedValue(ok([]));
    vi.mocked(dispatchesApi.listDispatches).mockResolvedValue(ok([]));

    renderPage();
    expect(await screen.findByText(/no dispatches yet/i)).toBeInTheDocument();
  });
});
