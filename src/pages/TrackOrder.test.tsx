import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TrackOrder from './TrackOrder';
import { getPublicTracking } from '../api/tracking';
import type { PublicTracking } from '../types';

vi.mock('../api/tracking');
vi.mock('../components/LocationMap', () => ({
  default: ({ pins }: { pins: { lat: number; lng: number }[] }) => (
    <div data-testid="map">{pins.map(p => `${p.lat},${p.lng}`).join(';')}</div>
  ),
}));

const now = Math.floor(Date.now() / 1000);
const order = (over: Partial<PublicTracking> = {}): PublicTracking => ({
  reference: 'ab12cd34',
  shipper: 'Mauli Bricks',
  status: 'PENDING',
  dispatched_at: now - 3600,
  expected_by: now + 71 * 3600,
  status_history: [{ status: 'PENDING', changed_at: now - 3600 }],
  delivered_at: null,
  vehicle_position: null,
  ...over,
});

const renderAt = (token = 'tok-1') =>
  render(
    <MemoryRouter initialEntries={[`/track/${token}`]}>
      <Routes><Route path="/track/:token" element={<TrackOrder />} /></Routes>
    </MemoryRouter>,
  );

describe('TrackOrder', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loads the order for the token in the URL and shows reference, shipper and status', async () => {
    vi.mocked(getPublicTracking).mockResolvedValue({ success: true, message: '', data: order() });
    renderAt('tok-9');
    expect(await screen.findByText('ab12cd34')).toBeInTheDocument();
    expect(getPublicTracking).toHaveBeenCalledWith('tok-9');
    expect(screen.getByText('From Mauli Bricks')).toBeInTheDocument();
    expect(screen.getByTestId('track-status')).toHaveTextContent(/pending/i);
    expect(screen.getByText('Expected by')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    expect(screen.queryByText('Running late')).not.toBeInTheDocument();
  });

  it('shows the vehicle on a map while in transit', async () => {
    vi.mocked(getPublicTracking).mockResolvedValue({
      success: true, message: '',
      data: order({ status: 'IN_TRANSIT', vehicle_position: { latitude: 18.52, longitude: 73.85, updated_at: now } }),
    });
    renderAt();
    expect(await screen.findByTestId('map')).toHaveTextContent('18.52,73.85');
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it('flags an order past its expected time and shows the delivery time once delivered', async () => {
    vi.mocked(getPublicTracking).mockResolvedValue({
      success: true, message: '', data: order({ status: 'IN_TRANSIT', expected_by: now - 60 }),
    });
    const { unmount } = renderAt();
    expect(await screen.findByText('Running late')).toBeInTheDocument();
    unmount();

    vi.mocked(getPublicTracking).mockResolvedValue({
      success: true, message: '', data: order({ status: 'DELIVERED', expected_by: now - 60, delivered_at: now }),
    });
    renderAt();
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText('Running late')).not.toBeInTheDocument();
  });

  it('says the order was not found for an unknown link', async () => {
    vi.mocked(getPublicTracking).mockRejectedValue({ response: { status: 404 } });
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t find an order/i);
  });
});
