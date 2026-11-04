import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconGrid, IconInbox, IconBuilding, IconTruck, IconUsers, IconPackage, IconDispatch, IconChart, IconX, IconSun, IconMoon } from './Icons';
import { getOrgName, getOrgId, clearAuth, isLoggedIn, isAdmin } from '../api/auth';
import { listAgentActions } from '../api/agents';
import { onAgentInboxChanged } from '../lib/agentInbox';
import { useTheme } from '../lib/theme';
import { m } from 'motion/react';
import { useTransitionClick } from '../lib/viewTransition';
import './Sidebar.css';

const baseLinks = [
  { to: '/',           label: 'Dashboard',      Icon: IconGrid },
  { to: '/orgs',       label: 'My Organization', Icon: IconBuilding },
  { to: '/vehicles',   label: 'Vehicles',        Icon: IconTruck },
  { to: '/vendors',    label: 'Vendors',         Icon: IconTruck },
  { to: '/customers',  label: 'Customers',       Icon: IconUsers },
  { to: '/dispatches', label: 'Dispatches',      Icon: IconDispatch },
  { to: '/trips',      label: 'Trips',           Icon: IconDispatch },
  { to: '/reports',    label: 'Reports',         Icon: IconChart },
  { to: '/agents',     label: 'Agent Inbox',     Icon: IconInbox },
];
const adminLinks = [
  { to: '/team',       label: 'Team',            Icon: IconUsers },
];

/** How often the waiting count refreshes while the dashboard is open. */
const AGENT_COUNT_REFRESH_MS = 60_000;

/** How many agent actions are waiting for a person. 0 if that can't be fetched. */
function useAgentWaitingCount(orgId: string | null): number {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    const refresh = () => {
      listAgentActions(orgId, 'PENDING_APPROVAL')
        .then(r => setCount(r.data?.length ?? 0))
        .catch(() => setCount(0));
    };
    refresh();
    const timer = window.setInterval(refresh, AGENT_COUNT_REFRESH_MS);
    const stopListening = onAgentInboxChanged(refresh);
    return () => {
      window.clearInterval(timer);
      stopListening();
    };
  }, [orgId, pathname]);

  return orgId ? count : 0;
}

function SidebarLink({ href, end, label, Icon, count = 0 }: {
  href: string;
  end: boolean;
  label: string;
  Icon: (typeof baseLinks)[number]['Icon'];
  count?: number;
}) {
  const onClick = useTransitionClick(href);
  return (
    <NavLink
      to={href}
      end={end}
      onClick={onClick}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      {({ isActive }) => (
        <>
          {/* One shared highlight that slides to whichever link is active */}
          {isActive && (
            <m.span
              layoutId="sidebar-active"
              className="sidebar-link-highlight"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            />
          )}
          <Icon size={16} />
          <span>{label}</span>
          {count > 0 && <span className="sidebar-link-count" aria-label={`${count} waiting`}>{count}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const loggedIn = isLoggedIn();
  const orgName = getOrgName();
  const orgId = getOrgId();
  const agentCount = useAgentWaitingCount(loggedIn ? orgId : null);
  const links = [...baseLinks, ...(loggedIn && isAdmin() ? adminLinks : [])];

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <IconPackage size={20} />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">LogiTrack</span>
          <span className="sidebar-logo-sub">Logistics System</span>
        </div>
      </div>

      {loggedIn && orgName && (
        <div className="sidebar-org-badge">
          <div className="sidebar-org-avatar">{orgName.charAt(0).toUpperCase()}</div>
          <div className="sidebar-org-info">
            <span className="sidebar-org-name">{orgName}</span>
            <span className="sidebar-org-id">{orgId?.slice(0, 8)}…</span>
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        <p className="sidebar-section-label">Navigation</p>
        {links.map(({ to, label, Icon }) => {
          // Redirect /orgs to the specific org detail page if we know the org ID
          const href = (to === '/orgs' && orgId) ? `/orgs/${orgId}` : to;
          return <SidebarLink key={to} href={href} end={to === '/'} label={label} Icon={Icon} count={to === '/agents' ? agentCount : 0} />;
        })}
      </nav>

      <button
        type="button"
        className="sidebar-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>

      <div className="sidebar-footer">
        {loggedIn ? (
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <IconX size={14} />
            <span>Sign out</span>
          </button>
        ) : (
          <>
            <div className="sidebar-footer-dot" />
            <span>API connected</span>
          </>
        )}
      </div>
    </aside>
  );
}
