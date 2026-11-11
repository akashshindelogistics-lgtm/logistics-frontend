import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicTracking } from '../api/tracking';
import LifecycleTrack from '../components/LifecycleTrack';
import LocationMap from '../components/LocationMap';
import { STATUS_TAG_CLASS, formatStatus } from '../lib/dispatchLifecycle';
import type { PublicTracking } from '../types';
import './page.css';
import './TrackOrder.css';

/** How often to refresh while the goods are moving. */
export const REFRESH_MS = 30_000;

const when = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The customer's tracking page, opened from the link in their "on its way"
 * message. Public: no login, no dashboard chrome.
 */
export default function TrackOrder() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<PublicTracking | null>(null);
  const [error, setError] = useState('');
  // When the data was fetched, so "running late" is judged against it, not re-read every render.
  const [fetchedAt, setFetchedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      getPublicTracking(token)
        .then(res => {
          if (cancelled || !res.data) return;
          setOrder(res.data);
          setFetchedAt(Date.now() / 1000);
          setError('');
          if (res.data.status === 'LOADED' || res.data.status === 'IN_TRANSIT') {
            timer = setTimeout(load, REFRESH_MS);
          }
        })
        .catch(err => {
          if (cancelled) return;
          setError(err?.response?.status === 404
            ? 'We couldn’t find an order for this link. Please check it was copied in full.'
            : 'Tracking is unavailable right now. Please try again in a few minutes.');
        });
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [token]);

  const pos = order?.vehicle_position;
  const late = order && !order.delivered_at && order.status !== 'CANCELLED' && order.status !== 'RETURNED'
    && fetchedAt > order.expected_by;

  return (
    <main className="track-root">
      <div className="track-card">
        {error ? (
          <div className="empty-state" role="alert">
            <h1 className="track-title">Order not found</h1>
            <p className="muted">{error}</p>
          </div>
        ) : !order ? (
          <div aria-busy="true">
            <div className="skeleton" style={{ height: 28, width: '60%', borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 120, marginTop: 16, borderRadius: 8 }} />
          </div>
        ) : (
          <>
            <header className="track-header">
              <p className="muted track-shipper">From {order.shipper}</p>
              <h1 className="track-title">
                Order <span className="mono">{order.reference}</span>
              </h1>
              <span className={`status-tag ${STATUS_TAG_CLASS[order.status]}`} data-testid="track-status">
                {formatStatus(order.status)}
              </span>
              {late && <span className="status-tag tag-red track-late">Running late</span>}
            </header>

            <dl className="track-facts">
              <div><dt>Dispatched</dt><dd>{when(order.dispatched_at)}</dd></div>
              {order.delivered_at ? (
                <div><dt>Delivered</dt><dd>{when(order.delivered_at)}</dd></div>
              ) : (
                <div><dt>Expected by</dt><dd>{when(order.expected_by)}</dd></div>
              )}
            </dl>

            <LifecycleTrack order={order} />

            {pos && (
              <section className="track-map" aria-label="Vehicle location">
                <h2 className="section-card-title">Where your order is</h2>
                <LocationMap
                  height="320px"
                  pins={[{ lat: pos.latitude, lng: pos.longitude, label: 'Your delivery vehicle', detail: `Updated ${when(pos.updated_at)}` }]}
                />
                <p className="muted track-updated">Last updated {when(pos.updated_at)}</p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
