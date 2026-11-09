import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listVehicles, listOrgVehicleMaintenance } from '../api/vehicles';
import { listCustomers } from '../api/customers';
import { listDispatches } from '../api/dispatches';
import { getOpsReport } from '../api/reports';
import { getOrgId, getOrgName } from '../api/auth';
import Icon3D from '../components/Icon3D';
import LocationMap, { type MapPin } from '../components/LocationMap';
import { IconCheck } from '../components/Icons';
import type { Customer, DispatchOrder, DispatchStatus, OpsReport, Vehicle, VehicleMaintenance } from '../types';
import './page.css';
import './Dashboard.css';
import { m } from 'motion/react';
import { DURATION, EASE_OUT, useListAnimation } from '../lib/motion';
import { STATUS_TAG_CLASS, formatStatus } from '../lib/dispatchLifecycle';
import { ACTIVITY_STYLE, vehicleActivity, vehicleVisual } from '../lib/vehicleVisuals';
import { attentionItems, timeAgo } from '../lib/opsAttention';

const MotionLink = m.create(Link);
const REFRESH_MS = 30_000;
const STALE_SECONDS = 3600;

const PIPELINE: { label: string; statuses: DispatchStatus[] }[] = [
  { label: 'Awaiting truck', statuses: ['AWAITING_VEHICLE'] },
  { label: 'Pending', statuses: ['PENDING'] },
  { label: 'Confirmed', statuses: ['CONFIRMED'] },
  { label: 'Loaded', statuses: ['LOADED'] },
  { label: 'In transit', statuses: ['IN_TRANSIT'] },
];

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}

function VolumeBars({ days }: { days: OpsReport['dispatch_volume'] }) {
  const max = Math.max(1, ...days.map(d => d.count));
  return (
    <div className="kpi-bars" role="img" aria-label={`Daily dispatches: ${days.map(d => d.count).join(', ')}`}>
      {days.map(d => (
        <span key={d.date} className="kpi-bar-hit" title={`${d.date}: ${d.count}`}>
          <span className="kpi-bar" style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function weekDelta(days: OpsReport['dispatch_volume']): string | null {
  if (days.length < 14) return null;
  const sum = (part: typeof days) => part.reduce((total, d) => total + d.count, 0);
  const change = sum(days.slice(-7)) - sum(days.slice(-14, -7));
  if (change === 0) return 'Same as prior week';
  return `${change > 0 ? '↑' : '↓'} ${Math.abs(change)} vs prior week`;
}

export default function Dashboard() {
  const rowsRef = useListAnimation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [maintenance, setMaintenance] = useState<VehicleMaintenance[]>([]);
  const [report, setReport] = useState<OpsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const orgId = getOrgId();
    const load = () =>
      Promise.all([
        listVehicles(),
        listCustomers(),
        listDispatches(),
        // Some roles can't read these; the page still works without them.
        orgId ? getOpsReport(orgId).catch(() => null) : null,
        orgId ? listOrgVehicleMaintenance(orgId).catch(() => null) : null,
      ])
        .then(([v, c, d, r, mt]) => {
          setVehicles(v.data ?? []);
          setCustomers(c.data ?? []);
          setOrders(d.data ?? []);
          setReport(r?.data ?? null);
          setMaintenance(mt?.data ?? []);
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const now = Math.floor(Date.now() / 1000);
  const count = (statuses: DispatchStatus[]) => orders.filter(o => statuses.includes(o.status)).length;
  const onRoad = count(['IN_TRANSIT']);
  const waiting = count(['AWAITING_VEHICLE', 'PENDING', 'CONFIRMED', 'LOADED']);
  const activityOf = (reg: string) => vehicleActivity(reg, orders, maintenance.filter(x => x.vehicle_registration === reg));
  const busy = vehicles.filter(v => ['in-transit', 'on-trip'].includes(activityOf(v.registration_number))).length;
  const attention = attentionItems(orders, maintenance, now);
  const urgent = attention.filter(a => a.severity === 'urgent').length;
  const recent = [...orders].sort((a, b) => b.dispatched_at - a.dispatched_at).slice(0, 5);
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? '—';

  const located = vehicles.filter(v => v.location);
  const stale = located.filter(v => now - v.location!.timestamp > STALE_SECONDS).length;
  const pins: MapPin[] = located.map(v => ({
    id: v.registration_number,
    lat: v.location!.latitude,
    lng: v.location!.longitude,
    label: v.registration_number,
    detail: `${ACTIVITY_STYLE[activityOf(v.registration_number)].label} · updated ${timeAgo(v.location!.timestamp, now)}`,
    iconUrl: vehicleVisual(v.vehicle_type).icon,
  }));

  const volume = report?.dispatch_volume ?? [];
  const onTime = report?.delivery_performance.on_time_rate_percent;
  const delivered = report?.delivery_performance.delivered_count;
  const fleetShare = vehicles.length ? Math.round((busy / vehicles.length) * 100) : 0;
  const maxStage = Math.max(1, ...PIPELINE.map(s => count(s.statuses)));

  const kpis = [
    {
      label: 'Dispatches',
      to: '/reports',
      value: report ? String(volume.reduce((sum, d) => sum + d.count, 0)) : String(orders.length),
      sub: report ? weekDelta(volume) ?? 'Last 14 days' : 'All time',
      viz: volume.length > 0 && <VolumeBars days={volume} />,
    },
    {
      label: 'On the road',
      to: '/dispatches',
      value: String(onRoad),
      sub: `${waiting} waiting to move`,
    },
    {
      label: 'Fleet in use',
      to: '/vehicles',
      value: `${busy}/${vehicles.length}`,
      sub: `${fleetShare}% of vehicles busy`,
      viz: <div className="kpi-meter"><span style={{ width: `${fleetShare}%` }} /></div>,
    },
    {
      label: 'On-time delivery',
      to: '/reports',
      value: onTime == null ? '—' : `${Math.round(onTime)}%`,
      sub: delivered == null ? 'No report yet' : `${delivered} delivered`,
    },
  ];

  const summary = attention.length === 0
    ? 'Nothing needs you right now.'
    : `${attention.length} ${attention.length === 1 ? 'item needs' : 'items need'} attention${urgent ? `, ${urgent} urgent` : ''}.`;

  return (
    <div className="page dash">
      <header className="dash-head">
        <div>
          <p className="dash-date">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            {getOrgName() ? ` · ${getOrgName()}` : ''}
          </p>
          <h1 className="dash-title">{greeting(new Date().getHours())}</h1>
          <p className="dash-sub">{loading ? 'Loading today’s operations…' : summary}</p>
        </div>
        <div className="dash-actions">
          <Link to="/reports" className="btn btn-ghost">Reports</Link>
          <Link to="/dispatches" className="btn btn-primary">New dispatch</Link>
        </div>
      </header>

      {failed && <p className="dash-error" role="alert">Couldn’t refresh. Showing the last data we received.</p>}

      <div className="kpi-grid">
        {kpis.map(({ label, to, value, sub, viz }, i) => (
          <MotionLink
            key={label}
            to={to}
            className="kpi"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: DURATION.slow, ease: EASE_OUT } }}
          >
            <span className="kpi-label">{label}</span>
            {loading
              ? <div className="skeleton" style={{ width: 72, height: 34, margin: '6px 0' }} />
              : <span className="kpi-value">{value}</span>}
            <span className="kpi-sub">{loading ? '\u00a0' : sub}</span>
            {!loading && viz && <div className="kpi-viz">{viz}</div>}
          </MotionLink>
        ))}
      </div>

      <div className="dash-main">
        <section className="dash-panel dash-map" aria-label="Fleet map">
          <div className="dash-panel-head">
            <h2>Fleet map</h2>
            <span className="dash-panel-note">
              {!loading && `${located.length} of ${vehicles.length} reporting`}{stale ? ` · ${stale} not updated in over an hour` : ''}
            </span>
          </div>
          {loading ? (
            <div className="skeleton dash-skeleton" />
          ) : pins.length > 0 ? (
            <LocationMap pins={pins} height="100%" fitToPins />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon empty-state-icon-3d"><Icon3D name="map" size={48} /></div>
              <h3>No vehicle positions yet</h3>
              <p>Vehicles appear here once a driver’s phone or GPS tracker reports in.</p>
            </div>
          )}
        </section>

        <section className="dash-panel dash-attention" aria-label="Needs attention">
          <div className="dash-panel-head">
            <h2>Needs attention</h2>
            {attention.length > 0 && <span className="dash-count">{attention.length}</span>}
          </div>
          {loading ? (
            <div className="skeleton dash-skeleton" />
          ) : attention.length === 0 ? (
            <div className="dash-clear">
              <IconCheck size={18} />
              <span>All clear</span>
            </div>
          ) : (
            <ul className="attn-list">
              {attention.map(item => (
                <li key={item.key}>
                  <Link to={item.to} className="attn-item">
                    <span className={`status-tag ${item.severity === 'urgent' ? 'tag-red' : 'tag-amber'}`}>
                      {item.severity === 'urgent' ? 'Urgent' : 'Watch'}
                    </span>
                    <span className="attn-text">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="dash-panel dash-pipeline" aria-label="Dispatch pipeline">
        <div className="dash-panel-head"><h2>Dispatch pipeline</h2></div>
        <div className="pipe">
          {PIPELINE.map(stage => {
            const n = count(stage.statuses);
            return (
              <Link key={stage.label} to="/dispatches" className="pipe-stage">
                <span className="pipe-count">{loading ? '–' : n}</span>
                <span className="pipe-label">{stage.label}</span>
                <span className="pipe-track"><span style={{ width: `${(n / maxStage) * 100}%` }} /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="table-card">
        <div className="table-toolbar">
          <span className="table-toolbar-title">Recent dispatches</span>
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
            <table>
              <thead>
                <tr>
                  <th>Order</th><th>Customer</th><th>Vehicle</th><th>Stock</th><th>Qty</th><th>Status</th><th>Created</th>
                </tr>
              </thead>
              <tbody ref={rowsRef}>
                {recent.map(o => (
                  <tr key={o.id}>
                    <td><span className="mono">{o.id.slice(0, 8)}</span></td>
                    <td className="entity-name">{customerName(o.customer_id)}</td>
                    <td>{o.vehicle_registration_number ?? <span className="muted">Awaiting vehicle</span>}</td>
                    <td>
                      {o.line_items.length === 1
                        ? o.line_items[0].stock_description
                        : `${o.line_items.length} items`}
                    </td>
                    <td><strong>{o.line_items.reduce((sum, li) => sum + li.quantity, 0)}</strong></td>
                    <td><span className={`status-tag ${STATUS_TAG_CLASS[o.status]}`}>{formatStatus(o.status)}</span></td>
                    <td className="muted" title={new Date(o.dispatched_at * 1000).toLocaleString()}>{timeAgo(o.dispatched_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
