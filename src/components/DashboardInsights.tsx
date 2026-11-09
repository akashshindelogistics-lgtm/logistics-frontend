import { useState } from 'react';
import type { DayBucket, PipelineStage } from '../lib/dashboardStats';

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Where every order currently is. Each stage is named on its own row, so
 *  the status colours (close together for colour-blind readers) aren't the
 *  only way to tell stages apart. */
export function PipelinePanel({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  return (
    <section className="insight-card" aria-labelledby="pipeline-title">
      <h2 id="pipeline-title" className="insight-title">Order pipeline</h2>
      <p className="insight-sub">Where all {total} orders stand now</p>
      <ul className="pipeline-list">
        {stages.map(s => (
          <li key={s.key}>
            <div className="pipeline-row">
              <span className="pipeline-label">{s.label}</span>
              <strong className="pipeline-count">{s.count}</strong>
            </div>
            <div className="pipeline-track" aria-hidden="true">
              {s.count > 0 && (
                <span className="pipeline-fill" style={{ width: `${(s.count / total) * 100}%`, background: `var(--${s.color})` }} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
