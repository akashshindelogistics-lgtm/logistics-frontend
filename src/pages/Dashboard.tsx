import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrgs } from '../api/orgs';
import { listVehicles } from '../api/vehicles';
import { listCustomers } from '../api/customers';
import { listDispatches } from '../api/dispatches';
import { getOrgName } from '../api/auth';
import Icon3D, { type Icon3DName } from '../components/Icon3D';
import { PipelinePanel, VolumePanel } from '../components/DashboardInsights';
import type { DispatchOrder } from '../types';
import './page.css';
import './Dashboard.css';
import { m } from 'motion/react';
import { DURATION, EASE_OUT, useListAnimation } from '../lib/motion';
import CountUp from '../components/CountUp';
import { STATUS_TAG_CLASS, formatStatus } from '../lib/dispatchLifecycle';
import { buildPipeline, countActiveCustomers, countInProgress, dailyVolume, greetingFor } from '../lib/dashboardStats';

// Stat cards are links that fade up one after another on first paint.
const MotionLink = m.create(Link);

const THIRTY_DAYS = 30 * 24 * 60 * 60;

const formatWhen = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });

export default function Dashboard() {
  const rowsRef = useListAnimation();
  const [counts, setCounts] = useState({ orgs: 0, vehicles: 0, customers: 0, withDriver: 0 });
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => new Date());
  const orgName = getOrgName();

  useEffect(() => {
    Promise.all([listOrgs(), listVehicles(), listCustomers(), listDispatches()])
      .then(([orgs, vehicles, customers, dispatches]) => {
        setCounts({
          orgs: orgs.data?.length ?? 0,
          vehicles: vehicles.data?.length ?? 0,
          customers: customers.data?.length ?? 0,
          withDriver: vehicles.data?.filter(v => v.assigned_driver_id).length ?? 0,
        });
        setOrders(dispatches.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const recent = useMemo(() => [...orders].sort((a, b) => b.dispatched_at - a.dispatched_at).slice(0, 5), [orders]);
  const pipeline = useMemo(() => buildPipeline(orders), [orders]);
  const volume = useMemo(() => dailyVolume(orders, now), [orders, now]);
  const activeCustomers = countActiveCustomers(orders, Math.floor(now.getTime() / 1000) - THIRTY_DAYS);

  const cards: { label: string; value: number; note?: string; to: string; icon: Icon3DName; cls: string }[] = [
    { label: 'Organizations', value: counts.orgs, note: orgName ?? undefined, to: '/orgs', icon: 'building', cls: 'card-blue' },
    { label: 'Fleet Vehicles', value: counts.vehicles, note: `${counts.withDriver} with a driver`, to: '/vehicles', icon: 'truck', cls: 'card-green' },
    { label: 'Customers', value: counts.customers, note: `${activeCustomers} active in 30 days`, to: '/customers', icon: 'store', cls: 'card-amber' },
    { label: 'Dispatches', value: orders.length, note: `${countInProgress(orders)} in progress`, to: '/dispatches', icon: 'package', cls: 'card-purple' },
  ];

  return (
    <div className="page">
      <div className="dash-hero">
        <div>
          <p className="dash-hero-date">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="dash-hero-title">{greetingFor(now)}{orgName ? `, ${orgName}` : ''}</h1>
          <p className="dash-hero-sub">Here's what's happening across your logistics network today.</p>
        </div>
        <div className="dash-hero-art" aria-hidden="true">
          <Icon3D name="map" size={52} className="dash-hero-art-back" />
          <Icon3D name="lorry" size={72} className="dash-hero-art-main" />
          <Icon3D name="package" size={42} className="dash-hero-art-front" />
        </div>
      </div>

      <div className="stat-grid">
        {cards.map(({ label, value, note, to, icon, cls }, i) => (
          <MotionLink
            key={to}
            to={to}
            className={`stat-card dash-stat ${cls}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: DURATION.slow, ease: EASE_OUT } }}
            whileHover={{ y: -2, transition: { duration: DURATION.fast } }}
          >
            <div className="stat-card-top">
              <div className="stat-label">{label}</div>
              <div className="stat-icon stat-icon-3d">
                <Icon3D name={icon} size={32} />
              </div>
            </div>
            <div>
              {loading
                ? <div className="skeleton" style={{ width: 60, height: 36, marginBottom: 6 }} />
                : <div className="stat-value"><CountUp value={value} /></div>
              }
              {!loading && note && <div className="stat-note">{note}</div>}
            </div>
          </MotionLink>
        ))}
      </div>

      <div className={`dash-columns${!loading && orders.length === 0 ? ' dash-columns-single' : ''}`}>
        <div className="table-card">
          <div className="table-toolbar">
            <span className="table-toolbar-title">Recent Dispatches</span>
            <Link to="/dispatches" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {loading ? (
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 20 }} />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon empty-state-icon-3d"><Icon3D name="outbox" size={48} /></div>
              <h3>No dispatches yet</h3>
              <p>Dispatch orders will appear here once you send stock to customers.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Order ID</th><th>Vehicle</th><th>Stock</th><th>Qty</th><th>Status</th><th>Time</th>
                  </tr>
                </thead>
                <tbody ref={rowsRef}>
                  {recent.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">{o.id.slice(0, 8)}…</span></td>
                      <td className="entity-name">{o.vehicle_registration_number ?? <span className="muted">Awaiting vehicle</span>}</td>
                      <td>
                        {o.line_items.length === 1
                          ? o.line_items[0].stock_description
                          : `${o.line_items.length} items`}
                      </td>
                      <td><strong>{o.line_items.reduce((sum, li) => sum + li.quantity, 0)}</strong></td>
                      <td><span className={`status-tag ${STATUS_TAG_CLASS[o.status]}`}>{formatStatus(o.status)}</span></td>
                      <td className="muted dash-when">{formatWhen(o.dispatched_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* After the table in the DOM: the table is the primary content, and
            screen readers reach it first. Hidden when there is nothing to chart. */}
        {!loading && orders.length > 0 && (
          <aside className="dash-insights">
            <PipelinePanel stages={pipeline} />
            <VolumePanel days={volume} />
          </aside>
        )}
      </div>
    </div>
  );
}
