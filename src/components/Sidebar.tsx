import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconGrid, IconInbox, IconBuilding, IconTruck, IconUsers, IconPackage, IconDispatch, IconChart, IconX, IconSun, IconMoon, IconRoute, IconStore, IconBriefcase, IconMenu } from './Icons';
import { getOrgName, getOrgId, clearAuth, isLoggedIn, isAdmin } from '../api/auth';
import { listAgentActions } from '../api/agents';
import { onAgentInboxChanged } from '../lib/agentInbox';
import { useTheme } from '../lib/theme';
import { m } from 'motion/react';
import { useTransitionClick } from '../lib/viewTransition';
import './Sidebar.css';

type NavItem = { to: string; label: string; Icon: typeof IconGrid };

const baseGroups: { title: string; links: NavItem[] }[] = [
  { title: 'Overview', links: [
    { to: '/',           label: 'Dashboard',       Icon: IconGrid },
    { to: '/reports',    label: 'Reports',         Icon: IconChart },
  ] },
  { title: 'Operations', links: [
    { to: '/dispatches', label: 'Dispatches',      Icon: IconDispatch },
    { to: '/trips',      label: 'Trips',           Icon: IconRoute },
    { to: '/agents',     label: 'Agent Inbox',     Icon: IconInbox },
  ] },
  { title: 'Network', links: [
    { to: '/vehicles',   label: 'Vehicles',        Icon: IconTruck },
    { to: '/vendors',    label: 'Vendors',         Icon: IconBriefcase },
    { to: '/customers',  label: 'Customers',       Icon: IconStore },
    { to: '/orgs',       label: 'My Organization', Icon: IconBuilding },
  ] },
];
const adminGroup = { title: 'Admin', links: [{ to: '/team', label: 'Team', Icon: IconUsers }] };

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

function SidebarLink({ href, end, label, Icon, onNavigate, count = 0 }: {
  href: string;
  end: boolean;
  label: string;
  Icon: NavItem['Icon'];
  onNavigate: () => void;
  count?: number;
}) {
  const transitionClick = useTransitionClick(href);
  return (
    <NavLink
      to={href}
      end={end}
      onClick={e => { onNavigate(); transitionClick(e); }}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const loggedIn = isLoggedIn();
  const orgName = getOrgName();
  const orgId = getOrgId();
  const agentCount = useAgentWaitingCount(loggedIn ? orgId : null);
  const groups = [...baseGroups, ...(loggedIn && isAdmin() ? [adminGroup] : [])];
  const closeMobile = () => setMobileOpen(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Phone-width bar; the sidebar below becomes a drawer it opens. */}
      <header className="mobile-bar">
        <button type="button" className="mobile-bar-btn" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
          <IconMenu size={20} />
        </button>
        <span className="mobile-bar-name">LogiTrack</span>
      </header>
      {mobileOpen && <div className="sidebar-backdrop" onClick={closeMobile} />}

      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <IconPackage size={20} />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">LogiTrack</span>
            <span className="sidebar-logo-sub">Logistics System</span>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={closeMobile}>
            <IconX size={18} />
          </button>
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
          {groups.map(group => (
            <div key={group.title} className="sidebar-group">
              <p className="sidebar-section-label">{group.title}</p>
              {group.links.map(({ to, label, Icon }) => {
                // Redirect /orgs to the specific org detail page if we know the org ID
                const href = (to === '/orgs' && orgId) ? `/orgs/${orgId}` : to;
                return <SidebarLink key={to} href={href} end={to === '/'} label={label} Icon={Icon} onNavigate={closeMobile} count={to === '/agents' ? agentCount : 0} />;
              })}
            </div>
          ))}
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
    </>
  );
}
