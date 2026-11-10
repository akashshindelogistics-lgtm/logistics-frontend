import { useState } from 'react';
import type { DayBucket } from '../lib/dashboardStats';

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Orders raised per day. Hovering or focusing a day shows its exact count. */
export function VolumePanel({ days }: { days: DayBucket[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const peak = Math.max(...days.map(d => d.count), 1);
  const busiest = days.findIndex(d => d.count === peak);
  const labelled = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);

  return (
    <section className="insight-card" aria-labelledby="volume-title">
      <h2 id="volume-title" className="insight-title">Order volume</h2>
      <p className="insight-sub">
        {total} raised in the last {days.length} days
        {total > 0 && ` · busiest ${shortDay(days[busiest].date)}`}
      </p>
      <div className="volume-chart" role="list" aria-label={`Orders per day, last ${days.length} days`} onMouseLeave={() => setActive(null)}>
        {days.map((d, i) => (
          <div
            key={d.date.getTime()}
            role="listitem"
            tabIndex={0}
            aria-label={`${shortDay(d.date)}: ${d.count} ${d.count === 1 ? 'order' : 'orders'}`}
            className={`volume-col${active === i ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <div className="volume-track">
              {active === i && (
                <span className={`volume-tip${i > days.length - 4 ? ' volume-tip-end' : i < 3 ? ' volume-tip-start' : ''}`}>
                  <strong>{d.count}</strong> on {shortDay(d.date)}
                </span>
              )}
              {i === busiest && total > 0 && active === null && <span className="volume-peak">{d.count}</span>}
              <span
                className={`volume-bar${d.count === 0 ? ' volume-bar-zero' : ''}`}
                style={d.count === 0 ? undefined : { height: `${(d.count / peak) * 100}%` }}
              />
            </div>
            <span className="volume-day">{labelled.has(i) ? shortDay(d.date) : ' '}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
